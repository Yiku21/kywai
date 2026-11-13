// «Leer las respuestas en voz alta» (el altavoz junto al micrófono del chat): qué se lee de una respuesta, en qué
// trozos y cuál es la respuesta final de una petición. Lo usan la interfaz y el motor (y sus pruebas).

/** Lo que basta para decidir cuál es la respuesta final (un ChatMessage lo cumple). */
export interface SpokenMessage {
  id: string
  runId?: string
  author: { type: string }
  text: string
  streaming?: boolean
  /** Mensaje de una tarea (lo que el agente cuenta mientras trabaja y, al acabar, su resultado). */
  work?: unknown
  importedFrom?: string
}

/** Como mucho esto se lee de una respuesta (unos 4 minutos): lo demás se queda para leerlo en pantalla. */
export const READ_ALOUD_MAX = 4000
/** Cada trozo se convierte en audio aparte, así empieza a sonar enseguida. */
const CHUNK = 320
/** El primero, más corto: es el que te hace esperar. */
const FIRST_CHUNK = 160

/** La lista «Resumen del trabajo» (✓ tarea — agente) que cierra la respuesta de un plan: está en pantalla, no se lee. */
function withoutWorkSummary(text: string): string {
  const lines = text.split('\n')
  let end = lines.length
  while (end > 0 && !lines[end - 1].trim()) end--
  let i = end
  while (i > 0 && (/^\s*[✓✗]/.test(lines[i - 1]) || !lines[i - 1].trim())) i--
  if (i === end) return text
  // Su título va en negrita en una línea propia justo encima.
  if (i > 0 && /^\s*\*\*[^*]+\*\*\s*$/.test(lines[i - 1])) i--
  return lines.slice(0, i).join('\n')
}

/**
 * El texto de una respuesta tal como se dice en voz alta: sin bloques de código (ni tablas ni imágenes), sin
 * direcciones web y sin los signos de Markdown. Lo que va entre `comillas de código` en una frase sí se lee.
 */
export function spokenText(markdown: string): string {
  let t = withoutWorkSummary(markdown.replace(/\r\n?/g, '\n'))
  // Bloques de código (también uno que se quedó sin cerrar) y bloques HTML.
  t = t.replace(/```[\s\S]*?(```|$)/g, '\n').replace(/~~~[\s\S]*?(~~~|$)/g, '\n')
  t = t.replace(/<(script|style|pre|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>\n]{1,200}>/g, ' ')
  const out: string[] = []
  for (const raw of t.split('\n')) {
    let line = raw
    // Tablas y líneas de separación: se ven, no se oyen.
    if (/^\s*\|.*\|\s*$/.test(line) || /^\s*([-*_=]\s*){3,}$/.test(line)) {
      out.push('')
      continue
    }
    // Código sangrado (4 espacios o tabulador) que no sea parte de una lista.
    if (/^( {4,}|\t)/.test(line) && !/^\s*([-*+]|\d+[.)])\s/.test(line)) {
      out.push('')
      continue
    }
    line = line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*>+\s?/, '')
      .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, '')
      .replace(/^\s*(\d+)[.)]\s+/, '$1. ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/(\*\*|__|~~)/g, '')
      .replace(/(^|[\s(¿¡«"'])[*_]([^*_\n]+)[*_](?=$|[\s).,;:!?»"'])/g, '$1$2')
      .replace(/[*#|]/g, ' ')
      // Emojis y símbolos sueltos: la voz los leería por su nombre.
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, ' ')
      .replace(/[✓✗→←↑↓•·]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim()
    // Un título o un punto de una lista sin signo final: se le pone un punto para que la voz haga la pausa.
    if (line && /[\p{L}\p{N})»"']$/u.test(line)) line += '.'
    out.push(line)
  }
  return out
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
}

/** Parte un texto ya limpio en trozos para la voz, cortando en fin de frase (o de línea) y sin pasar de `READ_ALOUD_MAX`. */
export function speechChunks(text: string): string[] {
  const clean = text.slice(0, READ_ALOUD_MAX)
  const sentences = clean
    .split('\n')
    .flatMap((line) => line.match(/[^.!?…。！？]+[.!?…。！？]*["»)”']*\s*/g) ?? [])
    .map((x) => x.trim())
    .filter((x) => /[\p{L}\p{N}]/u.test(x))
  const chunks: string[] = []
  let cur = ''
  const push = (): void => {
    if (cur) chunks.push(cur)
    cur = ''
  }
  for (const sentence of sentences) {
    const limit = chunks.length ? CHUNK : FIRST_CHUNK
    // Una frase larguísima se parte por las comas (o, si no hay, por palabras).
    const parts = sentence.length > CHUNK ? (sentence.match(new RegExp(`.{1,${CHUNK}}(?:[,;:]\\s|\\s|$)`, 'g')) ?? [sentence]).map((p) => p.trim()).filter(Boolean) : [sentence]
    for (const part of parts) {
      if (cur && cur.length + 1 + part.length > limit) push()
      cur = cur ? `${cur} ${part}` : part
    }
  }
  push()
  return chunks
}

/**
 * La respuesta final de una petición: el último mensaje con texto que escribió un agente en ella (la respuesta del
 * coordinador con todo delante o, si fue una sola tarea, su resultado). Los pasos intermedios no son la respuesta.
 */
export function finalAnswerOf<M extends SpokenMessage>(messages: M[], runId: string): M | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.runId !== runId || m.author.type !== 'agent') continue
    if (m.streaming || !m.text.trim()) continue
    return m
  }
  return null
}

/**
 * Un mensaje que se lee nada más llegar: lo que te dice un agente fuera de una tarea (la respuesta o el plan del
 * coordinador, la respuesta final con todo delante, un aviso suyo). Los mensajes de tarea (sus pasos y su resultado)
 * no: de esos solo se lee, al terminar la petición, el último si es con lo que acaba (ver finalAnswerOf).
 */
export function isSpokenAnswer(m: SpokenMessage): boolean {
  return m.author.type === 'agent' && !m.work && !m.streaming && !m.importedFrom && !!m.text.trim()
}
