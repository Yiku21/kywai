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
data class PairResponse(val accessToken: String, val expiresAt: String? = null, val serverName: String = "kywai")

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
    /** Plantillas de tareas de todos los proyectos (las de uno llevan su projectId). Cambian con `templates.updated`. */
    val templates: List<TaskTemplate> = emptyList(),
    /** Las órdenes «/…» de los mods encendidos, para la lista del «/» (las de kywai las sabe Órbita). */
    val modCommands: List<ModChatCommand> = emptyList(),
)

/** Una orden «/…» de un mod: su nombre, lo que hace y el mod que la trae. */
@Serializable
data class ModChatCommand(val name: String, val description: String = "", val mod: String = "")

/** Una plantilla de tareas: una petición que se repite, lanzable con un toque o con «/command …». */
@Serializable
data class TaskTemplate(
    val id: String,
    val name: String,
    val icon: String? = null,
    val command: String = "",
    /** El texto que se envía, con sus huecos ({pr}, {carpeta}…). */
    val prompt: String = "",
    val projectId: String? = null,
    /** Va directa a ese agente, sin pasar por Hermes. */
    val agentId: String? = null,
    /** Pide el visto bueno al plan aunque el ajuste esté apagado. */
    val askPlan: Boolean = false,
    val pinned: Boolean = false,
    val builtin: String? = null,
    @Serializable(with = FlexibleTimeSerializer::class) val createdAt: Long? = null,
)

/** Crear o cambiar una plantilla (en un cambio, null = no se toca; projectId/agentId "" = quitarlo). */
@Serializable
data class TaskTemplateInput(
    val name: String? = null,
    val prompt: String? = null,
    val icon: String? = null,
    val command: String? = null,
    val projectId: String? = null,
    val agentId: String? = null,
    val askPlan: Boolean? = null,
    val pinned: Boolean? = null,
)

@Serializable
data class TemplateResponse(val template: TaskTemplate)

@Serializable
data class TemplatesResponse(val templates: List<TaskTemplate> = emptyList())

/** La respuesta de un agente a la que contestaste con «Responder». */
@Serializable
data class ReplyRef(val messageId: String, val agentId: String = "", val name: String = "", val excerpt: String = "")

/** Con qué plantilla se lanzó un mensaje. */
@Serializable
data class TemplateRef(val id: String, val name: String = "")

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
    /** El chat abierto en el proyecto (los demás, con GET /chats). */
    val chat: OpenChat? = null,
)

@Serializable
data class OpenChat(val id: String, val title: String = "")

/** Un chat de un proyecto (las conversaciones retomables de la barra lateral). */
@Serializable
data class ChatSummary(
    val id: String,
    val projectId: String = "",
    val title: String = "",
    @Serializable(with = FlexibleTimeSerializer::class) val createdAt: Long? = null,
    @Serializable(with = FlexibleTimeSerializer::class) val updatedAt: Long? = null,
    val messageCount: Int = 0,
    val current: Boolean = false,
    val pinned: Boolean = false,
    /** El equipo trabaja en este chat (aunque no sea el abierto: sigue en segundo plano). */
    val busy: Boolean = false,
)

@Serializable
data class ChatsResponse(val chats: List<ChatSummary> = emptyList())

/** Algo encontrado con «Buscar»: un chat, una tarea, un resultado o una entrada de memoria. */
@Serializable
data class SearchHit(
    val kind: String,
    val projectId: String,
    val projectName: String = "",
    val conversationId: String? = null,
    val title: String = "",
    val snippet: String = "",
    @Serializable(with = FlexibleTimeSerializer::class) val at: Long? = null,
    val ref: String? = null,
    /** Chats: el mensaje encontrado (al abrir, el chat baja hasta él). */
    val messageId: String? = null,
    /** Chats: cuántos mensajes coinciden. */
    val matchCount: Int = 0,
    /** Chats: los primeros mensajes que coinciden, para elegir a cuál ir. */
    val matches: List<SearchMatch> = emptyList(),
)

