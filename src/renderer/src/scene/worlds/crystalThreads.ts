import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import type { Vec } from './models'

export const weaveAnchors: Vec[] = Array.from({ length: 16 }, (_, i) => {
  const a = i / 16 * Math.PI * 2
  return [Math.cos(a) * 21, 1.4 + Math.sin(a * 3) * 2.7, Math.sin(a) * 18 - 5]
})

/** Curves meet the underside of each seat, never crossing a robot's face or the project. */
export function crystalConnections(stations: StationConfig[]) {
  const seats: Vec[] = [[0, -.2, 0], ...stations.map(s => [s.position[0], -.22, s.position[1]] as Vec), [-9.5, -.2, -.5], [9.5, -.2, -.5], [-9.5, -.2, 6], [9.5, -.2, 6]]
  const pairs: [Vec, Vec, number][] = []
  for (let i = 1; i < seats.length; i++) {
    pairs.push([seats[0], seats[i], .65], [seats[i], seats[i === seats.length - 1 ? 1 : i + 1], 1.2])
  }
  weaveAnchors.forEach((anchor, i) => {
    pairs.push([anchor, weaveAnchors[(i + 1) % weaveAnchors.length], 1.7])
    const closest = seats.slice(1).sort((a, b) => Math.hypot(a[0] - anchor[0], a[2] - anchor[2]) - Math.hypot(b[0] - anchor[0], b[2] - anchor[2]))[0]
    if (closest) pairs.push([anchor, closest, 2.6])
    if (anchor[2] < -9) pairs.push([anchor, weaveAnchors[(i + 5) % weaveAnchors.length], -6])
  })
  return pairs.map(([a, b, sag]) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b)
    return new THREE.CubicBezierCurve3(from,
      from.clone().lerp(to, .32).add(new THREE.Vector3(0, -sag, .16)),
      from.clone().lerp(to, .68).add(new THREE.Vector3(0, -sag, -.16)), to)
  })
}

export function threadGeometry(curves: THREE.Curve<THREE.Vector3>[], strands: number, spacing = .045, segments = 72) {
  const positions: number[] = [], progress: number[] = [], seeds: number[] = []
  const p = new THREE.Vector3()
  curves.forEach((curve, ci) => {
    for (let s = 0; s < strands; s++) for (let j = 0; j < segments; j++) {
      for (const t of [j / segments, (j + 1) / segments]) {
        curve.getPoint(t, p)
        const offset = (s - (strands - 1) / 2) * spacing * Math.sin(t * Math.PI)
        p.x += offset * Math.cos(ci * 2.4 + t * 4)
        p.y += offset * Math.sin(ci * 2.4 + t * 4)
        positions.push(p.x, p.y, p.z); progress.push(t); seeds.push(ci * .137 + s * .071)
      }
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('progress', new THREE.Float32BufferAttribute(progress, 1))
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1))
  return geometry
}

/** An orb web: radial load-bearing threads, scalloped spiral silk and a curved bowl. */
export function orbWebCurves(radius: number, spokes = 28, turns = 19, depth = 2.4) {
  const curves: THREE.Curve<THREE.Vector3>[] = []
  const point = (a: number, r: number, scallop = true) => {
    const unit = r / radius, sector = a / (Math.PI * 2) * spokes
    const sag = scallop ? Math.sin((sector - Math.floor(sector)) * Math.PI) : 0
    const rr = r * (1 - sag * .018)
    return new THREE.Vector3(Math.cos(a) * rr, depth * (unit * unit - .3) - sag * radius * .012 * unit, Math.sin(a) * rr * .83)
  }
  for (let i = 0; i < spokes; i++) {
    const a = i / spokes * Math.PI * 2
    curves.push(new THREE.CatmullRomCurve3(Array.from({length:33},(_,j)=>point(a,radius*(.075+j/32*.925),false))))
  }
  for (let k = 0; k < turns; k++) {
    const r = radius * (.10 + k / (turns - 1) * .9)
    curves.push(new THREE.CatmullRomCurve3(Array.from({length:spokes*8+1},(_,j)=>point(j/(spokes*8)*Math.PI*2,r)),true))
  }
  return curves
}
