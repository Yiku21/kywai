package com.aicowork.remote.data

import com.aicowork.remote.i18n.t

import com.aicowork.remote.data.model.AppRelease
import com.aicowork.remote.data.model.Artifact
import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.CoworkJson
import com.aicowork.remote.data.model.FilesResponse
import com.aicowork.remote.data.model.HermesChoice
import com.aicowork.remote.data.model.HermesModelsInfo
import com.aicowork.remote.data.model.InboxItem
import com.aicowork.remote.data.model.ServerUpdate
import com.aicowork.remote.data.model.MemoryUpdateRequest
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import com.aicowork.remote.data.model.TraceEntry
import com.aicowork.remote.data.model.TransferInfo
import com.aicowork.remote.data.model.parseTimestamp
import com.aicowork.remote.data.net.ApiException
import com.aicowork.remote.data.net.CoworkApiClient
import com.aicowork.remote.data.net.ProbeResult
import com.aicowork.remote.data.net.RawContent
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import com.aicowork.remote.data.store.Session
import com.aicowork.remote.data.store.SessionStore
import com.aicowork.remote.data.store.SnapshotCache
import com.aicowork.remote.data.store.TokenStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.UUID
import kotlin.random.Random

/** Estado de la conexión en tiempo real. */
sealed interface Connection {
    /** Sin conectar (app en segundo plano o sin sesión). */
    data object Idle : Connection
    data object Connecting : Connection
    data object Online : Connection
    /** Sin conexión: se reintenta sola en [retryAt] (o al recuperar la red). */
    data class Offline(val reason: String, val retryAt: Long?) : Connection
}

enum class OutgoingStatus { Sending, Queued, Failed }

/** Mensaje escrito en el móvil que el servidor aún no ha confirmado. */
data class OutgoingMessage(
    val clientMessageId: String,
    val text: String,
    val createdAt: Long,
    val status: OutgoingStatus,
    val error: String? = null,
    /** Adjuntos del proyecto que van con este mensaje. */
    val attachmentIds: List<String> = emptyList(),
)

/** Archivo que se está subiendo al proyecto desde el móvil. */
data class Upload(
    val id: String,
    val name: String,
    /** 0..1 mientras se envía. */
    val progress: Float = 0f,
    val done: Boolean = false,
    val error: String? = null,
    /** Adjunto que creó en el proyecto (al terminar). */
    val attachmentId: String? = null,
)

data class CoworkUiState(
    val session: Session? = null,
    val snapshot: Snapshot? = null,
    val connection: Connection = Connection.Idle,
    val outgoing: List<OutgoingMessage> = emptyList(),
    /** Cuándo se recibieron los datos por última vez del servidor. */
    val syncedAt: Long? = null,
    /** Los datos vienen de la copia guardada (aún sin sincronizar en esta sesión). */
    val fromCache: Boolean = false,
    /** Servidor anterior (para volver a emparejar sin escribirlo de nuevo). */
    val previousSession: Session? = null,
    /** Aviso para la pantalla de conexión (sesión caducada, revocada…). */
    val notice: String? = null,
    /** Mensajes escritos en este móvil que el ordenador ya recibió (para marcarlos como entregados). */
    val delivered: Set<String> = emptySet(),
    val uploads: List<Upload> = emptyList(),
    /** Bandeja «Te necesita»: los avisos abiertos, del más reciente al más antiguo (vacía si el servidor no la tiene). */
    val inbox: List<InboxItem> = emptyList(),
)

data class ActionResult(val ok: Boolean, val message: String)

/**
 * Actividad real recibida en directo por el WebSocket (nunca de una instantánea ni de una resincronización):
 * la animan el mundo, los avisos, la vibración y los sonidos.
 */
sealed interface LiveEvent {
    data class Transfer(val info: TransferInfo) : LiveEvent
    data class TaskStarted(val task: TaskItem) : LiveEvent
    data class TaskCompleted(val taskId: String, val agentId: String, val title: String?) : LiveEvent
    data class TaskFailed(val task: TaskItem) : LiveEvent
    data class ArtifactCreated(val artifact: Artifact) : LiveEvent
    /** Mensaje nuevo de un agente o del sistema en la conversación abierta. */
    data class AgentMessage(val message: ChatMessage) : LiveEvent
    /** Lo nuevo que escribe un agente (las frases de su tarea, su texto): suena con su voz y se escribe a su ritmo. */
    data class AgentSpoke(val agentId: String, val messageId: String, val said: List<Said>, val error: Boolean) : LiveEvent
    data class RequestFinished(val requestId: String, val ok: Boolean) : LiveEvent
}

private val unsupported = ActionResult(false, t("El ordenador todavía no admite esto: actualiza AI Cowork en el ordenador."))

