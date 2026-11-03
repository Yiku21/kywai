package com.aicowork.remote.ui.space

import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.ui.space.gl.BodySpec
import com.aicowork.remote.ui.space.gl.RobotGeometry
import com.aicowork.remote.ui.space.gl.SceneGeometry
import com.aicowork.remote.ui.space.gl.Shapes
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.sqrt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Cámara y controles táctiles, selección por toque, animación de los robots y geometría (todo en Kotlin puro). */
class OrbitCameraTest {

    private fun settled(camera: OrbitCamera): OrbitCamera {
        repeat(600) { camera.update(1f / 60f) }
        return camera
    }

    @Test
    fun `los gestos respetan los limites de la camara del escritorio`() {
        val camera = OrbitCamera()
        camera.orbit(0f, 100_000f, 1000f)
        assertEquals(OrbitCamera.MAX_PITCH, camera.goalPose.pitch, 0.0001f)
        camera.orbit(0f, -100_000f, 1000f)
        assertEquals(OrbitCamera.MIN_PITCH, camera.goalPose.pitch, 0.0001f)
        // Giro lateral limitado a ±0,95 rad: nunca se ve la oficina por detrás.
        camera.orbit(100_000f, 0f, 1000f)
        assertEquals(-OrbitCamera.MAX_YAW, camera.goalPose.yaw, 0.0001f)
        camera.zoom(1000f)
        assertEquals(OrbitCamera.MIN_DISTANCE, camera.goalPose.distance, 0.0001f)
        camera.zoom(0.0001f)
        assertEquals(OrbitCamera.MAX_DISTANCE, camera.goalPose.distance, 0.0001f)
        camera.zoom(0f) // ignorado
        assertEquals(OrbitCamera.MAX_DISTANCE, camera.goalPose.distance, 0.0001f)
        // Desplazar con dos dedos no saca el punto de mira de la oficina.
        camera.pan(1_000_000f, -1_000_000f, 1000f)
        assertTrue(camera.goalPose.target.x in -11f..11f && camera.goalPose.target.z in -9f..9f)
        assertTrue(!camera.atOverview)
    }

    @Test
    fun `una vuelta por altura de pantalla y desplazamiento en el sentido del dedo`() {
        val camera = OrbitCamera(OrbitCamera.Pose(yaw = 0f, pitch = 1f, distance = 20f, target = Vec3.Zero))
        camera.orbit(-100f, 0f, 1000f)
        assertEquals(2f * PI.toFloat() * 0.1f, camera.goalPose.yaw, 0.0001f)
        val pan = OrbitCamera(OrbitCamera.Pose(yaw = 0f, pitch = 1f, distance = 20f, target = Vec3.Zero))
        pan.pan(100f, 0f, 1000f)
        assertTrue("arrastrar a la derecha mueve la vista a la izquierda", pan.goalPose.target.x < 0f)
        pan.pan(0f, 100f, 1000f)
        assertTrue("arrastrar hacia abajo acerca lo de detrás", pan.goalPose.target.z < 0f)
    }

    @Test
    fun `botones de acercar, alejar y vista general`() {
        val camera = OrbitCamera(OrbitCamera.Pose(distance = 20f))
        camera.dolly(1)
        assertEquals(20f - OrbitCamera.DOLLY_STEP, camera.goalPose.distance, 0.0001f)
        camera.dolly(-1)
        camera.dolly(-1)
        assertEquals(20f + OrbitCamera.DOLLY_STEP, camera.goalPose.distance, 0.0001f)
        camera.overview(1.78f)
        assertTrue(camera.atOverview)
        // Pantalla apaisada: el encuadre del escritorio (0, 13,6, 21,2) → (0, 0,3, 1,2).
        val eye = settled(camera).pose.eye()
        assertEquals(0f, eye.x, 0.01f)
        assertEquals(13.6f, eye.y, 0.05f)
        assertEquals(21.2f, eye.z, 0.05f)
        // Vertical: más cenital y más lejos, hasta el máximo de 64.
        val tall = OrbitCamera.overviewPose(0.45f)
        assertTrue(tall.pitch > OrbitCamera.overviewPose(1.78f).pitch)
        assertEquals(OrbitCamera.MAX_DISTANCE, tall.distance, 0.01f)
        // Entre vertical y apaisado (huecos casi cuadrados) no hay saltos.
        var prev = OrbitCamera.overviewPose(1.0f)
        var a = 1.0f
        while (a < 1.8f) {
            a += 0.01f
            val p = OrbitCamera.overviewPose(a)
            assertTrue("salto en $a", p.eye().distanceTo(prev.eye()) < 1f && abs(p.pitch - prev.pitch) < 0.05f)
            prev = p
        }
    }

