import * as THREE from 'three'
import { create } from 'zustand'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { RobotBrain } from './robotBrain'
import type { HomeRole } from './worlds/homeLayout'
import hermesGlb from '@/assets/personajes/hermes.glb?url'
import claudeGlb from '@/assets/personajes/claude.glb?url'
import codexGlb from '@/assets/personajes/codex.glb?url'
import geminiGlb from '@/assets/personajes/gemini.glb?url'
import qwenGlb from '@/assets/personajes/qwen.glb?url'
import museGlb from '@/assets/personajes/muse.glb?url'
import aiderGlb from '@/assets/personajes/aider.glb?url'
import copilotGlb from '@/assets/personajes/copilot.glb?url'
import kiloGlb from '@/assets/personajes/kilo.glb?url'
import reposoGlb from '@/assets/personajes/anim/reposo.glb?url'
import explicaGlb from '@/assets/personajes/anim/explica.glb?url'
import hablaGlb from '@/assets/personajes/anim/habla.glb?url'
import piensaGlb from '@/assets/personajes/anim/piensa.glb?url'
import dudaGlb from '@/assets/personajes/anim/duda.glb?url'
import celebraGlb from '@/assets/personajes/anim/celebra.glb?url'
import saludaGlb from '@/assets/personajes/anim/saluda.glb?url'
import caminaGlb from '@/assets/personajes/anim/camina.glb?url'

// Personajes 3D de los agentes (modelos hechos con Meshy a partir de los dibujos del equipo de kywai).
// Todos comparten el mismo esqueleto, así que las animaciones se cargan una vez y sirven para los nueve.

/**
 * Aspecto (skin) de los agentes en el espacio 3D, por dispositivo y sin depender del tema.
 * Para añadir uno: su id aquí y en SKINS, su nombre en SettingsDialog (skinText) y cómo se construye en Robot.tsx.
 */
export type AgentSkin = 'personajes' | 'clasico' | 'refugio'

/** Skins en el orden del selector de Ajustes → Agentes (sus textos están en SettingsDialog). */
export const SKINS: AgentSkin[] = ['personajes', 'clasico', 'refugio']

const KEY = 'aicowork.agentes.skin'

export function parseSkin(v: string | null): AgentSkin {
  return v && (SKINS as string[]).includes(v) ? (v as AgentSkin) : 'personajes'
}

function readSkin(): AgentSkin {
  try {
    return parseSkin(localStorage.getItem(KEY))
  } catch {
    return 'personajes'
  }
}

export const useAgentSkin = create<{ skin: AgentSkin; setSkin(s: AgentSkin): void }>((set) => ({
  skin: readSkin(),
  setSkin(skin) {
    try {
      localStorage.setItem(KEY, skin)
    } catch {
      /* sin almacenamiento: vale para esta sesión */
    }
    set({ skin })
  }
}))

const MODELS: Record<HomeRole, string> = {
  hermes: hermesGlb,
  claude: claudeGlb,
  codex: codexGlb,
  gemini: geminiGlb,
  qwen: qwenGlb,
  muse: museGlb,
  aider: aiderGlb,
  copilot: copilotGlb,
  kilo: kiloGlb
}

/** Movimientos del personaje. */
export type CharacterClip = 'reposo' | 'explica' | 'habla' | 'piensa' | 'duda' | 'celebra' | 'saluda' | 'camina'

const CLIPS: Record<CharacterClip, string> = {
  reposo: reposoGlb,
  explica: explicaGlb,
  habla: hablaGlb,
  piensa: piensaGlb,
  duda: dudaGlb,
  celebra: celebraGlb,
  saluda: saludaGlb,
  camina: caminaGlb
}

/** Personaje del agente según su nombre o id (los mismos nombres que usan los temas). */
export function characterRole(text: string): HomeRole | undefined {
  const n = text.toLowerCase()
  return (Object.keys(MODELS) as HomeRole[]).find((r) => n.includes(r))
}

const loader = new GLTFLoader()

