@file:OptIn(ExperimentalSerializationApi::class)

package com.aicowork.remote.data.model

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames
import kotlinx.serialization.json.JsonObject

// Modelos del contrato móvil /api/mobile/v1. Son tolerantes: todo campo no esencial tiene valor por defecto y
// los campos desconocidos se ignoran, para que la app siga funcionando si el servidor añade información.

@Serializable
data class PairRequest(val code: String, val deviceName: String)

@Serializable
data class PairResponse(val accessToken: String, val expiresAt: String? = null, val serverName: String = "AI Cowork")

@Serializable
data class ApiErrorBody(val code: String = "unknown", val message: String = "", val retryable: Boolean = false)

@Serializable
data class SendMessageRequest(val conversationId: String?, val text: String, val clientMessageId: String)

@Serializable
data class SendMessageResponse(
    val message: ChatMessage? = null,
    @JsonNames("runId") val requestId: String? = null,
)

@Serializable
data class ConversationResponse(val conversation: Conversation? = null)

@Serializable
data class NewConversationRequest(val name: String)

@Serializable
data class Snapshot(
    val conversation: Conversation = Conversation(),
    val agents: List<Agent> = emptyList(),
    val tasks: List<TaskItem> = emptyList(),
    val memory: List<MemoryEntry> = emptyList(),
    val usage: Usage = Usage(),
    val capabilities: Capabilities = Capabilities(),
    /** Último número de secuencia incluido (opcional): los eventos con número menor o igual ya están aplicados. */
    val sequence: Long? = null,
    /** Proyectos del ordenador (para elegir cuál se ve); vacío en servidores anteriores. */
    val projects: List<ProjectSummary> = emptyList(),
    val stations: List<StationConfig> = emptyList(),
    val settings: ServerSettings = ServerSettings(),
)

@Serializable
data class Conversation(
    val id: String? = null,
    val title: String? = null,
    val messages: List<ChatMessage> = emptyList(),
    @JsonNames("activeRunIds") val activeRequestIds: List<String> = emptyList(),
    @Serializable(with = FlexibleTimeSerializer::class) val createdAt: Long? = null,
    /** Lo que ha creado el equipo en este proyecto. */
    val artifacts: List<Artifact> = emptyList(),
    /** Archivos que se dieron al proyecto como contexto. */
    val attachments: List<Attachment> = emptyList(),
    /** Carpeta del usuario donde trabajan los agentes (si el proyecto tiene una). */
    val folder: ProjectFolder? = null,
    /** Instrucciones del proyecto para todos los agentes. */
    val instructions: String? = null,
)

@Serializable
data class ProjectSummary(
    val id: String,
    val name: String = id,
    @Serializable(with = FlexibleTimeSerializer::class) val createdAt: Long? = null,
    @Serializable(with = FlexibleTimeSerializer::class) val updatedAt: Long? = null,
    val running: Boolean = false,
)

@Serializable
data class ProjectsResponse(val projects: List<ProjectSummary> = emptyList())

@Serializable
data class StationConfig(
    val id: String,
    val label: String = "",
    val position: List<Double> = emptyList(),
    val forSubagents: Boolean = false,
)

@Serializable
data class ServerSettings(
    val agentAccess: String = "full",
    /** Hermes espera tu visto bueno antes de ejecutar cada plan. */
    val planApproval: Boolean = false,
)

@Serializable
data class ProjectFolder(val name: String = "", val path: String = "")

@Serializable
data class Attachment(
    val id: String,
    val name: String = "",
    val relPath: String = "",
    val mime: String = "",
    val size: Long = 0,
)

@Serializable
data class Artifact(
    val id: String,
    val projectId: String? = null,
    val taskId: String? = null,
    val agentId: String? = null,
    val name: String = "",
    val relPath: String = "",
    /** html | markdown | code | image | text | other */
    val kind: String = "other",
    val size: Long = 0,
    @Serializable(with = FlexibleTimeSerializer::class) val createdAt: Long? = null,
)

@Serializable
data class FolderFile(
    val path: String,
    val name: String = path.substringAfterLast('/'),
    val size: Long = 0,
    @Serializable(with = FlexibleTimeSerializer::class) val modifiedAt: Long? = null,
    val kind: String = "other",
)

