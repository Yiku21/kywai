import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useCowork } from '@/store/cowork'
import { setAnchorObject } from './anchors'
import { GEO, docTexture, glowTexture } from './assets'
import { shellFrag, shellVert } from './shaders'
import { graphiteMat } from './Station'
import { registry, type PulseTarget } from './registry'
import { glowBlending, onPalette, palette, tone } from './palette'
import { coreShape } from './coreShapes'
import { CoreExtras } from './CoreExtras'
import { GiftDressing, giftBase } from './navidad'
import { StoneDressing, pedestal, stoneMaterial } from './halloween'
import { GlassDressing, glassMaterial, glassTiers } from './relicario'
import { LoomSeat, invisibleMaterial } from './telar'

const BLUE_C = new THREE.Color()
const CYAN_C = new THREE.Color()
onPalette((p) => {
  BLUE_C.set(p.primary)
  CYAN_C.set(p.accent)
})
const R = 1.75
/** Base de la bola de nieve: un regalo hexagonal (Navidad). */
const GLOBE_BASE = giftBase(2.5, 0.3)
const CENTER_Y = 2.05

const geo = {
  base: new THREE.CylinderGeometry(2.35, 2.55, 0.26, 6),
  plate: new THREE.CylinderGeometry(2.05, 2.05, 0.04, 48),
  rimBase: new THREE.TorusGeometry(2.05, 0.035, 8, 96),
  orbit: new THREE.TorusGeometry(R + 0.55, 0.022, 8, 160),
  orbit2: new THREE.TorusGeometry(R + 0.3, 0.012, 6, 140),
  card: new THREE.PlaneGeometry(0.46, 0.58),
  node: new THREE.SphereGeometry(0.045, 10, 8),
  ring: new THREE.RingGeometry(1.95, 2.05, 72)
}

