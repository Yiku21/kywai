// Mensaje directo a un agente: «@Qwen hola», «revisa esto @Qwen» o «/directo Qwen hola». El texto llega al agente tal cual, sin pasar
// por el plan de Hermes (ni verificador, ni relevo, ni resumen final). Lo usan el motor (sendMessage) y los cuadros
// de texto del escritorio y la web (la lista que sale al escribir @). Órbita tiene su copia en Kotlin
// (android/.../orbita/DirectMention.kt): si cambian las reglas, cambiarlas en los dos sitios.

/** Lo que hace falta de un agente para reconocerlo por su nombre o su id. */
export interface DirectTarget {
  id: string
  name: string
}

export interface DirectMessage {
  agentId: string
  /** El texto que recibe el agente, sin la mención. Puede quedar vacío (solo adjuntos). */
  text: string
  /** La mención iba en medio o al final: en el chat se enseña el mensaje tal como se escribió. */
  inline?: boolean
}

/** «/directo», «/direct» y «/dm» seguidos del agente. */
const COMMAND = /^\/(directo|direct|dm)\s+/i

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Formas en que se puede escribir un agente: su nombre, su nombre sin espacios y su id. */
function keysOf(a: DirectTarget): string[] {
  return [...new Set([a.name.trim(), a.name.replace(/\s+/g, ''), a.id].filter((k) => k.length > 0))]
}

/** Lo que puede ir justo detrás del nombre: nada, un espacio, «:», «,» o un signo que cierra la frase («@Qwen.»). */
function endsName(rest: string, at: number): boolean {
  const next = rest.charAt(at)
  if (!next || /[\s:,]/.test(next)) return true
  // «@Qwen.» o «@Qwen?» al final de la frase sí; «@Qwen.ts» o «@Qwen3» no.
  return /[.!?;)\]»"']/.test(next) && !/[\p{L}\p{N}_]/u.test(rest.charAt(at + 1))
}

/** El agente que nombra el principio de `rest` (el nombre más largo que encaje) y cuánto ocupa. */
function matchAgent(rest: string, agents: DirectTarget[]): { agent: DirectTarget; len: number; after: string } | null {
  let best: { agent: DirectTarget; len: number } | null = null
  for (const a of agents) {
    for (const k of keysOf(a)) {
      if (rest.length < k.length || fold(rest.slice(0, k.length)) !== fold(k)) continue
      // Tiene que acabar ahí: «@Qwen3» no es «@Qwen».
      if (!endsName(rest, k.length)) continue
      if (!best || k.length > best.len) best = { agent: a, len: k.length }
    }
  }
  return best ? { ...best, after: rest.slice(best.len).replace(/^[\s:,]+/, '') } : null
}

