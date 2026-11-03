package com.aicowork.remote.ui.space

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

// Matemáticas mínimas de la escena en Kotlin puro (sin android.opengl.Matrix) para poder probarlas en la JVM.
// Las matrices son FloatArray(16) en orden de columnas, como las espera OpenGL: m[col * 4 + fila].

data class Vec3(val x: Float, val y: Float, val z: Float) {
    operator fun plus(o: Vec3) = Vec3(x + o.x, y + o.y, z + o.z)
    operator fun minus(o: Vec3) = Vec3(x - o.x, y - o.y, z - o.z)
    operator fun times(s: Float) = Vec3(x * s, y * s, z * s)
    fun dot(o: Vec3) = x * o.x + y * o.y + z * o.z
    fun cross(o: Vec3) = Vec3(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x)
    fun length() = sqrt(dot(this))
    fun normalized(): Vec3 = length().let { if (it < 1e-6f) Zero else Vec3(x / it, y / it, z / it) }
    fun withY(value: Float) = Vec3(x, value, z)
    fun distanceTo(o: Vec3) = (this - o).length()
    fun lerp(o: Vec3, t: Float) = Vec3(x + (o.x - x) * t, y + (o.y - y) * t, z + (o.z - z) * t)

    companion object {
        val Zero = Vec3(0f, 0f, 0f)
        val Up = Vec3(0f, 1f, 0f)
    }
}

object M4 {
    fun identity(out: FloatArray): FloatArray {
        out.fill(0f)
        out[0] = 1f; out[5] = 1f; out[10] = 1f; out[15] = 1f
        return out
    }

    /** out = a · b. `out` no puede ser ni `a` ni `b`. */
    fun multiply(out: FloatArray, a: FloatArray, b: FloatArray): FloatArray {
        for (col in 0 until 4) {
            for (row in 0 until 4) {
                var sum = 0f
                for (k in 0 until 4) sum += a[k * 4 + row] * b[col * 4 + k]
                out[col * 4 + row] = sum
            }
        }
        return out
    }

    fun perspective(out: FloatArray, fovYRad: Float, aspect: Float, near: Float, far: Float): FloatArray {
        val f = 1f / tan(fovYRad / 2f)
        out.fill(0f)
        out[0] = f / aspect
        out[5] = f
        out[10] = (far + near) / (near - far)
        out[11] = -1f
        out[14] = 2f * far * near / (near - far)
        return out
    }

    /** Proyección en perspectiva descentrada (`glFrustum`): los bordes del plano cercano en unidades de la cámara. */
    fun frustum(out: FloatArray, left: Float, right: Float, bottom: Float, top: Float, near: Float, far: Float): FloatArray {
        out.fill(0f)
        out[0] = 2f * near / (right - left)
        out[5] = 2f * near / (top - bottom)
        out[8] = (right + left) / (right - left)
        out[9] = (top + bottom) / (top - bottom)
        out[10] = (far + near) / (near - far)
        out[11] = -1f
        out[14] = 2f * far * near / (near - far)
        return out
    }

    fun lookAt(out: FloatArray, eye: Vec3, target: Vec3, up: Vec3 = Vec3.Up): FloatArray {
        val f = (target - eye).normalized()
        val s = f.cross(up).normalized()
        val u = s.cross(f)
        out[0] = s.x; out[4] = s.y; out[8] = s.z; out[12] = -s.dot(eye)
        out[1] = u.x; out[5] = u.y; out[9] = u.z; out[13] = -u.dot(eye)
        out[2] = -f.x; out[6] = -f.y; out[10] = -f.z; out[14] = f.dot(eye)
        out[3] = 0f; out[7] = 0f; out[11] = 0f; out[15] = 1f
        return out
    }