@Serializable
data class FolderListing(
    val name: String = "",
    val path: String = "",
    val files: List<FolderFile> = emptyList(),
    val truncated: Boolean = false,
)

@Serializable
data class FilesResponse(val attachments: List<Attachment> = emptyList(), val folder: FolderListing? = null)

@Serializable
data class UploadResponse(val attachment: Attachment? = null)

@Serializable
data class TraceResponse(val taskId: String? = null, val entries: List<TraceEntry> = emptyList())

@Serializable
data class MemoryAddRequest(val conversationId: String, val kind: String, val text: String)

@Serializable
data class MemoryUpdateRequest(
    val conversationId: String,
    val text: String? = null,
    val kind: String? = null,
    val status: String? = null,
)

@Serializable
data class ConversationOnlyRequest(val conversationId: String)

@Serializable
data class MemoryEntryResponse(val entry: MemoryEntry? = null)

@Serializable
data class InstructionsRequest(val conversationId: String, val text: String)

@Serializable
data class InstructionsResponse(val instructions: String? = null)

@Serializable
data class AgentAccessRequest(val access: String)

@Serializable
data class AgentAccessResponse(val agentAccess: String = "full")

@Serializable
data class PlanApprovalRequest(val enabled: Boolean)

@Serializable
data class PlanApprovalResponse(val planApproval: Boolean = true)

/** Tarea del plan que propone Hermes: todavía no existe; se crea al aprobar el plan. */
@Serializable
data class ProposedTask(
    val key: String,
    val title: String = "",
    val description: String = "",
    val agentId: String = "",
    /** easy | medium | hard */
    val difficulty: String = "medium",
    /** keys de las tareas de este plan que tienen que terminar antes. */
    val dependsOn: List<String> = emptyList(),
    val acceptance: String? = null,
)

/** Plan que espera tu visto bueno: pending, approved (ya en marcha), revised (le pediste cambios) o rejected. */
@Serializable
data class PlanProposal(
    val status: String = "pending",
    val tasks: List<ProposedTask> = emptyList(),
    val request: String = "",
) {
    val isPending: Boolean get() = status == "pending"
}

@Serializable
data class QuotasResponse(val quotas: List<Quota> = emptyList())

@Serializable
data class TranscriptResponse(val text: String = "")

/** Paquete que viaja entre agentes (evento `transfer.started`): lo anima el mundo. */
@Serializable
data class TransferInfo(
    val id: String,
    val fromId: String,
    val toId: String,
    val label: String = "",
    val taskId: String? = null,
    val payload: TransferPayload = TransferPayload(),
)

@Serializable
data class TransferPayload(val title: String = "", val summary: String? = null, val files: List<String> = emptyList())

@Serializable
data class Author(val type: String = "system", val agentId: String? = null, val name: String? = null) {
    val isUser get() = type == "user"
    val isAgent get() = type == "agent"
}

@Serializable
data class ChatMessage(
    val id: String,
    val conversationId: String? = null,
    val projectId: String? = null,
    @JsonNames("runId") val requestId: String? = null,
    val author: Author = Author(),
    val text: String = "",
    @Serializable(with = FlexibleTimeSerializer::class) val createdAt: Long? = null,
    val streaming: Boolean = false,
    val tone: String? = null,
    val taskIds: List<String> = emptyList(),
    val clientMessageId: String? = null,
    val attachments: List<Attachment> = emptyList(),
    val artifactIds: List<String> = emptyList(),
    /** Plan de Hermes que espera tu visto bueno (al aprobarlo, el mensaje recibe taskIds). */
    val proposal: PlanProposal? = null,
    /** Mensaje de una tarea: lo que el agente va contando mientras la hace; al acabar, text es su resultado. */
    val work: TaskWork? = null,
    /** Mensaje tuyo enviado directo a un agente («@Qwen …»): no pasó por Hermes. */
    val direct: DirectTarget? = null,
) {
    /** Conversación (proyecto) a la que pertenece, si el servidor lo indica. */
    val ownerId: String? get() = conversationId ?: projectId
}

@Serializable
data class DirectTarget(val agentId: String, val name: String = agentId)

@Serializable
data class ContextUsage(val used: Long = 0, val capacity: Long? = null)

