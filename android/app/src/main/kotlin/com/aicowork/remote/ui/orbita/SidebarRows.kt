package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CallSplit
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.DriveFileMove
import androidx.compose.material.icons.outlined.DriveFileRenameOutline
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.ChatSummary
import com.aicowork.remote.data.model.ProjectSummary
import com.aicowork.remote.ui.components.Format

/*
 * Filas de proyectos y chats de la barra lateral, con el menú que sale al mantenerlas pulsadas:
 * lo mismo que el clic derecho del escritorio (sin «Abrir carpeta», que en el móvil no tiene sentido).
 * Con un ordenador de versión anterior solo salen las opciones que sabe hacer.
 */

/** «Fijados»: los proyectos y los chats que fijas, arriba de «Proyectos» (como en el escritorio). */
@Composable
fun PinnedSection(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot ?: return
    val projects = if (model.projectActionsSupported()) snapshot.projects.filter { it.pinned } else emptyList()
    val pinned = if (model.chatActionsSupported()) model.pinnedChats.filter { c -> snapshot.projects.any { it.id == c.projectId } } else emptyList()
    if (projects.isEmpty() && pinned.isEmpty()) return
    val current = snapshot.conversation.id
    Text(
        t("Fijados"),
        color = Orbita.TextFaint,
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier.padding(start = 10.dp, top = 14.dp, bottom = 2.dp).testTag("side-pinned"),
    )
    projects.forEach { p ->
        ProjectRow(model, p, open = false, current = p.id == current, pinnedIcon = true, onClick = { model.openProject(p.id) })
    }
    pinned.forEach { c ->
        val on = c.projectId == current && snapshot.conversation.chat?.id == c.id
        ChatRow(model, c.projectId, c, on = on, meta = snapshot.projects.firstOrNull { it.id == c.projectId }?.name)
    }
}

/** Un proyecto: tocar lo abre o lo pliega; mantener pulsado, su menú. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ProjectRow(model: OrbitaModel, project: ProjectSummary, open: Boolean, current: Boolean, pinnedIcon: Boolean = false, onClick: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val actions = model.projectActionsSupported()
    Box {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 42.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(if (menu) Orbita.AccentSoft else Color.Transparent)
                .combinedClickable(
                    onClick = { model.feedback.select(); onClick() },
                    onLongClick = { model.feedback.select(); menu = true },
                    onLongClickLabel = t("Más opciones"),
                )
                .padding(horizontal = 10.dp)
                .semantics { selected = current; contentDescription = project.name }
                .testTag(if (pinnedIcon) "pinned-project-${project.id}" else "project-${project.id}"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val icon = when {
                pinnedIcon -> Icons.Outlined.PushPin
                open -> Icons.Outlined.FolderOpen
                else -> Icons.Outlined.Folder
            }
            Icon(icon, contentDescription = null, tint = if (current) Orbita.Text else Orbita.TextSoft, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(12.dp))
            Text(project.name, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, fontWeight = if (current) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (project.running) {
                Dot(Orbita.Live, 7.dp, pulse = true)
                Spacer(Modifier.width(6.dp))
            }
            if (!pinnedIcon) Icon(if (open) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight, contentDescription = null, tint = Orbita.TextFaint, modifier = Modifier.size(18.dp))
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, containerColor = Orbita.GlassPopover) {
            val busy = t("El equipo está trabajando aquí: espera a que termine o detenlo")
            MenuItem(Icons.Outlined.EditNote, t("Nuevo chat en este proyecto"), enabled = !project.running, hint = if (project.running) busy else null, tag = "menu-new-chat") {
                menu = false
                model.newChatIn(project.id)
            }
            if (actions) {
                MenuItem(Icons.Outlined.PushPin, if (project.pinned) t("Soltar de Fijados") else t("Fijar"), tag = "menu-pin") {
                    menu = false
                    model.pinProject(project.id, !project.pinned)
                }
                MenuItem(Icons.Outlined.DriveFileRenameOutline, t("Cambiar nombre"), tag = "menu-rename") { menu = false; renaming = true }
                MenuItem(Icons.Outlined.DeleteOutline, t("Eliminar proyecto"), danger = true, enabled = !project.running, hint = if (project.running) busy else null, tag = "menu-delete") {
                    menu = false
                    deleting = true
                }
            }
        }
    }
    if (renaming) {
        NameDialog(t("Cambiar el nombre del proyecto"), project.name, t("Nombre del proyecto"), onDismiss = { renaming = false }) {
            renaming = false
            model.renameProject(project.id, it)
        }
    }
    if (deleting) {
        ConfirmDialog(
            title = t("¿Eliminar «{title}»?", "title" to project.name),
            text = t("Todo lo suyo (chats, archivos y resultados) va a la Papelera del ordenador."),
            confirm = t("Eliminar"),
            onConfirm = { deleting = false; model.deleteProject(project.id) },
            onDismiss = { deleting = false },
            danger = true,
        )
    }
}

/** Un chat: tocar lo abre; mantener pulsado, su menú. [meta]: el proyecto, en «Fijados». */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ChatRow(model: OrbitaModel, projectId: String, chat: ChatSummary, on: Boolean, meta: String? = null) {
    var menu by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var moving by remember { mutableStateOf(false) }
    val empty = chat.messageCount == 0
    val title = if (empty) t("Chat nuevo") else chat.title.ifBlank { t("Chat nuevo") }
    val actions = model.chatActionsSupported()
    val projects = model.controller.state.value.snapshot?.projects.orEmpty()
    val busyHere = chat.current && projects.firstOrNull { it.id == projectId }?.running == true
    Box {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(if (on || menu) Orbita.AccentSoft else Color.Transparent)
                .combinedClickable(
                    onClick = { model.feedback.tap(); model.openChat(projectId, chat.id) },
                    onLongClick = { model.feedback.select(); menu = true },
                    onLongClickLabel = t("Más opciones"),
                )
                .padding(horizontal = 10.dp)
                .semantics { selected = on; contentDescription = title }
                .testTag(if (meta != null) "pinned-chat-${chat.id}" else "chat-${chat.id}"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(if (meta != null) Icons.Outlined.PushPin else Icons.Outlined.ChatBubbleOutline, contentDescription = null, tint = if (on) Orbita.Text else Orbita.TextFaint, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(10.dp))
            Text(title, color = if (on) Orbita.Text else Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            val side = meta ?: chat.updatedAt?.let(Format::relative)
            if (side != null) {
                Spacer(Modifier.width(6.dp))
                Text(side, color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 96.dp))
            }
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, containerColor = Orbita.GlassPopover) {
            val busy = t("El equipo está trabajando en este chat: espera a que termine o detenlo")
            if (actions) {
                MenuItem(Icons.Outlined.PushPin, if (chat.pinned) t("Soltar de Fijados") else t("Fijar"), enabled = !empty, tag = "menu-pin") {
                    menu = false
                    model.pinChat(projectId, chat.id, !chat.pinned)
                }
            }
            MenuItem(Icons.Outlined.DriveFileRenameOutline, t("Cambiar nombre"), enabled = !empty, tag = "menu-rename") { menu = false; renaming = true }
            if (actions) {
                MenuItem(Icons.Outlined.CallSplit, t("Bifurcar"), enabled = !empty, hint = t("Copia aparte para seguir por otro camino sin tocar este"), tag = "menu-fork") {
                    menu = false
                    model.forkChat(projectId, chat.id)
                }
                MenuItem(Icons.Outlined.DriveFileMove, t("Mover a otro proyecto"), enabled = !empty && !busyHere, hint = if (busyHere) busy else null, tag = "menu-move") {
                    menu = false
                    moving = true
                }
            }
            // Un ordenador anterior no borra el chat abierto (hay que abrir otro antes).
            val canDelete = !empty && !busyHere && (actions || !on)
            MenuItem(Icons.Outlined.DeleteOutline, t("Eliminar"), danger = true, enabled = canDelete, hint = if (busyHere) busy else null, tag = "menu-delete") {
                menu = false
                deleting = true
            }
        }
    }
    if (renaming) {
        NameDialog(t("Cambiar el nombre del chat"), chat.title, t("Nombre del chat"), onDismiss = { renaming = false }) {
            renaming = false
            model.renameChat(projectId, chat.id, it)
        }
    }
    if (moving) {
        MoveDialog(projects.filter { it.id != projectId }, onDismiss = { moving = false }) { to ->
            moving = false
            model.moveChat(projectId, chat.id, to.id)
        }
    }
    if (deleting) {
        ConfirmDialog(
            title = t("¿Eliminar «{title}»?", "title" to title),
            text = if (chat.current) t("Se guarda una copia en el ordenador, en la carpeta de chats borrados. Antes se empieza un chat nuevo en su proyecto.")
            else t("Se guarda una copia en el ordenador, en la carpeta de chats borrados."),
            confirm = t("Eliminar"),
            onConfirm = { deleting = false; model.deleteChat(projectId, chat.id) },
            onDismiss = { deleting = false },
            danger = true,
        )
    }
}

