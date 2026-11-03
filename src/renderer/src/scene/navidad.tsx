// Navidad en el espacio digital: plataformas como regalos con nieve y guirnalda, árboles decorados con luces,
// bolas y estrella, regalos con lazo, faroles, la ciudad con guirnaldas de luces y coronas, nieve que cae y escarcha
// que brilla en el suelo, paneles de cristal con nieve encima y la bola de nieve del núcleo con su árbol.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { StationConfig } from '@shared/types'
import { canvasTexture } from './assets'
import { GlowPoints } from './GlowPoints'
import { cityLayout } from './Ambient'
import {
  TREE_TOP,
  alongHex,
  bowGeometry,
  garlandGeometry,
  lanternGeometry,
  ribbonBandsGeometry,
  snowCapGeometry,
  snowflakeTexture,
  starGeometry,
  treeGeometry,
  treeRadiusAt
} from './festive'
import { registry } from './registry'

const HEX_ROT: [number, number, number] = [Math.PI / 2, 0, Math.PI / 6]

function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Materiales compartidos (solo existen con este tema).
let M: ReturnType<typeof makeMaterials> | null = null
function makeMaterials() {
  return {
    ribbon: new THREE.MeshStandardMaterial({ color: '#b5121b', roughness: 0.42, metalness: 0.1, emissive: '#3a0306', emissiveIntensity: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ color: '#e8c25a', roughness: 0.3, metalness: 0.75, emissive: '#5a3c08', emissiveIntensity: 0.6 }),
    snow: new THREE.MeshStandardMaterial({ color: '#f4f8fc', roughness: 0.92, emissive: '#9fb4d0', emissiveIntensity: 0.22 }),
    pine: new THREE.MeshStandardMaterial({ color: '#173f26', roughness: 0.95, emissive: '#06180c', emissiveIntensity: 0.5 }),
    bauble: new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.65, emissiveIntensity: 0.25 }),
    tree: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: '#0b1f12', emissiveIntensity: 0.45 }),
    star: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd25a').multiplyScalar(2.4), toneMapped: false }),
    gift: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 }),
    giftRibbon: new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.45 }),
    iron: new THREE.MeshStandardMaterial({ color: '#1c1c1e', roughness: 0.5, metalness: 0.7 }),
    flame: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb75e').multiplyScalar(2.2), toneMapped: false }),
    slab: new THREE.MeshStandardMaterial({ color: '#a8c4cc', transparent: true, opacity: 0.3, roughness: 0.12, metalness: 0.25, envMapIntensity: 1.6, depthWrite: false })
  }
}
function mats() {
  if (!M) M = makeMaterials()
  return M
}

const sphere = new THREE.SphereGeometry(1, 14, 10)
const rings = new Map<number, THREE.TorusGeometry>()
const drifts = new Map<number, THREE.TorusGeometry>()
/** Montón de nieve alrededor del borde (núcleo). */
function snowRing(r: number): THREE.TorusGeometry {
  if (!drifts.has(r)) drifts.set(r, new THREE.TorusGeometry(r, 0.16, 8, 6))
  return drifts.get(r)!
}

/** Filo dorado hexagonal (se comparte por radio). */
function hexRing(r: number): THREE.TorusGeometry {
  if (!rings.has(r)) rings.set(r, new THREE.TorusGeometry(r, 0.022, 6, 6))
  return rings.get(r)!
}

interface Inst {
  pos: [number, number, number]
  scale: [number, number, number] | number
  rot?: [number, number, number]
  color?: string
}

