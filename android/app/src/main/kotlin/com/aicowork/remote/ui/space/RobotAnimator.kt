package com.aicowork.remote.ui.space

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sin

/**
 * Cerebro de animación de un robot: el mismo que `robotBrain.ts` del escritorio. Recibe el estado real (estado
 * visual, dónde está, a quién espera) y momentos puntuales (enviar, recibir, celebrar) y produce valores suavizados
 * que el renderizador aplica a la malla cada fotograma. Kotlin puro, para probarlo en la JVM.
 */
class RobotAnimator(val id: String) {

    private class Profile(
        val bobAmp: Float, val bobFreq: Float, val open: Float, val glow: Float,
        val station: Float, val drop: Float, val pitch: Float, val roll: Float,
    )

    val phase = hash01(id)
    private val rnd = Seeded(floor(phase * 1e9f).toInt() + 7)

    // Entradas
    var agent: SceneAgent? = null; private set
    private var baseVisual = AgentVisual.Idle
    private var atCore = false
    private var waitingForPos: Vec3? = null
    var home = Vec3.Zero; private set
    var bay = Vec3.Zero; private set
    private var consolePos = Vec3.Zero
    private var consoleSide = 1
    var reduced = false

    // Momentos puntuales
    private var sendStart = -10f
    private var sendTarget = Vec3.Zero
    private var expectUntil = -10f
    private var expectFrom = Vec3.Zero
    private var ackStart = -10f
    private var ackStrength = 1f
    private var celebrateStart = -10f
    private var pokeStart = -10f
    private var alertStart = -10f
    private var attention = false
    private var spawnStart = -10f
    var leaving = false; private set
    private var leaveStart = 0f

    // Desplazamiento
    private var anchorCore = false
    var moving = false; private set
    private var moveFrom = Vec3.Zero
    private var moveTo = Vec3.Zero
    private var moveStart = 0f
    private var moveDur = 1f
    private var prevBase = Vec3.Zero

    // Salidas
    var pos = Vec3.Zero; private set
    var yaw = 0f; private set
    var pitch = 0f; private set
    var roll = 0f; private set
    var squashY = 1f; private set
    var scale = 1f; private set
    var eyeOpen = 1f; private set
    var eyeLookX = 0f; private set
    var eyeLookY = 0f; private set
    var eyeHappy = 0f; private set
    var eyeError = 0f; private set
    var glow = 0.14f; private set
    var stationLevel = 0.3f; private set
    var thinkingAmt = 0f; private set
    var waitingAmt = 0f; private set
    var checkAmt = 0f; private set
    var restAmt = 0f; private set
    var offlineAmt = 0f; private set
    var ackAmt = 0f; private set
    var emitAmt = 0f; private set
    /** Símbolo de pausa sobre la cabeza (0‥1). */
    var pausedAmt = 0f; private set
    /** Aviso ámbar de «necesita tu respuesta» (0‥1). */
    var attentionAmt = 0f; private set
    /** Gesto de error tras una tarea fallida (0‥1, se apaga solo). */
    var alertAmt = 0f; private set
    /** Reacción a un toque del usuario (0‥1, se apaga solo). */
    var pokeAmt = 0f; private set
    var visual = AgentVisual.Idle; private set
    var yawWithSpin = 0f; private set

    // Estado interno
    private var bobPhase = phase * PI.toFloat() * 2f
    private var nodPhase = 0f
    private var bobAmp = 0.07f
    private var bobFreq = 0.42f
    private var drop = 0f
    private var nextBlink = 1f + rnd.next() * 3f
    private var blinkStart = -10f
    private var blinkLen = 0.13f
    private var secondBlink = false
    private var nextLook = 2f + rnd.next() * 4f
    private var lookYaw = 0f
    private var nextSaccade = 1f + rnd.next() * 2f
    private var saccadeX = 0f
    private var saccadeY = 0f
    private var spin = 0f
    private var initialized = false