@Serializable
data class RobotAvatar(
    val body: String = "capsule",
    val accessory: String = "none",
    val eyes: String = "round",
    val logo: String = "none",
    val eyeColor: String? = null,
    val accentColor: String? = null,
    val trimColor: String? = null,
)

@Serializable
data class Agent(
    val id: String,
    val name: String = id,
    val role: String = "",
    val provider: String = "",
    val modelLabel: String = "",
    val color: String = "#7C5CFF",
    val avatar: RobotAvatar? = null,
    val stationId: String? = null,
    val location: String = "station",
    val waitingFor: String? = null,
    val activity: String = "idle",
    val taskId: String? = null,
    val lastActivity: String? = null,
    @Serializable(with = FlexibleTimeSerializer::class) val lastActivityAt: Long? = null,
    val reason: String? = null,
    val strengths: List<String> = emptyList(),
    val plannerOnly: Boolean = false,
    val enabled: Boolean = true,
    val isSubagent: Boolean = false,
    val context: ContextUsage? = null,
)

/** Cambio parcial del estado de un agente (evento `agent.runtime`). */
@Serializable
data class AgentRuntime(
    val agentId: String,
    val location: String? = null,
    val waitingFor: String? = null,
    val activity: String? = null,
    val taskId: String? = null,
    val lastActivity: String? = null,
    @Serializable(with = FlexibleTimeSerializer::class) val lastActivityAt: Long? = null,
    val reason: String? = null,
    val context: ContextUsage? = null,
)

@Serializable
data class TokenUsage(val input: Long = 0, val output: Long = 0, val cached: Long? = null) {
    val total get() = input + output
}

@Serializable
data class TraceEntry(
    val id: String,
    @Serializable(with = FlexibleTimeSerializer::class) val ts: Long? = null,
    val kind: String = "note",
    val tool: String? = null,
    val title: String = "",
    val body: String? = null,
    val output: String? = null,
    val ok: Boolean? = null,
)

@Serializable
data class TaskItem(
    val id: String,
    @JsonNames("runId") val requestId: String? = null,
    val title: String = "",
    val description: String = "",
    val agentId: String = "",
    val status: String = "pending",
    val difficulty: String? = null,
    val progress: Double? = null,
    val lastActivity: String? = null,
    val result: String? = null,
    val error: String? = null,
    val acceptance: String? = null,
    val files: List<String> = emptyList(),
    val dependsOn: List<String> = emptyList(),
    @Serializable(with = FlexibleTimeSerializer::class) val createdAt: Long? = null,
    @Serializable(with = FlexibleTimeSerializer::class) val startedAt: Long? = null,
    @Serializable(with = FlexibleTimeSerializer::class) val finishedAt: Long? = null,
    val usage: TokenUsage? = null,
    val trace: List<TraceEntry> = emptyList(),
    /** Pasos que tiene el registro completo (la instantánea solo trae los últimos). */
    val traceCount: Int? = null,
    /** Proyecto (= conversación) al que pertenece. */
    val projectId: String? = null,
    val artifactIds: List<String> = emptyList(),
    /** Archivos de otras tareas que modificó (hay que revisarlo). */
    val outOfScope: List<String> = emptyList(),
    val model: String? = null,
) {
    val isActive get() = status == "running" || status == "pending" || status == "blocked"
    val isResumable get() = status == "cancelled" || status == "failed"
    /** Detenida desde el móvil o al cerrar la app: se puede reanudar. */
    val isPaused get() = status == "cancelled" && error == INTERRUPTED_ERROR

    companion object {
        /** Así marca el escritorio una tarea en pausa (detenida o interrumpida, reanudable). */
        const val INTERRUPTED_ERROR = "Interrumpida al cerrar la app"
    }
}

@Serializable
data class MemoryEntry(
    val id: String,
    val kind: String = "fact",
    val text: String = "",
    val status: String = "provisional",
    val by: String? = null,
    val byName: String? = null,
    val taskTitle: String? = null,
    @Serializable(with = FlexibleTimeSerializer::class) val createdAt: Long? = null,
    val supersededBy: String? = null,
)

@Serializable
data class Quota(
    val id: String,
    val label: String = id,
    val kind: String = "usage",
    val remainingPct: Double? = null,
    val period: String? = null,
    @Serializable(with = FlexibleTimeSerializer::class) val resetsAt: Long? = null,
    val source: String = "none",
    val unlimited: Boolean = false,
    val agentIds: List<String> = emptyList(),
    val note: String? = null,
)

