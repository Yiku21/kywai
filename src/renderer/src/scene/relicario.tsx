// Relicario en el espacio digital: pedestales de vidrio escalonado con filos de oro y luz debajo, láminas de cristal
// con marco dorado por el suelo, obeliscos de cristal, polvo de oro flotando, anillos de oro alrededor del núcleo y
// paneles de vidrio enmarcados en oro.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { StationConfig } from '@shared/types'
import { canvasTexture, glowTexture } from './assets'
import { GlowPoints } from './GlowPoints'

function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Inst {
  pos: [number, number, number]
  scale: [number, number, number] | number
  rot?: [number, number, number]
}

function Instances({ geo, mat, items }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: Inst[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useEffect(() => {
    if (!ref.current) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3()
    items.forEach((it, i) => {
      q.setFromEuler(e.set(...(it.rot ?? [0, 0, 0])))
      if (typeof it.scale === 'number') s.setScalar(it.scale)
      else s.set(...it.scale)
      m.compose(new THREE.Vector3(...it.pos), q, s)
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [items])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} />
}

/** Lámina de cristal: transparente, con marco dorado y unas líneas de texto. */
const cardTexture = (): THREE.CanvasTexture =>
  canvasTexture(128, 176, (ctx) => {
    ctx.fillStyle = 'rgba(220,228,240,0.16)'
    ctx.fillRect(0, 0, 128, 176)
    ctx.strokeStyle = 'rgba(255,214,140,1)'
    ctx.lineWidth = 6
    ctx.strokeRect(4, 4, 120, 168)
    ctx.fillStyle = 'rgba(255,240,210,0.55)'
    for (let i = 0; i < 6; i++) ctx.fillRect(20, 34 + i * 20, i % 3 === 2 ? 50 : 86, 5)
  })

let R_: ReturnType<typeof makeRes> | null = null
function makeRes() {
  const card = cardTexture()
  return {
    card,
    glass: new THREE.MeshPhysicalMaterial({ color: '#d6deea', roughness: 0.04, metalness: 0.05, transparent: true, opacity: 0.32, envMapIntensity: 2.6, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false }),
    gold: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(1.1), toneMapped: false }),
    goldSoft: new THREE.MeshStandardMaterial({ color: '#e8c27a', roughness: 0.25, metalness: 0.9, emissive: '#6a4a10', emissiveIntensity: 0.6 }),
    under: new THREE.MeshBasicMaterial({ map: glowTexture, color: '#ffcf7a', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
    cardMat: new THREE.MeshStandardMaterial({ map: card, transparent: true, roughness: 0.05, metalness: 0.2, emissive: '#ffd890', emissiveMap: card, emissiveIntensity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    obelisk: new THREE.MeshPhysicalMaterial({ color: '#cfd8e8', roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.28, envMapIntensity: 3, flatShading: true, depthWrite: false }),
    cardGeo: new THREE.PlaneGeometry(0.34, 0.46).translate(0, 0.23, 0),
    obeliskGeo: new THREE.CylinderGeometry(0.02, 0.22, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0),
    obeliskEdges: new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.02, 0.22, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0)),
    ring: new THREE.TorusGeometry(1, 0.014, 6, 120).rotateX(Math.PI / 2),
    disc: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  }
}
function res() {
  if (!R_) R_ = makeRes()
  return R_
}

/** Material de vidrio de los pedestales. */
export const glassMaterial = (): THREE.Material => res().glass

/** Pedestal de tres discos de vidrio escalonados (radio exterior r, de y0 a y0 + h). */
const tiers = new Map<string, THREE.BufferGeometry>()
export function glassTiers(r: number, y0: number, h: number): THREE.BufferGeometry {
  const key = `${r}:${y0}:${h}`
  if (!tiers.has(key)) {
    const t = h / 3
    const prof: [number, number][] = [
      [0, 0],
      [r, 0],
      [r, t * 0.92],
      [r * 0.9, t],
      [r * 0.9, t * 1.95],
      [r * 0.8, t * 2],
      [r * 0.8, t * 2.95],
      [r * 0.74, t * 3],
      [0, t * 3]
    ]
    tiers.set(key, new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y0 + y)), 64))
  }
  return tiers.get(key)!
}

/** Filos de oro en cada escalón y luz dorada debajo del pedestal. */
export function GlassDressing({ r, y0, h }: { r: number; y0: number; h: number }) {
  const R = res()
  const t = h / 3
  const rings: Inst[] = useMemo(
    () => [
      { pos: [0, y0 + t * 0.92, 0], scale: [r, 1, r] },
      { pos: [0, y0 + t * 1.95, 0], scale: [r * 0.9, 1, r * 0.9] },
      { pos: [0, y0 + t * 2.95, 0], scale: [r * 0.8, 1, r * 0.8] }
    ],
    [r, y0, t]
  )
  return (
    <group>
      <Instances geo={R.ring} mat={R.gold} items={rings} />
      <mesh geometry={R.disc} material={R.under} position={[0, y0 + 0.012, 0]} scale={r * 3.4} />
    </group>
  )
}

