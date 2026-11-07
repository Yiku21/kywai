package com.aicowork.remote.ui.space.gl

import com.aicowork.remote.i18n.t

import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.util.Log
import com.aicowork.remote.ui.space.SpaceGrade
import com.aicowork.remote.ui.space.Accessory
import com.aicowork.remote.ui.space.AgentVisual
import com.aicowork.remote.ui.space.GlassRegion
import com.aicowork.remote.ui.space.M4
import com.aicowork.remote.ui.space.OrbitCamera
import com.aicowork.remote.ui.space.RobotAnimator
import com.aicowork.remote.ui.space.RobotLogo
import com.aicowork.remote.ui.space.SceneAgent
import com.aicowork.remote.ui.space.SceneStation
import com.aicowork.remote.ui.space.SpaceColors
import com.aicowork.remote.ui.space.SpaceLayout
import com.aicowork.remote.ui.space.SpaceScene
import com.aicowork.remote.ui.space.SpaceZone
import com.aicowork.remote.ui.space.Vec3
import com.aicowork.remote.ui.space.WorldController
import com.aicowork.remote.ui.space.WorldSim
import com.aicowork.remote.ui.space.hash01
import com.aicowork.remote.ui.space.yawTo
import java.nio.FloatBuffer
import java.util.IdentityHashMap
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Dibuja el espacio digital del escritorio con OpenGL ES (3 si lo hay, si no 2): suelo con rejilla, ciudad, circuitos,
 * globo del fondo, núcleo de cristal, estaciones hexagonales con consolas holográficas, zonas, robots animados según
 * su estado real, transferencias, etiquetas y viñeta; luego el posprocesado ([PostFx]) pone el grado de color y el
 * cristal esmerilado bajo los paneles de la interfaz.
 *
 * Es uno por [WorldController] y todo lo que está vivo (robots, paquetes, reloj, encuadre) está en su [WorldSim]: si
 * la vista o el contexto de OpenGL se recrean, aquí solo se rehacen los recursos de la GPU. Recibe la escena ya
 * calculada ([scene]) desde la interfaz; lo que cambia por fotograma ocurre en el hilo de OpenGL.
 */
