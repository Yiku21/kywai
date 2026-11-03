package com.aicowork.remote.ui.space

import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.EventReducer
import com.aicowork.remote.data.ReduceResult
import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.Conversation
import com.aicowork.remote.data.model.CoworkJson
import com.aicowork.remote.data.model.MemoryEntry
import com.aicowork.remote.data.model.RobotAvatar
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import kotlin.math.abs
import kotlin.math.hypot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Transformación del estado real de los agentes (lo que dice el servidor) a la escena 3D del escritorio. */
class SpaceSceneBuilderTest {
    private val now = 10_000_000L

    private val team = Snapshot(
        conversation = Conversation(id = "c1", title = "Mi primer proyecto", activeRequestIds = listOf("r1")),
        agents = listOf(
            Agent("coord", "Coordinador", provider = "claude", plannerOnly = true, color = "#7C5CFF"),
            Agent("dev", "Constructor", provider = "codex", activity = "working", taskId = "t1", lastActivity = "Editando MainActivity.kt", color = "#22AA88"),
            Agent("qa", "Revisora", provider = "gemini", activity = "waiting", waitingFor = "dev"),
            Agent("res", "Investigador", provider = "qwen", activity = "thinking", location = "core"),
            Agent("old", "Antiguo", provider = "ollama", enabled = false),
            Agent("sub", "Becario", provider = "claude", isSubagent = true, activity = "error", reason = "Sin permiso"),
        ),
        tasks = listOf(
            TaskItem("t1", "r1", "Construir pantallas", agentId = "dev", status = "running", progress = 0.4),
            TaskItem("t2", "r1", "Escribir pruebas", agentId = "qa", status = "pending"),
        ),
    )

    /** El equipo por defecto del escritorio, cada uno en su estación. */
    private val desktop = Snapshot(
        agents = listOf(
            Agent("hermes", "Hermes", provider = "hermes", color = "#ffe6ba", stationId = "st-hermes", plannerOnly = true,
                avatar = RobotAvatar("dome", "hair", "round", "hermes", "#ffc65a", "#141419", "#d6a743")),
            Agent("gemini", "Gemini", provider = "gemini", color = "#2a7bff", stationId = "st-gemini"),
            Agent("qwen", "Qwen", provider = "ollama", color = "#8a55ff", stationId = "st-qwen"),
            Agent("claude", "Claude", provider = "claude", color = "#ff7a1f", stationId = "st-claude"),
            Agent("codex", "Codex", provider = "codex", color = "#21c07c", stationId = "st-codex"),
            Agent("muse", "Muse", provider = "muse", color = "#d3dcf6", stationId = "st-muse",
                avatar = RobotAvatar("bulb", "halo", "wave", "muse", "#3d9bff", "#5fb3ff", "#9fb3d6")),
        ),
    )

    private fun scene(snapshot: Snapshot = team) = SpaceSceneBuilder.build(snapshot, stale = false, now = now)

    @Test
    fun `cada estado real tiene su estado visual y los textos del escritorio`() {
        val s = scene()
        assertEquals(AgentVisual.Working, s.agent("dev")!!.visual)
        assertEquals("Trabajando", s.agent("dev")!!.activityLabel)
        assertEquals("Editando MainActivity.kt", s.agent("dev")!!.statusText)
        assertEquals(AgentVisual.Waiting, s.agent("qa")!!.visual)
        assertEquals("Esperando a Constructor", s.agent("qa")!!.statusText)
        assertEquals(AgentVisual.Thinking, s.agent("res")!!.visual)
        assertEquals("Pensando", s.agent("res")!!.statusText)
        assertEquals(AgentVisual.Error, s.agent("sub")!!.visual)
        assertEquals("Bloqueado", s.agent("sub")!!.statusText)
        assertEquals("Sin permiso", s.agent("sub")!!.reason)
        // Desactivado = desconectado, aunque el servidor diga «idle».
        assertEquals(AgentVisual.Offline, s.agent("old")!!.visual)
        assertEquals("Sin conexión", s.agent("old")!!.activityLabel)
        assertEquals("No disponible", s.agent("old")!!.statusText)
        assertEquals(AgentVisual.Idle, s.agent("coord")!!.visual)
        assertEquals("Libre", s.agent("coord")!!.activityLabel)
        assertEquals("Disponible", s.agent("coord")!!.statusText)
        assertEquals("Mi primer proyecto", s.project)
    }

