import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { tuneForNight } from './nightLight'

/**
 * De noche, lo que tiene luz propia en la escena (neón, pantallas, ventanas, fuego, ojos de los robots) brilla más:
 * recorre los materiales al cambiar la noche y, mientras es de noche, cada poco para alcanzar a las piezas que se
 * montan después (modelos que tardan en cargar, becarios nuevos). Al amanecer todo vuelve a su brillo de día.
 */
export function NightGlow({ night, boost }: { night: number; boost: number }) {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const apply = () => {
      scene.traverse((o) => {
        const material = (o as THREE.Mesh).material
        if (!material) return
        if (Array.isArray(material)) material.forEach((m) => tuneForNight(m, night, boost))
        else tuneForNight(material, night, boost)
      })
      invalidate()
    }
    apply()
    if (night <= 0) return
    const id = window.setInterval(apply, 2500)
    return () => window.clearInterval(id)
  }, [scene, night, boost, invalidate])
  return null
}
