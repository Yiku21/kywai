import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useCowork } from '@/store/cowork'
import { t } from '@/lib/i18n'
import { musicDanceSignal } from '@/lib/music'
import { registry } from './registry'
import { SocialLife as SocialDirector, type SocialEvent } from './socialDirector'
import { useBubbles } from './bubbleStore'

const lines: Record<SocialEvent, () => string> = {
  invite: () => t('¿Una partida rápida?'),
  caught: () => t('¡Lo tengo! ¡Te toca!'),
  boo: () => t('¡Buuu!'),
  startled: () => t('¡Ay, qué susto!'),
  laugh: () => t('¡Je, je! Ya estás despierto.'),
  hello: () => t('¡Hola, vecino!'),
  reply: () => t('¡Buenas! ¿Todo bien?'),
  danceInvite: () => t('¿Bailamos?'),
  danceReply: () => t('¡Sigue el ritmo!'),
  copyMe: () => t('¡Haz como yo!'),
  copied: () => t('¡Casi me sale!'),
  bumpInvite: () => t('¡Choca esa antena!'),
  team: () => t('¡Equipo!'),
  cheer: () => t('¡Ánimo, compañero!'),
  thanks: () => t('¡Gracias por los ánimos!')
}

/** Un juguete compartido y animaciones ligeras; el motor de trabajo no participa. */
export function SocialLife() {
  const director = useMemo(() => new SocialDirector(), [])
  const toy = useRef<THREE.Group>(null!)
  const document = useRef<THREE.Group>(null!)
  const browser = useRef<THREE.Group>(null!)
  const spark = useRef<THREE.Group>(null!)
  const heart = useRef<THREE.Group>(null!)
  useEffect(() => {
    director.onEvent = (id, event) => useBubbles.getState().social(id, lines[event]())
    director.onCancel = id => useBubbles.getState().clearSocial(id)
    return () => { director.clear(); director.onEvent = null; director.onCancel = null }
  }, [director])
  useFrame(sceneState => {
    director.update(registry.time, registry.brains, useCowork.getState().reducedEffects, musicDanceSignal(performance.now()), sceneState.camera.position)
    const state = director.toy
    toy.current.visible = state.visible
    if (!state.visible) return
    toy.current.position.copy(state.position)
    toy.current.rotation.set(Math.sin(state.rotation) * 0.2, state.rotation, 0.15)
    toy.current.scale.setScalar(state.scale)
    document.current.visible = state.kind === 'document'
    browser.current.visible = state.kind === 'browser'
    spark.current.visible = state.kind === 'spark'
    heart.current.visible = state.kind === 'heart'
  }, -20)
  return <group ref={toy} visible={false}>
    <group ref={document}>
      <mesh><boxGeometry args={[0.5, 0.65, 0.07]} /><meshStandardMaterial color="#eafaff" emissive="#4da8c4" emissiveIntensity={0.4} roughness={0.3} /></mesh>
      {[0.15, 0.02, -0.11].map(y => <mesh key={y} position={[0, y, 0.041]}><boxGeometry args={[0.32, 0.035, 0.012]} /><meshBasicMaterial color="#3287a4" /></mesh>)}
      <mesh position={[0.15, 0.25, 0.045]} rotation-z={Math.PI / 4}><boxGeometry args={[0.16, 0.16, 0.015]} /><meshStandardMaterial color="#a4e7f9" /></mesh>
    </group>
    <group ref={browser}>
      {['#ef5d55', '#61c179', '#f5cf56'].map((color, i) => <mesh key={color}><sphereGeometry args={[0.36, 20, 16, i * Math.PI * 2 / 3, Math.PI * 2 / 3]} /><meshStandardMaterial color={color} roughness={0.3} /></mesh>)}
      <mesh position={[0, 0, 0.32]}><sphereGeometry args={[0.17, 18, 12]} /><meshStandardMaterial color="#67cbff" emissive="#258ad1" emissiveIntensity={0.5} /></mesh>
    </group>
    <group ref={spark}>
      <mesh><octahedronGeometry args={[0.26]} /><meshBasicMaterial color="#ffe18c" toneMapped={false} /></mesh>
      {[0, Math.PI / 3, Math.PI * 2 / 3].map(angle => <mesh key={angle} rotation-z={angle}><boxGeometry args={[0.07, 0.9, 0.07]} /><meshBasicMaterial color="#b4f8ff" toneMapped={false} /></mesh>)}
    </group>
    <group ref={heart}>
      <mesh rotation-z={Math.PI / 4}><boxGeometry args={[0.32, 0.32, 0.12]} /><meshStandardMaterial color="#ff82a7" emissive="#ef4381" emissiveIntensity={0.55} roughness={0.4} /></mesh>
      {[-0.115, 0.115].map(x => <mesh key={x} position={[x, 0.115, 0]}><sphereGeometry args={[0.16, 14, 12]} /><meshStandardMaterial color="#ff82a7" emissive="#ef4381" emissiveIntensity={0.55} roughness={0.4} /></mesh>)}
    </group>
  </group>
}