/** Un mensaje que coincide dentro de un chat encontrado. [by]: «user», «system» o el id del agente. */
@Serializable
data class SearchMatch(
    val messageId: String,
    val snippet: String = "",
    @Serializable(with = FlexibleTimeSerializer::class) val at: Long? = null,
    val by: String = "",
)

/** [total]: cuántas coincidencias hay en total (para «Ver más»); los servidores antiguos no lo envían. */
@Serializable
data class SearchResponse(val hits: List<SearchHit> = emptyList(), val total: Int? = null)

/** Una radio de SomaFM o una canción de Audius: Órbita la escucha desde [stream] (sin anuncios). */
@Serializable
data class MusicResult(
    val id: String,
    val title: String,
    val artist: String = "",
    val detail: String? = null,
    val durationSec: Int? = null,
    val thumbnail: String? = null,
    val stream: String,
    val live: Boolean = false,
)

@Serializable
data class MusicResponse(val results: List<MusicResult> = emptyList())

@Serializable
data class ChatRenameRequest(val conversationId: String, val title: String)

@Serializable
data class ChatPinRequest(val conversationId: String, val pinned: Boolean)

@Serializable
data class ChatMoveRequest(val conversationId: String, val toConversationId: String)

/** Respuesta de bifurcar o mover un chat: su id (en el destino) y los chats del proyecto de origen. */
@Serializable
data class ChatCopyResponse(val chatId: String, val chats: List<ChatSummary> = emptyList())

@Serializable
data class ProjectRenameRequest(val name: String)

@Serializable
data class PinRequest(val pinned: Boolean)

@Serializable
data class ProjectSummary(
    val id: String,
    val name: String = id,
    @Serializable(with = FlexibleTimeSerializer::class) val createdAt: Long? = null,
    @Serializable(with = FlexibleTimeSerializer::class) val updatedAt: Long? = null,
    val running: Boolean = false,
    /** Fijado en la barra lateral (sección «Fijados»). */
    val pinned: Boolean = false,
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
    /** Tema elegido en el escritorio («grafito», «mundo-bosque»…): Órbita se pinta igual. Null en ordenadores antiguos. */
    val theme: String? = null,
    /** Nombre que le puso el usuario al ordenador (abajo en la barra lateral). Null: el de la red. */
    val serverName: String? = null,
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

@Serializable
data class ServerNameRequest(val name: String)

@Serializable
data class ServerNameResponse(val serverName: String? = null)

@Serializable
data class ThemeRequest(val theme: String)

@Serializable
data class ThemeResponse(val theme: String? = null)

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

/**
 * Cuándo se lanza una rutina: daily (cada día a [time]), weekly ([days], 0 = domingo, a [time]), interval (cada
 * [hours] horas), once (una sola vez el día [date] a [time]), webhook o folder (al cambiar archivos de [path]).
 * Las horas son las del reloj del ordenador.
 */
@Serializable
data class RoutineTrigger(
    val type: String = "daily",
    val time: String? = null,
    val days: List<Int>? = null,
    val hours: Int? = null,
    val date: String? = null,
    val path: String? = null,
)

/** Una ejecución de la rutina: running, waiting (plan por aprobar), ok, failed, skipped o interrupted. */
@Serializable
data class RoutineRun(
    val at: Long = 0,
    val status: String = "ok",
    val reason: String = "schedule",
    val note: String? = null,
)

/** Una rutina del proyecto: una petición que se envía sola al chat. Nunca trae el secreto de su webhook. */
@Serializable
data class Routine(
    val id: String,
    val name: String = "",
    val request: String = "",
    val enabled: Boolean = true,
    val trigger: RoutineTrigger = RoutineTrigger(),
    val nextAt: Long? = null,
    val askApproval: Boolean = false,
    val runs: List<RoutineRun> = emptyList(),
)

@Serializable
data class RoutinesResponse(val routines: List<Routine> = emptyList())

@Serializable
data class RoutineResponse(val routine: Routine? = null)

/** Lo que se envía al crear o cambiar una rutina (el ordenador la valida igual que en el escritorio). */
data class RoutineInput(val name: String, val request: String, val trigger: RoutineTrigger, val askApproval: Boolean)

/** Rutina que propone Hermes: pending (por decidir), created (creada, [routineId]) o dismissed (descartada). */
@Serializable
data class RoutineProposal(
    val status: String = "pending",
    val name: String = "",
    val request: String = "",
    val trigger: RoutineTrigger = RoutineTrigger(),
    /** La orden «/rutina …» equivalente: «Cambiar» la pone en el cuadro de texto. */
    val command: String = "",
    val routineId: String? = null,
) {
    val isPending: Boolean get() = status == "pending"
}

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
    /** Lanzado con una plantilla de tareas (su nombre sale en el chat). */
    val template: TemplateRef? = null,
    /** Hecho con «Responder» bajo la respuesta de un agente: la cita sale encima de tu mensaje. */
    val replyTo: ReplyRef? = null,
    /** Rutina que propone Hermes (tarjeta «Crear rutina»). */
    val routineProposal: RoutineProposal? = null,
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
    /** Solo el agente de LM Studio: razonamiento («think») del modelo local encendido. */
    val thinking: Boolean = false,
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
    /** Etapa de la tarea en marcha: work, fix, tests o verify (otro agente la revisa). */
    val phase: String? = null,
    /** Número de la tarea en el proyecto (#1, #2…). */
    val seq: Int? = null,
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
    /** Dinero de los últimos 30 días (servidores con capabilities.usageCost). */
    val cost: UsageCost? = null,
)

