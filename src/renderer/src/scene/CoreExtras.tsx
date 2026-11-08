import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { coreShape, pumpkinFaceGeometry, pumpkinFaceTexture } from './coreShapes'
import { registry } from './registry'
import { GlobeInside } from './navidad'
import { RelicGem } from './worlds/RelicGem'
import { CrystalKnot } from './worlds/CrystalWeave'
import { glowBlending, type CoreStyle } from './palette'

/** Lo que cada forma del núcleo lleva además de su superficie (en el centro del núcleo). */
export function CoreExtras({ style, radius, reduced }: { style: CoreStyle; radius: number; reduced: boolean }) {
  if (style === 'pumpkin') return <Pumpkin R={radius} reduced={reduced} />
  if (style === 'globe') return <GlobeInside R={radius} reduced={reduced} />
  if (style === 'crystal') return <RelicGem radius={radius} reduced={reduced} />
  if (style === 'weave') return <CrystalKnot radius={radius} reduced={reduced} />
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
      skin: new THREE.MeshStandardMaterial({ color: '#d4601a', emissive: '#ff6a00', emissiveIntensity: 0.18, roughness: 0.72, transparent: true, opacity: 0.85, depthWrite: false })
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
