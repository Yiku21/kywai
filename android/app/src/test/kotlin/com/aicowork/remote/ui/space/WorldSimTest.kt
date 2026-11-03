package com.aicowork.remote.ui.space

import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.Conversation
import com.aicowork.remote.data.model.RobotAvatar
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import com.aicowork.remote.ui.space.gl.BlurKernel
import com.aicowork.remote.ui.space.gl.FramePacer
import com.aicowork.remote.ui.space.gl.GlassMask
import com.aicowork.remote.ui.space.gl.RenderPlan
import com.aicowork.remote.ui.space.gl.SpaceQuality
import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El mundo vivo (Kotlin puro): sobrevive a recrear la vista, anima solo eventos reales del escritorio (envíos, tareas
 * terminadas o fallidas, toques), y aplica los ajustes al momento. Más las decisiones de dibujo que no necesitan GPU:
 * calidad y ritmo por ajuste, ritmo de fotogramas, núcleo del difuminado y cristales.
 */
class WorldSimTest {
    private val now = 10_000_000L
    private val eye = Vec3(0f, 14f, 21f)

    private val team = Snapshot(
        conversation = Conversation(id = "c1", title = "Proyecto", activeRequestIds = listOf("r1")),
        agents = listOf(
            Agent("hermes", "Hermes", provider = "hermes", color = "#ffe6ba", stationId = "st-hermes", plannerOnly = true,
                avatar = RobotAvatar("dome", "hair", "round", "hermes", "#ffc65a", "#141419", "#d6a743")),
            Agent("gemini", "Gemini", provider = "gemini", color = "#2a7bff", stationId = "st-gemini", activity = "working", taskId = "t1"),
            Agent("codex", "Codex", provider = "codex", color = "#21c07c", stationId = "st-codex"),
        ),
        tasks = listOf(TaskItem("t1", "r1", "Investigar", agentId = "gemini", status = "running")),
    )
    private val scene = SpaceSceneBuilder.build(team, now = now)

    private class Run(val sim: WorldSim, val scene: SpaceScene, val settings: WorldSettings = WorldSettings()) {
        fun seconds(s: Float, scene: SpaceScene = this.scene, settings: WorldSettings = this.settings) =
            repeat((s * 60).toInt()) { sim.step(1f / 60f, scene, Vec3(0f, 14f, 21f), settings) }
    }

    private fun running(settings: WorldSettings = WorldSettings()) = Run(WorldSim(), scene, settings).also { it.seconds(1f) }

    // =====================================================================================================
    // Persistencia
    // =====================================================================================================

    @Test
    fun `el mundo vive en el controlador - recrear la vista no reinicia robots, reloj ni camara`() {
        val controller = WorldController()
        val first = controller.renderer(2.625f, lowEnd = false)
        val sim = controller.world
        repeat(120) { sim.step(1f / 60f, scene, eye, controller.settings) }
        controller.camera.update(1f / 60f)
        val time = sim.time
        val brains = sim.brains.values.toList()
        val positions = brains.map { it.pos }
        val pose = controller.camera.pose

        // Vista nueva (plegar/desplegar, otra pantalla): el mismo renderizador y el mismo mundo.
        val second = controller.renderer(2.625f, lowEnd = false)
        assertSame(first, second)
        assertSame(sim, controller.world)
        assertEquals(pose, controller.camera.pose)
        // La interfaz vuelve a pasar la escena (otra instancia, mismos datos): nadie reaparece.
        val again = SpaceSceneBuilder.build(team, now = now)
        sim.step(1f / 60f, again, eye, controller.settings)
        assertTrue("el reloj sigue, no vuelve a cero", sim.time > time)
        assertEquals(brains, sim.brains.values.toList())
        for ((b, p) in brains.zip(positions)) {
            assertEquals("sin animación de aparición", 1f, b.scale, 0.001f)
            assertTrue("sigue desde donde estaba", b.pos.distanceTo(p) < 0.05f)
        }
        // Cambia la densidad (otra pantalla): el renderizador es el mismo, solo se rehacen las etiquetas.
        assertSame(first, controller.renderer(3f, lowEnd = false))
        assertEquals(3f, first.density, 0f)
    }

