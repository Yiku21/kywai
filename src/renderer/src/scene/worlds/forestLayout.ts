import type { StationConfig } from '@shared/types'

export function forestRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

export function forestHeight(x: number, z: number) {
  const outside = Math.min(1, Math.max(0, (Math.max(Math.abs(x) - 11, -z - 9, z - 10)) / 6))
  const undulation = Math.sin(x * 0.24 + z * 0.16) * Math.cos(z * 0.33) * 0.42
  return -0.115 + Math.sin(x * 1.12 + z * 0.31) * Math.cos(z * 0.94) * 0.033 + outside * (0.26 + undulation)
}

/** Keep props outside the landing areas, the center and the radial walkways. */
export function forestClear(x: number, z: number, stations: StationConfig[], radius = 0) {
  if (Math.hypot(x, z) < 2.72 + radius) return false
  if (Math.abs(x) > 7.4 - radius && Math.abs(x) < 11.7 + radius && z > -3.4 - radius && z < 8.5 + radius) return false
  return !stations.some(st => {
    const [sx, sz] = st.position, len = Math.hypot(sx, sz)
    if (Math.hypot(x - sx, z - sz) < 1.91 + radius) return true
    if (len < 4) return false
    const along = (x * sx + z * sz) / len
    return along > 0 && along < len && Math.abs(x * sz - z * sx) / len < 0.69 + radius
  })
}

export interface ForestTree { x: number; z: number; height: number; seed: number; fine: boolean }

export function forestStands(stations: StationConfig[], detailed: boolean): ForestTree[] {
  const random = forestRandom(827)
  const trees: ForestTree[] = []
  const add = (x: number, z: number, height: number, fine: boolean) => {
    if (!forestClear(x, z, stations, 1.4)) return
    trees.push({ x, z, height, fine, seed: Math.floor(random() * 1000000) })
  }
  // Large trunks frame the clearing. The further stands use progressively narrower crowns.
  for (const [x, z, h] of [[-12.4, -10.4, 12.9], [11.9, -12.8, 13.8], [-15, 1.7, 13.1], [14.9, 2.3, 14.7], [-4.9, -14.5, 10.9], [4.8, -16.5, 12.2]]) add(x, z, h, true)
  for (let row = 0; row < 5; row++) {
    const spacing = detailed ? 3.8 : 4.9
    for (let x = -39; x < 40; x += spacing) {
      const tx = x + random() * spacing, z = -12.5 - row * 7.2 - random() * 4.6
      if (trees.some(tree => Math.hypot(tree.x - tx, tree.z - z) < 2.8)) continue
      add(tx, z, 7.5 + random() * 8.5, row === 0)
    }
  }
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
    for (let z = -12; z <= 36; z += detailed ? 4.8 : 6.5) {
      const x = side * (16 + row * 6.3 + random() * 4.8), tz = z + random() * 3
      if (trees.some(tree => Math.hypot(tree.x - x, tree.z - tz) < 3)) continue
      add(x, tz, 9 + random() * 8, row === 0)
    }
  }
  return trees
}
