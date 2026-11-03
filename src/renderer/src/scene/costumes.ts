// Disfraces de los robots en los temas de fiesta: gorro de Papá Noel y bufanda en Navidad, sombrero de bruja y
// capa de vampiro en Halloween. Se cuelgan del cuerpo del robot, así que se mueven con él.
import * as THREE from 'three'
import type { RobotAvatar } from '@shared/types'
import { canvasTexture } from './assets'
import { bodyMetrics } from './robotModel'
import type { DecorId } from './palette'

export interface Costume {
  group: THREE.Group
  /** Lleva gorro: las orejas o la antena se esconden debajo. */
  hat: boolean
  dispose(): void
}

type Kind = 'santa' | 'scarf' | 'witch' | 'cape' | 'holly'

/** Qué se pone cada robot (según su accesorio, que es el que lo distingue). */
export function costumeFor(decor: DecorId | undefined, avatar: RobotAvatar): Kind | null {
  const free = avatar.accessory === 'none' || avatar.accessory === 'antenna'
  if (decor === 'navidad') {
    if (free || avatar.accessory === 'ears') return 'santa'
    if (avatar.accessory === 'tuft') return 'scarf'
    if (avatar.accessory === 'hair') return 'holly'
  }
  if (decor === 'halloween') {
    if (free) return 'witch'
    if (avatar.accessory === 'vents') return 'cape'
  }
  return null
}

/** Cono doblado hacia atrás y a un lado, como la punta de un gorro de tela. */
function bentCone(r: number, h: number, bend: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, 24, 8)
  g.translate(0, h / 2, 0)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h
    p.setX(i, p.getX(i) + bend * y * y)
    p.setZ(i, p.getZ(i) - bend * 0.5 * y * y)
  }
  g.computeVertexNormals()
  return g
}

const stripes = (a: string, b: string): THREE.CanvasTexture => {
  const t = canvasTexture(64, 8, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? b : a
      ctx.fillRect(i * 8, 0, 8, 8)
    }
  })
  t.wrapS = THREE.RepeatWrapping
  t.repeat.set(3, 1)
  return t
}

