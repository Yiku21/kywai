import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Solid, WorldStyle } from './models'

type Surface = 'alloy' | 'paint' | 'rubber' | 'brass' | 'stone' | 'water' | 'wood' | 'endgrain' | 'leaf' | 'earth'

/** Fine-scale surface structure. Generated locally, so the worlds need no asset downloads. */
export function surfaceMaps(surface: Surface) {
  const N = 256, albedo = new Uint8Array(N * N * 4), normals = new Uint8Array(N * N * 4), rough = new Uint8Array(N * N * 4)
  const height = new Float32Array(N * N)
  const hash = (x: number, y: number) => {
    const a = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
    return a - Math.floor(a)
  }
  const noiseAt = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
    const a = fx * fx * (3 - 2 * fx), b = fy * fy * (3 - 2 * fy)
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), a), THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), a), b)
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const noise = hash(x, y), u = x / N * Math.PI * 2, v = y / N * Math.PI * 2
    let h = 0.5, shade = 0.9, r = 0.6
    if (surface === 'alloy' || surface === 'brass') { h = 0.45 + Math.sin(v * 110) * 0.006 + noise * 0.003; shade = 0.97 + noise * 0.015; r = 0.4 + noise * 0.035 }
    if (surface === 'paint') { h = 0.5 + noise * 0.004; shade = 0.97 + noise * 0.02; r = 0.5 + noise * 0.04 }
    if (surface === 'rubber') { h = 0.5 + noise * 0.02; shade = 0.9 + noise * 0.07; r = 0.85 }
    if (surface === 'stone') { const vein = Math.abs(Math.sin(u * 2 + 1.6 * Math.sin(v * 3))); h = 0.5 + noise * 0.004; shade = 0.97 - Math.exp(-vein * 60) * 0.045 + noise * 0.01; r = 0.5 + noise * 0.04 }
    if (surface === 'water') { h = 0.5 + Math.sin(u * 4 + Math.sin(v * 3)) * 0.15 + Math.cos(v * 7) * 0.04; shade = 0.95; r = 0.14 }
    if (surface === 'wood') { h = 0.45 + Math.sin(u * 22 + Math.sin(v * 2) * 2 + Math.sin(u * 4)) * 0.065 + noise * 0.025; shade = 0.65 + h * 0.45; r = 0.7 }
    if (surface === 'endgrain') { const radial = Math.hypot(x - N * 0.49, y - N * 0.53); const ring = Math.pow(0.5 + Math.sin(radial * 0.39 + Math.sin(u * 3) * 0.3) * 0.5, 16); h = 0.5 - ring * 0.02; shade = 0.91 - ring * 0.2 + noise * 0.025; r = 0.68 }
    if (surface === 'leaf') { h = 0.5 + Math.exp(-Math.abs(x - N / 2) * 0.4) * 0.1; shade = 0.7 + Math.sin(u) * 0.12 + noise * 0.06; r = 0.5 }
    if (surface === 'earth') { h = 0.4 + noise * 0.12; shade = 0.68 + noiseAt(x / 32, y / 32) * 0.16 + noise * 0.06; r = 0.95 }
    height[y * N + x] = h
    const k = (y * N + x) * 4
    albedo.set([shade * 255, shade * 255, shade * 255, 255], k)
    rough.set([r * 255, r * 255, r * 255, 255], k)
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = height[y * N + (x + 1) % N] - height[y * N + (x + N - 1) % N]
    const dy = height[((y + 1) % N) * N + x] - height[((y + N - 1) % N) * N + x]
    const n = new THREE.Vector3(-dx * 1.5, -dy * 1.5, 1).normalize()
    normals.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], (y * N + x) * 4)
  }
  const texture = (data: Uint8Array) => {
    const t = new THREE.DataTexture(data, N, N)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.magFilter = THREE.LinearFilter
    t.minFilter = THREE.LinearMipmapLinearFilter
    t.generateMipmaps = true
    t.anisotropy = 8
    t.needsUpdate = true
    return t
  }
  const map = texture(albedo)
  map.colorSpace = THREE.SRGBColorSpace
  return { map, normalMap: texture(normals), roughnessMap: texture(rough) }
}

export function surfaceFor(world: WorldStyle, shape: Solid, color: string): Surface {
  if (shape === 'leaf') return 'leaf'
  if (shape === 'cable') return 'rubber'
  if (shape === 'rock' && world === 'orbita') return 'stone'
  if (world === 'bosque' && color === '#aa8651') return 'endgrain'
  if (world === 'bosque') return shape === 'rock' || color === '#253e2c' ? 'earth' : 'wood'
  if (world === 'marfil' && ['#539b9c', '#6bada4'].includes(color)) return 'water'
  if (world === 'marfil' && ['#b39658', '#ba9956'].includes(color)) return 'brass'
  if (world === 'marfil' && color === '#716048') return 'wood'
  if (world === 'marfil') return 'stone'
  if (['#272432', '#503570', '#38254d', '#41364f', '#63468c', '#573982', '#211a32', '#22374f', '#172a43'].includes(color)) return 'paint'
  return 'alloy'
}

