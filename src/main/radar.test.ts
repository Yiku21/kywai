// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseRadarRequest, radarPrompt, radarStamp } from './radar'
import { isKywaiCommand } from '@shared/chatCommands'

describe('«/radar»', () => {
  it('entiende el nicho, los días y cuántos temas', () => {
    expect(parseRadarRequest('/radar agentes de IA')).toEqual({ niche: 'agentes de IA', days: 7, count: 8 })
    expect(parseRadarRequest('/radar últimos 3 días 10 temas Claude Code')).toEqual({ niche: 'Claude Code', days: 3, count: 10 })
    expect(parseRadarRequest('/tendencias')).toEqual({ niche: '', days: 7, count: 8 })
    expect(parseRadarRequest('/radar 90 días 40 temas x')).toEqual({ niche: 'x', days: 30, count: 15 })
    expect(parseRadarRequest('/radares')).toBeNull()
    expect(parseRadarRequest('hazme un radar')).toBeNull()
  })

  it('el encargo pide datos reales, la ficha en radar/ y la orden /video de cada tema', () => {
    const p = radarPrompt({ niche: 'agentes de IA', days: 7, count: 8 }, { lang: 'español', stamp: '2026-11-12-2105', previous: ['radar/2026-11-12-1705.md'] })
    expect(p).toContain('radar/2026-11-12-2105.md')
    expect(p).toContain('yt-dlp')
    expect(p).toContain('radar/2026-11-12-1705.md')
    expect(p).toContain('`/video')
    expect(p).toContain('No inventes cifras')
    expect(p).toContain('/rutina cada 4 horas: /radar agentes de IA')
    expect(radarStamp(new Date(2026, 10, 2, 9, 5))).toBe('2026-11-02-0905')
  })

  it('el chat reconoce las órdenes de kywai que sugiere un agente', () => {
    expect(isKywaiCommand('/video Claude Code como bucle — para quien empieza')).toBe(true)
    expect(isKywaiCommand('/tendencias IA')).toBe(true)
    expect(isKywaiCommand('/usr/bin/node')).toBe(false)
    expect(isKywaiCommand('/inventada algo')).toBe(false)
    expect(isKywaiCommand('video')).toBe(false)
  })
})