    @Test
    fun `acercarse a una estacion como al pulsarla en el escritorio`() {
        val camera = settled(OrbitCamera().also { it.focus(-6.2f, -3.2f, aspect = 1.6f) })
        assertEquals(-6.2f, camera.pose.target.x, 0.01f)
        assertEquals(0.9f, camera.pose.target.y, 0.01f)
        val eye = camera.pose.eye()
        assertEquals(-6.2f * 0.85f, eye.x, 0.05f)
        assertEquals(7.6f, eye.y, 0.05f)
        assertEquals(-3.2f + 9.4f, eye.z, 0.05f)
        // En vertical se aleja para que quepa la plataforma con su consola.
        assertTrue(OrbitCamera.focusPose(0f, 0f, 0.45f).distance > OrbitCamera.focusPose(0f, 0f, 1.6f).distance)
    }

    @Test
    fun `tocar un robot lo selecciona y tocar el vacio no`() {
        val camera = settled(OrbitCamera(OrbitCamera.Pose(yaw = 0f, pitch = 0.5f, distance = 12f, target = Vec3(0f, 1f, 0f))))
        val w = 1080f
        val h = 2200f
        val vp = camera.viewProjection(FloatArray(16), w / h)
        val targets = listOf(
            PickTarget(ScenePick.Agent("centro"), Vec3(0f, 1f, 0f), 0.8f, priority = 2),
            PickTarget(ScenePick.Agent("derecha"), Vec3(2f, 1f, 0f), 0.6f, priority = 2),
        )
        assertEquals(ScenePick.Agent("centro"), ScenePicker.pick(vp, w, h, w / 2, h / 2, targets, 60f))
        assertNull(ScenePicker.pick(vp, w, h, w / 2, h / 2, targets.drop(1), 60f))
        assertNull(ScenePicker.pick(vp, w, h, 40f, 60f, targets, 60f))
        var hit: ScenePick? = null
        for (x in (w / 2).toInt() until w.toInt() step 10) {
            hit = ScenePicker.pick(vp, w, h, x.toFloat(), h / 2, targets.drop(1), 60f) ?: continue
            break
        }
        assertEquals(ScenePick.Agent("derecha"), hit)
    }

    /** Píxel (x, y hacia abajo) donde cae [p] con [vp] en una vista de [w]×[h]. */
    private fun screen(vp: FloatArray, p: Vec3, w: Float, h: Float): Pair<Float, Float> {
        val c = M4.transform(vp, p)
        return (c[0] / c[3] * 0.5f + 0.5f) * w to (1f - (c[1] / c[3] * 0.5f + 0.5f)) * h
    }

    @Test
    fun `sin controles, el encuadre es la proyeccion normal de toda la vista`() {
        val camera = settled(OrbitCamera())
        val full = Framing.of(1000f, 2000f, WorldInsets())
        assertEquals(Framing(0f, 0f, 1000f, 2000f), full)
        val a = camera.viewProjection(FloatArray(16), 0.5f)
        val b = camera.viewProjection(FloatArray(16), 1000f, 2000f, full)
        for (i in 0 until 16) assertEquals(a[i], b[i], 1e-5f)
    }

