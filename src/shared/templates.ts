// Plantillas de tareas: peticiones que repites mucho («Revisar PR», «Resumir carpeta»…), lanzables con un toque desde
// la fila de botones de encima del chat (escritorio, web y Órbita) o escribiendo «/nombre …». Su texto puede tener
// huecos entre llaves ({pr}, {carpeta}): al lanzarla se rellenan. Lo guarda el motor (src/main/templates.ts) y lo usan
// también los cuadros de texto. Órbita tiene su copia de las reglas de los huecos en Kotlin
// (android/.../orbita/TaskTemplates.kt): si cambian aquí, cambiarlas allí también.

export interface TaskTemplate {
  id: string
  /** Lo que se ve en el botón. */
  name: string
  /** Emoji del botón (opcional). */
  icon?: string
  /** Se lanza también escribiendo «/command …» (minúsculas, cifras y guiones). */
  command: string
  /** El texto que se envía, con sus huecos ({pr}, {carpeta}…). */
  prompt: string
  /** Solo en ese proyecto. Sin él, sale en todos. */
  projectId?: string
  /** Va directa a ese agente (como «@Agente …»), sin pasar por Hermes. */
  agentId?: string
  /** Pide tu visto bueno al plan aunque en Ajustes esté apagado. */
  askPlan?: boolean
  /** Fijada: sale la primera de la fila. */
  pinned?: boolean
  /** Viene de serie (su id de serie). Mientras no la cambies, su texto sigue el idioma de la app. */
  builtin?: string
  createdAt: number
  updatedAt: number
}

/** Lo que se puede elegir al crear o editar una plantilla. */
export interface TaskTemplateInput {
  name: string
  prompt: string
  icon?: string
  command?: string
  /** null: pasa a ser general (en todos los proyectos). */
  projectId?: string | null
  agentId?: string | null
  askPlan?: boolean
  pinned?: boolean
}

export const MAX_TEMPLATES = 100
export const MAX_TEMPLATE_NAME = 60
export const MAX_TEMPLATE_PROMPT = 8000
export const MAX_SLOTS = 6

/**
 * Órdenes «/…» que ya son de kywai (o de los cuadros de texto): una plantilla no puede llamarse así.
 */
export const RESERVED_TEMPLATE_COMMANDS = [
  'directo', 'direct', 'dm', 'rutina', 'rutinas', 'routine', 'model', 'models', 'modelo', 'modelos',
  'new', 'nuevo', 'clear', 'limpiar', 'usage', 'uso', 'cuota', 'cuotas', 'quota', 'quotas', 'limit', 'limits',
  'recuerda', 'recordar', 'memoria', 'remember', 'plantilla', 'plantillas', 'template', 'templates'
]

/** Un hueco: letras (de cualquier idioma), cifras, «_» o «-», empezando por letra. */
const SLOT = /\{(\p{L}[\p{L}\p{N}_-]{0,30})\}/gu

/** Los huecos del texto, en orden y sin repetir. */
export function templateSlots(prompt: string): string[] {
  const out: string[] = []
  for (const m of prompt.matchAll(SLOT)) if (!out.includes(m[1]) && out.length < MAX_SLOTS) out.push(m[1])
  return out
}

/** Cómo se enseña un hueco en el campo para rellenarlo: «nombre-del-archivo» → «Nombre del archivo». */
export function slotLabel(slot: string): string {
  const s = slot.replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** El texto con los huecos rellenos (los que no tengan valor se quedan vacíos). */
export function fillTemplate(prompt: string, values: Record<string, string | undefined>): string {
  return prompt
    .replace(SLOT, (_m, k: string) => (values[k] ?? '').trim())
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/**
 * Lo que va detrás de «/orden» rellena los huecos: con uno solo, todo; con varios, separados por «|» y en orden. Sin
 * huecos, va al final del texto (como las órdenes de los mods).
 */
export function fillFromArgs(prompt: string, args: string): string {
  const slots = templateSlots(prompt)
  const a = args.trim()
  if (!slots.length) return a ? `${prompt.trim()}\n\n${a}` : prompt.trim()
  if (slots.length === 1) return fillTemplate(prompt, { [slots[0]]: a })
  const parts = a.split('|')
  const values: Record<string, string> = {}
  slots.forEach((k, i) => {
    // El último hueco se queda con lo que sobre (por si el texto lleva «|»).
    values[k] = (i === slots.length - 1 ? parts.slice(i).join('|') : parts[i]) ?? ''
  })
  return fillTemplate(prompt, values)
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** La orden que sale del nombre: «Revisar PR» → «revisar-pr». */
export function commandFromName(name: string): string {
  const slug = fold(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '')
  return /^[a-z]/.test(slug) ? slug : slug ? `p-${slug}`.slice(0, 30) : ''
}

export const COMMAND_RE = /^[a-z][a-z0-9-]{0,29}$/

/** Las plantillas que salen en un proyecto: las suyas y las generales; las fijadas primero, luego por orden de creación. */
export function templatesFor<T extends Pick<TaskTemplate, 'projectId' | 'pinned' | 'createdAt'>>(list: T[], projectId: string | null | undefined): T[] {
  return list
    .filter((x) => !x.projectId || x.projectId === projectId)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.createdAt - b.createdAt)
}

/** Si el texto empieza por la orden de una plantilla de ese proyecto: la plantilla y lo que va detrás. */
export function matchTemplateCommand<T extends Pick<TaskTemplate, 'command' | 'projectId' | 'pinned' | 'createdAt'>>(
  text: string,
  list: T[],
  projectId: string | null | undefined
): { template: T; args: string } | null {
  const m = /^\/([a-z][a-z0-9-]{0,29})(?:\s+([\s\S]*))?$/i.exec(text.trim())
  if (!m) return null
  const name = m[1].toLowerCase()
  // Si hay una del proyecto y una general con la misma orden, gana la del proyecto.
  const found = templatesFor(list, projectId)
    .filter((x) => x.command === name)
    .sort((a, b) => Number(!!b.projectId) - Number(!!a.projectId))[0]
  return found ? { template: found, args: (m[2] ?? '').trim() } : null
}

/** Para la lista que sale al escribir «/» en el cuadro: las plantillas cuya orden empieza por lo escrito. */
export function commandQuery(text: string): string | null {
  const m = /^\/([a-z0-9-]*)$/i.exec(text)
  return m ? m[1].toLowerCase() : null
}