@Serializable
data class AgentUsage(val agentId: String, val input: Long = 0, val output: Long = 0)

@Serializable
data class Usage(
    val totals: TokenUsage = TokenUsage(),
    val quotas: List<Quota> = emptyList(),
    val byAgent: List<AgentUsage> = emptyList(),
)

@Serializable
data class Capabilities(
    val stopRequests: Boolean = true,
    val resumeRequests: Boolean = true,
    /** «Quitar» lo que quedó en pausa sin reanudarlo (servidores anteriores no lo tienen). */
    val discardRequests: Boolean = false,
    val newConversation: Boolean = true,
    val taskTrace: Boolean = true,
    val attachments: Boolean = false,
    // Lo que añadió la versión Órbita del servidor (en versiones anteriores, falso: la app explica que falta actualizar).
    val projects: Boolean = false,
    val memoryEdit: Boolean = false,
    val files: Boolean = false,
    val upload: Boolean = false,
    val artifacts: Boolean = false,
    val traceEndpoint: Boolean = false,
    val agentAccess: Boolean = false,
    val usageRefresh: Boolean = false,
    /** Notas de voz: el ordenador las convierte en texto con su dictado. */
    val voice: Boolean = false,
    /** Planes con visto bueno: aprobar o descartar desde el chat y el ajuste para pedirlo. */
    val planApproval: Boolean = false,
    /** Órbita se actualiza desde el ordenador (Ajustes → «Buscar actualizaciones»). */
    val appUpdate: Boolean = false,
    /** «/model»: ver y cambiar el modelo de Hermes. */
    val hermesModel: Boolean = false,
    /** «Reiniciar agente» tras un fallo. */
    val agentReset: Boolean = false,
    /** Ajustes → «Servidor»: buscar e instalar su versión nueva desde aquí. */
    val serverUpdate: Boolean = false,
    /** Bandeja «Te necesita» (GET /inbox y el evento `inbox.updated`). */
    val inbox: Boolean = false,
    /** Cambios de una tarea y deshacerlos (GET /tasks/{id}/changes, POST /tasks/{id}/undo). */
    val taskChanges: Boolean = false,
    /** «@Agente …» o «/directo Agente …»: el texto va tal cual a ese agente, sin pasar por Hermes. */
    val directMessages: Boolean = false,
)

/** Botón de un aviso de la bandeja. Con [url] (p. ej. vnc://… para Compartir pantalla) se abre en el móvil y no va al servidor. */
@Serializable
data class InboxAction(val id: String, val label: String = id, val url: String? = null)

/**
 * Aviso de la bandeja «Te necesita». kind: plan, stalled, mac-permission, question, verify-failed, conflict, failed o
 * done. [projectId] es el id de la conversación. Abierto mientras no tiene [resolvedAt].
 */
@Serializable
data class InboxItem(
    val id: String,
    val kind: String = "question",
    val title: String = "",
    val detail: String? = null,
    val projectId: String? = null,
    val runId: String? = null,
    val taskId: String? = null,
    val messageId: String? = null,
    val agentId: String? = null,
    val key: String? = null,
    val actions: List<InboxAction> = emptyList(),
    @Serializable(with = FlexibleTimeSerializer::class) val createdAt: Long? = null,
    @Serializable(with = FlexibleTimeSerializer::class) val resolvedAt: Long? = null,
    val resolution: String? = null,
) {
    val isOpen: Boolean get() = resolvedAt == null
}

@Serializable
data class InboxResponse(val items: List<InboxItem> = emptyList())

@Serializable
data class InboxActionResponse(val item: InboxItem? = null, val message: String? = null)

/** Un cambio del código de AI Cowork (commit de GitHub). */
@Serializable
data class UpdateCommit(val hash: String = "", val date: String = "", val subject: String = "")