    /** Ya terminó de irse (sub-agente que acabó). */
    fun gone(t: Float) = leaving && t - leaveStart > 0.75f

    /** Ya se ha animado al menos una vez ([pos] es válida). */
    val ready: Boolean get() = initialized

    fun setTarget(target: SceneAgent, waitingFor: Vec3?) {
        agent = target
        baseVisual = target.visual
        atCore = target.atCore
        waitingForPos = waitingFor
        home = target.home
        bay = target.bay
        consolePos = target.home + Vec3(0f, 0.1f, 0f) + SpaceLayout.consoleOffset(target.consoleSide)
        consoleSide = target.consoleSide
        attention = target.attention
        if (leaving) leaving = false
    }

    fun spawn(t: Float) {
        spawnStart = t
        scale = 0f
    }

    fun leave(t: Float) {
        if (leaving) return
        leaving = true
        leaveStart = t
    }

    /** El robot emite un paquete hacia [target]. */
    fun onSend(target: Vec3, t: Float) {
        sendTarget = target
        sendStart = t
    }

    /** Un paquete viene desde [from] y llegará en [until]. */
    fun onExpect(from: Vec3, t: Float, until: Float) {
        expectFrom = from
        expectUntil = until
    }

    /** Recibe algo: cabeceo y brillo. Con [strength] < 1, un asentimiento más discreto (Hermes recibiendo resultados). */
    fun onReceive(t: Float, strength: Float = 1f) {
        ackStart = t
        ackStrength = strength
    }

    fun onCelebrate(t: Float) { celebrateStart = t }

    /** Tarea fallida: ojos de error un momento y un breve «no» con la cabeza (sin movimiento si es reducido). */
    fun onAlert(t: Float) { alertStart = t }

    /** El usuario lo ha tocado: ojos felices, brillo y un saltito (sin saltito si el movimiento es reducido). */
    fun onPoke(t: Float) { pokeStart = t }

