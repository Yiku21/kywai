package com.aicowork.remote.data.net

import com.aicowork.remote.i18n.t

import com.aicowork.remote.data.model.AgentAccessRequest
import com.aicowork.remote.data.model.AgentAccessResponse
import com.aicowork.remote.data.model.AgentResetResponse
import com.aicowork.remote.data.model.AgentThinkingResponse
import com.aicowork.remote.data.model.ApiErrorBody
import com.aicowork.remote.data.model.AppRelease
import com.aicowork.remote.data.model.Attachment
import com.aicowork.remote.data.model.Conversation
import com.aicowork.remote.data.model.ConversationOnlyRequest
import com.aicowork.remote.data.model.ConversationResponse
import com.aicowork.remote.data.model.CoworkJson
import com.aicowork.remote.data.model.FilesResponse
import com.aicowork.remote.data.model.HermesChoice
import com.aicowork.remote.data.model.HermesModelsInfo
import com.aicowork.remote.data.model.ServerUpdate
import com.aicowork.remote.data.model.ServerUpdateRequest
import com.aicowork.remote.data.model.HermesResetRequest
import com.aicowork.remote.data.model.InboxActionResponse
import com.aicowork.remote.data.model.InboxItem
import com.aicowork.remote.data.model.InboxResponse
import com.aicowork.remote.data.model.InstructionsRequest
import com.aicowork.remote.data.model.InstructionsResponse
import com.aicowork.remote.data.model.MemoryAddRequest
import com.aicowork.remote.data.model.MemoryEntry
import com.aicowork.remote.data.model.MemoryEntryResponse
import com.aicowork.remote.data.model.MemoryUpdateRequest
import com.aicowork.remote.data.model.NewConversationRequest
import com.aicowork.remote.data.model.PairRequest
import com.aicowork.remote.data.model.PairResponse
import com.aicowork.remote.data.model.PlanApprovalRequest
import com.aicowork.remote.data.model.PlanApprovalResponse
import com.aicowork.remote.data.model.ProjectSummary
import com.aicowork.remote.data.model.ProjectsResponse
import com.aicowork.remote.data.model.Quota
import com.aicowork.remote.data.model.QuotasResponse
import com.aicowork.remote.data.model.SendMessageRequest
import com.aicowork.remote.data.model.SendMessageResponse
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TraceEntry
import com.aicowork.remote.data.model.TraceResponse
import com.aicowork.remote.data.model.TranscriptResponse
import com.aicowork.remote.data.model.UploadResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Error del servidor (cuerpo `{"code","message","retryable"}`) o de la red (status 0). */
class ApiException(
    val status: Int,
    val code: String,
    override val message: String,
    val retryable: Boolean,
    cause: Throwable? = null,
) : IOException(message, cause) {
    val isUnauthorized get() = status == 401
    val isNetwork get() = status == 0

    companion object {
        fun network(cause: Throwable) = ApiException(
            status = 0,
            code = "network",
            message = t("No se puede conectar con el ordenador. Comprueba que kywai está abierto y que Tailscale está activo."),
            retryable = true,
            cause = cause,
        )
    }
}

/** Resultado de comprobar un servidor antes de emparejar. */
sealed interface ProbeResult {
    /** Responde y su certificado es de confianza (sistema, huella ya confirmada o HTTP local). */
    data object Reachable : ProbeResult
    /** Responde con un certificado propio: hay que mostrar la huella y pedir confirmación. */
    data class NeedsConfirmation(val certificate: CertificateInfo) : ProbeResult
    data class Failed(val message: String) : ProbeResult
}

/**
 * Cliente HTTP/WebSocket del contrato móvil. Un cliente por servidor: la huella fijada solo vale para él.
 */
