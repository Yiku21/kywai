package com.aicowork.remote.ui.space.gl

import com.aicowork.remote.ui.space.EffectsLevel
import com.aicowork.remote.ui.space.GlassRegion
import com.aicowork.remote.ui.space.WorldSettings
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min

// Decisiones de dibujo en Kotlin puro (se prueban en la JVM): calidad y ritmo según los ajustes, ritmo de fotogramas,
// núcleo del difuminado y qué cristales se dibujan.

/** Calidad según los ajustes y el dispositivo (los niveles `medium` y `low` del escritorio). */
internal data class SpaceQuality(val particles: Int, val fragments: Int, val structures: Int, val stationLights: Boolean) {
    companion object {
        val Normal = SpaceQuality(420, 14, 170, stationLights = true)
        val Low = SpaceQuality(200, 8, 100, stationLights = false)
    }
}

/**
 * Cómo se dibuja cada fotograma: «Suave» = calidad baja, sin cristal difuminado y 30 fps; «Normal» = calidad normal,
 * cristal y 60 fps; «Completa» = calidad normal, antialiasing (MSAA), cristal y la frecuencia de la pantalla. Con el
 * mundo tapado del todo basta con [COVERED_FPS]. [maxFps] 0 = sin límite (la de la pantalla).
 */
internal data class RenderPlan(val quality: SpaceQuality, val glass: Boolean, val msaa: Boolean, val maxFps: Int) {
    companion object {
        const val COVERED_FPS = 5

        fun of(settings: WorldSettings, covered: Boolean, lowEnd: Boolean): RenderPlan {
            val normal = if (lowEnd) SpaceQuality.Low else SpaceQuality.Normal
            val plan = when (settings.effects) {
                EffectsLevel.Soft -> RenderPlan(SpaceQuality.Low, glass = false, msaa = false, maxFps = 30)
                EffectsLevel.Normal -> RenderPlan(normal, glass = true, msaa = false, maxFps = 60)
                EffectsLevel.Full -> RenderPlan(normal, glass = true, msaa = !lowEnd, maxFps = 0)
            }
            return if (covered) plan.copy(maxFps = COVERED_FPS) else plan
        }
    }
}

/**
 * Ritmo de fotogramas: se le pregunta en cada refresco de la pantalla (Choreographer) y dice si toca dibujar para no
 * pasar de [maxFps] (en una pantalla de 120 Hz, a 60 fps dibuja uno de cada dos refrescos), con el reparto más
 * regular posible y sin acumular retraso.
 */
internal class FramePacer {
    private var nextDue = Long.MIN_VALUE

    fun shouldRender(frameTimeNanos: Long, maxFps: Int): Boolean {
        if (maxFps <= 0) {
            nextDue = frameTimeNanos
            return true
        }
        val interval = 1_000_000_000L / maxFps
        // Margen: un refresco que llega un poco antes de tiempo también vale (el reloj de vsync tiene algo de ruido).
        val slack = min(4_000_000L, interval / 4)
        if (nextDue != Long.MIN_VALUE && frameTimeNanos + slack < nextDue) return false
        nextDue = if (nextDue == Long.MIN_VALUE || frameTimeNanos - nextDue > interval) frameTimeNanos + interval else nextDue + interval
        return true
    }
}

/**
 * Núcleo gaussiano separable con muestreo lineal: cada par de texeles vecinos se lee con una sola muestra bilineal
 * (pesos y desplazamientos ya combinados). Los pesos suman 1 (centro + 2 · pares).
 */
internal class BlurKernel(val center: Float, val offsets: FloatArray, val weights: FloatArray) {
    val pairs: Int get() = offsets.size

    companion object {
        const val MAX_PAIRS = 16

        fun gaussian(sigma: Float): BlurKernel {
            val s = sigma.coerceAtLeast(0.5f)
            val radius = min(ceil(3f * s).toInt(), MAX_PAIRS * 2)
            val w = FloatArray(radius + 1) { i -> exp(-(i * i) / (2f * s * s)) }
            var sum = w[0]
            for (i in 1..radius) sum += 2f * w[i]
            for (i in w.indices) w[i] /= sum
            val offs = ArrayList<Float>()
            val ws = ArrayList<Float>()
            var i = 1
            while (i <= radius) {
                val a = w[i]
                val b = if (i + 1 <= radius) w[i + 1] else 0f
                val total = a + b
                if (total > 0f) {
                    offs += (i * a + (i + 1) * b) / total
                    ws += total
                }
                i += 2
            }
            return BlurKernel(w[0], offs.toFloatArray(), ws.toFloatArray())
        }
    }
}

/** Cristales que se dibujan en el fotograma: visibles, recortados a la vista y como mucho [MAX] (los mayores). */
internal object GlassMask {
    const val MAX = 8

    /** Difuminado parecido al `backdrop-filter: blur(28px)` de CSS (la desviación típica, en dp). */
    const val BLUR_DP = 28f

    fun visible(regions: List<GlassRegion>, width: Float, height: Float): List<GlassRegion> {
        if (regions.isEmpty()) return emptyList()
        val out = ArrayList<GlassRegion>(regions.size)
        for (r in regions) {
            if (r.alpha <= 0.01f) continue
            val l = max(r.left, 0f)
            val t = max(r.top, 0f)
            val rr = min(r.right, width)
            val b = min(r.bottom, height)
            if (rr - l < 1f || b - t < 1f) continue
            // El radio se calcula con el rectángulo completo (un panel que asoma por el borde conserva sus esquinas).
            val radius = r.radius.coerceIn(0f, min(r.right - r.left, r.bottom - r.top) / 2f)
            out += r.copy(radius = radius, alpha = r.alpha.coerceAtMost(1f))
        }
        if (out.size <= MAX) return out
        return out.sortedByDescending { (it.right - it.left) * (it.bottom - it.top) * it.alpha }.take(MAX)
    }
}
