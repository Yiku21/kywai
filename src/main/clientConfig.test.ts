import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pairingProblem, parseServerAddress, readClientFile, writeClientFile } from './clientConfig'

describe('parseServerAddress', () => {
  it('acepta una IP o un nombre sin más y pone el puerto de kywai', () => {
    expect(parseServerAddress('100.101.1.2')?.origin).toBe('http://100.101.1.2:8787')
    expect(parseServerAddress('mac-mini')?.origin).toBe('http://mac-mini:8787')
    expect(parseServerAddress(' mac-mini.tail1234.ts.net ')?.origin).toBe('http://mac-mini.tail1234.ts.net:8787')
  })

  it('respeta el puerto y el protocolo que se escriben', () => {
    expect(parseServerAddress('mac-mini:9000')?.origin).toBe('http://mac-mini:9000')
    expect(parseServerAddress('http://100.1.2.3:8787')?.origin).toBe('http://100.1.2.3:8787')
    expect(parseServerAddress('https://100.1.2.3:8788')?.origin).toBe('https://100.1.2.3:8788')
  })

  it('del enlace de acceso saca la dirección y el código', () => {
    const a = parseServerAddress('http://100.64.1.5:8787/?t=AbC_123-xyz')
    expect(a).toEqual({ origin: 'http://100.64.1.5:8787', host: '100.64.1.5', code: 'AbC_123-xyz' })
  })

  it('rechaza lo que no es una dirección', () => {
    expect(parseServerAddress('')).toBeNull()
    expect(parseServerAddress('dos palabras')).toBeNull()
    expect(parseServerAddress('ftp://servidor')).toBeNull()
    expect(parseServerAddress('javascript:alert(1)')).toBeNull()
  })
})

describe('archivo del cliente', () => {
  it('guarda y recupera a qué servidor está emparejado', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cowork-client-'))
    try {
      const file = join(dir, 'client.json')
      expect(readClientFile(file)).toBeNull()
      writeClientFile(file, { mode: 'client', server: { origin: 'http://100.1.2.3:8787', name: 'mac-mini', deviceId: 'abc', token: 'x.y', encrypted: false } })
      expect(readClientFile(file)).toEqual({
        mode: 'client',
        server: { origin: 'http://100.1.2.3:8787', name: 'mac-mini', deviceId: 'abc', token: 'x.y', encrypted: false }
      })
      writeClientFile(file, { mode: 'server' })
      expect(readClientFile(file)).toEqual({ mode: 'server' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('un archivo con otro contenido se ignora', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cowork-client-'))
    try {
      const file = join(dir, 'client.json')
      writeClientFile(file, { mode: 'cliente' as never })
      expect(readClientFile(file)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('pairingProblem', () => {
  it('explica cada fallo en claro', () => {
    expect(pairingProblem(401, 'INVALID_PAIRING_CODE')).toMatch(/código no es correcto/)
    expect(pairingProblem(429)).toMatch(/Espera/)
    expect(pairingProblem(503)).toMatch(/acceso desde otros dispositivos/)
    expect(pairingProblem(500)).toMatch(/500/)
  })
})
