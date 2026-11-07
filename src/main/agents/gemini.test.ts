import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GEMINI_LOGIN_STALL_NOTICE, geminiAuthType, geminiStallNotice, isGeminiKey } from './gemini'
import { STALL_NOTICE } from './spawn'

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

describe('geminiStallNotice', () => {
  it('con la sesión de Google, el aviso de silencio pide una clave de API', () => {
    expect(geminiStallNotice(STALL_NOTICE, 'oauth-personal')).toBe(GEMINI_LOGIN_STALL_NOTICE)
  })

  it('con clave de API (o sin saberlo) queda el aviso de siempre, y otros avisos no se tocan', () => {
    expect(geminiStallNotice(STALL_NOTICE, 'gemini-api-key')).toBe(STALL_NOTICE)
    expect(geminiStallNotice(STALL_NOTICE, undefined)).toBe(STALL_NOTICE)
    expect(geminiStallNotice('Esperando permiso de la carpeta', 'oauth-personal')).toBe('Esperando permiso de la carpeta')
  })
})

describe('geminiAuthType', () => {
  it('lee el método de ~/.gemini/settings.json (formato nuevo y antiguo)', () => {
    const home = mkdtempSync(join(tmpdir(), 'gem-'))
    try {
      expect(geminiAuthType(home)).toBeUndefined()
      mkdirSync(join(home, '.gemini'))
      writeFileSync(join(home, '.gemini', 'settings.json'), JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
      expect(geminiAuthType(home)).toBe('oauth-personal')
      writeFileSync(join(home, '.gemini', 'settings.json'), JSON.stringify({ selectedAuthType: 'gemini-api-key' }))
      expect(geminiAuthType(home)).toBe('gemini-api-key')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
