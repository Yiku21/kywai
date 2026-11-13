package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.webkit.WebView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.TraceEntry
import com.aicowork.remote.data.net.RawContent
import com.aicowork.remote.ui.components.Format
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** Capas que se abren encima de todo: lector, actividad de una tarea y nueva tarea. */
@Composable
fun Overlays(model: OrbitaModel, state: CoworkUiState) {
    val covering = model.viewer != null || model.traceTaskId != null || model.newTaskOpen || model.hermesModelOpen || model.videoPickerOpen || model.inboxOpen || model.searchOpen || model.historyOpen || model.musicOpen
    // Velo oscuro detrás de lo que se abre (tocarlo cierra).
    AnimatedVisibility(covering, enter = OrbitaMotion.scrimEnter, exit = OrbitaMotion.scrimExit) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0x99030712))
                .pointerInput(Unit) {
                    detectTapGestures(onTap = {
                        model.viewer = null
                        model.traceTaskId = null
                        model.newTaskOpen = false
                        model.hermesModelOpen = false
                        model.videoPickerOpen = false
                        model.closeInbox()
                        model.searchOpen = false
                        model.historyOpen = false
                        model.musicOpen = false
                    })
                },
        )
    }
    Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(12.dp), contentAlignment = Alignment.Center) {
        AnimatedVisibility(model.viewer != null, enter = OrbitaMotion.viewerEnter, exit = OrbitaMotion.viewerExit) {
            val target = remember { mutableStateOf(model.viewer) }
            if (model.viewer != null) target.value = model.viewer
            target.value?.let { Viewer(it, model) }
        }
        AnimatedVisibility(model.traceTaskId != null, enter = OrbitaMotion.sheetEnter(), exit = OrbitaMotion.sheetExit()) {
            val id = remember { mutableStateOf(model.traceTaskId) }
            if (model.traceTaskId != null) id.value = model.traceTaskId
            id.value?.let { TraceSheet(it, model, state) }
        }
        AnimatedVisibility(model.hermesModelOpen, enter = OrbitaMotion.sheetEnter(), exit = OrbitaMotion.sheetExit()) {
            HermesModelSheet(model)
        }
        AnimatedVisibility(model.videoPickerOpen, enter = OrbitaMotion.sheetEnter(), exit = OrbitaMotion.sheetExit()) {
            VideoPickerSheet(model)
        }
        AnimatedVisibility(model.inboxOpen, enter = OrbitaMotion.sheetEnter(), exit = OrbitaMotion.sheetExit()) {
            InboxSheet(model, state)
        }
        AnimatedVisibility(model.searchOpen, enter = OrbitaMotion.sheetEnter(), exit = OrbitaMotion.sheetExit()) {
            SearchSheet(model)
        }
        AnimatedVisibility(model.historyOpen, enter = OrbitaMotion.sheetEnter(), exit = OrbitaMotion.sheetExit()) {
            HistorySheet(model)
        }
        AnimatedVisibility(model.musicOpen, enter = OrbitaMotion.sheetEnter(), exit = OrbitaMotion.sheetExit()) {
            MusicSheet(model)
        }
    }
    Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).windowInsetsPadding(WindowInsets.ime).padding(12.dp), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(model.newTaskOpen, enter = OrbitaMotion.sheetEnter(3), exit = OrbitaMotion.sheetExit(3)) {
            NewTaskSheet(model, state)
        }
    }
}

// ---------------------------------------------------------------------------------------------- Lector

private sealed interface Loaded {
    data object Loading : Loaded
    data class Ready(val raw: RawContent) : Loaded
    data class Failed(val message: String) : Loaded
}

