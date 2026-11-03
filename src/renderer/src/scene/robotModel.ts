import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { RobotAvatar } from '@shared/types'
import { LOGOS, drawLogo } from '@/lib/logos'
import { glowTexture } from './assets'

// Construcción procedimental de los robots a partir de los diseños de referencia:
// cuerpo + visor oscuro + dos ojos luminosos + logo en el pecho + un accesorio sencillo.

interface BodySpec {
  kind: 'lathe' | 'box'
  H: number
  W: number
  D: number
  /** Exponente de superelipse: 2 = elipse, >2 más "cuadrado". */
  n: number
  /** Ensanchamiento inferior (forma de huevo). */
  k: number
  visor: { cy: number; w: number; h: number; r: number }
  eyes: { spacing: number; dy: number }
  logoY: number
  /** Lado del logo del pecho (por defecto 0.2). */
  logoSize?: number
}

const BODIES: Record<RobotAvatar['body'], BodySpec> = {
  capsule: {
    kind: 'lathe', H: 1.2, W: 0.86, D: 0.8, n: 2.6, k: 0.04,
    visor: { cy: 0.13, w: 0.62, h: 0.33, r: 0.13 }, eyes: { spacing: 0.135, dy: 0 }, logoY: -0.2
  },
  egg: {
    kind: 'lathe', H: 1.12, W: 0.95, D: 0.88, n: 2.0, k: 0.17,
    visor: { cy: 0.1, w: 0.6, h: 0.29, r: 0.12 }, eyes: { spacing: 0.14, dy: 0 }, logoY: -0.21
  },
  blob: {
    kind: 'lathe', H: 0.98, W: 1.04, D: 0.98, n: 2.15, k: 0.05,
    visor: { cy: 0.06, w: 0.78, h: 0.35, r: 0.15 }, eyes: { spacing: 0.17, dy: -0.005 }, logoY: -0.24
  },
  // Cuerpo alto de lados casi rectos y visor grande (Hermes).
  dome: {
    kind: 'lathe', H: 1.16, W: 0.96, D: 0.88, n: 2.4, k: 0.1,
    visor: { cy: 0.1, w: 0.7, h: 0.34, r: 0.14 }, eyes: { spacing: 0.155, dy: 0 }, logoY: -0.25, logoSize: 0.3
  },
  cube: {
    kind: 'box', H: 0.92, W: 0.98, D: 0.84, n: 0, k: 0,
    visor: { cy: 0.1, w: 0.72, h: 0.36, r: 0.14 }, eyes: { spacing: 0.15, dy: 0 }, logoY: -0.24
  },
  // Bombilla (Muse): cabeza ancha que se estrecha hacia la base.
  bulb: {
    kind: 'lathe', H: 1.14, W: 0.98, D: 0.9, n: 2.3, k: -0.15,
    visor: { cy: 0.14, w: 0.7, h: 0.32, r: 0.14 }, eyes: { spacing: 0.155, dy: 0 }, logoY: -0.24, logoSize: 0.24
  }
}

const BOX_R = 0.24

/** Radio de la silueta a la altura y (cuerpos de revolución). */
function latheRadius(b: BodySpec, y: number): number {
  const s = THREE.MathUtils.clamp((2 * y) / b.H, -1, 1)
  const c = Math.sqrt(Math.max(0, 1 - s * s))
  return (b.W / 2) * Math.pow(c, 2 / b.n) * (1 - b.k * s)
}

/** Medidas del cuerpo de un robot, para ponerle encima un gorro, una bufanda o una capa (costumes.ts). */
export function bodyMetrics(avatar: RobotAvatar): { top: number; bottom: number; W: number; D: number; box: boolean; visorBottom: number; radiusAt(y: number): number } {
  const b = BODIES[avatar.body] ?? BODIES.capsule
  return {
    top: b.H / 2,
    bottom: -b.H / 2,
    W: b.W,
    D: b.D,
    box: b.kind === 'box',
    visorBottom: b.visor.cy - b.visor.h / 2,
    radiusAt: (y) => (b.kind === 'box' ? b.W / 2 : latheRadius(b, y))
  }
}

/** Profundidad (z) de la superficie frontal en (x, y). */
function frontZ(b: BodySpec, x: number, y: number): number {
  if (b.kind === 'box') {
    const dx = Math.max(0, Math.abs(x) - (b.W / 2 - BOX_R))
    const dy = Math.max(0, Math.abs(y) - (b.H / 2 - BOX_R))
    const ox = BOX_R - Math.sqrt(Math.max(0, BOX_R * BOX_R - dx * dx))
    const oy = BOX_R - Math.sqrt(Math.max(0, BOX_R * BOX_R - dy * dy))
    return b.D / 2 - ox - oy
  }
  const r = latheRadius(b, y)
  return (b.D / b.W) * Math.sqrt(Math.max(0.0001, r * r - x * x))
}

