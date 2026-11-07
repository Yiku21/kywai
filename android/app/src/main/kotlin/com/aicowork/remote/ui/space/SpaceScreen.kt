package com.aicowork.remote.ui.space

import com.aicowork.remote.i18n.t

import android.app.ActivityManager
import android.content.Context
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CenterFocusStrong
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.ViewInAr
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.store.ThemeMode
import com.aicowork.remote.ui.components.Format
import com.aicowork.remote.ui.theme.CoworkTheme
import kotlinx.coroutines.delay

private val SpaceBackground = Color(SpaceColors.BACKGROUND)
private val PanelColor = Color(0xE60B0D2A)
private val PanelBorder = Color(0x553F7BFF)
private val TextSoft = Color(0xFFC9CCF5)

/**
 * Espacio digital en 3D (OpenGL ES nativo, sin WebView) a pantalla completa: la misma escena que la app de
 * escritorio (estaciones, núcleo, zonas, ciudad y robots con su estado real). Se gira con un dedo, se mueve y se
 * acerca con dos, se elige un robot tocándolo (o con las fichas de abajo, que también sirven a los lectores de
 * pantalla) y un doble toque vuelve a la vista general. [onOpenZone] abre la sección de una zona (tareas, archivos,
 * memoria) si quien la usa lo permite.
 */
@Composable
fun SpaceScreen(
    state: CoworkUiState,
    onBack: (() -> Unit)?,
    onOpenAgent: (String) -> Unit,
    onOpenTask: (String) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenZone: ((SpaceZone) -> Unit)? = null,
) {
    CoworkTheme(themeMode = ThemeMode.Dark) {
        Box(modifier.fillMaxSize().background(SpaceBackground).testTag("space")) {
            when (val status = spaceStatus(state)) {
                SpaceStatus.Loading -> Centered {
                    CircularProgressIndicator(color = Color(SpaceColors.CYAN))
                    Spacer(Modifier.height(16.dp))
                    Text(t("Cargando el espacio digital…"), color = Color.White, style = MaterialTheme.typography.titleMedium)
                }
                is SpaceStatus.Unavailable -> Centered {
                    Icon(Icons.Outlined.CloudOff, contentDescription = null, tint = Color(SpaceColors.CYAN), modifier = Modifier.size(48.dp))
                    Spacer(Modifier.height(12.dp))
                    Text(t("Sin conexión con el ordenador"), color = Color.White, style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    Text(t("{reason}. El espacio digital aparecerá en cuanto vuelva la conexión.", "reason" to status.reason), color = TextSoft, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(16.dp))
                    Button(onClick = onRetry) { Text(t("Reintentar")) }
                }
                is SpaceStatus.Ready -> ReadySpace(state, status, hasBack = onBack != null, onOpenAgent, onOpenTask, onOpenZone, onRetry)
            }
            if (onBack != null) {
                IconButton(onClick = onBack, modifier = Modifier.align(Alignment.TopStart).windowInsetsPadding(WindowInsets.safeDrawing).padding(4.dp).testTag("space-back")) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = t("Atrás"), tint = Color.White)
                }
            }
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(32.dp).semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) { content() }
}

private val CameraSaver = Saver<OrbitCamera, List<Float>>(
    save = { c -> c.goalPose.let { listOf(it.yaw, it.pitch, it.distance, it.target.x, it.target.y, it.target.z, if (c.atOverview) 1f else 0f) } },
    restore = { l -> OrbitCamera(OrbitCamera.Pose(l[0], l[1], l[2], Vec3(l[3], l[4], l[5])), atOverview = l.getOrElse(6) { 1f } > 0.5f) },
)