@Composable
private fun Viewer(target: ViewerTarget, model: OrbitaModel) {
    var loaded by remember(target) { mutableStateOf<Loaded>(Loaded.Loading) }
    var attempt by remember(target) { mutableIntStateOf(0) }
    // Vídeo y audio no se descargan enteros: se reproducen por partes (si el ordenador está a mano).
    val media = mediaKind(when (target) { is ViewerTarget.Result -> target.title; is ViewerTarget.File -> target.path })
    val stream = remember(target) {
        if (media == null) null else when (target) {
            is ViewerTarget.Result -> model.controller.artifactStream(target.artifactId)
            is ViewerTarget.File -> model.controller.fileStream(target.source, target.path)
        }
    }
    var fullscreen by remember(target) { mutableStateOf(false) }
    FullscreenVideo(fullscreen && media == "video") { fullscreen = false }
    LaunchedEffect(target, attempt) {
        if (stream != null) return@LaunchedEffect
        loaded = Loaded.Loading
        val result = when (target) {
            is ViewerTarget.Result -> model.controller.fetchArtifact(target.artifactId)
            is ViewerTarget.File -> model.controller.fetchFile(target.source, target.path)
        }
        loaded = result.fold({ Loaded.Ready(it) }, { Loaded.Failed(it.message ?: t("No se pudo abrir")) })
        if (loaded is Loaded.Failed) model.feedback.reject()
    }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val saver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val raw = (loaded as? Loaded.Ready)?.raw
        if (uri == null || (raw == null && stream == null)) return@rememberLauncherForActivityResult
        if (stream != null) model.toast(t("Guardando en el móvil…"))
        scope.launch {
            val ok = withContext(Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openOutputStream(uri)?.use { out -> if (raw != null) out.write(raw.bytes) else stream!!.copyTo(out) } != null
                }.getOrDefault(false)
            }
            if (ok) { model.feedback.confirm(); model.toast(t("Guardado en el móvil"), Toast.Tone.Success) } else { model.feedback.reject(); model.toast(t("No se pudo guardar"), Toast.Tone.Error) }
        }
    }
    val kind = when (target) { is ViewerTarget.Result -> target.kind; is ViewerTarget.File -> target.kind }
    // Markdown, HTML y SVG se pueden ver como quedan o como código (como en el escritorio).
    val hasSource = kind == "markdown" || kind == "html" || target.title.endsWith(".svg", true)
    var source by remember(target) { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    val ready = (loaded as? Loaded.Ready)?.raw
    val textual = ready != null && (ready.isText || ready.isHtml || kind in setOf("markdown", "code", "text", "html") || ready.contentType.contains("svg"))
    // Otros archivos del mismo mensaje: se pasa con ‹ › (o deslizando).
    val items = model.viewerItems
    val position = items.indexOf(target)
    val paged = items.size > 1 && position >= 0
    Column(Modifier.fillMaxSize().widthIn(max = 1100.dp).glass(radius = 30.dp, tint = Orbita.GlassSolid).testTag("viewer")) {
        if (!fullscreen) Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 12.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            val (icon, tint) = kindIcon(kind, target.title)
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(target.title, color = Orbita.Text, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val raw = (loaded as? Loaded.Ready)?.raw.takeIf { stream == null }
                Text(listOfNotNull(kindLabel(kind, target.title), raw?.let { sizeLabel(it.bytes.size.toLong()) }).joinToString(" · "), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            }
            if (textual) IconAction(Icons.Outlined.ContentCopy, t("Copiar el contenido"), onClick = {
                clipboard.setText(AnnotatedString(ready!!.text()))
                model.feedback.confirm()
                model.toast(t("Copiado"), Toast.Tone.Success)
            }, modifier = Modifier.testTag("viewer-copy"))
            IconAction(Icons.Outlined.Download, t("Guardar en el móvil"), onClick = { saver.launch(target.title) }, enabled = stream != null || loaded is Loaded.Ready)
            IconAction(Icons.AutoMirrored.Outlined.OpenInNew, t("Abrir con otra app"), onClick = {
                when {
                    stream != null -> {
                        model.toast(t("Descargando del ordenador…"))
                        scope.launch {
                            val file = withContext(Dispatchers.IO) { runCatching { cacheCopy(context, target.title) { out -> stream.copyTo(out) } }.getOrNull() }
                            if (file == null) { model.feedback.reject(); model.toast(t("No se pudo descargar del ordenador."), Toast.Tone.Error) } else openFileWithOtherApp(context, file, mimeOf(target.title), model)
                        }
                    }
                    ready != null -> openWithOtherApp(context, ready, target.title, model)
                }
            }, enabled = stream != null || ready != null)
            IconAction(Icons.Outlined.Close, t("Cerrar"), onClick = { model.viewer = null }, modifier = Modifier.testTag("viewer-close"))
        }
        if (!fullscreen && (paged || hasSource)) {
            Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                // Las flechas se miden primero: en un móvil estrecho, lo que se encoge es el selector de vista.
                Box(Modifier.weight(1f)) {
                    if (hasSource) Segmented(listOf(false to t("Vista previa"), true to t("Código")), source, { source = it }, Modifier.widthIn(max = 280.dp).testTag("viewer-source"))
                }
                if (paged) {
                    IconAction(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, t("Archivo anterior"), onClick = { model.viewer = items[(position - 1 + items.size) % items.size] }, modifier = Modifier.testTag("viewer-prev"))
                    Text(t("{n} de {total}", "n" to (position + 1), "total" to items.size), color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge)
                    IconAction(Icons.AutoMirrored.Outlined.KeyboardArrowRight, t("Archivo siguiente"), onClick = { model.viewer = items[(position + 1) % items.size] }, modifier = Modifier.testTag("viewer-next"))
                }
            }
        }
        Box(
            Modifier.weight(1f).fillMaxWidth()
                .then(if (fullscreen) Modifier.clip(RoundedCornerShape(30.dp)) else Modifier.padding(start = 12.dp, end = 12.dp, bottom = 12.dp).clip(RoundedCornerShape(22.dp)))
                .background(Color(0x33060B16)),
            contentAlignment = Alignment.Center,
        ) {
            if (stream != null) StreamPlayer(stream, audio = media == "audio", onFullscreen = { fullscreen = it })
            else when (val l = loaded) {
                Loaded.Loading -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Orbita.Accent)
                    Spacer(Modifier.height(10.dp))
                    Text(t("Descargando del ordenador…"), color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium)
                }
                is Loaded.Failed -> Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = Orbita.Danger, modifier = Modifier.size(36.dp))
                    Spacer(Modifier.height(10.dp))
                    Text(l.message, color = Orbita.Text, style = MaterialTheme.typography.bodyLarge)
                    Spacer(Modifier.height(14.dp))
                    OrbitaButton(t("Reintentar"), onClick = { attempt++ }, haptic = Haptic.Tap)
                }
                is Loaded.Ready -> if (source) CodeText(l.raw.text(), true) else Content(l.raw, kind)
            }
        }
    }
}