    @Test
    fun `un agente libre pasa a reposo tras un rato sin actividad, contado desde que se abre la vista`() {
        val idle = Agent("a", "A", lastActivityAt = now - 60_000)
        val opened = SpaceSceneBuilder.build(team.copy(agents = listOf(idle)), now = now, openedAt = now - 5_000)
        assertEquals("recién abierta la vista sigue disponible", AgentVisual.Idle, opened.agent("a")!!.visual)
        val later = SpaceSceneBuilder.build(team.copy(agents = listOf(idle)), now = now, openedAt = now - 60_000)
        assertEquals(AgentVisual.Resting, later.agent("a")!!.visual)
        assertEquals("En reposo", later.agent("a")!!.activityLabel)
        assertEquals("En reposo", later.agent("a")!!.statusText)
        val recent = SpaceSceneBuilder.build(team.copy(agents = listOf(Agent("a", "A", lastActivityAt = now - 1_000))), now = now, openedAt = 0)
        assertEquals(AgentVisual.Idle, recent.agent("a")!!.visual)
        // El umbral es el del escritorio: 26 s más un desfase por agente de hasta 10 s.
        assertTrue(SpaceLayout.restAfterMs("a") in 26_000L..36_000L)
    }

    @Test
    fun `la tarea actual aparece con su progreso`() {
        val dev = scene().agent("dev")!!
        assertEquals("t1", dev.taskId)
        assertEquals("Construir pantallas", dev.taskTitle)
        assertEquals("running", dev.taskStatus)
        assertEquals(0.4f, dev.progress!!, 0.0001f)
        assertEquals("Editando MainActivity.kt", dev.detail)
        assertNull(scene().agent("coord")!!.taskTitle)
    }

    @Test
    fun `cada agente ocupa su estacion del escritorio`() {
        val s = scene(desktop)
        for (spec in SpaceLayout.STATIONS.filter { !it.forSubagents }) {
            val agent = s.agents.first { it.stationId == spec.id }
            assertEquals(Vec3(spec.x, SpaceLayout.ROBOT_Y, spec.z), agent.home)
            assertEquals(agent.id, s.station(spec.id)!!.occupantId)
        }
        assertEquals("st-hermes", s.agent("hermes")!!.stationId)
        assertEquals(Vec3(0.2f, SpaceLayout.ROBOT_Y, 5.6f), s.agent("hermes")!!.home)
        // La consola mira hacia fuera del centro.
        assertEquals(-1, s.agent("gemini")!!.consoleSide)
        assertEquals(1, s.agent("codex")!!.consoleSide)
        // Muse: un robot propio (bombilla con aro de luz, ojos ondulados y su logo), con avatar o sin él.
        val muse = s.agent("muse")!!.look
        assertEquals(listOf(RobotBody.Bulb, Accessory.Halo, EyeShape.Wave, RobotLogo.Muse), listOf(muse.body, muse.accessory, muse.eyes, muse.logo))
        val plain = scene(Snapshot(agents = listOf(Agent("m", "Muse", provider = "muse")))).agent("m")!!.look
        assertEquals(listOf(RobotBody.Bulb, Accessory.Halo, EyeShape.Wave, RobotLogo.Muse), listOf(plain.body, plain.accessory, plain.eyes, plain.logo))
        // Las siete estaciones se dibujan siempre; la de apoyo, libre.
        assertEquals(SpaceLayout.STATIONS.map { it.id }, s.stations.map { it.id })
        assertNull(s.station("st-sub-1")!!.occupantId)
        assertNull(s.station("st-sub-1")!!.accent)
    }

    @Test
    fun `sin estacion conocida se ocupa una libre y los becarios van a la de apoyo`() {
        val s = scene()
        val used = s.agents.map { it.stationId }
        assertEquals("nadie comparte estación", used.size, used.toSet().size)
        assertEquals("st-sub-1", s.agent("sub")!!.stationId)
        val clash = scene(desktop.copy(agents = desktop.agents + Agent("otro", "Otro", stationId = "st-gemini")))
        assertEquals("st-gemini", clash.agent("gemini")!!.stationId)
        assertTrue(clash.agent("otro")!!.stationId != "st-gemini")
    }