/** Lo mismo que la sección «Coste» de ⚙ → «Uso y coste…» del escritorio. Importes ya en la moneda elegida. */
@Serializable
data class UsageCost(
    val currency: String = "USD",
    val days: Int = 30,
    val paid: Double = 0.0,
    val api: Double = 0.0,
    val estimated: Double = 0.0,
    val unpricedCalls: Int = 0,
    val budget: CostBudget? = null,
    val byAgent: List<AgentCost> = emptyList(),
    val subscriptions: List<SubscriptionCost> = emptyList(),
    val pricesChecked: String = "",
)

@Serializable
data class CostBudget(val limit: Double = 0.0, val spent: Double = 0.0, val pct: Double = 0.0)

@Serializable
data class AgentCost(
    val agentId: String,
    val name: String = "",
    /** subscription, api, free, local o null (sin indicar). */
    val mode: String? = null,
    val calls: Int = 0,
    val api: Double = 0.0,
    /** Sale sobre todo de tokens estimados: se enseña con ≈. */
    val estimated: Boolean = false,
)

@Serializable
data class SubscriptionCost(
    val key: String,
    val label: String = "",
    val monthly: Double? = null,
    val api30: Double = 0.0,
    val runs30: Int = 0,
    /** worth: compensa · cheaper-api: por API saldría más barato · null: sin precio al mes. */
    val verdict: String? = null,
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
    /** «Novedades» de la versión del servidor (GET /server/news): salen una vez en cada móvil. */
    val whatsNew: Boolean = false,
    /** Bandeja «Te necesita» (GET /inbox y el evento `inbox.updated`). */
    val inbox: Boolean = false,
    /** Cambios de una tarea y deshacerlos (GET /tasks/{id}/changes, POST /tasks/{id}/undo). */
    val taskChanges: Boolean = false,
    /** «@Agente …» o «/directo Agente …»: el texto va tal cual a ese agente, sin pasar por Hermes. */
    val directMessages: Boolean = false,
    /** Plantillas de tareas: verlas, crearlas, cambiarlas y lanzarlas (templateId al enviar). */
    val templates: Boolean = false,
    /** Interruptor «Razonamiento (think)» del agente de LM Studio (POST /agents/{id}/thinking). */
    val agentThinking: Boolean = false,
    /** Paneles de los mods (GET /mods/panels y /mods/panel). */
    val modPanels: Boolean = false,
    /** El selector de «/video» (tipo, personaje, estilo y voz): GET /video/picker y lo demás de /video. */
    val videoPicker: Boolean = false,
    /** «Responder» bajo la respuesta de un agente: replyTo en POST /chat/messages. */
    val replyTo: Boolean = false,
    /** «/recuerda …» enviado como mensaje va a la memoria; la instantánea trae modCommands. */
    val chatCommands: Boolean = false,
    /** Varios chats por proyecto (GET/POST /chats, /chats/{id}/open|rename|delete). */
    val chats: Boolean = false,
    /** Radios y canciones sin anuncios (GET /music/search). */
    val music: Boolean = false,
    /** Buscador de todos los proyectos (GET /search). */
    val search: Boolean = false,
    /** Historial: GET /chats/all y GET /search con since, author y limit (con el total y el mensaje exacto). */
    val history: Boolean = false,
    /** Cambiar el nombre del ordenador que se ve abajo en la barra lateral (POST /settings/server-name). */
    val serverName: Boolean = false,
    /** Elegir el tema desde el móvil (POST /settings/theme): lo siguen el escritorio, los clientes y el navegador. */
    val theme: Boolean = false,
    /** Menú de un chat al mantenerlo pulsado: fijar, bifurcar, mover y borrar también el abierto (GET /chats/pinned). */
    val chatActions: Boolean = false,
    /** Mantener pulsado un archivo: borrar resultados y adjuntos y adjuntar resultados al mensaje (artifactIds). */
    val fileActions: Boolean = false,
    /** Menú de un proyecto al mantenerlo pulsado: renombrar, fijar y eliminar (POST /projects/{id}/rename|pin|delete). */
    val projectActions: Boolean = false,
    /** Rutinas: verlas y «Ejecutar ahora» (GET /routines, POST /routines/{id}/run). */
    val routines: Boolean = false,
    /** Crear, cambiar, activar y borrar rutinas desde aquí. */
    val routinesEdit: Boolean = false,
    /** Tarjeta «Crear rutina» que propone Hermes en el chat. */
    val routineProposals: Boolean = false,
)