    @Test
    fun `desplazamiento de lente - el mundo se centra en el hueco que dejan los controles`() {
        val camera = settled(OrbitCamera())
        val w = 2448f
        val h = 1848f
        // Z Fold8 desplegado en horizontal con un panel de 400 dp a la derecha: el hueco libre es la parte izquierda.
        val panel = 400f * 2.625f
        val framing = Framing.of(w, h, WorldInsets(right = panel))
        assertEquals((w - panel) / 2f, framing.centerX, 0.01f)
        assertEquals(h / 2f, framing.centerY, 0.01f)
        val vp = camera.viewProjection(FloatArray(16), w, h, framing)
        val (sx, sy) = screen(vp, camera.pose.target, w, h)
        assertEquals("el punto de mira cae en el centro del hueco", framing.centerX, sx, 0.5f)
        assertEquals(framing.centerY, sy, 0.5f)
        // El viewport no cambia: el mundo se sigue dibujando bajo el panel (más allá del hueco).
        val (rx, _) = screen(vp, camera.pose.target + Vec3(6f, 0f, 0f), w, h)
        assertTrue(rx > framing.centerX)

        // Con una barra arriba y otra abajo, también en vertical.
        val bars = Framing.of(1000f, 2000f, WorldInsets(top = 200f, bottom = 600f))
        val vp2 = camera.viewProjection(FloatArray(16), 1000f, 2000f, bars)
        val (_, y2) = screen(vp2, camera.pose.target, 1000f, 2000f)
        assertEquals(200f + (2000f - 800f) / 2f, y2, 0.5f)

        // Un panel enorme no encoge el mundo hasta una tira: como mucho al 55 % de la vista, pegado al borde libre
        // (lo que sobra queda bajo el panel, nunca fuera de la pantalla).
        val huge = Framing.of(1000f, 1000f, WorldInsets(right = 900f))
        assertEquals(550f, huge.width, 0.01f)
        assertEquals(0f, huge.left, 0.01f)
        val left = Framing.of(1000f, 1000f, WorldInsets(left = 700f))
        assertEquals(1000f, left.right, 0.01f)
        // Z Fold8 desplegado con un panel de 400 dp: el encuadre no es más estrecho que la vista general más lejana.
        val fold = Framing.of(1848f, 2448f, WorldInsets(right = (400f + 32f) * 2.625f))
        assertEquals(Framing.MIN_ASPECT, fold.aspect, 0.001f)
        assertEquals(0f, fold.left, 0.01f)
        // La vista general vertical se aleja 1,32 / proporción veces: con esa proporción aún no topa con el límite.
        assertTrue("la vista general aún cabe", hypot(21f, 11.5f) * 1.32f / fold.aspect <= OrbitCamera.MAX_DISTANCE)
        // Insets absurdos (negativos o mayores que la vista) no rompen nada.
        val odd = Framing.of(1000f, 1000f, WorldInsets(left = -50f, right = 5000f))
        assertTrue(odd.width > 0f && odd.height > 0f)
    }

    @Test
    fun `tocar con el encuadre desplazado elige lo que se ve, con la misma proyeccion`() {
        val camera = settled(OrbitCamera(OrbitCamera.Pose(yaw = 0f, pitch = 0.6f, distance = 14f, target = Vec3(0f, 1f, 0f))))
        val w = 1848f
        val h = 2448f
        val framing = Framing.of(w, h, WorldInsets(right = 1050f))
        val vp = camera.viewProjection(FloatArray(16), w, h, framing)
        val targets = listOf(PickTarget(ScenePick.Agent("centro"), Vec3(0f, 1f, 0f), 0.8f, priority = 2))
        // El robot del punto de mira está en el centro del hueco, no en el de la pantalla.
        assertEquals(ScenePick.Agent("centro"), ScenePicker.pick(vp, w, h, framing.centerX, framing.centerY, targets, 40f, framing.height))
        assertNull(ScenePicker.pick(vp, w, h, w / 2f, h / 2f, targets, 40f, framing.height))
        // El radio del objetivo sigue al encuadre: el campo de visión se reparte en la altura del hueco.
        val (edgeX, edgeY) = screen(vp, Vec3(0.7f, 1f, 0f), w, h)
        assertEquals(ScenePick.Agent("centro"), ScenePicker.pick(vp, w, h, edgeX, edgeY, targets, 1f, framing.height))
        // El controlador usa exactamente esa proyección para tocar.
        val controller = WorldController(camera)
        controller.insets = WorldInsets(right = 1050f)
        val out = FloatArray(16)
        val used = controller.viewProjection(out, w, h)
        assertEquals(framing, used)
        for (i in 0 until 16) assertEquals(vp[i], out[i], 1e-5f)
    }

