import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { glowTexture } from './assets'
import { backdropFrag, backdropVert } from './shaders'
import { registry } from './registry'
import { glowBlending, palette, tone } from './palette'

/** Distancia del fondo a la cámara: siempre por detrás de la ciudad. */
const DIST = 110
const RADIUS = 22
/** Altura del centro del globo en el encuadre: solo asoma la cúpula, por encima del horizonte. */
const GLOBE_Y = 6

function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function onSphere(lat: number, lon: number, r: number): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(lat) * Math.sin(lon) * r, Math.sin(lat) * r, Math.cos(lat) * Math.cos(lon) * r)
}

/** Globo de red: paralelos, meridianos, rutas entre nodos y nodos luminosos. */
function globeGeometry(): { grid: THREE.BufferGeometry; routes: THREE.BufferGeometry; nodes: THREE.BufferGeometry } {
  const grid: number[] = []
  const seg = 96
  for (let k = -5; k <= 5; k++) {
    const lat = (k / 6) * (Math.PI / 2)
    for (let i = 0; i < seg; i++) {
      const a = onSphere(lat, (i / seg) * Math.PI * 2, RADIUS)
      const b = onSphere(lat, ((i + 1) / seg) * Math.PI * 2, RADIUS)
      grid.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  for (let m = 0; m < 18; m++) {
    const lon = (m / 18) * Math.PI * 2
    for (let i = 0; i < seg / 2; i++) {
      const a = onSphere(-Math.PI / 2 + (i / (seg / 2)) * Math.PI, lon, RADIUS)
      const b = onSphere(-Math.PI / 2 + ((i + 1) / (seg / 2)) * Math.PI, lon, RADIUS)
      grid.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  const rnd = seeded(5)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < 70; i++) pts.push(onSphere(Math.asin(rnd() * 2 - 1) * 0.9, rnd() * Math.PI * 2, RADIUS * 1.003))
  const routes: number[] = []
  for (let i = 0; i < 46; i++) {
    const a = pts[Math.floor(rnd() * pts.length)]
    const b = pts[Math.floor(rnd() * pts.length)]
    if (a === b || a.angleTo(b) > 1.4) continue
    // Arco sobre la superficie, levantado un poco en el centro.
    const steps = 24
    let prev = a.clone()
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const p = a.clone().lerp(b, t).normalize().multiplyScalar(RADIUS * (1.003 + Math.sin(t * Math.PI) * 0.06))
      routes.push(prev.x, prev.y, prev.z, p.x, p.y, p.z)
      prev = p
    }
  }
  const make = (arr: number[]) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    return g
  }
  return { grid: make(grid), routes: make(routes), nodes: make(pts.flatMap((p) => [p.x, p.y, p.z])) }
}

/**
 * Fondo del espacio: un globo de red enorme y un resplandor de horizonte. Acompaña a la cámara para
 * quedar siempre arriba, detrás de la ciudad; sobre la oficina no se dibuja (ver backdropFrag).
 */
export function Backdrop({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null!)
  const globe = useRef<THREE.Group>(null!)
  const geo = useMemo(globeGeometry, [])
  const mats = useMemo(() => {
    const make = (color: THREE.Color, opacity: number, kind: 0 | 1 | 2, size = 0) =>
      new THREE.ShaderMaterial({
        vertexShader: backdropVert,
        fragmentShader: backdropFrag,
        transparent: true,
        depthWrite: false,
        blending: glowBlending(),
        uniforms: {
          uColor: { value: color },
          uOpacity: { value: opacity },
          uKind: { value: kind },
          uSize: { value: size },
          uMap: { value: glowTexture }
        }
      })
    return {
      grid: make(new THREE.Color(palette.primary).multiplyScalar(0.9), 0.7, 0),
      routes: make(new THREE.Color(tone('#7fb0ff')), 0.7, 0),
      nodes: make(new THREE.Color(tone('#bcd2ff')), 0.9, 1, 2.4),
      glow: make(new THREE.Color(palette.secondary).lerp(new THREE.Color(palette.primary), 0.5), 0.5, 2),
      core: make(new THREE.Color(palette.primary), 0.35, 2)
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      Object.values(mats).forEach((m) => m.dispose())
    },
    [geo, mats]
  )

  useFrame((state, dt) => {
    const cam = state.camera
    group.current.position.copy(cam.position)
    group.current.quaternion.copy(cam.quaternion)
    globe.current.rotation.y += dt * (reduced ? 0.004 : 0.018)
    mats.routes.uniforms.uOpacity.value = 0.55 + 0.2 * Math.sin(registry.time * 0.6)
  })

  return (
    <group ref={group}>
      <group position={[0, 0, -DIST]}>
        <mesh material={mats.glow} scale={[190, 46, 1]} position={[0, 21, -RADIUS - 6]} renderOrder={-3}>
          <planeGeometry args={[1, 1]} />
        </mesh>
        <mesh material={mats.core} scale={[70, 70, 1]} position={[0, GLOBE_Y + 4, -RADIUS]} renderOrder={-3}>
          <planeGeometry args={[1, 1]} />
        </mesh>
        <group ref={globe} position={[0, GLOBE_Y, 0]} rotation={[0.35, 0, 0.12]}>
          <lineSegments geometry={geo.grid} material={mats.grid} renderOrder={-2} />
          <lineSegments geometry={geo.routes} material={mats.routes} renderOrder={-2} />
          <points geometry={geo.nodes} material={mats.nodes} renderOrder={-2} />
        </group>
      </group>
    </group>
  )
}
