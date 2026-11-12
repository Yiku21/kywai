package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t
import com.aicowork.remote.i18n.I18n

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Extension
import androidx.compose.material.icons.outlined.DataUsage
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Schedule
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
import com.aicowork.remote.data.QueuedFile
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
    Routines(t("Rutinas"), Icons.Outlined.Schedule),
    Tools(t("Herramientas"), Icons.Outlined.Build),
    Usage(t("Uso y coste"), Icons.Outlined.DataUsage),
    Settings(t("Ajustes"), Icons.Outlined.Settings),
    Team(t("Equipo"), Icons.Outlined.Groups),
    Mods(t("Mods"), Icons.Outlined.Extension),
}

/** Pestañas de Ajustes, como en el escritorio. */
enum class SettingsTab(val label: String) { General(t("General")), Agents(t("Agentes")), Connection(t("Conexión")), About(t("Acerca de")) }

enum class TaskFilter(val label: String) { Active(t("En curso")), Review(t("Por revisar")), Done(t("Hechas")) }
/** Filtro de Resultados por tipo de archivo (como en el escritorio). */
enum class ResultFilter(val label: String, val type: FileType?) {
    All(t("Todo"), null),
    Photos(t("Fotos"), FileType.Image),
    Videos(t("Vídeos"), FileType.Video),
    Audio(t("Audio"), FileType.Audio),
    Documents(t("Documentos"), FileType.Document),
    Code(t("Código"), FileType.Code),
    Other(t("Otros"), FileType.Other),
}
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

/**
 * Dictado en directo: el texto que había antes ([base]), las frases ya cerradas ([heard]) y la que estás diciendo
 * ([partial]). [level]: volumen de la voz de 0 a 1.
 */