    @Test
    fun `acercarse a una estacion la deja en el centro del hueco libre aunque el panel sea ancho`() {
        val controller = WorldController()
        val w = 1848f
        val h = 2448f
        controller.insets = WorldInsets(right = 1134f)
        controller.lens = WorldController.Lens(w, h, Framing.of(w, h, controller.insets))
        assertTrue("en la vista general, encuadre con tamaño mínimo", controller.fitOverview)
        controller.focus(0.2f, 5.6f)
        assertTrue(!controller.fitOverview)
        val exact = Framing.of(w, h, controller.insets, fitOverview = false)
        assertEquals((w - 1134f) / 2f, exact.centerX, 0.01f)
        assertEquals(OrbitCamera.focusPose(0.2f, 5.6f, exact.aspect), controller.camera.goalPose)
        // El mundo lleva el encuadre al hueco exacto con suavidad y la estación queda en su centro.
        var f = controller.world.frame(w, h, controller.insets, 1f / 60f, controller.fitOverview)
        repeat(240) {
            f = controller.world.frame(w, h, controller.insets, 1f / 60f, controller.fitOverview)
            controller.camera.update(1f / 60f)
        }
        assertEquals(exact, f)
        val (sx, sy) = screen(controller.camera.viewProjection(FloatArray(16), w, h, f), Vec3(0.2f, 0.9f, 5.6f), w, h)
        assertEquals(exact.centerX, sx, 1f)
        assertEquals(exact.centerY, sy, 1f)
        // Vuelta a la vista general (botón o doble toque): otra vez el encuadre con tamaño mínimo.
        controller.overview()
        assertTrue(controller.fitOverview)
    }

    @Test
    fun `los cambios de hueco se animan con suavidad y la vista general se reencuadra solo si se esta en ella`() {
        val sim = WorldSim()
        val camera = OrbitCamera()
        val first = sim.frame(2000f, 1000f, WorldInsets(), 1f / 60f)
        sim.reframe(camera, first)
        assertEquals(Framing(0f, 0f, 2000f, 1000f), first)
        // Se abre un panel: el encuadre no salta, se acerca poco a poco.
        val open = WorldInsets(right = 400f)
        val next = sim.frame(2000f, 1000f, open, 1f / 60f)
        assertTrue(next.right < 2000f && next.right > 1600f + 1f)
        var f = next
        repeat(120) { f = sim.frame(2000f, 1000f, open, 1f / 60f) }
        assertEquals(Framing.of(2000f, 1000f, open), f)
        // En la vista general, la cámara se reencuadra con la proporción del hueco.
        sim.reframe(camera, f)
        assertEquals(OrbitCamera.overviewPose(f.aspect), camera.goalPose)
        // Acercado a una estación, no.
        camera.focus(5.8f, 3.4f, f.aspect)
        val focused = camera.goalPose
        repeat(60) { sim.reframe(camera, sim.frame(2000f, 1000f, WorldInsets(), 1f / 60f)) }
        assertEquals(focused, camera.goalPose)
        // Cambiar el tamaño de la vista (plegar) coloca el encuadre directamente.
        val folded = sim.frame(600f, 1000f, open, 1f / 60f)
        assertEquals(Framing.of(600f, 1000f, open), folded)
    }

    @Test
    fun `el robot gana a su plataforma y lo que queda detras de la camara no cuenta`() {
        val camera = settled(OrbitCamera(OrbitCamera.Pose(yaw = 0f, pitch = 0.3f, distance = 12f, target = Vec3(0f, 1f, 0f))))
        val eye = camera.pose.eye()
        val vp = camera.viewProjection(FloatArray(16), 0.5f)
        val near = eye + (Vec3(0f, 1f, 0f) - eye) * 0.4f
        val targets = listOf(
            PickTarget(ScenePick.Station("st"), near, 1.5f, priority = 1),
            PickTarget(ScenePick.Agent("robot"), Vec3(0f, 1f, 0f), 0.8f, priority = 2),
        )
        assertEquals(ScenePick.Agent("robot"), ScenePicker.pick(vp, 500f, 1000f, 250f, 500f, targets, 40f))
        val behind = eye + (eye - Vec3(0f, 1f, 0f)) * 0.5f
        assertNull(ScenePicker.pick(vp, 500f, 1000f, 250f, 500f, listOf(PickTarget(ScenePick.Core, behind, 0.8f)), 40f))
    }