/** Panel de vidrio enmarcado en oro, con un poco de grosor. */
export function RelicPanel({ size, position }: { size: [number, number]; position: [number, number, number] }) {
  const R = res()
  const [w, h] = size
  const slab = useMemo(() => new RoundedBoxGeometry(w + 0.08, h + 0.08, 0.06, 2, 0.03), [w, h])
  useEffect(() => () => slab.dispose(), [slab])
  const bars: Inst[] = useMemo(() => {
    const t = 0.035
    return [
      { pos: [0, h / 2 + 0.04, 0.01], scale: [w + 0.12, t, t] },
      { pos: [0, -h / 2 - 0.04, 0.01], scale: [w + 0.12, t, t] },
      { pos: [-w / 2 - 0.04, 0, 0.01], scale: [t, h + 0.12, t] },
      { pos: [w / 2 + 0.04, 0, 0.01], scale: [t, h + 0.12, t] }
    ]
  }, [w, h])
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  useEffect(() => () => box.dispose(), [box])
  return (
    <group position={position}>
      <mesh geometry={slab} material={R.glass} position={[0, 0, -0.05]} />
      <Instances geo={box} mat={R.goldSoft} items={bars} />
    </group>
  )
}

export type FreeSpots = (n: number, seed: number, rMin: number, rMax: number, gap?: number) => [number, number][]

export function RelicScene({ stations, density, reduced, free }: { stations: StationConfig[]; density: number; reduced: boolean; free: FreeSpots }) {
  const R = res()
  const data = useMemo(() => {
    const rnd = seeded(13)
    const cards: Inst[] = []
    const glints: number[] = []
    for (const [x, z] of free(Math.round(34 * density) + 10, 3, 4.2, 12.5, 0.7)) {
      const s = 0.8 + rnd() * 0.8
      cards.push({ pos: [x, 0, z], scale: s, rot: [(rnd() - 0.5) * 0.15, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.12] })
      glints.push(x, 0.47 * s, z)
    }
    // Obeliscos de cristal, algunos altos.
    const obelisks: Inst[] = free(Math.round(9 * density) + 4, 17, 6, 12.5, 2).map(([x, z]) => {
      const hgt = 1.2 + rnd() * 2.4
      return { pos: [x, 0, z], scale: [0.8 + rnd() * 0.6, hgt, 0.8 + rnd() * 0.6], rot: [0, rnd() * 1.5, 0] }
    })
    const tips = obelisks.flatMap((o) => [o.pos[0], (o.scale as number[])[1], o.pos[2]])
    // Polvo de oro que sube despacio por todo el espacio.
    const dust: number[] = []
    for (let i = 0; i < Math.round(420 * density) + 80; i++) {
      const a = rnd() * Math.PI * 2
      const r = Math.sqrt(rnd()) * 14
      dust.push(Math.cos(a) * r, rnd() * 7, Math.sin(a) * r * 0.85 - 1)
    }
    // Anillos de oro alrededor del núcleo, a distintas alturas.
    const rings: Inst[] = [
      { pos: [0, 0.5, 0], scale: [3.05, 1, 3.05] },
      { pos: [0, 0.12, 0], scale: [3.6, 1, 3.6] }
    ]
    return { cards, glints, obelisks, tips, dust, rings }
  }, [free, density])
  return (
    <>
      <Instances geo={R.cardGeo} mat={R.cardMat} items={data.cards} />
      <Instances geo={R.obeliskGeo} mat={R.obelisk} items={data.obelisks} />
      <ObeliskEdges items={data.obelisks} />
      <Instances geo={R.ring} mat={R.gold} items={data.rings} />
      <LightShaft reduced={reduced} />
      <GlowPoints positions={data.glints} color="#ffe2a0" intensity={1.8} size={0.18} flicker={0.8} opacity={0.8} reduced={reduced} />
      <GlowPoints positions={data.tips} color="#fff1c9" intensity={2.4} size={0.35} flicker={0.4} reduced={reduced} />
      <GlowPoints positions={data.dust} color="#ffd890" intensity={1.6} size={0.045} fall={-0.12} fallHeight={7} fallBase={0} sway={0.4} flicker={0.9} reduced={reduced} />
    </>
  )
}

/** Aristas doradas de los obeliscos (líneas: una malla por obelisco, son pocos). */
function ObeliskEdges({ items }: { items: Inst[] }) {
  const R = res()
  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(1.4), transparent: true, opacity: 0.85, toneMapped: false }), [])
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <>
      {items.map((o, i) => (
        <lineSegments key={i} geometry={R.obeliskEdges} material={mat} position={o.pos} rotation={o.rot} scale={o.scale as [number, number, number]} />
      ))}
    </>
  )
}

/** Haz de luz dorada que sube desde la gema del núcleo, más intenso abajo. */
export function LightShaft({ reduced }: { reduced: boolean }) {
  const parts = useMemo(() => {
    const grad = canvasTexture(4, 128, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 128)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.7, 'rgba(255,255,255,0.55)')
      g.addColorStop(1, 'rgba(255,255,255,1)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 4, 128)
    })
    return {
      grad,
      geo: new THREE.CylinderGeometry(2.2, 0.5, 7, 40, 1, true).translate(0, 3.5 + 3.4, 0),
      mat: new THREE.MeshBasicMaterial({ color: '#ffd890', alphaMap: grad, transparent: true, opacity: reduced ? 0.06 : 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    }
  }, [reduced])
  useEffect(
    () => () => {
      parts.grad.dispose()
      parts.geo.dispose()
      parts.mat.dispose()
    },
    [parts]
  )
  return <mesh geometry={parts.geo} material={parts.mat} />
}
