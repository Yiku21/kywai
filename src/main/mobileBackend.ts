import { rmSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import type { AgentAccess, AgentConfig, ConversationSummary, VideoCharacterInfo, VideoVoiceInfo, SearchHit, SearchResult, MusicResult, AgentRuntime, AppConfig, Attachment, HermesModelsInfo, InboxItem, TaskChangeSet, MemoryEntry, MemoryKind, MemoryStatus, ProjectFileRef, ProjectState, ProjectSummary, QuotaInfo, Routine, RoutineRun, TaskTemplate, TraceEntry, UpdateStatus, UsageRun, WhatsNew, RoutineInput, ChatMessage } from '@shared/types'
import type { MobileChatReceipt, MobileConversation, MobileCost, MobileFiles, MobileMusicResult, MobileVideoPicker, MobileProject, MobileQuality, MobileServerUpdate, MobileSnapshot, MobileUsage } from '@shared/mobile'
import { agentQuality, QUALITY_MIN_TASKS } from '@shared/agentQuality'
import { mobileCost } from '@shared/costs'
import { isLive, streamUrlOf } from '@shared/musicSources'
import { FILM_CATEGORIES, FILM_STYLES } from '@shared/filmStyles'
import { LANG_VOICES } from '@shared/videoChoice'
import { MobileError } from './mobileErrors'
import { savePastedFile } from './local'
import { listFolder, relPath, resolveInside } from './mobileFiles'
import { copyAttachments } from './projects'
import { getTaskTrace } from './taskTrace'
import { withAndroidBridge } from './mods'
import type { ModInfo } from '@shared/extensions'
import type { WebMethod } from './webServer'

type LoadedProject = ProjectState & { activeRunId?: string; activeRunIds?: string[] }

/** Lo que viaja en la instantánea; el registro completo de una tarea se pide aparte. */
const SNAPSHOT_TRACE = 40
const SNAPSHOT_RUNS = 100

/** Totales derivados del registro existente (todas las ejecuciones); solo se envían las más recientes. */
function usageProjection(runs: UsageRun[], quotas: QuotaInfo[], config?: AppConfig): MobileUsage {
  const totals = { input: 0, output: 0, cached: 0 }
  const byAgent = new Map<string, { agentId: string; input: number; output: number }>()
  for (const run of runs) for (const call of run.calls) {
    totals.input += call.input
    totals.output += call.output
    totals.cached += call.cached ?? 0
    const agent = byAgent.get(call.agentId) ?? { agentId: call.agentId, input: 0, output: 0 }
    agent.input += call.input
    agent.output += call.output
    byAgent.set(call.agentId, agent)
  }
  return { runs: runs.slice(-SNAPSHOT_RUNS), quotas, totals, byAgent: [...byAgent.values()], ...(config ? { cost: mobileCost(runs, config) } : {}) }
}

/** Adaptador de las mismas funciones registradas para Electron y la web. No almacena datos del proyecto. */
export class MobileBackend {
  constructor(private readonly methods: ReadonlyMap<string, WebMethod>, private readonly agents?: () => AgentConfig[]) {}

  private async call<T>(name: string, ...args: unknown[]): Promise<T> {
    const fn = this.methods.get(name)
    if (!fn) throw new MobileError(503, 'UNAVAILABLE', 'El servidor todavía no está preparado', true)
    return await fn(...args) as T
  }

  private async project(id: string | null, list?: ProjectSummary[]): Promise<LoadedProject | null> {
    const projects = list ?? await this.call<ProjectSummary[]>('listProjects')
    const selected = id === null ? projects[0] : projects.find((p) => p.id === id)
    if (!selected) {
      if (id !== null) throw new MobileError(404, 'CONVERSATION_NOT_FOUND', 'No se encontró la conversación')
      return null
    }
    return this.call<LoadedProject>('loadProject', selected.id)
  }

  private async existing(id: string): Promise<LoadedProject> {
    return (await this.project(id))!
  }

  private conversation(state: LoadedProject | null): MobileConversation {
    const workDir = state?.project.workDir
    return {
      id: state?.project.id ?? null,
      title: state?.project.name ?? '',
      createdAt: state?.project.createdAt ?? null,
      messages: state?.messages.map((m) => ({ ...m, conversationId: m.projectId })) ?? [],
      artifacts: state?.artifacts ?? [],
      instructions: state?.instructions ?? '',
      activeRequestId: state?.activeRunId ?? null,
      activeRequestIds: state?.activeRunIds ?? [],
      attachments: state?.attachments ?? [],
      folder: workDir ? { name: basename(workDir), path: workDir } : null,
      chat: state?.conversation ? { id: state.conversation.id, title: state.conversation.title ?? '' } : null
    }
  }

  /** Proyectos del más reciente al más antiguo, sin rutas internas. */
  async projects(list?: ProjectSummary[]): Promise<MobileProject[]> {
    const [projects, running] = await Promise.all([
      list ?? this.call<ProjectSummary[]>('listProjects'),
      this.call<string[]>('mobileRunningProjects')
    ])
    const active = new Set(running)
    return projects
      .map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, running: active.has(p.id), ...(p.pinned ? { pinned: true } : {}) }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async snapshot(id: string | null, bootId: string, eventSequence: () => number): Promise<MobileSnapshot> {
    const list = await this.call<ProjectSummary[]>('listProjects')
    const [state, projects, config, runtime, runs] = await Promise.all([
      this.project(id, list),
      this.projects(list),
      this.call<AppConfig>('getConfig'),
      this.call<{ runtimes: AgentRuntime[]; quotas: QuotaInfo[] }>('getRuntime'),
      this.call<UsageRun[]>('getUsageRuns')
    ])
    const templates = this.methods.has('listTemplates') ? await this.call<TaskTemplate[]>('listTemplates') : []
    const mods = this.methods.has('listMods') ? await this.call<ModInfo[]>('listMods').catch(() => [] as ModInfo[]) : []
    const modCommands = mods.filter((m) => m.enabled).flatMap((m) => (m.commands ?? []).filter((c) => !m.shadowed?.includes(c.name)).map((c) => ({ name: c.name, description: c.description, mod: m.title || m.name })))
    const watermark = eventSequence()
    const configured = new Set(config.agents.map((a) => a.id))
    const agents = [...config.agents, ...(this.agents?.() ?? []).filter((a) => !configured.has(a.id))]
    return {
      conversation: this.conversation(state),
      projects,
      agents: agents.map((agent) => ({ ...agent, activity: agent.enabled ? 'idle' as const : 'offline' as const, ...runtime.runtimes.find((rt) => rt.agentId === agent.id) })),
      stations: config.stations,
      tasks: state?.tasks.map((task) => {
        const trace = getTaskTrace(task.id)
        return { ...task, trace: trace.slice(-SNAPSHOT_TRACE), traceCount: trace.length }
      }) ?? [],
      memory: state?.memory ?? [],
      templates,
      modCommands,
      usage: usageProjection(runs, runtime.quotas, config),
      settings: { agentAccess: config.agentAccess, planApproval: config.planApproval !== false, theme: config.uiTheme ?? 'clasico', ...(config.serverName ? { serverName: config.serverName } : {}) },
      sequence: watermark,
      capabilities: {
        apiVersion: 'v1', chat: true, conversations: true, stop: true, resume: true,
        events: 'websocket', bootId, eventSequence: watermark, maxMessageLength: 50_000, attachments: true,
        stopRequests: true, resumeRequests: true, discardRequests: true, newConversation: true, taskTrace: true,
        projects: true, memoryEdit: true, files: true, upload: true, artifacts: true, traceEndpoint: true,
        fileActions: this.methods.has('deleteProjectFile'),
        agentAccess: true, usageRefresh: true, voice: this.methods.has('transcribeAudio'),
        planApproval: this.methods.has('approvePlan'), appUpdate: true, hermesModel: this.methods.has('getHermesModels'),
        agentReset: this.methods.has('resetAgent'), serverUpdate: this.methods.has('applyUpdate'), whatsNew: this.methods.has('latestWhatsNew'), agentQuality: true, inbox: this.methods.has('listInbox'), taskChanges: this.methods.has('undoTask'),
        routines: this.methods.has('runRoutineNow'),
        templates: this.methods.has('listTemplates'),
        routinesEdit: this.methods.has('createRoutine') && this.methods.has('updateRoutine') && this.methods.has('deleteRoutine'),
        routineProposals: this.methods.has('decideRoutineProposal'),
        directMessages: true,
        chats: this.methods.has('listConversations') && this.methods.has('openConversation'),
        chatActions: this.methods.has('forkConversation') && this.methods.has('moveConversation') && this.methods.has('pinnedConversations'),
        projectActions: this.methods.has('renameProject') && this.methods.has('deleteProject') && this.methods.has('setProjectPinned'),
        search: this.methods.has('search'),
        history: this.methods.has('allConversations') && this.methods.has('searchHistory'),
        serverName: this.methods.has('setServerName'),
        theme: this.methods.has('setUiTheme'),
        music: this.methods.has('searchMusic'),
        agentThinking: this.methods.has('setAgentThinking'),
        modPanels: this.methods.has('modPanel') && this.methods.has('listMods'),
        chatCommands: true,
        usageCost: true,
        replyTo: true,
        memoryAnswer: this.methods.has('answerMemory'),
        editInPlace: this.methods.has('switchMessageVersion'),
        messageActions: this.methods.has('forkConversation'),
        videoPicker: ['listVideoCharacters', 'addVideoCharacter', 'removeVideoCharacter', 'listVideoVoices', 'previewVideoVoice'].every((m) => this.methods.has(m))
      }
    }
  }

  /** getUsageRuns/getRuntime son lecturas síncronas en el registro compartido del servidor. */
  currentUsage(): MobileUsage {
    const runs = this.methods.get('getUsageRuns')?.() as UsageRun[]
    const runtime = this.methods.get('getRuntime')?.() as { quotas: QuotaInfo[] }
    const config = this.methods.get('getConfig')?.() as AppConfig | undefined
    return usageProjection(runs, runtime.quotas, config)
  }

  private receipt(state: LoadedProject, requestId: string, clientMessageId: string): MobileChatReceipt {
    const message = state.messages.find((m) => m.author.type === 'user' && m.clientMessageId === clientMessageId)
    if (!message) throw new MobileError(500, 'INTERNAL_ERROR', 'No se encontró el mensaje aceptado', true)
    return { conversationId: state.project.id, requestId, clientMessageId, message: { ...message, conversationId: state.project.id } }
  }

  async createConversation(name?: string): Promise<MobileConversation> {
    const created = await this.call<ProjectSummary>('createProject', name ?? 'Conversación móvil')
    return this.conversation(await this.project(created.id))
  }

  // ---- Chats de cada proyecto (como la barra lateral del escritorio; los cambios llegan por conversations.updated) ----

  /** Lo que lanzan las funciones del servidor al cambiar de chat, con el código que entiende el móvil. */
  private chatError(e: unknown): never {
    const message = e instanceof Error ? e.message : String(e)
    if (/equipo está trabajando/.test(message)) throw new MobileError(409, 'PROJECT_BUSY', message)
    if (/conversación abierta/.test(message)) throw new MobileError(409, 'CHAT_OPEN', message)
    if (/no válid|No se encuentra/.test(message)) throw new MobileError(404, 'CHAT_NOT_FOUND', 'No se encontró ese chat')
    if (/Ese mensaje ya no está/.test(message)) throw new MobileError(404, 'MESSAGE_NOT_FOUND', message)
    if (/Escribe un nombre/.test(message)) throw new MobileError(400, 'INVALID_INPUT', message)
    throw e
  }

  async chats(projectId: string): Promise<{ chats: ConversationSummary[] }> {
    await this.existing(projectId)
    return { chats: await this.call<ConversationSummary[]>('listConversations', projectId) }
  }

  /** Chat nuevo en el proyecto: el abierto se guarda (si tiene algo) y queda uno vacío. */
  async newChat(projectId: string): Promise<MobileConversation> {
    await this.existing(projectId)
    try { await this.call('newConversation', projectId) } catch (e) { this.chatError(e) }
    return this.conversation(await this.existing(projectId))
  }

  /** Vuelve a un chat guardado del proyecto, con sus mensajes y sus tareas. */
  async openChat(projectId: string, chatId: string): Promise<MobileConversation> {
    await this.existing(projectId)
    try { await this.call('openConversation', projectId, chatId) } catch (e) { this.chatError(e) }
    return this.conversation(await this.existing(projectId))
  }

  async renameChat(projectId: string, chatId: string, title: string): Promise<{ chats: ConversationSummary[] }> {
    await this.existing(projectId)
    try { return { chats: await this.call<ConversationSummary[]>('renameConversation', projectId, chatId, title) } } catch (e) { this.chatError(e) }
  }

  /** Borra un chat (va a conversaciones/borradas/). Si es el abierto, antes se empieza uno nuevo, como en el escritorio. */
  async deleteChat(projectId: string, chatId: string): Promise<{ chats: ConversationSummary[] }> {
    await this.existing(projectId)
    try {
      const list = await this.call<ConversationSummary[]>('listConversations', projectId)
      if (list.find((c) => c.id === chatId)?.current) await this.call('newConversation', projectId)
      return { chats: await this.call<ConversationSummary[]>('deleteConversation', projectId, chatId) }
    } catch (e) { this.chatError(e) }
  }

  async pinChat(projectId: string, chatId: string, pinned: boolean): Promise<{ chats: ConversationSummary[] }> {
    await this.existing(projectId)
    try { return { chats: await this.call<ConversationSummary[]>('setConversationPinned', projectId, chatId, pinned) } } catch (e) { this.chatError(e) }
  }

  /** Copia aparte del chat (con sus mensajes y tareas terminadas); devuelve su id y la lista del proyecto. */
  async forkChat(projectId: string, chatId: string, from?: { messageId: string; before?: boolean }): Promise<{ chatId: string; chats: ConversationSummary[] }> {
    await this.existing(projectId)
    try {
      const id = await this.call<string>('forkConversation', projectId, chatId, ...(from ? [from] : []))
      return { chatId: id, chats: await this.call<ConversationSummary[]>('listConversations', projectId) }
    } catch (e) { this.chatError(e) }
  }

  /** Pasa el chat a otro proyecto; devuelve la lista del proyecto de origen. */
  async moveChat(projectId: string, chatId: string, toProjectId: string): Promise<{ chatId: string; chats: ConversationSummary[] }> {
    await this.existing(projectId)
    await this.existing(toProjectId)
    try {
      const id = await this.call<string>('moveConversation', projectId, chatId, toProjectId)
      return { chatId: id, chats: await this.call<ConversationSummary[]>('listConversations', projectId) }
    } catch (e) { this.chatError(e) }
  }

  /** Los chats fijados de todos los proyectos (la sección «Fijados»). */
  async pinnedChats(): Promise<{ chats: ConversationSummary[] }> {
    return { chats: await this.call<ConversationSummary[]>('pinnedConversations') }
  }

  // ---- Menú de un proyecto en la barra lateral ----

  async renameProject(projectId: string, name: string): Promise<MobileProject[]> {
    await this.existing(projectId)
    try { await this.call('renameProject', projectId, name) } catch (e) { this.chatError(e) }
    return this.projects()
  }

  async pinProject(projectId: string, pinned: boolean): Promise<MobileProject[]> {
    await this.existing(projectId)
    await this.call('setProjectPinned', projectId, pinned)
    return this.projects()
  }

  /** Todo lo del proyecto va a la Papelera del ordenador; no se puede con trabajo en marcha. */
  async deleteProject(projectId: string): Promise<MobileProject[]> {
    await this.existing(projectId)
    try {
      await this.call('deleteProject', projectId)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (/trabajo en marcha/.test(message)) throw new MobileError(409, 'PROJECT_BUSY', message)
      throw e
    }
    return this.projects()
  }

  /** Buscador de la barra lateral: chats, tareas, resultados y memoria de todos los proyectos (o de uno). */
  async search(q: string, projectId?: string, opts: { since?: number; author?: string; limit?: number } = {}): Promise<{ hits: SearchHit[]; total?: number }> {
    const limit = Math.max(1, Math.min(400, opts.limit ?? 60))
    if (!this.methods.has('searchHistory')) return { hits: (await this.call<SearchHit[]>('search', q, projectId)).slice(0, limit) }
    const r = await this.call<SearchResult>('searchHistory', q, { projectId, since: opts.since, author: opts.author, limit })
    return { hits: r.hits.slice(0, limit), total: r.total }
  }

  /** Historial: todos los chats con mensajes de todos los proyectos, del más reciente al más antiguo. */
  async allChats(): Promise<{ chats: ConversationSummary[] }> {
    return { chats: await this.call<ConversationSummary[]>('allConversations') }
  }

  /**
   * Música para Órbita: las radios de SomaFM o canciones de Audius (las mismas fuentes sin anuncios del escritorio).
   * El móvil las escucha directamente desde sus servidores públicos (stream).
   */
  async musicSearch(kind: 'radio' | 'audius', q: string): Promise<{ results: MobileMusicResult[] }> {
    let found: MusicResult[]
    try {
      found = await this.call<MusicResult[]>('searchMusic', q, kind)
    } catch (e) {
      throw new MobileError(502, 'MUSIC_UNAVAILABLE', (e as Error).message || 'No se pudo cargar la música')
    }
    const results: MobileMusicResult[] = []
    for (const r of found.slice(0, 60)) {
      const stream = streamUrlOf(r.videoId)
      if (!stream) continue
      results.push({
        id: r.videoId,
        title: r.title,
        artist: r.artist,
        ...(r.album ? { detail: r.album } : {}),
        ...(r.durationSec ? { durationSec: r.durationSec } : {}),
        ...(r.thumbnail ? { thumbnail: r.thumbnail } : {}),
        stream,
        live: isLive(r.videoId)
      })
    }
    return { results }
  }

  async send(conversationId: string | null, text: string, clientMessageId: string, attachmentIds: string[] = [], templateId?: string, replyTo?: string, artifactIds: string[] = [], editOf?: string): Promise<MobileChatReceipt> {
    // Con id=null, un reintento sigue encontrando el mensaje aunque otro proyecto haya pasado a ser el más reciente.
    if (conversationId === null) {
      const projects = await this.call<ProjectSummary[]>('listProjects')
      for (const project of projects) {
        const state = await this.call<LoadedProject>('loadProject', project.id)
        const existing = state.messages.find((m) => m.author.type === 'user' && m.clientMessageId === clientMessageId)
        if (existing?.runId) {
          if (existing.text !== text) throw new MobileError(409, 'CLIENT_MESSAGE_CONFLICT', 'Ese clientMessageId ya se usó con otro texto')
          return this.receipt(state, existing.runId, clientMessageId)
        }
      }
    }
    const state = await this.project(conversationId)
    if (!state) throw new MobileError(409, 'NO_CONVERSATION', 'Crea una conversación antes de enviar mensajes')
    const existing = state.messages.find((m) => m.author.type === 'user' && m.clientMessageId === clientMessageId)
    if (existing?.runId) {
      if (existing.text !== text) throw new MobileError(409, 'CLIENT_MESSAGE_CONFLICT', 'Ese clientMessageId ya se usó con otro texto')
      return this.receipt(state, existing.runId, clientMessageId)
    }
    // Adjuntos ya subidos (POST /files): van con el mensaje y a los agentes igual que los elegidos en el escritorio.
    const unknown = attachmentIds.find((attachmentId) => !state.attachments.some((a) => a.id === attachmentId))
    if (unknown) throw new MobileError(400, 'INVALID_INPUT', `attachmentIds: la conversación no tiene el adjunto ${unknown}`)
    // «Adjuntar al mensaje» en Resultados: el servidor copia el entregable como adjunto.
    const unknownArtifact = artifactIds.find((artifactId) => !state.artifacts.some((a) => a.id === artifactId))
    if (unknownArtifact) throw new MobileError(400, 'INVALID_INPUT', `artifactIds: la conversación no tiene el resultado ${unknownArtifact}`)
    if (templateId) {
      const tpl = (await this.call<TaskTemplate[]>('listTemplates')).find((x) => x.id === templateId)
      if (!tpl || (tpl.projectId && tpl.projectId !== state.project.id)) throw new MobileError(400, 'INVALID_INPUT', 'templateId: esa plantilla ya no existe')
    }
    // «Responder»: tiene que ser la respuesta de un agente de esta conversación.
    if (replyTo && !state.messages.some((m) => m.id === replyTo && m.author.type === 'agent')) throw new MobileError(400, 'INVALID_INPUT', 'replyTo: esa respuesta no es de un agente de esta conversación')
    try {
      const { runId } = await this.call<{ runId: string }>('sendMessage', { projectId: state.project.id, text, filePaths: [], clientMessageId, attachmentIds, ...(artifactIds.length ? { artifactIds } : {}), ...(templateId ? { templateId } : {}), ...(replyTo ? { replyTo } : {}), ...(editOf ? { editOf } : {}) })
      return this.receipt(await this.call<LoadedProject>('loadProject', state.project.id), runId, clientMessageId)
    } catch (e) {
      if (e instanceof Error && e.message === 'clientMessageId ya se usó con otro texto') throw new MobileError(409, 'CLIENT_MESSAGE_CONFLICT', 'Ese clientMessageId ya se usó con otro texto')
      if (e instanceof Error && e.message.startsWith('No existe el adjunto ')) throw new MobileError(400, 'INVALID_INPUT', `attachmentIds: ${e.message}`)
      // Editar un mensaje tuyo en el mismo chat (editOf).
      if (e instanceof Error && /Ese mensaje ya no está/.test(e.message)) throw new MobileError(404, 'MESSAGE_NOT_FOUND', e.message)
      if (e instanceof Error && /Solo se pueden editar tus mensajes/.test(e.message)) throw new MobileError(400, 'INVALID_INPUT', `editOf: ${e.message}`)
      if (e instanceof Error && /sigue en marcha: detenla antes de editar/.test(e.message)) throw new MobileError(409, 'PROJECT_BUSY', e.message)
      throw e
    }
  }

  async control(requestId: string, action: 'stop' | 'resume' | 'discard'): Promise<{ requestId: string; conversationId: string; status: 'stopped' | 'running' | 'discarded' }> {
    const projects = await this.call<ProjectSummary[]>('listProjects')
    for (const project of projects) {
      const state = await this.call<LoadedProject>('loadProject', project.id)
      if (!(state.activeRunIds ?? []).includes(requestId) && !state.messages.some((m) => m.runId === requestId) && !state.tasks.some((t) => t.runId === requestId)) continue
      const active = (state.activeRunIds ?? []).includes(requestId)
      if (action === 'stop') {
        if (!active) {
          const runs = await this.call<UsageRun[]>('getUsageRuns')
          if (!runs.some((r) => r.runId === requestId && r.status === 'cancelled')) throw new MobileError(409, 'REQUEST_NOT_ACTIVE', 'La petición ya terminó')
        } else {
          await this.call('mobileStopRun', requestId)
        }
      } else if (action === 'discard') {
        // Quitar lo que quedó en pausa: solo con la petición parada (si sigue en marcha, primero se detiene).
        if (active) throw new MobileError(409, 'REQUEST_NOT_RESUMABLE', 'La petición está en marcha: detenla antes de quitarla')
        try {
          await this.call('mobileDiscardRun', project.id, requestId)
        } catch (e) {
          if (e instanceof Error && /No hay tareas interrumpidas/.test(e.message)) {
            throw new MobileError(409, 'REQUEST_NOT_RESUMABLE', 'La petición no tiene tareas en pausa que quitar')
          }
          throw e
        }
      } else if (!active) {
        try {
          await this.call('resumeRun', project.id, requestId)
        } catch (e) {
          if (e instanceof MobileError) throw e
          if (e instanceof Error && /ya está en marcha|No hay tareas interrumpidas/.test(e.message)) {
            throw new MobileError(409, 'REQUEST_NOT_RESUMABLE', 'La petición no tiene tareas interrumpidas que reanudar')
          }
          throw e
        }
      }
      return { requestId, conversationId: project.id, status: action === 'stop' ? 'stopped' : action === 'discard' ? 'discarded' : 'running' }
    }
    throw new MobileError(404, 'REQUEST_NOT_FOUND', 'No se encontró la petición')
  }

  /** Visto bueno (o descarte) del plan que propone el coordinador en un mensaje del chat. */
  async plan(conversationId: string, messageId: string, action: 'approve' | 'reject'): Promise<{ conversationId: string; messageId: string; requestId: string | null; status: 'approved' | 'rejected' }> {
    const message = (await this.existing(conversationId)).messages.find((m) => m.id === messageId)
    if (!message?.proposal) throw new MobileError(404, 'PLAN_NOT_FOUND', 'No se encontró ese plan')
    try {
      await this.call(action === 'approve' ? 'approvePlan' : 'rejectPlan', conversationId, messageId)
    } catch (e) {
      if (e instanceof Error && /ya está en marcha|ya no está pendiente/.test(e.message)) throw new MobileError(409, 'PLAN_NOT_PENDING', e.message)
      throw e
    }
    return { conversationId, messageId, requestId: message.runId ?? null, status: action === 'approve' ? 'approved' : 'rejected' }
  }

  /** Registro completo de una tarea de cualquier proyecto. */
  async trace(taskId: string): Promise<{ taskId: string; entries: TraceEntry[] }> {
    await this.taskProject(taskId)
    return { taskId, entries: getTaskTrace(taskId) }
  }

  /** Proyecto (conversación) de una tarea. */
  private async taskProject(taskId: string): Promise<string> {
    const projects = await this.call<ProjectSummary[]>('listProjects')
    for (const project of projects) {
      const state = await this.call<LoadedProject>('loadProject', project.id)
      if (state.tasks.some((t) => t.id === taskId)) return project.id
    }
    throw new MobileError(404, 'TASK_NOT_FOUND', 'No se encontró la tarea')
  }

  /** Lo que cambió una tarea en la carpeta del proyecto (archivos con +/− y el parche). */
  async taskChanges(taskId: string): Promise<TaskChangeSet & { taskId: string }> {
    const conversationId = await this.taskProject(taskId)
    return { taskId, ...(await this.call<TaskChangeSet>('getTaskChanges', conversationId, taskId)) }
  }

  /** Deshace una tarea (como el botón del escritorio). */
  async undoTask(taskId: string): Promise<{ taskId: string; message: string }> {
    const conversationId = await this.taskProject(taskId)
    return { taskId, message: await this.call<string>('undoTask', conversationId, taskId) }
  }

  // ---- Bandeja «Te necesita» (cada cambio emite inbox.updated) ----

  // ---- Paneles de los mods (los mismos que la pestaña «Mods» del escritorio) ----

  async modPanels(): Promise<{ panels: Array<{ mod: string; modTitle: string; id: string; title: string; chat: boolean }> }> {
    const mods = await this.call<ModInfo[]>('listMods')
    return {
      panels: mods
        .filter((m) => m.enabled)
        .flatMap((m) => m.panels.map((p) => ({ mod: m.name, modTitle: m.title, id: p.id, title: p.title, chat: m.permissions.includes('chat') })))
    }
  }

  /** La página de un panel, con el puente de Órbita (en el móvil no hay ventana madre a la que escribir). */
  async modPanel(mod: string, id: string): Promise<{ html: string; title: string; chat: boolean }> {
    try {
      const p = await this.call<{ html: string; title: string; chat: boolean }>('modPanel', mod, id)
      return { html: withAndroidBridge(p.html), title: p.title, chat: p.chat }
    } catch (e) {
      if (e instanceof MobileError) throw e
      throw new MobileError(404, 'NOT_FOUND', (e as Error).message)
    }
  }

  async inbox(): Promise<{ items: InboxItem[] }> {
    return { items: await this.call<InboxItem[]>('listInbox') }
  }

  async inboxAction(id: string, actionId: string): Promise<{ item: InboxItem; message?: string }> {
    try {
      return await this.call<{ item: InboxItem; message?: string }>('actInbox', id, actionId)
    } catch (e) {
      if (e instanceof MobileError) throw e
      throw new MobileError(404, 'NOT_FOUND', (e as Error).message)
    }
  }

  // ---- Plantillas de tareas (los cambios llegan por el evento templates.updated) ----

  /** Lo que el motor rechaza al comprobar una plantilla (nombre vacío, orden repetida…) es un 400 con su motivo. */
  private async templateCall<T>(name: string, ...args: unknown[]): Promise<T> {
    try {
      return await this.call<T>(name, ...args)
    } catch (e) {
      if (e instanceof MobileError) throw e
      throw new MobileError(e instanceof Error && /ya no existe/.test(e.message) ? 404 : 400, e instanceof Error && /ya no existe/.test(e.message) ? 'TEMPLATE_NOT_FOUND' : 'INVALID_INPUT', e instanceof Error ? e.message : 'Plantilla no válida')
    }
  }

  async templates(): Promise<{ templates: TaskTemplate[] }> {
    return { templates: await this.call<TaskTemplate[]>('listTemplates') }
  }

  async createTemplate(input: Record<string, unknown>): Promise<{ template: TaskTemplate }> {
    return { template: await this.templateCall<TaskTemplate>('createTemplate', input) }
  }

  async updateTemplate(templateId: string, patch: Record<string, unknown>): Promise<{ template: TaskTemplate }> {
    return { template: await this.templateCall<TaskTemplate>('updateTemplate', templateId, patch) }
  }

  async deleteTemplate(templateId: string): Promise<{ deleted: true }> {
    await this.templateCall<void>('deleteTemplate', templateId)
    return { deleted: true }
  }

  async restoreTemplates(): Promise<{ templates: TaskTemplate[] }> {
    return { templates: await this.templateCall<TaskTemplate[]>('restoreTemplates') }
  }

  // ---- Rutinas (los cambios llegan por el evento routines.updated) ----

  /** Rutinas del proyecto, siempre sin el secreto de su webhook (aunque la función del servidor lo trajera). */
  async routines(conversationId: string): Promise<{ routines: Routine[] }> {
    const list = (await this.existing(conversationId)).routines ?? []
    return {
      routines: list.map((r) => {
        const { webhookSecret, ...rest } = r
        return { ...rest, hasSecret: rest.hasSecret ?? !!webhookSecret }
      })
    }
  }

  /** Un error de validación de la rutina (hora pasada, sin nombre…) es del que la pide, no del servidor. */
  private async routineCall<T>(name: string, ...args: unknown[]): Promise<T> {
    try {
      return await this.call<T>(name, ...args)
    } catch (e) {
      if (e instanceof MobileError || !(e instanceof Error)) throw e
      if (/ya no existe/.test(e.message)) throw new MobileError(404, 'ROUTINE_NOT_FOUND', e.message)
      throw new MobileError(400, 'INVALID_ROUTINE', e.message)
    }
  }

  private withoutSecret(r: Routine): Routine {
    const { webhookSecret, ...rest } = r
    return { ...rest, hasSecret: rest.hasSecret ?? !!webhookSecret }
  }

  /** Nueva rutina (activa salvo enabled: false). Valida lo mismo que el escritorio. */
  async createRoutine(conversationId: string, input: RoutineInput): Promise<{ routine: Routine }> {
    await this.existing(conversationId)
    return { routine: this.withoutSecret(await this.routineCall<Routine>('createRoutine', conversationId, input)) }
  }

  /** Cambia nombre, petición, disparador, si pide tu visto bueno o la activa/desactiva. */
  async updateRoutine(conversationId: string, routineId: string, patch: Partial<RoutineInput>): Promise<{ routine: Routine }> {
    if (!(await this.existing(conversationId)).routines?.some((r) => r.id === routineId)) throw new MobileError(404, 'ROUTINE_NOT_FOUND', 'No existe esa rutina')
    return { routine: this.withoutSecret(await this.routineCall<Routine>('updateRoutine', conversationId, routineId, patch)) }
  }

  async deleteRoutine(conversationId: string, routineId: string): Promise<{ deleted: true }> {
    if (!(await this.existing(conversationId)).routines?.some((r) => r.id === routineId)) throw new MobileError(404, 'ROUTINE_NOT_FOUND', 'No existe esa rutina')
    await this.call('deleteRoutine', conversationId, routineId)
    return { deleted: true }
  }

  /** «Crear rutina» o «Descartar» en la tarjeta que propuso Hermes. */
  async routineProposal(conversationId: string, messageId: string, action: 'create' | 'dismiss'): Promise<{ message: ChatMessage }> {
    const message = (await this.existing(conversationId)).messages.find((m) => m.id === messageId)
    if (!message?.routineProposal) throw new MobileError(404, 'ROUTINE_PROPOSAL_NOT_FOUND', 'No se encontró esa propuesta de rutina')
    if (message.routineProposal.status !== 'pending') throw new MobileError(409, 'ROUTINE_PROPOSAL_NOT_PENDING', 'Esa propuesta ya no está pendiente')
    return { message: await this.routineCall<ChatMessage>('decideRoutineProposal', conversationId, messageId, action) }
  }

  /** Flechas ‹ › de un mensaje tuyo editado: enseña su versión [to]; el chat llega por messages.replaced. */
  async switchVersion(conversationId: string, messageId: string, to: number): Promise<{ switched: true }> {
    const message = (await this.existing(conversationId)).messages.find((m) => m.id === messageId)
    if (!message) throw new MobileError(404, 'MESSAGE_NOT_FOUND', 'Ese mensaje ya no está en la conversación')
    if (!message.versions || (to !== message.versions.current && !message.versions.others.some((o) => o.at === to))) throw new MobileError(404, 'VERSION_NOT_FOUND', 'Ese mensaje no tiene esa versión')
    try {
      await this.call('switchMessageVersion', conversationId, messageId, to)
    } catch (e) {
      if (e instanceof Error && /sigue en marcha/.test(e.message)) throw new MobileError(409, 'PROJECT_BUSY', e.message)
      throw e
    }
    return { switched: true }
  }

  /** «Ejecutar ahora»: si la anterior sigue en marcha, la ejecución vuelve como saltada (skipped). */
  async runRoutine(conversationId: string, routineId: string): Promise<{ run: RoutineRun }> {
    if (!(await this.existing(conversationId)).routines?.some((r) => r.id === routineId)) throw new MobileError(404, 'ROUTINE_NOT_FOUND', 'No existe esa rutina')
    return { run: await this.call<RoutineRun>('runRoutineNow', conversationId, routineId) }
  }

  // ---- Memoria e instrucciones (cada cambio ya emite memory.updated) ----

  private async memoryEntry(conversationId: string, id: string): Promise<MemoryEntry> {
    const entry = (await this.existing(conversationId)).memory?.find((e) => e.id === id)
    if (!entry) throw new MobileError(404, 'MEMORY_NOT_FOUND', 'Esa entrada ya no está en la memoria')
    return entry
  }

  async addMemory(conversationId: string, kind: MemoryKind, text: string): Promise<MemoryEntry> {
    await this.existing(conversationId)
    const entry = await this.call<MemoryEntry | null>('addMemory', conversationId, { kind, text })
    if (!entry) throw new MobileError(409, 'MEMORY_DUPLICATE', 'Esa entrada ya está en la memoria')
    return entry
  }

  async updateMemory(conversationId: string, id: string, patch: { text?: string; kind?: MemoryKind; status?: MemoryStatus }): Promise<MemoryEntry> {
    await this.memoryEntry(conversationId, id)
    try {
      await this.call('updateMemory', conversationId, id, patch)
    } catch (e) {
      // Otro dispositivo la borró entre la comprobación y el cambio.
      if (e instanceof Error && e.message === 'Esa entrada ya no está en la memoria') throw new MobileError(404, 'MEMORY_NOT_FOUND', e.message)
      throw e
    }
    return this.memoryEntry(conversationId, id)
  }

  async answerMemory(conversationId: string, id: string, text: string): Promise<{ runId: string; entry: MemoryEntry }> {
    const entry = await this.memoryEntry(conversationId, id)
    if (entry.kind !== 'pending' || entry.status === 'superseded') throw new MobileError(409, 'MEMORY_RESOLVED', 'Ese pendiente ya está resuelto')
    const { runId } = await this.call<{ runId: string }>('answerMemory', conversationId, id, text)
    return { runId, entry: await this.memoryEntry(conversationId, id) }
  }

  async deleteMemory(conversationId: string, id: string): Promise<{ deleted: true }> {
    await this.memoryEntry(conversationId, id)
    await this.call('deleteMemory', conversationId, id)
    return { deleted: true }
  }

  async setInstructions(conversationId: string, text: string): Promise<{ instructions: string }> {
    await this.existing(conversationId)
    await this.call('setInstructions', conversationId, text)
    return { instructions: (await this.existing(conversationId)).instructions ?? '' }
  }

  // ---- Archivos ----

  /** Ruta del resultado: en la carpeta del proyecto y luego en la de trabajo, como /api/file. */
  async artifactPath(conversationId: string, artifactId: string): Promise<string> {
    const state = await this.existing(conversationId)
    const artifact = state.artifacts.find((a) => a.id === artifactId)
    const missing = new MobileError(404, 'ARTIFACT_NOT_FOUND', 'No se encontró el resultado')
    if (!artifact) throw missing
    const rel = artifact.relPath.replace(/\\/g, '/')
    for (const base of [state.project.dir, state.project.workDir]) {
      if (!base) continue
      const abs = await resolveInside(base, rel)
      if (abs) return abs
    }
    throw missing
  }

  /**
   * Adjunto (attachments/… dentro del proyecto), archivo de la carpeta de trabajo o, con «project», cualquier archivo
   * del proyecto por la ruta con la que lo nombró un agente: relativa (artifacts/mapa.png) o absoluta del equipo
   * servidor (/Users/…/artifacts/mapa.png). Nunca sale de la carpeta del proyecto ni de su carpeta de trabajo.
   */
  async filePath(conversationId: string, source: 'attachment' | 'folder' | 'project', path: string): Promise<string> {
    if (source === 'project') {
      const state = await this.existing(conversationId)
      const bases = [state.project.dir, state.project.workDir].filter((b): b is string => !!b)
      const ref = typeof path === 'string' ? path.replace(/\\/g, '/') : ''
      if (!ref || ref.length > 4096 || ref.includes('\0')) throw new MobileError(400, 'INVALID_INPUT', 'path no válido')
      for (const base of bases) {
        let rel: string
        if (isAbsolute(ref) || /^[A-Za-z]:\//.test(ref)) {
          rel = relative(resolve(base), resolve(ref)).replace(/\\/g, '/')
          if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue
        } else {
          rel = ref.replace(/^\.\//, '')
        }
        if (rel.split('/').some((s) => !s || s === '.' || s === '..')) continue
        const abs = await resolveInside(base, rel)
        if (abs) return abs
      }
      throw new MobileError(404, 'FILE_NOT_FOUND', 'No se encontró el archivo')
    }
    const rel = relPath(path)
    if (source === 'attachment' && !rel.startsWith('attachments/')) throw new MobileError(400, 'INVALID_INPUT', 'path debe estar en attachments/')
    const state = await this.existing(conversationId)
    const base = source === 'attachment' ? state.project.dir : state.project.workDir
    const abs = base ? await resolveInside(base, rel) : null
    if (!abs) throw new MobileError(404, 'FILE_NOT_FOUND', 'No se encontró el archivo')
    return abs
  }

  async files(conversationId: string, q: string): Promise<MobileFiles> {
    const state = await this.existing(conversationId)
    const needle = q.toLowerCase()
    const attachments = needle ? state.attachments.filter((a) => a.name.toLowerCase().includes(needle)) : state.attachments
    const workDir = state.project.workDir
    if (!workDir) return { attachments, folder: null }
    return { attachments, folder: { name: basename(workDir), path: workDir, ...await listFolder(workDir, q) } }
  }

  /** Borra un resultado o un adjunto del proyecto (disco incluido); emite files.deleted. */
  async deleteFile(conversationId: string, ref: ProjectFileRef): Promise<{ deleted: true }> {
    const state = await this.existing(conversationId)
    const found = 'artifactId' in ref ? state.artifacts.some((a) => a.id === ref.artifactId) : state.attachments.some((a) => a.id === ref.attachmentId)
    if (!found) throw new MobileError(404, 'FILE_NOT_FOUND', 'No se encontró el archivo')
    await this.call('deleteProjectFile', conversationId, ref)
    return { deleted: true }
  }

  /** Lo añade a los adjuntos del proyecto sin enviar ningún mensaje (emite attachments.updated). */
  async addAttachment(conversationId: string, file: string): Promise<Attachment> {
    await this.existing(conversationId)
    const [attachment] = copyAttachments(conversationId, [file])
    if (!attachment) throw new MobileError(500, 'UPLOAD_FAILED', 'No se pudo guardar el archivo', true)
    return attachment
  }

  async ensureConversation(conversationId: string): Promise<void> {
    await this.existing(conversationId)
  }

  // ---- Ajustes y consumo ----

  async setAgentAccess(access: AgentAccess): Promise<{ agentAccess: AgentAccess }> {
    await this.call('setAgentAccess', access)
    return { agentAccess: (await this.call<AppConfig>('getConfig')).agentAccess }
  }

  /** El modelo de Hermes y los de cada proveedor con el que tiene sesión («/model»). */
  async hermesModels(): Promise<HermesModelsInfo> {
    return this.call<HermesModelsInfo>('getHermesModels')
  }

  /** Elige el modelo de Hermes (null: el de su configuración). */
  async setHermesModel(choice: { provider: string; model: string } | null): Promise<HermesModelsInfo> {
    return this.call<HermesModelsInfo>('setHermesModel', choice)
  }

  /** Nombre del ordenador que se ve abajo en la barra lateral («» vuelve al de la red). */
  async setServerName(name: string): Promise<{ serverName: string | null }> {
    await this.call('setServerName', name)
    return { serverName: (await this.call<AppConfig>('getConfig')).serverName ?? null }
  }

  /** Órbita elige el tema: el servidor lo guarda y lo siguen el escritorio, los clientes y el navegador. */
  async setTheme(id: string): Promise<{ theme: string }> {
    await this.call('setUiTheme', id)
    return { theme: (await this.call<AppConfig>('getConfig')).uiTheme ?? 'clasico' }
  }

  async setPlanApproval(enabled: boolean): Promise<{ planApproval: boolean }> {
    await this.call('setPlanApproval', enabled)
    return { planApproval: (await this.call<AppConfig>('getConfig')).planApproval !== false }
  }

  /** «Reiniciar agente» tras un fallo: olvida su bloqueo, comprueba que responde y lo deja disponible. */
  async resetAgent(agentId: string): Promise<{ agentId: string; activity: AgentRuntime['activity']; reason: string | null }> {
    const known = (await this.call<AppConfig>('getConfig')).agents.some((a) => a.id === agentId) || (this.agents?.() ?? []).some((a) => a.id === agentId)
    if (!known) throw new MobileError(404, 'AGENT_NOT_FOUND', 'No existe ese agente')
    const rt = await this.call<AgentRuntime>('resetAgent', agentId)
    return { agentId, activity: rt.activity, reason: rt.reason ?? null }
  }

  /** Razonamiento («think») del modelo local de LM Studio, como el interruptor de su tarjeta en el escritorio. */
  async setAgentThinking(agentId: string, enabled: boolean): Promise<{ agentId: string; thinking: boolean }> {
    const agent = (await this.call<AppConfig>('getConfig')).agents.find((a) => a.id === agentId)
    if (!agent) throw new MobileError(404, 'AGENT_NOT_FOUND', 'No existe ese agente')
    if (agent.provider !== 'lmstudio') throw new MobileError(400, 'INVALID_INPUT', 'El razonamiento solo se cambia en el agente de LM Studio')
    await this.call('setAgentThinking', agentId, enabled)
    return { agentId, thinking: enabled }
  }

  /** Calidad de cada agente en los últimos días (como ⚙ → «Cómo rinde cada agente…»). */
  async quality(days: number): Promise<MobileQuality> {
    const runs = await this.call<UsageRun[]>('getUsageRuns')
    return { days, minTasks: QUALITY_MIN_TASKS, agents: agentQuality(runs, Date.now() - days * 86_400_000) }
  }

  /** GET /usage/cost: el dinero de los últimos `days` días, como la sección «Coste» del escritorio. */
  async usageCost(days: number): Promise<MobileCost> {
    const [runs, config] = await Promise.all([this.call<UsageRun[]>('getUsageRuns'), this.call<AppConfig>('getConfig')])
    return mobileCost(runs, config, days)
  }

  async refreshUsage(): Promise<{ quotas: QuotaInfo[] }> {
    await this.call('refreshQuotas')
    return { quotas: (await this.call<{ quotas: QuotaInfo[] }>('getRuntime')).quotas }
  }

  /** Actualización del servidor pedida desde el móvil: si sigue en marcha y, si falló, por qué. */
  private serverUpdating = false
  private serverUpdateError: string | null = null

  /** El selector de «/video» del móvil: estilos (con o sin muestra), personajes y voces, como en el escritorio. */
  async videoPicker(): Promise<MobileVideoPicker> {
    const [characters, found] = await Promise.all([
      this.call<VideoCharacterInfo[]>('listVideoCharacters'),
      this.call<{ voices: VideoVoiceInfo[]; missing: string[] }>('listVideoVoices').catch(() => ({ voices: [] as VideoVoiceInfo[], missing: [] as string[] }))
    ])
    const thumbs = new Set(this.methods.has('videoStyleThumbs') ? await this.call<string[]>('videoStyleThumbs') : [])
    // Con el servidor en español o en inglés, la primera voz de la lista es la de por defecto (la que va sin marca).
    const first = found.voices[0]?.id
    const defaultVoice = first && Object.values(LANG_VOICES).some((ids) => ids[0] === first) ? first : null
    return {
      categories: FILM_CATEGORIES.map((c) => ({ ...c })),
      styles: FILM_STYLES.map((f) => ({ ...f, thumb: thumbs.has(f.slug) })),
      characters,
      voices: found.voices,
      missing: found.missing,
      defaultVoice
    }
  }

  /** La muestra (WebP) de un estilo de película. */
  async videoStyleThumb(slug: string): Promise<Buffer> {
    const img = this.methods.has('videoStyleThumb') ? await this.call<Buffer | null>('videoStyleThumb', slug) : null
    if (!img) throw new MobileError(404, 'NOT_FOUND', 'Ese estilo no tiene muestra')
    return img
  }

  /** Una muestra corta de una voz para el vídeo (MP3). Si esa voz no está en el servidor, dice por qué. */
  async videoVoicePreview(voiceId: string): Promise<{ type: string; data: string }> {
    let url: string
    try {
      url = await this.call<string>('previewVideoVoice', voiceId)
    } catch (e) {
      if (e instanceof MobileError) throw e
      throw new MobileError(422, 'VOICE_UNAVAILABLE', (e as Error).message || 'No se pudo preparar la muestra')
    }
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(url)
    if (!m) throw new MobileError(502, 'VOICE_UNAVAILABLE', 'La muestra no llegó bien')
    return { type: m[1], data: m[2] }
  }

  /** Crear un personaje (para todos los proyectos), como «Agregar personaje» del escritorio. */
  async addVideoCharacter(input: { name: string; description?: string; images?: { name: string; data: string }[]; thumb?: string }): Promise<{ id: string; characters: VideoCharacterInfo[] }> {
    try {
      return await this.call<{ id: string; characters: VideoCharacterInfo[] }>('addVideoCharacter', input)
    } catch (e) {
      if (e instanceof MobileError) throw e
      throw new MobileError(400, 'INVALID_INPUT', (e as Error).message || 'No se pudo guardar el personaje')
    }
  }

  async removeVideoCharacter(id: string): Promise<{ characters: VideoCharacterInfo[] }> {
    try {
      return { characters: await this.call<VideoCharacterInfo[]>('removeVideoCharacter', id) }
    } catch (e) {
      if (e instanceof MobileError) throw e
      throw new MobileError(400, 'INVALID_INPUT', (e as Error).message || 'No se pudo borrar el personaje')
    }
  }

  /** «Novedades» de la versión del servidor (null si no hay o este servidor no lo sabe). */
  async serverNews(): Promise<WhatsNew | null> {
    if (!this.methods.has('latestWhatsNew')) return null
    return this.call<WhatsNew | null>('latestWhatsNew')
  }

  /** ¿Hay versión nueva del servidor en GitHub? (git fetch y comparar, como ⚙ → «Buscar actualizaciones…»). */
  async serverUpdate(): Promise<MobileServerUpdate> {
    const s = await this.call<UpdateStatus>('checkForUpdates')
    return {
      canUpdate: s.canUpdate,
      reason: s.reason ?? null,
      current: s.current ?? null,
      commits: s.commits.slice(0, 30),
      commitCount: s.commits.length,
      localChanges: s.localChanges?.length ?? 0,
      localCommits: s.localCommits?.length ?? 0,
      pendingInstall: s.pendingInstall === true,
      updating: this.serverUpdating,
      lastError: this.serverUpdateError
    }
  }

  /**
   * Descarga, compila e instala la versión nueva y reinicia el servidor. Lleva minutos: se responde en cuanto empieza;
   * si va bien, el servidor se reinicia (Órbita se reconecta sola) y, si falla, vuelve a la versión anterior y el
   * motivo sale en GET /server/update. Con setAside, lo hecho en el servidor que no está en GitHub se aparta antes
   * (git stash o una rama: se guarda, no se borra).
   */
  async startServerUpdate(setAside: boolean): Promise<{ status: 'started' }> {
    if (this.serverUpdating) throw new MobileError(409, 'UPDATE_RUNNING', 'El servidor ya se está actualizando')
    const s = await this.call<UpdateStatus>('checkForUpdates')
    const local = !!(s.localChanges?.length || s.localCommits?.length)
    if (!s.canUpdate && !(setAside && local)) throw new MobileError(409, 'UPDATE_NOT_POSSIBLE', s.reason ?? 'No se puede actualizar el servidor')
    if (!s.commits.length) throw new MobileError(409, 'UP_TO_DATE', 'El servidor ya tiene la última versión')
    this.serverUpdating = true
    this.serverUpdateError = null
    void this.call<string>('applyUpdate', setAside).then(
      (message) => {
        // Sin mensaje, ha ido bien y el servidor se está reiniciando.
        if (message) {
          this.serverUpdating = false
          this.serverUpdateError = message
        }
      },
      (e: unknown) => {
        this.serverUpdating = false
        this.serverUpdateError = e instanceof Error ? e.message : String(e)
      }
    )
    return { status: 'started' }
  }

  /**
   * Nota de voz → texto con el Whisper del propio equipo, igual que el dictado del escritorio: sin servicios externos
   * y el audio se borra al terminar.
   */
  async transcribe(audio: Uint8Array, ext: string, language: string): Promise<{ text: string }> {
    const path = savePastedFile(`nota-de-voz.${ext}`, audio)
    try {
      return { text: String(await this.call<string>('transcribeAudio', path, language)).trim() }
    } catch (e) {
      if (e instanceof MobileError) throw e
      throw new MobileError(500, 'TRANSCRIPTION_FAILED', (e as Error)?.message || 'No se pudo convertir la nota de voz en texto', true)
    } finally {
      rmSync(dirname(path), { recursive: true, force: true })
    }
  }
}
