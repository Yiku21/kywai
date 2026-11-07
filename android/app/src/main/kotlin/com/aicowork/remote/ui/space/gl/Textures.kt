package com.aicowork.remote.ui.space.gl

import com.aicowork.remote.i18n.t

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import androidx.core.graphics.PathParser
import com.aicowork.remote.ui.space.RobotLogo
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Texturas del espacio dibujadas con Canvas, las mismas que el escritorio dibuja con `<canvas>` (`assets.ts`,
 * `Zones.tsx`, `logos.ts`). Se dibujan en blanco y el material las tiñe.
 */
internal object SceneTextures {
    private val bold = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
    private val medium = Typeface.create("sans-serif-medium", Typeface.NORMAL)

    fun canvas(w: Int, h: Int, draw: (Canvas) -> Unit): Bitmap =
        Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { draw(Canvas(it)) }

    private fun stroke(width: Float, color: Int = Color.WHITE) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = width
        this.color = color
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }

    private fun fill(color: Int = Color.WHITE) = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }

    private fun rgba(r: Int, g: Int, b: Int, a: Float) = Color.argb((a * 255).toInt(), r, g, b)

    /** Brillo radial blanco → transparente. */
    fun glow(): Bitmap = canvas(128, 128) { c ->
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.shader = RadialGradient(
            64f, 64f, 64f,
            intArrayOf(rgba(255, 255, 255, 1f), rgba(255, 255, 255, 0.55f), rgba(255, 255, 255, 0.12f), rgba(255, 255, 255, 0f)),
            floatArrayOf(0f, 0.25f, 0.6f, 1f), Shader.TileMode.CLAMP,
        )
        c.drawRect(0f, 0f, 128f, 128f, p)
    }

    /** Símbolo de verificación. */
    fun check(): Bitmap = canvas(128, 128) { c ->
        c.drawCircle(64f, 64f, 52f, stroke(9f))
        val path = Path().apply { moveTo(38f, 66f); lineTo(56f, 84f); lineTo(92f, 46f) }
        c.drawPath(path, stroke(12f))
    }

    /** Icono de documento para los paquetes y el núcleo. */
    fun document(): Bitmap = canvas(128, 160) { c ->
        val r = 14f
        val path = Path().apply {
            moveTo(10 + r, 8f); lineTo(88f, 8f); lineTo(118f, 38f); lineTo(118f, 152 - r)
            quadTo(118f, 152f, 118 - r, 152f); lineTo(10 + r, 152f); quadTo(10f, 152f, 10f, 152 - r)
            lineTo(10f, 8 + r); quadTo(10f, 8f, 10 + r, 8f); close()
        }
        c.drawPath(path, fill(rgba(255, 255, 255, 0.22f)))
        c.drawPath(path, stroke(6f, rgba(255, 255, 255, 0.95f)).apply { strokeCap = Paint.Cap.BUTT })
        c.drawPath(Path().apply { moveTo(88f, 8f); lineTo(88f, 38f); lineTo(118f, 38f) }, stroke(6f, rgba(255, 255, 255, 0.95f)))
        val bars = fill(rgba(255, 255, 255, 0.9f))
        for (i in 0 until 5) {
            val w = if (i == 0) 44f else 78f - (i % 2) * 18f
            c.drawRect(28f, 56f + i * 18f, 28f + w, 63f + i * 18f, bars)
        }
    }

    /** Muros holográficos del fondo («IDEAS / PERSONAS…»). */
    fun wall(lines: List<String>, alignRight: Boolean): Bitmap = canvas(512, 768) { c ->
        val italic = Typeface.create(medium, Typeface.ITALIC)
        val p = fill(rgba(150, 215, 255, 0.8f)).apply {
            typeface = italic
            textSize = 44f
            textAlign = if (alignRight) Paint.Align.RIGHT else Paint.Align.LEFT
        }
        val x = if (alignRight) 466f else 46f
        val top = 160f
        lines.forEachIndexed { i, t -> c.drawText(t, x, top + i * 58f, p) }
        val y = top + lines.size * 58f + 6f
        c.drawRect(if (alignRight) x - 46f else x, y, if (alignRight) x else x + 46f, y + 5f, fill(rgba(150, 215, 255, 0.8f)))
    }

    private fun title(c: Canvas, lines: List<String>, x: Float, y: Float, size: Float) {
        val p = fill(rgba(235, 242, 255, 0.98f)).apply { typeface = bold; textSize = size }
        lines.forEachIndexed { i, t -> c.drawText(t, x, y + i * size * 1.08f, p) }
    }

    private fun list(c: Canvas, items: List<String>, x: Float, y: Float) {
        val text = fill(rgba(225, 235, 255, 0.92f)).apply { typeface = medium; textSize = 34f }
        val bullet = fill(rgba(160, 190, 255, 0.9f))
        items.forEachIndexed { i, t ->
            val yy = y + i * 54f
            c.drawPath(Path().apply { moveTo(x, yy - 20f); lineTo(x + 12f, yy - 11f); lineTo(x, yy - 2f); close() }, bullet)
            c.drawText(t, x + 28f, yy, text)
        }
    }

    /** Panel «Nuevas tareas» con el símbolo +. */
    fun tasks(): Bitmap = canvas(512, 620) { c ->
        title(c, listOf(t("Nuevas"), t("tareas")), 44f, 104f, 72f)
        c.drawCircle(256f, 410f, 118f, stroke(10f, rgba(235, 245, 255, 0.95f)))
        val plus = stroke(16f, rgba(235, 245, 255, 0.95f))
        c.drawLine(256f, 350f, 256f, 470f, plus)
        c.drawLine(196f, 410f, 316f, 410f, plus)
    }

    enum class ZoneIcon { Folder, Brain }

    /** Panel con icono, título y lista (Archivos, Memoria). */
    fun iconTitle(titleText: String, items: List<String>, icon: ZoneIcon): Bitmap = canvas(512, 512) { c ->
        val s = stroke(6f, rgba(235, 245, 255, 0.95f))
        when (icon) {
            ZoneIcon.Folder -> c.drawPath(Path().apply {
                moveTo(40f, 52f); lineTo(62f, 52f); lineTo(70f, 62f); lineTo(94f, 62f); lineTo(94f, 98f); lineTo(40f, 98f); close()
            }, s)
            ZoneIcon.Brain -> {
                val path = Path()
                path.arcTo(RectF(34f, 50f, 78f, 94f), 90f, (1.1f * 180f))
                path.arcTo(RectF(60f, 40f, 96f, 76f), 1.1f * 180f, 180f)
                path.arcTo(RectF(64f, 70f, 96f, 102f), 1.7f * 180f, 0.9f * 180f)
                c.drawPath(path, s)
                c.drawLine(66f, 60f, 66f, 98f, s)
            }
        }
        title(c, listOf(titleText), 112f, 92f, 56f)
        list(c, items, 50f, 200f)
    }

    /** Hoja de carpeta (pila de la zona de archivos). */
    fun folderSheet(): Bitmap = canvas(256, 200) { c ->
        val path = Path().apply { moveTo(10f, 30f); lineTo(90f, 30f); lineTo(110f, 54f); lineTo(246f, 54f); lineTo(246f, 190f); lineTo(10f, 190f); close() }
        c.drawPath(path, fill(rgba(255, 255, 255, 0.18f)))
        c.drawPath(path, stroke(6f, rgba(255, 255, 255, 0.9f)))
    }

    enum class Tool { Terminal, Web, Code, Plug }

    fun toolIcon(kind: Tool): Bitmap = canvas(128, 128) { c ->
        val s = stroke(8f)
        val path = Path()
        when (kind) {
            Tool.Terminal -> { path.moveTo(30f, 42f); path.lineTo(56f, 64f); path.lineTo(30f, 86f); path.moveTo(66f, 88f); path.lineTo(98f, 88f) }
            Tool.Web -> {
                path.addCircle(64f, 64f, 38f, Path.Direction.CW)
                path.moveTo(26f, 64f); path.lineTo(102f, 64f)
                path.addOval(RectF(48f, 26f, 80f, 102f), Path.Direction.CW)
            }
            Tool.Code -> {
                path.moveTo(44f, 40f); path.lineTo(22f, 64f); path.lineTo(44f, 88f)
                path.moveTo(84f, 40f); path.lineTo(106f, 64f); path.lineTo(84f, 88f)
                path.moveTo(72f, 34f); path.lineTo(56f, 94f)
            }
            Tool.Plug -> {
                path.moveTo(48f, 26f); path.lineTo(48f, 46f); path.moveTo(80f, 26f); path.lineTo(80f, 46f)
                path.moveTo(34f, 46f); path.lineTo(94f, 46f); path.lineTo(94f, 62f)
                path.quadTo(94f, 84f, 64f, 84f); path.quadTo(34f, 84f, 34f, 62f); path.close()
                path.moveTo(64f, 84f); path.lineTo(64f, 104f)
            }
        }
        c.drawPath(path, s)
    }

    fun titleOnly(text: String): Bitmap = canvas(512, 128) { c -> title(c, listOf(text), 30f, 84f, 58f) }

    // ---------- Logos (`logos.ts`, caja de 100 × 100) ----------

    private class LogoDef(val fill: List<String> = emptyList(), val stroke: List<String> = emptyList(), val width: Float = 6f, val dots: List<FloatArray> = emptyList())

    private fun rot(x: Float, y: Float, a: Float): Pair<Float, Float> {
        val c = cos(a); val s = sin(a)
        val dx = x - 50f; val dy = y - 50f
        return (50f + dx * c - dy * s) to (50f + dx * s + dy * c)
    }

    private fun f(v: Float) = "%.2f".format(java.util.Locale.ROOT, v)

    private fun polyline(pts: List<Pair<Float, Float>>) = pts.mapIndexed { i, (x, y) -> "${if (i > 0) "L" else "M"}${f(x)} ${f(y)}" }.joinToString(" ")

    private fun claudeRays() = (0 until 12).map { i ->
        val a = i / 12f * PI.toFloat() * 2f + (i % 3) * 0.05f
        val r2 = if (i % 2 == 1) 34f else 44f
        polyline(listOf((50f + cos(a) * 9f) to (50f + sin(a) * 9f), (50f + cos(a) * r2) to (50f + sin(a) * r2)))
    }

    private fun qwenPieces() = (0 until 3).map { k ->
        polyline(listOf(30f to 31f, 57f to 31f, 68f to 50f).map { (x, y) -> rot(x, y, k * 2f * PI.toFloat() / 3f) })
    }

    private fun openaiLoops() = (0 until 6).map { k ->
        val a = k * PI.toFloat() / 3f
        val w = 13f; val top = 18f; val bottom = 58f
        val l1 = rot(50 - w, top + w, a); val l2 = rot(50 - w, bottom, a); val r2 = rot(50 + w, bottom, a)
        val r1 = rot(50 + w, top + w, a); val tip = rot(50f, top, a)
        val q1 = rot(50 - w, top, a); val q2 = rot(50 + w, top, a)
        "M${f(l2.first)} ${f(l2.second)} L${f(l1.first)} ${f(l1.second)} Q${f(q1.first)} ${f(q1.second)} ${f(tip.first)} ${f(tip.second)} " +
            "Q${f(q2.first)} ${f(q2.second)} ${f(r1.first)} ${f(r1.second)} L${f(r2.first)} ${f(r2.second)}"
    }

    private fun logoDef(logo: RobotLogo): LogoDef? = when (logo) {
        RobotLogo.Gemini -> LogoDef(fill = listOf("M50 6 C53 35 65 47 94 50 C65 53 53 65 50 94 C47 65 35 53 6 50 C35 47 47 35 50 6 Z"))
        RobotLogo.Claude -> LogoDef(stroke = claudeRays(), width = 6.5f)
        RobotLogo.Qwen -> LogoDef(stroke = qwenPieces(), width = 11f)
        RobotLogo.OpenAI -> LogoDef(stroke = openaiLoops(), width = 5.5f)
        RobotLogo.Local -> LogoDef(
            stroke = listOf(
                "M30 30 L70 30 L70 70 L30 70 Z", "M42 42 L58 42 L58 58 L42 58 Z",
                "M40 18 L40 30 M50 18 L50 30 M60 18 L60 30 M40 70 L40 82 M50 70 L50 82 M60 70 L60 82 M18 40 L30 40 M18 50 L30 50 M18 60 L30 60 M70 40 L82 40 M70 50 L82 50 M70 60 L82 60",
            ),
            width = 6f,
        )
        RobotLogo.Hermes -> LogoDef(
            fill = listOf(
                "M47 27 C38 19 24 16 6 18 C14 22 19 24 23 26 C16 26 12 27 8 30 C17 32 24 32 30 32 C25 34 22 36 19 39 C29 39 39 36 47 31 Z",
                "M53 27 C62 19 76 16 94 18 C86 22 81 24 77 26 C84 26 88 27 92 30 C83 32 76 32 70 32 C75 34 78 36 81 39 C71 39 61 36 53 31 Z",
            ),
            stroke = listOf(
                "M50 18 L50 95",
                "M58 40 C66 44 63 51 50 55 C37 59 37 67 50 71 C61 74 61 82 50 87",
                "M42 40 C34 44 37 51 50 55 C63 59 63 67 50 71 C39 74 39 82 50 87",
            ),
            width = 5f,
            dots = listOf(floatArrayOf(50f, 12f, 6f), floatArrayOf(59f, 39f, 3.6f), floatArrayOf(41f, 39f, 3.6f)),
        )
        RobotLogo.Becario -> LogoDef(stroke = listOf("M38 30 L38 70", "M38 58 A17 17 0 1 1 38 59.5"), width = 9f, dots = listOf(floatArrayOf(38f, 22f, 8f)))
        // Garabato de Muse (Meta): una línea ondulada que sube y baja en tres trazos.
        RobotLogo.Muse -> LogoDef(stroke = listOf("M6 50 Q22 14 22 50 Q22 84 36 54 Q50 22 49 52 Q48 84 62 58 Q76 30 77 56 Q78 84 88 70 L95 58"), width = 10f)
        RobotLogo.None -> null
    }

    /** Logo del pecho con un halo blanco suave, como el escritorio. */
    fun logo(logo: RobotLogo): Bitmap? {
        val def = logoDef(logo) ?: return null
        return canvas(256, 256) { c ->
            c.save()
            c.scale(2.56f, 2.56f)
            val glow = Color.argb(230, 255, 255, 255)
            val fillPaint = fill().apply { setShadowLayer(4f, 0f, 0f, glow) }
            val strokePaint = stroke(def.width).apply { setShadowLayer(4f, 0f, 0f, glow) }
            for (d in def.fill) c.drawPath(PathParser.createPathFromPathData(d), fillPaint)
            for (d in def.stroke) c.drawPath(PathParser.createPathFromPathData(d), strokePaint)
            for (dot in def.dots) c.drawCircle(dot[0], dot[1], dot[2], fillPaint)
            c.restore()
        }
    }
}