function Instances({ geo, mat, items }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: Inst[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useEffect(() => {
    if (!ref.current) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const c = new THREE.Color()
    const s = new THREE.Vector3()
    items.forEach((it, i) => {
      q.setFromEuler(e.set(...(it.rot ?? [0, 0, 0])))
      if (typeof it.scale === 'number') s.setScalar(it.scale)
      else s.set(...it.scale)
      m.compose(new THREE.Vector3(...it.pos), q, s)
      ref.current.setMatrixAt(i, m)
      if (it.color) ref.current.setColorAt(i, c.set(it.color))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [items])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} />
}

const BAUBLES = ['#c4161c', '#e8b84a', '#d8dde6', '#c4161c', '#e8b84a']
const WARM = ['#fff0c0', '#fff0c0', '#ffd27a', '#fff0c0', '#ff9a5a']

function lightColors(n: number, seed: number, intensity: number): number[] {
  const rnd = seeded(seed)
  const out: number[] = []
  const c = new THREE.Color()
  for (let i = 0; i < n; i++) {
    c.set(WARM[Math.floor(rnd() * WARM.length)]).multiplyScalar(intensity)
    out.push(c.r, c.g, c.b)
  }
  return out
}

// ---------- Plataforma vestida de regalo ----------

/**
 * Viste un prisma hexagonal como un regalo: cintas rojas en las caras, filos dorados, guirnalda con bolas y
 * luces bajo una capa de nieve con chorretones, y un lazo delante. r: radio a los vértices; y0..y0+h: el prisma.
 */
export function GiftDressing({ r, y0, h, snowCap = 'slab', bow = true, reduced, seed = 1 }: { r: number; y0: number; h: number; snowCap?: 'slab' | 'ring'; bow?: boolean; reduced: boolean; seed?: number }) {
  const m = mats()
  const top = y0 + h
  const data = useMemo(() => {
    const rnd = seeded(seed * 97 + 5)
    const baubles: Inst[] = alongHex(r + 0.1, top - 0.1, 0.2, 0.08).map((p, i) => ({
      pos: [p.x, p.y, p.z],
      scale: 0.04 + rnd() * 0.03,
      color: BAUBLES[i % BAUBLES.length]
    }))
    const drips: Inst[] = snowCap
      ? alongHex(r + 0.03, top + 0.02, 0.3).map((p) => ({ pos: [p.x, p.y - 0.03, p.z], scale: [0.1 + rnd() * 0.05, 0.07 + rnd() * 0.1, 0.08] }))
      : []
    const lights: number[] = []
    for (const p of alongHex(r + 0.12, top - 0.05, 0.15, 0.1)) lights.push(p.x, p.y, p.z)
    return { baubles, drips, lights, lightCols: lightColors(lights.length / 3, seed, 2.4) }
  }, [r, top, snowCap, seed])
  // El lazo va en la cara que mira a la cámara (a 30°).
  const ap = r * Math.cos(Math.PI / 6)
  return (
    <group>
      <mesh geometry={ribbonBandsGeometry(r, h, 0.26 * Math.min(1.4, r / 1.6))} material={m.ribbon} position={[0, y0, 0]} />
      <mesh geometry={hexRing(r)} material={m.gold} position={[0, top - 0.005, 0]} rotation={HEX_ROT} />
      <mesh geometry={hexRing(r)} material={m.gold} position={[0, y0 + 0.03, 0]} rotation={HEX_ROT} />
      <mesh geometry={garlandGeometry(r + 0.05, 0.085)} material={m.pine} position={[0, top - 0.08, 0]} />
      <Instances geo={sphere} mat={m.bauble} items={data.baubles} />
      <GlowPoints positions={data.lights} colors={data.lightCols} size={0.075} flicker={0.3} reduced={reduced} />
      {snowCap === 'ring' && <mesh geometry={snowRing(r - 0.1)} material={m.snow} position={[0, top + 0.03, 0]} rotation={HEX_ROT} scale={[1, 1, 0.5]} />}
      {snowCap === 'slab' && (
        <>
          <mesh geometry={snowCapGeometry(r + 0.06, 0.1)} material={m.snow} position={[0, top + 0.04, 0]} />
          <Instances geo={sphere} mat={m.snow} items={data.drips} />
        </>
      )}
      {bow && (
        <mesh geometry={bowGeometry()} material={m.ribbon} position={[Math.sin(Math.PI / 6) * (ap + 0.06), top - 0.2, Math.cos(Math.PI / 6) * (ap + 0.06)]} rotation={[0, Math.PI / 6, 0]} scale={0.55} />
      )}
    </group>
  )
}

/** Prisma recto para las plataformas de regalo (en lugar del hexágono que se estrecha). */
export const giftBase = (r: number, h: number): THREE.CylinderGeometry => new THREE.CylinderGeometry(r, r, h, 6, 1)

// ---------- Árboles ----------

interface TreeSpec {
  x: number
  z: number
  s: number
}

/** Árboles decorados: abeto nevado, bolas, una guirnalda de luces en espiral y la estrella. */
export function Trees({ trees, reduced, seed = 3 }: { trees: TreeSpec[]; reduced: boolean; seed?: number }) {
  const m = mats()
  const data = useMemo(() => {
    const rnd = seeded(seed)
    const bodies: Inst[] = []
    const baubles: Inst[] = []
    const stars: Inst[] = []
    const lights: number[] = []
    const halos: number[] = []
    for (const t of trees) {
      bodies.push({ pos: [t.x, 0, t.z], scale: t.s, rot: [0, rnd() * 6, 0] })
      for (let i = 0; i < 16; i++) {
        const y = 0.28 + rnd() * 0.95
        const a = rnd() * Math.PI * 2
        const r = treeRadiusAt(y) * 0.97
        baubles.push({ pos: [t.x + Math.sin(a) * r * t.s, (y - 0.03) * t.s, t.z + Math.cos(a) * r * t.s], scale: (0.035 + rnd() * 0.02) * t.s, color: BAUBLES[i % BAUBLES.length] })
      }
      const n = 54
      for (let i = 0; i < n; i++) {
        const u = i / n
        const y = 0.2 + u * 1.05
        const a = u * Math.PI * 2 * 5.5 + rnd() * 0.3
        const r = treeRadiusAt(y) * 1.02 + 0.02
        lights.push(t.x + Math.sin(a) * r * t.s, y * t.s, t.z + Math.cos(a) * r * t.s)
      }
      const sy = (TREE_TOP + 0.1) * t.s
      stars.push({ pos: [t.x, sy, t.z], scale: 0.12 * t.s })
      halos.push(t.x, sy, t.z)
    }
    return { bodies, baubles, stars, lights, lightCols: lightColors(lights.length / 3, seed + 1, 2.6), halos }
  }, [trees, seed])
  return (
    <>
      <Instances geo={treeGeometry()} mat={m.tree} items={data.bodies} />
      <Instances geo={sphere} mat={m.bauble} items={data.baubles} />
      <Instances geo={starGeometry()} mat={m.star} items={data.stars} />
      <GlowPoints positions={data.lights} colors={data.lightCols} size={0.085} flicker={0.35} reduced={reduced} />
      <GlowPoints positions={data.halos} color="#ffcf6a" intensity={1.6} size={1.1} flicker={0.12} opacity={0.6} reduced={reduced} />
    </>
  )
}

// ---------- Regalos y faroles ----------

const GIFT_PAIRS: [string, string][] = [
  ['#b5121b', '#e8c25a'],
  ['#14532d', '#d12a2a'],
  ['#c9962e', '#b5121b'],
  ['#eef2f5', '#c8262c'],
  ['#1f3f8a', '#e8c25a'],
  ['#5a1a6a', '#e8c25a']
]

export interface GiftSpec {
  x: number
  z: number
  s: number
}

function Gifts({ gifts, seed = 11 }: { gifts: GiftSpec[]; seed?: number }) {
  const m = mats()
  const box = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.04).translate(0, 0.5, 0), [])
  const flat = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), [])
  useEffect(
    () => () => {
      box.dispose()
      flat.dispose()
    },
    [box, flat]
  )
  const data = useMemo(() => {
    const rnd = seeded(seed)
    const boxes: Inst[] = []
    const ribbons: Inst[] = []
    const bows: Inst[] = []
    for (const g of gifts) {
      const w = (0.32 + rnd() * 0.22) * g.s
      const h = (0.26 + rnd() * 0.3) * g.s
      const d = (0.32 + rnd() * 0.22) * g.s
      const yaw = rnd() * Math.PI
      const [c, rc] = GIFT_PAIRS[Math.floor(rnd() * GIFT_PAIRS.length)]
      boxes.push({ pos: [g.x, 0, g.z], scale: [w, h, d], rot: [0, yaw, 0], color: c })
      ribbons.push({ pos: [g.x, 0, g.z], scale: [w + 0.012, h + 0.008, 0.07 * g.s], rot: [0, yaw, 0], color: rc })
      ribbons.push({ pos: [g.x, 0, g.z], scale: [0.07 * g.s, h + 0.01, d + 0.012], rot: [0, yaw, 0], color: rc })
      bows.push({ pos: [g.x, h, g.z], scale: 0.42 * Math.min(w, d) / 0.45, rot: [0, yaw, 0], color: rc })
    }
    return { boxes, ribbons, bows }
  }, [gifts, seed])
  return (
    <>
      <Instances geo={box} mat={m.gift} items={data.boxes} />
      <Instances geo={flat} mat={m.giftRibbon} items={data.ribbons} />
      <Instances geo={bowGeometry()} mat={m.giftRibbon} items={data.bows} />
    </>
  )
}

