import { create } from 'zustand'
import type {
  InboxItem,
  AgentConfig,
  AgentId,
  AgentRuntime,
  AppConfig,
  Artifact,
  Attachment,
  ChatMessage,
  CoworkEvent,
  LocalPullState,
  MemoryEntry,
  ProjectState,
  ProjectSummary,
  QuotaInfo,
  Routine,
  SetupToolId,
  Task,
  TraceEntry,
  Transfer,
  UsageRun
} from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/defaults'
import { sceneBus } from '@/lib/bus'
import { api } from '@/lib/api'
import { playSfx, playVoice, voiceProfile } from '@/lib/audio'
import { createEventAudio } from '@/lib/audioEvents'
import { t } from '@/lib/i18n'

export type Mode = 'live' | 'demo'

/** Conjunto de datos que pinta la interfaz. Hay uno para datos reales y otro para la demo. */
export interface DataSlice {
  agents: Record<AgentId, AgentConfig>
  agentOrder: AgentId[]
  runtimes: Record<AgentId, AgentRuntime>
  tasks: Record<string, Task>
  messages: ChatMessage[]
  artifacts: Record<string, Artifact>
  attachments: Attachment[]
  /** Transferencias recientes (las más nuevas al final). */
  transfers: Transfer[]
  quotas: QuotaInfo[]
  /** La petición en marcha más reciente (null si no hay ninguna). */
  activeRunId: string | null
  /** Todas las peticiones en marcha del proyecto, de la más antigua a la más reciente. */
  activeRunIds: string[]
  /** Memoria del proyecto (decisiones, hechos, preferencias y pendientes). */
  memory: MemoryEntry[]
  /** Instrucciones del usuario para todos los agentes del proyecto. */
  instructions: string
  /** Rutinas del proyecto (sin el secreto de los webhooks). En la demo, siempre vacío. */
  routines: Routine[]
  project: ProjectSummary | null
  /** Conversación abierta del proyecto (id y título; null en la demo o en proyectos que aún no la tienen). */
  conversation: { id: string; title: string; createdAt: number } | null
}

export type Selection =
  | { type: 'agent'; id: AgentId }
  | { type: 'transfer'; id: string }
  | { type: 'station'; id: string }
  | null

export type CameraCommand =
  | { type: 'overview'; nonce: number }
  | { type: 'zoom'; dir: 1 | -1; nonce: number }
  | { type: 'focus'; x: number; z: number; nonce: number }

export type LeftTab = 'chat' | 'files' | 'tasks' | 'results' | 'memory' | 'routines'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type CameraInput = DistributiveOmit<CameraCommand, 'nonce'>

interface CoworkState {
  mode: Mode
  hasBackend: boolean
  config: AppConfig
  live: DataSlice
  demo: DataSlice
  projects: ProjectSummary[]
  /** Descarga de modelo local en curso (o la última terminada). */
  localPull: LocalPullState | null
  /** Bandeja «Te necesita»: avisos abiertos (de todos los proyectos), del más reciente al más antiguo. */
  inbox: InboxItem[]
  /** Ya llegó la configuración real del motor (antes solo hay valores por defecto). */
  configLoaded: boolean
  /** Asistente de configuración abierto a mano (en el primer arranque se abre solo). */
  setupOpen: boolean
  /** Salida de las instalaciones del asistente (últimas líneas). */
  setupLog: { toolId: SetupToolId; line: string }[]
  /** Salida de la actualización en curso (últimas líneas). */
  updateLog: string[]
  /** Se pidió reiniciar la app: se muestra «Reiniciando…» hasta que vuelva. */
  restarting: boolean
  /** Registro de consumo por petición (runId → uso), para el panel de consumo y el resumen de cada plan. */
  usageRuns: Record<string, UsageRun>
  /** Panel ⚙ → Consumo abierto (también desde el resumen de cada plan). */
  usageOpen: boolean
  /** Panel ⚙ → Cómo rinde cada agente (calidad por agente y dificultad). */
  qualityOpen: boolean
  /** Ventana del modelo de Hermes («/model» en el chat o su panel en el espacio). */
  hermesModelOpen: boolean
  /** Ventana con lo que hace el agente en una tarea (paso a paso, en directo). */
  trace: TraceView | null
  /** Sube cada vez que cambian las conversaciones o los proyectos (la barra lateral vuelve a pedir sus listas). */
  conversationsTick: number
  /** Buscador (Ctrl+K) abierto. */
  searchOpen: boolean
  /** Ventana estrecha: la barra lateral abierta por encima del chat (en ventanas anchas siempre está). */
  drawerOpen: boolean

