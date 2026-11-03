// Lo que escribe un agente aparece letra a letra al ritmo de su voz (como en Animal Crossing): mientras balbucea, una
// letra por sílaba; cuando deja de hablar, lo que queda sale deprisa. Sin voz (silenciada), el texto sale entero.
import { useEffect, useState } from 'react'

interface Reveal {
  text: string
  /** Cuándo empieza (performance.now()). */
  start: number
  /** Milisegundos desde el inicio en que aparece cada carácter. */
  times: number[]
}

/** Más deprisa cuando la voz ya calló: así un mensaje largo no tarda una eternidad. */
const FAST_MS = 7
/** Lo que queda tras la voz sale como mucho en este tiempo. */
const REST_MAX_MS = 1500
const reveals = new Map<string, Reveal>()

/** Clave de lo que se escribe: el texto de un mensaje o una de las frases que cuenta en su tarea. */
export function revealKey(messageId: string, note?: string): string {
  return note === undefined ? messageId : `${messageId}\u0000${note}`
}

/**
 * Cuándo aparece cada carácter de [text] (ms), con los mismos tiempos que la voz (`playVoice`): una sílaba por letra
 * o cifra a [rate] sílabas por segundo, medio hueco en los espacios y uno largo en la puntuación. A partir de
 * [spoken] sílabas (lo que balbucea como mucho), el resto sale deprisa.
 */
export function revealTimes(text: string, rate: number, spoken: number): number[] {
  const step = 1000 / rate
  const times: number[] = []
  let t = 10
  let syllables = 0
  let rest = -1
  for (const ch of text) {
    // Los caracteres «dobles» (emojis) ocupan dos posiciones del texto: mismo instante para las dos.
    const add = (at: number): void => {
      for (let i = 0; i < ch.length; i++) times.push(at)
    }
    if (syllables >= spoken) {
      if (rest < 0) rest = times.length
      add(t)
      t += FAST_MS
      continue
    }
    add(t)
    if (/\s/.test(ch)) t += step * 0.5
    else if (/[.,;:!?…]/.test(ch)) t += step * (ch === ',' ? 1 : 1.8)
    else if (/[\p{L}\p{N}]/u.test(ch)) {
      t += step
      syllables++
    }
  }
  // Si lo que queda tardaría demasiado, se comprime.
  if (rest >= 0) {
    const from = times[rest]
    const span = times[times.length - 1] - from
    if (span > REST_MAX_MS) for (let i = rest; i < times.length; i++) times[i] = from + ((times[i] - from) * REST_MAX_MS) / span
  }
  return times
}

/** Empieza a escribir [text] dentro de [delayMs] (cuando empieza su voz). */
export function startReveal(key: string, text: string, rate: number, delayMs: number, spoken: number): void {
  const clean = text.trim()
  reveals.set(key, { text: clean, start: performance.now() + Math.max(0, delayMs), times: revealTimes(clean, rate, spoken) })
  if (reveals.size > 200) reveals.delete(reveals.keys().next().value!)
}

function visible(r: Reveal, now: number): number {
  const elapsed = now - r.start
  let n = 0
  while (n < r.times.length && r.times[n] <= elapsed) n++
  return n
}

/** Lo que se ve de [text] ahora mismo: entero, salvo que se esté escribiendo al ritmo de la voz. */
export function useRevealed(key: string, text: string): { shown: string; revealing: boolean } {
  const reveal = reveals.get(key)
  const active = !!reveal && reveal.text === text.trim() && visible(reveal, performance.now()) < reveal.text.length
  const [, tick] = useState(0)
  useEffect(() => {
    if (!active || !reveal) return
    let frame = 0
    const loop = (): void => {
      tick((n) => n + 1)
      if (visible(reveal, performance.now()) < reveal.text.length) frame = requestAnimationFrame(loop)
      else reveals.delete(key)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [active, reveal, key])
  if (!active || !reveal) return { shown: text, revealing: false }
  return { shown: reveal.text.slice(0, visible(reveal, performance.now())), revealing: true }
}

/** Si [key] se está escribiendo (o va a empezar). */
export function isRevealing(key: string): boolean {
  return reveals.has(key)
}

/** Solo para las pruebas. */
export function __clearReveals(): void {
  reveals.clear()
}
