package com.aicowork.remote.ui.space

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.tan

/**
 * Cámara del espacio, con los mismos límites y encuadres que `CameraRig.tsx` del escritorio: estable (solo se mueve
 * por acción del usuario), FOV de 30°, vista general según la forma de la pantalla, giro limitado a ±0,95 rad y
 * acercar a una estación como al pulsarla en el escritorio. Los gestos (hilo de la interfaz) cambian el objetivo y el
 * renderizador (hilo de OpenGL) lo alcanza con suavidad en [update]; por eso los métodos están sincronizados.
 */
class OrbitCamera(initial: Pose = Pose(), atOverview: Boolean = true) {

    /** [yaw] es el acimut alrededor del eje vertical (0 = de frente) y [pitch] la elevación sobre el suelo. */
    data class Pose(
        val yaw: Float = 0f,
        val pitch: Float = 1.07f,
        val distance: Float = 25f,
        val target: Vec3 = Vec3(0f, 0.3f, 1.2f),
    ) {
        fun eye(): Vec3 {
            val c = cos(pitch)
            return target + Vec3(c * sin(yaw), sin(pitch), c * cos(yaw)) * distance
        }
    }

    private var goal = initial
    private var current = initial
    private var dragging = false

    /** Sigue en la vista general: al cambiar el tamaño de la pantalla se vuelve a encuadrar. */
    @get:Synchronized
    var atOverview = atOverview
        private set

    @get:Synchronized
    val pose: Pose get() = current

    @get:Synchronized
    val goalPose: Pose get() = goal

    /** Arrastre de un dedo: [dx] y [dy] en píxeles. Una altura de pantalla equivale a una vuelta, como en el escritorio. */
    @Synchronized
    fun orbit(dx: Float, dy: Float, viewHeight: Float) {
        val h = viewHeight.coerceAtLeast(1f)
        atOverview = false
        goal = clamp(goal.copy(yaw = goal.yaw - dx / h * 2f * PI.toFloat(), pitch = goal.pitch + dy / h * 2f * PI.toFloat()))
    }

    /** Arrastre con dos dedos: desplaza la vista sobre el suelo. */
    @Synchronized
    fun pan(dx: Float, dy: Float, viewHeight: Float) {
        val h = viewHeight.coerceAtLeast(1f)
        atOverview = false
        val perPixel = 2f * goal.distance * tan(FOV_Y / 2f) / h
        val right = Vec3(cos(goal.yaw), 0f, -sin(goal.yaw))
        val forward = Vec3(-sin(goal.yaw), 0f, -cos(goal.yaw))
        // El suelo se ve inclinado: arrastrar en vertical recorre más metros cuanto más rasante es la vista.
        val depth = 1f / sin(goal.pitch).coerceAtLeast(0.35f)
        goal = clamp(goal.copy(target = goal.target - right * (dx * perPixel) + forward * (dy * perPixel * depth)))
    }

    /** Pellizco: [factor] > 1 acerca. */
    @Synchronized
    fun zoom(factor: Float) {
        if (factor <= 0f) return
        atOverview = false
        goal = clamp(goal.copy(distance = goal.distance / factor))
    }

    /** Botones de acercar (+1) y alejar (-1): el mismo paso que el escritorio. */
    @Synchronized
    fun dolly(dir: Int) {
        atOverview = false
        goal = clamp(goal.copy(distance = goal.distance - dir * DOLLY_STEP))
    }

    @Synchronized
    fun setDragging(value: Boolean) { dragging = value }

    /** Acerca la vista a un punto del suelo (una estación o una zona), como al pulsar una estación en el escritorio. */
    @Synchronized
    fun focus(x: Float, z: Float, aspect: Float = 1.6f) {
        atOverview = false
        goal = focusPose(x, z, aspect)
    }

    /** Vista general: más cenital en pantallas verticales para que quepan todas las estaciones. */
    @Synchronized
    fun overview(aspect: Float) {
        goal = overviewPose(aspect)
        atOverview = true
    }

    @Synchronized
    fun restore(pose: Pose, overview: Boolean) {
        goal = clamp(pose)
        current = goal
        atOverview = overview
    }

    /** Coloca la cámara al instante (primer encuadre). */
    @Synchronized
    fun snap() { current = goal }