    @Test
    fun `la primera escena no anima apariciones y un agente nuevo aparece pero con datos antiguos no`() {
        val run = running()
        assertTrue(run.sim.brains.values.all { it.scale == 1f })
        val withSub = SpaceSceneBuilder.build(team.copy(agents = team.agents + Agent("sub", "Becario", isSubagent = true)), now = now)
        run.sim.step(1f / 60f, withSub, eye, WorldSettings())
        assertTrue("el becario aparece desde cero", run.sim.brains.getValue("sub").scale < 0.2f)
        val stale = SpaceSceneBuilder.build(team.copy(agents = team.agents + Agent("otro", "Otro")), stale = true, now = now)
        run.sim.step(1f / 60f, stale, eye, WorldSettings())
        assertEquals("con datos antiguos no se anima nada", 1f, run.sim.brains.getValue("otro").scale, 0.2f)
    }

    // =====================================================================================================
    // Eventos reales
    // =====================================================================================================

    @Test
    fun `nucleo a agente - recorre la conexion de su estacion, avisa al receptor y llega`() {
        val run = running()
        val sim = run.sim
        sim.handle(WorldEvent.Transfer("x1", "core", "codex", "Nueva tarea", "Escribir pruebas"))
        assertEquals(1, sim.packets.size)
        val p = sim.packets.single()
        assertTrue(p.toAgent == "codex" && !p.arc)
        assertEquals(SpaceColors.CYAN, p.color)
        assertTrue("sale del núcleo", p.path.first().distanceTo(WorldSim.CORE_TOP) < 0.01f)
        assertTrue("llega al robot", p.path.last().distanceTo(scene.agent("codex")!!.home) < 0.5f)
        assertEquals(1, sim.stationFx("st-codex").traceUsers)
        assertEquals("Recibiendo tarea", sim.labelOverride("codex")!!.text)
        assertEquals(WorldSim.Tone.Receive, sim.labelOverride("codex")!!.tone)
        assertTrue("el núcleo emite", sim.corePulses.any { it.start == sim.time && abs(it.strength - 0.3f) < 1e-4f })

        run.seconds(p.duration + 0.1f)
        assertNotNull(p.arrivedAt)
        assertEquals("Recibido", sim.labelOverride("codex")!!.text)
        assertEquals(0, sim.stationFx("st-codex").traceUsers)
        assertTrue("su estación destella", sim.stationFx("st-codex").pulses.any { it.start > 0f && it.strength == 1f })
        run.seconds(WorldSim.PACKET_LINGER + 0.2f)
        assertTrue(sim.packets.isEmpty())
        run.seconds(1.5f)
        assertNull(sim.labelOverride("codex"))
    }

    @Test
    fun `agente al nucleo - Hermes recibe los resultados con un pequeno asentimiento`() {
        val run = running()
        val sim = run.sim
        sim.handle(WorldEvent.Transfer("x2", "gemini", "core", "Resultado: Investigar", "Investigar"))
        assertEquals("Enviando: Investigar", sim.labelOverride("gemini")!!.text)
        assertEquals(WorldSim.Tone.Send, sim.labelOverride("gemini")!!.tone)
        assertTrue("la estación del emisor destella", sim.stationFx("st-gemini").pulses.any { abs(it.strength - 0.45f) < 1e-4f })
        val p = sim.packets.single()
        assertTrue(p.toCore)
        var nod = 0f
        repeat(((p.duration + 0.7f) * 60).toInt()) {
            sim.step(1f / 60f, scene, eye, WorldSettings())
            nod = maxOf(nod, sim.brains.getValue("hermes").ackAmt)
        }
        assertTrue("Hermes asiente al llegar", nod > 0.3f)
        assertTrue("más discreto que una recepción directa", nod < 0.7f)
        assertTrue("el núcleo recibe", sim.corePulses.any { it.strength == 1f })
        assertEquals(WorldSim.coordinatorOf(scene)!!.id, "hermes")
    }

