import { describe, expect, it } from 'vitest'
import { DEFAULT_STATIONS } from '@shared/defaults'
import type { WorldStyle } from './models'
import { surroundingModel } from './surroundings'

const styles: WorldStyle[] = ['clasico', 'orbita', 'marfil', 'grafito', 'bosque', 'matrix', 'eva', 'relicario', 'telar', 'halloween', 'navidad', 'kywai', 'submarino']

describe('continuidad del escenario al girar la cámara', () => {
  it.each(styles)('%s conserva volumen en todos los cuadrantes y ambas calidades', style => {
    for (const detailed of [false, true]) {
      const pieces = surroundingModel(style, DEFAULT_STATIONS, detailed)
      for (const x of [-1, 1]) for (const z of [-1, 1]) {
        expect(pieces.some(p => p.at[0] * x > 12 && p.at[2] * z > 12)).toBe(true)
      }
      expect(pieces.every(p => [...p.at, ...p.size].every(Number.isFinite) && p.size.every(n => n > 0))).toBe(true)
      expect(new Set(pieces.map(p => `${p.shape}:${p.color}:${p.glow}`)).size).toBeLessThan(48)
      expect(surroundingModel(style, DEFAULT_STATIONS, detailed)).toEqual(pieces)
    }
  })

  it.each(styles)('%s deja libres los puestos personalizados fuera de la distribución inicial', style => {
    const stations = [...DEFAULT_STATIONS, { id: 'lejano', label: 'Lejano', position: [32, -24] as [number, number] }]
    for (const p of surroundingModel(style, stations, true)) for (const station of stations) {
      // El pavimento transitable y los puentes sobre las cabezas no bloquean los accesos.
      if (p.size[1] < .1 || p.at[1] - p.size[1] / 2 > 3) continue
      // Incluye el ancho de las piezas, no solo el centro, al comprobar el paso libre.
      expect(Math.hypot(p.at[0] - station.position[0], p.at[2] - station.position[1]) - Math.max(p.size[0], p.size[2])).toBeGreaterThan(3)
    }
  })

  it('reduce adornos sin eliminar las siluetas del horizonte', () => {
    for (const style of styles) {
      expect(surroundingModel(style, [], false).length).toBeLessThanOrEqual(surroundingModel(style, [], true).length)
    }
  })

  it('no desplaza los arrecifes al cambiar de calidad adaptativa', () => {
    const rocks = (detailed: boolean) => surroundingModel('submarino', [], detailed).filter(p => p.shape === 'rock')
    expect(rocks(false)).toEqual(rocks(true))
  })
})
