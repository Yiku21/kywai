package com.aicowork.remote.ui.space

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.aicowork.remote.ui.space.gl.SpaceRenderer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicInteger

/*
 * Contrato entre la interfaz Órbita (paneles de cristal) y el mundo 3D.
 *
 * - El mundo ocupa toda la pantalla y está siempre en el mismo sitio de la composición: plegar o desplegar no lo
 *   recrea (la actividad declara los cambios de configuración) y su estado (cámara, robots, reloj) vive en
 *   [WorldController], que sobrevive a todo menos a cerrar la app.
 * - Los paneles flotan encima. Cada uno registra su rectángulo en [GlassRegistry] y el mundo dibuja difuminado lo
 *   que queda debajo: así el cristal esmerilado deja ver el mundo vivo detrás.
 * - Las animaciones de actividad (envíos, tareas terminadas, fallos) solo salen de [WorldEvent] reales del
 *   escritorio; el ambiente (pulsos, globo, cúpula) se mueve solo y se regula con [WorldSettings].
 */

/** Rectángulo de cristal en píxeles de la vista del mundo (que empieza en la esquina de la pantalla). */
@Immutable
data class GlassRegion(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
    /** Radio de las esquinas en píxeles. */
    val radius: Float,
    /** Visibilidad 0..1 (para que el difuminado acompañe a las transiciones del panel). */
    val alpha: Float = 1f,
)

/** Lo escribe la interfaz (hilo principal) y lo lee el hilo de OpenGL en cada fotograma. */
class GlassRegistry {
    private val regions = ConcurrentHashMap<Any, GlassRegion>()

    @Volatile
    var version: Long = 0L
        private set

    fun put(key: Any, region: GlassRegion?) {
        if (region == null) regions.remove(key) else regions[key] = region
        version++
    }

    fun snapshot(): List<GlassRegion> = regions.values.toList()
}

/** Intensidad de efectos: «Suave» ahorra batería (menos partículas, 30 fps, sin difuminado), «Completa» lo da todo. */
enum class EffectsLevel { Soft, Normal, Full }

@Immutable
data class WorldSettings(
    /** Animación ambiental (pulsos de luz, globo, cúpula, partículas). La actividad real se ve siempre. */
    val ambient: Boolean = true,
    val effects: EffectsLevel = EffectsLevel.Normal,
    /** Movimiento reducido (del sistema o elegido en Ajustes). */
    val reducedMotion: Boolean = false,
)

/** Zona de la pantalla que tapan los controles: la cámara encuadra el mundo en el hueco libre. */
@Immutable
data class WorldInsets(val left: Float = 0f, val top: Float = 0f, val right: Float = 0f, val bottom: Float = 0f)

/** Actividad real del escritorio que el mundo representa. Nunca se inventa ni sale de una resincronización. */
sealed interface WorldEvent {
    /** `fromId`/`toId`: id de agente, "core" o "user" (como `transfer.started` del escritorio). */
    data class Transfer(val id: String, val fromId: String, val toId: String, val label: String, val title: String?) : WorldEvent
    data class TaskCompleted(val taskId: String, val agentId: String) : WorldEvent
    data class TaskFailed(val taskId: String, val agentId: String) : WorldEvent
    /** El usuario ha tocado al agente: reacción breve («te he visto»). */
    data class Poke(val agentId: String) : WorldEvent
}

/**
 * Estado del mundo que sobrevive a plegar/desplegar y a los cambios de panel: cámara, cristales, ajustes, hueco libre
 * y la cola de eventos reales. Se crea una vez por proceso (lo guarda la actividad).
 */
class WorldController(val camera: OrbitCamera = OrbitCamera()) {
    val glass = GlassRegistry()

    /** Se lee en cada fotograma: cambiar un ajuste se nota al momento, sin reiniciar nada. */
    @Volatile
    var settings: WorldSettings = WorldSettings()

    /** Zona tapada por los controles (px de la vista del mundo). El encuadre se desplaza hacia el hueco con suavidad. */
    @Volatile
    var insets: WorldInsets = WorldInsets()

    /** El mundo queda tapado del todo (panel ampliado): basta con dibujar muy de vez en cuando (~5 fps). */
    @Volatile
    var covered: Boolean = false

    /** Tema elegido en el ordenador («grafito», «mundo-bosque»…): el espacio se pinta con sus colores ([SpaceGrade]). */
    @Volatile
    var theme: String? = null

    /**
     * El mundo está dibujando el cristal esmerilado bajo las regiones de [glass]. Es false con efectos «Suave», sin
     * OpenGL o si el dispositivo no puede: entonces conviene que los paneles usen tintes más opacos.
     */
    @Volatile
    var glassActive: Boolean = false
        internal set

    private class Posted(val event: WorldEvent, val at: Long)

    private val events = ConcurrentLinkedQueue<Posted>()
    private val queued = AtomicInteger()

    fun post(event: WorldEvent) {
        events.add(Posted(event, System.nanoTime()))
        // Si el mundo no se está dibujando (app en segundo plano), la cola no crece sin límite.
        if (queued.incrementAndGet() > MAX_QUEUED && events.poll() != null) queued.decrementAndGet()
    }

