package com.aicowork.remote.ui.orbita

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.store.EffectsPreference
import com.aicowork.remote.demo.DemoServer
import com.aicowork.remote.ui.onboarding.OnboardingScreen
import com.aicowork.remote.ui.onboarding.OnboardingViewModel
import com.aicowork.remote.ui.space.OrbitaWorld
import com.aicowork.remote.ui.space.ScenePick
import com.aicowork.remote.ui.space.SpaceScene
import com.aicowork.remote.ui.space.SpaceSceneBuilder
import com.aicowork.remote.ui.space.SpaceStatus
import com.aicowork.remote.ui.space.SpaceZone
import com.aicowork.remote.ui.space.WorldInsets
import com.aicowork.remote.ui.space.spaceStatus
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

/** Postura del plegable: plano, o medio doblado con la bisagra horizontal (sobre la mesa). */
sealed interface Posture {
    data object Flat : Posture
    /** Bisagra horizontal a media altura: arriba el mundo, abajo los controles. [hingeTop]/[hingeBottom] en px. */
    data class Tabletop(val hingeTop: Int, val hingeBottom: Int) : Posture
}

@Composable
fun rememberPosture(): Posture {
    val activity = LocalContext.current.findActivity() ?: return Posture.Flat
    val tracker = remember(activity) { WindowInfoTracker.getOrCreate(activity) }
    val info by remember(activity) { tracker.windowLayoutInfo(activity) }.collectAsStateWithLifecycle(initialValue = null)
    val fold = info?.displayFeatures?.filterIsInstance<FoldingFeature>()?.firstOrNull() ?: return Posture.Flat
    return if (fold.state == FoldingFeature.State.HALF_OPENED && fold.orientation == FoldingFeature.Orientation.HORIZONTAL) {
        Posture.Tabletop(fold.bounds.top, fold.bounds.bottom)
    } else Posture.Flat
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/** Raíz de la app: emparejar o, ya emparejado, el mundo con sus paneles. */
@Composable
fun OrbitaApp(model: OrbitaModel, deviceName: String, demoServer: DemoServer?) {
    val state by model.controller.state.collectAsStateWithLifecycle()
    val view = LocalView.current
    SideEffect { model.feedback.view = view }
    OrbitaTheme {
        CompositionLocalProvider(LocalFeedback provides model.feedback, LocalMarkdownImages provides remember(model) { MarkdownImages(model) }) {
            if (state.session == null) {
                val key = "onboarding-${state.previousSession?.pairedAt}-${state.notice.hashCode()}"
                val vm: OnboardingViewModel = viewModel(
                    key = key,
                    factory = viewModelFactory { initializer { OnboardingViewModel(model.controller, demoServer, deviceName) } },
                )
                Box(Modifier.fillMaxSize().background(Orbita.Night)) { OnboardingScreen(vm) }
            } else {
                OrbitaShell(model, state)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OrbitaShell(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    val status = spaceStatus(state)
    val stale = (status as? SpaceStatus.Ready)?.stale ?: false
    // «En reposo» depende del tiempo (como en el escritorio): se recalcula cada pocos segundos.
    val openedAt = remember { System.currentTimeMillis() }
    var tick by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(4_000)
            tick = System.currentTimeMillis()
        }
    }
    val attention = remember(snapshot) { snapshot?.let { OrbitaModel.attentionOf(it) } }
    val scene = remember(snapshot, stale, tick, attention) {
        snapshot?.let { SpaceSceneBuilder.build(it, stale, System.currentTimeMillis(), openedAt, attention = setOfNotNull(attention?.agentId), attentionLabels = attention?.let { a -> a.label?.let { mapOf(a.agentId to it) } }.orEmpty()) }
    }
    val posture = rememberPosture()
    val density = LocalDensity.current
    var rootSize by remember { mutableStateOf(IntSize(1, 1)) }
    var glassActive by remember { mutableStateOf(model.world.glassActive) }
    LaunchedEffect(model.world) {
        while (true) {
            glassActive = model.world.glassActive
            delay(400)
        }
    }
    val blur = model.worldAvailable && scene != null && model.preferences.effects != EffectsPreference.Soft && glassActive
    val glass = remember(blur) { GlassContext(model.world.glass, blur) }

    BackHandler(enabled = model.viewer != null || model.traceTaskId != null || model.hermesModelOpen || model.inboxOpen || model.newTaskOpen || model.moreOpen || model.projectMenu || model.section != Section.World || model.selectedAgentId != null) {
        when {
            model.viewer != null -> model.viewer = null
            model.traceTaskId != null -> model.traceTaskId = null
            model.hermesModelOpen -> model.hermesModelOpen = false
            model.inboxOpen -> model.closeInbox()
            model.newTaskOpen -> model.newTaskOpen = false
            model.projectMenu -> model.projectMenu = false
            model.moreOpen -> model.moreOpen = false
            // Plegado, la pantalla completa se recuerda: atrás cierra el panel (como cualquier pantalla).
            model.expanded && with(density) { rootSize.width.toDp() } >= 600.dp -> model.expanded = false
            model.section != Section.World -> model.close()
            else -> model.selectAgent(null, poke = false)
        }
    }

    // Si la app pasa a segundo plano mientras grabas, la nota se termina y se pasa a texto (no se pierde).
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    androidx.compose.runtime.DisposableEffect(lifecycle) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_STOP && model.voice is VoiceState.Recording) model.finishVoice(send = false)
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    // Android 13+: el permiso de notificaciones para «Te necesita», una sola vez y cuando ya tiene sentido.
    AskNotificationsOnce(model, state)

    CompositionLocalProvider(LocalGlass provides glass) {
        Box(Modifier.fillMaxSize().background(Orbita.Night).onSizeChanged { rootSize = it }.testTag("orbita")) {
            // 1. El mundo: siempre aquí (plegar/desplegar no lo recrea).
            if (scene != null) {
                OrbitaWorld(
                    scene = scene,
                    selectedId = model.selectedAgentId,
                    controller = model.world,
                    onPick = { pick -> onPick(pick, scene, model, rootSize) },
                    onUnavailable = { model.worldAvailable = false },
                )
            } else {
                WorldPlaceholder(status, onRetry = model.controller::retryNow)
            }

            // 2. La interfaz flotando encima.
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val wide = maxWidth >= 600.dp
                val tabletop = posture as? Posture.Tabletop
                if (wide) {
                    WideLayout(model, state, snapshot, attention, tabletop, maxWidth, density)
                } else {
                    CompactLayout(model, state, snapshot, attention)
                }
            }

            // 3. Encima de todo: lector de resultados, actividad de una tarea y nueva tarea.
            Overlays(model, state)
        }
    }
}

/** Qué se ha tocado en el mundo. */
@Suppress("UNUSED_PARAMETER")
private fun onPick(pick: ScenePick?, scene: SpaceScene, model: OrbitaModel, size: IntSize) {
    when (pick) {
        is ScenePick.Agent -> {
            model.feedback.select()
            model.selectAgent(pick.id)
            model.world.focusAgent(scene, pick.id)
        }
        is ScenePick.Station -> {
            val occupant = scene.station(pick.id)?.occupantId
            model.feedback.select()
            if (occupant != null) model.selectAgent(occupant) else model.selectAgent(null, poke = false)
            scene.station(pick.id)?.let { model.world.focus(it.x, it.z) }
        }
        is ScenePick.Zone -> {
            model.feedback.tap()
            model.world.focus(pick.zone.x, pick.zone.z)
            when (pick.zone) {
                SpaceZone.Tasks -> model.newTaskOpen = true
                SpaceZone.Files -> model.open(Section.Files)
                SpaceZone.Memory -> model.open(Section.Memory)
                SpaceZone.Tools -> model.open(Section.Tools)
            }
        }
        ScenePick.Core -> {
            model.feedback.select()
            model.selectAgent(null, poke = false)
            model.world.focus(0f, 0f)
        }
        null -> model.selectAgent(null, poke = false)
    }
}

@Composable
private fun WorldPlaceholder(status: SpaceStatus, onRetry: () -> Unit) {
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        when (status) {
            is SpaceStatus.Unavailable -> {
                Icon(Icons.Outlined.CloudOff, contentDescription = null, tint = Orbita.Accent, modifier = Modifier.size(44.dp))
                Spacer(Modifier.height(12.dp))
                Text("Sin conexión con el ordenador", color = Orbita.Text, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(4.dp))
                Text("${status.reason}. El mundo aparecerá en cuanto vuelva la conexión.", color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(16.dp))
                OrbitaButton("Reintentar", onClick = onRetry, haptic = Haptic.Tap)
            }
            else -> {
                CircularProgressIndicator(color = Orbita.Accent)
                Spacer(Modifier.height(16.dp))
                Text("Entrando en el mundo de AI Cowork…", color = Orbita.Text, style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------- Plegado

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CompactLayout(model: OrbitaModel, state: CoworkUiState, snapshot: Snapshot?, attention: Attention?) {
    val density = LocalDensity.current
    // Teclado a la vista = ocupa sitio de verdad (en algunos entornos isImeVisible dice que sí sin altura).
    val ime = WindowInsets.ime.getBottom(density) > 0
    val panelOpen = model.section != Section.World
    // Pantalla completa (las flechas del panel): sin barra de arriba ni navegación, todo el sitio para el panel.
    val full = panelOpen && model.isExpanded(compact = true)
    val badges = badgesOf(snapshot)
    BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing.exclude(WindowInsets.ime)).padding(horizontal = if (full) 6.dp else 12.dp, vertical = if (full) 4.dp else 8.dp)) {
        val navHeight = 76.dp
        val topBlock = 104.dp
        val panelMax = maxHeight - navHeight - 12.dp - topBlock
        val panelHeight by animateDpAsState(
            when {
                full -> maxHeight
                ime -> maxHeight - 58.dp
                else -> panelMax * 0.86f
            },
            tween(260),
            label = "panelH",
        )

        // El mundo se encuadra en el hueco libre.
        SideEffect {
            with(density) {
                val top = (topBlock + 24.dp).toPx()
                val bottom = (navHeight + 20.dp + if (panelOpen) panelHeight else if (model.selectedAgentId != null) 200.dp else 0.dp).toPx()
                model.world.insets = WorldInsets(top = top, bottom = bottom.coerceAtMost(constraints.maxHeight * 0.8f))
                model.world.covered = full
            }
        }

        // Barra superior: proyecto, estado en vivo y quién trabaja.
        if (!full) Column(Modifier.align(Alignment.TopStart).fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                ProjectChip(state, model, Modifier.weight(1f, fill = false))
                Spacer(Modifier.weight(1f))
                if (inboxSupported(state)) {
                    InboxButton(state, model)
                    Spacer(Modifier.width(8.dp))
                }
                LiveStatus(state, onRetry = model.controller::retryNow)
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                val working = workingCount(snapshot)
                if (working > 0) {
                    Row(Modifier.padding(start = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Groups, contentDescription = null, tint = Orbita.Text, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("$working trabajando", color = Orbita.Text, style = MaterialTheme.typography.labelLarge)
                    }
                    Spacer(Modifier.width(10.dp))
                }
                AttentionChip(attention, onClick = { attention?.let(model::openAttention) })
            }
        }

        // Panel: sube desde abajo hasta encima de la navegación (o del teclado).
        PanelHost(
            model, state,
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(panelHeight)
                .padding(bottom = if (ime || full) 0.dp else navHeight + 12.dp)
                .windowInsetsPadding(WindowInsets.ime),
            compact = true,
        )

        // Tarjeta del agente elegido (sin panel abierto).
        AnimatedVisibility(
            visible = !panelOpen && !model.moreOpen && model.selectedAgentId != null && snapshot != null,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = navHeight + 12.dp),
            enter = fadeIn() + slideInVertically { it / 3 },
            exit = fadeOut() + slideOutVertically { it / 3 },
        ) {
            val agent = snapshot?.agents?.firstOrNull { it.id == model.selectedAgentId }
            if (agent != null) AgentCard(snapshot, agent, model, attention, Modifier.fillMaxWidth())
        }

        AnimatedVisibility(
            visible = model.moreOpen,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = navHeight + 12.dp),
            enter = fadeIn() + slideInVertically { it / 3 },
            exit = fadeOut() + slideOutVertically { it / 3 },
        ) { MorePanels(model, badges) }

        if (!ime && !full) BottomNav(model, badges, Modifier.align(Alignment.BottomCenter))

        // Menú de proyectos y avisos, debajo de la barra superior.
        Column(Modifier.align(Alignment.TopCenter).padding(top = 54.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            AnimatedVisibility(model.projectMenu, enter = fadeIn() + scaleIn(initialScale = 0.96f), exit = fadeOut() + scaleOut(targetScale = 0.96f)) {
                ProjectMenu(state, model, Modifier.fillMaxWidth())
            }
            Spacer(Modifier.height(8.dp))
            ToastHost(model, Modifier.fillMaxWidth())
        }
    }
}

// ---------------------------------------------------------------------------------------------- Desplegado

@Composable
private fun WideLayout(
    model: OrbitaModel,
    state: CoworkUiState,
    snapshot: Snapshot?,
    attention: Attention?,
    tabletop: Posture.Tabletop?,
    width: Dp,
    density: androidx.compose.ui.unit.Density,
) {
    val badges = badgesOf(snapshot)
    val panelOpen = model.section != Section.World
    BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing.exclude(WindowInsets.ime)).padding(12.dp)) {
        val gap = 12.dp
        val aspect = maxWidth / maxHeight
        val free = maxWidth - RailWidth - gap
        val sideWidth = (maxWidth * 0.42f).coerceIn(340.dp, 460.dp)
        // Sobre la mesa: arriba el mundo, abajo el panel a todo lo ancho (debajo de la bisagra).
        val hingeTopDp = tabletop?.let { with(density) { it.hingeTop.toDp() } }
        val panelWidth by animateDpAsState(if (model.expanded || tabletop != null) free else sideWidth, tween(280), label = "panelW")

        SideEffect {
            with(density) {
                val left = (RailWidth + gap * 2).toPx()
                val right = if (panelOpen && tabletop == null) (panelWidth + gap * 2).toPx() else gap.toPx()
                val bottom = if (tabletop != null) (constraints.maxHeight - hingeTopDp!!.toPx() + 60.dp.toPx()) else 120.dp.toPx()
                model.world.insets = WorldInsets(left = left, top = 74.dp.toPx(), right = right, bottom = bottom)
                model.world.covered = panelOpen && model.expanded && tabletop == null
            }
        }

        Rail(model, badges, Modifier.align(Alignment.TopStart))

        // Barra superior sobre el mundo: marca, proyecto, estado en vivo (se adapta al hueco que deja el panel).
        val topEnd = if (panelOpen && tabletop == null) panelWidth + gap else 0.dp
        val topWidth = maxWidth - RailWidth - gap - 8.dp - topEnd
        Column(Modifier.align(Alignment.TopStart).padding(start = RailWidth + gap + 8.dp, end = topEnd).fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                LogoMark(32.dp)
                if (topWidth >= 560.dp) {
                    Spacer(Modifier.width(10.dp))
                    Text("AI Cowork", color = Orbita.Text, style = MaterialTheme.typography.titleLarge, maxLines = 1)
                }
                Spacer(Modifier.width(12.dp))
                ProjectChip(state, model, Modifier.weight(1f, fill = false))
                Spacer(Modifier.width(8.dp))
                LiveStatus(state, onRetry = model.controller::retryNow, glassy = false, compact = topWidth < 400.dp)
                if (inboxSupported(state)) {
                    Spacer(Modifier.width(8.dp))
                    InboxButton(state, model)
                }
            }
            AttentionChip(attention, onClick = { attention?.let(model::openAttention) }, modifier = Modifier.padding(top = 8.dp))
        }

        val panelModifier = if (tabletop != null) {
            val top = with(density) { (tabletop.hingeBottom.toDp() - 12.dp) }
            Modifier.align(Alignment.BottomEnd).width(panelWidth).fillMaxHeight().padding(top = top)
        } else {
            Modifier.align(Alignment.TopEnd).width(panelWidth).fillMaxHeight().windowInsetsPadding(WindowInsets.ime)
        }
        PanelHost(model, state, panelModifier, compact = false)

        // Selector del Equipo y tarjeta del agente, sobre el mundo.
        val worldEnd = if (panelOpen && tabletop == null) panelWidth + gap else 0.dp
        val worldBottom = if (tabletop != null) with(density) { (constraints.maxHeight - tabletop.hingeTop).toDp() } else 0.dp
        if (snapshot != null && !(model.expanded && panelOpen && tabletop == null)) {
            Column(
                Modifier.align(Alignment.BottomStart).padding(start = RailWidth + gap, end = worldEnd, bottom = worldBottom).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                AnimatedVisibility(
                    visible = model.selectedAgentId != null && snapshot.agents.any { it.id == model.selectedAgentId },
                    enter = fadeIn() + slideInVertically { it / 3 },
                    exit = fadeOut() + slideOutVertically { it / 3 },
                ) {
                    val agent = snapshot.agents.firstOrNull { it.id == model.selectedAgentId }
                    if (agent != null) AgentCard(snapshot, agent, model, attention, Modifier.widthIn(max = 440.dp).padding(bottom = 10.dp))
                }
                TeamBar(snapshot, model, onSelect = { a ->
                    val again = model.selectedAgentId == a.id
                    model.selectAgent(if (again) null else a.id)
                    if (!again) focusAgent(model, snapshot, a.id, aspect)
                })
            }
        }

        Column(
            Modifier.align(Alignment.TopStart).padding(start = RailWidth + gap * 2, top = 56.dp).widthIn(max = 420.dp),
        ) {
            AnimatedVisibility(model.projectMenu, enter = fadeIn() + scaleIn(initialScale = 0.96f), exit = fadeOut() + scaleOut(targetScale = 0.96f)) {
                ProjectMenu(state, model)
            }
        }
        ToastHost(model, Modifier.align(Alignment.TopCenter).padding(top = 60.dp, start = RailWidth + gap, end = if (panelOpen) panelWidth + gap else 0.dp).fillMaxWidth())
    }
}

