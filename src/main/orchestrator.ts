import { randomUUID } from 'node:crypto'
import { promises as fsp, readFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import type {
  AgentConfig,
  AgentId,
  AgentRuntime,
  Artifact,
  Attachment,
  ChatMessage,
  Difficulty,
  Effort,
  MessageRating,
  PlanProposal,
  ProposedTask,
  SendMessageInput,
  Task,
  TaskChanges,
  TaskChangeSet,
  TaskVerification,
  TaskWork,
  Transfer,
  UsageCall,
  WorkFile
} from '@shared/types'
import { INTERRUPTED_ERROR, SUBAGENT_COLOR } from '@shared/defaults'
import { checkAgentPresence, isLocalProvider, isTextOnly, runAgent } from './agents'
import { safeModel, STALL_NOTICE } from './agents/spawn'
import type { TraceUpdate } from './agents/types'
import type { AgentErrorKind, RateLimitInfo, RunAgentResult } from './agents/types'
import { getConfig } from './config'
import { isPlanApproval, parsePlan, streamlinePlan, twoHandsPlan, wantsNoReview } from './plan'
import { allRuntimes, deleteRuntime, emit, getRuntime, setRuntime } from './events'
import * as store from './projects'
import { freshQuotaSnapshot, latestQuotas, recordUsage, refreshQuotas, setClaudeRateLimit } from './quota'
import { finishRunUsage, rateUsage, recordCall, resumeRunUsage, setRunQuota, startRunUsage, usageRuns } from './usageLog'
import { agentHistory, agentQualityFor, profileLines } from './agentProfile'
import { EFFORT_LABEL, effortFor, planEffortFor } from '@shared/modelCatalog'
import { finishTrace, getTaskTrace, startTrace, traceFiles, traceNote, traceUpdate } from './taskTrace'
import { withoutClosingNotes, workSteps } from '@shared/work'
import { lang, replyLanguage, tr, userLanguageName } from '@shared/i18n'
import { findNewFiles, imagePathFromTrace, PROGRESS_EVERY_MS, PROGRESS_LIMITS } from './progressFiles'
import { addMemory, KIND_LABEL, memoryPromptSections, parseMemoryNotes, planMemoryNotes, type MemoryNote } from './memory'
import { normalizeScope, outsideScope } from './scope'
import { coordinatorGuide, mentionsApp, taskGuideRules } from './coordinatorGuide'
import { projectBrief, testCommand } from './projectBrief'
import { lastSession, rememberSession, supportsResume } from './agentSessions'
import { hasGit, Shadow } from './checkpoints'
import { addInbox, onInboxAction, resolveInboxWhere } from './inbox'
import { captureUi, pagesToShoot, type UiShots } from './uiShots'
import { mcpForTask, MCP_SERVER_NAME, releaseMcp, type McpLaunch } from './coworkMcp'
import { repoInstructionLines } from './repoInstructions'
import { skillPromptLines } from './skills'
import { parseDirect } from '@shared/directMessage'

type Deliverable = 'file' | 'text'

interface TaskMeta {
  key: string
  deliverable: Deliverable
  /** Files the agent reported writing (relPaths). */
  touched: Set<string>
  retried: boolean
  /** Light model was rejected: run on the parent with its main model. */
  forceMainModel: boolean
  /** El modelo habitual también fue rechazado: usar el predeterminado del CLI. */
  forceCliDefault?: boolean
  /** Se retoma tras cerrarse la app a medias: puede haber archivos a medio hacer. */
  resumed?: boolean
  updateTimer?: NodeJS.Timeout
  /** Lo que el verificador pidió corregir (la tarea se repite una vez con esto). */
  fixRequest?: string
  /** Quién verificó y qué dijo, acumulado entre rondas. */
  verification?: TaskVerification
  /** Sesión del CLI con la que trabajó el último intento (para retomarla al corregir o continuar). */
  sessionId?: string
  /** Sesión anterior que este intento retoma (Claude --resume, Codex exec resume). */
  resume?: string
  /** Mensaje del chat donde el agente va contando lo que hace (uno por intento) y desde cuándo. */
  work?: ChatMessage
  workSince?: number
  workTimer?: NodeJS.Timeout
  /** Instantánea de la carpeta antes del primer intento (para ver y deshacer lo que hizo la tarea). */
  before?: string
  /** Copia aparte donde trabaja porque otra tarea ya usaba la carpeta del proyecto (se integra al terminar). */
  copy?: { dir: string; key: string; base: string }
  /** Veces que se le pidió resolver un choque al integrar su copia. */
  mergeFixes?: number
}

interface Run {
  id: string
  projectId: string
  userText: string
  attachments: Attachment[]
  /** Ruta de cada adjunto vista desde la carpeta donde trabajan los agentes. */
  attPaths: Map<string, string>
  plannerId?: AgentId
  planning: boolean
  /** Contrato común del plan cuando varias tareas se hacen a la vez (archivos de cada una, funciones, rutas…). */
  contract?: string
  /** La lanzó una rutina (su nombre): nadie la está escribiendo en ese momento. */
  routine?: string
  /** Nuevo plan para uno que el coordinador propuso y al que el usuario respondió con cambios. */
  revision?: { request: string; tasks: ProposedTask[]; feedback: string; memory: MemoryNote[] }
  taskIds: string[]
  meta: Map<string, TaskMeta>
  controllers: Map<string, AbortController>
  planController?: AbortController
  cancelled: boolean
  finished: boolean
}

interface PlannedTask {
  key: string
  title: string
  description: string
  agentId: AgentId
  difficulty: Difficulty
  dependsOn: string[]
  deliverable: Deliverable
  /** Cuándo está hecha (lo comprueba el propio agente). */
  acceptance: string
  /** Archivos o carpetas que puede crear o modificar. */
  files: string[]
  /** Continúa o corrige lo que ese mismo agente hizo en la petición anterior: retoma su sesión del CLI. */
  continues: boolean
}

const BLOCKING_KINDS: AgentErrorKind[] = ['auth', 'quota', 'missing', 'offline']
const BECARIO_LINGER_MS = 4000
const INTEGRATION_MS = 2500
/** Si retomar una sesión falla enseguida y sin tocar nada, se repite la tarea desde cero antes de darla por fallida. */
const RESUME_RETRY_MS = 120_000

const runs = new Map<string, Run>()
const tasks = new Map<string, Task>()
/** agentId → running taskId (one running task per agent). */
const busy = new Map<AgentId, string>()
/** Offline reason from presence checks (CLI missing, Ollama down...). */
const presence = new Map<AgentId, string | null>()
/** Agentes apartados por un error de sesión o de cuota, hasta 'until'. */
const blocked = new Map<AgentId, { kind: AgentErrorKind; reason: string; until: number }>()
/** Tiempo que un agente queda apartado; después se vuelve a probar (la cuota se renueva, la sesión se reinicia). */
const BLOCK_MS: Partial<Record<AgentErrorKind, number>> = { quota: 15 * 60_000, auth: 3 * 60_000 }
/** Descanso del coordinador tras fallar: mientras tanto planifica el siguiente de la lista. */
const COORDINATOR_REST_MS = 10 * 60_000
const subagents = new Map<AgentId, AgentConfig>()
const stationUse = new Map<string, AgentId>()
const becarioCounter = new Map<AgentId, number>()
const planningAgents = new Map<AgentId, string>()
const integrating = new Set<AgentId>()
/** Agents whose light model the CLI rejected this session (e.g. not available for the account). */
const lightModelBroken = new Set<AgentId>()
/** Agentes cuyo modelo para lo difícil rechazó el CLI en esta sesión. */
const strongModelBroken = new Set<AgentId>()
/** Last known file state per project, to detect new/modified artifacts. */
const projectKnown = new Map<string, Map<string, store.FileStamp>>()

// ---------- instantáneas y copias aisladas (ver checkpoints.ts) ----------

const shadows = new Map<string, Shadow>()
/** Tarea que está usando la carpeta del proyecto (las demás que empiezan a la vez trabajan en una copia aparte). */
const mainOccupant = new Map<string, string>()
/** Las órdenes de git de un mismo proyecto van de una en una (comparten índice). */
const gitLocks = new Map<string, Promise<unknown>>()
let checkpointsOff = false

function dataRoot(): string {
  return resolve(store.projectsRoot(), '..')
}

function shadowFor(projectId: string): Shadow {
  let sh = shadows.get(projectId)
  if (!sh) {
    // Si la carpeta de trabajo contiene los datos de AI Cowork (la propia app), no entran en las instantáneas.
    const rel = relative(store.workRoot(projectId), dataRoot()).replace(/\\/g, '/')
    const extra = rel && !rel.startsWith('..') && !isAbsolute(rel) ? [`/${rel}/`] : []
    sh = new Shadow(join(dataRoot(), 'instantaneas', `${projectId}.git`), extra)
    shadows.set(projectId, sh)
  }
  return sh
}

function withGit<T>(projectId: string, fn: (sh: Shadow) => Promise<T>): Promise<T> {
  const prev = gitLocks.get(projectId) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(() => fn(shadowFor(projectId)))
  gitLocks.set(projectId, next.catch(() => undefined))
  return next
}

async function checkpointsReady(): Promise<boolean> {
  return !checkpointsOff && (await hasGit())
}

/** Sigue ocupando la carpeta: empezó en ella y no ha terminado (puede estar esperando una corrección). */
function occupies(projectId: string, exceptTaskId: string): Task | null {
  const id = mainOccupant.get(projectId)
  if (!id || id === exceptTaskId) return null
  const t = tasks.get(id)
  if (t && (t.status === 'running' || t.status === 'pending' || t.status === 'blocked')) return t
  mainOccupant.delete(projectId)
  return null
}

/**
 * Dónde trabaja una tarea que cambia archivos. Si nadie usa la carpeta del proyecto, en ella (y se guarda una
 * instantánea de antes). Si otra tarea ya la está usando, en una copia aparte hecha de la carpeta tal como está:
 * así dos agentes nunca se pisan, y al terminar sus cambios se integran (fusión a tres bandas). Sin git, o si la
 * carpeta es enorme, como antes: todos en la carpeta, sin deshacer.
 */
async function prepareWorkplace(run: Run, t: Task, meta: TaskMeta, exec: AgentConfig): Promise<string> {
  const main = store.workRoot(run.projectId)
  if (isTextOnly(exec.provider) || !(await checkpointsReady())) return main
  if (meta.copy) return meta.copy.dir
  try {
    const other = occupies(run.projectId, t.id)
    if (!other) {
      mainOccupant.set(run.projectId, t.id)
      if (!meta.before) meta.before = await withGit(run.projectId, (sh) => sh.snapshot(main, 'main', tr('Antes de «{title}»', { title: t.title })))
      return main
    }
    const key = `copia-${t.id}`
    const dir = join(dataRoot(), 'aislado', t.id)
    const base = await withGit(run.projectId, async (sh) => {
      const c = await sh.snapshot(main, 'main', tr('Copia para «{title}»', { title: t.title }))
      await sh.makeCopy(c, dir, main, key)
      return c
    })
    meta.copy = { dir, key, base }
    meta.before = base
    traceNote(t.id, tr('Trabaja en una copia aparte de la carpeta: «{title}» la está usando. Al terminar, sus cambios se integran en la carpeta del proyecto.', { title: other.title }))
    return dir
  } catch (e) {
    console.warn('[cowork] instantáneas desactivadas para este proyecto', e)
    traceNote(t.id, tr('Sin instantáneas (no se podrá deshacer esta tarea): {message}', { message: (e as Error).message }))
    if ((e as Error).message.includes('demasiados archivos')) return main
    return main
  }
}

/**
 * Al terminar bien una tarea: guarda la instantánea de después y, si trabajó en una copia, integra sus cambios en
 * la carpeta del proyecto. Si al integrar choca con lo que otra tarea cambió a la vez, los archivos quedan con las
 * marcas <<<<<<< y la misma tarea vuelve a su agente para resolverlo (una vez). Devuelve false si la tarea vuelve
 * a la cola.
 */
async function settleChanges(run: Run, t: Task, exec: AgentConfig, parent: AgentConfig | null): Promise<boolean> {
  const meta = run.meta.get(t.id)!
  if (!meta.before) return true
  const main = store.workRoot(run.projectId)
  try {
    if (meta.copy) {
      const copy = meta.copy
      const after = await withGit(run.projectId, (sh) => sh.snapshot(copy.dir, copy.key, `«${t.title}» terminada`))
      const r = await withGit(run.projectId, (sh) => sh.apply(main, 'main', copy.base, after, { strict: false, label: `Integrar «${t.title}»` }))
      // La tarea que usa la carpeta no debe llevarse estos cambios como suyos al deshacer: se suman a su «antes».
      const occ = occupies(run.projectId, t.id)
      const occMeta = occ ? runs.get(occ.runId)?.meta.get(occ.id) : undefined
      if (occMeta?.before && !occMeta.copy) {
        const before = occMeta.before
        occMeta.before = await withGit(run.projectId, async (sh) => (await sh.merge3(copy.base, before, after, false)).commit).catch(() => before)
      }
      // Lo que se integró ya está visto: no es de la tarea que trabaja en la carpeta.
      const known = projectKnown.get(run.projectId)
      if (known) {
        const now = await store.snapshotFiles(main)
        for (const rel of r.applied) {
          const stamp = now.get(rel)
          if (stamp && !meta.touched.has(rel)) known.set(rel, stamp)
        }
      }
      for (const rel of r.applied) meta.touched.add(rel)
      withGit(run.projectId, async (sh) => sh.removeCopy(copy.dir, copy.key)).catch(() => undefined)
      meta.copy = undefined
      await recordChanges(run.projectId, t, copy.base, after, true, r.conflicts)
      if (r.conflicts.length) {
        traceNote(t.id, tr('Al integrar chocó con otra tarea en: {v1}', { v1: r.conflicts.join(', ') }), true)
        if ((meta.mergeFixes ?? 0) === 0) {
          meta.mergeFixes = 1
          requeueForMerge(run, t, exec, parent, r.conflicts)
          return false
        }
        addInbox({
          kind: 'conflict',
          key: `conflict:${t.id}`,
          title: tr('Choques sin resolver al integrar «{title}»', { title: t.title }),
          detail: tr('Estos archivos llevan marcas <<<<<<< de dos tareas que cambiaron lo mismo a la vez: {v1}.', { v1: r.conflicts.join(', ') }),
          projectId: run.projectId,
          runId: run.id,
          taskId: t.id,
          actions: [{ id: 'dismiss', label: tr('Lo reviso yo') }]
        })
        systemMessage(run, tr('Aviso: al integrar «{title}» quedaron choques sin resolver en {v2} (llevan marcas <<<<<<<). Revísalos.', { title: t.title, v2: r.conflicts.map((f) => `\`${f}\``).join(', ') }), 'error')
      }
      return true
    }
    const after = await withGit(run.projectId, (sh) => sh.snapshot(main, 'main', `«${t.title}» terminada`))
    await recordChanges(run.projectId, t, meta.before, after, false, [])
  } catch (e) {
    console.warn('[cowork] no se pudieron guardar los cambios de la tarea', e)
    traceNote(t.id, tr('No se pudo guardar la instantánea de después: {message}', { message: (e as Error).message }))
  }
  return true
}

async function recordChanges(projectId: string, t: Task, before: string, after: string, isolated: boolean, conflicts: string[]): Promise<void> {
  if (before === after) return
  const ch = await withGit(projectId, async (sh) => {
    await sh.keep(`tareas/${t.id}/antes`, before)
    await sh.keep(`tareas/${t.id}/despues`, after)
    return sh.changes(before, after, 1)
  })
  if (!ch.files.length) return
  const changes: TaskChanges = {
    before,
    after,
    files: ch.files.length,
    add: ch.files.reduce((n, f) => n + f.add, 0),
    del: ch.files.reduce((n, f) => n + f.del, 0),
    ...(isolated ? { isolated } : {}),
    ...(conflicts.length ? { conflicts: conflicts.slice(0, 30) } : {})
  }
  t.changes = changes
  traceNote(t.id, tr('Cambios guardados: {files} archivo{v2} (+{add} −{del}). Se pueden ver y deshacer desde el chat.', { files: changes.files, v2: changes.files === 1 ? '' : 's', add: changes.add, del: changes.del }))
}

/** Al integrar su copia chocó con otra tarea: el mismo agente resuelve las marcas en la carpeta del proyecto. */
function requeueForMerge(run: Run, t: Task, exec: AgentConfig, parent: AgentConfig | null, conflicts: string[]): void {
  const meta = run.meta.get(t.id)!
  const owner = parent ?? exec
  meta.fixRequest = [
    `Hiciste la tarea en una copia aparte porque otra tarea usaba la carpeta a la vez. Al integrar tus cambios en la carpeta del proyecto, estos archivos chocaron con lo que cambió la otra tarea: ${conflicts.join(', ')}.`,
    'Llevan marcas de conflicto: <<<<<<< actual (lo que hay ahora en la carpeta) / ======= / >>>>>>> tarea (lo tuyo). Resuelve cada choque conservando la intención de los dos cambios, quita todas las marcas y comprueba que el proyecto sigue funcionando (pruebas si las hay).'
  ].join('\n')
  meta.forceMainModel = true
  // La sesión del CLI era de la copia (otra carpeta): no se puede retomar.
  meta.resume = undefined
  meta.before = undefined
  closeWork(run, t, 'stopped', { text: tr('Al integrar «{title}» chocó con otra tarea en {v2}; {name} lo resuelve.', { title: t.title, v2: conflicts.map((f) => `\`${f}\``).join(', '), name: owner.name }) })
  if (parent) {
    removeBecario(exec.id)
    t.agentId = parent.id
  }
  setRuntime(owner.id, { activity: 'idle', taskId: undefined, lastActivity: tr('Resolviendo choques: {title}', { title: t.title }) })
  t.status = 'pending'
  t.startedAt = undefined
  t.lastActivity = undefined
  t.progress = undefined
  pushTask(t)
}

/** Copias que quedaron de tareas canceladas o fallidas: se descartan (sus instantáneas se quedan). */
function dropCopies(run: Run): void {
  for (const m of run.meta.values()) {
    const copy = m.copy
    if (!copy) continue
    m.copy = undefined
    withGit(run.projectId, async (sh) => sh.removeCopy(copy.dir, copy.key)).catch(() => undefined)
  }
}

function findStoredTask(projectId: string, taskId: string): Task {
  const live = tasks.get(taskId)
  if (live && live.projectId === projectId) return live
  const t = store.getProject(projectId).tasks.find((x) => x.id === taskId)
  if (!t) throw new Error(tr('No encuentro esa tarea'))
  return t
}

export async function getTaskChanges(projectId: string, taskId: string): Promise<TaskChangeSet> {
  const t = findStoredTask(projectId, taskId)
  if (!t.changes) return { files: [], patch: '', truncated: false }
  const ch = t.changes
  const set = await withGit(projectId, (sh) => sh.changes(ch.before, ch.after))
  return { ...set, ...(ch.undoneAt ? { undoneAt: ch.undoneAt } : {}) }
}

/** «Deshacer esta tarea»: aplica al revés sus cambios sobre lo que hay ahora; si algo choca, no toca nada. */
export async function undoTask(projectId: string, taskId: string): Promise<string> {
  const t = findStoredTask(projectId, taskId)
  const ch = t.changes
  if (!ch) return tr('Esta tarea no cambió archivos (o se hizo antes de que existieran las instantáneas): no hay nada que deshacer.')
  if (ch.undoneAt) return tr('Esta tarea ya se deshizo.')
  if (t.status === 'running') return tr('La tarea sigue trabajando: detenla antes de deshacerla.')
  const main = store.workRoot(projectId)
  const r = await withGit(projectId, (sh) => sh.apply(main, 'main', ch.after, ch.before, { strict: true, label: `Deshacer «${t.title}»` }))
  if (r.conflicts.length) {
    return tr('No he deshecho nada: después de «{title}» se cambiaron las mismas líneas de {v2}. Pide al equipo que lo revierta a mano o deshaz antes lo que vino después.', { title: t.title, v2: r.conflicts.map((f) => `\`${f}\``).join(', ') })
  }
  t.changes = { ...ch, undoneAt: Date.now() }
  store.upsertTask(t)
  emit({ kind: 'task.upsert', task: JSON.parse(JSON.stringify(t)) as Task })
  // Lo que se restauró ya no es nuevo para nadie.
  const known = projectKnown.get(projectId)
  if (known) {
    const now = await store.snapshotFiles(main)
    for (const rel of r.applied) {
      const stamp = now.get(rel)
      if (stamp) known.set(rel, stamp)
      else known.delete(rel)
    }
  }
  const text = tr('Deshecha «{title}»: {length} archivo{v3} vuelven a como estaban antes ({v4}{v5}).', { title: t.title, length: r.applied.length, v3: r.applied.length === 1 ? '' : 's', v4: r.applied.slice(0, 8).map((f) => `\`${f}\``).join(', '), v5: r.applied.length > 8 ? '…' : '' })
  const m: ChatMessage = { id: randomUUID(), projectId, runId: t.runId, author: { type: 'system' }, text, createdAt: Date.now(), tone: 'normal' }
  pushMessage(m)
  return text
}

/** Al arrancar no hay tareas vivas: las copias aisladas que quedaran de antes sobran. */
async function clearStaleCopies(): Promise<void> {
  try {
    if (store.projectsRoot()) await fsp.rm(join(dataRoot(), 'aislado'), { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}
let ollamaTimer: NodeJS.Timeout | null = null
let runner: typeof runAgent = runAgent
let presenceCheck: typeof checkAgentPresence = checkAgentPresence

/** Only for the offline checks in src/main/__checks__ (fake CLIs). */
/** Solo para las comprobaciones: olvida los bloqueos de los escenarios anteriores. */
/** Vuelve a dar por disponibles los agentes de un proveedor (p. ej. tras guardar una clave de API nueva). */
export function unblockProvider(provider: AgentConfig['provider']): void {
  for (const a of baseAgents()) {
    if (a.provider !== provider || !blocked.delete(a.id)) continue
    if (!busy.has(a.id)) setRuntime(a.id, { activity: 'idle', reason: undefined, lastActivity: tr('Disponible de nuevo') })
  }
}

export function __clearBlocksForChecks(): void {
  blocked.clear()
}

export function __setBackendsForChecks(b: { run?: typeof runAgent; presence?: typeof checkAgentPresence }): void {
  if (b.run) runner = b.run
  if (b.presence) presenceCheck = b.presence
}
let quotaRefreshTimer: NodeJS.Timeout | null = null

// ---------- agents ----------

function baseAgents(): AgentConfig[] {
  return getConfig().agents.filter((a) => a.enabled && !a.isSubagent)
}

/** Agentes que pueden recibir tareas (el coordinador solo planifica). */
function workers(): AgentConfig[] {
  return baseAgents().filter((a) => !a.plannerOnly)
}

export function allAgents(): AgentConfig[] {
  return [...baseAgents(), ...subagents.values()]
}

function findAgent(id: AgentId | undefined): AgentConfig | undefined {
  if (!id) return undefined
  return subagents.get(id) ?? getConfig().agents.find((a) => a.id === id)
}

function agentName(id: AgentId | undefined): string {
  const a = findAgent(id)
  if (a) return a.name
  return id && id.includes('-becario-') ? 'Becario' : (id ?? 'Agente')
}

/** Bloqueo vigente de un agente; al caducar, el agente vuelve a estar disponible. */
function isBlocked(id: AgentId): boolean {
  const b = blocked.get(id)
  if (!b) return false
  if (Date.now() < b.until) return true
  blocked.delete(id)
  if (!busy.has(id)) setRuntime(id, { activity: 'idle', reason: undefined, lastActivity: tr('Disponible de nuevo') })
  return false
}

function offlineReason(a: AgentConfig): string | null {
  const id = a.isSubagent && a.parentId ? a.parentId : a.id
  return (isBlocked(id) ? blocked.get(id)?.reason : null) ?? presence.get(id) ?? null
}

function usable(a: AgentConfig | undefined): boolean {
  if (!a || !a.enabled) return false
  return offlineReason(a) == null
}

/** A live agent id to animate from (removed becarios hand over to their parent). */
function liveOwner(t: Task): AgentId {
  if (subagents.has(t.agentId) || getConfig().agents.some((a) => a.id === t.agentId)) return t.agentId
  return t.assignedBy ?? t.agentId
}

function ownerOf(a: AgentConfig): AgentConfig {
  return (a.isSubagent && findAgent(a.parentId)) || a
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Lo que cuenta de una fortaleza o de «lo que conviene no darle»: lo de antes de los dos puntos o del paréntesis.
 * La explicación de después nombra a otros agentes («Claude y Codex son mejores») y palabras que salen en casi
 * cualquier encargo, y sumaba o restaba puntos por casualidad.
 */
function headOf(s: string): string {
  return s.split(/[:(]/)[0]
}

/** Best available agent for a piece of work, by strengths/role keyword overlap. */
function bestAgentFor(text: string, exclude: Set<AgentId> = new Set()): AgentConfig | null {
  const cfg = getConfig()
  const hay = norm(text)
  const cands = workers().filter((a) => usable(a) && !exclude.has(a.id))
  if (!cands.length) return null
  const score = (a: AgentConfig): number => {
    let s = 0
    for (const st of a.strengths) {
      const n = norm(headOf(st))
      if (hay.includes(n)) s += 2
      else if (n.split(/\s+/).some((w) => w.length >= 4 && hay.includes(w.slice(0, Math.max(4, w.length - 2))))) s += 1
    }
    for (const w of norm(a.role).split(/[^a-z0-9]+/)) if (w.length >= 5 && hay.includes(w)) s += 0.5
    // Lo que conviene no darle.
    for (const av of a.avoid ?? []) {
      if (norm(headOf(av)).split(/[^a-z0-9]+/).some((w) => w.length >= 6 && hay.includes(w.slice(0, w.length - 2)))) s -= 1.5
    }
    // Poca cuota: mejor otro que sirva igual.
    const q = latestQuotas().find((x) => x.id === a.quotaGroupId)
    if (q?.remainingPct != null) s -= q.remainingPct <= cfg.thresholds.alert ? 2 : q.remainingPct <= cfg.thresholds.warn ? 1 : 0
    if (isTextOnly(a.provider)) s -= 0.25
    return s
  }
  const order = (a: AgentConfig): number => {
    const i = cfg.plannerOrder.indexOf(a.id)
    return i < 0 ? 99 : i
  }
  return [...cands].sort((a, b) => score(b) - score(a) || order(a) - order(b))[0]
}

// ---------- emit helpers (store + event together) ----------

function pushTask(t: Task): void {
  const meta = runs.get(t.runId)?.meta.get(t.id)
  if (meta?.updateTimer) {
    clearTimeout(meta.updateTimer)
    meta.updateTimer = undefined
  }
  store.upsertTask(t)
  emit({ kind: 'task.upsert', task: JSON.parse(JSON.stringify(t)) as Task })
}

/** Throttled task.upsert for activity/progress changes (≤ 1/s per task). */
function taskDirty(t: Task): void {
  const meta = runs.get(t.runId)?.meta.get(t.id)
  if (!meta || meta.updateTimer) return
  meta.updateTimer = setTimeout(() => {
    meta.updateTimer = undefined
    if (t.status === 'running') pushTask(t)
  }, 1000)
}

function pushMessage(m: ChatMessage): void {
  store.upsertMessage(m)
  emit({ kind: 'message.upsert', message: { ...m } })
  if (m.proposal) planInbox(m)
}

// ---------- bandeja «Te necesita» (ver inbox.ts) ----------

/** Un plan que espera tu visto bueno sale en la bandeja; al aprobarlo, cambiarlo o descartarlo, se cierra. */
function planInbox(m: ChatMessage): void {
  const p = m.proposal!
  if (p.status !== 'pending') {
    resolveInboxWhere((i) => i.kind === 'plan' && i.messageId === m.id, p.status === 'approved' ? 'Aprobado' : p.status === 'rejected' ? 'Descartado' : 'Cambiado')
    return
  }
  const who = m.author.type === 'agent' ? agentName(m.author.agentId) : 'El coordinador'
  addInbox({
    kind: 'plan',
    key: `plan:${m.id}`,
    title: tr('{who} propone un plan de {length} tarea{v3}: {oneLine}', { who, length: p.tasks.length, v3: p.tasks.length === 1 ? '' : 's', oneLine: oneLine(p.request, 120) }),
    detail: p.tasks.map((t) => `• ${t.title} (${agentName(t.agentId)})`).join('\n'),
    projectId: m.projectId,
    runId: m.runId,
    messageId: m.id,
    actions: [
      { id: 'approve', label: tr('Aprobar') },
      { id: 'reject', label: tr('Descartar') }
    ]
  })
}

/** Al dejar de trabajar una tarea, sus avisos de «esperando» ya no esperan nada. */
function taskInboxDone(t: Task): void {
  resolveInboxWhere((i) => i.taskId === t.id && (i.kind === 'stalled' || i.kind === 'mac-permission'), tr('La tarea siguió o terminó'))
}

/** Lo que hace cada botón de la bandeja que toca al equipo. */
function registerInboxActions(): void {
  onInboxAction('approve', async (i) => {
    if (!i.projectId || !i.messageId) return tr('Ese plan ya no existe')
    await approvePlan(i.projectId, i.messageId)
    return tr('Plan aprobado: el equipo empieza')
  })
  onInboxAction('reject', (i) => {
    if (!i.projectId || !i.messageId) return tr('Ese plan ya no existe')
    rejectPlan(i.projectId, i.messageId)
    return tr('Plan descartado')
  })
  onInboxAction('undo', (i) => (i.projectId && i.taskId ? undoTask(i.projectId, i.taskId) : tr('No sé qué tarea deshacer')))
}

/**
 * Al terminar una petición: si la respuesta te pregunta algo, sale como pregunta; si no, como «terminado» (para que
 * el móvil avise). Solo queda uno por proyecto: el de la petición más reciente.
 */
function runInbox(run: Run, ok: boolean): void {
  try {
    const st = store.getProject(run.projectId)
    const msgs = st.messages.filter((m) => m.runId === run.id && m.author.type === 'agent' && !!m.text.trim() && !m.proposal)
    const last = msgs[msgs.length - 1]
    resolveInboxWhere((i) => i.projectId === run.projectId && (i.kind === 'done' || i.kind === 'question'), tr('Hay una petición más reciente'))
    const q = last ? asksUser(last.text) : null
    const who = last?.author.type === 'agent' ? agentName(last.author.agentId) : 'El equipo'
    if (q) {
      addInbox({ kind: 'question', title: tr('{who} te pregunta ({name})', { who, name: st.project.name }), detail: q, projectId: run.projectId, runId: run.id, messageId: last!.id, actions: [{ id: 'dismiss', label: tr('Lo contesto en el chat') }] })
      return
    }
    addInbox({
      kind: 'done',
      title: `${ok ? 'Terminado' : 'Terminado con fallos'} (${st.project.name}): ${oneLine(run.userText, 100)}`,
      detail: last ? oneLine(last.text, 400) : undefined,
      projectId: run.projectId,
      runId: run.id,
      actions: [{ id: 'dismiss', label: tr('Entendido') }]
    })
  } catch (e) {
    console.warn('[cowork] bandeja: no se pudo anotar el final de la petición', e)
  }
}

registerInboxActions()

/** La respuesta del equipo termina preguntándote algo (¿sigo con…?, ¿cuál prefieres?): sale en la bandeja. */
export function asksUser(text: string): string | null {
  const paras = text.trim().split(/\n\s*\n/)
  const last = paras[paras.length - 1]?.trim() ?? ''
  if (!last.endsWith('?') || last.length > 600) return null
  return last.replace(/^[-*>\s]+/, '')
}

function agentMessage(run: Run, agentId: AgentId, text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  const m: ChatMessage = {
    id: randomUUID(),
    projectId: run.projectId,
    runId: run.id,
    author: { type: 'agent', agentId },
    text,
    createdAt: Date.now(),
    ...extra
  }
  pushMessage(m)
  return m
}

/** El mensaje de la tarea en el chat: aparece al empezar y va contando lo que hace el agente. */
function openWork(run: Run, t: Task, owner: AgentConfig): void {
  const meta = run.meta.get(t.id)
  if (!meta) return
  meta.workSince = Date.now()
  meta.work = agentMessage(run, owner.id, '', { work: { taskId: t.id, title: t.title, status: 'running', steps: [] } })
}

function workSnapshot(meta: TaskMeta, taskId: string): Pick<TaskWork, 'steps' | 'hidden' | 'totals'> {
  const { steps, hidden, totals } = workSteps(getTaskTrace(taskId).filter((e) => e.ts >= (meta.workSince ?? 0)))
  return { steps, ...(hidden ? { hidden } : {}), ...(totals ? { totals } : {}) }
}

/**
 * Mientras la tarea trabaja, mira cada pocos segundos si ha creado capturas o documentos, o si ha abierto imágenes
 * (donde estén), y los cuenta en su mensaje del chat para ver por dónde va sin esperar al final.
 */
function watchProgress(run: Run, t: Task, dir: string, since: number): { stop: () => void; seen: (u: TraceUpdate) => void } {
  let stopped = false
  const reported = new Set<string>()
  const counts = { images: 0, docs: 0 }
  /** Imágenes que el agente ha abierto o creado, donde estén (ruta absoluta → cuándo las vio). */
  const looked = new Map<string, number>()
  let copied = 0
  const publish = (files: WorkFile[]): void => {
    if (stopped || !files.length) return
    traceFiles(t.id, files)
    workDirty(run, t)
  }
  /** Una imagen de fuera del proyecto (p. ej. una captura en /tmp) se copia a su carpeta interna para poder enseñarla. */
  const lookedAt = async (): Promise<WorkFile[]> => {
    const out: WorkFile[] = []
    for (const [abs, at] of [...looked]) {
      looked.delete(abs)
      try {
        const st = await fsp.stat(abs)
        const key = `${abs}@${Math.round(st.mtimeMs)}`
        if (!st.isFile() || reported.has(key) || st.size < PROGRESS_LIMITS.minImageBytes || st.size > PROGRESS_LIMITS.maxImageBytes) continue
        if (Date.now() - st.mtimeMs < PROGRESS_LIMITS.settleMs) {
          looked.set(abs, at)
          continue
        }
        if (counts.images >= PROGRESS_LIMITS.imagesPerTask) continue
        reported.add(key)
        let relPath = store.toRelPath(dir, abs)
        if (!relPath) {
          // Fuera del proyecto: una copia en su carpeta interna (nunca en la del usuario).
          const folder = join(store.projectDir(run.projectId), 'avances', t.id.slice(0, 8))
          await fsp.mkdir(folder, { recursive: true })
          copied++
          const name = `${String(copied).padStart(2, '0')}-${basename(abs)}`
          await fsp.copyFile(abs, join(folder, name))
          relPath = `avances/${t.id.slice(0, 8)}/${name}`
        }
        reported.add(relPath)
        counts.images++
        out.push({ relPath, name: basename(abs), image: true, size: st.size })
        if (out.length >= PROGRESS_LIMITS.imagesPerTick) break
      } catch {
        /* ya no está o no se puede leer */
      }
    }
    return out
  }
  void (async () => {
    while (!stopped) {
      await new Promise((r) => setTimeout(r, PROGRESS_EVERY_MS))
      if (stopped || run.cancelled) return
      try {
        const viewed = await lookedAt()
        const now = await store.snapshotFiles(dir)
        const found = findNewFiles(now, projectKnown.get(run.projectId), since, Date.now(), reported, counts)
        publish([...viewed, ...found])
      } catch {
        /* una vuelta sin datos: la siguiente lo intenta */
      }
    }
  })()
  return {
    stop: () => {
      stopped = true
    },
    seen: (u) => {
      const path = imagePathFromTrace(u)
      if (path) looked.set(path, Date.now())
    }
  }
}

/** Lo nuevo que cuenta el agente sale en su mensaje (como mucho una vez por segundo). */
function workDirty(run: Run, t: Task): void {
  const meta = run.meta.get(t.id)
  if (!meta?.work || meta.workTimer) return
  meta.workTimer = setTimeout(() => {
    meta.workTimer = undefined
    const m = meta.work
    if (!m?.work || m.work.status !== 'running') return
    m.work = { taskId: m.work.taskId, title: m.work.title, status: 'running', ...workSnapshot(meta, t.id) }
    pushMessage(m)
  }, 1000)
}

/**
 * Cierra el mensaje de la tarea con su resultado o lo que pasó. `trimClosing`: el texto final del agente pasa a ser el
 * del mensaje, así que sus últimas notas (que son ese texto) no se repiten. null si la tarea no tenía mensaje.
 */
function closeWork(run: Run, t: Task, status: TaskWork['status'], patch: Partial<ChatMessage>, trimClosing = false): ChatMessage | null {
  const meta = run.meta.get(t.id)
  const m = meta?.work
  if (!meta || !m?.work) return null
  if (meta.workTimer) clearTimeout(meta.workTimer)
  meta.workTimer = undefined
  meta.work = undefined
  const snap = workSnapshot(meta, t.id)
  m.work = { taskId: m.work.taskId, title: m.work.title, status, ...snap, steps: trimClosing ? withoutClosingNotes(snap.steps) : snap.steps }
  Object.assign(m, patch)
  pushMessage(m)
  return m
}

function systemMessage(run: Run, text: string, tone: ChatMessage['tone'] = 'normal'): void {
  pushMessage({ id: randomUUID(), projectId: run.projectId, runId: run.id, author: { type: 'system' }, text, createdAt: Date.now(), tone })
}

function transfer(t: Omit<Transfer, 'id' | 'createdAt'>): void {
  emit({ kind: 'transfer.started', transfer: { ...t, id: randomUUID(), createdAt: Date.now() } })
}

function clip(s: string | undefined, n: number): string {
  const t = (s ?? '').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

function oneLine(s: string | undefined, n: number): string {
  return clip((s ?? '').replace(/\s+/g, ' '), n)
}

let rateTimer: NodeJS.Timeout | null = null
function onRateLimit(info: RateLimitInfo): void {
  if (info.provider === 'claude') setClaudeRateLimit(info)
  if (rateTimer) return
  rateTimer = setTimeout(() => {
    rateTimer = null
    void refreshQuotas()
  }, 1500)
}

let quotaRefreshCodex = false
function scheduleQuotaRefresh(codex: boolean): void {
  quotaRefreshCodex = quotaRefreshCodex || codex
  if (quotaRefreshTimer) clearTimeout(quotaRefreshTimer)
  // Codex writes its rollout file right after exiting: give it a moment.
  quotaRefreshTimer = setTimeout(() => {
    quotaRefreshTimer = null
    const c = quotaRefreshCodex
    quotaRefreshCodex = false
    void refreshQuotas({ codex: c })
  }, quotaRefreshCodex ? 1200 : 300)
}

// ---------- presence ----------

function applyPresence(a: AgentConfig, reason: string | null): void {
  const prev = presence.get(a.id)
  presence.set(a.id, reason)
  if (busy.has(a.id) || isBlocked(a.id) || planningAgents.has(a.id)) return
  const rt = getRuntime(a.id)
  if (reason) {
    if (rt.activity !== 'offline' || rt.reason !== reason) setRuntime(a.id, { activity: 'offline', reason, taskId: undefined, waitingFor: undefined })
  } else if (prev || rt.activity === 'offline') {
    setRuntime(a.id, { activity: 'idle', reason: undefined })
  }
}

export async function checkPresence(fresh = false, onlyOllama = false): Promise<void> {
  await Promise.all(
    baseAgents()
      .filter((a) => !onlyOllama || isLocalProvider(a.provider))
      .map(async (a) => {
        try {
          applyPresence(a, await presenceCheck(a, fresh))
        } catch (e) {
          console.error('[cowork] presence check failed', a.id, e)
        }
      })
  )
}

export function initOrchestrator(): void {
  for (const a of baseAgents()) getRuntime(a.id)
  void clearStaleCopies()
  // Al arrancar, comprobación completa: entre otras cosas enciende el servidor de LM Studio si está apagado.
  void checkPresence(true)
  if (ollamaTimer) clearInterval(ollamaTimer)
  ollamaTimer = setInterval(() => void checkPresence(false, true), 30_000)
}

export function runtimeSnapshot(): AgentRuntime[] {
  const ids = new Set(allAgents().map((a) => a.id))
  for (const id of ids) getRuntime(id)
  return allRuntimes().filter((r) => ids.has(r.agentId))
}

function blockAgent(a: AgentConfig, kind: AgentErrorKind, reason: string, ms?: number): void {
  const target = ownerOf(a)
  if (kind === 'offline' || kind === 'missing') {
    presence.set(target.id, reason) // re-checked periodically / on refresh
  } else {
    blocked.set(target.id, { kind, reason, until: Date.now() + (ms ?? BLOCK_MS[kind] ?? 5 * 60_000) })
  }
  if (!busy.has(target.id)) {
    setRuntime(target.id, {
      activity: kind === 'offline' || kind === 'missing' ? 'offline' : 'error',
      reason,
      taskId: undefined,
      waitingFor: undefined
    })
  }
}

// ---------- sub-agents ----------

function freeSubStation(): string | null {
  const st = getConfig().stations.find((s) => s.forSubagents && !stationUse.has(s.id))
  return st ? st.id : null
}

function spawnBecario(parent: AgentConfig, stationId: string, model: string): AgentConfig {
  const n = (becarioCounter.get(parent.id) ?? 0) + 1
  becarioCounter.set(parent.id, n)
  const light = !!parent.lightModel && model === parent.lightModel
  const b: AgentConfig = {
    id: `${parent.id}-becario-${n}`,
    name: 'Becario',
    provider: parent.provider,
    model: model || parent.model,
    modelLabel: light ? (parent.lightModelLabel ?? parent.lightModel ?? parent.modelLabel) : parent.modelLabel,
    color: SUBAGENT_COLOR,
    stationId,
    role: tr('Sub-agente de {name}', { name: parent.name }),
    strengths: [],
    enabled: true,
    quotaGroupId: parent.quotaGroupId,
    isSubagent: true,
    parentId: parent.id
  }
  subagents.set(b.id, b)
  stationUse.set(stationId, b.id)
  emit({ kind: 'agent.spawned', agent: { ...b } })
  setRuntime(b.id, { activity: 'idle', location: 'station' })
  scheduleQuotaRefresh(false)
  return b
}

function removeBecario(id: AgentId, delayMs = BECARIO_LINGER_MS): void {
  const doRemove = (): void => {
    const b = subagents.get(id)
    if (!b) return
    if (busy.has(id)) return // got new work meanwhile (shouldn't happen)
    subagents.delete(id)
    if (stationUse.get(b.stationId) === id) stationUse.delete(b.stationId)
    deleteRuntime(id)
    emit({ kind: 'agent.removed', agentId: id })
    scheduleQuotaRefresh(false)
    schedule()
  }
  if (delayMs > 0) setTimeout(doRemove, delayMs)
  else doRemove()
}

// ---------- public API ----------

/** «/model» y sus variantes, como en el cuadro de texto del escritorio y de Órbita. */
const MODEL_COMMAND = /^\/(model|models|modelo|modelos)$/i

/**
 * Una petición al chat. Con `routine`, la lanza una rutina (src/main/routines.ts): es una petición normal (plan,
 * agentes, verificación), pero el mensaje lleva la marca de la rutina y no cuenta como respuesta a un plan pendiente.
 * La marca solo la pone el motor: no llega desde la interfaz ni desde la API.
 */
export async function sendMessage(input: SendMessageInput, opts: { routine?: { id: string; name: string } } = {}): Promise<{ runId: string }> {
  const routine = opts.routine
  const projectId = input?.projectId
  const st = store.getProject(projectId)
  const text = typeof input.text === 'string' ? input.text.slice(0, 50_000) : ''
  // Se comprueba antes del primer await: dos reintentos concurrentes reutilizan la misma ejecución.
  if (input.clientMessageId) {
    const existing = st.messages.find((m) => m.author.type === 'user' && m.clientMessageId === input.clientMessageId)
    if (existing?.runId) {
      if (existing.text !== text) throw new Error('clientMessageId ya se usó con otro texto')
      return { runId: existing.runId }
    }
  }
  // Adjuntos que ya estaban en el proyecto (subidos desde el móvil): los mismos objetos, sin copiarlos ni repetirlos.
  const reused: Attachment[] = []
  for (const id of Array.isArray(input.attachmentIds) ? input.attachmentIds : []) {
    const a = st.attachments.find((x) => x.id === id)
    if (!a) throw new Error(tr('No existe el adjunto {String}', { String: String(id) }))
    if (!reused.includes(a)) reused.push(a)
  }
  const paths = Array.isArray(input.filePaths) ? input.filePaths.filter((p): p is string => typeof p === 'string') : []
  const atts = [...reused, ...store.copyAttachments(projectId, paths)]
  if (!text.trim() && !atts.length) throw new Error(tr('El mensaje está vacío'))

  // «/model» es de la app (abre la lista de modelos de Hermes), no un encargo: si llega como mensaje (desde una
  // versión de Órbita que aún no lo abre), se contesta aquí sin gastar una llamada a Hermes.
  if (!routine && !atts.length && MODEL_COMMAND.test(text.trim())) {
    const runId = randomUUID()
    const base = { projectId, runId, createdAt: Date.now() }
    pushMessage({ ...base, id: randomUUID(), ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}), author: { type: 'user' }, text })
    pushMessage({
      ...base,
      id: randomUUID(),
      author: { type: 'system' },
      text: tr('«/model» abre la lista de modelos de Hermes para cambiarlo: escríbelo en el chat del ordenador o en Órbita (actualízala en Ajustes → Órbita), o pulsa a Hermes en el espacio → «Modelo».')
    })
    return { runId }
  }

  // «@Agente …» o «/directo Agente …»: el texto va tal cual a ese agente, sin pasar por Hermes.
  const direct = parseDirect(text, baseAgents())
  if (direct && 'error' in direct) {
    throw new Error(tr('No hay ningún agente «{name}». Escribe @ y elige uno de la lista, o usa el nombre que sale en su ficha.', { name: direct.error }))
  }
  if (direct) return sendDirect(st, direct.agentId, direct.text, atts, input.clientMessageId, routine)

  // Hay un plan esperando tu visto bueno: un «sí» lo aprueba; cualquier otra cosa son cambios a ese plan.
  // Una rutina no responde a planes pendientes: su petición es aparte.
  const pending = routine ? undefined : pendingProposal(projectId)
  if (pending && !atts.length && isPlanApproval(text)) {
    pushMessage({
      id: randomUUID(),
      projectId,
      runId: pending.runId,
      ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
      author: { type: 'user' },
      text,
      createdAt: Date.now()
    })
    await approvePlan(projectId, pending.id)
    return { runId: pending.runId! }
  }

  const runId = randomUUID()
  pushMessage({
    id: randomUUID(),
    projectId,
    runId,
    ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
    author: { type: 'user' },
    text,
    createdAt: Date.now(),
    attachments: atts.length ? atts : undefined,
    ...(routine ? { routine: { id: routine.id, name: routine.name } } : {})
  })
  let userText = text.trim() || '(El usuario solo ha enviado archivos adjuntos.)'
  let revision: Run['revision']
  const runAtts = [...atts]
  if (pending?.proposal) {
    const p = pending.proposal
    revision = { request: p.request, tasks: p.tasks, feedback: userText, memory: p.memory ?? [] }
    userText = `${p.request}\n\nCambios que pidió al revisar el plan: ${userText}`
    for (const id of p.attachmentIds ?? []) {
      const a = st.attachments.find((x) => x.id === id)
      if (a && !runAtts.includes(a)) runAtts.unshift(a)
    }
    pushMessage({ ...pending, proposal: { ...p, status: 'revised', decidedAt: Date.now() } })
  }
  const run: Run = {
    id: runId,
    projectId,
    userText,
    revision,
    ...(routine ? { routine: routine.name } : {}),
    attachments: runAtts,
    attPaths: store.stageAttachments(projectId, runAtts),
    planning: true,
    taskIds: [],
    meta: new Map(),
    controllers: new Map(),
    cancelled: false,
    finished: false
  }
  runs.set(runId, run)
  emit({ kind: 'run.started', runId, projectId })
  // Registro de consumo: la petición y la cuota de cada suscripción al empezar.
  startRunUsage({ runId, projectId, projectName: st.project.name, request: run.userText })
  void freshQuotaSnapshot(10_000).then((snap) => setRunQuota(runId, 'before', snap))

  await baseline(run)

  void executeRun(run).catch((e) => {
    console.error('[cowork] run failed', e)
    if (!run.finished && !run.cancelled) {
      systemMessage(run, tr('Error interno del motor: {message}', { message: (e as Error).message }), 'error')
      void finishRun(run, false)
    }
  })
  return { runId }
}

/**
 * Mensaje directo a un agente («@Qwen …»): una sola tarea para él con tu texto tal cual. Sin plan de Hermes, sin
 * verificador, sin relevo a otro agente si falla y sin resumen final: su respuesta sale en el chat sin retocar.
 * Si el anterior mensaje tuyo en el proyecto también fue directo a ese agente, retoma su sesión del CLI (si la
 * admite), para que la conversación siga.
 */
async function sendDirect(
  st: ReturnType<typeof store.getProject>,
  agentId: AgentId,
  text: string,
  atts: Attachment[],
  clientMessageId: string | undefined,
  routine: { id: string; name: string } | undefined
): Promise<{ runId: string }> {
  const agent = findAgent(agentId)!
  const projectId = st.project.id
  if (!text && !atts.length) throw new Error(tr('Escribe el mensaje para {name} después de su nombre.', { name: agent.name }))
  const lastMine = [...st.messages].reverse().find((m) => m.author.type === 'user')
  const continues = lastMine?.direct?.agentId === agent.id
  const runId = randomUUID()
  pushMessage({
    id: randomUUID(),
    projectId,
    runId,
    ...(clientMessageId ? { clientMessageId } : {}),
    author: { type: 'user' },
    text: text || tr('(Solo archivos adjuntos)'),
    createdAt: Date.now(),
    attachments: atts.length ? atts : undefined,
    direct: { agentId: agent.id, name: agent.name },
    ...(routine ? { routine: { id: routine.id, name: routine.name } } : {})
  })
  const run: Run = {
    id: runId,
    projectId,
    userText: text,
    ...(routine ? { routine: routine.name } : {}),
    attachments: atts,
    attPaths: store.stageAttachments(projectId, atts),
    planning: false,
    taskIds: [],
    meta: new Map(),
    controllers: new Map(),
    cancelled: false,
    finished: false
  }
  const t: Task = {
    id: randomUUID(),
    projectId,
    runId,
    title: tr('Mensaje directo: {text}', { text: oneLine(text, 60) || tr('archivos adjuntos') }),
    description: text,
    agentId: agent.id,
    dependsOn: [],
    status: 'pending',
    difficulty: 'medium',
    createdAt: Date.now(),
    artifactIds: [],
    deliverable: 'text',
    direct: true,
    ...(continues ? { continues: true } : {})
  }
  run.meta.set(t.id, { key: t.id, deliverable: 'text', touched: new Set(), retried: false, forceMainModel: false })
  runs.set(runId, run)
  emit({ kind: 'run.started', runId, projectId })
  startRunUsage({ runId, projectId, projectName: st.project.name, request: text })
  await baseline(run)
  tasks.set(t.id, t)
  run.taskIds.push(t.id)
  pushTask(t)
  schedule()
  return { runId }
}

/** Archivos que ya había, para no darlos por resultados nuevos (sin pisar lo que mide otra petición en marcha). */
async function baseline(run: Run): Promise<void> {
  const projectBusy = [...runs.values()].some((r) => r !== run && r.projectId === run.projectId && !r.finished)
  if (projectBusy && projectKnown.has(run.projectId)) return
  try {
    projectKnown.set(run.projectId, await store.snapshotFiles(store.workRoot(run.projectId)))
  } catch {
    /* ignore */
  }
}

/** El plan más reciente del proyecto que espera tu visto bueno. */
function pendingProposal(projectId: string): ChatMessage | undefined {
  const msgs = store.getProject(projectId).messages
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.proposal?.status === 'pending' && m.runId && !runs.has(m.runId)) return m
  }
  return undefined
}

/** Un plan propuesto y guardado en su mensaje (sigue ahí aunque se reinicie la app). */
function proposalMessage(projectId: string, messageId: string): ChatMessage & { proposal: PlanProposal; runId: string } {
  const m = store.getProject(projectId).messages.find((x) => x.id === messageId)
  if (!m?.proposal || !m.runId) throw new Error(tr('No se encontró ese plan'))
  if (m.proposal.status === 'approved' || runs.has(m.runId)) throw new Error(tr('Ese plan ya está en marcha'))
  if (m.proposal.status !== 'pending') throw new Error(tr('Ese plan ya no está pendiente'))
  return m as ChatMessage & { proposal: PlanProposal; runId: string }
}

/**
 * Visto bueno al plan que propuso el coordinador: se crean sus tareas y empiezan. Funciona también después de
 * reiniciar la app, porque el plan está guardado en su mensaje.
 */
export async function approvePlan(projectId: string, messageId: string): Promise<void> {
  const msg = proposalMessage(projectId, messageId)
  const p = msg.proposal
  const st = store.getProject(projectId)
  const atts = (p.attachmentIds ?? []).map((id) => st.attachments.find((a) => a.id === id)).filter((a): a is Attachment => !!a)
  const run: Run = {
    id: msg.runId,
    projectId,
    userText: p.request,
    attachments: atts,
    attPaths: store.stageAttachments(projectId, atts),
    plannerId: msg.author.type === 'agent' ? msg.author.agentId : undefined,
    planning: false,
    contract: p.contract && p.tasks.length > 1 ? p.contract : undefined,
    taskIds: [],
    meta: new Map(),
    controllers: new Map(),
    cancelled: false,
    finished: false
  }
  // Si desde que se propuso se ha apagado algún agente, su tarea la hace el más adecuado de los que hay.
  const planned: PlannedTask[] = p.tasks.map((t) => {
    const agent = findAgent(t.agentId)
    const fits = !!agent && !agent.isSubagent && !agent.plannerOnly && usable(agent)
    return {
      key: t.key,
      title: t.title,
      description: t.description,
      agentId: fits ? t.agentId : (bestAgentFor(`${t.title} ${t.description}`)?.id ?? t.agentId),
      difficulty: t.difficulty,
      dependsOn: t.dependsOn,
      deliverable: t.deliverable,
      acceptance: t.acceptance ?? '',
      files: t.files ?? [],
      continues: t.continues === true
    }
  })
  runs.set(run.id, run)
  emit({ kind: 'run.started', runId: run.id, projectId })
  resumeRunUsage(run.id)
  await baseline(run)
  const created = createTasks(run, planned)
  const noted = noteMemory(run, agentName(run.plannerId), p.memory ?? [])
  pushMessage({
    ...msg,
    text: msg.text + noted,
    taskIds: created.map((t) => t.id),
    ...(run.contract ? { contract: run.contract } : {}),
    proposal: { ...p, status: 'approved', decidedAt: Date.now() }
  })
  for (const t of created) {
    tasks.set(t.id, t)
    run.taskIds.push(t.id)
    pushTask(t)
  }
  schedule()
}

/**
 * 👍/👎 del usuario en un resultado del chat (null lo quita). Queda en el mensaje (se ve en todas partes), en el
 * registro de consumo (en la tarea del mensaje, o en la petición si es la respuesta final) y, desde ahí, en la ficha
 * que el coordinador ve de cada agente: lo que mide si el trabajo sirvió, no solo si la llamada terminó bien.
 */
export function rateMessage(projectId: string, messageId: string, rating: MessageRating | null): void {
  const st = store.getProject(projectId)
  const m = st.messages.find((x) => x.id === messageId)
  if (!m) throw new Error(tr('No se encontró ese mensaje'))
  if (m.author.type !== 'agent') throw new Error(tr('Solo se valoran los resultados de los agentes'))
  if (rating !== 'up' && rating !== 'down' && rating !== null) throw new Error(tr('Valoración no válida'))
  const next: ChatMessage = { ...m }
  if (rating) next.rating = rating
  else delete next.rating
  pushMessage(next)
  const taskId = m.work?.taskId
  if (m.runId) rateUsage(m.runId, taskId, rating)
}

/** Descarta el plan propuesto: no se hace nada. */
export function rejectPlan(projectId: string, messageId: string): void {
  const msg = proposalMessage(projectId, messageId)
  pushMessage({ ...msg, proposal: { ...msg.proposal, status: 'rejected', decidedAt: Date.now() } })
}

/**
 * Retoma una petición que se interrumpió al cerrar la app (por ejemplo al actualizar): sus tareas a medias
 * vuelven a la cola con el mismo agente, sabiendo que puede haber archivos a medio hacer; lo terminado se
 * queda como está y sirve de resultado previo para lo que dependía de ello.
 */
export async function resumeRun(projectId: string, runId: string): Promise<void> {
  if (runs.has(runId)) throw new Error(tr('Esa petición ya está en marcha'))
  const st = store.getProject(projectId)
  const all = st.tasks.filter((t) => t.runId === runId)
  const todo = all.filter((t) => t.status === 'cancelled' && t.error === INTERRUPTED_ERROR)
  if (!todo.length) throw new Error(tr('No hay tareas interrumpidas que reanudar en esa petición'))
  const userMsg = st.messages.find((m) => m.runId === runId && m.author.type === 'user')
  const planMsg = st.messages.find((m) => m.runId === runId && !!m.taskIds?.length)
  const atts = userMsg?.attachments ?? []
  const run: Run = {
    id: runId,
    projectId,
    userText: userMsg?.text.trim() || all.map((t) => t.title).join('; '),
    attachments: atts,
    attPaths: store.stageAttachments(projectId, atts),
    plannerId: planMsg?.author.type === 'agent' ? planMsg.author.agentId : undefined,
    planning: false,
    contract: planMsg?.contract,
    taskIds: [],
    meta: new Map(),
    controllers: new Map(),
    cancelled: false,
    finished: false
  }
  for (const t of all) {
    tasks.set(t.id, t)
    run.taskIds.push(t.id)
    run.meta.set(t.id, {
      key: t.id,
      deliverable: t.deliverable ?? 'file',
      touched: new Set(),
      retried: false,
      forceMainModel: false,
      resumed: todo.includes(t)
    })
  }
  runs.set(runId, run)
  // Lo hacía un becario que ya no existe: vuelve a su jefe (o, sin él, a quien mejor lo haga al programar).
  for (const t of todo) {
    if (!findAgent(t.agentId) && t.assignedBy && findAgent(t.assignedBy)) t.agentId = t.assignedBy
    t.status = 'blocked'
    t.error = undefined
    t.startedAt = undefined
    t.finishedAt = undefined
    t.lastActivity = undefined
    t.progress = undefined
    pushTask(t)
  }
  emit({ kind: 'run.started', runId, projectId })
  resumeRunUsage(runId)
  try {
    projectKnown.set(projectId, await store.snapshotFiles(store.workRoot(projectId)))
  } catch {
    /* ignore */
  }
  systemMessage(run, tr('Reanudando la petición: {v1} a medias ({v2}).', { v1: todo.length === 1 ? tr('queda 1 tarea') : tr('quedan {length} tareas', { length: todo.length }), v2: todo.map((t) => `«${t.title}»`).join(', ') }))
  schedule()
}

/**
 * Lo contrario de reanudar: el usuario no quiere seguir con lo que quedó en pausa. Sus tareas interrumpidas pasan a
 * canceladas por el usuario y dejan de ofrecerse (y de avisar); lo terminado se queda como está.
 */
export function discardRun(projectId: string, runId: string): void {
  if (runs.has(runId)) throw new Error(tr('Esa petición ya está en marcha'))
  const todo = store.getProject(projectId).tasks.filter((t) => t.runId === runId && t.status === 'cancelled' && t.error === INTERRUPTED_ERROR)
  if (!todo.length) throw new Error(tr('No hay tareas interrumpidas que reanudar en esa petición'))
  for (const t of todo) {
    t.error = tr('Cancelada por el usuario')
    pushTask(t)
  }
  pushMessage({
    id: randomUUID(),
    projectId,
    runId,
    author: { type: 'system' },
    text: tr('Has quitado lo que quedaba en pausa ({v1}): no se reanudará.', { v1: todo.map((t) => `«${t.title}»`).join(', ') }),
    createdAt: Date.now(),
    tone: 'normal'
  })
}

export function cancelRun(runId: string, reason: 'user' | 'quit' | 'pause' = 'user'): void {
  const run = runs.get(runId)
  if (!run || run.finished) return
  run.cancelled = true
  run.planController?.abort()
  for (const c of run.controllers.values()) c.abort()
  const now = Date.now()
  for (const tid of run.taskIds) {
    const t = tasks.get(tid)
    if (!t || !['pending', 'blocked', 'running'].includes(t.status)) continue
    const wasRunning = t.status === 'running'
    t.status = 'cancelled'
    t.error = reason !== 'user' ? INTERRUPTED_ERROR : tr('Cancelada por el usuario')
    t.finishedAt = now
    pushTask(t)
    if (wasRunning) {
      if (busy.get(t.agentId) === t.id) busy.delete(t.agentId)
      if (subagents.has(t.agentId)) removeBecario(t.agentId, 0)
      else if (!isBlocked(t.agentId)) setRuntime(t.agentId, { activity: 'idle', taskId: undefined, lastActivity: tr('Cancelada'), context: undefined })
    }
  }
  if (run.plannerId && planningAgents.get(run.plannerId) === run.id) {
    planningAgents.delete(run.plannerId)
    if (!busy.has(run.plannerId) && !isBlocked(run.plannerId)) setRuntime(run.plannerId, { activity: 'idle', lastActivity: tr('Cancelada') })
  }
  systemMessage(run, reason === 'quit' ? tr('Ejecución interrumpida al cerrar la app.') : reason === 'pause' ? tr('Has detenido la ejecución. Puedes reanudar sus tareas pendientes.') : tr('Has cancelado la ejecución.'))
  run.finished = true
  // Al cerrar la app no se consulta la cuota (no da tiempo y dejaría procesos sueltos).
  usageEnded(run, 'cancelled', reason !== 'quit')
  emit({ kind: 'run.finished', runId: run.id, projectId: run.projectId, ok: false })
  cleanupRun(run)
  schedule()
}

export function cancelAll(): void {
  for (const id of [...runs.keys()]) cancelRun(id, 'quit')
  if (ollamaTimer) clearInterval(ollamaTimer)
  ollamaTimer = null
}

function cleanupRun(run: Run): void {
  for (const m of run.meta.values()) if (m.updateTimer) clearTimeout(m.updateTimer)
  dropCopies(run)
  for (const tid of run.taskIds) if (mainOccupant.get(run.projectId) === tid) mainOccupant.delete(run.projectId)
  runs.delete(run.id)
  // Keep task objects only while some other active run could depend on them (never across runs).
  for (const tid of run.taskIds) tasks.delete(tid)
  updateWaiting()
}

// ---------- planning ----------

async function executeRun(run: Run): Promise<void> {
  const plan = await planRun(run)
  if (run.cancelled) return
  run.planning = false
  if (!plan) {
    void finishRun(run, false)
    return
  }
  const { planner, reply, planned, contract, memory } = plan
  // Con tareas, primero tu visto bueno: el plan se enseña y nada empieza hasta que lo apruebes.
  if (planned.length && getConfig().planApproval) {
    proposePlan(run, planner, reply, planned, contract, memory)
    return
  }
  // El contrato solo tiene sentido si hay varias tareas que se reparten el trabajo.
  if (contract && planned.length > 1) run.contract = contract
  const created = createTasks(run, planned)
  const replyText =
    (reply.trim() ||
      (created.length ? (created.length === 1 ? tr('He repartido el trabajo en 1 tarea.') : tr('He repartido el trabajo en {n} tareas.', { n: created.length })) : tr('Hecho.'))) +
    noteMemory(run, planner.name, memory)
  agentMessage(run, planner.id, replyText, {
    ...(created.length ? { taskIds: created.map((t) => t.id) } : {}),
    ...(run.contract ? { contract: run.contract } : {})
  })

  for (const t of created) {
    tasks.set(t.id, t)
    run.taskIds.push(t.id)
    pushTask(t)
  }
  if (!created.length) {
    void finishRun(run, true)
    return
  }
  schedule()
}

/** Las tareas del plan, con sus dependencias ya como ids (aún sin publicar ni programar). */
function createTasks(run: Run, planned: PlannedTask[]): Task[] {
  const now = Date.now()
  const keyToId = new Map<string, string>()
  for (const p of planned) keyToId.set(p.key, randomUUID())
  return planned.map((p) => {
    const id = keyToId.get(p.key)!
    const deps = p.dependsOn.map((k) => keyToId.get(k)).filter((x): x is string => !!x)
    const t: Task = {
      id,
      projectId: run.projectId,
      runId: run.id,
      title: p.title,
      description: p.description,
      agentId: p.agentId,
      dependsOn: deps,
      status: deps.length ? 'blocked' : 'pending',
      difficulty: p.difficulty,
      createdAt: now,
      artifactIds: [],
      acceptance: p.acceptance || undefined,
      files: p.files.length ? p.files : undefined,
      deliverable: p.deliverable,
      ...(p.continues ? { continues: true } : {})
    }
    run.meta.set(id, { key: p.key, deliverable: p.deliverable, touched: new Set(), retried: false, forceMainModel: false })
    return t
  })
}

/** Lo que el usuario decidió o pidió queda en la memoria del proyecto (confirmado: son sus palabras). Texto para el chat. */
function noteMemory(run: Run, via: string, notes: MemoryNote[]): string {
  const noted = notes
    .map((n) =>
      addMemory(run.projectId, { kind: n.kind, text: n.text }, { status: 'confirmed', by: 'user', byName: 'Tú', via, runId: run.id, replaces: n.replaces })
    )
    .filter((e) => !!e)
  return noted.length ? tr('\n\n*Anotado en la memoria del proyecto:* {v1}.', { v1: noted.map((e) => `${tr(KIND_LABEL[e.kind])} «${e.text}»`).join('; ') }) : ''
}

/**
 * El plan espera tu visto bueno: se enseña en el chat (qué hará cada agente) y la petición se queda ahí hasta que
 * lo apruebes, le pidas cambios o lo descartes. Queda guardado en su mensaje, así que sobrevive a un reinicio.
 */
function proposePlan(run: Run, planner: AgentConfig, reply: string, planned: PlannedTask[], contract: string, notes: MemoryNote[]): void {
  // Lo que dijo en el mensaje original sigue valiendo aunque haya pedido cambios al plan.
  const memory = [...(run.revision?.memory ?? []), ...notes].filter((n, i, all) => all.findIndex((x) => x.text === n.text) === i)
  const proposal: PlanProposal = {
    status: 'pending',
    tasks: planned.map((p) => ({
      key: p.key,
      title: p.title,
      description: p.description,
      agentId: p.agentId,
      difficulty: p.difficulty,
      dependsOn: p.dependsOn,
      deliverable: p.deliverable,
      ...(p.acceptance ? { acceptance: p.acceptance } : {}),
      ...(p.files.length ? { files: p.files } : {}),
      ...(p.continues ? { continues: true } : {})
    })),
    request: run.userText,
    ...(run.attachments.length ? { attachmentIds: run.attachments.map((a) => a.id) } : {}),
    ...(contract && planned.length > 1 ? { contract } : {}),
    ...(memory.length ? { memory } : {})
  }
  const n = planned.length
  agentMessage(run, planner.id, reply.trim() || `Te propongo ${n === 1 ? 'una tarea' : `${n} tareas`}. ¿Empezamos?`, { proposal })
  run.finished = true
  // La cuota se mide al terminar el trabajo de verdad (si lo apruebas, la petición sigue con el mismo registro).
  usageEnded(run, 'ok', false)
  emit({ kind: 'run.finished', runId: run.id, projectId: run.projectId, ok: true })
  cleanupRun(run)
  schedule()
}

/** Pueden ver las imágenes adjuntas al planificar (las abren o las reciben). Hermes solo lee texto. */
const SEES_IMAGES = new Set<AgentConfig['provider']>(['claude', 'codex', 'gemini'])

/** ¿Puede abrir las capturas adjuntas? Los de fábrica que ven imágenes y los de catálogo que lo declaran. */
const seesImages = (a: AgentConfig): boolean => SEES_IMAGES.has(a.provider) || a.cli?.seesImages === true

/** Quién planifica: el primero libre de la lista; con capturas adjuntas, antes uno que pueda verlas. */
function pickPlanner(tried: Set<AgentId>, images = false): AgentConfig | null {
  const cfg = getConfig()
  const cands = cfg.plannerOrder
    .map((id) => cfg.agents.find((a) => a.id === id))
    .filter((a): a is AgentConfig => !!a && a.enabled && !a.isSubagent && usable(a) && !tried.has(a.id))
  const pick = (list: AgentConfig[]): AgentConfig | null => list.find((a) => !busy.has(a.id) && !planningAgents.has(a.id)) ?? list[0] ?? null
  const seeing = cands.filter((a) => seesImages(a))
  return images && seeing.length ? pick(seeing) : pick(cands)
}

async function planRun(
  run: Run
): Promise<{ planner: AgentConfig; reply: string; planned: PlannedTask[]; contract: string; memory: MemoryNote[] } | null> {
  const tried = new Set<AgentId>()
  const failures: string[] = []
  const st = store.getProject(run.projectId)
  for (;;) {
    if (run.cancelled) return null
    const planner = pickPlanner(tried, imageAttachments(run).length > 0)
    if (!planner) {
      const detail = failures.length ? `\n\n${failures.map((f) => `- ${f}`).join('\n')}` : ''
      systemMessage(
        run,
        failures.length
          ? tr('Ningún agente pudo planificar el trabajo.{detail}', { detail })
          : tr('No hay ningún agente disponible para planificar. Revisa que los CLI estén instalados y con la sesión iniciada.'),
        'error'
      )
      return null
    }
    tried.add(planner.id)
    run.plannerId = planner.id
    const sharedAgent = busy.has(planner.id) || planningAgents.has(planner.id)
    if (!sharedAgent) {
      planningAgents.set(planner.id, run.id)
      setRuntime(planner.id, {
        activity: 'thinking',
        lastActivity: tr('Planificando el trabajo'),
        taskId: undefined,
        waitingFor: undefined,
        reason: undefined,
        context: undefined
      })
    }
    const ctrl = new AbortController()
    run.planController = ctrl
    const planStart = Date.now()
    const res = await runner({
      agent: planner,
      model: planner.model,
      effort: planEffortFor(planner.provider),
      prompt: buildPlanPrompt(run, planner),
      cwd: store.workRoot(run.projectId),
      mode: 'plan',
      images: imageAttachments(run),
      signal: ctrl.signal,
      onActivity: (text, kind) => {
        if (!sharedAgent && kind === 'tool') setRuntime(planner.id, { lastActivity: text })
      },
      onUsage: (u) => {
        if (sharedAgent || u.contextUsed == null) return
        const prev = getRuntime(planner.id).context
        setRuntime(planner.id, { context: { used: u.contextUsed ?? prev?.used ?? 0, capacity: u.contextCapacity ?? prev?.capacity } })
      },
      onRateLimit
    })
    run.planController = undefined
    if (planningAgents.get(planner.id) === run.id) planningAgents.delete(planner.id)
    logCall(run, 'plan', planner, planner.model, res, planStart, undefined, planEffortFor(planner.provider))
    if (run.cancelled) return null
    recordUsage(planner.quotaGroupId, res.usage.input + res.usage.output, 1)
    scheduleQuotaRefresh(planner.provider === 'codex')

    if (!res.ok) {
      const kind = res.errorKind ?? 'failed'
      const msg = res.errorMessage ?? tr('Error desconocido')
      failures.push(`${planner.name}: ${msg}`)
      if (BLOCKING_KINDS.includes(kind)) blockAgent(planner, kind, msg)
      // Un coordinador que falla (lento, sin respuesta) se aparta un rato: las siguientes peticiones no lo esperan.
      else if (planner.plannerOnly) blockAgent(planner, kind, msg, COORDINATOR_REST_MS)
      else if (!sharedAgent) setRuntime(planner.id, { activity: 'error', reason: msg, lastActivity: tr('No pudo planificar') })
      agentMessage(run, planner.id, tr('No pude planificar: {msg}', { msg }), { tone: 'error' })
      continue
    }

    const parsed = parsePlan(res.text)
    // Sin el JSON pedido (modelo débil o con poco contexto, como Hermes con un modelo local pequeño),
    // planifica el siguiente de la lista; si no hay otro, su texto se usa como respuesta.
    if (!parsed.valid && pickPlanner(tried, imageAttachments(run).length > 0)) {
      failures.push(tr('{name}: no devolvió un plan válido', { name: planner.name }))
      if (planner.plannerOnly) blockAgent(planner, 'failed', tr('No devolvió un plan válido (su modelo puede ser demasiado pequeño)'), COORDINATOR_REST_MS)
      else if (!sharedAgent) setRuntime(planner.id, { activity: 'idle', lastActivity: tr('Plan no válido'), context: undefined })
      console.warn(`[cowork] ${planner.id} no devolvió un plan JSON: ${res.text.slice(0, 200)}`)
      continue
    }
    if (!sharedAgent) setRuntime(planner.id, { activity: 'idle', lastActivity: tr('Plan listo'), context: undefined })
    const { tasks: planned, changes } = validatePlan(parsed.tasks, `${run.userText}`, run.projectId)
    let reply = parsed.reply
    if (parsed.tasks.length && !planned.length) {
      reply = tr('{reply}\n\n(No hay agentes disponibles para ejecutar las tareas propuestas.)', { reply }).trim()
    }
    // Lo que se ve en el plan es lo que se hará: si AI Cowork lo ajustó, se dice.
    if (planned.length && changes.length) reply = tr('{v1}\n\n*Ajustes de AI Cowork al plan:* {v2}.', { v1: reply.trim(), v2: changes.join('; ') }).trim()
    return { planner, reply, planned, contract: parsed.contract, memory: planMemoryNotes(parsed.memory) }
  }
}

const minsAgo = (ts: number | undefined): string => `${Math.max(0, Math.round((Date.now() - (ts ?? Date.now())) / 60_000))} min`

/** Conversación que ven el coordinador y cada agente: los últimos mensajes, sin recortarlos a una línea. */
const HISTORY_MESSAGES = 12
const HISTORY_CHARS = 1500
/** Cuánto del resultado de una tarea se guarda y se pasa a las que dependen de ella (antes 1 500: se perdía lo importante). */
const RESULT_KEEP = 6000
/** Archivos recientes del proyecto que se listan en cada encargo. */
const RECENT_FILES = 30

/** Quién escribió un mensaje del chat, para los prompts. */
function authorLabel(m: ChatMessage): string {
  return m.author.type === 'user' ? 'Usuario' : m.author.type === 'system' ? 'Sistema' : agentName(m.author.agentId)
}

/**
 * Los últimos mensajes del proyecto (sin los de esta petición), cada uno hasta HISTORY_CHARS: lo que se acordó dos
 * mensajes atrás («como habíamos dicho») tiene que llegar a quien hace el trabajo, no solo al coordinador.
 */
function recentConversation(projectId: string, exceptRunId: string): string[] {
  return store
    .getProject(projectId)
    .messages.filter((m) => m.runId !== exceptRunId && m.text.trim() && m.proposal?.status !== 'rejected')
    .slice(-HISTORY_MESSAGES)
    .map((m) => `${authorLabel(m)}: ${clip(m.text, HISTORY_CHARS)}`)
}

/**
 * Lo que se hizo en la petición anterior del proyecto (la última con tareas): qué pidió el usuario, qué hizo cada
 * tarea, su resultado completo y los archivos que dejó. Es lo que un agente necesita cuando la petición nueva
 * continúa esa («no funciona lo de las tildes», «ahora añade…»).
 */
function previousWork(projectId: string, exceptRunId: string): string[] {
  const st = store.getProject(projectId)
  const prev = [...st.tasks].reverse().find((t) => t.runId !== exceptRunId && t.status === 'done')
  if (!prev) return []
  const ts = st.tasks.filter((t) => t.runId === prev.runId)
  const request = st.messages.find((m) => m.runId === prev.runId && m.author.type === 'user')
  const out = ['## Lo que se hizo en la petición anterior']
  if (request) out.push(`El usuario pidió: ${clip(request.text, HISTORY_CHARS)}`)
  for (const t of ts) {
    const files = t.artifactIds.map((id) => st.artifacts.find((a) => a.id === id)?.relPath).filter((p): p is string => !!p)
    const state = t.status === 'done' ? 'hecha' : t.status === 'failed' ? `falló: ${t.error ?? ''}` : t.status
    out.push(`### «${t.title}» (${agentName(t.agentId)}, ${state})`, clip(t.result, RESULT_KEEP) || '(sin texto)')
    if (files.length) out.push(`Archivos: ${files.join(', ')}`)
  }
  return out
}

/** Archivos recientes del proyecto (lo que crearon las tareas): un agente nuevo no sabe que existen si no se le dice. */
function recentFiles(projectId: string): string[] {
  const st = store.getProject(projectId)
  return st.artifacts.slice(-RECENT_FILES).map((a) => {
    const t = a.taskId ? st.tasks.find((x) => x.id === a.taskId) : undefined
    return `- ${a.relPath}${t ? ` (de «${t.title}»)` : ''}`
  })
}

/** El plan completo de la petición, para que cada agente sepa qué hacen los demás y cuál es su parte. */
function planOverview(run: Run, current: Task): string[] {
  const ts = run.taskIds.map((id) => tasks.get(id)).filter((t): t is Task => !!t)
  if (ts.length < 2) return []
  return [
    '## El plan completo de esta petición',
    ...ts.map((t) => {
      const who = agentName(liveOwner(t))
      const state = t.id === current.id ? 'ESTA ES TU TAREA' : t.status === 'done' ? 'hecha' : t.status === 'running' ? 'en marcha' : t.status === 'failed' || t.status === 'cancelled' ? 'no se hará' : 'pendiente'
      return `- «${t.title}» → ${who} (${state}): ${oneLine(t.description, 500)}`
    })
  ]
}

/** Si el agente ya está trabajando: en qué y desde cuándo (una tarea nueva para él tendría que esperar). */
function busyNote(a: AgentConfig): string | null {
  const tid = busy.get(a.id)
  const t = tid ? tasks.get(tid) : undefined
  const becario = !!a.lightModel && !!freeSubStation() ? '; sus tareas fáciles sí puede empezarlas ya un becario suyo' : ''
  if (t) return `ocupado ahora con «${t.title}» desde hace ${minsAgo(t.startedAt)}: una tarea nueva para él esperaría a que termine${becario}`
  if (planningAgents.has(a.id)) return 'ocupado planificando otra petición (termina enseguida)'
  return null
}

/** Tareas de OTRAS peticiones del mismo proyecto que siguen en marcha o en cola, con los archivos que tocan. */
function otherWork(projectId: string, exceptRunId: string): string[] {
  const out: string[] = []
  for (const r of runs.values()) {
    if (r.projectId !== projectId || r.id === exceptRunId || r.finished || r.cancelled) continue
    for (const tid of r.taskIds) {
      const t = tasks.get(tid)
      if (!t || !['running', 'pending', 'blocked'].includes(t.status)) continue
      const files = [...(r.meta.get(tid)?.touched ?? [])].slice(0, 12)
      const state = t.status === 'running' ? `en marcha desde hace ${minsAgo(t.startedAt)}` : 'en cola'
      out.push(`- «${t.title}» (${agentName(t.agentId)}, ${state})${files.length ? ` · archivos que está tocando: ${files.join(', ')}` : ''}`)
    }
  }
  return out
}

/** Ficha de un agente para el coordinador: fortalezas, qué evitar, modelos, cuota restante e historial. */
function teamLine(a: AgentConfig): string {
  const reason = offlineReason(a)
  const busyNow = reason ? null : busyNote(a)
  const abilities: string[] = []
  if (isTextOnly(a.provider)) abilities.push('solo texto: no puede leer ni crear archivos (la app guarda su respuesta como archivo)')
  else abilities.push(terminalLine(a))
  if (a.provider === 'lmstudio') abilities.push('modelo local (gratis): lee, busca, crea y edita archivos del proyecto y puede buscar en internet')
  if (a.lightModel) abilities.push('las tareas fáciles las puede hacer un becario suyo, en paralelo')
  return profileLines(a, {
    available: reason ? `no (${reason})` : busyNow ? `sí, pero ${busyNow}` : 'sí, libre',
    quota: latestQuotas().find((q) => q.id === a.quotaGroupId),
    warn: getConfig().thresholds.warn,
    history: agentHistory(usageRuns(), a.id),
    quality: agentQualityFor(usageRuns(), a.id),
    abilities
  }).join('\n')
}

/** Qué puede hacer el agente con la terminal, según su tipo y los permisos configurados. */
function terminalLine(a: AgentConfig): string {
  if (a.provider === 'lmstudio') return 'sin terminal: no puede ejecutar comandos ni instalar nada'
  return getConfig().agentAccess === 'full'
    ? 'terminal con acceso completo: ejecuta comandos, instala dependencias y usa internet'
    : 'terminal limitada a la carpeta del proyecto: no puede instalar dependencias'
}

/** Regla de permisos para el prompt de una tarea. */
function accessRule(exec: AgentConfig): string {
  if (exec.provider === 'lmstudio') {
    return '- No tienes terminal: si la tarea necesita ejecutar comandos o instalar algo, empieza tu respuesta con «BLOQUEADA:» y otro agente se encargará.'
  }
  return getConfig().agentAccess === 'full'
    ? '- Tienes acceso completo a este equipo: puedes ejecutar comandos, instalar dependencias (npm, pip…) y usar internet sin pedir permiso. Hazlo tú mismo cuando la tarea lo necesite, en lugar de pararte. Fuera de la carpeta del proyecto haz solo lo imprescindible (instalar herramientas, configurar programas): nunca borres ni sobrescribas archivos del usuario fuera de ella ni hagas acciones irreversibles que no se hayan pedido (borrados masivos, formatear, publicar, pagar, enviar mensajes).'
    : '- Solo puedes editar archivos de la carpeta del proyecto: los comandos que necesitan aprobación (instalar dependencias, acceder a internet…) se deniegan. Si la tarea los necesita, empieza tu respuesta con «BLOQUEADA:» y explica qué falta.'
}

function buildPlanPrompt(run: Run, planner: AgentConfig): string {
  const st = store.getProject(run.projectId)
  const history = recentConversation(run.projectId, run.id)
  const existing = recentFiles(run.projectId)
  const atts = run.attachments.map((a) => `- ${attPath(run, a.relPath)} (${a.name}, ${a.mime})`)
  const busyHere = otherWork(run.projectId, run.id)
  return [
    `Eres ${planner.name}, el coordinador de un equipo de agentes de IA que trabajan juntos en el proyecto "${st.project.name}".`,
    'Ahora SOLO tienes que planificar: no ejecutes el trabajo y no crees ni modifiques archivos.',
    ...(st.project.workDir
      ? [
          `El equipo trabaja directamente en la carpeta del usuario "${st.project.workDir}" (carpeta actual) y tiene permiso para leer y editar sus archivos. Puedes revisarla para planificar mejor.`
        ]
      : []),
    '',
    '## Equipo',
    ...workers().map(teamLine),
    '',
    '## Archivos adjuntos en este mensaje (rutas relativas a la carpeta del proyecto)',
    ...(atts.length ? atts : ['(ninguno)']),
    ...(imageAttachments(run).length
      ? [
          seesImages(planner)
            ? 'Hay imágenes adjuntas (capturas, fotos): ábrelas y míralas antes de responder; el usuario suele preguntar por lo que se ve en ellas.'
            : 'Hay imágenes adjuntas y tú no puedes verlas: si la respuesta depende de lo que se ve en ellas, crea UNA tarea corta (fácil, de texto) para Claude o Codex que las mire y responda. No le pidas al usuario que te las describa.'
        ]
      : []),
    '',
    '## Archivos ya creados en el proyecto',
    ...(existing.length ? existing : ['(ninguno)']),
    '',
    '## Trabajo en marcha en esta carpeta (de otras peticiones que siguen trabajando)',
    ...(busyHere.length ? busyHere : ['(nada: el equipo está libre)']),
    ...projectBrief(store.workRoot(run.projectId)),
    ...memoryPromptSections(run.projectId),
    ...coordinatorGuide({
      projectDir: store.workRoot(run.projectId),
      fullAccess: getConfig().agentAccess === 'full',
      planApproval: getConfig().planApproval,
      routine: run.routine,
      // La lista de funciones de la app solo si la conversación va de AI Cowork: si no, son 5 000 caracteres de ruido.
      aboutApp: mentionsApp([run.userText, ...st.messages.filter((m) => m.author.type === 'user').slice(-3).map((m) => m.text)].join('\n'))
    }),
    '',
    '## Conversación reciente',
    ...(history.length ? history : ['(sin mensajes previos)']),
    '',
    '## Petición del usuario',
    run.revision ? run.revision.request : run.userText,
    ...(run.revision
      ? [
          '',
          '## Plan que le propusiste (lo ha revisado y todavía no lo ha aprobado)',
          ...run.revision.tasks.map(
            (t) =>
              `- ${t.key}: «${t.title}» → ${agentName(t.agentId)} (${t.difficulty})${t.dependsOn.length ? `, después de ${t.dependsOn.join(', ')}` : ''}: ${oneLine(t.description, 300)}`
          ),
          '',
          '## Su respuesta a ese plan',
          run.revision.feedback,
          '',
          'Rehaz el plan según su respuesta: cambia lo que pide y conserva lo demás. Si solo pregunta algo, contéstalo en "reply" y vuelve a proponer el plan (cambiado o igual). Si pide otra cosa distinta, planifica eso.'
        ]
      : []),
    '',
    '## Qué debes responder',
    'Responde ÚNICAMENTE con un objeto JSON (puede ir dentro de un bloque ```json), sin ningún otro texto, con esta forma:',
    '{"reply": "texto para el usuario", "contract": "contrato común (solo si repartes en paralelo; si no, \\"\\")", "memory": [{"kind": "decision" | "preference" | "fact" | "pending", "text": "…", "replaces": "<id, opcional>"}], "tasks": [{"key": "t1", "title": "título corto", "description": "instrucciones completas", "agent": "<id del agente>", "difficulty": "easy" | "medium" | "hard", "dependsOn": ["<key>"], "deliverable": "file" | "text", "acceptance": "cuándo está hecha", "files": ["archivos o carpetas que puede tocar"], "continues": true | false}]}',
    '',
    'Reglas:',
    `- "reply": mensaje breve en ${userLanguageName()} para el usuario (qué va a hacer el equipo, o la respuesta directa); como mucho unas 6 líneas al planificar: el detalle va en las tareas.`,
    ...(lang() === 'es' ? [] : [`- El usuario usa AI Cowork en ${userLanguageName()}: escribe en ${userLanguageName()} todo lo que verá ("reply", "title", "acceptance" y lo que pidas a los agentes que le cuenten), aunque estas instrucciones estén en español.`]),
    '- Si es charla o una duda sobre AI Cowork, responde tú en "reply" y deja "tasks": []. Si la pregunta va del proyecto o de su código («¿qué me recomiendas para…?», «¿por qué falla…?», «¿cómo está hecho…?»), NO la contestes de memoria: tú no puedes abrir sus archivos; crea UNA tarea de texto ("deliverable": "text", "medium") para un agente que sí los lee y que responda él.',
    '- Lo que importa es que el resultado sea el mejor posible y cumpla exactamente lo pedido: el tiempo y el gasto son secundarios. Elige para cada parte al agente y la dificultad que den el mejor resultado, no los más rápidos ni los más baratos. Eso sí, cada tarea arranca un agente desde cero y cada traspaso pierde contexto: una cadena de tareas suele salir peor que un solo agente que lo hace entero.',
    '- Trabajo pequeño o muy enlazado (un script, un documento, un arreglo, algo de menos de unos 20 minutos): UNA sola tarea para el agente más adecuado, que lo hace y lo prueba. Nunca crees tareas aparte de «diseñar», «arquitectura» o «contratos».',
    '- Trabajo grande con partes REALMENTE independientes que se pueden construir A LA VEZ (por ejemplo, en una app: el motor o la lógica, la interfaz y el servidor): reparte esas partes en paralelo, cada una al agente que mejor la hace según su ficha (por ejemplo, la interfaz a quien es mejor en diseño y la lógica a quien es mejor programando). Escribe tú en "contract" el contrato común: carpetas, qué archivos son de cada tarea y las funciones, rutas HTTP y formatos de datos que se usan entre partes, con nombres exactos, parámetros y lo que devuelven. Las tareas en paralelo NO dependen entre sí y no comparten archivos: los comunes (package.json, README, configuración) son solo de la integración. Añade al final UNA tarea «Integrar y probar» (para el agente de la parte principal, dificultad "medium") que dependa de ellas: junta las partes, ejecuta las pruebas, comprueba el conjunto contra la petición del usuario y arregla lo que no encaje.',
    '- Reparte SOLO si se cumplen las tres: cada parte tiene trabajo de sobra (más de unos 10 minutos), las partes van en archivos distintos sin estado compartido, y la interfaz entre ellas se puede fijar de antemano en el contrato con nombres exactos. Si falta cualquiera de las tres, una sola tarea: dividir un trabajo acoplado o encadenado lo empeora (cada traspaso pierde contexto y las decisiones implícitas divergen).',
    `- «A dos manos» para lo que depende del gusto: si el entregable es visual o de diseño (una web, una landing, una interfaz, un póster, una presentación, un logo o una imagen) y es trabajo NUEVO (no una continuación), dos agentes de familias distintas lo hacen por separado y un tercero elige: crea DOS tareas iguales sin dependencias, con las mismas instrucciones completas, una para cada agente, cada una solo en su carpeta ("files": ["${twoHandsBase(run.projectId)}opcion-a/"] y ["${twoHandsBase(run.projectId)}opcion-b/"], dilo en la descripción: «crea todo dentro de … y no toques la otra carpeta»), y una tercera tarea de texto «Elegir la mejor opción» ("deliverable": "text", "medium") para un agente de una tercera familia (si no la hay, para uno que no sea autor; en último caso, un autor), que dependa de las dos: que abra y pruebe ambas, las compare contra la petición en los dos órdenes (fidelidad, funcionamiento, calidad visual, código) y responda empezando con «GANA: A» o «GANA: B» y por qué. Aquí no hace falta "contract". Hazlo siempre que el usuario pida «a dos manos» o «dos opciones» (sea lo que sea), y nunca si pide «a una mano» o «una sola versión», si solo hay una familia disponible o si es una corrección.`,
    '- Nunca repartas una CONTINUACIÓN: si la petición corrige, amplía o retoma lo que se hizo antes en este proyecto («no funciona…», «ahora añade…», «cámbialo…»), es UNA tarea para el mismo agente que hizo ese trabajo (mira la conversación y los archivos recientes), con lo que hay que cambiar y dónde está.',
    '- Si el usuario pide «en equipo», reparte así en paralelo siempre que el trabajo tenga partes separables; si pide «un solo agente», crea una sola tarea.',
    '- No añadas tareas de revisar, auditar, validar, verificar o corregir el trabajo de otra tarea, salvo que el usuario pida expresamente una revisión (por ejemplo «con revisión»): AI Cowork ya hace que cada tarea que cambia archivos la compruebe un agente de otra familia contra la petición y su "acceptance", y el autor corrige lo que vea. Por eso "acceptance" tiene que ser concreto y comprobable.',
    '- Como máximo 6 tareas.',
    '- Asigna cada tarea al agente más adecuado según su ficha («se le da mejor» y «evitar») y SOLO a agentes disponibles. Al agente local, solo tareas cortas y sencillas: es más lento.',
    '- Si varios agentes sirven, elige el de mejor calidad según su ficha («calidad»: lo que le sirvió al usuario, verificaciones a la primera, pocas correcciones y pocos fallos, mirando la fila de la misma dificultad); la calidad pesa más que la velocidad y el coste. Con calidad parecida, el que tenga más cuota restante. A un agente con poca cuota, solo lo imprescindible.',
    '- Mira «disponible» en cada ficha: si un agente está ocupado y otro libre puede hacerlo bien, dáselo al libre para que empiece ya; uno ocupado solo si es claramente el único adecuado (su tarea esperará a que termine).',
    '- Si hay trabajo en marcha en esta carpeta, no planifiques cambios en los archivos que está tocando: trabaja en otros archivos o, si la petición necesita esos mismos, dilo en "reply" y propón esperar a que termine.',
    '- "dependsOn": keys de las tareas cuyo resultado se necesita antes de empezar (deja [] si no hay).',
    '- "difficulty": "hard" para el trabajo principal cuando es complejo o cuando el resultado importa de verdad (usa el modelo más potente, aunque tarde más); "medium" para lo normal; "easy" SOLO para respuestas de texto cortas o cambios mecánicos de una línea que no exijan entender el proyecto (va con menos esfuerzo). En la duda, sube la dificultad.',
    '- "deliverable": "file" si la tarea produce un archivo (los entregables se guardan en la carpeta artifacts/), "text" si basta con una respuesta.',
    '- "description": lo esencial de la tarea en 2 a 6 frases (qué hacer, qué decisiones ya se tomaron y las rutas de los archivos que necesite), sin repetir la petición ni la conversación: el agente ya las recibe completas, junto con la memoria del proyecto y los resultados de las tareas previas. Un plan escueto se escribe antes y el equipo empieza antes.',
    '- "acceptance": cómo se sabe que la tarea está hecha, en una frase que el propio agente pueda comprobar (por ejemplo «npm test pasa y la página carga sin errores en la consola»). Obligatorio en las tareas que crean o cambian archivos.',
    '- "files": archivos o carpetas que la tarea puede crear o modificar (por ejemplo ["artifacts/app/motor/"]). Obligatorio si varias tareas trabajan a la vez: cada archivo, de una sola tarea. «Integrar y probar» puede tocarlo todo: [].',
    '- "continues": true cuando la tarea continúa, amplía o corrige lo que ESE MISMO agente hizo en la petición anterior de este proyecto (mira «Lo que se hizo en la petición anterior»): dásela al mismo agente y márcala así, y retomará su sesión del CLI con todo lo que leyó, hizo y decidió. Si lo anterior lo hizo otro agente o es trabajo nuevo, false.',
    '- "memory": SOLO lo que el usuario ha decidido, preferido o pedido EN ESTE MENSAJE y convenga recordar en futuras peticiones (por ejemplo «todo en TypeScript», «el servidor en Python»). Nada de suposiciones tuyas ni de detalles de esta tarea. Si contradice una entrada de la memoria, pon su id en "replaces". Si no hay nada, [].',
    '- Respeta las instrucciones y la memoria del proyecto. Si la petición contradice algo confirmado, lo que pide ahora manda (y anótalo en "memory" con "replaces").'
  ].join('\n')
}

/** El plan listo para ejecutar y lo que AI Cowork cambió del que propuso el coordinador (para contárselo al usuario). */
/** Carpeta base de las dos opciones: artifacts/ en un proyecto interno, .ai-cowork/entregables/ en una carpeta del usuario. */
function twoHandsBase(projectId: string): string {
  return store.getProject(projectId).project.workDir ? '.ai-cowork/entregables/' : 'artifacts/'
}

function validatePlan(raw: unknown[], context: string, projectId: string): { tasks: PlannedTask[]; changes: string[] } {
  const out: PlannedTask[] = []
  const keys = new Set<string>()
  for (const [i, item] of raw.slice(0, 6).entries()) {
    if (!item || typeof item !== 'object') continue
    const t = item as Record<string, unknown>
    let key = (typeof t.key === 'string' || typeof t.key === 'number' ? String(t.key) : `t${i + 1}`).slice(0, 40) || `t${i + 1}`
    while (keys.has(key)) key = `${key}-${i + 1}`
    const description = typeof t.description === 'string' ? t.description.slice(0, 6000) : ''
    const title = oneLine(typeof t.title === 'string' && t.title.trim() ? t.title : description || `Tarea ${i + 1}`, 90)
    let agent = findAgent(typeof t.agent === 'string' ? t.agent : typeof t.agentId === 'string' ? t.agentId : undefined)
    if (!agent || agent.isSubagent || agent.plannerOnly || !usable(agent)) agent = bestAgentFor(`${title} ${description} ${context}`) ?? undefined
    if (!agent) continue
    keys.add(key)
    const difficulty: Difficulty = t.difficulty === 'easy' || t.difficulty === 'hard' ? t.difficulty : 'medium'
    const deliverable: Deliverable = t.deliverable === 'file' ? 'file' : 'text'
    const deps = Array.isArray(t.dependsOn) ? t.dependsOn.map((d) => String(d)) : []
    const acceptance = typeof t.acceptance === 'string' ? oneLine(t.acceptance, 500) : ''
    out.push({ key, title, description: description || title, agentId: agent.id, difficulty, dependsOn: deps, deliverable, acceptance, files: normalizeScope(t.files), continues: t.continues === true })
  }
  const known = new Set(out.map((p) => p.key))
  for (const p of out) p.dependsOn = [...new Set(p.dependsOn.filter((d) => known.has(d) && d !== p.key))]
  // Break cycles (Kahn): whatever can't be ordered loses its deps on other unordered tasks.
  const done = new Set<string>()
  let progressed = true
  while (progressed) {
    progressed = false
    for (const p of out) {
      if (!done.has(p.key) && p.dependsOn.every((d) => done.has(d))) {
        done.add(p.key)
        progressed = true
      }
    }
  }
  for (const p of out) if (!done.has(p.key)) p.dependsOn = p.dependsOn.filter((d) => done.has(d))

  // Plan más ágil: sin revisiones encadenadas que nadie pidió y sin «diseñar» aparte si construye uno solo.
  const { tasks: lean, changes } = streamlinePlan(out, context)
  if (changes.length) console.log(`[cowork] plan más ágil: ${changes.join('; ')}`)
  // El agente local no se lleva trabajo pesado: es el más lento.
  const locals = new Set(workers().filter((a) => isLocalProvider(a.provider)).map((a) => a.id))
  for (const p of lean) {
    if (p.difficulty !== 'hard' || !locals.has(p.agentId)) continue
    const alt = bestAgentFor(`${p.title} ${p.description}`, locals)
    if (!alt) continue
    changes.push(tr('«{title}» la hace {name} (el modelo local es lento para lo difícil)', { title: p.title, name: alt.name }))
    p.agentId = alt.id
  }
  // «A dos manos»: si el usuario lo pidió y el coordinador no lo hizo, se hace aquí (otra familia y un juez).
  const order = getConfig().plannerOrder
  const rank = (a: AgentConfig): number => (order.indexOf(a.id) < 0 ? 99 : order.indexOf(a.id))
  const hands = workers()
    .filter((a) => usable(a))
    .sort((a, b) => rank(a) - rank(b))
    .map((a) => ({ id: a.id, name: a.name, provider: a.provider, textOnly: isTextOnly(a.provider), local: isLocalProvider(a.provider) }))
  const two = twoHandsPlan(lean, context, hands, twoHandsBase(projectId))
  if (two.change) changes.push(two.change)
  return { tasks: two.tasks, changes }
}

// ---------- scheduling ----------

function runningCount(): number {
  let n = 0
  for (const t of tasks.values()) if (t.status === 'running') n++
  return n
}

function cancelDependents(run: Run, failedId: string): void {
  for (const tid of run.taskIds) {
    const t = tasks.get(tid)
    if (!t || (t.status !== 'pending' && t.status !== 'blocked')) continue
    if (!t.dependsOn.includes(failedId)) continue
    t.status = 'cancelled'
    t.error = tr('Depende de una tarea fallida')
    t.finishedAt = Date.now()
    pushTask(t)
    cancelDependents(run, t.id)
  }
}

function reassign(t: Task, from: AgentId, to: AgentConfig, assignedBy: AgentId = from): void {
  transfer({
    fromId: from,
    toId: to.id,
    label: tr('Reasignada: {title}', { title: t.title }),
    taskId: t.id,
    payload: { title: t.title, summary: oneLine(t.description, 200) }
  })
  t.assignedBy = assignedBy
  t.agentId = to.id
  t.status = t.dependsOn.every((d) => tasks.get(d)?.status === 'done') ? 'pending' : 'blocked'
  t.error = undefined
  t.startedAt = undefined
  t.finishedAt = undefined
  t.lastActivity = undefined
  t.progress = undefined
  pushTask(t)
}

export function schedule(): void {
  const cfg = getConfig()
  let running = runningCount()
  for (const run of runs.values()) {
    if (run.cancelled || run.finished || run.planning) continue
    for (const tid of run.taskIds) {
      const t = tasks.get(tid)
      if (!t || (t.status !== 'pending' && t.status !== 'blocked')) continue
      const deps = t.dependsOn.map((d) => tasks.get(d))
      if (deps.some((d) => !d || d.status === 'failed' || d.status === 'cancelled')) {
        t.status = 'cancelled'
        t.error = tr('Depende de una tarea fallida')
        t.finishedAt = Date.now()
        pushTask(t)
        cancelDependents(run, t.id)
        continue
      }
      if (!deps.every((d) => d!.status === 'done')) {
        if (t.status !== 'blocked') {
          t.status = 'blocked'
          pushTask(t)
        }
        continue
      }
      if (t.status === 'blocked') {
        t.status = 'pending'
        pushTask(t)
      }
      if (running >= cfg.maxParallel) continue

      let agent = findAgent(t.agentId)
      if (agent?.isSubagent) agent = findAgent(agent.parentId)
      if (t.direct && (!agent || !usable(agent))) {
        // Un mensaje directo es para ese agente: no se le pasa a otro.
        const why = agent ? offlineReason(agent) : null
        t.status = 'failed'
        t.error = agent
          ? tr('{name} no está disponible{why}. El mensaje no se ha pasado a ningún otro agente.', { name: agent.name, why: why ? `: ${why}` : '' })
          : tr('Ese agente ya no existe')
        t.finishedAt = Date.now()
        pushTask(t)
        systemMessage(run, t.error, 'error')
        continue
      }
      if (!agent || !usable(agent)) {
        const alt = bestAgentFor(`${t.title} ${t.description}`, new Set([t.agentId]))
        if (!alt) {
          t.status = 'failed'
          t.error = agent ? tr('{name} no está disponible y no hay otro agente libre', { name: agent.name }) : tr('No hay ningún agente disponible')
          t.finishedAt = Date.now()
          pushTask(t)
          cancelDependents(run, t.id)
          continue
        }
        reassign(t, agent?.id ?? t.agentId, alt)
        agent = alt
        if (t.status !== 'pending') continue
      }

      const meta = run.meta.get(t.id)!
      const light = lightModelBroken.has(agent.id) ? null : safeModel(agent.lightModel)
      // Fácil: un becario en paralelo, con esfuerzo bajo. El modelo ligero solo para respuestas de texto: como
      // agente de código da más vueltas y tarda más que el principal con esfuerzo bajo (medido).
      if (t.difficulty === 'easy' && agent.lightModel && !meta.forceMainModel) {
        const model = meta.deliverable === 'text' && light ? light : meta.forceCliDefault ? '' : agent.model
        const station = freeSubStation()
        if (station) {
          running++
          void startTask(run, t, agent, model, station)
          continue
        }
        if (busy.has(agent.id)) continue
        running++
        void startTask(run, t, agent, model, null)
        continue
      }
      if (busy.has(agent.id)) continue
      running++
      // Difícil → modelo potente; normal → habitual. Si el CLI rechazó alguno, se baja de nivel.
      const strong = strongModelBroken.has(agent.id) ? null : safeModel(agent.strongModel)
      const chosen = meta.forceCliDefault
        ? ''
        : t.difficulty === 'hard' && strong && !meta.forceMainModel
          ? strong
          : agent.model
      void startTask(run, t, agent, chosen, null)
    }
  }
  updateWaiting()
  for (const run of [...runs.values()]) void checkRunFinished(run)
}

function updateWaiting(): void {
  const waitingFor = new Map<AgentId, AgentId>()
  for (const run of runs.values()) {
    if (run.cancelled || run.finished) continue
    for (const tid of run.taskIds) {
      const t = tasks.get(tid)
      if (!t || (t.status !== 'pending' && t.status !== 'blocked')) continue
      const dep = t.dependsOn.map((d) => tasks.get(d)).find((d) => d && d.status === 'running' && d.agentId !== t.agentId)
      if (dep && !waitingFor.has(t.agentId)) waitingFor.set(t.agentId, dep.agentId)
    }
  }
  for (const a of baseAgents()) {
    if (busy.has(a.id) || isBlocked(a.id) || presence.get(a.id) || planningAgents.has(a.id) || integrating.has(a.id)) continue
    const rt = getRuntime(a.id)
    const w = waitingFor.get(a.id)
    if (w) {
      if (rt.activity !== 'waiting' || rt.waitingFor !== w) {
        setRuntime(a.id, { activity: 'waiting', waitingFor: w, lastActivity: tr('Esperando a {agentName}', { agentName: agentName(w) }), reason: undefined })
      }
    } else if (rt.activity === 'waiting') {
      setRuntime(a.id, { activity: 'idle', waitingFor: undefined })
    }
  }
}

// ---------- running a task ----------

/** Images attached to this message (passed to Codex with -i; other CLIs read them by path). */
function attPath(run: Run, rel: string, inCopy = false): string {
  const p = run.attPaths.get(rel) ?? rel
  // Los adjuntos no se copian a las copias aparte: se leen de la carpeta del proyecto.
  return inCopy && !isAbsolute(p) ? join(store.workRoot(run.projectId), p) : p
}

function imageAttachments(run: Run, inCopy = false): string[] {
  return run.attachments
    .filter((a) => store.isImageName(a.relPath))
    .slice(0, 8)
    .map((a) => attPath(run, a.relPath, inCopy))
}

function depArtifacts(dep: Task): Artifact[] {
  const st = store.getProject(dep.projectId)
  return dep.artifactIds.map((id) => st.artifacts.find((a) => a.id === id)).filter((a): a is Artifact => !!a)
}

const INLINE_LIMIT = 30_000

function inlineTextFiles(projectId: string, relPaths: string[]): string[] {
  const out: string[] = []
  let budget = INLINE_LIMIT
  for (const rel of relPaths) {
    if (budget <= 0) break
    const kind = store.artifactKind(rel)
    if (!['markdown', 'code', 'text', 'html'].includes(kind)) continue
    const abs = store.resolveProjectFile(projectId, rel)
    if (!abs) continue
    try {
      let text = readFileSync(abs, 'utf8')
      if (text.length > budget) text = text.slice(0, budget) + '\n…(truncado)'
      budget -= text.length
      out.push(`### ${rel}\n\`\`\`\n${text}\n\`\`\``)
    } catch {
      /* unreadable */
    }
  }
  return out
}

/** Herramienta de lista de pasos de cada CLI (su uso permite mostrar progreso real). */
const TODO_TOOL: Partial<Record<AgentConfig['provider'], string>> = {
  claude: 'TodoWrite',
  codex: 'update_plan',
  gemini: 'write_todos',
  lmstudio: 'update_plan'
}

/** Lo que cuenta un agente mientras trabaja sale en el chat como avisos cortos (como hace Claude en su app). */
const NARRATE_RULE = '- Mientras trabajas, cuenta lo que haces en frases cortas (una o dos líneas) antes de cada paso importante: qué vas a hacer, qué problema encontraste y cómo lo vas a resolver. Se ven en el chat como avisos de progreso: nada de párrafos largos, listas ni repetir la tarea. Si haces capturas o generas imágenes para comprobar tu trabajo, guárdalas dentro de la carpeta del proyecto (por ejemplo en artifacts/) para que se vean en el chat.'

function buildTaskPrompt(run: Run, t: Task, exec: AgentConfig, parent: AgentConfig | null, deps: Task[], tools = false): string {
  const st = store.getProject(run.projectId)
  const meta = run.meta.get(t.id)!
  if (t.direct) return directPrompt(run, t, !!meta.copy)
  const textOnly = isTextOnly(exec.provider)
  const files: string[] = []
  for (const a of run.attachments) files.push(`- ${attPath(run, a.relPath, !!meta.copy)} (adjunto del usuario: ${a.name})`)
  for (const d of deps) for (const a of depArtifacts(d)) files.push(`- ${a.relPath} (resultado de «${d.title}»)`)
  const depResults = deps.map((d) => `### ${d.title} (${agentName(liveOwner(d))})\n${clip(d.result, RESULT_KEEP) || '(sin texto)'}`)

  const rules = textOnly
    ? [
        '- No puedes leer ni crear archivos: trabaja con la información de este mensaje.',
        '- Si no puedes hacer la tarea (por falta de acceso, de información o de herramientas), NO la des por hecha: empieza tu respuesta con «BLOQUEADA:» seguido del motivo en una frase.',
        meta.deliverable === 'file'
          ? '- Responde directamente con el contenido COMPLETO del entregable en Markdown; la app lo guardará como archivo en artifacts/.'
          : '- Responde directamente con el resultado, de forma clara y concisa.'
      ]
    : st.project.workDir
      ? [
          meta.copy
            ? `- Trabajas en una copia aparte de la carpeta del proyecto (la carpeta actual: ${meta.copy.dir}), porque otra tarea está usando a la vez la carpeta original (${st.project.workDir}). Haz todos tus cambios aquí y no toques la original: al terminar, la app integra tus cambios en ella.`
            : `- Trabajas directamente en la carpeta del proyecto del usuario (la carpeta actual: ${st.project.workDir}). Tienes permiso para leer y editar sus archivos para cumplir la tarea.`,
          accessRule(exec),
          '- Si creas documentos que no forman parte del proyecto (informes, notas, resúmenes), guárdalos en .ai-cowork/entregables/.',
          '- No modifiques .ai-cowork/adjuntos/ (son los adjuntos del usuario).',
          '- No pegues el contenido completo de los archivos en tu respuesta.',
          meta.deliverable === 'file'
            ? '- Esta tarea debe crear o modificar al menos un archivo.'
            : '- Esta tarea no necesita archivos salvo que sean imprescindibles: responde con el resultado.',
          `- Si la tarea tiene varios pasos, al empezar crea una lista de 3 a 6 pasos con tu herramienta de lista de tareas${TODO_TOOL[exec.provider] ? ` (${TODO_TOOL[exec.provider]})` : ''} y márcalos como completados a medida que avances: la app la usa para mostrar tu porcentaje de progreso.`,
          NARRATE_RULE,
          '- Si no puedes hacer la tarea (por falta de acceso, de información o de herramientas), NO la des por hecha: empieza tu respuesta con «BLOQUEADA:» seguido del motivo en una frase.',
          '- Termina con un resumen breve (máximo 5 líneas) de lo que hiciste y qué archivos cambiaste.'
        ]
      : [
        meta.copy
          ? '- Trabaja dentro de la carpeta actual: es una copia aparte de la carpeta del proyecto, porque otra tarea la usa a la vez. Al terminar, la app integra tus cambios.'
          : '- Trabaja dentro de la carpeta actual (la carpeta del proyecto).',
        accessRule(exec),
        '- Guarda los entregables como archivos dentro de la carpeta artifacts/ (créala si no existe), con nombres claros y sin espacios.',
        '- No pegues el contenido completo de los archivos en tu respuesta.',
        '- No modifiques los archivos de attachments/.',
        meta.deliverable === 'file'
          ? '- Esta tarea debe producir al menos un archivo en artifacts/.'
          : '- Esta tarea no necesita archivos salvo que sean imprescindibles: responde con el resultado.',
        `- Si la tarea tiene varios pasos, al empezar crea una lista de 3 a 6 pasos con tu herramienta de lista de tareas${TODO_TOOL[exec.provider] ? ` (${TODO_TOOL[exec.provider]})` : ''} y márcalos como completados a medida que avances: la app la usa para mostrar tu porcentaje de progreso.`,
        NARRATE_RULE,
        '- Si no puedes hacer la tarea (por falta de acceso, de información o de herramientas), NO la des por hecha: empieza tu respuesta con «BLOQUEADA:» seguido del motivo en una frase.',
        '- Termina con un resumen breve (máximo 5 líneas) de lo que hiciste y qué archivos creaste.'
      ]

  const lines = [
    `Eres ${exec.name}${parent ? ` (becario de ${parent.name})` : ''}, parte de un equipo de agentes de IA que trabajan juntos en el proyecto "${st.project.name}". ${replyLanguage()}`,
    '',
    '## Petición original del usuario',
    run.userText,
    '',
    `## Tu tarea: ${t.title}`,
    t.description,
    ...(t.acceptance
      ? [
          '',
          '## Criterio de aceptación',
          `La tarea está hecha cuando: ${t.acceptance}`,
          'Antes de terminar, compruébalo tú mismo (ejecuta lo necesario) y di en tu resumen si se cumple y, si no, qué falta.'
        ]
      : []),
    ...(t.files?.length && !textOnly
      ? ['', '## Tus archivos', `Solo puedes crear o modificar: ${t.files.join(', ')}. Si necesitas cambiar otro archivo, no lo hagas: dilo en tu respuesta.`]
      : []),
    ...(meta.fixRequest
      ? [
          '',
          '## Corrección pedida por el verificador',
          'Ya hiciste esta tarea; otro agente comprobó el resultado contra la petición y el criterio de aceptación y vio estos fallos. Corrige exactamente eso sobre lo que ya hay (no empieces de cero) y comprueba que queda bien:',
          meta.fixRequest
        ]
      : []),
    ...(meta.resume
      ? [
          '',
          '## Retomas tu sesión anterior',
          'Esta conversación continúa la sesión en la que ya trabajaste en este proyecto: recuerdas lo que leíste, hiciste y decidiste entonces, así que no empieces de cero ni vuelvas a explorarlo todo. Eso sí, otros agentes (o el usuario) pueden haber cambiado archivos desde entonces: comprueba el estado actual de lo que vayas a tocar antes de cambiarlo.'
        ]
      : []),
    ...(meta.resumed
      ? [
          '',
          '## Tarea retomada',
          'Esta tarea se interrumpió a medias porque se cerró la app. Puede que ya haya archivos creados o a medio hacer: revisa lo que hay y continúa desde ahí en vez de empezar de cero.'
        ]
      : []),
    ...(run.contract
      ? [
          '',
          '## Contrato común del equipo',
          t.dependsOn.length
            ? 'Las otras partes las han hecho otros agentes siguiendo este contrato: júntalas respetándolo, ejecuta las pruebas y arregla lo que no encaje.'
            : 'Otros agentes construyen las otras partes A LA VEZ que tú. Toca SOLO los archivos de tu tarea y usa exactamente estos nombres, rutas y formatos para que todo encaje:',
          run.contract
        ]
      : []),
    ...planOverview(run, t),
    '',
    '## Archivos de esta petición (rutas relativas a la carpeta donde trabajas)',
    ...(files.length ? files : ['(ninguno)'])
  ]
  const recent = recentFiles(run.projectId)
  if (recent.length) lines.push('', '## Archivos recientes del proyecto (de peticiones anteriores)', ...recent)
  if (textOnly) {
    const inline = inlineTextFiles(run.projectId, [
      ...run.attachments.map((a) => a.relPath),
      ...deps.flatMap((d) => depArtifacts(d).map((a) => a.relPath))
    ])
    if (inline.length) lines.push('', '## Contenido de los archivos de texto', ...inline)
  }
  if (depResults.length) lines.push('', '## Resultados de las tareas previas', ...depResults)
  // Lo que pasó antes: la conversación y la petición anterior. Sin esto, «arréglalo como habíamos dicho» no significa nada.
  const previous = previousWork(run.projectId, run.id)
  if (previous.length) lines.push('', ...previous)
  const conversation = recentConversation(run.projectId, run.id)
  if (conversation.length) lines.push('', '## Conversación reciente (lo que se habló antes de esta petición)', ...conversation)
  // Otras peticiones trabajando a la vez en la misma carpeta: que no se pisen los archivos.
  const others = otherWork(run.projectId, run.id)
  if (others.length) {
    lines.push('', '## Otras tareas trabajando ahora en esta misma carpeta', 'No modifiques los archivos que están tocando; si necesitas cambiarlos, dilo en tu respuesta.', ...others)
  }
  lines.push(...memoryPromptSections(run.projectId))
  lines.push(...repoInstructionLines(store.workRoot(run.projectId), exec.provider))
  lines.push(...skillPromptLines(tools))
  lines.push(
    '',
    '## Reglas',
    ...rules,
    ...(tools
      ? [
          `- Tienes las herramientas de AI Cowork (servidor MCP «${MCP_SERVER_NAME}»): «memoria_proyecto» (instrucciones y memoria al día), «anotar_memoria» (lo que los demás deben saber), «estado_equipo» (qué hacen ahora los compañeros, para no pisarlos), «preguntar_usuario» (una duda que cambia el resultado: no esperes la respuesta) y «leer_habilidad». Úsalas cuando aporten; no hace falta llamarlas por rutina.`
        ]
      : []),
    ...taskGuideRules(store.workRoot(run.projectId)),
    '- Si tomas una decisión que afecte a trabajos futuros o descubres algo importante que no está en la memoria (un problema pendiente, un dato del entorno), añade al final una sección «## Para la memoria» con 1 a 3 líneas: «- decisión: …», «- hecho: …» o «- pendiente: …» (si sustituye a una entrada, «- decisión (sustituye m3): …»). Si no hay nada nuevo, no la pongas.'
  )
  return lines.join('\n')
}

async function startTask(run: Run, t: Task, agent: AgentConfig, model: string, becarioStation: string | null): Promise<void> {
  const parent = becarioStation ? agent : null
  const exec = becarioStation ? spawnBecario(agent, becarioStation, model) : agent
  const meta = run.meta.get(t.id)!
  const ctrl = new AbortController()
  run.controllers.set(t.id, ctrl)
  busy.set(exec.id, t.id)
  if (parent) {
    t.assignedBy = parent.id
    t.agentId = exec.id
  }

  // Hand-off animations.
  const deps = t.dependsOn.map((d) => tasks.get(d)).filter((d): d is Task => !!d)
  if (deps.length) {
    for (const d of deps) {
      transfer({
        fromId: liveOwner(d),
        toId: exec.id,
        label: `${d.title} → ${exec.name}`,
        taskId: t.id,
        payload: { title: d.title, summary: oneLine(d.result, 200), files: depArtifacts(d).map((a) => a.relPath) }
      })
    }
  } else {
    transfer({
      fromId: 'core',
      toId: parent ? parent.id : exec.id,
      label: tr('Nueva tarea'),
      taskId: t.id,
      payload: { title: t.title, summary: oneLine(t.description, 200) }
    })
  }
  if (parent) {
    transfer({
      fromId: parent.id,
      toId: exec.id,
      label: tr('Delegada: {title}', { title: t.title }),
      taskId: t.id,
      payload: { title: t.title, summary: oneLine(t.description, 200) }
    })
  }

  t.status = 'running'
  t.startedAt = Date.now()
  t.finishedAt = undefined
  t.model = model || undefined
  t.lastActivity = tr('Leyendo la tarea')
  t.error = undefined
  t.progress = undefined
  pushTask(t)
  setRuntime(exec.id, {
    activity: 'thinking',
    taskId: t.id,
    lastActivity: tr('Leyendo la tarea'),
    reason: undefined,
    waitingFor: undefined,
    context: undefined,
    location: 'station'
  })
  updateWaiting()

  const mainDir = store.workRoot(run.projectId)
  if (!projectKnown.has(run.projectId)) {
    try {
      projectKnown.set(run.projectId, await store.snapshotFiles(mainDir))
    } catch {
      /* ignore */
    }
  }

  // En la carpeta del proyecto o, si otra tarea la está usando, en una copia aparte que se integra al terminar.
  const dir = await prepareWorkplace(run, t, meta, exec)

  let working = false
  // Si el agente no cuenta sus pasos (registro de la tarea), al menos queda lo que dice que hace.
  let traced = false
  const activity = (text: string): void => {
    if (ctrl.signal.aborted) return
    // Callado 3 minutos: suele esperar un aviso de permisos en la pantalla del servidor. A la bandeja (y al móvil).
    if (text === STALL_NOTICE) {
      addInbox({
        kind: 'stalled',
        key: `stall:${t.id}`,
        title: tr('{name} lleva 3 minutos sin dar señales en «{title}»', { name: exec.name, title: t.title }),
        detail: tr('Puede que esté esperando un aviso de permisos en la pantalla del servidor (macOS o el llavero), que solo se contesta delante del equipo. Si no vuelve a dar señales en 20 minutos, se corta.'),
        projectId: run.projectId,
        runId: run.id,
        taskId: t.id,
        agentId: exec.id,
        actions: [{ id: 'dismiss', label: tr('Entendido') }]
      })
    } else if (t.lastActivity === STALL_NOTICE) taskInboxDone(t)
    if (!working) {
      working = true
      setRuntime(exec.id, { activity: 'working', lastActivity: text })
    } else {
      setRuntime(exec.id, { lastActivity: text })
    }
    t.lastActivity = text
    taskDirty(t)
  }

  let res: RunAgentResult
  const taskStart = Date.now()
  // Esfuerzo según la dificultad: bajo en lo fácil (más rápido y gasta menos), alto solo en lo difícil.
  const effort = effortFor(exec.provider, t.difficulty)
  // Corrección o continuación: el mismo CLI retoma su sesión anterior, con lo que leyó, hizo y decidió en la memoria.
  const sessionOwner = parent ?? exec
  const resume = supportsResume(exec.provider)
    ? (meta.resume ?? (t.continues && dir === mainDir ? lastSession(run.projectId, sessionOwner.id, { provider: exec.provider, cwd: dir })?.sessionId : undefined))
    : undefined
  startTrace(t.id, run.projectId)
  openWork(run, t, parent ?? exec)
  const progress = watchProgress(run, t, dir, taskStart)
  traceNote(t.id, tr('{name} empieza con {modelNameFor}{v3}', { name: exec.name, modelNameFor: modelNameFor(exec, model), v3: effort ? ` · ${tr(EFFORT_LABEL[effort])}` : '' }))
  if (resume) traceNote(t.id, tr('{name} retoma su sesión anterior en este proyecto', { name: exec.name }))
  // Herramientas de AI Cowork (memoria, equipo, preguntas, habilidades). Solo Claude: lee la configuración de un
  // archivo; Codex solo la admite con valores TOML entre comillas, que no pueden ir por la consola.
  const mcp: McpLaunch | null = exec.provider === 'claude' && !t.direct
    ? mcpForTask({ projectId: run.projectId, runId: run.id, taskId: t.id, taskTitle: t.title, agentId: (parent ?? exec).id, agentName: (parent ?? exec).name })
    : null
  const attempt = (resuming: string | undefined): Promise<RunAgentResult> => {
    meta.resume = resuming
    return runner({
      agent: exec,
      model,
      effort,
      prompt: buildTaskPrompt(run, t, exec, parent, deps, !!mcp),
      ...(t.direct ? { direct: true } : {}),
      ...(mcp ? { mcp: { name: MCP_SERVER_NAME, command: mcp.command, args: mcp.args, env: mcp.env, configFile: mcp.configFile } } : {}),
      cwd: dir,
      mode: 'work',
      access: getConfig().agentAccess,
      images: imageAttachments(run, dir !== mainDir),
      resume: resuming,
      signal: ctrl.signal,
      onActivity: (text, kind) => {
        activity(text)
        if (!traced && kind === 'tool' && !ctrl.signal.aborted) {
          traceUpdate(t.id, { type: 'tool', tool: 'other', title: text })
          workDirty(run, t)
        }
      },
      onTrace: (u) => {
        traced = true
        if (!ctrl.signal.aborted) {
          traceUpdate(t.id, u)
          progress.seen(u)
          workDirty(run, t)
        }
      },
      onThinking: () => {
        if (working) activity('Razonando')
      },
      onProgress: (p) => {
        t.progress = p
        taskDirty(t)
      },
      onUsage: (u) => {
        const prev = getRuntime(exec.id).context
        const used = u.contextUsed ?? prev?.used
        if (used == null) return
        setRuntime(exec.id, { context: { used, capacity: u.contextCapacity ?? prev?.capacity } })
      },
      onRateLimit,
      onFile: (p) => {
        const rel = store.toRelPath(dir, p)
        if (rel) meta.touched.add(rel)
      }
    })
  }
  try {
    // «Detener» mientras se preparaba la carpeta: no se lanza el CLI.
    res = ctrl.signal.aborted
      ? { ok: false, text: '', usage: { input: 0, output: 0 }, errorKind: 'cancelled', errorMessage: 'Cancelada' }
      : await attempt(resume)
    // La sesión anterior no se pudo retomar (borrada, de otra versión del CLI…): desde cero antes de darla por fallida.
    if (resume && !res.ok && res.errorKind === 'failed' && !ctrl.signal.aborted && meta.touched.size === 0 && Date.now() - taskStart < RESUME_RETRY_MS) {
      traceNote(t.id, tr('No se pudo retomar la sesión anterior ({v1}): {name} empieza de cero', { v1: res.errorMessage ?? 'error', name: exec.name }), true)
      res = await attempt(undefined)
    }
  } catch (e) {
    res = { ok: false, text: '', usage: { input: 0, output: 0 }, errorKind: 'failed', errorMessage: (e as Error).message }
  }
  meta.resume = undefined
  releaseMcp(mcp)
  progress.stop()
  if (res.sessionId && !ctrl.signal.aborted) {
    meta.sessionId = res.sessionId
    rememberSession(run.projectId, sessionOwner.id, { sessionId: res.sessionId, provider: exec.provider, cwd: dir, taskTitle: t.title, at: Date.now() })
  }

  // «BLOQUEADA: …» cuenta como fallo en el registro (la tarea pasa a otro o se da por fallida).
  taskInboxDone(t)
  logCall(run, 'task', exec, model, res.ok && !t.direct && blockedReason(res.text) ? { ...res, ok: false } : res, taskStart, t.id, effort, {
    difficulty: t.difficulty
  })
  endTrace(t.id, res, taskStart)
  // El controlador sigue registrado mientras se verifica el resultado («Detener» también lo corta).
  if (busy.get(exec.id) === t.id) busy.delete(exec.id)
  if (meta.updateTimer) {
    clearTimeout(meta.updateTimer)
    meta.updateTimer = undefined
  }
  // cancelRun() may have changed the status while we were awaiting.
  if (run.cancelled || (t.status as Task['status']) === 'cancelled') {
    closeWork(run, t, 'stopped', { text: 'Detenida.' })
    return
  }

  recordUsage(exec.quotaGroupId, res.usage.input + res.usage.output, 1)
  scheduleQuotaRefresh(exec.provider === 'codex')

  try {
    // En un mensaje directo la respuesta es la que es: «BLOQUEADA:» no significa nada especial.
    const blocked = res.ok && !t.direct ? blockedReason(res.text) : null
    if (blocked) handleFailure(run, t, exec, parent, { ...res, ok: false, errorKind: 'failed', errorMessage: blocked })
    else if (res.ok) {
      const verdict = await verifyTask(run, t, exec, parent, res, dir)
      if (verdict && !verdict.ok && verdict.fixes === 0) requeueForFix(run, t, exec, parent, verdict)
      else if (await settleChanges(run, t, exec, parent)) await completeTask(run, t, exec, parent, res)
    } else handleFailure(run, t, exec, parent, res)
  } catch (e) {
    console.error('[cowork] task post-processing failed', e)
    if (t.status === 'running') {
      t.status = 'failed'
      t.error = tr('Error interno: {message}', { message: (e as Error).message })
      t.finishedAt = Date.now()
      pushTask(t)
      closeWork(run, t, 'failed', { text: t.error, tone: 'error' })
      cancelDependents(run, t.id)
    }
  }
  if (run.controllers.get(t.id) === ctrl) run.controllers.delete(t.id)
  schedule()
}

/**
 * Lo que recibe el agente en un mensaje directo: el texto del usuario tal cual. Solo si hay adjuntos se añade
 * dónde están (el agente no tendría otra forma de encontrarlos).
 */
export function directPrompt(run: Pick<Run, 'attachments' | 'attPaths' | 'projectId'>, t: Pick<Task, 'description'>, inCopy = false): string {
  if (!run.attachments.length) return t.description
  const files = run.attachments.map((a) => `- ${attPath(run as Run, a.relPath, inCopy)}`)
  return [t.description, '', ...files].join('\n').trim()
}

/** Nombre legible del modelo con el que trabaja un agente. */
function modelNameFor(a: AgentConfig, model: string): string {
  if (!model) return tr('su modelo predeterminado')
  if (model === a.model) return a.modelLabel || model
  if (model === a.lightModel) return a.lightModelLabel || model
  if (model === a.strongModel) return a.strongModelLabel || model
  return model
}

/** Última línea del registro de la tarea (cómo acabó, cuánto tardó y gastó) y se guarda. */
function endTrace(taskId: string, res: RunAgentResult, start: number): void {
  const secs = Math.round((Date.now() - start) / 1000)
  const tokens = res.usage.input + res.usage.output
  const spent = `${secs < 60 ? `${secs} s` : `${Math.round(secs / 60)} min`}${tokens >= 1000 ? ` · ${Math.round(tokens / 1000)} k tokens` : ''}`
  const blocked = res.ok ? blockedReason(res.text) : null
  if (blocked) traceNote(taskId, blocked, true)
  else if (res.ok) traceNote(taskId, tr('Terminó en {spent}', { spent }))
  else if (res.errorKind === 'cancelled') traceNote(taskId, tr('Detenida tras {spent}', { spent }))
  else traceNote(taskId, res.errorMessage ?? 'Falló', true)
  finishTrace(taskId)
}

async function collectArtifacts(run: Run, t: Task, owner: AgentConfig): Promise<Artifact[]> {
  const dir = store.workRoot(run.projectId)
  const meta = run.meta.get(t.id)!
  const known = projectKnown.get(run.projectId) ?? new Map<string, store.FileStamp>()
  const now = await store.snapshotFiles(dir)
  const changed: string[] = []
  for (const [rel, stamp] of now) {
    const prev = known.get(rel)
    if (!prev || prev.mtime !== stamp.mtime || prev.size !== stamp.size) changed.push(rel)
  }
  // Files reported by other tasks still running in this project are theirs, and so is whatever falls in the
  // files they were assigned (commands like «npx cap add android» create lots of files nobody reports).
  const otherTouched = new Set<string>()
  const otherScopes: string[][] = []
  for (const r of runs.values()) {
    if (r.projectId !== run.projectId) continue
    for (const tid of r.taskIds) {
      const other = tasks.get(tid)
      if (tid === t.id || other?.status !== 'running') continue
      for (const f of r.meta.get(tid)?.touched ?? []) otherTouched.add(f)
      if (other.files?.length) otherScopes.push(other.files)
    }
  }
  // Los modelos locales no tienen terminal: todo lo que escriben lo informan. Lo demás que cambió no es suyo
  // (por ejemplo, lo que genera a la vez el comando de otra tarea).
  const reportsAllWrites = isLocalProvider(owner.provider)
  const theirs = (rel: string): boolean => otherTouched.has(rel) || otherScopes.some((sc) => outsideScope([rel], sc).length === 0)
  const claimed = changed.filter((rel) => meta.touched.has(rel) || (!reportsAllWrites && !theirs(rel)))
  for (const rel of claimed) known.set(rel, now.get(rel)!)
  for (const rel of [...known.keys()]) if (!now.has(rel)) known.delete(rel)
  projectKnown.set(run.projectId, known)

  const out: Artifact[] = []
  for (const rel of claimed.slice(0, 60)) {
    const stamp = now.get(rel)!
    const existing = store.findArtifactByPath(run.projectId, rel)
    const a: Artifact = existing
      ? { ...existing, size: stamp.size, taskId: t.id, agentId: owner.id }
      : {
          id: randomUUID(),
          projectId: run.projectId,
          taskId: t.id,
          agentId: owner.id,
          name: basename(rel),
          relPath: rel,
          kind: store.artifactKind(rel),
          size: stamp.size,
          createdAt: Date.now()
        }
    store.upsertArtifact(a)
    emit({ kind: 'artifact.created', artifact: { ...a } })
    out.push(a)
  }
  return out
}

/** Agentes que pueden comprobar el trabajo de otro: leen archivos y no son el autor ni de su misma familia. */
function pickVerifier(author: AgentConfig, wantsEyes = false): AgentConfig | null {
  const cfg = getConfig()
  let cands = workers().filter(
    (a) => usable(a) && a.id !== author.id && a.provider !== author.provider && !isTextOnly(a.provider) && !isLocalProvider(a.provider)
  )
  if (!cands.length) return null
  // Si hay capturas de la interfaz, mejor quien pueda verlas.
  if (wantsEyes && cands.some(seesImages)) cands = cands.filter(seesImages)
  const order = (a: AgentConfig): number => {
    const i = cfg.plannerOrder.indexOf(a.id)
    return i < 0 ? 99 : i
  }
  return [...cands].sort((a, b) => Number(busy.has(a.id)) - Number(busy.has(b.id)) || order(a) - order(b))[0]
}

/** Tareas cuyo resultado se comprueba: cambiaron archivos del proyecto y el usuario no ha pedido saltárselo. */
function shouldVerify(run: Run, t: Task, exec: AgentConfig, changed: string[]): boolean {
  if (t.direct || isTextOnly(exec.provider) || wantsNoReview(run.userText)) return false
  const meta = run.meta.get(t.id)
  return !!meta && (meta.deliverable === 'file' || changed.length > 0)
}

// También en inglés (VERDICT: PASS/FAIL): con la app en inglés el verificador escribe en inglés y a veces traduce la línea.
const VERDICT_RE = /(?:VEREDICTO|VERDICT)\s*[:\-–—]\s*\**\s*(CUMPLE|FALLOS?|PASS(?:ES|ED)?|FAIL(?:S|ED|URES?)?)\b/i

/** Encargo del verificador: solo corrección y lo pedido, nada de gustos; veredicto en la primera línea. */
function buildVerifyPrompt(run: Run, t: Task, author: AgentConfig, verifier: AgentConfig, changed: string[], resultText: string, ui: UiShots | null = null): string {
  const st = store.getProject(run.projectId)
  const test = testCommand(store.workRoot(run.projectId))
  return [
    `Eres ${verifier.name}, parte de un equipo de agentes de IA que trabajan juntos en el proyecto "${st.project.name}". Responde en español.`,
    `${author.name} acaba de hacer una tarea y tú compruebas el resultado con ojos nuevos, antes de darlo por bueno. No cambies ningún archivo: solo lee, ejecuta pruebas si puedes y da tu veredicto.`,
    '',
    '## Petición original del usuario',
    run.userText,
    '',
    `## La tarea: ${t.title}`,
    t.description,
    ...(t.acceptance ? ['', '## Criterio de aceptación', t.acceptance] : []),
    '',
    '## Archivos que cambió o creó',
    ...(changed.length ? changed.map((f) => `- ${f}`) : ['(no informó de ninguno: busca los cambios recientes en la carpeta)']),
    '',
    `## Lo que dijo ${author.name} al terminar`,
    clip(resultText, RESULT_KEEP) || '(sin texto)',
    '',
    ...(ui
      ? [
          '## Cómo se ve (capturas que hizo AI Cowork al abrir la web)',
          ...ui.shots.map((s) => `- ${s.path}: «${s.page}» a tamaño ${s.view}`),
          ...(ui.errors.length ? ['Errores al abrirla:', ...ui.errors.map((e) => `- ${e}`)] : ['Sin errores en la consola al abrirla.']),
          'Mira las capturas: que se vea lo que se pidió, que no haya nada roto, vacío, cortado o encima de otra cosa, y que en el móvil se pueda usar. Una página en blanco o con errores que impiden usarla es un fallo. (Se abrió sin compilar: si es una app que necesita compilarse, compruébala también como se ejecute de verdad.)',
          ''
        ]
      : []),
    '## Qué debes comprobar',
    '- Que lo que hay en los archivos hace lo que pidió el usuario y cumple el criterio de aceptación: léelos de verdad, sigue el flujo principal y busca errores que impidan que funcione (lógica, casos límite que el usuario mencionó, archivos que faltan, rutas o nombres que no encajan).',
    test ? `- Si puedes ejecutar las pruebas del proyecto («${test}»), hazlo y cuenta el resultado.` : '- Si hay pruebas o una forma rápida de ejecutar el resultado sin modificar nada, úsala.',
    '- Limítate a la corrección y a lo que se pidió: nada de gustos de estilo, mejoras que nadie pidió ni refactorizaciones. Si funciona y cumple, CUMPLE, aunque lo hubieras hecho de otra forma.',
    '',
    '## Qué debes responder',
    'Primera línea exacta: «VEREDICTO: CUMPLE» o «VEREDICTO: FALLOS».',
    'Si hay fallos, debajo una lista de como mucho 5 fallos concretos, cada uno con el archivo y qué hay que cambiar, en orden de importancia. Solo fallos reales que comprobaste; ninguna suposición. Si cumple, debajo una frase con qué comprobaste.'
  ].join('\n')
}

/**
 * Comprueba el resultado de una tarea con otro agente de otra familia y contexto fresco (en modo plan: solo lectura).
 * Devuelve el veredicto, o null si no toca verificar (tarea de solo texto, «sin revisión», nadie que pueda hacerlo).
 * Si pide correcciones, el autor las hace una vez; después se da por buena con el veredicto que tenga.
 */
async function verifyTask(run: Run, t: Task, exec: AgentConfig, parent: AgentConfig | null, res: RunAgentResult, dir: string): Promise<TaskVerification | null> {
  const meta = run.meta.get(t.id)!
  const owner = parent ?? exec
  const changed = [...meta.touched]
  if (!shouldVerify(run, t, exec, changed)) return null
  const wantsEyes = pagesToShoot(dir, changed).length > 0
  const verifier = pickVerifier(owner, wantsEyes)
  if (!verifier) {
    traceNote(t.id, tr('Sin verificador: ningún otro agente de otra familia disponible'))
    return null
  }
  // La web que tocó la tarea se abre y se captura a tamaño de escritorio y de móvil para que el verificador la vea.
  const ui = wantsEyes && seesImages(verifier) ? await captureUi(dir, changed, t.id.slice(0, 8)) : null
  if (ui) traceNote(t.id, tr('Capturas de la interfaz para la verificación: {v1}{v2}', { v1: ui.shots.map((s) => s.path).join(', '), v2: ui.errors.length ? tr(' · {length} errores al abrirla', { length: ui.errors.length }) : '' }))
  const previous = meta.verification
  const fixes = previous ? previous.fixes + 1 : 0
  t.lastActivity = tr('{name} comprueba el resultado', { name: verifier.name })
  taskDirty(t)
  traceNote(t.id, tr('{name} comprueba el resultado contra la petición{v2}', { name: verifier.name, v2: fixes ? tr(' (tras la corrección)') : '' }))
  workDirty(run, t)
  const wasIdle = !busy.has(verifier.id) && !planningAgents.has(verifier.id) && !integrating.has(verifier.id)
  if (wasIdle) {
    integrating.add(verifier.id)
    setRuntime(verifier.id, { activity: 'working', lastActivity: tr('Verificando «{title}»', { title: t.title }), reason: undefined, waitingFor: undefined })
  }
  const ctrl = run.controllers.get(t.id) ?? new AbortController()
  const start = Date.now()
  const effort = effortFor(verifier.provider, 'medium')
  let out: RunAgentResult
  try {
    out = await runner({
      agent: verifier,
      model: verifier.model,
      effort,
      prompt: buildVerifyPrompt(run, t, owner, verifier, changed, res.text, ui),
      cwd: dir,
      ...(ui ? { images: ui.shots.map((s) => s.path) } : {}),
      mode: 'plan',
      signal: ctrl.signal,
      onRateLimit
    })
  } catch (e) {
    out = { ok: false, text: '', usage: { input: 0, output: 0 }, errorKind: 'failed', errorMessage: (e as Error).message }
  }
  if (wasIdle) {
    integrating.delete(verifier.id)
    if (!busy.has(verifier.id)) setRuntime(verifier.id, { activity: 'idle', lastActivity: tr('Verificó: {title}', { title: t.title }) })
  }
  const stopped = run.cancelled || ctrl.signal.aborted
  const m = out.ok ? VERDICT_RE.exec(out.text) : null
  // Sin veredicto claro no se bloquea nada: se da por buena y se deja constancia.
  const ok = !m || /^(cumple|pass)/i.test(m[1])
  // El veredicto queda en el registro: es la base de «pasó la verificación a la primera» en la calidad por agente.
  logCall(run, 'verify', verifier, verifier.model, out, start, t.id, effort, out.ok && !stopped ? { verdict: ok ? 'pass' : 'fail' } : {})
  recordUsage(verifier.quotaGroupId, out.usage.input + out.usage.output, 1)
  if (stopped) return null
  if (!out.ok) {
    traceNote(t.id, tr('{name} no pudo verificar: {v2}', { name: verifier.name, v2: out.errorMessage ?? 'error' }), true)
    return null
  }
  const notes = clip(out.text.replace(VERDICT_RE, '').trim(), 2500)
  const v: TaskVerification = { by: verifier.id, byName: verifier.name, ok, notes: notes || undefined, fixes }
  meta.verification = v
  t.verification = v
  traceNote(t.id, ok ? tr('{name}: cumple', { name: verifier.name }) : tr('{name} vio fallos: {oneLine}', { name: verifier.name, oneLine: oneLine(notes, 300) }), !ok)
  return v
}

/** El verificador vio fallos: la misma tarea vuelve al autor (al jefe, si la hizo un becario) con lo que hay que corregir. */
function requeueForFix(run: Run, t: Task, exec: AgentConfig, parent: AgentConfig | null, v: TaskVerification): void {
  const meta = run.meta.get(t.id)!
  const owner = parent ?? exec
  meta.fixRequest = v.notes ?? 'El verificador no detalló los fallos: repasa el resultado contra la petición y el criterio de aceptación.'
  meta.forceMainModel = true
  // Corrige en la misma sesión del CLI: recuerda lo que hizo y por qué.
  meta.resume = meta.sessionId
  closeWork(run, t, 'stopped', { text: tr('{byName} comprobó «{title}» y vio fallos; {name} los corrige:\n\n{clip}', { byName: v.byName, title: t.title, name: owner.name, clip: clip(v.notes, 1500) }) })
  if (parent) {
    transfer({ fromId: exec.id, toId: parent.id, label: tr('Corregir: {title}', { title: t.title }), taskId: t.id, payload: { title: t.title, summary: oneLine(v.notes, 200) } })
    removeBecario(exec.id)
    t.agentId = parent.id
  }
  setRuntime(owner.id, { activity: 'idle', taskId: undefined, lastActivity: tr('Corrigiendo: {title}', { title: t.title }) })
  t.status = 'pending'
  t.startedAt = undefined
  t.lastActivity = undefined
  t.progress = undefined
  pushTask(t)
}

async function completeTask(run: Run, t: Task, exec: AgentConfig, parent: AgentConfig | null, res: RunAgentResult): Promise<void> {
  const meta = run.meta.get(t.id)!
  const owner = parent ?? exec
  let text = res.text.trim()
  let savedTo: string | null = null
  if (isTextOnly(exec.provider) && meta.deliverable === 'file' && text) {
    savedTo = store.writeTextArtifact(run.projectId, t.title, text)
    meta.touched.add(savedTo)
  }
  const arts = await collectArtifacts(run, t, owner)
  if (!text) text = arts.length ? tr('Tarea completada.') : tr('Tarea completada (sin texto de respuesta).')

  t.status = 'done'
  t.result = clip(text, RESULT_KEEP)
  t.usage = res.usage
  t.finishedAt = Date.now()
  if (t.progress != null) t.progress = 1
  t.artifactIds = [...new Set([...t.artifactIds, ...arts.map((a) => a.id)])]
  pushTask(t)
  emit({ kind: 'task.completed', taskId: t.id, agentId: exec.id })

  const files = arts.map((a) => a.relPath)
  transfer({
    fromId: exec.id,
    toId: parent ? parent.id : 'core',
    label: tr('Resultado: {title}', { title: t.title }),
    taskId: t.id,
    payload: { title: t.title, summary: oneLine(text, 200), files }
  })
  const v = meta.verification
  const verified = v
    ? `\n\n${v.ok ? tr('✔ {byName} comprobó el resultado{v2}: cumple.', { byName: v.byName, v2: v.fixes ? tr(' tras una corrección') : '' }) : tr('⚠ {byName} comprobó el resultado tras la corrección y sigue viendo fallos: {clip}', { byName: v.byName, clip: clip(v.notes, 800) })}`
    : ''
  const msgText = (savedTo ? tr('Guardé el resultado de «{title}» en `{savedTo}`.\n\n{clip}', { title: t.title, savedTo, clip: clip(text, 600) }) : clip(text, 8000)) + verified
  const delivered = arts.length ? { artifactIds: arts.map((a) => a.id) } : {}
  if (!closeWork(run, t, 'done', { text: msgText, ...delivered }, !!res.text.trim())) agentMessage(run, owner.id, msgText, delivered)

  // Lo que el agente dejó «Para la memoria»: provisional hasta que el usuario lo confirme.
  for (const n of parseMemoryNotes(res.text)) {
    addMemory(
      run.projectId,
      { kind: n.kind, text: n.text },
      { status: 'provisional', by: owner.id, byName: owner.name, taskId: t.id, taskTitle: t.title, runId: run.id, replaces: n.replaces }
    )
  }
  if (v && !v.ok) {
    addInbox({
      kind: 'verify-failed',
      key: `verify:${t.id}`,
      title: tr('{byName} sigue viendo fallos en «{title}» tras la corrección', { byName: v.byName, title: t.title }),
      detail: clip(v.notes, 1500),
      projectId: run.projectId,
      runId: run.id,
      taskId: t.id,
      agentId: owner.id,
      actions: [...(t.changes ? [{ id: 'undo', label: tr('Deshacer la tarea') }] : []), { id: 'dismiss', label: tr('Lo reviso yo') }]
    })
    addMemory(
      run.projectId,
      { kind: 'pending', text: tr('«{title}»: {byName} aún veía fallos tras la corrección: {oneLine}', { title: t.title, byName: v.byName, oneLine: oneLine(v.notes, 250) }) },
      { status: 'provisional', by: v.by, byName: v.byName, taskId: t.id, taskTitle: t.title, runId: run.id }
    )
  }
  warnOutOfScope(run, t, owner, files)
  setRuntime(exec.id, { activity: 'idle', taskId: undefined, lastActivity: tr('Terminó: {title}', { title: t.title }), context: undefined })
  if (parent) removeBecario(exec.id)
}

/** Archivos que la tarea cambió fuera de los suyos («files» del plan): se avisa (no se deshace nada). */
function warnOutOfScope(run: Run, t: Task, owner: AgentConfig, changed: string[]): void {
  const outside = outsideScope(changed, t.files ?? [])
  if (!outside.length) return
  t.outOfScope = outside.slice(0, 20)
  pushTask(t)
  // De quién eran (otra tarea de la misma petición que los declaró suyos).
  const others = run.taskIds.map((id) => tasks.get(id)).filter((o): o is Task => !!o && o.id !== t.id && !!o.files?.length)
  const desc = t.outOfScope.map((f) => {
    const theirs = others.find((o) => outsideScope([f], o.files!).length === 0)
    return `\`${f}\`${theirs ? ` (de «${theirs.title}»)` : ''}`
  })
  const more = outside.length > t.outOfScope.length ? ` y ${outside.length - t.outOfScope.length} más` : ''
  const text = tr('Aviso: {name} cambió archivos que no eran de su tarea «{title}»: {v3}{more}. Revísalos si algo no encaja.', { name: owner.name, title: t.title, v3: desc.join(', '), more })
  systemMessage(run, text, 'error')
  traceNote(t.id, tr('Cambió archivos fuera de su tarea: {v1}{more}', { v1: t.outOfScope.join(', '), more }), true)
}

/** Si el agente declaró que no pudo hacer la tarea («BLOQUEADA: motivo»), devuelve el motivo. */
export function blockedReason(text: string): string | null {
  const m = /^[\s>*_#`]*BLOQUEADA\s*[:.\-–—]\s*([\s\S]*)/i.exec(text ?? '')
  if (!m) return null
  const reason = m[1].replace(/^[*_`\s]+/, '').replace(/\s+/g, ' ').trim()
  return clip(reason ? tr('Bloqueada: {reason}', { reason }) : tr('Bloqueada: el agente no pudo hacer la tarea'), 400)
}

function handleFailure(run: Run, t: Task, exec: AgentConfig, parent: AgentConfig | null, res: RunAgentResult): void {
  const meta = run.meta.get(t.id)!
  const owner = parent ?? exec
  const kind = res.errorKind ?? 'failed'
  const msg = res.errorMessage ?? tr('Error desconocido')

  // Light model rejected by the CLI → same task on the parent with its main model.
  // Modelo rechazado por el CLI (p. ej. no disponible para tu cuenta) → se reintenta un nivel más abajo.
  if (res.modelUnavailable && t.model && t.model === owner.model && !meta.forceCliDefault && !parent) {
    meta.forceCliDefault = true
    console.warn(`[cowork] modelo habitual ${t.model} de ${owner.id} rechazado: ${msg}`)
    closeWork(run, t, 'stopped', { text: tr('El modelo {model} no está disponible: lo repito con el predeterminado.', { model: t.model }) })
    setRuntime(exec.id, { activity: 'idle', taskId: undefined, lastActivity: tr('Cambiando al modelo predeterminado') })
    t.status = 'pending'
    t.startedAt = undefined
    t.lastActivity = undefined
    t.progress = undefined
    pushTask(t)
    return
  }
  if (res.modelUnavailable && !meta.forceMainModel && t.model && (t.model === owner.lightModel || t.model === owner.strongModel)) {
    meta.forceMainModel = true
    if (t.model === owner.lightModel) lightModelBroken.add(owner.id)
    else strongModelBroken.add(owner.id)
    console.warn(`[cowork] light model ${t.model} of ${owner.id} rejected: ${msg}`)
    closeWork(run, t, 'stopped', { text: tr('El modelo {model} no está disponible: lo repito con el principal.', { model: t.model }) })
    if (parent) {
      transfer({ fromId: exec.id, toId: parent.id, label: tr('Devuelta: {title}', { title: t.title }), taskId: t.id, payload: { title: t.title, summary: msg } })
      setRuntime(exec.id, { activity: 'error', taskId: undefined, reason: msg })
      removeBecario(exec.id)
      t.agentId = parent.id
    } else {
      setRuntime(exec.id, { activity: 'idle', taskId: undefined, lastActivity: tr('Cambiando al modelo principal') })
    }
    t.status = 'pending'
    t.startedAt = undefined
    t.lastActivity = undefined
    t.progress = undefined
    pushTask(t)
    return
  }

  if (BLOCKING_KINDS.includes(kind)) blockAgent(exec, kind, msg)
  setRuntime(exec.id, {
    activity: kind === 'offline' || kind === 'missing' ? 'offline' : 'error',
    reason: msg,
    taskId: undefined,
    lastActivity: tr('Falló: {title}', { title: t.title }),
    context: undefined
  })
  // Antes de dar la tarea por fallida, otro agente lo intenta una vez. Si el problema es del agente
  // (cuota, sesión, CLI ausente) pasa al mejor compañero. Si no pudo hacerla (error o «BLOQUEADA»),
  // el becario se la devuelve a su jefe, que la hace con su modelo principal; sin jefe, pasa al mejor compañero.
  let alt: AgentConfig | null = null
  let noStrongAlt = false
  // Un mensaje directo no pasa a otro agente: era para este.
  if (!t.direct && !meta.retried && (BLOCKING_KINDS.includes(kind) || kind === 'failed')) {
    if (kind === 'failed' && parent && usable(parent)) alt = parent
    else {
      // El relevo de una tarea que no es fácil va a otro agente fuerte, nunca al modelo local (lento y ligero):
      // si no hay ninguno libre, se dice en vez de pasársela a quien casi seguro también fallará.
      const exclude = new Set([owner.id, exec.id])
      if (t.difficulty !== 'easy' && !isLocalProvider(owner.provider)) {
        for (const a of workers()) if (isLocalProvider(a.provider)) exclude.add(a.id)
      }
      alt = bestAgentFor(`${t.title} ${t.description}`, exclude)
      noStrongAlt = !alt && exclude.size > 2
    }
  }
  const failText = tr('No pude completar «{title}»: {msg}{v3}', { title: t.title, msg, v3: alt ? tr(' Se la paso a {name}.', { name: alt.name }) : noStrongAlt ? tr(' No hay otro agente fuerte libre para relevarme (el modelo local no sirve para esta tarea): pídemela de nuevo cuando quieras.') : '' })
  if (!closeWork(run, t, 'failed', { text: failText, tone: 'error' })) agentMessage(run, owner.id, failText, { tone: 'error' })
  if (alt) {
    meta.retried = true
    meta.forceMainModel = alt.id === parent?.id
    reassign(t, exec.id, alt, owner.id)
    if (parent) removeBecario(exec.id)
    return
  }

  t.status = 'failed'
  t.error = msg
  t.finishedAt = Date.now()
  pushTask(t)
  cancelDependents(run, t.id)
  if (parent) removeBecario(exec.id)
  addInbox({
    kind: 'failed',
    key: `failed:${t.id}`,
    title: tr('No se pudo hacer «{title}»', { title: t.title }),
    detail: msg,
    projectId: run.projectId,
    runId: run.id,
    taskId: t.id,
    agentId: owner.id,
    actions: [{ id: 'dismiss', label: tr('Entendido') }]
  })
}

// ---------- finishing ----------

/** Anota en el registro de consumo una llamada a un agente (también si falló o se canceló: gastó igual). */
function logCall(
  run: Run,
  kind: 'plan' | 'task' | 'verify',
  agent: AgentConfig,
  model: string | undefined,
  res: RunAgentResult,
  startedAt: number,
  taskId?: string,
  effort?: Effort,
  extra: Pick<UsageCall, 'difficulty' | 'verdict'> = {}
): void {
  recordCall(run.id, {
    ...extra,
    ts: Date.now(),
    kind,
    taskId,
    agentId: agent.id,
    agentName: agent.name,
    provider: agent.provider,
    model: model || undefined,
    effort,
    input: res.usage.input,
    output: res.usage.output,
    cached: res.usage.cached ?? 0,
    durationMs: Date.now() - startedAt,
    ok: res.ok,
    cancelled: res.errorKind === 'cancelled' || undefined,
    // Hermes, Muse Code y los agentes de catálogo no informan de los tokens que gastan.
    noTokens: agent.provider === 'hermes' || agent.provider === 'muse' || agent.provider === 'cli' || undefined
  })
}

/** Cierra la petición en el registro de consumo y mide la cuota al terminar. */
function usageEnded(run: Run, status: 'ok' | 'failed' | 'cancelled', measureQuota = true): void {
  const ts = run.taskIds.map((id) => tasks.get(id)).filter((t): t is Task => !!t)
  finishRunUsage(run.id, status, ts.length, ts.filter((t) => t.status === 'done').length)
  if (measureQuota) void freshQuotaSnapshot(20_000).then((snap) => setRunQuota(run.id, 'after', snap))
}

async function checkRunFinished(run: Run): Promise<void> {
  if (run.finished || run.cancelled || run.planning) return
  const ts = run.taskIds.map((id) => tasks.get(id)).filter((t): t is Task => !!t)
  if (ts.some((t) => t.status === 'pending' || t.status === 'blocked' || t.status === 'running')) return
  await finishRun(run)
}

async function finishRun(run: Run, forcedOk?: boolean): Promise<void> {
  if (run.finished) return
  run.finished = true
  run.planning = false
  const ts = run.taskIds.map((id) => tasks.get(id)).filter((t): t is Task => !!t)
  const done = ts.filter((t) => t.status === 'done')
  const ok = forcedOk ?? (ts.length > 0 && ts.every((t) => t.status === 'done'))
  usageEnded(run, ok ? 'ok' : 'failed')
  if (done.length >= 2) await integrate(run, ts)
  if (!run.cancelled) {
    emit({ kind: 'run.finished', runId: run.id, projectId: run.projectId, ok })
    runInbox(run, ok)
  }
  cleanupRun(run)
  schedule()
}

/**
 * Al acabar un plan de varias tareas, el coordinador redacta la respuesta a la petición con todos los resultados
 * delante: qué se hizo, cómo probarlo, qué quedó fuera y qué decisiones se tomaron. Antes solo salía la lista de ✓.
 * '' si no pudo (entonces se queda la lista).
 */
async function finalAnswer(run: Run, planner: AgentConfig, ts: Task[]): Promise<string> {
  const st = store.getProject(run.projectId)
  const results = ts.map((t) => {
    const files = t.artifactIds.map((id) => st.artifacts.find((a) => a.id === id)?.relPath).filter((p): p is string => !!p)
    const state = t.status === 'done' ? 'hecha' : t.status === 'cancelled' ? `cancelada${t.error ? ` (${t.error})` : ''}` : `falló: ${t.error ?? ''}`
    const v = t.verification ? `\nVerificación de ${t.verification.byName}: ${t.verification.ok ? 'cumple' : `vio fallos: ${oneLine(t.verification.notes, 300)}`}` : ''
    return `### «${t.title}» (${agentName(liveOwner(t))}, ${state})\n${clip(t.result, RESULT_KEEP) || t.error || '(sin texto)'}${files.length ? `\nArchivos: ${files.join(', ')}` : ''}${v}`
  })
  const prompt = [
    `Eres ${planner.name}, el coordinador del equipo de agentes del proyecto "${st.project.name}". El equipo ha terminado la petición del usuario y tú le respondes. ${replyLanguage()}`,
    '',
    '## Petición del usuario',
    run.userText,
    '',
    '## Lo que hizo cada tarea',
    ...results,
    '',
    '## Qué debes responder',
    'Redacta la respuesta final para el usuario, como si hubieras hecho tú el trabajo con tu equipo: qué se ha hecho y dónde está (archivos, rutas), cómo probarlo o usarlo, qué decisiones se tomaron que le convenga saber, y qué quedó fuera, falló o conviene revisar (sin esconder nada). Si el trabajo fue «a dos manos» (opción A y opción B con un juez), di dónde está cada opción, cuál recomienda el juez y por qué, y que puede pedir que se siga con la otra. Entre 5 y 20 líneas, en Markdown sencillo, sin listas de tareas ni de agentes (eso ya lo ve), sin inventar nada que no esté arriba. Solo el texto de la respuesta, sin títulos ni preámbulos.'
  ].join('\n')
  const ctrl = new AbortController()
  run.planController = ctrl
  const start = Date.now()
  let res: RunAgentResult
  try {
    res = await runner({ agent: planner, model: planner.model, effort: planEffortFor(planner.provider), prompt, cwd: store.workRoot(run.projectId), mode: 'plan', signal: ctrl.signal, onRateLimit })
  } catch (e) {
    res = { ok: false, text: '', usage: { input: 0, output: 0 }, errorKind: 'failed', errorMessage: (e as Error).message }
  }
  run.planController = undefined
  logCall(run, 'plan', planner, planner.model, res, start, undefined, planEffortFor(planner.provider))
  recordUsage(planner.quotaGroupId, res.usage.input + res.usage.output, 1)
  if (!res.ok || run.cancelled) return ''
  // Si contestó con el JSON del plan por costumbre, se saca el texto de "reply".
  const parsed = parsePlan(res.text)
  const text = (parsed.valid ? parsed.reply : res.text).trim()
  return text.length >= 20 ? clip(text, 6000) : ''
}

async function integrate(run: Run, ts: Task[]): Promise<void> {
  const planner = findAgent(run.plannerId)
  const canMove =
    !!planner &&
    !busy.has(planner.id) &&
    !isBlocked(planner.id) &&
    !presence.get(planner.id) &&
    !integrating.has(planner.id) &&
    !planningAgents.has(planner.id)
  if (planner && canMove) {
    integrating.add(planner.id)
    emit({ kind: 'agent.moved', agentId: planner.id, to: 'core', reason: tr('Integrando resultados') })
    setRuntime(planner.id, { activity: 'working', location: 'core', lastActivity: tr('Integrando resultados'), taskId: undefined, waitingFor: undefined })
  }

  const st = store.getProject(run.projectId)
  const lines: string[] = [tr('**Resumen del trabajo**'), '']
  for (const t of ts) {
    const who = agentName(liveOwner(t))
    if (t.status === 'done') lines.push(`✓ ${t.title} — ${who}`)
    else if (t.status === 'cancelled') lines.push(`✗ ${t.title} — cancelada${t.error ? ` (${t.error})` : ''}`)
    else lines.push(`✗ ${t.title} — ${who}: ${t.error ?? 'falló'}`)
  }
  // Los archivos van juntos en una carpeta desplegable bajo el resumen (no uno detrás de otro en el texto).
  const artifactIds = [...new Set(ts.flatMap((t) => t.artifactIds))].filter((id) => st.artifacts.some((a) => a.id === id))
  // La respuesta de verdad a la petición, redactada con todos los resultados delante; la lista de ✓ queda debajo.
  const started = Date.now()
  const answer = planner && canMove ? await finalAnswer(run, planner, ts) : ''
  const text = answer ? `${answer}\n\n${lines.join('\n')}` : lines.join('\n')
  if (planner) agentMessage(run, planner.id, text, artifactIds.length ? { artifactIds } : {})
  else systemMessage(run, text)

  await new Promise((r) => setTimeout(r, Math.max(0, INTEGRATION_MS - (Date.now() - started))))
  if (planner && canMove) {
    emit({ kind: 'agent.moved', agentId: planner.id, to: 'station' })
    integrating.delete(planner.id)
    if (!busy.has(planner.id)) setRuntime(planner.id, { activity: 'idle', location: 'station', lastActivity: tr('Resultados integrados') })
    else setRuntime(planner.id, { location: 'station' })
  }
}

/** Re-check presence (fresh) — used by refreshQuotas. */
/**
 * «Reiniciar agente» tras un fallo: olvida su bloqueo (cuota, sesión, error de la API) y los modelos que se le
 * dieron por rotos, vuelve a comprobar que su CLI responde (sin llamadas de pago) y, si está libre, queda
 * disponible; lo que esperaba por él puede empezar ya. Si está trabajando no se toca: para eso está «Detener».
 */
export async function resetAgent(id: AgentId): Promise<AgentRuntime> {
  const a = findAgent(id)
  if (!a) throw new Error(tr('No existe ese agente'))
  const target = ownerOf(a)
  blocked.delete(target.id)
  lightModelBroken.delete(target.id)
  strongModelBroken.delete(target.id)
  if (!busy.has(target.id)) setRuntime(target.id, { activity: 'idle', reason: undefined, taskId: undefined, waitingFor: undefined, lastActivity: tr('Reiniciado') })
  try {
    applyPresence(target, await presenceCheck(target, true))
  } catch (e) {
    console.error('[cowork] presence check failed', target.id, e)
  }
  schedule()
  return { ...getRuntime(target.id) }
}

export async function refreshPresence(): Promise<void> {
  await checkPresence(true)
}

/** Ejecución en curso de un proyecto (para mostrar «Detener» al volver a él). */
export function activeRunFor(projectId: string): string | undefined {
  for (const r of runs.values()) if (r.projectId === projectId && !r.finished) return r.id
  return undefined
}

/** Todas las peticiones en marcha de un proyecto, de la más antigua a la más reciente. */
export function activeRunsFor(projectId: string): string[] {
  return [...runs.values()].filter((r) => r.projectId === projectId && !r.finished).map((r) => r.id)
}

/**
 * En qué está una petición (para las rutinas): trabajando, con su plan esperando tu visto bueno, o null si ya
 * terminó (o se descartó su plan).
 */
export function runState(projectId: string, runId: string): 'running' | 'waiting' | null {
  const msgs = store.getProject(projectId).messages
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.runId === runId && m.proposal?.status === 'pending') return 'waiting'
  }
  const r = runs.get(runId)
  return r && !r.finished ? 'running' : null
}

export function activeRunIds(): string[] {
  return [...runs.keys()]
}