function bodyGeometry(b: BodySpec): THREE.BufferGeometry {
  if (b.kind === 'box') {
    const g = new RoundedBoxGeometry(b.W, b.H, b.D, 6, BOX_R)
    // Ligeramente más estrecho arriba
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const f = 1 - 0.05 * ((y + b.H / 2) / b.H)
      pos.setX(i, pos.getX(i) * f)
    }
    g.computeVertexNormals()
    return g
  }
  const pts: THREE.Vector2[] = []
  const steps = 56
  for (let i = 0; i <= steps; i++) {
    const phi = -Math.PI / 2 + (Math.PI * i) / steps
    const y = (b.H / 2) * Math.sin(phi)
    pts.push(new THREE.Vector2(i === 0 || i === steps ? 0 : latheRadius(b, y), y))
  }
  const g = new THREE.LatheGeometry(pts, 72)
  g.scale(1, 1, b.D / b.W)
  g.computeVertexNormals()
  fixPoleNormals(g)
  return g
}

/**
 * En los polos de un cuerpo de revolución algunas normales salen de longitud cero (solo tocan triángulos
 * degenerados). Si un píxel cae justo ahí, el sombreado da NaN y el bloom lo extiende a toda la imagen
 * (destello negro): se sustituyen por la vertical.
 */
function fixPoleNormals(g: THREE.BufferGeometry): void {
  const n = g.attributes.normal as THREE.BufferAttribute
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < n.count; i++) {
    if (Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) < 1e-4) n.setXYZ(i, 0, p.getY(i) >= 0 ? 1 : -1, 0)
  }
  n.needsUpdate = true
}

/** Rectángulo redondeado como malla en anillos (para poder curvarlo sobre el cuerpo). */
function roundedRectPatch(w: number, h: number, r: number, rings = 10, outline = 72): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  const x0 = -w / 2
  const y0 = -h / 2
  shape.moveTo(x0 + r, y0)
  shape.lineTo(x0 + w - r, y0)
  shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r)
  shape.lineTo(x0 + w, y0 + h - r)
  shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h)
  shape.lineTo(x0 + r, y0 + h)
  shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r)
  shape.lineTo(x0, y0 + r)
  shape.quadraticCurveTo(x0, y0, x0 + r, y0)
  const border = shape.getSpacedPoints(outline).slice(0, outline)
  const positions: number[] = [0, 0, 0]
  const uvs: number[] = [0.5, 0.5]
  for (let k = 1; k <= rings; k++) {
    const f = k / rings
    for (const p of border) {
      positions.push(p.x * f, p.y * f, 0)
      uvs.push(0.5 + (p.x * f) / w, 0.5 + (p.y * f) / h)
    }
  }
  const idx: number[] = []
  for (let j = 0; j < outline; j++) idx.push(0, 1 + j, 1 + ((j + 1) % outline))
  for (let k = 1; k < rings; k++) {
    const a = 1 + (k - 1) * outline
    const b2 = 1 + k * outline
    for (let j = 0; j < outline; j++) {
      const j2 = (j + 1) % outline
      idx.push(a + j, b2 + j, b2 + j2, a + j, b2 + j2, a + j2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(idx)
  return g
}

/** Proyecta una malla plana (z = 0) sobre la cara frontal del cuerpo, centrada en cy. */
function conform(g: THREE.BufferGeometry, b: BodySpec, cy: number, lift: number, bulge = 0): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i) + cy
    const z = frontZ(b, x, y) + lift + pos.getZ(i)
    pos.setXYZ(i, x, y, z)
  }
  if (bulge) {
    // Abombado suave en el centro (visor brillante)
    const box = new THREE.Box3().setFromBufferAttribute(pos)
    const hw = (box.max.x - box.min.x) / 2
    const hh = (box.max.y - box.min.y) / 2
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / hw
      const v = (pos.getY(i) - cy) / hh
      const e = Math.max(0, 1 - Math.pow(Math.abs(u), 4) - Math.pow(Math.abs(v), 4))
      pos.setZ(i, pos.getZ(i) + bulge * e)
    }
  }
  g.computeVertexNormals()
  return g
}

