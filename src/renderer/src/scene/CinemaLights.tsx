import * as THREE from 'three'
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
}

/**
 * Luz de cine para el espacio 3D (las mismas reglas que las escenas vivas de los vídeos):
 * - principal fuerte y de lado, más baja que antes, para que las cosas tengan una cara iluminada y otra en sombra;
 * - relleno frío y bajo desde el otro lado, que suaviza las sombras sin aplanarlas;
 * - borde de luz por detrás, rasante, que recorta los contornos de robots, puestos y columnas;
 * - menos luz de cielo y ambiente que antes, para que la diferencia entre luz y sombra se vea.
 */
export function CinemaLights({ palette: p, lights: L, worldLight, shadows, shadowSize, home }: CinemaLightsProps) {
  if (home) {
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
  const rimI = (p.light ? 0.35 : 0.6) * (p.world ? 1 : 0.8)
  return (
    <>
      <hemisphereLight args={[L.sky, L.ground, L.hemi * worldLight * 0.8]} />
      <ambientLight intensity={L.ambientI * worldLight * 0.6} color={L.ambient} />
      <directionalLight name="cine-principal" position={[-17, 10, 3]} intensity={L.keyI * worldLight * 1.18} color={L.key}
        castShadow={shadows} shadow-mapSize={[shadowSize, shadowSize]} shadow-bias={-0.00015} shadow-normalBias={0.035}
        shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={24} shadow-camera-bottom={-24}
        shadow-camera-near={0.5} shadow-camera-far={70} />
      <directionalLight name="cine-relleno" position={[12, 4, 9]} intensity={L.fillI * worldLight * 1.15} color={hexOf(new THREE.Color(L.fill).lerp(COOL, 0.35))} />
      <directionalLight name="cine-borde" position={[3, 2.2, -15]} intensity={rimI} color={hexOf(new THREE.Color(p.rim).lerp(WHITE, 0.5))} />
    </>
  )
}
