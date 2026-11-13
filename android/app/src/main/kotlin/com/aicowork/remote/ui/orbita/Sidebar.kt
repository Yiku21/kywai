package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.ui.graphics.graphicsLayer
import com.aicowork.remote.data.model.ProjectSummary
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.DriveFileRenameOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.ChatSummary
import com.aicowork.remote.data.store.ProjectSort
import com.aicowork.remote.data.store.ProjectStatus
import com.aicowork.remote.ui.components.Format
import kotlinx.coroutines.launch

/** Ancho de la barra lateral desplegada. */
val SidebarWidth: Dp = 272.dp

/** Lo que va en «Más» (lo que se usa menos). */
private val SidebarMore = listOf(Section.Files, Section.Memory, Section.Routines, Section.Tools, Section.Usage, Section.Team, Section.Mods)

/** Lo de «Más» que tiene sentido con este ordenador (los paneles de mods, solo si los admite). */
private fun moreSections(state: CoworkUiState): List<Section> =
    SidebarMore.filter { it != Section.Mods || state.snapshot?.capabilities?.modPanels == true }

/**
 * Barra lateral como la del escritorio, de cristal y flotando sobre el mundo: chat nuevo, buscar, lo que te necesita,
 * tareas, resultados, cada proyecto con sus chats y, abajo, a qué ordenador estás conectado y los Ajustes.
 * Todos los iconos son del mismo juego (de línea) y del mismo tono; el color queda para los avisos.
 * [onCollapse]: plegarla (desplegado) o cerrar el cajón (plegado).
 */