// ---------- Formas de los ojos ----------
function circleShape(r: number): THREE.Shape {
  const s = new THREE.Shape()
  s.absarc(0, 0, r, 0, Math.PI * 2, false)
  return s
}

function pillShape(w: number, h: number): THREE.Shape {
  const r = h / 2
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + r, -r)
  s.lineTo(w / 2 - r, -r)
  s.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false)
  s.lineTo(-w / 2 + r, r)
  s.absarc(-w / 2 + r, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false)
  return s
}

/** Arco "sonriente" ◠ con puntas redondeadas. */
function arcShape(R: number, t: number): THREE.Shape {
  const a0 = Math.PI * 0.12
  const a1 = Math.PI * 0.88
  const s = new THREE.Shape()
  s.absarc(0, -R * 0.35, R, a0, a1, false)
  const end1 = new THREE.Vector2(Math.cos(a1) * (R - t / 2), -R * 0.35 + Math.sin(a1) * (R - t / 2))
  s.absarc(end1.x, end1.y, t / 2, a1, a1 + Math.PI, false)
  s.absarc(0, -R * 0.35, R - t, a1, a0, true)
  const end0 = new THREE.Vector2(Math.cos(a0) * (R - t / 2), -R * 0.35 + Math.sin(a0) * (R - t / 2))
  s.absarc(end0.x, end0.y, t / 2, a0 + Math.PI, a0 + Math.PI * 2, false)
  return s
}

/** Chevron ">" (dir = 1) o "<" (dir = -1). */
function chevronShape(dir: 1 | -1): THREE.Shape {
  const w = 0.085
  const h = 0.12
  const t = 0.034
  const pts: [number, number][] = [
    [-w / 2, h / 2],
    [-w / 2 + t, h / 2],
    [w / 2, 0],
    [-w / 2 + t, -h / 2],
    [-w / 2, -h / 2],
    [w / 2 - t, 0]
  ]
  const s = new THREE.Shape()
  pts.forEach(([x, y], i) => (i ? s.lineTo(x * dir, y) : s.moveTo(x * dir, y)))
  s.closePath()
  return s
}

/** Onda «∿» de trazo grueso y puntas redondas (ojos de Muse, como su logo). [dir] = -1 la refleja. */
function waveShape(w: number, amp: number, t: number, dir: 1 | -1): THREE.Shape {
  const N = 28
  const center: THREE.Vector2[] = []
  const normal: THREE.Vector2[] = []
  for (let i = 0; i <= N; i++) {
    const x = -w / 2 + (w * i) / N
    const a = (Math.PI * 2 * x) / w
    center.push(new THREE.Vector2(x, dir * amp * Math.sin(a)))
    const slope = dir * amp * ((Math.PI * 2) / w) * Math.cos(a)
    normal.push(new THREE.Vector2(-slope, 1).normalize())
  }
  const s = new THREE.Shape()
  center.forEach((c, i) => {
    const p = c.clone().addScaledVector(normal[i], t / 2)
    if (i) s.lineTo(p.x, p.y)
    else s.moveTo(p.x, p.y)
  })
  // Punta final: media vuelta de la normal hacia la contraria, pasando por delante.
  const cap = (c: THREE.Vector2, n: THREE.Vector2, forward: number): void => {
    const a0 = Math.atan2(n.y, n.x)
    for (let k = 1; k < 10; k++) {
      const a = a0 - forward * ((Math.PI * k) / 10)
      s.lineTo(c.x + Math.cos(a) * (t / 2), c.y + Math.sin(a) * (t / 2))
    }
  }
  cap(center[N], normal[N], 1)
  for (let i = N; i >= 0; i--) {
    const p = center[i].clone().addScaledVector(normal[i], -t / 2)
    s.lineTo(p.x, p.y)
  }
  cap(center[0], normal[0].clone().negate(), 1)
  s.closePath()
  return s
}

function shapeGeo(s: THREE.Shape): THREE.ShapeGeometry {
  return new THREE.ShapeGeometry(s, 16)
}