/** Una opción del menú: icono de línea del mismo tono; en rojo solo la de eliminar. [hint]: por qué está apagada o qué hace. */
@Composable
private fun MenuItem(icon: ImageVector, label: String, enabled: Boolean = true, danger: Boolean = false, hint: String? = null, tag: String, onClick: () -> Unit) {
    val color = when {
        !enabled -> Orbita.TextFaint
        danger -> Orbita.Danger
        else -> Orbita.Text
    }
    DropdownMenuItem(
        text = {
            Column {
                Text(label, color = color)
                if (hint != null) Text(hint, color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall, maxLines = 2)
            }
        },
        leadingIcon = { Icon(icon, null, tint = if (danger && enabled) Orbita.Danger else Orbita.TextSoft) },
        enabled = enabled,
        onClick = onClick,
        modifier = Modifier.testTag(tag),
    )
}

/** Cambiar el nombre (de un chat o de un proyecto). */
@Composable
private fun NameDialog(title: String, initial: String, placeholder: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var name by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xF20E1730),
        title = { Text(title, color = Orbita.Text) },
        text = { OrbitaField(value = name, onValueChange = { name = it.take(80) }, placeholder = placeholder, imeAction = ImeAction.Done, onIme = {}, autoFocus = true) },
        confirmButton = { TextButton(onClick = { onSave(name.trim()) }, enabled = name.isNotBlank()) { Text(t("Guardar"), color = Orbita.Accent) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancelar"), color = Orbita.TextSoft) } },
    )
}

/** «Mover a otro proyecto»: la lista de los demás proyectos. */
@Composable
private fun MoveDialog(projects: List<ProjectSummary>, onDismiss: () -> Unit, onPick: (ProjectSummary) -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xF20E1730),
        title = { Text(t("Mover a otro proyecto"), color = Orbita.Text) },
        text = {
            if (projects.isEmpty()) {
                Text(t("No hay otros proyectos"), color = Orbita.TextSoft)
            } else {
                Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())) {
                    projects.forEach { p ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = 44.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .tappable(haptic = Haptic.Select) { onPick(p) }
                                .padding(horizontal = 8.dp)
                                .testTag("move-to-${p.id}"),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Outlined.Folder, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(12.dp))
                            Text(p.name, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancelar"), color = Orbita.TextSoft) } },
    )
}
