import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GlowPoints } from './GlowPoints'
import { coreShape, pumpkinFaceGeometry, pumpkinFaceTexture } from './coreShapes'
import { registry } from './registry'
import { GlobeInside } from './navidad'
import { WovenBands } from './telar'
import { glowBlending, palette, type CoreStyle } from './palette'

const CRYSTAL_AT = [0, 0.12, 0]

/** Lo que cada forma del núcleo lleva además de su superficie (en el centro del núcleo). */
export function CoreExtras({ style, radius, reduced }: { style: CoreStyle; radius: number; reduced: boolean }) {
  if (style === 'pumpkin') return <Pumpkin R={radius} reduced={reduced} />
  if (style === 'globe') return <GlobeInside R={radius} reduced={reduced} />
  if (style === 'crystal') return <InnerCrystal R={radius} reduced={reduced} />
  if (style === 'weave') return <WovenBands geometry={coreShape('weave', radius).shell} reduced={reduced} />
  return null
}

/** Calabaza: cara tallada que brilla como una vela y su tallo. */
function Pumpkin({ R, reduced }: { R: number; reduced: boolean }) {
  const face = useMemo(() => {
    const map = pumpkinFaceTexture()
    return {
      map,
      geo: pumpkinFaceGeometry(R),
      mat: new THREE.MeshBasicMaterial({ map, color: new THREE.Color('#ffb347').multiplyScalar(1.6), transparent: true, depthWrite: false, blending: glowBlending(), toneMapped: false, side: THREE.DoubleSide }),
      // Piel de la calabaza, translúcida para que se vean los documentos dentro.
      skin: new THREE.MeshStandardMaterial({ color: '#d4601a', emissive: '#ff6a00', emissiveIntensity: 0.75, roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false })
    }
  }, [R])
  const stem = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.1, 0.2, 0.55, 7)
    g.translate(0, 0.27, 0)
    return { geo: g, mat: new THREE.MeshStandardMaterial({ color: '#4d5a26', roughness: 0.8 }) }
  }, [])
  useEffect(
    () => () => {
      face.map.dispose()
      face.geo.dispose()
      face.mat.dispose()
      face.skin.dispose()
      stem.geo.dispose()
      stem.mat.dispose()
    },
    [face, stem]
  )
  useFrame(() => {
    const t = registry.time
    const f = reduced ? 1 : 1 + 0.12 * Math.sin(t * 9.1) + 0.08 * Math.sin(t * 23.7)
    face.mat.color.set('#ffc25a').multiplyScalar(2.4 * f + registry.beat * 0.6)
  })
  return (
    <>
      <mesh geometry={coreShape('pumpkin', R).shell} material={face.skin} scale={0.985} />
      <mesh geometry={face.geo} material={face.mat} />
      <mesh geometry={stem.geo} material={stem.mat} position={[0, R * 0.62, 0]} rotation={[0.15, 0, -0.2]} />
    </>
  )
}

/** Relicario: un cristal más pequeño que brilla dentro y gira al revés. */
function InnerCrystal({ R, reduced }: { R: number; reduced: boolean }) {
  const parts = useMemo(
    () => ({
      geo: new THREE.OctahedronGeometry(R * 0.22, 0).scale(1, 1.4, 1),
      // Facetas de cristal que reflejan las luces del entorno.
      ring: new THREE.TorusGeometry(R * 1.12, 0.016, 6, 140),
      ringMat: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(1.5), toneMapped: false, transparent: true, opacity: 0.85 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#f4f6ff', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.16, envMapIntensity: 2.4, flatShading: true, depthWrite: false, side: THREE.DoubleSide }),
      mat: new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.primary).multiplyScalar(1.6), transparent: true, opacity: 0.85, blending: glowBlending(), depthWrite: false, toneMapped: false })
    }),
    [R]
  )
  useEffect(
    () => () => {
      parts.geo.dispose()
      parts.mat.dispose()
      parts.glass.dispose()
      parts.ring.dispose()
      parts.ringMat.dispose()
    },
    [parts]
  )
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y -= dt * (reduced ? 0.1 : 0.5)
  })
  return (
    <>
      <mesh geometry={coreShape('crystal', R).shell} material={parts.glass} />
      <mesh ref={ref} geometry={parts.geo} material={parts.mat} position={[0, 0.12, 0]} />
      {/* Dos anillos de oro inclinados que la rodean. */}
      <mesh geometry={parts.ring} material={parts.ringMat} rotation={[1.2, 0.3, 0.2]} />
      <mesh geometry={parts.ring} material={parts.ringMat} rotation={[1.95, -0.5, 0.1]} scale={1.08} />
      <GlowPoints positions={CRYSTAL_AT} color={palette.primary} size={1.6} opacity={0.55} reduced={reduced} />
    </>
  )
}
