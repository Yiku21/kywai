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
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.input.pointer.pointerInput
import kotlin.math.abs
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.ui.components.Labels
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------------------------- Barra superior

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

// ---------------------------------------------------------------------------------------------- Pestañas

/**
 * Pestañas del panel, como en el escritorio. Desplegado van en la cabecera del panel (Chat, Archivos, Tareas,
 * Resultados); plegado van bajo la barra de arriba y «Espacio» deja ver el mundo entero.
 */
fun panelTabs(compact: Boolean): List<Section> =
    if (compact) listOf(Section.Chat, Section.World, Section.Tasks, Section.Results)
    else listOf(Section.Chat, Section.Files, Section.Tasks, Section.Results)

@Composable
fun PanelTabs(model: OrbitaModel, compact: Boolean, modifier: Modifier = Modifier) {
    val state by model.controller.state.collectAsStateWithLifecycle()
    val active = state.snapshot?.tasks?.count { it.isActive } ?: 0
    Row(modifier.padding(4.dp).testTag("panel-tabs"), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        panelTabs(compact).forEach { s ->
            val on = model.section == s
            val bg by animateColorAsState(if (on) Orbita.AccentSoft else Color.Transparent, tween(200), label = "tab")
            val edge by animateColorAsState(if (on) Orbita.AccentEdge.copy(alpha = 0.6f) else Color.Transparent, tween(200), label = "tabEdge")
            val shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp)
            Row(
                Modifier
                    .weight(1f)
                    .heightIn(min = 42.dp)
                    .clip(shape)
                    .background(bg)
                    .border(1.dp, edge, shape)
                    .tappable(role = Role.Tab, haptic = Haptic.Tap) { if (s == Section.World) model.close() else model.open(s) }
                    .semantics { selected = on }
                    .padding(horizontal = 6.dp)
                    .testTag(if (compact) "nav-${s.name}" else "tab-${s.name}"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Text(
                    if (s == Section.World) t("Espacio") else s.label,
                    color = if (on) Orbita.Text else Orbita.TextSoft,
                    style = MaterialTheme.typography.labelLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (s == Section.Tasks && active > 0) {
                    Spacer(Modifier.width(5.dp))
                    Text("$active", color = Orbita.Accent, style = MaterialTheme.typography.labelLarge)
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

/**
 * Un agente a la vez sobre el mundo, con ‹ › (o deslizando) para pasar al siguiente. Tocarlo abre su ficha y acerca
 * la cámara a su estación; las flechas solo acercan la cámara (y cambian la ficha si ya estaba abierta).
 */
@Composable
fun AgentSwitcher(snapshot: Snapshot, model: OrbitaModel, onFocus: (Agent) -> Unit, modifier: Modifier = Modifier) {
    val agents = teamOrder(snapshot)
    if (agents.isEmpty()) return
    var index by remember { mutableIntStateOf(0) }
    // Si eliges un agente en el mundo, el selector se pone en él.
    LaunchedEffect(model.selectedAgentId, agents.size) {
        val i = agents.indexOfFirst { it.id == model.selectedAgentId }
        if (i >= 0) index = i
    }
    val i = index.coerceIn(0, agents.lastIndex)
    val agent = agents[i]
    fun go(step: Int) {
        index = (i + step + agents.size) % agents.size
        val next = agents[index]
        model.feedback.select()
        if (model.selectedAgentId != null) model.selectAgent(next.id, poke = false)
        onFocus(next)
    }
    var drag by remember { mutableFloatStateOf(0f) }
    Row(
        modifier
            .heightIn(min = 60.dp)
            .glass(radius = 30.dp)
            .pointerInput(agents.size) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        if (abs(drag) > 60f) go(if (drag < 0) 1 else -1)
                        drag = 0f
                    },
                    onDragCancel = { drag = 0f },
                ) { _, delta -> drag += delta }
            }
            .padding(horizontal = 4.dp)
            .testTag("agent-switcher"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (agents.size > 1) IconAction(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, t("Agente anterior"), onClick = { go(-1) }, modifier = Modifier.testTag("agent-prev"))
        Row(
            Modifier
                .clip(RoundedCornerShape(24.dp))
                .tappable(haptic = Haptic.Select) {
                    val again = model.selectedAgentId == agent.id
                    model.selectAgent(if (again) null else agent.id)
                    if (!again) onFocus(agent)
                }
                .semantics(mergeDescendants = true) { selected = model.selectedAgentId == agent.id }
                .padding(horizontal = 8.dp, vertical = 6.dp)
                .testTag("agent-current"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RobotFace(agent, 36.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.widthIn(min = 120.dp, max = 220.dp)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(agent.name, color = Orbita.Text, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (agent.modelLabel.isNotBlank()) {
                        Spacer(Modifier.width(6.dp))
                        Text(agent.modelLabel, color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Dot(activityColor(agent.activity), 7.dp, pulse = agent.activity == "working" || agent.activity == "thinking")
                    Spacer(Modifier.width(6.dp))
                    Text(
                        t("{activity} · {n} de {total}", "activity" to Labels.activity(agent.activity), "n" to (i + 1), "total" to agents.size),
                        color = Orbita.TextSoft,
                        style = MaterialTheme.typography.labelMedium,
                        maxLines = 1,
                    )
                }
            }
        }
        if (agents.size > 1) IconAction(Icons.AutoMirrored.Outlined.KeyboardArrowRight, t("Agente siguiente"), onClick = { go(1) }, modifier = Modifier.testTag("agent-next"))
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
        // Agente local (LM Studio): razonamiento del modelo. Apagado responde antes; encendido piensa (para lo que necesita mucha información).
        if (agent.provider == "lmstudio" && snapshot.capabilities.agentThinking) {
            Spacer(Modifier.height(10.dp))
            var pending by remember(agent.id, agent.thinking) { mutableStateOf<Boolean?>(null) }
            val on = pending ?: agent.thinking
            Box(Modifier.fillMaxWidth().card()) {
                ToggleRow(
                    t("Razonamiento (think)"),
                    if (on) t("Encendido: piensa antes de responder (más lento, para lo que necesita mucha información).") else t("Apagado: responde directamente, más rápido."),
                    on,
                    "agent-thinking",
                ) { next ->
                    pending = next
                    model.run({ model.controller.setAgentThinking(agent.id, next) }) { if (!it.ok) pending = null }
                }
            }
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
