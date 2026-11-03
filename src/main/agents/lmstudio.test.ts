import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { postJson } from './lmstudio'

let server: Server | undefined
afterEach(() => server?.close())

function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  server = createServer(handler)
  return new Promise((resolve) => server!.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`)))
}

describe('llamadas a LM Studio', () => {
  it('espera la respuesta aunque el modelo tarde (sin el corte de 5 min de fetch) y la devuelve entera', async () => {
    const url = await listen((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ eco: JSON.parse(body) })), 50))
    })
    const r = await postJson(`${url}/v1/chat/completions`, JSON.stringify({ hola: 'ñ' }), new AbortController().signal)
    expect(r.ok).toBe(true)
    expect(JSON.parse(r.text)).toEqual({ eco: { hola: 'ñ' } })
  })

  it('servidor apagado: el error es ECONNREFUSED (solo eso se presenta como «apagado»)', async () => {
    const url = await listen(() => undefined)
    await new Promise<void>((r) => server!.close(() => r()))
    server = undefined
    await expect(postJson(`${url}/v1/chat/completions`, '{}', new AbortController().signal)).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })

  it('se puede detener', async () => {
    const url = await listen(() => undefined)
    const ctrl = new AbortController()
    const p = postJson(`${url}/v1/chat/completions`, '{}', ctrl.signal)
    ctrl.abort()
    await expect(p).rejects.toThrow()
  })
})