class CoworkApiClient(
    val baseUrl: HttpUrl,
    pinnedSha256: String?,
    private val tokenProvider: () -> String?,
    systemTrust: javax.net.ssl.X509TrustManager = PinningTrustManager.systemDefault(),
) {
    private val trustManager = PinningTrustManager(systemTrust, pinnedSha256)

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .apply { if (baseUrl.isHttps) pinnedTls(trustManager, pinnedSha256) }
        .build()

    /** Mismo cliente con más margen para archivos grandes. */
    private val transfers: OkHttpClient = http.newBuilder()
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    /** El dictado: la primera vez el ordenador lo prepara (descarga el modelo) y puede tardar varios minutos. */
    private val dictation: OkHttpClient = http.newBuilder()
        .readTimeout(20, TimeUnit.MINUTES)
        .writeTimeout(2, TimeUnit.MINUTES)
        .build()

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    /** [path] puede llevar consulta («/files?conversationId=…», ya codificada): va aparte de la ruta. */
    private fun url(path: String): HttpUrl {
        val q = path.indexOf('?')
        val builder = baseUrl.newBuilder().encodedPath(API_PREFIX + if (q < 0) path else path.substring(0, q))
        if (q >= 0) builder.encodedQuery(path.substring(q + 1))
        return builder.build()
    }

    suspend fun probe(): ProbeResult = try {
        withContext(Dispatchers.IO) { execute(Request.Builder().url(url("/snapshot")).get().build()).close() }
        ProbeResult.Reachable
    } catch (e: ApiException) {
        when {
            // Sin token el servidor responde 401: basta para saber que está ahí y que el TLS es de confianza.
            e.isUnauthorized || e.status == 403 ->
                if (e.code == "unknown" || e.code.startsWith("http_"))
                    ProbeResult.Failed(t("Ese servidor todavía no ofrece la API móvil. Actualiza o ejecuta la nueva versión de kywai en el ordenador."))
                else ProbeResult.Reachable
            e.status == 404 -> ProbeResult.Failed(t("Ese servidor no ofrece la API móvil de kywai. Revisa la dirección y el puerto, o actualiza kywai."))
            !e.isNetwork -> ProbeResult.Failed(e.message)
            else -> trustManager.rejected?.let { ProbeResult.NeedsConfirmation(it) } ?: ProbeResult.Failed(e.message)
        }
    } catch (e: IOException) {
        val rejected = trustManager.rejected ?: e.findCause<UntrustedCertificateException>()?.certificate
        when {
            rejected != null -> ProbeResult.NeedsConfirmation(rejected)
            e is SSLException -> ProbeResult.Failed(t("La conexión segura falló: {v1}", "v1" to (e.message ?: "error TLS")))
            else -> ProbeResult.Failed(ApiException.network(e).message)
        }
    }

    suspend fun pair(code: String, deviceName: String): PairResponse =
        post("/pair", CoworkJson.encodeToString(PairRequest.serializer(), PairRequest(code, deviceName)), PairResponse.serializer(), auth = false)

    /** [conversationId]: proyecto a mostrar (null = el que elija el servidor, el último que se movió). */
    suspend fun snapshot(conversationId: String? = null): Snapshot =
        get(if (conversationId == null) "/snapshot" else "/snapshot?conversationId=${conversationId.encodeQuery()}", Snapshot.serializer())

    /** [attachmentIds]: adjuntos del proyecto (subidos antes) que se entregan al equipo con esta petición. */
    suspend fun sendMessage(conversationId: String?, text: String, clientMessageId: String, attachmentIds: List<String> = emptyList()): SendMessageResponse = post(
        "/chat/messages",
        if (attachmentIds.isEmpty()) CoworkJson.encodeToString(SendMessageRequest.serializer(), SendMessageRequest(conversationId, text, clientMessageId))
        else buildJsonObject {
            put("conversationId", conversationId)
            put("text", text)
            put("clientMessageId", clientMessageId)
            putJsonArray("attachmentIds") { attachmentIds.forEach { add(it) } }
        }.toString(),
        SendMessageResponse.serializer(),
    )

    suspend fun newConversation(name: String? = null): Conversation? = post(
        "/conversations",
        name?.let { CoworkJson.encodeToString(NewConversationRequest.serializer(), NewConversationRequest(it)) } ?: "{}",
        ConversationResponse.serializer(),
    ).conversation

    suspend fun projects(): List<ProjectSummary> = get("/projects", ProjectsResponse.serializer()).projects

    suspend fun trace(taskId: String): List<TraceEntry> = get("/tasks/${taskId.encodeSegment()}/trace", TraceResponse.serializer()).entries

    suspend fun addMemory(conversationId: String, kind: String, text: String): MemoryEntry? = post(
        "/memory",
        CoworkJson.encodeToString(MemoryAddRequest.serializer(), MemoryAddRequest(conversationId, kind, text)),
        MemoryEntryResponse.serializer(),
    ).entry

    suspend fun updateMemory(request: MemoryUpdateRequest, id: String): MemoryEntry? = post(
        "/memory/${id.encodeSegment()}",
        // Solo los campos que cambian (el servidor no admite nulos).
        buildJsonObject {
            put("conversationId", request.conversationId)
            request.text?.let { put("text", it) }
            request.kind?.let { put("kind", it) }
            request.status?.let { put("status", it) }
        }.toString(),
        MemoryEntryResponse.serializer(),
    ).entry

    suspend fun deleteMemory(conversationId: String, id: String) {
        withContext(Dispatchers.IO) {
            postRaw("/memory/${id.encodeSegment()}/delete", CoworkJson.encodeToString(ConversationOnlyRequest.serializer(), ConversationOnlyRequest(conversationId))).close()
        }
    }

    suspend fun setInstructions(conversationId: String, text: String): String? = post(
        "/instructions",
        CoworkJson.encodeToString(InstructionsRequest.serializer(), InstructionsRequest(conversationId, text)),
        InstructionsResponse.serializer(),
    ).instructions

    suspend fun files(conversationId: String, query: String?): FilesResponse {
        val q = query?.trim()?.takeIf { it.isNotEmpty() }?.let { "&q=${it.encodeQuery()}" }.orEmpty()
        return get("/files?conversationId=${conversationId.encodeQuery()}$q", FilesResponse.serializer())
    }

    /** Contenido de un resultado (bytes y tipo). Como mucho [maxBytes]: más grande, se avisa en lugar de cargarlo. */
    suspend fun artifactRaw(conversationId: String, artifactId: String, maxBytes: Long = MAX_DOWNLOAD): RawContent =
        raw("/artifacts/${artifactId.encodeSegment()}/raw?conversationId=${conversationId.encodeQuery()}", maxBytes)

    /** Contenido de un archivo: `source` = "attachment" (adjunto del proyecto) o "folder" (carpeta del proyecto). */
    suspend fun fileRaw(conversationId: String, source: String, path: String, maxBytes: Long = MAX_DOWNLOAD): RawContent =
        raw("/files/raw?conversationId=${conversationId.encodeQuery()}&source=${source.encodeQuery()}&path=${path.encodeQuery()}", maxBytes)

    /** Sube un archivo al proyecto como adjunto. [onProgress] recibe 0..1 mientras se envía. */
    suspend fun upload(
        conversationId: String,
        name: String,
        size: Long,
        contentType: String?,
        open: () -> java.io.InputStream,
        onProgress: (Float) -> Unit = {},
    ): Attachment? {
        val body = StreamingBody(size, (contentType ?: "application/octet-stream").toMediaType(), open, onProgress)
        val request = Request.Builder()
            .url(url("/files?conversationId=${conversationId.encodeQuery()}&name=${name.encodeQuery()}"))
            .post(body)
            .authorized()
            .build()
        return decode(execute(request, slow = true), UploadResponse.serializer()).attachment
    }

    suspend fun setAgentAccess(access: String): String = post(
        "/settings/agent-access",
        CoworkJson.encodeToString(AgentAccessRequest.serializer(), AgentAccessRequest(access)),
        AgentAccessResponse.serializer(),
    ).agentAccess

    suspend fun refreshUsage(): List<Quota> = post("/usage/refresh", "{}", QuotasResponse.serializer()).quotas

    /** Visto bueno ([approve]) o descarte del plan que propone Hermes en el mensaje [messageId]. */
    suspend fun decidePlan(conversationId: String, messageId: String, approve: Boolean) {
        withContext(Dispatchers.IO) {
            postRaw(
                "/plans/${messageId.encodeSegment()}/${if (approve) "approve" else "reject"}",
                CoworkJson.encodeToString(ConversationOnlyRequest.serializer(), ConversationOnlyRequest(conversationId)),
            ).close()
        }
    }

    suspend fun setPlanApproval(enabled: Boolean): Boolean = post(
        "/settings/plan-approval",
        CoworkJson.encodeToString(PlanApprovalRequest.serializer(), PlanApprovalRequest(enabled)),
        PlanApprovalResponse.serializer(),
    ).planApproval

    /** Nota de voz (WAV) → texto con el dictado del propio ordenador (Whisper, sin servicios externos). */
    suspend fun transcribe(file: java.io.File, language: String = com.aicowork.remote.i18n.I18n.lang): String {
        val request = Request.Builder()
            .url(url("/voice/transcribe?language=${language.encodeQuery()}"))
            .post(file.asRequestBody("audio/wav".toMediaType()))
            .authorized()
            .build()
        return decode(execute(request, client = dictation), TranscriptResponse.serializer()).text
    }

    suspend fun stopRequest(requestId: String) {
        withContext(Dispatchers.IO) { postRaw("/requests/${requestId.encodeSegment()}/stop", "{}").close() }
    }

    suspend fun resumeRequest(requestId: String) {
        withContext(Dispatchers.IO) { postRaw("/requests/${requestId.encodeSegment()}/resume", "{}").close() }
    }

    /** Quita lo que quedó en pausa de la petición: no se reanudará. */
    suspend fun discardRequest(requestId: String) {
        withContext(Dispatchers.IO) { postRaw("/requests/${requestId.encodeSegment()}/discard", "{}").close() }
    }

    /** «Reiniciar agente» tras un fallo: olvida su bloqueo, comprueba que responde y lo deja disponible. */
    suspend fun resetAgent(agentId: String): AgentResetResponse = post("/agents/${agentId.encodeSegment()}/reset", "{}", AgentResetResponse.serializer())

    /** Enciende o apaga el razonamiento («think») del agente de LM Studio. */
    suspend fun setAgentThinking(agentId: String, enabled: Boolean): AgentThinkingResponse =
        post("/agents/${agentId.encodeSegment()}/thinking", "{\"enabled\":$enabled}", AgentThinkingResponse.serializer())

    /** «/model»: el modelo de Hermes y los disponibles. */
    suspend fun hermesModels(): HermesModelsInfo = get("/hermes/models", HermesModelsInfo.serializer())

    /** Cambia el modelo de Hermes (null: vuelve al de su configuración). */
    suspend fun setHermesModel(choice: HermesChoice?): HermesModelsInfo = post(
        "/hermes/model",
        if (choice == null) CoworkJson.encodeToString(HermesResetRequest.serializer(), HermesResetRequest(true))
        else CoworkJson.encodeToString(HermesChoice.serializer(), choice),
        HermesModelsInfo.serializer(),
    )

    /** Bandeja «Te necesita»: los abiertos y los últimos cerrados, del más reciente al más antiguo. */
    suspend fun inbox(): List<InboxItem> = get("/inbox", InboxResponse.serializer()).items

    /** Pulsa el botón [actionId] del aviso [itemId] (404 si ya no existe el aviso o la acción). */
    suspend fun inboxAction(itemId: String, actionId: String): InboxActionResponse =
        post("/inbox/${itemId.encodeSegment()}/${actionId.encodeSegment()}", "{}", InboxActionResponse.serializer())

    /** ¿Tiene el servidor versión nueva en GitHub? (consulta GitHub: puede tardar). */
    suspend fun serverUpdate(): ServerUpdate =
        decode(execute(Request.Builder().url(url("/server/update")).get().authorized().build(), slow = true), ServerUpdate.serializer())

    /** El servidor descarga, compila e instala su versión nueva y se reinicia (responde en cuanto empieza). */
    suspend fun startServerUpdate(setAside: Boolean) {
        val body = CoworkJson.encodeToString(ServerUpdateRequest.serializer(), ServerUpdateRequest(setAside))
        execute(Request.Builder().url(url("/server/update")).post(body.toRequestBody(jsonType)).authorized().build(), slow = true).close()
    }

    /** Última versión de Órbita que ofrece el ordenador (404 NO_ORBITA_RELEASE si no tiene ninguna). */
    suspend fun appRelease(): AppRelease = get("/app/android", AppRelease.serializer())

    /** Descarga la APK de esa versión en [target] (sin cargarla entera en memoria). */
    suspend fun downloadApk(target: java.io.File, onProgress: (Float) -> Unit) {
        val response = execute(Request.Builder().url(url("/app/android/apk")).get().authorized().build(), slow = true)
        withContext(Dispatchers.IO) {
            response.use {
                val body = it.body ?: throw ApiException(it.code, "bad_response", t("El ordenador no envió la APK."), true)
                val total = body.contentLength()
                if (total > MAX_DOWNLOAD) throw ApiException(413, "TOO_LARGE", t("La APK es demasiado grande ({v1} MB).", "v1" to total / 1_048_576), false)
                target.parentFile?.mkdirs()
                var read = 0L
                body.byteStream().use { input ->
                    target.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buffer)
                            if (n < 0) break
                            output.write(buffer, 0, n)
                            read += n
                            if (read > MAX_DOWNLOAD) throw ApiException(413, "TOO_LARGE", t("La APK es demasiado grande."), false)
                            if (total > 0) onProgress((read.toFloat() / total).coerceIn(0f, 1f))
                        }
                    }
                }
            }
        }
    }

    /** Abre el WebSocket de eventos con `Authorization: Bearer`. */
    fun openEvents(listener: WebSocketListener): WebSocket {
        val request = Request.Builder().url(url("/events")).authorized().build()
        return http.newWebSocket(request, listener)
    }

    fun shutdown() {
        // El cierre TLS puede escribir close_notify; Android prohíbe esa E/S en el hilo de Compose.
        http.dispatcher.executorService.execute {
            http.dispatcher.cancelAll()
            http.connectionPool.evictAll()
        }
    }

    // ---------------------------------------------------------------------------------------------

    private suspend fun <T> get(path: String, strategy: DeserializationStrategy<T>): T =
        decode(execute(Request.Builder().url(url(path)).get().authorized().build()), strategy)

    private suspend fun <T> post(path: String, body: String, strategy: DeserializationStrategy<T>, auth: Boolean = true): T =
        decode(postRaw(path, body, auth), strategy)

    private suspend fun postRaw(path: String, body: String, auth: Boolean = true): Response {
        val builder = Request.Builder().url(url(path)).post(body.toRequestBody(jsonType))
        if (auth) builder.authorized()
        return execute(builder.build())
    }

    private fun Request.Builder.authorized(): Request.Builder {
        tokenProvider()?.let { header("Authorization", "Bearer $it") }
        return this
    }

    private suspend fun <T> decode(response: Response, strategy: DeserializationStrategy<T>): T = withContext(Dispatchers.IO) {
        response.use {
            val text = it.body?.string().orEmpty().ifBlank { "{}" }
            try {
                CoworkJson.decodeFromString(strategy, text)
            } catch (e: SerializationException) {
                throw ApiException(it.code, "bad_response", t("El servidor respondió algo que esta versión de la app no entiende."), false, e)
            } catch (e: IllegalArgumentException) {
                throw ApiException(it.code, "bad_response", t("El servidor respondió algo que esta versión de la app no entiende."), false, e)
            }
        }
    }

    private suspend fun raw(path: String, maxBytes: Long): RawContent {
        val response = execute(Request.Builder().url(url(path)).get().authorized().build(), slow = true)
        return withContext(Dispatchers.IO) {
            response.use {
                val body = it.body ?: throw ApiException(it.code, "bad_response", t("El ordenador no envió el contenido."), true)
                val declared = body.contentLength()
                if (declared > maxBytes) throw ApiException(413, "TOO_LARGE", t("Es demasiado grande para verlo en el móvil ({v1} MB).", "v1" to declared / 1_048_576), false)
                val bytes = body.source().use { source ->
                    val buffer = okio.Buffer()
                    while (source.read(buffer, 64 * 1024) != -1L) {
                        if (buffer.size > maxBytes) throw ApiException(413, "TOO_LARGE", t("Es demasiado grande para verlo en el móvil."), false)
                    }
                    buffer.readByteArray()
                }
                RawContent(bytes, it.header("Content-Type")?.substringBefore(';')?.trim()?.lowercase() ?: "application/octet-stream")
            }
        }
    }

    /** Ejecuta la llamada y convierte los errores HTTP en [ApiException]. `slow`: subidas y descargas (sin límite de lectura corto). */
    private suspend fun execute(request: Request, slow: Boolean = false, client: OkHttpClient? = null): Response {
        val response = try {
            (client ?: if (slow) transfers else http).newCall(request).await()
        } catch (e: ApiException) {
            throw e
        } catch (e: IOException) {
            if (e.findCause<UntrustedCertificateException>() != null) throw e
            throw ApiException.network(e)
        }
        if (response.isSuccessful) return response
        val body = withContext(Dispatchers.IO) { response.use { it.body?.string().orEmpty() } }
        val parsed = runCatching { CoworkJson.decodeFromString(ApiErrorBody.serializer(), body) }.getOrNull()
        throw ApiException(
            status = response.code,
            code = parsed?.code ?: "http_${response.code}",
            message = parsed?.message?.takeIf { it.isNotBlank() } ?: defaultMessage(response.code),
            retryable = parsed?.retryable ?: (response.code >= 500 || response.code == 429),
        )
    }

    private fun defaultMessage(status: Int) = when (status) {
        401 -> t("La sesión no es válida. Vuelve a emparejar el dispositivo.")
        403 -> t("Este dispositivo no tiene permiso para hacerlo.")
        404 -> t("El servidor no ofrece la API móvil. Actualiza kywai en el ordenador.")
        429 -> t("Demasiadas peticiones seguidas. Espera un momento.")
        in 500..599 -> t("El ordenador tuvo un problema ({status}). Inténtalo de nuevo.", "status" to status)
        else -> t("Error {status} del servidor", "status" to status)
    }

    private fun String.encodeSegment() = java.net.URLEncoder.encode(this, "UTF-8").replace("+", "%20")
    private fun String.encodeQuery() = java.net.URLEncoder.encode(this, "UTF-8").replace("+", "%20")

    companion object {
        const val API_PREFIX = "/api/mobile/v1"
        /** Lo más grande que se descarga para verlo en el móvil (el servidor admite hasta 25 MB). */
        const val MAX_DOWNLOAD = 25L * 1024 * 1024
    }
}