/** Lo que la interfaz puede pedir. La implementación real es [CoworkRepository]; las pruebas usan un doble. */
interface CoworkController {
    val state: StateFlow<CoworkUiState>
    val liveEvents: Flow<LiveEvent> get() = emptyFlow()
    suspend fun probe(url: HttpUrl, pinnedSha256: String?): ProbeResult
    /** Empareja y guarda el token cifrado. Lanza [ApiException] si falla. */
    suspend fun pair(url: HttpUrl, code: String, deviceName: String, pinnedSha256: String?, demo: Boolean = false)
    fun connect()
    fun disconnect()
    fun retryNow()
    fun refresh()
    fun sendMessage(text: String)
    /** Envía un mensaje con adjuntos del proyecto (subidos antes) para que el equipo los tenga como contexto. */
    fun sendMessage(text: String, attachmentIds: List<String>) = sendMessage(text)
    fun retryMessage(clientMessageId: String)
    fun discardMessage(clientMessageId: String)
    suspend fun newConversation(): ActionResult
    suspend fun stopRequest(requestId: String): ActionResult
    suspend fun resumeRequest(requestId: String): ActionResult
    /** Quita lo que quedó en pausa de la petición (lo contrario de reanudarla). */
    suspend fun discardRequest(requestId: String): ActionResult = unsupported
    fun forget()

    /** Cambia el proyecto que se ve (y se recuerda). */
    suspend fun selectConversation(id: String): ActionResult = unsupported
    suspend fun createProject(name: String): ActionResult = unsupported
    suspend fun loadTrace(taskId: String): Result<List<TraceEntry>> = Result.failure(IllegalStateException(unsupported.message))
    suspend fun addMemory(kind: String, text: String): ActionResult = unsupported
    suspend fun setMemoryStatus(id: String, status: String): ActionResult = unsupported
    suspend fun editMemory(id: String, text: String): ActionResult = unsupported
    suspend fun deleteMemory(id: String): ActionResult = unsupported
    suspend fun setInstructions(text: String): ActionResult = unsupported
    suspend fun listFiles(query: String?): Result<FilesResponse> = Result.failure(IllegalStateException(unsupported.message))
    suspend fun fetchArtifact(artifactId: String): Result<RawContent> = Result.failure(IllegalStateException(unsupported.message))
    suspend fun fetchFile(source: String, path: String): Result<RawContent> = Result.failure(IllegalStateException(unsupported.message))
    /** Empieza a subir un archivo; el progreso aparece en [CoworkUiState.uploads]. */
    fun upload(name: String, size: Long, mime: String?, open: () -> java.io.InputStream) {}
    fun dismissUpload(id: String) {}
    suspend fun setAgentAccess(access: String): ActionResult = unsupported
    suspend fun refreshUsage(): ActionResult = unsupported
    /** Visto bueno ([approve]) o descarte del plan que propone Hermes en el mensaje [messageId]. */
    suspend fun decidePlan(messageId: String, approve: Boolean): ActionResult = unsupported
    suspend fun setPlanApproval(enabled: Boolean): ActionResult = unsupported
    /** Nota de voz → texto (con el dictado del ordenador). */
    suspend fun transcribe(file: java.io.File): Result<String> = Result.failure(IllegalStateException(unsupported.message))
    /** Última versión de Órbita que ofrece el ordenador. */
    suspend fun appRelease(): Result<AppRelease> = Result.failure(IllegalStateException(unsupported.message))
    /** Descarga su APK en [target]. */
    suspend fun downloadAppRelease(target: java.io.File, onProgress: (Float) -> Unit): Result<Unit> = Result.failure(IllegalStateException(unsupported.message))
    /** «/model»: el modelo de Hermes y los disponibles. */
    suspend fun hermesModels(): Result<HermesModelsInfo> = Result.failure(IllegalStateException(unsupported.message))
    /** «Reiniciar agente» tras un fallo. */
    suspend fun resetAgent(agentId: String): ActionResult = unsupported
    /** Razonamiento («think») del agente de LM Studio: encendido o apagado. */
    suspend fun setAgentThinking(agentId: String, enabled: Boolean): ActionResult = unsupported
    /** Cambia el modelo de Hermes (null: el de su configuración). */
    suspend fun setHermesModel(choice: HermesChoice?): Result<HermesModelsInfo> = Result.failure(IllegalStateException(unsupported.message))
    /** Ajustes → «Servidor»: si tiene versión nueva en GitHub. */
    suspend fun serverUpdate(): Result<ServerUpdate> = Result.failure(IllegalStateException(unsupported.message))
    /** Pide al servidor que se actualice y se reinicie ([setAside]: apartar antes lo hecho en él que no está en GitHub). */
    suspend fun startServerUpdate(setAside: Boolean): ActionResult = unsupported
    /** Vuelve a pedir la bandeja «Te necesita» (al abrirla). */
    fun refreshInbox() {}
    /** Pulsa el botón [actionId] del aviso [itemId] de la bandeja; el mensaje es el que devuelve el ordenador. */
    suspend fun inboxAction(itemId: String, actionId: String): ActionResult = unsupported
}

typealias ClientFactory = (url: HttpUrl, pinnedSha256: String?, tokenProvider: () -> String?) -> CoworkApiClient

