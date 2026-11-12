/**
 * VoiceStudio (github.com/debpalash/VoiceStudio, AGPL-3.0) como voz local del estudio de vídeo.
 *
 * Es una app aparte: kywai no trae su código, solo le habla por su API local cuando está abierta en el equipo
 * (http://127.0.0.1:3900, sin clave en la propia máquina). Sus voces salen en el paso «Voz» del selector de «/video»
 * con la marca «voz:voicestudio-<id>»: las voces que el usuario creó o clonó en VoiceStudio y su voz por defecto.
 * Habla más de 600 idiomas con OmniVoice (su motor por defecto) y entiende el tono por `instructions`.
 *  · Lista:  GET  /v1/audio/voices  → { voices: [{ id, voice_id, name, type: 'profile' | 'openai_alias', language? }] }
 *  · Voz:    POST /v1/audio/speech  { model, input, voice, response_format: 'wav', language?, instructions? } → WAV
 */
import { writeFileSync } from 'node:fs'

export const VOICESTUDIO_DEFAULT_URL = 'http://127.0.0.1:3900'

/** La voz que trae VoiceStudio sin crear ninguna (la del motor activo). */
export const VOICESTUDIO_DEFAULT_VOICE = 'default'

export interface VoiceStudioVoice {
  id: string
  name: string
  /** Código del idioma de la voz («es», «en-US»…), si lo dice. */
  language?: string
}

/** Dirección de VoiceStudio: KYWAI_VOICESTUDIO_URL, o la de la app. */
export function voicestudioUrl(): string {
  return ((process.env.KYWAI_VOICESTUDIO_URL || '').trim() || VOICESTUDIO_DEFAULT_URL).replace(/\/+$/, '')
}

const signalFor = (ms: number, signal?: AbortSignal): AbortSignal => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms))

/**
 * Las voces de VoiceStudio (las creadas o clonadas por el usuario y, al final, la de por defecto), o null si no está
 * abierto (no responde en 2,5 s). Los nombres de OpenAI («alloy»…) que también lista no se ofrecen: son la misma voz
 * por defecto con otro nombre.
 */
export async function voicestudioVoices(url = voicestudioUrl()): Promise<VoiceStudioVoice[] | null> {
  try {
    const res = await fetch(`${url}/v1/audio/voices`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return null
    const j = (await res.json()) as { voices?: unknown }
    if (!Array.isArray(j.voices)) return null
    const own = j.voices
      .filter((v): v is { id?: unknown; voice_id?: unknown; name?: unknown; type?: unknown; language?: unknown } => !!v && typeof v === 'object')
      .filter((v) => v.type === 'profile')
      .map((v) => {
        const id = typeof v.id === 'string' ? v.id : typeof v.voice_id === 'string' ? v.voice_id : ''
        const name = typeof v.name === 'string' && v.name.trim() ? v.name.trim() : id
        return { id, name, ...(typeof v.language === 'string' && v.language ? { language: v.language } : {}) }
      })
      // Lo que va en la marca «voz:voicestudio-<id>» (sin espacios ni símbolos raros).
      .filter((v) => /^[A-Za-z0-9_.:-]{1,80}$/.test(v.id) && v.id !== VOICESTUDIO_DEFAULT_VOICE)
    return [...own, { id: VOICESTUDIO_DEFAULT_VOICE, name: 'VoiceStudio' }]
  } catch {
    return null
  }
}

/**
 * La voz de un texto en un WAV con esa voz de VoiceStudio. false si falla (el vídeo pasa entero a la voz por defecto
 * del idioma, para no mezclar voces). `instructions` es el tono («alegre, con energía»).
 */
export async function voicestudioSpeak(
  voice: string,
  text: string,
  out: string,
  opts: { language?: string; instructions?: string; signal?: AbortSignal; timeoutMs?: number; url?: string } = {}
): Promise<boolean> {
  try {
    const res = await fetch(`${opts.url ?? voicestudioUrl()}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        // «tts-1» = el motor que tenga activo VoiceStudio.
        model: 'tts-1',
        input: text.slice(0, 4096),
        voice,
        response_format: 'wav',
        ...(opts.language ? { language: opts.language.split(/[-_]/)[0].toLowerCase() } : {}),
        ...(opts.instructions ? { instructions: opts.instructions } : {})
      }),
      signal: signalFor(opts.timeoutMs ?? 240_000, opts.signal)
    })
    if (!res.ok) return false
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1000 || buf.subarray(0, 4).toString('ascii') !== 'RIFF') return false
    writeFileSync(out, buf)
    return true
  } catch {
    return false
  }
}
