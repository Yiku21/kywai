import * as THREE from 'three'
import type { StationConfig } from '@shared/types'

/** Altura del suelo de las plataformas y de flotación de los robots. */
export const PLATFORM_Y = 0.32
export const ROBOT_Y = 1.55
export const CORE_POS = new THREE.Vector3(0, 0, 0)
export const CORE_RADIUS = 2.25

export function stationVec(st: StationConfig, y = 0): THREE.Vector3 {
  return new THREE.Vector3(st.position[0], y, st.position[1])
}

/** Lado hacia el que la estación coloca su consola holográfica (hacia fuera del centro). */
export function consoleSide(st: StationConfig): 1 | -1 {
  return st.position[0] >= 0 ? 1 : -1
}

/** Posición local de la pantalla principal de la estación. */
export function consoleOffset(st: StationConfig): THREE.Vector3 {
  const side = consoleSide(st)
  return new THREE.Vector3(side * 0.95, 0, -0.55)
}

/** Punto junto al núcleo donde un robot se coloca para colaborar. */
export function coreBay(st: StationConfig): THREE.Vector3 {
  const dir = new THREE.Vector3(st.position[0], 0, st.position[1])
  if (dir.lengthSq() < 0.001) dir.set(0, 0, 1)
  dir.normalize().multiplyScalar(CORE_RADIUS + 0.35)
  return new THREE.Vector3(dir.x, ROBOT_Y + 0.15, dir.z)
}

/** Camino tipo "circuito" desde la estación al núcleo (en el suelo), con esquinas redondeadas. */
export function stationTracePoints(st: StationConfig): THREE.Vector3[] {
  const [x, z] = st.position
  const y = 0.03
  const start = new THREE.Vector3(x, y, z)
  // Sale de la estación hacia el núcleo, primero en x y luego en diagonal suave.
  const elbow = new THREE.Vector3(x * 0.45, y, z)
  const end = new THREE.Vector3(x, 0, z).normalize().multiplyScalar(CORE_RADIUS - 0.1)
  end.y = y
  return [start, new THREE.Vector3((x + elbow.x) / 2, y, z), elbow, new THREE.Vector3(elbow.x * 0.6 + end.x * 0.4, y, elbow.z * 0.6 + end.z * 0.4), end]
}

export function traceCurve(st: StationConfig): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(stationTracePoints(st), false, 'centripetal', 0.2)
}

/** Ángulo de giro (eje Y) para mirar desde `from` hacia `to`. El frente del robot es +Z. */
export function yawTo(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let d = target - current
  d = Math.atan2(Math.sin(d), Math.cos(d))
  return current + d * (1 - Math.exp(-lambda * dt))
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

/** Hash estable de un texto a [0, 1). Sirve para desfases por agente. */
export function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

export function smootherstep(x: number): number {
  const t = Math.min(1, Math.max(0, x))
  return t * t * t * (t * (t * 6 - 15) + 10)
}
