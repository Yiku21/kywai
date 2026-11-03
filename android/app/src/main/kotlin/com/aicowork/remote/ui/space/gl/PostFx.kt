package com.aicowork.remote.ui.space.gl

import android.opengl.GLES20
import android.opengl.GLES30
import android.util.Log
import com.aicowork.remote.ui.space.GlassRegion
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min

/**
 * Posprocesado del mundo: la escena se dibuja fuera de pantalla (con MSAA resuelto con `glBlitFramebuffer` si hay
 * OpenGL ES 3 y la calidad lo pide) y se compone en la pantalla con un grado de color suave y, bajo cada panel de
 * cristal, la escena muy difuminada (reducción a 1/2, 1/4 y 1/8, gaussiana separable y vuelta a 1/4), algo más oscura
 * y apagada, con un borde interior suave de 1,5 px. Si el dispositivo no permite dibujar fuera de pantalla, [begin]
 * devuelve false y la escena se dibuja directamente en la pantalla (sin cristal ni grado).
 */
internal class PostFx {

    private class Target(val fbo: Int, val tex: Int, val w: Int, val h: Int)

    private var es3 = false
    private var maxSamples = 0
    var width = 0; private set
    var height = 0; private set
    private var samples = 0
    private var failed = false

    private var sceneFbo = 0
    private var sceneTex = 0
    private var sceneDepth = 0
    private var msFbo = 0
    private var msColor = 0
    private var msDepth = 0
    private var chain: Array<Target>? = null

    private var triVbo = 0
    private lateinit var down: GlProgram
    private lateinit var up: GlProgram
    private lateinit var gauss: GlProgram
    private lateinit var composite: GlProgram
    private var kernel: BlurKernel? = null
    private var kernelSigma = -1f
    private val rects = FloatArray(GlassMask.MAX * 4)
    private val shapes = FloatArray(GlassMask.MAX * 2)

    /** Hay MSAA en el fotograma actual. */
    val multisampled: Boolean get() = samples > 0

