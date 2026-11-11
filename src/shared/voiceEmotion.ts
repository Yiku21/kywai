// La emoción de cada frase de la voz de un vídeo. El guion la marca entre corchetes delante de la frase
// («[triste] Tres horas después… [emocionado] ¡Y lo terminó en diez minutos!») y la voz la interpreta: Chatterbox
// (src/main/chatterbox.ts) con más o menos emoción, Gemini y Voicebox con una instrucción. A Edge, Kokoro y las voces
// del sistema no se les cambia la velocidad ni el tono (suena robótico): solo hacen la pausa de cada emoción.
// En un diálogo, la marca lleva también quién habla: «[Hermes, sorprendido] ¿Yo?».

export const VOICE_EMOTIONS = ['neutral', 'alegre', 'emocionado', 'sorprendido', 'triste', 'susurro', 'firme', 'calma', 'gracioso'] as const
export type VoiceEmotion = (typeof VOICE_EMOTIONS)[number]

/** Otras formas de decir cada emoción (el agente a veces escribe en inglés o con otra palabra). */
const ALIASES: Record<string, VoiceEmotion> = {
  normal: 'neutral',
  feliz: 'alegre',
  contento: 'alegre',
  happy: 'alegre',
  cheerful: 'alegre',
  emocionada: 'emocionado',
  entusiasmado: 'emocionado',
  euforico: 'emocionado',
  excited: 'emocionado',
  sorprendida: 'sorprendido',
  sorpresa: 'sorprendido',
  surprised: 'sorprendido',
  apenado: 'triste',
  sad: 'triste',
  susurrando: 'susurro',
  susurrado: 'susurro',
  misterio: 'susurro',
  whisper: 'susurro',
  whispering: 'susurro',
  serio: 'firme',
  enfadado: 'firme',
  enojado: 'firme',
  serious: 'firme',
  angry: 'firme',
  firm: 'firme',
  tranquilo: 'calma',
  sereno: 'calma',
  calm: 'calma',
  broma: 'gracioso',
  risa: 'gracioso',
  divertido: 'gracioso',
  funny: 'gracioso',
  playful: 'gracioso'
}

const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** «Emocionada», «excited», «EMOCIONADO» → «emocionado». null si no es una emoción. */
export function voiceEmotion(word: string | null | undefined): VoiceEmotion | null {
  if (!word) return null
  const w = fold(word)
  if ((VOICE_EMOTIONS as readonly string[]).includes(w)) return w as VoiceEmotion
  return ALIASES[w] ?? null
}

/** Una frase de la voz: el texto (con los *asteriscos* de las palabras clave), su emoción y, en un diálogo, quién la dice. */
export interface VoiceLine {
  text: string
  emotion: VoiceEmotion
  who?: string
}

const TAG_RE = /\[([^\][]{1,40})\]/g

/**
 * Parte la narración en frases por sus marcas. Lo que va antes de la primera marca lleva la emoción `fallback`; una
 * marca sin emoción conocida (un nombre solo) mantiene la emoción de antes. Devuelve también la narración sin marcas
 * (la que se ve en los subtítulos).
 */
export function narrationLines(narration: string, fallback: VoiceEmotion = 'neutral', speakers: string[] = []): { narration: string; lines: VoiceLine[] } {
  const lines: VoiceLine[] = []
  let emotion = fallback
  let who: string | undefined = speakers[0]
  let last = 0
  const push = (raw: string): void => {
    const text = raw.replace(/\s+/g, ' ').trim()
    if (text.replace(/[*\s.,;:!?¡¿…"'«»()-]/g, '')) lines.push({ text, emotion, ...(who ? { who } : {}) })
  }
  for (const m of narration.matchAll(TAG_RE)) {
    push(narration.slice(last, m.index))
    last = (m.index ?? 0) + m[0].length
    for (const part of m[1].split(/[,|/;:]/)) {
      const e = voiceEmotion(part)
      if (e) emotion = e
      else {
        const name = speakers.find((s) => fold(s) === fold(part))
        if (name) who = name
      }
    }
  }
  push(narration.slice(last))
  return { narration: lines.map((l) => l.text).join(' '), lines }
}

/** Cómo decir la frase (para Gemini y Voicebox, en inglés: la entienden mejor) y el silencio que va detrás. */
const EMOTION_VOICE: Record<VoiceEmotion, { say: string; pause: number }> = {
  neutral: { say: 'naturally, in a friendly conversational tone', pause: 0.25 },
  alegre: { say: 'happily, smiling while speaking, warm and bright', pause: 0.3 },
  emocionado: { say: 'very excitedly, fast and energetic, almost shouting with joy', pause: 0.3 },
  sorprendido: { say: 'with genuine surprise and disbelief, rising intonation', pause: 0.35 },
  triste: { say: 'sadly, slowly and softly, with a heavy, disappointed voice', pause: 0.6 },
  susurro: { say: 'in a quiet whisper, secretive and close to the microphone', pause: 0.5 },
  firme: { say: 'firmly and seriously, with emphasis and authority', pause: 0.35 },
  calma: { say: 'calmly and gently, relaxed and reassuring', pause: 0.4 },
  gracioso: { say: 'playfully, as a joke, with a little laugh in the voice', pause: 0.35 }
}

/** Cómo decir la frase, para Gemini y Voicebox. */
export const emotionInstruction = (e: VoiceEmotion): string => EMOTION_VOICE[e].say

/** Silencio tras una frase con esa emoción (antes de la siguiente). */
export const emotionPause = (e: VoiceEmotion): number => EMOTION_VOICE[e].pause

/** La palabra inglesa de la emoción, para marcarla dentro del texto que lee Gemini. */
export const EMOTION_EN: Record<VoiceEmotion, string> = {
  neutral: 'neutral',
  alegre: 'happy',
  emocionado: 'excited',
  sorprendido: 'surprised',
  triste: 'sad',
  susurro: 'whispering',
  firme: 'serious',
  calma: 'calm',
  gracioso: 'playful, laughing'
}
