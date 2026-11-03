package com.aicowork.remote.data

import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.AgentRuntime
import com.aicowork.remote.data.model.Artifact
import com.aicowork.remote.data.model.Attachment
import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.Conversation
import com.aicowork.remote.data.model.CoworkJson
import com.aicowork.remote.data.model.EventEnvelope
import com.aicowork.remote.data.model.MemoryEntry
import com.aicowork.remote.data.model.Quota
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import com.aicowork.remote.data.model.TraceEntry
import com.aicowork.remote.data.model.Usage
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Resultado de aplicar un evento. */
sealed interface ReduceResult {
    data class Applied(val snapshot: Snapshot) : ReduceResult
    /** Duplicado o ya incluido en la instantánea. */
    data object Ignored : ReduceResult
    /** Falta información (hueco en la secuencia o referencia desconocida): hay que pedir la instantánea. */
    data class NeedsResync(val reason: String) : ReduceResult
}

/**
 * Aplica los eventos del WebSocket sobre la última instantánea. Es una función pura: no toca la red,
 * así que se prueba sin servidor. Acepta los nombres de evento del motor de AI Cowork (`run.*`, `quota.update`)
 * y los del contrato móvil (`request.*`, `usage.updated`).
 */
object EventReducer {

    fun parse(text: String): EventEnvelope? =
        runCatching { CoworkJson.decodeFromString(EventEnvelope.serializer(), text) }.getOrNull()

    /**
     * @param lastSequence última secuencia aplicada, o null si todavía no hay referencia (tras una instantánea sin número).
     * @param foreignMessages mensajes que se sabe que son de otras conversaciones: sus `message.delta` se ignoran
     *   en lugar de pedir otra instantánea. El reductor añade aquí los que va viendo.
     */
    fun reduce(
        snapshot: Snapshot,
        lastSequence: Long?,
        event: EventEnvelope,
        foreignMessages: MutableSet<String> = mutableSetOf(),
    ): ReduceResult {
        if (lastSequence != null && event.sequence > 0) {
            if (event.sequence <= lastSequence) return ReduceResult.Ignored
            if (event.sequence > lastSequence + 1) {
                return ReduceResult.NeedsResync("Faltan eventos ${lastSequence + 1}…${event.sequence - 1}")
            }
        }
        val p = event.payload
        // El canal transmite los eventos de todos los proyectos: solo se aplican los de la conversación mostrada
        // (agentes y cuotas son globales y no llevan proyecto).
        val current = snapshot.conversation.id
        val owner = ownerOf(p)
        if (current != null && owner != null && owner != current) {
            if (event.type == "message.upsert") (p["message"] as? JsonObject)?.string("id")?.let { foreignMessages += it }
            return ReduceResult.Ignored
        }
        return when (event.type) {
            "hello", "pong", "ping" -> ReduceResult.Ignored
            "snapshot" -> decode(p["snapshot"] ?: p, Snapshot.serializer())?.let { ReduceResult.Applied(it) }
                ?: resync("instantánea ilegible")

            "message.upsert", "message.created", "message.updated" -> {
                val message = decode(p["message"] ?: p, ChatMessage.serializer()) ?: return resync("mensaje ilegible")
                applied(snapshot.copy(conversation = snapshot.conversation.upsert(message)))
            }

            "message.delta" -> {
                val id = p.string("messageId") ?: return resync("delta sin messageId")
                val text = p.string("text").orEmpty()
                val conversation = snapshot.conversation
                if (id in foreignMessages) return ReduceResult.Ignored
                if (conversation.messages.none { it.id == id }) return resync("delta de un mensaje desconocido")
                applied(snapshot.copy(conversation = conversation.copy(messages = conversation.messages.map {
                    if (it.id == id) it.copy(text = it.text + text, streaming = true) else it
                })))
            }

            "agent.runtime" -> {
                val runtime = decode(p["runtime"] ?: p, AgentRuntime.serializer()) ?: return resync("estado de agente ilegible")
                if (snapshot.agents.none { it.id == runtime.agentId }) return resync("agente desconocido")
                applied(snapshot.copy(agents = snapshot.agents.map { if (it.id == runtime.agentId) it.merge(runtime) else it }))
            }

            "agent.upsert", "agent.spawned", "agent.updated" -> {
                val agent = decode(p["agent"] ?: p, Agent.serializer()) ?: return resync("agente ilegible")
                applied(snapshot.copy(agents = snapshot.agents.upsertBy(agent) { it.id }))
            }

            "agent.removed" -> {
                val id = p.string("agentId") ?: return ReduceResult.Ignored
                applied(snapshot.copy(agents = snapshot.agents.filterNot { it.id == id }))
            }

            "task.upsert", "task.created", "task.updated" -> {
                val incoming = decode(p["task"] ?: p, TaskItem.serializer()) ?: return resync("tarea ilegible")
                val previous = snapshot.tasks.firstOrNull { it.id == incoming.id }
                val task = if (incoming.trace.isEmpty() && previous != null) incoming.copy(trace = previous.trace) else incoming
                applied(snapshot.copy(tasks = snapshot.tasks.upsertBy(task) { it.id }))
            }

            "task.trace" -> {
                val taskId = p.string("taskId") ?: return ReduceResult.Ignored
                val entry = decode(p["entry"] ?: return ReduceResult.Ignored, TraceEntry.serializer()) ?: return ReduceResult.Ignored
                if (snapshot.tasks.none { it.id == taskId }) return ReduceResult.Ignored
                applied(snapshot.copy(tasks = snapshot.tasks.map { task ->
                    if (task.id != taskId) task else task.copy(trace = task.trace.upsertBy(entry) { it.id }.takeLast(MAX_TRACE))
                }))
            }

            "memory.updated" -> {
                val memory = decode(p["memory"] ?: return resync("memoria vacía"), ListSerializer(MemoryEntry.serializer()))
                    ?: return resync("memoria ilegible")
                val instructions = if (p.containsKey("instructions")) p.string("instructions").orEmpty() else snapshot.conversation.instructions
                applied(snapshot.copy(memory = memory, conversation = snapshot.conversation.copy(instructions = instructions)))
            }

            "artifact.created" -> {
                val artifact = decode(p["artifact"] ?: return ReduceResult.Ignored, Artifact.serializer()) ?: return ReduceResult.Ignored
                val conversation = snapshot.conversation
                applied(snapshot.copy(conversation = conversation.copy(artifacts = conversation.artifacts.upsertBy(artifact) { it.id })))
            }

            "attachments.updated" -> {
                val attachments = decode(p["attachments"] ?: return ReduceResult.Ignored, ListSerializer(Attachment.serializer()))
                    ?: return resync("adjuntos ilegibles")
                applied(snapshot.copy(conversation = snapshot.conversation.copy(attachments = attachments)))
            }

            "agent.moved" -> {
                val id = p.string("agentId") ?: return ReduceResult.Ignored
                val to = p.string("to") ?: return ReduceResult.Ignored
                if (snapshot.agents.none { it.id == id }) return ReduceResult.Ignored
                applied(snapshot.copy(agents = snapshot.agents.map { if (it.id == id) it.copy(location = to) else it }))
            }

            // Actividad que el mundo anima (la recoge el repositorio); no cambia el estado guardado.
            "transfer.started", "task.completed" -> ReduceResult.Ignored

            // La bandeja «Te necesita» no forma parte de la instantánea: la guarda el repositorio aparte.
            "inbox.updated" -> ReduceResult.Ignored

            "usage.updated" -> {
                val usage = decode(p["usage"] ?: p, Usage.serializer()) ?: return resync("consumo ilegible")
                applied(snapshot.copy(usage = usage))
            }

            "quota.update" -> {
                val quotas = decode(p["quotas"] ?: return ReduceResult.Ignored, ListSerializer(Quota.serializer()))
                    ?: return ReduceResult.Ignored
                applied(snapshot.copy(usage = snapshot.usage.copy(quotas = quotas)))
            }

            "request.started", "run.started" -> {
                val id = p.string("requestId") ?: p.string("runId") ?: return ReduceResult.Ignored
                val conversation = snapshot.conversation
                if (id in conversation.activeRequestIds) return applied(snapshot)
                applied(snapshot.copy(conversation = conversation.copy(activeRequestIds = conversation.activeRequestIds + id)))
            }

            "request.finished", "run.finished", "request.stopped" -> {
                val id = p.string("requestId") ?: p.string("runId") ?: return ReduceResult.Ignored
                val conversation = snapshot.conversation
                applied(snapshot.copy(conversation = conversation.copy(activeRequestIds = conversation.activeRequestIds - id)))
            }

            "conversation.created", "conversation.reset" -> {
                val conversation = p["conversation"]?.let { decode(it, Conversation.serializer()) }
                    ?: return resync("conversación nueva sin datos")
                applied(snapshot.copy(conversation = conversation))
            }

            // Se vació el chat de esta conversación desde el ordenador: hay que volver a leerla.
            "chat.cleared" -> resync("chat vaciado")

            // La conversación abierta puede eliminarse desde el escritorio; el servidor elige la siguiente.
            "project.deleted" -> resync("conversación eliminada")

            "config.updated" -> resync("configuración del equipo actualizada")

            // Tipos nuevos que esta versión no conoce: se ignoran para seguir funcionando.
            else -> ReduceResult.Ignored
        }
    }

