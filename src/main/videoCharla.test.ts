import { describe, expect, it } from 'vitest'
import { buildPresenterData, buildStageData, planShots, stageHtml, stageLooks } from './charlaStage'
import { buildCharlaComposition, shotCuts } from './videoCharla'
import { buildTimeline, CHARLA_LOOK, parseVideoRequest, parseVideoScript, sceneWords, VOICE_LEAD_S, videoScriptPrompt } from './videoScript'

const CHARLA = JSON.stringify({
  title: 'Tu primer vídeo con kywai',
  lang: 'es',
  style: 'charla',
  theme: 'amanecer',
  speakers: [{ name: 'Hermes', gender: 'm' }, { name: 'Claude', gender: 'f' }],
  scenes: [
    {
      heading: '¿Un vídeo en minutos?',
      narration: '[Claude, sorprendido] ¿Un vídeo entero en *dos minutos*? [Hermes, alegre] Te lo enseño.',
      comments: ['¿Y eso cómo se hace?', 'A mí no me sale', '¿Es gratis?', 'sobra'],
      shots: ['wide two-shot of Hermes and Claude', 'close-up of Hermes smiling'],
      step: 0
    },
    {
      heading: 'Escribe /video',
      narration: '[Hermes, firme] Escribe *barra vídeo* y el tema. [Claude, alegre] ¿Ya está?',
      items: ['Abre el chat', 'Escribe /video', 'Pon el tema', 'Pulsa Enviar', 'de más'],
      shots: ['close-up of Hermes pointing at a giant screen'],
      step: 1
    },
    {
      heading: 'Elige el tipo',
      narration: '[Claude, emocionado] Y eliges *Charla y tutorial*. [Hermes, alegre] Como este.',
      items: ['Elige Charla y tutorial'],
      shots: ['wide shot of both robots'],
      step: 2
    }
  ],
  cta: { word: '«guía»', line: 'y te paso los pasos' },
  outro: '¡A grabar!'
})

describe('Charla y tutorial: petición', () => {
  it('«tipo:charla» y «charla y tutorial» con palabras: diálogo, vertical y los robots', () => {
    expect(parseVideoRequest('/video tipo:charla cómo hacer tu primer vídeo')).toMatchObject({ topic: 'cómo hacer tu primer vídeo', style: 'charla', kind: 'charla', format: 'vertical', dialogue: true, character: 'robots-kywai' })
    expect(parseVideoRequest('créame un vídeo estilo charla y tutorial de cómo usar /aprende')).toMatchObject({ topic: 'cómo usar /aprende', style: 'charla', kind: 'charla', dialogue: true })
    expect(parseVideoRequest('/video tipo:charla horizontal para YouTube cómo instalar kywai')).toMatchObject({ style: 'charla', format: 'horizontal' })
    // El personaje elegido manda; la biblioteca de películas no se usa.
    const r = parseVideoRequest('/video tipo:charla personaje:luna estilo:watercolor cómo regar')
    expect(r).toMatchObject({ style: 'charla', character: 'luna', topic: 'cómo regar' })
    expect(r?.film).toBeUndefined()
  })

  it('el encargo pide diálogo, pasos con puntos, burbujas y la palabra a comentar', () => {
    const p = videoScriptPrompt({ topic: 'tu primer vídeo', format: 'vertical', lang: 'es', style: 'charla', dialogue: true, source: 'MENSAJE-ORIGINAL' })
    expect(p).toContain('"comments"')
    expect(p).toContain('"items"')
    expect(p).toContain('"cta"')
    expect(p).toContain('DIÁLOGO')
    expect(p).toContain(CHARLA_LOOK)
    expect(p).toContain('MENSAJE-ORIGINAL')
  })
})

