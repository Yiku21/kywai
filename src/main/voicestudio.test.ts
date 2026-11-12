// @vitest-environment node
// VoiceStudio por su API local: lista sus voces (sin los alias de OpenAI) y guarda la voz en WAV; si no está abierto, null.
import { mkdtempSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseVoiceId } from '@shared/videoChoice'
import { voicestudioSpeak, voicestudioVoices } from './voicestudio'

let server: Server
let url = ''
const bodies: Record<string, unknown>[] = []
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(2000)])

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/v1/audio/voices') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ voices: [{ voice_id: 'alloy', id: 'alloy', name: 'Alloy', type: 'openai_alias' }, { voice_id: 'p-1', id: 'p-1', name: 'Mi voz', type: 'profile', language: 'es' }, { id: 'raro con espacios', name: 'x', type: 'profile' }], engines: [] }))
      return
    }
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => {
      const b = JSON.parse(data) as Record<string, unknown>
      bodies.push(b)
      if (b.voice === 'rota') {
        res.statusCode = 500
        res.end('{}')
      } else res.end(wav)
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

describe('VoiceStudio', () => {
  it('lista las voces del usuario y la de por defecto; sin app, null', async () => {
    expect(await voicestudioVoices(url)).toEqual([{ id: 'p-1', name: 'Mi voz', language: 'es' }, { id: 'default', name: 'VoiceStudio' }])
    expect(await voicestudioVoices('http://127.0.0.1:9')).toBeNull()
  })

  it('pide la voz en WAV con el idioma y el tono, y falla sin romper', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'aicw-vs-')), 'v.wav')
    expect(await voicestudioSpeak('p-1', 'Hola', out, { url, language: 'es-ES', instructions: 'alegre' })).toBe(true)
    expect(readFileSync(out).subarray(0, 4).toString()).toBe('RIFF')
    expect(bodies[0]).toMatchObject({ input: 'Hola', voice: 'p-1', response_format: 'wav', language: 'es', instructions: 'alegre' })
    expect(await voicestudioSpeak('rota', 'Hola', out, { url })).toBe(false)
  })

  it('la marca voz:voicestudio-<id>', () => {
    expect(parseVoiceId('voicestudio-p-1')).toEqual({ engine: 'voicestudio', id: 'p-1' })
    expect(parseVoiceId('voicestudio-default')).toEqual({ engine: 'voicestudio', id: 'default' })
  })
})
