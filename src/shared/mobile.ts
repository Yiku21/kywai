import type { AgentAccess, AgentConfig, AgentRuntime, Artifact, ArtifactKind, Attachment, ChatMessage, MemoryEntry, QuotaInfo, StationConfig, Task, TraceEntry, UsageRun } from './types'
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
  usage: MobileUsage
  /** planApproval: el coordinador espera tu visto bueno antes de ejecutar cada plan. */
  /** theme: el tema elegido en el escritorio (id de lib/theme.ts), para que Órbita se vea igual. */
  settings: { agentAccess: AgentAccess; planApproval: boolean; theme?: string }
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
    /** «@Agente …» o «/directo Agente …» en el chat: el texto va tal cual a ese agente, sin pasar por Hermes. */
    directMessages: boolean
    /** Varios chats por proyecto, retomables (GET/POST /chats, /chats/:id/open|rename|delete). */
    chats?: boolean
    /** Buscador de todos los proyectos (GET /search). */
    search?: boolean
    /** GET /music/search: radios de SomaFM y canciones de Audius para escuchar en el móvil. */
    music?: boolean
    /** Razonamiento del modelo local: POST /agents/{agentId}/thinking. */
    agentThinking: boolean
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