describe('Charla y tutorial: guion y montaje', () => {
  it('lee puntos, burbujas (solo en el gancho) y la llamada a comentar, con sus límites', () => {
    const s = parseVideoScript(CHARLA)
    expect(s.style).toBe('charla')
    expect(s.scenes[0].comments).toEqual(['¿Y eso cómo se hace?', 'A mí no me sale', '¿Es gratis?'])
    expect(s.scenes[1].items).toHaveLength(4)
    expect(s.scenes[1].comments).toBeUndefined()
    expect(s.cta).toEqual({ word: 'GUÍA', line: 'y te paso los pasos' })
  })

  it('el plano cambia cuando cambia quién habla', () => {
    const s = parseVideoScript(CHARLA)
    const words = sceneWords(s.scenes[0], 2 + VOICE_LEAD_S, 4)
    const cuts = shotCuts(words, 2, 2, 5)
    expect(cuts).toHaveLength(1)
    const turn = words.find((w) => w.who === 'Hermes')!.start
    expect(cuts[0]).toBeCloseTo(turn, 1)
    expect(shotCuts(words, 1, 2, 5)).toEqual([])
    // Sin cambios de quién habla, los planos se reparten por la escena.
    expect(shotCuts(words.map((w) => ({ ...w, who: undefined })), 3, 0, 9)).toEqual([3, 6])
  })

  it('tarjeta «PASO n/N» con sus puntos, burbujas, quién habla y «Comenta PALABRA»; determinista', () => {
    const script = parseVideoScript(CHARLA)
    const input = {
      script,
      format: 'vertical' as const,
      timeline: buildTimeline([4, 3, 3]),
      images: ['assets/a.png', 'assets/c.png', null],
      shots: [['assets/a.png', 'assets/b.png'], ['assets/c.png'], [null]],
      audio: 'a.wav',
      gsap: 'g.js'
    }
    const { html, sfx } = buildCharlaComposition(input)
    expect(html).toContain('PASO 1/2')
    expect(html).toContain('PASO 2/2')
    expect(html).toContain('id="s2i3"')
    expect(html).toContain('id="s1b2"')
    expect(html).not.toContain('id="s2b0"')
    expect(html).toContain('class="who"')
    expect(html).toContain('Comenta <b id="ctaw">GUÍA</b>')
    expect(html).toContain('id="s1k1"')
    expect(html).toContain('assets/b.png')
    expect(sfx.some((x) => x.kind === 'impact')).toBe(true)
    expect(html).not.toMatch(/Math\.random|Date\.now|https?:\/\/(?!www\.w3\.org)/)
    expect(buildCharlaComposition(input).html).toBe(html)
  })
})