const SHARED = {
  happy: shapeGeo(arcShape(0.07, 0.026)),
  flat: shapeGeo(pillShape(0.12, 0.028)),
  round: shapeGeo(circleShape(0.068)),
  dotL: shapeGeo(circleShape(0.074)),
  dotR: shapeGeo(circleShape(0.061)),
  pill: shapeGeo(pillShape(0.15, 0.074)),
  arc: shapeGeo(arcShape(0.078, 0.028)),
  chevR: shapeGeo(chevronShape(1)),
  chevL: shapeGeo(chevronShape(-1)),
  waveL: shapeGeo(waveShape(0.15, 0.022, 0.034, 1)),
  waveR: shapeGeo(waveShape(0.15, 0.022, 0.034, -1)),
  halo: new THREE.TorusGeometry(0.25, 0.024, 14, 72),
  ear: new THREE.CapsuleGeometry(0.082, 0.12, 6, 18),
  stem: new THREE.CylinderGeometry(0.022, 0.026, 0.17, 12),
  ball: new THREE.SphereGeometry(0.072, 20, 14),
  button: new THREE.CylinderGeometry(0.085, 0.085, 0.045, 40),
  buttonRing: new THREE.TorusGeometry(0.05, 0.01, 10, 48),
  vent: new THREE.BoxGeometry(0.016, 0.024, 0.15)
}

const bodyGeoCache = new Map<string, THREE.BufferGeometry>()
const visorGeoCache = new Map<string, { bezel: THREE.BufferGeometry; glass: THREE.BufferGeometry; logo: THREE.BufferGeometry }>()
const logoTexCache = new Map<string, THREE.CanvasTexture>()

function logoTexture(logo: RobotAvatar['logo']): THREE.CanvasTexture | null {
  if (logo === 'none') return null
  const hit = logoTexCache.get(logo)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.shadowColor = 'rgba(255,255,255,0.9)'
  ctx.shadowBlur = 10
  drawLogo(ctx, LOGOS[logo], 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  logoTexCache.set(logo, tex)
  return tex
}

function tuftGeometry(top: number): THREE.BufferGeometry {
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0.0, top - 0.16, 0),
    new THREE.Vector3(-0.02, top + 0.1, 0),
    new THREE.Vector3(0.16, top + 0.25, 0),
    new THREE.Vector3(0.38, top + 0.12, 0.0)
  )
  const seg = 40
  const g = new THREE.TubeGeometry(curve, seg, 1, 18, false)
  const pos = g.attributes.position as THREE.BufferAttribute
  const ring = 18 + 1
  for (let i = 0; i <= seg; i++) {
    const u = i / seg
    const c = curve.getPointAt(u)
    const rad = THREE.MathUtils.lerp(0.21, 0.028, Math.pow(u, 0.75))
    for (let j = 0; j < ring; j++) {
      const k = i * ring + j
      const dx = pos.getX(k) - c.x
      const dy = pos.getY(k) - c.y
      const dz = pos.getZ(k) - c.z
      pos.setXYZ(k, c.x + dx * rad, c.y + dy * rad, c.z + dz * rad * 0.85)
    }
  }
  g.computeVertexNormals()
  return g
}

// ---------- Pelo, diadema y base (Hermes) ----------
const HAIR_T = 0.085

/** Punto del cuerpo de revolución: θ = 0 mira al frente; u = 0 arriba, 1 abajo. */
function bodyPoint(b: BodySpec, theta: number, u: number, out: THREE.Vector3): THREE.Vector3 {
  const y = (b.H / 2) * Math.cos(u * Math.PI)
  const r = latheRadius(b, y)
  return out.set(r * Math.sin(theta), y, r * Math.cos(theta) * (b.D / b.W))
}

/** Normal aproximada (la del elipsoide equivalente). */
function bodyNormal(b: BodySpec, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(p.x / (b.W / 2) ** 2, p.y / (b.H / 2) ** 2, p.z / (b.D / 2) ** 2).normalize()
}

const uAt = (b: BodySpec, y: number): number => Math.acos(THREE.MathUtils.clamp((2 * y) / b.H, -1, 1)) / Math.PI

