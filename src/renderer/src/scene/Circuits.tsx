import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import { circuitFrag, circuitVert } from './shaders'
import { registry } from './registry'
import { glowBlending, palette, tone } from './palette'
import { ZONE_SPOTS } from './Zones'
import { GlowPoints } from './GlowPoints'

type P = [number, number]

function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ruta de placa base: un tramo recto y otro a 45°, en el orden indicado. */
function route(a: P, b: P, diagonalFirst: boolean): P[] {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const ax = Math.abs(dx)
  const az = Math.abs(dz)
  const diag = Math.min(ax, az)
  const d: P = [Math.sign(dx) * diag, Math.sign(dz) * diag]
  const mid: P = diagonalFirst ? [a[0] + d[0], a[1] + d[1]] : [b[0] - d[0], b[1] - d[1]]
  return [a, mid, b]
}

function length(pts: P[]): number {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return l
}

/** Recorta la polilínea `from` metros por el principio y `to` por el final. */
function trim(pts: P[], from: number, to: number): P[] {
  const cut = (arr: P[], dist: number): P[] => {
    let left = dist
    for (let i = 1; i < arr.length; i++) {
      const seg = Math.hypot(arr[i][0] - arr[i - 1][0], arr[i][1] - arr[i - 1][1])
      if (seg > left) {
        const k = left / seg
        return [[arr[i - 1][0] + (arr[i][0] - arr[i - 1][0]) * k, arr[i - 1][1] + (arr[i][1] - arr[i - 1][1]) * k], ...arr.slice(i)]
      }
      left -= seg
    }
    return [arr[arr.length - 1]]
  }
  return cut(cut(pts, from).reverse(), to).reverse()
}

/** Desplaza la polilínea en paralelo (esquinas en inglete). */
function offset(pts: P[], d: number): P[] {
  return pts.map((p, i) => {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const n1 = i > 0 ? normal(prev, p) : normal(p, next)
    const n2 = i < pts.length - 1 ? normal(p, next) : n1
    const nx = n1[0] + n2[0]
    const nz = n1[1] + n2[1]
    const len = Math.hypot(nx, nz) || 1
    const cos = (nx / len) * n1[0] + (nz / len) * n1[1]
    const k = d / Math.max(0.5, cos)
    return [p[0] + (nx / len) * k, p[1] + (nz / len) * k]
  })
}

function normal(a: P, b: P): P {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l = Math.hypot(dx, dz) || 1
  return [-dz / l, dx / l]
}

interface Trace {
  pts: P[]
  width: number
  filler: boolean
  phase: number
}

/** Cintas planas con distancia recorrida por vértice (para los pulsos) y lado (para el brillo). */
function ribbonGeometry(traces: Trace[]): THREE.BufferGeometry {
  const pos: number[] = []
  const dist: number[] = []
  const info: number[] = []
  const side: number[] = []
  const idx: number[] = []
  const Y = 0.014
  for (const tr of traces) {
    const total = length(tr.pts)
    const left = offset(tr.pts, tr.width / 2)
    const right = offset(tr.pts, -tr.width / 2)
    let acc = 0
    const base = pos.length / 3
    tr.pts.forEach((p, i) => {
      if (i > 0) acc += Math.hypot(p[0] - tr.pts[i - 1][0], p[1] - tr.pts[i - 1][1])
      pos.push(left[i][0], Y, left[i][1], right[i][0], Y, right[i][1])
      dist.push(acc, acc)
      info.push(total, tr.phase, tr.filler ? 1 : 0, total, tr.phase, tr.filler ? 1 : 0)
      side.push(1, -1)
      if (i > 0) {
        const a = base + (i - 1) * 2
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    })
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1))
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3))
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1))
  g.setIndex(idx)
  return g
}

const STATION_R = 1.75
const ZONE_R = 1.5

