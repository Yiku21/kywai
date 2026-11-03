package com.aicowork.mock

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import java.io.Closeable
import java.net.InetAddress
import java.security.MessageDigest
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Servidor simulado que cumple el contrato móvil `/api/mobile/v1` de AI Cowork.
 *
 * Sirve para desarrollar y probar la app sin depender del backend real: empareja con un código,
 * devuelve la instantánea, acepta mensajes, detiene y reanuda peticiones y emite eventos por WebSocket
 * (sobres `{"type","sequence","payload"}`) mientras simula a un equipo de agentes trabajando.
 *
 * @param tickMillis cadencia de la simulación (las pruebas la aceleran).
 * @param heldCertificate si no es nulo, sirve HTTPS con ese certificado propio (ver [selfSigned]).
 */
class MockCoworkServer(
    val pairingCode: String = DEFAULT_CODE,
    private val tickMillis: Long = 900,
    private val heldCertificate: HeldCertificate? = null,
    private val clock: () -> Long = System::currentTimeMillis,
) : Closeable {

    private val server = MockWebServer()
    private val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "mock-cowork-sim").apply { isDaemon = true }
    }
    private val lock = Any()
    private val sockets = CopyOnWriteArrayList<WebSocket>()
    private val json = Json { ignoreUnknownKeys = true }

    /** Huella SHA-256 del certificado propio (`AB:CD:…`), o null si sirve HTTP. */
    val certificateSha256: String? = heldCertificate?.let { fingerprint(it.certificate.encoded) }

    // ---- Estado simulado ----
    private var sequence = 0L
    private val tokens = mutableSetOf<String>()
    private var conversationId = newId("c")
    private var conversationCreatedAt = clock()
    private val messages = mutableListOf<Msg>()
    private val seenClientIds = mutableMapOf<String, String>()
    private val agents = linkedMapOf<String, Agent>()
    private val tasks = linkedMapOf<String, Task>()
    private val traces = mutableMapOf<String, MutableList<JsonObject>>()
    private val memory = mutableListOf<Memory>()
    private val requests = linkedMapOf<String, Req>()
    /** Bandeja «Te necesita» (abiertos y cerrados, en orden de llegada). */
    private val inbox = mutableListOf<Inbox>()
    private var totalInput = 182_400L
    private var totalOutput = 41_900L
    private var requestCounter = 0
    private var memoryCounter = 3

    /** Fallo forzado para probar errores: la próxima llamada que coincida responde con este estado. */
    @Volatile
    var failNext: Pair<String, Int>? = null

    init {
        seed()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = handle(request)
        }
        heldCertificate?.let {
            val certs = HandshakeCertificates.Builder().heldCertificate(it).build()
            server.useHttps(certs.sslSocketFactory(), false)
        }
    }

    fun start(port: Int = 0, address: InetAddress = InetAddress.getLoopbackAddress()): String {
        server.start(address, port)
        return baseUrl
    }

    val port: Int get() = server.port

    /** URL base para la app (sin barra final). */
    val baseUrl: String
        get() {
            val scheme = if (heldCertificate != null) "https" else "http"
            val host = server.hostName.let { if (it.contains(':')) "[$it]" else it }
            return "$scheme://$host:${server.port}"
        }

    /** Número de clientes WebSocket conectados (para pruebas). */
    val connectedClients: Int get() = sockets.size

    /** Cierra todos los WebSocket abiertos para simular un corte de red. */
    fun dropConnections() {
        sockets.forEach { it.close(1001, "simulated drop") }
        sockets.clear()
    }

    /** Acepta un token emitido antes (para restaurar la sesión de demostración tras reiniciar la app). */
    fun authorize(token: String) = synchronized(lock) { tokens += token }

    /** Invalida todos los tokens emitidos (simula que caducan o se revocan). */
    fun revokeTokens() = synchronized(lock) { tokens.clear() }

    /** Cierre de sesión por el mismo código/motivo que usa el servidor real al caducar un token. */
    fun expireSessions() {
        revokeTokens()
        sockets.forEach { it.close(1008, "TOKEN_EXPIRED") }
        sockets.clear()
    }

    override fun close() {
        scheduler.shutdownNow()
        dropConnections()
        runCatching { server.shutdown() }
    }

    // ------------------------------------------------------------------ HTTP

    private fun handle(request: RecordedRequest): MockResponse {
        val path = request.requestUrl?.encodedPath ?: request.path.orEmpty()
        val method = request.method ?: "GET"
        failNext?.let { (prefix, status) ->
            if (path.endsWith(prefix)) {
                failNext = null
                return error(status, "simulated_failure", "Fallo simulado del servidor", retryable = true)
            }
        }
        if (!path.startsWith(PREFIX)) return error(404, "not_found", "Ruta desconocida: $path", false)
        val route = path.removePrefix(PREFIX)

        if (route == "/pair" && method == "POST") return pair(request)
        if (!authorized(request)) {
            return error(401, "unauthorized", "Falta el token o ha caducado. Vuelve a emparejar el dispositivo.", false)
        }
        return when {
            route == "/events" && method == "GET" -> upgrade()
            route == "/snapshot" && method == "GET" -> ok(synchronized(lock) { snapshot() })
            route == "/chat/messages" && method == "POST" -> postMessage(request)
            route == "/conversations" && method == "POST" -> newConversation()
            route.startsWith("/requests/") && method == "POST" -> requestAction(route)
            route == "/inbox" && method == "GET" -> ok(synchronized(lock) { buildJsonObject { put("items", JsonArray(inbox.sortedByDescending { it.createdAt }.map { it.toJson() })) } })
            route.startsWith("/inbox/") && method == "POST" -> inboxAction(route)
            else -> error(404, "not_found", "Ruta desconocida: $path", false)
        }
    }

    private fun authorized(request: RecordedRequest): Boolean {
        val header = request.getHeader("Authorization") ?: return false
        val token = header.removePrefix("Bearer ").trim()
        return synchronized(lock) { token in tokens }
    }

    private fun body(request: RecordedRequest): JsonObject? =
        runCatching { json.parseToJsonElement(request.body.readUtf8()).jsonObject }.getOrNull()

    private fun pair(request: RecordedRequest): MockResponse {
        val body = body(request) ?: return error(400, "bad_request", "Cuerpo JSON no válido", false)
        val code = body.str("code")?.trim()
        val device = body.str("deviceName")
        if (code.isNullOrEmpty() || device.isNullOrBlank()) {
            return error(400, "bad_request", "Faltan code o deviceName", false)
        }
        if (code != pairingCode) {
            return error(401, "invalid_code", "El código no es válido o ha caducado. Genera otro en AI Cowork.", false)
        }
        val token = "mock_" + UUID.randomUUID().toString().replace("-", "")
        synchronized(lock) { tokens += token }
        return ok(buildJsonObject {
            put("accessToken", token)
            put("expiresAt", Instant.ofEpochMilli(clock()).plus(30, ChronoUnit.DAYS).toString())
            put("serverName", "AI Cowork (simulado)")
        })
    }

    private fun postMessage(request: RecordedRequest): MockResponse {
        val body = body(request) ?: return error(400, "bad_request", "Cuerpo JSON no válido", false)
        val text = body.str("text")?.trim().orEmpty()
        val clientId = body.str("clientMessageId")
        if (text.isEmpty() || clientId.isNullOrBlank()) {
            return error(400, "bad_request", "El mensaje necesita text y clientMessageId", false)
        }
        val convId = body.str("conversationId")
        return synchronized(lock) {
            if (convId != null && convId != conversationId) {
                return@synchronized error(409, "conversation_closed", "Esa conversación ya no está activa", false)
            }
            seenClientIds[clientId]?.let { existing ->
                val msg = messages.first { it.id == existing }
                return@synchronized ok(buildJsonObject {
                    put("message", msg.toJson())
                    put("requestId", msg.requestId)
                }, status = 202)
            }
            val req = Req(id = "r${++requestCounter}-" + newId("").takeLast(4), prompt = text)
            val msg = Msg(
                id = newId("m"), author = "user", text = text, createdAt = clock(),
                requestId = req.id, clientMessageId = clientId,
            )
            messages += msg
            seenClientIds[clientId] = msg.id
            requests[req.id] = req
            emit("message.upsert", buildJsonObject { put("message", msg.toJson()) })
            emit("request.started", buildJsonObject { put("requestId", req.id); put("conversationId", conversationId) })
            schedule(req)
            ok(buildJsonObject {
                put("message", msg.toJson())
                put("requestId", req.id)
            }, status = 202)
        }
    }

    private fun newConversation(): MockResponse = synchronized(lock) {
        requests.values.filter { it.active }.forEach { stopLocked(it, silent = true) }
        conversationId = newId("c")
        conversationCreatedAt = clock()
        messages.clear()
        seenClientIds.clear()
        messages += Msg(newId("m"), "system", "Conversación nueva. El equipo conserva la memoria del proyecto.", clock())
        val conv = conversationJson()
        emit("conversation.created", buildJsonObject { put("conversation", conv) })
        ok(buildJsonObject { put("conversation", conv) }, status = 201)
    }

    private fun requestAction(route: String): MockResponse {
        val parts = route.removePrefix("/requests/").split('/')
        if (parts.size != 2) return error(404, "not_found", "Ruta desconocida", false)
        val (id, action) = parts
        return synchronized(lock) {
            val req = requests[id] ?: return@synchronized error(404, "request_not_found", "No existe la petición $id", false)
            when (action) {
                "stop" -> {
                    if (!req.active) return@synchronized error(409, "not_running", "La petición ya no está en marcha", false)
                    stopLocked(req, silent = false)
                    ok(buildJsonObject { put("requestId", id); put("status", "stopped") })
                }
                "resume" -> {
                    if (req.active || req.done) {
                        return@synchronized error(409, "nothing_to_resume", "No hay nada que reanudar en esta petición", false)
                    }
                    resumeLocked(req)
                    ok(buildJsonObject { put("requestId", id); put("status", "running") })
                }
                else -> error(404, "not_found", "Acción desconocida: $action", false)
            }
        }
    }

    /** POST /inbox/{id}/{actionId}: cierra el aviso con esa acción y avisa con `inbox.updated` (solo los abiertos). */
    private fun inboxAction(route: String): MockResponse {
        val parts = route.removePrefix("/inbox/").split('/')
        if (parts.size != 2) return error(404, "not_found", "Ruta desconocida", false)
        val (id, actionId) = parts
        return synchronized(lock) {
            val index = inbox.indexOfFirst { it.id == id }
            if (index < 0) return@synchronized error(404, "inbox_not_found", "No existe el aviso $id", false)
            val item = inbox[index]
            val action = item.actions.firstOrNull { it.first == actionId && it.third == null }
                ?: return@synchronized error(404, "action_not_found", "El aviso no tiene la acción $actionId", false)
            val resolved = if (item.resolvedAt != null) item else item.copy(resolvedAt = clock(), resolution = actionId)
            inbox[index] = resolved
            emit("inbox.updated", buildJsonObject { put("items", JsonArray(inbox.filter { it.resolvedAt == null }.sortedByDescending { it.createdAt }.map { it.toJson() })) })
            ok(buildJsonObject {
                put("item", resolved.toJson())
                put("message", "Hecho: «${action.second}»")
            })
        }
    }

    private fun upgrade(): MockResponse = MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            sockets += webSocket
            synchronized(lock) {
                webSocket.send(envelope("hello", buildJsonObject {
                    put("serverName", "AI Cowork (simulado)")
                    put("sequence", sequence)
                }, sequence).toString())
            }
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            if (text.contains("\"ping\"")) webSocket.send("""{"type":"pong","sequence":$sequence,"payload":{}}""")
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            sockets -= webSocket
            webSocket.close(1000, null)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            sockets -= webSocket
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            sockets -= webSocket
        }
    })

    private fun ok(body: JsonElement, status: Int = 200) = MockResponse()
        .setResponseCode(status)
        .setHeader("Content-Type", "application/json; charset=utf-8")
        .setBody(body.toString())

    private fun error(status: Int, code: String, message: String, retryable: Boolean) = ok(
        buildJsonObject {
            put("code", code)
            put("message", message)
            put("retryable", retryable)
        },
        status,
    )

    // ------------------------------------------------------------------ Eventos

    private fun emit(type: String, payload: JsonObject) {
        sequence += 1
        val text = envelope(type, payload, sequence).toString()
        sockets.forEach { it.send(text) }
    }

    private fun envelope(type: String, payload: JsonObject, seq: Long) = buildJsonObject {
        put("type", type)
        put("sequence", seq)
        put("payload", payload)
    }

    // ------------------------------------------------------------------ Simulación

    private fun schedule(req: Req) {
        req.future?.cancel(false)
        req.future = scheduler.scheduleWithFixedDelay(
            { runCatching { synchronized(lock) { tick(req) } } },
            tickMillis, tickMillis, TimeUnit.MILLISECONDS,
        )
    }

    private fun tick(req: Req) {
        if (!req.active) return
        req.step += 1
        val coordinator = agents.getValue("coordinador")
        when (req.step) {
            1 -> {
                updateAgent(coordinator.copy(activity = "thinking", lastActivity = "Leyendo la petición", taskId = null))
                val msg = Msg(newId("m"), "agent:coordinador", "Entendido. ", clock(), req.id, streaming = true)
                messages += msg
                req.plannerMessageId = msg.id
                emit("message.upsert", buildJsonObject { put("message", msg.toJson()) })
            }
            2 -> delta(req, "Reparto «${req.prompt.take(40)}» en dos tareas ")
            3 -> {
                val t1 = Task(newId("t"), req.id, "Investigar y preparar", "Revisar el proyecto y reunir lo necesario para: ${req.prompt}",
                    "investigador", difficulty = "medium", acceptance = "Resumen con fuentes en entregables/", files = listOf(".ai-cowork/entregables/"), createdAt = clock())
                val t2 = Task(newId("t"), req.id, "Construir la solución", "Implementar el resultado pedido: ${req.prompt}",
                    "constructor", difficulty = "hard", acceptance = "Las pruebas pasan", files = listOf("src/"), createdAt = clock(),
                    dependsOn = listOf(t1.id))
                listOf(t1, t2).forEach { tasks[it.id] = it; req.taskIds += it.id; emit("task.upsert", buildJsonObject { put("task", it.toJson()) }) }
                delta(req, "y las reparto entre Investigador y Constructor.")
                val final = messages.first { it.id == req.plannerMessageId }.copy(streaming = false, taskIds = req.taskIds.toList())
                replaceMessage(final)
                updateAgent(coordinator.copy(activity = "idle", lastActivity = "Plan repartido"))
            }
            in 4..13 -> advanceTasks(req)
            else -> finish(req)
        }
    }

    private fun advanceTasks(req: Req) {
        val running = req.taskIds.mapNotNull { tasks[it] }.firstOrNull { it.status != "done" } ?: return finish(req)
        val agent = agents.getValue(running.agentId)
        val progress = ((running.progress ?: 0.0) + 0.2).coerceAtMost(1.0)
        val steps = listOf("Leyendo el proyecto", "Ejecutando: npm test", "Editando src/app.ts", "Buscando en la web", "Comprobando el resultado")
        val label = steps[((progress * 5).toInt() - 1).coerceIn(0, steps.lastIndex)]
        var task = running.copy(
            status = "running", progress = progress, lastActivity = label,
            startedAt = running.startedAt ?: clock(),
            usage = running.usage.first + 3200 to running.usage.second + 900,
        )
        totalInput += 3200; totalOutput += 900
        addTrace(task, label)
        if (progress >= 1.0) {
            task = task.copy(status = "done", finishedAt = clock(), result = "Hecho: ${task.title.lowercase()} completado y comprobado.", lastActivity = "Terminado")
            updateAgent(agent.copy(activity = "idle", taskId = null, lastActivity = "Terminó «${task.title}»", context = null))
            val msg = Msg(newId("m"), "agent:${agent.id}", "He terminado «${task.title}». ${task.result}", clock(), req.id)
            messages += msg
            emit("message.upsert", buildJsonObject { put("message", msg.toJson()) })
        } else {
            updateAgent(agent.copy(activity = "working", taskId = task.id, lastActivity = label, context = (20_000 + (progress * 60_000).toLong()) to 200_000L))
        }
        tasks[task.id] = task
        emit("task.upsert", buildJsonObject { put("task", task.toJson()) })
        emit("usage.updated", buildJsonObject { put("usage", usageJson()) })
    }

    private fun finish(req: Req) {
        req.future?.cancel(false)
        req.done = true
        val m = Memory("m${++memoryCounter}", "fact", "Petición «${req.prompt.take(50)}» resuelta por Investigador y Constructor.", "provisional", "Coordinador", clock())
        memory += m
        emit("memory.updated", buildJsonObject { put("projectId", conversationId); put("memory", JsonArray(memory.map { it.toJson() })) })
        val msg = Msg(newId("m"), "system", "Petición terminada.", clock(), req.id)
        messages += msg
        emit("message.upsert", buildJsonObject { put("message", msg.toJson()) })
        emit("request.finished", buildJsonObject { put("requestId", req.id); put("projectId", conversationId); put("ok", true) })
    }

    private fun stopLocked(req: Req, silent: Boolean) {
        req.future?.cancel(false)
        req.stopped = true
        req.taskIds.mapNotNull { tasks[it] }.filter { it.status == "running" || it.status == "pending" }.forEach { t ->
            val cancelled = t.copy(status = "cancelled", lastActivity = "Detenida por ti")
            tasks[t.id] = cancelled
            emit("task.upsert", buildJsonObject { put("task", cancelled.toJson()) })
            agents[t.agentId]?.let { updateAgent(it.copy(activity = "idle", taskId = null, lastActivity = "Detenido", context = null)) }
        }
        req.plannerMessageId?.let { id -> messages.firstOrNull { it.id == id && it.streaming }?.let { replaceMessage(it.copy(streaming = false)) } }
        if (!silent) {
            val msg = Msg(newId("m"), "system", "Petición detenida. Puedes reanudarla cuando quieras.", clock(), req.id)
            messages += msg
            emit("message.upsert", buildJsonObject { put("message", msg.toJson()) })
        }
        emit("request.finished", buildJsonObject { put("requestId", req.id); put("projectId", conversationId); put("ok", false); put("stopped", true) })
    }

    private fun resumeLocked(req: Req) {
        req.stopped = false
        req.taskIds.mapNotNull { tasks[it] }.filter { it.status == "cancelled" }.forEach { t ->
            val pending = t.copy(status = "pending", lastActivity = "Reanudada")
            tasks[t.id] = pending
            emit("task.upsert", buildJsonObject { put("task", pending.toJson()) })
        }
        val msg = Msg(newId("m"), "system", "Petición reanudada.", clock(), req.id)
        messages += msg
        emit("message.upsert", buildJsonObject { put("message", msg.toJson()) })
        emit("request.started", buildJsonObject { put("requestId", req.id); put("conversationId", conversationId) })
        schedule(req)
    }

    private fun delta(req: Req, text: String) {
        val id = req.plannerMessageId ?: return
        val msg = messages.first { it.id == id }
        val idx = messages.indexOf(msg)
        messages[idx] = msg.copy(text = msg.text + text)
        emit("message.delta", buildJsonObject { put("messageId", id); put("text", text) })
    }

    private fun replaceMessage(msg: Msg) {
        val idx = messages.indexOfFirst { it.id == msg.id }
        if (idx >= 0) messages[idx] = msg
        emit("message.upsert", buildJsonObject { put("message", msg.toJson()) })
    }

    private fun updateAgent(agent: Agent) {
        agents[agent.id] = agent.copy(lastActivityAt = clock())
        emit("agent.runtime", buildJsonObject {
            putJsonObject("runtime") {
                put("agentId", agent.id)
                put("activity", agent.activity)
                agent.taskId?.let { put("taskId", it) }
                agent.lastActivity?.let { put("lastActivity", it) }
                put("lastActivityAt", clock())
                agent.context?.let { (used, cap) -> putJsonObject("context") { put("used", used); put("capacity", cap) } }
            }
        })
    }

    private fun addTrace(task: Task, title: String) {
        val list = traces.getOrPut(task.id) { mutableListOf() }
        val entry = buildJsonObject {
            put("id", "e${list.size + 1}")
            put("ts", clock())
            put("kind", "tool")
            put("tool", if (title.startsWith("Ejecutando")) "command" else if (title.startsWith("Editando")) "edit" else "read")
            put("title", title)
            put("ok", true)
        }
        list += entry
        emit("task.trace", buildJsonObject { put("taskId", task.id); put("projectId", conversationId); put("entry", entry) })
    }

    // ------------------------------------------------------------------ Datos

    private fun seed() {
        val now = clock()
        listOf(
            Agent("coordinador", "Coordinador", "Planifica y reparte", "claude", "Opus", "#7C5CFF", strengths = listOf("Dividir peticiones", "Elegir al agente adecuado"), plannerOnly = true),
            Agent("investigador", "Investigador", "Busca y resume", "gemini", "3.6 Flash", "#1FA7A0", strengths = listOf("Búsquedas en la web", "Resúmenes con fuentes")),
            Agent("constructor", "Constructor", "Escribe y prueba código", "codex", "GPT-5", "#F2994A", strengths = listOf("Kotlin y TypeScript", "Pruebas automáticas")),
            Agent("local", "Local", "Tareas sencillas sin conexión", "ollama", "Qwen 3", "#6B7A90", activity = "offline", reason = "Ollama no está abierto", strengths = listOf("Formatear textos")),
        ).forEach { agents[it.id] = it.copy(lastActivityAt = now) }

        messages += Msg(newId("m"), "system", "Conectado al servidor simulado. Escribe una petición para ver al equipo trabajar.", now - 60_000)

        val oldReq = Req("r0-demo", "Preparar el informe semanal", done = true)
        requests[oldReq.id] = oldReq
        val done = Task("t-demo1", oldReq.id, "Redactar el informe semanal", "Resumir los avances de la semana", "investigador",
            status = "done", difficulty = "easy", progress = 1.0, result = "Informe en .ai-cowork/entregables/informe.md",
            createdAt = now - 3_600_000, startedAt = now - 3_500_000, finishedAt = now - 3_000_000, usage = 12_000L to 3_400L,
            acceptance = "Informe de una página")
        val failed = Task("t-demo2", oldReq.id, "Publicar el informe", "Subir el informe a la wiki", "constructor",
            status = "failed", difficulty = "medium", error = "Sin acceso a la wiki (401)", createdAt = now - 3_000_000,
            startedAt = now - 2_900_000, finishedAt = now - 2_800_000, usage = 4_000L to 800L)
        tasks[done.id] = done
        tasks[failed.id] = failed
        traces[done.id] = mutableListOf(buildJsonObject {
            put("id", "e1"); put("ts", now - 3_400_000); put("kind", "tool"); put("tool", "write"); put("title", "Escribiendo informe.md"); put("ok", true)
        })

        memory += Memory("m1", "decision", "La app de acceso remoto será Android nativa, no una web empaquetada.", "confirmed", "Tú", now - 86_400_000)
        memory += Memory("m2", "preference", "Experiencia diseñada para móvil, no una copia 1:1 del escritorio.", "confirmed", "Tú", now - 86_000_000)
        memory += Memory("m3", "pending", "Publicar el informe en la wiki cuando haya credenciales.", "provisional", "Constructor", now - 2_800_000)

        inbox += Inbox("i-demo1", "failed", "Falló «Publicar el informe»", "Sin acceso a la wiki (401). ¿Lo reintento o lo dejo?",
            conversationId, taskId = failed.id, agentId = "constructor", createdAt = now - 2_700_000,
            actions = listOf(Triple("retry", "Reintentar", null), Triple("dismiss", "Descartar", null)))
        inbox += Inbox("i-demo2", "mac-permission", "El Mac pide permiso de Accesibilidad", "Concédelo en Ajustes del Sistema › Privacidad y seguridad.",
            conversationId, createdAt = now - 600_000,
            actions = listOf(Triple("screen", "Compartir pantalla", "vnc://localhost"), Triple("granted", "Ya lo he concedido", null)))
    }

    private fun snapshot() = buildJsonObject {
        put("conversation", conversationJson())
        put("agents", JsonArray(agents.values.map { it.toJson() }))
        put("tasks", JsonArray(tasks.values.map { it.toJson(includeTrace = true) }))
        put("memory", JsonArray(memory.map { it.toJson() }))
        put("usage", usageJson())
        putJsonObject("capabilities") {
            put("stopRequests", true)
            put("resumeRequests", true)
            put("newConversation", true)
            put("taskTrace", true)
            put("attachments", false)
            put("inbox", true)
        }
        put("sequence", sequence)
    }

    private fun conversationJson() = buildJsonObject {
        put("id", conversationId)
        put("title", "Proyecto AI Cowork")
        put("createdAt", conversationCreatedAt)
        put("messages", JsonArray(messages.map { it.toJson() }))
        putJsonArray("activeRequestIds") { requests.values.filter { it.active }.forEach { add(JsonPrimitive(it.id)) } }
    }

    private fun usageJson() = buildJsonObject {
        putJsonObject("totals") {
            put("input", totalInput)
            put("output", totalOutput)
            put("cached", totalInput / 3)
        }
        put("quotas", buildJsonArray {
            add(quota("claude", "Claude (suscripción)", "usage", 72.0 - (totalOutput - 41_900) / 2_000.0, "Ventana de 5 h", "real", listOf("coordinador")))
            add(quota("codex", "Codex", "usage", 54.0, "Ventana semanal", "real", listOf("constructor")))
            add(quota("gemini", "Gemini", "requests", 18.0, "Diario", "estimate", listOf("investigador")))
            add(buildJsonObject {
                put("id", "local"); put("label", "Local (Ollama)"); put("kind", "local"); put("remainingPct", JsonNull)
                put("unlimited", true); put("source", "config"); putJsonArray("agentIds") { add(JsonPrimitive("local")) }
            })
        })
        put("byAgent", buildJsonArray {
            agents.keys.forEach { id ->
                val list = tasks.values.filter { it.agentId == id }
                add(buildJsonObject {
                    put("agentId", id)
                    put("input", list.sumOf { it.usage.first })
                    put("output", list.sumOf { it.usage.second })
                })
            }
        })
    }

    private fun quota(id: String, label: String, kind: String, pct: Double, period: String, source: String, agentIds: List<String>) = buildJsonObject {
        put("id", id); put("label", label); put("kind", kind); put("remainingPct", pct.coerceIn(0.0, 100.0)); put("period", period)
        put("resetsAt", clock() + 2 * 3_600_000); put("source", source)
        putJsonArray("agentIds") { agentIds.forEach { add(JsonPrimitive(it)) } }
    }

    private data class Agent(
        val id: String, val name: String, val role: String, val provider: String, val modelLabel: String, val color: String,
        val activity: String = "idle", val taskId: String? = null, val lastActivity: String? = null, val lastActivityAt: Long? = null,
        val reason: String? = null, val strengths: List<String> = emptyList(), val plannerOnly: Boolean = false,
        val context: Pair<Long, Long>? = null,
    ) {
        fun toJson() = buildJsonObject {
            put("id", id); put("name", name); put("role", role); put("provider", provider); put("modelLabel", modelLabel)
            put("color", color); put("activity", activity); put("enabled", true); put("plannerOnly", plannerOnly)
            taskId?.let { put("taskId", it) }; lastActivity?.let { put("lastActivity", it) }
            lastActivityAt?.let { put("lastActivityAt", it) }; reason?.let { put("reason", it) }
            putJsonArray("strengths") { strengths.forEach { add(JsonPrimitive(it)) } }
            context?.let { (used, cap) -> putJsonObject("context") { put("used", used); put("capacity", cap) } }
        }
    }

    private data class Task(
        val id: String, val requestId: String, val title: String, val description: String, val agentId: String,
        val status: String = "pending", val difficulty: String = "medium", val progress: Double? = null,
        val lastActivity: String? = null, val result: String? = null, val error: String? = null,
        val acceptance: String? = null, val files: List<String> = emptyList(), val createdAt: Long,
        val startedAt: Long? = null, val finishedAt: Long? = null, val usage: Pair<Long, Long> = 0L to 0L,
        val dependsOn: List<String> = emptyList(),
    )

    private fun Task.toJson(includeTrace: Boolean = false) = buildJsonObject {
        put("id", id); put("requestId", requestId); put("projectId", conversationId); put("title", title); put("description", description)
        put("agentId", agentId); put("status", status); put("difficulty", difficulty)
        progress?.let { put("progress", it) }; lastActivity?.let { put("lastActivity", it) }
        result?.let { put("result", it) }; error?.let { put("error", it) }; acceptance?.let { put("acceptance", it) }
        putJsonArray("files") { files.forEach { add(JsonPrimitive(it)) } }
        putJsonArray("dependsOn") { dependsOn.forEach { add(JsonPrimitive(it)) } }
        put("createdAt", createdAt); startedAt?.let { put("startedAt", it) }; finishedAt?.let { put("finishedAt", it) }
        putJsonObject("usage") { put("input", usage.first); put("output", usage.second) }
        if (includeTrace) put("trace", JsonArray(traces[id].orEmpty().takeLast(50)))
    }

    private data class Msg(
        val id: String, val author: String, val text: String, val createdAt: Long, val requestId: String? = null,
        val streaming: Boolean = false, val taskIds: List<String> = emptyList(), val clientMessageId: String? = null,
    )

    private fun Msg.toJson() = buildJsonObject {
        put("id", id)
        put("conversationId", conversationId)
        put("projectId", conversationId)
        putJsonObject("author") {
            when {
                author == "user" -> put("type", "user")
                author == "system" -> put("type", "system")
                else -> {
                    val agentId = author.removePrefix("agent:")
                    put("type", "agent"); put("agentId", agentId); agents[agentId]?.let { put("name", it.name) }
                }
            }
        }
        put("text", text); put("createdAt", createdAt); put("streaming", streaming)
        requestId?.let { put("requestId", it) }; clientMessageId?.let { put("clientMessageId", it) }
        if (taskIds.isNotEmpty()) putJsonArray("taskIds") { taskIds.forEach { add(JsonPrimitive(it)) } }
    }

    private data class Memory(
        val id: String, val kind: String, val text: String, val status: String, val byName: String, val createdAt: Long,
    ) {
        fun toJson() = buildJsonObject {
            put("id", id); put("kind", kind); put("text", text); put("status", status); put("byName", byName)
            put("by", if (byName == "Tú") "user" else byName.lowercase()); put("createdAt", createdAt); put("updatedAt", createdAt)
        }
    }

    /** Aviso de la bandeja. actions: (id, etiqueta, url): las que tienen url las abre el móvil, no llegan aquí. */
    private data class Inbox(
        val id: String, val kind: String, val title: String, val detail: String?, val projectId: String?,
        val taskId: String? = null, val agentId: String? = null, val createdAt: Long,
        val actions: List<Triple<String, String, String?>> = emptyList(),
        val resolvedAt: Long? = null, val resolution: String? = null,
    ) {
        fun toJson() = buildJsonObject {
            put("id", id); put("kind", kind); put("title", title)
            detail?.let { put("detail", it) }; projectId?.let { put("projectId", it) }
            taskId?.let { put("taskId", it) }; agentId?.let { put("agentId", it) }
            putJsonArray("actions") {
                actions.forEach { (actionId, label, url) ->
                    add(buildJsonObject { put("id", actionId); put("label", label); url?.let { put("url", it) } })
                }
            }
            put("createdAt", createdAt)
            resolvedAt?.let { put("resolvedAt", it) }; resolution?.let { put("resolution", it) }
        }
    }

    private class Req(
        val id: String,
        val prompt: String,
        var step: Int = 0,
        var stopped: Boolean = false,
        var done: Boolean = false,
        var plannerMessageId: String? = null,
        val taskIds: MutableList<String> = mutableListOf(),
        var future: ScheduledFuture<*>? = null,
    ) {
        val active get() = !stopped && !done
    }

    companion object {
        const val PREFIX = "/api/mobile/v1"
        const val DEFAULT_CODE = "246810"

        /** Certificado propio como el que genera AI Cowork para su puerto HTTPS. */
        fun selfSigned(hosts: List<String>): HeldCertificate = HeldCertificate.Builder()
            .commonName("AI Cowork (simulado)")
            .apply { hosts.forEach { addSubjectAlternativeName(it) } }
            .duration(365, TimeUnit.DAYS)
            .build()

        fun fingerprint(der: ByteArray): String =
            MessageDigest.getInstance("SHA-256").digest(der).joinToString(":") { "%02X".format(it) }

        private fun newId(prefix: String) = prefix + UUID.randomUUID().toString().take(8)

        private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull
    }
}
