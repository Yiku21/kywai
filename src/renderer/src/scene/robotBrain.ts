import * as THREE from 'three'
import type { AgentActivity } from '@shared/types'
import { CORE_POS, damp, dampAngle, hash01, smootherstep, yawTo } from './layout'

/** Estado visual base, derivado del estado real del agente. */
export type BaseVisual = 'idle' | 'resting' | 'thinking' | 'working' | 'waiting' | 'error' | 'offline'

/** Segundos sin trabajo antes de entrar en reposo. */
const REST_AFTER = 26

interface Profile {
  bobAmp: number
  bobFreq: number
  open: number
  glow: number
  station: number
  drop: number
  pitch: number
  roll: number
}

const PROFILES: Record<BaseVisual, Profile> = {
  idle: { bobAmp: 0.07, bobFreq: 0.42, open: 1, glow: 0.14, station: 0.32, drop: 0, pitch: -0.1, roll: 0 },
  resting: { bobAmp: 0.028, bobFreq: 0.22, open: 0.3, glow: 0.05, station: 0.14, drop: -0.16, pitch: 0.16, roll: 0.05 },
  thinking: { bobAmp: 0.04, bobFreq: 0.5, open: 0.8, glow: 0.24, station: 0.72, drop: 0, pitch: 0.09, roll: 0.13 },
  working: { bobAmp: 0.022, bobFreq: 0.6, open: 0.9, glow: 0.3, station: 1, drop: -0.02, pitch: 0.07, roll: 0 },
  waiting: { bobAmp: 0.035, bobFreq: 0.3, open: 0.86, glow: 0.16, station: 0.46, drop: 0, pitch: -0.06, roll: 0 },
  error: { bobAmp: 0.012, bobFreq: 0.25, open: 0.62, glow: 0.1, station: 0.42, drop: -0.08, pitch: 0.13, roll: 0.17 },
  offline: { bobAmp: 0.01, bobFreq: 0.18, open: 0.14, glow: 0.02, station: 0.06, drop: -0.24, pitch: 0.18, roll: 0.04 }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  d = Math.atan2(Math.sin(d), Math.cos(d))
  return a + d * t
}

