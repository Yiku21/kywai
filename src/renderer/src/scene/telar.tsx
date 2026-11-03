// Telar en el espacio digital: membranas de tela tejida (superficie con trama, hilos y orillos con cuentas doradas)
// alrededor y entre las estaciones, cada estación sobre una silla de tela tejida, hilos sueltos que cuelgan con gotas
// de rocío, destellos que parpadean y paneles de vidrio con trama. El núcleo son cintas tejidas (CoreExtras).
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { StationConfig } from '@shared/types'
import { canvasTexture } from './assets'
import { GlowPoints } from './GlowPoints'
import { glowBlending } from './palette'

function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Trama de tela: hilos de plata en dos sentidos que pasan por encima y por debajo, con alguno dorado. */
export const weaveTexture = (): THREE.CanvasTexture => {
  const t = canvasTexture(256, 256, (ctx) => {
    const n = 16
    const s = 256 / n
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const over = (i + j) % 2 === 0
        const gold = i % 8 === 3 || j % 8 === 5
        ctx.fillStyle = gold ? (over ? 'rgba(255,214,150,0.9)' : 'rgba(255,214,150,0.45)') : over ? 'rgba(236,240,250,0.85)' : 'rgba(200,208,228,0.35)'
        // Hilo horizontal o vertical según el cruce (efecto de tejido).
        if (over) ctx.fillRect(i * s + 1, j * s + s * 0.3, s - 2, s * 0.4)
        else ctx.fillRect(i * s + s * 0.3, j * s + 1, s * 0.4, s - 2)
      }
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Silla de montar (paraboloide hiperbólico) en u, v ∈ [-1, 1], girada 45° para que suban dos esquinas. */
function saddle(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(u * 0.7071 - v * 0.7071, u * v * 0.85, u * 0.7071 + v * 0.7071)
}

interface Sheet {
  m: THREE.Matrix4
  n: number
  repeat: number
}

/** Superficie, hilos, orillo y cuentas de varias membranas, todo junto (pocas mallas). */
function buildSheets(sheets: Sheet[], beadEvery: number) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const threads: number[] = []
  const hem: number[] = []
  const beads: number[] = []
  const v = new THREE.Vector3()
  const w = new THREE.Vector3()
  const SEG = 18
  for (const sh of sheets) {
    const base = pos.length / 3
    for (let j = 0; j <= SEG; j++) {
      for (let i = 0; i <= SEG; i++) {
        saddle(-1 + (2 * i) / SEG, -1 + (2 * j) / SEG, v).applyMatrix4(sh.m)
        pos.push(v.x, v.y, v.z)
        uv.push((i / SEG) * sh.repeat, (j / SEG) * sh.repeat)
        if (i < SEG && j < SEG) {
          const k = base + j * (SEG + 1) + i
          idx.push(k, k + 1, k + SEG + 1, k + 1, k + SEG + 2, k + SEG + 1)
        }
      }
    }
    // Hilos de la urdimbre y la trama.
    for (let l = 0; l <= sh.n; l++) {
      const c = -1 + (2 * l) / sh.n
      for (let k = 0; k < SEG; k++) {
        const a = -1 + (2 * k) / SEG
        const b = -1 + (2 * (k + 1)) / SEG
        saddle(c, a, v).applyMatrix4(sh.m)
        saddle(c, b, w).applyMatrix4(sh.m)
        threads.push(v.x, v.y, v.z, w.x, w.y, w.z)
        saddle(a, c, v).applyMatrix4(sh.m)
        saddle(b, c, w).applyMatrix4(sh.m)
        threads.push(v.x, v.y, v.z, w.x, w.y, w.z)
      }
    }
    // Orillo (el borde) con cuentas.
    const edge = (f: (t: number) => [number, number]) => {
      for (let k = 0; k < SEG * 2; k++) {
        const [a1, b1] = f(k / (SEG * 2))
        const [a2, b2] = f((k + 1) / (SEG * 2))
        saddle(a1, b1, v).applyMatrix4(sh.m)
        saddle(a2, b2, w).applyMatrix4(sh.m)
        hem.push(v.x, v.y, v.z, w.x, w.y, w.z)
        if (k % beadEvery === 0) beads.push(v.x, v.y, v.z)
      }
    }
    edge((t) => [-1 + 2 * t, -1])
    edge((t) => [1, -1 + 2 * t])
    edge((t) => [1 - 2 * t, 1])
    edge((t) => [-1, 1 - 2 * t])
  }
  const surface = new THREE.BufferGeometry()
  surface.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  surface.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  surface.setIndex(idx)
  const lines = (p: number[]) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    return g
  }
  return { surface, threads: lines(threads), hem: lines(hem), beads }
}