    @Test
    fun `nadie cambia de sitio cuando cambia su estado ni por el orden de llegada`() {
        val before = scene()
        val after = scene(team.copy(agents = team.agents.map { if (it.id == "dev") it.copy(activity = "idle", taskId = null) else it }))
        for (agent in before.agents) assertEquals(agent.home, after.agent(agent.id)!!.home)
        val shuffled = scene(team.copy(agents = team.agents.reversed()))
        for (agent in before.agents) assertEquals(agent.home, shuffled.agent(agent.id)!!.home)
    }

    @Test
    fun `equipos grandes usan puestos de reserva sin solaparse`() {
        val s = scene(Snapshot(agents = (1..14).map { Agent("a$it", "Agente $it") }))
        assertEquals(14, s.agents.size)
        assertTrue(s.stations.size >= 14)
        val spots = s.stations.map { it.x to it.z }
        for (i in spots.indices) for (j in i + 1 until spots.size) {
            assertTrue("estaciones $i y $j demasiado juntas", hypot(spots[i].first - spots[j].first, spots[i].second - spots[j].second) > 3f)
        }
        // Y lejos del núcleo y de las zonas.
        for ((x, z) in spots) {
            assertTrue(hypot(x, z) > SpaceLayout.CORE_RADIUS + 2f)
            for (zone in SpaceZone.entries) assertTrue(hypot(x - zone.x, z - zone.z) > 2.4f)
        }
    }

    @Test
    fun `quien colabora en el nucleo se acerca a el`() {
        val res = scene().agent("res")!!
        assertTrue(res.atCore)
        assertEquals(res.bay, res.position)
        assertEquals(SpaceLayout.CORE_RADIUS + 0.35f, hypot(res.position.x, res.position.z), 0.01f)
        assertEquals(SpaceLayout.ROBOT_Y + 0.15f, res.position.y, 0.001f)
        // Un agente desconectado no se mueve aunque el servidor lo sitúe en el núcleo.
        val offline = scene(team.copy(agents = listOf(Agent("x", "X", activity = "offline", location = "core"))))
        assertFalse(offline.agent("x")!!.atCore)
        assertEquals(offline.agent("x")!!.home, offline.agent("x")!!.position)
    }

    @Test
    fun `aspecto - el avatar del servidor o el disenyo del proveedor del escritorio`() {
        val s = scene()
        val dev = s.agent("dev")!!.look
        assertEquals(RobotBody.Cube, dev.body)
        assertEquals(Accessory.Vents, dev.accessory)
        assertEquals(EyeShape.Chevron, dev.eyes)
        assertEquals(RobotLogo.OpenAI, dev.logo)
        assertEquals(0xFF22AA88.toInt(), dev.bodyColor)
        assertEquals(RobotBody.Blob, s.agent("coord")!!.look.body)
        assertEquals(EyeShape.Arc, s.agent("coord")!!.look.eyes)
        assertEquals(RobotBody.Capsule, s.agent("qa")!!.look.body)
        assertEquals(Accessory.Ears, s.agent("qa")!!.look.accessory)
        assertEquals(RobotBody.Egg, s.agent("res")!!.look.body)
        // Los sub-agentes son «becarios» con antena y ojos de punto, sea cual sea su proveedor.
        val sub = s.agent("sub")!!.look
        assertEquals(Accessory.Antenna, sub.accessory)
        assertEquals(EyeShape.Dots, sub.eyes)
        assertEquals(RobotLogo.Becario, sub.logo)

        val hermes = scene(desktop).agent("hermes")!!.look
        assertEquals(RobotBody.Dome, hermes.body)
        assertEquals(Accessory.Hair, hermes.accessory)
        assertEquals(RobotLogo.Hermes, hermes.logo)
        assertEquals(0xFFFFC65A.toInt(), hermes.eyeColor)
        assertEquals("pelo negro", 0xFF141419.toInt(), hermes.accentColor)
        assertEquals("remates dorados", 0xFFD6A743.toInt(), hermes.trimColor)
        // El brillo de la plataforma es el de los remates (si los hay) o el del agente.
        assertEquals(0xFFD6A743.toInt(), scene(desktop).station("st-hermes")!!.accent)
        assertEquals(0xFF2A7BFF.toInt(), scene(desktop).station("st-gemini")!!.accent)
        // Valores desconocidos: se usa el diseño del proveedor.
        val custom = Agent("h", "Hermes", provider = "claude", avatar = RobotAvatar(body = "nave", eyes = "raros"))
        assertEquals(RobotBody.Blob, SpaceSceneBuilder.lookOf(custom).body)
        assertEquals(EyeShape.Arc, SpaceSceneBuilder.lookOf(custom).eyes)
        assertEquals(RobotLogo.Becario, SpaceSceneBuilder.lookOf(Agent("z", "Z", provider = "desconocido")).logo)
        assertNull(SpaceSceneBuilder.parseColor("rojo"))
    }