/** Curved, bevelled silhouettes replace the blockout primitives. */
export function detailedGeometry(shape: Solid, small = false): THREE.BufferGeometry {
  switch (shape) {
    case 'box': return new RoundedBoxGeometry(1, 1, 1, small ? 1 : 3, 0.035)
    case 'cylinder': return new THREE.CylinderGeometry(1, 1, 1, small ? 12 : 96, 1)
    case 'hex': {
      const s = new THREE.Shape()
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + Math.PI / 6
        if (!i) s.moveTo(Math.cos(a), Math.sin(a)); else s.lineTo(Math.cos(a), Math.sin(a))
      }
      s.closePath()
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.92, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.04, bevelThickness: 0.04 })
      g.translate(0, 0, -0.46)
      g.rotateX(-Math.PI / 2)
      return g
    }
    case 'sphere': return new THREE.SphereGeometry(1, small ? 12 : 64, small ? 8 : 32)
    case 'dome': return new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2)
    case 'rock': {
      const raw = new THREE.IcosahedronGeometry(1, 4)
      raw.deleteAttribute('normal'); raw.deleteAttribute('uv')
      const g = mergeVertices(raw); raw.dispose()
      const p = g.getAttribute('position'), uv = new Float32Array(p.count * 2)
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
        const n = 1 + 0.08 * Math.sin(x * 8 + z * 3) * Math.cos(y * 7)
        p.setXYZ(i, x * n, y * n, z * n)
        uv[i * 2] = Math.atan2(z, x) / (Math.PI * 2) + 0.5
        uv[i * 2 + 1] = y * 0.5 + 0.5
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      g.computeVertexNormals()
      return g
    }
    case 'cone': return new THREE.CylinderGeometry(0.14, 1, 1, 48)
    case 'trunk': {
      const g = new THREE.CylinderGeometry(0.24, 1, 1, 48, 20), p = g.getAttribute('position')
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x)
        const r = 1 + Math.cos(a * 7 + y * 0.8) * 0.06
        p.setXYZ(i, x * r + Math.sin((y + 0.5) * 4) * 0.16, y, z * r + Math.sin((y + 0.5) * 3) * 0.1)
      }
      g.computeVertexNormals(); return g
    }
    case 'cable': {
      const c = new THREE.CubicBezierCurve3(new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(-0.45, -0.5, 0.06), new THREE.Vector3(0.45, -0.5, 0.06), new THREE.Vector3(0.5, 0, 0))
      return new THREE.TubeGeometry(c, 32, 0.018, 8, false)
    }
    case 'orbitDeck': {
      const s = new THREE.Shape(), start = -Math.PI / 4, end = Math.PI * 1.25
      s.absellipse(0, 0, 14, 12, start, end, false, 0)
      s.absellipse(0, 0, 12.7, 10.7, end, start, true, 0)
      s.closePath()
      const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2, curveSegments: 96 })
      g.translate(0, 0, -0.5); g.rotateX(-Math.PI / 2); return g
    }
    case 'orbitRail': {
      const points = Array.from({ length: 193 }, (_, i) => {
        const a = -Math.PI / 4 + i / 192 * Math.PI * 1.5
        return new THREE.Vector3(Math.cos(a) * 14, 0, -Math.sin(a) * 12)
      })
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 192, 0.025, 8, false)
    }
    case 'ring': return new THREE.TorusGeometry(1, 0.012, 12, 128)
    case 'leaf': {
      const g = new THREE.PlaneGeometry(1, 1, 8, 10), p = g.getAttribute('position')
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), x = p.getX(i), width = Math.pow(Math.sin((y + 0.5) * Math.PI), 0.75)
        p.setXYZ(i, x * width, y, Math.abs(x) * -0.14 + Math.sin((y + 0.5) * Math.PI) * 0.09)
      }
      g.computeVertexNormals()
      return g
    }
    case 'arch': {
      const s = new THREE.Shape()
      s.absarc(0, 0, 1, 0, Math.PI, false)
      s.lineTo(-0.86, 0)
      s.absarc(0, 0, 0.86, Math.PI, 0, true)
      s.closePath()
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.02, bevelThickness: 0.02, curveSegments: 48 })
      g.translate(0, 0, -0.15)
      return g
    }
  }
}
