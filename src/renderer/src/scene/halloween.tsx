// Halloween en el espacio digital: adoquines con hojas secas y niebla morada, pedestales de piedra tallada con velas
// y telarañas, lápidas como paneles (con un cuervo), calabazas, calaveras, fuegos fatuos que suben, una ciudad
// gótica con agujas y estandartes, la luna tras ella y murciélagos.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { StationConfig } from '@shared/types'
import { canvasTexture, glowTexture } from './assets'
import { GlowPoints } from './GlowPoints'
import { cityLayout } from './Ambient'
import { pumpkinPoint } from './coreShapes'
import { registry } from './registry'

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

// ---------- Texturas ----------

const stoneTexture = (): THREE.CanvasTexture => {
  const t = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#17121c'
    ctx.fillRect(0, 0, 256, 256)
    const rnd = seeded(4)
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? 32 : 0
      for (let col = -1; col < 5; col++) {
        const x = col * 64 + off + 2
        const y = row * 32 + 2
        const l = 34 + rnd() * 22
        ctx.fillStyle = `rgb(${l + 6}, ${l - 2}, ${l + 12})`
        ctx.fillRect(x, y, 60, 28)
        // Musgo y desgaste.
        for (let k = 0; k < 18; k++) {
          ctx.fillStyle = `rgba(${rnd() < 0.3 ? '60,70,40' : '10,8,14'},${0.15 + rnd() * 0.25})`
          ctx.fillRect(x + rnd() * 58, y + rnd() * 26, 2 + rnd() * 6, 1 + rnd() * 3)
        }
      }
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

const cobwebTexture = (): THREE.CanvasTexture =>
  canvasTexture(256, 256, (ctx) => {
    ctx.strokeStyle = 'rgba(235,235,245,0.75)'
    ctx.lineWidth = 1.6
    // Esquina superior izquierda: radios y vueltas.
    const n = 7
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(a) * 250, Math.sin(a) * 250)
      ctx.stroke()
    }
    for (let r = 30; r < 250; r += 28) {
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * (Math.PI / 2)
        const rr = r + Math.sin(i * 2.3 + r) * 4
        const x = Math.cos(a) * rr
        const y = Math.sin(a) * rr
        if (i === 0) ctx.moveTo(x, y)
        else ctx.quadraticCurveTo(Math.cos(a - 0.11) * (rr - 8), Math.sin(a - 0.11) * (rr - 8), x, y)
      }
      ctx.stroke()
    }
  })