@Composable
private fun Content(raw: RawContent, kind: String) {
    when {
        raw.isImage && !raw.contentType.contains("svg") -> ZoomableImage(raw)
        raw.isPdf -> PdfPages(raw)
        raw.isHtml || kind == "html" -> HtmlView(raw.text())
        kind == "markdown" -> SelectionContainer {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp)) { MarkdownText(raw.text()) }
        }
        raw.isText || kind == "code" || kind == "text" || raw.contentType.contains("svg") -> CodeText(raw.text(), kind == "code")
        else -> Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Outlined.Info, contentDescription = null, tint = Orbita.Accent, modifier = Modifier.size(34.dp))
            Spacer(Modifier.height(10.dp))
            Text(t("Este tipo de archivo no se puede ver aquí ({contentType}). Guárdalo en el móvil para abrirlo con otra app.", "contentType" to raw.contentType), color = Orbita.TextSoft, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

/** Texto o código tal cual, que se puede seleccionar. */
@Composable
private fun CodeText(text: String, code: Boolean) {
    SelectionContainer {
        Text(
            text,
            color = Orbita.Text,
            style = Mono,
            softWrap = !code,
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).horizontalScroll(rememberScrollState()).padding(16.dp),
        )
    }
}

/** Lo abre con otra app del móvil (visor de PDF, galería, editor…): se copia a la caché y se comparte solo para leerlo. */
private fun openWithOtherApp(context: android.content.Context, raw: RawContent, title: String, model: OrbitaModel) {
    val file = runCatching { cacheCopy(context, title) { it.write(raw.bytes) } }.getOrNull()
    if (file == null) {
        model.feedback.reject()
        model.toast(t("Ninguna app del móvil puede abrirlo"), Toast.Tone.Error)
        return
    }
    openFileWithOtherApp(context, file, raw.contentType, model)
}

