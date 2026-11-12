package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.border
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.ui.text.font.FontWeight
import com.aicowork.remote.ui.components.parseColor
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.Artifact
import com.aicowork.remote.data.model.Attachment
import com.aicowork.remote.data.model.FilesResponse
import com.aicowork.remote.data.model.FolderFile
import com.aicowork.remote.data.model.InboxAction
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Locale

// ---------------------------------------------------------------------------------------------- Utilidades

fun sizeLabel(bytes: Long): String = when {
    bytes >= 1_048_576 -> String.format(com.aicowork.remote.i18n.I18n.locale, "%.1f MB", bytes / 1_048_576.0)
    bytes >= 1024 -> "${bytes / 1024} KB"
    else -> "$bytes B"
}

/** Tipo legible a partir del tipo del motor (html, markdown, code, image, text, other) o del nombre. */
fun kindLabel(kind: String, name: String = ""): String = when {
    name.endsWith(".pdf", true) -> "PDF"
    mediaKind(name) == "video" -> t("Vídeo")
    mediaKind(name) == "audio" -> t("Audio")
    kind == "html" -> t("Página web")
    kind == "markdown" -> t("Documento")
    kind == "code" -> t("Código")
    kind == "image" -> t("Imagen")
    kind == "text" -> t("Texto")
    else -> t("Archivo")
}

fun kindIcon(kind: String, name: String = ""): Pair<ImageVector, Color> = when {
    name.endsWith(".pdf", true) -> Icons.Outlined.PictureAsPdf to Orbita.TextSoft
    mediaKind(name) == "video" -> Icons.Outlined.Movie to Orbita.TextSoft
    mediaKind(name) == "audio" -> Icons.Outlined.MusicNote to Orbita.TextSoft
    kind == "image" -> Icons.Outlined.Image to Orbita.TextSoft
    kind == "code" -> Icons.Outlined.Code to Orbita.TextSoft
    kind == "html" -> Icons.Outlined.Language to Orbita.TextSoft
    else -> Icons.Outlined.Description to Orbita.TextSoft
}

/** Tipo del motor para un adjunto (por su MIME o su extensión). */
fun attachmentKind(a: Attachment): String = kindOfName(a.name, a.mime)

fun kindOfName(name: String, mime: String = ""): String {
    val ext = name.substringAfterLast('.', "").lowercase()
    return when {
        mime.startsWith("image/") || ext in setOf("png", "jpg", "jpeg", "gif", "webp", "svg") -> "image"
        ext in setOf("html", "htm") -> "html"
        ext in setOf("md", "markdown") -> "markdown"
        ext in setOf("kt", "ts", "tsx", "js", "jsx", "py", "java", "json", "css", "sh", "go", "rs", "c", "cpp", "h", "swift", "rb", "php", "yml", "yaml", "toml", "xml", "sql") -> "code"
        ext in setOf("txt", "log", "csv") || mime.startsWith("text/") -> "text"
        else -> "other"
    }
}