const bannerTexture = (): THREE.CanvasTexture =>
  canvasTexture(128, 320, (ctx) => {
    ctx.fillStyle = '#2a0f33'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(128, 0)
    ctx.lineTo(128, 300)
    ctx.lineTo(64, 250)
    ctx.lineTo(0, 300)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#ff8a1f'
    ctx.lineWidth = 5
    ctx.stroke()
    // Calabaza con cara.
    ctx.fillStyle = '#ff8a1f'
    ctx.beginPath()
    ctx.ellipse(64, 130, 40, 34, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2a0f33'
    for (const x of [48, 80]) {
      ctx.beginPath()
      ctx.moveTo(x, 112)
      ctx.lineTo(x + 9, 128)
      ctx.lineTo(x - 9, 128)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.moveTo(38, 140)
    ctx.quadraticCurveTo(64, 166, 90, 140)
    ctx.quadraticCurveTo(64, 152, 38, 140)
    ctx.fill()
    ctx.fillStyle = '#4d5a26'
    ctx.fillRect(60, 88, 8, 12)
  })

const crowTexture = (): THREE.CanvasTexture =>
  canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    // Cuervo posado de perfil, mirando a la izquierda.
    ctx.ellipse(140, 150, 62, 40, -0.25, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(86, 104, 28, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(64, 98)
    ctx.lineTo(30, 110)
    ctx.lineTo(66, 114)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(190, 160)
    ctx.lineTo(250, 196)
    ctx.lineTo(236, 206)
    ctx.lineTo(180, 182)
    ctx.fill()
    ctx.fillRect(120, 186, 6, 44)
    ctx.fillRect(146, 186, 6, 44)
  })

const moonTexture = (): THREE.CanvasTexture =>
  canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(110, 110, 10, 128, 128, 120)
    g.addColorStop(0, '#fff6d8')
    g.addColorStop(0.85, '#f2d9a0')
    g.addColorStop(1, 'rgba(242,217,160,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(128, 128, 120, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(180,150,100,0.28)'
    for (const [x, y, r] of [
      [90, 100, 22],
      [160, 80, 14],
      [150, 160, 28],
      [80, 170, 12],
      [190, 130, 10]
    ]) {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  })

const batTexture = (): THREE.CanvasTexture =>
  canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(128, 50)
    ctx.bezierCurveTo(160, 20, 210, 18, 250, 40)
    ctx.quadraticCurveTo(222, 58, 214, 84)
    ctx.quadraticCurveTo(196, 66, 178, 84)
    ctx.quadraticCurveTo(160, 68, 140, 90)
    ctx.quadraticCurveTo(128, 104, 116, 90)
    ctx.quadraticCurveTo(96, 68, 78, 84)
    ctx.quadraticCurveTo(60, 66, 42, 84)
    ctx.quadraticCurveTo(34, 58, 6, 40)
    ctx.bezierCurveTo(46, 18, 96, 20, 128, 50)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(116, 52)
    ctx.lineTo(120, 34)
    ctx.lineTo(126, 48)
    ctx.lineTo(130, 48)
    ctx.lineTo(136, 34)
    ctx.lineTo(140, 52)
    ctx.fill()
  })

// ---------- Geometrías y materiales (una vez, solo con este tema) ----------

function pumpkinGeometry(): THREE.BufferGeometry {
  const R = 0.32
  const g = new THREE.SphereGeometry(R, 24, 14)
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    pumpkinPoint(v.fromBufferAttribute(p, i), R)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  g.translate(0, R * 0.8, 0)
  return g
}

/** Pedestal redondo de piedra tallada (perfil con molduras). Radio exterior r, de y0 a y0 + h. */
function pedestalGeometry(r: number, y0: number, h: number): THREE.BufferGeometry {
  const k = h / 0.52
  const prof: [number, number][] = [
    [0, 0],
    [1.0, 0],
    [1.0, 0.1],
    [0.95, 0.13],
    [0.93, 0.36],
    [0.98, 0.39],
    [0.98, 0.47],
    [0.9, 0.5],
    [0.88, 0.52],
    [0, 0.52]
  ]
  const g = new THREE.LatheGeometry(
    prof.map(([x, y]) => new THREE.Vector2(x * r, y0 + y * k)),
    48
  )
  // Las uvs de la piedra: alrededor y a lo alto.
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 3, uv.getY(i) * 1.2)
  return g
}

