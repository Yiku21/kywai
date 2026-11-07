// Bandeja «Te necesita»: lo que espera una decisión o una acción tuya, en un solo sitio para el escritorio, la web y
// Órbita (que avisa con una notificación del móvil). Cada aviso trae sus botones; al pulsarlos se hace lo que dicen
// (aprobar un plan, deshacer una tarea, abrir Compartir pantalla…) y el aviso se cierra. Los avisos de una tarea se
// cierran solos cuando la tarea termina, y los de un plan cuando se aprueba o descarta.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { InboxAction, InboxItem, InboxKind } from '@shared/types'
import { emit } from './events'
import { tr } from '@shared/i18n'

/** Avisos que se guardan (los cerrados se van borrando, los más antiguos primero). */
const KEEP = 150
/** Un mismo permiso de macOS no se repite en este tiempo. */
const MAC_PERMISSION_DEDUP_MS = 10 * 60_000

let file = ''
let items: InboxItem[] = []
let saveTimer: NodeJS.Timeout | null = null
/** Lo que hace cada botón (lo registra quien sabe hacerlo: el orquestador, para aprobar planes o deshacer). */
const handlers = new Map<string, (item: InboxItem) => Promise<string | void> | string | void>()

export function initInbox(workspaceRoot: string): void {
  mkdirSync(workspaceRoot, { recursive: true })
  file = join(workspaceRoot, 'inbox.json')
  items = []
  try {
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { items?: InboxItem[] }
      if (Array.isArray(raw.items)) items = raw.items.filter((i) => i && typeof i.id === 'string' && typeof i.title === 'string')
    }
  } catch {
    items = []
  }
  // Al arrancar no hay tareas vivas: lo que dependía de una tarea en marcha ya no espera nada.
  const now = Date.now()
  for (const i of items) if (!i.resolvedAt && (i.kind === 'stalled' || i.kind === 'mac-permission')) Object.assign(i, { resolvedAt: now, resolution: tr('La app se reinició') })
}

function save(): void {
  if (!file) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      writeFileSync(file, JSON.stringify({ items }, null, 1), 'utf8')
    } catch (e) {
      console.warn('[cowork] no se pudo guardar la bandeja', e)
    }
  }, 300)
}

export function flushInbox(): void {
  if (!saveTimer || !file) return
  clearTimeout(saveTimer)
  saveTimer = null
  try {
    writeFileSync(file, JSON.stringify({ items }, null, 1), 'utf8')
  } catch {
    /* ignore */
  }
}

function changed(): void {
  // Se quitan los cerrados más antiguos si hay demasiados.
  if (items.length > KEEP) {
    const open = items.filter((i) => !i.resolvedAt)
    const closed = items.filter((i) => i.resolvedAt).sort((a, b) => b.createdAt - a.createdAt)
    items = [...open, ...closed.slice(0, Math.max(0, KEEP - open.length))].sort((a, b) => a.createdAt - b.createdAt)
  }
  save()
  emit({ kind: 'inbox.updated', items: openInbox() })
}

/** Los avisos abiertos, del más reciente al más antiguo. */
export function openInbox(): InboxItem[] {
  return items.filter((i) => !i.resolvedAt).sort((a, b) => b.createdAt - a.createdAt).map((i) => ({ ...i }))
}

/** Todos (abiertos y los últimos cerrados), del más reciente al más antiguo. */
export function listInbox(limit = 60): InboxItem[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map((i) => ({ ...i }))
}

export interface InboxInput {
  kind: InboxKind
  title: string
  detail?: string
  projectId?: string
  runId?: string
  taskId?: string
  messageId?: string
  agentId?: string
  actions?: InboxAction[]
  /** Clave para no repetir el mismo aviso mientras siga abierto (si existe, se actualiza). */
  key?: string
}

/** Añade un aviso (o actualiza el abierto con la misma clave) y lo anuncia. */
export function addInbox(input: InboxInput): InboxItem {
  const existing = input.key ? items.find((i) => !i.resolvedAt && i.key === input.key) : undefined
  if (existing) {
    Object.assign(existing, { title: input.title, detail: input.detail, actions: input.actions ?? existing.actions })
    changed()
    return { ...existing }
  }
  const item: InboxItem = {
    id: randomUUID(),
    kind: input.kind,
    title: input.title.slice(0, 300),
    ...(input.detail ? { detail: input.detail.slice(0, 2000) } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.messageId ? { messageId: input.messageId } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.key ? { key: input.key } : {}),
    actions: input.actions ?? [{ id: 'dismiss', label: tr('Entendido') }],
    createdAt: Date.now()
  }
  items.push(item)
  changed()
  return { ...item }
}

