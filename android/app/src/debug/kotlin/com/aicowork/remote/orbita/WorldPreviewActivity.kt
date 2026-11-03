package com.aicowork.remote.orbita

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.Conversation
import com.aicowork.remote.data.model.MemoryEntry
import com.aicowork.remote.data.model.RobotAvatar
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import com.aicowork.remote.data.store.ThemeMode
import com.aicowork.remote.ui.space.EffectsLevel
import com.aicowork.remote.ui.space.GlassRegion
import com.aicowork.remote.ui.space.OrbitaWorld
import com.aicowork.remote.ui.space.ScenePick
import com.aicowork.remote.ui.space.SpaceColors
import com.aicowork.remote.ui.space.SpaceSceneBuilder
import com.aicowork.remote.ui.space.WorldController
import com.aicowork.remote.ui.space.WorldEvent
import com.aicowork.remote.ui.space.WorldInsets
import com.aicowork.remote.ui.space.WorldSettings
import com.aicowork.remote.ui.theme.CoworkTheme
import kotlinx.coroutines.delay

/**
 * Vista previa del mundo Órbita (solo depuración): el equipo del escritorio en el mundo 3D con paneles de cristal de
 * ejemplo, el encuadre en el hueco libre y una ronda de eventos de demostración. La actividad declara los cambios de
 * configuración, así que plegar o desplegar no la recrea; y el controlador vive con el proceso.
 *
 * `adb shell am start -n com.aicowork.remote.debug/com.aicowork.remote.orbita.WorldPreviewActivity`
 * con `--ez glass false`, `--es effects Soft|Normal|Full`, `--ez events false`, `--ez ambient false`, `--ez reduced true`.
 */
class WorldPreviewActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val glass = intent.getBooleanExtra("glass", true)
        val events = intent.getBooleanExtra("events", true)
        val effects = intent.getStringExtra("effects")?.let { name -> EffectsLevel.entries.firstOrNull { it.name.equals(name, ignoreCase = true) } } ?: EffectsLevel.Normal
        controller.settings = WorldSettings(
            ambient = intent.getBooleanExtra("ambient", true),
            effects = effects,
            reducedMotion = intent.getBooleanExtra("reduced", false),
        )
        val focus = intent.getStringExtra("focus")
        setContent {
            CoworkTheme(themeMode = ThemeMode.Dark) { OrbitaPreview(controller, glass, events) }
            // `--es focus <agente>`: la cámara se acerca a su estación (como al tocarlo), encuadrada en el hueco libre.
            if (focus != null) LaunchedEffect(focus) {
                delay(1500)
                controller.focusAgent(OrbitaSample.scene(), focus)
            }
        }
    }

    companion object {
        /** Como la guardará la app: uno por proceso. */
        val controller = WorldController()
    }
}

/** Equipo de ejemplo: el del escritorio con sus estados (Hermes necesita al usuario y el becario está en pausa). */
object OrbitaSample {
    val snapshot = Snapshot(
        conversation = Conversation(id = "c1", title = "Mi primer proyecto", activeRequestIds = listOf("r1")),
        agents = listOf(
            Agent("hermes", "Hermes", provider = "hermes", modelLabel = "Hermes Agent", color = "#ffe6ba", stationId = "st-hermes", plannerOnly = true, activity = "thinking", lastActivity = "Coordinando",
                avatar = RobotAvatar("dome", "hair", "round", "hermes", "#ffc65a", "#141419", "#d6a743")),
            Agent("gemini", "Gemini", provider = "gemini", modelLabel = "3.8 Flash", color = "#2a7bff", stationId = "st-gemini", activity = "working", taskId = "t1", lastActivity = "Investigando",
                avatar = RobotAvatar("capsule", "ears", "round", "gemini", "#6ef3ff", "#3ab8ff")),
            Agent("qwen", "Qwen", provider = "ollama", modelLabel = "Local 14B", color = "#8a55ff", stationId = "st-qwen",
                avatar = RobotAvatar("egg", "none", "pill", "qwen", "#ecdcff")),
            Agent("claude", "Claude", provider = "claude", modelLabel = "Sonnet", color = "#ff7a1f", stationId = "st-claude", activity = "working", taskId = "t2", lastActivity = "Diseñando",
                avatar = RobotAvatar("blob", "tuft", "arc", "claude", "#fff0c8")),
            Agent("codex", "Codex", provider = "codex", modelLabel = "GPT-6.1 Sol", color = "#21c07c", stationId = "st-codex", activity = "waiting", waitingFor = "claude",
                avatar = RobotAvatar("cube", "vents", "chevron", "openai", "#8cffd0")),
            Agent("becario-1", "Becario", provider = "claude", modelLabel = "Haiku", color = "#ffc21a", stationId = "st-sub-1", isSubagent = true),
        ),
        tasks = listOf(
            TaskItem("t1", "r1", "Investigar competidores", agentId = "gemini", status = "running", progress = 0.45),
            TaskItem("t2", "r1", "Diseñar la portada", agentId = "claude", status = "running"),
            TaskItem("t3", "r0", "Resumir el informe", agentId = "becario-1", status = "cancelled", error = SpaceSceneBuilder.INTERRUPTED),
        ),
        memory = listOf(MemoryEntry("m1", kind = "decision", text = "App nativa"), MemoryEntry("m2", kind = "preference", text = "Español")),
    )