/**
 * Carga un .glb. En la app de escritorio la interfaz se abre desde file://, donde fetch() no funciona
 * (GLTFLoader lo usa): ahí se lee con XMLHttpRequest, que Electron sí permite, y se interpreta aparte.
 */
async function loadGlb(url: string): Promise<GLTF> {
  const abs = new URL(url, location.href)
  if (abs.protocol !== 'file:') return loader.loadAsync(url)
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', abs.href)
    xhr.responseType = 'arraybuffer'
    xhr.onload = () => (xhr.response ? resolve(xhr.response as ArrayBuffer) : reject(new Error(`vacío: ${url}`)))
    xhr.onerror = () => reject(new Error(`no se pudo leer ${url}`))
    xhr.send()
  })
  return loader.parseAsync(buf, '')
}
/**
 * Cuánto se deja de cada movimiento (1 = como lo hizo Meshy). Sus animaciones balancean mucho la cabeza y la
 * cadera de lado a lado, y con la cabeza grande de los personajes no parecía natural: se acercan a su postura media.
 * `head` vale para la cabeza y el cuello; `body`, para el resto del cuerpo.
 */
const CALM: Record<CharacterClip, { head: number; body: number }> = {
  reposo: { head: 0.22, body: 0.3 },
  piensa: { head: 0.45, body: 0.7 },
  duda: { head: 0.5, body: 0.7 },
  saluda: { head: 0.5, body: 0.8 },
  celebra: { head: 0.55, body: 0.85 },
  explica: { head: 0.6, body: 1 },
  habla: { head: 0.6, body: 1 },
  camina: { head: 0.6, body: 1 }
}

/** Acerca cada giro del movimiento a su postura media (factor 0 = quieto en la media, 1 = sin cambios). */
export function calmClip(clip: THREE.AnimationClip, k: { head: number; body: number }): void {
  const mean = new THREE.Quaternion()
  const q = new THREE.Quaternion()
  const out = new THREE.Quaternion()
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.quaternion')) continue
    const f = /head|neck/i.test(track.name) ? k.head : k.body
    if (f >= 1) continue
    const v = track.values
    const n = v.length / 4
    if (n < 2) continue
    // Media de los cuaterniones (todos del mismo lado que el primero) y normalizada.
    let x = 0, y = 0, z = 0, w = 0
    for (let i = 0; i < v.length; i += 4) {
      const sgn = v[i] * v[0] + v[i + 1] * v[1] + v[i + 2] * v[2] + v[i + 3] * v[3] < 0 ? -1 : 1
      x += v[i] * sgn
      y += v[i + 1] * sgn
      z += v[i + 2] * sgn
      w += v[i + 3] * sgn
    }
    mean.set(x, y, z, w).normalize()
    for (let i = 0; i < v.length; i += 4) {
      q.set(v[i], v[i + 1], v[i + 2], v[i + 3])
      out.slerpQuaternions(mean, q, f)
      v[i] = out.x
      v[i + 1] = out.y
      v[i + 2] = out.z
      v[i + 3] = out.w
    }
  }
}

const models = new Map<HomeRole, Promise<GLTF>>()
let clips: Promise<Record<CharacterClip, THREE.AnimationClip>> | null = null

function loadClips(): Promise<Record<CharacterClip, THREE.AnimationClip>> {
  clips ??= Promise.all(
    (Object.keys(CLIPS) as CharacterClip[]).map(async (k) => {
      const g = await loadGlb(CLIPS[k])
      const clip = g.animations[0]
      clip.name = k
      calmClip(clip, CALM[k])
      return [k, clip] as const
    })
  ).then((list) => Object.fromEntries(list) as Record<CharacterClip, THREE.AnimationClip>)
  clips.catch(() => (clips = null))
  return clips
}

function loadModel(role: HomeRole): Promise<GLTF> {
  let p = models.get(role)
  if (!p) {
    p = loadGlb(MODELS[role])
    p.catch(() => models.delete(role))
    models.set(role, p)
  }
  return p
}