    fun update(t: Float, dtRaw: Float, camPos: Vec3) {
        val dt = dtRaw.coerceAtMost(0.1f)
        val r = reduced
        val celebrating = t - celebrateStart < 1.4f
        val poked = t - pokeStart < 0.6f

        // ---- Estado visual ----
        var v = baseVisual
        if ((moving || celebrating || poked || t < expectUntil + 0.6f) && v == AgentVisual.Resting) v = AgentVisual.Idle
        visual = v
        val prof = PROFILES.getValue(v)

        // ---- Desplazamiento entre estación y núcleo ----
        if (!initialized) {
            anchorCore = atCore
            pos = if (atCore) bay else home
            prevBase = pos
            yaw = yawTo(pos, camPos)
            initialized = true
        }
        if (atCore != anchorCore && !leaving) {
            anchorCore = atCore
            moving = true
            moveFrom = prevBase
            moveTo = if (atCore) bay else home
            moveDur = (moveFrom.distanceTo(moveTo) / 2.4f).coerceIn(1.3f, 3.6f)
            moveStart = t
        }
        var base: Vec3
        var speed = 0f
        var heading = yaw
        if (moving) {
            val p = (t - moveStart) / moveDur
            if (p >= 1f) {
                moving = false
                base = moveTo
            } else {
                base = moveFrom.lerp(moveTo, smootherstep(p))
                base = base.withY(base.y + sin(PI.toFloat() * p) * 0.32f)
                speed = base.distanceTo(prevBase) / dt.coerceAtLeast(1e-4f)
                if ((base - prevBase).length() > 1e-3f) heading = yawTo(prevBase, base)
            }
        } else {
            base = if (anchorCore) bay else home
        }
        prevBase = base

        // ---- Flotación (fase integrada: sin saltos al cambiar de ritmo) ----
        val ambient = if (r) 0.35f else 1f
        bobAmp = damp(bobAmp, prof.bobAmp * ambient, 2.5f, dt)
        bobFreq = damp(bobFreq, prof.bobFreq, 2.5f, dt)
        bobPhase += dt * bobFreq * PI.toFloat() * 2f
        drop = damp(drop, prof.drop, 2.2f, dt)

        val working = if (v == AgentVisual.Working) 1f else 0f
        nodPhase += dt * (2.3f + phase * 0.6f) * PI.toFloat() * 2f * (if (r) 0.5f else 1f)

        // Celebración: salto + giro
        val cp = (t - celebrateStart) / 1.15f
        var hop = 0f
        var spinTarget = 0f
        if (cp in 0f..1f) {
            hop = sin(PI.toFloat() * (cp * 1.25f).coerceAtMost(1f)) * (if (r) 0.12f else 0.5f)
            if (!r) spinTarget = PI.toFloat() * 2f * smootherstep(cp)
        }
        spin = if (cp in 0f..1f) spinTarget else 0f

        val ap = (t - ackStart) / 0.55f
        val ack = if (ap in 0f..1f) sin(PI.toFloat() * ap) * ackStrength else 0f
        val sp = (t - sendStart) / 0.6f
        val emit = if (sp in 0f..1f) sin(PI.toFloat() * sp) else 0f
        // Toque del usuario: un saltito (o nada, con movimiento reducido) y ojos felices.
        val pp = (t - pokeStart) / 0.6f
        val poke = if (pp in 0f..1f) sin(PI.toFloat() * pp) else 0f
        if (!r) hop += poke * 0.12f
        // Tarea fallida: ojos de error y un «no» breve con la cabeza que se apaga.
        val lp0 = (t - alertStart) / 1.2f
        val alert = if (lp0 in 0f..1f) smoothstep(0f, 0.08f, lp0) * (1f - smoothstep(0.55f, 1f, lp0)) else 0f
        val shake = if (lp0 in 0f..1f && !r) sin((t - alertStart) * 19f) * 0.14f * (1f - lp0) * (1f - lp0) else 0f

        pos = Vec3(
            base.x,
            base.y + drop + sin(bobPhase) * bobAmp + hop + working * abs(sin(nodPhase)) * 0.018f,
            base.z,
        )

        // ---- Orientación ----
        val camYaw = yawTo(pos, camPos)
        val consoleYaw = yawTo(pos, consolePos)
        if (t > nextLook) {
            val roll0 = rnd.next()
            lookYaw = if (roll0 < 0.35f) 0f else (rnd.next() - 0.5f) * 1.3f
            nextLook = t + 2.6f + rnd.next() * 4.5f
        }
        val wait = waitingForPos
        val targetYaw = when {
            moving -> heading
            poked -> camYaw
            anchorCore -> yawTo(pos, Vec3.Zero)
            t - sendStart < 1.5f -> yawTo(pos, sendTarget)
            t < expectUntil + 0.4f -> yawTo(pos, expectFrom)
            else -> when (v) {
                AgentVisual.Idle -> camYaw + lookYaw * (if (r) 0.4f else 1f)
                AgentVisual.Resting -> camYaw + lookYaw * 0.25f
                AgentVisual.Thinking -> lerpAngle(camYaw, consoleYaw, 0.4f)
                AgentVisual.Working -> lerpAngle(camYaw, consoleYaw, 0.48f)
                AgentVisual.Waiting -> if (wait != null) lerpAngle(camYaw, yawTo(pos, wait), 0.62f) else camYaw
                // En pausa: quieto, mirando al frente.
                else -> camYaw
            }
        }
        val yawLambda = if (moving) 3.2f else if (v == AgentVisual.Resting || v == AgentVisual.Paused) 1.2f else 2.6f
        yaw = dampAngle(yaw, targetYaw, yawLambda, dt)

        // ---- Inclinaciones ----
        var pitchT = prof.pitch
        var rollT = prof.roll * consoleSide
        if (v == AgentVisual.Idle) rollT = sin(t * 0.7f + phase * 6f) * 0.045f * ambient
        if (v == AgentVisual.Waiting) rollT = sin(t * 0.55f + phase * 5f) * 0.05f * ambient
        if (v == AgentVisual.Error) rollT = prof.roll
        if (working > 0f) pitchT += sin(nodPhase) * 0.035f
        if (moving) {
            pitchT = (speed * 0.07f).coerceIn(0f, 0.22f)
            rollT = (-atan2(sin(heading - yaw), cos(heading - yaw)) * 0.35f).coerceIn(-0.2f, 0.2f)
        }
        pitchT -= ack * 0.2f
        pitchT += emit * 0.12f
        pitch = damp(pitch, pitchT, 5f, dt)
        roll = damp(roll, rollT, 4f, dt)

        // ---- Deformación suave ----
        var squashT = 1f + emit * 0.05f - ack * 0.07f
        if (cp in 0f..1f) squashT += (if (cp < 0.15f) -0.1f else if (cp > 0.85f) -0.08f else 0.06f) * (if (r) 0.3f else 1f)
        squashY = damp(squashY, squashT, 12f, dt)

        // ---- Escala: aparición y salida ----
        if (leaving) {
            val lp = ((t - leaveStart) / 0.7f).coerceAtMost(1f)
            scale = 1f - smootherstep(lp)
            pos = pos.withY(pos.y + smootherstep(lp) * 0.6f)
        } else {
            val s = (t - spawnStart) / 0.75f
            scale = if (s >= 0f && s < 1f) easeOutBack(s).coerceAtLeast(0f) else 1f
        }

        // ---- Ojos ----
        val happy = if ((cp >= 0f && cp < 1.4f) || poked) 1f else 0f
        eyeHappy = damp(eyeHappy, happy, if (poked) 14f else 8f, dt)
        eyeError = damp(eyeError, maxOf(if (v == AgentVisual.Error) 1f else 0f, alert), if (alert > 0f) 9f else 3f, dt)
        var openT = prof.open
        if (t < expectUntil) openT = 1.08f
        if (ack > 0f) openT = 1f + 0.15f * ackStrength
        if (t > nextBlink && v != AgentVisual.Offline) {
            blinkStart = t
            blinkLen = if (v == AgentVisual.Resting || v == AgentVisual.Paused) 0.38f else 0.12f + rnd.next() * 0.05f
            secondBlink = v == AgentVisual.Idle && rnd.next() < 0.18f
            val gap = when (v) {
                AgentVisual.Resting -> 5f + rnd.next() * 5f
                AgentVisual.Paused -> 7f + rnd.next() * 5f
                AgentVisual.Working -> 3f + rnd.next() * 4f
                else -> 2.2f + rnd.next() * 4.2f
            }
            nextBlink = t + gap
        }
        var blink = 0f
        val bp = (t - blinkStart) / blinkLen
        if (bp >= 0f && bp < 1f) blink = sin(PI.toFloat() * bp)
        else if (secondBlink && bp >= 1.6f && bp < 2.6f) blink = sin(PI.toFloat() * (bp - 1.6f))
        eyeOpen = damp(eyeOpen, openT, 7f, dt) * (1f - blink * 0.92f)

        if (t > nextSaccade) {
            saccadeX = (rnd.next() - 0.5f) * 0.5f
            saccadeY = (rnd.next() - 0.5f) * 0.3f
            nextSaccade = t + 0.8f + rnd.next() * 2.4f
        }
        var lookX = 0f
        var lookY = 0f
        when (v) {
            AgentVisual.Idle -> { lookX = saccadeX * ambient; lookY = saccadeY * ambient }
            AgentVisual.Resting -> lookY = -0.45f
            AgentVisual.Thinking -> { lookX = 0.55f * consoleSide; lookY = 0.45f }
            AgentVisual.Working -> { lookX = 0.3f * consoleSide + sin(nodPhase * 0.5f) * 0.12f; lookY = -0.28f }
            AgentVisual.Waiting -> { lookX = 0.15f; lookY = 0.05f }
            AgentVisual.Error -> lookY = -0.15f
            // En pausa: ojos entornados y quietos, mirando un poco hacia abajo.
            AgentVisual.Paused -> lookY = -0.12f
            else -> Unit
        }
        if (happy > 0f) lookY = 0.35f
        eyeLookX = damp(eyeLookX, lookX, 9f, dt)
        eyeLookY = damp(eyeLookY, lookY, 9f, dt)

        // ---- Luz e indicadores ----
        var glowT = prof.glow
        if (v == AgentVisual.Working) glowT += sin(t * 2.1f + phase * 4f) * 0.05f * ambient
        if (v == AgentVisual.Thinking) glowT += sin(t * 3.2f + phase * 4f) * 0.04f * ambient
        glowT += (if (poked) 0f else happy * 0.25f) + ack * 0.2f + emit * 0.15f + poke * 0.24f
        glow = damp(glow, glowT, if (poked) 10f else 4f, dt)
        var stationT = prof.station
        if (v == AgentVisual.Working) stationT += sin(t * 1.7f + phase * 3f) * 0.12f * ambient
        stationT += (if (poked) 0f else happy * 0.5f) + ack * 0.35f + poke * 0.25f
        stationLevel = damp(stationLevel, stationT, 3f, dt)

        thinkingAmt = damp(thinkingAmt, if (v == AgentVisual.Thinking) 1f else 0f, 5f, dt)
        // El aviso de «necesita tu respuesta» sustituye al arco de espera.
        waitingAmt = damp(waitingAmt, if (v == AgentVisual.Waiting && !attention) 1f else 0f, 5f, dt)
        checkAmt = damp(checkAmt, if (cp >= 0f && cp < 1.6f) 1f else 0f, 7f, dt)
        restAmt = damp(restAmt, if (v == AgentVisual.Resting) 1f else 0f, 1.8f, dt)
        offlineAmt = damp(offlineAmt, if (v == AgentVisual.Offline) 1f else 0f, 2.5f, dt)
        pausedAmt = damp(pausedAmt, if (v == AgentVisual.Paused) 1f else 0f, 3f, dt)
        attentionAmt = damp(attentionAmt, if (attention) 1f else 0f, 4f, dt)
        alertAmt = alert
        pokeAmt = poke
        ackAmt = ack
        emitAmt = emit
        yawWithSpin = yaw + spin + shake
    }

