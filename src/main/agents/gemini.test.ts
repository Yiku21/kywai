import { describe, expect, it } from 'vitest'
import { isGeminiKey } from './gemini'

describe('isGeminiKey', () => {
  it('admite las claves de siempre («AIza…») y las nuevas de AI Studio («AQ.…», con punto)', () => {
    expect(isGeminiKey('AIzaSyA1234567890abcdefghijklmnopqrstu')).toBe(true)
    expect(isGeminiKey('AQ.Ab8RN6Kq1xYz-abc_DEF.ghiJKLmnoPQRstuVWX')).toBe(true)
  })

  it('rechaza lo que no es una clave', () => {
    expect(isGeminiKey('')).toBe(false)
    expect(isGeminiKey('corta')).toBe(false)
    expect(isGeminiKey('AQ.Ab8RN6Kq1xYz abc DEF ghiJKL')).toBe(false)
    expect(isGeminiKey('AQ.Ab8RN6Kq1xYz\nGEMINI_API_KEY=otra')).toBe(false)
  })
})