let R_: ReturnType<typeof makeRes> | null = null
function makeRes() {
  const stone = stoneTexture()
  const web = cobwebTexture()
  const banner = bannerTexture()
  const crow = crowTexture()
  const moon = moonTexture()
  const bat = batTexture()
  const skull = mergeGeometries(
    [
      new THREE.SphereGeometry(0.16, 16, 12).scale(1, 0.92, 1.1).translate(0, 0.17, 0),
      new THREE.BoxGeometry(0.17, 0.08, 0.14).translate(0, 0.06, 0.05)
    ].map((g) => g.toNonIndexed())
  )
  const sockets = mergeGeometries(
    [-1, 1].map((s) => new THREE.SphereGeometry(0.045, 8, 6).translate(s * 0.06, 0.18, 0.15).toNonIndexed())
  )
  return {
    stone,
    web,
    banner,
    crow,
    moon,
    bat,
    stoneMat: new THREE.MeshStandardMaterial({ map: stone, color: '#a89cb4', roughness: 0.92, metalness: 0.05, emissive: '#1a0c26', emissiveIntensity: 0.4 }),
    glowRing: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a1f').multiplyScalar(1.8), toneMapped: false }),
    webMat: new THREE.MeshBasicMaterial({ map: web, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
    bannerMat: new THREE.MeshStandardMaterial({ map: banner, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, emissive: '#ff8a1f', emissiveMap: banner, emissiveIntensity: 0.25 }),
    crowMat: new THREE.MeshBasicMaterial({ map: crow, color: '#08060a', transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }),
    moonMat: new THREE.MeshBasicMaterial({ map: moon, transparent: true, depthWrite: false, fog: false, toneMapped: false, color: new THREE.Color('#ffffff').multiplyScalar(1.15) }),
    moonGlow: new THREE.SpriteMaterial({ map: glowTexture, color: '#ffcf80', transparent: true, opacity: 0.26, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
    batMat: new THREE.MeshBasicMaterial({ map: bat, color: '#140a1c', transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    pumpkinMat: new THREE.MeshStandardMaterial({ color: '#e2701c', roughness: 0.55, emissive: '#ff5a00', emissiveIntensity: 0.28 }),
    stemMat: new THREE.MeshStandardMaterial({ color: '#4d5a26', roughness: 0.8 }),
    candleMat: new THREE.MeshStandardMaterial({ color: '#efe3c8', roughness: 0.7, emissive: '#ffcf8a', emissiveIntensity: 0.3 }),
    boneMat: new THREE.MeshStandardMaterial({ color: '#d9cfbd', roughness: 0.8, emissive: '#3a2a20', emissiveIntensity: 0.3 }),
    darkMat: new THREE.MeshBasicMaterial({ color: '#050307' }),
    leafMat: new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }),
    spireMat: new THREE.MeshStandardMaterial({ color: '#140e1a', roughness: 0.75, metalness: 0.2, emissive: '#1a0a24', emissiveIntensity: 0.6 }),
    mistMat: new THREE.SpriteMaterial({ map: glowTexture, color: '#7a48b0', transparent: true, opacity: 0.16, depthWrite: false }),
    pumpkin: pumpkinGeometry(),
    stem: new THREE.CylinderGeometry(0.03, 0.05, 0.14, 6).translate(0, 0.07, 0),
    candle: new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0),
    skull,
    sockets,
    leaf: new THREE.PlaneGeometry(0.16, 0.11).rotateX(-Math.PI / 2),
    spire: new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
    plane: new THREE.PlaneGeometry(1, 1),
    ring: new THREE.TorusGeometry(1, 0.02, 6, 72).rotateX(Math.PI / 2)
  }
}
function res() {
  if (!R_) R_ = makeRes()
  return R_
}

/** Material de piedra de los pedestales (para la base de las estaciones y del núcleo). */
export const stoneMaterial = (): THREE.Material => res().stoneMat

const pedestals = new Map<string, THREE.BufferGeometry>()
/** Pedestal de piedra con molduras (se comparte por medidas). */
export function pedestal(r: number, y0: number, h: number): THREE.BufferGeometry {
  const key = `${r}:${y0}:${h}`
  if (!pedestals.has(key)) pedestals.set(key, pedestalGeometry(r, y0, h))
  return pedestals.get(key)!
}

// ---------- Velas ----------

interface Candle {
  x: number
  y: number
  z: number
  h: number
  w: number
}

function candleCluster(rnd: () => number, x: number, z: number, n: number, spread: number, y = 0): Candle[] {
  return Array.from({ length: n }, () => {
    const a = rnd() * Math.PI * 2
    const r = spread * (0.25 + rnd() * 0.75)
    return { x: x + Math.cos(a) * r, y, z: z + Math.sin(a) * r, h: 0.16 + rnd() * 0.42, w: 0.045 + rnd() * 0.035 }
  })
}

function Candles({ candles, reduced }: { candles: Candle[]; reduced: boolean }) {
  const r = res()
  const items: Inst[] = useMemo(() => candles.map((c) => ({ pos: [c.x, c.y, c.z], scale: [c.w, c.h, c.w] })), [candles])
  const flames = useMemo(() => candles.flatMap((c) => [c.x, c.y + c.h + 0.06, c.z]), [candles])
  return (
    <>
      <Instances geo={r.candle} mat={r.candleMat} items={items} />
      <GlowPoints positions={flames} color="#ffb347" intensity={2.2} size={0.16} flicker={0.55} reduced={reduced} />
      <GlowPoints positions={flames} color="#ff7a1a" intensity={1.4} size={0.7} flicker={0.35} opacity={0.32} reduced={reduced} />
    </>
  )
}

// ---------- Pedestal vestido (estaciones y núcleo) ----------

/** Filo encendido, telarañas, velas alrededor y una calabaza junto al pedestal. */
export function StoneDressing({ r, top, ground = -0.32, reduced, seed = 1, pumpkins = true }: { r: number; top: number; ground?: number; reduced: boolean; seed?: number; pumpkins?: boolean }) {
  const R = res()
  const data = useMemo(() => {
    const rnd = seeded(seed * 37 + 3)
    const candles: Candle[] = []
    // Velas en el suelo alrededor y dos en el borde de arriba.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd() * 0.5
      candles.push(...candleCluster(rnd, Math.cos(a) * (r + 0.32), Math.sin(a) * (r + 0.32), 1 + Math.floor(rnd() * 2), 0.12, ground))
    }
    for (const a of [0.5, 2.6]) candles.push({ x: Math.cos(a) * (r - 0.18), y: top, z: Math.sin(a) * (r - 0.18), h: 0.18 + rnd() * 0.12, w: 0.05 })
    const webs: Inst[] = [1.1, 4.0].map((a) => ({ pos: [Math.cos(a) * (r + 0.02), top - 0.22, Math.sin(a) * (r + 0.02)], scale: 0.62, rot: [0, Math.PI / 2 - a, 0] }))
    const pk: Inst[] = pumpkins ? [{ pos: [Math.cos(2.0) * (r + 0.45), ground, Math.sin(2.0) * (r + 0.45)], scale: 0.85, rot: [0, rnd() * 6, 0] }] : []
    return { candles, webs, pk, stems: pk.map((p) => ({ ...p, pos: [p.pos[0], p.pos[1] + 0.36, p.pos[2]] as [number, number, number] })) }
  }, [r, top, ground, seed, pumpkins])
  return (
    <group>
      <mesh geometry={R.ring} material={R.glowRing} position={[0, top + 0.005, 0]} scale={[r - 0.12, 1, r - 0.12]} />
      <Instances geo={R.plane} mat={R.webMat} items={data.webs} />
      <Candles candles={data.candles} reduced={reduced} />
      <Instances geo={R.pumpkin} mat={R.pumpkinMat} items={data.pk} />
      <Instances geo={R.stem} mat={R.stemMat} items={data.stems} />
    </group>
  )
}

// ---------- Lápidas (paneles de las zonas) ----------

function tombGeometry(w: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  const r = w / 2
  s.moveTo(-r, -h / 2)
  s.lineTo(r, -h / 2)
  s.lineTo(r, h / 2 - r * 0.6)
  s.quadraticCurveTo(r, h / 2 + r * 0.35, 0, h / 2 + r * 0.35)
  s.quadraticCurveTo(-r, h / 2 + r * 0.35, -r, h / 2 - r * 0.6)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 })
  g.translate(0, 0, -0.2)
  // uvs de piedra a escala.
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.6, uv.getY(i) * 0.6)
  return g
}