@Composable
fun Sidebar(model: OrbitaModel, state: CoworkUiState, onCollapse: () -> Unit, modifier: Modifier = Modifier, solid: Boolean = false) {
    val snapshot = state.snapshot
    val current = snapshot?.conversation?.id
    var moreOpen by remember { mutableStateOf(false) }
    val expanded = model.expandedProject ?: current
    // Al abrir la barra (o cambiar de chat) se piden los chats del proyecto desplegado.
    LaunchedEffect(expanded, snapshot?.conversation?.chat?.id, snapshot?.capabilities?.chats) {
        expanded?.let(model::loadChats)
    }
    LaunchedEffect(snapshot?.conversation?.chat?.id, snapshot?.capabilities?.chatActions) { model.loadPinned() }
    fun go(section: Section) {
        model.drawerOpen = false
        model.open(section)
    }

    Column(
        modifier
            .width(SidebarWidth)
            .fillMaxHeight()
            // Como cajón, cristal más tupido: lo de detrás se intuye un poco, sin llegar a leerse.
            .glass(radius = 28.dp, tint = if (solid) Orbita.GlassSolid else null)
            .padding(horizontal = 10.dp, vertical = 12.dp)
            .testTag("sidebar"),
    ) {
        Row(Modifier.fillMaxWidth().padding(start = 8.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            // El logo abre y pliega la barra (antes había un botón aparte): da una vuelta al tocarlo.
            SpinningLogo(28.dp, t("Abrir o plegar la barra lateral"), box = 44.dp, onClick = onCollapse, modifier = Modifier.testTag("sidebar-collapse"))
            Spacer(Modifier.width(6.dp))
            Text("kywai", color = Orbita.Text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        }

        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            SidebarItem(Icons.Outlined.EditNote, t("Nuevo chat"), tag = "side-new-chat") { model.newChat() }
            if (snapshot?.capabilities?.search == true) {
                SidebarItem(Icons.Outlined.Search, t("Buscar"), tag = "side-search") {
                    model.drawerOpen = false
                    model.searchOpen = true
                }
            }
            if (model.historySupported()) {
                SidebarItem(Icons.Outlined.History, t("Historial"), tag = "side-history") { model.openHistory() }
            }
            if (inboxSupported(state)) {
                SidebarItem(Icons.Outlined.Notifications, t("Te necesita"), badge = state.inbox.count { it.needsYou }, warn = true, selected = model.inboxOpen, tag = "side-inbox") { model.openInbox() }
            }
            val active = snapshot?.tasks?.count { it.isActive } ?: 0
            SidebarItem(Section.Chat.icon, t("Chat"), selected = model.section == Section.Chat, tag = "nav-Chat") { go(Section.Chat) }
            SidebarItem(Section.Tasks.icon, t("Tareas en marcha"), badge = active, selected = model.section == Section.Tasks, tag = "nav-Tasks") { go(Section.Tasks) }
            SidebarItem(Section.Results.icon, t("Resultados"), badge = state.inbox.count { !it.needsYou }, selected = model.section == Section.Results, tag = "nav-Results") { go(Section.Results) }
            if (snapshot?.capabilities?.music == true) {
                SidebarItem(Icons.Outlined.MusicNote, t("Música"), selected = model.musicOpen, tag = "side-music") {
                    model.drawerOpen = false
                    model.musicOpen = true
                }
            }
            SidebarItem(Icons.Outlined.MoreHoriz, t("Más"), trailing = if (moreOpen) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, selected = model.section in SidebarMore && !moreOpen, tag = "side-more") { moreOpen = !moreOpen }
            AnimatedVisibility(moreOpen, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                Column(Modifier.padding(start = 14.dp)) {
                    val memory = snapshot?.memory?.count { it.status == "provisional" } ?: 0
                    moreSections(state).forEach { s ->
                        SidebarItem(s.icon, s.label, badge = if (s == Section.Memory) memory else 0, selected = model.section == s, tag = "nav-${s.name}") { go(s) }
                    }
                }
            }

            PinnedSection(model, state)
            val prefs = model.preferences
            // Proyectos con algo terminado sin ver (lo que sale como nuevo en Resultados).
            val unseen = state.inbox.filter { !it.needsYou }.mapNotNull { it.projectId }.toSet()
            val shownProjects = filterProjects(sortProjects(snapshot?.projects.orEmpty(), prefs.projectSort), prefs.projectStatus, unseen)
            var moreOpen by remember { mutableStateOf(setOf<String>()) }
            ProjectsHeader(model, state, anyOpen = !expanded.isNullOrEmpty())
            shownProjects.forEach { p ->
                val open = expanded == p.id
                ProjectRow(model, p, open = open, current = p.id == current) {
                    if (open && p.id == current) model.expandedProject = "" else model.openProject(p.id)
                }
                AnimatedVisibility(open && model.chatsSupported(), enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                    Column(Modifier.padding(start = 18.dp)) {
                        val list = sortChats(model.chats[p.id].orEmpty().filter { it.current || it.messageCount > 0 }, prefs.projectSort)
                        val openChat = if (p.id == current) snapshot?.conversation?.chat?.id else null
                        val more = p.id in moreOpen
                        val (shown, hidden) = previewChats(list, prefs.showAllChats || more, openChat)
                        shown.forEach { c -> ChatRow(model, p.id, c, on = c.id == openChat) }
                        // «Ver los X restantes» bajo los 3 más recientes; abierta, «Ver menos».
                        if (!prefs.showAllChats && (hidden > 0 || more)) {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 40.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .tappable(role = Role.Button, haptic = Haptic.Tap) { moreOpen = if (more) moreOpen - p.id else moreOpen + p.id }
                                    .padding(horizontal = 10.dp)
                                    .testTag("chats-more-${p.id}"),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Outlined.MoreHoriz, contentDescription = null, tint = Orbita.TextFaint, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(10.dp))
                                Text(if (more) t("Ver menos") else t("Ver los {n} restantes", "n" to hidden), color = Orbita.TextFaint, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
            if (shownProjects.isEmpty() && !snapshot?.projects.isNullOrEmpty()) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(t("Ningún proyecto con este filtro."), color = Orbita.TextFaint, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                    TextButton(onClick = { model.updatePreferences { it.copy(projectStatus = ProjectStatus.All) } }) { Text(t("Quitar el filtro"), color = Orbita.Accent) }
                }
            }
        }

        Box(Modifier.fillMaxWidth().padding(vertical = 8.dp, horizontal = 6.dp).height(1.dp).background(Orbita.Divider))
        Row(Modifier.fillMaxWidth().padding(start = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            val (color, where) = when (state.connection) {
                Connection.Online -> Orbita.Live to t("conectado")
                Connection.Connecting -> Orbita.Warn to t("conectando…")
                is Connection.Offline -> Orbita.Danger to t("sin conexión")
                Connection.Idle -> Orbita.TextFaint to t("en pausa")
            }
            // El nombre que le puso el usuario al ordenador manda sobre el de la red; tocarlo lo cambia.
            val server = snapshot?.settings?.serverName?.takeIf { it.isNotBlank() } ?: state.session?.serverName.orEmpty()
            val canRename = state.connection == Connection.Online && snapshot?.capabilities?.serverName == true
            var renaming by remember { mutableStateOf(false) }
            Box(Modifier.size(34.dp).clip(CircleShape).background(Orbita.AccentSoft), contentAlignment = Alignment.Center) {
                Text(server.take(1).uppercase().ifEmpty { "k" }, color = Orbita.Text, style = MaterialTheme.typography.labelLarge)
            }
            Spacer(Modifier.width(10.dp))
            Column(
                Modifier
                    .weight(1f)
                    .tappable(enabled = state.connection !is Connection.Online || canRename) {
                        if (state.connection is Connection.Online) renaming = true else model.controller.retryNow()
                    }
                    .semantics { if (canRename) contentDescription = t("Cambiar el nombre de este ordenador ({name})", "name" to server) }
                    .testTag("server-name"),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(server.ifEmpty { t("Tu ordenador") }, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (canRename) {
                        Spacer(Modifier.width(5.dp))
                        Icon(Icons.Outlined.Edit, contentDescription = null, tint = Orbita.TextFaint, modifier = Modifier.size(13.dp))
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Dot(color, 7.dp, pulse = state.connection == Connection.Connecting)
                    Spacer(Modifier.width(5.dp))
                    Text(where, color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                }
            }
            IconAction(Icons.Outlined.Settings, t("Ajustes"), onClick = { go(Section.Settings) }, tint = if (model.section == Section.Settings) Orbita.Text else Orbita.TextSoft, modifier = Modifier.testTag("nav-Settings"))
            if (renaming) ServerNameDialog(model, initial = snapshot?.settings?.serverName ?: server, onDismiss = { renaming = false })
        }
    }
}

/** Ponerle nombre al ordenador (vacío: vuelve al de la red). Se guarda en él, así que se ve igual en todos lados. */
@Composable
private fun ServerNameDialog(model: OrbitaModel, initial: String, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xF20E1730),
        title = { Text(t("Nombre del ordenador"), color = Orbita.Text) },
        text = {
            Column {
                OrbitaField(value = name, onValueChange = { name = it.replace('\n', ' ').take(40) }, placeholder = t("Mac mini de casa"), imeAction = ImeAction.Done, onIme = {}, autoFocus = true)
                Spacer(Modifier.height(8.dp))
                Text(t("Se ve así en la barra lateral de Órbita, la web y el escritorio. Déjalo vacío para usar el nombre de la red."), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(onClick = { onDismiss(); model.run({ model.controller.setServerName(name.trim()) }) }, modifier = Modifier.testTag("server-name-save")) { Text(t("Guardar"), color = Orbita.Accent) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancelar"), color = Orbita.TextSoft) } },
    )
}

/** Una fila de la barra: icono de línea, texto y, si hace falta, un número (en ámbar los avisos que te esperan). */
@Composable
private fun SidebarItem(
    icon: ImageVector,
    label: String,
    badge: Int = 0,
    warn: Boolean = false,
    selected: Boolean = false,
    trailing: ImageVector? = null,
    tag: String,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) Orbita.AccentSoft else Color.Transparent)
            .tappable(role = Role.Button, haptic = Haptic.Tap, onClick = onClick)
            .padding(horizontal = 10.dp)
            .semantics { this.selected = selected }
            .testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = if (selected) Orbita.Text else Orbita.TextSoft, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Text(label, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (badge > 0) SidebarBadge(badge, warn)
        if (trailing != null) Icon(trailing, contentDescription = null, tint = Orbita.TextFaint, modifier = Modifier.size(18.dp))
    }
}

/** Número discreto: ámbar si es algo que te espera, gris azulado si solo informa. */
@Composable
private fun SidebarBadge(count: Int, warn: Boolean) {
    Box(
        Modifier
            .heightIn(min = 20.dp)
            .clip(Orbita.PillShape)
            .background(if (warn) Orbita.Warn.copy(alpha = 0.22f) else Orbita.AccentSoft)
            .padding(horizontal = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(if (count > 99) "99+" else count.toString(), color = if (warn) Orbita.Warn else Orbita.Text, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
    }
}

/** «Proyectos» con el filtro y el botón para crear uno (y su campo, al pulsarlo). */
@Composable
private fun ProjectsHeader(model: OrbitaModel, state: CoworkUiState, anyOpen: Boolean) {
    var creating by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Row(Modifier.fillMaxWidth().padding(start = 10.dp, top = 14.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(t("Proyectos"), color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
        ProjectFilterButton(model, state, anyOpen)
        IconAction(Icons.Outlined.Add, t("Nuevo proyecto"), onClick = { creating = !creating }, size = 34.dp, modifier = Modifier.testTag("side-new-project"))
    }
    AnimatedVisibility(creating) {
        Column(Modifier.padding(horizontal = 6.dp, vertical = 4.dp)) {
            OrbitaField(value = name, onValueChange = { name = it }, placeholder = t("Nombre del proyecto"), imeAction = ImeAction.Done, onIme = {}, autoFocus = true)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OrbitaButton(t("Cancelar"), onClick = { creating = false; name = "" }, style = ButtonStyle.Ghost, haptic = Haptic.Tap, modifier = Modifier.weight(1f))
                OrbitaButton(
                    t("Crear"),
                    onClick = {
                        busy = true
                        scope.launch {
                            val r = model.controller.createProject(name.trim())
                            busy = false
                            if (r.ok) {
                                model.feedback.confirm()
                                model.feedback.play(Sfx.ProjectCreated)
                                creating = false
                                name = ""
                                model.expandedProject = null
                            } else {
                                model.feedback.reject()
                                model.toast(r.message, Toast.Tone.Error)
                            }
                        }
                    },
                    enabled = name.isNotBlank(),
                    busy = busy,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** Ancho de la barra plegada: con el nombre bajo cada icono (tableta) o solo iconos (móvil en vertical). */
val RailWidth: Dp = 88.dp
val RailWidthSlim: Dp = 56.dp

/**
 * La barra lateral plegada: no desaparece, queda una columna estrecha de cristal a lo largo con el logo arriba y los
 * accesos a mano (nuevo chat, buscar, lo que te necesita, chat, tareas, resultados, música, más y Ajustes abajo).
 * [labels]: con el nombre bajo cada icono (tableta) o solo iconos (móvil en vertical). [onOpen] despliega la barra
 * entera (tableta) o la abre como cajón (móvil).
 */
@Composable
fun SidebarRail(model: OrbitaModel, state: CoworkUiState, labels: Boolean, onOpen: () -> Unit, openTag: String, modifier: Modifier = Modifier) {
    val snapshot = state.snapshot
    var moreOpen by remember { mutableStateOf(false) }
    fun go(section: Section) {
        model.drawerOpen = false
        model.open(section)
    }
    val width = if (labels) RailWidth else RailWidthSlim
    Column(
        modifier
            .width(width)
            .fillMaxHeight()
            .glass(radius = if (labels) 28.dp else 24.dp)
            .padding(horizontal = if (labels) 6.dp else 4.dp, vertical = 10.dp)
            .testTag("sidebar-rail"),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // El logo abre la barra (ya no hay un botón aparte debajo): da una vuelta al tocarlo.
        SpinningLogo(if (labels) 34.dp else 28.dp, t("Abrir o plegar la barra lateral"), box = if (labels) 48.dp else 44.dp, onClick = onOpen, modifier = Modifier.testTag(openTag))
        Spacer(Modifier.height(6.dp))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
            RailItem(Icons.Outlined.EditNote, t("Nuevo chat"), t("Nuevo"), labels, tag = "rail-new-chat") { model.newChat() }
            if (snapshot?.capabilities?.search == true) {
                RailItem(Icons.Outlined.Search, t("Buscar"), t("Buscar"), labels, tag = "rail-search") {
                    model.drawerOpen = false
                    model.searchOpen = true
                }
            }
            if (model.historySupported()) {
                RailItem(Icons.Outlined.History, t("Historial"), t("Historial"), labels, tag = "rail-history") { model.openHistory() }
            }
            if (inboxSupported(state)) {
                RailItem(Icons.Outlined.Notifications, t("Te necesita"), t("Te necesita"), labels, badge = state.inbox.count { it.needsYou }, selected = model.inboxOpen, tag = "rail-inbox") { model.openInbox() }
            }
            val active = snapshot?.tasks?.count { it.isActive } ?: 0
            RailItem(Section.Chat.icon, t("Chat"), t("Chat"), labels, selected = model.section == Section.Chat, tag = "rail-Chat") { go(Section.Chat) }
            RailItem(Section.Tasks.icon, t("Tareas en marcha"), t("Tareas"), labels, badge = active, warn = false, selected = model.section == Section.Tasks, tag = "rail-Tasks") { go(Section.Tasks) }
            RailItem(Section.Results.icon, t("Resultados"), t("Resultados"), labels, badge = state.inbox.count { !it.needsYou }, warn = false, selected = model.section == Section.Results, tag = "rail-Results") { go(Section.Results) }
            if (snapshot?.capabilities?.music == true) {
                RailItem(Icons.Outlined.MusicNote, t("Música"), t("Música"), labels, selected = model.musicOpen, tag = "rail-music") {
                    model.drawerOpen = false
                    model.musicOpen = true
                }
            }
            Box {
                RailItem(Icons.Outlined.MoreHoriz, t("Más"), t("Más"), labels, selected = model.section in SidebarMore, tag = "rail-more") { moreOpen = true }
                DropdownMenu(expanded = moreOpen, onDismissRequest = { moreOpen = false }, containerColor = Orbita.GlassPopover) {
                    val memory = snapshot?.memory?.count { it.status == "provisional" } ?: 0
                    moreSections(state).forEach { s ->
                        DropdownMenuItem(
                            text = { Text(if (s == Section.Memory && memory > 0) "${s.label} ($memory)" else s.label, color = Orbita.Text) },
                            leadingIcon = { Icon(s.icon, null, tint = Orbita.TextSoft) },
                            onClick = { moreOpen = false; go(s) },
                            modifier = Modifier.testTag("rail-more-${s.name}"),
                        )
                    }
                }
            }
            // Tus proyectos, cada uno con su inicial: tocar uno abre su último chat.
            val projects = sortProjects(snapshot?.projects.orEmpty(), model.preferences.projectSort)
            if (projects.isNotEmpty()) {
                Box(Modifier.fillMaxWidth(0.6f).padding(vertical = 6.dp).height(1.dp).background(Orbita.Divider))
                val unseen = state.inbox.filter { !it.needsYou }.mapNotNull { it.projectId }.toSet()
                projects.forEach { p -> RailProject(p, here = p.id == snapshot?.conversation?.id, unseen = p.id in unseen) { model.openLatestChat(p.id) } }
            }
        }
        Box(Modifier.fillMaxWidth(0.7f).padding(vertical = 6.dp).height(1.dp).background(Orbita.Divider))
        RailItem(Icons.Outlined.Settings, t("Ajustes"), t("Ajustes"), labels, selected = model.section == Section.Settings, tag = "rail-Settings") { go(Section.Settings) }
    }
}

/**
 * Un proyecto en la barra plegada: su inicial en un círculo (resaltado si es el abierto), con un punto azul si el
 * equipo trabaja en él o verde si tiene algo terminado sin ver.
 */
@Composable
private fun RailProject(project: ProjectSummary, here: Boolean, unseen: Boolean, onClick: () -> Unit) {
    val label = t("{name}: abrir su último chat", "name" to project.name)
    Box(
        Modifier
            .padding(vertical = 3.dp)
            .size(44.dp)
            .clip(CircleShape)
            .tappable(role = Role.Button, haptic = Haptic.Tap, onClick = onClick)
            .semantics { selected = here; contentDescription = label }
            .testTag("rail-project-${project.id}"),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(32.dp).clip(CircleShape).background(if (here) Orbita.AccentSoft else Orbita.Divider),
            contentAlignment = Alignment.Center,
        ) {
            Text(railInitial(project.name), color = if (here) Orbita.Text else Orbita.TextSoft, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
        if (project.running || unseen) {
            Box(Modifier.align(Alignment.TopEnd).offset(x = (-5).dp, y = 5.dp).size(9.dp).clip(CircleShape).background(if (project.running) Orbita.Accent else Orbita.Live))
        }
    }
}

/** La inicial de un proyecto para la barra plegada (primera letra o número de su nombre). */
fun railInitial(name: String): String = name.trim().firstOrNull { it.isLetterOrDigit() }?.uppercase() ?: "·"

/**
 * El logo de kywai como botón de la barra: al tocarlo da una vuelta rápida sobre sí mismo (como el de la web, pero
 * corta) y abre o pliega la barra.
 */
@Composable
fun SpinningLogo(size: Dp, description: String, box: Dp, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val turn = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    Box(
        modifier
            .size(box)
            .clip(CircleShape)
            .tappable(haptic = Haptic.Tap) {
                scope.launch {
                    turn.snapTo(0f)
                    turn.animateTo(360f, tween(620, easing = CubicBezierEasing(0.3f, 0.7f, 0.15f, 1f)))
                }
                onClick()
            }
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.graphicsLayer { rotationZ = turn.value }) { LogoMark(size) }
    }
}

/** Un acceso de la barra plegada: el icono y, si cabe, su nombre debajo (como el raíl antiguo de Órbita). */
@Composable
private fun RailItem(
    icon: ImageVector,
    description: String,
    label: String,
    labels: Boolean,
    badge: Int = 0,
    warn: Boolean = true,
    selected: Boolean = false,
    tag: String,
    onClick: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp)
            .heightIn(min = if (labels) 60.dp else 46.dp)
            .clip(RoundedCornerShape(if (labels) 18.dp else 14.dp))
            .background(if (selected) Orbita.AccentSoft else Color.Transparent)
            .tappable(role = Role.Button, haptic = Haptic.Tap, onClick = onClick)
            .padding(vertical = if (labels) 8.dp else 0.dp)
            .semantics {
                this.selected = selected
                contentDescription = if (badge > 0) "$description ($badge)" else description
            }
            .testTag(tag),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box {
            Icon(icon, contentDescription = null, tint = if (selected) Orbita.Text else Orbita.TextSoft, modifier = Modifier.size(22.dp))
            if (badge > 0) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 9.dp, y = (-7).dp)
                        .size(17.dp)
                        .clip(CircleShape)
                        .background(if (warn) Orbita.Warn.copy(alpha = 0.9f) else Orbita.Accent),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(if (badge > 9) "9+" else badge.toString(), color = Orbita.Night, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1)
                }
            }
        }
        if (labels) {
            Spacer(Modifier.height(4.dp))
            Text(label, color = if (selected) Orbita.Text else Orbita.TextSoft, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Arriba sobre el mundo: el chat abierto y su proyecto (cambiar de chat o de proyecto se hace en la barra lateral). */
@Composable
fun ChatTitleChip(state: CoworkUiState, modifier: Modifier = Modifier) {
    val conversation = state.snapshot?.conversation
    val project = conversation?.title?.takeIf { it.isNotBlank() } ?: t("Sin proyecto")
    val chat = conversation?.chat?.title?.takeIf { it.isNotBlank() }
    Row(
        modifier
            .heightIn(min = 46.dp)
            .glass(radius = 23.dp)
            .padding(horizontal = 16.dp)
            .testTag("chat-title"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(chat ?: project, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (chat != null) Text(project, color = Orbita.TextSoft, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Plegado: la barra lateral sale de la izquierda por encima de todo, con un velo que la cierra al tocarlo. */
@Composable
fun SidebarDrawer(model: OrbitaModel, state: CoworkUiState) {
    AnimatedVisibility(model.drawerOpen, enter = fadeIn(), exit = fadeOut()) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0x80030712))
                .pointerInput(Unit) { detectTapGestures(onTap = { model.drawerOpen = false }) },
        )
    }
    AnimatedVisibility(
        model.drawerOpen,
        enter = fadeIn() + slideInHorizontally { -it / 2 },
        exit = fadeOut() + slideOutHorizontally { -it / 2 },
    ) {
        Box(Modifier.fillMaxHeight().windowInsetsPadding(WindowInsets.safeDrawing).padding(10.dp)) {
            // Como cajón va por encima de la interfaz: cristal más tupido para que lo de debajo apenas se vea.
            Sidebar(model, state, onCollapse = { model.drawerOpen = false }, solid = true)
        }
    }
}

/**
 * Botón de filtro junto a «Proyectos» (como en el escritorio): orden, estado, mostrar todos los chats, restablecer,
 * contraer todo y marcar todo como visto. Con algo distinto de lo de siempre lleva un punto.
 */
@Composable
private fun ProjectFilterButton(model: OrbitaModel, state: CoworkUiState, anyOpen: Boolean) {
    var open by remember { mutableStateOf(false) }
    var sub by remember { mutableStateOf<String?>(null) }
    val p = model.preferences
    val active = p.projectSort != ProjectSort.Manual || p.projectStatus != ProjectStatus.All || p.showAllChats
    val finished = state.inbox.filter { !it.needsYou }
    val sorts = listOf(ProjectSort.Manual to t("Tu orden (arrastrando)"), ProjectSort.Recent to t("Lo más reciente primero"), ProjectSort.Name to t("Por nombre (A-Z)"))
    val statuses = listOf(ProjectStatus.All to t("Todos"), ProjectStatus.Busy to t("Trabajando ahora"), ProjectStatus.Unseen to t("Con resultados sin ver"), ProjectStatus.Week to t("Activos esta semana"))
    fun close() { open = false; sub = null }
    Box {
        Box {
            IconAction(Icons.Outlined.FilterList, t("Filtrar y ordenar los proyectos"), onClick = { open = true }, size = 34.dp, modifier = Modifier.testTag("side-project-filter"))
            if (active) Box(Modifier.align(Alignment.TopEnd).offset(x = (-6).dp, y = 6.dp).size(7.dp).clip(CircleShape).background(Orbita.Accent))
        }
        DropdownMenu(open, onDismissRequest = ::close, containerColor = Orbita.GlassPopover) {
            when (sub) {
                "sort" -> sorts.forEach { (k, label) ->
                    DropdownMenuItem(text = { Text(label) }, onClick = { close(); model.updatePreferences { it.copy(projectSort = k) } }, leadingIcon = { RadioMark(p.projectSort == k) })
                }
                "status" -> statuses.forEach { (k, label) ->
                    DropdownMenuItem(text = { Text(label) }, onClick = { close(); model.updatePreferences { it.copy(projectStatus = k) } }, leadingIcon = { RadioMark(p.projectStatus == k) })
                }
                else -> {
                    DropdownMenuItem(
                        text = { Text(t("Orden") + " · " + sorts.first { it.first == p.projectSort }.second.substringBefore(" (")) },
                        onClick = { sub = "sort" },
                        trailingIcon = { Icon(Icons.Outlined.ChevronRight, null) },
                        modifier = Modifier.testTag("filter-sort"),
                    )
                    DropdownMenuItem(
                        text = { Text(t("Estado") + " · " + statuses.first { it.first == p.projectStatus }.second) },
                        onClick = { sub = "status" },
                        trailingIcon = { Icon(Icons.Outlined.ChevronRight, null) },
                        modifier = Modifier.testTag("filter-status"),
                    )
                    DropdownMenuItem(
                        text = { Text(t("Mostrar todos los chats")) },
                        onClick = { close(); model.updatePreferences { it.copy(showAllChats = !it.showAllChats) } },
                        leadingIcon = { RadioMark(p.showAllChats) },
                        modifier = Modifier.testTag("filter-show-all"),
                    )
                    DropdownMenuItem(
                        text = { Text(t("Restablecer el filtro")) },
                        enabled = active,
                        onClick = { close(); model.updatePreferences { it.copy(projectSort = ProjectSort.Manual, projectStatus = ProjectStatus.All, showAllChats = false) } },
                    )
                    HorizontalDivider(color = Orbita.Divider)
                    DropdownMenuItem(text = { Text(t("Contraer todo")) }, enabled = anyOpen, onClick = { close(); model.expandedProject = "" })
                    DropdownMenuItem(
                        text = { Text(t("Marcar todo como visto")) },
                        enabled = finished.isNotEmpty(),
                        onClick = { close(); finished.forEach(model::inboxSeen) },
                        modifier = Modifier.testTag("filter-mark-seen"),
                    )
                }
            }
        }
    }
}

/** Punto de la opción elegida en los menús del filtro (hueco si no lo está, para que todo quede alineado). */
@Composable
private fun RadioMark(on: Boolean) {
    Box(Modifier.size(18.dp), contentAlignment = Alignment.Center) {
        if (on) Box(Modifier.size(7.dp).clip(CircleShape).background(Orbita.Text))
    }
}