/** Melena corta: flequillo en mechones hasta el visor y laterales hasta su base con las puntas hacia fuera. */
function hairGeometry(b: BodySpec): THREE.BufferGeometry {
  const v = b.visor
  const uBang = uAt(b, v.cy + v.h / 2 + 0.035)
  const uSide = uAt(b, v.cy - v.h / 2 - 0.01)
  // El flequillo ocupa el ancho del visor; fuera de él caen los mechones laterales.
  const t0 = Math.asin(Math.min(0.99, (v.w / 2 + 0.05) / latheRadius(b, v.cy)))
  const t1 = t0 + 0.14
  const grooves = [-t0 / 2, 0, t0 / 2]
  const sideW = (th: number) => THREE.MathUtils.smoothstep(Math.abs(th), t0, t1)
  const groove = (th: number) => Math.min(1, grooves.reduce((s, g) => s + Math.exp(-(((th - g) / 0.045) ** 2)), 0))

  const NT = 192
  const NU = 34
  const outer: number[] = []
  const inner: number[] = []
  const P = new THREE.Vector3()
  const N = new THREE.Vector3()
  for (let i = 0; i < NT; i++) {
    const th = -Math.PI + (2 * Math.PI * i) / NT
    const s = sideW(th)
    const gr = groove(th) * (1 - s)
    // Cada mechón del flequillo baja un poco más en su centro.
    const uEnd = THREE.MathUtils.lerp(uBang + 0.014 * (1 - gr), uSide, s)
    for (let j = 0; j <= NU; j++) {
      const f = j / NU
      bodyPoint(b, th, uEnd * f, P)
      bodyNormal(b, P, N)
      // Borde inferior redondeado y surcos entre los mechones.
      const e = Math.max(0, (f - 0.8) / 0.2)
      let t = HAIR_T * (0.4 + 0.6 * Math.sqrt(Math.max(0, 1 - e * e)))
      t -= 0.024 * gr * THREE.MathUtils.smoothstep(f, 0.2, 0.65)
      // Melena con volumen: los laterales se ensanchan hacia abajo.
      t += 0.035 * s * THREE.MathUtils.smoothstep(f, 0.35, 0.85)
      // Puntas hacia fuera (laterales y nuca).
      const flip = s * THREE.MathUtils.smoothstep(f, 0.84, 1)
      const out = 0.095 * flip * flip
      const lift = 0.07 * flip * flip * flip
      outer.push(P.x + N.x * (t + out), P.y + N.y * (t + out) + lift, P.z + N.z * (t + out))
      inner.push(P.x + N.x * (0.004 + out), P.y + N.y * (0.004 + out) + lift, P.z + N.z * (0.004 + out))
    }
  }
  const rows = NU + 1
  const innerOff = NT * rows
  const rimOff = innerOff * 2
  const positions = [...outer, ...inner]
  const idx: number[] = []
  for (let i = 0; i < NT; i++) {
    const i2 = (i + 1) % NT
    for (let j = 0; j < NU; j++) {
      const a = i * rows + j
      const bb = i2 * rows + j
      idx.push(a, a + 1, bb, bb, a + 1, bb + 1)
      idx.push(innerOff + a, innerOff + bb, innerOff + a + 1, innerOff + bb, innerOff + bb + 1, innerOff + a + 1)
    }
    // Canto inferior: une el borde exterior con el interior.
    const o = (k: number) => k * rows + NU
    positions.push(...outer.slice(o(i) * 3, o(i) * 3 + 3), ...inner.slice(o(i) * 3, o(i) * 3 + 3))
    const r0 = rimOff + i * 2
    const r1 = rimOff + i2 * 2
    idx.push(r0, r0 + 1, r1, r1, r0 + 1, r1 + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  // Polos: normal limpia (todas las columnas se juntan en un punto).
  const nrm = g.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < NT; i++) {
    nrm.setXYZ(i * rows, 0, 1, 0)
    nrm.setXYZ(innerOff + i * rows, 0, -1, 0)
  }
  return g
}

/** Diadema sobre el pelo, inclinada hacia atrás, de un lado a otro; devuelve también sus extremos. */
function headbandGeometry(b: BodySpec): { geo: THREE.BufferGeometry; ends: THREE.Vector3[] } {
  const y0 = b.visor.cy + b.visor.h / 2 - 0.01
  const tilt = -0.4
  const c = new THREE.Vector3(0, y0, 0)
  const inside = (p: THREE.Vector3) => {
    if (Math.abs(p.y) >= b.H / 2) return false
    const r = latheRadius(b, p.y)
    return p.x * p.x + (p.z * (b.W / b.D)) ** 2 < r * r
  }
  const N = new THREE.Vector3()
  const pts: THREE.Vector3[] = []
  const K = 48
  for (let k = 0; k <= K; k++) {
    const a = -Math.PI / 2 + (Math.PI * k) / K
    const d = new THREE.Vector3(Math.sin(a), Math.cos(a) * Math.cos(tilt), -Math.cos(a) * Math.sin(tilt))
    let lo = 0
    let hi = 1.5
    for (let it = 0; it < 26; it++) {
      const m = (lo + hi) / 2
      if (inside(c.clone().addScaledVector(d, m))) lo = m
      else hi = m
    }
    const p = c.clone().addScaledVector(d, lo)
    bodyNormal(b, p, N)
    pts.push(p.addScaledVector(N, HAIR_T + 0.006))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const SEG = 80
  const RAD = 12
  const g = new THREE.TubeGeometry(curve, SEG, 1, RAD, false)
  // Sección plana: ancha sobre el pelo y poco gruesa hacia fuera.
  const pos = g.attributes.position as THREE.BufferAttribute
  const ctr = new THREE.Vector3()
  const dv = new THREE.Vector3()
  for (let i = 0; i <= SEG; i++) {
    curve.getPointAt(i / SEG, ctr)
    bodyNormal(b, ctr, N)
    for (let j = 0; j <= RAD; j++) {
      const k = i * (RAD + 1) + j
      dv.set(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(ctr)
      const along = dv.dot(N)
      dv.addScaledVector(N, -along)
      pos.setXYZ(
        k,
        ctr.x + N.x * along * 0.018 + dv.x * 0.044,
        ctr.y + N.y * along * 0.018 + dv.y * 0.044,
        ctr.z + N.z * along * 0.018 + dv.z * 0.044
      )
    }
  }
  g.computeVertexNormals()
  return { geo: g, ends: [pts[0].clone(), pts[K].clone()] }
}

/** Aro metálico que envuelve la base del cuerpo. */
function baseRingGeometry(b: BodySpec): THREE.BufferGeometry {
  const yTop = -b.H / 2 + 0.1
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -b.H / 2 - 0.012)]
  const n = 14
  for (let i = 0; i <= n; i++) {
    const y = -b.H / 2 + 0.006 + ((yTop - (-b.H / 2 + 0.006)) * i) / n
    pts.push(new THREE.Vector2(latheRadius(b, y) + 0.014, y))
  }
  pts.push(new THREE.Vector2(latheRadius(b, yTop) - 0.03, yTop), new THREE.Vector2(0, yTop))
  const g = new THREE.LatheGeometry(pts, 72)
  g.scale(1, 1, b.D / b.W)
  g.computeVertexNormals()
  fixPoleNormals(g)
  return g
}

export interface EyeRig {
  group: THREE.Group
  base: THREE.Mesh
  happy: THREE.Mesh
  flat: THREE.Mesh
  x: number
  y: number
  side: 1 | -1
}

export interface RobotModel {
  root: THREE.Group
  bodyMat: THREE.MeshPhysicalMaterial
  eyeMat: THREE.MeshBasicMaterial
  logoMat: THREE.MeshBasicMaterial | null
  thrusterMat: THREE.SpriteMaterial
  eyes: [EyeRig, EyeRig]
  ears: THREE.Group[]
  antenna: THREE.Group | null
  antennaMat: THREE.MeshStandardMaterial | null
  tuft: THREE.Group | null
  /** Aro de luz sobre la cabeza (Muse). */
  halo: THREE.Mesh | null
  haloMat: THREE.MeshBasicMaterial | null
  eyeColor: THREE.Color
  /** Altura de la parte superior (para colocar indicadores). */
  top: number
  bottom: number
  /** Mallas que responden al puntero. */
  hitMeshes: THREE.Mesh[]
  dispose(): void
}

export function buildRobot(avatar: RobotAvatar, color: string): RobotModel {
  const b = BODIES[avatar.body] ?? BODIES.capsule
  const root = new THREE.Group()
  const base = new THREE.Color(color)

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: 0.46,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.6,
    sheen: 0.4,
    sheenRoughness: 0.6,
    sheenColor: base.clone().lerp(new THREE.Color('#ffffff'), 0.5),
    emissive: base,
    emissiveIntensity: 0.14
  })
  // Remates metálicos opcionales: marco del visor, aro de la base y botones.
  const trimMat = avatar.trimColor
    ? new THREE.MeshPhysicalMaterial({
        color: avatar.trimColor,
        metalness: 0.7,
        roughness: 0.3,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
        emissive: new THREE.Color(avatar.trimColor),
        emissiveIntensity: 0.22
      })
    : null
  const extraGeos: THREE.BufferGeometry[] = []
  const bezelMat = trimMat ?? new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.45), roughness: 0.7 })
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#040509',
    roughness: 0.07,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 0.75
  })
  const eyeColor = new THREE.Color(avatar.eyeColor)
  const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor.clone().multiplyScalar(1.6), toneMapped: false })

  // Cuerpo
  const key = avatar.body
  let bodyGeo = bodyGeoCache.get(key)
  if (!bodyGeo) bodyGeoCache.set(key, (bodyGeo = bodyGeometry(b)))
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  root.add(body)

  // Visor (marco + cristal abombado) y zona del logo
  let vg = visorGeoCache.get(key)
  if (!vg) {
    const v = b.visor
    vg = {
      bezel: conform(roundedRectPatch(v.w + 0.05, v.h + 0.05, v.r + 0.025), b, v.cy, 0.002),
      glass: conform(roundedRectPatch(v.w, v.h, v.r, 12, 80), b, v.cy, 0.008, 0.018),
      logo: conform(roundedRectPatch(b.logoSize ?? 0.2, b.logoSize ?? 0.2, 0.001, 8, 40), b, b.logoY, 0.006)
    }
    visorGeoCache.set(key, vg)
  }
  root.add(new THREE.Mesh(vg.bezel, bezelMat))
  if (trimMat) {
    const ring = baseRingGeometry(b)
    extraGeos.push(ring)
    root.add(new THREE.Mesh(ring, trimMat))
  }
  const glass = new THREE.Mesh(vg.glass, glassMat)
  root.add(glass)

  // Ojos: forma propia + arco feliz + línea (error/reposo), con fundido por escala.
  const eyeGeo = (side: 1 | -1): THREE.BufferGeometry => {
    switch (avatar.eyes) {
      case 'pill':
        return SHARED.pill
      case 'arc':
        return SHARED.arc
      case 'chevron':
        return side < 0 ? SHARED.chevR : SHARED.chevL
      case 'dots':
        return side < 0 ? SHARED.dotL : SHARED.dotR
      case 'wave':
        return side < 0 ? SHARED.waveL : SHARED.waveR
      default:
        return SHARED.round
    }
  }
  const makeEye = (side: 1 | -1): EyeRig => {
    const x = side * b.eyes.spacing
    const y = b.visor.cy + b.eyes.dy
    const group = new THREE.Group()
    const z = frontZ(b, x, y) + 0.008 + 0.018 * 0.85 + 0.006
    group.position.set(x, y, z)
    // Orientar según la curvatura del cuerpo
    const dzdx = (frontZ(b, x + 0.01, y) - frontZ(b, x - 0.01, y)) / 0.02
    group.rotation.y = -Math.atan(dzdx)
    // …y a la inclinación vertical, para que el cristal abombado no tape la parte baja del ojo.
    const dzdy = (frontZ(b, x, y + 0.01) - frontZ(b, x, y - 0.01)) / 0.02
    group.rotation.x = Math.atan(dzdy)
    const baseMesh = new THREE.Mesh(eyeGeo(side), eyeMat)
    const happy = new THREE.Mesh(SHARED.happy, eyeMat)
    const flat = new THREE.Mesh(SHARED.flat, eyeMat)
    happy.scale.setScalar(0.001)
    flat.scale.setScalar(0.001)
    group.add(baseMesh, happy, flat)
    root.add(group)
    return { group, base: baseMesh, happy, flat, x, y, side }
  }
  const eyes: [EyeRig, EyeRig] = [makeEye(-1), makeEye(1)]

  // Logo
  let logoMat: THREE.MeshBasicMaterial | null = null
  const tex = logoTexture(avatar.logo)
  if (tex) {
    logoMat = new THREE.MeshBasicMaterial({
      map: tex,
      color: eyeColor.clone().multiplyScalar(1.15),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    })
    root.add(new THREE.Mesh(vg.logo, logoMat))
  }

  // Accesorios
  const top = b.H / 2
  const ears: THREE.Group[] = []
  let antenna: THREE.Group | null = null
  let antennaMat: THREE.MeshStandardMaterial | null = null
  let tuft: THREE.Group | null = null
  let halo: THREE.Mesh | null = null
  let haloMat: THREE.MeshBasicMaterial | null = null
  const extraMats: THREE.Material[] = []
  const hitExtra: THREE.Mesh[] = []

  if (avatar.accessory === 'ears') {
    const earMat = new THREE.MeshPhysicalMaterial({
      color: avatar.accentColor ?? color,
      roughness: 0.4,
      clearcoat: 0.4,
      emissive: new THREE.Color(avatar.accentColor ?? color),
      emissiveIntensity: 0.12
    })
    extraMats.push(earMat)
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group()
      pivot.position.set(side * 0.13, top - 0.1, -0.03)
      const ear = new THREE.Mesh(SHARED.ear, earMat)
      ear.position.y = 0.13
      ear.scale.set(1, 1, 0.78)
      pivot.add(ear)
      pivot.rotation.z = -side * 0.1
      root.add(pivot)
      ears.push(pivot)
    }
  } else if (avatar.accessory === 'antenna') {
    antenna = new THREE.Group()
    antenna.position.set(0, top - 0.04, 0)
    const stem = new THREE.Mesh(SHARED.stem, bodyMat)
    stem.position.y = 0.085
    antennaMat = new THREE.MeshStandardMaterial({
      color: avatar.accentColor ?? '#fff3c0',
      emissive: new THREE.Color(avatar.accentColor ?? '#fff3c0'),
      emissiveIntensity: 0.9,
      roughness: 0.3,
      toneMapped: false
    })
    const ball = new THREE.Mesh(SHARED.ball, antennaMat)
    ball.position.y = 0.2
    antenna.add(stem, ball)
    root.add(antenna)
  } else if (avatar.accessory === 'tuft') {
    tuft = new THREE.Group()
    tuft.position.set(0, 0, -0.02)
    tuft.add(new THREE.Mesh(tuftGeometry(top), bodyMat))
    root.add(tuft)
  } else if (avatar.accessory === 'hair') {
    const hairMat = new THREE.MeshPhysicalMaterial({
      color: avatar.accentColor ?? '#141419',
      roughness: 0.3,
      metalness: 0.05,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.45
    })
    extraMats.push(hairMat)
    const hairGeo = hairGeometry(b)
    const band = headbandGeometry(b)
    extraGeos.push(hairGeo, band.geo)
    const hairMesh = new THREE.Mesh(hairGeo, hairMat)
    root.add(hairMesh, new THREE.Mesh(band.geo, bodyMat))
    hitExtra.push(hairMesh)
    // Botones dorados en los extremos de la diadema, con un aro que brilla como los ojos.
    for (const end of band.ends) {
      const side = Math.sign(end.x)
      const btn = new THREE.Mesh(SHARED.button, trimMat ?? bezelMat)
      btn.rotation.z = Math.PI / 2
      btn.position.set(end.x + side * 0.004, end.y, end.z)
      const ring = new THREE.Mesh(SHARED.buttonRing, eyeMat)
      ring.rotation.y = Math.PI / 2
      ring.position.set(end.x + side * 0.029, end.y, end.z)
      root.add(btn, ring)
    }
  } else if (avatar.accessory === 'halo') {
    // Aro de luz flotando sobre la cabeza, algo inclinado hacia delante.
    haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(avatar.accentColor ?? avatar.eyeColor).multiplyScalar(1.5),
      toneMapped: false,
      transparent: true,
      opacity: 0.95
    })
    halo = new THREE.Mesh(SHARED.halo, haloMat)
    halo.position.set(0, top + 0.16, 0)
    halo.rotation.x = Math.PI / 2 - 0.28
    root.add(halo)
  } else if (avatar.accessory === 'vents') {
    const ventMat = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.35), roughness: 0.8 })
    extraMats.push(ventMat)
    for (const side of [-1, 1]) {
      for (const dy of [-0.05, -0.105]) {
        const v = new THREE.Mesh(SHARED.vent, ventMat)
        v.position.set(side * (b.W / 2 - 0.006) * (1 - 0.05 * ((dy + b.H / 2) / b.H)), dy, 0.04)
        root.add(v)
      }
    }
  }

  // Propulsor: brillo suave bajo el robot
  const thrusterMat = new THREE.SpriteMaterial({
    map: glowTexture,
    color: base.clone().lerp(new THREE.Color('#ffffff'), 0.25),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.5
  })
  const thruster = new THREE.Sprite(thrusterMat)
  thruster.position.y = -b.H / 2 - 0.12
  thruster.scale.set(0.75, 0.42, 1)
  root.add(thruster)

  return {
    root,
    bodyMat,
    eyeMat,
    logoMat,
    thrusterMat,
    eyes,
    ears,
    antenna,
    antennaMat,
    tuft,
    halo,
    haloMat,
    eyeColor,
    top: top + (avatar.accessory === 'antenna' ? 0.3 : avatar.accessory === 'ears' ? 0.22 : avatar.accessory === 'tuft' ? 0.22 : avatar.accessory === 'hair' ? HAIR_T + 0.02 : avatar.accessory === 'halo' ? 0.24 : 0),
    bottom: -b.H / 2,
    hitMeshes: [body, glass, ...hitExtra],
    dispose() {
      bodyMat.dispose()
      if (bezelMat !== trimMat) bezelMat.dispose()
      glassMat.dispose()
      eyeMat.dispose()
      logoMat?.dispose()
      thrusterMat.dispose()
      antennaMat?.dispose()
      haloMat?.dispose()
      trimMat?.dispose()
      extraGeos.forEach((g) => g.dispose())
      extraMats.forEach((m) => m.dispose())
      tuft?.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
    }
  }
}
