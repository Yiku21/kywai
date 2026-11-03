package com.aicowork.remote

import android.graphics.Bitmap
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aicowork.remote.data.store.ThemeMode
import com.aicowork.remote.orbita.OrbitaPreview
import com.aicowork.remote.orbita.OrbitaSample
import com.aicowork.remote.ui.space.EffectsLevel
import com.aicowork.remote.ui.space.GlassRegion
import com.aicowork.remote.ui.space.OrbitaWorld
import com.aicowork.remote.ui.space.WorldController
import com.aicowork.remote.ui.space.WorldEvent
import com.aicowork.remote.ui.space.WorldSettings
import com.aicowork.remote.ui.theme.CoworkTheme
import java.io.File
import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * El mundo Órbita en un dispositivo con OpenGL (el emulador del Z Fold8, plegado o desplegado): el cristal esmerilado
 * que dibuja el mundo bajo los paneles, el encuadre en el hueco libre, los ajustes en vivo y que recrear la vista (y
 * con ella el contexto de OpenGL) no reinicia nada. Guarda capturas en
 * `Android/data/com.aicowork.remote.debug/files/orbita/` (nombre con el tamaño de la pantalla: plegado o desplegado).
 */
@RunWith(AndroidJUnit4::class)
class OrbitaWorldDeviceTest {
    @get:Rule val compose = createComposeRule()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()

    private fun posture(): String {
        val c = instrumentation.targetContext.resources.configuration
        return "${c.screenWidthDp}x${c.screenHeightDp}dp"
    }

    private fun shot(name: String): Bitmap {
        // El reloj de la prueba es virtual: se avanza para que la interfaz de ejemplo vea los últimos cambios.
        compose.mainClock.advanceTimeBy(600)
        compose.waitForIdle()
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
        val dir = File(instrumentation.targetContext.getExternalFilesDir(null), "orbita").apply { mkdirs() }
        File(dir, "$name-${posture()}.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return bitmap
    }

    private fun waitFrames(controller: WorldController, n: Int) {
        val target = controller.frameCount() + n
        compose.waitUntil(15_000) { controller.frameCount() >= target }
    }

    private fun WorldController.frameCount() = world.frames

    /** Detalle de la imagen en un rectángulo: diferencia media de luminancia entre píxeles vecinos. */
    private fun detail(b: Bitmap, r: GlassRegion): Float {
        var sum = 0L
        var n = 0
        val inset = 40
        for (y in (r.top.toInt() + inset) until (r.bottom.toInt() - inset) step 3) {
            for (x in (r.left.toInt() + inset) until (r.right.toInt() - inset - 2) step 2) {
                sum += abs(luma(b.getPixel(x, y)) - luma(b.getPixel(x + 2, y))) + abs(luma(b.getPixel(x, y)) - luma(b.getPixel(x, y + 2)))
                n++
            }
        }
        return sum.toFloat() / n.coerceAtLeast(1)
    }

    private fun luma(p: Int) = ((p shr 16 and 0xFF) * 3 + (p shr 8 and 0xFF) * 6 + (p and 0xFF)) / 10

    @Test fun frostedGlassFramingAndLiveSettings() {
        val controller = WorldController()
        var panels by mutableStateOf(false)
        compose.setContent { CoworkTheme(themeMode = ThemeMode.Dark) { OrbitaPreview(controller, glass = panels, events = true) } }
        waitFrames(controller, 60)
        Thread.sleep(2_000)
        val plain = shot("01-mundo")
        val w = plain.width.toFloat()
        val h = plain.height.toFloat()
        assertTrue("el mundo se dibuja", detail(plain, GlassRegion(0f, h * 0.2f, w, h * 0.8f, 0f)) > 1f)

        // Cristal sin interfaz encima: el mundo difumina lo que queda debajo del rectángulo redondeado.
        val raw = GlassRegion(w * 0.08f, h * 0.52f, w * 0.92f, h * 0.88f, radius = 28f * instrumentation.targetContext.resources.displayMetrics.density)
        controller.glass.put("raw", raw)
        waitFrames(controller, 20)
        val frosted = shot("02-cristal-solo")
        assertTrue(controller.glassActive)
        val before = detail(plain, raw)
        val after = detail(frosted, raw)
        assertTrue("bajo el cristal se ve difuminado ($after frente a $before)", after < before * 0.45f)
        controller.glass.put("raw", null)

        // Paneles de ejemplo: cristal bajo cada uno y el mundo encuadrado en el hueco libre (con suavidad).
        panels = true
        compose.waitForIdle()
        Thread.sleep(2_500)
        shot("03-paneles")
        val lens = controller.lens!!
        assertTrue("el encuadre se aparta de los paneles", lens.framing.centerX < lens.width / 2f - 1f || lens.framing.centerY < lens.height / 2f - 1f)
        assertEquals(2, controller.glass.snapshot().size)

        // «Suave»: sin difuminado (la interfaz usará tintes más opacos).
        controller.settings = WorldSettings(effects = EffectsLevel.Soft)
        Thread.sleep(1_200)
        assertFalse(controller.glassActive)
        shot("04-suave")
        // «Completa»: MSAA y cristal.
        controller.settings = WorldSettings(effects = EffectsLevel.Full)
        Thread.sleep(1_200)
        assertTrue(controller.glassActive)
        shot("05-completa")
        // Sin ambiente y con movimiento reducido: sigue dibujando.
        val frames = controller.frameCount()
        controller.settings = WorldSettings(ambient = false, reducedMotion = true)
        Thread.sleep(1_000)
        assertTrue(controller.frameCount() > frames + 10)
        // Tapado del todo: muy pocos fotogramas.
        controller.covered = true
        Thread.sleep(500)
        val coveredFrom = controller.frameCount()
        Thread.sleep(2_000)
        val coveredFrames = controller.frameCount() - coveredFrom
        assertTrue("tapado dibuja ~5 fps ($coveredFrames en 2 s)", coveredFrames in 4..16)
        controller.covered = false
    }

    @Test fun recreatingTheViewKeepsTheWorldRunning() {
        val controller = WorldController()
        val scene = OrbitaSample.scene()
        var generation by mutableIntStateOf(0)
        compose.setContent {
            CoworkTheme(themeMode = ThemeMode.Dark) {
                key(generation) { OrbitaWorld(scene, selectedId = null, controller = controller, onPick = {}) }
            }
        }
        waitFrames(controller, 90)
        val brains = controller.world.brains.values.toList()
        assertEquals(OrbitaSample.snapshot.agents.size, brains.size)
        controller.post(WorldEvent.Transfer("p1", "core", "codex", "Nueva tarea", "Pruebas"))
        waitFrames(controller, 10)
        val packet = controller.world.packets.single()
        val t0 = controller.world.time
        val pose = controller.camera.pose
        shot("06-antes-de-recrear")

        // Vista nueva: otro GLSurfaceView, otro hilo y otro contexto de OpenGL.
        generation++
        compose.waitForIdle()
        waitFrames(controller, 30)
        shot("07-despues-de-recrear")
        val world = controller.world
        assertTrue("el reloj sigue (${world.time} > $t0)", world.time > t0)
        assertEquals("los mismos robots", brains, world.brains.values.toList())
        assertTrue("sin animación de aparición", world.brains.values.all { it.scale == 1f })
        assertTrue("el paquete sigue su viaje", world.packets.none { it !== packet })
        val now = controller.camera.pose
        assertTrue("la cámara no salta", now.target.distanceTo(pose.target) < 0.05f && abs(now.distance - pose.distance) < 0.1f)
    }
}
