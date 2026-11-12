import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { registry } from './registry'
import { glowSpots, nightRamp, spaceNight } from './nightLight'
import type { Piece } from './worlds/models'

/**
 * Luz que irradia de lo que brilla (neón, conductos, fuego) cuando anochece: unas pocas luces puntuales colocadas en
 * los sitios con más brillo del escenario, con 0 de día. Están siempre (aunque sea a 0) para no recompilar los
 * materiales al anochecer.
 */
export function NightRadiance({ pieces, max, power, distance }: { pieces: Piece[]; max: number; power: number; distance: number }) {
  const spots = useMemo(() => glowSpots(pieces, max), [pieces, max])
  const lights = useRef<(THREE.PointLight | null)[]>([])
  useFrame(() => {
    const n = nightRamp(spaceNight.value, 0.1, 0.85)
    spots.forEach((spot, i) => {
      const light = lights.current[i]
      if (light) light.intensity = power * spot.weight * n * (1 + 0.05 * Math.sin(registry.time * 1.3 + i * 2.1))
    })
  })
  return <>{spots.map((spot, i) => <pointLight key={i} ref={(l) => { lights.current[i] = l }} position={spot.at} color={spot.color}
    intensity={0} distance={distance} decay={1.7} />)}</>
}
