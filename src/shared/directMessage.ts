// Mensaje directo a un agente: «@Qwen hola» o «/directo Qwen hola». El texto llega al agente tal cual, sin pasar
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

/** El agente que nombra el principio de `rest` (el nombre más largo que encaje) y lo que queda detrás. */
function matchAgent(rest: string, agents: DirectTarget[]): { agent: DirectTarget; after: string } | null {
  let best: { agent: DirectTarget; len: number } | null = null
  for (const a of agents) {
    for (const k of keysOf(a)) {
      if (rest.length < k.length || fold(rest.slice(0, k.length)) !== fold(k)) continue
      // Tiene que acabar ahí: «@Qwen3» no es «@Qwen».
      const next = rest.charAt(k.length)
      if (next && !/[\s:,]/.test(next)) continue
      if (!best || k.length > best.len) best = { agent: a, len: k.length }
    }
  }
  return best ? { agent: best.agent, after: rest.slice(best.len).replace(/^[\s:,]+/, '') } : null
}

/**
 * Si el mensaje va directo a un agente, a cuál y con qué texto. null si es un mensaje normal para el equipo
 * (también «@algo» que no es ningún agente: un correo o una mención cualquiera siguen yendo a Hermes).
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
  if (!text.startsWith('@')) return null
  const m = matchAgent(text.slice(1), agents)
  return m ? { agentId: m.agent.id, text: m.after.trimEnd() } : null
}

/**
 * Lo que se está escribiendo como agente al principio del cuadro («@Qw», «/directo Qw»), para la lista de
 * sugerencias. null si no se está escribiendo una mención (o ya va detrás un espacio y el mensaje).
 */
export function mentionQuery(text: string): { prefix: string; query: string } | null {
  const at = /^@([^\s:,]*)$/.exec(text)
  if (at) return { prefix: '@', query: at[1] }
  const cmd = /^(\/(?:directo|direct|dm)\s+)([^\s:,]*)$/i.exec(text)
  if (cmd) return { prefix: cmd[1], query: cmd[2] }
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
