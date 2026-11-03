package com.aicowork.remote.ui.space.gl

import com.aicowork.remote.ui.space.EyeShape
import com.aicowork.remote.ui.space.RobotBody
import com.aicowork.remote.ui.space.Seeded
import com.aicowork.remote.ui.space.SpaceLayout
import com.aicowork.remote.ui.space.SpaceZone
import com.aicowork.remote.ui.space.Vec3
import com.aicowork.remote.ui.space.smoothstep
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.round
import kotlin.math.sign
import kotlin.math.sin
import kotlin.math.sqrt

private const val PIf = PI.toFloat()

/** Atributos estándar: posición, normal y (opcional) coordenadas de textura. */
val POS_NORMAL = listOf("aPos" to 3, "aNormal" to 3)
val POS_NORMAL_UV = listOf("aPos" to 3, "aNormal" to 3, "aUV" to 2)

/** Malla en memoria: vértices intercalados según [attribs] e índices de triángulos (sin signo, hasta 65 535). */
class MeshData(val vertices: FloatArray, val indices: ShortArray, val attribs: List<Pair<String, Int>> = POS_NORMAL) {
    val stride get() = attribs.sumOf { it.second }
    val vertexCount get() = vertices.size / stride
}

internal class FloatList(capacity: Int = 256) {
    var data = FloatArray(capacity); private set
    var size = 0; private set
    fun add(v: Float) {
        if (size == data.size) data = data.copyOf(data.size * 2)
        data[size++] = v
    }
    operator fun get(i: Int) = data[i]
    operator fun set(i: Int, v: Float) { data[i] = v }
    fun toArray() = data.copyOf(size)
}

/** Constructor de mallas: vértices, triángulos y normales suaves calculadas a partir del orden de los triángulos. */
class MeshBuilder {
    private val p = FloatList()
    private val n = FloatList()
    private val t = FloatList()
    private val idx = ArrayList<Int>()
    val vertexCount get() = p.size / 3

    fun v(x: Float, y: Float, z: Float, u: Float = 0f, w: Float = 0f, nx: Float = 0f, ny: Float = 0f, nz: Float = 0f): Int {
        p.add(x); p.add(y); p.add(z)
        n.add(nx); n.add(ny); n.add(nz)
        t.add(u); t.add(w)
        return vertexCount - 1
    }

    fun tri(a: Int, b: Int, c: Int) { idx += a; idx += b; idx += c }

    fun x(i: Int) = p[i * 3]
    fun y(i: Int) = p[i * 3 + 1]
    fun z(i: Int) = p[i * 3 + 2]
    fun setPos(i: Int, x: Float, y: Float, z: Float) { p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z }
    fun setNormal(i: Int, x: Float, y: Float, z: Float) { n[i * 3] = x; n[i * 3 + 1] = y; n[i * 3 + 2] = z }
    fun normal(i: Int) = Vec3(n[i * 3], n[i * 3 + 1], n[i * 3 + 2])

    /** Normales por vértice: suma de (b − a) × (c − a) de sus triángulos (como `computeVertexNormals` de three.js). */
    fun computeNormals(): MeshBuilder {
        for (i in 0 until n.size) n[i] = 0f
        var k = 0
        while (k < idx.size) {
            val a = idx[k]; val b = idx[k + 1]; val c = idx[k + 2]
            val ux = x(b) - x(a); val uy = y(b) - y(a); val uz = z(b) - z(a)
            val vx = x(c) - x(a); val vy = y(c) - y(a); val vz = z(c) - z(a)
            val nx = uy * vz - uz * vy; val ny = uz * vx - ux * vz; val nz = ux * vy - uy * vx
            for (q in intArrayOf(a, b, c)) { n[q * 3] += nx; n[q * 3 + 1] += ny; n[q * 3 + 2] += nz }
            k += 3
        }
        normalize()
        return this
    }

    /** Suma las normales de vértices que ocupan el mismo sitio (costuras de superficies cerradas). */
    fun weld(pairs: List<Pair<Int, Int>>) {
        for ((a, b) in pairs) for (c in 0 until 3) {
            val s = n[a * 3 + c] + n[b * 3 + c]
            n[a * 3 + c] = s; n[b * 3 + c] = s
        }
        normalize()
    }

    private fun normalize() {
        for (i in 0 until vertexCount) {
            val l = sqrt(n[i * 3] * n[i * 3] + n[i * 3 + 1] * n[i * 3 + 1] + n[i * 3 + 2] * n[i * 3 + 2])
            if (l > 1e-10f) { n[i * 3] /= l; n[i * 3 + 1] /= l; n[i * 3 + 2] /= l }
        }
    }

    fun build(uv: Boolean = false): MeshData {
        val count = vertexCount
        require(count <= 65535) { "Malla demasiado grande: $count vértices" }
        val stride = if (uv) 8 else 6
        val out = FloatArray(count * stride)
        for (i in 0 until count) {
            val o = i * stride
            out[o] = p[i * 3]; out[o + 1] = p[i * 3 + 1]; out[o + 2] = p[i * 3 + 2]
            var nx = n[i * 3]; var ny = n[i * 3 + 1]; var nz = n[i * 3 + 2]
            if (nx * nx + ny * ny + nz * nz < 1e-12f) { nx = 0f; ny = 1f; nz = 0f }
            out[o + 3] = nx; out[o + 4] = ny; out[o + 5] = nz
            if (uv) { out[o + 6] = t[i * 2]; out[o + 7] = t[i * 2 + 1] }
        }
        return MeshData(out, ShortArray(idx.size) { idx[it].toShort() }, if (uv) POS_NORMAL_UV else POS_NORMAL)
    }

    /**
     * Rejilla u × v con triángulos (a, b, d) y (a, d, c): si u avanza hacia la derecha y v hacia arriba vistas desde
     * fuera, las normales apuntan hacia fuera. Con [closedU], la última columna repite la primera y se suelda.
     */
    fun grid(uSeg: Int, vSeg: Int, closedU: Boolean, point: (u: Float, v: Float) -> Vec3): MeshBuilder {
        val base = vertexCount
        val cols = uSeg + 1
        for (j in 0..vSeg) for (i in 0..uSeg) {
            val u = i.toFloat() / uSeg
            val w = j.toFloat() / vSeg
            val q = point(u, w)
            v(q.x, q.y, q.z, u, w)
        }
        for (j in 0 until vSeg) for (i in 0 until uSeg) {
            val a = base + j * cols + i
            val b = a + 1
            val c = a + cols
            val d = c + 1
            tri(a, b, d); tri(a, d, c)
        }
        computeNormals()
        if (closedU) weld((0..vSeg).map { base + it * cols to base + it * cols + uSeg })
        return this
    }
}

/**
 * Silueta de cada cuerpo de robot (`BODIES` de `robotModel.ts`): alto, ancho, fondo, exponente de superelipse del
 * perfil ([n]), ensanchamiento inferior ([k]), visor, ojos y logo.
 */