/** El texto con el código («`…`» y «```…```») tapado con espacios: una «@» dentro de código no es una mención. */
function maskCode(text: string): string {
  return text.replace(/```[\s\S]*?(```|$)|`[^`\n]*`/g, (m) => ' '.repeat(m.length))
}

/**
 * Las menciones «@Agente» en cualquier sitio del texto. La «@» tiene que ir al principio o detrás de un espacio o un
 * signo («(@Qwen», «¿@Qwen»): «yo@correo.com» o «usuario@Qwen» no cuentan.
 */
function inlineMentions(text: string, agents: DirectTarget[]): { agent: DirectTarget; start: number; end: number }[] {
  const masked = maskCode(text)
  const found: { agent: DirectTarget; start: number; end: number }[] = []
  for (const m of masked.matchAll(/(^|[^\p{L}\p{N}_.@+\-])@/gu)) {
    const start = (m.index ?? 0) + m[1].length
    const hit = matchAgent(masked.slice(start + 1), agents)
    if (hit) found.push({ agent: hit.agent, start, end: start + 1 + hit.len })
  }
  return found
}

/**
 * Si el mensaje va directo a un agente, a cuál y con qué texto. null si es un mensaje normal para el equipo
 * (también «@algo» que no es ningún agente: un correo o una mención cualquiera siguen yendo a Hermes).
 * La mención puede ir al principio («@Qwen revisa esto»), en medio («pregunta a @Qwen qué opina») o al final
 * («revisa esto @Qwen»). Si se nombra a dos agentes distintos, el mensaje va a Hermes, que reparte.
 * `{ error }` si se usó «/directo» con un agente que no existe.
 */
export function parseDirect(raw: string, agents: DirectTarget[]): DirectMessage | { error: string } | null {
  const text = raw.replace(/^\s+/, '')
  const cmd = COMMAND.exec(text)
  if (cmd) {
    const m = matchAgent(text.slice(cmd[0].length), agents)
    if (!m) return { error: text.slice(cmd[0].length).split(/\s+/)[0] ?? '' }
    return { agentId: m.agent.id, text: m.after.trimEnd() }
  }
  const found = inlineMentions(text, agents)
  if (found.length === 0) return null
  if (new Set(found.map((f) => f.agent.id)).size > 1) return null
  const agentId = found[0].agent.id
  // Al principio, como siempre: el agente recibe lo de detrás.
  if (found[0].start === 0) {
    const rest = found.slice(1)
    if (rest.length === 0) return { agentId, text: matchAgent(text.slice(1), agents)!.after.trimEnd() }
  }
  // En medio o al final: se quita la mención del final (con la coma de delante) y, en medio, solo la «@».
  let out = text
  for (const f of [...found].reverse()) {
    const tail = out.slice(f.end)
    if (/^[\s.!?;]*$/.test(tail)) {
      out = out.slice(0, f.start).replace(/[\s,:]+$/, '') + tail.replace(/^\s+/, '')
    } else if (f.start === 0) {
      out = out.slice(f.end).replace(/^[\s:,]+/, '')
    } else {
      out = out.slice(0, f.start) + out.slice(f.start + 1)
    }
  }
  return { agentId, text: out.trim(), ...(found[0].start === 0 && found.length === 1 ? {} : { inline: true }) }
}

/** Lo que se está escribiendo como agente: desde dónde (la «@» o el principio de «/directo») hasta el cursor. */
export interface MentionQuery {
  prefix: string
  query: string
  start: number
  end: number
}

/**
 * Lo que se está escribiendo como agente justo antes del cursor («@Qw», «revisa esto @Qw», «/directo Qw»), para la
 * lista de sugerencias. null si no se está escribiendo una mención (o ya va detrás un espacio y el mensaje). Sin
 * `caret`, el cursor está al final del texto.
 */
export function mentionQuery(text: string, caret: number = text.length): MentionQuery | null {
  const before = text.slice(0, caret)
  // Detrás del cursor tiene que acabar la palabra: con el cursor en medio de «@Qwen» no se abre la lista.
  if (/^[^\s]/.test(text.slice(caret))) return null
  const cmd = /^(\/(?:directo|direct|dm)\s+)([^\s:,]*)$/i.exec(before)
  if (cmd) return { prefix: cmd[1], query: cmd[2], start: 0, end: caret }
  const at = /(^|[^\p{L}\p{N}_.@+\-])@([^\s:,@]*)$/u.exec(maskCode(before))
  if (at) {
    const start = at.index + at[1].length
    return { prefix: '@', query: before.slice(start + 1), start, end: caret }
  }
  return null
}

/** Los agentes que encajan con lo escrito (por el principio de su nombre o su id), en su orden. */
export function mentionMatches<T extends DirectTarget>(query: string, agents: T[]): T[] {
  const q = fold(query)
  if (!q) return agents
  return agents.filter((a) => keysOf(a).some((k) => fold(k).startsWith(q)) || fold(a.name).split(/\s+/).some((w) => w.startsWith(q)))
}

/** Cómo queda el cuadro al elegir un agente de la lista: «@Nombre » (sin espacios en el nombre, para que se lea bien). */
export function mentionText(prefix: string, a: DirectTarget): string {
  return `${prefix.startsWith('@') ? '@' : prefix}${a.name.replace(/\s+/g, '')} `
}

/** El cuadro tras elegir un agente de la lista: «@Nombre » donde estaba lo escrito, y dónde queda el cursor. */
export function insertMention(text: string, q: MentionQuery, a: DirectTarget): { text: string; caret: number } {
  const piece = mentionText(q.prefix, a)
  const head = text.slice(0, q.start) + piece
  return { text: head + text.slice(q.end).replace(/^ /, ''), caret: head.length }
}
