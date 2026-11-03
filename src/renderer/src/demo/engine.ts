// Modo Demo: guion reproducible de eventos simulados (marcados con demo: true).
// No llama a ningún CLI ni API: sirve para ver y probar todas las animaciones.

import type { AgentActivity, AgentConfig, AgentRuntime, Artifact, ChatMessage, CoworkEvent, QuotaInfo, Task, Transfer } from '@shared/types'
import { SUBAGENT_COLOR } from '@shared/defaults'
import { useCowork } from '@/store/cowork'

type Listener = () => void
type EventBody = CoworkEvent extends infer E ? (E extends CoworkEvent ? Omit<E, 'id' | 'ts' | 'demo'> : never) : never

const PROJECT = 'demo'
const RUN = 'demo-run'

let run = 0
let counter = 0
let timers: number[] = []
let running = false
let label = 'Lista para empezar'
const listeners = new Set<Listener>()
const runtimes = new Map<string, AgentRuntime>()
const tasks = new Map<string, Task>()

/** Instantánea estable (compatible con useSyncExternalStore). */
let snapshot = { running, label }

function notify(): void {
  snapshot = { running, label }
  for (const l of listeners) l()
}

function setLabel(l: string): void {
  label = l
  notify()
}

function emit(body: EventBody): void {
  const e = { ...body, id: `demo-${run}-${counter++}`, ts: Date.now(), demo: true } as CoworkEvent
  useCowork.getState().applyEvent(e)
}

function rt(agentId: string, activity: AgentActivity, extra: Partial<AgentRuntime> = {}): void {
  const prev = runtimes.get(agentId) ?? { agentId, activity: 'idle', location: 'station' as const }
  const next: AgentRuntime = {
    agentId,
    activity,
    location: extra.location ?? prev.location,
    taskId: 'taskId' in extra ? extra.taskId : activity === 'idle' ? undefined : prev.taskId,
    waitingFor: activity === 'waiting' ? extra.waitingFor ?? prev.waitingFor : undefined,
    lastActivity: extra.lastActivity ?? prev.lastActivity,
    lastActivityAt: extra.lastActivity ? Date.now() : prev.lastActivityAt ?? Date.now(),
    reason: activity === 'error' || activity === 'offline' ? extra.reason ?? prev.reason : undefined,
    context: extra.context ?? prev.context
  }
  runtimes.set(agentId, next)
  emit({ kind: 'agent.runtime', runtime: next })
}

function task(id: string, patch: Partial<Task>): Task {
  const prev =
    tasks.get(id) ??
    ({
      id,
      projectId: PROJECT,
      runId: RUN,
      title: '',
      description: '',
      agentId: '',
      dependsOn: [],
      status: 'pending',
      difficulty: 'medium',
      createdAt: Date.now(),
      artifactIds: []
    } as Task)
  const next = { ...prev, ...patch }
  tasks.set(id, next)
  emit({ kind: 'task.upsert', task: next })
  return next
}

function transfer(t: Omit<Transfer, 'createdAt'>): void {
  // Id único por ejecución: al repetir la demo cada transferencia vuelve a animarse una sola vez.
  emit({ kind: 'transfer.started', transfer: { ...t, id: `${t.id}-r${run}`, createdAt: Date.now() } })
}

function message(m: Omit<ChatMessage, 'projectId' | 'createdAt'>): void {
  emit({ kind: 'message.upsert', message: { ...m, projectId: PROJECT, createdAt: Date.now() } })
}

function artifact(a: Omit<Artifact, 'projectId' | 'createdAt' | 'size'>): void {
  emit({ kind: 'artifact.created', artifact: { ...a, projectId: PROJECT, createdAt: Date.now(), size: 0 } })
}

const H = 3600_000

