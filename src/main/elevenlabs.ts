// Voz de ElevenLabs (modelo Eleven v3): la que más actúa. Entiende etiquetas de emoción dentro del texto
// («[excited] ¡Lo logramos!», «[whispers] es un secreto») y hace diálogos de varias voces de una vez. Es de pago:
// la clave de API la pega el usuario en Ajustes → Extensiones → Estudio de vídeo y se guarda cifrada (como la de
// Instagram). Las voces son las de su cuenta (las suyas y las que añada de la biblioteca de ElevenLabs).
import { writeFileSync } from 'node:fs'
import type { VoiceEmotion } from '@shared/voiceEmotion'

export const ELEVEN_API = 'https://api.elevenlabs.io'
export const ELEVEN_MODEL = 'eleven_v3'

/** La etiqueta de Eleven v3 para cada emoción (va delante de la frase). */
export const ELEVEN_TAG: Record<VoiceEmotion, string> = {
  neutral: '',
  alegre: '[cheerfully]',
  emocionado: '[excited]',
  sorprendido: '[surprised]',
  triste: '[sad]',
  susurro: '[whispers]',
  firme: '[seriously]',
  calma: '[calmly]',
  gracioso: '[playfully]'
}

/** El texto de una frase con su etiqueta de emoción. */
export const elevenLine = (text: string, emotion: VoiceEmotion): string => (ELEVEN_TAG[emotion] ? `${ELEVEN_TAG[emotion]} ${text}` : text)

let keyOf: () => string | null = () => null

/** Quién da la clave (index.ts: la del llavero). */
export function setElevenKeyResolver(fn: () => string | null): void {
  keyOf = fn
}

export const elevenKey = (): string | null => keyOf()?.trim() || null

export interface ElevenVoice {
  id: string
  name: string
  gender?: 'f' | 'm'
  /** Acento o idioma que dice ElevenLabs («spanish», «american»…), para ordenarlas. */
  accent?: string
}

let cache: { key: string; at: number; voices: ElevenVoice[] } | null = null

async function api(key: string, path: string, init: RequestInit = {}, timeoutMs = 30_000, signal?: AbortSignal): Promise<Response> {
  return fetch(`${ELEVEN_API}${path}`, {
    ...init,
    headers: { 'xi-api-key': key, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) },
    signal: signal ?? AbortSignal.timeout(timeoutMs)
  })
}

/** El error de ElevenLabs en una frase (sin la clave). */
async function elevenError(res: Response): Promise<Error> {
  let msg = `${res.status}`
  try {
    const j = (await res.json()) as { detail?: { message?: string; status?: string } | string }
    msg = typeof j.detail === 'string' ? j.detail : j.detail?.message ?? j.detail?.status ?? msg
  } catch {
    /* sin cuerpo */
  }
  if (res.status === 401) return new Error(`ElevenLabs no acepta la clave: ${msg}`)
  return new Error(`ElevenLabs: ${msg}`)
}

/** Comprueba la clave y dice cuántos caracteres quedan este mes. */
export async function elevenAccount(key: string): Promise<{ left: number | null }> {
  const res = await api(key, '/v1/user/subscription')
  if (!res.ok) throw await elevenError(res)
  const j = (await res.json()) as { character_count?: number; character_limit?: number }
  return { left: typeof j.character_limit === 'number' && typeof j.character_count === 'number' ? Math.max(0, j.character_limit - j.character_count) : null }
}

/** Las voces de la cuenta (se guardan 10 minutos). Con `lang`, primero las de ese idioma o acento. */
export async function elevenVoices(key: string | null = elevenKey(), lang?: string): Promise<ElevenVoice[]> {
  if (!key) return []
  if (!cache || cache.key !== key || Date.now() - cache.at > 10 * 60_000) {
    try {
      const res = await api(key, '/v1/voices')
      if (!res.ok) return []
      const j = (await res.json()) as { voices?: { voice_id: string; name: string; labels?: Record<string, string> }[] }
      const voices = (j.voices ?? []).map((v): ElevenVoice => {
        const g = v.labels?.gender?.toLowerCase()
        return { id: v.voice_id, name: v.name.split(/\s+[-–]\s+/)[0].trim(), ...(g === 'female' || g === 'male' ? { gender: g === 'female' ? 'f' : 'm' } : {}), ...(v.labels?.accent || v.labels?.language ? { accent: (v.labels.language ?? v.labels.accent).toLowerCase() } : {}) }
      })
      cache = { key, at: Date.now(), voices }
    } catch {
      return []
    }
  }
  const native = (v: ElevenVoice): boolean => !!lang && !!v.accent && (v.accent.startsWith(lang) || (lang === 'es' && /spanish|españ|mexic|argentin|latin/.test(v.accent)))
  return [...cache.voices].sort((a, b) => Number(native(b)) - Number(native(a)))
}

/** Otra voz de la cuenta para el segundo personaje de un diálogo: de su género si la hay. */
export async function elevenPartner(first: string, gender: 'f' | 'm' | undefined, lang: string): Promise<string> {
  const list = await elevenVoices(elevenKey(), lang)
  return list.find((v) => v.id !== first && (!gender || v.gender === gender))?.id ?? list.find((v) => v.id !== first)?.id ?? first
}

/** Una frase (o una escena entera con sus etiquetas) con una voz. Deja un MP3 en `mp3`. */
export async function elevenSpeak(voiceId: string, text: string, mp3: string, signal?: AbortSignal): Promise<boolean> {
  const key = elevenKey()
  if (!key) return false
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await api(key, `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, { method: 'POST', body: JSON.stringify({ text, model_id: ELEVEN_MODEL, voice_settings: { stability: 0.5 } }) }, 180_000, signal)
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 6000))
        continue
      }
      if (!res.ok) return false
      writeFileSync(mp3, Buffer.from(await res.arrayBuffer()))
      return true
    } catch {
      /* reintenta */
    }
  }
  return false
}

/** Un diálogo de una vez: cada frase con su voz (ElevenLabs las une con naturalidad). Deja un MP3 en `mp3`. */
export async function elevenDialogue(inputs: { text: string; voiceId: string }[], mp3: string, signal?: AbortSignal): Promise<boolean> {
  const key = elevenKey()
  if (!key || !inputs.length) return false
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await api(key, '/v1/text-to-dialogue?output_format=mp3_44100_128', { method: 'POST', body: JSON.stringify({ model_id: ELEVEN_MODEL, inputs: inputs.map((x) => ({ text: x.text, voice_id: x.voiceId })) }) }, 240_000, signal)
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 6000))
        continue
      }
      if (!res.ok) return false
      writeFileSync(mp3, Buffer.from(await res.arrayBuffer()))
      return true
    } catch {
      /* reintenta */
    }
  }
  return false
}