data class BodySpec(
    val box: Boolean,
    val h: Float, val w: Float, val d: Float, val n: Float, val k: Float,
    val visorY: Float, val visorW: Float, val visorH: Float, val visorR: Float,
    val eyeSpacing: Float, val eyeDy: Float,
    val logoY: Float, val logoSize: Float = 0.2f,
) {
    fun radiusAt(y: Float): Float {
        val s = (2f * y / h).coerceIn(-1f, 1f)
        val c = sqrt((1f - s * s).coerceAtLeast(0f))
        return (w / 2f) * c.pow(2f / n) * (1f - k * s)
    }

    /** Profundidad (z) de la superficie frontal en (x, y). */
    fun frontZ(x: Float, y: Float): Float {
        if (box) {
            val dx = max(0f, abs(x) - (w / 2f - BOX_R))
            val dy = max(0f, abs(y) - (h / 2f - BOX_R))
            val ox = BOX_R - sqrt(max(0f, BOX_R * BOX_R - dx * dx))
            val oy = BOX_R - sqrt(max(0f, BOX_R * BOX_R - dy * dy))
            return d / 2f - ox - oy
        }
        val r = radiusAt(y)
        return (d / w) * sqrt(max(0.0001f, r * r - x * x))
    }

    companion object {
        const val BOX_R = 0.24f

        fun of(body: RobotBody) = when (body) {
            RobotBody.Capsule -> BodySpec(false, 1.2f, 0.86f, 0.8f, 2.6f, 0.04f, 0.13f, 0.62f, 0.33f, 0.13f, 0.135f, 0f, -0.2f)
            RobotBody.Egg -> BodySpec(false, 1.12f, 0.95f, 0.88f, 2.0f, 0.17f, 0.1f, 0.6f, 0.29f, 0.12f, 0.14f, 0f, -0.21f)
            RobotBody.Blob -> BodySpec(false, 0.98f, 1.04f, 0.98f, 2.15f, 0.05f, 0.06f, 0.78f, 0.35f, 0.15f, 0.17f, -0.005f, -0.24f)
            RobotBody.Dome -> BodySpec(false, 1.16f, 0.96f, 0.88f, 2.4f, 0.1f, 0.1f, 0.7f, 0.34f, 0.14f, 0.155f, 0f, -0.25f, 0.3f)
            RobotBody.Cube -> BodySpec(true, 0.92f, 0.98f, 0.84f, 0f, 0f, 0.1f, 0.72f, 0.36f, 0.14f, 0.15f, 0f, -0.24f)
            // Bombilla (Muse): cabeza ancha que se estrecha hacia la base.
            RobotBody.Bulb -> BodySpec(false, 1.14f, 0.98f, 0.9f, 2.3f, -0.15f, 0.14f, 0.7f, 0.32f, 0.14f, 0.155f, 0f, -0.24f, 0.24f)
        }
    }
}

/** Mallas de los robots, como `buildRobot` del escritorio. */
object RobotGeometry {
    const val HAIR_T = 0.085f

    fun body(b: BodySpec): MeshData = if (b.box) roundedBox(b) else latheBody(b)

    private fun latheBody(b: BodySpec): MeshData {
        val steps = 56
        val profile = (0..steps).map { i ->
            val phi = -PIf / 2f + PIf * i / steps
            val y = b.h / 2f * sin(phi)
            (if (i == 0 || i == steps) 0f else b.radiusAt(y)) to y
        }
        return lathe(profile, 72, b.d / b.w).build()
    }

    /** Caja redondeada (radio 0,24) algo más estrecha arriba, con normales exactas. */
    private fun roundedBox(b: BodySpec): MeshData {
        val m = MeshBuilder()
        val hx = b.w / 2f - BodySpec.BOX_R
        val hy = b.h / 2f - BodySpec.BOX_R
        val hz = b.d / 2f - BodySpec.BOX_R
        val seg = 18
        // Cada cara de un cubo subdividido se proyecta sobre la superficie redondeada.
        val faces = listOf(
            Triple(Vec3(1f, 0f, 0f), Vec3(0f, 0f, -1f), Vec3(0f, 1f, 0f)),
            Triple(Vec3(-1f, 0f, 0f), Vec3(0f, 0f, 1f), Vec3(0f, 1f, 0f)),
            Triple(Vec3(0f, 1f, 0f), Vec3(1f, 0f, 0f), Vec3(0f, 0f, -1f)),
            Triple(Vec3(0f, -1f, 0f), Vec3(1f, 0f, 0f), Vec3(0f, 0f, 1f)),
            Triple(Vec3(0f, 0f, 1f), Vec3(1f, 0f, 0f), Vec3(0f, 1f, 0f)),
            Triple(Vec3(0f, 0f, -1f), Vec3(-1f, 0f, 0f), Vec3(0f, 1f, 0f)),
        )
        for ((normal, du, dv) in faces) {
            val base = m.vertexCount
            for (j in 0..seg) for (i in 0..seg) {
                val s = i.toFloat() / seg * 2f - 1f
                val t = j.toFloat() / seg * 2f - 1f
                // Cubo a esfera con reparto uniforme y luego a la caja: el ángulo decide el punto.
                val c = normal + du * s + dv * t
                val half = Vec3(hx + BodySpec.BOX_R, hy + BodySpec.BOX_R, hz + BodySpec.BOX_R)
                val dir = Vec3(c.x * half.x, c.y * half.y, c.z * half.z).normalized()
                var lo = 0f
                var hi = 2f
                repeat(32) {
                    val mid = (lo + hi) / 2f
                    if (roundBoxSdf(dir * mid, hx, hy, hz) < 0f) lo = mid else hi = mid
                }
                val q = dir * lo
                val nx = sign(q.x) * max(abs(q.x) - hx, 0f)
                val ny = sign(q.y) * max(abs(q.y) - hy, 0f)
                val nz = sign(q.z) * max(abs(q.z) - hz, 0f)
                val nl = sqrt(nx * nx + ny * ny + nz * nz).coerceAtLeast(1e-6f)
                val f = 1f - 0.05f * ((q.y + b.h / 2f) / b.h)
                m.v(q.x * f, q.y, q.z, nx = nx / nl, ny = ny / nl, nz = nz / nl)
            }
            val cols = seg + 1
            for (j in 0 until seg) for (i in 0 until seg) {
                val a = base + j * cols + i
                m.tri(a, a + 1, a + cols + 1); m.tri(a, a + cols + 1, a + cols)
            }
        }
        return m.build()
    }

    private fun roundBoxSdf(p: Vec3, hx: Float, hy: Float, hz: Float): Float {
        val qx = max(abs(p.x) - hx, 0f); val qy = max(abs(p.y) - hy, 0f); val qz = max(abs(p.z) - hz, 0f)
        val inside = min(max(abs(p.x) - hx, max(abs(p.y) - hy, abs(p.z) - hz)), 0f)
        return sqrt(qx * qx + qy * qy + qz * qz) + inside - BodySpec.BOX_R
    }

    /** Rectángulo redondeado en anillos (para curvarlo sobre el cuerpo), con coordenadas de textura. */
    fun roundedRectPatch(w: Float, h: Float, r: Float, rings: Int = 10, outline: Int = 72): MeshBuilder {
        val border = roundedRectOutline(w, h, r, outline)
        val m = MeshBuilder()
        m.v(0f, 0f, 0f, 0.5f, 0.5f)
        for (k in 1..rings) {
            val f = k.toFloat() / rings
            for ((x, y) in border) m.v(x * f, y * f, 0f, 0.5f + x * f / w, 0.5f + y * f / h)
        }
        for (j in 0 until outline) m.tri(0, 1 + j, 1 + (j + 1) % outline)
        for (k in 1 until rings) {
            val a = 1 + (k - 1) * outline
            val b2 = 1 + k * outline
            for (j in 0 until outline) {
                val j2 = (j + 1) % outline
                m.tri(a + j, b2 + j, b2 + j2); m.tri(a + j, b2 + j2, a + j2)
            }
        }
        return m
    }

    /** Contorno en sentido antihorario con puntos equiespaciados. */
    private fun roundedRectOutline(w: Float, h: Float, r: Float, count: Int): List<Pair<Float, Float>> {
        val dense = ArrayList<Pair<Float, Float>>()
        val x0 = -w / 2f; val y0 = -h / 2f
        fun line(ax: Float, ay: Float, bx: Float, by: Float) { for (i in 0 until 16) { val t = i / 16f; dense += (ax + (bx - ax) * t) to (ay + (by - ay) * t) } }
        fun corner(cx: Float, cy: Float, a0: Float) { for (i in 0 until 16) { val a = a0 + PIf / 2f * i / 16f; dense += (cx + r * cos(a)) to (cy + r * sin(a)) } }
        line(x0 + r, y0, x0 + w - r, y0); corner(x0 + w - r, y0 + r, -PIf / 2f)
        line(x0 + w, y0 + r, x0 + w, y0 + h - r); corner(x0 + w - r, y0 + h - r, 0f)
        line(x0 + w - r, y0 + h, x0 + r, y0 + h); corner(x0 + r, y0 + h - r, PIf / 2f)
        line(x0, y0 + h - r, x0, y0 + r); corner(x0 + r, y0 + r, PIf)
        val lengths = FloatArray(dense.size + 1)
        for (i in dense.indices) {
            val a = dense[i]; val b = dense[(i + 1) % dense.size]
            lengths[i + 1] = lengths[i] + hypot(b.first - a.first, b.second - a.second)
        }
        val total = lengths.last()
        var seg = 0
        return (0 until count).map { k ->
            val target = total * k / count
            while (lengths[seg + 1] < target) seg++
            val a = dense[seg]; val b = dense[(seg + 1) % dense.size]
            val f = ((target - lengths[seg]) / (lengths[seg + 1] - lengths[seg]).coerceAtLeast(1e-6f))
            (a.first + (b.first - a.first) * f) to (a.second + (b.second - a.second) * f)
        }
    }

