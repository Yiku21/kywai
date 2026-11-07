package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.DataUsage
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.TextFieldValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aicowork.remote.data.ActionResult
import com.aicowork.remote.data.CoworkController
import com.aicowork.remote.data.LiveEvent
import com.aicowork.remote.data.model.ChatSummary
import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.InboxAction
import com.aicowork.remote.data.model.InboxItem
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.store.EffectsPreference
import com.aicowork.remote.data.store.MotionPreference
import com.aicowork.remote.data.store.Preferences
import com.aicowork.remote.data.store.PreferencesStore
import com.aicowork.remote.data.update.AppInstaller
import com.aicowork.remote.data.update.AppUpdater
import com.aicowork.remote.ui.space.EffectsLevel
import com.aicowork.remote.ui.space.WorldController
import com.aicowork.remote.ui.space.WorldEvent
import com.aicowork.remote.ui.space.WorldSettings
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Secciones de Órbita. El Equipo es aparte de la navegación (selector propio), pero también tiene panel. */
enum class Section(val label: String, val icon: ImageVector) {
    World(t("Mundo"), Icons.Outlined.Home),
    Chat(t("Chat"), Icons.AutoMirrored.Outlined.Chat),
    Tasks(t("Tareas"), Icons.Outlined.TaskAlt),
    Files(t("Archivos"), Icons.Outlined.Description),
    Results(t("Resultados"), Icons.Outlined.Inventory2),
    Memory(t("Memoria"), Icons.Outlined.Psychology),
    Tools(t("Herramientas"), Icons.Outlined.Build),
    Usage(t("Consumo"), Icons.Outlined.DataUsage),
    Settings(t("Ajustes"), Icons.Outlined.Settings),
    Team(t("Equipo"), Icons.Outlined.Groups),
}

enum class TaskFilter(val label: String) { Active(t("En curso")), Review(t("Por revisar")), Done(t("Hechas")) }
enum class ResultFilter(val label: String) { All(t("Todos")), Documents(t("Documentos")), Code(t("Código")) }
enum class FilesTab(val label: String) { Attachments(t("Adjuntos")), Project(t("Proyecto")) }

/** Lo que se abre a pantalla completa para leerlo. */
sealed interface ViewerTarget {
    val title: String
    data class Result(val artifactId: String, override val title: String, val kind: String) : ViewerTarget
    data class File(val source: String, val path: String, override val title: String, val kind: String) : ViewerTarget
}

/** Aviso breve sobre el mundo (con una acción opcional). */
data class Toast(val id: Long, val text: String, val tone: Tone = Tone.Info, val action: String? = null, val onAction: (() -> Unit)? = null) {
    enum class Tone { Info, Success, Error }
}

/** Dónde va el texto de una nota de voz. */
enum class VoiceTarget { Chat, NewTask }

/** Nota de voz: grabando, pasando a texto en el ordenador o fallida (se puede reintentar sin volver a grabar). */
sealed interface VoiceState {
    data object Idle : VoiceState
    data class Recording(val target: VoiceTarget) : VoiceState
    data class Transcribing(val target: VoiceTarget, val send: Boolean, val since: Long) : VoiceState
    data class Failed(val target: VoiceTarget, val send: Boolean, val message: String) : VoiceState
}

/**
 * Por qué Hermes necesita al usuario (lo muestra el mundo y la barra superior). [taskId] es la tarea de la que trata
 * (en pausa o que falló): tocar el aviso lleva a ella. [label] es la etiqueta corta del agente en el mundo.
 */
data class Attention(val agentId: String, val reason: String, val taskId: String? = null, val label: String? = null)

/**
 * Estado de la interfaz que sobrevive a plegar/desplegar y a cambiar de panel: sección, panel ampliado, agente y
 * tarea elegidos, borradores, filtros y posiciones de lectura. También convierte la actividad real del escritorio en
 * animaciones del mundo, avisos y sonidos.
 */