/** Lápida de piedra detrás del panel, velas al pie, una telaraña en la esquina y, a veces, un cuervo encima. */
export function TombPanel({ size, position, crow = false, reduced }: { size: [number, number]; position: [number, number, number]; crow?: boolean; reduced: boolean }) {
  const R = res()
  const [w, h] = size
  const geo = useMemo(() => tombGeometry(w + 0.3, h + 0.3), [w, h])
  useEffect(() => () => geo.dispose(), [geo])
  const candles = useMemo(() => {
    const rnd = seeded(Math.round(w * 97 + h * 13))
    return [...candleCluster(rnd, -w / 2 + 0.05, 0.2, 2, 0.12, -position[1]), ...candleCluster(rnd, w / 2 - 0.1, 0.25, 3, 0.14, -position[1])]
  }, [w, h, position])
  const top = h / 2 + 0.15 + (w + 0.3) * 0.175
  return (
    <group position={position}>
      <mesh geometry={geo} material={R.stoneMat} />
      <mesh geometry={R.plane} material={R.webMat} position={[-w / 2 - 0.02, h / 2 - 0.12, 0.03]} scale={0.55} />
      {crow && <mesh geometry={R.plane} material={R.crowMat} position={[w * 0.18, top + 0.2, -0.1]} scale={0.48} />}
      <Candles candles={candles} reduced={reduced} />
    </group>
  )
}

