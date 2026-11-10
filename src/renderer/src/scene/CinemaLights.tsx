import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { registry } from './registry'
import type { ScenePalette } from './palette'

/** Tono del relleno: el del tema algo más frío, para que contraste con la luz principal (cálida en casi todos). */
const COOL = new THREE.Color('#9fbfff')
/** El borde de luz lleva el color del tema mezclado con blanco: con el color puro teñía el suelo. */
const WHITE = new THREE.Color('#ffffff')

function hexOf(c: THREE.Color): string {
  return '#' + c.getHexString()
}

export interface CinemaLightsProps {
  palette: ScenePalette
  lights: ScenePalette['lights']
  /** Multiplicador de las luces: los mapas usan materiales físicos y necesitan más luz que la Ciudad. */
  worldLight: number
  shadows: boolean
  /** Lado del mapa de sombras (más pequeño en calidad media). */
  shadowSize: number
  /** El Refugio Kywai tiene su propia luz de día y de noche: se deja como está. */
  home?: { night: boolean }
  /** «Reducir efectos»: la luz se queda quieta. */
  reduced: boolean
}

/**
 * Luz viva: cuánto respira cada luz en el instante [t] con el equipo trabajando a [work] (0–1). Cada luz tiene su
 * propio reloj (periodos de unos 20–40 s y fases distintas), así nunca suben a la vez, y el trabajo las aviva un poco.
 */
export function lightBreath(t: number, work: number): { key: number; fill: number; rim: number } {
  return {
    key: 1 + 0.05 * Math.sin(t * 0.21) + 0.03 * Math.sin(t * 0.537 + 1.7) + 0.06 * work,
    fill: 1 + 0.04 * Math.sin(t * 0.17 + 4.6),
    rim: 1 + 0.12 * Math.sin(t * 0.33 + 4.1) + 0.25 * work
  }
}

/**
 * Luz de cine para el espacio 3D (las mismas reglas que las escenas vivas de los vídeos):
 * - principal fuerte y de lado, más baja que antes, para que las cosas tengan una cara iluminada y otra en sombra;
 * - relleno frío y bajo desde el otro lado, que suaviza las sombras sin aplanarlas;
 * - borde de luz por detrás, rasante, que recorta los contornos de robots, puestos y columnas;
 * - menos luz de cielo y ambiente que antes, para que la diferencia entre luz y sombra se vea.
 */
export function CinemaLights(props: CinemaLightsProps) {
  return props.home ? <HomeLights {...props} home={props.home} /> : <FilmLights {...props} />
}

/** La luz de siempre del Refugio Kywai (de día y de noche). */
function HomeLights({ lights: L, worldLight, shadows, shadowSize, home }: CinemaLightsProps & { home: { night: boolean } }) {
  return (
    <>
      <hemisphereLight args={[L.sky, L.ground, L.hemi * worldLight]} />
      <ambientLight intensity={L.ambientI * worldLight} color={L.ambient} />
      <directionalLight position={home.night ? [13, 17, -16] : [-12, 12, -16]} intensity={L.keyI * worldLight} color={L.key}
        castShadow={shadows} shadow-mapSize={[shadowSize, shadowSize]} shadow-bias={-0.00015} shadow-normalBias={0.035}
        shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20}
        shadow-camera-near={0.5} shadow-camera-far={65} />
      <directionalLight position={[8, 6, -6]} intensity={L.fillI * worldLight} color={L.fill} />
      <directionalLight position={[1, 8, -12]} intensity={0.4} color="#c3d8ef" />
    </>
  )
}

function FilmLights({ palette: p, lights: L, worldLight, shadows, shadowSize, reduced }: CinemaLightsProps) {
  const key = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const rim = useRef<THREE.DirectionalLight>(null)
  const keyI = L.keyI * worldLight * 1.18
  const fillI = L.fillI * worldLight * 1.15
  const rimI = (p.light ? 0.35 : 0.6) * (p.world ? 1 : 0.8)
  useFrame(() => {
    const b = reduced ? { key: 1, fill: 1, rim: 1 } : lightBreath(registry.time, registry.work)
    if (key.current) key.current.intensity = keyI * b.key
    if (fill.current) fill.current.intensity = fillI * b.fill
    if (rim.current) rim.current.intensity = rimI * b.rim
  })
  return (
    <>
      <hemisphereLight args={[L.sky, L.ground, L.hemi * worldLight * 0.8]} />
      <ambientLight intensity={L.ambientI * worldLight * 0.6} color={L.ambient} />
      <directionalLight ref={key} name="cine-principal" position={[-17, 10, 3]} intensity={keyI} color={L.key}
        castShadow={shadows} shadow-mapSize={[shadowSize, shadowSize]} shadow-bias={-0.00015} shadow-normalBias={0.035}
        shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={24} shadow-camera-bottom={-24}
        shadow-camera-near={0.5} shadow-camera-far={70} />
      <directionalLight ref={fill} name="cine-relleno" position={[12, 4, 9]} intensity={fillI} color={hexOf(new THREE.Color(L.fill).lerp(COOL, 0.35))} />
      <directionalLight ref={rim} name="cine-borde" position={[3, 2.2, -15]} intensity={rimI} color={hexOf(new THREE.Color(p.rim).lerp(WHITE, 0.5))} />
    </>
  )
}