    /** Matriz de modelo T · Ry(yaw) · Rx(pitch) · Rz(roll) · S. */
    fun model(
        out: FloatArray,
        tx: Float, ty: Float, tz: Float,
        yaw: Float = 0f, pitch: Float = 0f, roll: Float = 0f,
        sx: Float = 1f, sy: Float = sx, sz: Float = sx,
    ): FloatArray {
        val cy = cos(yaw); val sy0 = sin(yaw)
        val cx = cos(pitch); val sxp = sin(pitch)
        val cz = cos(roll); val szr = sin(roll)
        // Filas de R = Ry · Rx · Rz
        val r00 = cy * cz + sy0 * sxp * szr; val r01 = -cy * szr + sy0 * sxp * cz; val r02 = sy0 * cx
        val r10 = cx * szr; val r11 = cx * cz; val r12 = -sxp
        val r20 = -sy0 * cz + cy * sxp * szr; val r21 = sy0 * szr + cy * sxp * cz; val r22 = cy * cx
        out[0] = r00 * sx; out[1] = r10 * sx; out[2] = r20 * sx; out[3] = 0f
        out[4] = r01 * sy; out[5] = r11 * sy; out[6] = r21 * sy; out[7] = 0f
        out[8] = r02 * sz; out[9] = r12 * sz; out[10] = r22 * sz; out[11] = 0f
        out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1f
        return out
    }

    /** Inversa de una matriz rígida (rotación + traslación), como la de vista. */
    fun invertRigid(out: FloatArray, m: FloatArray): FloatArray {
        // Rotación traspuesta y traslación -Rᵀ·t.
        for (c in 0 until 3) for (r in 0 until 3) out[c * 4 + r] = m[r * 4 + c]
        out[3] = 0f; out[7] = 0f; out[11] = 0f; out[15] = 1f
        val tx = m[12]; val ty = m[13]; val tz = m[14]
        out[12] = -(out[0] * tx + out[4] * ty + out[8] * tz)
        out[13] = -(out[1] * tx + out[5] * ty + out[9] * tz)
        out[14] = -(out[2] * tx + out[6] * ty + out[10] * tz)
        return out
    }

    /** Transforma un punto (w = 1) y devuelve (x, y, z, w) en `out`. */
    fun transform(m: FloatArray, p: Vec3, out: FloatArray = FloatArray(4)): FloatArray {
        for (row in 0 until 4) out[row] = m[row] * p.x + m[4 + row] * p.y + m[8 + row] * p.z + m[12 + row]
        return out
    }
}

/** Amortiguación exponencial independiente de la tasa de fotogramas. */
fun damp(current: Float, target: Float, lambda: Float, dt: Float): Float =
    current + (target - current) * (1f - exp(-lambda * dt))

fun dampAngle(current: Float, target: Float, lambda: Float, dt: Float): Float {
    val d = atan2(sin(target - current), cos(target - current))
    return current + d * (1f - exp(-lambda * dt))
}

fun smootherstep(x: Float): Float {
    val t = x.coerceIn(0f, 1f)
    return t * t * t * (t * (t * 6f - 15f) + 10f)
}

fun smoothstep(e0: Float, e1: Float, x: Float): Float {
    val t = ((x - e0) / (e1 - e0)).coerceIn(0f, 1f)
    return t * t * (3f - 2f * t)
}

/** Ángulo de giro (eje Y) para mirar desde [from] hacia [to]. El frente del robot es +Z. */
fun yawTo(from: Vec3, to: Vec3): Float = atan2(to.x - from.x, to.z - from.z)

fun lerpAngle(a: Float, b: Float, t: Float): Float = a + atan2(sin(b - a), cos(b - a)) * t

/**
 * Generador con semilla (mulberry32, el mismo del escritorio): con la misma semilla, la ciudad, los circuitos y las
 * partículas quedan exactamente donde en la app de escritorio.
 */
class Seeded(seed: Int) {
    private var a = seed
    fun next(): Float {
        a += 0x6d2b79f5
        var t = (a xor (a ushr 15)) * (1 or a)
        t = (t + (t xor (t ushr 7)) * (61 or t)) xor t
        return ((t xor (t ushr 14)).toLong() and 0xffffffffL) / 4294967296f
    }
}

/** Hash estable de un texto a [0, 1) (mismo algoritmo FNV que el escritorio): desfases por agente. */
fun hash01(s: String): Float {
    var h = 2166136261L.toInt()
    for (c in s) {
        h = h xor c.code
        h *= 16777619
    }
    return ((h.toLong() and 0xffffffffL) % 100000L) / 100000f
}