    /** Proyecta una malla plana (z = 0) sobre la cara frontal del cuerpo, centrada en [cy], con un abombado opcional. */
    fun conform(m: MeshBuilder, b: BodySpec, cy: Float, lift: Float, bulge: Float = 0f): MeshBuilder {
        var maxX = 0f; var maxY = 0f
        for (i in 0 until m.vertexCount) { maxX = max(maxX, abs(m.x(i))); maxY = max(maxY, abs(m.y(i))) }
        for (i in 0 until m.vertexCount) {
            val x = m.x(i)
            val y = m.y(i) + cy
            var z = b.frontZ(x, y) + lift + m.z(i)
            if (bulge != 0f) {
                val u = x / maxX
                val v = (y - cy) / maxY
                z += bulge * max(0f, 1f - abs(u).pow(4) - abs(v).pow(4))
            }
            m.setPos(i, x, y, z)
        }
        return m.computeNormals()
    }

    fun visorBezel(b: BodySpec) = conform(roundedRectPatch(b.visorW + 0.05f, b.visorH + 0.05f, b.visorR + 0.025f), b, b.visorY, 0.002f).build()
    fun visorGlass(b: BodySpec) = conform(roundedRectPatch(b.visorW, b.visorH, b.visorR, 12, 80), b, b.visorY, 0.008f, 0.018f).build()
    fun logoPatch(b: BodySpec) = conform(roundedRectPatch(b.logoSize, b.logoSize, 0.001f, 8, 40), b, b.logoY, 0.006f).build(uv = true)

    /** Posición y orientación de cada ojo sobre la cara (sigue la curvatura del cuerpo). */
    data class EyeMount(val x: Float, val y: Float, val z: Float, val yaw: Float, val pitch: Float)

    fun eyeMount(b: BodySpec, side: Int): EyeMount {
        val x = side * b.eyeSpacing
        val y = b.visorY + b.eyeDy
        val z = b.frontZ(x, y) + 0.008f + 0.018f * 0.85f + 0.006f
        val dzdx = (b.frontZ(x + 0.01f, y) - b.frontZ(x - 0.01f, y)) / 0.02f
        val dzdy = (b.frontZ(x, y + 0.01f) - b.frontZ(x, y - 0.01f)) / 0.02f
        return EyeMount(x, y, z, -kotlin.math.atan(dzdx), kotlin.math.atan(dzdy))
    }

    // ---------- Formas de los ojos (planas, mirando a +Z) ----------

    private fun polygon(points: List<Pair<Float, Float>>): MeshData {
        val m = MeshBuilder()
        val c = m.v(0f, 0f, 0f, nz = 1f)
        for ((x, y) in points) m.v(x, y, 0f, nz = 1f)
        for (i in points.indices) m.tri(c, c + 1 + i, c + 1 + (i + 1) % points.size)
        return m.build()
    }

    fun circle(r: Float) = polygon((0 until 24).map { val a = it * 2f * PIf / 24; r * cos(a) to r * sin(a) })

    fun pill(w: Float, h: Float): MeshData {
        val r = h / 2f
        val pts = ArrayList<Pair<Float, Float>>()
        for (i in 0..12) { val a = -PIf / 2f + PIf * i / 12; pts += (w / 2f - r + r * cos(a)) to (r * sin(a)) }
        for (i in 0..12) { val a = PIf / 2f + PIf * i / 12; pts += (-w / 2f + r + r * cos(a)) to (r * sin(a)) }
        return polygon(pts)
    }

    /** Arco «sonriente» ◠ con puntas redondeadas. */
    fun arc(radius: Float, thick: Float): MeshData {
        val m = MeshBuilder()
        val a0 = PIf * 0.12f; val a1 = PIf * 0.88f
        val cy = -radius * 0.35f
        val seg = 20
        for (i in 0..seg) {
            val a = a0 + (a1 - a0) * i / seg
            m.v(cos(a) * radius, cy + sin(a) * radius, 0f, nz = 1f)
            m.v(cos(a) * (radius - thick), cy + sin(a) * (radius - thick), 0f, nz = 1f)
        }
        for (i in 0 until seg) { val o = i * 2; m.tri(o, o + 1, o + 3); m.tri(o, o + 3, o + 2) }
        // Puntas redondas
        for (a in floatArrayOf(a0, a1)) {
            val cx = cos(a) * (radius - thick / 2f); val cyy = cy + sin(a) * (radius - thick / 2f)
            val c = m.v(cx, cyy, 0f, nz = 1f)
            for (i in 0..12) { val b = i * 2f * PIf / 12; m.v(cx + cos(b) * thick / 2f, cyy + sin(b) * thick / 2f, 0f, nz = 1f) }
            for (i in 0 until 12) m.tri(c, c + 1 + i, c + 2 + i)
        }
        return m.build()
    }

    /** Onda «∿» de trazo grueso con puntas redondas (ojos de Muse, como su logo). [dir] = -1 la refleja. */
    fun wave(w: Float, amp: Float, thick: Float, dir: Int): MeshData {
        val n = 28
        val m = MeshBuilder()
        for (i in 0..n) {
            val x = -w / 2f + w * i / n
            val a = 2f * PIf * x / w
            val y = dir * amp * sin(a)
            val slope = dir * amp * (2f * PIf / w) * cos(a)
            val len = sqrt(slope * slope + 1f)
            val nx = -slope / len; val ny = 1f / len
            m.v(x + nx * thick / 2f, y + ny * thick / 2f, 0f, nz = 1f)
            m.v(x - nx * thick / 2f, y - ny * thick / 2f, 0f, nz = 1f)
        }
        for (i in 0 until n) { val o = i * 2; m.tri(o, o + 1, o + 3); m.tri(o, o + 3, o + 2) }
        // Puntas redondas
        for (x in floatArrayOf(-w / 2f, w / 2f)) {
            val y = dir * amp * sin(2f * PIf * x / w)
            val c = m.v(x, y, 0f, nz = 1f)
            for (i in 0..12) { val b = i * 2f * PIf / 12; m.v(x + cos(b) * thick / 2f, y + sin(b) * thick / 2f, 0f, nz = 1f) }
            for (i in 0 until 12) m.tri(c, c + 1 + i, c + 2 + i)
        }
        return m.build()
    }

    /** Chevron «>» ([dir] = 1) o «<» (-1). */
    fun chevron(dir: Int): MeshData {
        val w = 0.085f; val h = 0.12f; val t = 0.034f
        val m = MeshBuilder()
        fun q(vararg p: Float) {
            val o = m.vertexCount
            for (i in 0 until 4) m.v(p[i * 2] * dir, p[i * 2 + 1], 0f, nz = 1f)
            m.tri(o, o + 1, o + 2); m.tri(o, o + 2, o + 3)
        }
        q(-w / 2f, h / 2f, -w / 2f + t, h / 2f, w / 2f, 0f, w / 2f - t, 0f)
        q(w / 2f - t, 0f, w / 2f, 0f, -w / 2f + t, -h / 2f, -w / 2f, -h / 2f)
        return m.build()
    }