function Lanterns({ spots, reduced }: { spots: [number, number][]; reduced: boolean }) {
  const m = mats()
  const g = lanternGeometry()
  const items: Inst[] = useMemo(() => spots.map(([x, z]) => ({ pos: [x, 0, z], scale: 1.3 })), [spots])
  const glow = useMemo(() => spots.flatMap(([x, z]) => [x, 0.22 * 1.3, z]), [spots])
  return (
    <>
      <Instances geo={g.frame} mat={m.iron} items={items} />
      <Instances geo={g.glass} mat={m.flame} items={items} />
      <GlowPoints positions={glow} color="#ffb75e" intensity={1.8} size={0.9} flicker={0.25} opacity={0.55} reduced={reduced} />
    </>
  )
}

// ---------- La ciudad: guirnaldas de luces y coronas ----------

function CityDressing({ count, reduced }: { count: number; reduced: boolean }) {
  const m = mats()
  const data = useMemo(() => {
    const rnd = seeded(29)
    const near = cityLayout(count)
      .items.filter((b) => b.z > -26 && Math.abs(b.x) < 26)
      .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
      .slice(0, 46)
    const bulbs: number[] = []
    const wreaths: Inst[] = []
    const bows: Inst[] = []
    for (const b of near) {
      const fz = b.z + b.d / 2 + 0.03
      // Guirnalda de luces en el borde del tejado (frente y el lado que mira a la oficina), algo descolgada.
      const n = Math.max(3, Math.round(b.w / 0.2))
      for (let i = 0; i <= n; i++) {
        const u = i / n
        bulbs.push(b.x - b.w / 2 + u * b.w, b.h - 0.05 - Math.sin(u * Math.PI * Math.max(1, Math.round(b.w))) ** 2 * 0.12, fz)
      }
      const sx = b.x > 0 ? b.x - b.w / 2 - 0.03 : b.x + b.w / 2 + 0.03
      const ns = Math.max(3, Math.round(b.d / 0.25))
      for (let i = 0; i <= ns; i++) bulbs.push(sx, b.h - 0.05, b.z - b.d / 2 + (i / ns) * b.d)
      if (b.h > 1.1 && rnd() < 0.55) {
        const y = Math.min(b.h - 0.45, 1.4)
        wreaths.push({ pos: [b.x, y, fz + 0.03], scale: 1 })
        bows.push({ pos: [b.x, y - 0.27, fz + 0.08], scale: 0.32 })
      }
    }
    return { bulbs, cols: lightColors(bulbs.length / 3, 31, 2.3), wreaths, bows }
  }, [count])
  const wreath = useMemo(() => new THREE.TorusGeometry(0.2, 0.075, 8, 18), [])
  useEffect(() => () => wreath.dispose(), [wreath])
  return (
    <>
      <GlowPoints positions={data.bulbs} colors={data.cols} size={0.09} flicker={0.3} reduced={reduced} />
      <Instances geo={wreath} mat={m.pine} items={data.wreaths} />
      <Instances geo={bowGeometry()} mat={m.ribbon} items={data.bows} />
    </>
  )
}

