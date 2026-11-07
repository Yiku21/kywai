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
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.MusicNote
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
                    SidebarMore.forEach { s ->
                        SidebarItem(s.icon, s.label, badge = if (s == Section.Memory) memory else 0, selected = model.section == s, tag = "nav-${s.name}") { go(s) }
                    }
                }
            }

            PinnedSection(model, state)
            ProjectsHeader(model)
            snapshot?.projects?.forEach { p ->
                val open = expanded == p.id
                ProjectRow(model, p, open = open, current = p.id == current) {
                    if (open && p.id == current) model.expandedProject = "" else model.openProject(p.id)
                }
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
        Box(Modifier.size(if (labels) 48.dp else 40.dp).clip(CircleShape).tappable(haptic = Haptic.Tap, onClick = onOpen), contentAlignment = Alignment.Center) {
            LogoMark(if (labels) 34.dp else 28.dp)
        }
        IconAction(Icons.Outlined.ViewSidebar, t("Abrir la barra lateral"), onClick = onOpen, size = 40.dp, modifier = Modifier.testTag(openTag))
        Spacer(Modifier.height(4.dp))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
            RailItem(Icons.Outlined.EditNote, t("Nuevo chat"), t("Nuevo"), labels, tag = "rail-new-chat") { model.newChat() }
            if (snapshot?.capabilities?.search == true) {
                RailItem(Icons.Outlined.Search, t("Buscar"), t("Buscar"), labels, tag = "rail-search") {
                    model.drawerOpen = false
                    model.searchOpen = true
                }
            }
            if (inboxSupported(state)) {
                RailItem(Icons.Outlined.Notifications, t("Te necesita"), t("Te necesita"), labels, badge = state.inbox.size, selected = model.inboxOpen, tag = "rail-inbox") { model.openInbox() }
            }
            val active = snapshot?.tasks?.count { it.isActive } ?: 0
            RailItem(Section.Chat.icon, t("Chat"), t("Chat"), labels, selected = model.section == Section.Chat, tag = "rail-Chat") { go(Section.Chat) }
            RailItem(Section.Tasks.icon, t("Tareas en marcha"), t("Tareas"), labels, badge = active, warn = false, selected = model.section == Section.Tasks, tag = "rail-Tasks") { go(Section.Tasks) }
            RailItem(Section.Results.icon, t("Resultados"), t("Resultados"), labels, selected = model.section == Section.Results, tag = "rail-Results") { go(Section.Results) }
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
                    SidebarMore.forEach { s ->
                        DropdownMenuItem(
                            text = { Text(if (s == Section.Memory && memory > 0) "${s.label} ($memory)" else s.label, color = Orbita.Text) },
                            leadingIcon = { Icon(s.icon, null, tint = Orbita.TextSoft) },
                            onClick = { moreOpen = false; go(s) },
                            modifier = Modifier.testTag("rail-more-${s.name}"),
                        )
                    }
                }
            }
        }
        Box(Modifier.fillMaxWidth(0.7f).padding(vertical = 6.dp).height(1.dp).background(Orbita.Divider))
        RailItem(Icons.Outlined.Settings, t("Ajustes"), t("Ajustes"), labels, selected = model.section == Section.Settings, tag = "rail-Settings") { go(Section.Settings) }
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
