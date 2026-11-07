package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.Artifact
import com.aicowork.remote.data.model.Attachment
import com.aicowork.remote.data.model.FilesResponse
import com.aicowork.remote.data.model.FolderFile
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
    kind == "html" -> t("Página web")
    kind == "markdown" -> t("Documento")
    kind == "code" -> t("Código")
    kind == "image" -> t("Imagen")
    kind == "text" -> t("Texto")
    else -> t("Archivo")
}

fun kindIcon(kind: String, name: String = ""): Pair<ImageVector, Color> = when {
    name.endsWith(".pdf", true) -> Icons.Outlined.PictureAsPdf to Orbita.TextSoft
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
    onClick: () -> Unit,
) {
    val (icon, tint) = kindIcon(kind, name)
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 68.dp)
            .card(selected = selected)
            .tappable(haptic = Haptic.Tap, onClick = onClick)
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
    // Lo subido va al equipo con el próximo mensaje.
    LaunchedEffect(state.uploads) {
        state.uploads.filter { it.done && it.attachmentId != null }.forEach { u ->
            model.pendingAttachments = model.pendingAttachments + u.attachmentId!!
            model.feedback.play(Sfx.FileCreated)
            delay(2_500)
            model.controller.dismissUpload(u.id)
        }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris: List<Uri> ->
        uris.forEach { uri ->
            val resolver = context.contentResolver
            var name = "archivo"
            var size = -1L
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    name = c.getString(0) ?: name
                    if (!c.isNull(1)) size = c.getLong(1)
                }
            }
            model.controller.upload(name, size, resolver.getType(uri)) { resolver.openInputStream(uri) ?: throw java.io.IOException(t("No se puede abrir {name}", "name" to name)) }
        }
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
                        Text(when { u.error != null -> t("Falló"); u.done -> t("Subido"); else -> "${(u.progress * 100).toInt()} %" }, color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                    }
                    if (u.error == null && !u.done) {
                        Spacer(Modifier.height(8.dp))
                        ProgressLine(u.progress.takeIf { it > 0f }, Orbita.Accent)
                    }
                    if (u.error != null) {
                        Spacer(Modifier.height(6.dp))
                        Text(u.error, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                        Text(t("Quitar"), color = Orbita.Accent, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clip(Orbita.PillShape).tappable { model.controller.dismissUpload(u.id) }.padding(vertical = 8.dp))
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
                        FileRow(a.name, "${kindLabel(kind, a.name)} · ${sizeLabel(a.size)}${if (pending) " · irá con tu próximo mensaje" else ""}", kind, selected = pending, trailing = {
                            Box {
                                IconAction(Icons.Outlined.MoreHoriz, t("Opciones de {name}", "name" to a.name), onClick = { menu = true }, size = 40.dp)
                                DropdownMenu(menu, onDismissRequest = { menu = false }, containerColor = Orbita.GlassPopover) {
                                    DropdownMenuItem(text = { Text(t("Abrir")) }, onClick = { menu = false; model.viewer = ViewerTarget.File("attachment", a.relPath, a.name, kind) }, leadingIcon = { Icon(Icons.AutoMirrored.Outlined.OpenInNew, null) })
                                    DropdownMenuItem(
                                        text = { Text(if (pending) t("No enviar con mi próximo mensaje") else t("Enviar con mi próximo mensaje")) },
                                        onClick = { menu = false; model.pendingAttachments = if (pending) model.pendingAttachments - a.id else model.pendingAttachments + a.id; model.feedback.select() },
                                        leadingIcon = { Icon(Icons.Outlined.AttachFile, null) },
                                    )
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

private fun matches(filter: ResultFilter, a: Artifact) = when (filter) {
    ResultFilter.All -> true
    ResultFilter.Documents -> a.kind != "code"
    ResultFilter.Code -> a.kind == "code"
}

@Composable
fun ResultsPanel(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    val artifacts = snapshot?.conversation?.artifacts.orEmpty().sortedByDescending { it.createdAt ?: 0 }
    val shown = artifacts.filter { matches(model.resultFilter, it) }
    PanelColumn {
        PanelHeader(model, t("Resultados"), t("Lo que ha creado el equipo"), icon = Icons.Outlined.Inventory2)
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth().testTag("results-list"),
            state = model.resultsList,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (shown.isEmpty()) item {
                Note(Icons.Outlined.Inventory2, if (artifacts.isEmpty()) t("Todavía no hay resultados") else t("Nada en este filtro"), if (artifacts.isEmpty()) t("Cuando un agente cree un documento, una página o código, aparecerá aquí.") else null)
            }
            items(shown, key = { it.id }) { a -> ResultCard(a, model, snapshot!!) }
        }
        Segmented(ResultFilter.entries.map { it to it.label }, model.resultFilter, { model.resultFilter = it }, Modifier.padding(16.dp))
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
    Column(Modifier.fillMaxWidth().card().padding(14.dp).testTag("result-${a.id}")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RobotFace(agent, 42.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(a.name, color = Orbita.Text, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${agent?.name ?: "Equipo"} · ${kindLabel(a.kind, a.name)}", color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            }
            Box {
                IconAction(Icons.Outlined.MoreHoriz, t("Opciones de {name}", "name" to a.name), onClick = { menu = true }, size = 40.dp)
                DropdownMenu(menu, onDismissRequest = { menu = false }, containerColor = Orbita.GlassPopover) {
                    DropdownMenuItem(text = { Text(t("Abrir")) }, onClick = { menu = false; model.viewer = ViewerTarget.Result(a.id, a.name, a.kind) }, leadingIcon = { Icon(Icons.AutoMirrored.Outlined.OpenInNew, null) })
                    a.taskId?.let { id -> DropdownMenuItem(text = { Text(t("Ver la tarea")) }, onClick = { menu = false; model.openTask(id) }, leadingIcon = { Icon(Icons.Outlined.Description, null) }) }
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