/** Botón de un aviso de la bandeja. Con [url] (p. ej. vnc://… para Compartir pantalla) se abre en el móvil y no va al servidor. */
@Serializable
data class InboxAction(val id: String, val label: String = id, val url: String? = null)

/** El aviso escrito en un idioma de la app (el servidor lo manda en todos: cada móvil lo lee en el suyo). */
@Serializable
data class InboxTexts(val title: String = "", val detail: String? = null, val actions: Map<String, String> = emptyMap())

/**
 * Aviso de la bandeja. kind: plan, stalled, mac-permission, question, verify-failed, conflict, failed, paused, budget
 * o done. [projectId] es el id de la conversación. Abierto mientras no tiene [resolvedAt]. Los «done» no esperan nada
 * de ti: no salen en «Te necesita» sino en Resultados, como recién terminados.
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
    val texts: Map<String, InboxTexts> = emptyMap(),
) {
    val isOpen: Boolean get() = resolvedAt == null

    /** ¿Espera algo de ti (sale en «Te necesita»)? Un «Terminado» no: va a Resultados. */
    val needsYou: Boolean get() = kind != "done"

    /** El aviso en el idioma [lang] si el servidor lo mandó escrito en él; si no, como venga. */
    fun localized(lang: String): InboxItem {
        val tx = texts[lang] ?: return this
        return copy(
            title = tx.title.ifBlank { title },
            detail = tx.detail ?: detail,
            actions = actions.map { a -> tx.actions[a.id]?.let { a.copy(label = it) } ?: a },
        )
    }
}

/** Un panel de un mod encendido (la pestaña «Mods» del escritorio). */
@Serializable
data class ModPanelInfo(val mod: String, val modTitle: String = "", val id: String, val title: String = "", val chat: Boolean = false)

@Serializable
data class ModPanelsResponse(val panels: List<ModPanelInfo> = emptyList())

/** La página de un panel: ya trae su política de seguridad y el puente `KywaiBridge`. */
@Serializable
data class ModPanelPage(val html: String = "", val title: String = "", val chat: Boolean = false)

@Serializable
data class InboxResponse(val items: List<InboxItem> = emptyList())

@Serializable
data class InboxActionResponse(val item: InboxItem? = null, val message: String? = null)

/** Un cambio del código de kywai (commit de GitHub). */
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