function quotas(claude: number, gpt: number, gemini: number): void {
  const now = Date.now()
  const q: QuotaInfo[] = [
    {
      id: 'anthropic', label: 'Claude', kind: 'usage', agentIds: ['claude'], remainingPct: claude, unit: '%',
      period: 'Ventana de 5 h', resetsAt: now + 2.2 * H, updatedAt: now, source: 'demo', note: 'Datos de demostración.'
    },
    {
      id: 'openai', label: 'GPT', kind: 'usage', agentIds: ['codex'], remainingPct: gpt, unit: '%',
      period: 'Ventana semanal', resetsAt: now + 74 * H, updatedAt: now, source: 'demo', note: 'Datos de demostración.'
    },
    {
      id: 'google', label: 'Gemini', kind: 'requests', agentIds: ['gemini'], remainingPct: gemini,
      remaining: Math.round(gemini * 10), limit: 1000, unit: 'solicitudes', period: 'Diario',
      resetsAt: now + 9 * H, updatedAt: now, source: 'demo', usedRequests: 1000 - Math.round(gemini * 10),
      note: 'Datos de demostración.'
    },
    {
      id: 'local', label: 'Local', kind: 'local', agentIds: ['qwen'], remainingPct: null, unlimited: true,
      source: 'demo', updatedAt: now, note: 'Ejecución local en tu PC: sin cuota.'
    }
  ]
  emit({ kind: 'quota.update', quotas: q })
}

const BECARIO: AgentConfig = {
  id: 'claude-becario-1',
  name: 'Becario',
  provider: 'claude',
  model: 'haiku',
  modelLabel: 'Haiku',
  color: SUBAGENT_COLOR,
  stationId: 'st-sub-1',
  role: 'Sub-agente de Claude',
  strengths: [],
  enabled: true,
  quotaGroupId: 'anthropic',
  isSubagent: true,
  parentId: 'claude'
}

interface Step {
  at: number
  run: () => void
}

