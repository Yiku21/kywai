// Plantillas de tareas (la fila de botones de encima del chat y las órdenes «/nombre …»). Se guardan en
// «templates.json» de la carpeta de datos, para todos los proyectos o para uno, y las ven igual el escritorio, la web y
// Órbita (cada cambio emite «templates.updated»). Las de serie no guardan su texto mientras no las cambies: así siguen
// el idioma de la app. Las reglas de los huecos ({pr}, {carpeta}…) están en src/shared/templates.ts.
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COMMAND_RE,
  MAX_TEMPLATE_NAME,
  MAX_TEMPLATE_PROMPT,
  MAX_TEMPLATES,
  RESERVED_TEMPLATE_COMMANDS,
  commandFromName,
  fillFromArgs,
  matchTemplateCommand,
  type TaskTemplate,
  type TaskTemplateInput
} from '@shared/templates'
import { tr } from '@shared/i18n'
import { emit } from './events'

/** Lo que se guarda: en las de serie, solo lo que hayas cambiado. */
type Stored = Partial<TaskTemplate> & Pick<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'>

interface Builtin {
  icon: string
  name: string
  command: string
  prompt: string
}

/** Un hueco con el nombre en el idioma de la app («{carpeta}», «{folder}»…). */
const slot = (name: string): string => `{${name.replace(/\s+/g, '-')}}`

/** Las de serie, en el idioma de la app. */
export function builtinTemplates(): Record<string, Builtin> {
  return {
    'review-pr': {
      icon: '🔍',
      name: tr('Revisar PR'),
      command: tr('revisar-pr'),
      prompt: tr(
        'Revisa el pull request {pr}: explica qué cambia, busca fallos, riesgos de seguridad y casos sin probar, y termina con una lista de cambios recomendados, de más a menos importante. No cambies nada del repositorio.'
      )
    },
    'summarize-folder': {
      icon: '📁',
      name: tr('Resumir carpeta'),
      command: tr('resumir-carpeta'),
      prompt: tr('Lee la carpeta {slot} del proyecto y resume qué contiene: para qué sirve cada parte, cuáles son los archivos más importantes y qué parece que falta o está a medias.', {
        slot: slot(tr('carpeta'))
      })
    },
    'find-bugs': {
      icon: '🐞',
      name: tr('Buscar fallos'),
      command: tr('buscar-fallos'),
      prompt: tr('Busca fallos en {slot}: errores de lógica, casos límite sin tratar y mensajes de error confusos. De cada uno di dónde está, cómo reproducirlo y cómo arreglarlo.', {
        slot: slot(tr('qué-revisar'))
      })
    },
    'write-tests': {
      icon: '🧪',
      name: tr('Escribir pruebas'),
      command: tr('escribir-pruebas'),
      prompt: tr('Escribe pruebas automáticas para {slot} con el sistema de pruebas que ya use el proyecto, cubre los casos normales y los límite, y ejecútalas para comprobar que pasan.', {
        slot: slot(tr('qué-probar'))
      })
    },
    'update-deps': {
      icon: '📦',
      name: tr('Actualizar dependencias'),
      command: tr('actualizar-dependencias'),
      prompt: tr(
        'Revisa las dependencias del proyecto: cuáles están desactualizadas o tienen fallos de seguridad conocidos. Actualiza las que sea seguro actualizar, ejecuta las pruebas y explica qué has cambiado, qué has dejado sin tocar y por qué.'
      )
    },
    'explain-code': {
      icon: '💡',
      name: tr('Explicar código'),
      command: tr('explicar-codigo'),
      prompt: tr('Explica cómo funciona {slot} para alguien que no lo ha visto nunca: qué hace, cómo encaja con el resto del proyecto y qué hay que tener en cuenta al cambiarlo.', {
        slot: slot(tr('archivo'))
      })
    }
  }
}

let dataDir = ''
let validProject: (id: string) => boolean = () => true
/** Lo leído del archivo (null: todavía no se ha leído). */
let cache: Stored[] | null = null

const file = (): string => join(dataDir, 'templates.json')

export function initTemplates(dir: string, opts: { isProject?: (id: string) => boolean } = {}): void {
  dataDir = dir
  cache = null
  if (opts.isProject) validProject = opts.isProject
}