    @Test
    fun `del usuario va como del nucleo con su color, entre agentes en arco, y nunca dos veces`() {
        val run = running()
        val sim = run.sim
        sim.handle(WorldEvent.Transfer("u1", "user", "hermes", "Petición", null))
        assertEquals(SpaceColors.USER, sim.packets.last().color)
        assertFalse(sim.packets.last().arc)
        sim.handle(WorldEvent.Transfer("a1", "hermes", "codex", "Delegada: Pruebas", "Pruebas"))
        val arc = sim.packets.last()
        assertTrue(arc.arc && arc.arcLen > 1f)
        assertEquals(scene.agent("hermes")!!.color, arc.color)
        assertEquals("Recibiendo tarea", sim.labelOverride("codex")!!.text)
        // El mismo envío repetido (resincronización) no se anima otra vez.
        sim.handle(WorldEvent.Transfer("a1", "hermes", "codex", "Delegada: Pruebas", "Pruebas"))
        assertEquals(2, sim.packets.size)
    }

    @Test
    fun `ids desconocidos se ignoran sin romper nada`() {
        val run = running()
        val sim = run.sim
        sim.handle(WorldEvent.Transfer("z1", "fantasma", "codex", "x", null))
        sim.handle(WorldEvent.Transfer("z2", "core", "fantasma", "x", null))
        sim.handle(WorldEvent.Transfer("z3", "core", "user", "x", null))
        sim.handle(WorldEvent.TaskCompleted("t", "fantasma"))
        sim.handle(WorldEvent.TaskFailed("t", "fantasma"))
        sim.handle(WorldEvent.Poke("fantasma"))
        run.seconds(1f)
        assertTrue(sim.packets.isEmpty())
        assertTrue(sim.stations.values.all { st -> st.pulses.all { it.start < 0f } })
        // Sin escena todavía, tampoco pasa nada.
        WorldSim().handle(WorldEvent.Transfer("z4", "core", "codex", "x", null))
    }

    @Test
    fun `tarea terminada - salto, giro, marca y destello verde`() {
        val run = running()
        val sim = run.sim
        sim.handle(WorldEvent.TaskCompleted("t1", "gemini"))
        assertEquals("Completado", sim.labelOverride("gemini")!!.text)
        assertTrue(sim.stationFx("st-gemini").pulses.any { it.color == WorldSim.DONE_COLOR && it.strength == 1f })
        run.seconds(0.5f)
        val brain = sim.brains.getValue("gemini")
        assertTrue(brain.checkAmt > 0.9f)
        assertTrue(brain.eyeHappy > 0.9f)
    }

    @Test
    fun `tarea fallida - destello rojo y un breve gesto de error que se apaga`() {
        val run = running()
        val sim = run.sim
        sim.handle(WorldEvent.TaskFailed("t1", "gemini"))
        assertTrue(sim.stationFx("st-gemini").pulses.any { it.color == WorldSim.ERROR_COLOR })
        assertEquals(WorldSim.Tone.Error, sim.labelOverride("gemini")!!.tone)
        run.seconds(0.3f)
        val brain = sim.brains.getValue("gemini")
        assertTrue(brain.alertAmt > 0.5f)
        assertTrue(brain.eyeError > 0.5f)
        run.seconds(2.5f)
        assertEquals(0f, brain.alertAmt, 0f)
        assertTrue("vuelve a sus ojos (sigue trabajando)", brain.eyeError < 0.2f)
    }

    @Test
    fun `tocar un robot - reaccion breve, tambien con movimiento reducido pero sin salto`() {
        for (reduced in listOf(false, true)) {
            val settings = WorldSettings(reducedMotion = reduced)
            val poked = running(settings)
            val twin = running(settings)
            poked.sim.handle(WorldEvent.Poke("codex"))
            var maxLift = 0f
            var maxHappy = 0f
            var maxGlowGain = 0f
            repeat(36) {
                poked.seconds(1f / 60f + 1e-4f)
                twin.seconds(1f / 60f + 1e-4f)
                val a = poked.sim.brains.getValue("codex")
                val b = twin.sim.brains.getValue("codex")
                maxLift = maxOf(maxLift, a.pos.y - b.pos.y)
                maxHappy = maxOf(maxHappy, a.eyeHappy)
                maxGlowGain = maxOf(maxGlowGain, a.glow - b.glow)
            }
            assertTrue("ojos felices (reducido=$reduced)", maxHappy > 0.6f)
            assertTrue("brilla más (reducido=$reduced)", maxGlowGain > 0.05f)
            if (reduced) assertEquals("sin salto con movimiento reducido", 0f, maxLift, 1e-4f) else assertTrue("salta un poco", maxLift > 0.05f)
            poked.seconds(1.5f)
            assertTrue("dura poco", poked.sim.brains.getValue("codex").eyeHappy < 0.1f)
        }
    }