    /** Contexto nuevo: los identificadores anteriores ya no existen (no se borran) y se crean los programas. */
    fun init(es3: Boolean) {
        this.es3 = es3
        sceneFbo = 0; sceneTex = 0; sceneDepth = 0
        msFbo = 0; msColor = 0; msDepth = 0
        chain = null
        width = 0; height = 0; samples = 0
        failed = false
        maxSamples = if (es3) IntArray(1).also { GLES20.glGetIntegerv(GLES30.GL_MAX_SAMPLES, it, 0) }[0] else 0
        down = GlProgram(PostShaders.TRI_VS, PostShaders.DOWN_FS)
        up = GlProgram(PostShaders.TRI_VS, PostShaders.UP_FS)
        gauss = GlProgram(PostShaders.TRI_VS, PostShaders.GAUSS_FS)
        composite = GlProgram(PostShaders.TRI_VS, PostShaders.COMPOSITE_FS)
        val ids = IntArray(1)
        GLES20.glGenBuffers(1, ids, 0)
        triVbo = ids[0]
        val tri = floatArrayOf(-1f, -1f, 3f, -1f, -1f, 3f)
        val buffer = ByteBuffer.allocateDirect(tri.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(tri); position(0) }
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, triVbo)
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, tri.size * 4, buffer, GLES20.GL_STATIC_DRAW)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
    }

    /**
     * Prepara el fotograma fuera de pantalla de [w]×[h] (con MSAA si [msaa] y el dispositivo lo admite) y lo deja
     * enlazado. Devuelve false si no se puede (se dibuja entonces directamente en la pantalla).
     */
    fun begin(w: Int, h: Int, msaa: Boolean): Boolean {
        if (failed) return false
        val wantSamples = if (msaa && es3 && maxSamples >= 2) min(4, maxSamples) else 0
        if (w != width || h != height || wantSamples != samples || sceneFbo == 0) {
            if (!allocate(w, h, wantSamples)) {
                Log.w(TAG, "Sin dibujo fuera de pantalla: se dibuja directamente")
                releaseTargets()
                failed = true
                return false
            }
        }
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, if (samples > 0) msFbo else sceneFbo)
        GLES20.glViewport(0, 0, width, height)
        return true
    }

    /** Termina la escena: resuelve el MSAA y descarta la profundidad (en GPU por teselas ahorra memoria). */
    fun resolve() {
        if (samples > 0) {
            GLES20.glBindFramebuffer(GLES30.GL_READ_FRAMEBUFFER, msFbo)
            GLES20.glBindFramebuffer(GLES30.GL_DRAW_FRAMEBUFFER, sceneFbo)
            GLES30.glBlitFramebuffer(0, 0, width, height, 0, 0, width, height, GLES20.GL_COLOR_BUFFER_BIT, GLES20.GL_NEAREST)
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, msFbo)
            GLES30.glInvalidateFramebuffer(GLES20.GL_FRAMEBUFFER, 2, intArrayOf(GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_DEPTH_ATTACHMENT), 0)
        } else if (es3) {
            GLES30.glInvalidateFramebuffer(GLES20.GL_FRAMEBUFFER, 1, intArrayOf(GLES20.GL_DEPTH_ATTACHMENT), 0)
        }
    }

    /** Difumina la escena para los cristales; [sigmaPx] es la desviación típica en píxeles de pantalla. */
    fun blur(sigmaPx: Float): Int {
        val c = chain ?: allocateChain() ?: return 0
        GLES20.glDisable(GLES20.GL_DEPTH_TEST)
        GLES20.glDisable(GLES20.GL_BLEND)
        // 1/2, 1/4 y 1/8 con el filtro de reducción «dual» (cada paso promedia 4×4 texeles: sin parpadeos).
        pass(down, c[0], sceneTex, 1f / width, 1f / height)
        pass(down, c[1], c[0].tex, 1f / c[0].w, 1f / c[0].h)
        pass(down, c[2], c[1].tex, 1f / c[1].w, 1f / c[1].h)
        // Gaussiana separable a 1/8.
        val sigma = (sigmaPx / 8f).coerceIn(0.5f, BlurKernel.MAX_PAIRS * 2 / 3f)
        val k = kernel?.takeIf { kernelSigma == sigma } ?: BlurKernel.gaussian(sigma).also { kernel = it; kernelSigma = sigma }
        gaussPass(k, c[3], c[2], 1f / c[2].w, 0f)
        gaussPass(k, c[2], c[3], 0f, 1f / c[3].h)
        // Vuelta a 1/4 con el filtro de ampliación en tienda (sin la cuadrícula de la interpolación bilineal).
        pass(up, c[4], c[2].tex, 0.5f / c[2].w, 0.5f / c[2].h)
        return c[4].tex
    }

    private fun pass(p: GlProgram, target: Target, source: Int, tx: Float, ty: Float) {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, target.fbo)
        GLES20.glViewport(0, 0, target.w, target.h)
        p.use()
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, source)
        p.set1i("uTex", 0)
        p.set2("uTexel", tx, ty)
        drawTri(p)
    }

    private fun gaussPass(k: BlurKernel, target: Target, source: Target, sx: Float, sy: Float) {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, target.fbo)
        GLES20.glViewport(0, 0, target.w, target.h)
        val p = gauss
        p.use()
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, source.tex)
        p.set1i("uTex", 0)
        p.set2("uStep", sx, sy)
        p.set1("uW0", k.center)
        p.set1i("uN", k.pairs)
        GLES20.glUniform1fv(p.uniform("uOff"), k.pairs, k.offsets, 0)
        GLES20.glUniform1fv(p.uniform("uW"), k.pairs, k.weights, 0)
        drawTri(p)
    }

    /**
     * Compone la escena en la pantalla: grado de color y, en cada cristal de [regions] (píxeles de la vista, origen
     * arriba a la izquierda), la escena difuminada [blurTex].
     */
    fun composite(regions: List<GlassRegion>, blurTex: Int, edgePx: Float) {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        GLES20.glViewport(0, 0, width, height)
        GLES20.glDisable(GLES20.GL_DEPTH_TEST)
        GLES20.glDisable(GLES20.GL_BLEND)
        GLES20.glDepthMask(true)
        // Borrar la pantalla no cuesta nada y evita que la GPU cargue el fotograma anterior.
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
        val p = composite
        p.use()
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, sceneTex)
        p.set1i("uScene", 0)
        val count = if (blurTex != 0) min(regions.size, GlassMask.MAX) else 0
        GLES20.glActiveTexture(GLES20.GL_TEXTURE1)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, if (count > 0) blurTex else sceneTex)
        p.set1i("uBlur", 1)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        p.set2("uView", width.toFloat(), height.toFloat())
        p.set1("uEdge", max(0.75f, edgePx))
        p.set1i("uCount", count)
        for (i in 0 until count) {
            val r = regions[i]
            rects[i * 4] = r.left; rects[i * 4 + 1] = r.top; rects[i * 4 + 2] = r.right; rects[i * 4 + 3] = r.bottom
            shapes[i * 2] = r.radius; shapes[i * 2 + 1] = r.alpha
        }
        if (count > 0) {
            GLES20.glUniform4fv(p.uniform("uRect"), count, rects, 0)
            GLES20.glUniform2fv(p.uniform("uShape"), count, shapes, 0)
        }
        drawTri(p)
    }

    private fun drawTri(p: GlProgram) {
        val loc = p.attrib("aPos")
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, triVbo)
        GLES20.glEnableVertexAttribArray(loc)
        GLES20.glVertexAttribPointer(loc, 2, GLES20.GL_FLOAT, false, 8, 0)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3)
        GLES20.glDisableVertexAttribArray(loc)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
    }

    // ---- Búferes ----

    private fun allocate(w: Int, h: Int, wantSamples: Int): Boolean {
        releaseTargets()
        width = w
        height = h
        samples = 0
        val (fbo, tex) = colorTarget(w, h)
        sceneFbo = fbo
        sceneTex = tex
        if (wantSamples > 0) {
            val ids = IntArray(2)
            GLES20.glGenRenderbuffers(2, ids, 0)
            msColor = ids[0]; msDepth = ids[1]
            GLES20.glBindRenderbuffer(GLES20.GL_RENDERBUFFER, msColor)
            GLES30.glRenderbufferStorageMultisample(GLES20.GL_RENDERBUFFER, wantSamples, GLES30.GL_RGBA8, w, h)
            GLES20.glBindRenderbuffer(GLES20.GL_RENDERBUFFER, msDepth)
            GLES30.glRenderbufferStorageMultisample(GLES20.GL_RENDERBUFFER, wantSamples, GLES30.GL_DEPTH_COMPONENT24, w, h)
            val f = IntArray(1)
            GLES20.glGenFramebuffers(1, f, 0)
            msFbo = f[0]
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, msFbo)
            GLES20.glFramebufferRenderbuffer(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_RENDERBUFFER, msColor)
            GLES20.glFramebufferRenderbuffer(GLES20.GL_FRAMEBUFFER, GLES20.GL_DEPTH_ATTACHMENT, GLES20.GL_RENDERBUFFER, msDepth)
            if (GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER) == GLES20.GL_FRAMEBUFFER_COMPLETE) {
                samples = wantSamples
            } else {
                // Sin MSAA, pero con todo lo demás.
                deleteMsaa()
            }
        }
        if (samples == 0) {
            val ids = IntArray(1)
            GLES20.glGenRenderbuffers(1, ids, 0)
            sceneDepth = ids[0]
            GLES20.glBindRenderbuffer(GLES20.GL_RENDERBUFFER, sceneDepth)
            GLES20.glRenderbufferStorage(GLES20.GL_RENDERBUFFER, if (es3) GLES30.GL_DEPTH_COMPONENT24 else GLES20.GL_DEPTH_COMPONENT16, w, h)
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, sceneFbo)
            GLES20.glFramebufferRenderbuffer(GLES20.GL_FRAMEBUFFER, GLES20.GL_DEPTH_ATTACHMENT, GLES20.GL_RENDERBUFFER, sceneDepth)
        }
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, sceneFbo)
        val ok = GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER) == GLES20.GL_FRAMEBUFFER_COMPLETE
        GLES20.glBindRenderbuffer(GLES20.GL_RENDERBUFFER, 0)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        return ok
    }

    /** La cadena del difuminado se crea la primera vez que hace falta (sin cristales no ocupa memoria). */
    private fun allocateChain(): Array<Target>? {
        if (width <= 0 || height <= 0) return null
        fun size(div: Int) = max(1, width / div) to max(1, height / div)
        val sizes = listOf(size(2), size(4), size(8), size(8), size(4))
        val targets = sizes.map { (w, h) -> colorTarget(w, h).let { Target(it.first, it.second, w, h) } }.toTypedArray()
        for (t in targets) {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, t.fbo)
            if (GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER) != GLES20.GL_FRAMEBUFFER_COMPLETE) {
                targets.forEach { deleteTarget(it.fbo, it.tex) }
                GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
                return null
            }
        }
        chain = targets
        return targets
    }

    private fun colorTarget(w: Int, h: Int): Pair<Int, Int> {
        val t = IntArray(1)
        GLES20.glGenTextures(1, t, 0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, t[0])
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        // Con ES 3 el formato con tamaño (RGBA8) es el que admite resolver el MSAA con `glBlitFramebuffer`.
        val internal = if (es3) GLES30.GL_RGBA8 else GLES20.GL_RGBA
        GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, internal, w, h, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, null)
        val f = IntArray(1)
        GLES20.glGenFramebuffers(1, f, 0)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, f[0])
        GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_TEXTURE_2D, t[0], 0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
        return f[0] to t[0]
    }

    private fun deleteTarget(fbo: Int, tex: Int) {
        if (fbo != 0) GLES20.glDeleteFramebuffers(1, intArrayOf(fbo), 0)
        if (tex != 0) GLES20.glDeleteTextures(1, intArrayOf(tex), 0)
    }

    private fun deleteMsaa() {
        if (msFbo != 0) GLES20.glDeleteFramebuffers(1, intArrayOf(msFbo), 0)
        if (msColor != 0 || msDepth != 0) GLES20.glDeleteRenderbuffers(2, intArrayOf(msColor, msDepth), 0)
        msFbo = 0; msColor = 0; msDepth = 0
    }

    private fun releaseTargets() {
        deleteTarget(sceneFbo, sceneTex)
        if (sceneDepth != 0) GLES20.glDeleteRenderbuffers(1, intArrayOf(sceneDepth), 0)
        sceneFbo = 0; sceneTex = 0; sceneDepth = 0
        deleteMsaa()
        chain?.forEach { deleteTarget(it.fbo, it.tex) }
        chain = null
        width = 0; height = 0; samples = 0
    }

    private companion object {
        const val TAG = "PostFx"
    }
}

