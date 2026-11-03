package com.aicowork.remote.ui.space

import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import com.aicowork.remote.ui.components.Labels
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

// Transformación del estado real (instantánea del servidor) a la escena 3D. Es Kotlin puro: no sabe nada de OpenGL
// ni de Compose, así que se prueba en la JVM. La escena es la del escritorio (`src/renderer/src/scene`): mismas
// estaciones, núcleo, zonas y robots; el renderizador solo anima hacia lo que dice esta escena.

enum class RobotBody { Capsule, Egg, Blob, Cube, Dome, Bulb }

enum class Accessory { Ears, Antenna, Tuft, Vents, Hair, Halo, None }

enum class EyeShape { Round, Pill, Arc, Chevron, Dots, Wave }

enum class RobotLogo { Gemini, Claude, Qwen, OpenAI, Local, Hermes, Becario, Muse, None }

/**
 * Estado visual de un robot, derivado del estado real del agente (como `BaseVisual` en el escritorio). [Paused]: su
 * última tarea quedó interrumpida al cerrar la app y se puede reanudar.
 */
enum class AgentVisual { Idle, Resting, Thinking, Working, Waiting, Error, Offline, Paused }

/** Aspecto del robot: el mismo diseño por proveedor que en el escritorio (`avatarFor`). Colores en ARGB. */
data class RobotLook(
    val body: RobotBody,
    val accessory: Accessory,
    val eyes: EyeShape,
    val logo: RobotLogo,
    val bodyColor: Int,
    val eyeColor: Int,
    /** Color de orejas, antena o pelo. */
    val accentColor: Int,
    /** Remates metálicos opcionales (marco del visor, aro de la base), como el dorado de Hermes. */
    val trimColor: Int?,
) {
    /** El brillo de la plataforma es el del agente o el de sus remates. */
    val platformColor: Int get() = trimColor ?: bodyColor
}

/** Puesto fijo del espacio (`StationConfig` del escritorio). Coordenadas en el suelo (x, z). */
data class StationSpec(val id: String, val label: String, val x: Float, val z: Float, val forSubagents: Boolean = false)

data class SceneStation(
    val spec: StationSpec,
    val occupantId: String?,
    /** Color del brillo (el del ocupante) o null si está libre. */
    val accent: Int?,
    /** Contenido de las dos pantallas holográficas (0 código, 1 barras, 2 documento, 3 diseño, 4 lista). */
    val screenModes: Pair<Int, Int>,
) {
    val id get() = spec.id
    val x get() = spec.x
    val z get() = spec.z
    /** Lado hacia el que coloca su consola (hacia fuera del centro). */
    val consoleSide: Int get() = if (spec.x >= 0f) 1 else -1
}

data class SceneAgent(
    val id: String,
    val name: String,
    val role: String,
    val providerLabel: String,
    val modelLabel: String,
    /** Color propio del agente (punto de su etiqueta y cuerpo del robot). */
    val color: Int,
    val look: RobotLook,
    val visual: AgentVisual,
    /** Estado breve de las fichas («Trabajando»…) y de los lectores de pantalla. */
    val activityLabel: String,
    /** Texto de la etiqueta 3D, como en el escritorio («Esperando a Codex», «Bloqueado», lo que está haciendo…). */
    val statusText: String,
    val taskId: String?,
    val taskTitle: String?,
    val taskStatus: String?,
    /** Progreso 0‥1 de la tarea actual, si se conoce. */
    val progress: Float?,
    val detail: String?,
    val reason: String?,
    val stationId: String,
    /** Dónde flota sobre su estación. */
    val home: Vec3,
    /** Punto junto al núcleo donde se coloca para colaborar. */
    val bay: Vec3,
    /** Dónde debe estar ahora (su estación o el núcleo). */
    val position: Vec3,
    val consoleSide: Int,
    val isCoordinator: Boolean,
    val isSubagent: Boolean,
    val atCore: Boolean,
    val waitingFor: String?,
    /** Necesita al usuario (una pregunta, una petición que reanudar o que falló): aviso ámbar sobre la cabeza. */
    val attention: Boolean = false,
) {
    val busy get() = visual == AgentVisual.Thinking || visual == AgentVisual.Working
}