data class DictationState(val target: VoiceTarget, val base: String, val heard: String = "", val partial: String = "", val level: Float = 0f) {
    val text: String get() = listOf(base.trimEnd(), heard, partial).filter { it.isNotBlank() }.joinToString(" ")
}

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
    /** Dictado en directo con el reconocimiento de voz del móvil (null en pruebas: solo notas de voz). */
    private val liveDictation: LiveDictation? = null,
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
    /** Texto con el que se abre «Buscar» (desde el Historial: «Buscar … dentro de los mensajes»). */
    var searchSeed by mutableStateOf("")
    /** «Historial»: todos los chats de todos los proyectos. */
    var historyOpen by mutableStateOf(false)
    /** Mensaje al que el chat tiene que bajar (lo pide el buscador al abrir un resultado). */
    var focusMessageId by mutableStateOf<String?>(null)
    /** Mensaje resaltado un momento después de llegar a él desde el buscador. */
    var flashMessageId by mutableStateOf<String?>(null)
    /** «Música»: radios y canciones sin anuncios. */
    var musicOpen by mutableStateOf(false)
    val music = MusicPlayer()
    /** Chats de cada proyecto ya pedidos al ordenador (se vuelven a pedir al abrir la barra o cambiar de chat). */
    val chats = mutableStateMapOf<String, List<ChatSummary>>()
    /** Proyecto desplegado en la barra lateral (por defecto, el abierto). */
    var expandedProject by mutableStateOf<String?>(null)
    var expanded by mutableStateOf(false)
    var selectedAgentId by mutableStateOf<String?>(null)
    var selectedTaskId by mutableStateOf<String?>(null)
    var taskFilter by mutableStateOf(TaskFilter.Active)
    /** Al abrir una tarea desde fuera de la lista: hay que llevar la lista hasta su detalle. */
    var revealTask by mutableStateOf(false)
    var resultFilter by mutableStateOf(ResultFilter.All)
    var filesTab by mutableStateOf(FilesTab.Attachments)
    var filesQuery by mutableStateOf("")
    var chatDraft by mutableStateOf(TextFieldValue(""))
    /** «Responder» tocado bajo la respuesta de un agente: lo siguiente que envíes va a ese agente sobre esa respuesta. */
    var replyTarget by mutableStateOf<com.aicowork.remote.data.model.ReplyRef?>(null)

    /** El mensaje tuyo que estás editando (mantener pulsado → Editar): al enviar, sustituye a ese y a lo de después. */
    var editTarget by mutableStateOf<com.aicowork.remote.data.model.ChatMessage?>(null)

    /** El mensaje en el que se eligió «Seleccionar texto» al mantenerlo pulsado (en los demás, mantener pulsado abre el menú). */
    var selectingMessageId by mutableStateOf<String?>(null)
    var newTaskDraft by mutableStateOf(TextFieldValue(""))
    var newTaskOpen by mutableStateOf(false)
    var viewer by mutableStateOf<ViewerTarget?>(null)
    /** Los archivos entre los que se pasa con ‹ › en el lector: los del mismo mensaje (o de la misma carpeta). */
    var viewerItems by mutableStateOf<List<ViewerTarget>>(emptyList())

    /** Abre en el lector uno de varios archivos, para poder pasar a los demás con ‹ ›. */
    fun openViewer(items: List<ViewerTarget>, index: Int) {
        if (items.isEmpty()) return
        viewerItems = items
        viewer = items[index.coerceIn(0, items.size - 1)]
    }
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
    /** «/video»: el selector de tipo, personaje, estilo y voz abierto. */
    var videoPickerOpen by mutableStateOf(false)
    /** Lo que ofrece el ordenador en el selector de «/video» (se pide al abrirlo). */
    var videoPicker by mutableStateOf<com.aicowork.remote.data.model.VideoPickerInfo?>(null)
    /** Muestras de los estilos ya pedidas (null: no se pudo). */
    val videoThumbs = mutableStateMapOf<String, androidx.compose.ui.graphics.ImageBitmap?>()
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
    /** Pestaña abierta de Ajustes (como la ventana de Ajustes del escritorio). */
    var settingsTab by mutableStateOf(SettingsTab.General)
    val teamList = LazyListState()

    /** Vistas previas de los resultados ya descargadas. */
    val previews = mutableStateMapOf<String, Preview>()

    /** Carpetas de Resultados abiertas o cerradas (sin anotar, solo la más reciente) y sus archivos de trabajo desplegados. */
    val resultFolders = mutableStateMapOf<String, Boolean>()
    val resultWork = mutableStateMapOf<String, Boolean>()

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
        if (target == section && target != Section.World) return
        section = target
        if (target == Section.World) expanded = false
    }

    fun close() {
        section = Section.World
        expanded = false
    }

    /** «Cambiar» de una rutina que propone Hermes: su orden «/rutina …» al cuadro de texto del chat, para retocarla. */
    fun editInChat(text: String) {
        chatDraft = TextFieldValue(text, androidx.compose.ui.text.TextRange(text.length))
        open(Section.Chat)
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

    /** El ordenador sabe bifurcar desde un mensaje y editar el tuyo en una rama nueva (servidores anteriores, no). */
    fun messageActionsSupported(): Boolean = snapshot()?.capabilities?.messageActions == true

    /** El ordenador sabe editar un mensaje tuyo en el mismo chat (servidores anteriores, no). */
    fun editInPlaceSupported(): Boolean = snapshot()?.capabilities?.editInPlace == true

    /** Mantener pulsado un mensaje → «Bifurcar desde aquí»: chat nuevo con todo hasta él; el original no cambia. */
    fun forkFromMessage(message: com.aicowork.remote.data.model.ChatMessage) {
        val conv = snapshot()?.conversation
        val projectId = conv?.id
        val chatId = conv?.chat?.id
        if (projectId == null || chatId == null || !messageActionsSupported()) {
            toast(t("Actualiza kywai en el ordenador para usar esto"), Toast.Tone.Error)
            return
        }
        run({ controller.forkChatAt(projectId, chatId, message.id, before = false) }) { r ->
            if (!r.ok) return@run
            loadChats(projectId)
            drawerOpen = false
            open(Section.Chat)
        }
    }

    /**
     * Mantener pulsado un mensaje tuyo → «Editar»: su texto, adjuntos y respuesta vuelven al cuadro; al enviarlo, en
     * este mismo chat salen ese mensaje y lo que vino después (como en Claude). ✕ en la barra lo deja como estaba.
     */
    fun startEdit(message: com.aicowork.remote.data.model.ChatMessage) {
        editTarget = message
        chatDraft = TextFieldValue(message.text, selection = androidx.compose.ui.text.TextRange(message.text.length))
        pendingAttachments = message.attachments.map { it.id }.toSet()
        replyTarget = message.replyTo
        feedback.select()
    }

    /** Flechas ‹ › bajo un mensaje tuyo editado. */
    fun switchVersion(message: com.aicowork.remote.data.model.ChatMessage, to: Int) {
        run({ controller.switchVersion(message.id, to) })
    }

    fun cancelEdit() {
        editTarget = null
        chatDraft = TextFieldValue("")
        pendingAttachments = emptySet()
        replyTarget = null
    }

    fun renameChat(projectId: String, chatId: String, title: String) {
        run({ controller.renameChat(projectId, chatId, title) }) { if (it.ok) { loadChats(projectId); loadPinned() } }
    }

    fun deleteChat(projectId: String, chatId: String) {
        run({ controller.deleteChat(projectId, chatId) }) { if (it.ok) { loadChats(projectId); loadPinned() } }
    }

    // ------------------------------------------------------------------ Menú de mantener pulsado (como el clic derecho del escritorio)

    /** Chats fijados de todos los proyectos (sección «Fijados» de la barra lateral). */
    var pinnedChats by mutableStateOf<List<ChatSummary>>(emptyList())

    /** El ordenador sabe fijar, bifurcar, mover y borrar el chat abierto (servidores anteriores, no). */
    fun chatActionsSupported(): Boolean = snapshot()?.capabilities?.chatActions == true

    /** El ordenador sabe renombrar, fijar y eliminar proyectos desde aquí. */
    fun projectActionsSupported(): Boolean = snapshot()?.capabilities?.projectActions == true

    /** El ordenador tiene el Historial (todos los chats, filtros de búsqueda y el mensaje exacto). */
    fun historySupported(): Boolean = snapshot()?.capabilities?.history == true

    fun openHistory() {
        drawerOpen = false
        searchOpen = false
        historyOpen = true
    }

    fun loadPinned() {
        if (!chatActionsSupported()) return
        viewModelScope.launch { controller.pinnedChats().onSuccess { pinnedChats = it } }
    }

    fun pinChat(projectId: String, chatId: String, pinned: Boolean) {
        run({ controller.pinChat(projectId, chatId, pinned) }) { if (it.ok) { loadChats(projectId); loadPinned() } }
    }

    /** Copia aparte del chat; se abre sola, salvo si el equipo está trabajando en ese proyecto (entonces queda en la lista). */
    fun forkChat(projectId: String, chatId: String) {
        val busy = snapshot()?.projects?.firstOrNull { it.id == projectId }?.running == true
        run({ controller.forkChat(projectId, chatId, open = !busy) }) { r ->
            if (r.ok) {
                loadChats(projectId)
                if (!busy) {
                    drawerOpen = false
                    open(Section.Chat)
                }
            }
        }
    }

    fun moveChat(projectId: String, chatId: String, toProjectId: String) {
        run({ controller.moveChat(projectId, chatId, toProjectId) }) {
            if (it.ok) {
                loadChats(projectId)
                loadChats(toProjectId)
                loadPinned()
            }
        }
    }

    /** «Nuevo chat en este proyecto»: lo abre (si no lo estaba) y empieza uno vacío. */
    fun newChatIn(projectId: String) {
        drawerOpen = false
        expandedProject = projectId
        run({
            if (snapshot()?.conversation?.id == projectId) controller.newChat()
            else controller.selectConversation(projectId).let { if (it.ok) controller.newChat() else it }
        }) { r ->
            if (r.ok) {
                open(Section.Chat)
                loadChats(projectId)
            }
        }
    }

    fun renameProject(projectId: String, name: String) {
        run({ controller.renameProject(projectId, name) }) { if (it.ok) loadPinned() }
    }

    fun pinProject(projectId: String, pinned: Boolean) {
        run({ controller.pinProject(projectId, pinned) })
    }

    /** El servidor sabe borrar archivos y adjuntar resultados al mensaje (mantener pulsado en Resultados o Archivos). */
    fun fileActionsSupported(): Boolean = snapshot()?.capabilities?.fileActions == true

    /** «Adjuntar al mensaje» en un resultado: va con tu próximo mensaje para que el equipo sepa de qué archivo hablas. */
    fun attachArtifact(artifactId: String) {
        pendingAttachments = pendingAttachments + (QueuedFile.ARTIFACT_ATTACHMENT + artifactId)
        feedback.select()
        toast(t("Irá con tu próximo mensaje"), Toast.Tone.Success)
    }

    /** Mantener pulsado → Eliminar (tras confirmarlo): borra el archivo del ordenador. */
    fun deleteFile(id: String, artifact: Boolean) {
        run({ controller.deleteFile(id, artifact) }) {
            if (it.ok) pendingAttachments = pendingAttachments - id - (QueuedFile.ARTIFACT_ATTACHMENT + id)
        }
    }

    fun deleteProject(projectId: String) {
        run({ controller.deleteProject(projectId) }) {
            if (it.ok) {
                chats.remove(projectId)
                if (expandedProject == projectId) expandedProject = null
                loadPinned()
            }
        }
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
        drawerOpen = false
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

    /** «Visto» en un recién terminado de Resultados: se cierra el aviso (sin esperar a otro botón). */
    fun inboxSeen(item: InboxItem) {
        viewModelScope.launch { controller.inboxAction(item.id, item.actions.firstOrNull { it.id == "dismiss" }?.id ?: item.actions.firstOrNull()?.id ?: "dismiss") }
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
        if (preferences.voices) voices?.speak("hermes", Voices.profile("hermes"), t("¡Hola! Así suena Hermes."))
    }

    private fun applyPreferences(p: Preferences) {
        preferences = p
        feedback.haptics = p.haptics
        feedback.sound = p.sound
        voices?.volume = p.voiceVolume
        // Las voces no dependen de «Sonidos»: cada una tiene su propio interruptor.
        if (!p.voices) voices?.stop()
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

    /** Quién escribió un mensaje encontrado: «Tú», «Aviso» o el nombre del agente. */
    fun authorName(by: String): String = when (by) {
        "user" -> t("Tú")
        "system" -> t("Aviso")
        else -> snapshot()?.agents?.firstOrNull { it.id == by }?.name ?: by
    }

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
                // Cada agente con su voz, y lo que dice se escribe a su ritmo; las voces tienen su propio interruptor.
                val p = preferences
                if (p.voices && voices != null) {
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

    // ------------------------------------------------------------------ Dictado en directo

    var dictation by mutableStateOf<DictationState?>(null)
        private set

    /** Si se puede dictar en directo con el reconocimiento de voz del móvil. */
    val canDictate: Boolean get() = liveDictation?.available == true

    /** Hay nota de voz (el ordenador pasa el audio a texto) para cuando el dictado del móvil no sirve. */
    fun canRecordNote(snapshotVoice: Boolean): Boolean = snapshotVoice && canRecord

    private fun draftOf(target: VoiceTarget) = when (target) {
        VoiceTarget.Chat -> chatDraft
        VoiceTarget.NewTask -> newTaskDraft
    }

    private fun setDraft(target: VoiceTarget, text: String) {
        val value = TextFieldValue(text, androidx.compose.ui.text.TextRange(text.length))
        when (target) {
            VoiceTarget.Chat -> chatDraft = value
            VoiceTarget.NewTask -> newTaskDraft = value
        }
    }

    /** Empieza a dictar en directo en [target] (requiere el permiso RECORD_AUDIO); [noteFallback] para los avisos. */
    fun startDictation(target: VoiceTarget, noteFallback: Boolean) {
        val engine = liveDictation ?: return
        if (dictation != null || voice is VoiceState.Recording || voice is VoiceState.Transcribing) return
        val started = DictationState(target, draftOf(target).text)
        val listener = object : LiveDictation.Listener {
            fun mine() = dictation?.takeIf { it.target == target }

            override fun onLevel(level: Float) {
                mine()?.let { dictation = it.copy(level = level) }
            }

            override fun onPartial(text: String) {
                val d = mine() ?: return
                dictation = d.copy(partial = text)
                setDraft(target, dictation!!.text)
            }

            override fun onFinal(text: String) {
                val d = mine() ?: return
                dictation = d.copy(heard = listOf(d.heard, text.trim()).filter { it.isNotBlank() }.joinToString(" "), partial = "")
                setDraft(target, dictation!!.text)
            }

            override fun onError(error: DictationError, heardNothing: Boolean) {
                if (mine() == null) return
                feedback.reject()
                toast(error.message(noteFallback), Toast.Tone.Error)
            }

            override fun onEnd() {
                if (mine() == null) return
                dictation = null
                feedback.select()
            }
        }
        dictation = started
        try {
            engine.start(I18n.locale.toLanguageTag(), listener)
        } catch (e: Exception) {
            dictation = null
            feedback.reject()
            toast(e.message ?: t("No se pudo dictar"), Toast.Tone.Error)
            return
        }
        feedback.confirm()
    }

    /** Deja de dictar: lo último que se oyó todavía se añade. */
    fun stopDictation() {
        if (dictation == null) return
        liveDictation?.stop()
    }

    /** Corta el dictado sin añadir nada más (al enviar o al escribir a mano mientras dictas). */
    fun cancelDictation() {
        if (dictation == null) return
        liveDictation?.cancel()
        dictation = null
    }

    /** El usuario escribe en la caja: si estaba dictando ahí, el dictado se corta para no pisarle el texto. */
    fun editDraft(target: VoiceTarget, value: TextFieldValue) {
        if (dictation?.target == target && value.text != draftOf(target).text) cancelDictation()
        when (target) {
            VoiceTarget.Chat -> chatDraft = value
            VoiceTarget.NewTask -> newTaskDraft = value
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
        cancelDictation()
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
        liveDictation?.release()
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