let R_: ReturnType<typeof makeRes> | null = null
function makeRes() {
  const weave = weaveTexture()
  return {
    weave,
    cloth: new THREE.MeshBasicMaterial({ map: weave, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, blending: glowBlending() }),
    padCloth: new THREE.MeshBasicMaterial({ map: weave, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, color: new THREE.Color('#e8ecf6').multiplyScalar(1.1) }),
    thread: new THREE.LineBasicMaterial({ color: '#cfd6e6', transparent: true, opacity: 0.22, blending: glowBlending(), depthWrite: false }),
    strand: new THREE.LineBasicMaterial({ color: '#e8ecf6', transparent: true, opacity: 0.35, depthWrite: false }),
    hem: new THREE.LineBasicMaterial({ color: new THREE.Color('#f4f6ff').multiplyScalar(1.3), transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#cfd6e6', roughness: 0.05, transparent: true, opacity: 0.22, envMapIntensity: 2.2, depthWrite: false }),
    panelCloth: new THREE.MeshBasicMaterial({ map: weave, transparent: true, opacity: 0.22, depthWrite: false, blending: glowBlending() }),
    invisible: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  }
}
function res() {
  if (!R_) R_ = makeRes()
  return R_
}

/** Material invisible para la base de las estaciones (se puede pulsar, pero no se ve: la estación es la silla). */
export const invisibleMaterial = (): THREE.Material => res().invisible

/** Silla de tela tejida de una estación, con orillo brillante y cuentas doradas. */
export function LoomSeat({ r, y, reduced, yaw = 0 }: { r: number; y: number; reduced: boolean; yaw?: number }) {
  const R = res()
  const data = useMemo(() => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(r, r * 0.46, r))
    return buildSheets([{ m, n: 14, repeat: 3 }], 3)
  }, [r, y, yaw])
  useEffect(
    () => () => {
      data.surface.dispose()
      data.threads.dispose()
      data.hem.dispose()
    },
    [data]
  )
  return (
    <group>
      <mesh geometry={data.surface} material={R.padCloth} />
      <lineSegments geometry={data.threads} material={R.thread} />
      <lineSegments geometry={data.hem} material={R.hem} />
      <GlowPoints positions={data.beads} color="#f0c27a" intensity={2} size={0.09} flicker={0.6} reduced={reduced} />
    </group>
  )
}

/** Panel de vidrio con una trama tenue detrás y un orillo de plata. */
export function LoomPanel({ size, position }: { size: [number, number]; position: [number, number, number] }) {
  const R = res()
  const [w, h] = size
  const geos = useMemo(() => ({ slab: new RoundedBoxGeometry(w + 0.08, h + 0.08, 0.05, 2, 0.025), cloth: new THREE.PlaneGeometry(w + 0.04, h + 0.04) }), [w, h])
  useEffect(
    () => () => {
      geos.slab.dispose()
      geos.cloth.dispose()
    },
    [geos]
  )
  const hem = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const x = w / 2 + 0.05
    const y = h / 2 + 0.05
    g.setAttribute('position', new THREE.Float32BufferAttribute([-x, -y, 0, x, -y, 0, x, -y, 0, x, y, 0, x, y, 0, -x, y, 0, -x, y, 0, -x, -y, 0], 3))
    return g
  }, [w, h])
  useEffect(() => () => hem.dispose(), [hem])
  return (
    <group position={position}>
      <mesh geometry={geos.slab} material={R.glass} position={[0, 0, -0.05]} />
      <mesh geometry={geos.cloth} material={R.panelCloth} position={[0, 0, -0.02]} />
      <lineSegments geometry={hem} material={R.hem} position={[0, 0, 0.01]} />
    </group>
  )
}

