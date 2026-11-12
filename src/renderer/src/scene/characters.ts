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

/** Cómo se ven los agentes en el espacio 3D (por dispositivo). */
export type RobotStyle = 'personajes' | 'clasicos'

const KEY = 'aicowork.robots.estilo'

function readStyle(): RobotStyle {
  try {
    return localStorage.getItem(KEY) === 'clasicos' ? 'clasicos' : 'personajes'
  } catch {
    return 'personajes'
  }
}

export const useRobotStyle = create<{ style: RobotStyle; setStyle(s: RobotStyle): void }>((set) => ({
  style: readStyle(),
  setStyle(style) {
    try {
      localStorage.setItem(KEY, style)
    } catch {
      /* sin almacenamiento: vale para esta sesión */
    }
    set({ style })
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
const models = new Map<HomeRole, Promise<GLTF>>()
let clips: Promise<Record<CharacterClip, THREE.AnimationClip>> | null = null

function loadClips(): Promise<Record<CharacterClip, THREE.AnimationClip>> {
  clips ??= Promise.all(
    (Object.keys(CLIPS) as CharacterClip[]).map(async (k) => {
      const g = await loader.loadAsync(CLIPS[k])
      const clip = g.animations[0]
      clip.name = k
      return [k, clip] as const
    })
  ).then((list) => Object.fromEntries(list) as Record<CharacterClip, THREE.AnimationClip>)
  clips.catch(() => (clips = null))
  return clips
}

function loadModel(role: HomeRole): Promise<GLTF> {
  let p = models.get(role)
  if (!p) {
    p = loader.loadAsync(MODELS[role])
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
  /** Segundos desde que empezó a trabajar (alterna entre explicar y hablar). */
  t: number
}): CharacterClip {
  if (s.speed > 0.6) return 'camina'
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
      o.castShadow = true
      o.receiveShadow = true
      // El puntero se comprueba contra el robot de siempre (invisible): mucho más barato que una malla con esqueleto.
      o.raycast = () => {}
      o.frustumCulled = false
      const m = (o.material as THREE.MeshStandardMaterial).clone()
      m.roughness = 0.72
      m.metalness = 0
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
      const want = pickClip({ visual: brain.visual, speed: brain.speed, checkAmt: brain.checkAmt, questionAmt: brain.questionAmt, eyeError: brain.eyeError, ackAmt: brain.ackAmt, t: t - workStart })
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