/** Sombreadores del posprocesado (GLSL ES 1.00: valen en contextos ES 2 y ES 3). */
internal object PostShaders {
    private const val HEAD = """
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif
    """

    /** Triángulo que cubre la pantalla. */
    const val TRI_VS = """
        attribute vec2 aPos;
        varying vec2 vUV;
        void main() {
            vUV = aPos * 0.5 + 0.5;
            gl_Position = vec4(aPos, 0.0, 1.0);
        }
    """

    /** Reducción a la mitad («dual filter»): centro × 4 + cuatro esquinas, cubriendo 4×4 texeles. */
    const val DOWN_FS = HEAD + """
        uniform sampler2D uTex;
        uniform vec2 uTexel;
        varying vec2 vUV;
        void main() {
            vec4 s = texture2D(uTex, vUV) * 4.0;
            s += texture2D(uTex, vUV - uTexel);
            s += texture2D(uTex, vUV + uTexel);
            s += texture2D(uTex, vUV + vec2(uTexel.x, -uTexel.y));
            s += texture2D(uTex, vUV - vec2(uTexel.x, -uTexel.y));
            gl_FragColor = s / 8.0;
        }
    """

    /** Ampliación al doble con un filtro en tienda de 8 muestras ([uTexel] = medio texel de la fuente). */
    const val UP_FS = HEAD + """
        uniform sampler2D uTex;
        uniform vec2 uTexel;
        varying vec2 vUV;
        void main() {
            vec2 h = uTexel;
            vec4 s = texture2D(uTex, vUV + vec2(-h.x * 2.0, 0.0));
            s += texture2D(uTex, vUV + vec2(-h.x, h.y)) * 2.0;
            s += texture2D(uTex, vUV + vec2(0.0, h.y * 2.0));
            s += texture2D(uTex, vUV + vec2(h.x, h.y)) * 2.0;
            s += texture2D(uTex, vUV + vec2(h.x * 2.0, 0.0));
            s += texture2D(uTex, vUV + vec2(h.x, -h.y)) * 2.0;
            s += texture2D(uTex, vUV + vec2(0.0, -h.y * 2.0));
            s += texture2D(uTex, vUV + vec2(-h.x, -h.y)) * 2.0;
            gl_FragColor = s / 12.0;
        }
    """