@Composable
private fun ReadySpace(
    state: CoworkUiState,
    status: SpaceStatus.Ready,
    hasBack: Boolean,
    onOpenAgent: (String) -> Unit,
    onOpenTask: (String) -> Unit,
    onOpenZone: ((SpaceZone) -> Unit)?,
    onRetry: () -> Unit,
) {
    val context = LocalContext.current
    val snapshot = state.snapshot ?: return
    // «En reposo» depende del tiempo (como en el escritorio, desde lo último que hizo o desde que se abrió la vista).
    val openedAt = rememberSaveable { System.currentTimeMillis() }
    var tick by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(4_000)
            tick = System.currentTimeMillis()
        }
    }
    val scene = remember(snapshot, status.stale, tick) { SpaceSceneBuilder.build(snapshot, status.stale, System.currentTimeMillis(), openedAt) }
    val camera = rememberSaveable(saver = CameraSaver) { OrbitCamera() }
    var selectedRaw by rememberSaveable { mutableStateOf<String?>(null) }
    var zoneRaw by rememberSaveable { mutableStateOf<String?>(null) }
    var touched by rememberSaveable { mutableStateOf(false) }
    val selected = scene.agent(selectedRaw)
    val zone = SpaceZone.entries.firstOrNull { it.name == zoneRaw }
    val glAvailable = remember { supportsOpenGl(context) }
    var glFailed by remember { mutableStateOf(false) }
    var size by remember { mutableStateOf(IntSize(1, 1)) }
    val aspect = size.width.toFloat() / size.height.coerceAtLeast(1)

    fun select(id: String?) {
        selectedRaw = id
        zoneRaw = null
        // Como al pulsar una estación en el escritorio: la cámara se acerca a ella.
        scene.agent(id)?.let { a -> scene.station(a.stationId)?.let { camera.focus(it.x, it.z, aspect) } }
    }

    fun onPick(pick: ScenePick?) {
        when (pick) {
            is ScenePick.Agent -> select(pick.id)
            is ScenePick.Station -> {
                val occupant = scene.station(pick.id)?.occupantId
                if (occupant != null) select(occupant) else {
                    selectedRaw = null
                    zoneRaw = null
                    scene.station(pick.id)?.let { camera.focus(it.x, it.z, aspect) }
                }
            }
            is ScenePick.Zone -> {
                selectedRaw = null
                zoneRaw = pick.zone.name
                camera.focus(pick.zone.x, pick.zone.z, aspect)
            }
            ScenePick.Core -> {
                selectedRaw = null
                zoneRaw = null
                camera.focus(0f, 0f, aspect)
            }
            null -> {
                selectedRaw = null
                zoneRaw = null
            }
        }
    }

    BackHandler(enabled = selected != null || zone != null) { selectedRaw = null; zoneRaw = null }

    Box(Modifier.fillMaxSize().onSizeChanged { size = it }) {
        // La escena llega hasta los bordes; los controles respetan las barras del sistema.
        if (glAvailable && !glFailed) {
            SpaceGlView(scene, selected?.id, camera, onFailure = { glFailed = true }, Modifier.fillMaxSize())
            TouchLayer(scene, camera, onTouched = { touched = true }, onPick = ::onPick)
        } else {
            Fallback2D(Modifier.align(Alignment.Center))
        }

        Column(Modifier.fillMaxWidth().align(Alignment.TopCenter).windowInsetsPadding(WindowInsets.safeDrawing).padding(start = if (hasBack) 52.dp else 16.dp, end = 8.dp, top = 6.dp)) {
            Text(t("Espacio digital"), color = Color.White, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
            Text(scene.summary, color = TextSoft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("space-summary"))
            if (status.stale) {
                StaleBanner(status, state.syncedAt, onRetry)
            }
        }

        if (glAvailable && !glFailed && selected == null && zone == null) {
            CameraControls(
                onZoomIn = { touched = true; camera.dolly(1) },
                onZoomOut = { touched = true; camera.dolly(-1) },
                onOverview = { touched = true; selectedRaw = null; zoneRaw = null; camera.overview(aspect) },
                modifier = Modifier.align(Alignment.BottomEnd).windowInsetsPadding(WindowInsets.safeDrawing).padding(end = 8.dp, bottom = 108.dp),
            )
        }

        if (scene.agents.isEmpty()) {
            Panel(Modifier.align(Alignment.Center).padding(24.dp)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(20.dp)) {
                    Icon(Icons.Outlined.Groups, contentDescription = null, tint = Color(SpaceColors.CYAN))
                    Spacer(Modifier.height(8.dp))
                    Text(t("Todavía no hay agentes"), color = Color.White, style = MaterialTheme.typography.titleMedium)
                    Text(t("Cuando el ordenador comparta su equipo, sus robots aparecerán en sus estaciones."), color = TextSoft, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing)) {
            AnimatedVisibility(visible = !touched && selected == null && zone == null && scene.agents.isNotEmpty() && glAvailable && !glFailed, enter = fadeIn(), exit = fadeOut()) {
                Text(
                    t("Arrastra para girar · dos dedos para mover y acercar · toca un robot"),
                    color = TextSoft,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.align(Alignment.CenterHorizontally).padding(bottom = 6.dp),
                )
            }
            AnimatedVisibility(visible = selected != null, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                // Mantiene el último agente durante la animación de salida.
                val last = remember { mutableStateOf(selected) }
                if (selected != null) last.value = selected
                last.value?.let { AgentCard(it, scene, onClose = { selectedRaw = null }, onOpenAgent = onOpenAgent, onOpenTask = onOpenTask) }
            }
            AnimatedVisibility(visible = zone != null && selected == null, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                val last = remember { mutableStateOf(zone) }
                if (zone != null) last.value = zone
                last.value?.let { ZoneCard(it, scene, onClose = { zoneRaw = null }, onOpen = onOpenZone) }
            }
            if (selected == null && zone == null && scene.agents.isNotEmpty()) {
                AgentChips(scene, onSelect = { select(it) })
            }
        }
    }
}

/** Botones de cámara (los del escritorio, a mano del pulgar): acercar, alejar y vista general. */
@Composable
private fun CameraControls(onZoomIn: () -> Unit, onZoomOut: () -> Unit, onOverview: () -> Unit, modifier: Modifier) {
    Panel(modifier.testTag("space-camera")) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            IconButton(onClick = onZoomIn, modifier = Modifier.testTag("space-zoom-in")) { Icon(Icons.Outlined.Add, contentDescription = t("Acercar"), tint = Color.White) }
            IconButton(onClick = onZoomOut, modifier = Modifier.testTag("space-zoom-out")) { Icon(Icons.Outlined.Remove, contentDescription = t("Alejar"), tint = Color.White) }
            IconButton(onClick = onOverview, modifier = Modifier.testTag("space-overview")) { Icon(Icons.Outlined.CenterFocusStrong, contentDescription = t("Vista general"), tint = Color.White) }
        }
    }
}