internal class SpaceRenderer(
    private val controller: WorldController,
    density: Float,
    private val lowEnd: Boolean,
) : GLSurfaceView.Renderer {

    @Volatile var scene: SpaceScene = SpaceScene.Empty
    @Volatile var selectedId: String? = null
    @Volatile var selectedStation: String? = null
    /** Densidad de la pantalla (px por dp): si cambia (otra pantalla), las etiquetas se redibujan. */
    @Volatile var density: Float = density
    /** Se llama en el hilo de OpenGL si algo falla, para que la interfaz muestre la alternativa. */
    @Volatile var onError: ((Throwable) -> Unit)? = null

    private val camera: OrbitCamera get() = controller.camera
    private val sim: WorldSim get() = controller.world

    /** Hilo de OpenGL de la vista actual: si dos vistas comparten un instante el renderizador, solo dibuja la última. */
    @Volatile private var glThread: Thread? = null
    private val lock = Any()

    // ---- Recursos de la GPU (se rehacen con cada contexto nuevo) ----
    private lateinit var lit: GlProgram
    private lateinit var basic: GlProgram
    private lateinit var holo: GlProgram
    private lateinit var panel: GlProgram
    private lateinit var floorProg: GlProgram
    private lateinit var cityProg: GlProgram
    private lateinit var circuitProg: GlProgram
    private lateinit var traceProg: GlProgram
    private lateinit var arcProg: GlProgram
    private lateinit var shellProg: GlProgram
    private lateinit var particleProg: GlProgram
    private lateinit var backdropProg: GlProgram
    private lateinit var screenProg: GlProgram
    private var hasDerivatives = false
    private var es3 = false
    private var gpuReady = false
    private val meshes = HashMap<String, GpuMesh>()
    private val textures = HashMap<String, Int>()
    private var cityMesh: GpuMesh? = null
    private var beaconViolet: GpuMesh? = null
    private var beaconBlue: GpuMesh? = null
    private lateinit var circuitMesh: GpuMesh
    private lateinit var padMesh: GpuMesh
    private var particleMesh: GpuMesh? = null
    private lateinit var globeGrid: GpuMesh
    private lateinit var globeRoutes: GpuMesh
    private lateinit var globeNodes: GpuMesh
    private lateinit var coreWire: GpuMesh
    private lateinit var slabEdges: GpuMesh
    private val traces = HashMap<String, Pair<GpuMesh, Float>>()
    private val headbands = HashMap<String, Pair<GpuMesh, List<Vec3>>>()
    private val arcMeshes = IdentityHashMap<WorldSim.Packet, GpuMesh>()
    private var fragments = emptyList<SceneGeometry.Fragment>()
    private var builtQuality: SpaceQuality? = null
    private val coreNodes = SceneGeometry.coreNodes()
    private var labels: LabelTextures? = null
    private var labelDensity = 0f
    private var zoneKey = ""
    private val post = PostFx()

    // ---- Matrices y cámara ----
    private val view = FloatArray(16)
    private val proj = FloatArray(16)
    private val vp = FloatArray(16)
    private val camWorld = FloatArray(16)
    private val xf = Xform()
    private val screenBuffer: FloatBuffer = floatBuffer(16)
    private var width = 1
    private var height = 1
    private var lastNanos = 0L
    private var failed = false
    private var eye = Vec3.Zero
    private var fogNear = 28f
    private var fogFar = 62f
    private var current: GlProgram? = null
    private val prepared = HashSet<GlProgram>()
    private val lightPos = FloatArray(32)
    private val lightColor = FloatArray(24)
    private var lightCount = 0
    private var quality = SpaceQuality.Normal
    private var ambient = 1f
    private var reduced = false

    // =====================================================================================================
    // Ciclo de vida
    // =====================================================================================================

    private var programsBuilt = false
    private var grading: SpaceGrade? = null
    /** Color de fondo con el tema. */
    private var background = SpaceColors.BACKGROUND
    /** 1 mientras se dibuja un robot: conserva sus colores aunque el tema cambie los demás. */
    private var keep = 0f

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?): Unit = synchronized(lock) {
        programsBuilt = false
        glThread = Thread.currentThread()
        failed = false
        gpuReady = false
        guard {
            // Contexto nuevo: lo de la GPU anterior ya no existe (no se borra). El estado del mundo sigue intacto.
            meshes.clear()
            textures.clear()
            traces.clear()
            headbands.clear()
            arcMeshes.clear()
            cityMesh = null; beaconViolet = null; beaconBlue = null; particleMesh = null
            builtQuality = null
            labels?.invalidate()
            labels = null
            zoneKey = ""
            current = null
            prepared.clear()

            val version = GLES20.glGetString(GLES20.GL_VERSION).orEmpty()
            es3 = Regex("OpenGL ES (\\d+)").find(version)?.groupValues?.get(1)?.toIntOrNull()?.let { it >= 3 } == true
            GLES20.glDepthFunc(GLES20.GL_LEQUAL)
            GLES20.glDisable(GLES20.GL_CULL_FACE)
            hasDerivatives = GLES20.glGetString(GLES20.GL_EXTENSIONS)?.contains("GL_OES_standard_derivatives") == true
            buildPrograms(SpaceGrade.of(controller.theme))
            buildMeshes()
            buildTextures()
            post.init(es3)
            lastNanos = 0L
            gpuReady = true
            Log.i(TAG, "Contexto OpenGL nuevo ($version): recursos de la GPU rehechos; el mundo sigue en t=${"%.2f".format(sim.time)} s con ${sim.brains.size} robots")
        }
    }

    /** Los programas de la GPU, con los colores del tema (cambiar de tema los vuelve a compilar; es un momento). */
    private fun buildPrograms(grade: SpaceGrade?) {
        if (programsBuilt) {
            listOf(lit, basic, holo, panel, floorProg, cityProg, circuitProg, traceProg, arcProg, shellProg, particleProg, backdropProg, screenProg)
                .forEach { GLES20.glDeleteProgram(it.id) }
        }
        val deriv = if (hasDerivatives) Shaders.DERIV_EXT else Shaders.DERIV_FALLBACK
        fun fs(src: String) = Shaders.themed(src, grade)
        lit = GlProgram(Shaders.LIT_VS, fs(Shaders.LIT_FS))
        basic = GlProgram(Shaders.BASIC_VS, fs(Shaders.BASIC_FS))
        holo = GlProgram(Shaders.UV_VS, fs(Shaders.HOLO_FS))
        panel = GlProgram(Shaders.UV_VS, fs(Shaders.PANEL_FS))
        floorProg = GlProgram(Shaders.WORLD_VS, deriv + fs(Shaders.FLOOR_FS))
        cityProg = GlProgram(Shaders.CITY_VS, deriv + fs(Shaders.CITY_FS))
        circuitProg = GlProgram(Shaders.CIRCUIT_VS, fs(Shaders.CIRCUIT_FS))
        traceProg = GlProgram(Shaders.UV_VS, fs(Shaders.TRACE_FS))
        arcProg = GlProgram(Shaders.UV_VS, fs(Shaders.ARC_FS))
        shellProg = GlProgram(Shaders.SHELL_VS, fs(Shaders.SHELL_FS))
        particleProg = GlProgram(Shaders.PARTICLE_VS, fs(Shaders.PARTICLE_FS))
        backdropProg = GlProgram(Shaders.BACKDROP_VS, fs(Shaders.BACKDROP_FS))
        screenProg = GlProgram(Shaders.SCREEN_VS, Shaders.SCREEN_FS)
        programsBuilt = true
        grading = grade
        background = grade?.apply(SpaceColors.BACKGROUND) ?: SpaceColors.BACKGROUND
        current = null
        prepared.clear()
    }

    override fun onSurfaceChanged(gl: GL10?, w: Int, h: Int): Unit = synchronized(lock) {
        if (Thread.currentThread() !== glThread) return@synchronized
        width = w.coerceAtLeast(1)
        height = h.coerceAtLeast(1)
        GLES20.glViewport(0, 0, width, height)
        Log.i(TAG, "Superficie de ${width}×$height (t=${"%.2f".format(sim.time)} s, ${sim.brains.size} robots)")
    }

    override fun onDrawFrame(gl: GL10?): Unit = synchronized(lock) {
        if (failed || !gpuReady || Thread.currentThread() !== glThread) {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
            GLES20.glClearColor(red(background), green(background), blue(background), 1f)
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
            return@synchronized
        }
        guard { frame() }
    }

    private inline fun guard(block: () -> Unit) {
        try {
            block()
        } catch (t: Throwable) {
            failed = true
            Log.e(TAG, "El mundo 3D ha fallado", t)
            onError?.invoke(t)
        }
    }

    private fun mesh(key: String, make: () -> MeshData): GpuMesh = meshes.getOrPut(key) { GpuMesh(make()) }

    private fun buildMeshes() {
        val stationSpots = SpaceLayout.STATIONS.associate { it.id to (it.x to it.z) }
        val circuits = SceneGeometry.circuits(stationSpots)
        circuitMesh = GpuMesh(circuits.ribbons)
        padMesh = GpuMesh(SceneGeometry.pads(circuits.pads))
        val globe = SceneGeometry.globe()
        globeGrid = gpuLines(globe.grid)
        globeRoutes = gpuLines(globe.routes)
        globeNodes = GpuMesh(MeshData(globe.nodes, ShortArray(0), listOf("aPos" to 3)), GLES20.GL_POINTS)
        coreWire = gpuLines(SceneGeometry.coreWire(SceneGeometry.CORE_R * 1.004f))
        slabEdges = gpuLines(Shapes.boxEdges(0.95f, 0.2f, 0.75f))
    }

    /** Lo que depende de la calidad (ciudad, partículas, fragmentos): se rehace al cambiarla, sin tocar la escena. */
    private fun ensureQuality(q: SpaceQuality) {
        quality = q
        if (builtQuality == q) return
        cityMesh?.release(); beaconViolet?.release(); beaconBlue?.release(); particleMesh?.release()
        val buildings = SceneGeometry.buildings(q.structures)
        cityMesh = GpuMesh(SceneGeometry.city(buildings))
        val (violet, blue) = SceneGeometry.beacons(buildings)
        beaconViolet = GpuMesh(violet)
        beaconBlue = GpuMesh(blue)
        particleMesh = GpuMesh(SceneGeometry.particles(q.particles), GLES20.GL_POINTS)
        fragments = SceneGeometry.fragments(q.fragments)
        builtQuality = q
    }

    private fun buildTextures() {
        textures["glow"] = upload(SceneTextures.glow())
        textures["check"] = upload(SceneTextures.check())
        textures["doc"] = upload(SceneTextures.document(), mipmaps = true)
        textures["wallL"] = upload(SceneTextures.wall(listOf(t("IDEAS"), t("PERSONAS"), t("PROYECTOS"), t("RESULTADOS")), alignRight = false), mipmaps = true)
        textures["wallR"] = upload(SceneTextures.wall(listOf(t("UN MUNDO"), t("DE IA"), t("TRABAJANDO"), t("JUNTOS")), alignRight = true), mipmaps = true)
        textures["tasks"] = upload(SceneTextures.tasks(), mipmaps = true)
        textures["sheet"] = upload(SceneTextures.folderSheet(), mipmaps = true)
        textures["tools"] = upload(SceneTextures.titleOnly(t("Herramientas")), mipmaps = true)
        SceneTextures.Tool.entries.forEach { textures["tool:${it.name}"] = upload(SceneTextures.toolIcon(it), mipmaps = true) }
    }

    private fun logoTexture(logo: RobotLogo): Int {
        if (logo == RobotLogo.None) return 0
        return textures.getOrPut("logo:${logo.name}") { SceneTextures.logo(logo)?.let { upload(it, mipmaps = true) } ?: 0 }
    }

    /** Paneles de archivos y memoria: se redibujan cuando cambian sus cifras. */
    private fun refreshZoneTextures(scene: SpaceScene) {
        val z = scene.zones
        val key = "${z.tasks}|${z.results}|${z.decisions}|${z.preferences}|${z.facts}|${z.pending}"
        if (key == zoneKey) return
        zoneKey = key
        textures.remove("files")?.let { GLES20.glDeleteTextures(1, intArrayOf(it), 0) }
        textures.remove("memory")?.let { GLES20.glDeleteTextures(1, intArrayOf(it), 0) }
        textures["files"] = upload(SceneTextures.iconTitle(t("Archivos"), listOf(t("Tareas · {n}", "n" to z.tasks), t("Resultados · {n}", "n" to z.results), t("Carpeta del proyecto"), t("En el ordenador")), SceneTextures.ZoneIcon.Folder), mipmaps = true)
        textures["memory"] = upload(SceneTextures.iconTitle(t("Memoria"), listOf(t("Decisiones · {n}", "n" to z.decisions), t("Preferencias · {n}", "n" to z.preferences), t("Hechos · {n}", "n" to z.facts), t("Pendientes · {n}", "n" to z.pending)), SceneTextures.ZoneIcon.Brain), mipmaps = true)
    }

    private fun labelTextures(): LabelTextures {
        val d = density
        val current = labels
        if (current != null && labelDensity == d) return current
        current?.release()
        return LabelTextures(d).also { labels = it; labelDensity = d }
    }

    // =====================================================================================================
    // Fotograma
    // =====================================================================================================

    private fun frame() {
        val settings = controller.settings
        val plan = RenderPlan.of(settings, controller.covered, lowEnd)
        ensureQuality(plan.quality)
        val now = System.nanoTime()
        // Paso del reloj: el real, sin saltos grandes (a 5 fps con el mundo tapado sigue avanzando casi al ritmo).
        val dt = if (lastNanos == 0L) 1f / 60f else ((now - lastNanos) / 1e9f).coerceIn(0f, 0.25f)
        lastNanos = now
        val scene = scene
        sim.apply(settings)
        ambient = sim.ambient
        reduced = sim.reducedMotion

        // Encuadre en el hueco libre de controles y cámara.
        val framing = sim.frame(width.toFloat(), height.toFloat(), controller.insets, dt, controller.fitOverview)
        controller.lens = WorldController.Lens(width.toFloat(), height.toFloat(), framing)
        sim.reframe(camera, framing)
        camera.update(dt, reduced)
        val pose = camera.pose
        eye = pose.eye()
        M4.lookAt(view, eye, pose.target)
        OrbitCamera.projection(proj, width.toFloat(), height.toFloat(), framing)
        M4.multiply(vp, proj, view)
        M4.invertRigid(camWorld, view)
        // La niebla del escritorio (28‥62 m) está pensada para su encuadre; en el móvil la cámara se aleja más.
        val extra = max(0f, pose.distance - 26f)
        fogNear = 28f + extra
        fogFar = 62f + extra

        // Estado vivo: escena, eventos reales (los recientes) y animación.
        sim.step(dt, scene, eye, settings) { handle -> controller.drainFresh(now, MAX_EVENT_AGE_NANOS, handle) }
        val t = sim.time
        refreshZoneTextures(scene)
        labelTextures().retain(sim.brains.keys)
        releaseFinishedArcs()
        collectLights(scene)

        // Destino: fuera de pantalla (grado de color y cristal) o, si no se puede, la pantalla directamente.
        val offscreen = post.begin(width, height, plan.msaa)
        if (!offscreen) {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
            GLES20.glViewport(0, 0, width, height)
        }
        drawScene(scene, t)

        if (offscreen) {
            post.resolve()
            val regions: List<GlassRegion> = if (plan.glass) GlassMask.visible(controller.glass.snapshot(), width.toFloat(), height.toFloat()) else emptyList()
            val blur = if (regions.isNotEmpty()) post.blur(GlassMask.BLUR_DP * density) else 0
            post.composite(regions, blur, edgePx = 1.5f)
        }
        controller.glassActive = offscreen && plan.glass
    }

    private fun drawScene(scene: SpaceScene, t: Float) {
        val grade = SpaceGrade.of(controller.theme)
        if (grade !== grading) buildPrograms(grade)
        prepared.clear()
        current = null
        GLES20.glClearColor(red(background), green(background), blue(background), 1f)
        GLES20.glDepthMask(true)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
        GLES20.glEnable(GLES20.GL_DEPTH_TEST)

        // 1. Suelo (sin escribir profundidad: el globo del fondo puede verse más allá de la oficina).
        GLES20.glDisable(GLES20.GL_BLEND)
        GLES20.glDepthMask(false)
        drawFloor(t)
        GLES20.glDepthMask(true)

        // 2. Opacos.
        drawCity(t)
        drawCoreSolid(t)
        for (st in scene.stations) drawStationSolid(st, t)
        drawZonesSolid(t)
        keep = 1f
        for (b in sim.brains.values) drawRobot(b, t)
        keep = 0f

        // 3. Transparentes y aditivos (sin escribir profundidad).
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glDepthMask(false)
        additive()
        drawBackdrop(t)
        drawCircuits(t)
        drawTraces(scene, t)
        for (st in scene.stations) drawStationGlow(st, t)
        drawCoreGlow(t)
        drawZonesGlow(t)
        drawWalls(t)
        drawFragments(t)
        keep = 1f
        for (b in sim.brains.values) drawRobotGlow(b, t)
        keep = 0f
        drawPackets(t)
        drawParticles(t)

        // 4. Viñeta y etiquetas (en el fotograma: bajo un cristal se ven difuminadas, como todo lo demás).
        GLES20.glDisable(GLES20.GL_DEPTH_TEST)
        drawVignette()
        drawLabels(scene, t)
        GLES20.glDepthMask(true)
        GLES20.glEnable(GLES20.GL_DEPTH_TEST)
    }

    private fun normalBlend() = GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
    private fun additive() = GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE)

    /** Los arcos de los paquetes que ya no están se borran de la GPU. */
    private fun releaseFinishedArcs() {
        if (arcMeshes.isEmpty()) return
        val alive = sim.packets
        val it = arcMeshes.entries.iterator()
        while (it.hasNext()) {
            val (packet, mesh) = it.next()
            if (alive.none { p -> p === packet }) {
                mesh.release()
                it.remove()
            }
        }
    }

    // =====================================================================================================
    // Estaciones, núcleo y luces
    // =====================================================================================================

    private fun fx(id: String) = sim.stationFx(id)

    private fun stationHover(st: SceneStation): Float =
        if (selectedStation == st.id || (st.occupantId != null && st.occupantId == selectedId)) 1f else 0f

    private fun stationAccent(st: SceneStation) = st.accent?.let { Lin.of(it) } ?: IDLE_ACCENT

    private fun stationLevitation(st: SceneStation, t: Float) =
        if (ambient < 0.5f) 0f else sin(t * 0.55f + hash01(st.id) * 6.28f) * 0.028f

    private fun stationError(st: SceneStation) = st.occupantId?.let(sim.brains::get)?.visual == AgentVisual.Error

    private fun pulseBoost(pulses: Array<WorldSim.Pulse>, life: Float) = sim.pulseBoost(pulses, life)

    /** Luces puntuales: una por estación ocupada (si la calidad lo permite) y la del núcleo. */
    private fun collectLights(scene: SpaceScene) {
        val t = sim.time
        lightCount = 0
        fun add(x: Float, y: Float, z: Float, range: Float, c: Lin) {
            if (lightCount >= 8) return
            lightPos[lightCount * 4] = x; lightPos[lightCount * 4 + 1] = y; lightPos[lightCount * 4 + 2] = z; lightPos[lightCount * 4 + 3] = range
            lightColor[lightCount * 3] = c.r; lightColor[lightCount * 3 + 1] = c.g; lightColor[lightCount * 3 + 2] = c.b
            lightCount++
        }
        val breathe = 0.5f + 0.5f * sin(t * 0.9f)
        val amb = coreAmb()
        add(0f, 2.2f, 0f, 10f, BLUE * (1.8f + breathe * 0.5f * amb + pulseBoost(sim.corePulses, 1.25f) * 2.6f))
        if (!quality.stationLights) return
        for (st in scene.stations) {
            val f = fx(st.id)
            val boost = pulseBoost(f.pulses, 0.95f)
            val c = if (stationError(st)) ERR else stationAccent(st)
            add(st.x, SpaceLayout.PLATFORM_Y + stationLevitation(st, t) + 1.4f, st.z + 0.3f, 5.5f, c * (0.15f + f.level * 1.8f + boost * 1.6f))
        }
    }

    private fun coreAmb() = if (ambient > 0.5f) 1f else 0.25f

    // =====================================================================================================
    // Programas y materiales
    // =====================================================================================================

    private fun use(p: GlProgram): GlProgram {
        if (current !== p) {
            p.use()
            current = p
        }
        if (prepared.add(p)) {
            p.setMatrix("uVP", vp)
            p.set3("uCam", eye.x, eye.y, eye.z)
            when (p) {
                lit -> {
                    p.setLin("uFogColor", FOG)
                    p.set2("uFog", fogNear, fogFar)
                    GLES20.glUniform4fv(p.uniform("uPL"), 8, lightPos, 0)
                    GLES20.glUniform3fv(p.uniform("uPLc"), 8, lightColor, 0)
                    p.set1i("uPLn", lightCount)
                    p.set1("uDesat", if (scene.stale) 0.6f else 0f)
                }
                basic -> {
                    p.setLin("uFogColor", FOG)
                    p.set2("uFog", fogNear, fogFar)
                    p.set1i("uTex", 0)
                }
            }
        }
        return p
    }

    private class LitMat(
        val color: Lin, val metal: Float = 0f, val rough: Float = 0.5f, val emissive: Lin = Lin.BLACK,
        val clear: Float = 0f, val sheen: Float = 0f, val env: Float = 1f, val opacity: Float = 1f,
    )

    private fun drawLit(mesh: GpuMesh, m: FloatArray, mat: LitMat, emissive: Lin = mat.emissive) {
        val p = use(lit)
        p.setMatrix("uModel", m)
        p.setLin("uColor", mat.color)
        p.setLin("uEmissive", emissive)
        p.set1("uMetal", mat.metal)
        p.set1("uRough", mat.rough)
        p.set1("uClear", mat.clear)
        p.set1("uSheen", mat.sheen)
        p.set1("uEnvI", mat.env)
        p.set1("uOpacity", mat.opacity)
        p.set1("uKeep", keep)
        mesh.draw(p)
    }

    private fun drawBasic(mesh: GpuMesh, m: FloatArray, color: Lin, opacity: Float = 1f, texture: Int = 0, fog: Boolean = true, mode: Int = -1) {
        val p = use(basic)
        p.setMatrix("uModel", m)
        p.setLin("uColor", color)
        p.set1("uOpacity", opacity)
        p.set1("uFogOn", if (fog) 1f else 0f)
        p.set1("uKeep", keep)
        if (texture != 0) {
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture)
            p.set1("uUseTex", 1f)
        } else p.set1("uUseTex", 0f)
        if (mode >= 0) mesh.draw(p, mode) else mesh.draw(p)
    }

    // =====================================================================================================
    // Escenario
    // =====================================================================================================

    private fun drawFloor(t: Float) {
        val p = use(floorProg)
        xf.identity().translate(0f, -0.02f, 0f)
        p.setMatrix("uModel", xf.m)
        p.set1("uTime", t)
        p.set1("uAmbient", ambient)
        p.setLin("uFog", FOG)
        p.set1("uPx", 2f * kotlin.math.tan(OrbitCamera.FOV_Y / 2f) / height)
        mesh("floor") { Shapes.floorPlane(160f, 160f) }.draw(p)
    }

    private fun drawCity(t: Float) {
        val p = use(cityProg)
        p.set1("uTime", t)
        p.set1("uAmbient", ambient)
        p.setLin("uFog", FOG)
        p.set1("uFogNear", fogNear)
        p.set1("uFogFar", fogFar + 8f)
        p.set1("uPx", 2f * kotlin.math.tan(OrbitCamera.FOV_Y / 2f) / height)
        cityMesh?.draw(p)
        xf.identity()
        beaconViolet?.let { drawBasic(it, xf.m, Lin.of(0xFF7C5CFF.toInt()) * 1.15f) }
        beaconBlue?.let { drawBasic(it, xf.m, Lin.of(0xFF38B6FF.toInt()) * 1.15f) }
    }

    private fun drawBackdrop(t: Float) {
        val p = use(backdropProg)
        p.set1("uSize", 0f)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, textures.getValue("glow"))
        p.set1i("uMap", 0)
        val plane = mesh("plane1") { Shapes.plane(1f, 1f) }
        fun glow(y: Float, z: Float, sx: Float, sy: Float, color: Lin, opacity: Float) {
            xf.set(camWorld).translate(0f, 0f, -110f).translate(0f, y, z).scale(sx, sy, 1f)
            p.setMatrix("uModel", xf.m)
            p.setLin("uColor", color)
            p.set1("uOpacity", opacity)
            p.set1("uKind", 2f)
            plane.draw(p)
        }
        glow(21f, -SceneGeometry.GLOBE_RADIUS - 6f, 190f, 46f, VIOLET.lerp(BLUE, 0.5f), 0.42f)
        glow(GLOBE_Y + 4f, -SceneGeometry.GLOBE_RADIUS, 70f, 70f, BLUE, 0.3f)
        xf.set(camWorld).translate(0f, 0f, -110f).translate(0f, GLOBE_Y, 0f).rotX(0.35f).rotY(sim.globeRot).rotZ(0.12f)
        p.setMatrix("uModel", xf.m)
        p.set1("uKind", 0f)
        p.setLin("uColor", BLUE * 0.8f)
        p.set1("uOpacity", 0.6f)
        globeGrid.draw(p)
        p.setLin("uColor", Lin.of(0xFF7FB0FF.toInt()))
        p.set1("uOpacity", 0.45f + 0.15f * sin(t * 0.6f) * ambient)
        globeRoutes.draw(p)
        p.set1("uKind", 1f)
        p.set1("uSize", 2.4f * height / 900f)
        p.setLin("uColor", Lin.of(0xFFBCD2FF.toInt()))
        p.set1("uOpacity", 0.8f)
        globeNodes.draw(p)
    }

    private fun drawCircuits(t: Float) {
        val p = use(circuitProg)
        p.set1("uTime", t)
        p.set1("uAmbient", ambient)
        p.setLin("uBlue", BLUE)
        p.setLin("uViolet", VIOLET * 0.9f)
        circuitMesh.draw(p)
        xf.identity()
        drawBasic(padMesh, xf.m, Lin.of(0xFF7DA4FF.toInt()), 0.7f, fog = false)
    }

    private fun drawTraces(scene: SpaceScene, t: Float) {
        val p = use(traceProg)
        xf.identity()
        p.setMatrix("uModel", xf.m)
        p.set1("uTime", t)
        p.set1("uAmbient", ambient)
        p.setLin("uBase", TRACE_BLUE)
        for (st in scene.stations) {
            val (m, len) = traces.getOrPut(st.id) { SceneGeometry.stationTrace(st.x, st.z).let { GpuMesh(it.first) to it.second } }
            val f = fx(st.id)
            p.setLin("uActiveColor", Lin.of(f.traceColor))
            p.set1("uActive", f.traceActive)
            p.set1("uPhase", hash01(st.id))
            p.set1("uLen", len)
            p.set1("uDir", f.traceDir)
            m.draw(p)
        }
    }

    private fun drawWalls(t: Float) {
        val plane = mesh("wall") { Shapes.plane(2.6f, 3.6f) }
        xf.identity().translate(-10.6f, 2.6f, -10.4f).rotY(0.45f)
        drawPanel(plane, xf.m, textures.getValue("wallL"), Lin.of(0xFF5B8CFF.toInt()), 0.1f, 0.68f, t)
        xf.identity().translate(10.8f, 2.6f, -10.6f).rotY(-0.45f)
        drawPanel(plane, xf.m, textures.getValue("wallR"), Lin.of(0xFF5B8CFF.toInt()), 0.5f, 0.68f, t)
    }

    private fun drawPanel(m: GpuMesh, model: FloatArray, texture: Int, color: Lin, seed: Float, opacity: Float, t: Float) {
        val p = use(panel)
        p.setMatrix("uModel", model)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture)
        p.set1i("uMap", 0)
        p.setLin("uColor", color)
        p.set1("uTime", t)
        p.set1("uSeed", seed)
        p.set1("uAmbient", ambient)
        p.set1("uOpacity", opacity)
        m.draw(p)
    }

    private fun drawFragments(t: Float) {
        normalBlend()
        val k = if (ambient < 0.5f) 0.1f else 1f
        val oct = mesh("frag") { Shapes.octahedron(0.13f) }
        for (f in fragments) {
            xf.identity().translate(f.x, f.y + sin(t * f.sp * k + f.ph) * 0.3f, f.z)
                .rotX(t * f.rs * k + f.ph).rotY(t * f.rs * 0.7f * k).scale(f.s, f.s, f.s)
            drawLit(oct, xf.m, FRAGMENT_MAT)
        }
        additive()
    }

    private fun drawParticles(t: Float) {
        val mesh = particleMesh ?: return
        val p = use(particleProg)
        p.set1("uTime", t)
        p.set1("uPixelRatio", height / 880f)
        p.set1("uMotion", if (ambient < 0.5f) 0.12f else 1f)
        p.setLin("uColor", Lin.of(0xFF9FB4FF.toInt()) * 0.9f)
        mesh.draw(p)
    }

    private fun drawVignette() {
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_ZERO, GLES20.GL_SRC_COLOR)
        val p = use(screenProg)
        p.set1("uMode", 2f)
        p.set2("uVignette", 0.28f, 0.55f)
        screenQuad(p, -1f, -1f, 1f, 1f, 0f, 1f, 1f, 0f)
    }

    // =====================================================================================================
    // Núcleo
    // =====================================================================================================

    private fun coreBoost() = pulseBoost(sim.corePulses, 1.25f)

    private fun drawCoreSolid(t: Float) {
        val amb = coreAmb()
        val breathe = 0.5f + 0.5f * sin(t * 0.9f)
        val boost = coreBoost()
        xf.identity().translate(0f, 0.13f, 0f)
        drawLit(mesh("coreBase") { Shapes.cylinder(2.35f, 2.55f, 0.26f, 6) }, xf.m, GRAPHITE)
        xf.identity().translate(0f, 0.27f, 0f)
        drawLit(mesh("corePlate") { Shapes.cylinder(2.05f, 2.05f, 0.04f, 48) }, xf.m, CORE_PLATE, BLUE * 0.08f)
        xf.identity().translate(0f, 0.29f, 0f)
        drawBasic(mesh("coreRim") { Shapes.torus(2.05f, 0.035f, 8, 96) }, xf.m, BLUE * (0.65f + breathe * 0.3f * amb + boost * 1f))
        val sphereY = CORE_Y + sin(t * 0.7f) * 0.05f * amb
        val node = mesh("coreNode") { Shapes.sphere(0.045f, 10, 8) }
        for (n in coreNodes) {
            xf.identity().translate(0f, sphereY, 0f).translate(n.x, n.y, n.z)
            drawBasic(node, xf.m, Lin.of(0xFFCFE0FF.toInt()) * 1.25f)
        }
    }

    private fun drawCoreGlow(t: Float) {
        val amb = coreAmb()
        val breathe = 0.5f + 0.5f * sin(t * 0.9f)
        val boost = coreBoost()
        val glowTex = textures.getValue("glow")
        val floor1 = mesh("floor1") { Shapes.floorPlane(1f, 1f) }
        // Halo del aro (lo que en el escritorio hace el bloom, aquí más contenido).
        xf.identity().translate(0f, 0.29f, 0f)
        drawBasic(mesh("coreRimHalo") { Shapes.torus(2.05f, 0.11f, 8, 96) }, xf.m, BLUE, 0.12f + boost * 0.16f)
        xf.identity().translate(0f, 0.3f, 0f).scale(6.5f, 1f, 6.5f)
        drawBasic(floor1, xf.m, BLUE, 0.28f + breathe * 0.08f * amb + boost * 0.2f, glowTex)
        val ring = mesh("coreRing") { Shapes.ring(1.95f, 2.05f, 72) }
        for (p in sim.corePulses) {
            val k = (t - p.start) / 1.25f
            if (k !in 0f..1f) continue
            xf.identity().translate(0f, 0.31f, 0f).scale(1f + k * 0.9f, 1f, 1f + k * 0.9f)
            drawBasic(ring, xf.m, Lin.of(p.color).lerp(CYAN, 0.35f) * 1.2f, (1f - k) * (1f - k) * 0.7f * p.strength)
        }
        val sphereY = CORE_Y + sin(t * 0.7f) * 0.05f * amb
        // Documentos que orbitan dentro, mirando a la cámara.
        val card = mesh("coreCard") { Shapes.plane(0.46f, 0.58f) }
        for ((i, c) in CARDS.withIndex()) {
            val a = c[2] + sim.cardsRot
            val local = Vec3(kotlin.math.cos(a) * c[0], c[1] + sin(t * 0.8f + i * 1.7f) * 0.06f * amb, kotlin.math.sin(a) * c[0])
            val world = local + Vec3(0f, sphereY, 0f)
            val yaw = yawTo(world, eye)
            val pitch = -atan2(eye.y - world.y, sqrt((eye.x - world.x).pow(2) + (eye.z - world.z).pow(2)))
            xf.identity().translate(world.x, world.y, world.z).rotY(yaw).rotX(pitch).scale(c[3], c[3], c[3])
            drawBasic(card, xf.m, Lin.of(0xFFA9D4FF.toInt()) * 1.15f, 1f, textures.getValue("doc"))
        }
        // Brillo interior.
        billboard(Vec3(0f, sphereY, 0f), 2.6f, 2.6f, Lin.of(0xFF3D6BFF.toInt()), 0.24f + breathe * 0.08f * amb + boost * 0.3f, glowTex)
        // Esfera de cristal y su rejilla.
        val sp = use(shellProg)
        xf.identity().translate(0f, sphereY, 0f)
        sp.setMatrix("uModel", xf.m)
        sp.setLin("uColor", Lin.of(0xFF5F9DFF.toInt()))
        sp.set1("uIntensity", 0.78f + breathe * 0.16f * amb + boost * 0.7f)
        sp.set1("uTime", t)
        mesh("shell") { Shapes.sphere(SceneGeometry.CORE_R, 48, 32) }.draw(sp)
        xf.identity().translate(0f, sphereY, 0f).rotY(sim.wireRot)
        drawBasic(coreWire, xf.m, Lin.of(0xFF6FA8FF.toInt()), 0.24f + boost * 0.26f)
        xf.identity().translate(0f, sphereY, 0f).rotX(0.42f).rotY(sim.orbitRot).rotZ(0.18f)
        drawBasic(mesh("orbit") { Shapes.torus(SceneGeometry.CORE_R + 0.55f, 0.022f, 8, 160) }, xf.m, CYAN * 1.05f, 0.72f)
        xf.identity().translate(0f, sphereY, 0f).rotX(PIf / 2f - 0.2f).rotY(0.3f).rotX(-PIf / 2f)
        drawBasic(mesh("orbit2") { Shapes.torus(SceneGeometry.CORE_R + 0.3f, 0.012f, 6, 140) }, xf.m, BLUE, 0.5f)
    }

    // =====================================================================================================
    // Estaciones
    // =====================================================================================================

    private fun stationBase(st: SceneStation, t: Float): Xform = xf.identity().translate(st.x, SpaceLayout.PLATFORM_Y + stationLevitation(st, t), st.z)

    private fun screenYaw(x: Float, z: Float, k: Float) = atan2(-x, -z + k)

    private fun drawStationSolid(st: SceneStation, t: Float) {
        val side = st.consoleSide.toFloat()
        stationBase(st, t)
        drawLit(mesh("hexBase") { Shapes.cylinder(1.62f, 1.46f, 0.3f, 6) }, xf.m, GRAPHITE)
        stationBase(st, t).translate(0f, 0.16f, 0f)
        drawLit(mesh("hexTop") { Shapes.cylinder(1.44f, 1.44f, 0.04f, 6) }, xf.m, STATION_TOP)
        val lv = fx(st.id).level
        val hov = stationHover(st)
        val boost = pulseBoost(fx(st.id).pulses, 0.95f)
        val accent = stationAccent(st)
        var rim = TRACE_BLUE.lerp(accent, 0.85f)
        if (stationError(st)) rim = rim.lerp(ERR, 0.55f)
        stationBase(st, t).translate(0f, 0.17f, 0f)
        drawBasic(mesh("hexRim") { Shapes.torus(1.6f, 0.024f, 6, 6) }, xf.m, rim * (0.6f + lv * 1.05f + boost * 1f + hov * 0.5f))
        val px = side * 1.02f
        stationBase(st, t).translate(px, 0.4f, -0.42f).rotY(screenYaw(px, -0.42f, 0.6f))
        drawLit(mesh("pedestal") { Shapes.box(0.42f, 0.5f, 0.32f) }, xf.m, GRAPHITE)
    }

    private fun drawStationGlow(st: SceneStation, t: Float) {
        val f = fx(st.id)
        val lv = f.level
        val hov = stationHover(st)
        val boost = pulseBoost(f.pulses, 0.95f)
        val accent = stationAccent(st)
        val err = stationError(st)
        val glowTex = textures.getValue("glow")
        // Halo del borde y resplandor bajo la plataforma.
        var rim = TRACE_BLUE.lerp(accent, 0.85f)
        if (err) rim = rim.lerp(ERR, 0.55f)
        stationBase(st, t).translate(0f, 0.17f, 0f)
        drawBasic(mesh("hexRimHalo") { Shapes.torus(1.6f, 0.08f, 6, 6) }, xf.m, rim, 0.1f + lv * 0.1f + boost * 0.17f + hov * 0.08f)
        stationBase(st, t).translate(0f, -0.32f, 0f).scale(4.2f, 1f, 4.2f)
        drawBasic(mesh("floor1") { Shapes.floorPlane(1f, 1f) }, xf.m, accent, 0.13f + lv * 0.24f + boost * 0.17f, glowTex)
        normalBlend()
        stationBase(st, t).translate(0f, -0.15f, 0f)
        drawBasic(mesh("hexRimLow") { Shapes.torus(1.47f, 0.016f, 6, 6) }, xf.m, Lin.of(0xFF4F7DFF.toInt()) * 0.5f, 0.75f)
        stationBase(st, t).translate(0f, 0.185f, 0f)
        drawBasic(mesh("pad") { Shapes.torus(0.72f, 0.03f, 8, 48) }, xf.m, (if (err) ERR else accent) * (0.22f + lv * 1.45f + boost * 0.85f + hov * 0.4f), 0.45f + lv * 0.45f)
        additive()
        val ring = mesh("pulseRing") { Shapes.ring(0.92f, 1f, 64) }
        for (p in f.pulses) {
            val k = (t - p.start) / 0.95f
            if (k !in 0f..1f) continue
            val s = 1.4f * (1f + k * 0.85f)
            stationBase(st, t).translate(0f, 0.2f, 0f).scale(s, 1f, s)
            drawBasic(ring, xf.m, Lin.of(p.color) * 1.3f, (1f - k) * (1f - k) * 0.75f * p.strength)
        }
        // Pantallas holográficas.
        val side = st.consoleSide.toFloat()
        val (modeA, modeB) = st.screenModes
        val phase = hash01(st.id)
        val color = accent.lerp(TRACE_BLUE, 0.35f)
        val p = use(holo)
        p.setLin("uColor", color)
        p.set1("uTime", t)
        p.set1("uActive", min(1f, lv))
        p.set1("uOpacity", 0.2f + min(1f, lv * 1.4f) * 0.7f + hov * 0.12f)
        p.set1("uAmbient", ambient)
        val ax = side * 1.02f
        stationBase(st, t).translate(ax, 1.12f, -0.42f).rotY(screenYaw(ax, -0.42f, 0.6f)).rotX(-0.08f)
        p.setMatrix("uModel", xf.m)
        p.set1("uMode", modeA.toFloat())
        p.set1("uSeed", phase)
        mesh("screenMain") { Shapes.plane(1.2f, 0.78f) }.draw(p)
        val bx = -side * 0.78f
        stationBase(st, t).translate(bx, 0.98f, -0.88f).rotY(screenYaw(bx, -0.88f, 1.2f)).rotX(-0.05f)
        p.setMatrix("uModel", xf.m)
        p.set1("uMode", modeB.toFloat())
        p.set1("uSeed", phase + 0.37f)
        mesh("screenSmall") { Shapes.plane(0.62f, 0.42f) }.draw(p)
    }

    // =====================================================================================================
    // Zonas
    // =====================================================================================================

    private fun zone(z: SpaceZone): Xform = xf.identity().translate(z.x, 0f, z.z).rotY(z.facing)

    private fun plinthSolid(base: () -> Xform, w: Float, d: Float) {
        base().translate(0f, 0.12f, 0f)
        drawLit(mesh("plinth:$w:$d") { Shapes.box(w, 0.24f, d) }, xf.m, PLINTH)
        base().translate(0f, 0.245f, d / 2f)
        drawBasic(mesh("edge:$w") { Shapes.box(w, 0.014f, 0.014f) }, xf.m, BLUE * 1.15f)
    }

    private fun plinthGlow(base: () -> Xform, w: Float, d: Float) {
        base().translate(0f, 0.02f, 0f).scale(w * 2.2f, 1f, d * 3f)
        drawBasic(mesh("floor1") { Shapes.floorPlane(1f, 1f) }, xf.m, BLUE, 0.26f, textures.getValue("glow"))
    }

    private fun toolBob(t: Float, i: Int) = if (ambient < 0.5f) 0f else sin(t * 1.1f + i * 1.3f) * 0.05f

    private fun drawZonesSolid(t: Float) {
        plinthSolid({ zone(SpaceZone.Tasks) }, 2.1f, 0.7f)
        plinthSolid({ zone(SpaceZone.Files).translate(-0.95f, 0f, 0f) }, 1.5f, 0.9f)
        plinthSolid({ zone(SpaceZone.Tools) }, 2.7f, 0.9f)
        val tile = mesh("tile") { Shapes.box(0.5f, 0.5f, 0.18f) }
        for (i in 0 until 4) {
            zone(SpaceZone.Tools).translate(-0.96f + i * 0.64f, 0.62f + toolBob(t, i), 0f)
            drawLit(tile, xf.m, TILE, BLUE * 0.1f)
        }
        plinthSolid({ zone(SpaceZone.Memory).translate(0.85f, 0f, -0.1f) }, 2.2f, 1f)
        val slab = mesh("slab") { Shapes.box(0.95f, 0.2f, 0.75f) }
        val led = mesh("led") { Shapes.box(0.18f, 0.03f, 0.01f) }
        val ledColor = CYAN * (if (ambient < 0.5f) 1.1f else 0.95f + 0.45f * (0.5f + 0.5f * sin(t * 3.1f)))
        for ((x, z, n) in listOf(Triple(-0.5f, 0f, 4), Triple(0.55f, 0.05f, 3))) for (i in 0 until n) {
            zone(SpaceZone.Memory).translate(0.85f, 0f, -0.1f).translate(x, 0.36f + i * 0.25f, z)
            GLES20.glEnable(GLES20.GL_POLYGON_OFFSET_FILL)
            GLES20.glPolygonOffset(1f, 1f)
            drawLit(slab, xf.m, SLAB, BLUE * 0.2f)
            GLES20.glDisable(GLES20.GL_POLYGON_OFFSET_FILL)
            drawBasic(slabEdges, xf.m, Lin.of(0xFF6FA0FF.toInt()) * 1.15f, mode = GLES20.GL_LINES)
            zone(SpaceZone.Memory).translate(0.85f, 0f, -0.1f).translate(x + 0.3f, 0.36f + i * 0.25f, z + 0.38f)
            drawBasic(led, xf.m, ledColor)
        }
    }

    private fun drawZonesGlow(t: Float) {
        plinthGlow({ zone(SpaceZone.Tasks) }, 2.1f, 0.7f)
        plinthGlow({ zone(SpaceZone.Files).translate(-0.95f, 0f, 0f) }, 1.5f, 0.9f)
        plinthGlow({ zone(SpaceZone.Tools) }, 2.7f, 0.9f)
        plinthGlow({ zone(SpaceZone.Memory).translate(0.85f, 0f, -0.1f) }, 2.2f, 1f)
        val sheet = mesh("sheet") { Shapes.plane(0.95f, 0.74f) }
        for (i in 0 until 5) {
            zone(SpaceZone.Files).translate(-0.95f, 0f, 0f).translate(-0.42f + i * 0.2f, 0.72f + i * 0.03f, 0.2f - i * 0.1f).rotY(0.35f)
            drawBasic(sheet, xf.m, Lin.of(0xFF6F9BFF.toInt()) * 1.1f, 0.75f, textures.getValue("sheet"), fog = false)
        }
        normalBlend()
        val icon = mesh("toolIcon") { Shapes.plane(0.4f, 0.4f) }
        SceneTextures.Tool.entries.forEachIndexed { i, tool ->
            zone(SpaceZone.Tools).translate(-0.96f + i * 0.64f, 0.62f + toolBob(t, i), 0.095f)
            drawBasic(icon, xf.m, Lin.of(TOOL_COLORS[i]) * 1.25f, 1f, textures.getValue("tool:${tool.name}"))
        }
        additive()
        zone(SpaceZone.Tasks).translate(0f, 1.52f, 0f)
        drawPanel(mesh("panelTasks") { Shapes.plane(1.95f, 2.36f) }, xf.m, textures.getValue("tasks"), CYAN, 0.2f, 0.78f, t)
        val square = mesh("panel17") { Shapes.plane(1.7f, 1.7f) }
        zone(SpaceZone.Files).translate(0.9f, 1.05f, 0.1f)
        drawPanel(square, xf.m, textures.getValue("files"), BLUE, 0.6f, 0.78f, t)
        zone(SpaceZone.Tools).translate(0f, 1.45f, 0f)
        drawPanel(mesh("panelTools") { Shapes.plane(2.3f, 0.58f) }, xf.m, textures.getValue("tools"), BLUE, 0.3f, 0.78f, t)
        zone(SpaceZone.Memory).translate(-1.05f, 1.05f, 0.25f)
        drawPanel(square, xf.m, textures.getValue("memory"), VIOLET, 0.8f, 0.78f, t)
    }

    // =====================================================================================================
    // Robots
    // =====================================================================================================

    private fun top(spec: BodySpec, accessory: Accessory) = spec.h / 2f + when (accessory) {
        Accessory.Antenna -> 0.3f
        Accessory.Ears, Accessory.Tuft -> 0.22f
        Accessory.Hair -> RobotGeometry.HAIR_T + 0.02f
        Accessory.Halo -> 0.24f
        else -> 0f
    }

    /** Raíz del robot: posición y escala del cerebro, giro (YXZ) y deformación. */
    private fun robotRoot(b: RobotAnimator): Xform {
        val s = max(0.0001f, b.scale) * SpaceLayout.ROBOT_SCALE
        val sq = b.squashY
        return xf.identity().translate(b.pos.x, b.pos.y, b.pos.z).scale(s, s, s)
            .rotY(b.yawWithSpin).rotX(b.pitch).rotZ(b.roll).scale(1f / sqrt(sq), sq, 1f / sqrt(sq))
    }

    private fun eyeTint(b: RobotAnimator, look: Int): Lin {
        var eye = Lin.of(look)
        if (b.eyeError > 0.01f) eye = eye.lerp(ERROR_EYE, b.eyeError * 0.85f)
        if (b.offlineAmt > 0.01f) eye = eye.lerp(OFF_EYE, b.offlineAmt * 0.8f)
        if (b.pausedAmt > 0.01f) eye = eye.lerp(OFF_EYE, b.pausedAmt * 0.35f)
        return eye
    }

    private fun drawRobot(b: RobotAnimator, t: Float) {
        val agent = b.agent ?: return
        if (b.scale <= 0.01f) return
        val look = agent.look
        val spec = BodySpec.of(look.body)
        val key = look.body.name
        val bodyColor = Lin.of(look.bodyColor)
        val bodyMat = LitMat(bodyColor, 0f, 0.46f, clear = 0.12f, sheen = 0.4f, env = 0.6f)
        val bodyEmissive = bodyColor * ((0.05f + b.glow * 0.45f) * (1f - b.pausedAmt * 0.4f))
        val trim = look.trimColor?.let { Lin.of(it) }
        val trimMat = trim?.let { LitMat(it, 0.7f, 0.3f, it * 0.18f, clear = 0.6f) }

        robotRoot(b)
        drawLit(mesh("body:$key") { RobotGeometry.body(spec) }, xf.m, bodyMat, bodyEmissive)
        drawLit(mesh("bezel:$key") { RobotGeometry.visorBezel(spec) }, xf.m, trimMat ?: LitMat(bodyColor * 0.45f, 0f, 0.7f))
        if (trimMat != null) drawLit(mesh("ring:$key") { RobotGeometry.baseRing(spec) }, xf.m, trimMat)
        drawLit(mesh("glass:$key") { RobotGeometry.visorGlass(spec) }, xf.m, GLASS)

        // Ojos: forma propia + arco feliz + línea (error/reposo), con fundido por escala.
        val eyeColor = eyeTint(b, look.eyeColor) * (1.1f + b.glow * 1.25f - b.restAmt * 0.4f - b.pausedAmt * 0.3f)
        val open = max(0.06f, b.eyeOpen)
        val happy = b.eyeHappy
        val flatAmt = max(b.eyeError * 0.9f, b.offlineAmt * 0.8f)
        val baseAmt = max(0f, 1f - happy - flatAmt)
        for (side in intArrayOf(-1, 1)) {
            val m = RobotGeometry.eyeMount(spec, side)
            fun eyeXf(): Xform = robotRoot(b)
                .translate(m.x + b.eyeLookX * 0.035f, m.y + b.eyeLookY * 0.028f + happy * 0.01f, m.z)
                .rotY(m.yaw).rotX(m.pitch).rotZ(-side * b.eyeError * 0.32f)
            if (baseAmt > 0.002f) {
                eyeXf().scale(baseAmt, baseAmt * open, 1f)
                drawBasic(mesh("eye:${look.eyes}:$side") { RobotGeometry.eyeShape(look.eyes, side) }, xf.m, eyeColor, fog = false)
            }
            if (happy > 0.002f) {
                eyeXf().scale(happy, happy, happy)
                drawBasic(mesh("eyeHappy") { RobotGeometry.arc(0.07f, 0.026f) }, xf.m, eyeColor, fog = false)
            }
            if (flatAmt > 0.002f) {
                eyeXf().scale(flatAmt, flatAmt * (0.6f + 0.4f * open), 1f)
                drawBasic(mesh("eyeFlat") { RobotGeometry.pill(0.12f, 0.028f) }, xf.m, eyeColor, fog = false)
            }
        }

        // Accesorios con movimiento secundario.
        val w = sin(t * 1.6f + b.phase * 9f)
        val calm = if (reduced) 0.3f else 1f
        val topY = spec.h / 2f
        val accent = Lin.of(look.accentColor)
        when (look.accessory) {
            Accessory.Ears -> {
                val earMat = LitMat(accent, 0f, 0.4f, accent * 0.1f, clear = 0.4f)
                for (side in intArrayOf(-1, 1)) {
                    robotRoot(b).translate(side * 0.13f, topY - 0.1f, -0.03f)
                        .rotX(b.restAmt * 0.35f - b.ackAmt * 0.3f + b.pitch * -0.4f)
                        .rotZ(-side * (0.1f + b.restAmt * 0.32f + w * 0.035f * calm) - b.roll * 0.6f)
                        .translate(0f, 0.13f, 0f).scale(1f, 1f, 0.78f)
                    drawLit(mesh("ear") { Shapes.capsule(0.082f, 0.12f, 6, 18) }, xf.m, earMat)
                }
            }
            Accessory.Antenna -> {
                fun base() = robotRoot(b).translate(0f, topY - 0.04f, 0f).rotX(-b.pitch * 0.9f).rotZ(-b.roll * 1.4f + w * 0.06f * calm)
                base().translate(0f, 0.085f, 0f)
                drawLit(mesh("stem") { Shapes.cylinder(0.022f, 0.026f, 0.17f, 12) }, xf.m, bodyMat, bodyEmissive)
                val blink = if (b.visual == AgentVisual.Thinking || b.visual == AgentVisual.Working) 0.5f + 0.5f * sin(t * 5f) else 0f
                base().translate(0f, 0.2f, 0f)
                drawLit(mesh("ball") { Shapes.sphere(0.072f, 20, 14) }, xf.m, LitMat(accent, 0f, 0.3f), accent * (0.5f + b.glow * 1.2f + blink * 0.6f))
            }
            Accessory.Tuft -> {
                robotRoot(b).translate(0f, 0f, -0.02f).rotX(-b.pitch * 0.5f).rotZ(-b.roll * 0.7f + w * 0.04f * calm - b.restAmt * 0.12f)
                drawLit(mesh("tuft:$key") { RobotGeometry.tuft(topY) }, xf.m, bodyMat, bodyEmissive)
            }
            Accessory.Hair -> {
                robotRoot(b)
                drawLit(mesh("hair:$key") { RobotGeometry.hair(spec) }, xf.m, LitMat(accent, 0.05f, 0.3f, clear = 0.8f, env = 0.45f))
                val band = headbands.getOrPut(key) { RobotGeometry.headband(spec).let { GpuMesh(it.first) to it.second } }
                drawLit(band.first, xf.m, bodyMat, bodyEmissive)
                for (end in band.second) {
                    val s = if (end.x < 0f) -1f else 1f
                    robotRoot(b).translate(end.x + s * 0.004f, end.y, end.z).rotZ(PIf / 2f)
                    drawLit(mesh("button") { Shapes.cylinder(0.085f, 0.085f, 0.045f, 40) }, xf.m, trimMat ?: LitMat(bodyColor * 0.45f, 0f, 0.7f))
                    robotRoot(b).translate(end.x + s * 0.029f, end.y, end.z).rotZ(PIf / 2f)
                    drawBasic(mesh("buttonRing") { Shapes.torus(0.05f, 0.01f, 10, 48) }, xf.m, eyeColor, fog = false)
                }
            }
            Accessory.Vents -> {
                val ventMat = LitMat(bodyColor * 0.35f, 0f, 0.8f)
                for (side in intArrayOf(-1, 1)) for (dy in floatArrayOf(-0.05f, -0.105f)) {
                    robotRoot(b).translate(side * (spec.w / 2f - 0.006f) * (1f - 0.05f * ((dy + spec.h / 2f) / spec.h)), dy, 0.04f)
                    drawLit(mesh("vent") { Shapes.box(0.016f, 0.024f, 0.15f) }, xf.m, ventMat)
                }
            }
            Accessory.Halo -> {
                // Aro de luz que flota y se mece sobre la cabeza (el toro ya es horizontal); brilla más al pensar o trabajar.
                val bob = sin(t * 1.3f + b.phase * 7f) * 0.02f * calm - b.restAmt * 0.05f
                robotRoot(b).translate(0f, topY + 0.16f + bob, 0f).rotY(b.roll * 0.8f).rotZ(w * 0.05f * calm).rotX(-0.28f)
                val glow = (0.55f + b.glow * 0.8f - b.restAmt * 0.25f - b.offlineAmt * 0.4f).coerceIn(0.15f, 1.4f)
                drawBasic(mesh("halo") { Shapes.torus(0.25f, 0.024f, 14, 72) }, xf.m, accent * (1.5f * glow), fog = false)
            }
            Accessory.None -> Unit
        }

        // Indicadores sobre la cabeza: puntos al pensar (opacos), arco de espera.
        val th = b.thinkingAmt
        if (th > 0.02f) {
            val dot = mesh("thinkDot") { Shapes.sphere(0.045f, 12, 8) }
            for (i in 0 until 3) {
                val a = t * (if (reduced) 1.2f else 2.4f) + i * PIf * 2f / 3f
                indicators(b, spec, look.accessory).scale(th, th, th).rotX(0.5f)
                    .translate(kotlin.math.cos(a) * 0.17f, sin(t * 4f + i) * 0.03f * calm, kotlin.math.sin(a) * 0.17f)
                drawBasic(dot, xf.m, Lin.of(look.eyeColor) * 1.15f, fog = false)
            }
        }
        val wa = b.waitingAmt
        if (wa > 0.02f) {
            indicators(b, spec, look.accessory).scale(wa, wa, wa).rotZ(-t * (if (reduced) 0.8f else 1.8f)).rotX(PIf / 2f)
            drawBasic(mesh("waitArc") { Shapes.torus(0.17f, 0.02f, 8, 40, PIf * 1.35f) }, xf.m, Lin.of(0xFFA9BDDB.toInt()), fog = false)
        }
    }

    /** Grupo de indicadores: sobre la cabeza y siempre de cara a la cámara. */
    private fun indicators(b: RobotAnimator, spec: BodySpec, accessory: Accessory): Xform {
        val s = max(0.0001f, b.scale) * SpaceLayout.ROBOT_SCALE
        return xf.identity().translate(b.pos.x, b.pos.y, b.pos.z).scale(s, s, s).translate(0f, top(spec, accessory) + 0.2f, 0f).rotateLike(camWorld)
    }

    private fun drawRobotGlow(b: RobotAnimator, t: Float) {
        val agent = b.agent ?: return
        if (b.scale <= 0.01f) return
        val look = agent.look
        val spec = BodySpec.of(look.body)
        val s = b.scale * SpaceLayout.ROBOT_SCALE
        val glowTex = textures.getValue("glow")
        // Propulsor: brillo suave bajo el robot.
        val bodyColor = Lin.of(look.bodyColor)
        val thrusterPos = b.pos + Vec3(0f, (-spec.h / 2f - 0.12f) * s, 0f)
        billboard(thrusterPos, 0.75f * s, 0.42f * s, bodyColor.lerp(Lin(1f, 1f, 1f), 0.2f), (0.14f + b.glow * 0.85f - b.restAmt * 0.1f).coerceIn(0f, 1f), glowTex)
        // Resplandor de los ojos (lo que en el escritorio añade el bloom), contenido.
        val eye = eyeTint(b, look.eyeColor)
        for (side in intArrayOf(-1, 1)) {
            val m = RobotGeometry.eyeMount(spec, side)
            robotRoot(b).translate(m.x, m.y, m.z + 0.02f)
            val p = Vec3(xf.m[12], xf.m[13], xf.m[14])
            billboard(p, 0.34f * s, 0.34f * s, eye, (0.16f + b.glow * 0.38f) * (1f - b.offlineAmt * 0.7f) * max(0.2f, b.eyeOpen.coerceAtMost(1f)), glowTex)
        }
        // Logo del pecho.
        val tex = logoTexture(look.logo)
        if (tex != 0) {
            normalBlend()
            GLES20.glEnable(GLES20.GL_POLYGON_OFFSET_FILL)
            GLES20.glPolygonOffset(-2f, -4f)
            robotRoot(b)
            drawBasic(mesh("logo:${look.body.name}") { RobotGeometry.logoPatch(spec) }, xf.m, Lin.of(look.eyeColor) * 1.1f, (0.45f + b.glow * 1.1f - b.offlineAmt * 0.3f - b.pausedAmt * 0.15f).coerceIn(0f, 1f), tex, fog = false)
            GLES20.glDisable(GLES20.GL_POLYGON_OFFSET_FILL)
            additive()
        }
        // Verificación al terminar una tarea.
        val ck = b.checkAmt
        if (ck > 0.02f) {
            normalBlend()
            indicators(b, spec, look.accessory).translate(0f, 0.05f + ck * 0.12f, 0f).scale(ck * 0.4f, ck * 0.4f, 1f)
            drawBasic(mesh("plane1") { Shapes.plane(1f, 1f) }, xf.m, Lin.of(0xFF5FF0A6.toInt()) * 1.2f, ck, textures.getValue("check"), fog = false)
            additive()
        }
        // En pausa: dos barras quietas.
        val pa = b.pausedAmt
        if (pa > 0.02f) {
            normalBlend()
            val bar = mesh("pauseBar") { Shapes.box(0.052f, 0.17f, 0.02f) }
            for (x in floatArrayOf(-0.055f, 0.055f)) {
                indicators(b, spec, look.accessory).translate(x, 0.02f, 0f).scale(pa, pa, pa)
                drawBasic(bar, xf.m, PAUSE_COLOR, 0.9f * pa, fog = false)
            }
            additive()
        }
        // Necesita tu respuesta: burbuja ámbar con «!», con un latido suave (quieta con movimiento reducido).
        val at = b.attentionAmt
        if (at > 0.02f) {
            val beat = if (reduced) 0f else 0.5f + 0.5f * sin(t * 3.2f)
            val center = indicatorCenter(b, spec, look.accessory, if (b.thinkingAmt > 0.3f) 0.2f else 0.04f)
            billboard(center, 0.62f * s * at, 0.62f * s * at, ATTENTION, (0.12f + 0.08f * beat) * at, glowTex)
            normalBlend()
            val k = at * (1f + 0.06f * beat)
            indicators(b, spec, look.accessory).translate(0f, if (b.thinkingAmt > 0.3f) 0.2f else 0.04f, 0f).scale(k, k, k)
            val m = xf.m.copyOf()
            xf.set(m).rotX(PIf / 2f)
            drawBasic(mesh("attnRing") { Shapes.torus(0.15f, 0.018f, 8, 48) }, xf.m, ATTENTION, 0.95f * at, fog = false)
            xf.set(m).translate(0f, 0.025f, 0.01f)
            drawBasic(mesh("attnBar") { Shapes.box(0.034f, 0.12f, 0.02f) }, xf.m, ATTENTION, at, fog = false)
            xf.set(m).translate(0f, -0.072f, 0.01f)
            drawBasic(mesh("attnDot") { Shapes.sphere(0.022f, 10, 8) }, xf.m, ATTENTION, at, fog = false)
            additive()
        }
    }

    private fun indicatorCenter(b: RobotAnimator, spec: BodySpec, accessory: Accessory, lift: Float): Vec3 {
        indicators(b, spec, accessory).translate(0f, lift, 0f)
        return Vec3(xf.m[12], xf.m[13], xf.m[14])
    }

    // =====================================================================================================
    // Transferencias
    // =====================================================================================================

    private fun drawPackets(t: Float) {
        if (sim.packets.isEmpty()) return
        val glowTex = textures.getValue("glow")
        val card = mesh("packetCard") { Shapes.plane(0.34f, 0.44f) }
        for (p in sim.packets) {
            val raw = (t - p.start) / p.duration
            val e = easeInOut(raw.coerceIn(0f, 1f))
            val color = Lin.of(p.color)
            val arrived = p.arrivedAt
            if (p.arc) {
                val arc = arcMeshes.getOrPut(p) { GpuMesh(RobotGeometry.tube(p.path, 6, { 0.02f }, up = Vec3(0f, 1f, 0f)).build(uv = true)) }
                val fadeOut = if (arrived != null) max(0f, 1f - (t - arrived) / 0.9f) else 1f
                val ap = use(arcProg)
                xf.identity()
                ap.setMatrix("uModel", xf.m)
                ap.set1("uTime", t)
                ap.setLin("uColor", color)
                ap.set1("uOpacity", min(1f, raw * 4f) * fadeOut)
                ap.set1("uHead", e)
                ap.set1("uLen", p.arcLen)
                arc.draw(ap)
            }
            // Tras llegar, la tarjeta se encoge en 0,45 s.
            val shrink = if (arrived != null) max(0f, 1f - (t - arrived) / 0.45f) else 1f
            if (shrink <= 0.001f) continue
            val pos = along(p.path, e)
            billboard(pos, 0.9f * shrink, 0.9f * shrink, color, 0.45f, glowTex)
            // Estela (cuatro destellos detrás de la tarjeta).
            if (arrived == null) {
                for (k in 0 until 4) {
                    val ek = e - (k + 1) * 0.022f
                    if (ek <= 0f) break
                    val sc = 0.32f - k * 0.05f
                    billboard(along(p.path, ek), sc, sc, color, 0.32f, glowTex)
                }
            }
            val yaw = yawTo(pos, eye)
            val pitch = -atan2(eye.y - pos.y, sqrt((eye.x - pos.x).pow(2) + (eye.z - pos.z).pow(2)))
            xf.identity().translate(pos.x, pos.y, pos.z).rotY(yaw).rotX(pitch).scale(shrink, shrink, shrink)
            drawBasic(card, xf.m, color.lerp(Lin(1f, 1f, 1f), 0.35f) * 1.25f, 1f, textures.getValue("doc"), fog = false)
        }
    }

    private fun along(path: List<Vec3>, k: Float): Vec3 {
        if (path.size < 2) return path.firstOrNull() ?: Vec3.Zero
        val f = k * (path.size - 1)
        val i = min(path.size - 2, f.toInt())
        return path[i].lerp(path[i + 1], f - i)
    }

    private fun easeInOut(x: Float) = if (x < 0.5f) 4f * x * x * x else 1f - (-2f * x + 2f).pow(3) / 2f

    // =====================================================================================================
    // Sprites, etiquetas y utilidades de pantalla
    // =====================================================================================================

    private fun billboard(c: Vec3, w: Float, h: Float, color: Lin, opacity: Float, texture: Int) {
        xf.identity().translate(c.x, c.y, c.z).rotateLike(camWorld).scale(w, h, 1f)
        drawBasic(mesh("plane1") { Shapes.plane(1f, 1f) }, xf.m, color, opacity, texture, fog = false)
    }

    /** Proyecta un punto del mundo a píxeles (y hacia abajo); null si queda detrás de la cámara. */
    private fun project(p: Vec3): FloatArray? {
        val clip = M4.transform(vp, p)
        if (clip[3] <= OrbitCamera.NEAR) return null
        return floatArrayOf((clip[0] / clip[3] * 0.5f + 0.5f) * width, (1f - (clip[1] / clip[3] * 0.5f + 0.5f)) * height, clip[3])
    }

    private fun drawLabels(scene: SpaceScene, t: Float) {
        val labels = labelTextures()
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE_MINUS_SRC_ALPHA)
        val p = use(screenProg)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        p.set1i("uTex", 0)
        val margin = 4f * density
        val placed = ArrayList<android.graphics.RectF>()
        val ordered = sim.brains.values.filter { it.agent != null && it.scale > 0.4f && !it.leaving }
            .map { it to (it.pos - eye).length() }
            .sortedWith(compareBy<Pair<RobotAnimator, Float>> { it.first.id == selectedId }.thenByDescending { it.second })
        for ((b, _) in ordered) {
            val agent = b.agent ?: continue
            val spec = BodySpec.of(agent.look.body)
            val s = b.scale * SpaceLayout.ROBOT_SCALE
            val anchor = b.pos + Vec3(0f, (top(spec, agent.look.accessory) + 0.78f) * s, 0f)
            val sp = project(anchor) ?: continue
            // Robot fuera de la vista: sin etiqueta (no se amontonan en el borde).
            if (sp[0] < 0f || sp[0] > width || sp[1] < 0f || sp[1] > height + 40f * density) continue
            val label = labels.robot(agent, agent.id == selectedId, sim.labelOverride(agent.id))
            val dim = if (agent.visual == AgentVisual.Offline || agent.visual == AgentVisual.Resting || agent.visual == AgentVisual.Paused) 0.66f else 1f
            val alpha = dim * ((b.scale - 0.4f) / 0.4f).coerceIn(0f, 1f) * (if (scene.stale) 0.8f else 1f)
            // En el móvil la etiqueta no se sale por los lados (en el escritorio sobra ancho).
            val x = (sp[0] - label.width / 2f).coerceIn(margin, max(margin, width - label.width - margin))
            val y = sp[1] - label.height
            drawLabelQuad(p, label, x, y, alpha)
            label.bar?.let { bar -> drawBar(p, agent, label, bar, x, y, alpha, t) }
            placed += android.graphics.RectF(x, y, x + label.width, y + label.height)
            // El robot y lo que lleva sobre la cabeza tampoco deben quedar tapados por el rótulo del núcleo.
            project(b.pos)?.let { body -> placed += android.graphics.RectF(body[0] - 1f, minOf(body[1], sp[1]), body[0] + 1f, body[1]) }
        }
        // Rótulo del núcleo, encima. Si una etiqueta o un robot lo tapa (vista cenital del móvil), sube sobre la esfera.
        val core = labels.core(scene.project)
        for (anchor in listOf(Vec3(0f, 0.4f, 2.85f), Vec3(0f, 4.1f, 0f))) {
            val s = project(anchor) ?: continue
            val r = android.graphics.RectF(s[0] - core.width / 2f, s[1] - core.height / 2f, s[0] + core.width / 2f, s[1] + core.height / 2f)
            if (anchor.y < 1f && placed.any { android.graphics.RectF.intersects(it, r) }) continue
            drawLabelQuad(p, core, r.left, r.top, 1f)
            break
        }
    }

    private fun drawLabelQuad(p: GlProgram, label: LabelTexture, x: Float, y: Float, alpha: Float) {
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, label.texture)
        p.set1("uMode", 0f)
        p.set4("uColor", 1f, 1f, 1f, alpha)
        screenQuad(p, ndcX(x), ndcY(y + label.height), ndcX(x + label.width), ndcY(y), 0f, 1f, 1f, 0f)
    }

    /** Barra de progreso de la etiqueta: real si se conoce, si no, un tramo que va y viene. */
    private fun drawBar(p: GlProgram, agent: SceneAgent, label: LabelTexture, bar: android.graphics.RectF, x: Float, y: Float, alpha: Float, t: Float) {
        val left = x + bar.left * label.width
        val right = x + bar.right * label.width
        val top = y + bar.top * label.height
        val bottom = y + bar.bottom * label.height
        val (a, b) = agent.progress?.let { 0f to it } ?: run {
            val k = if (reduced) 0.3f else ((t * 0.7f) % 1.35f) - 0.35f
            k.coerceIn(0f, 1f) to (k + 0.35f).coerceIn(0f, 1f)
        }
        val c = agent.color
        p.set1("uMode", 1f)
        p.set4("uColor", red(c), green(c), blue(c), alpha * (if (agent.progress != null) 0.9f else 0.55f))
        screenQuad(p, ndcX(left + (right - left) * a), ndcY(bottom), ndcX(left + (right - left) * b), ndcY(top), 0f, 0f, 0f, 0f)
    }

    private fun ndcX(px: Float) = px / width * 2f - 1f
    private fun ndcY(py: Float) = 1f - py / height * 2f

    /** Rectángulo en coordenadas de recorte con su textura (u0, v0 abajo a la izquierda). */
    private fun screenQuad(p: GlProgram, x0: Float, y0: Float, x1: Float, y1: Float, u0: Float, v0: Float, u1: Float, v1: Float) {
        screenBuffer.position(0)
        screenBuffer.put(floatArrayOf(x0, y0, u0, v0, x1, y0, u1, v0, x0, y1, u0, v1, x1, y1, u1, v1))
        val pos = p.attrib("aPos")
        val uv = p.attrib("aUV")
        GLES20.glEnableVertexAttribArray(pos)
        GLES20.glEnableVertexAttribArray(uv)
        screenBuffer.position(0)
        GLES20.glVertexAttribPointer(pos, 2, GLES20.GL_FLOAT, false, 16, screenBuffer)
        screenBuffer.position(2)
        GLES20.glVertexAttribPointer(uv, 2, GLES20.GL_FLOAT, false, 16, screenBuffer)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(pos)
        GLES20.glDisableVertexAttribArray(uv)
    }

    private companion object {
        const val TAG = "SpaceRenderer"
        const val PIf = PI.toFloat()
        const val CORE_Y = 2.05f
        const val GLOBE_Y = 6f
        /** Los eventos que esperaron más (app en segundo plano) ya no se animan: no se ven como si pasaran ahora. */
        const val MAX_EVENT_AGE_NANOS = 3_000_000_000L
        val BLUE = Lin.of(SpaceColors.BLUE)
        val VIOLET = Lin.of(SpaceColors.VIOLET)
        val CYAN = Lin.of(SpaceColors.CYAN)
        val FOG = Lin.of(SpaceColors.FOG)
        val ATTENTION = Lin.of(SpaceColors.ATTENTION)
        val PAUSE_COLOR = Lin.of(0xFFB8C3D6.toInt())
        /** Azul de los bordes y conexiones de las estaciones (`#4f8dff`). */
        val TRACE_BLUE = Lin.of(WorldSim.TRACE_COLOR)
        val ERR = Lin.of(WorldSim.ERROR_COLOR)
        val IDLE_ACCENT = Lin.of(0xFF5F8FB8.toInt())
        val ERROR_EYE = Lin.of(0xFFFF6B7A.toInt())
        val OFF_EYE = Lin.of(0xFF5D6A80.toInt())
        val GRAPHITE = LitMat(Lin.of(0xFF131733.toInt()), 0.55f, 0.42f)
        val STATION_TOP = LitMat(Lin.of(0xFF1A2045.toInt()), 0.5f, 0.35f)
        val CORE_PLATE = LitMat(Lin.of(0xFF141A3A.toInt()), 0.5f, 0.3f)
        val PLINTH = LitMat(Lin.of(0xFF10142E.toInt()), 0.55f, 0.4f)
        val TILE = LitMat(Lin.of(0xFF141A3C.toInt()), 0.4f, 0.35f)
        val SLAB = LitMat(Lin.of(0xFF121A44.toInt()), 0.5f, 0.3f)
        val GLASS = LitMat(Lin.of(0xFF040509.toInt()), 0.05f, 0.07f, clear = 1f, env = 0.75f)
        val FRAGMENT_MAT = LitMat(Lin.of(0xFF141A44.toInt()), 0.3f, 0.3f, Lin.of(0xFF5A7DFF.toInt()) * 0.45f, opacity = 0.85f)
        val TOOL_COLORS = intArrayOf(SpaceColors.CYAN, SpaceColors.BLUE, 0xFF5FF0A6.toInt(), SpaceColors.VIOLET)
        /** Documentos dentro del núcleo: radio, altura, ángulo y escala. */
        val CARDS = listOf(
            floatArrayOf(0.95f, 0.35f, 0.2f, 1f),
            floatArrayOf(0.85f, -0.25f, 2.3f, 0.9f),
            floatArrayOf(1f, 0.05f, 4.1f, 0.95f),
            floatArrayOf(0.35f, 0f, 1.2f, 1.15f),
            floatArrayOf(0.7f, 0.6f, 3.3f, 0.75f),
        )
    }
}