export type FreeSpots = (n: number, seed: number, rMin: number, rMax: number, gap?: number) => [number, number][]

export function LoomScene({ stations, density, reduced, free }: { stations: StationConfig[]; density: number; reduced: boolean; free: FreeSpots }) {
  const R = res()
  const data = useMemo(() => {
    const rnd = seeded(23)
    const sheets: Sheet[] = []
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const count = Math.round(11 * density) + 5
    for (let i = 0; i < count; i++) {
      // Membranas grandes alrededor y al fondo, a distintas alturas.
      const a = Math.PI * (1.05 + (i / count) * 0.9) + (rnd() - 0.5) * 0.25
      const r = 14 + rnd() * 10
      const s = 5 + rnd() * 5
      sheets.push({
        m: new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, 3 + rnd() * 6, Math.sin(a) * r * 0.9 - 4), q.setFromEuler(e.set((rnd() - 0.5) * 1.2, rnd() * 6, (rnd() - 0.5) * 1.2)).clone(), new THREE.Vector3(s, s * (0.8 + rnd() * 0.6), s)),
        n: 16,
        repeat: 5
      })
    }
    // Otras más pequeñas entre las estaciones.
    for (const [x, z] of free(Math.round(5 * density) + 2, 41, 6.5, 12.5, 3).filter(([, z]) => z < 2.5)) {
      const s = 1.7 + rnd() * 1.2
      sheets.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, 1.4 + rnd() * 1.6, z), q.setFromEuler(e.set((rnd() - 0.5) * 0.8, rnd() * 6, (rnd() - 0.5) * 0.8)).clone(), new THREE.Vector3(s, s * 1.3, s)), n: 12, repeat: 2.5 })
    }
    const built = buildSheets(sheets, Math.max(2, Math.round(4 / density)))
    // Destellos sobre la tela.
    const sparks: number[] = []
    const p = built.surface.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i += Math.max(3, Math.round(11 / density))) sparks.push(p.getX(i), p.getY(i), p.getZ(i))
    // Hilos sueltos que cuelgan entre puntos altos, con gotas de rocío.
    const strands: number[] = []
    const dew: number[] = []
    for (let i = 0; i < Math.round(5 * density) + 3; i++) {
      const a1 = rnd() * Math.PI * 2
      const a2 = a1 + 0.5 + rnd() * 1.2
      const r1 = 7 + rnd() * 8
      const r2 = 7 + rnd() * 8
      const A = new THREE.Vector3(Math.cos(a1) * r1, 4 + rnd() * 4, Math.sin(a1) * r1 * 0.8 - 3)
      const B = new THREE.Vector3(Math.cos(a2) * r2, 4 + rnd() * 4, Math.sin(a2) * r2 * 0.8 - 3)
      const sag = 2.2 + rnd() * 2.2
      const SEG = 30
      let prev = A.clone()
      for (let k = 1; k <= SEG; k++) {
        const t = k / SEG
        const cur = A.clone().lerp(B, t)
        cur.y -= Math.sin(t * Math.PI) * sag
        strands.push(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z)
        if (k % 3 === 0) dew.push(cur.x, cur.y - 0.03, cur.z)
        prev = cur
      }
    }
    const strandGeo = new THREE.BufferGeometry()
    strandGeo.setAttribute('position', new THREE.Float32BufferAttribute(strands, 3))
    const spools = free(Math.round(7 * density) + 4, 83, 4.2, 11.5, 1.2)
    return { ...built, sparks, strandGeo, dew, spools }
  }, [free, density])
  useEffect(
    () => () => {
      data.surface.dispose()
      data.threads.dispose()
      data.hem.dispose()
      data.strandGeo.dispose()
    },
    [data]
  )
  return (
    <>
      <mesh geometry={data.surface} material={R.cloth} frustumCulled={false} />
      <lineSegments geometry={data.threads} material={R.thread} frustumCulled={false} />
      <lineSegments geometry={data.hem} material={R.hem} frustumCulled={false} />
      <lineSegments geometry={data.strandGeo} material={R.strand} frustumCulled={false} />
      <Spools spots={data.spools} />
      <GlowPoints positions={data.beads} color="#f0c27a" intensity={2} size={0.12} flicker={0.6} reduced={reduced} />
      <GlowPoints positions={data.sparks} color="#f0c27a" intensity={1.8} size={0.14} flicker={1} opacity={0.9} reduced={reduced} />
      <GlowPoints positions={data.dew} color="#f4f8ff" intensity={2} size={0.08} flicker={0.7} reduced={reduced} />
    </>
  )
}

