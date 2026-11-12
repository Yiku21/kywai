import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { glowSpots, hasSpaceNight, nightRamp, tuneForNight } from './nightLight'
import { dayOf, nightFog, nightOf, WORLD_PALETTES } from './palette'

describe('noche del espacio', () => {
  it('Órbita, la Oficina y el Refugio Kywai no usan la noche común', () => {
    expect(hasSpaceNight('mundo-orbita')).toBe(false)
    expect(hasSpaceNight('kywai')).toBe(false)
    expect(hasSpaceNight('mundo-marfil')).toBe(true)
    expect(hasSpaceNight('orbita')).toBe(true) // Frost Glass, la Ciudad digital
  })

  it('las cosas se encienden de forma suave entre dos momentos del atardecer', () => {
    expect(nightRamp(0, 0.2, 0.7)).toBe(0)
    expect(nightRamp(1, 0.2, 0.7)).toBe(1)
    expect(nightRamp(0.45, 0.2, 0.7)).toBeCloseTo(0.5)
  })

  it('el brillo propio sube de noche y vuelve a ser el de día al amanecer', () => {
    const m = new THREE.MeshStandardMaterial({ emissive: '#00ffaa', emissiveIntensity: 2 })
    tuneForNight(m, 1, 1.5)
    expect(m.emissiveIntensity).toBeCloseTo(5)
    tuneForNight(m, 0, 1.5)
    expect(m.emissiveIntensity).toBeCloseTo(2)
    const plain = new THREE.MeshStandardMaterial({ color: '#888888' })
    tuneForNight(plain, 1, 1.5)
    expect(plain.emissiveIntensity).toBe(1)
  })

  it('los corales con nightEmissive solo brillan de noche', () => {
    const m = new THREE.MeshStandardMaterial({ emissive: '#2ff0ff', emissiveIntensity: 0 })
    m.userData.nightEmissive = 1.6
    tuneForNight(m, 1, 1)
    expect(m.emissiveIntensity).toBeCloseTo(1.6)
    tuneForNight(m, 0, 1)
    expect(m.emissiveIntensity).toBe(0)
  })

  it('el neón sin luz se aclara y los shaders reciben uNight', () => {
    const neon = new THREE.MeshBasicMaterial({ color: '#204060', toneMapped: false })
    tuneForNight(neon, 1, 1)
    expect(neon.color.r).toBeGreaterThan(new THREE.Color('#204060').r)
    tuneForNight(neon, 0, 1)
    expect(neon.color.getHexString()).toBe('204060')
    const sky = new THREE.ShaderMaterial({ uniforms: { uNight: { value: 0 } } })
    tuneForNight(sky, 0.7, 1)
    expect(sky.uniforms.uNight.value).toBe(0.7)
  })

  it('las luces de noche se ponen donde más brilla, con su color', () => {
    const spots = glowSpots([
      { at: [0, 1, 0], size: [1, 1, 1], color: '#ff8800', glow: 1 },
      { at: [0.5, 1, 0.5], size: [1, 1, 1], color: '#ff8800', glow: 1 },
      { at: [20, 1, 0], size: [1, 1, 1], color: '#00aaff', glow: 0.6 },
      { at: [10, 1, 10], size: [1, 1, 1], color: '#ffffff', glow: 0.1 }
    ], 5)
    expect(spots).toHaveLength(2)
    expect(spots[0].at[0]).toBeCloseTo(0.25)
    expect(spots[0].color).toBe('#ff8800')
    expect(spots[0].weight).toBe(1)
  })

  it('de noche la luz baja mucho (sin filtro encima) y el Clásico de día tiene más luz', () => {
    const p = WORLD_PALETTES.clasico
    expect(nightOf(p).lights.keyI).toBeLessThan(p.lights.keyI * 0.3)
    expect(dayOf(p).keyI).toBeGreaterThan(p.lights.keyI)
    expect(dayOf(WORLD_PALETTES.grafito)).toBe(WORLD_PALETTES.grafito.lights)
  })

  it('en Matrix la niebla se aparta de día y se cierra de noche; en los demás no cambia', () => {
    const [dayNear, dayFar] = nightFog('matrix', 70, 180, 0)
    const [nightNear, nightFar] = nightFog('matrix', 70, 180, 1)
    expect(dayFar).toBeGreaterThan(nightFar)
    expect(dayNear).toBeGreaterThan(nightNear)
    expect(nightFog('bosque', 40, 134, 1)).toEqual([40, 134])
  })
})
