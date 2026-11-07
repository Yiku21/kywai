// Formas del núcleo según el tema (palette.core): la esfera de siempre, un cristal tallado (Relicario), cintas
// tejidas (Telar), una calabaza (Halloween) o una bola de nieve (Navidad). Se crean una vez por forma.
import * as THREE from 'three'
import { canvasTexture } from './assets'
import type { CoreStyle } from './palette'

export interface CoreShape {
  /** Superficie con el brillo de borde (shellFrag). */
  shell: THREE.BufferGeometry
  /** Líneas que giran despacio sobre la superficie. */
  wire: THREE.BufferGeometry
  /** Nodos luminosos sobre la esfera (solo en la esfera). */
  nodes: boolean
}

const cache = new Map<string, CoreShape>()

/** Paralelos y meridianos de la esfera (líneas finas). */
function sphereWire(r: number): THREE.BufferGeometry {
  const pts: number[] = []
  const seg = 72
  const ring = (lat: number, i: number, n: number): THREE.Vector3 => {
    const a = (i / n) * Math.PI * 2
    return new THREE.Vector3(Math.cos(lat) * Math.sin(a) * r, Math.sin(lat) * r, Math.cos(lat) * Math.cos(a) * r)
  }
  for (let k = -3; k <= 3; k++) {
    const lat = (k / 4) * (Math.PI / 2)
    for (let i = 0; i < seg; i++) {
      const a = ring(lat, i, seg)
      const b = ring(lat, i + 1, seg)
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  for (let m = 0; m < 12; m++) {
    const lon = (m / 12) * Math.PI * 2
    for (let i = 0; i < seg / 2; i++) {
      const la = -Math.PI / 2 + (i / (seg / 2)) * Math.PI
      const lb = -Math.PI / 2 + ((i + 1) / (seg / 2)) * Math.PI
      pts.push(
        Math.cos(la) * Math.sin(lon) * r, Math.sin(la) * r, Math.cos(la) * Math.cos(lon) * r,
        Math.cos(lb) * Math.sin(lon) * r, Math.sin(lb) * r, Math.cos(lb) * Math.cos(lon) * r
      )
    }
  }
  return lines(pts)
}

function lines(pts: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}

// ---------- Calabaza ----------

const RIBS = 10

/** Lleva un punto de una esfera de radio R a la calabaza: gajos, achatada y con el hueco del tallo. */
export function pumpkinPoint(v: THREE.Vector3, R: number, k = 1): THREE.Vector3 {
  const phi = Math.atan2(v.x, v.z)
  const rib = 0.5 + 0.5 * Math.cos(RIBS * phi)
  const s = (1 - 0.075 * (1 - rib)) * k
  const rho = Math.min(1, Math.hypot(v.x, v.z) / R)
  v.x *= s
  v.z *= s
  v.y *= 0.8 * (1 - 0.2 * Math.pow(1 - rho, 3)) * k
  return v
}

function pumpkinGeometry(R: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(R, 72, 40)
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    pumpkinPoint(v.fromBufferAttribute(p, i), R)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

/** Las hendiduras entre gajos. */
function pumpkinWire(R: number): THREE.BufferGeometry {
  const pts: number[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const seg = 40
  for (let m = 0; m < RIBS; m++) {
    const lon = ((m + 0.5) / RIBS) * Math.PI * 2
    for (let i = 0; i < seg; i++) {
      const la = -Math.PI / 2 + (i / seg) * Math.PI
      const lb = -Math.PI / 2 + ((i + 1) / seg) * Math.PI
      a.set(Math.cos(la) * Math.sin(lon) * R, Math.sin(la) * R, Math.cos(la) * Math.cos(lon) * R)
      b.set(Math.cos(lb) * Math.sin(lon) * R, Math.sin(lb) * R, Math.cos(lb) * Math.cos(lon) * R)
      pumpkinPoint(a, R, 1.006)
      pumpkinPoint(b, R, 1.006)
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  return lines(pts)
}

/** La cara tallada: un trozo de la calabaza, un poco por fuera, con la textura de la cara. */
export function pumpkinFaceGeometry(R: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(R, 40, 24, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.62, 1.24)
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    pumpkinPoint(v.fromBufferAttribute(p, i), R, 1.012)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  return g
}

export const pumpkinFaceTexture = (): THREE.CanvasTexture =>
  canvasTexture(512, 384, (ctx) => {
    ctx.fillStyle = '#fff'
    // Ojos triangulares, nariz y una sonrisa dentada.
    const tri = (x: number, y: number, w: number, h: number) => {
      ctx.beginPath()
      ctx.moveTo(x, y - h / 2)
      ctx.lineTo(x + w / 2, y + h / 2)
      ctx.lineTo(x - w / 2, y + h / 2)
      ctx.closePath()
      ctx.fill()
    }
    tri(170, 120, 110, 90)
    tri(342, 120, 110, 90)
    tri(256, 196, 50, 44)
    ctx.beginPath()
    ctx.moveTo(96, 236)
    ctx.quadraticCurveTo(256, 290, 416, 236)
    ctx.lineTo(404, 268)
    const teeth = [356, 312, 256, 200, 156]
    for (let i = 0; i < teeth.length; i++) {
      const x = teeth[i]
      const y = 300 + Math.abs(i - 2) * -10
      ctx.lineTo(x + 18, y)
      ctx.lineTo(x, i % 2 ? y - 26 : y + 4)
      ctx.lineTo(x - 18, y)
    }
    ctx.lineTo(108, 268)
    ctx.closePath()
    ctx.fill()
  })

// ---------- Cristal ----------

/** Gema tallada alta: punta abajo (pabellón), cintura ancha, corona con facetas y punta arriba; caras planas. */
function crystalGeometry(R: number): THREE.BufferGeometry {
  const prof: [number, number][] = [
    [0, -0.98],
    [0.5, -0.2],
    [0.66, 0.12],
    [0.66, 0.24],
    [0.5, 0.62],
    [0.24, 0.98],
    [0, 1.12]
  ]
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x * R, y * R)), 8).toNonIndexed()
  g.rotateY(Math.PI / 8)
  g.computeVertexNormals()
  g.translate(0, 0.02, 0)
  return g
}

// ---------- Cintas tejidas ----------

/** Tres cintas que se cruzan por encima y por debajo, como un tejido; las líneas son su trama. */
function weave(R: number): { surface: THREE.BufferGeometry; wire: THREE.BufferGeometry } {
  const bands = [
    new THREE.Euler(0.35, 0, 0.1),
    new THREE.Euler(1.25, 0.9, 0.2),
    new THREE.Euler(-1.1, 2.1, -0.3)
  ]
  const N = 160
  const W = 0.34
  const pos: number[] = []
  const uvs: number[] = []
  const idx: number[] = []
  const wire: number[] = []
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const up = new THREE.Vector3()
  bands.forEach((rot, bi) => {
    const q = new THREE.Quaternion().setFromEuler(rot)
    const base = pos.length / 3
    const rails: THREE.Vector3[][] = [[], []]
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2
      // Sube y baja tres veces por vuelta (por encima y por debajo de las otras cintas).
      const wave = Math.sin(3 * t + bi * 2.1) * 0.1
      p.set(Math.cos(t) * R * (1 + wave * 0.4), wave * R * 0.6, Math.sin(t) * R * (1 + wave * 0.4)).applyQuaternion(q)
      up.set(0, 1, 0).applyQuaternion(q)
      n.copy(up).multiplyScalar(W * (0.8 + 0.2 * Math.cos(2 * t)))
      const a = p.clone().add(n)
      const b = p.clone().sub(n)
      rails[0].push(a)
      rails[1].push(b)
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z)
      uvs.push((i / N) * 14, 0, (i / N) * 14, 1)
      if (i < N) {
        const k = base + i * 2
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
      }
    }
    for (let i = 0; i < N; i++) {
      for (const r of rails) wire.push(r[i].x, r[i].y, r[i].z, r[i + 1].x, r[i + 1].y, r[i + 1].z)
      // Trama en zigzag entre los bordes.
      if (i % 2 === 0) {
        const a = rails[0][i]
        const b = rails[1][i + 2 <= N ? i + 2 : N]
        const c = rails[1][i]
        const d = rails[0][i + 2 <= N ? i + 2 : N]
        wire.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z)
      }
    }
  })
  const surface = new THREE.BufferGeometry()
  surface.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  surface.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  surface.setIndex(idx)
  surface.computeVertexNormals()
  return { surface, wire: lines(wire) }
}

