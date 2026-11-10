import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import { palette } from '../palette'
import { WorldModel } from './WorldScenery'
import { surroundingModel, surroundingRadius } from './surroundings'

/** Suelo exterior continuo: los pabellones y árboles lejanos también descansan sobre terreno. */
function SurroundGround({ stations, color }: { stations: StationConfig[]; color: string }) {
  const radius = surroundingRadius(stations)
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(Math.max(240, radius * 5), Math.max(240, radius * 5), 1, 1)
    g.rotateX(-Math.PI / 2)
    g.translate(0, -.68, 0)
    return g
  }, [radius])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} raycast={() => {}} receiveShadow>
    <meshStandardMaterial color={color} roughness={.92} emissive={color} emissiveIntensity={.08} />
  </mesh>
}

/** El perímetro conserva su volumen al girar y comparte geometrías/materiales por lote. */
export function WorldSurround({ stations, detailed }: { stations: StationConfig[]; detailed: boolean }) {
  const style = palette.world ?? 'clasico'
  const pieces = useMemo(() => {
    const model = surroundingModel(style, stations, detailed)
    // Los siete colores de Ciudad digital comparten arquitectura y conservan su propia paleta.
    return palette.world ? model : model.map(piece => ({
      ...piece, color: piece.glow ? palette.primary : piece.color === '#729ebc' ? palette.rim : palette.body
    }))
  }, [style, stations, detailed])
  const grounded = !['orbita', 'telar', 'kywai', 'submarino'].includes(style)
  const ground = !palette.world ? palette.body : style === 'navidad' ? '#c7d3d7'
    : style === 'bosque' ? '#344735' : style === 'halloween' ? '#39313d'
    : style === 'eva' ? '#42414e' : style === 'marfil' ? '#b8ae98' : style === 'relicario' ? '#56666e' : '#28323d'
  return <group name="world-surround">
    {grounded && <SurroundGround stations={stations} color={ground} />}
    <WorldModel pieces={pieces} style={style} distant />
  </group>
}
