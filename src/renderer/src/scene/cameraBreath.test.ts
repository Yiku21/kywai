import { describe, expect, it } from 'vitest'
import { cameraBreath } from './CameraRig'

describe('cameraBreath', () => {
  it('se mueve muy poco: menos de 3° de giro y 1° de altura', () => {
    for (let t = 0; t < 600; t += 0.5) {
      const [az, polar] = cameraBreath(t, 1)
      expect(Math.abs(az)).toBeLessThan((3 * Math.PI) / 180)
      expect(Math.abs(polar)).toBeLessThan(Math.PI / 180)
    }
  })

  it('sin fuerza no se mueve, para entrar poco a poco sin saltos', () => {
    expect(cameraBreath(17, 0)).toEqual([0, 0])
  })

  it('en un segundo apenas avanza (es lenta)', () => {
    const [a] = cameraBreath(10, 1), [b] = cameraBreath(11, 1)
    expect(Math.abs(b - a)).toBeLessThan(0.006)
  })
})
