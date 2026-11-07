package com.aicowork.remote.ui.space

import kotlin.math.max
import kotlin.math.min

/**
 * El espacio 3D con los colores del tema elegido en el ordenador. El mundo de Órbita está pintado con la paleta del
 * clásico (azul, violeta y cian sobre un fondo índigo); al final de cada sombreador, los tonos de esa gama se llevan a
 * los del tema (su principal, secundario, acento y fondo, los de scene/palette.ts del escritorio) conservando luces y
 * sombras. Los robots no se tocan: cada agente sigue con su color.
 *
 * Los mapas con escenario propio del escritorio (el bosque, la Tierra…) aquí se ven como el espacio de siempre con
 * los colores de ese mapa.
 */
class SpaceGrade private constructor(val key: String, private val accent: FloatArray, private val primary: FloatArray, private val secondary: FloatArray, private val bg: FloatArray) {

    /** Cuerpo de `vec3 themeGrade(vec3 c)` (c en sRGB). */
    fun glsl(): String {
        fun v(a: FloatArray) = "vec3(${f(a[0])}, ${f(a[1])}, ${f(a[2])})"
        return """
            vec3 h = themeHsv(c);
            float band = smoothstep(${f(BAND[0])}, ${f(BAND[1])}, h.x) * (1.0 - smoothstep(${f(BAND[2])}, ${f(BAND[3])}, h.x)) * smoothstep(0.02, 0.08, h.y);
            if (band <= 0.0) return c;
            vec3 g = h.x < ${f(HP)}
                ? mix(${v(accent)}, ${v(primary)}, clamp((h.x - ${f(HA)}) / ${f(HP - HA)}, 0.0, 1.0))
                : mix(${v(primary)}, ${v(secondary)}, clamp((h.x - ${f(HP)}) / ${f(HS - HP)}, 0.0, 1.0));
            g = mix(g, ${v(bg)}, 1.0 - smoothstep(0.06, 0.35, h.z));
            vec3 o = vec3(fract(h.x + g.x + 2.0), clamp(h.y * g.y, 0.0, 1.0), clamp(h.z * g.z, 0.0, 1.0));
            return mix(c, themeRgb(o), band);
        """.trimIndent()
    }

    /** El mismo cambio en la CPU (para el color de fondo con el que se limpia la pantalla). */
    fun apply(argb: Int): Int {
        val r = ((argb shr 16) and 0xFF) / 255f
        val gr = ((argb shr 8) and 0xFF) / 255f
        val b = (argb and 0xFF) / 255f
        val h = hsv(r, gr, b)
        val band = smooth(BAND[0], BAND[1], h[0]) * (1f - smooth(BAND[2], BAND[3], h[0])) * smooth(0.02f, 0.08f, h[1])
        if (band <= 0f) return argb
        val g = if (h[0] < HP) mix(accent, primary, ((h[0] - HA) / (HP - HA)).coerceIn(0f, 1f)) else mix(primary, secondary, ((h[0] - HP) / (HS - HP)).coerceIn(0f, 1f))
        val gg = mix(g, bg, 1f - smooth(0.06f, 0.35f, h[2]))
        val o = rgb(((h[0] + gg[0] + 2f) % 1f), (h[1] * gg[1]).coerceIn(0f, 1f), (h[2] * gg[2]).coerceIn(0f, 1f))
        fun ch(a: Float, c: Float) = ((a + (c - a) * band) * 255f + 0.5f).toInt().coerceIn(0, 255)
        return (argb and 0xFF000000.toInt()) or (ch(r, o[0]) shl 16) or (ch(gr, o[1]) shl 8) or ch(b, o[2])
    }

