package com.aicowork.remote.ui

import com.aicowork.remote.data.ActionResult
import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.CoworkController
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.OutgoingMessage
import com.aicowork.remote.data.OutgoingStatus
import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.Author
import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.Conversation
import com.aicowork.remote.data.model.MemoryEntry
import com.aicowork.remote.data.model.Quota
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import com.aicowork.remote.data.model.TokenUsage
import com.aicowork.remote.data.model.TraceEntry
import com.aicowork.remote.data.model.Usage
import com.aicowork.remote.data.net.ProbeResult
import com.aicowork.remote.data.store.Session
import com.aicowork.remote.data.LiveEvent
import com.aicowork.remote.data.model.FilesResponse
import com.aicowork.remote.data.model.FolderFile
import com.aicowork.remote.data.model.FolderListing
import com.aicowork.remote.data.net.RawContent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import okhttp3.HttpUrl

/** Doble del repositorio para las pruebas de interfaz: guarda las llamadas y deja fijar el estado. */
class FakeController(initial: CoworkUiState = CoworkUiState()) : CoworkController {
    override val state = MutableStateFlow(initial)
    var probeResult: ProbeResult = ProbeResult.Reachable
    val calls = mutableListOf<String>()
    var pairedWith: Triple<String, String, String?>? = null

    override suspend fun probe(url: HttpUrl, pinnedSha256: String?): ProbeResult {
        calls += "probe:$url:$pinnedSha256"
        return probeResult
    }

    override suspend fun pair(url: HttpUrl, code: String, deviceName: String, pinnedSha256: String?, demo: Boolean) {
        pairedWith = Triple(url.toString(), code, pinnedSha256)
        state.value = SampleData.state()
    }

    override fun connect() { calls += "connect" }
    override fun disconnect() { calls += "disconnect" }
    override fun retryNow() { calls += "retry" }
    override fun refresh() { calls += "refresh" }
    override fun sendMessage(text: String) {
        calls += "send:$text"
        state.value = state.value.copy(outgoing = state.value.outgoing + OutgoingMessage("local-1", text, 0, OutgoingStatus.Failed, "Sin permiso"))
    }
    override fun retryMessage(clientMessageId: String) { calls += "retryMessage:$clientMessageId" }
    override fun discardMessage(clientMessageId: String) { calls += "discard:$clientMessageId" }
    override suspend fun newConversation(): ActionResult { calls += "newConversation"; return ActionResult(true, "Conversación nueva") }
    override suspend fun stopRequest(requestId: String): ActionResult { calls += "stop:$requestId"; return ActionResult(true, "Petición detenida") }
    override suspend fun resumeRequest(requestId: String): ActionResult { calls += "resume:$requestId"; return ActionResult(true, "Petición reanudada") }
    override fun forget() { calls += "forget"; state.value = CoworkUiState() }

