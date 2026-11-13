import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { DEFAULT_STATIONS } from '@shared/defaults'
import { frontalOverview, framedFog, cameraLimits, OVERVIEW_FOV, FILL_ASPECT } from './cameraFraming'
import type { WorldStyle } from './worlds/models'

const worlds: (WorldStyle | undefined)[] = [undefined, 'eva', 'clasico', 'grafito', 'bosque', 'matrix', 'marfil', 'orbita', 'kywai', 'submarino', 'relicario', 'telar', 'halloween', 'navidad', 'oficina', 'sede']

describe('cámara de frente ligeramente elevada', () => {
  it.each(worlds)('%s mantiene 18 grados también en paneles estrechos y al descontar el chat', world => {
    for (const aspect of [.75, .85, 1, 1.4, 2.4]) for (const room of [1, 1.25]) {
      const { eye, target } = frontalOverview(world, DEFAULT_STATIONS, aspect, room)
      const degrees = Math.atan2(eye[1] - target[1], eye[2] - target[2]) * 180 / Math.PI
      expect(degrees).toBeCloseTo(18)
      const camera = new THREE.PerspectiveCamera(OVERVIEW_FOV, aspect, .5, 420)
      camera.position.set(...eye);camera.lookAt(...target);camera.updateMatrixWorld()
      for (const station of DEFAULT_STATIONS) for (const y of [0, 2.5]) {
        const p = new THREE.Vector3(station.position[0], y, station.position[1]).project(camera)
        expect(Math.abs(p.x)).toBeLessThan(1)
        expect(Math.abs(p.y)).toBeLessThan(1)
      }
    }
  })

  it('mantiene a los agentes delante de la niebla al alejarse en un panel estrecho', () => {
    for (const [near, far] of [[28, 62], [30, 78], [48, 90]]) {
      const { eye, target } = frontalOverview('submarino', DEFAULT_STATIONS, .6, 1.25)
      const distance = Math.hypot(...eye.map((v, i) => v - target[i]))
      const fog = framedFog(near, far, distance)
      expect(fog.near).toBeGreaterThan(distance + 10)
      expect(fog.far).toBeGreaterThan(fog.near + 60)
    }
  })

  it('resuelve un panel más estrecho alejándose, manteniendo la misma inclinación', () => {
    const wide = frontalOverview('eva', DEFAULT_STATIONS, 1.8), narrow = frontalOverview('eva', DEFAULT_STATIONS, .78)
    expect(narrow.eye[2]).toBeGreaterThan(wide.eye[2])
    expect((narrow.eye[1] - narrow.target[1]) / (narrow.eye[2] - narrow.target[2])).toBeCloseTo((wide.eye[1] - wide.target[1]) / (wide.eye[2] - wide.target[2]))
  })
})

describe('panel alto y estrecho', () => {
  const span = (f: ReturnType<typeof frontalOverview>) => Math.hypot(...f.eye.map((v, i) => v - f.target[i]))

  it.each(worlds)('%s rellena el alto en vez de alejarse hasta dejar huecos arriba y abajo', world => {
    for (const aspect of [.3, .4, .55, .7]) for (const room of [1, 1.25]) {
      const frame = frontalOverview(world, DEFAULT_STATIONS, aspect, room)
      // Se queda a la distancia de un panel de FILL_ASPECT (no se aleja más al estrecharse) y nunca más lejos que «todo».
      expect(span(frame)).toBeCloseTo(Math.min(frame.whole, span(frontalOverview(world, DEFAULT_STATIONS, FILL_ASPECT, room))))
      // Mismo ángulo de siempre y el coordinador (centro) a la vista.
      expect(Math.atan2(frame.eye[1] - frame.target[1], frame.eye[2] - frame.target[2]) * 180 / Math.PI).toBeCloseTo(18)
      const camera = new THREE.PerspectiveCamera(OVERVIEW_FOV, aspect, .5, 420)
      camera.position.set(...frame.eye);camera.lookAt(...frame.target);camera.updateMatrixWorld()
      const center = DEFAULT_STATIONS.reduce((a, b) => Math.abs(a.position[0]) <= Math.abs(b.position[0]) ? a : b)
      const p = new THREE.Vector3(center.position[0], 1, center.position[1]).project(camera)
      expect(Math.abs(p.x)).toBeLessThan(1)
      expect(Math.abs(p.y)).toBeLessThan(1)
      // Con la rueda se puede alejar hasta ver a todo el equipo.
      expect(cameraLimits(world, frame, DEFAULT_STATIONS).maxDistance).toBeGreaterThanOrEqual(frame.whole)
    }
  })

  it('cuanto más estrecho, más cerca que el encuadre de «todo el equipo»', () => {
    const tall = frontalOverview(undefined, DEFAULT_STATIONS, .4)
    expect(span(tall)).toBeLessThan(tall.whole * .7)
  })
})

describe('límites de la cámara', () => {
  it.each(worlds)('%s deja ver la vista general entera y no deja alejarse ni meterse sin límite', world => {
    for (const aspect of [.8, 1.4, 2.4]) for (const room of [1, 1.25]) {
      const frame = frontalOverview(world, DEFAULT_STATIONS, aspect, room)
      const limits = cameraLimits(world, frame, DEFAULT_STATIONS)
      const distance = Math.hypot(...frame.eye.map((v, i) => v - frame.target[i]))
      // La vista general cabe (si no, la cámara daría un salto al soltarla) y alejarse da como mucho un 10 % más.
      expect(limits.maxDistance).toBeGreaterThanOrEqual(distance)
      expect(limits.maxDistance).toBeLessThanOrEqual(distance * 1.1 + 1e-9)
      expect(limits.minDistance).toBeGreaterThanOrEqual(15)
      // La inclinación de la vista general (18°) queda dentro y el giro se queda por delante del escenario.
      const polar = Math.PI / 2 - 18 * Math.PI / 180
      expect(polar).toBeGreaterThan(limits.minPolar)
      expect(polar).toBeLessThan(limits.maxPolar)
      expect(limits.azimuth).toBeLessThanOrEqual(.5)
      // El punto de mira de la vista general y todos los puestos (para «Ir al agente») están dentro de la caja.
      const [min, max] = limits.boundary
      for (const p of [frame.target, ...DEFAULT_STATIONS.map(s => [s.position[0], .9, s.position[1]] as const)])
        for (let i = 0; i < 3; i++) { expect(p[i]).toBeGreaterThanOrEqual(min[i]); expect(p[i]).toBeLessThanOrEqual(max[i]) }
    }
  })
})