/** Copia en la caché que se comparte con otras apps (FileProvider `.fotos`). */
private fun cacheCopy(context: android.content.Context, title: String, write: (java.io.OutputStream) -> Unit): File {
    val dir = File(context.cacheDir, "fotos/abrir").apply { mkdirs() }
    val safe = title.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "archivo" }
    return File(dir, safe).apply { outputStream().use(write) }
}

/** Tipo para otras apps cuando no viene del ordenador (vídeo y audio reproducidos por partes). */
private fun mimeOf(name: String): String =
    android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase()) ?: "*/*"

private fun openFileWithOtherApp(context: android.content.Context, file: File, contentType: String, model: OrbitaModel) {
    runCatching {
        val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fotos", file)
        val type = contentType.substringBefore(';').trim().ifBlank { "*/*" }
        val intent = android.content.Intent(android.content.Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(android.content.Intent.createChooser(intent, t("Abrir con otra app")).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
    }.onFailure {
        model.feedback.reject()
        model.toast(t("Ninguna app del móvil puede abrirlo"), Toast.Tone.Error)
    }
}

@Composable
private fun ZoomableImage(raw: RawContent) {
    val bitmap = remember(raw) { BitmapFactory.decodeByteArray(raw.bytes, 0, raw.bytes.size)?.asImageBitmap() }
    if (bitmap == null) {
        Text(t("Imagen ilegible"), color = Orbita.TextSoft)
        return
    }
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    Image(
        bitmap,
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTransformGestures { _, pan, zoom, _ ->
                    scale = (scale * zoom).coerceIn(1f, 6f)
                    offset = if (scale == 1f) Offset.Zero else offset + pan
                }
            }
            .graphicsLayer { scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y },
    )
}

@Composable
private fun PdfPages(raw: RawContent) {
    val context = LocalContext.current
    var pages by remember(raw) { mutableStateOf<List<Bitmap>?>(null) }
    var error by remember(raw) { mutableStateOf<String?>(null) }
    LaunchedEffect(raw) {
        withContext(Dispatchers.IO) {
            runCatching {
                val file = File(context.cacheDir, "viewer.pdf").apply { writeBytes(raw.bytes) }
                ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                    PdfRenderer(fd).use { pdf ->
                        (0 until minOf(pdf.pageCount, 40)).map { i ->
                            pdf.openPage(i).use { page ->
                                val width = 1400
                                val bmp = Bitmap.createBitmap(width, (width.toFloat() * page.height / page.width).toInt(), Bitmap.Config.ARGB_8888)
                                bmp.eraseColor(android.graphics.Color.WHITE)
                                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                                bmp
                            }
                        }
                    }
                }
            }.onSuccess { pages = it }.onFailure { error = it.message ?: t("PDF ilegible") }
        }
    }
    when {
        error != null -> Text(error!!, color = Orbita.TextSoft)
        pages == null -> CircularProgressIndicator(color = Orbita.Accent)
        else -> LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
            items(pages!!) { bmp -> Image(bmp.asImageBitmap(), contentDescription = null, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))) }
        }
    }
}

/** Páginas web creadas por el equipo: se ven como en el navegador (sin acceso a la app ni a sus archivos). */
@Composable
private fun HtmlView(html: String) {
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                setBackgroundColor(android.graphics.Color.WHITE)
                settings.javaScriptEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.domStorageEnabled = true
                loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
            }
        },
        modifier = Modifier.fillMaxSize(),
    )
}

// ---------------------------------------------------------------------------------------------- Actividad de una tarea