    /** [reducedMotion]: transiciones casi directas, como el escritorio con efectos reducidos (0,12 s / 0,06 s). */
    @Synchronized
    fun update(dt: Float, reducedMotion: Boolean = false) {
        // `smoothTime` 0,55 s en las transiciones y 0,18 s mientras se arrastra (los del escritorio).
        val lambda = if (reducedMotion) (if (dragging) 40f else 24f) else if (dragging) 14f else 5.5f
        current = Pose(
            yaw = dampAngle(current.yaw, goal.yaw, lambda, dt),
            pitch = damp(current.pitch, goal.pitch, lambda, dt),
            distance = damp(current.distance, goal.distance, lambda, dt),
            target = Vec3(
                damp(current.target.x, goal.target.x, lambda, dt),
                damp(current.target.y, goal.target.y, lambda, dt),
                damp(current.target.z, goal.target.z, lambda, dt),
            ),
        )
    }

    /** Vista · proyección de la pose actual (encuadre centrado en toda la vista). */
    fun viewProjection(out: FloatArray, aspect: Float, pose: Pose = this.pose): FloatArray {
        val view = M4.lookAt(FloatArray(16), pose.eye(), pose.target)
        val proj = M4.perspective(FloatArray(16), FOV_Y, aspect, NEAR, FAR)
        return M4.multiply(out, proj, view)
    }

    /**
     * Vista · proyección con el encuadre en [framing] (un rectángulo de la vista de [viewWidth]×[viewHeight] px): el
     * punto de mira queda en el centro de ese rectángulo y el mundo se ve como si la vista fuera solo ese hueco, pero
     * se sigue dibujando en toda la pantalla (desplazamiento de lente, sin cambiar el viewport).
     */
    fun viewProjection(out: FloatArray, viewWidth: Float, viewHeight: Float, framing: Framing, pose: Pose = this.pose): FloatArray {
        val view = M4.lookAt(FloatArray(16), pose.eye(), pose.target)
        val proj = projection(FloatArray(16), viewWidth, viewHeight, framing)
        return M4.multiply(out, proj, view)
    }

    companion object {
        /**
         * Proyección descentrada: el rectángulo [framing] recibe el campo de visión normal (30° en vertical, con su
         * propia proporción) y el resto de la vista lo amplía hacia los lados que tapan los controles.
         */
        fun projection(out: FloatArray, viewWidth: Float, viewHeight: Float, framing: Framing): FloatArray {
            val w = viewWidth.coerceAtLeast(1f)
            val h = viewHeight.coerceAtLeast(1f)
            val halfTop = NEAR * tan(FOV_Y / 2f)
            // Unidades del plano cercano por píxel: las que da el campo de visión a la altura del encuadre.
            val perPx = 2f * halfTop / framing.height.coerceAtLeast(1f)
            return M4.frustum(
                out,
                left = -framing.centerX * perPx,
                right = (w - framing.centerX) * perPx,
                bottom = (framing.centerY - h) * perPx,
                top = framing.centerY * perPx,
                near = NEAR,
                far = FAR,
            )
        }

        /** 30°, como la cámara del escritorio. */
        const val FOV_Y = 0.5235988f
        const val NEAR = 0.5f
        const val FAR = 150f
        const val MIN_DISTANCE = 6f
        const val MAX_DISTANCE = 64f
        /** Ángulo polar 0,32‥1,2 del escritorio, expresado como elevación. */
        const val MIN_PITCH = (PI / 2 - 1.2).toFloat()
        const val MAX_PITCH = (PI / 2 - 0.32).toFloat()
        const val MAX_YAW = 0.95f
        const val DOLLY_STEP = 4.5f
        /** Zona por la que puede moverse el punto de mira. */
        val BOUNDS_MIN = Vec3(-11f, -0.5f, -9f)
        val BOUNDS_MAX = Vec3(11f, 4f, 9f)

        /**
         * Vista general: la del escritorio en apaisado (desde 1,7) y la cenital en vertical (hasta 1,1); entre medias
         * (huecos casi cuadrados, como el móvil plegado con un panel abajo) pasa de una a otra sin saltos.
         */
        fun overviewPose(aspect: Float): Pose {
            val a = aspect.coerceAtLeast(0.1f)
            if (a >= 1.7f) return landscapeOverview(a)
            if (a < 1.1f) return portraitOverview(a)
            val t = smoothstep(1.1f, 1.7f, a)
            val p = portraitOverview(a)
            val l = landscapeOverview(a)
            return lookAt(p.eye().lerp(l.eye(), t), p.target.lerp(l.target, t))
        }

        private fun landscapeOverview(aspect: Float): Pose {
            val k = max(1f, 1.78f / aspect)
            return lookAt(Vec3(0f, 13.6f * k, 21.2f * k), Vec3(0f, 0.3f, 1.2f))
        }

        private fun portraitOverview(aspect: Float): Pose {
            val k = max(1f, 1.32f / aspect)
            return lookAt(Vec3(0f, 21f * k, 11.5f * k), Vec3(0f, 0f, 0.6f))
        }

        /**
         * Encuadre de una estación: el del escritorio; en pantallas verticales, más lejos en proporción, para que
         * quepa la plataforma con su consola.
         */
        fun focusPose(x: Float, z: Float, aspect: Float): Pose {
            val k = (1.1f / aspect.coerceAtLeast(0.1f)).coerceIn(1f, 2.4f)
            val target = Vec3(x, 0.9f, z)
            return lookAt(target + (Vec3(x * 0.85f, 7.6f, z + 9.4f) - target) * k, target)
        }

        fun lookAt(eye: Vec3, target: Vec3): Pose {
            val d = eye - target
            val len = d.length().coerceAtLeast(1e-3f)
            return clamp(Pose(yaw = atan2(d.x, d.z), pitch = asin((d.y / len).coerceIn(-1f, 1f)), distance = len, target = target))
        }

        fun clamp(p: Pose) = Pose(
            yaw = p.yaw.coerceIn(-MAX_YAW, MAX_YAW),
            pitch = p.pitch.coerceIn(MIN_PITCH, MAX_PITCH),
            distance = p.distance.coerceIn(MIN_DISTANCE, MAX_DISTANCE),
            target = Vec3(
                p.target.x.coerceIn(BOUNDS_MIN.x, BOUNDS_MAX.x),
                p.target.y.coerceIn(BOUNDS_MIN.y, BOUNDS_MAX.y),
                p.target.z.coerceIn(BOUNDS_MIN.z, BOUNDS_MAX.z),
            ),
        )
    }
}

