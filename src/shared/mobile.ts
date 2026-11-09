import type { AgentAccess, AgentConfig, AgentRuntime, Artifact, ArtifactKind, Attachment, ChatMessage, MemoryEntry, BillingMode, CostCurrency, QuotaInfo, StationConfig, Task, TaskTemplate, TraceEntry, UsageRun } from './types'
import type { AgentQuality } from './agentQuality'

/** Carpeta de trabajo del proyecto (la del usuario a la que tienen acceso los agentes). */
export interface MobileFolder {
  name: string
  path: string
}

export interface MobileConversation {
  id: string | null
  title: string
  createdAt: number | null
  messages: ChatMessage[]
  artifacts: Artifact[]
  instructions: string
  activeRequestId: string | null
  activeRequestIds: string[]
  attachments: Attachment[]
  folder: MobileFolder | null
  /** El chat abierto en el proyecto (los demás se piden con GET /chats). */
  chat?: { id: string; title: string } | null
}

export interface MobileProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** Tiene peticiones en marcha. */
  running: boolean
  /** Fijado en la barra lateral (sección «Fijados»). */
  pinned?: boolean
}

/** En la instantánea, solo las últimas entradas del registro; el completo está en GET /tasks/{id}/trace. */
export type MobileTask = Task & { trace: TraceEntry[]; traceCount: number }

export interface MobileSnapshot {
  conversation: MobileConversation
  projects: MobileProject[]
  agents: Array<AgentConfig & Partial<AgentRuntime>>
  stations: StationConfig[]
  tasks: MobileTask[]
  memory: MemoryEntry[]
  /** Plantillas de tareas de todos los proyectos (las de otro proyecto tienen su projectId). */
  templates?: TaskTemplate[]
  /** Las órdenes «/…» de los mods encendidos, para la lista del «/» (las de kywai Órbita ya las sabe). */
  modCommands?: Array<{ name: string; description: string; mod: string }>
  usage: MobileUsage
  /** planApproval: el coordinador espera tu visto bueno antes de ejecutar cada plan. */
  /**
   * theme: el tema elegido en el escritorio (id de lib/theme.ts), para que Órbita se vea igual. serverName: el nombre
   * que le puso el usuario al ordenador (sin él, el de la red).
   */
  settings: { agentAccess: AgentAccess; planApproval: boolean; theme?: string; serverName?: string }
  sequence: number
  capabilities: {
    apiVersion: 'v1'
    chat: boolean
    conversations: boolean
    stop: boolean
    resume: boolean
    events: 'websocket'
    bootId: string
    eventSequence: number
    maxMessageLength: number
    attachments: boolean
    stopRequests: boolean
    resumeRequests: boolean
    /** POST /requests/{id}/discard: quitar lo que quedó en pausa sin reanudarlo. */
    discardRequests: boolean
    newConversation: boolean
    taskTrace: boolean
    projects: boolean
    memoryEdit: boolean
    files: boolean
    upload: boolean
    artifacts: boolean
    traceEndpoint: boolean
    agentAccess: boolean
    usageRefresh: boolean
    /** Notas de voz convertidas en texto en el propio equipo (POST /voice/transcribe). */
    voice: boolean
    /** Planes con visto bueno: POST /plans/{messageId}/approve|reject y /settings/plan-approval. */
    planApproval: boolean
    /** Órbita se actualiza desde el ordenador: GET /app/android (versión publicada) y /app/android/apk. */
    appUpdate: boolean
    /** «/model»: GET /hermes/models y POST /hermes/model (ver y cambiar el modelo de Hermes). */
    hermesModel: boolean
    /** «Reiniciar agente» tras un fallo: POST /agents/{agentId}/reset. */
    agentReset: boolean
    /** Actualizar el servidor desde el móvil (como ⚙ → «Buscar actualizaciones…»): GET y POST /server/update. */
    serverUpdate: boolean
    /** GET /quality: calidad de cada agente (👍, verificación a la primera, correcciones, fallos) por dificultad. */
    agentQuality: boolean
    /** Bandeja «Te necesita»: GET /inbox y POST /inbox/{id}/{actionId}; los cambios llegan con el evento inbox.updated. */
    inbox: boolean
    /** Cambios de cada tarea: GET /tasks/{taskId}/changes y POST /tasks/{taskId}/undo. */
    taskChanges: boolean
    /** Rutinas del proyecto: GET /routines (ver) y POST /routines/{routineId}/run («Ejecutar ahora»). */
    routines: boolean
    /**
     * Plantillas de tareas: GET/POST /templates, POST /templates/{id} (cambiar), /templates/{id}/delete y
     * /templates/restore; en POST /chat/messages, templateId. Los cambios llegan con el evento templates.updated.
     */
    templates?: boolean
    /** Crear, cambiar y borrar rutinas: POST /routines, POST /routines/{routineId} y POST /routines/{routineId}/delete. */
    routinesEdit?: boolean
    /** Tarjeta «Crear rutina» que propone Hermes: POST /messages/{messageId}/routine-proposal/(create|dismiss). */
    routineProposals?: boolean
    /** «@Agente …» o «/directo Agente …» en el chat: el texto va tal cual a ese agente, sin pasar por Hermes. */
    directMessages: boolean
    /** Varios chats por proyecto, retomables (GET/POST /chats, /chats/:id/open|rename|delete). */
    chats?: boolean
    /** Menú de un chat al mantenerlo pulsado: POST /chats/:id/pin|fork|move, GET /chats/pinned y borrar también el abierto. */
    chatActions?: boolean
    /** Menú de un proyecto al mantenerlo pulsado: POST /projects/:id/rename|pin|delete. */
    projectActions?: boolean
    /** Buscador de todos los proyectos (GET /search). */
    search?: boolean
    /** Historial: GET /chats/all y GET /search con since, author, limit (con el total y el mensaje exacto). */
    history?: boolean
    /** POST /settings/server-name: cambiar el nombre del ordenador que se ve en la barra lateral. */
    serverName?: boolean
    /** POST /settings/theme: elegir el tema desde el móvil (lo siguen el escritorio, los clientes y el navegador). */
    theme?: boolean
    /** GET /music/search: radios de SomaFM y canciones de Audius para escuchar en el móvil. */
    music?: boolean
    /** Razonamiento del modelo local: POST /agents/{agentId}/thinking. */
    agentThinking: boolean
    /** Paneles de los mods (GET /mods/panels y /mods/panel). */
    modPanels: boolean
    /** «/recuerda …» enviado como mensaje se anota en la memoria (y llegan modCommands en la instantánea). */
    chatCommands?: boolean
    /** GET /usage/cost y usage.cost en la instantánea: dinero por agente, suscripciones y presupuesto. */
    usageCost: boolean
  }
}