/** Núcleo central del proyecto: una esfera de cristal con los documentos del equipo dentro. */
export function Core() {
  // Forma del tema (la esfera, salvo en Relicario, Telar, Halloween y Navidad).
  const style = palette.core ?? 'sphere'
  const shape = coreShape(style, R)
  const sphere = useRef<THREE.Group>(null!)
  const wire = useRef<THREE.LineSegments>(null!)
  const shell = useRef<THREE.Mesh>(null!)
  const orbit = useRef<THREE.Group>(null!)
  const cards = useRef<THREE.Group>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const ringRefs = useRef<THREE.Mesh[]>([])
  const reduced = useCowork((st) => st.reducedEffects)
  const labelAnchor = useRef<THREE.Group>(null!)
  useEffect(() => {
    setAnchorObject('core', labelAnchor.current)
    return () => setAnchorObject('core', null)
  }, [])

  const mats = useMemo(() => {
    const additive = { transparent: true, depthWrite: false, blending: glowBlending(), toneMapped: false }
    return {
      rim: new THREE.MeshBasicMaterial({ color: BLUE_C.clone(), toneMapped: false }),
      plate: new THREE.MeshStandardMaterial({ color: tone('#141a3a'), metalness: 0.5, roughness: 0.3, emissive: BLUE_C, emissiveIntensity: 0.1 }),
      shell: new THREE.ShaderMaterial({
        vertexShader: shellVert,
        fragmentShader: shellFrag,
        side: THREE.DoubleSide,
        ...additive,
        // La bola de nieve es de cristal blanco hielo; el resto, del color del tema.
        uniforms: { uColor: { value: new THREE.Color(style === 'globe' ? '#cfe4ff' : tone('#5f9dff')) }, uIntensity: { value: 1 }, uTime: { value: 0 } }
      }),
      wire: new THREE.LineBasicMaterial({ color: new THREE.Color(tone('#6fa8ff')), opacity: 0.32, ...additive }),
      orbit: new THREE.MeshBasicMaterial({ color: CYAN_C.clone().multiplyScalar(1.3), opacity: 0.9, ...additive }),
      orbit2: new THREE.MeshBasicMaterial({ color: BLUE_C.clone().multiplyScalar(1.2), opacity: 0.6, ...additive }),
      card: new THREE.MeshBasicMaterial({ map: docTexture, color: new THREE.Color(tone('#a9d4ff')).multiplyScalar(1.35), side: THREE.DoubleSide, ...additive }),
      node: new THREE.MeshBasicMaterial({ color: new THREE.Color(tone('#cfe0ff')).multiplyScalar(1.6), toneMapped: false }),
      glow: new THREE.MeshBasicMaterial({ map: glowTexture, color: BLUE_C.clone(), opacity: 0.45, ...additive }),
      inner: new THREE.SpriteMaterial({ map: glowTexture, color: new THREE.Color(tone('#3d6bff')), opacity: 0.35, ...additive }),
      rings: [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: CYAN_C.clone(), opacity: 0, side: THREE.DoubleSide, ...additive }))
    }
  }, [])

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => (Array.isArray(m) ? m.forEach((x) => x.dispose()) : m.dispose()))
    },
    [mats]
  )

  // Nodos sobre la esfera (fijos) y documentos que orbitan dentro.
  const nodes = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const lat = Math.asin(((i * 0.618) % 1) * 1.6 - 0.8)
        const lon = i * 2.39996
        return new THREE.Vector3(Math.cos(lat) * Math.sin(lon) * R, Math.sin(lat) * R, Math.cos(lat) * Math.cos(lon) * R)
      }),
    []
  )
  const cardSpecs = useMemo(
    () => [
      { r: 0.95, y: 0.35, a: 0.2, s: 1 },
      { r: 0.85, y: -0.25, a: 2.3, s: 0.9 },
      { r: 1.0, y: 0.05, a: 4.1, s: 0.95 },
      { r: 0.35, y: 0.0, a: 1.2, s: 1.15 },
      { r: 0.7, y: 0.6, a: 3.3, s: 0.75 }
    ],
    []
  )

  const pulses = useRef([0, 1, 2].map(() => ({ start: -10, color: new THREE.Color(), strength: 1 })))
  const next = useRef(0)
  const spinBoost = useRef(0)
  useEffect(() => {
    const fx: PulseTarget = {
      pulse(color, strength = 1) {
        const p = pulses.current[next.current++ % 3]
        p.start = registry.time
        p.color.set(color)
        p.strength = strength
        spinBoost.current = Math.min(2.5, spinBoost.current + 1.6 * strength)
      }
    }
    registry.core = fx
    return () => {
      if (registry.core === fx) registry.core = null
    }
  }, [])

  useFrame((state, dt) => {
    const t = registry.time
    const amb = reduced ? 0.25 : 1
    spinBoost.current = Math.max(0, spinBoost.current - dt * 1.6)
    let boost = 0
    pulses.current.forEach((p, i) => {
      const m = ringRefs.current[i]
      if (!m) return
      const k = (t - p.start) / 1.25
      if (k >= 0 && k < 1) {
        m.visible = true
        m.scale.setScalar(1 + k * 0.9)
        const mat = m.material as THREE.MeshBasicMaterial
        mat.color.copy(p.color).lerp(CYAN_C, 0.35).multiplyScalar(1.5)
        mat.opacity = (1 - k) * (1 - k) * 0.8 * p.strength
        boost += (1 - k) * p.strength
      } else m.visible = false
    })
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.9)
    // Pulso de la música: se suma a los destellos de las transferencias.
    boost += registry.beat * 0.9
    // La calabaza no gira: su cara mira siempre al frente. El resto gira con sus líneas.
    if (style !== 'pumpkin') wire.current.rotation.y += dt * (0.06 * amb + spinBoost.current * 0.4)
    shell.current.rotation.y = wire.current.rotation.y
    orbit.current.rotation.y -= dt * (0.25 * amb + spinBoost.current * 0.6)
    sphere.current.position.y = CENTER_Y + Math.sin(t * 0.7) * 0.05 * amb
    cards.current.rotation.y += dt * (0.12 * amb + spinBoost.current * 0.3)
    cards.current.children.forEach((c, i) => {
      const sp = cardSpecs[i]
      c.position.y = sp.y + Math.sin(t * 0.8 + i * 1.7) * 0.06 * amb
      // Cada tarjeta mira hacia fuera, ligeramente inclinada hacia la cámara.
      c.lookAt(state.camera.position)
    })
    mats.rim.color.copy(BLUE_C).multiplyScalar(0.8 + breathe * 0.35 * amb + boost * 1.2)
    mats.shell.uniforms.uTime.value = t
    mats.shell.uniforms.uIntensity.value = 0.9 + breathe * 0.2 * amb + boost * 0.8
    // Las líneas son lo que dibuja las formas de los temas (aristas, gajos, trama): más visibles que en la esfera.
    mats.wire.opacity = (0.28 + boost * 0.3) * (style === 'sphere' ? 1 : 2.2)
    mats.glow.opacity = 0.35 + breathe * 0.1 * amb + boost * 0.25
    mats.inner.opacity = 0.3 + breathe * 0.1 * amb + boost * 0.35
    if (light.current) light.current.intensity = 2 + breathe * 0.6 * amb + boost * 3
  })

  const focus = (e: { stopPropagation(): void }) => {
    e.stopPropagation()
    const st = useCowork.getState()
    st.select(null)
    st.cameraCommand({ type: 'focus', x: 0, z: 0 })
  }

  return (
    <group>
      {/* Base hexagonal baja con anillo luminoso */}
      <mesh
        geometry={style === 'globe' ? GLOBE_BASE : style === 'pumpkin' ? pedestal(2.65, 0, 0.32) : style === 'crystal' ? glassTiers(2.75, 0, 0.36) : geo.base}
        material={style === 'pumpkin' ? stoneMaterial() : style === 'crystal' ? glassMaterial() : style === 'weave' ? invisibleMaterial() : graphiteMat}
        position={[0, style === 'pumpkin' || style === 'crystal' ? 0 : 0.13, 0]}
        onClick={focus}
      />
      {style === 'crystal' && <GlassDressing r={2.75} y0={0} h={0.36} />}
      {style === 'weave' && <LoomSeat r={2.7} y={0.6} reduced={reduced} yaw={0.4} />}
      {style === 'pumpkin' && <StoneDressing r={2.65} top={0.32} ground={0} reduced={reduced} seed={9} pumpkins={false} />}
      {style === 'globe' && <GiftDressing r={2.5} y0={-0.02} h={0.3} snowCap="ring" reduced={reduced} seed={7} />}
      <mesh geometry={geo.plate} material={mats.plate} position={[0, 0.27, 0]} />
      <mesh geometry={geo.rimBase} material={mats.rim} position={[0, 0.29, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={GEO.glowPlane} material={mats.glow} position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={6.5} />
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) ringRefs.current[i] = m
          }}
          geometry={geo.ring}
          material={mats.rings[i]}
          position={[0, 0.31, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        />
      ))}

      <group ref={sphere} position={[0, CENTER_Y, 0]}>
        {/* Lo propio de cada forma va dentro de la superficie y gira con ella (la calabaza no gira). */}
        <mesh ref={shell} geometry={shape.shell} material={mats.shell} onClick={focus}>
          <CoreExtras style={style} radius={R} reduced={reduced} />
        </mesh>
        <lineSegments ref={wire} geometry={shape.wire} material={mats.wire} />
        <sprite material={mats.inner} scale={[2.6, 2.6, 1]} />
        {shape.nodes &&
          nodes.map((p, i) => <mesh key={i} geometry={geo.node} material={mats.node} position={p} />)}
        <group ref={cards}>
          {cardSpecs.map((c, i) => (
            <mesh
              key={i}
              geometry={geo.card}
              material={mats.card}
              position={[Math.cos(c.a) * c.r, c.y, Math.sin(c.a) * c.r]}
              scale={c.s}
            />
          ))}
        </group>
        <group ref={orbit} rotation={[0.42, 0, 0.18]}>
          <mesh geometry={geo.orbit} material={mats.orbit} rotation={[Math.PI / 2, 0, 0]} />
        </group>
        <mesh geometry={geo.orbit2} material={mats.orbit2} rotation={[Math.PI / 2 - 0.2, 0.3, 0]} />
      </group>
      <pointLight ref={light} position={[0, 2.2, 0]} color={BLUE_C} distance={10} decay={2} intensity={2} />
      <group ref={labelAnchor} position={[0, 0.4, 2.85]} />
    </group>
  )
}
