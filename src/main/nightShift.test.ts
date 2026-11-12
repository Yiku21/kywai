import { describe, expect, it } from 'vitest'
import { nightShiftPrompt, nightShiftSummary, parseNightShiftOrder, parseNightShiftRequest } from './nightShift'

describe('/turno-noche', () => {
  it('reconoce la orden y sus nombres cortos', () => {
    expect(parseNightShiftRequest('/turno-noche IA y negocio')).toEqual({ note: 'IA y negocio', noPost: false })
    expect(parseNightShiftRequest('/maquina')).toEqual({ note: '', noPost: false })
    expect(parseNightShiftRequest('/máquina @cuenta')).toEqual({ note: '@cuenta', noPost: false })
    expect(parseNightShiftRequest('/noche productividad sin publicar')).toEqual({ note: 'productividad', noPost: true })
    expect(parseNightShiftRequest('/turnos')).toBeNull()
    expect(parseNightShiftRequest('turno de noche')).toBeNull()
  })

  it('saca la orden del vídeo, siempre en vertical', () => {
    const reply = 'Salí de un short 8× su normal.\nGancho elegido (9/10).\n\n`/video estilo:kywai-machine-room Mi kywai trabaja de noche: busca, desmonta y publica`'
    expect(parseNightShiftOrder(reply)).toBe('/video vertical estilo:kywai-machine-room Mi kywai trabaja de noche: busca, desmonta y publica')
    expect(parseNightShiftOrder('/video horizontal tres trucos para dormir mejor')).toBe('/video vertical tres trucos para dormir mejor')
    expect(parseNightShiftOrder('/video vertical estilo:kywai-checklist')).toBeNull()
    expect(parseNightShiftOrder('No encontré nada.')).toBeNull()
    expect(nightShiftSummary(reply)).toBe('Salí de un short 8× su normal.\nGancho elegido (9/10).')
  })

  it('el encargo pide buscar, desmontar, escribir sin copiar y acabar con la orden', () => {
    const p = nightShiftPrompt({
      note: 'IA',
      dir: '/w/instagram/turno-noche/2026-11-12',
      pack: '/w/instagram/instagram-agent-skill',
      viralSkill: '/s/ig-viral/SKILL.md',
      reelSkill: '/s/ig-reel/SKILL.md',
      method: '/w/instagram/metodo-viral.md',
      hasMethod: false,
      voiceFile: '/w/instagram/voice.md',
      hasVoice: true,
      resultsFile: '/w/instagram/resultados.md',
      styles: [{ slug: 'kywai-checklist', name: 'Lista de comprobación', line: 'Una lista.' }],
      lang: 'español'
    })
    expect(p).toContain('3× o más')
    expect(p).toContain('desmontaje.md')
    expect(p).toContain('nunca su texto')
    expect(p).toContain('crea /w/instagram/metodo-viral.md')
    expect(p).toContain('/w/instagram/resultados.md')
    expect(p).toContain('estilo:kywai-checklist')
    expect(p).toContain('no publiques')
    expect(p.trim().split('\n').pop()).toMatch(/^\/video vertical/)
  })
})