/** Pistas luminosas del suelo entre estaciones, zonas y la periferia (decoración con pulsos tenues). */
export function Circuits({ stations, reduced }: { stations: StationConfig[]; reduced: boolean }) {
  const traces = useMemo(() => {
    const rnd = seeded(11)
    const at = (id: string): P | null => {
      const st = stations.find((s) => s.id === id)
      return st ? [st.position[0], st.position[1]] : null
    }
    const out: Trace[] = []
    const bus = (a: P | null, b: P | null, ra: number, rb: number, lanes: number, diagonalFirst: boolean) => {
      if (!a || !b) return
      const core = trim(route(a, b, diagonalFirst), ra, rb)
      if (core.length < 2) return
      for (let k = 0; k < lanes; k++) {
        const d = (k - (lanes - 1) / 2) * 0.17
        out.push({ pts: d ? offset(core, d) : core, width: 0.075, filler: false, phase: rnd() })
      }
    }
    // Anillo entre estaciones vecinas.
    const ring = ['st-gemini', 'st-sub-1', 'st-hermes', 'st-codex', 'st-claude', 'st-muse', 'st-qwen']
    ring.forEach((id, i) => bus(at(id), at(ring[(i + 1) % ring.length]), STATION_R, STATION_R, 2, i % 2 === 0))
    // Zonas → estación más cercana.
    const z = ZONE_SPOTS
    bus(z.tasks, at('st-gemini'), ZONE_R, STATION_R, 3, false)
    bus(z.files, at('st-sub-1'), ZONE_R, STATION_R, 2, true)
    bus(z.tools, at('st-claude'), ZONE_R, STATION_R, 2, false)
    bus(z.tools, at('st-codex'), ZONE_R, STATION_R, 2, true)
    bus(z.memory, at('st-codex'), ZONE_R, STATION_R, 2, false)
    bus(z.memory, at('st-hermes'), ZONE_R, STATION_R, 2, true)

    // Relleno: grupos de pistas paralelas que salen hacia la periferia y acaban en un pad.
    const avoid: P[] = [...stations.map((s) => [s.position[0], s.position[1]] as P), z.tasks, z.files, z.tools, z.memory, [0, 0]]
    let guard = 0
    let made = 0
    while (made < 26 && guard++ < 400) {
      const ang = rnd() * Math.PI * 2
      const r = 7.5 + rnd() * 6
      const a: P = [Math.cos(ang) * r * 1.25, Math.sin(ang) * r * 0.9]
      if (a[1] > 9 || a[1] < -12) continue
      const dirAng = Math.round(((Math.atan2(a[1], a[0]) + (rnd() - 0.5) * 0.8) / (Math.PI / 4))) * (Math.PI / 4)
      const l1 = 1.2 + rnd() * 2.5
      const b: P = [a[0] + Math.cos(dirAng) * l1, a[1] + Math.sin(dirAng) * l1]
      const turn = dirAng + (rnd() < 0.5 ? 1 : -1) * (Math.PI / 4)
      const l2 = 0.8 + rnd() * 2
      const c: P = [b[0] + Math.cos(turn) * l2, b[1] + Math.sin(turn) * l2]
      const pts: P[] = [a, b, c]
      if (pts.some((p) => avoid.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 2.4))) continue
      const lanes = 2 + Math.floor(rnd() * 3)
      for (let k = 0; k < lanes; k++) out.push({ pts: offset(pts, (k - (lanes - 1) / 2) * 0.15), width: 0.045, filler: true, phase: rnd() })
      made++
    }
    return out
  }, [stations])

  const geo = useMemo(() => ribbonGeometry(traces), [traces])
  // Cuentas de luz a lo largo de las pistas en los temas que las llevan (bombillas de Navidad, brasas…).
  const beads = useMemo(() => {
    const b = palette.beads
    if (!b) return null
    const pos: number[] = []
    for (const tr of traces) {
      const step = b.spacing * (tr.filler ? 1.6 : 1)
      let carry = step * 0.5
      for (let i = 1; i < tr.pts.length; i++) {
        const [ax, az] = tr.pts[i - 1]
        const [bx, bz] = tr.pts[i]
        const seg = Math.hypot(bx - ax, bz - az)
        for (let d = carry; d < seg; d += step) pos.push(ax + ((bx - ax) * d) / seg, 0.05, az + ((bz - az) * d) / seg)
        carry = (carry - seg) % step
        if (carry < 0) carry += step
      }
    }
    return pos
  }, [traces])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: circuitVert,
        fragmentShader: circuitFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: glowBlending(),
        uniforms: {
          uTime: { value: 0 },
          uAmbient: { value: 1 },
          uBlue: { value: new THREE.Color(palette.primary).multiplyScalar(1.1) },
          uViolet: { value: new THREE.Color(palette.secondary) }
        }
      }),
    []
  )

  // Pads en los extremos de cada pista.
  const pads = useMemo(() => {
    const ends: P[] = []
    for (const tr of traces) ends.push(tr.pts[0], tr.pts[tr.pts.length - 1])
    return ends
  }, [traces])
  const padGeo = useMemo(() => new THREE.RingGeometry(0.03, 0.062, 16).rotateX(-Math.PI / 2), [])
  const padMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(tone('#7da4ff')), transparent: true, opacity: 0.85, blending: glowBlending(), depthWrite: false, toneMapped: false }),
    []
  )
  const padMesh = useMemo(() => {
    const m = new THREE.InstancedMesh(padGeo, padMat, Math.max(1, pads.length))
    const mtx = new THREE.Matrix4()
    pads.forEach((p, i) => {
      mtx.makeTranslation(p[0], 0.016, p[1])
      m.setMatrixAt(i, mtx)
    })
    m.count = pads.length
    m.instanceMatrix.needsUpdate = true
    return m
  }, [pads, padGeo, padMat])

  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
      padGeo.dispose()
      padMat.dispose()
      padMesh.dispose()
    },
    [geo, mat, padGeo, padMat, padMesh]
  )

  useFrame(() => {
    mat.uniforms.uTime.value = registry.time
    mat.uniforms.uAmbient.value = reduced ? 0 : 1
  })

  return (
    <group>
      <mesh geometry={geo} material={mat} frustumCulled={false} />
      <primitive object={padMesh} />
      {beads && palette.beads && <GlowPoints positions={beads} color={palette.beads.color} intensity={2.2} size={palette.beads.size} flicker={palette.beads.flicker} reduced={reduced} />}
    </group>
  )
}