// ---------- Escena ----------

/** Dónde está la luna respecto a la cámara (arriba a la izquierda, detrás de la ciudad). */
const MOON: [number, number, number] = [-16, 25, -105]

export type FreeSpots = (n: number, seed: number, rMin: number, rMax: number, gap?: number) => [number, number][]

export function HalloweenScene({ stations, density, reduced, cityCount, free }: { stations: StationConfig[]; density: number; reduced: boolean; cityCount: number; free: FreeSpots }) {
  const R = res()
  const data = useMemo(() => {
    const rnd = seeded(31)
    const pumpkins: Inst[] = []
    const candles: Candle[] = []
    for (const [x, z] of free(Math.round(16 * density) + 5, 7, 4.5, 12.5)) {
      const s = 0.6 + rnd() * 0.9
      pumpkins.push({ pos: [x, 0, z], scale: [s, s * (0.85 + rnd() * 0.3), s], rot: [0, rnd() * 6, 0] })
      if (rnd() < 0.55) candles.push(...candleCluster(rnd, x + 0.5, z + 0.3, 2 + Math.floor(rnd() * 3), 0.35))
    }
    for (const [x, z] of free(Math.round(9 * density) + 3, 19, 4.2, 12, 1.6)) candles.push(...candleCluster(rnd, x, z, 3 + Math.floor(rnd() * 3), 0.4))
    const stems: Inst[] = pumpkins.map((p) => {
      const s = p.scale as [number, number, number]
      return { pos: [p.pos[0], 0.42 * s[1] - 0.04, p.pos[2]], scale: s, rot: [0.2, p.rot![1], -0.15] }
    })
    const skulls: Inst[] = free(Math.round(5 * density) + 3, 23, 4.5, 11.5, 2).map(([x, z]) => ({ pos: [x, 0, z], scale: 0.9 + rnd() * 0.4, rot: [0, rnd() * 1.4 - 0.7, 0] }))
    const leafCols = ['#c2410c', '#9a3412', '#b45309', '#7c2d12', '#d97706', '#6b2a0a']
    const leaves: Inst[] = Array.from({ length: Math.round(420 * density) + 60 }, () => {
      const a = rnd() * Math.PI * 2
      const r = 3 + Math.sqrt(rnd()) * 11
      return { pos: [Math.cos(a) * r, 0.012 + rnd() * 0.01, Math.sin(a) * r * 0.85 - 1], scale: 0.8 + rnd() * 0.7, rot: [(rnd() - 0.5) * 0.3, rnd() * 6, (rnd() - 0.5) * 0.3], color: leafCols[Math.floor(rnd() * leafCols.length)] }
    })
    // Fuegos fatuos que suben despacio.
    const wisps: number[] = []
    for (let i = 0; i < Math.round(60 * density) + 15; i++) {
      const a = rnd() * Math.PI * 2
      const r = 3 + rnd() * 11
      wisps.push(Math.cos(a) * r, rnd() * 5, Math.sin(a) * r * 0.85 - 1)
    }
    const mist = Array.from({ length: Math.round(16 * density) + 6 }, () => {
      const a = rnd() * Math.PI * 2
      const r = 4 + rnd() * 11
      return { x: Math.cos(a) * r, z: Math.sin(a) * r * 0.85 - 1, s: 6 + rnd() * 5, ph: rnd() * 6 }
    })
    return { pumpkins, stems, candles, skulls, leaves, wisps, mist }
  }, [free, density])

  // Ciudad gótica: agujas en los edificios altos y estandartes en las fachadas cercanas.
  const city = useMemo(() => {
    const rnd = seeded(51)
    const spires: Inst[] = []
    const banners: Inst[] = []
    for (const b of cityLayout(cityCount).items) {
      if (b.h > 2.2) {
        const tall = rnd() < 0.35
        spires.push({ pos: [b.x, b.h, b.z], scale: [b.w * 0.55, (tall ? 2.6 : 1.1) + b.h * 0.18, b.d * 0.55] })
        if (b.h > 4 && rnd() < 0.6)
          for (const [dx, dz] of [
            [-1, -1],
            [1, 1]
          ])
            spires.push({ pos: [b.x + (dx * b.w) / 2.4, b.h, b.z + (dz * b.d) / 2.4], scale: [0.14, 0.9, 0.14] })
      }
      if (b.z > -24 && Math.abs(b.x) < 24 && b.h > 1.8 && rnd() < 0.45) banners.push({ pos: [b.x, b.h * 0.62, b.z + b.d / 2 + 0.04], scale: [0.42, 1.05, 1] })
    }
    return { spires, banners }
  }, [cityCount])

  const sky = useRef<THREE.Group>(null!)
  const bats = useRef<THREE.Mesh[]>([])
  const mistRefs = useRef<THREE.Sprite[]>([])
  const batSpecs = useMemo(() => Array.from({ length: 11 }, (_, i) => ({ r: 6 + (i % 3) * 4, y: (i % 4) * 2.2 - 3, sp: 0.22 + (i % 5) * 0.05, ph: i * 1.7, flap: 9 + (i % 3) * 3, s: 2.2 + (i % 3) * 0.6 })), [])
  useFrame((state) => {
    const t = registry.time * (reduced ? 0.3 : 1)
    sky.current.position.copy(state.camera.position)
    sky.current.quaternion.copy(state.camera.quaternion)
    bats.current.forEach((m, i) => {
      if (!m) return
      const b = batSpecs[i]
      const a = t * b.sp + b.ph
      m.position.set(MOON[0] + Math.cos(a) * b.r * 1.7, MOON[1] + b.y + Math.sin(t * 0.9 + b.ph) * 1.2, MOON[2] + 12 + Math.sin(a) * b.r * 0.4)
      m.scale.set(b.s * (0.45 + 0.55 * Math.abs(Math.sin(t * b.flap + b.ph))), b.s * 0.5, 1)
    })
    mistRefs.current.forEach((m, i) => {
      if (!m) return
      const s = data.mist[i]
      m.position.set(s.x + Math.sin(t * 0.07 + s.ph) * 1.5, 0.35, s.z + Math.cos(t * 0.05 + s.ph) * 1)
    })
  })

  return (
    <>
      <Instances geo={R.pumpkin} mat={R.pumpkinMat} items={data.pumpkins} />
      <Instances geo={R.stem} mat={R.stemMat} items={data.stems} />
      <Candles candles={data.candles} reduced={reduced} />
      <Instances geo={R.skull} mat={R.boneMat} items={data.skulls} />
      <Instances geo={R.sockets} mat={R.darkMat} items={data.skulls} />
      <Instances geo={R.leaf} mat={R.leafMat} items={data.leaves} />
      <Instances geo={R.spire} mat={R.spireMat} items={city.spires} />
      <Instances geo={R.plane} mat={R.bannerMat} items={city.banners} />
      <Ghosts count={Math.round(3 * density) + 2} reduced={reduced} />
      <GlowPoints positions={data.wisps} color="#ffa040" intensity={1.8} size={0.12} fall={-0.25} fallHeight={5} fallBase={0} sway={0.5} flicker={0.6} reduced={reduced} />
      {data.mist.map((s, i) => (
        <sprite
          key={i}
          ref={(m) => {
            if (m) mistRefs.current[i] = m
          }}
          material={R.mistMat}
          scale={[s.s, s.s * 0.35, 1]}
        />
      ))}
      <group ref={sky}>
        <mesh geometry={R.plane} material={R.moonMat} position={MOON} scale={12} renderOrder={-3} />
        <sprite material={R.moonGlow} position={[MOON[0], MOON[1], MOON[2] - 1]} scale={[34, 34, 1]} renderOrder={-3} />
        {batSpecs.map((_, i) => (
          <mesh
            key={i}
            ref={(m) => {
              if (m) bats.current[i] = m
            }}
            geometry={R.plane}
            material={R.batMat}
            renderOrder={-2}
          />
        ))}
      </group>
    </>
  )
}

