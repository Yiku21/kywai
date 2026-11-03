import { useCallback, useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import * as THREE from 'three'
import { useCowork, type CameraCommand } from '@/store/cowork'
import type { ViewInsets } from './World'

/**
 * Cámara estable: solo se mueve por acción del usuario (arrastrar, rueda, botones, clic en una
 * estación). Las transiciones son suaves y respetan "efectos reducidos".
 */
/** [view]: lo que tapa la interfaz (tema Órbita): la vista general se encuadra en la zona libre. */
export function CameraRig({ view }: { view?: ViewInsets } = {}) {
  const [controls, setControls] = useState<CameraControls | null>(null)
  const size = useThree((s) => s.size)
  const reduced = useCowork((s) => s.reducedEffects)
  const atOverview = useRef(true)

  const overview = useCallback(
    (smooth: boolean) => {
      if (!controls) return
      const width = size.width - (view?.left ?? 0)
      const height = size.height - (view ? view.top + view.bottom : 0)
      const aspect = width / Math.max(1, height)
      // La zona libre es más pequeña que el lienzo: se aleja lo que haga falta para que el mundo quepa en ella.
      const room = view ? Math.max(1, size.height / Math.max(1, height)) : 1
      if (aspect >= 1.1) {
        // Lo bastante lejos para que quepan las zonas de los lados.
        const k = Math.max(1, 1.78 / aspect) * room
        void controls.setLookAt(0, 13.6 * k, 21.2 * k, 0, 0.3, 1.2, smooth)
      } else {
        // Pantallas verticales: vista más cenital para que quepan todas las estaciones.
        const k = Math.max(1, 1.32 / aspect) * room
        void controls.setLookAt(0, 21 * k, 11.5 * k, 0, 0, 0.6, smooth)
      }
      atOverview.current = true
    },
    [controls, size.width, size.height, view?.left, view?.top, view?.bottom]
  )

  useEffect(() => {
    if (!controls) return
    controls.setBoundary(new THREE.Box3(new THREE.Vector3(-11, -0.5, -9), new THREE.Vector3(11, 4, 9)))
    controls.boundaryEnclosesCamera = false
    if (import.meta.env.DEV) (window as unknown as { __cam: CameraControls }).__cam = controls
  }, [controls])

  // Encuadre inicial y ajuste al tamaño, solo mientras el usuario está en la vista general.
  useEffect(() => {
    if (atOverview.current) overview(false)
  }, [overview])

  useEffect(() => {
    if (!controls) return
    const handle = (cmd: CameraCommand) => {
      if (cmd.type === 'overview') overview(true)
      else if (cmd.type === 'zoom') {
        void controls.dolly(cmd.dir * 4.5, true)
        atOverview.current = false
      } else if (cmd.type === 'focus') {
        void controls.setLookAt(cmd.x * 0.85, 7.6, cmd.z + 9.4, cmd.x, 0.9, cmd.z, true)
        atOverview.current = false
      }
    }
    return useCowork.subscribe((s, prev) => {
      if (s.camera && s.camera !== prev.camera) handle(s.camera)
    })
  }, [controls, overview])

  return (
    <CameraControls
      ref={setControls}
      makeDefault
      minDistance={6}
      maxDistance={64}
      minPolarAngle={0.32}
      maxPolarAngle={1.2}
      minAzimuthAngle={-0.95}
      maxAzimuthAngle={0.95}
      smoothTime={reduced ? 0.12 : 0.55}
      draggingSmoothTime={reduced ? 0.06 : 0.18}
      dollyToCursor
      onStart={() => {
        atOverview.current = false
      }}
    />
  )
}
