import * as THREE from 'three'
import type { AgentActivity } from '@shared/types'
import { CORE_POS, damp, dampAngle, hash01, smootherstep, yawTo } from './layout'
import { PERSONAS, type Persona, type SayEvent } from './personality'

/** Estado visual base, derivado del estado real del agente. */
export type BaseVisual = 'idle' | 'resting' | 'thinking' | 'working' | 'waiting' | 'error' | 'offline'

/** Segundos esperando a otro agente antes de aburrirse. */
const BORED_AFTER = 22

/**
 * Gestos de los ojos. Cada uno dura unos segundos y se elige al azar (con la semilla del agente) entre
 * los que encajan con su estado real, para que no hagan todos lo mismo a la vez.
 */
type Gesture =
  | 'none'
  | 'smile' // sonríe con los ojos
  | 'glance' // mira a un lado y vuelve
  | 'curious' // entorna un ojo, curioso
  | 'doubleBlink'
  | 'read' // lee de izquierda a derecha, línea a línea
  | 'effort' // aprieta los ojos con determinación
  | 'focus' // entorna la vista y se acerca
  | 'aha' // abre mucho los ojos de golpe
  | 'doubt' // un ojo más cerrado que el otro
  | 'ponder' // la mirada da una vuelta despacio
  | 'impatient' // mira al otro agente y vuelve, parpadeando rápido
  | 'yawn' // aprieta los ojos y los abre mucho
  | 'nodOff' // se le cierran los ojos poco a poco y despierta de golpe
  | 'peek' // dormido, abre un ojo un momento
  | 'tremble' // tiembla (error)
  | 'startle' // despierta sobresaltado al llegarle trabajo
  | 'distracted' // se queda mirando a otro lado, con los ojos algo más pequeños
  | 'bored' // párpados a media altura un rato
  | 'wink' // guiño juguetón: un ojo «<» y el otro redondo
  | 'drowsy' // se le cierran los ojos (rayitas y «zzz») y vuelve