// ---------- Escena ----------

/** Sitios libres en la oficina (fuera de la ciudad, del núcleo, de las estaciones y de las zonas). */
export type FreeSpots = (n: number, seed: number, rMin: number, rMax: number, gap?: number) => [number, number][]

export function ChristmasScene({ stations, density, reduced, cityCount, free }: { stations: StationConfig[]; density: number; reduced: boolean; cityCount: number; free: FreeSpots }) {
  const data = useMemo(() => {
    const rnd = seeded(77)
    const trees: TreeSpec[] = free(Math.round(9 * density) + 5, 5, 6.8, 13, 2.6).map(([x, z]) => ({ x, z, s: 1.5 + rnd() * 0.9 }))
    // Un árbol grande al fondo, como el de la plaza.
    trees.push({ x: -2.4, z: -8.9, s: 2.9 })
    const gifts: GiftSpec[] = []
    const outward = (st: StationConfig) => Math.atan2(st.position[1], st.position[0])
    for (const st of stations) {
      const o = outward(st)
      for (const [da, rr, s] of [
        [0.7, 2.05, 1],
        [1.05, 2.3, 0.8],
        [-0.85, 2.1, 0.9]
      ])
        gifts.push({ x: st.position[0] + Math.cos(o + da) * rr, z: st.position[1] + Math.sin(o + da) * rr, s })
    }
    for (const t of trees.slice(0, 8)) {
      gifts.push({ x: t.x + 0.75 * t.s * 0.6, z: t.z + 0.5, s: 0.9 }, { x: t.x - 0.5, z: t.z + 0.75 * t.s * 0.55, s: 0.75 })
    }
    for (const [x, z] of free(Math.round(8 * density) + 3, 9, 4.2, 11, 1)) gifts.push({ x, z, s: 1 + rnd() * 0.3 })
    const lanterns: [number, number][] = stations.map((st) => {
      const o = outward(st) - 0.6
      return [st.position[0] + Math.cos(o) * 2.25, st.position[1] + Math.sin(o) * 2.25]
    })
    lanterns.push(...free(Math.round(5 * density) + 3, 14, 3.9, 9, 1.5))
    const snow: number[] = []
    for (let i = 0; i < Math.round(1100 * density); i++) snow.push((rnd() - 0.5) * 46, rnd() * 14, -30 + rnd() * 40)
    const frost: number[] = []
    for (let i = 0; i < Math.round(500 * density); i++) {
      const a = rnd() * Math.PI * 2
      const r = Math.sqrt(rnd()) * 15
      frost.push(Math.cos(a) * r, 0.03, Math.sin(a) * r * 0.85 - 1)
    }
    return { trees, gifts, lanterns, snow, frost }
  }, [stations, density, free])
  return (
    <>
      <Trees trees={data.trees} reduced={reduced} />
      <Gifts gifts={data.gifts} />
      <Lanterns spots={data.lanterns} reduced={reduced} />
      <ChristmasExtras stations={stations} trees={data.trees} free={free} />
      <CityDressing count={cityCount} reduced={reduced} />
      <GlowPoints positions={data.snow} color="#ffffff" size={0.075} fall={0.55} fallHeight={14} fallBase={0} sway={0.35} opacity={0.9} reduced={reduced} />
      <GlowPoints positions={data.frost} color="#dfefff" intensity={1.5} size={0.04} flicker={1} opacity={0.9} reduced={reduced} />
    </>
  )
}