@Composable
private fun TraceSheet(taskId: String, model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    val task = snapshot?.tasks?.firstOrNull { it.id == taskId }
    val agent = snapshot?.agents?.firstOrNull { it.id == task?.agentId }
    var full by remember(taskId) { mutableStateOf<List<TraceEntry>?>(null) }
    var error by remember(taskId) { mutableStateOf<String?>(null) }
    LaunchedEffect(taskId) {
        if (snapshot?.capabilities?.traceEndpoint == true) {
            model.controller.loadTrace(taskId).fold({ full = it }, { error = it.message })
        }
    }
    // Lo que llega en directo se añade a lo descargado (sin duplicar).
    val live = task?.trace.orEmpty()
    val entries = remember(full, live) {
        val base = full ?: emptyList()
        val ids = base.map { it.id }.toMutableSet()
        (base.map { e -> live.firstOrNull { it.id == e.id } ?: e } + live.filter { ids.add(it.id) })
    }
    val list = remember(taskId) { androidx.compose.foundation.lazy.LazyListState() }
    LaunchedEffect(entries.size) { if (entries.isNotEmpty()) list.animateScrollToItem(entries.size - 1) }
    Column(Modifier.fillMaxSize().widthIn(max = 900.dp).glass(radius = 30.dp, tint = Orbita.GlassSolid).testTag("trace")) {
        Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 8.dp, top = 12.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            RobotFace(agent, 40.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(task?.title ?: t("Actividad"), color = Orbita.Text, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(agent?.name, task?.let { statusOf(it, snapshot.conversation.activeRequestIds).first }, if ((task?.traceCount ?: 0) > entries.size && full == null) t("{v1} pasos", "v1" to (task?.traceCount)) else null).joinToString(" · "),
                    color = Orbita.TextSoft,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            IconAction(Icons.Outlined.Close, t("Cerrar"), onClick = { model.traceTaskId = null })
        }
        if (error != null) Text(t("No se pudo descargar todo: {error}. Se ve lo más reciente.", "error" to error), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 18.dp))
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, contentPadding = androidx.compose.foundation.layout.PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (entries.isEmpty()) item {
                Note(Icons.Outlined.Info, if (task?.status == "pending" || task?.status == "blocked") t("Aún no ha empezado") else t("Sin actividad registrada"), null)
            }
            items(entries, key = { it.id }) { e -> TraceRow(e) }
        }
    }
}