/** El selector de «/video» (GET /video/picker): estilos, personajes y voces del servidor, como en el escritorio. */
@Serializable
data class VideoPickerInfo(
    val categories: List<VideoCategory> = emptyList(),
    val styles: List<VideoStyle> = emptyList(),
    val characters: List<VideoCharacter> = emptyList(),
    val voices: List<VideoVoice> = emptyList(),
    /** Motores de voz que faltan en el servidor («voicebox», «gemini», «kokoro»). */
    val missing: List<String> = emptyList(),
    /** La voz que lleva el vídeo sin marca «voz:» (null: la automática). */
    val defaultVoice: String? = null,
)

@Serializable
data class VideoCategory(val id: String, val name: String, val en: String = "")

/** Un estilo de película; [thumb]: tiene muestra (GET /video/styles/{slug}/thumb). */
@Serializable
data class VideoStyle(
    val slug: String,
    val name: String,
    val en: String = "",
    val category: String = "",
    val line: String = "",
    val lineEn: String = "",
    val needs: String? = null,
    val base: String? = null,
    val thumb: Boolean = false,
)

/** Un personaje de los vídeos: los robots de kywai ([builtin]) o uno creado por el usuario. */
@Serializable
data class VideoCharacter(
    val id: String,
    val name: String,
    val description: String = "",
    /** Miniatura como data: URL (JPEG) o vacío. */
    val thumb: String = "",
    val images: Int = 0,
    val builtin: Boolean = false,
)

/** Una voz para el vídeo: [id] es lo que va en la marca «voz:…». */
@Serializable
data class VideoVoice(
    val id: String,
    val engine: String,
    val name: String,
    val line: String = "",
    val lang: String? = null,
    val gender: String? = null,
)

/** La muestra de una voz: el audio en base64. */
@Serializable
data class VideoVoicePreview(val type: String = "audio/mpeg", val data: String)

@Serializable
data class VideoImage(val name: String, val data: String)

/** Un personaje nuevo: nombre y descripción, imágenes (JPEG en base64, ya reducidas) o las dos cosas. */
@Serializable
data class VideoCharacterInput(
    val name: String,
    val description: String = "",
    val images: List<VideoImage> = emptyList(),
    val thumb: String? = null,
)

@Serializable
data class VideoCharacterAdded(val id: String, val characters: List<VideoCharacter> = emptyList())

@Serializable
data class VideoCharacters(val characters: List<VideoCharacter> = emptyList())

/** «Novedades»: los cambios de la última actualización del servidor (GET /server/news). */
@Serializable
data class WhatsNewInfo(
    /** Versión que había antes; vacío si no se sabe (entonces son los últimos cambios). */
    val from: String = "",
    /** Versión del servidor: lo que este móvil apunta como vista. */
    val to: String = "",
    val items: List<String> = emptyList(),
    val more: Int = 0,
    val failed: Boolean = false,
    val url: String? = null,
)

@Serializable
data class WhatsNewResponse(val news: WhatsNewInfo? = null)

/** Estado de un agente tras reiniciarlo (POST /agents/{agentId}/reset). */
@Serializable
data class AgentResetResponse(val agentId: String, val activity: String = "idle", val reason: String? = null)

/** Respuesta de POST /agents/{id}/thinking. */
@Serializable
data class AgentThinkingResponse(val agentId: String, val thinking: Boolean = false)

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

/** fromApp: lo eligió el usuario en kywai; si no, es el de la configuración de Hermes. */
@Serializable
data class HermesCurrent(val provider: String = "", val model: String = "", val fromApp: Boolean = false)

@Serializable
data class HermesChoice(val provider: String, val model: String)

@Serializable
data class HermesProvider(val id: String, val label: String = id, val models: List<String> = emptyList())

@Serializable
data class HermesResetRequest(val reset: Boolean)

/** El título con su número delante («#7 Guía…»), para distinguir dos tareas a la vez del mismo agente. */
fun numberedTitle(seq: Int?, title: String): String = if (seq != null && seq > 0) "#$seq $title" else title

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
    /** Número de la tarea en el proyecto (#7): distingue dos tareas en paralelo del mismo agente. */
    val seq: Int? = null,
    /** Quién la hace de verdad si no es el autor del mensaje (un becario): «Claude · Becario». */
    val by: String? = null,
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
