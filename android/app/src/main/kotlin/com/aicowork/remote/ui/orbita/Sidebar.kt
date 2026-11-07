package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.outlined.Menu
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
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.ViewSidebar
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import com.aicowork.remote.ui.components.Format
import kotlinx.coroutines.launch

/** Ancho de la barra lateral desplegada. */
val SidebarWidth: Dp = 272.dp

/** Lo que va en «Más» (lo que se usa menos). */
private val SidebarMore = listOf(Section.Files, Section.Memory, Section.Tools, Section.Usage, Section.Team)

/**
 * Barra lateral como la del escritorio, de cristal y flotando sobre el mundo: chat nuevo, buscar, lo que te necesita,
 * tareas, resultados, cada proyecto con sus chats y, abajo, a qué ordenador estás conectado y los Ajustes.
 * Todos los iconos son del mismo juego (de línea) y del mismo tono; el color queda para los avisos.
 * [onCollapse]: plegarla (desplegado) o cerrar el cajón (plegado).
 */
@Composable
fun Sidebar(model: OrbitaModel, state: CoworkUiState, onCollapse: () -> Unit, modifier: Modifier = Modifier) {
    val snapshot = state.snapshot
    val current = snapshot?.conversation?.id
    var moreOpen by remember { mutableStateOf(false) }
    val expanded = model.expandedProject ?: current
    // Al abrir la barra (o cambiar de chat) se piden los chats del proyecto desplegado.
    LaunchedEffect(expanded, snapshot?.conversation?.chat?.id, snapshot?.capabilities?.chats) {
        expanded?.let(model::loadChats)
    }
    fun go(section: Section) {
        model.drawerOpen = false
        model.open(section)
    }

    Column(
        modifier
            .width(SidebarWidth)
            .fillMaxHeight()
            .glass(radius = 28.dp)
            .padding(horizontal = 10.dp, vertical = 12.dp)
            .testTag("sidebar"),
    ) {
        Row(Modifier.fillMaxWidth().padding(start = 8.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            LogoMark(28.dp)
            Spacer(Modifier.width(10.dp))
            Text("kywai", color = Orbita.Text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            IconAction(Icons.Outlined.ViewSidebar, t("Plegar la barra lateral"), onClick = onCollapse, size = 40.dp)
        }

        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            SidebarItem(Icons.Outlined.EditNote, t("Nuevo chat"), tag = "side-new-chat") { model.newChat() }
            if (snapshot?.capabilities?.search == true) {
                SidebarItem(Icons.Outlined.Search, t("Buscar"), tag = "side-search") {
                    model.drawerOpen = false
                    model.searchOpen = true
                }
            }
            if (inboxSupported(state)) {
                SidebarItem(Icons.Outlined.Notifications, t("Te necesita"), badge = state.inbox.size, warn = true, selected = model.inboxOpen, tag = "side-inbox") { model.openInbox() }
            }
            val active = snapshot?.tasks?.count { it.isActive } ?: 0
            SidebarItem(Section.Chat.icon, t("Chat"), selected = model.section == Section.Chat, tag = "nav-Chat") { go(Section.Chat) }
            SidebarItem(Section.Tasks.icon, t("Tareas en marcha"), badge = active, selected = model.section == Section.Tasks, tag = "nav-Tasks") { go(Section.Tasks) }
            SidebarItem(Section.Results.icon, t("Resultados"), selected = model.section == Section.Results, tag = "nav-Results") { go(Section.Results) }
            SidebarItem(Icons.Outlined.MoreHoriz, t("Más"), trailing = if (moreOpen) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, selected = model.section in SidebarMore && !moreOpen, tag = "side-more") { moreOpen = !moreOpen }
            AnimatedVisibility(moreOpen, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                Column(Modifier.padding(start = 14.dp)) {
                    val memory = snapshot?.memory?.count { it.status == "provisional" } ?: 0
                    SidebarMore.forEach { s ->
                        SidebarItem(s.icon, s.label, badge = if (s == Section.Memory) memory else 0, selected = model.section == s, tag = "nav-${s.name}") { go(s) }
                    }
                }
            }

            ProjectsHeader(model)
            snapshot?.projects?.forEach { p ->
                val open = expanded == p.id
                ProjectRow(
                    name = p.name,
                    open = open,
                    current = p.id == current,
                    running = p.running,
                    onClick = {
                        if (open && p.id == current) model.expandedProject = "" else model.openProject(p.id)
                    },
                )
                AnimatedVisibility(open && model.chatsSupported(), enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                    Column(Modifier.padding(start = 18.dp)) {
                        val list = model.chats[p.id].orEmpty().filter { it.current || it.messageCount > 0 }
                        val openChat = if (p.id == current) snapshot.conversation.chat?.id else null
                        list.forEach { c -> ChatRow(model, p.id, c, on = c.id == openChat) }
                    }
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
            val server = state.session?.serverName.orEmpty()
            Box(Modifier.size(34.dp).clip(CircleShape).background(Orbita.AccentSoft), contentAlignment = Alignment.Center) {
                Text(server.take(1).uppercase().ifEmpty { "k" }, color = Orbita.Text, style = MaterialTheme.typography.labelLarge)
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f).tappable(enabled = state.connection !is Connection.Online, onClick = model.controller::retryNow)) {
                Text(server.ifEmpty { t("Tu ordenador") }, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Dot(color, 7.dp, pulse = state.connection == Connection.Connecting)
                    Spacer(Modifier.width(5.dp))
                    Text(where, color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                }
            }
            IconAction(Icons.Outlined.Settings, t("Ajustes"), onClick = { go(Section.Settings) }, tint = if (model.section == Section.Settings) Orbita.Text else Orbita.TextSoft, modifier = Modifier.testTag("nav-Settings"))
        }
    }
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

/** «Proyectos» con el botón para crear uno (y su campo, al pulsarlo). */
@Composable
private fun ProjectsHeader(model: OrbitaModel) {
    var creating by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Row(Modifier.fillMaxWidth().padding(start = 10.dp, top = 14.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(t("Proyectos"), color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
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

@Composable
private fun ProjectRow(name: String, open: Boolean, current: Boolean, running: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 42.dp)
            .clip(RoundedCornerShape(14.dp))
            .tappable(haptic = Haptic.Select, onClick = onClick)
            .padding(horizontal = 10.dp)
            .semantics { selected = current },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (open) Icons.Outlined.FolderOpen else Icons.Outlined.Folder, contentDescription = null, tint = if (current) Orbita.Text else Orbita.TextSoft, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Text(name, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, fontWeight = if (current) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (running) {
            Dot(Orbita.Live, 7.dp, pulse = true)
            Spacer(Modifier.width(6.dp))
        }
        Icon(if (open) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight, contentDescription = null, tint = Orbita.TextFaint, modifier = Modifier.size(18.dp))
    }
}

/** Un chat del proyecto: tocar lo abre; mantener pulsado, renombrar o borrar. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChatRow(model: OrbitaModel, projectId: String, chat: ChatSummary, on: Boolean) {
    var menu by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val title = chat.title.ifBlank { t("Chat nuevo") }
    Box {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(if (on) Orbita.AccentSoft else Color.Transparent)
                .combinedClickable(
                    onClick = { model.feedback.tap(); model.openChat(projectId, chat.id) },
                    onLongClick = { model.feedback.select(); menu = true },
                )
                .padding(horizontal = 10.dp)
                .semantics { selected = on; contentDescription = title }
                .testTag("chat-${chat.id}"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.ChatBubbleOutline, contentDescription = null, tint = if (on) Orbita.Text else Orbita.TextFaint, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(10.dp))
            Text(title, color = if (on) Orbita.Text else Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            chat.updatedAt?.let {
                Spacer(Modifier.width(6.dp))
                Text(Format.relative(it), color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall, maxLines = 1)
            }
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, containerColor = Orbita.GlassPopover) {
            DropdownMenuItem(
                text = { Text(t("Renombrar"), color = Orbita.Text) },
                leadingIcon = { Icon(Icons.Outlined.DriveFileRenameOutline, null, tint = Orbita.TextSoft) },
                onClick = { menu = false; renaming = true },
            )
            DropdownMenuItem(
                text = { Text(t("Borrar"), color = if (on) Orbita.TextFaint else Orbita.Text) },
                leadingIcon = { Icon(Icons.Outlined.DeleteOutline, null, tint = Orbita.TextSoft) },
                enabled = !on,
                onClick = { menu = false; deleting = true },
            )
        }
    }
    if (renaming) {
        var name by remember { mutableStateOf(chat.title) }
        AlertDialog(
            onDismissRequest = { renaming = false },
            containerColor = Color(0xF20E1730),
            title = { Text(t("Renombrar chat"), color = Orbita.Text) },
            text = { OrbitaField(value = name, onValueChange = { name = it.take(80) }, placeholder = t("Nombre del chat"), imeAction = ImeAction.Done, onIme = {}, autoFocus = true) },
            confirmButton = {
                TextButton(onClick = { renaming = false; model.renameChat(projectId, chat.id, name) }, enabled = name.isNotBlank()) { Text(t("Guardar"), color = Orbita.Accent) }
            },
            dismissButton = { TextButton(onClick = { renaming = false }) { Text(t("Cancelar"), color = Orbita.TextSoft) } },
        )
    }
    if (deleting) {
        ConfirmDialog(
            title = t("¿Borrar «{title}»?", "title" to title),
            text = t("Se guarda una copia en el ordenador, en la carpeta de chats borrados."),
            confirm = t("Borrar"),
            onConfirm = { deleting = false; model.deleteChat(projectId, chat.id) },
            onDismiss = { deleting = false },
            danger = true,
        )
    }
}

/** Botón para volver a abrir la barra lateral plegada (desplegado). */
@Composable
fun SidebarToggle(model: OrbitaModel, modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(46.dp)
            .glass(radius = 23.dp)
            .tappable(haptic = Haptic.Tap) { model.sidebarOpen = true }
            .semantics { contentDescription = t("Abrir la barra lateral") }
            .testTag("sidebar-toggle"),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Outlined.ViewSidebar, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(22.dp))
    }
}

/** ☰ (plegado): abre la barra lateral como cajón. */
@Composable
fun MenuButton(model: OrbitaModel, modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(46.dp)
            .glass(radius = 23.dp)
            .tappable(haptic = Haptic.Tap) { model.drawerOpen = true }
            .semantics { contentDescription = t("Abrir la barra lateral") }
            .testTag("menu-button"),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Outlined.Menu, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(22.dp))
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
            Sidebar(model, state, onCollapse = { model.drawerOpen = false })
        }
    }
}
