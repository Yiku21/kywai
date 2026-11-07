import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { registry } from '../registry'
import dayUrl from '@/assets/orbit/earth-day.jpg'
import nightUrl from '@/assets/orbit/earth-night.jpg'
import cloudsUrl from '@/assets/orbit/earth-clouds.jpg'
import { earthVertex, earthFragment, cloudFragment, atmosphereFragment } from './earthShaders'
import { orbitFrame, sunDirection } from './orbit'

/** Local 4K maps, shared by the distant Earth and the station's miniature globe. */
export function EarthGlobe({ position, radius }: { position: [number, number, number]; radius: number }) {
  const [dayMap, nightMap, cloudMap] = useTexture([dayUrl, nightUrl, cloudsUrl])
  const globe = useRef<THREE.Mesh>(null!)
  const clouds = useRef<THREE.Mesh>(null!)
  const uniforms = useMemo(() => ({ dayMap: { value: dayMap }, nightMap: { value: nightMap }, cloudMap: { value: cloudMap }, sun: { value: new THREE.Vector3(...sunDirection(0)).normalize() }, cloudOffset: { value: 0 }, work: { value: 0 } }), [dayMap, nightMap, cloudMap])
  useEffect(() => {
    for (const map of [dayMap, nightMap]) map.colorSpace = THREE.SRGBColorSpace
    for (const map of [dayMap, nightMap, cloudMap]) {
      map.wrapS = THREE.RepeatWrapping
      map.anisotropy = 8
      map.needsUpdate = true
    }
  }, [dayMap, nightMap, cloudMap])
  useFrame(() => {
    const { angle, cloudTime } = orbitFrame
    globe.current.rotation.y = 0.4 + angle
    clouds.current.rotation.y = 0.4 + angle + cloudTime * 0.003
    uniforms.sun.value.set(...sunDirection(angle)).normalize()
    uniforms.cloudOffset.value = cloudTime * 0.003 / (Math.PI * 2)
    // Las luces de las ciudades se encienden más cuando el equipo trabaja.
    uniforms.work.value = registry.work
  })
  return <group position={position} rotation-z={0.12}>
    <mesh ref={globe} raycast={() => null}>
      <sphereGeometry args={[radius, 128, 96]} />
      <shaderMaterial vertexShader={earthVertex} fragmentShader={earthFragment} uniforms={uniforms} />
    </mesh>
    <mesh ref={clouds} raycast={() => null}>
      <sphereGeometry args={[radius * 1.004, 128, 96]} />
      <shaderMaterial vertexShader={earthVertex} fragmentShader={cloudFragment} uniforms={uniforms} transparent depthWrite={false} />
    </mesh>
    <mesh raycast={() => null}>
      <sphereGeometry args={[radius * 1.018, 128, 96]} />
      <shaderMaterial vertexShader={earthVertex} fragmentShader={atmosphereFragment} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  </group>
}