    @Test
    fun `las pantallas de cada estacion muestran lo de su agente`() {
        val s = scene(desktop)
        assertEquals(2 to 1, s.station("st-gemini")!!.screenModes)
        assertEquals(3 to 2, s.station("st-claude")!!.screenModes)
        assertEquals(0 to 1, s.station("st-codex")!!.screenModes)
        assertEquals(4 to 2, s.station("st-hermes")!!.screenModes)
        assertEquals(4 to 1, s.station("st-sub-1")!!.screenModes)
    }

    @Test
    fun `nucleo y zonas reflejan peticiones, tareas y memoria`() {
        val memory = listOf(
            MemoryEntry("m1", kind = "decision"), MemoryEntry("m2", kind = "decision", status = "superseded"),
            MemoryEntry("m3", kind = "preference"), MemoryEntry("m4", kind = "fact"), MemoryEntry("m5", kind = "pending"),
        )
        val tasks = team.tasks + TaskItem("t3", "r1", "Informe", agentId = "dev", status = "done", result = "Hecho")
        val s = scene(team.copy(memory = memory, tasks = tasks))
        assertEquals(CoreState(1, 1, 1), s.core)
        assertEquals(ZoneInfo(decisions = 1, preferences = 1, facts = 1, pending = 1, tasks = 3, results = 1), s.zones)
        assertEquals("1 trabajando · 1 pensando · 1 esperando · 1 con error · 1 desconectado", scene().summary)
        assertEquals("Sin agentes", scene(Snapshot()).summary)
        assertTrue(scene(Snapshot()).agents.isEmpty())
        assertEquals(7, scene(Snapshot()).stations.size)
    }

    /** Tarea interrumpida al cerrar la app, como la deja el escritorio. */
    private fun interrupted(id: String, agentId: String, requestId: String = "r9", finishedAt: Long = now - 1_000) =
        TaskItem(id, requestId, "Informe", agentId = agentId, status = "cancelled", error = SpaceSceneBuilder.INTERRUPTED, finishedAt = finishedAt)