// ---------- Paneles de las zonas ----------

/** Losa de cristal detrás del panel, nieve encima con chorretones y un lazo en la esquina. */
export function SnowPanel({ size, position }: { size: [number, number]; position: [number, number, number] }) {
  const m = mats()
  const [w, h] = size
  const geos = useMemo(
    () => ({
      slab: new RoundedBoxGeometry(w + 0.1, h + 0.1, 0.08, 2, 0.04),
      cap: new RoundedBoxGeometry(w + 0.18, 0.15, 0.2, 3, 0.07)
    }),
    [w, h]
  )
  useEffect(
    () => () => {
      geos.slab.dispose()
      geos.cap.dispose()
    },
    [geos]
  )
  const drips: Inst[] = useMemo(() => {
    const rnd = seeded(Math.round(w * 100 + h * 10))
    const n = Math.max(3, Math.round(w / 0.3))
    return Array.from({ length: n }, (_, i): Inst => ({
      pos: [-w / 2 + ((i + 0.5) / n) * w, h / 2 + 0.02, 0.09],
      scale: [0.07 + rnd() * 0.05, 0.06 + rnd() * 0.08, 0.05]
    }))
  }, [w, h])
  const [x, y, z] = position
  return (
    <group position={[x, y, z]}>
      <mesh geometry={geos.slab} material={m.slab} position={[0, 0, -0.06]} />
      <mesh geometry={geos.cap} material={m.snow} position={[0, h / 2 + 0.09, -0.02]} />
      <Instances geo={sphere} mat={m.snow} items={drips} />
      <mesh geometry={bowGeometry()} material={m.ribbon} position={[w / 2 - 0.05, -h / 2 + 0.12, 0.05]} scale={0.5} />
    </group>
  )
}

// ---------- Núcleo: bola de nieve ----------

const GLOBE_TREE_S = 1.55
const GLOBE_TREE_Y = -1.15