    // Órbita: lo que la interfaz pide al ordenador (se registra; responde «ok» salvo que se diga lo contrario).
    val live = MutableSharedFlow<LiveEvent>(extraBufferCapacity = 16)
    override val liveEvents: Flow<LiveEvent> get() = live
    var nextResult = ActionResult(true, "Hecho")
    override fun sendMessage(text: String, attachmentIds: List<String>) {
        if (attachmentIds.isEmpty()) sendMessage(text) else calls += "send:$text:${attachmentIds.joinToString()}"
    }
    override suspend fun selectConversation(id: String): ActionResult { calls += "select:$id"; return nextResult }
    override suspend fun createProject(name: String): ActionResult { calls += "create:$name"; return nextResult }
    override suspend fun loadTrace(taskId: String): Result<List<TraceEntry>> {
        calls += "trace:$taskId"
        return Result.success(state.value.snapshot?.tasks?.firstOrNull { it.id == taskId }?.trace.orEmpty())
    }
    override suspend fun addMemory(kind: String, text: String): ActionResult { calls += "addMemory:$kind:$text"; return nextResult }
    override suspend fun setMemoryStatus(id: String, status: String): ActionResult { calls += "memoryStatus:$id:$status"; return nextResult }
    override suspend fun editMemory(id: String, text: String): ActionResult { calls += "editMemory:$id:$text"; return nextResult }
    override suspend fun deleteMemory(id: String): ActionResult { calls += "deleteMemory:$id"; return nextResult }
    override suspend fun setInstructions(text: String): ActionResult { calls += "instructions:$text"; return nextResult }
    override suspend fun listFiles(query: String?): Result<FilesResponse> {
        calls += "files:${query.orEmpty()}"
        return Result.success(FilesResponse(state.value.snapshot?.conversation?.attachments.orEmpty(), FolderListing("app", "/home/app", listOf(FolderFile("src/Main.kt", size = 120, kind = "code")))))
    }
    override suspend fun fetchArtifact(artifactId: String): Result<RawContent> {
        calls += "artifact:$artifactId"
        return Result.success(RawContent("# Hola\n\nContenido".toByteArray(), "text/markdown"))
    }
    override suspend fun fetchFile(source: String, path: String): Result<RawContent> { calls += "file:$source:$path"; return Result.success(RawContent("fun main() {}".toByteArray(), "text/plain")) }
    override suspend fun setAgentAccess(access: String): ActionResult { calls += "access:$access"; return nextResult }
    override suspend fun refreshUsage(): ActionResult { calls += "refreshUsage"; return nextResult }
    override suspend fun decidePlan(messageId: String, approve: Boolean): ActionResult { calls += "plan:$messageId:${if (approve) "approve" else "reject"}"; return nextResult }
    override suspend fun setPlanApproval(enabled: Boolean): ActionResult { calls += "planApproval:$enabled"; return nextResult }

    // «/model»: los modelos de Hermes.
    var hermes = com.aicowork.remote.data.model.HermesModelsInfo(
        installed = true,
        current = com.aicowork.remote.data.model.HermesCurrent("omnirouter", "auto/smart"),
        hermesDefault = com.aicowork.remote.data.model.HermesChoice("omnirouter", "auto/smart"),
        providers = listOf(
            com.aicowork.remote.data.model.HermesProvider("omnirouter", "omnirouter", listOf("auto/smart", "auto/best-coding", "claude/claude-opus-5")),
            com.aicowork.remote.data.model.HermesProvider("anthropic", "Anthropic", listOf("claude-opus-5-5", "claude-sonnet-5-5")),
        ),
        updatedAt = 1_791_686_531_740,
    )
    override suspend fun hermesModels(): Result<com.aicowork.remote.data.model.HermesModelsInfo> { calls += "hermesModels"; return Result.success(hermes) }
    override suspend fun setHermesModel(choice: com.aicowork.remote.data.model.HermesChoice?): Result<com.aicowork.remote.data.model.HermesModelsInfo> {
        calls += "hermesModel:${choice?.let { "${it.provider}/${it.model}" } ?: "reset"}"
        hermes = hermes.copy(current = choice?.let { com.aicowork.remote.data.model.HermesCurrent(it.provider, it.model, fromApp = true) } ?: com.aicowork.remote.data.model.HermesCurrent("omnirouter", "auto/smart"))
        return Result.success(hermes)
    }

    override suspend fun resetAgent(agentId: String): ActionResult { calls += "reset:$agentId"; return nextResult }
    override suspend fun setAgentThinking(agentId: String, enabled: Boolean): ActionResult { calls += "thinking:$agentId:$enabled"; return nextResult }

    // La versión de Órbita que ofrece el ordenador y su APK.
    var release: Result<com.aicowork.remote.data.model.AppRelease> = Result.failure(IllegalStateException("Sin versión"))
    var apk: ByteArray = ByteArray(0)
    override suspend fun appRelease(): Result<com.aicowork.remote.data.model.AppRelease> { calls += "appRelease"; return release }
    override suspend fun downloadAppRelease(target: java.io.File, onProgress: (Float) -> Unit): Result<Unit> {
        calls += "downloadApk"
        target.parentFile?.mkdirs()
        target.writeBytes(apk)
        onProgress(1f)
        return Result.success(Unit)
    }
}

