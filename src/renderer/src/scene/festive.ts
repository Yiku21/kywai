// Piezas de los temas de fiesta, hechas por código: árbol de Navidad, estrella, lazo, farol, copos de nieve,
// la guirnalda de las plataformas y su gorro de nieve. Se crean una vez y se comparten.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { canvasTexture } from './assets'

const cache = new Map<string, unknown>()
function once<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key) as T
}

const hash = (n: number): number => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

function paint(g: THREE.BufferGeometry, color: (p: THREE.Vector3, i: number) => [number, number, number]): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute
  const c = new Float32Array(p.count * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) c.set(color(v.fromBufferAttribute(p, i), i), i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return g
}

// ---------- Árbol ----------

/** Pisos del árbol (de abajo arriba): radio, altura y dónde empieza cada uno. Mide ~1.4 de alto. */
export const TREE_TIERS = [0, 1, 2, 3, 4, 5].map((k) => {
  const t = k / 5
  return { r: 0.62 * (1 - t * 0.8), h: 0.42 - t * 0.14, y: 0.14 + t * 0.92 }
})
export const TREE_TOP = TREE_TIERS[5].y + TREE_TIERS[5].h

/** Radio del árbol a la altura y (por fuera de las ramas), para colocar luces y bolas encima. */
export function treeRadiusAt(y: number): number {
  let r = 0
  for (const t of TREE_TIERS) {
    if (y < t.y || y > t.y + t.h) continue
    r = Math.max(r, t.r * (1 - (y - t.y) / t.h))
  }
  return r
}

/** Abeto con pisos de ramas en punta que caen un poco, nieve encima y tronco; colores por vértice. */
export function treeGeometry(): THREE.BufferGeometry {
  return once('tree', () => {
    const parts: THREE.BufferGeometry[] = []
    TREE_TIERS.forEach((t, k) => {
      const g = new THREE.ConeGeometry(t.r, t.h, 32, 5, true)
      g.translate(0, t.y + t.h / 2, 0)
      const p = g.attributes.position as THREE.BufferAttribute
      const v = new THREE.Vector3()
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i)
        const u = 1 - (v.y - t.y) / t.h // 1 abajo, 0 en la punta
        const a = Math.atan2(v.x, v.z)
        // Puntas de las ramas en el borde, que además caen.
        const tip = Math.pow(Math.max(0, Math.cos(8 * a + k)), 3) * u * u
        const s = 1 + 0.2 * tip - 0.05 * u
        p.setXYZ(i, v.x * s, v.y - 0.07 * tip - 0.03 * u * u, v.z * s)
      }
      g.computeVertexNormals()
      paint(g, (q, i) => {
        const u = 1 - (q.y - t.y) / t.h
        const n = hash(i * 7.3 + k * 31)
        // Nieve sobre la parte alta de cada piso, a manchas.
        if (u > 0.25 && u < 0.75 && n > 0.62) return [0.86, 0.9, 0.96]
        const g2 = 0.2 + 0.12 * u + 0.06 * n
        return [0.05 + 0.04 * n, g2, 0.1 + 0.04 * u]
      })
      parts.push(g)
    })
    const trunk = new THREE.CylinderGeometry(0.07, 0.09, 0.2, 8).translate(0, 0.1, 0)
    paint(trunk, () => [0.26, 0.15, 0.08])
    parts.push(trunk)
    return mergeGeometries(parts.map((g) => g.toNonIndexed()))
  })
}

/** Estrella de cinco puntas con algo de grosor. */
export function starGeometry(): THREE.BufferGeometry {
  return once('star', () => {
    const s = new THREE.Shape()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.42 : 1
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 1 })
    g.center()
    return g
  })
}

/** Lazo: dos lazadas y el nudo. Mide ~1 de ancho, con la base en y=0. */
export function bowGeometry(): THREE.BufferGeometry {
  return once('bow', () => {
    const loop = (side: 1 | -1) => {
      const g = new THREE.TorusGeometry(0.22, 0.07, 8, 20)
      g.scale(1.15, 0.75, 0.55)
      g.rotateZ(side * 0.5)
      g.translate(side * 0.25, 0.18, 0)
      return g
    }
    const tail = (side: 1 | -1) => {
      const g = new THREE.BoxGeometry(0.11, 0.34, 0.04)
      g.rotateZ(side * 0.45)
      g.translate(side * 0.13, -0.05, 0.02)
      return g
    }
    const knot = new THREE.SphereGeometry(0.1, 12, 8).scale(1, 0.85, 0.7).translate(0, 0.16, 0.02)
    return mergeGeometries([loop(1), loop(-1), tail(1), tail(-1), knot].map((g) => g.toNonIndexed()))
  })
}

