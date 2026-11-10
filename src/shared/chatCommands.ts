// Las órdenes «/…» del chat, para la lista que sale al escribir «/» (cada una con lo que hace a la derecha).
// La usan el cuadro de texto del escritorio y la web (Composer.tsx). Órbita tiene su copia en Kotlin
// (android/.../orbita/ChatCommands.kt): si se añade o cambia una orden, cambiarla en los dos sitios.
// Quien la ejecuta: «/nuevo», «/uso», «/model», «/recuerda» y «/rutina» el propio cuadro de texto (y el motor si llegan
// como mensaje: src/main/orchestrator.ts); «/directo» src/shared/directMessage.ts; las plantillas src/shared/templates.ts;
// las de los mods src/main/mods.ts.
import { t } from './i18n'
import type { MemoryInput, MemoryKind } from './types'

export interface ChatCommand {
  /** Lo que se escribe detrás de «/» (el nombre que se enseña). */
  name: string
  /** Otras formas que también valen («/usage» es «/uso»). */
  aliases: string[]
  /** Lo que va detrás, como pista («tema»). Sin él, la orden hace su trabajo nada más elegirla. */
  args?: string
  /** Una frase corta: lo que hace (en español; se traduce al enseñarla). */
  description: string
  /** Su icono en la lista (de línea, como los de la app): el escritorio y Órbita lo dibujan cada uno con el suyo. */
  icon: CommandIcon
}

/** Los iconos de la lista del «/». */
export type CommandIcon = 'video' | 'routine' | 'direct' | 'memory' | 'model' | 'usage' | 'new' | 'template' | 'mod'

/** Las órdenes de kywai, en el orden en que salen. */
export const BUILTIN_COMMANDS: readonly ChatCommand[] = [
  { name: 'video', aliases: [], args: 'tema', description: 'Crea un vídeo completo en el estilo que elijas y te da solo el MP4', icon: 'video' },
  { name: 'rutina', aliases: ['rutinas', 'routine'], args: 'cuándo: qué', description: 'Programa una tarea a una hora o que se repita', icon: 'routine' },
  { name: 'directo', aliases: ['direct', 'dm'], args: 'Agente mensaje', description: 'Habla con un agente sin pasar por Hermes', icon: 'direct' },
  { name: 'recuerda', aliases: ['recordar', 'memoria', 'remember'], args: 'texto', description: 'Guarda un dato en la memoria del proyecto', icon: 'memory' },
  { name: 'model', aliases: ['modelo', 'models', 'modelos'], description: 'Cambia el modelo de Hermes', icon: 'model' },
  { name: 'uso', aliases: ['usage', 'cuotas', 'cuota', 'quota', 'quotas', 'limits', 'limit'], description: 'Mira cuánta cuota le queda a cada agente', icon: 'usage' },
  { name: 'nuevo', aliases: ['new', 'clear', 'limpiar'], description: 'Empieza un chat nuevo en este proyecto', icon: 'new' }
]

/** Una fila de la lista del «/». */
export interface CommandSuggestion {
  /** Único en la lista (para React). */
  key: string
  kind: 'builtin' | 'template' | 'mod'
  /** Lo que se escribe detrás de «/». */
  command: string
  /** Pista de lo que va detrás («tema»). */
  args?: string
  /** Lo que hace, ya traducido. */
  description: string
  /** Su icono (de línea, el mismo estilo para todas). */
  icon: CommandIcon
  /** Hace su trabajo nada más elegirla (no lleva nada detrás). */
  runs: boolean
  /** La plantilla, si es una. */
  templateId?: string
}

export interface CommandSources {
  /** Las plantillas que valen en este proyecto (templatesFor). */
  templates?: Array<{ id: string; command: string; name: string; icon?: string }>
  /** Las órdenes de los mods encendidos. */
  mods?: Array<{ name: string; description: string; mod: string }>
}

/** El nombre de la orden que encaja con lo escrito: el suyo, o el alias que se está escribiendo. */
function matchName(c: ChatCommand, q: string): string | null {
  if (c.name.startsWith(q)) return c.name
  return c.aliases.find((a) => a.startsWith(q)) ?? null
}

/**
 * Todas las órdenes que empiezan por lo escrito (sin la «/»): primero las de kywai, luego tus plantillas y luego las
 * de los mods. Una plantilla o un mod con el nombre de una orden de kywai no sale (manda la de kywai).
 */
export function commandSuggestions(query: string, src: CommandSources = {}): CommandSuggestion[] {
  const q = query.toLowerCase()
  const out: CommandSuggestion[] = []
  const taken = new Set<string>()
  for (const c of BUILTIN_COMMANDS) {
    for (const k of [c.name, ...c.aliases]) taken.add(k)
    const name = matchName(c, q)
    if (!name) continue
    out.push({ key: `b:${c.name}`, kind: 'builtin', command: name, ...(c.args ? { args: t(c.args) } : {}), description: t(c.description), icon: c.icon, runs: !c.args })
  }
  for (const tpl of src.templates ?? []) {
    if (!tpl.command || taken.has(tpl.command) || !tpl.command.startsWith(q)) continue
    taken.add(tpl.command)
    out.push({ key: `t:${tpl.id}`, kind: 'template', command: tpl.command, description: tpl.name, icon: 'template', runs: false, templateId: tpl.id })
  }
  for (const m of src.mods ?? []) {
    if (taken.has(m.name) || !m.name.startsWith(q)) continue
    taken.add(m.name)
    out.push({ key: `m:${m.mod}:${m.name}`, kind: 'mod', command: m.name, description: m.description || t('Orden del mod «{mod}»', { mod: m.mod }), icon: 'mod', runs: false })
  }
  return out
}

/** «/recuerda texto»: va a la memoria del proyecto (confirmado), no a los agentes. */
export const REMEMBER_COMMAND = /^\/(recuerda|recordar|memoria|remember)\s+([\s\S]+)$/i

/** Lo que se anota con «/recuerda …». Admite «decisión: …», «pendiente: …», «preferencia: …», «hecho: …». */
export function rememberInput(raw: string): MemoryInput {
  const m = /^(decisi[oó]n|hecho|dato|preferencia|pendiente)\s*:\s*([\s\S]+)$/i.exec(raw.trim())
  if (!m) return { kind: 'fact', text: raw.trim() }
  const w = m[1].toLowerCase()
  const kind: MemoryKind = w.startsWith('decisi') ? 'decision' : w.startsWith('pref') ? 'preference' : w === 'pendiente' ? 'pending' : 'fact'
  return { kind, text: m[2].trim() }
}
