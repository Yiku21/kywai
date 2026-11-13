import { describe, expect, it } from 'vitest'
import { applyUiSettingsPatch, diffUiSettings, isUiSettingKey, MAX_VALUE_CHARS, pickUiSettings } from './uiSettings'

describe('ajustes de la interfaz en disco', () => {
  it('solo guarda las claves de kywai', () => {
    expect(isUiSettingKey('aicowork.sfxMuted')).toBe(true)
    expect(isUiSettingKey('ai-cowork.sceneQuality')).toBe(true)
    expect(isUiSettingKey('kywai.archivos.vista')).toBe(true)
    expect(isUiSettingKey('ytplayer.volume')).toBe(false)
    expect(pickUiSettings([['aicowork.volume', '0.7'], ['otra', 'x'], ['kywai.big', 'x'.repeat(MAX_VALUE_CHARS + 1)]])).toEqual({ 'aicowork.volume': '0.7' })
  })

  it('cuenta lo que cambió, lo nuevo y lo que se quitó', () => {
    expect(diffUiSettings({ a: '1', b: '2' }, { a: '1', b: '3', c: '4' })).toEqual({ b: '3', c: '4' })
    expect(diffUiSettings({ a: '1' }, {})).toEqual({ a: null })
    expect(diffUiSettings({ a: '1' }, { a: '1' })).toEqual({})
  })

  it('aplica cambios y quita claves, sin aceptar lo que no es un ajuste', () => {
    const t: Record<string, string> = { 'aicowork.muted': 'false' }
    expect(applyUiSettingsPatch(t, { 'aicowork.muted': 'true', 'ai-cowork.perfMeter': '1', evil: 'x' })).toBe(true)
    expect(t).toEqual({ 'aicowork.muted': 'true', 'ai-cowork.perfMeter': '1' })
    expect(applyUiSettingsPatch(t, { 'ai-cowork.perfMeter': null })).toBe(true)
    expect(t).toEqual({ 'aicowork.muted': 'true' })
    expect(applyUiSettingsPatch(t, { 'aicowork.muted': 'true' })).toBe(false)
    expect(applyUiSettingsPatch(t, null)).toBe(false)
    expect(applyUiSettingsPatch(t, ['x'])).toBe(false)
    expect(applyUiSettingsPatch(t, { 'aicowork.n': 5 })).toBe(false)
  })
})