    @Test
    fun `los objetivos tactiles siguen a la escena - robots, estaciones, zonas y nucleo`() {
        val scene = SpaceSceneBuilder.build(Snapshot(agents = listOf(Agent("a", "A", stationId = "st-qwen"), Agent("b", "B", isSubagent = true))), now = 0)
        val targets = ScenePicker.targets(scene)
        assertEquals(listOf(ScenePick.Agent("a"), ScenePick.Agent("b")), targets.filter { it.pick is ScenePick.Agent }.map { it.pick })
        assertEquals(7, targets.count { it.pick is ScenePick.Station })
        assertEquals(SpaceZone.entries.size, targets.count { it.pick is ScenePick.Zone })
        assertTrue(targets.any { it.pick == ScenePick.Core })
        val robot = targets.first { it.pick == ScenePick.Agent("a") }
        assertEquals(-0.6f, robot.center.x, 0.001f)
        assertEquals(-5.4f, robot.center.z, 0.001f)
    }

    private fun agent(activity: String = "idle", location: String = "station") =
        SpaceSceneBuilder.build(Snapshot(agents = listOf(Agent("a", "A", activity = activity, location = location, stationId = "st-codex"))), now = 0).agent("a")!!

    @Test
    fun `el robot vuela al nucleo y vuelve, y su estado se nota`() {
        val eye = Vec3(0f, 14f, 21f)
        val brain = RobotAnimator("a")
        brain.reduced = true
        var t = 0f
        fun run(seconds: Float) = repeat((seconds * 60).toInt()) { t += 1f / 60f; brain.update(t, 1f / 60f, eye) }
        brain.setTarget(agent("working"), null)
        run(3f)
        assertEquals(5.8f, brain.pos.x, 0.05f)
        assertEquals(3.4f, brain.pos.z, 0.05f)
        assertEquals(1f, brain.scale, 0.001f)
        assertTrue("trabajando ilumina su estación", brain.stationLevel > 0.8f)
        val workingY = brain.pos.y

        brain.setTarget(agent("working", location = "core"), null)
        run(0.5f)
        assertTrue("se está desplazando", brain.moving)
        run(4f)
        assertEquals(SpaceLayout.CORE_RADIUS + 0.35f, hypot(brain.pos.x, brain.pos.z), 0.05f)

        brain.setTarget(agent("offline"), null)
        run(5f)
        assertTrue("desconectado vuelve a su estación y se hunde", brain.pos.y < workingY && hypot(brain.pos.x - 5.8f, brain.pos.z - 3.4f) < 0.05f)
        assertTrue("y casi cierra los ojos", brain.eyeOpen < 0.3f)
        assertTrue(brain.offlineAmt > 0.9f)

        brain.setTarget(agent("error"), null)
        run(3f)
        assertTrue(brain.eyeError > 0.9f)
        brain.setTarget(agent("thinking"), null)
        run(2f)
        assertTrue(brain.thinkingAmt > 0.9f)
        brain.setTarget(agent("waiting"), Vec3(-6.2f, 1.55f, -3.2f))
        run(2f)
        assertTrue(brain.waitingAmt > 0.9f)
    }

    @Test
    fun `celebrar, aparecer y retirarse`() {
        val eye = Vec3(0f, 14f, 21f)
        val brain = RobotAnimator("a")
        brain.setTarget(agent(), null)
        brain.spawn(0f)
        brain.update(0.01f, 0.01f, eye)
        assertTrue("aparece desde cero", brain.scale < 0.2f)
        var t = 0.01f
        repeat(60) { t += 1f / 60f; brain.update(t, 1f / 60f, eye) }
        assertEquals(1f, brain.scale, 0.001f)
        brain.onCelebrate(t)
        repeat(30) { t += 1f / 60f; brain.update(t, 1f / 60f, eye) }
        assertTrue("ojos felices", brain.eyeHappy > 0.9f)
        assertTrue("y la marca de hecho", brain.checkAmt > 0.9f)
        brain.leave(t)
        repeat(60) { t += 1f / 60f; brain.update(t, 1f / 60f, eye) }
        assertTrue(brain.scale < 0.01f)
        assertTrue(brain.gone(t))
    }