    @Test
    fun `los eventos que esperaron demasiado no se animan`() {
        val controller = WorldController()
        controller.post(WorldEvent.Poke("codex"))
        val handled = mutableListOf<WorldEvent>()
        controller.drainFresh(System.nanoTime() + 10_000_000_000L, 3_000_000_000L) { handled += it }
        assertTrue(handled.isEmpty())
        controller.post(WorldEvent.Poke("codex"))
        controller.drainFresh(System.nanoTime(), 3_000_000_000L) { handled += it }
        assertEquals(listOf<WorldEvent>(WorldEvent.Poke("codex")), handled)
        // Sin mundo dibujándose, la cola no crece sin límite.
        repeat(1000) { controller.post(WorldEvent.Poke("a$it")) }
        var n = 0
        controller.drain { n++ }
        assertTrue(n in 1..256)
        // Se quedan los más recientes.
        repeat(300) { controller.post(WorldEvent.Poke("b$it")) }
        var last: WorldEvent? = null
        controller.drain { last = it }
        assertEquals(WorldEvent.Poke("b299"), last)
    }

    // =====================================================================================================
    // Estados nuevos en los robots
    // =====================================================================================================

    @Test
    fun `en pausa se apaga con los ojos entornados y el simbolo de pausa y el aviso sustituye al arco de espera`() {
        val snap = team.copy(
            agents = team.agents.map { if (it.id == "codex") it.copy(activity = "waiting", waitingFor = "gemini") else it },
            tasks = team.tasks + TaskItem("t9", "r9", "Informe", agentId = "hermes", status = "cancelled", error = SpaceSceneBuilder.INTERRUPTED),
        )
        val s = SpaceSceneBuilder.build(snap, now = now, attention = setOf("codex"))
        val run = Run(WorldSim(), s)
        run.seconds(4f)
        val hermes = run.sim.brains.getValue("hermes")
        assertEquals(AgentVisual.Paused, hermes.visual)
        assertTrue(hermes.pausedAmt > 0.95f)
        assertTrue("apagado", hermes.glow < 0.08f)
        val codex = run.sim.brains.getValue("codex")
        assertTrue(codex.attentionAmt > 0.95f)
        assertTrue("sin el arco gris de la espera", codex.waitingAmt < 0.05f)
        // Ojos a media asta (fuera de un parpadeo).
        var open = 0f
        repeat(120) { run.seconds(1f / 60f + 1e-4f); open = maxOf(open, hermes.eyeOpen) }
        assertEquals(0.46f, open, 0.05f)
    }

    // =====================================================================================================
    // Ajustes
    // =====================================================================================================

    @Test
    fun `ajustes - ambiente y movimiento reducido se aplican al momento`() {
        val sim = WorldSim()
        sim.step(1f / 60f, scene, eye, WorldSettings())
        assertEquals(1f, sim.ambient, 0f)
        assertFalse(sim.brains.values.first().reduced)
        sim.step(1f / 60f, scene, eye, WorldSettings(ambient = false))
        assertEquals("sin ambiente", 0f, sim.ambient, 0f)
        assertFalse("los robots siguen vivos", sim.brains.values.first().reduced)
        sim.step(1f / 60f, scene, eye, WorldSettings(reducedMotion = true))
        assertEquals("movimiento reducido también calma el ambiente", 0f, sim.ambient, 0f)
        assertTrue(sim.brains.values.all { it.reduced })
        sim.step(1f / 60f, scene, eye, WorldSettings())
        assertTrue(sim.brains.values.none { it.reduced })
        // Sin ambiente el globo casi no gira, pero la actividad real sí se anima.
        val quiet = running(WorldSettings(ambient = false))
        val before = quiet.sim.globeRot
        quiet.seconds(1f)
        assertTrue(quiet.sim.globeRot - before < 0.005f)
        quiet.sim.handle(WorldEvent.Transfer("q1", "core", "codex", "x", null))
        assertEquals(1, quiet.sim.packets.size)
    }