// ---------- Fantasmas ----------

/** Fantasma de sábana: cabeza redonda y bajo ondulado. */
function ghostGeometry(): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = []
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2)
    prof.push(new THREE.Vector2(Math.sin(a) * 0.3, 0.55 + Math.cos(a) * 0.3))
  }
  // De abajo arriba: bajo de la sábana, cuerpo y la cabeza hasta la coronilla.
  prof.push(new THREE.Vector2(0.33, 0.25), new THREE.Vector2(0.38, 0))
  prof.reverse()
  const g = new THREE.LatheGeometry(prof, 32)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    if (y < 0.05) p.setY(i, y + 0.07 * Math.sin(Math.atan2(p.getX(i), p.getZ(i)) * 7))
  }
  g.computeVertexNormals()
  return g
}

let G_: { geo: THREE.BufferGeometry; mat: THREE.Material; eyes: THREE.BufferGeometry; eyeMat: THREE.Material } | null = null
function ghostRes() {
  if (!G_)
    G_ = {
      geo: ghostGeometry(),
      mat: new THREE.MeshStandardMaterial({ color: '#f2f0ff', roughness: 0.6, emissive: '#b8a8ff', emissiveIntensity: 0.35, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false }),
      eyes: mergeGeometries([-1, 1].map((s) => new THREE.SphereGeometry(0.05, 10, 8).scale(0.8, 1.3, 0.5).translate(s * 0.1, 0.62, 0.27).toNonIndexed())),
      eyeMat: new THREE.MeshBasicMaterial({ color: '#0a0610' })
    }
  return G_
}