/** Dentro de la bola: un árbol decorado con su estrella, copos que flotan y nieve que cae; cristal que refleja. */
export function GlobeInside({ R, reduced }: { R: number; reduced: boolean }) {
  const m = mats()
  const parts = useMemo(() => {
    const flakeMap = snowflakeTexture()
    return {
      flakeMap,
      flakeMat: new THREE.SpriteMaterial({ map: flakeMap, color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 3, depthWrite: false }),
      glassGeo: new THREE.SphereGeometry(R * 1.005, 48, 32),
      pile: new THREE.CylinderGeometry(R * 0.69, R * 0.5, 0.5, 32)
    }
  }, [R])
  useEffect(
    () => () => {
      parts.flakeMap.dispose()
      parts.flakeMat.dispose()
      parts.glass.dispose()
      parts.glassGeo.dispose()
      parts.pile.dispose()
    },
    [parts]
  )
  const tree = useMemo(() => [{ x: 0, z: 0, s: GLOBE_TREE_S }], [])
  const flakes = useRef<THREE.Sprite[]>([])
  const flakeSpecs = useMemo(() => {
    const rnd = seeded(5)
    return Array.from({ length: 9 }, () => {
      const a = rnd() * Math.PI * 2
      const r = 0.7 + rnd() * 0.6
      return { a, r, y: -0.5 + rnd() * 1.6, s: 0.2 + rnd() * 0.16, sp: 0.15 + rnd() * 0.2, ph: rnd() * 6 }
    })
  }, [])
  const snow = useMemo(() => {
    const pos: number[] = []
    for (let i = 0; i < 90; i++) {
      const a = i * 2.39996
      const r = Math.sqrt((i * 0.618) % 1) * R * 0.82
      pos.push(Math.cos(a) * r, -1.0 + ((i * 0.377) % 1) * 2.4, Math.sin(a) * r)
    }
    return pos
  }, [R])
  useFrame(() => {
    const t = registry.time * (reduced ? 0.25 : 1)
    flakes.current.forEach((f, i) => {
      if (!f) return
      const s = flakeSpecs[i]
      const a = s.a + t * s.sp
      f.position.set(Math.cos(a) * s.r, s.y + Math.sin(t * 0.6 + s.ph) * 0.15, Math.sin(a) * s.r)
      f.material.rotation = t * 0.3 + s.ph
    })
  })
  return (
    <>
      <mesh geometry={parts.glassGeo} material={parts.glass} />
      <mesh geometry={parts.pile} material={m.snow} position={[0, -1.25, 0]} />
      <group position={[0, GLOBE_TREE_Y, 0]}>
        <Trees trees={tree} reduced={reduced} seed={41} />
      </group>
      {flakeSpecs.map((s, i) => (
        <sprite
          key={i}
          ref={(f) => {
            if (f) flakes.current[i] = f
          }}
          material={parts.flakeMat}
          scale={[s.s, s.s, 1]}
        />
      ))}
      <GlowPoints positions={snow} color="#ffffff" size={0.05} fall={0.3} fallHeight={2.4} fallBase={-1.0} sway={0.08} opacity={0.9} reduced={reduced} />
    </>
  )
}

// ---------- Más detalles: muñecos de nieve, bastones de caramelo y montones de nieve ----------

const caneTexture = (): THREE.CanvasTexture => {
  const t = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#f6f6f6'
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = '#d0141e'
    for (let i = -2; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(i * 24, 64)
      ctx.lineTo(i * 24 + 12, 64)
      ctx.lineTo(i * 24 + 12 + 64, 0)
      ctx.lineTo(i * 24 + 64, 0)
      ctx.fill()
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(10, 1)
  return t
}

let X_: ReturnType<typeof makeExtras> | null = null
function makeExtras() {
  const cane = caneTexture()
  // Bastón: subida recta y gancho.
  const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(0, 0.82, 0)]
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * Math.PI
    pts.push(new THREE.Vector3(0.12 - Math.cos(a) * 0.12, 0.82 + Math.sin(a) * 0.12, 0))
  }
  pts.push(new THREE.Vector3(0.24, 0.72, 0))
  return {
    cane,
    caneGeo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.035, 10, false),
    caneMat: new THREE.MeshStandardMaterial({ map: cane, roughness: 0.3, metalness: 0.05, emissive: '#3a0306', emissiveIntensity: 0.25 }),
    coal: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.6 }),
    carrot: new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.6, emissive: '#5a2000', emissiveIntensity: 0.4 }),
    hat: new THREE.MeshStandardMaterial({ color: '#16161a', roughness: 0.45, metalness: 0.2 }),
    nose: new THREE.ConeGeometry(0.05, 0.26, 10).rotateX(Math.PI / 2),
    crown: new THREE.CylinderGeometry(0.17, 0.17, 0.26, 18),
    brim: new THREE.CylinderGeometry(0.28, 0.28, 0.03, 22),
    scarf: new THREE.TorusGeometry(0.27, 0.06, 8, 22).rotateX(Math.PI / 2)
  }
}
function extras() {
  if (!X_) X_ = makeExtras()
  return X_
}

