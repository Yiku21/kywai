// Permisos que piden los agentes en el modo «Preguntarme antes» (⚙ → Ajustes → Permisos de los agentes).
//
// Lo que un agente no tiene permitido (un comando, instalar algo, usar internet…) no se deniega en silencio: se te
// pregunta en el chat y en «Te necesita» (y en Órbita, con notificación) con tres botones, igual que hace Claude Code
// en su terminal: Denegar, Permitir una vez y Permitir siempre en esta sesión. El agente espera la respuesta.
//
// «Esta sesión» es la de kywai: lo permitido así vale para ese agente en ese proyecto hasta que kywai se reinicie.
import type { PermissionAnswer } from '@shared/types'
import { tl, tr, type Msg } from '@shared/i18n'
import { addInbox, onInboxAction, resolveInboxWhere } from './inbox'

export interface PermissionRequest {
  projectId: string
  runId: string
  taskId: string
  taskTitle: string
  /** Quien la pide (el agente de la tarea; si es un becario, su jefe). */
  agentId: string
  agentName: string
  /** Qué quiere hacer, en pocas palabras («ejecutar un comando»). */
  action: Msg | string
  /** El detalle tal cual (el comando, la web, el archivo, o lo que explicó el agente). */
  detail: string
  /** Lo que recuerda «Permitir siempre en esta sesión» (p. ej. «Bash:npm» o «full»). */
  key: string
}

interface Pending {
  req: PermissionRequest
  resolve: (a: PermissionAnswer) => void
}

const pending = new Map<string, Pending>()
const allowed = new Set<string>()
let seq = 0

type Listener = (req: PermissionRequest, inboxId: string, state: 'pending' | PermissionAnswer) => void
let listener: Listener | null = null

/** El motor se entera de cada petición y de cada respuesta (para el chat y el estado del agente). */
export function onPermissionChange(fn: Listener): void {
  listener = fn
}

const sessionKey = (projectId: string, agentId: string, key: string): string => `${projectId}|${agentId}|${key}`

/** ¿Ya se le permitió esto a este agente en este proyecto «siempre en esta sesión»? */
export function sessionAllows(projectId: string, agentId: string, key: string): boolean {
  return allowed.has(sessionKey(projectId, agentId, key))
}

/**
 * Pregunta y espera la respuesta. Si ya estaba permitido en esta sesión, responde al momento sin preguntar. Si la
 * tarea termina o se detiene antes, la respuesta es «deny» (ver dropPermissions).
 */
export function askPermission(req: PermissionRequest): Promise<PermissionAnswer> {
  if (sessionAllows(req.projectId, req.agentId, req.key)) return Promise.resolve('session')
  const item = addInbox({
    kind: 'permission',
    key: `perm:${req.taskId}:${++seq}`,
    title: tl('{name} pide permiso para {action}', { name: req.agentName, action: req.action }),
    detail: [req.detail, '', tl('Tarea: «{title}». Espera tu respuesta.', { title: req.taskTitle })],
    projectId: req.projectId,
    runId: req.runId,
    taskId: req.taskId,
    agentId: req.agentId,
    actions: [
      { id: 'perm-deny', label: tl('Denegar') },
      { id: 'perm-once', label: tl('Permitir una vez') },
      { id: 'perm-session', label: tl('Permitir siempre en esta sesión') }
    ]
  })
  return new Promise((resolve) => {
    pending.set(item.id, { req, resolve })
    listener?.(req, item.id, 'pending')
  })
}

/** Contesta una petición (los botones del chat y de «Te necesita» acaban aquí). */
export function answerPermission(inboxId: string, answer: PermissionAnswer): string {
  const p = pending.get(inboxId)
  if (!p) throw new Error(tr('Esa petición de permiso ya no espera respuesta'))
  pending.delete(inboxId)
  if (answer === 'session') allowed.add(sessionKey(p.req.projectId, p.req.agentId, p.req.key))
  p.resolve(answer)
  listener?.(p.req, inboxId, answer)
  return answer === 'deny'
    ? tr('Denegado: {name} sigue sin eso', { name: p.req.agentName })
    : answer === 'once'
      ? tr('Permitido una vez: {name} sigue', { name: p.req.agentName })
      : tr('Permitido en esta sesión: {name} no volverá a preguntarlo en este proyecto', { name: p.req.agentName })
}

/** ¿La tarea está parada esperando que contestes un permiso? (entonces su silencio no es un cuelgue). */
export function waitingPermission(taskId: string): boolean {
  for (const p of pending.values()) if (p.req.taskId === taskId) return true
  return false
}

/** La tarea terminó o se detuvo: lo que esperaba respuesta se deniega y su aviso se cierra. */
export function dropPermissions(taskId: string, resolution: string): void {
  for (const [id, p] of [...pending]) {
    if (p.req.taskId !== taskId) continue
    pending.delete(id)
    p.resolve('deny')
    listener?.(p.req, id, 'deny')
  }
  resolveInboxWhere((i) => i.kind === 'permission' && i.taskId === taskId, resolution)
}

/** Solo para las pruebas: olvida lo permitido en la sesión. */
export function __clearPermissionsForChecks(): void {
  allowed.clear()
}

onInboxAction('perm-deny', (i) => answerPermission(i.id, 'deny'))
onInboxAction('perm-once', (i) => answerPermission(i.id, 'once'))
onInboxAction('perm-session', (i) => answerPermission(i.id, 'session'))

/** Lo que pide Claude con --permission-prompt-tool, dicho para una persona. */
export function describeToolRequest(toolName: string, input: Record<string, unknown>): { action: Msg; detail: string; key: string } {
  const s = (v: unknown): string => (typeof v === 'string' ? v : '')
  const cmd = s(input.command).trim()
  switch (toolName) {
    case 'Bash':
    case 'PowerShell': {
      // «Siempre en esta sesión» se recuerda por el programa (npm, pip, git…), como hace Claude Code.
      const program = cmd.split(/\s+/)[0]?.replace(/^.*[\\/]/, '') || toolName
      return { action: tl('ejecutar un comando'), detail: clip(cmd || toolName, 1200), key: `${toolName}:${program}` }
    }
    case 'WebFetch':
      return { action: tl('abrir una web'), detail: clip(s(input.url), 600), key: 'WebFetch' }
    case 'WebSearch':
      return { action: tl('buscar en internet'), detail: clip(s(input.query), 600), key: 'WebSearch' }
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { action: tl('cambiar un archivo'), detail: clip(s(input.file_path) || s(input.notebook_path), 600), key: `${toolName}:${s(input.file_path) || s(input.notebook_path)}` }
    default: {
      let json = ''
      try {
        json = JSON.stringify(input)
      } catch {
        /* sin detalle */
      }
      return { action: tl('usar la herramienta {tool}', { tool: toolName }), detail: clip(json, 600), key: toolName }
    }
  }
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