/** Cintas del núcleo con la trama de tela y cuentas doradas por los bordes. */
export function WovenBands({ geometry, reduced }: { geometry: THREE.BufferGeometry; reduced: boolean }) {
  const R = res()
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: R.weave, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: glowBlending(), color: new THREE.Color('#ffffff').multiplyScalar(1.2) }), [R])
  useEffect(() => () => mat.dispose(), [mat])
  const beads = useMemo(() => {
    const p = geometry.attributes.position as THREE.BufferAttribute
    const out: number[] = []
    for (let i = 0; i < p.count; i += 12) out.push(p.getX(i), p.getY(i), p.getZ(i))
    return out
  }, [geometry])
  return (
    <>
      <mesh geometry={geometry} material={mat} />
      <GlowPoints positions={beads} color="#f0c27a" intensity={2.2} size={0.1} flicker={0.6} reduced={reduced} />
    </>
  )
}

/** Hilo enrollado en un carrete: vueltas finas de plata y oro. */
const spoolTexture = (): THREE.CanvasTexture => {
  const t = canvasTexture(16, 128, (ctx) => {
    for (let y = 0; y < 128; y += 3) {
      ctx.fillStyle = y % 21 < 3 ? '#e8c27a' : y % 2 ? '#c9d0de' : '#9aa2b4'
      ctx.fillRect(0, y, 16, 2)
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

let S_: { tex: THREE.Texture; body: THREE.BufferGeometry; end: THREE.BufferGeometry; thread: THREE.Material; wood: THREE.Material } | null = null
function spoolRes() {
  if (!S_) {
    const tex = spoolTexture()
    S_ = {
      tex,
      body: new THREE.CylinderGeometry(0.15, 0.15, 0.3, 24, 1, true).translate(0, 0.18, 0),
      end: new THREE.CylinderGeometry(0.22, 0.22, 0.035, 24),
      thread: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.4, emissive: '#3a3a46', emissiveIntensity: 0.4 }),
      wood: new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.6, metalness: 0.2 })
    }
  }
  return S_
}

/** Carretes de hilo por el suelo, alguno tumbado, como en un taller de tejer. */
export function Spools({ spots }: { spots: [number, number][] }) {
  const S = spoolRes()
  return (
    <>
      {spots.map(([x, z], i) => {
        const lying = i % 3 === 2
        return (
          <group key={i} position={[x, lying ? 0.22 : 0, z]} rotation={lying ? [0, i * 1.3, Math.PI / 2] : [0, i * 1.3, 0]}>
            <mesh geometry={S.body} material={S.thread} position={lying ? [0, -0.18, 0] : [0, 0, 0]} />
            <mesh geometry={S.end} material={S.wood} position={[0, lying ? -0.16 : 0.02, 0]} />
            <mesh geometry={S.end} material={S.wood} position={[0, lying ? 0.16 : 0.35, 0]} />
          </group>
        )
      })}
    </>
  )
}