function read(): Stored[] {
  if (cache) return cache
  if (!dataDir) return (cache = [])
  try {
    const d = JSON.parse(readFileSync(file(), 'utf8')) as { templates?: unknown }
    cache = Array.isArray(d.templates)
      ? (d.templates as Stored[]).filter((x) => x && typeof x.id === 'string' && typeof x.createdAt === 'number').slice(0, MAX_TEMPLATES)
      : []
  } catch (e) {
    // Primera vez (no hay archivo): vienen las de serie. Si el archivo está roto, no se pisa: se empieza vacío.
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
      const now = Date.now()
      cache = Object.keys(builtinTemplates()).map((b, i) => ({ id: `builtin-${b}`, builtin: b, createdAt: now + i, updatedAt: now + i }))
      write(cache, false)
    } else {
      console.warn('[cowork] templates.json no se pudo leer', e)
      cache = []
    }
  }
  return cache
}

function write(list: Stored[], notify = true): void {
  cache = list
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true })
    const tmp = `${file()}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify({ templates: list }, null, 2), 'utf8')
    renameSync(tmp, file())
  }
  if (notify) emit({ kind: 'templates.updated', templates: listTemplates() })
}

function publicOf(s: Stored, builtins: Record<string, Builtin>): TaskTemplate {
  const b = s.builtin ? builtins[s.builtin] : undefined
  const out: TaskTemplate = {
    id: s.id,
    name: s.name ?? b?.name ?? '',
    command: s.command ?? b?.command ?? '',
    prompt: s.prompt ?? b?.prompt ?? '',
    createdAt: s.createdAt,
    updatedAt: s.updatedAt
  }
  const icon = s.icon ?? b?.icon
  if (icon) out.icon = icon
  if (s.projectId) out.projectId = s.projectId
  if (s.agentId) out.agentId = s.agentId
  if (s.askPlan) out.askPlan = true
  if (s.pinned) out.pinned = true
  if (s.builtin) out.builtin = s.builtin
  return out
}

/** Todas las plantillas (de todos los proyectos), con el texto de las de serie en el idioma de la app. */
export function listTemplates(): TaskTemplate[] {
  const b = builtinTemplates()
  return read()
    .map((s) => publicOf(s, b))
    .filter((x) => x.name && x.prompt && x.command)
}

export function getTemplate(id: unknown): TaskTemplate | null {
  return typeof id === 'string' ? (listTemplates().find((x) => x.id === id) ?? null) : null
}

function str(v: unknown, max: number, label: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new Error(tr('Falta {label}', { label }))
  if (v.includes('\0')) throw new Error(tr('{label} no es válido', { label }))
  const s = v.trim()
  if (s.length > max) throw new Error(tr('{label} es demasiado largo (máximo {max} caracteres)', { label, max }))
  return s
}

/** Comprueba lo que llega (del escritorio, la web o el móvil) y lo deja listo para guardar. */
function clean(input: Partial<TaskTemplateInput>, current: TaskTemplate | null): Partial<Stored> {
  const out: Partial<Stored> = {}
  if (!current || input.name !== undefined) out.name = str(input.name, MAX_TEMPLATE_NAME, tr('el nombre'))
  if (!current || input.prompt !== undefined) out.prompt = str(input.prompt, MAX_TEMPLATE_PROMPT, tr('el texto'))
  if (input.icon !== undefined) {
    if (typeof input.icon !== 'string' || [...input.icon.trim()].length > 4) throw new Error(tr('El icono tiene que ser un emoji'))
    out.icon = input.icon.trim()
  }
  if (input.command !== undefined && input.command !== '') {
    const c = typeof input.command === 'string' ? input.command.trim().replace(/^\//, '').toLowerCase() : ''
    if (!COMMAND_RE.test(c)) throw new Error(tr('La orden solo puede llevar letras sin acentos, cifras y guiones, y empezar por una letra'))
    out.command = c
  } else if (!current || (out.name && out.name !== current.name && current.command === commandFromName(current.name))) {
    // Sin orden escrita: sale del nombre (y la sigue si la tenías así).
    out.command = commandFromName(out.name ?? current?.name ?? '') || 'plantilla'
  }
  if (input.projectId !== undefined) {
    if (input.projectId === null || input.projectId === '') out.projectId = undefined
    else if (typeof input.projectId !== 'string' || !validProject(input.projectId)) throw new Error(tr('Proyecto no válido'))
    else out.projectId = input.projectId
  }
  if (input.agentId !== undefined) {
    if (input.agentId === null || input.agentId === '') out.agentId = undefined
    else if (typeof input.agentId !== 'string' || input.agentId.length > 64) throw new Error(tr('Agente no válido'))
    else out.agentId = input.agentId
  }
  if (input.askPlan !== undefined) out.askPlan = input.askPlan === true || undefined
  if (input.pinned !== undefined) out.pinned = input.pinned === true || undefined
  return out
}

function checkCommand(command: string, projectId: string | undefined, selfId: string | null): void {
  if (RESERVED_TEMPLATE_COMMANDS.includes(command)) throw new Error(tr('«/{command}» ya es una orden de kywai: elige otra', { command }))
  const clash = listTemplates().find((x) => x.id !== selfId && x.command === command && (x.projectId ?? '') === (projectId ?? ''))
  if (clash) throw new Error(tr('Ya hay una plantilla con la orden «/{command}» ({name})', { command, name: clash.name }))
}

export function createTemplate(input: unknown): TaskTemplate {
  const list = read()
  if (list.length >= MAX_TEMPLATES) throw new Error(tr('Como mucho {n} plantillas', { n: MAX_TEMPLATES }))
  const c = clean((input ?? {}) as Partial<TaskTemplateInput>, null)
  checkCommand(c.command!, c.projectId, null)
  const now = Date.now()
  const s: Stored = { ...c, id: randomUUID(), createdAt: now, updatedAt: now }
  for (const k of Object.keys(s) as (keyof Stored)[]) if (s[k] === undefined) delete s[k]
  write([...list, s])
  return getTemplate(s.id)!
}

export function updateTemplate(id: unknown, patch: unknown): TaskTemplate {
  const list = read()
  const i = list.findIndex((x) => x.id === id)
  const current = i >= 0 ? getTemplate(id) : null
  if (i < 0 || !current) throw new Error(tr('Esa plantilla ya no existe'))
  const c = clean((patch ?? {}) as Partial<TaskTemplateInput>, current)
  const next = { ...current, ...c }
  if (next.command !== current.command || next.projectId !== current.projectId) checkCommand(next.command, next.projectId, current.id)
  const s: Stored = { ...list[i], ...c, updatedAt: Date.now() }
  // En las de serie solo se guarda lo que de verdad cambia (si no, el texto deja de seguir el idioma).
  if (s.builtin) {
    const b = builtinTemplates()[s.builtin]
    if (b) for (const k of ['name', 'prompt', 'command', 'icon'] as const) if (s[k] === b[k]) delete s[k]
  }
  for (const k of Object.keys(s) as (keyof Stored)[]) if (s[k] === undefined) delete s[k]
  write(list.map((x, j) => (j === i ? s : x)))
  return getTemplate(s.id)!
}

export function deleteTemplate(id: unknown): void {
  const list = read()
  if (!list.some((x) => x.id === id)) return
  write(list.filter((x) => x.id !== id))
}

/** Vuelve a poner las de serie que hayas borrado (las que sigan ahí no se tocan). */
export function restoreBuiltinTemplates(): TaskTemplate[] {
  const list = read()
  const have = new Set(list.map((x) => x.builtin).filter(Boolean))
  const now = Date.now()
  const add: Stored[] = Object.keys(builtinTemplates())
    .filter((b) => !have.has(b))
    .map((b, i) => ({ id: `builtin-${b}-${now.toString(36)}`, builtin: b, createdAt: now + i, updatedAt: now + i }))
  if (add.length) {
    if (list.length + add.length > MAX_TEMPLATES) throw new Error(tr('Como mucho {n} plantillas', { n: MAX_TEMPLATES }))
    write([...list, ...add])
  }
  return listTemplates()
}

/** Quita las plantillas de un proyecto que se ha eliminado. */
export function forgetProjectTemplates(projectId: string): void {
  const list = read()
  if (list.some((x) => x.projectId === projectId)) write(list.filter((x) => x.projectId !== projectId))
}

/**
 * La plantilla con la que se envía un mensaje: la elegida en la fila (templateId; el texto ya llega relleno) o la de
 * la orden «/nombre …» con la que empieza (se rellena aquí). null si no es ninguna.
 */
export function resolveTemplate(text: string, projectId: string, templateId?: unknown): { template: TaskTemplate; text: string } | null {
  if (templateId !== undefined && templateId !== null && templateId !== '') {
    const t = getTemplate(templateId)
    if (!t || (t.projectId && t.projectId !== projectId)) throw new Error(tr('Esa plantilla ya no existe'))
    return { template: t, text: text.trim() }
  }
  const m = matchTemplateCommand(text, listTemplates(), projectId)
  return m ? { template: m.template, text: fillFromArgs(m.template.prompt, m.args) } : null
}