/**
 * Capa de gestos encima de la vista OpenGL: un dedo gira, dos dedos desplazan y pellizcan, tocar elige (robot,
 * estación, zona o núcleo) y un doble toque vuelve a la vista general.
 */
@Composable
internal fun TouchLayer(scene: SpaceScene, camera: OrbitCamera, onTouched: () -> Unit, onPick: (ScenePick?) -> Unit) {
    val currentScene by rememberUpdatedState(scene)
    val pick by rememberUpdatedState(onPick)
    val touched by rememberUpdatedState(onTouched)
    val minRadius = with(LocalDensity.current) { 24.dp.toPx() }
    Box(
        Modifier
            .fillMaxSize()
            .testTag("space-canvas")
            .semantics { contentDescription = t("Vista 3D del equipo. {summary}", "summary" to scene.summary) }
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    var dragging = false
                    do {
                        val event = awaitPointerEvent()
                        val pressed = event.changes.count { it.pressed }
                        val pan = event.calculatePan()
                        val zoom = event.calculateZoom()
                        if (!dragging && (pan.getDistance() > viewConfiguration.touchSlop || zoom != 1f)) {
                            dragging = true
                            touched()
                            camera.setDragging(true)
                        }
                        if (dragging) {
                            val h = size.height.toFloat()
                            if (pressed >= 2) {
                                camera.pan(pan.x, pan.y, h)
                                if (zoom != 1f) camera.zoom(zoom)
                            } else if (pressed == 1) {
                                camera.orbit(pan.x, pan.y, h)
                            }
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                    camera.setDragging(false)
                }
            }
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = { offset ->
                        touched()
                        val w = size.width.toFloat()
                        val h = size.height.toFloat()
                        val vp = camera.viewProjection(FloatArray(16), w / h.coerceAtLeast(1f))
                        pick(ScenePicker.pick(vp, w, h, offset.x, offset.y, ScenePicker.targets(currentScene), minRadius))
                    },
                    onDoubleTap = {
                        touched()
                        pick(null)
                        camera.overview(size.width.toFloat() / size.height.coerceAtLeast(1))
                    },
                )
            },
    )
}