class CoworkRepository(
    private val sessions: SessionStore,
    private val tokens: TokenStore,
    private val cache: SnapshotCache,
    private val scope: CoroutineScope,
    private val clientFactory: ClientFactory = { url, pin, token -> CoworkApiClient(url, pin, token) },
    private val now: () -> Long = System::currentTimeMillis,
    private val backoff: (attempt: Int) -> Long = ::defaultBackoff,
) : CoworkController {

    private val _state = MutableStateFlow(CoworkUiState())
    override val state: StateFlow<CoworkUiState> = _state.asStateFlow()

    private val _live = MutableSharedFlow<LiveEvent>(extraBufferCapacity = 64, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    override val liveEvents: Flow<LiveEvent> = _live.asSharedFlow()

    private var client: CoworkApiClient? = null
    private var loopJob: Job? = null
    private var cacheJob: Job? = null
    private val retrySignal = Channel<Unit>(Channel.CONFLATED)
    private val syncMutex = Mutex()
    private var lastSequence: Long? = null
    private val foreignMessages = mutableSetOf<String>()

    init {
        restore()
    }

    private fun restore() {
        val session = sessions.load() ?: return
        val token = tokens.read()
        // Un móvil emparejado no caduca (la fecha que manda el servidor no se aplica): solo el Mac lo desempareja,
        // al generar un código de acceso nuevo.
        if (token == null || session.demo) {
            sessions.clear()
            tokens.clear()
            cache.clear()
            _state.value = CoworkUiState(
                previousSession = session,
                notice = if (session.demo) t("Empareja con tu ordenador para usar el servidor real de AI Cowork.") else null,
            )
            return
        }
        val url = session.serverUrl.toHttpUrlOrNull() ?: return
        client = clientFactory(url, session.pinnedSha256) { tokens.read() }
        val cached = cache.load()
        _state.value = CoworkUiState(
            session = session,
            snapshot = cached?.snapshot,
            syncedAt = cached?.savedAt,
            fromCache = cached != null,
        )
    }

    // ------------------------------------------------------------------ Emparejamiento

    override suspend fun probe(url: HttpUrl, pinnedSha256: String?): ProbeResult {
        val probeClient = clientFactory(url, pinnedSha256) { null }
        return try { probeClient.probe() } finally { probeClient.shutdown() }
    }

    override suspend fun pair(url: HttpUrl, code: String, deviceName: String, pinnedSha256: String?, demo: Boolean) {
        val pairing = clientFactory(url, pinnedSha256) { null }
        val response = try { pairing.pair(code.trim(), deviceName.trim()) } finally { pairing.shutdown() }
        disconnect()
        client?.shutdown()
        tokens.write(response.accessToken)
        val session = Session(
            serverUrl = url.toString(),
            serverName = response.serverName,
            deviceName = deviceName.trim(),
            pinnedSha256 = pinnedSha256,
            expiresAt = response.expiresAt?.let(::parseTimestamp),
            pairedAt = now(),
            demo = demo,
        )
        sessions.save(session)
        cache.clear()
        lastSequence = null
        client = clientFactory(url, pinnedSha256) { tokens.read() }
        _state.value = CoworkUiState(session = session, connection = Connection.Connecting)
        connect()
    }

    override fun forget() {
        disconnect()
        client?.shutdown()
        client = null
        val previous = _state.value.session
        tokens.clear()
        sessions.clear()
        cache.clear()
        _state.value = CoworkUiState(previousSession = previous)
    }

    private fun expire(message: String) {
        val previous = _state.value.session
        loopJob?.cancel()
        loopJob = null
        client?.shutdown()
        client = null
        tokens.clear()
        sessions.clear()
        cacheJob?.cancel()
        cache.clear()
        _state.value = CoworkUiState(previousSession = previous, notice = message)
    }

    // ------------------------------------------------------------------ Tiempo real

    override fun connect() {
        if (client == null || loopJob?.isActive == true) return
        loopJob = scope.launch { runLoop() }
    }

    override fun disconnect() {
        loopJob?.cancel()
        loopJob = null
        _state.update { if (it.session != null) it.copy(connection = Connection.Idle) else it }
    }

    override fun retryNow() {
        if (loopJob?.isActive == true) retrySignal.trySend(Unit) else connect()
    }

    override fun refresh() {
        val c = client ?: return
        scope.launch {
            try {
                resync(c)
            } catch (e: ApiException) {
                if (e.isUnauthorized) expire(e.message)
            }
        }
        retryNow()
    }

    private suspend fun runLoop() {
        var attempt = 0
        while (currentCoroutineContext().isActive) {
            val c = client ?: return
            _state.update { it.copy(connection = Connection.Connecting) }
            val outcome = runSocket(c)
            if (outcome.unauthorized) {
                expire(outcome.reason ?: t("La sesión ya no es válida. Vuelve a emparejar el dispositivo."))
                return
            }
            attempt = if (outcome.wasOnline) 0 else attempt + 1
            val wait = backoff(attempt)
            _state.update {
                it.copy(
                    connection = Connection.Offline(outcome.reason ?: t("Se perdió la conexión"), now() + wait),
                    outgoing = it.outgoing.map { m -> if (m.status == OutgoingStatus.Sending) m.copy(status = OutgoingStatus.Queued) else m },
                )
            }
            withTimeoutOrNull(wait) { retrySignal.receive() }
        }
    }

    private class Outcome(val wasOnline: Boolean, val reason: String?, val unauthorized: Boolean = false)

    private sealed interface SocketEvent {
        data object Open : SocketEvent
        data class Text(val text: String) : SocketEvent
        data class Failure(val error: Throwable, val status: Int?) : SocketEvent
        data class Closed(val code: Int, val reason: String) : SocketEvent
    }

    private suspend fun runSocket(c: CoworkApiClient): Outcome {
        val events = Channel<SocketEvent>(Channel.UNLIMITED)
        val socket: WebSocket = c.openEvents(object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) { events.trySend(SocketEvent.Open) }
            override fun onMessage(webSocket: WebSocket, text: String) { events.trySend(SocketEvent.Text(text)) }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                events.trySend(SocketEvent.Closed(code, reason))
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { events.trySend(SocketEvent.Closed(code, reason)) }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                events.trySend(SocketEvent.Failure(t, response?.code))
                response?.close()
            }
        })
        var online = false
        try {
            for (event in events) {
                when (event) {
                    SocketEvent.Open -> {
                        try {
                            resync(c)
                        } catch (e: ApiException) {
                            return Outcome(false, e.message, unauthorized = e.isUnauthorized)
                        }
                        online = true
                        _state.update { it.copy(connection = Connection.Online) }
                        flushQueued()
                    }
                    is SocketEvent.Text -> if (online) {
                        try {
                            handleEvent(c, event.text)
                        } catch (e: ApiException) {
                            return Outcome(true, e.message, unauthorized = e.isUnauthorized)
                        }
                    }
                    is SocketEvent.Failure -> {
                        if (event.status == 401) return Outcome(online, t("La sesión ya no es válida. Vuelve a emparejar el dispositivo."), true)
                        return Outcome(online, ApiException.network(event.error).message.takeIf { !online } ?: t("Se perdió la conexión"))
                    }
                    is SocketEvent.Closed -> return Outcome(online,
                        if (event.reason == "TOKEN_EXPIRED") t("La sesión caducó. Vuelve a emparejar el dispositivo.") else t("El servidor cerró la conexión"),
                        unauthorized = event.code == 1008 && event.reason == "TOKEN_EXPIRED")
                }
            }
        } finally {
            socket.cancel()
            events.close()
        }
        return Outcome(online, null)
    }

    private suspend fun resync(c: CoworkApiClient) = syncMutex.withLock {
        val selected = _state.value.session?.conversationId
        val snapshot = c.snapshot(selected)
        // Si el proyecto elegido ya no existe (se borró en el ordenador), el servidor muestra otro: se recuerda ese.
        val shown = snapshot.conversation.id
        if (shown != null && shown != selected && (selected == null || snapshot.projects.none { it.id == selected })) {
            rememberConversation(shown)
        }
        lastSequence = snapshot.sequence
        foreignMessages.clear()
        // La bandeja va aparte de la instantánea; un servidor anterior no la tiene (y entonces no se muestra nada).
        val inbox = if (snapshot.capabilities.inbox) fetchOpenInbox(c) else emptyList()
        _state.update { current ->
            val known = snapshot.conversation.messages.mapNotNull { it.clientMessageId }.toSet()
            current.copy(
                snapshot = snapshot,
                syncedAt = now(),
                fromCache = false,
                outgoing = current.outgoing.filterNot { it.clientMessageId in known },
                inbox = inbox ?: current.inbox,
            )
        }
        scheduleCacheSave()
    }

    /** Los avisos abiertos de la bandeja, o null si no se pudo leer (se conserva lo que había). */
    private suspend fun fetchOpenInbox(c: CoworkApiClient): List<InboxItem>? = try {
        c.inbox().filter { it.isOpen }
    } catch (e: ApiException) {
        if (e.isUnauthorized) throw e
        null
    }

    /** Evento `inbox.updated`: trae la lista completa de los abiertos. */
    private fun applyInboxEvent(payload: JsonObject) {
        val element = payload["items"] ?: return
        val items = runCatching { CoworkJson.decodeFromJsonElement(ListSerializer(InboxItem.serializer()), element) }.getOrNull() ?: return
        _state.update { it.copy(inbox = items.filter { item -> item.isOpen }) }
    }

    private suspend fun handleEvent(c: CoworkApiClient, text: String) {
        val envelope = EventReducer.parse(text) ?: return
        val needsResync = syncMutex.withLock {
            if (envelope.type == "inbox.updated") {
                val last = lastSequence
                // Un duplicado o uno ya incluido en la instantánea no pisa la bandeja más reciente.
                if (envelope.sequence <= 0 || last == null || envelope.sequence > last) applyInboxEvent(envelope.payload)
            }
            val current = _state.value.snapshot ?: return@withLock true
            if (foreignMessages.size > 500) foreignMessages.clear()
            val last = lastSequence
            val fresh = envelope.sequence <= 0 || last == null || envelope.sequence == last + 1
            when (val result = EventReducer.reduce(current, lastSequence, envelope, foreignMessages)) {
                is ReduceResult.Applied -> {
                    if (fresh) LiveEvents.of(envelope, current, result.snapshot).forEach { _live.tryEmit(it) }
                    advance(envelope.sequence)
                    val known = result.snapshot.conversation.messages.mapNotNull { it.clientMessageId }.toSet()
                    _state.update {
                        it.copy(
                            snapshot = result.snapshot,
                            syncedAt = now(),
                            outgoing = it.outgoing.filterNot { m -> m.clientMessageId in known },
                        )
                    }
                    false
                }
                ReduceResult.Ignored -> {
                    if (fresh) LiveEvents.of(envelope, current, current).forEach { _live.tryEmit(it) }
                    advance(envelope.sequence)
                    false
                }
                is ReduceResult.NeedsResync -> true
            }
        }
        if (needsResync) resync(c) else scheduleCacheSave()
    }

    private fun advance(sequence: Long) {
        if (sequence > 0 && sequence > (lastSequence ?: 0)) lastSequence = sequence
    }

    private fun scheduleCacheSave() {
        if (cacheJob?.isActive == true) return
        cacheJob = scope.launch {
            delay(CACHE_DEBOUNCE_MS)
            _state.value.snapshot?.let { cache.save(it, _state.value.syncedAt ?: now()) }
        }
    }

    // ------------------------------------------------------------------ Chat

    override fun sendMessage(text: String) = sendMessage(text, emptyList())

    override fun sendMessage(text: String, attachmentIds: List<String>) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() && attachmentIds.isEmpty()) return
        val online = _state.value.connection == Connection.Online
        val message = OutgoingMessage(
            clientMessageId = UUID.randomUUID().toString(),
            text = trimmed,
            createdAt = now(),
            status = if (online) OutgoingStatus.Sending else OutgoingStatus.Queued,
            attachmentIds = attachmentIds,
        )
        _state.update { it.copy(outgoing = it.outgoing + message) }
        if (online) scope.launch { deliver(message.clientMessageId) } else retryNow()
    }

    override fun retryMessage(clientMessageId: String) {
        setOutgoing(clientMessageId) { it.copy(status = OutgoingStatus.Sending, error = null) }
        if (_state.value.connection == Connection.Online) {
            scope.launch { deliver(clientMessageId) }
        } else {
            setOutgoing(clientMessageId) { it.copy(status = OutgoingStatus.Queued) }
            retryNow()
        }
    }

    override fun discardMessage(clientMessageId: String) {
        _state.update { s -> s.copy(outgoing = s.outgoing.filterNot { it.clientMessageId == clientMessageId }) }
    }

    private fun flushQueued() {
        _state.value.outgoing.filter { it.status == OutgoingStatus.Queued }.forEach { message ->
            setOutgoing(message.clientMessageId) { it.copy(status = OutgoingStatus.Sending) }
            scope.launch { deliver(message.clientMessageId) }
        }
    }

    private suspend fun deliver(clientMessageId: String) {
        val c = client ?: return
        val message = _state.value.outgoing.firstOrNull { it.clientMessageId == clientMessageId } ?: return
        try {
            val response = c.sendMessage(_state.value.snapshot?.conversation?.id, message.text, clientMessageId, message.attachmentIds)
            syncMutex.withLock {
                _state.update { s ->
                    val snapshot = s.snapshot
                    val updated = if (snapshot != null && response.message != null) {
                        val conversation = snapshot.conversation.upsert(response.message)
                        val active = response.requestId?.let { id ->
                            if (id in conversation.activeRequestIds) conversation.activeRequestIds else conversation.activeRequestIds + id
                        } ?: conversation.activeRequestIds
                        snapshot.copy(conversation = conversation.copy(activeRequestIds = active))
                    } else snapshot
                    s.copy(
                        snapshot = updated,
                        outgoing = s.outgoing.filterNot { it.clientMessageId == clientMessageId },
                        delivered = s.delivered + clientMessageId,
                    )
                }
            }
            if (response.message == null) refresh()
        } catch (e: ApiException) {
            when {
                e.isUnauthorized -> expire(e.message)
                e.retryable || e.isNetwork -> {
                    setOutgoing(clientMessageId) { it.copy(status = OutgoingStatus.Queued, error = e.message) }
                    retryNow()
                }
                else -> setOutgoing(clientMessageId) { it.copy(status = OutgoingStatus.Failed, error = e.message) }
            }
        }
    }

    private fun setOutgoing(id: String, transform: (OutgoingMessage) -> OutgoingMessage) {
        _state.update { s -> s.copy(outgoing = s.outgoing.map { if (it.clientMessageId == id) transform(it) else it }) }
    }

    // ------------------------------------------------------------------ Acciones

    override suspend fun newConversation(): ActionResult = action(t("Conversación nueva")) { c ->
        c.newConversation()
        // La conversación, las tareas y la memoria forman una única instantánea del servidor.
        resync(c)
    }

    override suspend fun stopRequest(requestId: String): ActionResult = action(t("Petición detenida")) { c ->
        c.stopRequest(requestId)
        if (_state.value.connection != Connection.Online) resync(c)
    }

    override suspend fun resumeRequest(requestId: String): ActionResult = action(t("Petición reanudada")) { c ->
        c.resumeRequest(requestId)
        if (_state.value.connection != Connection.Online) resync(c)
    }

    override suspend fun discardRequest(requestId: String): ActionResult = action(t("Tarea en pausa quitada")) { c ->
        c.discardRequest(requestId)
        if (_state.value.connection != Connection.Online) resync(c)
    }

    private suspend fun action(success: String, block: suspend (CoworkApiClient) -> Unit): ActionResult {
        val c = client ?: return ActionResult(false, t("No hay ningún ordenador emparejado"))
        return try {
            block(c)
            ActionResult(true, success)
        } catch (e: ApiException) {
            if (e.isUnauthorized) expire(e.message)
            ActionResult(false, e.message)
        }
    }

    private suspend fun <T> fetch(block: suspend (CoworkApiClient) -> T): Result<T> {
        val c = client ?: return Result.failure(ApiException(0, "not_paired", t("No hay ningún ordenador emparejado"), false))
        return try {
            Result.success(block(c))
        } catch (e: ApiException) {
            if (e.isUnauthorized) expire(e.message)
            Result.failure(e)
        }
    }

    private fun currentConversation(): String? = _state.value.snapshot?.conversation?.id ?: _state.value.session?.conversationId

    private fun needConversation(): String = currentConversation()
        ?: throw ApiException(409, "NO_CONVERSATION", t("Todavía no hay ningún proyecto abierto."), false)

    private fun rememberConversation(id: String) {
        val session = _state.value.session ?: return
        if (session.conversationId == id) return
        val updated = session.copy(conversationId = id)
        sessions.save(updated)
        _state.update { it.copy(session = updated) }
    }

    override suspend fun selectConversation(id: String): ActionResult = action(t("Proyecto abierto")) { c ->
        rememberConversation(id)
        cache.clear()
        resync(c)
    }

    override suspend fun createProject(name: String): ActionResult = action(t("Proyecto creado")) { c ->
        val conversation = c.newConversation(name.trim())
        conversation?.id?.let { rememberConversation(it) }
        resync(c)
    }

    override suspend fun loadTrace(taskId: String): Result<List<TraceEntry>> = fetch { it.trace(taskId) }

    override suspend fun addMemory(kind: String, text: String): ActionResult = action(t("Recuerdo añadido")) { c ->
        c.addMemory(needConversation(), kind, text.trim())
        if (_state.value.connection != Connection.Online) resync(c)
    }

    override suspend fun setMemoryStatus(id: String, status: String): ActionResult =
        action(if (status == "confirmed") t("Confirmado") else if (status == "superseded") t("Descartado") else t("Actualizado")) { c ->
            c.updateMemory(MemoryUpdateRequest(needConversation(), status = status), id)
            if (_state.value.connection != Connection.Online) resync(c)
        }

    override suspend fun editMemory(id: String, text: String): ActionResult = action(t("Recuerdo actualizado")) { c ->
        c.updateMemory(MemoryUpdateRequest(needConversation(), text = text.trim()), id)
        if (_state.value.connection != Connection.Online) resync(c)
    }

    override suspend fun deleteMemory(id: String): ActionResult = action(t("Recuerdo borrado")) { c ->
        c.deleteMemory(needConversation(), id)
        if (_state.value.connection != Connection.Online) resync(c)
    }

    override suspend fun setInstructions(text: String): ActionResult = action(t("Instrucciones guardadas")) { c ->
        val saved = c.setInstructions(needConversation(), text.trim())
        _state.update { s -> s.copy(snapshot = s.snapshot?.let { it.copy(conversation = it.conversation.copy(instructions = saved ?: text.trim())) }) }
    }

    override suspend fun listFiles(query: String?): Result<FilesResponse> = fetch { it.files(needConversation(), query) }

    override suspend fun fetchArtifact(artifactId: String): Result<RawContent> = fetch { it.artifactRaw(needConversation(), artifactId) }

    override suspend fun fetchFile(source: String, path: String): Result<RawContent> = fetch { it.fileRaw(needConversation(), source, path) }

    override fun upload(name: String, size: Long, mime: String?, open: () -> java.io.InputStream) {
        val id = UUID.randomUUID().toString()
        _state.update { it.copy(uploads = it.uploads + Upload(id, name)) }
        fun set(transform: (Upload) -> Upload) = _state.update { s -> s.copy(uploads = s.uploads.map { if (it.id == id) transform(it) else it }) }
        scope.launch {
            val c = client
            if (c == null) {
                set { it.copy(error = t("No hay ningún ordenador emparejado")) }
                return@launch
            }
            try {
                val conversation = needConversation()
                var shown = 0f
                val attachment = c.upload(conversation, name, size, mime, open) { p ->
                    // Avisa cada 2 % (no en cada bloque) para no saturar la interfaz.
                    if (p - shown >= 0.02f || p >= 1f) {
                        shown = p
                        set { it.copy(progress = p) }
                    }
                }
                set { it.copy(progress = 1f, done = true, attachmentId = attachment?.id) }
                if (attachment != null) {
                    _state.update { s ->
                        val snapshot = s.snapshot ?: return@update s
                        val list = snapshot.conversation.attachments
                        s.copy(snapshot = snapshot.copy(conversation = snapshot.conversation.copy(attachments = list.upsertBy(attachment) { it.id })))
                    }
                }
            } catch (e: ApiException) {
                if (e.isUnauthorized) expire(e.message)
                set { it.copy(error = e.message) }
            } catch (e: java.io.IOException) {
                set { it.copy(error = t("No se pudo leer el archivo: {v1}", "v1" to (e.message ?: "error"))) }
            }
        }
    }

    override fun dismissUpload(id: String) {
        _state.update { s -> s.copy(uploads = s.uploads.filterNot { it.id == id }) }
    }

    override suspend fun setAgentAccess(access: String): ActionResult = action(
        if (access == "project") t("Los agentes solo trabajan en la carpeta del proyecto") else t("Los agentes tienen acceso completo"),
    ) { c ->
        val saved = c.setAgentAccess(access)
        _state.update { s -> s.copy(snapshot = s.snapshot?.let { it.copy(settings = it.settings.copy(agentAccess = saved)) }) }
    }

    override suspend fun decidePlan(messageId: String, approve: Boolean): ActionResult = action(
        if (approve) t("Plan aprobado: el equipo empieza") else t("Plan descartado"),
    ) { c ->
        c.decidePlan(needConversation(), messageId, approve)
        // Se ve al momento; el mensaje definitivo (con sus tareas) llega por el WebSocket.
        val status = if (approve) "approved" else "rejected"
        _state.update { s ->
            s.copy(snapshot = s.snapshot?.let { snap ->
                snap.copy(conversation = snap.conversation.copy(messages = snap.conversation.messages.map { m ->
                    if (m.id == messageId && m.proposal?.isPending == true) m.copy(proposal = m.proposal.copy(status = status)) else m
                }))
            })
        }
        if (_state.value.connection != Connection.Online) resync(c)
    }

    override suspend fun setPlanApproval(enabled: Boolean): ActionResult = action(
        if (enabled) t("Hermes te pedirá el visto bueno antes de empezar") else t("Los planes empiezan sin esperar tu visto bueno"),
    ) { c ->
        val saved = c.setPlanApproval(enabled)
        _state.update { s -> s.copy(snapshot = s.snapshot?.let { it.copy(settings = it.settings.copy(planApproval = saved)) }) }
    }

    override suspend fun refreshUsage(): ActionResult = action(t("Cuotas actualizadas")) { c ->
        val quotas = c.refreshUsage()
        _state.update { s -> s.copy(snapshot = s.snapshot?.let { it.copy(usage = it.usage.copy(quotas = quotas)) }) }
    }

    override suspend fun transcribe(file: java.io.File): Result<String> = fetch { it.transcribe(file) }

    override suspend fun appRelease(): Result<AppRelease> = fetch { it.appRelease() }

    override suspend fun downloadAppRelease(target: java.io.File, onProgress: (Float) -> Unit): Result<Unit> = fetch { it.downloadApk(target, onProgress) }

    override suspend fun hermesModels(): Result<HermesModelsInfo> = fetch { it.hermesModels() }

    override suspend fun resetAgent(agentId: String): ActionResult {
        val c = client ?: return ActionResult(false, t("No hay ningún ordenador emparejado"))
        return try {
            val r = c.resetAgent(agentId)
            val name = _state.value.snapshot?.agents?.firstOrNull { it.id == agentId }?.name ?: agentId
            if (r.activity == "offline") ActionResult(false, t("{name} sigue sin responder{v2}", "name" to name, "v2" to (r.reason?.let { ": $it" } ?: "")))
            else ActionResult(true, t("{name} reiniciado: vuelve a estar disponible", "name" to name))
        } catch (e: ApiException) {
            if (e.isUnauthorized) expire(e.message)
            ActionResult(false, e.message)
        }
    }

    override suspend fun setAgentThinking(agentId: String, enabled: Boolean): ActionResult =
        action(if (enabled) t("Razonamiento encendido: piensa antes de responder") else t("Razonamiento apagado: responde directamente")) { it.setAgentThinking(agentId, enabled) }

    override suspend fun setHermesModel(choice: HermesChoice?): Result<HermesModelsInfo> = fetch { it.setHermesModel(choice) }

    override suspend fun serverUpdate(): Result<ServerUpdate> = fetch { it.serverUpdate() }

    override suspend fun startServerUpdate(setAside: Boolean): ActionResult =
        action(t("El servidor se está actualizando: se reiniciará al terminar")) { it.startServerUpdate(setAside) }

    override fun refreshInbox() {
        val c = client ?: return
        if (_state.value.snapshot?.capabilities?.inbox != true) return
        scope.launch {
            try {
                val items = c.inbox().filter { it.isOpen }
                _state.update { it.copy(inbox = items) }
            } catch (e: ApiException) {
                if (e.isUnauthorized) expire(e.message)
            }
        }
    }

    override suspend fun inboxAction(itemId: String, actionId: String): ActionResult {
        val c = client ?: return ActionResult(false, t("No hay ningún ordenador emparejado"))
        return try {
            val response = c.inboxAction(itemId, actionId)
            val item = response.item
            // Se ve al momento; la lista definitiva llega también con `inbox.updated`.
            _state.update { s ->
                s.copy(inbox = if (item == null || !item.isOpen) s.inbox.filterNot { it.id == itemId } else s.inbox.map { if (it.id == itemId) item else it })
            }
            ActionResult(true, response.message?.takeIf { it.isNotBlank() } ?: t("Hecho"))
        } catch (e: ApiException) {
            if (e.isUnauthorized) expire(e.message)
            // El aviso (o ese botón) ya no existe: se quita de la lista y se vuelve a leer.
            if (e.status == 404) {
                _state.update { s -> s.copy(inbox = s.inbox.filterNot { it.id == itemId }) }
                refreshInbox()
            }
            ActionResult(false, e.message)
        }
    }

    companion object {
        const val CACHE_DEBOUNCE_MS = 1_500L

        /** 1 s, 2 s, 4 s… hasta 30 s, con un poco de azar para que varios móviles no reconecten a la vez. */
        fun defaultBackoff(attempt: Int): Long {
            val base = (1_000L shl (attempt - 1).coerceIn(0, 5)).coerceAtMost(30_000L)
            return base + Random.nextLong(0, base / 4 + 1)
        }
    }
}

