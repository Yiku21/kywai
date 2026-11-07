import type { StationConfig } from '@shared/types'
import type { Model } from './models'

const masonry = ['#263d35', '#1b3029', '#30443b']
const trim = '#527366'
const glass = '#0a1e18'

/** Setbacks, recessed windows and rooftop services establish a human-scale city. */
export function addMatrixCity(m: Model, stations: StationConfig[], detailed: boolean) {
  const tower = (x: number, z: number, w: number, d: number, h: number, seed: number) => {
    if (stations.some(s => Math.hypot(s.position[0] - x, s.position[1] - z) < Math.max(w, d) / 2 + 2.8)) return
    const stone = masonry[seed % masonry.length]
    const tier = (bottom: number, height: number, width: number, depth: number) => {
      m.box([x, bottom + height / 2, z], [width, height, depth], stone)
      const cols = Math.max(3, Math.floor(width / 0.42)), rows = Math.floor(height / 0.48)
      const sideCols = Math.max(3, Math.floor(depth / 0.44))
      // Glass is inset behind the stone piers; lit rooms are irregular, never full neon stripes.
      for (let r = 0; r < rows; r++) {
        const y = bottom + 0.25 + r * 0.48
        for (let c = 0; c < cols; c++) {
          const lit = (r * 19 + c * 7 + seed * 13) % 17
          const color = lit < 3 ? '#95bd9a' : lit < 7 ? '#467e5b' : glass
          m.box([x + (c + 0.5) * width / cols - width / 2, y, z + depth / 2 + 0.014], [width / cols * 0.59, 0.29, 0.028], color, lit < 7 ? 0.4 : 0)
          if (detailed && r % 3 === 0) m.box([x + (c + 0.5) * width / cols - width / 2, y - 0.17, z + depth / 2 + 0.045], [width / cols * 0.72, 0.036, 0.09], trim)
        }
        for (const side of [-1, 1]) for (let c = 0; c < sideCols; c++) {
          const lit = (r * 7 + c * 11 + seed * 5) % 13 < 4
          m.box([x + side * (width / 2 + 0.014), y, z + (c + 0.5) * depth / sideCols - depth / 2], [0.028, 0.29, depth / sideCols * 0.6], lit ? '#467e5b' : glass, lit ? 0.32 : 0)
        }
        if (r % 4 === 3) m.box([x, y + 0.23, z], [width + 0.08, 0.055, depth + 0.08], trim)
      }
      for (const side of [-1, 1]) {
        m.box([x + side * (width / 2 - 0.04), bottom + height / 2, z + depth / 2 + 0.035], [0.09, height, 0.1], trim)
        m.box([x, bottom + height + 0.04, z + side * depth / 2], [width + 0.15, 0.13, 0.12], trim)
        m.box([x + side * width / 2, bottom + height + 0.04, z], [0.12, 0.13, depth], trim)
      }
      m.box([x, bottom + height + 0.005, z], [width - 0.18, 0.04, depth - 0.18], '#101e1b')
    }
    const shoulder = h * (seed % 3 === 0 ? 0.72 : 0.85)
    tier(0, shoulder, w, d)
    tier(shoulder + 0.15, h - shoulder, w * 0.72, d * 0.76)
    // Street entrances, canopies and a raised plinth.
    m.box([x, 0.12, z], [w + 0.3, 0.24, d + 0.3], '#344d40')
    m.box([x, 0.53, z + d / 2 + 0.04], [0.55, 0.86, 0.07], '#07140f')
    m.box([x, 1.03, z + d / 2 + 0.3], [1.05, 0.09, 0.65], trim)
    m.box([x, 0.99, z + d / 2 + 0.6], [0.8, 0.025, 0.035], '#9cdbb0', 0.8)
    // HVAC housings, louvers, water tanks and communication masts.
    m.box([x - w * 0.16, h + 0.4, z], [w * 0.3, 0.45, d * 0.38], '#40584d')
    for (let i = 0; i < 5; i++) m.box([x - w * 0.16, h + 0.65, z + (i - 2) * 0.09], [w * 0.25, 0.022, 0.035], '#0b1b14')
    if (seed % 2 === 0) {
      m.add('cylinder', [x + w * 0.2, h + 0.59, z - d * 0.18], [0.23, 0.66, 0.23], '#446454')
      m.add('cone', [x + w * 0.2, h + 0.98, z - d * 0.18], [0.27, 0.16, 0.27], '#22392e')
    }
    if (seed % 3 !== 1) {
      m.beam([x, h + 0.2, z], [x, h + 1.7, z], 0.035, trim)
      for (const y of [0.65, 1.05]) m.beam([x - 0.32, h + y, z], [x + 0.32, h + y, z], 0.025, trim)
      m.add('sphere', [x, h + 1.72, z], [0.045, 0.045, 0.045], '#a3e9b7', 1)
    }
    if (detailed && seed % 3 === 0) {
      const face = z + d / 2 + 0.2
      for (let y = 1.5; y < shoulder - 0.5; y += 1.45) {
        m.box([x + w * 0.27, y, face], [0.58, 0.045, 0.4], '#152c21')
        m.beam([x + w * 0.27 - 0.25, y + 0.3, face + 0.2], [x + w * 0.27 + 0.25, y + 0.3, face + 0.2], 0.024, trim)
        m.beam([x + w * 0.27 - 0.2, y, face + 0.13], [x + w * 0.27 + 0.2, y + 1.45, face + 0.13], 0.045, trim)
      }
    }
  }
  // Broad blocks at the front, taller setback towers behind, with gaps for distant movement.
  for (let i = 0; i < 11; i++) {
    const x = (i - 5) * 3.9
    tower(x, -16.5 - i % 3 * 1.3, 2.5 + i % 3 * 0.23, 2.1 + i % 2 * 0.5, 3.9 + (i * 7 % 6) * 0.65, i)
  }
  for (let i = 0; i < (detailed ? 13 : 9); i++) {
    const x = (i - (detailed ? 6 : 4)) * 4.8 + 1.3
    tower(x, -29 - i % 3 * 2, 3.0 + i % 3 * 0.35, 3.1, 7 + (i * 5 % 7) * 1.1, i + 20)
  }
  if (detailed) for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    tower(side * (18 + i * 4.5), -9 - i * 3.4, 2.4, 2.8, 2.7 + i * 1.3, i + 40)
  }
}