    companion object {
        private val PROFILES = mapOf(
            AgentVisual.Idle to Profile(0.07f, 0.42f, 1f, 0.14f, 0.32f, 0f, -0.1f, 0f),
            AgentVisual.Resting to Profile(0.028f, 0.22f, 0.3f, 0.05f, 0.14f, -0.16f, 0.16f, 0.05f),
            AgentVisual.Thinking to Profile(0.04f, 0.5f, 0.8f, 0.24f, 0.72f, 0f, 0.09f, 0.13f),
            AgentVisual.Working to Profile(0.022f, 0.6f, 0.9f, 0.3f, 1f, -0.02f, 0.07f, 0f),
            AgentVisual.Waiting to Profile(0.035f, 0.3f, 0.86f, 0.16f, 0.46f, 0f, -0.06f, 0f),
            AgentVisual.Error to Profile(0.012f, 0.25f, 0.62f, 0.1f, 0.42f, -0.08f, 0.13f, 0.17f),
            AgentVisual.Offline to Profile(0.01f, 0.18f, 0.14f, 0.02f, 0.06f, -0.24f, 0.18f, 0.04f),
            // En pausa: apagado y quieto, ojos a media asta.
            AgentVisual.Paused to Profile(0.016f, 0.2f, 0.46f, 0.05f, 0.12f, -0.09f, 0.08f, 0f),
        )

        private fun easeOutBack(x: Float): Float {
            val c1 = 1.5f
            val c3 = c1 + 1f
            return 1f + c3 * (x - 1f).pow(3) + c1 * (x - 1f).pow(2)
        }
    }
}