/** Acerca la cámara a la estación del agente (como al tocarlo en el mundo), en el hueco que dejan los paneles. */
@Suppress("UNUSED_PARAMETER")
fun focusAgent(model: OrbitaModel, snapshot: Snapshot, agentId: String, aspect: Float) {
    model.world.focusAgent(SpaceSceneBuilder.build(snapshot), agentId)
}

/** Avisos numéricos de la navegación. */
private fun badgesOf(snapshot: Snapshot?): Map<Section, Int> {
    if (snapshot == null) return emptyMap()
    return mapOf(
        Section.Tasks to snapshot.tasks.count { it.isActive },
        Section.Memory to snapshot.memory.count { it.status == "provisional" },
    )
}

// ---------------------------------------------------------------------------------------------- Panel

/**
 * Un panel a la vez sobre el mundo. El marco de cristal es único (aparece y se va con una transición breve) y su
 * contenido cambia con un fundido; así el difuminado del mundo acompaña siempre al panel.
 */
@Composable
fun PanelHost(model: OrbitaModel, state: CoworkUiState, modifier: Modifier, compact: Boolean) {
    val visible = model.section != Section.World && !(compact && model.moreOpen)
    var shown by remember { mutableStateOf(Section.Chat) }
    if (visible) shown = model.section
    val reduced = model.reducedMotion()
    val progress by animateFloatAsState(if (visible) 1f else 0f, tween(if (reduced) 120 else 260), label = "panel")
    if (progress <= 0.001f) return
    val density = LocalDensity.current
    val slide = with(density) { (if (compact) 36.dp else 28.dp).roundToPx() }
    Box(
        modifier
            .offset { if (compact) IntOffset(0, ((1f - progress) * slide).roundToInt()) else IntOffset(((1f - progress) * slide).roundToInt(), 0) }
            .graphicsLayer { alpha = progress }
            .glass(radius = 30.dp, alpha = progress)
            .testTag("panel"),
    ) {
        AnimatedContent(
            targetState = shown,
            transitionSpec = { fadeIn(tween(if (reduced) 80 else 200, delayMillis = if (reduced) 0 else 60)) togetherWith fadeOut(tween(if (reduced) 60 else 120)) },
            label = "panelContent",
        ) { section ->
            CompositionLocalProvider(LocalCompactPanel provides compact) {
                Box(Modifier.fillMaxSize()) { PanelContent(section, model, state, compact) }
            }
        }
    }
}

@Composable
private fun PanelContent(section: Section, model: OrbitaModel, state: CoworkUiState, compact: Boolean) {
    when (section) {
        Section.Chat -> ChatPanel(model, state)
        Section.Tasks -> TasksPanel(model, state)
        Section.Files -> FilesPanel(model, state)
        Section.Results -> ResultsPanel(model, state)
        Section.Memory -> MemoryPanel(model, state)
        Section.Tools -> ToolsPanel(model, state)
        Section.Usage -> UsagePanel(model, state)
        Section.Settings -> SettingsPanel(model, state)
        Section.Team -> TeamPanel(model, state)
        Section.World -> Unit
    }
}
