import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import type { Vec, WorldStyle } from './models'

const titles: Partial<Record<WorldStyle, [string, string, string]>> = {
  eva: ['BAHÍA', 'ZONA DE ANCLAJE', '#b0bea1'],
  clasico: ['PUESTO', 'CENTRO DE OPERACIONES', '#8db8cc'],
  grafito: ['UNIDAD', 'ACCESO DE MANTENIMIENTO', '#c6b48a'],
  orbita: ['MUELLE', 'ESTACIÓN ORBITAL', '#9bc5d6'],
  matrix: ['NODO', 'ENTORNO DIGITAL', '#5ec78a']
}

export function stencil(title: string, sub: string, color: string) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color; ctx.strokeStyle = color
  ctx.font = '500 96px "Courier New", monospace'; ctx.fillText(title, 12, 113)
  ctx.font = '28px "Courier New", monospace'; ctx.fillText(sub, 16, 173)
  ctx.globalAlpha = 0.45; ctx.fillRect(16, 203, 980, 2)
  for (let i = 0; i < 43; i++) ctx.fillRect(770 + i * 5, 29, i % 3 ? 1 : 3, i % 4 ? 61 : 45)
  ctx.lineWidth = 2; ctx.strokeRect(765, 16, 235, 99)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8
  return texture
}

/** Painted identifiers, at native texture resolution; these are scenery, not interactive controls. */
export function WorldMarkings({ style, stations }: { style: WorldStyle; stations: StationConfig[] }) {
  const items = useMemo(() => {
    const spec = titles[style]; if (!spec) return []
    const out: { at: Vec; rotation: Vec; size: [number, number]; texture: THREE.CanvasTexture }[] = stations.map((st, i) => ({
      at: [st.position[0], 0.9, st.position[1] + 0.98], rotation: [-Math.PI / 2, 0, 0], size: [1.28, 0.32],
      texture: stencil(`${spec[0]} ${String(i + 1).padStart(2, '0')}`, '', spec[2])
    }))
    if (style === 'eva') for (let i = -2; i <= 2; i++) out.push({
      at: [i * 5.5, 3.9, -13.35], rotation: [0, 0, 0], size: [3.5, 0.875],
      texture: stencil(`SECTOR ${String(i + 3).padStart(2, '0')}`, spec[1], '#aba9bc')
    })
    if (style !== 'orbita') out.push({ at: [0, style === 'matrix' ? -1.11 : 0.075, 8.5], rotation: [-Math.PI / 2, 0, 0], size: [4.7, 1.175], texture: stencil(style === 'eva' ? 'EVA / 01' : style === 'grafito' ? 'REACTOR / 07' : style === 'matrix' ? 'MATRIX / 01' : 'KYWAI', spec[1], spec[2]) })
    return out
  }, [style, stations])
  useEffect(() => () => items.forEach(i => i.texture.dispose()), [items])
  return <group>{items.map((item, i) => <mesh key={i} position={item.at} rotation={item.rotation} raycast={() => {}}>
    <planeGeometry args={item.size} />
    <meshBasicMaterial map={item.texture} transparent opacity={0.7} depthWrite={false} polygonOffset polygonOffsetFactor={-1} toneMapped={false} />
  </mesh>)}</group>
}
