import { isUtf8 } from 'node:buffer'
import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { MobileEventEnvelope } from '@shared/mobile'
import { MobileError, mobileErrorBody } from './mobileErrors'

const MAX_BUFFERED = 1024 * 1024
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function frame(opcode: number, payload = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(payload.length < 126 ? 2 : payload.length <= 65535 ? 4 : 10)
  header[0] = 0x80 | opcode
  header[1] = header.length === 2 ? payload.length : header.length === 4 ? 126 : 127
  if (header.length === 4) header.writeUInt16BE(payload.length, 2)
  if (header.length === 10) header.writeBigUInt64BE(BigInt(payload.length), 2)
  return Buffer.concat([header, payload])
}

export function rejectUpgrade(socket: Duplex, error: MobileError): void {
  const body = JSON.stringify(mobileErrorBody(error))
  socket.end(`HTTP/1.1 ${error.status} Error\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: ${Buffer.byteLength(body)}\r\n${error.status === 401 ? 'WWW-Authenticate: Bearer\r\n' : ''}${error.status === 426 ? 'Sec-WebSocket-Version: 13\r\n' : ''}\r\n${body}`)
}

/** Canal de eventos unidireccional RFC 6455, sin dependencias nuevas en el empaquetado Electron. */
export class MobileWebSocket {
  private pending = Buffer.alloc(0)
  private closed = false
  private awaitingPong = false
  private readonly heartbeat: NodeJS.Timeout
  private readonly onData = (chunk: Buffer): void => this.read(chunk)

  static accept(req: IncomingMessage, socket: Duplex, head: Buffer, expires: number, onClose: () => void): MobileWebSocket {
    const key = req.headers['sec-websocket-key']
    if (req.method !== 'GET' || req.headers.upgrade?.toLowerCase() !== 'websocket' ||
        !req.headers.connection?.toLowerCase().split(',').map((s) => s.trim()).includes('upgrade') ||
        typeof key !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(key) || Buffer.from(key, 'base64').length !== 16) {
      throw new MobileError(400, 'INVALID_WEBSOCKET', 'Handshake WebSocket no válido')
    }
    if (req.headers['sec-websocket-version'] !== '13') throw new MobileError(426, 'WEBSOCKET_VERSION', 'Se necesita WebSocket versión 13')
    const accept = createHash('sha1').update(key + GUID).digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    const client = new MobileWebSocket(socket, expires, onClose)
    // El primer frame puede acompañar al handshake HTTP.
    if (head.length) client.read(head)
    return client
  }

  private constructor(private readonly socket: Duplex, expires: number, private readonly onClose: () => void) {
    socket.on('data', this.onData)
    socket.once('close', () => this.dispose())
    socket.once('end', () => { this.dispose(); socket.end() })
    socket.on('error', () => { this.dispose(); socket.destroy() })
    this.heartbeat = setInterval(() => {
      if (Date.now() >= expires) return this.close(1008, 'TOKEN_EXPIRED')
      if (this.awaitingPong) return this.close(1001, 'Heartbeat timeout')
      this.awaitingPong = true
      this.write(frame(9))
    }, 20_000)
    this.heartbeat.unref()
  }

  send(envelope: MobileEventEnvelope): void {
    this.write(frame(1, Buffer.from(JSON.stringify(envelope))))
  }

  private write(data: Buffer): void {
    if (this.closed || this.socket.destroyed) return
    if (this.socket.writableLength + data.length > MAX_BUFFERED) return this.close(1013, 'Resync required')
    this.socket.write(data)
  }

  close(code = 1001, reason = 'Server stopped'): void {
    if (this.closed) return
    const payload = Buffer.alloc(2 + Buffer.byteLength(reason))
    payload.writeUInt16BE(code)
    payload.write(reason, 2)
    this.dispose()
    this.socket.end(frame(8, payload))
    // Un cliente que no cierra su mitad TCP no debe bloquear el apagado del servidor.
    const timer = setTimeout(() => this.socket.destroy(), 1000)
    timer.unref()
    this.socket.once('close', () => clearTimeout(timer))
  }

  private dispose(): void {
    if (this.closed) return
    this.closed = true
    clearInterval(this.heartbeat)
    this.socket.off('data', this.onData)
    this.onClose()
  }

  private read(chunk: Buffer): void {
    if (this.closed) return
    // Solo admite los frames de control (close/ping/pong, hasta 125 bytes). Los comandos usan HTTP.
    if (this.pending.length + chunk.length > 4096) return this.close(1009, 'Frame too large')
    this.pending = Buffer.concat([this.pending, chunk])
    while (this.pending.length >= 2 && !this.closed) {
      const first = this.pending[0]
      const second = this.pending[1]
      const opcode = first & 15
      const length = second & 127
      if ((first & 0x70) || !(second & 0x80)) return this.close(1002, 'Invalid frame')
      if (opcode === 1 || opcode === 2 || opcode === 0) return this.close(1008, 'Use HTTP for commands')
      if (![8, 9, 10].includes(opcode) || !(first & 0x80) || length > 125) return this.close(1002, 'Invalid control frame')
      if (this.pending.length < 6 + length) return
      const mask = this.pending.subarray(2, 6)
      const payload = Buffer.from(this.pending.subarray(6, 6 + length))
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]
      this.pending = this.pending.subarray(6 + length)
      if (opcode === 9) this.write(frame(10, payload))
      if (opcode === 10) this.awaitingPong = false
      if (opcode === 8) {
        if (length === 1) return this.close(1002, 'Invalid close')
        if (length >= 2) {
          const code = payload.readUInt16BE()
          if (!((code >= 1000 && code <= 1014 && ![1004, 1005, 1006].includes(code)) || (code >= 3000 && code <= 4999))) return this.close(1002, 'Invalid close code')
          if (!isUtf8(payload.subarray(2))) return this.close(1007, 'Invalid UTF-8')
        }
        this.dispose()
        this.socket.end(frame(8, payload))
      }
    }
  }
}
