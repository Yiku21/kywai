import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import { useCowork, type CameraCommand } from '@/store/cowork'
import type { ViewInsets } from './World'
import { useTheme } from '@/lib/theme'
import { palette } from './palette'
import { registry } from './registry'
import { frontalOverview, framedFog, cameraLimits, OVERVIEW_FOV, OVERVIEW_ELEVATION } from './cameraFraming'

/**
 * Cámara que respira: en la vista general, sin tocar nada, la cámara gira un pelo a un lado y a otro (unos 2,5° en
 * casi un minuto) y sube y baja un poco con otro ritmo. Devuelve el giro [azimut, altura] en radianes para el instante
 * [t] y la fuerza [amp] (0–1, que entra poco a poco para que no dé un salto).
 */
export function cameraBreath(t: number, amp: number): [number, number] {
  return [amp * 0.045 * Math.sin(t * 0.11), amp * 0.012 * Math.sin(t * 0.073 + 1.3)]
}

/**
 * Cámara estable: solo se mueve por acción del usuario (arrastrar, rueda, botones, clic en una
 * estación), salvo la respiración lenta de la vista general. Las transiciones son suaves y respetan "efectos reducidos".
 */
/** [view]: lo que tapa la interfaz (tema Órbita): la vista general se encuadra en la zona libre. */
export function CameraRig({ view, stations }: { view?: ViewInsets; stations?: StationConfig[] } = {}) {
  const [controls, setControls] = useState<CameraControls | null>(null)
  const size = useThree((s) => s.size)
  const scene = useThree((s) => s.scene)
  const fogBase = useRef<{ fog: THREE.Fog; near: number; far: number } | null>(null)
  const fogTarget = useRef(new THREE.Vector3())
  const reduced = useCowork((s) => s.reducedEffects)
  const atOverview = useRef(true)
  // Lo que la respiración ya ha girado la cámara (se descuenta en cada fotograma) y su fuerza actual.
  const breath = useRef({ az: 0, polar: 0, amp: 0 })
  const theme = useTheme()
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera
  useEffect(() => { camera.fov = OVERVIEW_FOV; camera.updateProjectionMatrix() }, [camera, theme])
  // El mapa del tema (cada uno se encuadra a su manera; la Ciudad y los decorados, como siempre).
  const world = palette.world
  // La vista general de este escenario y tamaño de ventana, y hasta dónde se deja mover la cámara desde ella.
  const width = size.width - (view?.left ?? 0)
  const height = size.height - (view ? view.top + view.bottom : 0)
  const frame = useMemo(() => {
    // La zona libre es más pequeña que el lienzo: se aleja lo que haga falta para que el mundo quepa en ella.
    const room = view ? Math.max(1, size.height / Math.max(1, height)) : 1
    return frontalOverview(world, stations ?? [], width / Math.max(1, height), room)
  }, [world, stations, width, height, size.height, view])
  const limits = useMemo(() => cameraLimits(world, frame, stations ?? []), [world, frame, stations])

  const overview = useCallback(
    (smooth: boolean) => {
      if (!controls) return
      // Tras varias vueltas, vuelve por el arco corto en vez de deshacer todos los giros.
      controls.normalizeRotations()
      breath.current = { az: 0, polar: 0, amp: 0 }
      const { eye, target } = frame
      void controls.setLookAt(...eye, ...target, smooth)
      atOverview.current = true
    },
    [controls, frame]
  )

  // En la vista general y sin tocar nada, la cámara respira; al tocarla se queda donde está (no vuelve de golpe).
  useFrame((_, delta) => {
    if (controls && scene.fog instanceof THREE.Fog) {
      const fog = scene.fog
      if (fogBase.current?.fog !== fog) fogBase.current = { fog, near: fog.near, far: fog.far }
      const base = fogBase.current!
      controls.getTarget(fogTarget.current)
      const limits = framedFog(base.near, base.far, camera.position.distanceTo(fogTarget.current))
      fog.near = limits.near; fog.far = limits.far
    }
    const b = breath.current
    if (!controls || reduced || !atOverview.current) {
      b.az = b.polar = b.amp = 0
      return
    }
    if (controls.active) return
    b.amp = Math.min(1, b.amp + Math.min(delta, 0.25) / 4)
    const [az, polar] = cameraBreath(registry.time, b.amp)
    void controls.rotate(az - b.az, polar - b.polar, false)
    b.az = az
    b.polar = polar
  })

  useEffect(() => {
    if (!controls) return
    controls.setBoundary(new THREE.Box3(new THREE.Vector3(...limits.boundary[0]), new THREE.Vector3(...limits.boundary[1])))
    controls.boundaryEnclosesCamera = false
    if (import.meta.env.DEV) (window as unknown as { __cam: CameraControls }).__cam = controls
  }, [controls, limits])

  const lastTheme = useRef(theme)

  // Cambiar de mapa recupera la vista frontal; redimensionar respeta una cámara movida a mano.
  useEffect(() => {
    if (lastTheme.current !== theme) {
      lastTheme.current = theme
      atOverview.current = true
    }
    if (atOverview.current) overview(false)
  }, [overview, theme])

  useEffect(() => {
    if (!controls) return
    const handle = (cmd: CameraCommand) => {
      if (cmd.type === 'overview') overview(true)
      else if (cmd.type === 'zoom') {
        void controls.dolly(cmd.dir * 4.5, true)
        atOverview.current = false
      } else if (cmd.type === 'focus') {
        controls.normalizeRotations()
        void controls.setLookAt(cmd.x * 0.85, 0.9 + 9.4 * Math.tan(OVERVIEW_ELEVATION), cmd.z + 9.4, cmd.x, 0.9, cmd.z, true)
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
      minDistance={limits.minDistance}
      maxDistance={limits.maxDistance}
      minPolarAngle={limits.minPolar}
      maxPolarAngle={limits.maxPolar}
      minAzimuthAngle={-limits.azimuth}
      maxAzimuthAngle={limits.azimuth}
      smoothTime={reduced ? 0.12 : 0.55}
      draggingSmoothTime={reduced ? 0.06 : 0.18}
      onStart={() => {
        atOverview.current = false
      }}
    />
  )
}
