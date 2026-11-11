import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { elevenDialogue, elevenLine, elevenPartner, elevenSpeak, elevenVoices, setElevenKeyResolver } from './elevenlabs'
import { parseVoiceId } from '@shared/videoChoice'

afterEach(() => {
  vi.unstubAllGlobals()
  setElevenKeyResolver(() => null)
})

describe('ElevenLabs', () => {
  it('pone la etiqueta de emoción de v3 delante de la frase (y nada si es neutral)', () => {
    expect(elevenLine('¡Lo logramos!', 'emocionado')).toBe('[excited] ¡Lo logramos!')
    expect(elevenLine('Es un secreto', 'susurro')).toBe('[whispers] Es un secreto')
    expect(elevenLine('Hola', 'neutral')).toBe('Hola')
  })

  it('entiende la marca voz:eleven-<id> sin cambiar las mayúsculas del id', () => {
    expect(parseVoiceId('eleven-21m00Tcm4TlvDq8ikWAM')).toEqual({ engine: 'eleven', id: '21m00Tcm4TlvDq8ikWAM' })
    expect(parseVoiceId('eleven-x')).toBeNull()
  })

  it('sin clave no llama a nadie', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await elevenVoices(null)).toEqual([])
    expect(await elevenSpeak('abc', 'hola', join(tmpdir(), 'nada.mp3'))).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('lista las voces de la cuenta (primero las del idioma) y busca pareja del otro género', async () => {
    setElevenKeyResolver(() => 'sk_prueba')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            voices: [
              { voice_id: 'aaaaaaaa1', name: 'Rachel - calm', labels: { gender: 'female', accent: 'american' } },
              { voice_id: 'bbbbbbbb2', name: 'Lucas', labels: { gender: 'male', language: 'es' } },
              { voice_id: 'cccccccc3', name: 'Sofía', labels: { gender: 'female', accent: 'spanish' } }
            ]
          })
        )
      )
    )
    const list = await elevenVoices('sk_prueba', 'es')
    expect(list.map((v) => v.name)).toEqual(['Lucas', 'Sofía', 'Rachel'])
    expect(await elevenPartner('bbbbbbbb2', 'f', 'es')).toBe('cccccccc3')
  })

  it('un diálogo va en una sola petición con la voz de cada frase', async () => {
    setElevenKeyResolver(() => 'sk_prueba')
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
    vi.stubGlobal('fetch', fetch)
    const out = join(mkdtempSync(join(tmpdir(), 'eleven-')), 'd.mp3')
    expect(await elevenDialogue([{ text: '[excited] ¡Hola!', voiceId: 'v1' }, { text: '[sad] Adiós', voiceId: 'v2' }], out)).toBe(true)
    expect(existsSync(out) && readFileSync(out).length).toBe(3)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/v1/text-to-dialogue')
    expect(JSON.parse(init.body as string)).toEqual({ model_id: 'eleven_v3', inputs: [{ text: '[excited] ¡Hola!', voice_id: 'v1' }, { text: '[sad] Adiós', voice_id: 'v2' }] })
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('sk_prueba')
  })
})