    fun eyeShape(shape: EyeShape, side: Int): MeshData = when (shape) {
        EyeShape.Pill -> pill(0.15f, 0.074f)
        EyeShape.Arc -> arc(0.078f, 0.028f)
        EyeShape.Chevron -> chevron(if (side < 0) 1 else -1)
        EyeShape.Dots -> circle(if (side < 0) 0.074f else 0.061f)
        EyeShape.Round -> circle(0.068f)
        EyeShape.Wave -> wave(0.15f, 0.022f, 0.034f, if (side < 0) 1 else -1)
    }

    // ---------- Accesorios ----------

    /** Mechón de Claude: tubo que se afina a lo largo de una curva. */
    fun tuft(top: Float): MeshData {
        val p0 = Vec3(0f, top - 0.16f, 0f); val p1 = Vec3(-0.02f, top + 0.1f, 0f)
        val p2 = Vec3(0.16f, top + 0.25f, 0f); val p3 = Vec3(0.38f, top + 0.12f, 0f)
        fun bez(t: Float): Vec3 {
            val u = 1f - t
            return p0 * (u * u * u) + p1 * (3f * u * u * t) + p2 * (3f * u * t * t) + p3 * (t * t * t)
        }
        return tube((0..40).map { bez(it / 40f) }, 18, { u -> 0.21f + (0.028f - 0.21f) * u.pow(0.75f) }, zScale = 0.85f).build()
    }

    /** Tubo a lo largo de [points] (en un plano cualquiera) con radio variable; coordenada u = recorrido. */
    fun tube(points: List<Vec3>, radial: Int, radius: (Float) -> Float, zScale: Float = 1f, up: Vec3 = Vec3(0f, 0f, 1f)): MeshBuilder {
        val m = MeshBuilder()
        val n = points.size
        val total = points.zipWithNext { a, b -> a.distanceTo(b) }.sum().coerceAtLeast(1e-6f)
        var acc = 0f
        for (i in 0 until n) {
            if (i > 0) acc += points[i].distanceTo(points[i - 1])
            val tangent = (points[min(n - 1, i + 1)] - points[max(0, i - 1)]).normalized()
            var normal = up.cross(tangent).normalized()
            if (normal == Vec3.Zero) normal = Vec3(1f, 0f, 0f).cross(tangent).normalized()
            val binormal = tangent.cross(normal)
            val r = radius(i.toFloat() / (n - 1))
            for (j in 0..radial) {
                val a = j * 2f * PIf / radial
                val off = normal * (cos(a) * r) + binormal * (sin(a) * r)
                m.v(points[i].x + off.x, points[i].y + off.y, points[i].z + off.z * zScale, acc / total, j.toFloat() / radial)
            }
        }
        val cols = radial + 1
        for (i in 0 until n - 1) for (j in 0 until radial) {
            val a = i * cols + j
            m.tri(a, a + cols, a + cols + 1); m.tri(a, a + cols + 1, a + 1)
        }
        m.computeNormals()
        m.weld((0 until n).map { it * cols to it * cols + radial })
        // Normales hacia fuera del eje del tubo, sea cual sea el sentido de los triángulos.
        for (i in 0 until n) for (j in 0..radial) {
            val k = i * cols + j
            val nn = m.normal(k)
            if (nn.dot(Vec3(m.x(k), m.y(k), m.z(k)) - points[i]) < 0f) m.setNormal(k, -nn.x, -nn.y, -nn.z)
        }
        return m
    }

    private fun bodyPoint(b: BodySpec, theta: Float, u: Float): Vec3 {
        val y = b.h / 2f * cos(u * PIf)
        val r = b.radiusAt(y)
        return Vec3(r * sin(theta), y, r * cos(theta) * (b.d / b.w))
    }

    private fun bodyNormal(b: BodySpec, p: Vec3): Vec3 =
        Vec3(p.x / (b.w / 2f).pow(2), p.y / (b.h / 2f).pow(2), p.z / (b.d / 2f).pow(2)).normalized()

    private fun uAt(b: BodySpec, y: Float) = acos((2f * y / b.h).coerceIn(-1f, 1f)) / PIf

    /** Melena corta de Hermes (`hairGeometry`): flequillo en mechones y laterales con las puntas hacia fuera. */
    fun hair(b: BodySpec): MeshData {
        val uBang = uAt(b, b.visorY + b.visorH / 2f + 0.035f)
        val uSide = uAt(b, b.visorY - b.visorH / 2f - 0.01f)
        val t0 = asin(min(0.99f, (b.visorW / 2f + 0.05f) / b.radiusAt(b.visorY)))
        val t1 = t0 + 0.14f
        val grooves = floatArrayOf(-t0 / 2f, 0f, t0 / 2f)
        fun sideW(th: Float) = smoothstep(t0, t1, abs(th))
        fun groove(th: Float) = min(1f, grooves.sumOf { g -> exp(-((th - g) / 0.045f).pow(2)).toDouble() }.toFloat())
        val nt = 192
        val nu = 34
        val rows = nu + 1
        val m = MeshBuilder()
        val outer = ArrayList<Vec3>(nt * rows)
        val inner = ArrayList<Vec3>(nt * rows)
        for (i in 0 until nt) {
            val th = -PIf + 2f * PIf * i / nt
            val s = sideW(th)
            val gr = groove(th) * (1f - s)
            val uEnd = (uBang + 0.014f * (1f - gr)) + (uSide - (uBang + 0.014f * (1f - gr))) * s
            for (j in 0..nu) {
                val f = j.toFloat() / nu
                val p = bodyPoint(b, th, uEnd * f)
                val nrm = bodyNormal(b, p)
                val e = max(0f, (f - 0.8f) / 0.2f)
                var t = HAIR_T * (0.4f + 0.6f * sqrt(max(0f, 1f - e * e)))
                t -= 0.024f * gr * smoothstep(0.2f, 0.65f, f)
                t += 0.035f * s * smoothstep(0.35f, 0.85f, f)
                val flip = s * smoothstep(0.84f, 1f, f)
                val out = 0.095f * flip * flip
                val lift = 0.07f * flip * flip * flip
                outer += p + nrm * (t + out) + Vec3(0f, lift, 0f)
                inner += p + nrm * (0.004f + out) + Vec3(0f, lift, 0f)
            }
        }
        for (q in outer) m.v(q.x, q.y, q.z)
        for (q in inner) m.v(q.x, q.y, q.z)
        val innerOff = nt * rows
        for (i in 0 until nt) {
            val i2 = (i + 1) % nt
            for (j in 0 until nu) {
                val a = i * rows + j
                val bb = i2 * rows + j
                m.tri(a, a + 1, bb); m.tri(bb, a + 1, bb + 1)
                m.tri(innerOff + a, innerOff + bb, innerOff + a + 1); m.tri(innerOff + bb, innerOff + bb + 1, innerOff + a + 1)
            }
        }
        // Canto inferior: une el borde exterior con el interior.
        val rimOff = m.vertexCount
        for (i in 0 until nt) {
            val o = outer[i * rows + nu]; val n = inner[i * rows + nu]
            m.v(o.x, o.y, o.z); m.v(n.x, n.y, n.z)
        }
        for (i in 0 until nt) {
            val r0 = rimOff + i * 2; val r1 = rimOff + ((i + 1) % nt) * 2
            m.tri(r0, r0 + 1, r1); m.tri(r1, r0 + 1, r1 + 1)
        }
        m.computeNormals()
        for (i in 0 until nt) { m.setNormal(i * rows, 0f, 1f, 0f); m.setNormal(innerOff + i * rows, 0f, -1f, 0f) }
        return m.build()
    }