data class SceneTask(val id: String, val agentId: String, val status: String)

data class CoreState(val activeRequests: Int, val runningTasks: Int, val pendingTasks: Int)

/** Lo que muestran los paneles de las zonas. */
data class ZoneInfo(
    val decisions: Int = 0,
    val preferences: Int = 0,
    val facts: Int = 0,
    val pending: Int = 0,
    val tasks: Int = 0,
    val results: Int = 0,
)

/** Zonas alrededor de la oficina (`ZONE_SPOTS` del escritorio): tareas, archivos, herramientas y memoria. */
enum class SpaceZone(val label: String, val x: Float, val z: Float) {
    Tasks("Nuevas tareas", -9.7f, -1.4f),
    Files("Archivos", -8.1f, 5.5f),
    Tools("Herramientas", 9.7f, -1.4f),
    Memory("Memoria", 8.1f, 5.7f);

    /** Las zonas miran hacia la posición habitual de la cámara. */
    val facing: Float get() = atan2(-x, 22f - z)
}

data class SpaceScene(
    val agents: List<SceneAgent>,
    val stations: List<SceneStation>,
    val tasks: List<SceneTask>,
    val core: CoreState,
    val zones: ZoneInfo,
    /** Nombre del proyecto (la conversación), bajo «Proyecto» en el núcleo. */
    val project: String?,
    /** Los datos no están al día (sin conexión o copia guardada): la escena se ve apagada. */
    val stale: Boolean,
) {
    fun agent(id: String?): SceneAgent? = agents.firstOrNull { it.id == id }
    fun station(id: String?): SceneStation? = stations.firstOrNull { it.id == id }

    /** Resumen legible («2 trabajando · 1 esperando»). */
    val summary: String
        get() {
            if (agents.isEmpty()) return "Sin agentes"
            val order = listOf(AgentVisual.Working, AgentVisual.Thinking, AgentVisual.Waiting, AgentVisual.Error, AgentVisual.Paused, AgentVisual.Offline)
            val parts = order.mapNotNull { v ->
                val n = agents.count { it.visual == v }
                if (n == 0) null else "$n ${visualWord(v, n)}"
            }
            return parts.ifEmpty { listOf("Todos libres") }.joinToString(" · ")
        }

    companion object {
        val Empty = SpaceScene(
            emptyList(),
            SpaceLayout.STATIONS.map { SceneStation(it, null, null, 4 to 1) },
            emptyList(),
            CoreState(0, 0, 0),
            ZoneInfo(),
            null,
            stale = false,
        )
    }
}

private fun visualWord(v: AgentVisual, n: Int) = when (v) {
    AgentVisual.Working -> "trabajando"
    AgentVisual.Thinking -> "pensando"
    AgentVisual.Waiting -> "esperando"
    AgentVisual.Error -> if (n == 1) "con error" else "con errores"
    AgentVisual.Offline -> if (n == 1) "desconectado" else "desconectados"
    AgentVisual.Paused -> "en pausa"
    else -> "libres"
}

/** Medidas y puestos del espacio, idénticos a `layout.ts` y `DEFAULT_STATIONS` del escritorio. */
object SpaceLayout {
    /** Altura del suelo de las plataformas. */
    const val PLATFORM_Y = 0.32f
    /** Altura de flotación de los robots. */
    const val ROBOT_Y = 1.55f
    const val CORE_RADIUS = 2.25f
    /** Tamaño de los robots respecto a su modelo. */
    const val ROBOT_SCALE = 1.3f