/** Actividad en directo de cada evento del WebSocket (función pura: se prueba sin red). */
object LiveEvents {
    /** Qué actividad en directo representa un evento ya aplicado ([before] → [after]). */
    fun of(envelope: com.aicowork.remote.data.model.EventEnvelope, before: Snapshot, after: Snapshot): List<LiveEvent> {
        val p = envelope.payload
        fun JsonObject.str(key: String) = (this[key] as? JsonPrimitive)?.contentOrNull
        return when (envelope.type) {
            "transfer.started" -> listOfNotNull(
                (p["transfer"] as? JsonObject)?.let { runCatching { CoworkJson.decodeFromJsonElement(TransferInfo.serializer(), it) }.getOrNull() }
                    ?.let { LiveEvent.Transfer(it) },
            )
            "task.completed" -> {
                val taskId = p.str("taskId") ?: return emptyList()
                val agentId = p.str("agentId") ?: after.tasks.firstOrNull { it.id == taskId }?.agentId ?: return emptyList()
                listOf(LiveEvent.TaskCompleted(taskId, agentId, after.tasks.firstOrNull { it.id == taskId }?.title))
            }
            "task.upsert", "task.created", "task.updated" -> {
                val id = (p["task"] as? JsonObject)?.str("id") ?: return emptyList()
                val now = after.tasks.firstOrNull { it.id == id } ?: return emptyList()
                val was = before.tasks.firstOrNull { it.id == id }?.status
                when {
                    now.status == was -> emptyList()
                    now.status == "failed" -> listOf(LiveEvent.TaskFailed(now))
                    now.status == "running" -> listOf(LiveEvent.TaskStarted(now))
                    else -> emptyList()
                }
            }
            "artifact.created" -> {
                val id = (p["artifact"] as? JsonObject)?.str("id") ?: return emptyList()
                if (before.conversation.artifacts.any { it.id == id }) return emptyList()
                listOfNotNull(after.conversation.artifacts.firstOrNull { it.id == id }?.let { LiveEvent.ArtifactCreated(it) })
            }
            "message.upsert", "message.created", "message.updated", "message.delta" -> {
                val id = (p["message"] as? JsonObject)?.str("id") ?: p.str("messageId") ?: return emptyList()
                val message = after.conversation.messages.firstOrNull { it.id == id } ?: return emptyList()
                val previous = before.conversation.messages.firstOrNull { it.id == id }
                val events = mutableListOf<LiveEvent>()
                // Avisa uno nuevo, o uno que pasa a ser un error (el mensaje de una tarea que no se pudo hacer).
                val announce = envelope.type == "message.upsert" || envelope.type == "message.created"
                if (announce && !message.author.isUser && (previous == null || (previous.tone != "error" && message.tone == "error"))) events += LiveEvent.AgentMessage(message)
                val agentId = message.author.agentId
                if (message.author.isAgent && agentId != null) {
                    val said = Speech.newlySaid(previous, message, System.currentTimeMillis())
                    if (said.isNotEmpty()) events += LiveEvent.AgentSpoke(agentId, message.id, said, message.tone == "error")
                }
                events
            }
            "run.finished", "request.finished" -> {
                val id = p.str("runId") ?: p.str("requestId") ?: return emptyList()
                val ok = (p["ok"] as? JsonPrimitive)?.booleanOrNull ?: true
                if (id !in before.conversation.activeRequestIds) emptyList() else listOf(LiveEvent.RequestFinished(id, ok))
            }
            else -> emptyList()
        }
    }
}
