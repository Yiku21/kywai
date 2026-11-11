import { describe, expect, it } from 'vitest'
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