  // Interfaz
  selection: Selection
  leftTab: LeftTab
  viewerArtifactId: string | null
  reducedEffects: boolean
  spaceExpanded: boolean
  /** En pantallas pequeñas: qué vista ocupa la pantalla. */
  mobileView: 'chat' | 'space'
  camera: CameraCommand | null

  applyEvent(e: CoworkEvent): void
  setMode(mode: Mode): void
  resetDemoSlice(): void
  hydrateLive(config: AppConfig, runtimes: AgentRuntime[], quotas: QuotaInfo[]): void
  loadProjectState(state: ProjectState): void
  setProjects(p: ProjectSummary[]): void
  select(s: Selection): void
  setLeftTab(t: LeftTab): void
  openViewer(artifactId: string | null): void
  setReducedEffects(v: boolean): void
  setSpaceExpanded(v: boolean): void
  setMobileView(v: 'chat' | 'space'): void
  cameraCommand(c: CameraInput): void
  openSetup(open: boolean): void
  /** Abre (o cierra con null) la ventana de lo que hace el agente en una tarea. */
  openTrace(taskId: string | null): void
}

export interface TraceView {
  taskId: string
  entries: TraceEntry[]
  loading: boolean
}

const MAX_TRACE = 800

/** Añade o actualiza (mismo id) un paso del registro. */
function mergeTrace(entries: TraceEntry[], e: TraceEntry): TraceEntry[] {
  const i = entries.findIndex((x) => x.id === e.id)
  if (i !== -1) return entries.map((x, j) => (j === i ? e : x))
  const next = [...entries, e]
  return next.length > MAX_TRACE ? next.slice(-MAX_TRACE) : next
}

export function emptySlice(config: AppConfig, offlineReason?: string): DataSlice {
  const agents: Record<AgentId, AgentConfig> = {}
  const runtimes: Record<AgentId, AgentRuntime> = {}
  for (const a of config.agents) {
    if (!a.enabled) continue
    agents[a.id] = a
    runtimes[a.id] = offlineReason
      ? { agentId: a.id, activity: 'offline', reason: offlineReason, location: 'station' }
      : { agentId: a.id, activity: 'idle', location: 'station' }
  }
  return {
    agents,
    agentOrder: Object.keys(agents),
    runtimes,
    tasks: {},
    messages: [],
    artifacts: {},
    attachments: [],
    transfers: [],
    quotas: [],
    activeRunId: null,
    activeRunIds: [],
    memory: [],
    instructions: '',
    routines: [],
    project: null,
    conversation: null
  }
}

const MAX_TRANSFERS = 40
const eventAudio = createEventAudio(playSfx, (who, text, error) => playVoice(who.id, voiceProfile(who.provider, who.becario), text, { error }))
const seen = new Set<string>()
const seenOrder: string[] = []

function markSeen(id: string): boolean {
  if (seen.has(id)) return false
  seen.add(id)
  seenOrder.push(id)
  if (seenOrder.length > 5000) seen.delete(seenOrder.shift()!)
  return true
}

