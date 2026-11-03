import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GEO, wallTexture } from './assets'
import { cityFrag, cityVert, floorFrag, floorVert, holoVert, panelFrag, particleFrag, particleVert } from './shaders'
import { FOG_FAR, FOG_NEAR, cityUniforms, floorUniforms, glowBlending, palette, panelInk, tone } from './palette'
import { registry } from './registry'
import type { QualitySettings } from './quality'

/** Generador con semilla: el escenario es siempre el mismo. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Floor({ reduced }: { reduced: boolean }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: floorVert,
        fragmentShader: floorFrag,
        // Sin profundidad: se pinta primero y el globo del fondo puede verse más allá de la oficina.
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uAmbient: { value: 1 }, uFog: { value: new THREE.Color(palette.fog) }, ...floorUniforms() }
      }),
    []
  )
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(() => {
    mat.uniforms.uTime.value = registry.time
    mat.uniforms.uAmbient.value = reduced ? 0 : 1
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} material={mat} renderOrder={-10}>
      <planeGeometry args={[160, 160]} />
    </mesh>
  )
}

export interface Building {
  x: number
  z: number
  w: number
  d: number
  h: number
  seed: number
  k: number
}

/** Edificios de la ciudad (los mismos siempre): posición, tamaño, altura y semilla de cada uno. */
export function cityLayout(count: number): { items: Building[]; tops: Building[] } {
  const rnd = seeded(42)
  const cands: Building[] = []
  const STEP = 2.5
  for (let gx = -14; gx <= 14; gx++) {
    for (let gz = -15; gz <= 3; gz++) {
      const x = gx * STEP + (rnd() - 0.5) * 0.7
      const z = gz * STEP + (rnd() - 0.5) * 0.7
      // Libres: la oficina con sus zonas y el frente de la cámara.
      if (Math.abs(x) < 13 && z > -10) continue
      if (z > 7) continue
      if (rnd() < 0.18) continue
      const far = THREE.MathUtils.clamp((-z - 10) / 18, 0, 1)
      const side = THREE.MathUtils.clamp((Math.abs(x) - 13) / 14, 0, 1)
      let h = 0.5 + rnd() * (0.8 + far * 6.5 + side * 2.2)
      if (z > -5) h = Math.min(h, 1 + rnd() * 1.4)
      const slim = h > 4 ? 0.75 : 1
      cands.push({ x, z, w: (0.9 + rnd() * 1.15) * slim, d: (0.9 + rnd() * 1.15) * slim, h, seed: rnd(), k: rnd() })
    }
  }
  // Con menos calidad se quitan primero los bloques bajos de los lados.
  cands.sort((p, q) => q.h * 0.6 + q.k - (p.h * 0.6 + p.k))
  const items = cands.slice(0, count)
  const tops = items.filter((it) => it.h > 3.6)
  return { items, tops }
}

/** Ciudad digital alrededor de la oficina: bloques con ventanas encendidas, más altos al fondo. */
function City({ count, reduced }: { count: number; reduced: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const beacons = useRef<THREE.InstancedMesh>(null!)

  const data = useMemo(() => cityLayout(count), [count])

  const mats = useMemo(() => {
    const body = new THREE.ShaderMaterial({
      vertexShader: cityVert,
      fragmentShader: cityFrag,
      uniforms: {
        uTime: { value: 0 },
        uAmbient: { value: 1 },
        uFog: { value: new THREE.Color(palette.fog) },
        uFogNear: { value: FOG_NEAR },
        uFogFar: { value: FOG_FAR + 8 },
        ...cityUniforms()
      }
    })
    const beacon = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
    return { body, beacon }
  }, [])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  const seeds = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(data.items.map((it) => it.seed)), 1), [data])

  useEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    const q = new THREE.Quaternion()
    data.items.forEach((it, i) => {
      m.compose(new THREE.Vector3(it.x, it.h / 2, it.z), q, new THREE.Vector3(it.w, it.h, it.d))
      ref.current.setMatrixAt(i, m)
    })
    ref.current.geometry.setAttribute('aSeed', seeds)
    ref.current.instanceMatrix.needsUpdate = true
    data.tops.forEach((it, i) => {
      m.compose(new THREE.Vector3(it.x, it.h + 0.12, it.z), q, new THREE.Vector3(0.09, 0.24, 0.09))
      beacons.current.setMatrixAt(i, m)
      c.set(tone(it.seed > 0.5 ? '#7c5cff' : '#38b6ff')).multiplyScalar(1.6)
      beacons.current.setColorAt(i, c)
    })
    beacons.current.instanceMatrix.needsUpdate = true
    if (beacons.current.instanceColor) beacons.current.instanceColor.needsUpdate = true
  }, [data, seeds])

  useFrame(() => {
    mats.body.uniforms.uTime.value = registry.time
    mats.body.uniforms.uAmbient.value = reduced ? 0 : 1
  })

  // Geometría propia: lleva el atributo de semilla por instancia.
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  useEffect(() => () => geo.dispose(), [geo])

  return (
    <>
      <instancedMesh ref={ref} args={[geo, mats.body, data.items.length]} frustumCulled={false} />
      <instancedMesh ref={beacons} args={[GEO.cube, mats.beacon, Math.max(1, data.tops.length)]} />
    </>
  )
}

