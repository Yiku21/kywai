package com.aicowork.remote.ui.space

import com.aicowork.remote.ui.space.gl.SceneGeometry
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Lo que está vivo en el mundo 3D y no depende de la GPU: el reloj de la escena, el cerebro de cada robot, los brillos
 * de estaciones y núcleo, los paquetes en vuelo, los textos temporales de las etiquetas y el encuadre. Lo guarda
 * [WorldController], así que recrear la vista, la superficie o el contexto de OpenGL (plegar, desplegar, pasar de la
 * pantalla exterior a la interior) solo reconstruye los recursos de la GPU: las animaciones siguen donde estaban.
 *
 * Las animaciones de actividad solo salen de [WorldEvent] reales ([handle]): una escena nueva ([sync]) cambia
 * estados, sitios y quién está, pero nunca inventa envíos, celebraciones ni avisos. Kotlin puro, para probarlo en la
 * JVM; se usa en el hilo de OpenGL.
 */
internal class WorldSim {

    /** Destello de una estación o del núcleo. [color] en ARGB. */
    class Pulse(var start: Float = -10f, var color: Int = 0, var strength: Float = 1f)

    class StationFx {
        var level = 0.15f
        val pulses = Array(2) { Pulse() }
        private var next = 0
        /** Paquetes recorriendo ahora la conexión de esta estación con el núcleo. */
        var traceUsers = 0
        var traceColor = TRACE_COLOR
        var traceDir = 1f
        var traceActive = 0f

        fun pulse(color: Int, strength: Float, t: Float) {
            val p = pulses[next++ % 2]
            p.start = t; p.color = color; p.strength = strength
        }
    }

    /** Documento en vuelo de [from] a [to]: por la conexión del suelo (núcleo ↔ agente) o en arco (agente ↔ agente). */
    class Packet(
        val id: String,
        val from: String,
        val to: String,
        val path: List<Vec3>,
        val start: Float,
        val duration: Float,
        val color: Int,
        val traceStation: String?,
        /** Arco entre agentes (la malla la crea el renderizador) y su longitud. */
        val arc: Boolean,
        val arcLen: Float,
        val toAgent: String?,
        val toCore: Boolean,
    ) {
        var arrivedAt: Float? = null
            internal set
    }

    enum class Tone { Send, Receive, Done, Error }

    /** Texto temporal de la etiqueta de un robot («Enviando: …», «Recibiendo tarea», «Recibido», «Completado»). */
    data class LabelOverride(val text: String, val tone: Tone, val until: Float)

    /** Reloj de la escena en segundos: avanza con cada fotograma y no vuelve a cero al recrear la superficie. */
    var time = 0f
        private set
    var frames = 0L
        private set

    val brains = LinkedHashMap<String, RobotAnimator>()
    val stations = HashMap<String, StationFx>()
    val corePulses = Array(3) { Pulse() }
    private var nextCorePulse = 0
    var coreSpin = 0f; private set
    var wireRot = 0f; private set
    var orbitRot = 0f; private set
    var cardsRot = 0f; private set
    var globeRot = 0f; private set
    val packets = ArrayList<Packet>()
    private var lane = 0
    private val seen = LinkedHashSet<String>()
    private val overrides = HashMap<String, LabelOverride>()

    /** Última escena aplicada. */
    var scene: SpaceScene? = null
        private set

    /** Ambiente (pulsos, brillos que recorren el suelo, globo, partículas): 1 normal, 0 casi quieto. */
    var ambient = 1f
        private set
    var reducedMotion = false
        private set

    // ---- Encuadre (hueco libre de controles) ----
    var framing: Framing? = null
        private set
    private var framedW = 0f
    private var framedH = 0f
    /** Proporción con la que se encuadró la vista general por última vez (-1: nunca). */
    var framedAspect = -1f
        private set

    fun stationFx(id: String) = stations.getOrPut(id) { StationFx() }

    fun labelOverride(agentId: String): LabelOverride? = overrides[agentId]?.takeIf { it.until > time }

