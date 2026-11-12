import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { DEFAULT_STATIONS } from '@shared/defaults'
import { frontalOverview, framedFog, OVERVIEW_FOV } from './cameraFraming'
import type { WorldStyle } from './worlds/models'

const worlds: (WorldStyle | undefined)[] = [undefined, 'eva', 'clasico', 'grafito', 'bosque', 'matrix', 'marfil', 'orbita', 'kywai', 'submarino', 'relicario', 'telar', 'halloween', 'navidad', 'oficina', 'sede']

describe('cámara de frente ligeramente elevada', () => {
  it.each(worlds)('%s mantiene 18 grados también en paneles estrechos y al descontar el chat', world => {
    for (const aspect of [.6, .85, 1, 1.4, 2.4]) for (const room of [1, 1.25]) {
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
    const wide = frontalOverview('eva', [], 1.8), narrow = frontalOverview('eva', [], .65)
    expect(narrow.eye[2]).toBeGreaterThan(wide.eye[2])
    expect((narrow.eye[1] - narrow.target[1]) / (narrow.eye[2] - narrow.target[2])).toBeCloseTo((wide.eye[1] - wide.target[1]) / (wide.eye[2] - wide.target[2]))
  })
})
