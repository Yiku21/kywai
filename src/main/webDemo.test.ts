import { describe, expect, it } from 'vitest'
import { DEMO_SHOTS, cardHtml, demoPrompt, fitRect, lightColor, moveFilter, parseDemoPlan, parseDemoRequest, phoneScreen, planSeconds, shotRects } from './webDemo'

const page = { w: 1440, h: 6000, sections: [{ y: 0, h: 900, label: 'Inicio' }, { y: 900, h: 1200, label: 'Cómo funciona' }, { y: 2100, h: 800, label: 'Precios' }] }

describe('/demo', () => {
  it('lee la web, el formato y la nota', () => {
    expect(parseDemoRequest('/demo kywai.app')).toEqual({ url: 'https://kywai.app', format: 'horizontal', note: '' })
    expect(parseDemoRequest('/demo https://kywai.app/precios, vertical destaca el precio')).toEqual({ url: 'https://kywai.app/precios', format: 'vertical', note: 'destaca el precio' })
    expect(parseDemoRequest('/demo')).toEqual({ url: '', format: 'horizontal', note: '' })
    expect(parseDemoRequest('/demostrar algo')).toBeNull()
    expect(parseDemoRequest('haz una /demo')).toBeNull()
  })

  it('el guion: fichas conocidas, secciones que existen y sin móvil si no hay foto', () => {
    const plan = parseDemoPlan(
      'Aquí va: {"title": "kywai", "shots": [{"ficha": "portada", "text": "Tu equipo de IA"}, {"ficha": "recorrido", "from": 0, "to": 9}, {"ficha": "inventada"}, {"ficha": "movil"}, {"ficha": "rotulo"}, {"ficha": "acercamiento", "section": 1, "x": 2, "zoom": 9, "text": "Hermes planea"}, {"ficha": "cierre", "text": "Pruébalo"}]}',
      3,
      false
    )
    expect(plan.shots.map((s) => s.ficha)).toEqual(['portada', 'recorrido', 'acercamiento', 'cierre'])
    expect(plan.shots[1]).toMatchObject({ from: 0, to: 2 })
    expect(plan.shots[2]).toMatchObject({ section: 1, x: 1, zoom: 3.5 })
    expect(planSeconds(plan)).toBeCloseTo(2.6 + 4.5 + 3.4 + 3 - 0.4 * 3)
    expect(() => parseDemoPlan('{"shots": [{"ficha": "cierre"}]}', 3, true)).toThrow(/menos de 3/)
    expect(() => parseDemoPlan('no sé', 3, true)).toThrow(/JSON/)
  })

  it('el agente recibe las fichas, las secciones y las fotos', () => {
    const p = demoPrompt({ url: 'https://kywai.app', note: 'que se vea el 3D', format: 'vertical', page: { title: 'kywai', description: 'Agentes', sections: page.sections }, desktop: '/w/escritorio.png', mobile: '/w/movil.png', lang: 'español' })
    for (const s of DEMO_SHOTS) expect(p).toContain(`"${s.id}"`)
    expect(p).toContain('1: Cómo funciona')
    expect(p).toContain('/w/movil.png')
    expect(p).toContain('que se vea el 3D')
    expect(p).toContain('vertical')
  })

  it('los encuadres caben en la foto y el movimiento es un filtro de ffmpeg con el tiempo', () => {
    const out = { w: 1080, h: 1920 }
    const r = fitRect({ x: 1400, y: -50, w: 5000 }, page, out)
    expect(r.x + r.w).toBeLessThanOrEqual(page.w)
    expect(r.y).toBe(0)
    const { from, to } = shotRects({ ficha: 'acercamiento', section: 1, x: 0.5, y: 0.5, zoom: 2 }, page, out)
    expect(to.w).toBeLessThan(from.w)
    const f = moveFilter(page, from, to, 3.4, out)
    expect(f).toMatch(/^crop=\d+:\d+:\d+:\d+,scale=w='.*t\/3\.400.*':h=.*eval=frame/)
    expect(f).toContain('crop=1080:1920:')
    const rec = shotRects({ ficha: 'recorrido', from: 0, to: 2 }, page, { w: 1920, h: 1080 })
    expect(rec.to.y).toBeGreaterThan(rec.from.y)
  })

  it('tarjetas legibles sobre el color de la marca y el teléfono centrado', () => {
    expect(lightColor('#ffe066')).toBe(true)
    expect(lightColor('#ff5e5b')).toBe(false)
    expect(cardHtml('cierre', 'Pruébalo <ya>', 'kywai.app', '#ffe066', { w: 1920, h: 1080 })).toContain('color:#111111')
    expect(cardHtml('cierre', 'Pruébalo <ya>', 'kywai.app', '#ffe066', { w: 1920, h: 1080 })).toContain('Pruébalo &lt;ya&gt;')
    const s = phoneScreen({ w: 1920, h: 1080 })
    expect(s.x * 2 + s.w).toBe(1920)
    expect(s.w % 2).toBe(0)
  })
})