    @Test
    fun `en pausa - la ultima tarea quedo interrumpida al cerrar la app y su peticion ya no esta activa`() {
        val paused = scene(team.copy(tasks = team.tasks + interrupted("t9", "coord"))).agent("coord")!!
        assertEquals(AgentVisual.Paused, paused.visual)
        assertEquals("En pausa", paused.activityLabel)
        assertEquals("En pausa", paused.statusText)
        assertFalse(paused.busy)
        assertEquals("1 trabajando · 1 pensando · 1 esperando · 1 con error · 1 en pausa · 1 desconectado", scene(team.copy(tasks = team.tasks + interrupted("t9", "coord"))).summary)

        // Si su petición sigue activa, se está reanudando: no está en pausa.
        val resuming = scene(team.copy(tasks = team.tasks + interrupted("t9", "coord", requestId = "r1")))
        assertEquals(AgentVisual.Idle, resuming.agent("coord")!!.visual)
        // Pensando o trabajando gana a la pausa.
        val working = scene(team.copy(tasks = team.tasks + interrupted("t9", "dev")))
        assertEquals(AgentVisual.Working, working.agent("dev")!!.visual)
        // Solo cuenta la tarea más reciente: si después terminó otra, ya no está en pausa.
        val later = TaskItem("t10", "r9", "Otra", agentId = "coord", status = "done", finishedAt = now)
        assertEquals(AgentVisual.Idle, scene(team.copy(tasks = team.tasks + interrupted("t9", "coord") + later)).agent("coord")!!.visual)
        val older = TaskItem("t8", "r9", "Antes", agentId = "coord", status = "done", finishedAt = now - 50_000)
        assertEquals(AgentVisual.Paused, scene(team.copy(tasks = team.tasks + older + interrupted("t9", "coord"))).agent("coord")!!.visual)
        // Cancelada por otro motivo, o fallida: no es una pausa.
        val cancelled = interrupted("t9", "coord").copy(error = "Cancelada por el usuario")
        assertEquals(AgentVisual.Idle, scene(team.copy(tasks = team.tasks + cancelled)).agent("coord")!!.visual)
        val failed = interrupted("t9", "coord").copy(status = "failed")
        assertEquals(AgentVisual.Idle, scene(team.copy(tasks = team.tasks + failed)).agent("coord")!!.visual)
        // Desconectado o con error se ve como tal.
        val off = team.copy(agents = team.agents.map { if (it.id == "coord") it.copy(enabled = false) else it }, tasks = team.tasks + interrupted("t9", "coord"))
        assertEquals(AgentVisual.Offline, scene(off).agent("coord")!!.visual)
    }

    @Test
    fun `necesita tu respuesta - aviso del agente que pide la interfaz sin cambiar su estado`() {
        val s = SpaceSceneBuilder.build(desktop.copy(agents = desktop.agents.map { if (it.id == "hermes") it.copy(activity = "thinking") else it }), now = now, attention = setOf("hermes", "nadie"))
        val hermes = s.agent("hermes")!!
        assertTrue(hermes.attention)
        assertEquals(SpaceSceneBuilder.ATTENTION_TEXT, hermes.statusText)
        assertEquals("Necesita tu respuesta", hermes.statusText)
        assertEquals("su estado real no cambia", AgentVisual.Thinking, hermes.visual)
        assertEquals("Pensando", hermes.activityLabel)
        assertFalse(s.agent("gemini")!!.attention)
        assertEquals("Disponible", s.agent("gemini")!!.statusText)
        // Por defecto, nadie.
        assertTrue(scene(desktop).agents.none { it.attention })
        // Con su motivo (trabajo en pausa), la etiqueta lo dice.
        val labelled = SpaceSceneBuilder.build(desktop, now = now, attention = setOf("hermes"), attentionLabels = mapOf("hermes" to "Trabajo en pausa"))
        assertEquals("Trabajo en pausa", labelled.agent("hermes")!!.statusText)
    }

    @Test
    fun `las escenas no animan nada - solo los eventos reales del escritorio`() {
        val sim = WorldSim()
        val eye = Vec3(0f, 14f, 21f)
        fun run(s: SpaceScene, seconds: Float) = repeat((seconds * 60).toInt()) { sim.step(1f / 60f, s, eye, WorldSettings()) }
        val before = scene()
        run(before, 1f)
        // Una tarea que empieza, otra que termina, otra que falla y una espera que acaba: nada viaja ni se celebra.
        val after = scene(team.copy(
            agents = team.agents.map { if (it.id == "qa") it.copy(activity = "idle", waitingFor = null) else it },
            tasks = team.tasks.map { when (it.id) { "t1" -> it.copy(status = "done"); "t2" -> it.copy(status = "failed"); else -> it } } +
                TaskItem("t3", "r1", "Nueva", agentId = "res", status = "running"),
        ))
        run(after, 2f)
        assertTrue(sim.packets.isEmpty())
        assertTrue(sim.brains.values.all { it.checkAmt < 0.01f && it.alertAmt < 0.01f })
        assertTrue(sim.stations.values.all { st -> st.pulses.all { it.start < 0f } })
        assertTrue(sim.brains.keys.none { sim.labelOverride(it) != null })
    }

