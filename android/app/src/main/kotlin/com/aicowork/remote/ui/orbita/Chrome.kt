package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.RestartAlt
import androidx.compose.material.icons.outlined.ViewInAr
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.ui.components.Labels
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------------------------- Barra superior

/** Proyecto abierto: al tocarlo se elige otro o se crea uno. */
@Composable
fun ProjectChip(state: CoworkUiState, model: OrbitaModel, modifier: Modifier = Modifier) {
    val name = state.snapshot?.conversation?.title ?: t("Sin proyecto")
    Row(
        modifier
            .heightIn(min = 46.dp)
            .glass(radius = 23.dp)
            .tappable { model.projectMenu = !model.projectMenu }
            .padding(start = 14.dp, end = 10.dp)
            .testTag("project-chip"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.ViewInAr, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(9.dp))
        Text(name, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 200.dp))
        Spacer(Modifier.width(4.dp))
        Icon(Icons.Outlined.ExpandMore, contentDescription = t("Cambiar de proyecto"), tint = Orbita.TextSoft, modifier = Modifier.size(20.dp))
    }
}

/** «En vivo» / «Conectando…» / «Sin conexión» (tocar reintenta). */
@Composable
fun LiveStatus(state: CoworkUiState, onRetry: () -> Unit, modifier: Modifier = Modifier, glassy: Boolean = true, compact: Boolean = false) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val connection = state.connection
    LaunchedEffect(connection) {
        while (connection is Connection.Offline) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }
    val (color, label, pulse) = when (connection) {
        Connection.Online -> Triple(Orbita.Live, if (state.fromCache) t("Sincronizando…") else t("En vivo"), false)
        Connection.Connecting -> Triple(Orbita.Warn, t("Conectando…"), true)
        is Connection.Offline -> {
            val left = connection.retryAt?.let { ((it - now) / 1000).coerceAtLeast(0) }
            Triple(Orbita.Danger, if (left != null && left > 0) t("Sin conexión · {left} s", "left" to left) else t("Sin conexión"), false)
        }
        Connection.Idle -> Triple(Orbita.TextFaint, t("En pausa"), false)
    }
    val base = if (glassy) modifier.heightIn(min = 46.dp).glass(radius = 23.dp) else modifier.heightIn(min = 46.dp)
    Row(
        base
            .tappable(enabled = connection !is Connection.Online, onClick = onRetry)
            .padding(horizontal = 14.dp)
            .semantics { liveRegion = LiveRegionMode.Polite; contentDescription = "$label. ${if (connection is Connection.Offline) "Toca para reintentar" else ""}" }
            .testTag("live-status"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Dot(color, pulse = pulse)
        if (!compact || connection !is Connection.Online) {
            Spacer(Modifier.width(9.dp))
            Text(if (compact && connection is Connection.Offline) t("Sin conexión") else label, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, maxLines = 1)
        }
    }
}

/** Cuántos agentes están trabajando ahora mismo. */
fun workingCount(snapshot: Snapshot?): Int = snapshot?.agents?.count { it.activity == "working" || it.activity == "thinking" } ?: 0