function easeOutBack(x: number): number {
  const c1 = 1.5
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

/** Generador pseudoaleatorio con semilla (variación estable por agente). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Cerebro de animación de un robot. No sabe nada de React ni de las tareas: recibe el estado real
 * (actividad, a quién espera, dónde está) y eventos puntuales (enviar, recibir, completar), y
 * produce valores suavizados que el componente aplica a la malla cada fotograma.
 */
export class RobotBrain {
  readonly phase: number
  private rnd: () => number

  // Entradas
  activity: AgentActivity = 'idle'
  waitingForPos: THREE.Vector3 | null = null
  location: 'station' | 'core' = 'station'
  readonly home = new THREE.Vector3()
  readonly bay = new THREE.Vector3()
  readonly consolePos = new THREE.Vector3()
  consoleSide = 1
  reduced = false

  // Eventos puntuales
  private lastBusy = 0
  private sendStart = -10
  private readonly sendTarget = new THREE.Vector3()
  private expectUntil = -10
  private readonly expectFrom = new THREE.Vector3()
  private ackStart = -10
  private celebrateStart = -10
  private spawnStart = -10
  leaving = false
  private leaveStart = 0

  // Desplazamiento
  private anchor: 'station' | 'core' = 'station'
  private moving = false
  private readonly moveFrom = new THREE.Vector3()
  private readonly moveTo = new THREE.Vector3()
  private moveStart = 0
  private moveDur = 1
  private readonly prevBase = new THREE.Vector3()

  // Salidas animadas
  readonly pos = new THREE.Vector3()
  yaw = 0
  pitch = 0
  roll = 0
  squashY = 1
  scale = 1
  eyeOpen = 1
  eyeLookX = 0
  eyeLookY = 0
  eyeHappy = 0
  eyeError = 0
  glow = 0.14
  stationLevel = 0.3
  thinkingAmt = 0
  waitingAmt = 0
  checkAmt = 0
  restAmt = 0
  offlineAmt = 0
  ackAmt = 0
  emitAmt = 0
  /** Velocidad horizontal actual (para inclinar accesorios). */
  speed = 0
  visual: BaseVisual = 'idle'

  // Estado interno suavizado
  private bobPhase: number
  private nodPhase = 0
  private bobAmp = 0.07
  private bobFreq = 0.42
  private drop = 0
  private nextBlink: number
  private blinkStart = -10
  private blinkLen = 0.13
  private secondBlink = false
  private nextLook: number
  private lookYaw = 0
  private nextSaccade: number
  private saccadeX = 0
  private saccadeY = 0
  private spin = 0
  private initialized = false

  constructor(readonly agentId: string) {
    this.phase = hash01(agentId)
    this.rnd = mulberry32(Math.floor(this.phase * 1e9) + 7)
    this.bobPhase = this.phase * Math.PI * 2
    this.nextBlink = 1 + this.rnd() * 3
    this.nextLook = 2 + this.rnd() * 4
    this.nextSaccade = 1 + this.rnd() * 2
  }

  setInputs(activity: AgentActivity, location: 'station' | 'core', waitingForPos: THREE.Vector3 | null, t: number): void {
    if (activity !== this.activity) {
      const wasBusy = this.activity === 'thinking' || this.activity === 'working' || this.activity === 'waiting'
      if (wasBusy) this.lastBusy = t
    }
    this.activity = activity
    this.waitingForPos = waitingForPos
    this.location = location
  }

  spawn(t: number): void {
    this.spawnStart = t
    this.scale = 0
  }

  leave(t: number): void {
    this.leaving = true
    this.leaveStart = t
  }

  /** El robot emite un paquete hacia `target`. */
  onSend(target: THREE.Vector3, t: number): void {
    this.sendTarget.copy(target)
    this.sendStart = t
    this.lastBusy = t
  }

  /** Un paquete viene hacia el robot desde `from` y llegará en `until`. */
  onExpect(from: THREE.Vector3, t: number, until: number): void {
    this.expectFrom.copy(from)
    this.expectUntil = until
    this.lastBusy = t
  }

  /** El paquete llegó: gesto de reconocimiento. */
  onReceive(t: number): void {
    this.ackStart = t
    this.lastBusy = t
  }

  onCelebrate(t: number): void {
    this.celebrateStart = t
    this.lastBusy = t
  }

  /** Para escenas sin desplazamiento previo (cambio de modo, reinicio). */
  snapHome(): void {
    this.initialized = false
  }

  update(t: number, dt: number, camPos: THREE.Vector3): void {
    dt = Math.min(dt, 0.1)
    const r = this.reduced
    const busy = this.activity === 'thinking' || this.activity === 'working' || this.activity === 'waiting'
    if (busy) this.lastBusy = t

    // ---- Estado visual base ----
    let visual: BaseVisual =
      this.activity === 'idle' ? (t - this.lastBusy > REST_AFTER + this.phase * 10 ? 'resting' : 'idle') : this.activity
    if (this.moving || t - this.celebrateStart < 1.4 || t < this.expectUntil + 0.6) {
      if (visual === 'resting') visual = 'idle'
    }
    this.visual = visual
    const prof = PROFILES[visual]

    // ---- Desplazamiento entre estación y núcleo ----
    if (!this.initialized) {
      this.anchor = this.location
      this.pos.copy(this.location === 'core' ? this.bay : this.home)
      this.prevBase.copy(this.pos)
      this.yaw = yawTo(this.pos, camPos)
      this.initialized = true
    }
    if (this.location !== this.anchor && !this.leaving) {
      this.anchor = this.location
      this.moving = true
      this.moveFrom.copy(this.prevBase)
      this.moveTo.copy(this.location === 'core' ? this.bay : this.home)
      const dist = this.moveFrom.distanceTo(this.moveTo)
      this.moveDur = THREE.MathUtils.clamp(dist / 2.4, 1.3, 3.6)
      this.moveStart = t
    }

    const base = new THREE.Vector3()
    let speed = 0
    let heading = this.yaw
    if (this.moving) {
      const p = (t - this.moveStart) / this.moveDur
      if (p >= 1) {
        this.moving = false
        base.copy(this.moveTo)
      } else {
        const e = smootherstep(p)
        base.lerpVectors(this.moveFrom, this.moveTo, e)
        base.y += Math.sin(Math.PI * p) * 0.32
        speed = base.distanceTo(this.prevBase) / Math.max(dt, 1e-4)
        if (base.distanceToSquared(this.prevBase) > 1e-6) heading = yawTo(this.prevBase, base)
      }
    } else {
      base.copy(this.anchor === 'core' ? this.bay : this.home)
    }
    this.prevBase.copy(base)

    // ---- Flotación (fase integrada: sin saltos al cambiar de ritmo) ----
    const ambient = r ? 0.35 : 1
    this.bobAmp = damp(this.bobAmp, prof.bobAmp * ambient, 2.5, dt)
    this.bobFreq = damp(this.bobFreq, prof.bobFreq, 2.5, dt)
    this.bobPhase += dt * this.bobFreq * Math.PI * 2
    this.drop = damp(this.drop, prof.drop, 2.2, dt)

    // Pequeños movimientos rítmicos al trabajar
    const working = visual === 'working' ? 1 : 0
    this.nodPhase += dt * (2.3 + this.phase * 0.6) * Math.PI * 2 * (r ? 0.5 : 1)

    // Celebración: salto + giro
    const cp = (t - this.celebrateStart) / 1.15
    let hop = 0
    let spinTarget = 0
    if (cp >= 0 && cp < 1) {
      hop = Math.sin(Math.PI * Math.min(1, cp * 1.25)) * (r ? 0.12 : 0.5)
      if (!r) spinTarget = Math.PI * 2 * smootherstep(cp)
    }
    this.spin = cp >= 0 && cp < 1 ? spinTarget : 0

    // Reconocimiento al recibir
    const ap = (t - this.ackStart) / 0.55
    const ack = ap >= 0 && ap < 1 ? Math.sin(Math.PI * ap) : 0

    // Emisión al enviar
    const sp = (t - this.sendStart) / 0.6
    const emit = sp >= 0 && sp < 1 ? Math.sin(Math.PI * sp) : 0

    this.pos.set(
      base.x,
      base.y + this.drop + Math.sin(this.bobPhase) * this.bobAmp + hop + working * Math.abs(Math.sin(this.nodPhase)) * 0.018,
      base.z
    )

    // ---- Orientación ----
    const camYaw = yawTo(this.pos, camPos)
    const consoleYaw = yawTo(this.pos, this.consolePos)
    if (t > this.nextLook) {
      const roll = this.rnd()
      this.lookYaw = roll < 0.35 ? 0 : (this.rnd() - 0.5) * 1.3
      this.nextLook = t + 2.6 + this.rnd() * 4.5
    }
    let targetYaw = camYaw
    if (this.moving) targetYaw = heading
    else if (this.anchor === 'core') targetYaw = yawTo(this.pos, CORE_POS)
    else if (t - this.sendStart < 1.5) targetYaw = yawTo(this.pos, this.sendTarget)
    else if (t < this.expectUntil + 0.4) targetYaw = yawTo(this.pos, this.expectFrom)
    else {
      switch (visual) {
        case 'idle':
          targetYaw = camYaw + this.lookYaw * (r ? 0.4 : 1)
          break
        case 'resting':
          targetYaw = camYaw + this.lookYaw * 0.25
          break
        case 'thinking':
          targetYaw = lerpAngle(camYaw, consoleYaw, 0.4)
          break
        case 'working':
          targetYaw = lerpAngle(camYaw, consoleYaw, 0.48)
          break
        case 'waiting':
          targetYaw = this.waitingForPos ? lerpAngle(camYaw, yawTo(this.pos, this.waitingForPos), 0.62) : camYaw
          break
        default:
          targetYaw = camYaw
      }
    }
    const yawLambda = this.moving ? 3.2 : visual === 'resting' ? 1.2 : 2.6
    this.yaw = dampAngle(this.yaw, targetYaw, yawLambda, dt)

    // ---- Inclinaciones ----
    let pitchT = prof.pitch
    let rollT = prof.roll * this.consoleSide
    if (visual === 'idle') rollT = Math.sin(t * 0.7 + this.phase * 6) * 0.045 * ambient
    if (visual === 'waiting') rollT = Math.sin(t * 0.55 + this.phase * 5) * 0.05 * ambient
    if (visual === 'error') rollT = prof.roll
    if (working) pitchT += Math.sin(this.nodPhase) * 0.035
    if (this.moving) {
      pitchT = THREE.MathUtils.clamp(speed * 0.07, 0, 0.22)
      rollT = THREE.MathUtils.clamp(-Math.atan2(Math.sin(heading - this.yaw), Math.cos(heading - this.yaw)) * 0.35, -0.2, 0.2)
    }
    pitchT -= ack * 0.2
    pitchT += emit * 0.12
    this.pitch = damp(this.pitch, pitchT, 5, dt)
    this.roll = damp(this.roll, rollT, 4, dt)

    // ---- Deformación suave ----
    let squashT = 1 + emit * 0.05 - ack * 0.07
    if (cp >= 0 && cp < 1) squashT += (cp < 0.15 ? -0.1 : cp > 0.85 ? -0.08 : 0.06) * (r ? 0.3 : 1)
    this.squashY = damp(this.squashY, squashT, 12, dt)

    // ---- Escala: aparición y salida ----
    if (this.leaving) {
      const lp = Math.min(1, (t - this.leaveStart) / 0.7)
      this.scale = 1 - smootherstep(lp)
      this.pos.y += smootherstep(lp) * 0.6
    } else {
      const s = (t - this.spawnStart) / 0.75
      this.scale = s >= 0 && s < 1 ? Math.max(0, easeOutBack(s)) : 1
    }

    // ---- Ojos ----
    const happy = cp >= 0 && cp < 1.4 ? 1 : 0
    this.eyeHappy = damp(this.eyeHappy, happy, 8, dt)
    this.eyeError = damp(this.eyeError, visual === 'error' ? 1 : 0, 3, dt)
    let openT = prof.open
    if (t < this.expectUntil) openT = 1.08
    if (ack > 0) openT = 1.15

    if (t > this.nextBlink && visual !== 'offline') {
      this.blinkStart = t
      this.blinkLen = visual === 'resting' ? 0.38 : 0.12 + this.rnd() * 0.05
      this.secondBlink = visual === 'idle' && this.rnd() < 0.18
      const gap = visual === 'resting' ? 5 + this.rnd() * 5 : visual === 'working' ? 3 + this.rnd() * 4 : 2.2 + this.rnd() * 4.2
      this.nextBlink = t + gap
    }
    let blink = 0
    const bp = (t - this.blinkStart) / this.blinkLen
    if (bp >= 0 && bp < 1) blink = Math.sin(Math.PI * bp)
    else if (this.secondBlink && bp >= 1.6 && bp < 2.6) blink = Math.sin(Math.PI * (bp - 1.6))
    this.eyeOpen = damp(this.eyeOpen, openT, 7, dt) * (1 - blink * 0.92)

    if (t > this.nextSaccade) {
      this.saccadeX = (this.rnd() - 0.5) * 0.5
      this.saccadeY = (this.rnd() - 0.5) * 0.3
      this.nextSaccade = t + 0.8 + this.rnd() * 2.4
    }
    let lookX = 0
    let lookY = 0
    switch (visual) {
      case 'idle':
        lookX = this.saccadeX * ambient
        lookY = this.saccadeY * ambient
        break
      case 'resting':
        lookY = -0.45
        break
      case 'thinking':
        lookX = 0.55 * this.consoleSide
        lookY = 0.45
        break
      case 'working':
        lookX = 0.3 * this.consoleSide + Math.sin(this.nodPhase * 0.5) * 0.12
        lookY = -0.28
        break
      case 'waiting':
        lookX = 0.15
        lookY = 0.05
        break
      case 'error':
        lookY = -0.15
        break
    }
    if (happy) lookY = 0.35
    this.eyeLookX = damp(this.eyeLookX, lookX, 9, dt)
    this.eyeLookY = damp(this.eyeLookY, lookY, 9, dt)

    // ---- Luz e indicadores ----
    let glowT = prof.glow
    if (visual === 'working') glowT += Math.sin(t * 2.1 + this.phase * 4) * 0.05 * ambient
    if (visual === 'thinking') glowT += Math.sin(t * 3.2 + this.phase * 4) * 0.04 * ambient
    glowT += happy * 0.25 + ack * 0.2 + emit * 0.15
    this.glow = damp(this.glow, glowT, 4, dt)
    let stationT = prof.station
    if (visual === 'working') stationT += Math.sin(t * 1.7 + this.phase * 3) * 0.12 * ambient
    stationT += happy * 0.5 + ack * 0.35
    this.stationLevel = damp(this.stationLevel, stationT, 3, dt)

    this.thinkingAmt = damp(this.thinkingAmt, visual === 'thinking' ? 1 : 0, 5, dt)
    this.waitingAmt = damp(this.waitingAmt, visual === 'waiting' ? 1 : 0, 5, dt)
    this.checkAmt = damp(this.checkAmt, cp >= 0 && cp < 1.6 ? 1 : 0, 7, dt)
    this.restAmt = damp(this.restAmt, visual === 'resting' ? 1 : 0, 1.8, dt)
    this.offlineAmt = damp(this.offlineAmt, visual === 'offline' ? 1 : 0, 2.5, dt)
    this.ackAmt = ack
    this.emitAmt = emit
    this.speed = speed

    this.yawWithSpin = this.yaw + this.spin
  }

  yawWithSpin = 0
}
