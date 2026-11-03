// Decoración propia de algunos temas (palette.decor): cada uno en su módulo (relicario, telar, halloween, navidad).
// Todo con mallas instanciadas y puntos de luz, para que cueste poco; con menos calidad hay menos piezas.
import { useMemo } from 'react'
import type { StationConfig } from '@shared/types'
import { ChristmasScene } from './navidad'
import { HalloweenScene } from './halloween'
import { RelicScene } from './relicario'
import { LoomScene } from './telar'
import { ZONE_SPOTS } from './Zones'
import { palette } from './palette'
import type { QualitySettings } from './quality'

function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Sitios libres del suelo: lejos del núcleo, de las estaciones, de las zonas, de la ciudad y unos de otros. */
function freeSpots(n: number, seed: number, rMin: number, rMax: number, stations: StationConfig[], gap = 1.1): [number, number][] {
  const rnd = seeded(seed)
  const out: [number, number][] = []
  const zones = Object.values(ZONE_SPOTS)
  for (let tries = 0; out.length < n && tries < n * 60; tries++) {
    const a = rnd() * Math.PI * 2
    const r = rMin + Math.sqrt(rnd()) * (rMax - rMin)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r * 0.85 - 1
    if (z > 7.5 || Math.hypot(x, z) < 3.9 || Math.abs(x) > 12.2 || z < -9.4) continue
    if (stations.some((s) => Math.hypot(s.position[0] - x, s.position[1] - z) < 2.6)) continue
    if (zones.some(([zx, zz]) => Math.hypot(zx - x, zz - z) < 2.5)) continue
    if (out.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < gap)) continue
    out.push([x, z])
  }
  return out
}

/** La decoración del tema actual (nada en los demás temas). */
export function Decor({ stations, q, reduced }: { stations: StationConfig[]; q: QualitySettings; reduced: boolean }) {
  const density = q.particles / 700
  const free = useMemo(() => (n: number, seed: number, a: number, b: number, gap?: number) => freeSpots(n, seed, a, b, stations, gap), [stations])
  switch (palette.decor) {
    case 'halloween':
      return <HalloweenScene stations={stations} density={density} reduced={reduced} cityCount={q.structures} free={free} />
    case 'navidad':
      return <ChristmasScene stations={stations} density={density} reduced={reduced} cityCount={q.structures} free={free} />
    case 'relicario':
      return <RelicScene stations={stations} density={density} reduced={reduced} free={free} />
    case 'telar':
      return <LoomScene stations={stations} density={density} reduced={reduced} free={free} />
    default:
      return null
  }
}