export function coreShape(style: CoreStyle, R: number): CoreShape {
  const key = `${style}:${R}`
  const hit = cache.get(key)
  if (hit) return hit
  let shape: CoreShape
  switch (style) {
    case 'hologram': {
      const shell = new THREE.OctahedronGeometry(R * 0.95)
      shape = { shell, wire: new THREE.EdgesGeometry(shell), nodes: false }
      break
    }
    case 'voxel': {
      const shell = new THREE.BoxGeometry(R * 1.25, R * 1.25, R * 1.25, 3, 3, 3)
      const pts: number[] = [], r = R * 0.625
      for (let i = 0; i <= 3; i++) for (const side of [-r, r]) {
        const p = -r + i * 2 * r / 3
        pts.push(-r,p,side,r,p,side, p,-r,side,p,r,side,
          -r,side,p,r,side,p, p,side,-r,p,side,r,
          side,-r,p,side,r,p, side,p,-r,side,p,r)
      }
      shape = { shell, wire: lines(pts), nodes: false }
      break
    }
    case 'reactor': {
      const shell = new THREE.CylinderGeometry(R * 0.56, R * 0.56, R * 1.4, 24, 4, true)
      shape = { shell, wire: new THREE.EdgesGeometry(shell), nodes: false }
      break
    }
    case 'capsule': {
      const shell = new THREE.CapsuleGeometry(R * 0.53, R * 0.83, 8, 24)
      shape = { shell, wire: new THREE.EdgesGeometry(shell, 25), nodes: false }
      break
    }
    case 'planetarium':
    case 'sculpture':
    case 'tree':
      shape = { shell: new THREE.SphereGeometry(R, 32, 24), wire: lines([]), nodes: false }
      break
    case 'crystal': {
      const shell = crystalGeometry(R)
      shape = { shell, wire: new THREE.EdgesGeometry(shell), nodes: false }
      break
    }
    case 'weave': {
      const w = weave(R)
      shape = { shell: w.surface, wire: w.wire, nodes: false }
      break
    }
    case 'pumpkin':
      shape = { shell: pumpkinGeometry(R), wire: pumpkinWire(R), nodes: false }
      break
    case 'globe':
      // Bola de cristal lisa: sin líneas por encima.
      shape = { shell: new THREE.SphereGeometry(R, 48, 32), wire: lines([]), nodes: false }
      break
    default:
      shape = { shell: new THREE.SphereGeometry(R, 48, 32), wire: sphereWire(R * 1.004), nodes: true }
  }
  cache.set(key, shape)
  return shape
}