    private const val MAX_TRACE = 300

    private fun applied(snapshot: Snapshot) = ReduceResult.Applied(snapshot)
    private fun resync(reason: String) = ReduceResult.NeedsResync(reason)

    private fun <T> decode(element: JsonElement, strategy: DeserializationStrategy<T>): T? =
        runCatching { CoworkJson.decodeFromJsonElement(strategy, element) }.getOrNull()

    private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

    /** Proyecto/conversación al que pertenece el evento, si lo indica (nunca la conversación nueva que anuncia). */
    private fun ownerOf(p: JsonObject): String? {
        p.string("projectId")?.let { return it }
        p.string("conversationId")?.let { return it }
        (p["message"] as? JsonObject)?.let { m -> return m.string("conversationId") ?: m.string("projectId") }
        (p["task"] as? JsonObject)?.let { t -> return t.string("projectId") }
        (p["artifact"] as? JsonObject)?.let { a -> return a.string("projectId") }
        return null
    }
}

fun Conversation.upsert(message: ChatMessage): Conversation {
    val index = messages.indexOfFirst { it.id == message.id }
    val list = if (index >= 0) messages.toMutableList().also { it[index] = message } else messages + message
    return copy(messages = list)
}

fun Agent.merge(runtime: AgentRuntime) = copy(
    location = runtime.location ?: location,
    waitingFor = runtime.waitingFor,
    activity = runtime.activity ?: activity,
    taskId = runtime.taskId,
    lastActivity = runtime.lastActivity ?: lastActivity,
    lastActivityAt = runtime.lastActivityAt ?: lastActivityAt,
    reason = runtime.reason,
    context = runtime.context,
)

inline fun <T> List<T>.upsertBy(item: T, key: (T) -> Any): List<T> {
    val k = key(item)
    val index = indexOfFirst { key(it) == k }
    return if (index >= 0) toMutableList().also { it[index] = item } else this + item
}