    @Test
    fun `un evento del servidor se refleja en la escena`() {
        val event = EventReducer.parse("""{"type":"agent.runtime","sequence":5,"payload":{"runtime":{"agentId":"coord","activity":"error","reason":"Cuota agotada"}}}""")!!
        val updated = (EventReducer.reduce(team, 4, event) as ReduceResult.Applied).snapshot
        val agent = scene(updated).agent("coord")!!
        assertEquals(AgentVisual.Error, agent.visual)
        assertEquals("Cuota agotada", agent.reason)

        val toCore = EventReducer.parse("""{"type":"agent.runtime","sequence":6,"payload":{"runtime":{"agentId":"dev","activity":"working","location":"core"}}}""")!!
        val atCore = (EventReducer.reduce(updated, 5, toCore) as ReduceResult.Applied).snapshot
        assertTrue(scene(atCore).agent("dev")!!.atCore)
        // Al ir al núcleo no cambia de estación.
        assertEquals(scene(updated).agent("dev")!!.stationId, scene(atCore).agent("dev")!!.stationId)
    }

    @Test
    fun `la instantanea JSON del servidor se convierte en escena`() {
        val json = """{"conversation":{"id":"c1","activeRequestIds":[]},"agents":[
            {"id":"claude","name":"Claude","provider":"claude","color":"#ff7a1f","stationId":"st-claude","avatar":{"body":"blob","accessory":"tuft","eyes":"arc","logo":"claude","eyeColor":"#fff0c8"},"activity":"working","location":"station","taskId":"t9","futuro":1}
        ],"tasks":[{"id":"t9","title":"Informe","agentId":"claude","status":"running"}]}"""
        val snapshot = CoworkJson.decodeFromString(Snapshot.serializer(), json)
        val agent = scene(snapshot).agent("claude")!!
        assertEquals(RobotBody.Blob, agent.look.body)
        assertEquals(RobotLogo.Claude, agent.look.logo)
        assertEquals(0xFFFF7A1F.toInt(), agent.look.bodyColor)
        assertEquals("st-claude", agent.stationId)
        assertEquals(Vec3(5.6f, SpaceLayout.ROBOT_Y, -3.6f), agent.home)
        assertEquals("Informe", agent.taskTitle)
        assertFalse(agent.atCore)
    }

    @Test
    fun `estado de la seccion - cargando, sin conexion o escena con datos antiguos`() {
        assertEquals(SpaceStatus.Loading, spaceStatus(CoworkUiState(connection = Connection.Connecting)))
        assertEquals(SpaceStatus.Unavailable("Sin red"), spaceStatus(CoworkUiState(connection = Connection.Offline("Sin red", null))))
        assertEquals(SpaceStatus.Ready(stale = false, offlineReason = null), spaceStatus(CoworkUiState(snapshot = team, connection = Connection.Online)))
        assertEquals(SpaceStatus.Ready(stale = true, offlineReason = "Sin red"), spaceStatus(CoworkUiState(snapshot = team, connection = Connection.Offline("Sin red", 5))))
        assertEquals(SpaceStatus.Ready(stale = true, offlineReason = null), spaceStatus(CoworkUiState(snapshot = team, connection = Connection.Connecting, fromCache = true)))
        assertTrue(SpaceSceneBuilder.build(team, stale = true, now = now).stale)
    }

    @Test
    fun `matematicas - mismo azar y hash que el escritorio y la amortiguacion converge`() {
        // Valores de `seeded(42)` y `hash01('gemini')` en el escritorio: la ciudad y los circuitos salen iguales.
        val rnd = Seeded(42)
        assertEquals(0.6011037519f, rnd.next(), 1e-6f)
        assertEquals(0.4482905589f, rnd.next(), 1e-6f)
        assertEquals(0.8524657934f, rnd.next(), 1e-6f)
        assertEquals(0.84558f, hash01("gemini"), 1e-6f)
        var v = 0f
        repeat(120) { v = damp(v, 10f, 6f, 1f / 60f) }
        assertTrue(abs(v - 10f) < 0.01f)
        assertEquals(1f, smootherstep(2f), 0f)
        assertEquals(0.5f, smootherstep(0.5f), 1e-6f)
    }
}