/** Si el servidor tiene versión nueva en GitHub y si se puede instalar desde el móvil. */
export interface MobileServerUpdate {
  canUpdate: boolean
  /** Por qué no se puede (sin conexión con GitHub, cambios hechos en el servidor…). */
  reason: string | null
  current: { hash: string; date: string; subject: string } | null
  /** Cambios nuevos en GitHub, del más reciente al más antiguo (como mucho 30; el total va en commitCount). */
  commits: Array<{ hash: string; date: string; subject: string }>
  commitCount: number
  /** Archivos y commits hechos en el servidor que no están en GitHub: se pueden apartar (setAside) para actualizar. */
  localChanges: number
  localCommits: number
  /** El código ya descargado es más nuevo que la app instalada: los commits son lo que falta por instalar. */
  pendingInstall: boolean
  /** Hay una actualización en curso (al terminar, el servidor se reinicia). */
  updating: boolean
  /** Por qué falló la última actualización pedida desde el móvil, si falló. */
  lastError: string | null
}

export interface MobileUsage {
  runs: UsageRun[]
  quotas: QuotaInfo[]
  totals: { input: number; output: number; cached: number }
  byAgent: Array<{ agentId: string; input: number; output: number }>
  /** Dinero de los últimos 30 días (como GET /usage/cost). Falta en servidores anteriores. */
  cost?: MobileCost
}

/**
 * GET /usage/cost: lo mismo que la sección «Coste» de ⚙ → «Uso y coste…». Los importes van ya en la moneda elegida
 * (`currency`); los precios de API, convertidos.
 */
export interface MobileCost {
  currency: CostCurrency
  days: number
  /** Pagado por uso (agentes que van por API) en el periodo. */
  paid: number
  /** Todo lo usado, a precios de API. */
  api: number
  /** Parte de `api` que sale de tokens estimados (Hermes y agentes de catálogo). */
  estimated: number
  unpricedCalls: number
  /** Presupuesto del mes de lo que se paga por API (null si no hay). */
  budget: { limit: number; spent: number; pct: number } | null
  byAgent: Array<{ agentId: string; name: string; mode: BillingMode | null; calls: number; api: number; estimated: boolean }>
  /** Suscripciones: precio al mes frente a lo que habría costado por API lo hecho en 30 días. */
  subscriptions: Array<{ key: string; label: string; monthly: number | null; api30: number; runs30: number; verdict: 'worth' | 'cheaper-api' | null }>
  /** Día en que se comprobaron los precios de fábrica (AAAA-MM-DD). */
  pricesChecked: string
}

/** GET /quality: lo mismo que ⚙ → «Cómo rinde cada agente…». */
export interface MobileQuality {
  days: number
  /** Desde cuántas tareas lo ve el coordinador en la ficha del agente. */
  minTasks: number
  agents: AgentQuality[]
}

export interface MobileChatReceipt {
  conversationId: string
  requestId: string
  clientMessageId: string
  message: ChatMessage & { conversationId: string }
}

export interface MobileFolderFile {
  /** Relativa a la carpeta de trabajo, con «/». */
  path: string
  name: string
  size: number
  modifiedAt: number
  kind: ArtifactKind
}

export interface MobileFiles {
  attachments: Attachment[]
  folder: (MobileFolder & { files: MobileFolderFile[]; truncated: boolean }) | null
}

export interface MobileEventEnvelope {
  type: string
  sequence: number
  payload: Record<string, unknown>
}

/** Una radio o canción para Órbita: el móvil la escucha desde stream (servidores públicos de SomaFM o Audius). */
export interface MobileMusicResult {
  /** «radio:<id>» o «audius:<id>», como en la cola del escritorio. */
  id: string
  title: string
  artist: string
  /** Descripción de la radio o género de la canción. */
  detail?: string
  durationSec?: number
  thumbnail?: string
  stream: string
  /** Una radio en directo (sin duración). */
  live: boolean
}