    /** Ajustes del fotograma (se leen en cada uno: cambiar un ajuste se nota al momento). */
    fun apply(settings: WorldSettings) {
        reducedMotion = settings.reducedMotion
        ambient = if (settings.ambient && !settings.reducedMotion) 1f else 0f
    }

    /**
     * Un fotograma: avanza el reloj, aplica la escena, atiende los eventos reales que lleguen por [events] y anima
     * robots, estaciones, núcleo y paquetes.
     */
    fun step(dt: Float, scene: SpaceScene, eye: Vec3, settings: WorldSettings, events: ((WorldEvent) -> Unit) -> Unit = {}) {
        apply(settings)
        time += dt
        frames++
        sync(scene)
        events(::handle)
        val t = time
        for (b in brains.values) {
            b.reduced = reducedMotion
            b.update(t, dt, eye)
        }
        val it = brains.values.iterator()
        while (it.hasNext()) if (it.next().gone(t)) it.remove()
        updateStations(scene, dt)
        updateCore(dt)
        updatePackets(t)
        if (overrides.isNotEmpty()) overrides.values.removeAll { it.until <= t }
    }

    /**
     * Aplica una escena: cada agente tiene su cerebro (los que llegan a un equipo ya en marcha aparecen, los que se van
     * se retiran). La primera escena con agentes y las escenas antiguas (sin conexión) no animan apariciones.
     */
    fun sync(next: SpaceScene) {
        if (next === scene) return
        val first = brains.isEmpty()
        val ids = HashSet<String>(next.agents.size * 2)
        for (agent in next.agents) {
            ids += agent.id
            val waitPos = agent.waitingFor?.let { next.agent(it)?.home }
            val brain = brains.getOrPut(agent.id) {
                RobotAnimator(agent.id).also { if (!first && !next.stale) it.spawn(time) }
            }
            brain.setTarget(agent, waitPos)
        }
        for ((id, brain) in brains) if (id !in ids) brain.leave(time)
        scene = next
    }

    // =====================================================================================================
    // Eventos reales
    // =====================================================================================================

    fun handle(event: WorldEvent) {
        val sc = scene ?: return
        val t = time
        when (event) {
            is WorldEvent.Transfer -> spawn(event, sc, t)
            is WorldEvent.TaskCompleted -> {
                val agent = sc.agent(event.agentId) ?: return
                brains[agent.id]?.onCelebrate(t)
                stationFx(agent.stationId).pulse(DONE_COLOR, 1f, t)
                setOverride(agent.id, "Completado", Tone.Done, 1.8f)
            }
            is WorldEvent.TaskFailed -> {
                val agent = sc.agent(event.agentId) ?: return
                brains[agent.id]?.onAlert(t)
                stationFx(agent.stationId).pulse(ERROR_COLOR, 1f, t)
                setOverride(agent.id, "Tarea fallida", Tone.Error, 2.2f)
            }
            is WorldEvent.Poke -> brains[event.agentId]?.onPoke(t)
        }
    }

    private fun setOverride(agentId: String, text: String, tone: Tone, seconds: Float) {
        overrides[agentId] = LabelOverride(text, tone, time + seconds)
    }

    private fun agentPos(agent: SceneAgent): Vec3 =
        brains[agent.id]?.takeIf { it.ready }?.pos?.plus(Vec3(0f, 0.1f, 0f)) ?: agent.position