@Composable
fun AttentionChip(attention: Attention?, onClick: () -> Unit, modifier: Modifier = Modifier) {
    AnimatedVisibility(attention != null, modifier, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
        val a = attention ?: return@AnimatedVisibility
        Row(
            Modifier
                .heightIn(min = 40.dp)
                .glass(radius = 20.dp)
                .tappable(onClick = onClick)
                .padding(horizontal = 12.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Dot(Orbita.Warn, pulse = true)
            Spacer(Modifier.width(8.dp))
            Text(a.reason, color = Orbita.Text, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ---------------------------------------------------------------------------------------------- Proyectos

@Composable
fun ProjectMenu(state: CoworkUiState, model: OrbitaModel, modifier: Modifier = Modifier) {
    val snapshot = state.snapshot
    val current = snapshot?.conversation?.id
    val supported = snapshot?.capabilities?.projects == true
    var creating by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Column(
        modifier
            .widthIn(min = 280.dp, max = 380.dp)
            .glass(radius = 26.dp, tint = Orbita.GlassPopover)
            .padding(12.dp)
            .verticalScroll(rememberScrollState())
            .testTag("project-menu"),
    ) {
        Text(t("Proyectos"), color = Orbita.TextSoft, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 8.dp, top = 4.dp, bottom = 8.dp))
        if (!supported) {
            Note(Icons.Outlined.Info, snapshot?.conversation?.title ?: t("Proyecto actual"), t("Para cambiar de proyecto desde el móvil, actualiza AI Cowork en el ordenador."))
        } else {
            snapshot!!.projects.forEach { p ->
                val on = p.id == current
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 52.dp)
                        .clip(Orbita.CardShape)
                        .rowHighlight(on)
                        .tappable(haptic = Haptic.Select) {
                            if (on) model.projectMenu = false
                            else {
                                busy = p.id
                                scope.launch {
                                    val r = model.controller.selectConversation(p.id)
                                    busy = null
                                    if (r.ok) {
                                        model.feedback.confirm()
                                        model.projectMenu = false
                                    } else {
                                        model.feedback.reject()
                                        model.toast(r.message, Toast.Tone.Error)
                                    }
                                }
                            }
                        }
                        .padding(horizontal = 12.dp)
                        .semantics { selected = on },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.ViewInAr, contentDescription = null, tint = if (on) Orbita.Accent else Orbita.TextSoft, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(p.name, color = Orbita.Text, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    when {
                        busy == p.id -> androidx.compose.material3.CircularProgressIndicator(Modifier.size(18.dp), color = Orbita.Accent, strokeWidth = 2.dp)
                        p.running -> Row(verticalAlignment = Alignment.CenterVertically) {
                            Dot(Orbita.Live, 7.dp, pulse = true)
                            Spacer(Modifier.width(6.dp))
                            Text("trabajando", color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                        }
                        on -> Icon(Icons.Outlined.Check, contentDescription = t("Abierto"), tint = Orbita.Accent, modifier = Modifier.size(20.dp))
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            if (!creating) {
                OrbitaButton(t("Nuevo proyecto"), onClick = { creating = true }, icon = Icons.Outlined.Add, style = ButtonStyle.Secondary, haptic = Haptic.Tap, modifier = Modifier.fillMaxWidth())
            } else {
                OrbitaField(
                    value = name,
                    onValueChange = { name = it },
                    placeholder = t("Nombre del proyecto"),
                    imeAction = ImeAction.Done,
                    onIme = {},
                    autoFocus = true,
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OrbitaButton(t("Cancelar"), onClick = { creating = false; name = "" }, style = ButtonStyle.Ghost, haptic = Haptic.Tap, modifier = Modifier.weight(1f))
                    OrbitaButton(
                        t("Crear"),
                        onClick = {
                            busy = "new"
                            scope.launch {
                                val r = model.controller.createProject(name.trim())
                                busy = null
                                if (r.ok) {
                                    model.feedback.confirm()
                                    model.feedback.play(Sfx.ProjectCreated)
                                    model.projectMenu = false
                                    creating = false
                                    name = ""
                                } else {
                                    model.feedback.reject()
                                    model.toast(r.message, Toast.Tone.Error)
                                }
                            }
                        },
                        enabled = name.isNotBlank(),
                        busy = busy == "new",
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------- Navegación

val BottomSections = listOf(Section.World, Section.Chat, Section.Tasks, Section.Files)
val RailSections = listOf(Section.World, Section.Chat, Section.Tasks, Section.Files, Section.Results, Section.Memory, Section.Tools)
val RailFooter = listOf(Section.Usage, Section.Settings)
val MoreSections = listOf(Section.Results, Section.Memory, Section.Tools, Section.Usage, Section.Settings, Section.Team)

/** Navegación inferior (plegado): Mundo, Chat, Tareas, Archivos y Más, al alcance del pulgar. */
@Composable
fun BottomNav(model: OrbitaModel, badges: Map<Section, Int>, modifier: Modifier = Modifier) {
    val moreOn = model.moreOpen || model.section in MoreSections
    Row(
        modifier
            .fillMaxWidth()
            .glass(radius = 28.dp)
            .padding(6.dp)
            .testTag("bottom-nav"),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        BottomSections.forEach { s ->
            NavItem(s.label, s.icon, on = model.section == s && !model.moreOpen, badge = badges[s] ?: 0, modifier = Modifier.weight(1f).testTag("nav-${s.name}")) { model.open(s) }
        }
        NavItem(t("Más"), Icons.Outlined.MoreHoriz, on = moreOn, badge = MoreSections.sumOf { badges[it] ?: 0 }, modifier = Modifier.weight(1f).testTag("nav-more")) {
            model.moreOpen = !model.moreOpen
        }
    }
}

@Composable
private fun NavItem(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, on: Boolean, badge: Int, modifier: Modifier, compact: Boolean = false, onClick: () -> Unit) {
    val bg by animateColorAsState(if (on) Orbita.AccentSoft else Color.Transparent, tween(200), label = "nav")
    val edge by animateColorAsState(if (on) Orbita.AccentEdge.copy(alpha = 0.6f) else Color.Transparent, tween(200), label = "navEdge")
    Box(
        modifier
            .heightIn(min = if (compact) 56.dp else 62.dp)
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(22.dp))
            .background(bg)
            .border(1.dp, edge, androidx.compose.foundation.shape.RoundedCornerShape(22.dp))
            .tappable(role = Role.Tab, haptic = Haptic.Tap, onClick = onClick)
            .semantics { selected = on },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 2.dp)) {
            Box {
                Icon(icon, contentDescription = null, tint = if (on) Color.White else Orbita.TextSoft, modifier = Modifier.size(24.dp))
                if (badge > 0) Box(Modifier.align(Alignment.TopEnd).offset(x = 12.dp, y = (-8).dp)) { CountBadge(badge) }
            }
            Spacer(Modifier.height(3.dp))
            Text(label, color = if (on) Color.White else Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
        }
    }
}

/** Riel lateral (desplegado): todas las secciones, con Consumo y Ajustes aparte. */
@Composable
fun Rail(model: OrbitaModel, badges: Map<Section, Int>, modifier: Modifier = Modifier) {
    Column(
        modifier
            .width(RailWidth)
            .fillMaxHeight()
            .glass(radius = 30.dp)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 8.dp, vertical = 10.dp)
            .testTag("rail"),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        RailSections.forEach { s ->
            NavItem(s.label, s.icon, on = model.section == s, badge = badges[s] ?: 0, modifier = Modifier.fillMaxWidth().testTag("nav-${s.name}")) { model.open(s) }
        }
        Spacer(Modifier.weight(1f))
        Box(Modifier.fillMaxWidth().padding(vertical = 6.dp, horizontal = 10.dp).height(1.dp).background(Color(0x26B4CCF5)))
        RailFooter.forEach { s ->
            NavItem(s.label, s.icon, on = model.section == s, badge = 0, compact = true, modifier = Modifier.fillMaxWidth().testTag("nav-${s.name}")) { model.open(s) }
        }
    }
}

val RailWidth: Dp = 108.dp

/** «Más paneles» (plegado): el resto de secciones en una cuadrícula. */
@Composable
fun MorePanels(model: OrbitaModel, badges: Map<Section, Int>, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().glass(radius = 30.dp, tint = Orbita.GlassPopover).padding(16.dp).testTag("more-panels")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(t("Más paneles"), color = Orbita.Text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).padding(start = 4.dp))
            IconAction(Icons.Outlined.Close, t("Cerrar"), onClick = { model.moreOpen = false })
        }
        Spacer(Modifier.height(10.dp))
        LazyVerticalGrid(
            GridCells.Fixed(2),
            state = model.moreGrid,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.heightIn(max = 300.dp),
        ) {
            items(MoreSections) { s ->
                Row(
                    Modifier
                        .heightIn(min = 56.dp)
                        .card(radius = 18.dp, selected = model.section == s)
                        .tappable(haptic = Haptic.Tap) { model.open(s) }
                        .padding(horizontal = 14.dp)
                        .testTag("more-${s.name}"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(s.icon, contentDescription = null, tint = Orbita.Text, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(s.label, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    (badges[s] ?: 0).takeIf { it > 0 }?.let { CountBadge(it) }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------- Equipo

fun activityColor(activity: String): Color = when (activity) {
    "thinking" -> Color(0xFFA48CFF)
    "working" -> Orbita.Accent
    "waiting" -> Orbita.Warn
    "error" -> Orbita.Danger
    "offline" -> Orbita.TextFaint
    else -> Color(0xFF8FA3C2)
}

/** Selector del Equipo (desplegado): los agentes, aparte de la navegación entre secciones. */
@Composable
fun TeamBar(snapshot: Snapshot, model: OrbitaModel, onSelect: (Agent) -> Unit, modifier: Modifier = Modifier) {
    val agents = teamOrder(snapshot)
    if (agents.isEmpty()) return
    val working = workingCount(snapshot)
    Column(modifier.glass(radius = 30.dp).padding(horizontal = 14.dp, vertical = 8.dp).testTag("team-bar"), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(if (working > 0) t("Equipo · {working} trabajando", "working" to working) else t("Equipo"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
        Spacer(Modifier.height(6.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            agents.forEach { a -> TeamAvatar(a, selected = model.selectedAgentId == a.id) { onSelect(a) } }
        }
    }
}

@Composable
fun TeamAvatar(agent: Agent, selected: Boolean, size: Dp = 46.dp, onClick: () -> Unit) {
    val ring = if (selected) Orbita.Gold else null
    Box(
        Modifier
            .clip(CircleShape)
            .tappable(haptic = Haptic.Select, onClick = onClick)
            .semantics { contentDescription = "${agent.name}: ${Labels.activity(agent.activity)}"; this.selected = selected }
            .testTag("team-${agent.id}"),
    ) {
        RobotFace(agent, size, ring = ring)
        Box(Modifier.align(Alignment.BottomEnd).size(13.dp).clip(CircleShape).background(Orbita.Night).padding(2.dp)) {
            Dot(activityColor(agent.activity), 9.dp, pulse = agent.activity == "working" || agent.activity == "thinking")
        }
    }
}

/** Orden estable: quien coordina, los demás y los becarios. */
fun teamOrder(snapshot: Snapshot): List<Agent> = snapshot.agents
    .filter { it.enabled || it.activity != "offline" }
    .sortedWith(compareBy<Agent>({ if (it.provider == "hermes" || it.plannerOnly) 0 else if (it.isSubagent) 2 else 1 }, { it.name }))

/**
 * Tarjeta del agente elegido (al tocarlo en el mundo o en el Equipo): qué hace, su tarea y sus controles reales.
 */
@Composable
fun AgentCard(snapshot: Snapshot, agent: Agent, model: OrbitaModel, attention: Attention?, modifier: Modifier = Modifier) {
    val needs = attention?.takeIf { it.agentId == agent.id }
    // Si te necesita por una tarea (en pausa o que falló), la tarjeta enseña esa, aunque la haga otro agente.
    val task = needs?.taskId?.let { id -> snapshot.tasks.firstOrNull { it.id == id } }
        ?: snapshot.tasks.firstOrNull { it.id == agent.taskId }
        ?: snapshot.tasks.filter { it.agentId == agent.id }.maxByOrNull { it.startedAt ?: it.createdAt ?: 0 }
    val active = snapshot.conversation.activeRequestIds
    val paused = task?.isPaused == true && task.requestId !in active
    Column(modifier.glass(radius = 28.dp).padding(16.dp).testTag("agent-card")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RobotFace(agent, 52.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(agent.name, color = Orbita.Text, style = MaterialTheme.typography.titleMedium)
                Text(listOf(agent.role.ifBlank { null }, agent.modelLabel.ifBlank { null }).filterNotNull().joinToString(" · "), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            IconAction(Icons.Outlined.Close, t("Cerrar"), onClick = { model.selectAgent(null, poke = false) })
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            val (color, label) = when {
                needs != null -> Orbita.Warn to needs.reason
                paused -> Orbita.Warn to t("En pausa")
                agent.activity == "waiting" && agent.waitingFor != null -> Orbita.Warn to t("Esperando a {waitingFor}", "waitingFor" to (snapshot.agents.firstOrNull { it.id == agent.waitingFor }?.name ?: agent.waitingFor))
                else -> activityColor(agent.activity) to Labels.activity(agent.activity)
            }
            Dot(color, pulse = agent.activity == "working" || agent.activity == "thinking" || needs != null)
            Spacer(Modifier.width(8.dp))
            Text(label, color = Orbita.Text, style = MaterialTheme.typography.labelLarge)
        }
        val detail = agent.reason?.takeIf { agent.activity == "error" || agent.activity == "offline" } ?: agent.lastActivity
        if (!detail.isNullOrBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(detail, color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        // Si falla: olvida el error, comprueba que responde y lo deja disponible.
        if ((agent.activity == "error" || agent.activity == "offline") && snapshot.capabilities.agentReset) {
            Spacer(Modifier.height(10.dp))
            var resetting by remember(agent.id) { mutableStateOf(false) }
            OrbitaButton(
                t("Reiniciar agente"),
                onClick = {
                    resetting = true
                    model.run({ model.controller.resetAgent(agent.id) }) { resetting = false }
                },
                icon = Icons.Outlined.RestartAlt,
                style = ButtonStyle.Secondary,
                busy = resetting,
                haptic = Haptic.Tap,
                height = 46.dp,
                modifier = Modifier.fillMaxWidth().testTag("agent-reset"),
            )
        }
        if (task != null) {
            Spacer(Modifier.height(12.dp))
            Column(Modifier.fillMaxWidth().card().tappable { model.openTask(task.id) }.padding(12.dp)) {
                Text(task.title, color = Orbita.Text, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(6.dp))
                if (task.status == "running") ProgressLine(task.progress?.toFloat(), Orbita.Accent)
                else Text(Labels.taskStatus(task.status), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OrbitaButton(t("Ver tarea"), onClick = { model.openTask(task.id) }, icon = Icons.AutoMirrored.Outlined.ArrowForward, style = ButtonStyle.Secondary, haptic = Haptic.Tap, height = 46.dp, modifier = Modifier.weight(1f))
                val requestId = task.requestId
                if (requestId != null && requestId in active && snapshot.capabilities.stopRequests) {
                    var busy by remember { mutableStateOf(false) }
                    OrbitaButton(t("Detener"), onClick = {
                        busy = true
                        model.run({ model.controller.stopRequest(requestId) }) { busy = false }
                    }, icon = Icons.Outlined.Pause, style = ButtonStyle.Danger, busy = busy, height = 46.dp, modifier = Modifier.weight(1f))
                } else if (paused && requestId != null && snapshot.capabilities.resumeRequests) {
                    var busy by remember { mutableStateOf(false) }
                    OrbitaButton(t("Reanudar"), onClick = {
                        busy = true
                        model.run({ model.controller.resumeRequest(requestId) }) { busy = false }
                    }, icon = Icons.Outlined.PlayArrow, busy = busy, height = 46.dp, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------- Avisos

@Composable
fun ToastHost(model: OrbitaModel, modifier: Modifier = Modifier) {
    Column(modifier.widthIn(max = 520.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        model.toasts.forEach { t ->
            androidx.compose.runtime.key(t.id) {
                var shown by remember { mutableStateOf(false) }
                LaunchedEffect(Unit) { shown = true }
                AnimatedVisibility(shown, enter = fadeIn() + slideInVertically { -it / 2 }, exit = fadeOut() + slideOutVertically()) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 52.dp)
                            .glass(radius = 22.dp, tint = Orbita.GlassPopover)
                            .padding(start = 14.dp, end = 6.dp)
                            .semantics { liveRegion = LiveRegionMode.Polite },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val (icon, tint) = when (t.tone) {
                            Toast.Tone.Success -> Icons.Outlined.CheckCircle to Orbita.Success
                            Toast.Tone.Error -> Icons.Outlined.ErrorOutline to Orbita.Danger
                            Toast.Tone.Info -> Icons.Outlined.Info to Orbita.Accent
                        }
                        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(10.dp))
                        Text(t.text, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(vertical = 8.dp))
                        if (t.action != null && t.onAction != null) {
                            Text(
                                t.action,
                                color = Orbita.Accent,
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.clip(Orbita.PillShape).tappable { model.dismissToast(t); t.onAction.invoke() }.padding(horizontal = 12.dp, vertical = 10.dp),
                            )
                        }
                        IconAction(Icons.Outlined.Close, t("Cerrar aviso"), onClick = { model.dismissToast(t) }, size = 40.dp)
                    }
                }
            }
        }
    }
}

@Composable
fun UserIcon() = Icon(Icons.Outlined.Person, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(18.dp))