export function buildCostume(decor: DecorId | undefined, avatar: RobotAvatar): Costume | null {
  const kind = costumeFor(decor, avatar)
  if (!kind) return null
  const body = bodyMetrics(avatar)
  const f = body.W / 0.86
  const group = new THREE.Group()
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  const tex: THREE.Texture[] = []
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(...pos)
    m.rotation.set(...rot)
    geos.push(geo)
    group.add(m)
    return m
  }
  const mat = <M extends THREE.Material>(m: M): M => {
    mats.push(m)
    return m
  }

  if (kind === 'santa') {
    const red = mat(new THREE.MeshStandardMaterial({ color: '#c8262c', roughness: 0.75, emissive: '#5a0a0c', emissiveIntensity: 0.25 }))
    const white = mat(new THREE.MeshStandardMaterial({ color: '#f6f6f6', roughness: 1, emissive: '#cfd8e6', emissiveIntensity: 0.15 }))
    const hat = new THREE.Group()
    const cone = new THREE.Mesh(bentCone(0.3, 0.56, 0.16), red)
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.075, 10, 32).rotateX(Math.PI / 2), white)
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), white)
    pom.position.set(0.16, 0.56, -0.08)
    for (const m of [cone, brim, pom]) {
      geos.push(m.geometry)
      hat.add(m)
    }
    hat.scale.setScalar(f)
    hat.position.set(0, body.top - 0.13 * f, 0)
    hat.rotation.z = -0.12
    group.add(hat)
  } else if (kind === 'witch') {
    const cloth = mat(new THREE.MeshStandardMaterial({ color: '#2a1638', roughness: 0.8, emissive: '#3a1a5a', emissiveIntensity: 0.3 }))
    const band = mat(new THREE.MeshStandardMaterial({ color: '#ff8a1f', roughness: 0.5, emissive: '#ff6a00', emissiveIntensity: 0.4 }))
    const hat = new THREE.Group()
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.025, 36), cloth)
    const cone = new THREE.Mesh(bentCone(0.28, 0.78, 0.22), cloth)
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.29, 0.08, 24, 1, true), band)
    ring.position.y = 0.05
    for (const m of [brim, cone, ring]) {
      geos.push(m.geometry)
      hat.add(m)
    }
    hat.scale.setScalar(f)
    hat.position.set(0, body.top - 0.1 * f, 0)
    hat.rotation.set(-0.08, 0, 0.1)
    group.add(hat)
  } else if (kind === 'holly') {
    // Ramita de acebo en el pelo: dos hojas con pinchos y tres bayas.
    const leaf = new THREE.Shape()
    leaf.moveTo(0, 0)
    const pts: [number, number][] = [
      [0.05, 0.03],
      [0.04, 0.07],
      [0.08, 0.1],
      [0.05, 0.14],
      [0.07, 0.19],
      [0, 0.24],
      [-0.07, 0.19],
      [-0.05, 0.14],
      [-0.08, 0.1],
      [-0.04, 0.07],
      [-0.05, 0.03]
    ]
    for (const [x, y] of pts) leaf.lineTo(x, y)
    leaf.closePath()
    const green = mat(new THREE.MeshStandardMaterial({ color: '#1f6b35', roughness: 0.4, side: THREE.DoubleSide, emissive: '#0a2a12', emissiveIntensity: 0.4 }))
    const red = mat(new THREE.MeshStandardMaterial({ color: '#d0141e', roughness: 0.25, emissive: '#5a0006', emissiveIntensity: 0.6 }))
    const sprig = new THREE.Group()
    const leafGeo = new THREE.ShapeGeometry(leaf)
    geos.push(leafGeo)
    for (const [rz, rx] of [
      [0.9, -0.5],
      [-0.3, -0.4]
    ]) {
      const l = new THREE.Mesh(leafGeo, green)
      l.rotation.set(rx, 0, rz)
      sprig.add(l)
    }
    const berry = new THREE.SphereGeometry(0.04, 10, 8)
    geos.push(berry)
    for (const [x, y] of [
      [0, 0.02],
      [0.05, 0.04],
      [-0.03, 0.06]
    ]) {
      const b = new THREE.Mesh(berry, red)
      b.position.set(x, y, 0.03)
      sprig.add(b)
    }
    sprig.scale.setScalar(1.3 * f)
    sprig.position.set(-0.24 * f, body.top - 0.06, 0.18)
    sprig.rotation.set(-0.3, 0.3, 0.4)
    group.add(sprig)
  } else if (kind === 'scarf') {
    const t = stripes('#c8262c', '#1f7a45')
    tex.push(t)
    const knit = mat(new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }))
    const y = body.visorBottom - 0.07
    const r = body.radiusAt(y) + 0.02
    const ring = add(new THREE.TorusGeometry(r, 0.075, 10, 40).rotateX(Math.PI / 2), knit, [0, y, 0])
    ring.scale.set(1, 1, body.D / body.W)
    add(new THREE.BoxGeometry(0.15, 0.4, 0.06), knit, [r * 0.45, y - 0.2, (r * body.D) / body.W - 0.02], [0.15, 0.2, 0.1])
  } else {
    // Capa de vampiro: negra por fuera, roja por dentro, con el cuello levantado.
    const out = mat(new THREE.MeshStandardMaterial({ color: '#140a16', roughness: 0.6, side: THREE.FrontSide }))
    const inside = mat(new THREE.MeshStandardMaterial({ color: '#8a1020', roughness: 0.5, emissive: '#3a0008', emissiveIntensity: 0.4, side: THREE.BackSide }))
    const h = body.top - body.bottom
    const back = new THREE.CylinderGeometry(0.6 * f, 0.78 * f, h * 0.86, 28, 1, true, Math.PI - 1.25, 2.5)
    const collar = new THREE.CylinderGeometry(0.66 * f, 0.58 * f, 0.34, 28, 1, true, Math.PI - 1.05, 2.1)
    const yc = body.bottom + h * 0.43 - 0.06
    add(back, out, [0, yc, 0])
    add(back, inside, [0, yc, 0])
    add(collar, out, [0, body.top - 0.1, -0.02], [-0.3, 0, 0])
    add(collar, inside, [0, body.top - 0.1, -0.02], [-0.3, 0, 0])
  }

  return {
    group,
    hat: kind === 'santa' || kind === 'witch',
    dispose() {
      new Set(geos).forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
      tex.forEach((t) => t.dispose())
    }
  }
}