    val STATIONS = listOf(
        StationSpec("st-gemini", "Análisis", -6.2f, -3.2f),
        StationSpec("st-qwen", "Organización", -0.6f, -5.4f),
        StationSpec("st-claude", "Diseño", 5.6f, -3.6f),
        StationSpec("st-codex", "Código", 5.8f, 3.4f),
        StationSpec("st-sub-1", "Apoyo", -5.6f, 3.6f, forSubagents = true),
        StationSpec("st-hermes", "Coordinación", 0.2f, 5.6f),
        StationSpec("st-muse", "Investigación", 3.2f, -8f),
    )

    /**
     * Puestos de reserva para equipos más grandes que los siete del escritorio: al fondo, entre la oficina y la
     * ciudad, sin pisar zonas ni circuitos principales.
     */
    private val EXTRA = listOf(-3.6f to -9.2f, 6.6f to -8.2f, -9.4f to -6.6f, 9.4f to -6.6f, 0f to -12.4f, -7f to -11.4f, 7f to -11.4f)

    fun extraStation(index: Int): StationSpec {
        val (x, z) = EXTRA.getOrNull(index) ?: run {
            // Más allá: un arco al fondo.
            val k = index - EXTRA.size
            val a = (k % 9 - 4) * 0.28f
            val r = 15f + (k / 9) * 3.4f
            r * sin(a) to -r * cos(a)
        }
        return StationSpec("st-extra-${index + 1}", "Apoyo", x, z, forSubagents = true)
    }

    /** Segundos sin trabajo antes del reposo: 26 s más un desfase por agente, como el escritorio. */
    fun restAfterMs(id: String): Long = 26_000L + (hash01(id) * 10_000f).toLong()

    fun home(st: StationSpec) = Vec3(st.x, ROBOT_Y, st.z)

    /** Punto junto al núcleo donde un robot se coloca para colaborar. */
    fun coreBay(st: StationSpec): Vec3 {
        val dir = Vec3(st.x, 0f, st.z).normalized().let { if (it == Vec3.Zero) Vec3(0f, 0f, 1f) else it }
        val p = dir * (CORE_RADIUS + 0.35f)
        return Vec3(p.x, ROBOT_Y + 0.15f, p.z)
    }

    /** Posición de la pantalla principal respecto a la estación. */
    fun consoleOffset(side: Int) = Vec3(side * 0.95f, 0f, -0.55f)

    /** Camino tipo circuito desde la estación hasta el borde del núcleo, en el suelo (`stationTracePoints`). */
    fun tracePoints(x: Float, z: Float, y: Float = 0.03f): List<Vec3> {
        val start = Vec3(x, y, z)
        val elbow = Vec3(x * 0.45f, y, z)
        val end = Vec3(x, 0f, z).normalized() * (CORE_RADIUS - 0.1f)
        return listOf(
            start,
            Vec3((x + elbow.x) / 2f, y, z),
            elbow,
            Vec3(elbow.x * 0.6f + end.x * 0.4f, y, elbow.z * 0.6f + end.z * 0.4f),
            Vec3(end.x, y, end.z),
        )
    }
}

object SpaceSceneBuilder {

    /** Así marca el escritorio una tarea interrumpida al cerrar la app (se puede reanudar): el agente queda en pausa. */
    const val INTERRUPTED = "Interrumpida al cerrar la app"

    /** Texto de la etiqueta de un agente que necesita al usuario. */
    const val ATTENTION_TEXT = "Necesita tu respuesta"