    /** Como `Transfers.tsx` del escritorio: un mismo envío nunca se anima dos veces y los ids desconocidos se ignoran. */
    private fun spawn(tr: WorldEvent.Transfer, sc: SpaceScene, t: Float) {
        if (!seen.add(tr.id)) return
        if (seen.size > MAX_SEEN) seen.iterator().let { it.next(); it.remove() }
        val fromIsCore = tr.fromId == CORE || tr.fromId == USER
        val toIsCore = tr.toId == CORE || tr.toId == USER
        if (fromIsCore && toIsCore) return
        val fromAgent = if (fromIsCore) null else sc.agent(tr.fromId) ?: return
        val toAgent = if (toIsCore) null else sc.agent(tr.toId) ?: return
        val color = fromAgent?.color ?: if (tr.fromId == USER) SpaceColors.USER else SpaceColors.CYAN
        val fromPos = fromAgent?.let(::agentPos) ?: CORE_TOP
        val toPos = toAgent?.let(::agentPos) ?: CORE_TOP

        val path: List<Vec3>
        var traceStation: String? = null
        var arcLen = 0f
        if (fromIsCore != toIsCore) {
            // Núcleo ↔ agente: recorre la conexión del suelo de esa estación.
            val agent = fromAgent ?: toAgent!!
            val st = sc.station(agent.stationId)
            val pts = st?.let { SpaceLayout.tracePoints(it.x, it.z, 0.55f) } ?: emptyList()
            val robot = if (fromIsCore) toPos else fromPos
            var raw = listOf(robot) + pts + listOf(CORE_TOP)
            if (fromIsCore) raw = raw.reversed()
            path = SceneGeometry.catmullRom(raw, 80)
            if (st != null) {
                traceStation = st.id
                val f = stationFx(st.id)
                f.traceUsers++
                f.traceColor = color
                f.traceDir = if (fromIsCore) -1f else 1f
            }
        } else {
            // Agente ↔ agente: arco elevado; carriles distintos si hay varios a la vez.
            val a = fromPos + Vec3(0f, 0.55f, 0f)
            val b = toPos + Vec3(0f, 0.55f, 0f)
            val l = lane++ % 3
            val mid = (a + b) * 0.5f + Vec3(0f, 1.6f + a.distanceTo(b) * 0.12f + l * 0.55f, 0f)
            path = (0..48).map { i -> val u = i / 48f; a * ((1 - u) * (1 - u)) + mid * (2 * u * (1 - u)) + b * (u * u) }
            arcLen = length(path)
        }
        val duration = (length(path) / 4.6f).coerceIn(1.5f, 3f)

        // El emisor se orienta y emite; el receptor mira lo que llega.
        if (fromAgent != null) {
            brains[fromAgent.id]?.onSend(toPos, t)
            stationFx(fromAgent.stationId).pulse(color, 0.45f, t)
            val what = tr.title?.takeIf { it.isNotBlank() } ?: tr.label
            setOverride(fromAgent.id, "Enviando: $what", Tone.Send, duration)
        } else {
            corePulse(color, 0.3f, t)
        }
        if (toAgent != null) {
            brains[toAgent.id]?.onExpect(fromPos, t, t + duration)
            setOverride(toAgent.id, "Recibiendo tarea", Tone.Receive, duration + 0.3f)
        }
        packets += Packet(
            tr.id, fromAgent?.id ?: CORE, toAgent?.id ?: CORE, path, t, duration, color, traceStation,
            arc = fromIsCore == toIsCore, arcLen = arcLen, toAgent = toAgent?.id, toCore = toAgent == null,
        )
    }

    private fun updatePackets(t: Float) {
        val it = packets.iterator()
        while (it.hasNext()) {
            val p = it.next()
            val arrived = p.arrivedAt
            if (arrived == null) {
                if (t - p.start >= p.duration) arrive(p, t)
            } else if (t - arrived > PACKET_LINGER) {
                it.remove()
            }
        }
    }

    private fun arrive(p: Packet, t: Float) {
        p.arrivedAt = t
        val sc = scene
        if (p.toAgent != null) {
            brains[p.toAgent]?.onReceive(t)
            sc?.agent(p.toAgent)?.let { stationFx(it.stationId).pulse(p.color, 1f, t) }
            setOverride(p.toAgent, "Recibido", Tone.Done, 1.3f)
        } else if (p.toCore) {
            corePulse(p.color, 1f, t)
            // El coordinador (Hermes) recibe los resultados: asiente un poco.
            val coordinator = sc?.let(::coordinatorOf)
            if (coordinator != null && coordinator.id != p.from) brains[coordinator.id]?.onReceive(t, 0.55f)
        }
        p.traceStation?.let { s -> stationFx(s).let { it.traceUsers = max(0, it.traceUsers - 1) } }
    }

