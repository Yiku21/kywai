package com.aicowork.remote.ui.space.gl

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.opengl.GLES20
import android.text.TextPaint
import android.text.TextUtils
import com.aicowork.remote.ui.space.AgentVisual
import com.aicowork.remote.ui.space.SceneAgent
import com.aicowork.remote.ui.space.WorldSim
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Etiqueta dibujada en una textura (en píxeles de pantalla). [bar] es el hueco de la barra de progreso, en
 * fracciones de la etiqueta: la barra se anima aparte, sin redibujar la textura.
 */
internal class LabelTexture(val texture: Int, val key: String, val width: Int, val height: Int, val bar: RectF?)

/**
 * Tarjetas flotantes sobre los robots, como `RobotLabel` del escritorio (nombre y modelo, estado con su icono, motivo
 * del error y barra de progreso) pero con el estilo de los paneles de cristal de la interfaz: tarjeta oscura
 * translúcida con esquinas redondeadas, borde fino y texto nítido. También el rótulo «Proyecto» del núcleo y los
 * textos temporales de los envíos («Enviando: …», «Recibido»…). Se dibujan en el hilo de OpenGL.
 */
internal class LabelTextures(density: Float) {
    private val cache = HashMap<String, LabelTexture>()
    /** Píxeles por «px» CSS del escritorio. */
    private val px = (density * 0.8f).coerceIn(1.3f, 3.4f)