    /**
     * [openedAt] es cuándo se abrió la vista: como en el escritorio, un agente libre pasa a reposo tras un rato sin
     * actividad contado desde lo último que hizo o desde que se abrió el espacio. [attention] son los agentes que
     * necesitan al usuario (la interfaz pone ahí al coordinador cuando pregunta o hay algo que reanudar), y
     * [attentionLabels] lo que dice su etiqueta si no es [ATTENTION_TEXT] (por ejemplo, «Trabajo en pausa»).
     */
    fun build(
        snapshot: Snapshot,
        stale: Boolean = false,
        now: Long = System.currentTimeMillis(),
        openedAt: Long = now,
        attention: Set<String> = emptySet(),
        attentionLabels: Map<String, String> = emptyMap(),
    ): SpaceScene {
        val agents = snapshot.agents
        val tasksById = snapshot.tasks.associateBy { it.id }
        // Orden estable (por nombre e id): un cambio de estado o el orden de llegada no mueven a nadie de sitio.
        val stable = compareBy<Agent>({ it.name.lowercase() }, { it.id })
        val coordinators = agents.filter { it.plannerOnly && !it.isSubagent }.sortedWith(stable)
        val workers = agents.filter { !it.plannerOnly && !it.isSubagent }.sortedWith(stable)
        val subagents = agents.filter { it.isSubagent }.sortedWith(stable)
        val ordered = coordinators + workers + subagents

        val placement = assignStations(ordered)
        val names = agents.associate { it.id to it.name }
        val ids = names.keys

        val sceneAgents = ordered.map { agent ->
            val station = placement.getValue(agent.id)
            val visual = visualOf(agent, now, openedAt, paused = isPaused(agent, snapshot))
            val needsUser = agent.id in attention
            val task = agent.taskId?.let(tasksById::get)
            val atCore = agent.location == "core" && visual != AgentVisual.Offline
            val waitingFor = agent.waitingFor?.takeIf { it in ids && it != agent.id }
            val home = SpaceLayout.home(station)
            val bay = SpaceLayout.coreBay(station)
            SceneAgent(
                id = agent.id,
                name = agent.name,
                role = agent.role,
                providerLabel = Labels.provider(agent.provider),
                modelLabel = agent.modelLabel,
                color = parseColor(agent.color) ?: 0xFF7C5CFF.toInt(),
                look = lookOf(agent),
                visual = visual,
                activityLabel = when (visual) {
                    AgentVisual.Resting -> "En reposo"
                    AgentVisual.Paused -> "En pausa"
                    AgentVisual.Offline -> Labels.activity("offline")
                    else -> Labels.activity(agent.activity)
                },
                statusText = if (needsUser) attentionLabels[agent.id] ?: ATTENTION_TEXT else statusText(agent, visual, waitingFor?.let(names::get)),
                taskId = task?.id,
                taskTitle = task?.title?.ifBlank { null },
                taskStatus = task?.status,
                progress = task?.progress?.toFloat()?.coerceIn(0f, 1f),
                detail = agent.lastActivity ?: task?.lastActivity,
                reason = agent.reason,
                stationId = station.id,
                home = home,
                bay = bay,
                position = if (atCore) bay else home,
                consoleSide = if (station.x >= 0f) 1 else -1,
                isCoordinator = agent.plannerOnly && !agent.isSubagent,
                isSubagent = agent.isSubagent,
                atCore = atCore,
                waitingFor = waitingFor,
                attention = needsUser,
            )
        }

        val byStation = sceneAgents.associateBy { it.stationId }
        val specs = SpaceLayout.STATIONS + placement.values.filter { s -> SpaceLayout.STATIONS.none { it.id == s.id } }.distinctBy { it.id }.sortedBy { it.id }
        val stations = specs.map { spec ->
            val occupant = byStation[spec.id]
            SceneStation(spec, occupant?.id, occupant?.look?.platformColor, screenModes(occupant?.look?.logo))
        }

        val live = snapshot.memory.filter { it.status != "superseded" }
        val zones = ZoneInfo(
            decisions = live.count { it.kind == "decision" },
            preferences = live.count { it.kind == "preference" },
            facts = live.count { it.kind == "fact" },
            pending = live.count { it.kind == "pending" },
            tasks = snapshot.tasks.size,
            results = snapshot.tasks.count { it.status == "done" && !it.result.isNullOrBlank() },
        )
        val core = CoreState(
            activeRequests = snapshot.conversation.activeRequestIds.size,
            runningTasks = snapshot.tasks.count { it.status == "running" },
            pendingTasks = snapshot.tasks.count { it.status == "pending" || it.status == "blocked" },
        )
        val tasks = snapshot.tasks.filter { it.agentId in ids }.map { SceneTask(it.id, it.agentId, it.status) }
        return SpaceScene(sceneAgents, stations, tasks, core, zones, snapshot.conversation.title?.ifBlank { null }, stale)
    }