/** Vista 3D de la sección antigua: el mismo mundo que [OrbitaWorld], con un controlador propio. */
@Composable
internal fun SpaceGlView(
    scene: SpaceScene,
    selectedId: String?,
    camera: OrbitCamera,
    onFailure: () -> Unit,
    modifier: Modifier,
) {
    val context = LocalContext.current
    val controller = remember(camera) {
        WorldController(camera).apply {
            settings = WorldSettings(reducedMotion = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f)
        }
    }
    WorldGlView(scene, selectedId, controller, onFailure, modifier)
}

/** OpenGL ES 2.0 está en prácticamente todos los móviles; si no (o en pruebas), se usa la vista alternativa. */
internal fun supportsOpenGl(context: Context): Boolean {
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return false
    return manager.deviceConfigurationInfo.reqGlEsVersion >= 0x20000
}

@Composable
internal fun Fallback2D(modifier: Modifier) {
    Column(modifier.padding(32.dp).testTag("space-fallback"), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Outlined.ViewInAr, contentDescription = null, tint = Color(SpaceColors.CYAN), modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(8.dp))
        Text(t("La vista 3D no está disponible en este dispositivo"), color = Color.White, style = MaterialTheme.typography.titleMedium)
        Text(t("Puedes ver a cada agente con las fichas de abajo."), color = TextSoft, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun StaleBanner(status: SpaceStatus.Ready, syncedAt: Long?, onRetry: () -> Unit) {
    Panel(Modifier.padding(top = 6.dp, end = 8.dp).semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite }) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 12.dp, end = 4.dp)) {
            Icon(Icons.Outlined.CloudOff, contentDescription = null, tint = Color(SpaceColors.WAITING), modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            val ago = Format.relative(syncedAt).let { if (it.isBlank()) "" else t(" · datos de {v1}", "v1" to it) }
            Text(
                (if (status.offlineReason != null) t("Sin conexión") else t("Mostrando la copia guardada")) + ago,
                color = Color.White,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (status.offlineReason != null) TextButton(onClick = onRetry) { Text(t("Reintentar")) }
        }
    }
}

@Composable
private fun Panel(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Surface(
        color = PanelColor,
        shape = RoundedCornerShape(16.dp),
        modifier = modifier.border(1.dp, PanelBorder, RoundedCornerShape(16.dp)),
        content = content,
    )
}

/** Ficha de una zona del espacio: qué es y qué contiene. */
@Composable
private fun ZoneCard(zone: SpaceZone, scene: SpaceScene, onClose: () -> Unit, onOpen: ((SpaceZone) -> Unit)?) {
    val z = scene.zones
    val (text, action) = when (zone) {
        SpaceZone.Tasks -> t("Escribe una petición en el chat y el coordinador la reparte entre el equipo. {runningTasks} en marcha · {pendingTasks} pendientes.", "runningTasks" to scene.core.runningTasks, "pendingTasks" to scene.core.pendingTasks) to t("Nueva tarea")
        SpaceZone.Files -> t("Las tareas del proyecto y sus resultados: {tasks} tareas · {results} con resultado. Los archivos están en la carpeta del proyecto, en el ordenador.", "tasks" to z.tasks, "results" to z.results) to t("Ver tareas")
        SpaceZone.Tools -> t("Terminal, web, código y conectores que usan los agentes desde el ordenador.") to null
        SpaceZone.Memory -> t("Lo que recuerda el proyecto: {decisions} decisiones · {preferences} preferencias · {facts} hechos · {pending} pendientes.", "decisions" to z.decisions, "preferences" to z.preferences, "facts" to z.facts, "pending" to z.pending) to t("Ver memoria")
    }
    Panel(Modifier.fillMaxWidth().padding(12.dp).widthIn(max = 560.dp).testTag("space-zone-card")) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(zone.label, color = Color.White, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, contentDescription = t("Cerrar"), tint = Color.White) }
            }
            Text(text, color = TextSoft, style = MaterialTheme.typography.bodyMedium)
            if (action != null && onOpen != null) {
                Spacer(Modifier.height(12.dp))
                FilledTonalButton(onClick = { onOpen(zone) }) { Text(action) }
            }
        }
    }
}