    @Test
    fun `efectos - calidad, cristal, MSAA y ritmo por ajuste`() {
        assertEquals(RenderPlan(SpaceQuality.Low, glass = false, msaa = false, maxFps = 30), RenderPlan.of(WorldSettings(effects = EffectsLevel.Soft), covered = false, lowEnd = false))
        assertEquals(RenderPlan(SpaceQuality.Normal, glass = true, msaa = false, maxFps = 60), RenderPlan.of(WorldSettings(effects = EffectsLevel.Normal), covered = false, lowEnd = false))
        assertEquals(RenderPlan(SpaceQuality.Normal, glass = true, msaa = true, maxFps = 0), RenderPlan.of(WorldSettings(effects = EffectsLevel.Full), covered = false, lowEnd = false))
        // Tapado del todo: ~5 fps, con el mismo aspecto.
        assertEquals(RenderPlan.COVERED_FPS, RenderPlan.of(WorldSettings(effects = EffectsLevel.Full), covered = true, lowEnd = false).maxFps)
        // Dispositivo con poca memoria: calidad baja y sin MSAA aunque se pida «Completa».
        val low = RenderPlan.of(WorldSettings(effects = EffectsLevel.Full), covered = false, lowEnd = true)
        assertEquals(SpaceQuality.Low, low.quality)
        assertFalse(low.msaa)
        assertTrue(low.glass)
    }

    @Test
    fun `ritmo de fotogramas - en una pantalla de 120 Hz`() {
        val vsync = 1_000_000_000L / 120
        fun count(maxFps: Int, frames: Int = 1200): Int {
            val pacer = FramePacer()
            var n = 0
            for (i in 0 until frames) if (pacer.shouldRender(1_000_000L + i * vsync + (if (i % 3 == 0) 300_000L else 0L), maxFps)) n++
            return n
        }
        // 10 s de refrescos.
        assertEquals(1200, count(0))
        assertEquals(600, count(60), 2)
        assertEquals(300, count(30), 2)
        assertEquals(50, count(RenderPlan.COVERED_FPS), 2)
        // Y a 60 Hz con límite de 60: todos.
        val pacer = FramePacer()
        val at60 = (0 until 600).count { pacer.shouldRender(it * (1_000_000_000L / 60), 60) }
        assertEquals(600, at60, 2)
    }

    private fun assertEquals(expected: Int, actual: Int, delta: Int) =
        assertTrue("esperaba $expected ± $delta y fue $actual", abs(expected - actual) <= delta)

    @Test
    fun `difuminado - nucleo gaussiano normalizado y cristales visibles`() {
        for (sigma in listOf(0.5f, 2f, 8.5f, 12f)) {
            val k = BlurKernel.gaussian(sigma)
            var sum = k.center
            for (w in k.weights) sum += 2f * w
            assertEquals(1f, sum, 1e-4f)
            assertTrue(k.pairs in 1..BlurKernel.MAX_PAIRS)
            for (i in 1 until k.pairs) assertTrue(k.offsets[i] > k.offsets[i - 1])
        }
        val regions = listOf(
            GlassRegion(0f, 0f, 400f, 300f, radius = 500f),
            GlassRegion(10f, 10f, 20f, 20f, radius = 4f, alpha = 0f),
            GlassRegion(-500f, -500f, -10f, -10f, radius = 4f),
            GlassRegion(900f, 900f, 1100f, 1100f, radius = 16f, alpha = 2f),
        )
        val visible = GlassMask.visible(regions, 1000f, 1000f)
        assertEquals(2, visible.size)
        assertEquals("el radio no pasa de la mitad del lado", 150f, visible[0].radius, 0f)
        assertEquals(1f, visible[1].alpha, 0f)
        val many = (0 until 20).map { GlassRegion(0f, 0f, 10f + it, 10f + it, 2f) }
        val kept = GlassMask.visible(many, 1000f, 1000f)
        assertEquals(GlassMask.MAX, kept.size)
        assertTrue("se quedan los mayores", kept.all { it.right >= 22f })
        assertTrue(GlassMask.visible(emptyList(), 100f, 100f).isEmpty())
    }
}