const GESTURE_LEN: Record<Gesture, number> = {
  none: 0,
  smile: 2.2,
  glance: 1.8,
  curious: 1.7,
  doubleBlink: 0.7,
  read: 3.2,
  effort: 2.2,
  focus: 2.2,
  aha: 1.1,
  doubt: 2,
  ponder: 3,
  impatient: 1.8,
  yawn: 2.4,
  nodOff: 3.4,
  peek: 1.6,
  tremble: 0.9,
  startle: 0.9,
  distracted: 2.8,
  bored: 3.2,
  wink: 1.3,
  drowsy: 3.6
}

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
  /** 0..1: cansancio (poca cuota en su cuenta o contexto casi lleno). */
  fatigue = 0
  /** 0..1: lo exigente que es su tarea (dificultad y esfuerzo pedido). */
  taskEffort = 0
  /** Cuándo empezó su tarea actual (hora del reloj, ms) o null. */
  taskStartedAt: number | null = null
  /** Carácter: ritmo de sueño, gestos favoritos y ganas de hablar. */
  persona: Persona = PERSONAS.rookie
  /** Aviso de momentos en los que el robot puede decir algo (bocadillos). */
  onSay: ((e: SayEvent) => void) | null = null

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
  /** Apertura de cada ojo (izquierdo / derecho), con parpadeos y gestos ya aplicados. */
  eyeOpenL = 1
  eyeOpenR = 1
  /** Inclinación de los ojos: >0 preocupado o cansado (caídos hacia fuera), <0 decidido (hacia dentro). */
  eyeTilt = 0
  /** Tamaño de los ojos (sorpresa > 1). */
  eyeScale = 1
  /** 0..1: dormido (ojos en rayita). */
  eyeSleep = 0
  /** Temblor horizontal de los ojos. */
  eyeShakeX = 0
  /** 0..1: ojos «>» «<» (esfuerzo al trabajar). */
  eyeChevron = 0
  /** 0..1: ojos con el párpado caído (cansado, aburrido, en reposo). */
  eyeTired = 0
  /** Guiño: -1 el ojo izquierdo hace «>», 1 el derecho hace «<», 0 ninguno (con fundido). */
  eyeWink = 0
  /** Un ojo más grande que el otro (curioso): >0 el derecho, <0 el izquierdo. */
  eyeBig = 0
  /** 0..1: «?» sobre la cabeza (dudando mientras piensa). */
  questionAmt = 0
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
  private gesture: Gesture = 'none'
  private gestureStart = -10
  private gestureLen = 1
  private nextGesture: number
  private gestureSide: 1 | -1 = 1
  private prevVisual: BaseVisual = 'idle'
  private visualSince = 0
  private asym = 0
  private tilt = 0
  private eyeScaleS = 1
  private shake = 0

  constructor(readonly agentId: string) {
    this.phase = hash01(agentId)
    this.rnd = mulberry32(Math.floor(this.phase * 1e9) + 7)
    this.bobPhase = this.phase * Math.PI * 2
    this.nextBlink = 1 + this.rnd() * 3
    this.nextLook = 2 + this.rnd() * 4
    this.nextSaccade = 1 + this.rnd() * 2
    this.nextGesture = 2 + this.rnd() * 5
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

  /**
   * El usuario está escribiendo en el chat: los que duermen o reposan se despiertan y todos los libres miran al
   * chat un rato, esperando el siguiente encargo.
   */
  onUserTyping(t: number): void {
    if (this.activity !== 'idle' || this.leaving) return
    const wasResting = this.visual === 'resting'
    const fresh = t >= this.attentionUntil
    this.attentionUntil = t + 7
    this.lastBusy = Math.max(this.lastBusy, t)
    if (wasResting) {
      this.startGesture('startle', t)
      this.onSay?.('wake')
    } else if (fresh && this.rnd() < this.persona.chatty) this.onSay?.('listen')
  }

  /** 0..1: cuánto se esfuerza ahora (dificultad de la tarea y tiempo que lleva con ella). */
  private effortLevel(): number {
    const mins = this.taskStartedAt ? Math.max(0, Date.now() - this.taskStartedAt) / 60000 : 0
    return Math.min(1, this.taskEffort * 0.6 + Math.min(1, mins / 12) * 0.4)
  }

  private startGesture(g: Gesture, t: number): void {
    this.gesture = g
    this.gestureStart = t
    this.gestureLen = GESTURE_LEN[g] * (0.85 + this.rnd() * 0.3)
    this.gestureSide = this.rnd() < 0.5 ? -1 : 1
  }

  /** Elige un gesto que encaje con el estado (con pesos; a veces ninguno, para que no sea un tic). */
  private pickGesture(visual: BaseVisual, asleep: boolean, bored: boolean, effort: number): Gesture {
    const fat = this.fatigue
    let pool: [Gesture, number][]
    if (asleep) pool = [['peek', 1], ['none', 2]]
    else
      switch (visual) {
        case 'idle':
          // Tranquilo, curioso, distraído, parpadeando, aburrido, juguetón, somnoliento y contento.
          pool = [
            ['none', 1.6],
            ['curious', 1.3],
            ['distracted', 1.2],
            ['glance', 1],
            ['doubleBlink', 1.2],
            ['bored', 0.9],
            ['wink', 0.8],
            ['drowsy', 0.7],
            ['smile', 1.3]
          ]
          break
        case 'resting':
          pool = [['yawn', 1.4], ['nodOff', 2], ['glance', 0.6], ['none', 1.5]]
          break
        case 'thinking':
          pool = [['ponder', 2.4], ['doubt', 1.6], ['aha', 1.1], ['glance', 0.6], ['none', 0.6]]
          break
        case 'working':
          pool = [['read', 2], ['effort', 1 + effort * 3], ['focus', 1.2], ['none', 1.5]]
          break
        case 'waiting':
          pool = bored
            ? [['yawn', 1.6], ['glance', 1], ['impatient', 0.8], ['nodOff', 0.6], ['none', 1]]
            : [['impatient', 2.4], ['glance', 1], ['doubleBlink', 1], ['none', 1]]
          break
        case 'error':
          pool = [['tremble', 2], ['doubleBlink', 1.2], ['glance', 0.8], ['none', 1]]
          break
        default:
          return 'none'
      }
    if (fat > 0.4 && visual !== 'error') pool = [...pool, ['yawn', fat * 2.5], ['nodOff', visual === 'working' ? 0 : fat * 1.5]]
    // Gestos favoritos de su carácter.
    const likes = this.persona.likes
    pool = pool.map(([g, w]) => [g, w * (likes[g] ?? 1)])
    let total = 0
    for (const [, w] of pool) total += w
    let x = this.rnd() * total
    for (const [g, w] of pool) {
      x -= w
      if (x <= 0) return g
    }
    return 'none'
  }

  update(t: number, dt: number, camPos: THREE.Vector3): void {
    dt = Math.min(dt, 0.1)
    const r = this.reduced
    const busy = this.activity === 'thinking' || this.activity === 'working' || this.activity === 'waiting'
    if (busy) this.lastBusy = t

    // ---- Estado visual base ----
    let visual: BaseVisual =
      this.activity === 'idle' ? (t - this.lastBusy > this.persona.restAfter + this.phase * 10 ? 'resting' : 'idle') : this.activity
    if (this.moving || t - this.celebrateStart < 1.4 || t < this.expectUntil + 0.6 || t < this.attentionUntil) {
      if (visual === 'resting') visual = 'idle'
    }
    if (visual !== this.prevVisual) {
      // Despertar de golpe si le llega trabajo estando en reposo.
      const wasAsleep = this.prevVisual === 'resting'
      this.prevVisual = visual
      this.visualSince = t
      if (wasAsleep && (visual === 'thinking' || visual === 'working' || visual === 'waiting')) this.startGesture('startle', t)
      else if (this.gesture !== 'startle') this.gesture = 'none'
      this.nextGesture = Math.min(this.nextGesture, t + 1.5 + this.rnd() * 2)
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
          targetYaw = t < this.attentionUntil ? camYaw : camYaw + this.lookYaw * (r ? 0.4 : 1)
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
    if (!this.moving) rollT += this.gestureRoll
    if (visual === 'waiting') rollT = Math.sin(t * 0.55 + this.phase * 5) * 0.05 * ambient
    if (visual === 'error') rollT = prof.roll
    if (working) pitchT += Math.sin(this.nodPhase) * 0.035
    if (this.moving) {
      pitchT = THREE.MathUtils.clamp(speed * 0.07, 0, 0.22)
      rollT = THREE.MathUtils.clamp(-Math.atan2(Math.sin(heading - this.yaw), Math.cos(heading - this.yaw)) * 0.35, -0.2, 0.2)
    }
    pitchT -= ack * 0.2
    pitchT += emit * 0.12
    if (!this.moving) pitchT += this.gesturePitch
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
    const inState = t - this.visualSince
    const asleep = visual === 'resting' && inState > this.persona.sleepAfter + this.phase * 30
    const bored = visual === 'waiting' && inState > BORED_AFTER + this.phase * 12
    if (asleep && !this.wasAsleep) this.onSay?.('sleep')
    if (bored && !this.wasBored) this.onSay?.('bored')
    this.wasAsleep = asleep
    this.wasBored = bored
    // Atento al chat: el usuario está escribiendo.
    const attentive = t < this.attentionUntil && visual === 'idle'
    const fat = this.fatigue
    const effortNow = visual === 'working' || visual === 'thinking' ? this.effortLevel() : 0

    // Gestos: uno cada pocos segundos, según el estado real.
    if (t > this.nextGesture && !this.leaving && !this.moving && cp >= 1.4 && !attentive) {
      const g = this.pickGesture(visual, asleep, bored, effortNow)
      if (g !== 'none') this.startGesture(g, t)
      // De vez en cuando suelta algo, según lo hablador que sea.
      if (visual === 'idle' && this.rnd() < this.persona.chatty * 0.12) this.onSay?.('chatter')
      const busyGap = visual === 'working' ? 3.5 - effortNow * 1.5 : visual === 'thinking' ? 3.2 : 4.5
      const gap = (asleep ? 9 : busyGap) + this.rnd() * 4.5
      this.nextGesture = t + gap * this.persona.gestureGap * (r ? 1.8 : 1)
    }
    let gp = (t - this.gestureStart) / this.gestureLen
    if (gp >= 1 || gp < 0) {
      this.gesture = 'none'
      gp = 0
    }
    const env = Math.sin(Math.PI * gp) // entra y sale suave
    const amp = r ? 0.5 : 1

    this.eyeHappy = damp(this.eyeHappy, happy ? 1 : this.gesture === 'smile' ? Math.min(1, env * 2.2) : 0, 10, dt)
    this.eyeError = damp(this.eyeError, visual === 'error' ? 1 : 0, 3, dt)

    // Apertura de base del estado, más pesada si está cansado o aburrido.
    let openT = prof.open
    if (visual === 'working') openT = 0.9 - effortNow * 0.22
    if (bored) openT = 0.58
    if (visual !== 'offline' && visual !== 'error') openT *= 1 - fat * 0.38
    if (t < this.expectUntil) openT = 1.08
    if (ack > 0) openT = 1.15

    // Modificadores del gesto en curso.
    let gOpen = 1 // multiplica la apertura
    let gAsym = 0 // >0 cierra más el izquierdo, <0 el derecho
    let gTilt = 0
    let gScale = 1
    let gShake = 0
    let gLookX: number | null = null
    let gLookY: number | null = null
    let gPitch = 0
    let gRoll = 0
    let gBig = 0
    let gWink = 0
    const side = this.gestureSide
    // Pensando: un ojo entornado, como en «mmm…».
    if (visual === 'thinking') gAsym = -0.5 * this.consoleSide
    switch (this.gesture) {
      case 'glance':
        gLookX = side * 0.7 * Math.sin(Math.PI * Math.min(1, gp * 1.6))
        gLookY = 0.1 * env
        break
      case 'curious':
        // Ladea la cabeza y abre más un ojo.
        gBig = side * 0.32 * env
        gRoll = side * 0.16 * env
        gLookX = side * 0.3 * env
        gLookY = 0.1 * env
        break
      case 'distracted': {
        const hold = Math.min(1, gp * 5) * Math.min(1, (1 - gp) * 5)
        gLookX = side * 0.85 * hold
        gLookY = 0.2 * hold
        gScale = 1 - 0.12 * hold
        break
      }
      case 'wink':
        gWink = side * env
        gRoll = -side * 0.1 * env
        break
      case 'read': {
        // Tres líneas: barre de izquierda a derecha y vuelve rápido, bajando un poco cada vez.
        const line = Math.min(2, Math.floor(gp * 3))
        const lp = gp * 3 - line
        const sweep = lp < 0.82 ? lp / 0.82 : 1 - (lp - 0.82) / 0.18
        gLookX = -0.55 + sweep * 1.1
        gLookY = -0.15 - line * 0.13
        gOpen = 0.82
        break
      }
      case 'effort':
        gOpen = 1 - 0.35 * env * (0.6 + effortNow * 0.4)
        gTilt = -0.3 * env * (0.6 + effortNow * 0.4)
        gShake = Math.sin(t * 46) * 0.006 * env
        gPitch = 0.05 * env
        break
      case 'focus':
        gOpen = 1 - 0.4 * env
        gScale = 1 - 0.1 * env
        gTilt = -0.12 * env
        gPitch = 0.06 * env
        break
      case 'aha':
        gOpen = 1 + 0.5 * env
        gScale = 1 + 0.18 * env
        gLookX = 0
        gLookY = 0.15 * env
        break
      case 'doubt':
        gAsym = side * 0.6 * env
        gTilt = 0.12 * env
        gLookX = side * 0.35 * env
        gLookY = 0.3
        break
      case 'ponder': {
        const a = gp * Math.PI * 2
        gLookX = Math.cos(a) * 0.55 * side
        gLookY = 0.3 + Math.sin(a) * 0.25
        break
      }
      case 'impatient': {
        const toward = Math.sin(Math.PI * Math.min(1, gp * 2.2))
        gLookX = 0.7 * toward
        gOpen = gp > 0.55 && Math.sin(gp * 60) > 0.6 ? 0.15 : 1
        break
      }
      case 'yawn':
        // Aprieta (0..0.4), abre mucho (0.4..0.75) y vuelve.
        if (gp < 0.4) gOpen = 1 - 0.95 * Math.sin((Math.PI / 2) * (gp / 0.4))
        else if (gp < 0.75) gOpen = 0.05 + 1.35 * Math.sin(Math.PI * ((gp - 0.4) / 0.35))
        else gOpen = 1 - 0.3 * Math.sin(Math.PI * ((gp - 0.75) / 0.25))
        gScale = gp > 0.4 && gp < 0.75 ? 1 + 0.12 * Math.sin(Math.PI * ((gp - 0.4) / 0.35)) : 1
        gLookY = 0.3 * env
        gPitch = -0.08 * env
        break
      case 'nodOff':
        // Se le cierran los ojos poco a poco y despierta de golpe.
        if (gp < 0.72) gOpen = 1 - 0.95 * smootherstep(gp / 0.72)
        else gOpen = 0.05 + 1.25 * Math.sin(Math.PI * Math.min(1, (gp - 0.72) / 0.28))
        gPitch = gp < 0.72 ? 0.16 * smootherstep(gp / 0.72) : 0.16 * (1 - (gp - 0.72) / 0.28)
        gScale = gp > 0.72 ? 1 + 0.1 * Math.sin(Math.PI * ((gp - 0.72) / 0.28)) : 1
        break
      case 'tremble':
        gShake = Math.sin(t * 52) * 0.009 * env
        gOpen = 1 + 0.15 * env
        break
      case 'startle':
        gOpen = 1 + 0.45 * env
        gScale = 1 + 0.2 * env
        break
    }

    // Dormido: rayitas que «respiran»; un ojo se asoma de vez en cuando.
    const peek = this.gesture === 'peek' ? Math.sin(Math.PI * Math.min(1, gp * 1.4)) : 0
    const drowsy = this.gesture === 'drowsy' ? Math.min(1, gp * 4) * Math.min(1, (1 - gp) * 6) : 0
    this.eyeSleep = damp(this.eyeSleep, asleep && visual !== 'offline' ? 1 - peek * 0.85 : drowsy, asleep ? 0.8 : drowsy ? 3 : 6, dt)
    if (peek > 0) gAsym = side * peek * 0.9

    // Parpadeo: más lento con sueño o cansancio; en reposo largo, casi cerrado.
    if (t > this.nextBlink && visual !== 'offline') {
      this.blinkStart = t
      const slow = visual === 'resting' || bored ? 1 : fat
      this.blinkLen = (0.12 + this.rnd() * 0.05) * (1 + slow * 2.2)
      this.secondBlink = (visual === 'idle' && this.rnd() < 0.22) || this.gesture === 'doubleBlink' || (visual === 'error' && this.rnd() < 0.5)
      const gap =
        visual === 'resting'
          ? 4 + this.rnd() * 5
          : visual === 'working'
            ? 2.6 + this.rnd() * 3.6
            : visual === 'error'
              ? 1.2 + this.rnd() * 1.8
              : 2 + this.rnd() * 4
      this.nextBlink = t + gap * (1 + fat * 0.4)
    }
    if (this.gesture === 'doubleBlink' && t - this.gestureStart < dt * 1.5) {
      this.blinkStart = t
      this.blinkLen = 0.11
      this.secondBlink = true
    }
    let blink = 0
    const bp = (t - this.blinkStart) / this.blinkLen
    if (bp >= 0 && bp < 1) blink = Math.sin(Math.PI * bp)
    else if (this.secondBlink && bp >= 1.6 && bp < 2.6) blink = Math.sin(Math.PI * (bp - 1.6))

    this.eyeOpen = damp(this.eyeOpen, openT, 7, dt)
    const gOpenA = 1 + (gOpen - 1) * amp
    const open = this.eyeOpen * gOpenA * (1 - blink * 0.92)
    this.asym = damp(this.asym, gAsym * amp, 10, dt)
    this.eyeOpenL = Math.max(0.04, open * (1 - Math.max(0, this.asym)))
    this.eyeOpenR = Math.max(0.04, open * (1 - Math.max(0, -this.asym)))
    // Cansado o aburrido: ojos algo caídos hacia fuera. Concentrado: un poco decididos.
    const tiltBase = fat * 0.16 + (bored ? 0.1 : 0) + (visual === 'working' ? -0.06 * effortNow : 0)
    this.tilt = damp(this.tilt, tiltBase + gTilt * amp, 8, dt)
    this.eyeTilt = this.tilt
    this.eyeScaleS = damp(this.eyeScaleS, 1 + (gScale - 1) * amp, 12, dt)
    this.eyeScale = this.eyeScaleS
    this.shake = gShake * amp
    if (visual === 'error') this.shake += Math.sin(t * 38 + this.phase * 9) * 0.0025 * amp * this.eyeError
    this.eyeShakeX = this.shake

    // Forma de los ojos: «>» «<» al trabajar (salvo cuando lee o enfoca), párpado caído si está cansado,
    // aburrido o en reposo. El cansancio gana a la concentración, salvo en los apretones de esfuerzo.
    const g = this.gesture
    const roundGesture = g === 'read' || g === 'focus' || g === 'startle' || g === 'aha' || g === 'yawn'
    const tiredT =
      !asleep && visual !== 'error' && visual !== 'offline' && (fat >= 0.5 || bored || visual === 'resting' || g === 'bored') && !roundGesture && g !== 'effort'
    const chevT = (visual === 'working' && !roundGesture && !tiredT) || g === 'effort'
    this.eyeChevron = damp(this.eyeChevron, chevT ? 1 : 0, 14, dt)
    this.eyeTired = damp(this.eyeTired, tiredT ? 1 : 0, 10, dt)
    this.eyeWink = damp(this.eyeWink, gWink * (r ? 0.7 : 1), 16, dt)
    this.eyeBig = damp(this.eyeBig, gBig * amp, 8, dt)
    this.gestureRoll = damp(this.gestureRoll, gRoll * amp, 5, dt)
    this.questionAmt = damp(this.questionAmt, visual === 'thinking' && (g === 'doubt' || g === 'ponder') ? 1 : 0, 6, dt)
    this.gesturePitch = damp(this.gesturePitch, gPitch * amp, 6, dt)

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
        lookX = 0.55 * this.consoleSide + this.saccadeX * 0.25 * ambient
        lookY = 0.45
        break
      case 'working':
        lookX = 0.3 * this.consoleSide + Math.sin(this.nodPhase * 0.5) * 0.12
        lookY = -0.28
        break
      case 'waiting':
        lookX = bored ? this.saccadeX * 0.4 : 0.15
        lookY = bored ? -0.25 : 0.05
        break
      case 'error':
        lookY = -0.15
        break
    }
    if (fat > 0.3 && visual !== 'thinking') lookY -= fat * 0.1
    if (attentive) {
      // Mira hacia el chat (a la izquierda de la pantalla), atento al siguiente encargo.
      lookX = -0.5
      lookY = 0.08
    }
    if (gLookX !== null) lookX = visual === 'working' || visual === 'thinking' ? gLookX + 0.15 * this.consoleSide : gLookX
    if (gLookY !== null) lookY = gLookY
    if (happy) lookY = 0.35
    const lookLambda = this.gesture === 'read' || this.gesture === 'impatient' ? 18 : 9
    this.eyeLookX = damp(this.eyeLookX, lookX, lookLambda, dt)
    this.eyeLookY = damp(this.eyeLookY, lookY, lookLambda, dt)

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
  /** Cabeceo que acompaña a algunos gestos (cabezada, esfuerzo, bostezo). */
  private gesturePitch = 0
  /** Ladeo de cabeza de algunos gestos (curioso, guiño). */
  private gestureRoll = 0
  private attentionUntil = -10
  private wasAsleep = false
  private wasBored = false
}