    @Test
    fun `los cuerpos de los robots tienen normales unitarias hacia fuera`() {
        for (body in RobotBody.entries) {
            val spec = BodySpec.of(body)
            val mesh = RobotGeometry.body(spec)
            assertTrue(mesh.vertexCount < 65_535)
            var frontZ = -1f
            for (v in 0 until mesh.vertexCount) {
                val o = v * mesh.stride
                val x = mesh.vertices[o]; val y = mesh.vertices[o + 1]; val z = mesh.vertices[o + 2]
                val nx = mesh.vertices[o + 3]; val ny = mesh.vertices[o + 4]; val nz = mesh.vertices[o + 5]
                assertEquals("normal unitaria en $body", 1f, sqrt(nx * nx + ny * ny + nz * nz), 0.01f)
                assertTrue("normal hacia fuera en $body", nx * x + ny * y + nz * z > -1e-4f)
                if (z > frontZ) frontZ = z
            }
            assertEquals(spec.d / 2f, frontZ, 0.03f)
        }
    }

    @Test
    fun `visor, ojos y accesorios se apoyan en la cara del robot`() {
        for (body in RobotBody.entries) {
            val spec = BodySpec.of(body)
            val glass = RobotGeometry.visorGlass(spec)
            for (v in 0 until glass.vertexCount) {
                val o = v * glass.stride
                assertTrue("el visor queda por delante del cuerpo", glass.vertices[o + 2] >= spec.frontZ(glass.vertices[o], glass.vertices[o + 1]) - 1e-3f)
            }
            for (side in intArrayOf(-1, 1)) {
                val eye = RobotGeometry.eyeMount(spec, side)
                assertEquals(side * spec.eyeSpacing, eye.x, 1e-6f)
                assertTrue(eye.z > spec.frontZ(eye.x, eye.y))
            }
        }
        val dome = BodySpec.of(RobotBody.Dome)
        assertTrue(RobotGeometry.hair(dome).vertexCount < 65_535)
        val (band, ends) = RobotGeometry.headband(dome)
        assertTrue(band.vertexCount > 0)
        assertTrue("botones a ambos lados", ends[0].x < 0f && ends[1].x > 0f)
        for (shape in EyeShape.entries) assertTrue(RobotGeometry.eyeShape(shape, 1).indices.isNotEmpty())
    }

    @Test
    fun `escenario del escritorio - ciudad, circuitos y fondo deterministas`() {
        val city = SceneGeometry.buildings(170)
        assertEquals(170, city.size)
        assertEquals(city, SceneGeometry.buildings(170))
        // La oficina y sus zonas quedan libres de edificios.
        for (b in city) assertTrue(!(kotlin.math.abs(b.x) < 13f && b.z > -10f))
        assertEquals(170 * 24, SceneGeometry.city(city).vertexCount)
        val stations = SpaceLayout.STATIONS.associate { it.id to (it.x to it.z) }
        val circuits = SceneGeometry.circuits(stations)
        assertTrue(circuits.ribbons.vertexCount in 200..65_535)
        assertEquals(circuits.pads.size, SceneGeometry.circuits(stations).pads.size)
        val globe = SceneGeometry.globe()
        assertEquals(0, globe.grid.size % 6)
        assertEquals(70 * 3, globe.nodes.size)
        assertEquals(14, SceneGeometry.coreNodes().size)
        assertEquals(5, SpaceLayout.tracePoints(5.8f, 3.4f).size)
        assertEquals(SpaceLayout.CORE_RADIUS - 0.1f, SpaceLayout.tracePoints(5.8f, 3.4f).last().withY(0f).length(), 0.001f)
        // Anillo hexagonal alineado con la plataforma: 6 lados.
        assertEquals((6 + 1) * (6 + 1), Shapes.torus(1.6f, 0.024f, 6, 6).vertexCount)
    }
}