describe('Charla y tutorial: plató 3D con los robots', () => {
  const ROBOTS = JSON.stringify({ ...JSON.parse(CHARLA), scenes: JSON.parse(CHARLA).scenes.map((s: Record<string, unknown>) => ({ ...s, shots: undefined, image: 'the app screen' })) })

  it('solo con dos robots de kywai distintos', () => {
    expect(stageLooks({ speakers: [{ name: 'Hermes' }, { name: 'Claude' }] })).toEqual(['hermes', 'claude'])
    expect(stageLooks({ speakers: [{ name: 'codex' }, { name: 'Hermes' }] })).toEqual(['codex', 'hermes'])
    expect(stageLooks({ speakers: [{ name: 'Luna' }, { name: 'Claude' }] })).toBeNull()
    expect(stageLooks({ speakers: [{ name: 'Claude' }] })).toBeNull()
  })

  it('un plano por turno de palabra; el paso empieza mirando a la pantalla y los turnos largos se parten', () => {
    const lines = [
      { who: 0, start: 1, end: 2, emotion: 'alegre' },
      { who: 0, start: 2, end: 3, emotion: 'firme' },
      { who: 1, start: 3, end: 4, emotion: 'sorprendido' },
      { who: 0, start: 4, end: 9.5, emotion: 'alegre' }
    ]
    const shots = planShots(lines, 0.5, 10, true, 0)
    expect(shots[0]).toMatchObject({ start: 0.5, end: 3, kind: 'screen' })
    expect(shots[1]).toMatchObject({ start: 3, end: 4, kind: 'close1' })
    expect(shots[2].kind).toBe('ots0')
    expect(shots).toHaveLength(4)
    expect(shots[3].end).toBe(10)
    expect(planShots([], 0, 3, false, 0)).toEqual([{ start: 0, end: 3, kind: 'wide', move: 'crane' }])
  })

  it('cada robot mueve la boca con sus sílabas y la pantalla cambia de imagen en cada escena', () => {
    const script = parseVideoScript(ROBOTS)
    const tl = buildTimeline([4, 3, 3])
    const d = buildStageData(script, tl, ['hermes', 'claude'], ['assets/a.png', null, 'assets/c.png'], { accent: '#f00', accent2: '#00f' })
    expect(d.syl.some((s) => s[0] === 0)).toBe(true)
    expect(d.syl.some((s) => s[0] === 1)).toBe(true)
    expect(d.lines[0]).toMatchObject({ who: 1, emotion: 'sorprendido' })
    expect(d.screens).toEqual([[0, 0], [tl.scenes[0].start, 0], [tl.scenes[1].start, -1], [tl.scenes[2].start, 2]])
    expect(d.ticks.length).toBe(5)
    expect(d.shots[d.shots.length - 1]).toMatchObject({ start: tl.outroStart, kind: 'wide' })
    const input = { script, format: 'vertical' as const, timeline: tl, images: ['assets/a.png', null, 'assets/c.png'], audio: 'a.wav', gsap: 'g.js' }
    const { html } = buildCharlaComposition(input, d)
    expect(html).toContain('<canvas id="stage" width="1080" height="1920">')
    expect(html).toContain('<script type="module">')
    expect(html).toContain("import * as THREE from './assets/three.module.js'")
    expect(html).toContain('<img class="stageimg" src="assets/c.png"')
    expect(html).not.toContain('class="clip shot"')
    expect(html).toContain('PASO 1/2')
    expect(html).not.toMatch(/Math\.random|Date\.now/)
    expect(buildCharlaComposition(input, d).html).toBe(html)
  })

  it('con los robots, el encargo pide lo que sale en la pantalla y no planos de los personajes', () => {
    const p = videoScriptPrompt({ topic: 'x', format: 'vertical', lang: 'es', style: 'charla', dialogue: true, cast: { images: [], name: 'Robots de kywai' } })
    expect(p).toContain('PANTALLA GIGANTE')
    expect(p).not.toContain('"shots"')
    const q = videoScriptPrompt({ topic: 'x', format: 'vertical', lang: 'es', style: 'charla', dialogue: true, cast: { images: [], name: 'Luna' } })
    expect(q).toContain('"shots"')
  })
})

describe('Presentador: un solo robot', () => {
  it('habla por sílaba con sus palabras, un gesto y un sitio por escena, Hermes por defecto', () => {
    const tl = buildTimeline([3, 3])
    const words = (s: number) => [{ text: 'hola', start: s, key: false }, { text: 'amigos', start: s + 0.4, key: false }]
    const d = buildPresenterData({
      scenes: [
        { start: tl.scenes[0].start, duration: 3, words: words(tl.scenes[0].start + 0.2), pose: 'wave', spot: 'left' },
        { start: tl.scenes[1].start, duration: 3, words: words(tl.scenes[1].start + 0.2), joke: true }
      ],
      tl,
      accent: '#f00',
      accent2: '#00f'
    })
    expect(d.mode).toBe('solo')
    expect(d.looks).toEqual(['hermes'])
    expect(d.acts).toMatchObject([{ pose: 'wave', spot: 'left' }, { pose: 'laugh', spot: 'right' }])
    expect(d.syl.length).toBeGreaterThan(3)
    expect(d.syl.every((s) => s[0] === 0)).toBe(true)
    expect(d.lines[1].emotion).toBe('gracioso')
    expect(buildPresenterData({ scenes: [], tl, robot: 'claude', accent: '#f00', accent2: '#00f' }).looks).toEqual(['claude'])
    const { canvas, scripts } = stageHtml(d, 1080, 1920)
    expect(canvas).toBe('<canvas id="stage" width="1080" height="1920"></canvas>')
    expect(scripts).toContain('"mode":"solo"')
    expect(scripts).toContain("import * as THREE from './assets/three.module.js'")
    expect(scripts).not.toMatch(/Math\.random|Date\.now/)
  })
})