/** Movimiento que toca según lo que hace el agente. Puro para poder probarlo. */
export function pickClip(s: {
  visual: RobotBrain['visual']
  speed: number
  checkAmt: number
  questionAmt: number
  eyeError: number
  ackAmt: number
  /** 0..1: llamándote por algo nuevo en «Te necesita» (opcional: solo el coordinador). */
  callAmt?: number
  /** Segundos desde que empezó a trabajar (alterna entre explicar y hablar). */
  t: number
}): CharacterClip {
  if (s.speed > 0.6) return 'camina'
  if ((s.callAmt ?? 0) > 0.3) return 'saluda'
  if (s.checkAmt > 0.3) return 'celebra'
  if (s.visual === 'error' || s.eyeError > 0.4 || s.questionAmt > 0.4) return 'duda'
  if (s.ackAmt > 0.35) return 'saluda'
  if (s.visual === 'working') return Math.floor(s.t / 7) % 2 ? 'habla' : 'explica'
  if (s.visual === 'thinking') return 'piensa'
  return 'reposo'
}

/** Personaje animado listo para poner en la escena. */
export interface Character {
  root: THREE.Group
  /** Altura del modelo (de los pies a la cabeza) en unidades del modelo. */
  height: number
  update(dt: number, brain: RobotBrain, t: number): void
  dispose(): void
}

export async function buildCharacter(role: HomeRole): Promise<Character> {
  const [gltf, all] = await Promise.all([loadModel(role), loadClips()])
  const model = cloneSkinned(gltf.scene)
  const materials: THREE.Material[] = []
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      // Sin recibir sombras: en sus caras pequeñas la sombra propia dibujaba rayas.
      o.castShadow = true
      o.receiveShadow = false
      // El puntero se comprueba contra el robot de siempre (invisible): mucho más barato que una malla con esqueleto.
      o.raycast = () => {}
      o.frustumCulled = false
      const m = (o.material as THREE.MeshStandardMaterial).clone()
      m.roughness = 0.72
      m.metalness = 0
      if (m.map) m.map.anisotropy = 4
      o.material = m
      materials.push(m)
    }
  })
  const root = new THREE.Group()
  root.add(model)
  // Meshy los deja a todos de 1 m con los pies en el suelo (se pidió así al ponerles el esqueleto).
  const height = 1
  const mixer = new THREE.AnimationMixer(model)
  const actions = new Map<CharacterClip, THREE.AnimationAction>()
  for (const k of Object.keys(all) as CharacterClip[]) {
    const a = mixer.clipAction(all[k])
    a.play()
    a.setEffectiveWeight(k === 'reposo' ? 1 : 0)
    actions.set(k, a)
  }
  const weight = new Map<CharacterClip, number>([...actions.keys()].map((k) => [k, k === 'reposo' ? 1 : 0]))
  let current: CharacterClip = 'reposo'
  let since = 0
  let workStart = 0
  return {
    root,
    height,
    update(dt, brain, t) {
      if (brain.visual !== 'working') workStart = t
      const want = pickClip({ visual: brain.visual, speed: brain.speed, checkAmt: brain.checkAmt, questionAmt: brain.questionAmt, eyeError: brain.eyeError, ackAmt: brain.ackAmt, callAmt: brain.callAmt, t: t - workStart })
      // Un movimiento dura al menos un rato para que no tiemble entre dos estados.
      if (want !== current && (t - since > 0.8 || want === 'camina' || current === 'camina')) {
        current = want
        since = t
        const a = actions.get(want)!
        if ((weight.get(want) ?? 0) < 0.05) a.time = 0
      }
      const k = Math.min(1, dt * 6)
      for (const [name, a] of actions) {
        const w = (weight.get(name) ?? 0) + ((name === current ? 1 : 0) - (weight.get(name) ?? 0)) * k
        weight.set(name, w)
        a.setEffectiveWeight(w)
        a.enabled = w > 0.001
      }
      // Dormido o sin conexión: se mueve más despacio.
      mixer.timeScale = brain.visual === 'offline' ? 0.25 : brain.visual === 'resting' ? 0.5 : 1
      mixer.update(dt)
    },
    dispose() {
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
      materials.forEach((m) => m.dispose())
    }
  }
}