@Composable
private fun FileRow(
    name: String,
    subtitle: String,
    kind: String,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    trailing: @Composable () -> Unit = {},
    /** Mantener pulsado: el menú del archivo (como el clic derecho del escritorio). */
    onLongClick: (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    val (icon, tint) = kindIcon(kind, name)
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 68.dp)
            .card(selected = selected)
            .then(if (onLongClick != null) Modifier.holdable(onClick, onLongClick) else Modifier.tappable(haptic = Haptic.Tap, onClick = onClick))
            .padding(start = 14.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(tint.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f).padding(vertical = 10.dp)) {
            Text(name, color = Orbita.Text, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        trailing()
    }
}

// ---------------------------------------------------------------------------------------------- Archivos

@Composable
fun FilesPanel(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    val caps = snapshot?.capabilities
    val context = LocalContext.current
    var listing by remember { mutableStateOf<FilesResponse?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val attachmentsVersion = snapshot?.conversation?.attachments
    // Busca al dejar de escribir (no en cada letra).
    LaunchedEffect(model.filesQuery, model.filesTab, snapshot?.conversation?.id, attachmentsVersion?.size) {
        if (caps?.files != true) return@LaunchedEffect
        delay(if (model.filesQuery.isBlank()) 0 else 320)
        loading = true
        model.controller.listFiles(model.filesQuery).fold({ listing = it; error = null }, { error = it.message })
        loading = false
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris: List<Uri> ->
        uris.forEach { uploadUri(context, model, it) }
    }
    val query = model.filesQuery.trim().lowercase()
    val attachments = (listing?.attachments ?: snapshot?.conversation?.attachments.orEmpty())
        .filter { query.isEmpty() || it.name.lowercase().contains(query) }
    val folder = listing?.folder
    PanelColumn {
        PanelHeader(model, t("Archivos"), icon = Icons.Outlined.Description)
        if (caps?.files == true) {
            OrbitaField(model.filesQuery, { model.filesQuery = it }, t("Buscar archivos"), leading = Icons.Outlined.Search, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp).testTag("files-search"))
        }
        Segmented(FilesTab.entries.map { it to it.label }, model.filesTab, { model.filesTab = it }, Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth(),
            state = model.filesList,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (caps?.files != true) item {
                Note(Icons.Outlined.Info, t("Actualiza kywai en el ordenador"), t("Esta versión del ordenador aún no comparte la carpeta del proyecto ni deja subir archivos desde el móvil."))
            }
            items(state.uploads, key = { "up-${it.id}" }) { u ->
                Column(Modifier.fillMaxWidth().card().padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (u.error != null) Icons.Outlined.ErrorOutline else if (u.done) Icons.Outlined.CheckCircle else Icons.Outlined.AttachFile, contentDescription = null, tint = if (u.error != null) Orbita.Danger else if (u.done) Orbita.Success else Orbita.Accent, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(10.dp))
                        Text(u.name, color = Orbita.Text, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Text(when { u.error != null -> t("Falló"); u.queued -> t("En cola"); u.done -> t("Subido"); else -> "${(u.progress * 100).toInt()} %" }, color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                    }
                    if (u.error == null && !u.done) {
                        Spacer(Modifier.height(8.dp))
                        ProgressLine(u.progress.takeIf { it > 0f }, Orbita.Accent)
                    }
                    if (u.error != null) {
                        Spacer(Modifier.height(6.dp))
                        Text(u.error, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                        Text(t("Quitar"), color = Orbita.Accent, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clip(Orbita.PillShape).tappable { model.controller.dismissUpload(u.id) }.padding(vertical = 8.dp))
                    } else if (u.queued) {
                        Text(t("Sin conexión: se subirá con tu próximo mensaje al volver"), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                    } else if (u.done) {
                        Text(t("Irá al equipo con tu próximo mensaje"), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            when (model.filesTab) {
                FilesTab.Attachments -> {
                    if (attachments.isEmpty() && state.uploads.isEmpty()) item {
                        Note(Icons.Outlined.AttachFile, if (query.isEmpty()) t("Sin adjuntos") else t("Nada coincide"), if (query.isEmpty()) t("Añade documentos, imágenes o notas para dárselos al equipo.") else null)
                    }
                    items(attachments, key = { "att-${it.id}" }) { a ->
                        val kind = attachmentKind(a)
                        val pending = a.id in model.pendingAttachments
                        var menu by remember { mutableStateOf(false) }
                        var deleting by remember { mutableStateOf(false) }
                        if (deleting) DeleteFileDialog(a.name, onConfirm = { deleting = false; model.deleteFile(a.id, artifact = false) }, onDismiss = { deleting = false })
                        FileRow(a.name, "${kindLabel(kind, a.name)} · ${sizeLabel(a.size)}${if (pending) " · irá con tu próximo mensaje" else ""}", kind, selected = pending, onLongClick = { model.feedback.select(); menu = true }, trailing = {
                            Box {
                                IconAction(Icons.Outlined.MoreHoriz, t("Opciones de {name}", "name" to a.name), onClick = { menu = true }, size = 40.dp)
                                DropdownMenu(menu, onDismissRequest = { menu = false }, containerColor = Orbita.GlassPopover) {
                                    DropdownMenuItem(text = { Text(t("Abrir")) }, onClick = { menu = false; model.viewer = ViewerTarget.File("attachment", a.relPath, a.name, kind) }, leadingIcon = { Icon(Icons.AutoMirrored.Outlined.OpenInNew, null) })
                                    DropdownMenuItem(
                                        text = { Text(if (pending) t("No enviar con mi próximo mensaje") else t("Enviar con mi próximo mensaje")) },
                                        onClick = { menu = false; model.pendingAttachments = if (pending) model.pendingAttachments - a.id else model.pendingAttachments + a.id; model.feedback.select() },
                                        leadingIcon = { Icon(Icons.Outlined.AttachFile, null) },
                                    )
                                    if (model.fileActionsSupported()) {
                                        DropdownMenuItem(text = { Text(t("Eliminar…"), color = Orbita.Danger) }, onClick = { menu = false; deleting = true }, leadingIcon = { Icon(Icons.Outlined.Delete, null, tint = Orbita.Danger) })
                                    }
                                }
                            }
                        }) { model.viewer = ViewerTarget.File("attachment", a.relPath, a.name, kind) }
                    }
                }
                FilesTab.Project -> {
                    when {
                        caps?.files != true -> Unit
                        loading && folder == null -> item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Orbita.Accent) } }
                        error != null -> item { Note(Icons.Outlined.ErrorOutline, t("No se pudo leer la carpeta"), error, tint = Orbita.Danger) }
                        folder == null -> item { Note(Icons.Outlined.Folder, t("Este proyecto no tiene carpeta propia"), t("Los agentes trabajan en la carpeta interna del proyecto. Puedes elegir una carpeta desde kywai en el ordenador.")) }
                        folder.files.isEmpty() -> item { Note(Icons.Outlined.Folder, if (query.isEmpty()) t("La carpeta está vacía") else t("Nada coincide"), null) }
                        else -> {
                            items(folder.files, key = { "f-${it.path}" }) { f: FolderFile ->
                                FileRow(f.name, listOfNotNull(f.path.substringBeforeLast('/', "").ifBlank { null }, sizeLabel(f.size)).joinToString(" · "), f.kind) {
                                    model.viewer = ViewerTarget.File("folder", f.path, f.name, f.kind)
                                }
                            }
                            if (folder.truncated) item { Text(t("Hay más archivos: busca por nombre para encontrarlos."), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(4.dp)) }
                        }
                    }
                }
            }
            item {
                val name = snapshot?.conversation?.folder?.name
                Text(t("Carpeta del proyecto"), color = Orbita.TextSoft, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 4.dp, top = 8.dp, bottom = 2.dp))
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 60.dp).card().tappable { model.filesTab = FilesTab.Project }.padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.Folder, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(28.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(name ?: t("Sin carpeta propia"), color = Orbita.Text, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                }
            }
        }
        if (caps?.upload == true) {
            OrbitaButton(t("Añadir archivos"), onClick = { picker.launch(arrayOf("*/*")) }, icon = Icons.Outlined.Add, haptic = Haptic.Tap, modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp).testTag("add-files"))
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Info, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(8.dp))
            Text(t("Los adjuntos van al equipo con tu próximo mensaje"), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
        }
    }
}

// ---------------------------------------------------------------------------------------------- Resultados

/** Vista previa de un resultado (se descarga solo cuando su tarjeta se ve). */
sealed interface Preview {
    data object Loading : Preview
    data class Text(val text: String) : Preview
    data class Picture(val image: androidx.compose.ui.graphics.ImageBitmap) : Preview
    data class None(val reason: String?) : Preview
}

private fun matches(filter: ResultFilter, a: Artifact) = filter.type == null || FileTypes.of(a) == filter.type

@Composable
fun ResultsPanel(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    val artifacts = snapshot?.conversation?.artifacts.orEmpty().sortedByDescending { it.createdAt ?: 0 }
    // Cuántos hay de cada tipo; si el filtro elegido ya no tiene ninguno, se ve todo.
    val counts = artifacts.groupingBy { FileTypes.of(it) }.eachCount()
    val filter = model.resultFilter.takeIf { it.type == null || (counts[it.type] ?: 0) > 0 } ?: ResultFilter.All
    val shown = artifacts.filter { matches(filter, it) }
    PanelColumn {
        PanelHeader(model, t("Resultados"), t("Lo que ha creado el equipo"), icon = Icons.Outlined.Inventory2)
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth().testTag("results-list"),
            state = model.resultsList,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Lo recién terminado (de cualquier conversación) que aún no has visto: antes iba en «Te necesita».
            val finished = state.inbox.filter { !it.needsYou }
            if (finished.isNotEmpty()) {
                item(key = "finished-head") {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(t("Recién terminado") + " · ${finished.size}", color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                        if (finished.size > 1) {
                            TextButton(onClick = { finished.forEach { model.inboxSeen(it) } }, enabled = model.inboxBusy == null) { Text(t("Marcar todo como visto")) }
                        }
                    }
                }
                items(finished, key = { "finished-${it.id}" }) { item ->
                    InboxCard(item.copy(actions = listOf(InboxAction("dismiss", t("Visto")))), model, System.currentTimeMillis(), onPress = { model.inboxSeen(item) })
                }
            }
            if (shown.isEmpty()) item {
                Note(Icons.Outlined.Inventory2, if (artifacts.isEmpty()) t("Todavía no hay resultados") else t("Nada en este filtro"), if (artifacts.isEmpty()) t("Cuando un agente cree un documento, una página o código, aparecerá aquí.") else null)
            }
            // Una carpeta por tarea (como en el escritorio): la más reciente abierta, el resultado principal delante
            // y los archivos de trabajo (escenas, voces, json…) plegados aparte.
            val titles = snapshot?.tasks.orEmpty().associate { it.id to it.title }
            val groups = ResultGroups.group(shown) { titles[it] }
            // Con un tipo elegido, la cabecera dice «3 de 9 archivos».
            val fullSize = if (filter == ResultFilter.All) emptyMap() else ResultGroups.group(artifacts) { titles[it] }.associate { it.key to it.all.size }
            groups.forEachIndexed { i, g ->
                val open = model.resultFolders[g.key] ?: (i == 0)
                val of = fullSize[g.key]?.takeIf { it != g.all.size }
                item(key = "folder-${g.key}") { ResultFolderHead(g, open, model, snapshot!!, of) { model.resultFolders[g.key] = !open } }
                if (open) {
                    items(g.main, key = { "main-${it.id}" }) { a -> ResultCard(a, model, snapshot!!) }
                    if (g.work.isNotEmpty()) {
                        val workOpen = model.resultWork[g.key] == true
                        item(key = "work-${g.key}") {
                            TextButton(onClick = { model.resultWork[g.key] = !workOpen }, modifier = Modifier.testTag("work-${g.key}")) {
                                Icon(Icons.Outlined.ExpandMore, contentDescription = null, modifier = Modifier.size(18.dp).rotate(if (workOpen) 0f else -90f))
                                Spacer(Modifier.width(4.dp))
                                Text(t("Archivos de trabajo") + " · ${g.work.size}")
                            }
                        }
                        if (workOpen) items(g.work, key = { "work-${it.id}" }) { a -> DeliverableRow(a, g.all, snapshot!!, model) }
                    }
                }
            }
        }
        TypeChips(counts, artifacts.size, filter) { model.resultFilter = it }
    }
}

/** Cabecera de una carpeta de Resultados: título de la tarea, cuántos archivos, quién y cuándo; se pliega al tocarla. */
@Composable
private fun ResultFolderHead(g: ResultGroup, open: Boolean, model: OrbitaModel, snapshot: com.aicowork.remote.data.model.Snapshot, of: Int? = null, onToggle: () -> Unit) {
    val all = g.all
    val authors = all.mapNotNull { a -> snapshot.agents.firstOrNull { it.id == a.agentId }?.name }.distinct()
    val tint = snapshot.agents.firstOrNull { it.id == all.first().agentId }?.let { parseColor(it.color) } ?: Orbita.Accent
    val count = when {
        of != null -> t("{n} de {total} archivos", "n" to all.size, "total" to of)
        all.size == 1 -> t("1 archivo")
        else -> t("{n} archivos", "n" to all.size)
    }
    Row(
        Modifier
            .fillMaxWidth()
            .card(radius = 18.dp, selected = open)
            .tappable(role = Role.Button, haptic = Haptic.Tap, onClick = onToggle)
            .semantics { stateDescription = if (open) t("Desplegada") else t("Plegada") }
            .padding(10.dp)
            .testTag("result-folder-${g.key}"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.16f)).border(1.dp, tint.copy(alpha = 0.35f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
            Icon(if (open) Icons.Outlined.FolderOpen else Icons.Outlined.Folder, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(g.title, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOf(count, authors.joinToString(", ")).filter { it.isNotEmpty() }.joinToString(" · "), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        ArtifactDownloadButton(all, model, enabled = snapshot.capabilities.artifacts)
        Icon(Icons.Outlined.ExpandMore, contentDescription = if (open) t("Plegar la carpeta") else t("Desplegar la carpeta"), tint = Orbita.TextSoft, modifier = Modifier.rotate(if (open) 180f else 0f))
    }
}

@Composable
private fun ResultCard(a: Artifact, model: OrbitaModel, snapshot: com.aicowork.remote.data.model.Snapshot) {
    val agent = snapshot.agents.firstOrNull { it.id == a.agentId }
    val canFetch = snapshot.capabilities.artifacts
    val preview = model.previews[a.id]
    LaunchedEffect(a.id, canFetch) {
        if (!canFetch || model.previews.containsKey(a.id)) return@LaunchedEffect
        if (a.kind == "html" || a.kind == "other" || a.size > 3_000_000) { model.previews[a.id] = Preview.None(null); return@LaunchedEffect }
        model.previews[a.id] = Preview.Loading
        model.previews[a.id] = model.controller.fetchArtifact(a.id).fold(
            { raw ->
                withContext(Dispatchers.Default) {
                    if (raw.isImage) {
                        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                        BitmapFactory.decodeByteArray(raw.bytes, 0, raw.bytes.size, opts)
                        var sample = 1
                        while (opts.outWidth / sample > 720) sample *= 2
                        BitmapFactory.decodeByteArray(raw.bytes, 0, raw.bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
                            ?.let { Preview.Picture(it.asImageBitmap()) } ?: Preview.None(t("Imagen ilegible"))
                    } else Preview.Text(raw.text().take(700))
                }
            },
            { Preview.None(it.message) },
        )
    }
    var menu by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val download = rememberArtifactDownload(listOf(a), model)
    val actions = model.fileActionsSupported()
    if (deleting) DeleteFileDialog(a.name, onConfirm = { deleting = false; model.deleteFile(a.id, artifact = true) }, onDismiss = { deleting = false })
    Column(
        Modifier
            .fillMaxWidth()
            .card()
            .holdable(onClick = { model.viewer = ViewerTarget.Result(a.id, a.name, a.kind) }, onLongClick = { model.feedback.select(); menu = true })
            .padding(14.dp)
            .testTag("result-${a.id}"),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RobotFace(agent, 42.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(a.name, color = Orbita.Text, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${agent?.name ?: "Equipo"} · ${kindLabel(a.kind, a.name)}", color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            }
            ArtifactDownloadButton(listOf(a), model, enabled = canFetch)
            Box {
                IconAction(Icons.Outlined.MoreHoriz, t("Opciones de {name}", "name" to a.name), onClick = { menu = true }, size = 40.dp)
                DropdownMenu(menu, onDismissRequest = { menu = false }, containerColor = Orbita.GlassPopover) {
                    DropdownMenuItem(text = { Text(t("Abrir")) }, onClick = { menu = false; model.viewer = ViewerTarget.Result(a.id, a.name, a.kind) }, leadingIcon = { Icon(Icons.AutoMirrored.Outlined.OpenInNew, null) })
                    if (actions) DropdownMenuItem(text = { Text(t("Adjuntar al mensaje")) }, onClick = { menu = false; model.attachArtifact(a.id) }, leadingIcon = { Icon(Icons.Outlined.AttachFile, null) })
                    DropdownMenuItem(text = { Text(t("Descargar")) }, enabled = canFetch && !download.busy, onClick = { menu = false; download.start() }, leadingIcon = { Icon(Icons.Outlined.Download, null) })
                    a.taskId?.let { id -> DropdownMenuItem(text = { Text(t("Ver la tarea")) }, onClick = { menu = false; model.openTask(id) }, leadingIcon = { Icon(Icons.Outlined.Description, null) }) }
                    if (actions) DropdownMenuItem(text = { Text(t("Eliminar…"), color = Orbita.Danger) }, onClick = { menu = false; deleting = true }, leadingIcon = { Icon(Icons.Outlined.Delete, null, tint = Orbita.Danger) })
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().height(132.dp).clip(RoundedCornerShape(16.dp)).background(Orbita.Card), contentAlignment = Alignment.Center) {
            when (preview) {
                is Preview.Picture -> Image(preview.image, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                is Preview.Text -> Text(
                    preview.text,
                    color = Orbita.TextSoft,
                    style = if (a.kind == "code") Mono else MaterialTheme.typography.bodySmall,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.fillMaxSize().padding(12.dp),
                )
                Preview.Loading -> CircularProgressIndicator(Modifier.size(22.dp), color = Orbita.Accent, strokeWidth = 2.dp)
                else -> {
                    val (icon, tint) = kindIcon(a.kind, a.name)
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(34.dp))
                        Text("${kindLabel(a.kind, a.name)} · ${sizeLabel(a.size)}", color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        OrbitaButton(t("Abrir resultado"), onClick = { model.viewer = ViewerTarget.Result(a.id, a.name, a.kind) }, icon = Icons.AutoMirrored.Outlined.OpenInNew, haptic = Haptic.Tap, height = 46.dp, enabled = snapshot.capabilities.artifacts, modifier = Modifier.fillMaxWidth())
        if (!snapshot.capabilities.artifacts) {
            Text(t("Para abrirlo desde el móvil, actualiza kywai en el ordenador."), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

/**
 * Botones «Todo · Fotos · Vídeos · …» con su número, como en el escritorio. Solo salen los tipos que hay y se deslizan
 * de lado si no caben; con un solo tipo no hace falta filtrar y no se enseña nada.
 */
@Composable
private fun TypeChips(counts: Map<FileType, Int>, total: Int, selected: ResultFilter, onSelect: (ResultFilter) -> Unit) {
    val present = ResultFilter.entries.filter { it.type != null && (counts[it.type] ?: 0) > 0 }
    if (present.size < 2) return
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(16.dp)
            .semantics { contentDescription = t("Filtrar por tipo de archivo") }
            .testTag("result-types"),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        (listOf(ResultFilter.All) + present).forEach { f ->
            val on = f == selected
            Row(
                Modifier
                    .heightIn(min = 40.dp)
                    .clip(Orbita.PillShape)
                    .background(if (on) Orbita.AccentSoft else Orbita.Card)
                    .border(1.dp, if (on) Orbita.AccentEdge else Orbita.Divider, Orbita.PillShape)
                    .tappable(role = Role.Tab, haptic = Haptic.Select) { onSelect(f) }
                    .semantics { this.selected = on }
                    .padding(horizontal = 14.dp)
                    .testTag("result-type-${f.name}"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(f.label, color = if (on) Orbita.Text else Orbita.TextSoft, style = MaterialTheme.typography.labelLarge, maxLines = 1)
                Spacer(Modifier.width(6.dp))
                Text(((if (f.type == null) total else counts[f.type]) ?: 0).toString(), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

/** Tocar abre; mantener pulsado abre el menú del archivo (con vibración y onda, como [tappable]). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Modifier.holdable(onClick: () -> Unit, onLongClick: () -> Unit): Modifier {
    val feedback = LocalFeedback.current
    return this.combinedClickable(
        onClick = { feedback.tap(); onClick() },
        onLongClick = onLongClick,
        onLongClickLabel = t("Más opciones"),
    )
}

/** «¿Eliminar…?» antes de borrar un resultado o un adjunto del ordenador. */
@Composable
private fun DeleteFileDialog(name: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    ConfirmDialog(
        title = t("¿Eliminar «{title}»?", "title" to name),
        text = t("Se borra del ordenador y desaparece de Archivos y Resultados."),
        confirm = t("Eliminar"),
        onConfirm = onConfirm,
        onDismiss = onDismiss,
        danger = true,
    )
}