/** Contenido descargado de un resultado o archivo. */
class RawContent(val bytes: ByteArray, val contentType: String) {
    val isImage get() = contentType.startsWith("image/")
    val isPdf get() = contentType == "application/pdf"
    val isHtml get() = contentType == "text/html"
    val isText get() = contentType.startsWith("text/") || contentType in TEXT_TYPES

    fun text(): String = bytes.toString(Charsets.UTF_8)

    private companion object {
        val TEXT_TYPES = setOf("application/json", "application/javascript", "application/xml", "application/x-sh", "application/typescript")
    }
}

/** Cuerpo de subida que se lee del archivo sin cargarlo entero y avisa del progreso. */
private class StreamingBody(
    private val size: Long,
    private val type: okhttp3.MediaType,
    private val open: () -> java.io.InputStream,
    private val onProgress: (Float) -> Unit,
) : okhttp3.RequestBody() {
    override fun contentType() = type
    override fun contentLength() = size
    override fun writeTo(sink: okio.BufferedSink) {
        open().use { input ->
            val buffer = ByteArray(64 * 1024)
            var sent = 0L
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                sink.write(buffer, 0, read)
                sent += read
                if (size > 0) onProgress((sent.toFloat() / size).coerceIn(0f, 1f))
            }
        }
    }
}

private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) = cont.resume(response)
        override fun onFailure(call: Call, e: IOException) {
            if (!cont.isCancelled) cont.resumeWithException(e)
        }
    })
    cont.invokeOnCancellation { runCatching { cancel() } }
}

inline fun <reified T : Throwable> Throwable.findCause(): T? {
    var current: Throwable? = this
    while (current != null) {
        if (current is T) return current
        current = current.cause.takeIf { it !== current }
    }
    return null
}
