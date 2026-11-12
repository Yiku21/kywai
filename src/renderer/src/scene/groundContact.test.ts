import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { lowestPoint } from './groundContact'

describe('apoyar los agentes en su plataforma', () => {
  it('lowestPoint mide la malla más baja y no cuenta las invisibles ni las transparentes', () => {
    const root = new THREE.Group()
    root.position.set(5, 7, 0)
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
    body.position.y = 0.2
    const flame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }))
    flame.position.y = -3
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
    hidden.position.y = -5
    hidden.visible = false
    root.add(body, flame, hidden)
    expect(lowestPoint(root)).toBeCloseTo(-0.3, 5)
  })
})
