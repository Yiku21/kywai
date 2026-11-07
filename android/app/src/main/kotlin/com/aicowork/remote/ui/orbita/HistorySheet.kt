package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.I18n
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
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Search
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.model.ChatSummary
import com.aicowork.remote.ui.components.Format
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date

/** Un grupo del Historial: «Hoy», «Ayer», «Últimos 7 días», «Últimos 30 días» o un mes. */
data class HistoryGroup(val key: String, val label: String, val chats: List<ChatSummary>)

/** Agrupa los chats (de más reciente a más antiguo) por cuándo se habló por última vez. */
fun groupChatsByDate(list: List<ChatSummary>, now: Long = System.currentTimeMillis()): List<HistoryGroup> {
    val today = Calendar.getInstance().apply {
        timeInMillis = now
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    val day = 86_400_000L
    val groups = linkedMapOf<String, Pair<String, MutableList<ChatSummary>>>()
    for (c in list.sortedByDescending { it.updatedAt ?: 0L }) {
        val at = c.updatedAt ?: 0L
        val (key, label) = when {
            at >= today -> "today" to t("Hoy")
            at >= today - day -> "yesterday" to t("Ayer")
            at >= today - 7 * day -> "week" to t("Últimos 7 días")
            at >= today - 30 * day -> "month" to t("Últimos 30 días")
            else -> {
                val cal = Calendar.getInstance().apply { timeInMillis = at }
                val name = SimpleDateFormat("LLLL yyyy", I18n.locale).format(Date(at))
                "m-${cal.get(Calendar.YEAR)}-${cal.get(Calendar.MONTH)}" to name.replaceFirstChar { it.titlecase(I18n.locale) }
            }
        }
        groups.getOrPut(key) { label to mutableListOf() }.second += c
    }
    return groups.map { (k, v) -> HistoryGroup(k, v.first, v.second) }
}

/** «Historial»: todos los chats de todos los proyectos, agrupados por fecha, con filtro por proyecto y por nombre. */
@Composable
fun HistorySheet(model: OrbitaModel) {
    val snapshot = model.controller.state.value.snapshot
    val projects = snapshot?.projects.orEmpty()
    var all by remember { mutableStateOf<List<ChatSummary>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var projectId by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        model.controller.allChats().onSuccess { all = it; error = null }.onFailure { error = it.message }
    }
    val terms = remember(query) { searchTerms(query) }
    val nameOf = { id: String -> projects.firstOrNull { it.id == id }?.name.orEmpty() }
    val shown = (all ?: emptyList()).filter { c ->
        (projectId.isEmpty() || c.projectId == projectId) &&
            (terms.isEmpty() || fold("${c.title} ${nameOf(c.projectId)}").let { hay -> terms.all { hay.contains(it) } })
    }
    val groups = remember(shown) { groupChatsByDate(shown) }
    Column(Modifier.fillMaxWidth().widthIn(max = 640.dp).glass(radius = 30.dp, tint = Orbita.GlassSolid).padding(14.dp).testTag("history")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.History, null, tint = Orbita.TextSoft, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(10.dp))
            Text(t("Historial"), color = Orbita.Text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            all?.let { Text("  " + t("{n} conversaciones", "n" to it.size), color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium) }
            Spacer(Modifier.weight(1f))
            IconAction(Icons.Outlined.Close, t("Cerrar"), onClick = { model.historyOpen = false })
        }
        Spacer(Modifier.size(6.dp))
        OrbitaField(value = query, onValueChange = { query = it.take(200) }, placeholder = t("Filtrar por nombre…"), leading = Icons.Outlined.Search, modifier = Modifier.testTag("history-filter"))
        val withChats = projects.filter { p -> all.orEmpty().any { it.projectId == p.id } }
        if (withChats.size > 1) {
            Spacer(Modifier.size(8.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ProjectChip(t("Todos los proyectos"), projectId.isEmpty()) { projectId = "" }
                withChats.forEach { p -> ProjectChip(p.name, projectId == p.id) { projectId = p.id } }
            }
        }
        if (query.trim().length >= 2) {
            Text(
                t("Buscar «{q}» dentro de los mensajes", "q" to query.trim()),
                color = Orbita.Accent,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.padding(top = 6.dp).clip(Orbita.PillShape).tappable {
                    model.searchSeed = query.trim()
                    model.historyOpen = false
                    model.searchOpen = true
                }.padding(10.dp).testTag("history-search-inside"),
            )
        }
        Spacer(Modifier.size(6.dp))
        when {
            error != null -> Text(error!!, color = Orbita.Danger, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp))
            all == null -> Row(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.Center) {
                CircularProgressIndicator(Modifier.size(22.dp), color = Orbita.Accent, strokeWidth = 2.dp)
            }
            shown.isEmpty() -> Text(
                if (all!!.isEmpty()) t("Todavía no hay conversaciones.") else t("Ninguna conversación coincide."),
                color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp),
            )
            else -> LazyColumn(Modifier.heightIn(max = 480.dp)) {
                groups.forEach { g ->
                    item(key = "g-${g.key}") {
                        Text(g.label, color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 10.dp, top = 10.dp, bottom = 4.dp))
                    }
                    items(g.chats, key = { "${it.projectId}|${it.id}" }) { c ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).tappable(haptic = Haptic.Select) {
                                model.historyOpen = false
                                model.openChat(c.projectId, c.id)
                            }.padding(horizontal = 10.dp, vertical = 10.dp).testTag("history-chat-${c.id}"),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Icon(Icons.Outlined.ChatBubbleOutline, null, tint = Orbita.TextSoft, modifier = Modifier.size(20.dp).padding(top = 2.dp))
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(marked(c.title, terms), color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                    Text(Format.relative(c.updatedAt), color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall)
                                }
                                Text(
                                    listOf(nameOf(c.projectId), if (c.messageCount == 1) t("1 mensaje") else t("{n} mensajes", "n" to c.messageCount)).filter { it.isNotBlank() }.joinToString(" · "),
                                    color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium, maxLines = 1,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProjectChip(label: String, on: Boolean, onClick: () -> Unit) {
    Text(
        label,
        color = if (on) Orbita.Accent else Orbita.TextSoft,
        style = MaterialTheme.typography.labelMedium,
        maxLines = 1,
        modifier = Modifier
            .clip(Orbita.PillShape)
            .background(if (on) Orbita.AccentSoft else Orbita.TextFaint.copy(alpha = 0.10f))
            .tappable(haptic = Haptic.Select, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
    )
}