/** Pequeños fragmentos geométricos flotando a distintas alturas y ritmos. */
function Fragments({ count, reduced }: { count: number; reduced: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const items = useMemo(() => {
    const rnd = seeded(7)
    return Array.from({ length: count }, () => {
      const a = rnd() * Math.PI * 2
      const r = 4 + rnd() * 10
      return { x: Math.cos(a) * r, y: 2.2 + rnd() * 3.8, z: Math.sin(a) * r * 0.75 - 1.5, s: 0.5 + rnd() * 0.9, ph: rnd() * 10, sp: 0.2 + rnd() * 0.5, rs: (rnd() - 0.5) * 0.8 }
    })
  }, [count])
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: tone('#141a44'), emissive: tone('#5a7dff'), emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.3, transparent: true, opacity: 0.85 }),
    []
  )
  useEffect(() => () => mat.dispose(), [mat])
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const t = registry.time
    const k = reduced ? 0.1 : 1
    items.forEach((it, i) => {
      e.set(t * it.rs * k + it.ph, t * it.rs * 0.7 * k, 0)
      q.setFromEuler(e)
      v.set(it.x, it.y + Math.sin(t * it.sp * k + it.ph) * 0.3, it.z)
      sc.setScalar(it.s)
      m4.compose(v, q, sc)
      ref.current.setMatrixAt(i, m4)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[GEO.fragment, mat, items.length]} />
}

/** Partículas lentas en tres profundidades. Tenues y sin seguir caminos: no se confunden con transferencias. */
function Particles({ count, reduced }: { count: number; reduced: boolean }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const geo = useMemo(() => {
    const rnd = seeded(99)
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    const size = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const layer = i % 3
      pos[i * 3] = (rnd() - 0.5) * (layer === 0 ? 26 : layer === 1 ? 40 : 60)
      pos[i * 3 + 1] = rnd() * 9
      pos[i * 3 + 2] = layer === 0 ? -6 + rnd() * 14 : layer === 1 ? -16 + rnd() * 18 : -32 + rnd() * 22
      seed[i] = rnd()
      size[i] = layer === 0 ? 2.2 + rnd() * 2 : layer === 1 ? 1.6 + rnd() * 1.6 : 1.2 + rnd() * 1.2
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    return g
  }, [count])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: particleVert,
        fragmentShader: particleFrag,
        transparent: true,
        depthWrite: false,
        blending: glowBlending(),
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uMotion: { value: 1 }, uColor: { value: new THREE.Color(tone('#9fb4ff')) } }
      }),
    []
  )
  useEffect(() => () => {
    geo.dispose()
  }, [geo])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(() => {
    mat.uniforms.uTime.value = registry.time
    mat.uniforms.uPixelRatio.value = dpr
    mat.uniforms.uMotion.value = reduced ? 0.12 : 1
  })
  return <points geometry={geo} material={mat} frustumCulled={false} />
}

interface WallSpec {
  pos: [number, number, number]
  rotY: number
  size: [number, number]
  title: string[]
  lines: string[]
  align: 'left' | 'right'
  seed: number
}

const WALLS: WallSpec[] = [
  { pos: [-10.6, 2.6, -10.4], rotY: 0.45, size: [2.6, 3.6], title: [], lines: ['IDEAS', 'PERSONAS', 'PROYECTOS', 'RESULTADOS'], align: 'left', seed: 0.1 },
  { pos: [10.8, 2.6, -10.6], rotY: -0.45, size: [2.6, 3.6], title: [], lines: ['UN MUNDO', 'DE IA', 'TRABAJANDO', 'JUNTOS'], align: 'right', seed: 0.5 }
]

function HoloWalls({ reduced }: { reduced: boolean }) {
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let alive = true
    document.fonts
      .load('italic 600 74px "Inter Variable"')
      .catch(() => undefined)
      .finally(() => alive && setFontsReady(true))
    return () => {
      alive = false
    }
  }, [])
  const mats = useMemo(() => {
    if (!fontsReady) return []
    return WALLS.map(
      (w) =>
        new THREE.ShaderMaterial({
          vertexShader: holoVert,
          fragmentShader: panelFrag,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: glowBlending(),
          uniforms: {
            uMap: { value: wallTexture(w.title, w.lines, w.align) },
            uColor: { value: new THREE.Color(tone('#5b8cff')) },
            uTime: { value: 0 },
            uSeed: { value: w.seed },
            uAmbient: { value: 1 },
            uOpacity: { value: 0.75 },
            uInk: { value: panelInk() }
          }
        })
    )
  }, [fontsReady])
  useEffect(
    () => () =>
      mats.forEach((m) => {
        ;(m.uniforms.uMap.value as THREE.Texture).dispose()
        m.dispose()
      }),
    [mats]
  )
  useFrame(() => {
    for (const m of mats) {
      m.uniforms.uTime.value = registry.time
      m.uniforms.uAmbient.value = reduced ? 0 : 1
    }
  })
  if (!mats.length) return null
  return (
    <>
      {WALLS.map((w, i) => (
        <mesh key={i} position={w.pos} rotation={[0, w.rotY, 0]} material={mats[i]}>
          <planeGeometry args={w.size} />
        </mesh>
      ))}
    </>
  )
}

export function Ambient({ q, reduced }: { q: QualitySettings; reduced: boolean }) {
  return (
    <>
      <Floor reduced={reduced} />
      <City count={q.structures} reduced={reduced} />
      <Fragments count={q.fragments} reduced={reduced} />
      <Particles count={q.particles} reduced={reduced} />
      <HoloWalls reduced={reduced} />
    </>
  )
}