    private fun corePulse(color: Int, strength: Float, t: Float) {
        val p = corePulses[nextCorePulse++ % 3]
        p.start = t; p.color = color; p.strength = strength
        coreSpin = min(2.5f, coreSpin + 1.6f * strength)
    }

    private fun updateStations(scene: SpaceScene, dt: Float) {
        for (st in scene.stations) {
            val f = stationFx(st.id)
            val brain = st.occupantId?.let(brains::get)
            val target = brain?.stationLevel ?: 0.1f
            f.level += (target - f.level) * min(1f, dt * 4f)
            val active = if (f.traceUsers > 0) 1f else 0f
            f.traceActive += (active - f.traceActive) * min(1f, dt * (if (active > 0f) 6f else 2.5f))
        }
    }

    private fun updateCore(dt: Float) {
        val amb = if (ambient > 0.5f) 1f else 0.25f
        coreSpin = max(0f, coreSpin - dt * 1.6f)
        wireRot += dt * (0.06f * amb + coreSpin * 0.4f)
        orbitRot -= dt * (0.25f * amb + coreSpin * 0.6f)
        cardsRot += dt * (0.12f * amb + coreSpin * 0.3f)
        globeRot += dt * (if (ambient > 0.5f) 0.018f else 0.004f)
    }

    /** Brillo de los pulsos que siguen vivos. */
    fun pulseBoost(pulses: Array<Pulse>, life: Float): Float {
        var boost = 0f
        for (p in pulses) {
            val k = (time - p.start) / life
            if (k in 0f..1f) boost += (1f - k) * p.strength
        }
        return boost
    }

    // =====================================================================================================
    // Encuadre
    // =====================================================================================================

    /**
     * Encuadre del fotograma: se acerca con suavidad al hueco que dejan los controles ([insets]); si cambia el tamaño
     * de la vista (plegar, desplegar, girar) se coloca directamente. [fitOverview]: ver [Framing.of].
     */
    fun frame(viewWidth: Float, viewHeight: Float, insets: WorldInsets, dt: Float, fitOverview: Boolean = true): Framing {
        val target = Framing.of(viewWidth, viewHeight, insets, fitOverview)
        val current = framing
        val next = if (current == null || viewWidth != framedW || viewHeight != framedH) target
        else current.approach(target, if (reducedMotion) 18f else 7f, dt).let { if (it.near(target, 0.25f)) target else it }
        framedW = viewWidth
        framedH = viewHeight
        framing = next
        return next
    }

    /** Vuelve a encuadrar la vista general si cambia la proporción del hueco, solo mientras se está en ella. */
    fun reframe(camera: OrbitCamera, framing: Framing) {
        val aspect = framing.aspect
        if (abs(aspect - framedAspect) < 1e-3f) return
        if (camera.atOverview) {
            camera.overview(aspect)
            if (framedAspect < 0f) camera.snap()
        }
        framedAspect = aspect
    }

    companion object {
        const val CORE = "core"
        const val USER = "user"
        /** Tras llegar, el paquete se encoge y su arco se apaga antes de desaparecer (como el escritorio). */
        const val PACKET_LINGER = 1.4f
        private const val MAX_SEEN = 512
        val CORE_TOP = Vec3(0f, 1.55f, 0f)
        const val DONE_COLOR = 0xFF5FF0A6.toInt()
        const val ERROR_COLOR = 0xFFFF5468.toInt()
        /** Azul de los bordes y conexiones de las estaciones (`#4f8dff`). */
        const val TRACE_COLOR = 0xFF4F8DFF.toInt()

        /** El coordinador (Hermes): el que solo planifica o, si no, el del logotipo de Hermes. */
        fun coordinatorOf(scene: SpaceScene): SceneAgent? =
            scene.agents.firstOrNull { it.isCoordinator } ?: scene.agents.firstOrNull { it.look.logo == RobotLogo.Hermes }

        fun length(path: List<Vec3>): Float {
            var sum = 0f
            for (i in 1 until path.size) sum += path[i - 1].distanceTo(path[i])
            return sum
        }
    }
}
