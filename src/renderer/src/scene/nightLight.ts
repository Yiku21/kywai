// La noche del espacio 3D vista desde dentro de la escena: cuánto ha anochecido (0 de día, 1 de noche) y cuánto
// brilla de más lo que tiene luz propia en cada tema. World lo pone en cada render (Modo noche o Auto) y lo leen en
// cada fotograma las piezas que cambian con la noche: antorchas y hogueras, luciérnagas, naves de Matrix y EVA,
// bioluminiscencia del arrecife, cielos pintados... Nada de filtros encima de la imagen: la noche es luz de verdad.
import * as THREE from 'three'
import type { WorldStyle } from './worlds/models'

/** Noche actual del espacio (la escribe World). */
export const spaceNight = { value: 0 }

/** Paso suave de 0 a 1 entre [from] y [to] (para cosas que aparecen a media tarde o ya entrada la noche). */
export function nightRamp(night: number, from: number, to: number): number {
  const t = Math.min(1, Math.max(0, (night - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/** Temas sin noche: Órbita está en el espacio (siempre igual); la Oficina y el Refugio Kywai tienen la suya propia. */
export function hasSpaceNight(theme: string): boolean {
  return theme !== 'mundo-orbita' && theme !== 'kywai' && theme !== 'oficina' && theme !== 'sede'
}

/**
 * Cuánto más brilla de noche lo que tiene luz propia (neón, pantallas, fuego) en cada tema: 1 = el doble.
 * El Clásico, Matrix, EVA y Grafito son los de neón y fuego: de noche son los que más contrastan.
 */
export function nightBoost(world: WorldStyle | undefined): number {
  switch (world) {
    case 'clasico': return 1.5
    case 'grafito': return 1.4
    case 'matrix': case 'eva': return 1.3
    case 'submarino': return 1.1
    case undefined: return 1
    default: return 0.8
  }
}

/** Lo que tenía cada material antes de la noche (para volver a él al amanecer). */
interface Saved { ei?: number; eiSet?: number; color?: THREE.Color; colorSet?: THREE.Color }

/**
 * Aplica la noche [night] a un material: el brillo propio (emissive) sube [boost] veces y los trazos de neón sin
 * luz (MeshBasic sin tone mapping, los que se ven por el bloom) se aclaran; los shaders con `uNight` lo reciben.
 * Si el código de la pieza cambia el valor por su cuenta, se toma ese como el nuevo de día.
 */
export function tuneForNight(m: THREE.Material, night: number, boost: number): void {
  const saved = (m.userData.night ??= {}) as Saved
  const std = m as THREE.MeshStandardMaterial
  // Un material puede pedir brillo solo de noche con userData.nightEmissive (corales y esponjas bioluminiscentes).
  const extra = (m.userData.nightEmissive as number | undefined) ?? 0
  if (std.isMeshStandardMaterial && std.emissive && (std.emissiveIntensity > 0 || extra > 0) && std.emissive.r + std.emissive.g + std.emissive.b > 0.02) {
    if (saved.eiSet === undefined || std.emissiveIntensity !== saved.eiSet) saved.ei = std.emissiveIntensity
    std.emissiveIntensity = saved.eiSet = saved.ei! * (1 + boost * night) + extra * night
  } else if ((m as THREE.MeshBasicMaterial).isMeshBasicMaterial && !m.toneMapped) {
    const basic = m as THREE.MeshBasicMaterial
    if (!saved.colorSet || !basic.color.equals(saved.colorSet)) saved.color = basic.color.clone()
    basic.color.copy(saved.color!).multiplyScalar(1 + boost * 0.6 * night)
    saved.colorSet = basic.color.clone()
  }
  const uniforms = (m as THREE.ShaderMaterial).uniforms
  if (uniforms?.uNight) uniforms.uNight.value = night
}

/** Un foco de luz de noche: dónde está, de qué color y cuánto pesa (0–1) lo que brilla alrededor. */
export interface GlowSpot { at: [number, number, number]; color: string; weight: number }

/**
 * Dónde poner luces que irradien de noche: junta lo que brilla del escenario ([pieces] con `glow`) en celdas de
 * [cell] metros y se queda con las [max] que más brillo tienen, cada una en el centro de su brillo y con su color.
 * Así unas pocas luces puntuales bastan para que las tiras de neón, los conductos y el fuego iluminen su alrededor.
 */
export function glowSpots(pieces: ReadonlyArray<{ at: [number, number, number]; size: [number, number, number]; color: string; glow?: number }>,
  max: number, { minGlow = 0.5, cell = 7, reach = 30 } = {}): GlowSpot[] {
  const cells = new Map<string, { w: number; x: number; y: number; z: number; r: number; g: number; b: number }>()
  const c = new THREE.Color()
  for (const p of pieces) {
    if (!p.glow || p.glow < minGlow) continue
    const [x, y, z] = p.at
    if (Math.abs(x) > reach || Math.abs(z) > reach) continue
    const w = p.glow * Math.min(4, Math.max(...p.size))
    const key = `${Math.round(x / cell)}:${Math.round(z / cell)}`
    const acc = cells.get(key) ?? { w: 0, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0 }
    c.set(p.color)
    acc.w += w; acc.x += x * w; acc.y += y * w; acc.z += z * w; acc.r += c.r * w; acc.g += c.g * w; acc.b += c.b * w
    cells.set(key, acc)
  }
  const top = [...cells.values()].sort((a, b) => b.w - a.w).slice(0, max)
  const heaviest = top[0]?.w ?? 1
  return top.map((a) => ({
    at: [a.x / a.w, Math.max(0.6, a.y / a.w + 0.3), a.z / a.w],
    color: '#' + c.setRGB(a.r / a.w, a.g / a.w, a.b / a.w).getHexString(),
    weight: Math.max(0.35, a.w / heaviest)
  }))
}
