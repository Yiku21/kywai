package com.aicowork.remote.ui.space.gl

import android.opengl.GLES20
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.ShortBuffer
import javax.microedition.khronos.egl.EGL10
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.egl.EGLContext
import javax.microedition.khronos.egl.EGLDisplay
import android.opengl.GLSurfaceView

// Utilidades OpenGL ES 2.0: sombreadores, mallas en la GPU, texturas, color lineal y configuración con antialiasing.

internal fun floatBuffer(size: Int): FloatBuffer =
    ByteBuffer.allocateDirect(size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()

internal fun floatBufferOf(data: FloatArray): FloatBuffer = floatBuffer(data.size).apply { put(data); position(0) }

internal fun shortBufferOf(data: ShortArray): ShortBuffer =
    ByteBuffer.allocateDirect(data.size * 2).order(ByteOrder.nativeOrder()).asShortBuffer().apply { put(data); position(0) }

internal class GlProgram(vertex: String, fragment: String) {
    val id: Int = link(compile(GLES20.GL_VERTEX_SHADER, vertex), compile(GLES20.GL_FRAGMENT_SHADER, fragment))
    private val locations = HashMap<String, Int>()

    fun use() = GLES20.glUseProgram(id)
    fun attrib(name: String) = locations.getOrPut("a:$name") { GLES20.glGetAttribLocation(id, name) }
    fun uniform(name: String) = locations.getOrPut(name) { GLES20.glGetUniformLocation(id, name) }

    fun set1(name: String, v: Float) = GLES20.glUniform1f(uniform(name), v)
    fun set2(name: String, a: Float, b: Float) = GLES20.glUniform2f(uniform(name), a, b)
    fun set3(name: String, a: Float, b: Float, c: Float) = GLES20.glUniform3f(uniform(name), a, b, c)
    fun set4(name: String, a: Float, b: Float, c: Float, d: Float) = GLES20.glUniform4f(uniform(name), a, b, c, d)
    fun setLin(name: String, c: Lin) = set3(name, c.r, c.g, c.b)
    fun set1i(name: String, v: Int) = GLES20.glUniform1i(uniform(name), v)
    fun setMatrix(name: String, m: FloatArray) = GLES20.glUniformMatrix4fv(uniform(name), 1, false, m, 0)

    private fun compile(type: Int, source: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, source)
        GLES20.glCompileShader(shader)
        val status = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
        if (status[0] == 0) {
            val log = GLES20.glGetShaderInfoLog(shader)
            GLES20.glDeleteShader(shader)
            throw IllegalStateException("No se pudo compilar el sombreador: $log")
        }
        return shader
    }

    private fun link(vs: Int, fs: Int): Int {
        val program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, vs)
        GLES20.glAttachShader(program, fs)
        GLES20.glLinkProgram(program)
        val status = IntArray(1)
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, status, 0)
        if (status[0] == 0) throw IllegalStateException("No se pudo enlazar el programa: ${GLES20.glGetProgramInfoLog(program)}")
        return program
    }
}

/** Malla en búferes de la GPU con los atributos que declare ([MeshData.attribs]). */
internal class GpuMesh(data: MeshData, private val mode: Int = GLES20.GL_TRIANGLES) {
    private val vbo: Int
    private val ibo: Int
    private val count: Int
    private val stride = data.stride * 4
    private val attribs = data.attribs

    init {
        val ids = IntArray(2)
        GLES20.glGenBuffers(2, ids, 0)
        vbo = ids[0]; ibo = ids[1]
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, vbo)
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, data.vertices.size * 4, floatBufferOf(data.vertices), GLES20.GL_STATIC_DRAW)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
        if (data.indices.isNotEmpty()) {
            GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, ibo)
            GLES20.glBufferData(GLES20.GL_ELEMENT_ARRAY_BUFFER, data.indices.size * 2, shortBufferOf(data.indices), GLES20.GL_STATIC_DRAW)
            GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, 0)
            count = data.indices.size
        } else {
            count = -data.vertexCount
        }
    }

    fun release() = GLES20.glDeleteBuffers(2, intArrayOf(vbo, ibo), 0)

    fun draw(program: GlProgram, drawMode: Int = mode) {
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, vbo)
        val enabled = IntArray(attribs.size)
        var offset = 0
        attribs.forEachIndexed { i, (name, size) ->
            val loc = program.attrib(name)
            enabled[i] = loc
            if (loc >= 0) {
                GLES20.glEnableVertexAttribArray(loc)
                GLES20.glVertexAttribPointer(loc, size, GLES20.GL_FLOAT, false, stride, offset * 4)
            }
            offset += size
        }
        if (count > 0) {
            GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, ibo)
            GLES20.glDrawElements(drawMode, count, GLES20.GL_UNSIGNED_SHORT, 0)
            GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, 0)
        } else {
            GLES20.glDrawArrays(drawMode, 0, -count)
        }
        for (loc in enabled) if (loc >= 0) GLES20.glDisableVertexAttribArray(loc)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
    }
}

/** Puntos o segmentos estáticos (solo posiciones). */
internal fun gpuLines(positions: FloatArray) = GpuMesh(MeshData(positions, ShortArray(0), listOf("aPos" to 3)), GLES20.GL_LINES)

