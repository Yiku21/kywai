package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.History
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.model.SearchHit
import com.aicowork.remote.data.model.SearchMatch
import com.aicowork.remote.ui.components.Format
import kotlinx.coroutines.delay
import java.util.Calendar

/** Filtro de fecha del buscador. */
enum class SearchWhen { All, Today, Week, Month }

/** Desde cuándo buscar (ms), según el filtro de fecha; null = sin límite. */
fun sinceOf(whenFilter: SearchWhen, now: Long = System.currentTimeMillis()): Long? = when (whenFilter) {
    SearchWhen.All -> null
    SearchWhen.Today -> Calendar.getInstance().apply {
        timeInMillis = now
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    SearchWhen.Week -> now - 7L * 86_400_000
    SearchWhen.Month -> now - 30L * 86_400_000
}

private const val PAGE = 40

/**
 * «Buscar» de la barra lateral: chats, tareas, resultados y memoria de todos los proyectos (lo busca el ordenador).
 * Con el Historial del ordenador: varias palabras o «frase exacta», filtros de fecha y de quién lo escribió, cuántos
 * mensajes coinciden en cada chat (y a cuál ir) y «Ver más».
 */
@Composable
fun SearchSheet(model: OrbitaModel) {
    val history = model.historySupported()
    var query by remember { mutableStateOf(model.searchSeed) }
    var whenFilter by remember { mutableStateOf(SearchWhen.All) }
    var author by remember { mutableStateOf("") }
    var limit by remember { mutableIntStateOf(PAGE) }
    var hits by remember { mutableStateOf<List<SearchHit>>(emptyList()) }
    var total by remember { mutableStateOf<Int?>(null) }
    var expanded by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { model.searchSeed = "" }
    LaunchedEffect(query, whenFilter, author) { limit = PAGE }
    LaunchedEffect(query, whenFilter, author, limit) {
        val q = query.trim()
        if (q.length < 2) {
            hits = emptyList(); total = null; error = null; loading = false
            return@LaunchedEffect
        }
        delay(300)
        loading = true
        if (history) {
            model.controller.searchHistory(q, sinceOf(whenFilter), author.ifBlank { null }, limit)
                .onSuccess { hits = it.hits; total = it.total; error = null }
                .onFailure { error = it.message }
        } else {
            model.controller.search(q)
                .onSuccess { hits = it; total = null; error = null }
                .onFailure { error = it.message }
        }
        loading = false
    }
    val terms = remember(query) { searchTerms(query) }
    Column(Modifier.fillMaxWidth().widthIn(max = 640.dp).glass(radius = 30.dp, tint = Orbita.GlassSolid).padding(14.dp).testTag("search")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Search, null, tint = Orbita.TextSoft, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                OrbitaField(value = query, onValueChange = { query = it.take(200) }, placeholder = t("Buscar en chats, tareas, resultados y memoria"), imeAction = ImeAction.Search, onIme = {}, autoFocus = true)
            }
            IconAction(Icons.Outlined.Close, t("Cerrar"), onClick = { model.searchOpen = false })
        }
        if (history) {
            Spacer(Modifier.size(8.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).testTag("search-filters"), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(t("Cualquier fecha"), whenFilter == SearchWhen.All, "search-when-all") { whenFilter = SearchWhen.All }
                FilterChip(t("Hoy"), whenFilter == SearchWhen.Today, "search-when-today") { whenFilter = SearchWhen.Today }
                FilterChip(t("7 días"), whenFilter == SearchWhen.Week, "search-when-week") { whenFilter = SearchWhen.Week }
                FilterChip(t("30 días"), whenFilter == SearchWhen.Month, "search-when-month") { whenFilter = SearchWhen.Month }
                Spacer(Modifier.width(6.dp))
                FilterChip(t("Cualquiera"), author.isBlank(), "search-by-any") { author = "" }
                FilterChip(t("Tú"), author == "user", "search-by-user") { author = "user" }
                FilterChip(t("Agentes"), author == "agents", "search-by-agents") { author = "agents" }
            }
            Text(t("Varias palabras: todas. «Entre comillas»: la frase exacta."), color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        }
        Spacer(Modifier.size(8.dp))
        when {
            loading && hits.isEmpty() -> Row(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.Center) {
                CircularProgressIndicator(Modifier.size(22.dp), color = Orbita.Accent, strokeWidth = 2.dp)
            }
            error != null -> Text(error!!, color = Orbita.Danger, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp))
            query.trim().length >= 2 && hits.isEmpty() && !loading -> Text(t("Nada con «{q}»", "q" to query.trim()), color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp))
            query.trim().length < 2 && history -> Text(
                t("Ver todo el historial"),
                color = Orbita.Accent,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.clip(Orbita.PillShape).tappable { model.openHistory() }.padding(12.dp).testTag("search-history"),
            )
            else -> LazyColumn(Modifier.heightIn(max = 460.dp)) {
                items(hits, key = { "${it.kind}|${it.projectId}|${it.conversationId}|${it.ref}|${it.title}|${it.at}" }) { hit ->
                    val key = "${hit.kind}|${hit.projectId}|${hit.conversationId}|${hit.ref}|${hit.title}"
                    HitRow(hit, terms, model, expanded == key, onToggle = { expanded = if (expanded == key) null else key }) { match -> open(model, hit, match) }
                }
                val all = total
                if (all != null && all > hits.size) item {
                    Text(
                        if (loading) t("Cargando…") else t("Ver más ({n} de {total})", "n" to hits.size, "total" to all),
                        color = Orbita.Accent,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.fillMaxWidth().clip(Orbita.PillShape).tappable { if (!loading) limit += PAGE }.padding(14.dp).testTag("search-more"),
                    )
                }
            }
        }
    }
}