/** Muñeco de nieve con ojos y botones de carbón, nariz de zanahoria, sombrero de copa y bufanda. */
function Snowman({ x, z, s, yaw }: { x: number; z: number; s: number; yaw: number }) {
  const m = mats()
  const X = extras()
  const dots: Inst[] = useMemo(
    () => [
      { pos: [-0.07, 1.42, 0.2], scale: 0.025 },
      { pos: [0.07, 1.42, 0.2], scale: 0.025 },
      { pos: [0, 1.0, 0.33], scale: 0.03 },
      { pos: [0, 0.88, 0.34], scale: 0.03 },
      { pos: [0, 0.6, 0.45], scale: 0.035 }
    ],
    []
  )
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]} scale={s}>
      <mesh geometry={sphere} material={m.snow} position={[0, 0.42, 0]} scale={[0.48, 0.44, 0.48]} />
      <mesh geometry={sphere} material={m.snow} position={[0, 0.98, 0]} scale={0.34} />
      <mesh geometry={sphere} material={m.snow} position={[0, 1.4, 0]} scale={0.23} />
      <Instances geo={sphere} mat={X.coal} items={dots} />
      <mesh geometry={X.nose} material={X.carrot} position={[0, 1.38, 0.32]} />
      <mesh geometry={X.brim} material={X.hat} position={[0, 1.6, 0]} />
      <mesh geometry={X.crown} material={X.hat} position={[0, 1.74, 0]} />
      <mesh geometry={X.scarf} material={m.ribbon} position={[0, 1.2, 0]} />
    </group>
  )
}

/** Muñecos de nieve, bastones de caramelo junto a las estaciones y montones de nieve al pie de los árboles. */
export function ChristmasExtras({ stations, trees, free }: { stations: StationConfig[]; trees: { x: number; z: number; s: number }[]; free: FreeSpots }) {
  const m = mats()
  const X = extras()
  const data = useMemo(() => {
    const rnd = seeded(91)
    const snowmen = free(2, 61, 5, 10, 3).map(([x, z]) => ({ x, z, s: 1.05 + rnd() * 0.3, yaw: Math.atan2(-x, 22 - z) }))
    const canes: Inst[] = []
    for (const st of stations) {
      const o = Math.atan2(st.position[1], st.position[0]) + Math.PI
      for (const side of [-0.42, 0.42]) {
        const a = o + side
        canes.push({ pos: [st.position[0] + Math.cos(a) * 2.0, 0, st.position[1] + Math.sin(a) * 2.0], scale: 1.1, rot: [0, -a + (side > 0 ? 0 : Math.PI), 0] })
      }
    }
    // Montones de nieve: varias bolas aplastadas juntas, al pie de los árboles y sueltas.
    const piles: Inst[] = []
    const heap = (x: number, z: number, r: number) => {
      for (let k = 0; k < 4; k++) {
        const a = rnd() * Math.PI * 2
        const d = r * 0.45 * rnd()
        const s = r * (0.45 + rnd() * 0.35)
        piles.push({ pos: [x + Math.cos(a) * d, 0, z + Math.sin(a) * d], scale: [s, s * (0.32 + rnd() * 0.2), s * (0.8 + rnd() * 0.3)] })
      }
    }
    for (const t of trees) heap(t.x, t.z, 0.55 * t.s)
    for (const [x, z] of free(8, 71, 4.5, 12, 1.4)) heap(x, z, 0.35 + rnd() * 0.3)
    return { snowmen, canes, piles }
  }, [stations, trees, free])
  return (
    <>
      {data.snowmen.map((s, i) => (
        <Snowman key={i} {...s} />
      ))}
      <Instances geo={X.caneGeo} mat={X.caneMat} items={data.canes} />
      <Instances geo={sphere} mat={m.snow} items={data.piles} />
    </>
  )
}