/** Cierra los avisos abiertos que cumplen la condición (p. ej. los de una tarea que ya terminó). */
export function resolveInboxWhere(pred: (i: InboxItem) => boolean, resolution: string): number {
  let n = 0
  const now = Date.now()
  for (const i of items) {
    if (i.resolvedAt || !pred(i)) continue
    i.resolvedAt = now
    i.resolution = resolution
    n++
  }
  if (n) changed()
  return n
}

/** Registra qué hace un botón (por su id: «approve», «undo»…). Sin manejador, el botón solo cierra el aviso. */
export function onInboxAction(actionId: string, fn: (item: InboxItem) => Promise<string | void> | string | void): void {
  handlers.set(actionId, fn)
}

/** Pulsar un botón de un aviso: hace lo suyo y lo cierra. Devuelve el texto para el usuario (si lo hay). */
export async function actInbox(id: string, actionId: string): Promise<{ item: InboxItem; message?: string }> {
  const item = items.find((i) => i.id === id)
  if (!item) throw new Error(tr('Ese aviso ya no existe'))
  const action = item.actions.find((a) => a.id === actionId)
  if (!action) throw new Error(tr('Esa acción no está en el aviso'))
  if (item.resolvedAt) return { item: { ...item }, message: tr('Ese aviso ya estaba resuelto') }
  const fn = handlers.get(actionId)
  const message = fn ? ((await fn(item)) ?? undefined) : undefined
  // «Abrir» (un enlace) no resuelve nada por sí mismo: el aviso sigue hasta que se confirme.
  if (!action.url) {
    item.resolvedAt = Date.now()
    item.resolution = message ? `${action.label}: ${message}` : action.label
    changed()
  }
  return { item: { ...item }, ...(message ? { message } : {}) }
}

/** Dirección para abrir Compartir pantalla con el servidor (la pone el acceso remoto cuando sabe su nombre). */
let screenUrl: () => string | null = () => null
export function setScreenShareUrl(fn: () => string | null): void {
  screenUrl = fn
}

const recentMac = new Map<string, number>()

/**
 * macOS pide un permiso de Privacidad (Documentos, Escritorio, Acceso total al disco…) en la pantalla del servidor y
 * un agente se queda esperando: solo se puede aceptar delante del Mac (o por Compartir pantalla). Lo llama quien lo
 * detecta (el registro de privacidad del sistema). `service` es el identificador de TCC
 * (p. ej. kTCCServiceSystemPolicyDocumentsFolder) y `serviceLabel` su nombre para el usuario («Documentos»).
 */
export function notifyMacPermission(p: { service: string; serviceLabel: string; taskId?: string; agentId?: string; projectId?: string; detail?: string }): void {
  const last = recentMac.get(p.service) ?? 0
  if (Date.now() - last < MAC_PERMISSION_DEDUP_MS && items.some((i) => !i.resolvedAt && i.key === `mac:${p.service}`)) return
  recentMac.set(p.service, Date.now())
  const url = screenUrl()
  addInbox({
    kind: 'mac-permission',
    key: `mac:${p.service}`,
    title: tr('macOS pide permiso para «{serviceLabel}» en la pantalla del servidor', { serviceLabel: p.serviceLabel }),
    detail:
      p.detail ??
      tr('Un agente está esperando a que se acepte el aviso de Privacidad de macOS, y solo se puede aceptar delante del Mac. Ábrelo con Compartir pantalla y pulsa «Permitir»; para que no vuelva a pasar, activa «Acceso total al disco» para kywai (Ajustes del Sistema → Privacidad y seguridad).'),
    taskId: p.taskId,
    agentId: p.agentId,
    projectId: p.projectId,
    actions: [...(url ? [{ id: 'open', label: tr('Abrir Compartir pantalla'), url }] : []), { id: 'dismiss', label: tr('Ya lo he aceptado') }]
  })
}