    fun scene(attention: Set<String> = setOf("hermes")) = SpaceSceneBuilder.build(snapshot, now = System.currentTimeMillis(), attention = attention)

    /** Ronda de actividad de demostración (como la que manda el escritorio). */
    val script: List<WorldEvent> = listOf(
        WorldEvent.Transfer("a", "core", "gemini", "Nueva tarea", "Investigar competidores"),
        WorldEvent.Transfer("b", "claude", "codex", "Delegada: Maquetar la portada", "Maquetar la portada"),
        WorldEvent.Transfer("c", "user", "hermes", "Petición", "Prepara la presentación"),
        WorldEvent.TaskCompleted("t1", "gemini"),
        WorldEvent.Transfer("d", "gemini", "core", "Resultado: Investigar competidores", "Investigar competidores"),
        WorldEvent.Poke("qwen"),
        WorldEvent.TaskFailed("t9", "codex"),
    )
}

@Composable
fun OrbitaPreview(controller: WorldController, glass: Boolean, events: Boolean, attention: Set<String> = setOf("hermes")) {
    val scene = remember(attention) { OrbitaSample.scene(attention) }
    var size by remember { mutableStateOf(IntSize.Zero) }
    val density = LocalDensity.current
    val glassActive by produceState(controller.glassActive) {
        while (true) {
            value = controller.glassActive
            delay(250)
        }
    }
    Box(Modifier.fillMaxSize().background(Color(SpaceColors.BACKGROUND)).onSizeChanged { size = it }) {
        OrbitaWorld(scene, selectedId = null, controller = controller, onPick = { pick -> if (pick is ScenePick.Agent) controller.post(WorldEvent.Poke(pick.id)) })
        val wide = with(density) { size.width.toDp() } >= 600.dp
        if (glass && size != IntSize.Zero) {
            // Paneles de ejemplo: con el mundo dibujando el cristal, tinte translúcido; si no, más opaco.
            val tint = if (glassActive) Color(0x6610172A) else Color(0xE610172A)
            if (wide) {
                GlassPanel(controller, "panel", tint, Modifier.align(Alignment.CenterEnd).windowInsetsPadding(WindowInsets.safeDrawing).padding(16.dp).width(400.dp).fillMaxHeight())
            } else {
                GlassPanel(controller, "panel", tint, Modifier.align(Alignment.BottomCenter).windowInsetsPadding(WindowInsets.safeDrawing).padding(12.dp).fillMaxWidth().height(300.dp))
            }
            GlassPanel(controller, "bar", tint, Modifier.align(Alignment.TopStart).windowInsetsPadding(WindowInsets.safeDrawing).padding(16.dp).width(240.dp).height(56.dp), title = "Órbita", lines = emptyList())
            LaunchedEffect(wide, size) {
                controller.insets = with(density) {
                    if (wide) WorldInsets(right = (400 + 32).dp.toPx()) else WorldInsets(bottom = (300 + 24).dp.toPx())
                }
            }
        } else {
            LaunchedEffect(Unit) { controller.insets = WorldInsets() }
        }
    }
    if (events) {
        LaunchedEffect(Unit) {
            var i = 0
            while (true) {
                delay(1700)
                val e = OrbitaSample.script[i % OrbitaSample.script.size]
                controller.post(if (e is WorldEvent.Transfer) e.copy(id = "${e.id}#$i") else e)
                i++
            }
        }
    }
}

@Composable
private fun GlassPanel(
    controller: WorldController,
    key: String,
    tint: Color,
    modifier: Modifier,
    title: String = "Hermes",
    lines: List<String> = listOf("Necesito que me confirmes el tono de la presentación.", "Gemini ha terminado de investigar a los competidores.", "Claude está diseñando la portada."),
) {
    val shape = RoundedCornerShape(24.dp)
    val radius = with(LocalDensity.current) { 24.dp.toPx() }
    DisposableEffect(key) { onDispose { controller.glass.put(key, null) } }
    Box(
        modifier
            .onGloballyPositioned { c ->
                val r = c.boundsInRoot()
                controller.glass.put(key, GlassRegion(r.left, r.top, r.right, r.bottom, radius))
            }
            .clip(shape)
            .background(tint)
            .border(1.dp, Color(0x2EFFFFFF), shape)
            .testTag("glass-$key"),
    ) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = if (lines.isEmpty()) 14.dp else 20.dp)) {
            Text(title, color = Color(0xFFEEF2FA), fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            for (line in lines) {
                Spacer(Modifier.height(12.dp))
                Text(line, color = Color(0xFFC6CEDD), fontSize = 15.sp)
            }
        }
    }
}
