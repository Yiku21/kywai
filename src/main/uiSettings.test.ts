import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { on: vi.fn() }, session: { defaultSession: { flushStorageData: vi.fn() } } }))

const { UiSettingsFile } = await import('./uiSettings')

describe('UiSettingsFile', () => {
  it('guarda en disco y lo vuelve a leer al arrancar (como tras actualizar)', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'kywai-ajustes-')), 'ajustes-interfaz.json')
    const a = new UiSettingsFile(file)
    expect(a.get()).toEqual({})
    a.patch({ 'aicowork.sfxMuted': 'true', 'ai-cowork.sceneQuality': 'low', 'aicowork.reducedEffects': '1' })
    a.flush()
    const b = new UiSettingsFile(file)
    expect(b.get()).toEqual({ 'aicowork.sfxMuted': 'true', 'ai-cowork.sceneQuality': 'low', 'aicowork.reducedEffects': '1' })
    b.patch({ 'ai-cowork.sceneQuality': null })
    b.flush()
    expect(JSON.parse(readFileSync(file, 'utf8')).settings).toEqual({ 'aicowork.sfxMuted': 'true', 'aicowork.reducedEffects': '1' })
  })

  it('un archivo roto no impide arrancar', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'kywai-ajustes-')), 'ajustes-interfaz.json')
    writeFileSync(file, '{roto')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(new UiSettingsFile(file).get()).toEqual({})
    warn.mockRestore()
  })
})