@Composable
private fun TraceRow(e: TraceEntry) {
    var open by remember { mutableStateOf(false) }
    val (icon, tint) = when (e.kind) {
        "thinking" -> Icons.Outlined.Psychology to Orbita.TextSoft
        "text" -> Icons.AutoMirrored.Outlined.Chat to Orbita.Text
        "error" -> Icons.Outlined.ErrorOutline to Orbita.Danger
        "tool" -> when (e.tool) {
            "command" -> Icons.Outlined.Terminal to Orbita.TextSoft
            "edit", "write" -> Icons.Outlined.Edit to Orbita.TextSoft
            "read", "search" -> Icons.Outlined.Search to Orbita.TextSoft
            "web" -> Icons.Outlined.Language to Orbita.TextSoft
            "todo" -> Icons.Outlined.CheckCircle to Orbita.TextSoft
            else -> Icons.Outlined.Build to Orbita.TextSoft
        }
        else -> Icons.Outlined.Info to Orbita.TextSoft
    }
    val hasMore = !e.body.isNullOrBlank() || !e.output.isNullOrBlank()
    Column(
        Modifier
            .fillMaxWidth()
            .card(radius = 16.dp)
            .then(if (hasMore) Modifier.tappable(haptic = Haptic.None) { open = !open } else Modifier)
            .padding(12.dp)
            .animateContentSize(),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
            Text(e.title.ifBlank { e.body?.lineSequence()?.firstOrNull().orEmpty() }, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = if (open) 6 else 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            when (e.ok) {
                true -> Icon(Icons.Outlined.CheckCircle, contentDescription = t("Bien"), tint = Orbita.Success, modifier = Modifier.size(16.dp))
                false -> Icon(Icons.Outlined.Cancel, contentDescription = t("Falló"), tint = Orbita.Danger, modifier = Modifier.size(16.dp))
                null -> Unit
            }
            Text("  ${Format.time(e.ts)}", color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium)
        }
        if (open) {
            e.body?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                if (e.kind == "tool") Text(it, color = Orbita.Text, style = Mono) else MarkdownText(it, color = Orbita.TextSoft)
            }
            e.output?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = Orbita.Text, style = Mono, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Color(0x66060B16)).horizontalScroll(rememberScrollState()).padding(10.dp), softWrap = false)
            }
        } else if (hasMore) {
            Text(e.body?.lineSequence()?.firstOrNull { it.isNotBlank() }?.takeIf { e.title.isNotBlank() } ?: "", color = Orbita.TextFaint, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ---------------------------------------------------------------------------------------------- Nueva tarea

@Composable
private fun NewTaskSheet(model: OrbitaModel, state: CoworkUiState) {
    val hermes = state.snapshot?.let { OrbitaModel.coordinator(it) }
    Column(Modifier.fillMaxWidth().widthIn(max = 640.dp).glass(radius = 30.dp).padding(16.dp).testTag("new-task-sheet")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RobotFace(hermes, 40.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(t("Nueva tarea"), color = Orbita.Text, style = MaterialTheme.typography.titleLarge)
                Text(t("{v1} la repartirá entre el equipo", "v1" to (hermes?.name ?: "Hermes")), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            }
            IconAction(Icons.Outlined.Close, t("Cerrar"), onClick = { model.newTaskOpen = false })
        }
        Spacer(Modifier.height(12.dp))
        val voice = model.voice
        val voiceHere = (voice as? VoiceState.Recording)?.target == VoiceTarget.NewTask ||
            (voice as? VoiceState.Transcribing)?.target == VoiceTarget.NewTask ||
            (voice as? VoiceState.Failed)?.target == VoiceTarget.NewTask
        if (voiceHere) {
            VoiceBar(model, voice, allowSend = false)
            Spacer(Modifier.height(8.dp))
        }
        Row(verticalAlignment = Alignment.Top) {
            OrbitaField(
                model.newTaskDraft.text,
                { model.editDraft(VoiceTarget.NewTask, TextFieldValue(it, androidx.compose.ui.text.TextRange(it.length))) },
                if (model.dictation?.target == VoiceTarget.NewTask) t("Habla, te escucho…") else t("¿Qué necesitas?"),
                singleLine = false,
                minLines = 3,
                maxLines = 8,
                imeAction = ImeAction.Default,
                autoFocus = true,
                modifier = Modifier.weight(1f).testTag("new-task-text"),
            )
            val note = model.canRecordNote(state.snapshot?.capabilities?.voice == true)
            if ((note || model.canDictate) && !voiceHere) {
                Spacer(Modifier.width(4.dp))
                MicButton(model, VoiceTarget.NewTask, note)
            }
        }
        val attachments = state.snapshot?.conversation?.attachments.orEmpty().filter { it.id in model.pendingAttachments }
        if (attachments.isNotEmpty()) {
            Text(t("Con {size} {v1}: {v2}", "size" to attachments.size, "v1" to (if (attachments.size == 1) t("adjunto") else t("adjuntos")), "v2" to (attachments.joinToString { it.name })), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
        }
        Spacer(Modifier.height(12.dp))
        OrbitaButton(
            t("Enviar a {v1}", "v1" to (hermes?.name ?: "Hermes")),
            onClick = {
                model.cancelDictation()
                model.controller.sendMessage(model.newTaskDraft.text, model.pendingAttachments.toList())
                model.pendingAttachments = emptySet()
                model.newTaskDraft = TextFieldValue("")
                model.newTaskOpen = false
                model.awaitingPlanSince = System.currentTimeMillis()
                model.taskFilter = TaskFilter.Active
                model.open(Section.Tasks)
                model.toast(t("Enviada: {v1} está preparando el plan", "v1" to (hermes?.name ?: "Hermes")), Toast.Tone.Info)
            },
            icon = Icons.AutoMirrored.Outlined.Send,
            enabled = model.newTaskDraft.text.isNotBlank(),
            modifier = Modifier.fillMaxWidth().testTag("new-task-send"),
        )
    }
}