function script(prompt: string): Step[] {
  const s: Step[] = []
  const at = (sec: number, fn: () => void) => s.push({ at: sec * 1000, run: fn })

  at(0, () => {
    setLabel('Equipo disponible')
    for (const id of ['hermes', 'gemini', 'qwen', 'claude', 'codex']) rt(id, 'idle', { lastActivity: 'Esperando trabajo' })
    quotas(62, 40, 8)
  })

  at(2.2, () => {
    message({
      id: 'demo-msg-user',
      author: { type: 'user' },
      text: prompt,
      attachments: [
        { id: 'demo-att-1', name: 'brief.pdf', relPath: 'demo:brief.pdf', mime: 'application/pdf', size: 482_000 },
        { id: 'demo-att-2', name: 'referencias.png', relPath: 'demo:referencias.png', mime: 'image/png', size: 1_240_000 }
      ]
    })
  })

  at(3, () => {
    setLabel('Planificación')
    emit({ kind: 'run.started', runId: RUN, projectId: PROJECT })
    transfer({ id: 'demo-tr-in', fromId: 'user', toId: 'hermes', label: 'Nueva petición', payload: { title: 'Petición del usuario', summary: prompt, files: ['brief.pdf', 'referencias.png'] } })
  })
  at(4.6, () => rt('hermes', 'thinking', { lastActivity: 'Planificando el trabajo', context: { used: 18_400, capacity: 128_000 } }))

  at(7.2, () => {
    setLabel('Trabajo individual')
    task('t1', { title: 'Analizar requisitos', description: 'Leer el brief y extraer requisitos, público y alcance.', agentId: 'gemini', difficulty: 'medium' })
    task('t2', { title: 'Organizar información', description: 'Ordenar los datos del brief en una tabla de contenidos.', agentId: 'qwen', dependsOn: ['t1'], status: 'blocked', difficulty: 'easy' })
    task('t3', { title: 'Diseñar interfaz', description: 'Proponer la estructura visual y los estilos del prototipo.', agentId: 'claude', dependsOn: ['t1'], status: 'blocked', difficulty: 'hard' })
    task('t4', { title: 'Crear prototipo', description: 'Programar un prototipo HTML navegable a partir del diseño.', agentId: 'codex', dependsOn: ['t3'], status: 'blocked', difficulty: 'medium' })
    message({ id: 'demo-msg-plan', author: { type: 'agent', agentId: 'hermes' }, text: 'He dividido el proyecto en **4 tareas** y las repartí según los puntos fuertes de cada uno.', taskIds: ['t1', 't2', 't3', 't4'] })
    rt('hermes', 'idle', { lastActivity: 'Plan listo' })
    transfer({ id: 'demo-tr-plan', fromId: 'hermes', toId: 'gemini', label: 'Analizar requisitos', taskId: 't1', payload: { title: 'Analizar requisitos', summary: 'Leer el brief y extraer requisitos, público y alcance.' } })
    rt('qwen', 'waiting', { waitingFor: 'gemini', lastActivity: 'Esperando el análisis' })
    rt('claude', 'waiting', { waitingFor: 'gemini', lastActivity: 'Esperando el análisis' })
    rt('codex', 'waiting', { waitingFor: 'claude', lastActivity: 'Esperando el diseño' })
  })
  at(7.8, () => {
    task('t1', { status: 'running', startedAt: Date.now(), lastActivity: 'Leyendo brief.pdf' })
    rt('gemini', 'thinking', { taskId: 't1', lastActivity: 'Leyendo brief.pdf' })
  })
  at(10, () => {
    task('t1', { lastActivity: 'Analizando requisitos' })
    rt('gemini', 'working', { lastActivity: 'Analizando requisitos', context: { used: 92_000, capacity: 1_000_000 } })
  })
  at(12.8, () => {
    task('t1', { lastActivity: 'Resumiendo 48 páginas' })
    rt('gemini', 'working', { lastActivity: 'Resumiendo 48 páginas' })
  })

  at(15.4, () => {
    setLabel('Finalización y delegación')
    artifact({ id: 'demo-art-req', taskId: 't1', agentId: 'gemini', name: 'requisitos.md', relPath: 'demo:requisitos.md', kind: 'markdown' })
    task('t1', { status: 'done', finishedAt: Date.now(), result: 'Requisitos, público objetivo y alcance listos.', artifactIds: ['demo-art-req'], usage: { input: 92_000, output: 3_100 } })
    emit({ kind: 'task.completed', taskId: 't1', agentId: 'gemini' })
    message({ id: 'demo-msg-t1', author: { type: 'agent', agentId: 'gemini' }, text: 'Análisis listo: 12 requisitos y 3 perfiles de usuario.', artifactIds: ['demo-art-req'] })
    rt('gemini', 'idle', { lastActivity: 'Terminó: Analizar requisitos', taskId: undefined })
  })
  at(16.2, () => {
    transfer({ id: 'demo-tr-1', fromId: 'gemini', toId: 'qwen', label: 'Análisis listo', taskId: 't2', payload: { title: 'Analizar requisitos', summary: 'Requisitos, público objetivo y alcance listos.', files: ['requisitos.md'] } })
  })
  at(16.9, () => {
    transfer({ id: 'demo-tr-2', fromId: 'gemini', toId: 'claude', label: 'Requisitos listos', taskId: 't3', payload: { title: 'Analizar requisitos', summary: 'Requisitos, público objetivo y alcance listos.', files: ['requisitos.md'] } })
  })
  at(18.8, () => {
    setLabel('Trabajo en paralelo')
    task('t2', { status: 'running', startedAt: Date.now(), lastActivity: 'Leyendo requisitos' })
    rt('qwen', 'thinking', { taskId: 't2', lastActivity: 'Leyendo requisitos' })
  })
  at(19.6, () => {
    task('t3', { status: 'running', startedAt: Date.now(), lastActivity: 'Revisando referencias.png' })
    rt('claude', 'thinking', { taskId: 't3', lastActivity: 'Revisando referencias.png', context: { used: 24_000, capacity: 200_000 } })
  })
  at(21, () => {
    task('t2', { lastActivity: 'Extrayendo datos clave' })
    rt('qwen', 'working', { lastActivity: 'Extrayendo datos clave' })
  })
  at(22, () => {
    task('t3', { lastActivity: 'Diseñando la interfaz' })
    rt('claude', 'working', { lastActivity: 'Diseñando la interfaz' })
  })

  at(23.4, () => {
    setLabel('Sub-agente (becario)')
    emit({ kind: 'agent.spawned', agent: BECARIO })
    rt(BECARIO.id, 'idle', { lastActivity: 'Creado por Claude' })
  })
  at(24.4, () => {
    task('t5', { title: 'Revisar textos', description: 'Revisar ortografía y tono de los textos.', agentId: BECARIO.id, assignedBy: 'claude', difficulty: 'easy', model: 'haiku' })
    transfer({ id: 'demo-tr-3', fromId: 'claude', toId: BECARIO.id, label: 'Delegada: Revisar textos', taskId: 't5', payload: { title: 'Revisar textos', summary: 'Tarea sencilla: se usa un modelo ligero (Haiku).' } })
  })
  at(26.4, () => {
    task('t5', { status: 'running', startedAt: Date.now(), lastActivity: 'Revisando ortografía' })
    rt(BECARIO.id, 'working', { taskId: 't5', lastActivity: 'Revisando ortografía' })
  })

  at(27.4, () => {
    setLabel('Error y bloqueo')
    task('t2', { lastActivity: 'Bloqueado: memoria insuficiente' })
    rt('qwen', 'error', { reason: 'Memoria insuficiente para el modelo local. Reintentando con menos contexto.', lastActivity: 'Error del modelo local' })
  })
  at(29.2, () => {
    setLabel('Cuota baja')
    quotas(58, 18, 4)
  })
  at(31.4, () => {
    task('t5', { status: 'done', finishedAt: Date.now(), result: 'Textos revisados: 6 correcciones.' })
    emit({ kind: 'task.completed', taskId: 't5', agentId: BECARIO.id })
    rt(BECARIO.id, 'idle', { lastActivity: 'Terminó: Revisar textos', taskId: undefined })
  })
  at(32.2, () => {
    transfer({ id: 'demo-tr-4', fromId: BECARIO.id, toId: 'claude', label: 'Textos revisados', taskId: 't5', payload: { title: 'Revisar textos', summary: 'Textos revisados: 6 correcciones.' } })
  })
  at(32.8, () => {
    setLabel('Recuperación')
    task('t2', { lastActivity: 'Reintentando con menos contexto' })
    rt('qwen', 'working', { lastActivity: 'Reintentando con menos contexto' })
  })
  at(35.2, () => emit({ kind: 'agent.removed', agentId: BECARIO.id }))

  at(36, () => {
    setLabel('Desplazamiento y colaboración')
    emit({ kind: 'agent.moved', agentId: 'qwen', to: 'core', reason: 'Revisar los datos con Gemini' })
    rt('qwen', 'working', { location: 'core', lastActivity: 'Revisando datos con Gemini' })
    emit({ kind: 'agent.moved', agentId: 'gemini', to: 'core', reason: 'Revisar los datos con Qwen' })
    rt('gemini', 'working', { location: 'core', lastActivity: 'Revisando datos con Qwen' })
  })
  at(37.5, () => {
    task('t3', { lastActivity: 'Ajustando estilos' })
    rt('claude', 'working', { lastActivity: 'Ajustando estilos' })
  })
  at(41, () => {
    emit({ kind: 'agent.moved', agentId: 'qwen', to: 'station' })
    rt('qwen', 'working', { location: 'station', lastActivity: 'Guardando la tabla' })
    emit({ kind: 'agent.moved', agentId: 'gemini', to: 'station' })
    rt('gemini', 'idle', { location: 'station', lastActivity: 'Revisión conjunta terminada' })
  })
  at(43.6, () => {
    artifact({ id: 'demo-art-tabla', taskId: 't2', agentId: 'qwen', name: 'contenidos.md', relPath: 'demo:contenidos.md', kind: 'markdown' })
    task('t2', { status: 'done', finishedAt: Date.now(), result: 'Tabla de contenidos con 5 secciones.', artifactIds: ['demo-art-tabla'] })
    emit({ kind: 'task.completed', taskId: 't2', agentId: 'qwen' })
    message({ id: 'demo-msg-t2', author: { type: 'agent', agentId: 'qwen' }, text: 'Información organizada en 5 secciones.', artifactIds: ['demo-art-tabla'] })
    rt('qwen', 'idle', { lastActivity: 'Terminó: Organizar información', taskId: undefined })
  })
  at(44.4, () => {
    transfer({ id: 'demo-tr-5', fromId: 'qwen', toId: 'core', label: 'Datos organizados', taskId: 't2', payload: { title: 'Organizar información', summary: 'Tabla de contenidos con 5 secciones.', files: ['contenidos.md'] } })
  })

  at(46, () => {
    artifact({ id: 'demo-art-dis', taskId: 't3', agentId: 'claude', name: 'diseno-interfaz.md', relPath: 'demo:diseno-interfaz.md', kind: 'markdown' })
    task('t3', { status: 'done', finishedAt: Date.now(), result: 'Diseño con 4 pantallas y guía de estilos.', artifactIds: ['demo-art-dis'] })
    emit({ kind: 'task.completed', taskId: 't3', agentId: 'claude' })
    message({ id: 'demo-msg-t3', author: { type: 'agent', agentId: 'claude' }, text: 'Diseño listo: 4 pantallas, paleta y tipografía.', artifactIds: ['demo-art-dis'] })
    rt('claude', 'idle', { lastActivity: 'Terminó: Diseñar interfaz', taskId: undefined })
  })
  at(46.8, () => {
    setLabel('Delegación y recepción')
    transfer({ id: 'demo-tr-6', fromId: 'claude', toId: 'codex', label: 'Diseño listo', taskId: 't4', payload: { title: 'Diseñar interfaz', summary: 'Diseño con 4 pantallas y guía de estilos.', files: ['diseno-interfaz.md'] } })
  })
  at(49, () => {
    task('t4', { status: 'running', startedAt: Date.now(), lastActivity: 'Leyendo el diseño', progress: 0 })
    rt('codex', 'thinking', { taskId: 't4', lastActivity: 'Leyendo el diseño' })
  })
  at(50.6, () => {
    setLabel('Progreso medible')
    task('t4', { lastActivity: 'Programando (1/4 pasos)', progress: 0.25 })
    rt('codex', 'working', { lastActivity: 'Programando (1/4 pasos)' })
  })
  at(52.6, () => {
    task('t4', { lastActivity: 'Creando componentes (2/4)', progress: 0.5 })
    rt('codex', 'working', { lastActivity: 'Creando componentes (2/4)' })
  })
  at(54.6, () => {
    task('t4', { lastActivity: 'Probando el prototipo (3/4)', progress: 0.75 })
    rt('codex', 'working', { lastActivity: 'Probando el prototipo (3/4)' })
  })
  at(56.8, () => {
    artifact({ id: 'demo-art-proto', taskId: 't4', agentId: 'codex', name: 'prototipo.html', relPath: 'demo:prototipo.html', kind: 'html' })
    task('t4', { status: 'done', finishedAt: Date.now(), progress: 1, result: 'Prototipo navegable con 4 pantallas.', artifactIds: ['demo-art-proto'] })
    emit({ kind: 'task.completed', taskId: 't4', agentId: 'codex' })
    message({ id: 'demo-msg-t4', author: { type: 'agent', agentId: 'codex' }, text: 'Prototipo listo y probado.', artifactIds: ['demo-art-proto'] })
    rt('codex', 'idle', { lastActivity: 'Terminó: Crear prototipo', taskId: undefined })
    quotas(55, 15, 4)
  })
  at(57.6, () => {
    transfer({ id: 'demo-tr-7', fromId: 'codex', toId: 'core', label: 'Prototipo listo', taskId: 't4', payload: { title: 'Crear prototipo', summary: 'Prototipo navegable con 4 pantallas.', files: ['prototipo.html'] } })
  })

  at(60, () => {
    setLabel('Integración final')
    emit({ kind: 'agent.moved', agentId: 'hermes', to: 'core', reason: 'Integrar resultados' })
    rt('hermes', 'working', { location: 'core', lastActivity: 'Integrando resultados' })
  })
  at(63.2, () => {
    message({
      id: 'demo-msg-final',
      author: { type: 'agent', agentId: 'hermes' },
      text: 'Listo. El equipo completó **4 de 4 tareas**:\n\n- ✓ Analizar requisitos (Gemini)\n- ✓ Organizar información (Qwen)\n- ✓ Diseñar interfaz (Claude, con ayuda de un becario)\n- ✓ Crear prototipo (Codex)',
      artifactIds: ['demo-art-req', 'demo-art-tabla', 'demo-art-dis', 'demo-art-proto']
    })
    emit({ kind: 'agent.moved', agentId: 'hermes', to: 'station' })
    rt('hermes', 'idle', { location: 'station', lastActivity: 'Proyecto entregado' })
    emit({ kind: 'run.finished', runId: RUN, projectId: PROJECT, ok: true })
  })
  at(65, () => {
    running = false
    setLabel('Demo completada · el equipo descansa')
  })
  return s
}

function clearTimers(): void {
  timers.forEach((t) => window.clearTimeout(t))
  timers = []
}

export const demoEngine = {
  start(opts?: { prompt?: string }): void {
    clearTimers()
    run++
    counter = 0
    runtimes.clear()
    tasks.clear()
    const st = useCowork.getState()
    st.resetDemoSlice()
    if (st.mode !== 'demo') st.setMode('demo')
    running = true
    const prompt = opts?.prompt?.trim() || 'Analiza este proyecto y crea un prototipo'
    for (const step of script(prompt)) timers.push(window.setTimeout(step.run, step.at))
    notify()
  },
  stop(): void {
    clearTimers()
    if (running) {
      running = false
      setLabel('Demo detenida')
    }
  },
  restart(): void {
    demoEngine.start()
  },
  getState(): { running: boolean; label: string } {
    return snapshot
  },
  subscribe(cb: Listener): () => void {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }
}