    /** Lo llama el mundo en cada fotograma. */
    fun drain(handle: (WorldEvent) -> Unit) {
        while (true) {
            val posted = events.poll() ?: break
            queued.decrementAndGet()
            handle(posted.event)
        }
    }

    /**
     * Como [drain], pero descarta lo que lleva más de [maxAgeNanos] esperando (p. ej. mientras la app estaba en
     * segundo plano): lo antiguo nunca se anima como si estuviera pasando ahora.
     */
    internal fun drainFresh(nowNanos: Long, maxAgeNanos: Long, handle: (WorldEvent) -> Unit) {
        while (true) {
            val posted = events.poll() ?: break
            queued.decrementAndGet()
            if (nowNanos - posted.at <= maxAgeNanos) handle(posted.event)
        }
    }

    /** Vista general encuadrada en el hueco libre (como el botón de la vista general o el doble toque). */
    fun overview() {
        focusFraming = false
        camera.overview(aspectFor(fitOverview = true))
    }

    /**
     * Acerca la cámara a un punto del suelo (una estación, una zona o el núcleo en 0, 0) y lo deja en el centro del
     * hueco libre. Mejor que `camera.focus`, que no sabe dónde están los paneles.
     */
    fun focus(x: Float, z: Float) {
        focusFraming = true
        camera.focus(x, z, aspectFor(fitOverview = false))
    }

    /** Acerca la cámara a la estación de un agente de [scene]; false si no está. */
    fun focusAgent(scene: SpaceScene, agentId: String): Boolean {
        val st = scene.agent(agentId)?.let { scene.station(it.stationId) } ?: return false
        focus(st.x, st.z)
        return true
    }

    // ---- Lo que vive con el controlador (no con la vista) ----

    /** Robots, paquetes, brillos y reloj de la escena: sobreviven a recrear la vista o el contexto de OpenGL. */
    internal val world = WorldSim()

    /** Encuadre del último fotograma (lo publica el hilo de OpenGL; lo usa la selección por toque). */
    @Volatile
    internal var lens: Lens? = null

    private var rendererInstance: SpaceRenderer? = null

    /** El renderizador del mundo, uno por controlador: si la vista se recrea, solo se rehacen sus recursos de la GPU. */
    @Synchronized
    internal fun renderer(density: Float, lowEnd: Boolean): SpaceRenderer =
        (rendererInstance ?: SpaceRenderer(this, density, lowEnd).also { rendererInstance = it }).also { it.density = density }

    /** Se ha acercado a algo con [focus]: el encuadre es el hueco libre tal cual (sin el mínimo de la vista general). */
    @Volatile
    private var focusFraming = false

    /** El encuadre del fotograma es el de la vista general (con tamaño mínimo) salvo tras [focus] y fuera de ella. */
    internal val fitOverview: Boolean get() = !focusFraming || camera.atOverview

    /** Proporción del encuadre que tendrá la cámara (la de 16:10 si aún no se ha dibujado). */
    private fun aspectFor(fitOverview: Boolean): Float {
        val l = lens ?: return 1.6f
        return Framing.of(l.width, l.height, insets, fitOverview).aspect
    }

    /** Encuadre de una vista de [width]×[height]: el del último fotograma si es de ese tamaño, o el que le toca. */
    internal fun framingFor(width: Float, height: Float): Framing {
        val l = lens
        return if (l != null && l.width == width && l.height == height) l.framing else Framing.of(width, height, insets, fitOverview)
    }

    /** Vista · proyección exacta con la que se dibuja (para seleccionar con el dedo). */
    internal fun viewProjection(out: FloatArray, width: Float, height: Float): Framing {
        val framing = framingFor(width, height)
        camera.viewProjection(out, width, height, framing)
        return framing
    }

    internal data class Lens(val width: Float, val height: Float, val framing: Framing)

    private companion object {
        const val MAX_QUEUED = 256
    }
}

/**
 * El mundo 3D a pantalla completa con sus gestos (girar, mover, acercar, tocar). [onPick] recibe lo que se ha
 * tocado; [onUnavailable] avisa si no hay OpenGL o si falla (entonces la interfaz sigue funcionando sin mundo).
 *
 * El estado del mundo vive en [controller]: si esta vista se recrea (o se recrea la superficie al pasar de la pantalla
 * exterior a la interior), los robots, paquetes, reloj y cámara siguen como estaban.
 */
@Composable
fun OrbitaWorld(
    scene: SpaceScene,
    selectedId: String?,
    controller: WorldController,
    onPick: (ScenePick?) -> Unit,
    modifier: Modifier = Modifier,
    onUnavailable: () -> Unit = {},
) {
    val context = LocalContext.current
    val glAvailable = remember { supportsOpenGl(context) }
    var glFailed by remember { mutableStateOf(false) }
    val unavailable by rememberUpdatedState(onUnavailable)
    LaunchedEffect(glAvailable) {
        if (!glAvailable) {
            controller.glassActive = false
            unavailable()
        }
    }
    Box(modifier.fillMaxSize()) {
        if (glAvailable && !glFailed) {
            WorldGlView(scene, selectedId, controller, onFailure = { glFailed = true; controller.glassActive = false; unavailable() }, Modifier.fillMaxSize())
            WorldTouchLayer(scene, controller, onPick = onPick)
        } else {
            Fallback2D(Modifier.align(Alignment.Center))
        }
    }
}