    /**
     * Cada agente va a su estación (`stationId`). Si no la tiene, no existe o ya está ocupada, ocupa una libre
     * (los sub-agentes, primero las de apoyo) y, si no quedan, un puesto de reserva.
     */
    private fun assignStations(ordered: List<Agent>): Map<String, StationSpec> {
        val byId = SpaceLayout.STATIONS.associateBy { it.id }
        val taken = HashSet<String>()
        val out = LinkedHashMap<String, StationSpec>()
        for (agent in ordered) {
            val st = agent.stationId?.let(byId::get) ?: continue
            if (taken.add(st.id)) out[agent.id] = st
        }
        var extra = 0
        for (agent in ordered) {
            if (agent.id in out) continue
            val free = SpaceLayout.STATIONS.filter { it.id !in taken }
            val st = free.firstOrNull { it.forSubagents == agent.isSubagent } ?: free.firstOrNull() ?: SpaceLayout.extraStation(extra++)
            taken += st.id
            out[agent.id] = st
        }
        return out
    }

    fun visualOf(agent: Agent, now: Long, openedAt: Long = now, paused: Boolean = false): AgentVisual = when {
        !agent.enabled || agent.activity == "offline" -> AgentVisual.Offline
        agent.activity == "error" -> AgentVisual.Error
        agent.activity == "working" -> AgentVisual.Working
        agent.activity == "thinking" -> AgentVisual.Thinking
        agent.activity == "waiting" -> AgentVisual.Waiting
        paused -> AgentVisual.Paused
        now - max(agent.lastActivityAt ?: 0L, openedAt) > SpaceLayout.restAfterMs(agent.id) -> AgentVisual.Resting
        else -> AgentVisual.Idle
    }

    /**
     * En pausa: no está pensando ni trabajando y su tarea más reciente quedó interrumpida al cerrar la app
     * (`cancelled` con [INTERRUPTED]) sin que su petición siga activa (si sigue activa, se está reanudando).
     */
    fun isPaused(agent: Agent, snapshot: Snapshot): Boolean {
        if (agent.activity == "thinking" || agent.activity == "working") return false
        val task = latestTask(agent.id, snapshot) ?: return false
        if (task.status != "cancelled" || task.error?.trim() != INTERRUPTED) return false
        return task.requestId == null || task.requestId !in snapshot.conversation.activeRequestIds
    }

    /** La tarea más reciente del agente (por fecha de fin, inicio o creación; a igualdad, la última de la lista). */
    private fun latestTask(agentId: String, snapshot: Snapshot): TaskItem? {
        var best: TaskItem? = null
        var bestAt = Long.MIN_VALUE
        for (task in snapshot.tasks) {
            if (task.agentId != agentId) continue
            val at = task.finishedAt ?: task.startedAt ?: task.createdAt ?: Long.MIN_VALUE
            if (best == null || at >= bestAt) {
                best = task
                bestAt = at
            }
        }
        return best
    }

    /** Texto de estado de la etiqueta flotante, el mismo que `RobotLabel` del escritorio. */
    fun statusText(agent: Agent, visual: AgentVisual, waitingName: String?): String = when (visual) {
        AgentVisual.Thinking -> agent.lastActivity?.ifBlank { null } ?: "Pensando"
        AgentVisual.Working -> agent.lastActivity?.ifBlank { null } ?: "Trabajando"
        AgentVisual.Waiting -> if (waitingName != null) "Esperando a $waitingName" else "En espera"
        AgentVisual.Error -> "Bloqueado"
        AgentVisual.Offline -> "No disponible"
        AgentVisual.Resting -> "En reposo"
        AgentVisual.Paused -> "En pausa"
        AgentVisual.Idle -> "Disponible"
    }