object SampleData {
    fun snapshot() = Snapshot(
        conversation = Conversation(
            id = "c1",
            title = "Proyecto demo",
            activeRequestIds = listOf("r1"),
            artifacts = listOf(com.aicowork.remote.data.model.Artifact("a1", "c1", taskId = "t1", agentId = "dev", name = "informe.md", relPath = "informe.md", kind = "markdown", size = 1200)),
            attachments = listOf(com.aicowork.remote.data.model.Attachment("at1", "brief.pdf", "attachments/brief.pdf", "application/pdf", 1_200_000)),
            folder = com.aicowork.remote.data.model.ProjectFolder("app", "/home/app"),
            messages = listOf(
                ChatMessage("m1", requestId = "r1", author = Author("user"), text = "Haz la app Android", createdAt = 1),
                ChatMessage("m2", requestId = "r1", author = Author("agent", "coord"), text = "Lo reparto en dos tareas", taskIds = listOf("t1", "t2"), createdAt = 2),
                ChatMessage("m3", requestId = "r0", author = Author("user"), text = "Informe semanal", createdAt = 0),
            ),
        ),
        agents = listOf(
            Agent("coord", "Coordinador", role = "Planifica", provider = "claude", modelLabel = "Opus", color = "#7C5CFF", plannerOnly = true),
            Agent("dev", "Constructor", role = "Programa", provider = "codex", activity = "working", taskId = "t1", lastActivity = "Editando MainActivity.kt", lastActivityAt = 5, strengths = listOf("Kotlin")),
        ),
        tasks = listOf(
            TaskItem("t1", "r1", "Construir pantallas", "Compose", agentId = "dev", status = "running", progress = 0.4, lastActivity = "Editando MainActivity.kt",
                acceptance = "assembleDebug pasa", files = listOf("android/"), trace = listOf(TraceEntry("e1", kind = "tool", tool = "command", title = "Ejecutando: gradlew test", ok = true))),
            TaskItem("t2", "r1", "Escribir pruebas", agentId = "dev", status = "pending"),
            TaskItem("t3", "r0", "Publicar informe", agentId = "dev", status = "failed", error = "Sin acceso a la wiki"),
        ),
        memory = listOf(
            MemoryEntry("m1", "decision", "La app será nativa", "confirmed", by = "user", byName = "Tú"),
            MemoryEntry("m2", "pending", "Publicar en la wiki", "provisional", byName = "Constructor"),
            MemoryEntry("m0", "fact", "Antiguo dato", "superseded", supersededBy = "m1"),
        ),
        capabilities = com.aicowork.remote.data.model.Capabilities(attachments = true, projects = true, memoryEdit = true, files = true, upload = true, artifacts = true, traceEndpoint = true, agentAccess = true, usageRefresh = true),
        projects = listOf(com.aicowork.remote.data.model.ProjectSummary("c1", "Proyecto demo", running = true), com.aicowork.remote.data.model.ProjectSummary("c2", "Otro proyecto")),
        usage = Usage(
            totals = TokenUsage(120_000, 30_000),
            quotas = listOf(Quota("claude", "Claude", remainingPct = 18.0, period = "Ventana de 5 h", source = "real"), Quota("local", "Local", unlimited = true)),
        ),
    )

    fun state(connection: Connection = Connection.Online) = CoworkUiState(
        session = Session("https://100.64.1.2:8788/", "Mac de estudio", "Pixel", pinnedSha256 = "AB:CD:EF:01", pairedAt = 1),
        snapshot = snapshot(),
        connection = connection,
        syncedAt = 1,
    )
}