/**
 * Hueco de la vista donde se encuadra el mundo, en píxeles con el origen arriba a la izquierda (como [WorldInsets]).
 * La cámara centra su punto de mira en él y la vista general y los acercamientos se calculan con su proporción.
 */
data class Framing(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    val width: Float get() = right - left
    val height: Float get() = bottom - top
    val centerX: Float get() = (left + right) / 2f
    val centerY: Float get() = (top + bottom) / 2f
    val aspect: Float get() = width / height.coerceAtLeast(1f)

    /** Se acerca a [target] con suavidad (sin saltos al abrir o cerrar un panel). */
    fun approach(target: Framing, lambda: Float, dt: Float) = Framing(
        damp(left, target.left, lambda, dt),
        damp(top, target.top, lambda, dt),
        damp(right, target.right, lambda, dt),
        damp(bottom, target.bottom, lambda, dt),
    )

    fun near(o: Framing, eps: Float = 0.5f) =
        abs(left - o.left) < eps && abs(top - o.top) < eps && abs(right - o.right) < eps && abs(bottom - o.bottom) < eps

    companion object {
        /**
         * El encuadre nunca es menor que esta parte de la vista: con un panel muy ancho el mundo se centra en el
         * hueco, pero no se encoge hasta una tira (lo que sobra queda bajo el cristal, que deja verlo).
         */
        const val MIN_FRACTION = 0.55f

        /** Proporción mínima del encuadre (ancho / alto): la de la vista general vertical más lejana que cabe. */
        const val MIN_ASPECT = 0.5f

        fun full(viewWidth: Float, viewHeight: Float) = Framing(0f, 0f, viewWidth, viewHeight)

        /** Al acercarse a una estación basta con un hueco mucho más pequeño (es un objeto, no toda la oficina). */
        const val MIN_FOCUS_FRACTION = 0.3f

        /**
         * Hueco libre de una vista de [viewWidth]×[viewHeight] px con los controles en [insets]. Con [fitOverview]
         * (vista general) el encuadre tiene un tamaño mínimo para que quepa toda la oficina; acercado a una estación
         * es el hueco tal cual, para que quede justo en su centro.
         */
        fun of(viewWidth: Float, viewHeight: Float, insets: WorldInsets, fitOverview: Boolean = true): Framing {
            val w = viewWidth.coerceAtLeast(1f)
            val h = viewHeight.coerceAtLeast(1f)
            val l = insets.left.coerceIn(0f, w)
            val r = (w - insets.right.coerceAtLeast(0f)).coerceIn(l, w)
            val t = insets.top.coerceIn(0f, h)
            val b = (h - insets.bottom.coerceAtLeast(0f)).coerceIn(t, h)
            val minFraction = if (fitOverview) MIN_FRACTION else MIN_FOCUS_FRACTION
            val fh = max(b - t, h * minFraction)
            // Ni más estrecho que [MIN_ASPECT]: la vista general no puede alejarse más (MAX_DISTANCE) y no cabría.
            val fw = min(w, max(max(r - l, w * minFraction), if (fitOverview) fh * MIN_ASPECT else 0f))
            // Centrado en el hueco; si el encuadre mínimo no cabe, crece hacia los controles (bajo el cristal) y nunca
            // por fuera del borde libre de la pantalla.
            val cx = ((l + r) / 2f).coerceIn(fw / 2f, w - fw / 2f)
            val cy = ((t + b) / 2f).coerceIn(fh / 2f, h - fh / 2f)
            return Framing(cx - fw / 2f, cy - fh / 2f, cx + fw / 2f, cy + fh / 2f)
        }
    }
}