/** Farol: base, cristal (aparte, porque brilla), tejadillo y asa. */
export function lanternGeometry(): { frame: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  return once('lantern', () => {
    const base = new THREE.BoxGeometry(0.22, 0.04, 0.22).translate(0, 0.02, 0)
    const posts = [-1, 1].flatMap((x) => [-1, 1].map((z) => new THREE.BoxGeometry(0.025, 0.26, 0.025).translate(x * 0.095, 0.17, z * 0.095)))
    const roof = new THREE.ConeGeometry(0.17, 0.12, 4).rotateY(Math.PI / 4).translate(0, 0.36, 0)
    const ring = new THREE.TorusGeometry(0.045, 0.012, 6, 14).translate(0, 0.45, 0)
    return {
      frame: mergeGeometries([base, ...posts, roof, ring].map((g) => g.toNonIndexed())),
      glass: new THREE.BoxGeometry(0.17, 0.24, 0.17).translate(0, 0.17, 0)
    }
  })
}

/** Copo de nieve de seis brazos (textura blanca sobre transparente). */
export const snowflakeTexture = (): THREE.CanvasTexture =>
  canvasTexture(128, 128, (ctx) => {
    ctx.strokeStyle = '#fff'
    ctx.lineCap = 'round'
    ctx.translate(64, 64)
    for (let k = 0; k < 6; k++) {
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, -54)
      ctx.stroke()
      ctx.lineWidth = 4
      for (const [y, l] of [
        [-22, 14],
        [-38, 11]
      ]) {
        ctx.beginPath()
        ctx.moveTo(-l, y - l)
        ctx.lineTo(0, y)
        ctx.lineTo(l, y - l)
        ctx.stroke()
      }
      ctx.rotate(Math.PI / 3)
    }
  })

// ---------- Plataformas vestidas (regalo con nieve y guirnalda) ----------

/** Puntos de un hexágono (radio a los vértices), como los de CylinderGeometry(…, 6). */
export function hexPoints(r: number, y: number): THREE.Vector3[] {
  return Array.from({ length: 6 }, (_, k) => new THREE.Vector3(Math.sin((k * Math.PI) / 3) * r, y, Math.cos((k * Math.PI) / 3) * r))
}

/** Puntos repartidos a lo largo del borde de un hexágono, cada `step` metros. */
export function alongHex(r: number, y: number, step: number, jitter = 0): THREE.Vector3[] {
  const pts = hexPoints(r, y)
  const out: THREE.Vector3[] = []
  for (let k = 0; k < 6; k++) {
    const a = pts[k]
    const b = pts[(k + 1) % 6]
    const n = Math.max(1, Math.round(a.distanceTo(b) / step))
    for (let i = 0; i < n; i++) {
      const p = a.clone().lerp(b, i / n)
      if (jitter) p.y += (hash(out.length * 3.1 + r) - 0.5) * jitter
      out.push(p)
    }
  }
  return out
}

/** Guirnalda de abeto que sigue el borde del hexágono, mullida. */
export function garlandGeometry(r: number, tube: number): THREE.BufferGeometry {
  return once(`garland:${r}:${tube}`, () => {
    const pts = hexPoints(r, 0)
    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let k = 0; k < 6; k++) path.add(new THREE.LineCurve3(pts[k], pts[(k + 1) % 6]))
    const g = new THREE.TubeGeometry(path as unknown as THREE.Curve<THREE.Vector3>, 192, tube, 7, true)
    const p = g.attributes.position as THREE.BufferAttribute
    const n = g.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const k = 0.55 + 0.9 * hash(i * 1.7)
      p.setXYZ(i, p.getX(i) + n.getX(i) * tube * (k - 1), p.getY(i) + n.getY(i) * tube * (k - 1), p.getZ(i) + n.getZ(i) * tube * (k - 1))
    }
    g.computeVertexNormals()
    return g
  })
}

/** Capa de nieve sobre una plataforma hexagonal: algo más ancha, abombada y con el borde irregular. */
export function snowCapGeometry(r: number, h: number): THREE.BufferGeometry {
  return once(`snowcap:${r}:${h}`, () => {
    const g = new THREE.CylinderGeometry(r, r * 0.98, h, 6, 2, false)
    const sub = mergeGeometries([g.toNonIndexed()])
    const p = sub.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const a = Math.atan2(v.x, v.z)
      const lump = 0.04 * Math.sin(a * 11) + 0.03 * Math.sin(a * 23 + 1.3)
      if (v.y > 0) v.y += lump * 0.5 + 0.02
      else v.y += lump
      p.setXYZ(i, v.x, v.y, v.z)
    }
    sub.computeVertexNormals()
    return sub
  })
}

/** Cintas de un regalo en las seis caras de un prisma hexagonal (radio a los vértices r, alto h, base en 0). */
export function ribbonBandsGeometry(r: number, h: number, w: number): THREE.BufferGeometry {
  return once(`bands:${r}:${h}:${w}`, () => {
    const ap = r * Math.cos(Math.PI / 6) + 0.012
    const bands = Array.from({ length: 6 }, (_, k) => {
      const a = Math.PI / 6 + (k * Math.PI) / 3
      const g = new THREE.BoxGeometry(w, h, 0.025)
      g.translate(0, h / 2, ap)
      g.rotateY(a)
      return g.toNonIndexed()
    })
    return mergeGeometries(bands)
  })
}