/** Sube un mapa de bits como textura (y lo libera). */
internal fun upload(bitmap: android.graphics.Bitmap, mipmaps: Boolean = false): Int {
    val ids = IntArray(1)
    GLES20.glGenTextures(1, ids, 0)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, ids[0])
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, if (mipmaps) GLES20.GL_LINEAR_MIPMAP_LINEAR else GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    android.opengl.GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0)
    if (mipmaps) GLES20.glGenerateMipmap(GLES20.GL_TEXTURE_2D)
    bitmap.recycle()
    return ids[0]
}

/** Canal sRGB (0‥1) a lineal, como hace three.js con los colores de los materiales. */
internal fun toLinear(c: Float): Float = if (c <= 0.04045f) c / 12.92f else Math.pow(((c + 0.055f) / 1.055f).toDouble(), 2.4).toFloat()

/** Color ARGB en lineal, multiplicado por [scale] (los «multiplyScalar» del escritorio). */
internal class Lin(val r: Float, val g: Float, val b: Float) {
    operator fun times(s: Float) = Lin(r * s, g * s, b * s)
    fun lerp(o: Lin, t: Float) = Lin(r + (o.r - r) * t, g + (o.g - g) * t, b + (o.b - b) * t)

    companion object {
        fun of(argb: Int) = Lin(toLinear(red(argb)), toLinear(green(argb)), toLinear(blue(argb)))
        val BLACK = Lin(0f, 0f, 0f)
    }
}

internal fun red(argb: Int) = ((argb shr 16) and 0xff) / 255f
internal fun green(argb: Int) = ((argb shr 8) and 0xff) / 255f
internal fun blue(argb: Int) = (argb and 0xff) / 255f

/**
 * Configuración de la pantalla: OpenGL ES 3 si el dispositivo lo tiene (y si no, ES 2), color de 8 bits y
 * profundidad. El antialiasing (MSAA) ya no se pide aquí: se hace en el fotograma fuera de pantalla ([PostFx]); solo
 * con [multisample] (dibujo directo, sin posprocesado) se pide a la pantalla.
 */
internal class SpaceConfigChooser(private val es3: Boolean, private val multisample: Boolean = false) : GLSurfaceView.EGLConfigChooser {
    override fun chooseConfig(egl: EGL10, display: EGLDisplay): EGLConfig {
        val types = if (es3) listOf(EGL_OPENGL_ES3_BIT, EGL_OPENGL_ES2_BIT) else listOf(EGL_OPENGL_ES2_BIT)
        val attempts = buildList {
            for (type in types) {
                val base = intArrayOf(
                    EGL10.EGL_RED_SIZE, 8, EGL10.EGL_GREEN_SIZE, 8, EGL10.EGL_BLUE_SIZE, 8,
                    EGL10.EGL_DEPTH_SIZE, 16, EGL10.EGL_RENDERABLE_TYPE, type,
                )
                if (multisample) add(base + intArrayOf(EGL10.EGL_SAMPLE_BUFFERS, 1, EGL10.EGL_SAMPLES, 4))
                add(base)
                add(intArrayOf(EGL10.EGL_DEPTH_SIZE, 16, EGL10.EGL_RENDERABLE_TYPE, type))
            }
        }
        for (attribs in attempts) {
            val list = attribs + EGL10.EGL_NONE
            val count = IntArray(1)
            if (!egl.eglChooseConfig(display, list, null, 0, count) || count[0] <= 0) continue
            val configs = arrayOfNulls<EGLConfig>(count[0])
            if (egl.eglChooseConfig(display, list, configs, count[0], count)) configs.firstOrNull()?.let { return it }
        }
        Log.w("SpaceConfigChooser", "Sin configuración EGL adecuada")
        throw IllegalStateException("Este dispositivo no ofrece OpenGL ES 2.0")
    }

    companion object {
        const val EGL_OPENGL_ES2_BIT = 4
        const val EGL_OPENGL_ES3_BIT = 0x40
    }
}

/**
 * Contexto OpenGL ES 3 si la configuración lo admite y, si no (o si falla), ES 2: así un dispositivo sin ES 3 sigue
 * viendo el mundo en vez de cerrarse con un error del hilo de OpenGL.
 */
internal class SpaceContextFactory(private val es3: Boolean) : GLSurfaceView.EGLContextFactory {
    override fun createContext(egl: EGL10, display: EGLDisplay, config: EGLConfig): EGLContext {
        val renderable = IntArray(1)
        egl.eglGetConfigAttrib(display, config, EGL10.EGL_RENDERABLE_TYPE, renderable)
        if (es3 && renderable[0] and SpaceConfigChooser.EGL_OPENGL_ES3_BIT != 0) {
            val ctx = egl.eglCreateContext(display, config, EGL10.EGL_NO_CONTEXT, intArrayOf(EGL_CONTEXT_CLIENT_VERSION, 3, EGL10.EGL_NONE))
            if (ctx != null && ctx != EGL10.EGL_NO_CONTEXT) return ctx
            Log.w("SpaceContextFactory", "Sin contexto OpenGL ES 3: se usa ES 2")
        }
        return egl.eglCreateContext(display, config, EGL10.EGL_NO_CONTEXT, intArrayOf(EGL_CONTEXT_CLIENT_VERSION, 2, EGL10.EGL_NONE))
    }

    override fun destroyContext(egl: EGL10, display: EGLDisplay, context: EGLContext) {
        egl.eglDestroyContext(display, context)
    }

    private companion object {
        const val EGL_CONTEXT_CLIENT_VERSION = 0x3098
    }
}