/** Lo que hay bajo el dedo. */
sealed interface ScenePick {
    data class Agent(val id: String) : ScenePick
    data class Station(val id: String) : ScenePick
    data class Zone(val zone: SpaceZone) : ScenePick
    data object Core : ScenePick
}

/** Un objetivo táctil: un punto del mundo y su radio. Los robots tienen prioridad sobre lo que hay debajo. */
data class PickTarget(val pick: ScenePick, val center: Vec3, val radius: Float, val priority: Int = 0)

object ScenePicker {
    /**
     * Objetivo bajo el dedo. Se proyecta cada objetivo a la pantalla y se acepta el toque si cae dentro de su silueta
     * aproximada o, si se ve pequeño, dentro de [minRadiusPx] (≈ medio objetivo táctil). Gana la prioridad más alta
     * (robots) y, a igualdad, el más cercano a la cámara. Con un encuadre descentrado ([Framing]), [frameHeight] es
     * su altura: el campo de visión se reparte en ella, no en toda la vista.
     */
    fun pick(
        viewProjection: FloatArray,
        width: Float,
        height: Float,
        x: Float,
        y: Float,
        targets: List<PickTarget>,
        minRadiusPx: Float,
        frameHeight: Float = height,
    ): ScenePick? {
        val focal = 1f / tan(OrbitCamera.FOV_Y / 2f)
        val clip = FloatArray(4)
        var best: PickTarget? = null
        var bestDepth = Float.MAX_VALUE
        var bestDist = Float.MAX_VALUE
        for (t in targets) {
            M4.transform(viewProjection, t.center, clip)
            val w = clip[3]
            if (w <= OrbitCamera.NEAR) continue // detrás de la cámara
            val sx = (clip[0] / w * 0.5f + 0.5f) * width
            val sy = (1f - (clip[1] / w * 0.5f + 0.5f)) * height
            val radiusPx = t.radius * focal * frameHeight / 2f / w
            val dist = hypot(sx - x, sy - y)
            if (dist > maxOf(radiusPx, minRadiusPx)) continue
            val b = best
            val better = b == null || t.priority > b.priority ||
                (t.priority == b.priority && (w < bestDepth - 0.5f || (abs(w - bestDepth) <= 0.5f && dist < bestDist)))
            if (better) {
                best = t
                bestDepth = w
                bestDist = dist
            }
        }
        return best?.pick
    }

    /** Objetivos de la escena: robots, plataformas, zonas y núcleo. */
    fun targets(scene: SpaceScene): List<PickTarget> = buildList {
        for (a in scene.agents) add(PickTarget(ScenePick.Agent(a.id), a.position.withY(a.position.y + 0.1f), 0.62f * SpaceLayout.ROBOT_SCALE, priority = 2))
        for (s in scene.stations) add(PickTarget(ScenePick.Station(s.id), Vec3(s.x, SpaceLayout.PLATFORM_Y + 0.2f, s.z), 1.5f, priority = 1))
        for (z in SpaceZone.entries) add(PickTarget(ScenePick.Zone(z), Vec3(z.x, 1f, z.z), 1.4f))
        add(PickTarget(ScenePick.Core, Vec3(0f, 1.6f, 0f), 2f))
    }
}