    /** Diadema sobre el pelo, inclinada hacia atrás; devuelve también sus extremos (para los botones). */
    fun headband(b: BodySpec): Pair<MeshData, List<Vec3>> {
        val y0 = b.visorY + b.visorH / 2f - 0.01f
        val tilt = -0.4f
        val c = Vec3(0f, y0, 0f)
        fun inside(p: Vec3): Boolean {
            if (abs(p.y) >= b.h / 2f) return false
            val r = b.radiusAt(p.y)
            return p.x * p.x + (p.z * (b.w / b.d)).pow(2) < r * r
        }
        val pts = (0..48).map { k ->
            val a = -PIf / 2f + PIf * k / 48
            val d = Vec3(sin(a), cos(a) * cos(tilt), -cos(a) * sin(tilt))
            var lo = 0f
            var hi = 1.5f
            repeat(26) { val mid = (lo + hi) / 2f; if (inside(c + d * mid)) lo = mid else hi = mid }
            val p = c + d * lo
            p + bodyNormal(b, p) * (HAIR_T + 0.006f)
        }
        // Sección plana: ancha sobre el pelo y poco gruesa hacia fuera.
        val m = MeshBuilder()
        val radial = 12
        for (i in pts.indices) {
            val ctr = pts[i]
            val tangent = (pts[min(pts.size - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
            val nrm = bodyNormal(b, ctr)
            val side = tangent.cross(nrm).normalized()
            for (j in 0..radial) {
                val a = j * 2f * PIf / radial
                val q = ctr + nrm * (cos(a) * 0.018f) + side * (sin(a) * 0.044f)
                m.v(q.x, q.y, q.z)
            }
        }
        val cols = radial + 1
        for (i in 0 until pts.size - 1) for (j in 0 until radial) {
            val a = i * cols + j
            m.tri(a, a + 1, a + cols + 1); m.tri(a, a + cols + 1, a + cols)
        }
        m.computeNormals()
        m.weld(pts.indices.map { it * cols to it * cols + radial })
        // Que las normales apunten hacia fuera de la sección.
        for (i in pts.indices) for (j in 0..radial) {
            val k = i * cols + j
            val q = Vec3(m.x(k), m.y(k), m.z(k)) - pts[i]
            val nn = m.normal(k)
            if (nn.dot(q) < 0f) m.setNormal(k, -nn.x, -nn.y, -nn.z)
        }
        return m.build() to listOf(pts.first(), pts.last())
    }

    /** Aro metálico que envuelve la base del cuerpo (remate dorado). */
    fun baseRing(b: BodySpec): MeshData {
        val yTop = -b.h / 2f + 0.1f
        val profile = ArrayList<Pair<Float, Float>>()
        profile += 0f to (-b.h / 2f - 0.012f)
        for (i in 0..14) {
            val y = -b.h / 2f + 0.006f + (yTop - (-b.h / 2f + 0.006f)) * i / 14
            profile += (b.radiusAt(y) + 0.014f) to y
        }
        profile += (b.radiusAt(yTop) - 0.03f) to yTop
        profile += 0f to yTop
        return lathe(profile, 72, b.d / b.w).build()
    }
}

/** Primitivas comunes. */
object Shapes {
    fun sphere(r: Float, wSeg: Int = 24, hSeg: Int = 16): MeshData =
        lathe((0..hSeg).map { i -> val phi = -PIf / 2f + PIf * i / hSeg; (r * cos(phi)).let { if (i == 0 || i == hSeg) 0f else it } to r * sin(phi) }, wSeg, 1f).build()

    /** Cápsula de radio [r] con un tramo recto de [len] (vertical, centrada). */
    fun capsule(r: Float, len: Float, cap: Int = 8, radial: Int = 18): MeshData {
        val profile = ArrayList<Pair<Float, Float>>()
        for (i in 0..cap) { val a = -PIf / 2f + PIf / 2f * i / cap; profile += (if (i == 0) 0f else r * cos(a)) to (-len / 2f + r * sin(a)) }
        for (i in 0..cap) { val a = PIf / 2f * i / cap; profile += (if (i == cap) 0f else r * cos(a)) to (len / 2f + r * sin(a)) }
        return lathe(profile, radial, 1f).build()
    }

    /** Cilindro centrado (como `CylinderGeometry` de three.js: el primer lado mira a +Z), con tapas. */
    fun cylinder(rTop: Float, rBottom: Float, h: Float, radial: Int): MeshData {
        val m = MeshBuilder()
        val slope = (rBottom - rTop) / h
        for (j in 0..1) {
            val y = if (j == 0) -h / 2f else h / 2f
            val r = if (j == 0) rBottom else rTop
            for (i in 0..radial) {
                val th = i * 2f * PIf / radial
                val nl = sqrt(1f + slope * slope)
                m.v(r * sin(th), y, r * cos(th), i.toFloat() / radial, j.toFloat(), sin(th) / nl, slope / nl, cos(th) / nl)
            }
        }
        for (i in 0 until radial) { val a = i; val b = i + 1; val c = a + radial + 1; val d = c + 1; m.tri(a, b, d); m.tri(a, d, c) }
        for (top in listOf(false, true)) {
            val y = if (top) h / 2f else -h / 2f
            val r = if (top) rTop else rBottom
            val ny = if (top) 1f else -1f
            val c = m.v(0f, y, 0f, 0.5f, 0.5f, 0f, ny, 0f)
            for (i in 0..radial) { val th = i * 2f * PIf / radial; m.v(r * sin(th), y, r * cos(th), 0.5f + 0.5f * sin(th), 0.5f + 0.5f * cos(th), 0f, ny, 0f) }
            for (i in 0 until radial) if (top) m.tri(c, c + 1 + i, c + 2 + i) else m.tri(c, c + 2 + i, c + 1 + i)
        }
        return m.build(uv = true)
    }

    /** Caja con caras planas y coordenadas de textura. */
    fun box(w: Float, h: Float, d: Float): MeshData = boxBuilder(w, h, d).build(uv = true)

    fun boxBuilder(w: Float, h: Float, d: Float, cx: Float = 0f, cy: Float = 0f, cz: Float = 0f, into: MeshBuilder = MeshBuilder()): MeshBuilder {
        val hx = w / 2f; val hy = h / 2f; val hz = d / 2f
        val faces = listOf(
            Triple(Vec3(1f, 0f, 0f), Vec3(0f, 0f, -1f), Vec3(0f, 1f, 0f)),
            Triple(Vec3(-1f, 0f, 0f), Vec3(0f, 0f, 1f), Vec3(0f, 1f, 0f)),
            Triple(Vec3(0f, 1f, 0f), Vec3(1f, 0f, 0f), Vec3(0f, 0f, -1f)),
            Triple(Vec3(0f, -1f, 0f), Vec3(1f, 0f, 0f), Vec3(0f, 0f, 1f)),
            Triple(Vec3(0f, 0f, 1f), Vec3(1f, 0f, 0f), Vec3(0f, 1f, 0f)),
            Triple(Vec3(0f, 0f, -1f), Vec3(-1f, 0f, 0f), Vec3(0f, 1f, 0f)),
        )
        for ((n, u, v) in faces) {
            val o = into.vertexCount
            for ((s, t) in listOf(-1f to -1f, 1f to -1f, 1f to 1f, -1f to 1f)) {
                val p = n + u * s + v * t
                into.v(cx + p.x * hx, cy + p.y * hy, cz + p.z * hz, (s + 1f) / 2f, (t + 1f) / 2f, n.x, n.y, n.z)
            }
            into.tri(o, o + 1, o + 2); into.tri(o, o + 2, o + 3)
        }
        return into
    }

    /** Toro en el plano XZ (radio mayor [r], tubo [tube]); con [tubular] = 6 queda hexagonal como las plataformas. */
    fun torus(r: Float, tube: Float, radialSeg: Int, tubular: Int, arc: Float = 2f * PIf): MeshData =
        MeshBuilder().grid(tubular, radialSeg, closedU = arc >= 2f * PIf - 1e-4f) { u, v ->
            val th = u * arc
            val ph = v * 2f * PIf
            val rr = r + tube * cos(ph)
            Vec3(rr * sin(th), tube * sin(ph), rr * cos(th))
        }.build()

    /** Anillo plano en el suelo (XZ) con normal hacia arriba. */
    fun ring(inner: Float, outer: Float, seg: Int): MeshData {
        val m = MeshBuilder()
        for (i in 0..seg) {
            val a = i * 2f * PIf / seg
            m.v(inner * sin(a), 0f, inner * cos(a), i.toFloat() / seg, 0f, 0f, 1f, 0f)
            m.v(outer * sin(a), 0f, outer * cos(a), i.toFloat() / seg, 1f, 0f, 1f, 0f)
        }
        for (i in 0 until seg) { val o = i * 2; m.tri(o, o + 1, o + 3); m.tri(o, o + 3, o + 2) }
        return m.build(uv = true)
    }

    /** Rectángulo vertical (XY) con coordenadas de textura (v = 1 arriba, como three.js). */
    fun plane(w: Float, h: Float): MeshData {
        val m = MeshBuilder()
        m.v(-w / 2f, -h / 2f, 0f, 0f, 0f, 0f, 0f, 1f)
        m.v(w / 2f, -h / 2f, 0f, 1f, 0f, 0f, 0f, 1f)
        m.v(w / 2f, h / 2f, 0f, 1f, 1f, 0f, 0f, 1f)
        m.v(-w / 2f, h / 2f, 0f, 0f, 1f, 0f, 0f, 1f)
        m.tri(0, 1, 2); m.tri(0, 2, 3)
        return m.build(uv = true)
    }

    /** Rectángulo en el suelo (XZ), v = 1 hacia -Z. */
    fun floorPlane(w: Float, d: Float): MeshData {
        val m = MeshBuilder()
        m.v(-w / 2f, 0f, d / 2f, 0f, 0f, 0f, 1f, 0f)
        m.v(w / 2f, 0f, d / 2f, 1f, 0f, 0f, 1f, 0f)
        m.v(w / 2f, 0f, -d / 2f, 1f, 1f, 0f, 1f, 0f)
        m.v(-w / 2f, 0f, -d / 2f, 0f, 1f, 0f, 1f, 0f)
        m.tri(0, 1, 2); m.tri(0, 2, 3)
        return m.build(uv = true)
    }

    /** Octaedro con caras planas (fragmentos flotantes). */
    fun octahedron(r: Float): MeshData {
        val m = MeshBuilder()
        val v = listOf(Vec3(r, 0f, 0f), Vec3(-r, 0f, 0f), Vec3(0f, r, 0f), Vec3(0f, -r, 0f), Vec3(0f, 0f, r), Vec3(0f, 0f, -r))
        val faces = listOf(intArrayOf(0, 2, 4), intArrayOf(0, 4, 3), intArrayOf(0, 3, 5), intArrayOf(0, 5, 2), intArrayOf(1, 2, 5), intArrayOf(1, 5, 3), intArrayOf(1, 3, 4), intArrayOf(1, 4, 2))
        for (f in faces) {
            val a = v[f[0]]; val b = v[f[1]]; val c = v[f[2]]
            var n = (b - a).cross(c - a).normalized()
            val o = m.vertexCount
            val flip = n.dot(a + b + c) < 0f
            if (flip) n = n * -1f
            for (p in listOf(a, b, c)) m.v(p.x, p.y, p.z, nx = n.x, ny = n.y, nz = n.z)
            if (flip) m.tri(o, o + 2, o + 1) else m.tri(o, o + 1, o + 2)
        }
        return m.build()
    }

    /** Aristas de una caja como segmentos de línea. */
    fun boxEdges(w: Float, h: Float, d: Float): FloatArray {
        val out = ArrayList<Float>()
        val xs = floatArrayOf(-w / 2f, w / 2f); val ys = floatArrayOf(-h / 2f, h / 2f); val zs = floatArrayOf(-d / 2f, d / 2f)
        for (y in ys) for (z in zs) out += listOf(xs[0], y, z, xs[1], y, z)
        for (x in xs) for (z in zs) out += listOf(x, ys[0], z, x, ys[1], z)
        for (x in xs) for (y in ys) out += listOf(x, y, zs[0], x, y, zs[1])
        return out.toFloatArray()
    }
}

/** Superficie de revolución a partir de un perfil (radio, altura) de abajo arriba; [zScale] la achata en profundidad. */
internal fun lathe(profile: List<Pair<Float, Float>>, segments: Int, zScale: Float): MeshBuilder {
    val m = MeshBuilder().grid(segments, profile.size - 1, closedU = true) { u, v ->
        val (r, y) = profile[round(v * (profile.size - 1)).toInt()]
        val th = u * 2f * PIf
        Vec3(r * sin(th), y, r * cos(th) * zScale)
    }
    // Polos: normal vertical (todas las columnas se juntan en un punto).
    for (i in 0 until m.vertexCount) {
        if (abs(m.x(i)) < 1e-6f && abs(m.z(i)) < 1e-6f) m.setNormal(i, 0f, if (m.y(i) >= 0f) 1f else -1f, 0f)
    }
    return m
}

/** Escenario: núcleo, ciudad, circuitos, fondo y partículas (`Core.tsx`, `Ambient.tsx`, `Circuits.tsx`, `Backdrop.tsx`). */
object SceneGeometry {
    const val CORE_R = 1.75f
    const val GLOBE_RADIUS = 22f

    /** Paralelos y meridianos de la esfera del núcleo. */
    fun coreWire(r: Float): FloatArray {
        val out = ArrayList<Float>()
        val seg = 72
        fun ring(lat: Float, a: Float) = floatArrayOf(cos(lat) * sin(a) * r, sin(lat) * r, cos(lat) * cos(a) * r)
        for (k in -3..3) {
            val lat = k / 4f * (PIf / 2f)
            for (i in 0 until seg) { out += ring(lat, i * 2f * PIf / seg).toList(); out += ring(lat, (i + 1) * 2f * PIf / seg).toList() }
        }
        for (mm in 0 until 12) {
            val lon = mm / 12f * 2f * PIf
            for (i in 0 until seg / 2) {
                val la = -PIf / 2f + i / (seg / 2f) * PIf
                val lb = -PIf / 2f + (i + 1) / (seg / 2f) * PIf
                out += listOf(cos(la) * sin(lon) * r, sin(la) * r, cos(la) * cos(lon) * r, cos(lb) * sin(lon) * r, sin(lb) * r, cos(lb) * cos(lon) * r)
            }
        }
        return out.toFloatArray()
    }

    /** Nodos fijos sobre la esfera del núcleo. */
    fun coreNodes(): List<Vec3> = (0 until 14).map { i ->
        val lat = asin(((i * 0.618f) % 1f) * 1.6f - 0.8f)
        val lon = i * 2.39996f
        Vec3(cos(lat) * sin(lon) * CORE_R, sin(lat) * CORE_R, cos(lat) * cos(lon) * CORE_R)
    }

    private fun onSphere(lat: Float, lon: Float, r: Float) = Vec3(cos(lat) * sin(lon) * r, sin(lat) * r, cos(lat) * cos(lon) * r)

    /** Globo de red del fondo: rejilla, rutas entre nodos y nodos. */
    class Globe(val grid: FloatArray, val routes: FloatArray, val nodes: FloatArray)

    fun globe(): Globe {
        val grid = ArrayList<Float>()
        val seg = 96
        val r = GLOBE_RADIUS
        for (k in -5..5) {
            val lat = k / 6f * (PIf / 2f)
            for (i in 0 until seg) {
                val a = onSphere(lat, i.toFloat() / seg * 2f * PIf, r); val b = onSphere(lat, (i + 1f) / seg * 2f * PIf, r)
                grid += listOf(a.x, a.y, a.z, b.x, b.y, b.z)
            }
        }
        for (mm in 0 until 18) {
            val lon = mm / 18f * 2f * PIf
            for (i in 0 until seg / 2) {
                val a = onSphere(-PIf / 2f + i / (seg / 2f) * PIf, lon, r); val b = onSphere(-PIf / 2f + (i + 1) / (seg / 2f) * PIf, lon, r)
                grid += listOf(a.x, a.y, a.z, b.x, b.y, b.z)
            }
        }
        val rnd = Seeded(5)
        val pts = (0 until 70).map { onSphere(asin(rnd.next() * 2f - 1f) * 0.9f, rnd.next() * 2f * PIf, r * 1.003f) }
        val routes = ArrayList<Float>()
        repeat(46) {
            val a = pts[floor(rnd.next() * pts.size).toInt()]
            val b = pts[floor(rnd.next() * pts.size).toInt()]
            val ang = acos((a.normalized().dot(b.normalized())).coerceIn(-1f, 1f))
            if (a === b || ang > 1.4f) return@repeat
            var prev = a
            for (s in 1..24) {
                val t = s / 24f
                val p = a.lerp(b, t).normalized() * (r * (1.003f + sin(t * PIf) * 0.06f))
                routes += listOf(prev.x, prev.y, prev.z, p.x, p.y, p.z)
                prev = p
            }
        }
        return Globe(grid.toFloatArray(), routes.toFloatArray(), pts.flatMap { listOf(it.x, it.y, it.z) }.toFloatArray())
    }

    /** Bloque de la ciudad (`City` de `Ambient.tsx`). */
    data class Building(val x: Float, val z: Float, val w: Float, val d: Float, val h: Float, val seed: Float)

    /** Ciudad alrededor de la oficina: más alta al fondo; con menos calidad se quitan primero los bloques bajos. */
    fun buildings(count: Int): List<Building> {
        val rnd = Seeded(42)
        data class Cand(val b: Building, val k: Float)
        val cands = ArrayList<Cand>()
        val step = 2.5f
        for (gx in -14..14) for (gz in -15..3) {
            val x = gx * step + (rnd.next() - 0.5f) * 0.7f
            val z = gz * step + (rnd.next() - 0.5f) * 0.7f
            if (abs(x) < 13f && z > -10f) continue
            if (z > 7f) continue
            if (rnd.next() < 0.18f) continue
            val far = ((-z - 10f) / 18f).coerceIn(0f, 1f)
            val side = ((abs(x) - 13f) / 14f).coerceIn(0f, 1f)
            var h = 0.5f + rnd.next() * (0.8f + far * 6.5f + side * 2.2f)
            if (z > -5f) h = min(h, 1f + rnd.next() * 1.4f)
            val slim = if (h > 4f) 0.75f else 1f
            val w = (0.9f + rnd.next() * 1.15f) * slim
            val d = (0.9f + rnd.next() * 1.15f) * slim
            cands += Cand(Building(x, z, w, d, h, rnd.next()), rnd.next())
        }
        return cands.sortedByDescending { it.b.h * 0.6f + it.k }.take(count).map { it.b }
    }

    val CITY_ATTRIBS = listOf("aPos" to 3, "aNormal" to 3, "aCenter" to 3, "aScale" to 3, "aSeed" to 1)

    /** Todos los bloques en una sola malla (OpenGL ES 2.0 no tiene instancias): cubo local + centro, escala y semilla. */
    fun city(buildings: List<Building>): MeshData {
        val cube = Shapes.box(1f, 1f, 1f)
        val stride = 13
        val out = FloatArray(buildings.size * 24 * stride)
        val idx = ShortArray(buildings.size * 36)
        buildings.forEachIndexed { b, it ->
            for (v in 0 until 24) {
                val o = (b * 24 + v) * stride
                val s = v * 8
                for (c in 0 until 6) out[o + c] = cube.vertices[s + c]
                out[o + 6] = it.x; out[o + 7] = it.h / 2f; out[o + 8] = it.z
                out[o + 9] = it.w; out[o + 10] = it.h; out[o + 11] = it.d
                out[o + 12] = it.seed
            }
            for (i in 0 until 36) idx[b * 36 + i] = (b * 24 + cube.indices[i]).toShort()
        }
        return MeshData(out, idx, CITY_ATTRIBS)
    }

    /** Balizas en lo alto de los edificios altos, separadas por color (violeta o azul). */
    fun beacons(buildings: List<Building>): Pair<MeshData, MeshData> {
        val violet = MeshBuilder(); val blue = MeshBuilder()
        for (b in buildings.filter { it.h > 3.6f }) Shapes.boxBuilder(0.09f, 0.24f, 0.09f, b.x, b.h + 0.12f, b.z, if (b.seed > 0.5f) violet else blue)
        return violet.build() to blue.build()
    }

    // ---------- Circuitos del suelo ----------

    private class Trace(val pts: List<Pair<Float, Float>>, val width: Float, val filler: Boolean, val phase: Float)

    private fun route(a: Pair<Float, Float>, b: Pair<Float, Float>, diagonalFirst: Boolean): List<Pair<Float, Float>> {
        val dx = b.first - a.first; val dz = b.second - a.second
        val diag = min(abs(dx), abs(dz))
        val d = sign(dx) * diag to sign(dz) * diag
        val mid = if (diagonalFirst) (a.first + d.first) to (a.second + d.second) else (b.first - d.first) to (b.second - d.second)
        return listOf(a, mid, b)
    }

    private fun length(pts: List<Pair<Float, Float>>) = pts.zipWithNext { a, b -> hypot(b.first - a.first, b.second - a.second) }.sum()

    private fun trim(pts: List<Pair<Float, Float>>, from: Float, to: Float): List<Pair<Float, Float>> {
        fun cut(arr: List<Pair<Float, Float>>, dist: Float): List<Pair<Float, Float>> {
            var left = dist
            for (i in 1 until arr.size) {
                val seg = hypot(arr[i].first - arr[i - 1].first, arr[i].second - arr[i - 1].second)
                if (seg > left) {
                    val k = left / seg
                    return listOf((arr[i - 1].first + (arr[i].first - arr[i - 1].first) * k) to (arr[i - 1].second + (arr[i].second - arr[i - 1].second) * k)) + arr.drop(i)
                }
                left -= seg
            }
            return listOf(arr.last())
        }
        return cut(cut(pts, from).reversed(), to).reversed()
    }

    private fun normal(a: Pair<Float, Float>, b: Pair<Float, Float>): Pair<Float, Float> {
        val dx = b.first - a.first; val dz = b.second - a.second
        val l = hypot(dx, dz).let { if (it == 0f) 1f else it }
        return -dz / l to dx / l
    }

    private fun offset(pts: List<Pair<Float, Float>>, d: Float): List<Pair<Float, Float>> = pts.indices.map { i ->
        val p = pts[i]
        val prev = pts[max(0, i - 1)]; val next = pts[min(pts.size - 1, i + 1)]
        val n1 = if (i > 0) normal(prev, p) else normal(p, next)
        val n2 = if (i < pts.size - 1) normal(p, next) else n1
        val nx = n1.first + n2.first; val nz = n1.second + n2.second
        val len = hypot(nx, nz).let { if (it == 0f) 1f else it }
        val cs = (nx / len) * n1.first + (nz / len) * n1.second
        val k = d / max(0.5f, cs)
        (p.first + nx / len * k) to (p.second + nz / len * k)
    }

    val CIRCUIT_ATTRIBS = listOf("aPos" to 3, "aDist" to 1, "aInfo" to 3, "aSide" to 1)

    class Circuits(val ribbons: MeshData, val pads: List<Pair<Float, Float>>)

    /** Pistas luminosas entre estaciones vecinas, de las zonas a la estación más cercana y de relleno hacia fuera. */
    fun circuits(stations: Map<String, Pair<Float, Float>>): Circuits {
        val rnd = Seeded(11)
        val out = ArrayList<Trace>()
        val stationR = 1.75f
        val zoneR = 1.5f
        fun bus(a: Pair<Float, Float>?, b: Pair<Float, Float>?, ra: Float, rb: Float, lanes: Int, diagonalFirst: Boolean) {
            if (a == null || b == null) return
            val core = trim(route(a, b, diagonalFirst), ra, rb)
            if (core.size < 2) return
            for (k in 0 until lanes) {
                val d = (k - (lanes - 1) / 2f) * 0.17f
                out += Trace(if (d != 0f) offset(core, d) else core, 0.075f, false, rnd.next())
            }
        }
        val ring = listOf("st-gemini", "st-sub-1", "st-hermes", "st-codex", "st-claude", "st-muse", "st-qwen")
        ring.forEachIndexed { i, id -> bus(stations[id], stations[ring[(i + 1) % ring.size]], stationR, stationR, 2, i % 2 == 0) }
        fun spot(z: SpaceZone) = z.x to z.z
        bus(spot(SpaceZone.Tasks), stations["st-gemini"], zoneR, stationR, 3, false)
        bus(spot(SpaceZone.Files), stations["st-sub-1"], zoneR, stationR, 2, true)
        bus(spot(SpaceZone.Tools), stations["st-claude"], zoneR, stationR, 2, false)
        bus(spot(SpaceZone.Tools), stations["st-codex"], zoneR, stationR, 2, true)
        bus(spot(SpaceZone.Memory), stations["st-codex"], zoneR, stationR, 2, false)
        bus(spot(SpaceZone.Memory), stations["st-hermes"], zoneR, stationR, 2, true)

        val avoid = stations.values + SpaceZone.entries.map { spot(it) } + listOf(0f to 0f)
        var guard = 0
        var made = 0
        while (made < 26 && guard++ < 400) {
            val ang = rnd.next() * PIf * 2f
            val r = 7.5f + rnd.next() * 6f
            val a = cos(ang) * r * 1.25f to sin(ang) * r * 0.9f
            if (a.second > 9f || a.second < -12f) continue
            val dirAng = round((atan2(a.second, a.first) + (rnd.next() - 0.5f) * 0.8f) / (PIf / 4f)) * (PIf / 4f)
            val l1 = 1.2f + rnd.next() * 2.5f
            val b = (a.first + cos(dirAng) * l1) to (a.second + sin(dirAng) * l1)
            val turn = dirAng + (if (rnd.next() < 0.5f) 1f else -1f) * (PIf / 4f)
            val l2 = 0.8f + rnd.next() * 2f
            val c = (b.first + cos(turn) * l2) to (b.second + sin(turn) * l2)
            val pts = listOf(a, b, c)
            if (pts.any { p -> avoid.any { q -> hypot(p.first - q.first, p.second - q.second) < 2.4f } }) continue
            val lanes = 2 + floor(rnd.next() * 3f).toInt()
            for (k in 0 until lanes) out += Trace(offset(pts, (k - (lanes - 1) / 2f) * 0.15f), 0.045f, true, rnd.next())
            made++
        }

        val data = FloatList(4096)
        val idx = ArrayList<Int>()
        val y = 0.014f
        var vertex = 0
        for (tr in out) {
            val total = length(tr.pts)
            val left = offset(tr.pts, tr.width / 2f)
            val right = offset(tr.pts, -tr.width / 2f)
            var acc = 0f
            val base = vertex
            tr.pts.forEachIndexed { i, p ->
                if (i > 0) acc += hypot(p.first - tr.pts[i - 1].first, p.second - tr.pts[i - 1].second)
                for ((side, q) in listOf(1f to left[i], -1f to right[i])) {
                    data.add(q.first); data.add(y); data.add(q.second)
                    data.add(acc)
                    data.add(total); data.add(tr.phase); data.add(if (tr.filler) 1f else 0f)
                    data.add(side)
                    vertex++
                }
                if (i > 0) {
                    val a = base + (i - 1) * 2
                    idx += listOf(a, a + 1, a + 2, a + 1, a + 3, a + 2)
                }
            }
        }
        val pads = out.flatMap { listOf(it.pts.first(), it.pts.last()) }
        return Circuits(MeshData(data.toArray(), ShortArray(idx.size) { idx[it].toShort() }, CIRCUIT_ATTRIBS), pads)
    }

    /** Pads de los extremos de las pistas: anillos pequeños en el suelo, en una sola malla. */
    fun pads(points: List<Pair<Float, Float>>): MeshData {
        val m = MeshBuilder()
        for ((x, z) in points) {
            val o = m.vertexCount
            for (i in 0..16) {
                val a = i * 2f * PIf / 16
                m.v(x + 0.03f * sin(a), 0.016f, z + 0.03f * cos(a), nx = 0f, ny = 1f)
                m.v(x + 0.062f * sin(a), 0.016f, z + 0.062f * cos(a), nx = 0f, ny = 1f)
            }
            for (i in 0 until 16) { val q = o + i * 2; m.tri(q, q + 1, q + 3); m.tri(q, q + 3, q + 2) }
        }
        return m.build()
    }

    val PARTICLE_ATTRIBS = listOf("aPos" to 3, "aSeed" to 1, "aSize" to 1)

    /** Partículas lentas en tres profundidades. */
    fun particles(count: Int): MeshData {
        val rnd = Seeded(99)
        val out = FloatArray(count * 5)
        for (i in 0 until count) {
            val layer = i % 3
            out[i * 5] = (rnd.next() - 0.5f) * (if (layer == 0) 26f else if (layer == 1) 40f else 60f)
            out[i * 5 + 1] = rnd.next() * 9f
            out[i * 5 + 2] = if (layer == 0) -6f + rnd.next() * 14f else if (layer == 1) -16f + rnd.next() * 18f else -32f + rnd.next() * 22f
            out[i * 5 + 3] = rnd.next()
            out[i * 5 + 4] = if (layer == 0) 2.2f + rnd.next() * 2f else if (layer == 1) 1.6f + rnd.next() * 1.6f else 1.2f + rnd.next() * 1.2f
        }
        return MeshData(out, ShortArray(0), PARTICLE_ATTRIBS)
    }

    data class Fragment(val x: Float, val y: Float, val z: Float, val s: Float, val ph: Float, val sp: Float, val rs: Float)

    /** Pequeños fragmentos geométricos flotando a distintas alturas. */
    fun fragments(count: Int): List<Fragment> {
        val rnd = Seeded(7)
        return (0 until count).map {
            val a = rnd.next() * PIf * 2f
            val r = 4f + rnd.next() * 10f
            Fragment(cos(a) * r, 2.2f + rnd.next() * 3.8f, sin(a) * r * 0.75f - 1.5f, 0.5f + rnd.next() * 0.9f, rnd.next() * 10f, 0.2f + rnd.next() * 0.5f, (rnd.next() - 0.5f) * 0.8f)
        }
    }

    /** Conexión de una estación con el núcleo: tubo fino por el suelo con u = recorrido (0 estación, 1 núcleo). */
    fun stationTrace(x: Float, z: Float): Pair<MeshData, Float> {
        val pts = catmullRom(SpaceLayout.tracePoints(x, z), 90)
        val len = pts.zipWithNext { a, b -> a.distanceTo(b) }.sum()
        return RobotGeometry.tube(pts, 6, { 0.028f }, up = Vec3(0f, 1f, 0f)).build(uv = true) to len
    }

    /** Curva suave que pasa por [pts] (Catmull-Rom centrípeta), muestreada en [samples] tramos. */
    fun catmullRom(pts: List<Vec3>, samples: Int): List<Vec3> {
        if (pts.size < 2) return pts
        val ext = listOf(pts[0] * 2f - pts[1]) + pts + listOf(pts.last() * 2f - pts[pts.size - 2])
        val segs = pts.size - 1
        return (0..samples).map { s ->
            val f = s.toFloat() / samples * segs
            val i = min(segs - 1, floor(f).toInt())
            val t = f - i
            centripetal(ext[i], ext[i + 1], ext[i + 2], ext[i + 3], t)
        }
    }

    private fun centripetal(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: Float): Vec3 {
        fun knot(a: Vec3, b: Vec3) = sqrt(a.distanceTo(b)).coerceAtLeast(1e-4f)
        val t0 = 0f
        val t1 = t0 + knot(p0, p1)
        val t2 = t1 + knot(p1, p2)
        val t3 = t2 + knot(p2, p3)
        val tt = t1 + (t2 - t1) * t
        fun mix(a: Vec3, b: Vec3, ta: Float, tb: Float) = a * ((tb - tt) / (tb - ta)) + b * ((tt - ta) / (tb - ta))
        val a1 = mix(p0, p1, t0, t1); val a2 = mix(p1, p2, t1, t2); val a3 = mix(p2, p3, t2, t3)
        val b1 = mix(a1, a2, t0, t2); val b2 = mix(a2, a3, t1, t3)
        return mix(b1, b2, t1, t2)
    }
}
