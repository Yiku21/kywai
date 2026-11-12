import { describe, expect, it } from 'vitest'
import { DEMO_SHOTS, cardHtml, demoPrompt, fitRect, fitToVoice, githubRepo, lightColor, moveFilter, parseDemoPlan, parseDemoRequest, parseRepoFacts, phoneScreen, planSeconds, presenterBox, presenterHtml, presenterY, repoCardHtml, shortCount, shotRects, shotStarts, spokenWords } from './webDemo'
import { buildAss } from './footage'

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
    for (const s of DEMO_SHOTS) if (s.id !== 'repo') expect(p).toContain(`"${s.id}"`)
    expect(p).not.toContain('"repo"')
    expect(p).not.toContain('"say"')
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

  it('con presentador: «presentador», «presentador:claude», voz y GitHub (que lo lleva salvo «sin presentador»)', () => {
    expect(parseDemoRequest('/demo kywai.app vertical presentador')).toEqual({ url: 'https://kywai.app', format: 'vertical', note: '', presenter: 'hermes' })
    expect(parseDemoRequest('/demo kywai.app con presentador:Claude voz:edge-es-ES-AlvaroNeural el 3D')).toEqual({ url: 'https://kywai.app', format: 'horizontal', note: 'el 3D', presenter: 'claude', voice: 'edge-es-ES-AlvaroNeural' })
    expect(parseDemoRequest('/demo https://github.com/Yiku21/kywai vertical')).toMatchObject({ url: 'https://github.com/Yiku21/kywai', presenter: 'hermes' })
    expect(parseDemoRequest('/demo github.com/Yiku21/kywai sin presentador')).toEqual({ url: 'https://github.com/Yiku21/kywai', format: 'horizontal', note: '' })
    expect(githubRepo('https://github.com/Yiku21/kywai.git')).toEqual({ owner: 'Yiku21', repo: 'kywai' })
    expect(githubRepo('https://github.com/Yiku21/kywai/tree/master/docs')).toEqual({ owner: 'Yiku21', repo: 'kywai' })
    expect(githubRepo('https://github.com/features/copilot')).toBeNull()
    expect(githubRepo('https://github.com/Yiku21')).toBeNull()
    expect(githubRepo('https://gitlab.com/a/b')).toBeNull()
  })

  it('los datos del repositorio salen de la API de GitHub, limpios', () => {
    const r = parseRepoFacts({ full_name: 'a/b', description: '  Un  estudio local ', stargazers_count: 3812, forks_count: 609, license: { spdx_id: 'AGPL-3.0', name: 'GNU AGPL' }, language: 'TypeScript', topics: ['ai', 7, 'local'], pushed_at: '2026-11-10T10:00:00Z', homepage: 'javascript:alert(1)' })
    expect(r).toEqual({ name: 'a/b', description: 'Un estudio local', stars: 3812, forks: 609, license: 'AGPL-3.0', language: 'TypeScript', topics: ['ai', 'local'], pushedAt: '2026-11-10T10:00:00Z', homepage: '' })
    expect(parseRepoFacts({ message: 'Not Found' })).toBeNull()
    expect(shortCount(950)).toBe('950')
    expect(shortCount(3812)).toBe('3,8 k')
    expect(shortCount(125000)).toBe('125 k')
    const html = repoCardHtml(r!, 'Gratis <y> abierto', '#ff5e5b', { w: 1080, h: 1920 })
    expect(html).toContain('★ 3,8 k')
    expect(html).toContain('AGPL-3.0')
    expect(html).toContain('Gratis &lt;y&gt; abierto')
  })

  it('el guion con presentador: frases, rótulo y ficha «repo» solo si es un repositorio', () => {
    const reply = JSON.stringify({
      title: 'Un estudio de IA',
      label: 'repo de github',
      shots: [
        { ficha: 'portada', text: 'IA en tu PC', say: 'Esto es un estudio de IA que corre entero en tu ordenador: https://x.y' },
        { ficha: 'repo', say: 'Tiene casi cuatro mil estrellas en GitHub.' },
        { ficha: 'repo', say: 'Otra vez.' },
        { ficha: 'recorrido', from: 0, to: 2, say: 'Chat, imágenes y vídeo en una sola app.' },
        { ficha: 'cierre', text: 'Pruébalo', say: 'Guárdalo para luego.' }
      ]
    })
    const plan = parseDemoPlan(reply, 3, true, { presenter: true, repo: true })
    expect(plan.label).toBe('REPO DE GITHUB')
    expect(plan.shots.map((s) => s.ficha)).toEqual(['portada', 'repo', 'recorrido', 'cierre'])
    expect(plan.shots[0].say).toBe('Esto es un estudio de IA que corre entero en tu ordenador:')
    expect(parseDemoPlan(reply, 3, true, { presenter: true }).shots.map((s) => s.ficha)).toEqual(['portada', 'recorrido', 'cierre'])
    expect(parseDemoPlan(reply, 3, true).shots.every((s) => !s.say)).toBe(true)
    expect(() => parseDemoPlan('{"shots": [{"ficha": "portada", "text": "a"}, {"ficha": "rotulo", "text": "b"}, {"ficha": "cierre"}]}', 3, true, { presenter: true })).toThrow(/say/)
    const p = demoPrompt({ url: 'https://github.com/a/b', note: '', format: 'vertical', page: { title: 'b', description: '', sections: [] }, desktop: '/w/e.png', lang: 'español', presenter: 'Hermes', repo: parseRepoFacts({ full_name: 'a/b', stargazers_count: 3812 }) })
    expect(p).toContain('"repo"')
    expect(p).toContain('3812 estrellas')
    expect(p).toContain('Presentador: Hermes')
    expect(p).toContain('"say"')
    expect(p).toContain('"label"')
  })

  it('cada plano dura lo que su frase y las palabras se reparten a su ritmo', () => {
    const shot = { ficha: 'rotulo' as const, text: 'x' }
    expect(fitToVoice(shot, 1)).toBe(2.2)
    expect(fitToVoice(shot, 4)).toBeCloseTo(4.7)
    const plan = { title: 't', shots: [{ ficha: 'portada' as const, text: 'a', secs: 5 }, { ficha: 'rotulo' as const, text: 'b' }, { ficha: 'cierre' as const, text: 'c' }] }
    expect(shotStarts(plan)).toEqual([0, 4.6, 6.4])
    expect(planSeconds(plan)).toBeCloseTo(5 + 2.2 + 3 - 0.8)
    const w = spokenWords('Hola, esto va — muy bien.', 1, 2, 10)
    expect(w.map((x) => x.w)).toEqual(['Hola,', 'esto', 'va', 'muy', 'bien.'])
    expect(w[0]).toMatchObject({ i: 10, s: 1 })
    expect(w[4].e).toBeLessThanOrEqual(3)
    for (let k = 1; k < w.length; k++) expect(w[k].s).toBeGreaterThan(w[k - 1].s)
    const ass = buildAss(w, { w: 1080, h: 1920 }, 'REPO DE GITHUB', { titleUntil: 30, titleBox: '&H002A20E5', subBottom: 547 })
    expect(ass).toContain('Dialogue: 1,0:00:00.00,0:00:30.00,Title')
    expect(ass).toContain('&H002A20E5')
    expect(ass).toMatch(/,2,40,40,547,1/)
  })

  it('el presentador va abajo a la derecha, entra desde abajo y salta al hablar', () => {
    const v = presenterBox({ w: 1080, h: 1920 })
    expect(v.x + v.size).toBeLessThan(1080)
    expect(v.y + v.size).toBeLessThan(1920)
    expect(v.size % 2).toBe(0)
    const h = presenterBox({ w: 1920, h: 1080 })
    expect(h.x).toBeGreaterThan(1920 / 2)
    const y = presenterY(v.y, v.size, [{ s: 0.5, e: 2 }, { s: 3, e: 4.25 }])
    expect(y).toContain('between(t,0.50,2.00)+between(t,3.00,4.25)')
    expect(y).toMatch(/^\d+\+\d+\*pow\(max\(0,1-t\/0\.5\),2\)/)
    expect(y).not.toContain('+-')
    expect(presenterY(10, 100, [])).not.toContain('between')
    expect(presenterHtml('/p/hermes.png', true, '#ff5e5b', 388)).toContain('object-fit:contain')
    expect(presenterHtml('/p/yo.jpg', false, '#ff5e5b', 388)).toContain('border-radius:50%')
  })
})