class OrbitaModel(
    val controller: CoworkController,
    private val prefsStore: PreferencesStore,
    val world: WorldController,
    val feedback: Feedback,
    private val sounds: UiSounds?,
    private val systemReducedMotion: () -> Boolean,
    /** Carpeta para las notas de voz mientras se graban (null = sin micrófono, en pruebas). */
    private val voiceDir: java.io.File? = null,
    /** Instalar versiones nuevas de Órbita desde el ordenador (null en pruebas: sin la sección de Ajustes). */
    installer: AppInstaller? = null,
    /** Las voces de los agentes cuando escriben en el chat (null en pruebas: en silencio). */
    private val voices: AgentVoices? = null,
    /** Avisa de si la bandeja «Te necesita» está a la vista (mientras lo está, no salen notificaciones del sistema). */
    private val onInboxVisible: (Boolean) -> Unit = {},
) : ViewModel() {

    /** Ajustes → «Buscar actualizaciones». */
    val updater: AppUpdater? = installer?.let { AppUpdater(controller, it, viewModelScope) }

    var section by mutableStateOf(Section.World)
        private set
    /** Desplegado: la barra lateral a la vista (se pliega con su botón). */
    var sidebarOpen by mutableStateOf(true)
    /** Plegado: la barra lateral abierta como cajón por encima de todo. */
    var drawerOpen by mutableStateOf(false)
    /** «Buscar» de la barra lateral. */
    var searchOpen by mutableStateOf(false)
    /** Chats de cada proyecto ya pedidos al ordenador (se vuelven a pedir al abrir la barra o cambiar de chat). */
    val chats = mutableStateMapOf<String, List<ChatSummary>>()
    /** Proyecto desplegado en la barra lateral (por defecto, el abierto). */
    var expandedProject by mutableStateOf<String?>(null)
    var expanded by mutableStateOf(false)
    var moreOpen by mutableStateOf(false)
    var projectMenu by mutableStateOf(false)
    var selectedAgentId by mutableStateOf<String?>(null)
    var selectedTaskId by mutableStateOf<String?>(null)
    var taskFilter by mutableStateOf(TaskFilter.Active)
    /** Al abrir una tarea desde fuera de la lista: hay que llevar la lista hasta su detalle. */
    var revealTask by mutableStateOf(false)
    var resultFilter by mutableStateOf(ResultFilter.All)
    var filesTab by mutableStateOf(FilesTab.Attachments)
    var filesQuery by mutableStateOf("")
    var chatDraft by mutableStateOf(TextFieldValue(""))
    var newTaskDraft by mutableStateOf(TextFieldValue(""))
    var newTaskOpen by mutableStateOf(false)
    var viewer by mutableStateOf<ViewerTarget?>(null)
    var traceTaskId by mutableStateOf<String?>(null)
    private val traceCache = HashMap<String, Pair<Long, List<com.aicowork.remote.data.model.TraceEntry>>>()

    /** El registro completo de una tarea, pedido una sola vez aunque se desplieguen varias herramientas a la vez. */
    suspend fun traceOf(taskId: String): Result<List<com.aicowork.remote.data.model.TraceEntry>> {
        val now = System.currentTimeMillis()
        traceCache[taskId]?.let { (at, list) -> if (now - at < 1500) return Result.success(list) }
        return controller.loadTrace(taskId).onSuccess { traceCache[taskId] = now to it }
    }
    /** «/model»: la lista de modelos de Hermes abierta. */
    var hermesModelOpen by mutableStateOf(false)
    /** La bandeja «Te necesita» abierta. */
    var inboxOpen by mutableStateOf(false)
        private set
    /** Aviso de la bandeja cuyo botón se está enviando al ordenador ("id|acción"). */
    var inboxBusy by mutableStateOf<String?>(null)
        private set
    /** Lo que se está escribiendo al ritmo de la voz de su agente (clave: [revealKey]). */
    val reveals = androidx.compose.runtime.mutableStateMapOf<String, Reveal>()

    /** Clave de lo que se escribe: el texto de un mensaje o una de las frases que cuenta en su tarea. */
    fun revealKey(messageId: String, note: String? = null): String = if (note == null) messageId else "$messageId|nota|$note"
    var worldAvailable by mutableStateOf(true)
    /** Adjuntos subidos desde el móvil que irán con el próximo mensaje (así el equipo los tiene como contexto). */
    var pendingAttachments by mutableStateOf<Set<String>>(emptySet())
    /** Mensaje enviado desde «Nueva tarea» que aún espera el plan de Hermes. */
    var awaitingPlanSince by mutableStateOf<Long?>(null)

    // Posiciones de lectura de cada panel (se conservan al plegar, desplegar o cambiar de panel).
    val chatList = LazyListState()
    /** El chat ya se abrió una vez (y se colocó en lo último). */
    var chatPositioned = false
    /** Cada envío desde el móvil: el chat baja a lo último. */
    var chatSends by mutableStateOf(0)
    val tasksList = LazyListState()
    val filesList = LazyListState()
    val resultsList = LazyListState()
    val memoryList = LazyListState()
    val toolsList = LazyListState()
    val usageList = LazyListState()
    val settingsList = LazyListState()
    val teamList = LazyListState()
    val moreGrid = LazyGridState()

    /** Vistas previas de los resultados ya descargadas. */
    val previews = mutableStateMapOf<String, Preview>()

    val toasts = mutableStateListOf<Toast>()
    private var toastSeq = 0L

    var preferences by mutableStateOf(prefsStore.preferences.value)
        private set

    init {
        viewModelScope.launch { prefsStore.preferences.collect { applyPreferences(it) } }
        viewModelScope.launch { controller.liveEvents.collect { onLive(it) } }
    }

    // ------------------------------------------------------------------ Navegación

    fun open(target: Section) {
        moreOpen = false
        if (target == section && target != Section.World) return
        section = target
        if (target == Section.World) expanded = false
    }

    fun close() {
        section = Section.World
        expanded = false
    }

    /**
     * Panel ampliado. Desplegado, tapa el mundo hasta cerrarlo; plegado (pantalla exterior), es pantalla completa y
     * se recuerda (también tras cerrar la app): ahí apenas hay sitio para el chat.
     */
    fun isExpanded(compact: Boolean): Boolean = if (compact) preferences.foldedFullPanels else expanded

    fun toggleExpanded(compact: Boolean) {
        if (compact) updatePreferences { it.copy(foldedFullPanels = !it.foldedFullPanels) } else expanded = !expanded
    }

    /** Elige un agente (reacciona en el mundo) o deja de elegirlo (la cámara vuelve a la vista general). */
    fun selectAgent(id: String?, poke: Boolean = true) {
        val previous = selectedAgentId
        selectedAgentId = id
        if (id != null && poke) world.post(WorldEvent.Poke(id))
        if (id == null && previous != null) world.overview()
    }

    /**
     * Abre la tarea en su pestaña (una en pausa está en «Por revisar») y pide llevar la lista hasta su detalle, que va
     * al final.
     */
    fun openTask(id: String) {
        selectedTaskId = id
        controller.state.value.snapshot?.let { s ->
            s.tasks.firstOrNull { it.id == id }?.let { taskFilter = taskFilterOf(it, s.conversation.activeRequestIds.toSet()) }
        }
        revealTask = true
        open(Section.Tasks)
    }

    // ------------------------------------------------------------------ Chats (barra lateral)

    fun chatsSupported(): Boolean = snapshot()?.capabilities?.chats == true

    fun loadChats(projectId: String) {
        if (!chatsSupported()) return
        viewModelScope.launch { controller.listChats(projectId).onSuccess { chats[projectId] = it } }
    }

    /** Chat nuevo en el proyecto abierto; sin chats en el ordenador (versión anterior), limpia la conversación. */
    fun newChat() {
        drawerOpen = false
        run({ if (chatsSupported()) controller.newChat() else controller.newConversation() }) { r ->
            if (r.ok) {
                open(Section.Chat)
                snapshot()?.conversation?.id?.let(::loadChats)
            }
        }
    }

    fun openChat(projectId: String, chatId: String) {
        val s = snapshot()
        if (s?.conversation?.id == projectId && s.conversation.chat?.id == chatId) {
            drawerOpen = false
            open(Section.Chat)
            return
        }
        run({ controller.openChat(projectId, chatId) }) { r ->
            if (r.ok) {
                drawerOpen = false
                open(Section.Chat)
                loadChats(projectId)
            }
        }
    }

    fun renameChat(projectId: String, chatId: String, title: String) {
        run({ controller.renameChat(projectId, chatId, title) }) { if (it.ok) loadChats(projectId) }
    }

    fun deleteChat(projectId: String, chatId: String) {
        run({ controller.deleteChat(projectId, chatId) }) { if (it.ok) loadChats(projectId) }
    }

    /** Abre un proyecto desde la barra lateral (su chat abierto). */
    fun openProject(projectId: String) {
        expandedProject = projectId
        loadChats(projectId)
        if (snapshot()?.conversation?.id == projectId) return
        run({ controller.selectConversation(projectId) })
    }

    // ------------------------------------------------------------------ Bandeja «Te necesita»

    fun openInbox() {
        moreOpen = false
        drawerOpen = false
        projectMenu = false
        inboxOpen = true
        onInboxVisible(true)
        controller.refreshInbox()
    }

    fun closeInbox() {
        if (!inboxOpen) return
        inboxOpen = false
        onInboxVisible(false)
    }

    /** ¿Existe la conversación del aviso? (la abierta o una de la lista de proyectos). */
    fun inboxTargetExists(item: InboxItem): Boolean {
        val projectId = item.projectId ?: return false
        val s = snapshot() ?: return false
        return s.conversation.id == projectId || s.projects.any { it.id == projectId }
    }

    /** Tocar el título de un aviso: abre su conversación (y su tarea, si la tiene) y cierra la bandeja. */
    fun openInboxItem(item: InboxItem) {
        val projectId = item.projectId ?: return
        if (!inboxTargetExists(item)) {
            toast(t("Esa conversación ya no está en el ordenador"), Toast.Tone.Error)
            return
        }
        fun show() {
            closeInbox()
            val taskId = item.taskId
            if (taskId != null && snapshot()?.tasks?.any { it.id == taskId } == true) openTask(taskId) else open(Section.Chat)
        }
        if (snapshot()?.conversation?.id == projectId) {
            show()
            return
        }
        viewModelScope.launch {
            val r = controller.selectConversation(projectId)
            if (r.ok) {
                feedback.confirm()
                show()
            } else {
                feedback.reject()
                toast(r.message, Toast.Tone.Error)
            }
        }
    }

    /** Envía al ordenador un botón del aviso (los que llevan url se abren en el móvil: ver InboxSheet). */
    fun inboxAction(item: InboxItem, action: InboxAction) {
        if (inboxBusy != null) return
        inboxBusy = "${item.id}|${action.id}"
        run({ controller.inboxAction(item.id, action.id) }) { inboxBusy = null }
    }

    /** Tocar el aviso de Hermes: lleva a la tarea de la que trata (en pausa o que falló); si es una pregunta o un plan, al chat. */
    fun openAttention(attention: Attention) {
        val taskId = attention.taskId
        if (taskId != null) openTask(taskId) else open(Section.Chat)
    }

    // ------------------------------------------------------------------ Preferencias

    fun updatePreferences(transform: (Preferences) -> Preferences) = prefsStore.update(transform)

    /** Muestra de las voces (al activarlas o cambiar su volumen): Hermes saluda. */
    fun previewVoice() {
        if (preferences.sound && preferences.voices) voices?.speak("hermes", Voices.profile("hermes"), t("¡Hola! Así suena Hermes."))
    }

    private fun applyPreferences(p: Preferences) {
        preferences = p
        feedback.haptics = p.haptics
        feedback.sound = p.sound
        voices?.volume = p.voiceVolume
        if (!p.sound || !p.voices) voices?.stop()
        world.settings = WorldSettings(
            ambient = p.ambient,
            effects = when (p.effects) {
                EffectsPreference.Soft -> EffectsLevel.Soft
                EffectsPreference.Normal -> EffectsLevel.Normal
                EffectsPreference.Full -> EffectsLevel.Full
            },
            reducedMotion = reducedMotion(p),
        )
    }

    fun reducedMotion(p: Preferences = preferences): Boolean = when (p.motion) {
        MotionPreference.System -> systemReducedMotion()
        MotionPreference.Reduced -> true
        MotionPreference.Full -> false
    }

    /** El sistema puede cambiar «Quitar animaciones» con la app abierta: se vuelve a leer al volver. */
    fun refreshSystemMotion() = applyPreferences(preferences)

    // ------------------------------------------------------------------ Avisos

    fun toast(text: String, tone: Toast.Tone = Toast.Tone.Info, action: String? = null, onAction: (() -> Unit)? = null) {
        val t = Toast(++toastSeq, text, tone, action, onAction)
        toasts.add(t)
        while (toasts.size > 2) toasts.removeAt(0)
        viewModelScope.launch {
            delay(if (action != null) 6_500 else 4_000)
            toasts.remove(t)
        }
    }

    fun dismissToast(t: Toast) {
        toasts.remove(t)
    }

    /** Ejecuta una acción del servidor: vibración y aviso según lo que respondió (nunca antes). */
    fun run(job: suspend () -> ActionResult, onDone: (ActionResult) -> Unit = {}): Job = viewModelScope.launch {
        val result = job()
        if (result.ok) feedback.confirm() else feedback.reject()
        toast(result.message, if (result.ok) Toast.Tone.Success else Toast.Tone.Error)
        onDone(result)
    }

    // ------------------------------------------------------------------ Actividad real

    private fun snapshot(): Snapshot? = controller.state.value.snapshot

    private fun agentName(id: String?): String = snapshot()?.agents?.firstOrNull { it.id == id }?.name ?: when (id) {
        "core" -> t("el proyecto")
        "user" -> t("tú")
        else -> id ?: "?"
    }

    private fun onLive(event: LiveEvent) {
        when (event) {
            is LiveEvent.Transfer -> {
                val t = event.info
                world.post(WorldEvent.Transfer(t.id, t.fromId, t.toId, t.label, t.payload.title.ifBlank { null }))
                feedback.play(Sfx.Transfer)
            }
            is LiveEvent.TaskStarted -> {
                awaitingPlanSince = null
                feedback.play(Sfx.TaskStart)
            }
            is LiveEvent.TaskCompleted -> {
                world.post(WorldEvent.TaskCompleted(event.taskId, event.agentId))
                feedback.play(Sfx.TaskComplete)
                toast(t("{v1} terminó «{v2}»", "v1" to (agentName(event.agentId)), "v2" to (event.title ?: t("una tarea"))), Toast.Tone.Success, t("Ver")) { openTask(event.taskId) }
            }
            is LiveEvent.TaskFailed -> {
                world.post(WorldEvent.TaskFailed(event.task.id, event.task.agentId))
                feedback.play(Sfx.Error)
                toast(t("Falló «{title}»: {v1}", "title" to event.task.title, "v1" to (event.task.error ?: t("sin detalle"))), Toast.Tone.Error, t("Revisar")) { openTask(event.task.id) }
            }
            is LiveEvent.ArtifactCreated -> {
                feedback.play(Sfx.FileCreated)
                val a = event.artifact
                toast(t("Nuevo resultado: {name}", "name" to a.name), Toast.Tone.Info, t("Abrir")) { viewer = ViewerTarget.Result(a.id, a.name, a.kind) }
            }
            is LiveEvent.AgentSpoke -> {
                // Cada agente con su voz, y lo que dice se escribe a su ritmo; «Sonidos» apaga también las voces.
                val p = preferences
                if (p.sound && p.voices && voices != null) {
                    val provider = snapshot()?.agents?.firstOrNull { it.id == event.agentId }?.provider ?: event.agentId.substringBefore("-becario-")
                    val profile = Voices.profile(provider, becario = "-becario-" in event.agentId)
                    for (s in event.said) {
                        val start = voices.speak(event.agentId, profile, s.text, event.error) ?: continue
                        if (s.reveal) reveals[revealKey(event.messageId, s.text.takeIf { s.note })] = Reveal(s.text, start, Voices.revealTimes(s.text, profile.rate))
                    }
                }
            }
            is LiveEvent.AgentMessage -> {
                awaitingPlanSince = null
                val m = event.message
                val fromCoordinator = snapshot()?.let { coordinator(it) }?.id == m.author.agentId
                // Avisan Hermes y los errores; lo que entrega cada agente ya lo cuenta «terminó …».
                if (m.tone == "error" || fromCoordinator || !m.author.isAgent) {
                    feedback.play(if (m.tone == "error") Sfx.Error else Sfx.Message)
                    if (section != Section.Chat && m.proposal?.isPending == true) {
                        toast(t("{v1} te propone un plan: revísalo antes de empezar", "v1" to (m.author.agentId?.let { agentName(it) } ?: "Hermes")), Toast.Tone.Info, t("Ver el plan")) { open(Section.Chat) }
                    } else if (section != Section.Chat) {
                        val who = m.author.agentId?.let { agentName(it) } ?: "kywai"
                        val line = inline(m.text.lineSequence().firstOrNull { it.isNotBlank() }.orEmpty().trimStart('#', ' ')).text
                        toast("$who: ${line.take(90)}", if (m.tone == "error") Toast.Tone.Error else Toast.Tone.Info, t("Abrir chat")) { open(Section.Chat) }
                    }
                }
            }
            is LiveEvent.RequestFinished -> Unit
        }
    }

    // ------------------------------------------------------------------ Notas de voz

    var voice by mutableStateOf<VoiceState>(VoiceState.Idle)
        private set
    /** La grabación en curso (sigue aunque se pliegue o despliegue el móvil). */
    var recorder: VoiceRecorder? = null
        private set
    private var voiceFile: java.io.File? = null

    val canRecord: Boolean get() = voiceDir != null

    fun startVoice(target: VoiceTarget) {
        val dir = voiceDir ?: return
        if (voice is VoiceState.Recording || voice is VoiceState.Transcribing) return
        voiceFile?.delete()
        val file = java.io.File(dir, "nota-${System.currentTimeMillis()}.wav")
        val rec = VoiceRecorder(file)
        try {
            rec.start(onLimit = { viewModelScope.launch { finishVoice(send = false) } })
        } catch (e: Exception) {
            feedback.reject()
            toast(e.message ?: t("No se pudo usar el micrófono"), Toast.Tone.Error)
            return
        }
        recorder = rec
        voiceFile = file
        voice = VoiceState.Recording(target)
        feedback.confirm()
    }

    fun cancelVoice() {
        recorder?.cancel()
        recorder = null
        voiceFile?.delete()
        voiceFile = null
        voice = VoiceState.Idle
        feedback.tap()
    }

    /** Termina la grabación y la pasa a texto en el ordenador; [send]: enviarla en cuanto llegue el texto. */
    fun finishVoice(send: Boolean) {
        val state = voice as? VoiceState.Recording ?: return
        val rec = recorder ?: return
        recorder = null
        feedback.select()
        viewModelScope.launch {
            val file = try {
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { rec.stop() }
            } catch (e: Exception) {
                voiceFile?.delete()
                voiceFile = null
                voice = VoiceState.Idle
                feedback.reject()
                toast(e.message ?: t("No se grabó nada"), Toast.Tone.Error)
                return@launch
            }
            voiceFile = file
            transcribe(state.target, send)
        }
    }

    fun retryVoice() {
        val failed = voice as? VoiceState.Failed ?: return
        transcribe(failed.target, failed.send)
    }

    fun discardVoice() {
        voiceFile?.delete()
        voiceFile = null
        voice = VoiceState.Idle
    }

    private fun transcribe(target: VoiceTarget, send: Boolean) {
        val file = voiceFile ?: return
        voice = VoiceState.Transcribing(target, send, System.currentTimeMillis())
        viewModelScope.launch {
            controller.transcribe(file).fold(
                { said ->
                    file.delete()
                    voiceFile = null
                    voice = VoiceState.Idle
                    if (said.isBlank()) {
                        feedback.reject()
                        toast(t("No se entendió nada en la nota de voz"), Toast.Tone.Error)
                        return@fold
                    }
                    when (target) {
                        VoiceTarget.Chat -> {
                            val text = listOf(chatDraft.text.trimEnd(), said).filter { it.isNotBlank() }.joinToString(" ")
                            if (send) {
                                feedback.confirm()
                                controller.sendMessage(text, pendingAttachments.toList())
                                pendingAttachments = emptySet()
                                chatDraft = TextFieldValue("")
                                awaitingPlanSince = System.currentTimeMillis()
                                chatSends++
                            } else {
                                chatDraft = TextFieldValue(text, androidx.compose.ui.text.TextRange(text.length))
                                feedback.select()
                            }
                        }
                        VoiceTarget.NewTask -> {
                            val text = listOf(newTaskDraft.text.trimEnd(), said).filter { it.isNotBlank() }.joinToString(" ")
                            newTaskDraft = TextFieldValue(text, androidx.compose.ui.text.TextRange(text.length))
                            feedback.select()
                        }
                    }
                },
                { e ->
                    feedback.reject()
                    voice = VoiceState.Failed(target, send, e.message ?: t("No se pudo pasar a texto"))
                },
            )
        }
    }

    override fun onCleared() {
        recorder?.cancel()
        voiceFile?.delete()
        sounds?.release()
        voices?.release()
    }

    companion object {
        private val MODEL_COMMAND = Regex("^/(model|models|modelo|modelos)$", RegexOption.IGNORE_CASE)

        /** «/model» (y sus variantes) no es un mensaje para el equipo: abre la lista de modelos de Hermes. */
        fun isModelCommand(text: String): Boolean = MODEL_COMMAND.matches(text.trim())

        /** Hermes (o quien coordina): el que reparte el trabajo y recibe los resultados. */
        fun coordinator(snapshot: Snapshot): Agent? =
            snapshot.agents.firstOrNull { it.provider == "hermes" } ?: snapshot.agents.firstOrNull { it.plannerOnly }

        /**
         * Cuándo te necesita Hermes: una pregunta suya sin responder, una petición en pausa que se puede reanudar o
         * una tarea que falló en la última petición.
         */
        fun attentionOf(snapshot: Snapshot): Attention? {
            val hermes = coordinator(snapshot) ?: return null
            val active = snapshot.conversation.activeRequestIds.toSet()
            val messages = snapshot.conversation.messages
            // Un plan que espera tu visto bueno: nada empieza hasta que respondas.
            if (messages.any { it.proposal?.isPending == true }) return Attention(hermes.id, t("Hermes espera tu visto bueno al plan"))
            val lastUser = messages.indexOfLast { it.author.isUser }
            val question = messages.withIndex().lastOrNull { (i, m) ->
                i > lastUser && m.author.agentId == hermes.id && m.text.trimEnd().endsWith("?")
            }
            if (question != null && active.isEmpty()) return Attention(hermes.id, t("Hermes te ha hecho una pregunta"))
            // Dice cuál es (la más reciente) y tocarlo lleva a ella, para reanudarla o quitarla.
            val paused = snapshot.tasks.filter { it.isPaused && it.requestId !in active }
            paused.maxByOrNull { it.startedAt ?: it.createdAt ?: 0 }?.let { task ->
                val reason = if (paused.size == 1) t("En pausa: «{v1}»", "v1" to task.title.ifBlank { t("una tarea") }) else t("{size} tareas en pausa: revísalas", "size" to paused.size)
                return Attention(hermes.id, reason, task.id, t("Trabajo en pausa"))
            }
            val lastRequest = snapshot.tasks.maxByOrNull { it.createdAt ?: 0 }?.requestId
            val failed = snapshot.tasks.firstOrNull { it.status == "failed" && it.requestId == lastRequest && it.requestId !in active }
            if (failed != null) return Attention(hermes.id, t("Una tarea falló: revísala"), failed.id, t("Una tarea falló"))
            return null
        }
    }
}