    companion object {
        /** La gama del clásico que se recolorea: de ~150° a ~300° (azules, violetas y cianes). */
        private val BAND = floatArrayOf(0.42f, 0.47f, 0.80f, 0.86f)
        private val CLASSIC = Scene(0xFF04051A.toInt(), 0xFF3F7BFF.toInt(), 0xFF8B5CFF.toInt(), 0xFF38D6FF.toInt())
        private val HA = hsvOf(CLASSIC.accent)[0]
        private val HP = hsvOf(CLASSIC.primary)[0]
        private val HS = hsvOf(CLASSIC.secondary)[0]

        private class Scene(val bg: Int, val primary: Int, val secondary: Int, val accent: Int, val light: Boolean = false)

        /** Fondo, principal, secundario y acento de cada tema (scene/palette.ts del escritorio). */
        private val SCENES = mapOf(
            "marfil" to Scene(0xFFECE7DC.toInt(), 0xFF2F8F68.toInt(), 0xFFC49A4A.toInt(), 0xFF3FAE84.toInt(), light = true),
            "grafito" to Scene(0xFF0C0D0F.toInt(), 0xFFD9A24A.toInt(), 0xFF9A9EA8.toInt(), 0xFFF0C070.toInt()),
            "bosque" to Scene(0xFF07120D.toInt(), 0xFF7FD6A0.toInt(), 0xFFD4AF5A.toInt(), 0xFFB7F0C8.toInt()),
            "matrix" to Scene(0xFF010502.toInt(), 0xFF2BFF6A.toInt(), 0xFF119A44.toInt(), 0xFF8DFFB0.toInt()),
            "eva" to Scene(0xFF130822.toInt(), 0xFFA6FF3A.toInt(), 0xFF7B3CFF.toInt(), 0xFFC9FF6E.toInt()),
            "relicario" to Scene(0xFF06070A.toInt(), 0xFFE8C27A.toInt(), 0xFFCFD6E6.toInt(), 0xFFFFF1C9.toInt()),
            "telar" to Scene(0xFF0A0B0F.toInt(), 0xFFC9D0DE.toInt(), 0xFFF0C27A.toInt(), 0xFFFFFFFF.toInt()),
            "halloween" to Scene(0xFF0D0714.toInt(), 0xFFFF8A1F.toInt(), 0xFF8A4DFF.toInt(), 0xFFFFC15A.toInt()),
            "navidad" to Scene(0xFF0B1424.toInt(), 0xFFE8B84A.toInt(), 0xFFD83A3A.toInt(), 0xFF3FBF6A.toInt()),
            // Mapas con colores propios (WORLD_PALETTES); los demás usan los del color con su nombre.
            "mundo-orbita" to Scene(0xFF020611.toInt(), 0xFF649FFF.toInt(), 0xFF8B5CFF.toInt(), 0xFFA0E7FF.toInt()),
        )

        private val cache = HashMap<String, SpaceGrade?>()

        /** El recoloreado de un tema; null si se ve como el clásico (o el tema no se conoce). */
        @Synchronized
        fun of(theme: String?): SpaceGrade? {
            val id = theme ?: return null
            return cache.getOrPut(id) {
                val scene = SCENES[id] ?: SCENES[id.removePrefix("mundo-")] ?: return@getOrPut null
                build(id, scene)
            }
        }

        private fun build(key: String, t: Scene): SpaceGrade {
            // En los temas claros el espacio sigue siendo de noche (con sus colores): un fondo claro apagaría los brillos.
            val bg = if (t.light) darken(t.primary, 0.16f) else t.bg
            fun anchor(classic: Int, theme: Int): FloatArray {
                val c = hsvOf(classic)
                val o = hsvOf(theme)
                return floatArrayOf(wrap(o[0] - c[0]), o[1] / max(c[1], 1e-3f), o[2] / max(c[2], 1e-3f), o[1])
            }
            val p = anchor(CLASSIC.primary, t.primary)
            val s = anchor(CLASSIC.secondary, t.secondary)
            val a = anchor(CLASSIC.accent, t.accent)
            val b = anchor(CLASSIC.bg, bg)
            // Un color casi gris no tiene tono propio: toma el del principal (así no salen arcoíris entre los dos).
            for (x in listOf(s, a, b)) {
                if (x[3] < 0.18f) x[0] = p[0]
                while (x[0] - p[0] > 0.5f) x[0] -= 1f
                while (x[0] - p[0] < -0.5f) x[0] += 1f
            }
            return SpaceGrade(key, a.copyOf(3), p.copyOf(3), s.copyOf(3), b.copyOf(3))
        }

        private fun darken(argb: Int, k: Float): Int {
            fun c(sh: Int) = (((argb shr sh) and 0xFF) * k).toInt()
            return (0xFF shl 24) or (c(16) shl 16) or (c(8) shl 8) or c(0)
        }

        private fun wrap(x: Float): Float = ((x + 0.5f) % 1f + 1f) % 1f - 0.5f

        private fun hsvOf(argb: Int) = hsv(((argb shr 16) and 0xFF) / 255f, ((argb shr 8) and 0xFF) / 255f, (argb and 0xFF) / 255f)

        internal fun hsv(r: Float, g: Float, b: Float): FloatArray {
            val mx = max(r, max(g, b))
            val mn = min(r, min(g, b))
            val d = mx - mn
            val h = when {
                d < 1e-6f -> 0f
                mx == r -> ((g - b) / d / 6f + 1f) % 1f
                mx == g -> ((b - r) / d + 2f) / 6f
                else -> ((r - g) / d + 4f) / 6f
            }
            return floatArrayOf(h, if (mx > 0f) d / mx else 0f, mx)
        }

        internal fun rgb(h: Float, s: Float, v: Float): FloatArray {
            fun f(n: Float): Float {
                val k = (n + h * 6f) % 6f
                return v - v * s * min(k, 4f - k).coerceIn(0f, 1f)
            }
            return floatArrayOf(f(5f), f(3f), f(1f))
        }

        private fun smooth(e0: Float, e1: Float, x: Float): Float {
            val t = ((x - e0) / (e1 - e0)).coerceIn(0f, 1f)
            return t * t * (3f - 2f * t)
        }

        private fun mix(a: FloatArray, b: FloatArray, t: Float) = FloatArray(3) { a[it] + (b[it] - a[it]) * t }

        private fun f(x: Float) = "%.5f".format(java.util.Locale.ROOT, x)
    }
}