/** Si el servidor tiene versión nueva en GitHub y si se puede instalar desde aquí (GET /server/update). */
@Serializable
data class ServerUpdate(
    val canUpdate: Boolean = false,
    val reason: String? = null,
    val current: UpdateCommit? = null,
    val commits: List<UpdateCommit> = emptyList(),
    val commitCount: Int = 0,
    val localChanges: Int = 0,
    val localCommits: Int = 0,
    val pendingInstall: Boolean = false,
    val updating: Boolean = false,
    val lastError: String? = null,
) {
    /** Solo lo impide lo hecho en el servidor que no está en GitHub: se puede apartar (se guarda en git) y actualizar. */
    val blockedByLocal get() = !canUpdate && commitCount > 0 && (localChanges > 0 || localCommits > 0)
}

@Serializable
data class ServerUpdateRequest(val setAside: Boolean)

/** Estado de un agente tras reiniciarlo (POST /agents/{agentId}/reset). */
@Serializable
data class AgentResetResponse(val agentId: String, val activity: String = "idle", val reason: String? = null)

/** El modelo de Hermes y los de cada proveedor con el que tiene sesión (GET /hermes/models, «/model»). */
@Serializable
data class HermesModelsInfo(
    val installed: Boolean = false,
    val current: HermesCurrent = HermesCurrent(),
    val hermesDefault: HermesChoice? = null,
    /** El actual primero. */
    val providers: List<HermesProvider> = emptyList(),
    /** Cuándo actualizó Hermes estas listas (ms). */
    val updatedAt: Long? = null,
)

/** fromApp: lo eligió el usuario en AI Cowork; si no, es el de la configuración de Hermes. */
@Serializable
data class HermesCurrent(val provider: String = "", val model: String = "", val fromApp: Boolean = false)

@Serializable
data class HermesChoice(val provider: String, val model: String)

@Serializable
data class HermesProvider(val id: String, val label: String = id, val models: List<String> = emptyList())

@Serializable
data class HermesResetRequest(val reset: Boolean)

/** Lo que cuenta un agente mientras hace una tarea. status: running, done, failed o stopped. */
@Serializable
data class TaskWork(
    val taskId: String,
    val title: String = "",
    val status: String = "running",
    val steps: List<WorkStep> = emptyList(),
    /** Pasos del principio que ya no caben (están en la actividad completa de la tarea). */
    val hidden: Int = 0,
    /** Todo lo que hizo hasta ahora (también lo que ya no cabe en steps), en una línea. */
    val totals: WorkTotals? = null,
)

/** «Ejecutó 14 comandos, editó 3 archivos y creó 2 archivos», con lo que falló y las líneas que cambió. */
@Serializable
data class WorkTotals(
    val summary: String = "",
    val failed: Int = 0,
    val add: Int = 0,
    val del: Int = 0,
)

/** Una herramienta de un grupo: con su id se pide su detalle (comando, cambios, resultado) al registro de la tarea. */
@Serializable
data class WorkToolRef(
    val id: String,
    val tool: String = "other",
    val ok: Boolean? = null,
    val add: Int = 0,
    val del: Int = 0,
)

/**
 * kind note: una frase (text). kind tools: herramientas seguidas, en una línea (summary) y cada una (items).
 * kind files: archivos que el agente acaba de crear o abrir (files): capturas y documentos, para ver por dónde va.
 */
@Serializable
data class WorkStep(
    val kind: String,
    val text: String? = null,
    val summary: String? = null,
    val items: List<String> = emptyList(),
    val more: Int = 0,
    val failed: Int = 0,
    val files: List<WorkFile> = emptyList(),
    /** Una por cada item (mismo orden): su id para pedir el detalle, su resultado y sus líneas. */
    val refs: List<WorkToolRef> = emptyList(),
    /** Líneas que añade y quita el grupo entero. */
    val add: Int = 0,
    val del: Int = 0,
)

/** Un archivo nuevo del proyecto (relPath se pide con source=project). */
@Serializable
data class WorkFile(
    val relPath: String,
    val name: String = "",
    val image: Boolean = false,
    val size: Long = 0,
)

/** Última versión de Órbita que ofrece el ordenador (GET /app/android). */
@Serializable
data class AppRelease(
    /** Órbita solo la ofrece si es mayor que la instalada (Android no instala encima una más antigua). */
    val versionCode: Long,
    val versionName: String,
    val size: Long,
    val sha256: String,
    val builtAt: String? = null,
)

/** Sobre de cada evento del WebSocket. */
@Serializable
data class EventEnvelope(val type: String, val sequence: Long = 0, val payload: JsonObject = JsonObject(emptyMap()))