@Composable
private fun FilterChip(label: String, on: Boolean, tag: String, onClick: () -> Unit) {
    Text(
        label,
        color = if (on) Orbita.Accent else Orbita.TextSoft,
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier
            .clip(Orbita.PillShape)
            .background(if (on) Orbita.AccentSoft else Orbita.TextFaint.copy(alpha = 0.10f))
            .tappable(haptic = Haptic.Select, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp)
            .testTag(tag),
    )
}

@Composable
private fun HitRow(hit: SearchHit, terms: List<String>, model: OrbitaModel, expanded: Boolean, onToggle: () -> Unit, onOpen: (SearchMatch?) -> Unit) {
    val icon = when (hit.kind) {
        "task" -> Icons.Outlined.TaskAlt
        "artifact" -> Icons.Outlined.Inventory2
        "memory" -> Icons.Outlined.Psychology
        "project" -> Icons.Outlined.Folder
        else -> Icons.Outlined.ChatBubbleOutline
    }
    Column {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).tappable(haptic = Haptic.Select, onClick = { onOpen(null) }).padding(horizontal = 10.dp, vertical = 10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(icon, null, tint = Orbita.TextSoft, modifier = Modifier.size(20.dp).padding(top = 2.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(marked(hit.title, terms), color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(Format.relative(hit.at), color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall)
                }
                Text(hit.projectName, color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                if (hit.snippet.isNotBlank()) Text(marked(hit.snippet, terms), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (hit.matchCount > 1) {
                    Row(
                        Modifier.padding(top = 6.dp).clip(Orbita.PillShape).background(Orbita.TextFaint.copy(alpha = 0.10f)).tappable(onClick = onToggle).padding(start = 6.dp, end = 10.dp, top = 3.dp, bottom = 3.dp).testTag("search-matches"),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(if (expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null, tint = Orbita.TextSoft, modifier = Modifier.size(16.dp))
                        Text(t("{n} coincidencias", "n" to hit.matchCount), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
        if (expanded) {
            Column(Modifier.padding(start = 42.dp, end = 6.dp, bottom = 6.dp)) {
                hit.matches.forEach { m ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).tappable(haptic = Haptic.Select, onClick = { onOpen(m) }).padding(horizontal = 8.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Text(model.authorName(m.by), color = Orbita.Text, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.widthIn(max = 90.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(marked(m.snippet, terms), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    }
                }
                val more = hit.matchCount - hit.matches.size
                if (more > 0) Text(t("…y {n} más dentro de la conversación", "n" to more), color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(8.dp))
            }
        }
    }
}

/** Lleva a lo encontrado: su chat (cambiando de proyecto si hace falta) y, si es una tarea o un resultado, su panel. */
private fun open(model: OrbitaModel, hit: SearchHit, match: SearchMatch? = null) {
    model.searchOpen = false
    val current = model.controller.state.value.snapshot?.conversation
    val chat = hit.conversationId
    val section = when (hit.kind) {
        "task" -> Section.Tasks
        "artifact" -> Section.Results
        "memory" -> Section.Memory
        else -> Section.Chat
    }
    if (section == Section.Chat) model.focusMessageId = match?.messageId ?: hit.messageId
    when {
        chat != null && chat.isNotEmpty() && chat != current?.chat?.id -> model.openChat(hit.projectId, chat)
        hit.projectId != current?.id -> model.openProject(hit.projectId)
    }
    if (hit.kind == "task" && hit.ref != null) model.openTask(hit.ref) else model.open(section)
}
