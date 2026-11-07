package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.model.SearchHit
import com.aicowork.remote.ui.components.Format
import kotlinx.coroutines.delay

/** «Buscar» de la barra lateral: chats, tareas, resultados y memoria de todos los proyectos (lo busca el ordenador). */
@Composable
fun SearchSheet(model: OrbitaModel) {
    var query by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<SearchHit>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(query) {
        val q = query.trim()
        if (q.length < 2) {
            hits = emptyList(); error = null; loading = false
            return@LaunchedEffect
        }
        delay(300)
        loading = true
        model.controller.search(q)
            .onSuccess { hits = it; error = null }
            .onFailure { error = it.message }
        loading = false
    }
    Column(Modifier.fillMaxWidth().widthIn(max = 640.dp).glass(radius = 30.dp, tint = Orbita.GlassSolid).padding(14.dp).testTag("search")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Search, null, tint = Orbita.TextSoft, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                OrbitaField(value = query, onValueChange = { query = it.take(200) }, placeholder = t("Buscar en chats, tareas, resultados y memoria"), imeAction = ImeAction.Search, onIme = {}, autoFocus = true)
            }
            IconAction(Icons.Outlined.Close, t("Cerrar"), onClick = { model.searchOpen = false })
        }
        Spacer(Modifier.size(8.dp))
        when {
            loading && hits.isEmpty() -> Row(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
                CircularProgressIndicator(Modifier.size(22.dp), color = Orbita.Accent, strokeWidth = 2.dp)
            }
            error != null -> Text(error!!, color = Orbita.Danger, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp))
            query.trim().length >= 2 && hits.isEmpty() && !loading -> Text(t("Nada con «{q}»", "q" to query.trim()), color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp))
            else -> LazyColumn(Modifier.heightIn(max = 460.dp)) {
                items(hits, key = { "${it.kind}|${it.projectId}|${it.conversationId}|${it.ref}|${it.title}|${it.at}" }) { hit -> HitRow(hit) { open(model, hit) } }
            }
        }
    }
}

@Composable
private fun HitRow(hit: SearchHit, onClick: () -> Unit) {
    val icon = when (hit.kind) {
        "task" -> Icons.Outlined.TaskAlt
        "artifact" -> Icons.Outlined.Inventory2
        "memory" -> Icons.Outlined.Psychology
        "project" -> Icons.Outlined.Folder
        else -> Icons.Outlined.ChatBubbleOutline
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).tappable(haptic = Haptic.Select, onClick = onClick).padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(icon, null, tint = Orbita.TextSoft, modifier = Modifier.size(20.dp).padding(top = 2.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(hit.title, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(Format.relative(hit.at), color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall)
            }
            Text(hit.projectName, color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium, maxLines = 1)
            if (hit.snippet.isNotBlank()) Text(hit.snippet, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Lleva a lo encontrado: su chat (cambiando de proyecto si hace falta) y, si es una tarea o un resultado, su panel. */
private fun open(model: OrbitaModel, hit: SearchHit) {
    model.searchOpen = false
    val current = model.controller.state.value.snapshot?.conversation
    val chat = hit.conversationId
    val section = when (hit.kind) {
        "task" -> Section.Tasks
        "artifact" -> Section.Results
        "memory" -> Section.Memory
        else -> Section.Chat
    }
    when {
        chat != null && chat.isNotEmpty() && chat != current?.chat?.id -> model.openChat(hit.projectId, chat)
        hit.projectId != current?.id -> model.openProject(hit.projectId)
    }
    if (hit.kind == "task" && hit.ref != null) model.openTask(hit.ref) else model.open(section)
}