/** Aplica un evento a un slice y devuelve el slice nuevo (inmutable). */
function reduce(d: DataSlice, e: CoworkEvent): DataSlice {
  switch (e.kind) {
    case 'agent.runtime':
      return { ...d, runtimes: { ...d.runtimes, [e.runtime.agentId]: e.runtime } }
    case 'agent.spawned': {
      const order = d.agentOrder.includes(e.agent.id) ? d.agentOrder : [...d.agentOrder, e.agent.id]
      return {
        ...d,
        agents: { ...d.agents, [e.agent.id]: e.agent },
        agentOrder: order,
        runtimes: {
          ...d.runtimes,
          [e.agent.id]: d.runtimes[e.agent.id] ?? { agentId: e.agent.id, activity: 'idle', location: 'station' }
        }
      }
    }
    case 'agent.removed': {
      const agents = { ...d.agents }
      const runtimes = { ...d.runtimes }
      delete agents[e.agentId]
      delete runtimes[e.agentId]
      return { ...d, agents, runtimes, agentOrder: d.agentOrder.filter((id) => id !== e.agentId) }
    }
    case 'agent.moved': {
      const rt = d.runtimes[e.agentId]
      if (!rt) return d
      return { ...d, runtimes: { ...d.runtimes, [e.agentId]: { ...rt, location: e.to } } }
    }
    case 'task.upsert':
      return { ...d, tasks: { ...d.tasks, [e.task.id]: e.task } }
    case 'task.completed':
      return d
    case 'transfer.started': {
      const transfers = [...d.transfers, e.transfer]
      if (transfers.length > MAX_TRANSFERS) transfers.splice(0, transfers.length - MAX_TRANSFERS)
      return { ...d, transfers }
    }
    case 'message.upsert': {
      const i = d.messages.findIndex((m) => m.id === e.message.id)
      const messages = i === -1 ? [...d.messages, e.message] : d.messages.map((m, j) => (j === i ? e.message : m))
      return { ...d, messages }
    }
    case 'message.delta': {
      const messages = d.messages.map((m) => (m.id === e.messageId ? { ...m, text: m.text + e.text } : m))
      return { ...d, messages }
    }
    case 'artifact.created':
      return { ...d, artifacts: { ...d.artifacts, [e.artifact.id]: e.artifact } }
    case 'quota.update':
      return { ...d, quotas: e.quotas }
    case 'run.started': {
      const activeRunIds = d.activeRunIds.includes(e.runId) ? d.activeRunIds : [...d.activeRunIds, e.runId]
      return { ...d, activeRunId: e.runId, activeRunIds }
    }
    case 'run.finished': {
      // Si sigue otra petición en marcha, «Detener» sigue a la vista para ella.
      const activeRunIds = d.activeRunIds.filter((id) => id !== e.runId)
      return { ...d, activeRunIds, activeRunId: activeRunIds[activeRunIds.length - 1] ?? null }
    }
    case 'memory.updated':
      return { ...d, memory: e.memory, instructions: e.instructions }
    case 'routines.updated':
      return { ...d, routines: e.routines }
    case 'chat.cleared': {
      // Conversación nueva: fuera los mensajes y las tareas terminadas (las pendientes se quedan).
      const tasks: Record<string, Task> = {}
      for (const t of Object.values(d.tasks)) if (t.status !== 'done' && t.status !== 'failed' && t.status !== 'cancelled') tasks[t.id] = t
      return { ...d, messages: [], tasks }
    }
    case 'local.pull':
    case 'setup.log':
    case 'update.log':
    case 'config.updated':
    case 'usage.run':
    case 'task.trace':
    case 'project.deleted':
    case 'inbox.updated':
    case 'conversations.updated':
      return d
  }
}

/** Proyecto al que pertenece un evento (los de agentes y cuotas son de todo el equipo). */
function eventProject(e: CoworkEvent): string | undefined {
  switch (e.kind) {
    case 'message.upsert':
      return e.message.projectId
    case 'task.upsert':
      return e.task.projectId
    case 'artifact.created':
      return e.artifact.projectId
    case 'run.started':
    case 'run.finished':
    case 'chat.cleared':
    case 'memory.updated':
    case 'routines.updated':
      return e.projectId
    default:
      return undefined
  }
}

const LAST_PROJECT_KEY = 'aicowork.lastProject'

/** Último proyecto abierto (para volver a él al arrancar). */
export function lastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY)
  } catch {
    return null
  }
}

function rememberProject(id: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id)
  } catch {
    // Sin almacenamiento: se abrirá el más reciente.
  }
}

const prefersReduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const useCowork = create<CoworkState>((set, get) => ({
  mode: api ? 'live' : 'demo',
  hasBackend: !!api,
  config: DEFAULT_CONFIG,
  live: emptySlice(DEFAULT_CONFIG, api ? undefined : t('Sin motor de agentes')),
  demo: emptySlice(DEFAULT_CONFIG),
  projects: [],
  localPull: null,
  inbox: [],
  configLoaded: false,
  setupOpen: false,
  setupLog: [],
  updateLog: [],
  restarting: false,
  usageRuns: {},
  usageOpen: false,
  qualityOpen: false,
  hermesModelOpen: false,
  trace: null,
  conversationsTick: 0,
  searchOpen: false,
  drawerOpen: false,

  selection: null,
  leftTab: 'chat',
  viewerArtifactId: null,
  reducedEffects: !!prefersReduced,
  spaceExpanded: false,
  mobileView: 'chat',
  camera: null,

  applyEvent(e) {
    if (!markSeen(e.id)) return
    if (e.kind === 'local.pull') {
      set({ localPull: e.pull })
      return
    }
    if (e.kind === 'inbox.updated') {
      set({ inbox: e.items })
      return
    }
    if (e.kind === 'project.deleted') {
      set((s) => ({ projects: s.projects.filter((p) => p.id !== e.projectId) }))
      // Era el proyecto abierto (aquí o desde otro dispositivo): se pasa al más reciente que quede.
      const a = api
      if (get().live.project?.id === e.projectId && a) {
        set({ trace: null, selection: null })
        void (async () => {
          const list = await a.listProjects()
          set({ projects: list })
          if (list[0]) get().loadProjectState(await a.loadProject(list[0].id))
        })().catch((err) => console.error('[cowork] no se pudo abrir otro proyecto', err))
      }
      return
    }
    if (e.kind === 'conversations.updated') {
      set((s) => ({ conversationsTick: s.conversationsTick + 1 }))
      return
    }
    if (e.kind === 'chat.cleared' && !e.demo && e.conversationId) {
      // Se cambió de conversación (aquí o en otro dispositivo): si es el proyecto abierto, se carga la que quedó abierta.
      const a = api
      const cur = get().live
      if (a && cur.project?.id === e.projectId && cur.conversation?.id !== e.conversationId) {
        void a.loadProject(e.projectId).then((st) => get().loadProjectState(st), () => undefined)
      }
      set((s) => ({ conversationsTick: s.conversationsTick + 1 }))
      return
    }
    if (e.kind === 'task.trace') {
      const tr = get().trace
      if (tr && tr.taskId === e.taskId) set({ trace: { ...tr, entries: mergeTrace(tr.entries, e.entry) } })
      return
    }
    if (e.kind === 'usage.run') {
      set((s) => ({ usageRuns: { ...s.usageRuns, [e.run.runId]: e.run } }))
      return
    }
    if (e.kind === 'update.log') {
      set((s) => ({ updateLog: [...s.updateLog, e.line].slice(-300) }))
      return
    }
    if (e.kind === 'setup.log') {
      set((s) => ({ setupLog: [...s.setupLog, { toolId: e.toolId, line: e.line }].slice(-400) }))
      return
    }
    if (e.kind === 'config.updated') {
      // Nueva configuración (modelo local cambiado, agentes activados o desactivados…).
      set((s) => {
        const agents: Record<AgentId, AgentConfig> = {}
        const runtimes = { ...s.live.runtimes }
        for (const a of e.config.agents) {
          if (!a.enabled) continue
          agents[a.id] = a
          runtimes[a.id] ??= { agentId: a.id, activity: 'idle', location: 'station' }
        }
        for (const a of Object.values(s.live.agents)) if (a.isSubagent) agents[a.id] = a
        const kept = s.live.agentOrder.filter((id) => agents[id])
        const agentOrder = [...kept, ...Object.keys(agents).filter((id) => !kept.includes(id))]
        return { config: e.config, live: { ...s.live, agents, runtimes, agentOrder } }
      })
      return
    }
    // La barra lateral marca qué proyectos están trabajando: se refresca al empezar y acabar cada petición.
    if ((e.kind === 'run.started' || e.kind === 'run.finished') && !e.demo) set((s) => ({ conversationsTick: s.conversationsTick + 1 }))
    // Con varios proyectos, lo que pasa en otro (que puede seguir trabajando) no entra en el que estás viendo.
    const open = get().live.project?.id
    const pid = eventProject(e)
    if (!e.demo && open && pid && pid !== open) return
    const target = e.demo ? 'demo' : 'live'
    const previous = get()[target]
    set((s) => ({ [target]: reduce(s[target], e) }) as Partial<CoworkState>)
    if ((get().mode === 'demo') === !!e.demo) {
      eventAudio.handle(e, previous)
      sceneBus.emit(e)
    }
  },

  setMode(mode) {
    if (mode === get().mode) return
    set({ mode, selection: null, viewerArtifactId: null })
  },

  resetDemoSlice() {
    eventAudio.resetDemo()
    set((s) => ({ demo: emptySlice(s.config), selection: null }))
  },

  hydrateLive(config, runtimes, quotas) {
    const slice = emptySlice(config)
    for (const r of runtimes) if (slice.agents[r.agentId]) slice.runtimes[r.agentId] = r
    slice.quotas = quotas
    set((s) => ({
      config,
      configLoaded: true,
      live: { ...slice, messages: s.live.messages, tasks: s.live.tasks, artifacts: s.live.artifacts, project: s.live.project },
      demo: emptySlice(config)
    }))
  },

  loadProjectState(state) {
    const previousProjectId = get().live.project?.id
    const tasks: Record<string, Task> = {}
    for (const t of state.tasks) tasks[t.id] = t
    const artifacts: Record<string, Artifact> = {}
    for (const a of state.artifacts) artifacts[a.id] = a
    set((s) => ({
      live: {
        ...s.live,
        project: state.project,
        messages: state.messages,
        tasks,
        artifacts,
        attachments: state.attachments,
        transfers: [],
        activeRunId: state.activeRunId ?? null,
        activeRunIds: state.activeRunIds ?? (state.activeRunId ? [state.activeRunId] : []),
        memory: state.memory ?? [],
        instructions: state.instructions ?? '',
        routines: state.routines ?? [],
        conversation: state.conversation ?? null
      },
      conversationsTick: s.conversationsTick + 1
    }))
    rememberProject(state.project.id)
    if (get().mode === 'live' && previousProjectId && previousProjectId !== state.project.id) playSfx('click')
  },

  setProjects(projects) {
    set({ projects })
  },
  openSetup(setupOpen) {
    set({ setupOpen })
  },
  select(selection) {
    set({ selection })
  },
  setLeftTab(leftTab) {
    set({ leftTab })
  },
  openViewer(viewerArtifactId) {
    set({ viewerArtifactId })
  },
  setReducedEffects(reducedEffects) {
    set({ reducedEffects })
  },
  setSpaceExpanded(spaceExpanded) {
    set({ spaceExpanded })
  },
  setMobileView(mobileView) {
    set({ mobileView })
  },
  cameraCommand(c) {
    set({ camera: { ...c, nonce: performance.now() } as CameraCommand })
  },
  openTrace(taskId) {
    if (!taskId) {
      set({ trace: null })
      return
    }
    const live = !!api && get().mode === 'live'
    set({ trace: { taskId, entries: [], loading: live } })
    if (!live || !api) return
    api.getTaskTrace(taskId).then(
      (list) =>
        set((st) => {
          if (st.trace?.taskId !== taskId) return {}
          // Lo que llegó por eventos mientras tanto es igual o más reciente.
          let entries = list
          for (const e of st.trace.entries) entries = mergeTrace(entries, e)
          return { trace: { taskId, entries, loading: false } }
        }),
      () => set((st) => (st.trace?.taskId === taskId ? { trace: { ...st.trace, loading: false } } : {}))
    )
  }
}))

/** Selector sobre el slice visible (real o demo). */
export function useData<T>(sel: (d: DataSlice) => T): T {
  return useCowork((s) => sel(s[s.mode]))
}

/** Lectura puntual fuera de React (escena, demo). */
export function currentData(): DataSlice {
  const s = useCowork.getState()
  return s[s.mode]
}