/** Matriz de modelo que se compone por la derecha (como anidar grupos en three.js). */
internal class Xform {
    val m = FloatArray(16)

    fun identity(): Xform { M4.identity(m); return this }
    fun set(src: FloatArray): Xform { src.copyInto(m); return this }

    fun translate(x: Float, y: Float, z: Float): Xform {
        m[12] += m[0] * x + m[4] * y + m[8] * z
        m[13] += m[1] * x + m[5] * y + m[9] * z
        m[14] += m[2] * x + m[6] * y + m[10] * z
        m[15] += m[3] * x + m[7] * y + m[11] * z
        return this
    }

    fun scale(x: Float, y: Float, z: Float): Xform {
        for (i in 0 until 4) { m[i] *= x; m[4 + i] *= y; m[8 + i] *= z }
        return this
    }

    private fun rot(a: Int, b: Int, angle: Float, sign: Float) {
        val c = kotlin.math.cos(angle); val s = kotlin.math.sin(angle) * sign
        for (i in 0 until 4) {
            val ca = m[a * 4 + i]; val cb = m[b * 4 + i]
            m[a * 4 + i] = ca * c + cb * s
            m[b * 4 + i] = -ca * s + cb * c
        }
    }

    fun rotX(a: Float): Xform { rot(1, 2, a, 1f); return this }
    fun rotY(a: Float): Xform { rot(2, 0, a, 1f); return this }
    fun rotZ(a: Float): Xform { rot(0, 1, a, 1f); return this }

    /** Aplica la rotación de [world] (la de la cámara): para objetos que siempre miran a la cámara. */
    fun rotateLike(world: FloatArray): Xform {
        val r = FloatArray(16)
        M4.identity(r)
        for (c in 0 until 3) for (row in 0 until 3) r[c * 4 + row] = world[c * 4 + row]
        val out = FloatArray(16)
        M4.multiply(out, m, r)
        out.copyInto(m)
        return this
    }
}
