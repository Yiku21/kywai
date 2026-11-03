package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChecklistRtl
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import android.os.SystemClock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameMillis
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskWork
import com.aicowork.remote.data.model.TraceEntry
import com.aicowork.remote.data.model.WorkFile
import com.aicowork.remote.data.model.WorkStep
import com.aicowork.remote.data.model.WorkToolRef

/**
 * Lo que cuenta un agente mientras hace su tarea, en tres niveles como Claude en su app: arriba, en corto, qué hace
 * ahora; con la flecha, todo lo que va contando y cada grupo de herramientas en una línea; y al tocar una
 * herramienta, su detalle (el comando, los cambios o el resultado). El título abre la actividad completa.
 */
@Composable
fun WorkBlock(messageId: String, work: TaskWork, accent: Color, snapshot: Snapshot, model: OrbitaModel) {
    val task = snapshot.tasks.firstOrNull { it.id == work.taskId }
    // Solo sigue «trabajando» si la tarea sigue en marcha (tras reiniciar el ordenador, ya no).
    val live = work.status == "running" && task?.status == "running"
    val state = when (work.status) {
        "running" -> if (live) "Trabajando" else "Detenida"
        "done" -> "Hecha"
        "failed" -> "No pudo hacerla"
        else -> "Detenida"
    }
    var open by rememberSaveable(messageId) { mutableStateOf(false) }
    val count = work.steps.size + work.hidden
    val totals = work.totals
    // Lo que hace ahora: su última frase y lo último que enseñó (capturas, documentos).
    val note = if (live) work.steps.lastOrNull { it.kind == "note" } else null
    val files = if (live) work.steps.lastOrNull { it.kind == "files" } else null
    val lineColor = accent.copy(alpha = 0.4f)
    val sideLine = Modifier
        .fillMaxWidth()
        .drawBehind { drawLine(lineColor, Offset(1.dp.toPx(), 0f), Offset(1.dp.toPx(), size.height), strokeWidth = 2.dp.toPx()) }
        .padding(start = 14.dp)
    val liveRow: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Dot(accent, size = 7.dp, pulse = true)
            Spacer(Modifier.width(8.dp))
            Text(task?.lastActivity ?: "Trabajando…", color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
    Column(Modifier.fillMaxWidth().testTag("work-$messageId"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.heightIn(min = 32.dp).tappable(haptic = Haptic.Tap) { if (count > 0) open = !open else model.traceTaskId = work.taskId },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (live) CircularProgressIndicator(Modifier.size(14.dp), color = accent, strokeWidth = 2.dp)
            else Icon(Icons.Outlined.ChecklistRtl, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(8.dp))
            Text(work.title, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            Text(" · $state", color = if (work.status == "failed") Orbita.Danger else Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
        }
        if (!open && (note != null || files != null || live)) {
            Column(sideLine.testTag("work-now-$messageId"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                note?.let {
                    val text = it.text.orEmpty()
                    MarkdownText(rememberRevealed(model, model.revealKey(messageId, text.trim()), text), body = MaterialTheme.typography.bodyMedium)
                }
                files?.let { FilesLine(it.files, model, "$messageId-now") }
                if (live) liveRow()
            }
        }
        if (count > 0) {
            Row(
                Modifier
                    .heightIn(min = 32.dp)
                    .tappable(role = Role.Button, haptic = Haptic.Select) { open = !open }
                    .semantics { stateDescription = if (open) "Desplegado" else "Plegado" }
                    .testTag("work-more-$messageId"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    totals?.summary?.takeIf { it.isNotBlank() } ?: "$count ${if (count == 1) "paso" else "pasos"}",
                    color = Orbita.TextSoft,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if ((totals?.failed ?: 0) > 0) Text(" · ${totals?.failed} con error", color = Orbita.Danger, style = MaterialTheme.typography.bodySmall)
                DiffStat(totals?.add ?: 0, totals?.del ?: 0)
                Icon(if (open) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight, contentDescription = null, tint = Orbita.TextFaint, modifier = Modifier.size(18.dp))
            }
        }
        if (open) {
            Column(sideLine.testTag("work-steps-$messageId"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (work.hidden > 0) {
                    Text(
                        "${work.hidden} ${if (work.hidden == 1) "paso anterior" else "pasos anteriores"}: ver todo",
                        color = Orbita.TextFaint,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.tappable(haptic = Haptic.Tap) { model.traceTaskId = work.taskId },
                    )
                }
                work.steps.forEachIndexed { i, step ->
                    if (step.kind == "tools") ToolsLine(step, work.taskId, model, "$messageId-$i")
                    else if (step.kind == "files") FilesLine(step.files, model, "$messageId-$i")
                    else MarkdownText(rememberRevealed(model, model.revealKey(messageId, step.text.orEmpty().trim()), step.text.orEmpty()), body = MaterialTheme.typography.bodyMedium)
                }
                if (live) liveRow()
                Text(
                    "Abrir el registro completo",
                    color = Orbita.TextFaint,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.heightIn(min = 32.dp).tappable(role = Role.Button, haptic = Haptic.Tap) { model.traceTaskId = work.taskId }.testTag("work-full-$messageId"),
                )
            }
        }
    }
}

/** «+393 −7»: las líneas que añade y quita. */
@Composable
private fun DiffStat(add: Int, del: Int) {
    if (add == 0 && del == 0) return
    Text(" +$add", color = Orbita.Success, style = Mono.copy(fontSize = 11.5.sp))
    Text(" −$del", color = Orbita.Danger, style = Mono.copy(fontSize = 11.5.sp))
}

/** Lo que el agente acaba de crear o abrir: las imágenes (para ver por dónde va) y los documentos. */
@Composable
private fun FilesLine(files: List<WorkFile>, model: OrbitaModel, key: String) {
    val images = files.filter { it.image }
    val docs = files.filter { !it.image }
    Column(Modifier.testTag("files-$key"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (images.isNotEmpty()) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                images.forEach { f ->
                    Column(Modifier.width(168.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        ProjectImage(f.relPath, f.name, Modifier.fillMaxWidth().aspectRatio(1.6f), crop = true)
                        Text(f.name, color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        docs.forEach { f ->
            Row(
                Modifier
                    .heightIn(min = 32.dp)
                    .tappable(role = Role.Button, haptic = Haptic.Tap) { model.viewer = ViewerTarget.File("project", f.relPath, f.name, kindOfName(f.name)) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.Description, contentDescription = null, tint = Orbita.TextFaint, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text(f.name, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** «Ejecutó 3 comandos y editó 2 archivos ›»: al tocarla, cada herramienta, y cada una se abre con su detalle. */
@Composable
private fun ToolsLine(step: WorkStep, taskId: String, model: OrbitaModel, key: String) {
    var open by rememberSaveable(key) { mutableStateOf(false) }
    Column {
        Row(
            Modifier
                .heightIn(min = 32.dp)
                .tappable(role = Role.Button, haptic = Haptic.Select) { open = !open }
                .semantics { stateDescription = if (open) "Desplegado" else "Plegado" }
                .testTag("tools-$key"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Build, contentDescription = null, tint = Orbita.TextFaint, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(6.dp))
            Text(step.summary.orEmpty(), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f, fill = false))
            if (step.failed > 0) Text(" · ${step.failed} con error", color = Orbita.Danger, style = MaterialTheme.typography.bodySmall)
            DiffStat(step.add, step.del)
            Icon(if (open) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight, contentDescription = null, tint = Orbita.TextFaint, modifier = Modifier.size(18.dp))
        }
        if (open) {
            Column(Modifier.padding(start = 14.dp, bottom = 2.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                step.items.forEachIndexed { i, item -> ToolRow(item, step.refs.getOrNull(i), taskId, model, "$key-$i") }
                if (step.more > 0) Text("y ${step.more} más (en el registro completo)", color = Orbita.TextFaint, style = Mono)
            }
        }
    }
}

/** Una herramienta: su línea y, al tocarla, el comando, los cambios o el resultado. */
@Composable
private fun ToolRow(title: String, info: WorkToolRef?, taskId: String, model: OrbitaModel, key: String) {
    var open by rememberSaveable(key) { mutableStateOf(false) }
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 32.dp)
                .then(
                    if (info != null) Modifier
                        .tappable(role = Role.Button, haptic = Haptic.Select) { open = !open }
                        .semantics { stateDescription = if (open) "Desplegado" else "Plegado" }
                    else Modifier,
                )
                .testTag("tool-$key"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(title, color = Orbita.TextFaint, style = Mono, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            when (info?.ok) {
                true -> Icon(Icons.Outlined.CheckCircle, contentDescription = "Bien", tint = Orbita.Success, modifier = Modifier.padding(start = 6.dp).size(14.dp))
                false -> Icon(Icons.Outlined.Cancel, contentDescription = "Falló", tint = Orbita.Danger, modifier = Modifier.padding(start = 6.dp).size(14.dp))
                null -> Unit
            }
            DiffStat(info?.add ?: 0, info?.del ?: 0)
            if (info != null) Icon(if (open) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight, contentDescription = null, tint = Orbita.TextFaint, modifier = Modifier.size(16.dp))
        }
        if (open && info != null) ToolDetail(info, taskId, model, key)
    }
}

/** El detalle de una herramienta: se pide al registro de la tarea al abrirla (y otra vez cuando llega su resultado). */
@Composable
private fun ToolDetail(info: WorkToolRef, taskId: String, model: OrbitaModel, key: String) {
    var entry by remember(taskId, info.id, info.ok) { mutableStateOf<TraceEntry?>(null) }
    var loaded by remember(taskId, info.id, info.ok) { mutableStateOf(false) }
    LaunchedEffect(taskId, info.id, info.ok) {
        model.traceOf(taskId).fold({ list -> entry = list.firstOrNull { it.id == info.id } }, { })
        loaded = true
    }
    Column(Modifier.padding(start = 4.dp, bottom = 6.dp).testTag("detail-$key"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        val e = entry
        val body = e?.body?.takeIf { it.isNotBlank() }
        val output = e?.output?.takeIf { it.isNotBlank() }
        if (body == null && output == null) {
            Text(
                if (!loaded) "Cargando…" else if (info.ok == null) "En marcha…" else "Este paso no tiene más detalle.",
                color = Orbita.TextFaint,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        body?.let {
            val shown = if (info.tool == "command") "$ $it" else it
            val text = if (info.tool == "edit") diffText(shown) else AnnotatedString(shown)
            Text(
                text,
                color = Color(0xFFD5E3F5),
                style = Mono,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Color(0x66060B16)).horizontalScroll(rememberScrollState()).padding(10.dp),
                softWrap = false,
            )
        }
        output?.let {
            Text("Resultado", color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall)
            Text(
                it,
                color = if (e?.ok == false) Orbita.Danger else Color(0xFFBFD0E6),
                style = Mono,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Color(0x66060B16)).horizontalScroll(rememberScrollState()).padding(10.dp),
                softWrap = false,
            )
        }
    }
}

/** Las líneas añadidas («+ ») y quitadas («- ») de una edición, con su color. */
private fun diffText(text: String): AnnotatedString = buildAnnotatedString {
    text.lines().forEachIndexed { i, line ->
        if (i > 0) append("\n")
        when {
            line.startsWith("+ ") -> withStyle(SpanStyle(color = Orbita.Success, background = Color(0x1A2FD27A))) { append(line) }
            line.startsWith("- ") -> withStyle(SpanStyle(color = Orbita.Danger, background = Color(0x1AFF5468))) { append(line) }
            else -> append(line)
        }
    }
}

/** Lo que se ve de [text] ahora: entero, salvo que se esté escribiendo letra a letra al ritmo de la voz del agente. */
@Composable
fun rememberRevealed(model: OrbitaModel, key: String, text: String): String {
    val reveal = model.reveals[key]
    if (reveal == null || reveal.text != text.trim()) return text
    var shown by remember(reveal) { mutableIntStateOf(reveal.visibleAt(SystemClock.uptimeMillis())) }
    LaunchedEffect(reveal) {
        while (shown < reveal.text.length) {
            withFrameMillis { }
            shown = reveal.visibleAt(SystemClock.uptimeMillis())
        }
        model.reveals.remove(key)
    }
    return reveal.text.take(shown)
}