    private val namePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFEEF2FA.toInt(); textSize = 12.5f * px; typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    }
    private val modelPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF8D99AE.toInt(); textSize = 10.5f * px }
    private val statusPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 11.5f * px }
    private val reasonPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 11f * px }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 1.4f * px; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
    }
    private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }

    fun robot(agent: SceneAgent, selected: Boolean, override: WorldSim.LabelOverride? = null): LabelTexture {
        val pct = if (agent.busy && override == null) agent.progress?.let { "${(it * 100).toInt()} %" } else null
        val reason = agent.reason?.takeIf { override == null && (agent.visual == AgentVisual.Error || agent.visual == AgentVisual.Offline) }
        val key = listOf(agent.name, agent.modelLabel, agent.statusText, agent.visual, agent.color, agent.attention, selected, pct, reason, override?.text, override?.tone).joinToString("|")
        cache["robot:${agent.id}"]?.let { if (it.key == key) return it else delete(it) }
        return drawRobot(agent, selected, pct, reason, override, key).also { cache["robot:${agent.id}"] = it }
    }

    fun core(project: String?): LabelTexture {
        val key = project.orEmpty()
        cache["core"]?.let { if (it.key == key) return it else delete(it) }
        return drawCore(project, key).also { cache["core"] = it }
    }

    /** Borra las de agentes que ya no están. */
    fun retain(agentIds: Set<String>) {
        val stale = cache.keys.filter { it.startsWith("robot:") && it.removePrefix("robot:") !in agentIds }
        stale.forEach { cache.remove(it)?.let(::delete) }
    }

    /** El contexto se ha perdido: las texturas ya no existen. */
    fun invalidate() = cache.clear()

    /** Borra todas las texturas (cambio de densidad con el contexto vivo). */
    fun release() {
        cache.values.forEach(::delete)
        cache.clear()
    }

    private fun delete(label: LabelTexture) = GLES20.glDeleteTextures(1, intArrayOf(label.texture), 0)

    /** Tarjeta de cristal oscuro: sombra suave, relleno translúcido con un leve degradado y borde fino. */
    private fun card(c: Canvas, rect: RectF, radius: Float, shadow: Float, edge: Int, edgeWidth: Float) {
        val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x59000000; maskFilter = BlurMaskFilter(shadow, BlurMaskFilter.Blur.NORMAL) }
        c.drawRoundRect(RectF(rect.left, rect.top + shadow * 0.5f, rect.right, rect.bottom + shadow * 0.5f), radius, radius, shadowPaint)
        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(0f, rect.top, 0f, rect.bottom, 0xD9141B2E.toInt(), 0xD90B101D.toInt(), Shader.TileMode.CLAMP)
        }
        c.drawRoundRect(rect, radius, radius, fill)
        border.strokeWidth = edgeWidth
        border.color = edge
        val inset = edgeWidth / 2f
        c.drawRoundRect(RectF(rect.left + inset, rect.top + inset, rect.right - inset, rect.bottom - inset), radius - inset, radius - inset, border)
    }

    private fun drawRobot(agent: SceneAgent, selected: Boolean, pct: String?, reason: String?, override: WorldSim.LabelOverride?, key: String): LabelTexture {
        val padX = 11f * px
        val padTop = 7f * px
        val gap = 4f * px
        val dot = 8f * px
        val error = agent.visual == AgentVisual.Error
        val statusText = override?.text ?: agent.statusText
        statusPaint.color = when {
            override != null -> when (override.tone) {
                WorldSim.Tone.Send, WorldSim.Tone.Receive -> 0xFFA9CBFF.toInt()
                WorldSim.Tone.Done -> 0xFF93E8BC.toInt()
                WorldSim.Tone.Error -> 0xFFFF9AA6.toInt()
            }
            agent.attention -> 0xFFF6C980.toInt()
            error -> 0xFFFF9AA6.toInt()
            else -> 0xFFB4BFD2.toInt()
        }
        reasonPaint.color = if (error) 0xFFFFB3BC.toInt() else 0xFF98A5BB.toInt()
        iconPaint.color = statusPaint.color

        val nameW = namePaint.measureText(agent.name)
        val modelW = if (agent.modelLabel.isBlank()) 0f else modelPaint.measureText(agent.modelLabel) + 8f * px
        val icon = 12f * px
        val pctW = pct?.let { statusPaint.measureText(it) + 6f * px } ?: 0f
        val headW = dot + 7f * px + nameW + modelW
        val statusW = icon + 5f * px + statusPaint.measureText(statusText) + pctW
        val inner = maxOf(headW, statusW).coerceIn(110f * px, 178f * px)
        val width = (inner + padX * 2).toInt()

        val nameH = namePaint.fontSpacing
        val statusH = statusPaint.fontSpacing
        val reasonLines = reason?.let { wrap(it, reasonPaint, inner).take(2) } ?: emptyList()
        val barH = if (agent.busy && override == null) 3f * px else 0f
        var height = padTop + nameH + gap + statusH
        if (reasonLines.isNotEmpty()) height += gap + reasonLines.size * reasonPaint.fontSpacing
        if (barH > 0f) height += gap + barH
        height += 8f * px
        val shadow = 6f * px
        val h = (height + shadow * 2).toInt()
        val w = width + (shadow * 2).toInt()

        val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bitmap)
        val rect = RectF(shadow, shadow, shadow + width, shadow + height)
        val edge = when {
            selected -> (agent.color and 0x00FFFFFF) or 0xCC000000.toInt()
            agent.attention -> 0x8CF5B54A.toInt()
            else -> 0x26FFFFFF
        }
        card(c, rect, 12f * px, shadow, edge, (if (selected) 1.4f else 1f) * px)

        var y = rect.top + padTop
        val baseline = y - namePaint.fontMetrics.ascent
        val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = agent.color }
        val dotCy = y + nameH / 2f
        c.drawCircle(rect.left + padX + dot / 2f, dotCy, dot / 2f, dotPaint)
        val nameX = rect.left + padX + dot + 7f * px
        val nameMax = inner - dot - 7f * px - modelW
        c.drawText(TextUtils.ellipsize(agent.name, namePaint, nameMax, TextUtils.TruncateAt.END).toString(), nameX, baseline, namePaint)
        if (modelW > 0f) {
            modelPaint.textAlign = Paint.Align.RIGHT
            c.drawText(agent.modelLabel, rect.right - padX, baseline, modelPaint)
        }
        y += nameH + gap

        val statusBase = y - statusPaint.fontMetrics.ascent
        val iconCx = rect.left + padX + icon / 2f
        val iconCy = y + statusH / 2f
        when {
            override != null -> drawToneIcon(c, override.tone, iconCx, iconCy, icon / 2f)
            agent.attention -> drawAttentionIcon(c, iconCx, iconCy, icon / 2f)
            else -> drawIcon(c, agent.visual, iconCx, iconCy, icon / 2f)
        }
        val textX = rect.left + padX + icon + 5f * px
        c.drawText(TextUtils.ellipsize(statusText, statusPaint, inner - icon - 5f * px - pctW, TextUtils.TruncateAt.END).toString(), textX, statusBase, statusPaint)
        if (pct != null) {
            statusPaint.textAlign = Paint.Align.RIGHT
            c.drawText(pct, rect.right - padX, statusBase, statusPaint)
            statusPaint.textAlign = Paint.Align.LEFT
        }
        y += statusH
        for (line in reasonLines) {
            y += if (line === reasonLines.first()) gap else 0f
            c.drawText(line, rect.left + padX, y - reasonPaint.fontMetrics.ascent, reasonPaint)
            y += reasonPaint.fontSpacing
        }
        var bar: RectF? = null
        if (barH > 0f) {
            y += gap
            val track = RectF(rect.left + padX, y, rect.right - padX, y + barH)
            c.drawRoundRect(track, barH, barH, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x24FFFFFF })
            bar = RectF(track.left / w, track.top / h, track.right / w, track.bottom / h)
        }
        return LabelTexture(upload(bitmap), key, w, h, bar)
    }

    private fun drawCore(project: String?, key: String): LabelTexture {
        val title = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFE6F0FA.toInt(); textSize = 13.5f * px; typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            textAlign = Paint.Align.CENTER
        }
        val sub = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF93A9C2.toInt(); textSize = 11f * px; textAlign = Paint.Align.CENTER }
        val name = project?.let { TextUtils.ellipsize(it, sub, 220f * px, TextUtils.TruncateAt.END).toString() }.orEmpty()
        val shadow = 5f * px
        val cardW = maxOf(title.measureText("Proyecto"), sub.measureText(name)) + 26f * px
        val cardH = title.fontSpacing + (if (name.isEmpty()) 0f else sub.fontSpacing) + 10f * px
        val w = (cardW + shadow * 2).toInt()
        val h = (cardH + shadow * 2).toInt()
        val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bitmap)
        val rect = RectF(shadow, shadow, shadow + cardW, shadow + cardH)
        card(c, rect, 11f * px, shadow, 0x2E8FC8FF, 1f * px)
        val y = rect.top + 5f * px - title.fontMetrics.ascent
        c.drawText("Proyecto", w / 2f, y, title)
        if (name.isNotEmpty()) c.drawText(name, w / 2f, y + title.fontMetrics.descent - sub.fontMetrics.ascent + 1f * px, sub)
        return LabelTexture(upload(bitmap), key, w, h, null)
    }

    /** Iconos de los textos temporales: enviar (flecha arriba), recibir (flecha a la bandeja), hecho y error. */
    private fun drawToneIcon(c: Canvas, tone: WorldSim.Tone, cx: Float, cy: Float, r: Float) {
        val p = iconPaint
        when (tone) {
            WorldSim.Tone.Send -> {
                c.drawLine(cx - r * 0.6f, cy + r * 0.6f, cx + r * 0.6f, cy - r * 0.6f, p)
                c.drawLine(cx - r * 0.1f, cy - r * 0.6f, cx + r * 0.6f, cy - r * 0.6f, p)
                c.drawLine(cx + r * 0.6f, cy - r * 0.6f, cx + r * 0.6f, cy + r * 0.1f, p)
            }
            WorldSim.Tone.Receive -> {
                c.drawLine(cx, cy - r * 0.9f, cx, cy + r * 0.25f, p)
                c.drawLine(cx - r * 0.45f, cy - r * 0.2f, cx, cy + r * 0.25f, p)
                c.drawLine(cx + r * 0.45f, cy - r * 0.2f, cx, cy + r * 0.25f, p)
                c.drawLine(cx - r * 0.85f, cy + r * 0.85f, cx + r * 0.85f, cy + r * 0.85f, p)
            }
            WorldSim.Tone.Done -> {
                val path = Path().apply { moveTo(cx - r * 0.75f, cy + r * 0.05f); lineTo(cx - r * 0.2f, cy + r * 0.6f); lineTo(cx + r * 0.8f, cy - r * 0.55f) }
                c.drawPath(path, p)
            }
            WorldSim.Tone.Error -> {
                c.drawCircle(cx, cy, r * 0.85f, p)
                c.drawLine(cx - r * 0.35f, cy - r * 0.35f, cx + r * 0.35f, cy + r * 0.35f, p)
                c.drawLine(cx + r * 0.35f, cy - r * 0.35f, cx - r * 0.35f, cy + r * 0.35f, p)
            }
        }
    }

    /** «!» en un círculo: necesita tu respuesta. */
    private fun drawAttentionIcon(c: Canvas, cx: Float, cy: Float, r: Float) {
        val p = iconPaint
        c.drawCircle(cx, cy, r * 0.88f, p)
        c.drawLine(cx, cy - r * 0.45f, cx, cy + r * 0.1f, p)
        c.drawPoint(cx, cy + r * 0.45f, p)
    }

    /** Iconos del estado (los de `lucide` del escritorio, simplificados). */
    private fun drawIcon(c: Canvas, visual: AgentVisual, cx: Float, cy: Float, r: Float) {
        val p = iconPaint
        val path = Path()
        when (visual) {
            AgentVisual.Thinking -> { // cerebro
                c.drawCircle(cx - r * 0.3f, cy, r * 0.62f, p)
                c.drawCircle(cx + r * 0.3f, cy, r * 0.62f, p)
            }
            AgentVisual.Working -> for (i in 0 until 8) { // cargando
                val a = i * PI.toFloat() / 4f
                c.drawLine(cx + cos(a) * r * 0.45f, cy + sin(a) * r * 0.45f, cx + cos(a) * r * 0.95f, cy + sin(a) * r * 0.95f, p)
            }
            AgentVisual.Waiting -> { // reloj de arena
                path.moveTo(cx - r * 0.6f, cy - r * 0.9f); path.lineTo(cx + r * 0.6f, cy - r * 0.9f); path.lineTo(cx - r * 0.6f, cy + r * 0.9f)
                path.lineTo(cx + r * 0.6f, cy + r * 0.9f); path.close()
                c.drawPath(path, p)
            }
            AgentVisual.Error -> { // aviso
                path.moveTo(cx, cy - r * 0.9f); path.lineTo(cx + r * 0.95f, cy + r * 0.8f); path.lineTo(cx - r * 0.95f, cy + r * 0.8f); path.close()
                c.drawPath(path, p)
                c.drawLine(cx, cy - r * 0.3f, cx, cy + r * 0.2f, p)
                c.drawPoint(cx, cy + r * 0.52f, p)
            }
            AgentVisual.Offline -> { // apagado
                c.drawArc(RectF(cx - r * 0.8f, cy - r * 0.7f, cx + r * 0.8f, cy + r * 0.9f), -60f, 300f, false, p)
                c.drawLine(cx, cy - r * 0.95f, cx, cy, p)
            }
            AgentVisual.Resting -> { // luna
                path.addCircle(cx, cy, r * 0.85f, Path.Direction.CW)
                val cut = Path().apply { addCircle(cx + r * 0.5f, cy - r * 0.4f, r * 0.7f, Path.Direction.CW) }
                path.op(cut, Path.Op.DIFFERENCE)
                c.drawPath(path, p)
            }
            AgentVisual.Paused -> { // pausa
                c.drawLine(cx - r * 0.35f, cy - r * 0.7f, cx - r * 0.35f, cy + r * 0.7f, p)
                c.drawLine(cx + r * 0.35f, cy - r * 0.7f, cx + r * 0.35f, cy + r * 0.7f, p)
            }
            AgentVisual.Idle -> { // destellos
                path.moveTo(cx, cy - r); path.quadTo(cx, cy, cx + r, cy); path.quadTo(cx, cy, cx, cy + r)
                path.quadTo(cx, cy, cx - r, cy); path.quadTo(cx, cy, cx, cy - r); path.close()
                c.drawPath(path, p)
            }
        }
    }

    private fun wrap(text: String, paint: TextPaint, width: Float): List<String> {
        val words = text.split(Regex("\\s+"))
        val lines = ArrayList<String>()
        var line = ""
        for (word in words) {
            val candidate = if (line.isEmpty()) word else "$line $word"
            if (paint.measureText(candidate) <= width || line.isEmpty()) line = candidate else { lines += line; line = word }
        }
        if (line.isNotEmpty()) lines += line
        if (lines.size > 2) lines[1] = TextUtils.ellipsize(lines[1] + " …", paint, width, TextUtils.TruncateAt.END).toString()
        return lines.map { TextUtils.ellipsize(it, paint, width, TextUtils.TruncateAt.END).toString() }
    }
}