    /** Contenido de las pantallas según el tipo de agente (`screenModes` del escritorio). */
    fun screenModes(logo: RobotLogo?): Pair<Int, Int> = when (logo) {
        null -> 4 to 1
        RobotLogo.Gemini -> 2 to 1
        RobotLogo.Qwen -> 4 to 1
        RobotLogo.Claude -> 3 to 2
        RobotLogo.OpenAI -> 0 to 1
        RobotLogo.Muse -> 2 to 4
        else -> 4 to 2
    }

    /** Aspecto del robot: el avatar que envía el servidor o, si no hay, el diseño de su proveedor. */
    fun lookOf(agent: Agent): RobotLook {
        val fallback = providerLook(agent.provider, agent.isSubagent)
        val bodyColor = parseColor(agent.color) ?: 0xFF7C5CFF.toInt()
        val avatar = agent.avatar ?: return fallback.copy(bodyColor = bodyColor, accentColor = fallback.accentColor.takeIf { it != 0 } ?: bodyColor)
        val accessory = when (avatar.accessory) {
            "ears" -> Accessory.Ears
            "antenna" -> Accessory.Antenna
            "tuft" -> Accessory.Tuft
            "vents" -> Accessory.Vents
            "hair" -> Accessory.Hair
            "halo" -> Accessory.Halo
            "none" -> Accessory.None
            else -> fallback.accessory
        }
        val accent = avatar.accentColor?.let(::parseColor) ?: when (accessory) {
            Accessory.Antenna -> 0xFFFFF3C0.toInt()
            Accessory.Hair -> 0xFF141419.toInt()
            else -> bodyColor
        }
        return RobotLook(
            body = when (avatar.body) {
                "egg" -> RobotBody.Egg
                "blob" -> RobotBody.Blob
                "cube" -> RobotBody.Cube
                "dome" -> RobotBody.Dome
                "capsule" -> RobotBody.Capsule
                "bulb" -> RobotBody.Bulb
                else -> fallback.body
            },
            accessory = accessory,
            eyes = when (avatar.eyes) {
                "round" -> EyeShape.Round
                "pill" -> EyeShape.Pill
                "arc" -> EyeShape.Arc
                "chevron" -> EyeShape.Chevron
                "dots" -> EyeShape.Dots
                "wave" -> EyeShape.Wave
                else -> fallback.eyes
            },
            logo = when (avatar.logo) {
                "gemini" -> RobotLogo.Gemini
                "claude" -> RobotLogo.Claude
                "qwen" -> RobotLogo.Qwen
                "openai" -> RobotLogo.OpenAI
                "local" -> RobotLogo.Local
                "hermes" -> RobotLogo.Hermes
                "becario" -> RobotLogo.Becario
                "muse" -> RobotLogo.Muse
                "none" -> RobotLogo.None
                else -> fallback.logo
            },
            bodyColor = bodyColor,
            eyeColor = avatar.eyeColor?.let(::parseColor) ?: fallback.eyeColor,
            accentColor = accent,
            trimColor = avatar.trimColor?.let(::parseColor),
        )
    }