/** Unos fantasmas que flotan dando vueltas despacio, subiendo y bajando. */
export function Ghosts({ count, reduced }: { count: number; reduced: boolean }) {
  const G = ghostRes()
  const refs = useRef<THREE.Group[]>([])
  const specs = useMemo(() => Array.from({ length: count }, (_, i) => ({ r: 5 + (i % 3) * 2.5, y: 1.6 + (i % 2) * 0.9, sp: 0.08 + (i % 4) * 0.03, ph: i * 2.1 })), [count])
  useFrame(() => {
    const t = registry.time * (reduced ? 0.3 : 1)
    refs.current.forEach((g, i) => {
      if (!g) return
      const s = specs[i]
      const a = t * s.sp + s.ph
      g.position.set(Math.cos(a) * s.r * 1.3, s.y + Math.sin(t * 1.3 + s.ph) * 0.25, Math.sin(a) * s.r - 1)
      g.rotation.set(Math.sin(t * 1.1 + s.ph) * 0.12, -a + Math.PI, Math.cos(t * 0.9 + s.ph) * 0.1)
    })
  })
  return (
    <>
      {specs.map((_, i) => (
        <group
          key={i}
          ref={(g) => {
            if (g) refs.current[i] = g
          }}
        >
          <mesh geometry={G.geo} material={G.mat} />
          <mesh geometry={G.eyes} material={G.eyeMat} />
        </group>
      ))}
    </>
  )
}
