import { describe, expect, it } from 'vitest'
import { buildComposition, buildTimeline, captionChunks, parseVideoRequest, parseVideoScript, synthMusic, videoScriptPrompt, videoSlug } from './videoScript'

const SCRIPT = JSON.stringify({
  title: 'Cómo nace una estrella',
  lang: 'es',
  theme: 'oceano',
  scenes: [
    { heading: 'Una nube enorme', narration: 'Todo empieza en una nube de gas y polvo, fría y oscura.', image: 'a dark nebula' },
    { heading: 'La gravedad aprieta', narration: 'La gravedad la va juntando poco a poco, durante millones de años.', image: '' },
    { heading: 'Se enciende', narration: 'Cuando el centro está lo bastante caliente, empieza a brillar.', image: 'a newborn star' }
  ],
  outro: 'Así nace una estrella'
})

describe('parseVideoRequest', () => {
  it('reconoce la orden y las frases habituales', () => {
    expect(parseVideoRequest('/video la fotosíntesis')).toEqual({ topic: 'la fotosíntesis', format: 'horizontal', fromPrevious: false })
    expect(parseVideoRequest('créame un vídeo de los agujeros negros')).toMatchObject({ topic: 'los agujeros negros', format: 'horizontal' })
    expect(parseVideoRequest('Hazme un video corto sobre el café')).toMatchObject({ topic: 'el café' })
    expect(parseVideoRequest('make a video about black holes')).toMatchObject({ topic: 'black holes' })
  })

  it('saca el formato vertical y lo quita del tema', () => {
    expect(parseVideoRequest('/video vertical el sistema solar')).toEqual({ topic: 'el sistema solar', format: 'vertical', fromPrevious: false })
    expect(parseVideoRequest('créame un vídeo para TikTok de recetas rápidas')).toMatchObject({ topic: 'recetas rápidas', format: 'vertical' })
    expect(parseVideoRequest('crea un vídeo de recetas rápidas para reels')).toMatchObject({ topic: 'recetas rápidas', format: 'vertical' })
  })

  it('«de esto» o sin tema: el vídeo es del mensaje anterior', () => {
    expect(parseVideoRequest('créame un vídeo de esto')).toMatchObject({ topic: '', fromPrevious: true })
    expect(parseVideoRequest('/video')).toMatchObject({ topic: '', fromPrevious: true })
    expect(parseVideoRequest('hazme un vídeo de este mensaje')).toMatchObject({ fromPrevious: true })
  })

  it('no confunde otras peticiones con un vídeo', () => {
    expect(parseVideoRequest('el vídeo de ayer no carga, revísalo')).toBeNull()
    expect(parseVideoRequest('/videos')).toBeNull()
    expect(parseVideoRequest('arregla el reproductor de vídeo')).toBeNull()
  })
})

describe('parseVideoScript', () => {
  it('lee el JSON aunque venga en un bloque de código o con texto alrededor', () => {
    const s = parseVideoScript('Aquí está:\n```json\n' + SCRIPT + '\n```')
    expect(s.title).toBe('Cómo nace una estrella')
    expect(s.theme).toBe('oceano')
    expect(s.scenes).toHaveLength(3)
    expect(s.scenes[1].image).toBe('')
  })

  it('rechaza un guion sin escenas suficientes', () => {
    expect(() => parseVideoScript('{"title": "x", "scenes": [{"narration": "uno"}]}')).toThrow(/al menos 3 escenas/)
    expect(() => parseVideoScript('no hay json')).toThrow(/JSON/)
  })

  it('tema desconocido: el de por defecto; sin rótulo: las primeras palabras', () => {
    const s = parseVideoScript(
      JSON.stringify({ title: 't', theme: 'rosa', scenes: [1, 2, 3].map((i) => ({ narration: `frase número ${i} con varias palabras más` })) })
    )
    expect(s.theme).toBe('noche')
    expect(s.scenes[0].heading).toBe('frase número 1 con varias')
  })
})

describe('composición', () => {
  it('reparte el tiempo: portada, escenas con su voz y cierre', () => {
    const tl = buildTimeline([4, 5.5, 3])
    expect(tl.scenes[0].start).toBe(tl.intro)
    expect(tl.scenes[1].start).toBeCloseTo(tl.scenes[0].start + tl.scenes[0].duration, 2)
    expect(tl.total).toBeCloseTo(tl.outroStart + tl.outro, 2)
  })

  it('los subtítulos cubren toda la voz en trozos cortos', () => {
    const caps = captionChunks('Todo empieza en una nube de gas y polvo, fría y oscura, muy lejos de aquí.', 10, 6)
    expect(caps[0].start).toBe(10)
    const end = caps[caps.length - 1].start + caps[caps.length - 1].duration
    expect(end).toBeCloseTo(16, 1)
    for (const c of caps) expect(c.text.split(' ').length).toBeLessThanOrEqual(8)
  })

  it('el HTML es una composición HyperFrames determinista con todas las escenas', () => {
    const script = parseVideoScript(SCRIPT)
    const tl = buildTimeline([3, 3, 3])
    const html = buildComposition({ script, format: 'vertical', timeline: tl, images: ['assets/escena-1.png', null, null], audio: 'assets/mezcla.wav', gsap: 'assets/gsap.min.js' })
    expect(html).toContain('data-composition-id="main"')
    expect(html).toContain('data-width="1080" data-height="1920"')
    expect(html).toContain('window.__timelines["main"]')
    expect(html).toContain('assets/escena-1.png')
    expect(html).not.toMatch(/Math\.random|Date\.now|https?:\/\//)
    for (let i = 1; i <= 3; i++) expect(html).toContain(`id="s${i}"`)
  })

  it('escapa el texto del guion', () => {
    const script = { ...parseVideoScript(SCRIPT), title: '<b>x</b> & "y"' }
    const html = buildComposition({ script, format: 'horizontal', timeline: buildTimeline([3, 3, 3]), images: [null, null, null], audio: 'a.wav', gsap: 'g.js' })
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;')
  })
})

describe('música y nombres', () => {
  it('la música es un WAV de la duración pedida, igual para el mismo título', () => {
    const a = synthMusic(1, 'hola', 8000)
    expect(a.subarray(0, 4).toString()).toBe('RIFF')
    expect(a.length).toBe(44 + 8000 * 2)
    expect(synthMusic(1, 'hola', 8000).equals(a)).toBe(true)
  })

  it('el nombre del archivo sale del título', () => {
    expect(videoSlug('¿Cómo nace una estrella?')).toBe('como-nace-una-estrella')
    expect(videoSlug('!!!')).toBe('video')
  })

  it('el encargo pide solo el JSON y repite el fallo anterior', () => {
    const p = videoScriptPrompt({ topic: 'el café', format: 'vertical', lang: 'es', retry: 'faltaba title' })
    expect(p).toContain('Tema: el café')
    expect(p).toContain('vertical 9:16')
    expect(p).toContain('faltaba title')
  })
})