    /** `PROVIDER_AVATAR` y `SUBAGENT_AVATAR` del escritorio. Un acento 0 significa «el color del agente». */
    private fun providerLook(provider: String, subagent: Boolean): RobotLook {
        fun look(body: RobotBody, accessory: Accessory, eyes: EyeShape, logo: RobotLogo, eye: Long, accent: Long = 0, trim: Long? = null) =
            RobotLook(body, accessory, eyes, logo, 0, eye.toInt(), accent.toInt(), trim?.toInt())
        val becario = look(RobotBody.Capsule, Accessory.Antenna, EyeShape.Dots, RobotLogo.Becario, 0xFFFFF4B0, 0xFFFFF3C0)
        if (subagent) return becario
        return when (provider) {
            "gemini" -> look(RobotBody.Capsule, Accessory.Ears, EyeShape.Round, RobotLogo.Gemini, 0xFF6EF3FF, 0xFF3AB8FF)
            "ollama", "qwen" -> look(RobotBody.Egg, Accessory.None, EyeShape.Pill, RobotLogo.Qwen, 0xFFECDCFF)
            "lmstudio" -> look(RobotBody.Egg, Accessory.None, EyeShape.Pill, RobotLogo.Local, 0xFFECDCFF)
            "hermes" -> look(RobotBody.Dome, Accessory.Hair, EyeShape.Round, RobotLogo.Hermes, 0xFFFFC65A, 0xFF141419, 0xFFD6A743)
            "claude" -> look(RobotBody.Blob, Accessory.Tuft, EyeShape.Arc, RobotLogo.Claude, 0xFFFFF0C8)
            "codex" -> look(RobotBody.Cube, Accessory.Vents, EyeShape.Chevron, RobotLogo.OpenAI, 0xFF8CFFD0)
            "muse" -> look(RobotBody.Bulb, Accessory.Halo, EyeShape.Wave, RobotLogo.Muse, 0xFF3D9BFF, 0xFF5FB3FF, 0xFF9FB3D6)
            else -> becario
        }
    }

    fun parseColor(hex: String): Int? {
        val clean = hex.trim().removePrefix("#")
        return when (clean.length) {
            6 -> clean.toLongOrNull(16)?.let { (0xFF000000L or it).toInt() }
            8 -> clean.toLongOrNull(16)?.toInt()
            else -> null
        }
    }
}

/** Qué mostrar en la sección: cargando, sin datos por falta de conexión o la escena (quizá con datos antiguos). */
sealed interface SpaceStatus {
    data object Loading : SpaceStatus
    data class Unavailable(val reason: String) : SpaceStatus
    data class Ready(val stale: Boolean, val offlineReason: String?) : SpaceStatus
}

fun spaceStatus(state: CoworkUiState): SpaceStatus {
    val connection = state.connection
    val offline = connection as? Connection.Offline
    return when {
        state.snapshot == null && offline != null -> SpaceStatus.Unavailable(offline.reason)
        state.snapshot == null -> SpaceStatus.Loading
        else -> SpaceStatus.Ready(stale = offline != null || state.fromCache, offlineReason = offline?.reason)
    }
}

/**
 * Paleta del espacio digital (`palette.ts`: índigo con acentos azul eléctrico, violeta y cian), con el fondo algo más
 * azul marino para el aspecto Órbita. ARGB.
 */
object SpaceColors {
    const val BACKGROUND = 0xFF050818.toInt()
    const val FOG = 0xFF070B1E.toInt()
    const val BLUE = 0xFF3F7BFF.toInt()
    const val VIOLET = 0xFF8B5CFF.toInt()
    const val CYAN = 0xFF38D6FF.toInt()
    const val WAITING = 0xFFFBBF24.toInt()
    /** Aviso de «necesita tu respuesta» (ámbar suave, distinto del arco gris de la espera). */
    const val ATTENTION = 0xFFF5B54A.toInt()
    /** Color del paquete que envía el usuario (`#dfe8ff` del escritorio). */
    const val USER = 0xFFDFE8FF.toInt()

    /** Color de estado de las fichas: también va acompañado de texto (no solo color). */
    fun of(visual: AgentVisual): Int = when (visual) {
        AgentVisual.Working -> 0xFF34D399.toInt()
        AgentVisual.Thinking -> 0xFF60A5FA.toInt()
        AgentVisual.Waiting -> WAITING
        AgentVisual.Error -> 0xFFF87171.toInt()
        AgentVisual.Offline -> 0xFF6B7280.toInt()
        AgentVisual.Resting -> 0xFF7C83C9.toInt()
        AgentVisual.Idle -> 0xFFA5B4FC.toInt()
        AgentVisual.Paused -> 0xFF94A3B8.toInt()
    }
}