    /** Gaussiana separable con muestreo lineal (pares de texeles ya combinados en [BlurKernel]). */
    const val GAUSS_FS = HEAD + """
        uniform sampler2D uTex;
        uniform vec2 uStep;
        uniform float uW0;
        uniform float uOff[16];
        uniform float uW[16];
        uniform int uN;
        varying vec2 vUV;
        void main() {
            vec4 s = texture2D(uTex, vUV) * uW0;
            for (int i = 0; i < 16; i++) {
                if (i >= uN) break;
                vec2 o = uStep * uOff[i];
                s += (texture2D(uTex, vUV + o) + texture2D(uTex, vUV - o)) * uW[i];
            }
            gl_FragColor = s;
        }
    """

    /**
     * Composición: cristal esmerilado bajo cada panel (rectángulo redondeado con borde interior suave), grado de color
     * (saturación 0,88 y luces altas suavizadas, sin resplandores) y un ligerísimo tramado contra las bandas.
     */
    const val COMPOSITE_FS = HEAD + """
        uniform sampler2D uScene;
        uniform sampler2D uBlur;
        uniform vec2 uView;
        uniform vec4 uRect[8];
        uniform vec2 uShape[8];
        uniform int uCount;
        uniform float uEdge;
        varying vec2 vUV;

        float roundRect(vec2 p, vec4 r, float radius) {
            vec2 c = (r.xy + r.zw) * 0.5;
            vec2 hs = (r.zw - r.xy) * 0.5;
            vec2 q = abs(p - c) - hs + radius;
            return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
        }

        vec3 shoulder(vec3 c) {
            const float knee = 0.78;
            vec3 over = max(c - knee, 0.0);
            return min(c, vec3(knee)) + (1.0 - knee) * (1.0 - exp(-over / (1.0 - knee)));
        }

        void main() {
            vec3 c = texture2D(uScene, vUV).rgb;
            // Píxel con el origen arriba a la izquierda, como los rectángulos de la interfaz.
            vec2 p = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
            float glass = 0.0;
            for (int i = 0; i < 8; i++) {
                if (i >= uCount) break;
                float d = roundRect(p, uRect[i], uShape[i].x);
                glass = max(glass, smoothstep(0.0, uEdge, -d) * uShape[i].y);
            }
            if (glass > 0.0) {
                vec3 b = texture2D(uBlur, vUV).rgb;
                float l = dot(b, vec3(0.2126, 0.7152, 0.0722));
                b = mix(vec3(l), b, 0.8) * 0.88 + vec3(0.006, 0.009, 0.02);
                c = mix(c, b, glass);
            }
            float g = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c = mix(vec3(g), c, 0.88);
            c = shoulder(c);
            float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
            c += (n - 0.5) / 255.0;
            gl_FragColor = vec4(c, 1.0);
        }
    """
}