@Composable
private fun StatusDot(visual: AgentVisual, size: Int = 10) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(Color(SpaceColors.of(visual))))
}

@Composable
private fun AgentChips(scene: SpaceScene, onSelect: (String) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().testTag("space-chips"),
    ) {
        items(scene.agents, key = { it.id }) { agent ->
            Surface(
                onClick = { onSelect(agent.id) },
                color = PanelColor,
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier
                    .height(48.dp)
                    .border(1.dp, Color(SpaceColors.of(agent.visual)).copy(alpha = 0.6f), RoundedCornerShape(24.dp))
                    .testTag("space-agent-${agent.id}")
                    .semantics(mergeDescendants = true) { contentDescription = "${agent.name}, ${agent.activityLabel}" },
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 14.dp)) {
                    StatusDot(agent.visual)
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text(agent.name, color = Color.White, style = MaterialTheme.typography.labelLarge, maxLines = 1)
                        Text(agent.activityLabel, color = TextSoft, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                    }
                }
            }
        }
    }
}

@Composable
private fun AgentCard(
    agent: SceneAgent,
    scene: SpaceScene,
    onClose: () -> Unit,
    onOpenAgent: (String) -> Unit,
    onOpenTask: (String) -> Unit,
) {
    Panel(Modifier.fillMaxWidth().padding(12.dp).widthIn(max = 560.dp).testTag("space-card")) {
        Column(Modifier.padding(16.dp).semantics { selected = true }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(Color(agent.color)),
                    contentAlignment = Alignment.Center,
                ) { Text(Format.initials(agent.name), color = Color.White, fontWeight = FontWeight.Bold) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(agent.name, color = Color.White, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        listOf(agent.role, agent.providerLabel, agent.modelLabel).filter { it.isNotBlank() }.joinToString(" · ") +
                            if (agent.isCoordinator) t(" · Coordina") else "",
                        color = TextSoft,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, contentDescription = t("Cerrar"), tint = Color.White) }
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics(mergeDescendants = true) {}) {
                StatusDot(agent.visual, 12)
                Spacer(Modifier.width(8.dp))
                Text(agent.activityLabel, color = Color.White, style = MaterialTheme.typography.labelLarge)
                agent.waitingFor?.let { other ->
                    Text(t(" · espera a {v1}", "v1" to (scene.agent(other)?.name ?: other)), color = TextSoft, style = MaterialTheme.typography.bodySmall)
                }
                if (agent.atCore) Text(t(" · en el núcleo"), color = TextSoft, style = MaterialTheme.typography.bodySmall)
            }
            agent.taskTitle?.let { title ->
                Spacer(Modifier.height(8.dp))
                Text("«$title»", color = Color.White, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                agent.progress?.let { p ->
                    Spacer(Modifier.height(6.dp))
                    LinearProgressIndicator(
                        progress = { p },
                        color = Color(SpaceColors.of(AgentVisual.Working)),
                        modifier = Modifier.fillMaxWidth().semantics { contentDescription = t("Progreso {v1}", "v1" to Format.percent(p * 100.0)) },
                    )
                }
            }
            agent.detail?.takeIf { it != agent.taskTitle }?.let {
                Spacer(Modifier.height(6.dp))
                Text(it, color = TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            agent.reason?.let {
                Spacer(Modifier.height(6.dp))
                Text(it, color = Color(SpaceColors.of(AgentVisual.Error)), style = MaterialTheme.typography.bodySmall, maxLines = 2)
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = { onOpenAgent(agent.id) }) { Text(t("Ver agente")) }
                agent.taskId?.let { id -> FilledTonalButton(onClick = { onOpenTask(id) }) { Text(t("Ver tarea")) } }
            }
        }
    }
}
