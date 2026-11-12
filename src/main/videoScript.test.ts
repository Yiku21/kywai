import { describe, expect, it } from 'vitest'
import { buildCartoonComposition } from './videoCartoon'
import { beatsOf, buildComposition, buildTimeline, captionChunks, parseVideoRequest, parseVideoScript, sceneWords, spokenText, synthMusic, synthSfx, timedWords, videoScriptPrompt, videoSlug } from './videoScript'

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
  it('con un estilo de la biblioteca, lo separa del tema', () => {
    expect(parseVideoRequest('/video estilo acuarela sobre el ciclo del agua')).toEqual({ topic: 'el ciclo del agua', format: 'horizontal', fromPrevious: false, style: 'dinamico', film: 'watercolor' })
    expect(parseVideoRequest('/video estilo:pixel-rpg vertical cómo se hace el pan')).toMatchObject({ topic: 'cómo se hace el pan', format: 'vertical', film: 'pixel-rpg' })
    expect(parseVideoRequest('hazme un vídeo de los robots de kywai, estilo kywai')).toMatchObject({ topic: 'los robots de kywai', film: 'kywai-pintado' })
    expect(parseVideoRequest('/video estilo:ukiyoe de esto')).toMatchObject({ fromPrevious: true, film: 'ukiyoe' })
    expect(parseVideoRequest('/video estilo:cartoon la luna')).toEqual({ topic: 'la luna', format: 'horizontal', fromPrevious: false, style: 'cartoon', kind: 'presentador' })
    expect(parseVideoRequest('/video estilo:dinamico la luna')).toEqual({ topic: 'la luna', format: 'horizontal', fromPrevious: false, style: 'dinamico', kind: 'rapido' })
  })

  it('lee el tipo, el personaje y el estilo del selector', () => {
    expect(parseVideoRequest('/video tipo:mixto personaje:robots-kywai la luna')).toEqual({ topic: 'la luna', format: 'horizontal', fromPrevious: false, style: 'mixto', kind: 'mixto', character: 'robots-kywai' })
    expect(parseVideoRequest('/video tipo:presentador personaje:dona-rosa-3f9a estilo:watercolor vertical el pan')).toMatchObject({ topic: 'el pan', format: 'vertical', film: 'watercolor', kind: 'presentador', character: 'dona-rosa-3f9a' })
    // Un tema que habla de personajes no pide por eso el presentador si se eligió el tipo rápido.
    expect(parseVideoRequest('/video tipo:rapido los personajes de Cervantes')).toMatchObject({ topic: 'los personajes de Cervantes', style: 'dinamico' })
    // El estilo pintado a mano lleva los robots salvo que se elija «ninguno».
    expect(parseVideoRequest('/video estilo:kywai-pintado la luna')).toMatchObject({ film: 'kywai-pintado', character: 'robots-kywai' })
    expect(parseVideoRequest('/video personaje:ninguno estilo:kywai-pintado la luna')).not.toHaveProperty('character')
    // La voz: sola o con lo demás, y nunca en el tema.
    expect(parseVideoRequest('/video voz:kokoro-ef_dora la luna')).toMatchObject({ topic: 'la luna', voice: 'kokoro-ef_dora' })
    expect(parseVideoRequest('/video tipo:mixto estilo:watercolor voz:gemini-puck el pan')).toMatchObject({ topic: 'el pan', film: 'watercolor', voice: 'gemini-puck' })
    expect(parseVideoRequest('/video la luna')).not.toHaveProperty('voice')
  })

  it('reconoce la orden y las frases habituales', () => {
    expect(parseVideoRequest('/video la fotosíntesis')).toEqual({ topic: 'la fotosíntesis', format: 'horizontal', fromPrevious: false, style: 'dinamico' })
    expect(parseVideoRequest('créame un vídeo de los agujeros negros')).toMatchObject({ topic: 'los agujeros negros', format: 'horizontal' })
    expect(parseVideoRequest('Hazme un video corto sobre el café')).toMatchObject({ topic: 'el café' })
    expect(parseVideoRequest('make a video about black holes')).toMatchObject({ topic: 'black holes' })
  })

  it('saca el formato vertical y lo quita del tema', () => {
    expect(parseVideoRequest('/video vertical el sistema solar')).toEqual({ topic: 'el sistema solar', format: 'vertical', fromPrevious: false, style: 'dinamico' })
    expect(parseVideoRequest('créame un vídeo para TikTok de recetas rápidas')).toMatchObject({ topic: 'recetas rápidas', format: 'vertical' })
    expect(parseVideoRequest('crea un vídeo de recetas rápidas para reels')).toMatchObject({ topic: 'recetas rápidas', format: 'vertical' })
  })

  it('dibujos con personaje: estilo cartoon, y el estilo no entra en el tema', () => {
    expect(parseVideoRequest('créame un vídeo estilo cartoon de una persona explicando cómo se instala la RAM en un PC')).toMatchObject({
      topic: 'una persona explicando cómo se instala la RAM en un PC',
      style: 'cartoon'
    })
    expect(parseVideoRequest('hazme un vídeo tutorial de cómo cambiar una rueda')).toMatchObject({ topic: 'cómo cambiar una rueda', style: 'cartoon' })
    expect(parseVideoRequest('/video vertical dibujos animados sobre el ciclo del agua')).toMatchObject({ topic: 'el ciclo del agua', style: 'cartoon', format: 'vertical' })
    expect(parseVideoRequest('/video el ciclo del agua')).toMatchObject({ style: 'dinamico' })
  })

  it('«de esto» o sin tema: el vídeo es del mensaje anterior', () => {
    expect(parseVideoRequest('créame un vídeo de esto')).toMatchObject({ topic: '', fromPrevious: true })
    expect(parseVideoRequest('/video')).toMatchObject({ topic: '', fromPrevious: true })
    expect(parseVideoRequest('hazme un vídeo de este mensaje')).toMatchObject({ fromPrevious: true })
    // Varios sin decir cuáles: lo entiende Hermes (mira la conversación y lanza la orden con una línea por vídeo).
    expect(parseVideoRequest('créame un vídeo con cada uno de esos guiones')).toBeNull()
    expect(parseVideoRequest('hazme un vídeo por guion, en inglés')).toBeNull()
    expect(parseVideoRequest('créame un vídeo usando esos textos')).toBeNull()
    expect(parseVideoRequest('hazme un vídeo de los robots con estos personajes fijos')).not.toBeNull()
    expect(parseVideoRequest('/video con cada uno de los temas')).not.toBeNull()
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
    const { html, sfx } = buildComposition({ script, format: 'vertical', timeline: tl, images: ['assets/escena-1.png', null, null], audio: 'assets/mezcla.wav', gsap: 'assets/gsap.min.js' })
    // Un «whoosh» por transición (tres escenas y el cierre) y golpes en la portada.
    expect(sfx.filter((x) => x.kind === 'whoosh')).toHaveLength(4)
    expect(sfx.some((x) => x.kind === 'impact')).toBe(true)
    expect(sfx.every((x, i) => i === 0 || x.at >= sfx[i - 1].at)).toBe(true)
    // GSAP 3 no anima clases.
    expect(html).not.toContain('className')
    expect(html).toContain('data-composition-id="main"')
    expect(html).toContain('data-width="1080" data-height="1920"')
    expect(html).toContain('window.__timelines["main"]')
    expect(html).toContain('assets/escena-1.png')
    expect(html).not.toMatch(/Math\.random|Date\.now|https?:\/\//)
    for (let i = 1; i <= 3; i++) expect(html).toContain(`id="s${i}"`)
  })

  it('escapa el texto del guion', () => {
    const script = { ...parseVideoScript(SCRIPT), title: '<b>x</b> & "y"' }
    const { html } = buildComposition({ script, format: 'horizontal', timeline: buildTimeline([3, 3, 3]), images: [null, null, null], audio: 'a.wav', gsap: 'g.js' })
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('&quot;y&quot;')
    expect(html).not.toContain('<b>x</b>')
  })
})

describe('palabras clave y golpes', () => {
  it('los *asteriscos* marcan la palabra clave y la voz no los lee', () => {
    const n = 'Esto lo hace una *inteligencia artificial* sin ayuda.'
    expect(spokenText(n)).toBe('Esto lo hace una inteligencia artificial sin ayuda.')
    const w = timedWords(n, 0, 4)
    expect(w.filter((x) => x.key).map((x) => x.text)).toEqual(['inteligencia', 'artificial'])
    expect(w[0].start).toBe(0)
    expect(w.every((x, i) => i === 0 || x.start > w[i - 1].start)).toBe(true)
  })

  it('cada golpe lleva como mucho 4 palabras y corta en las pausas', () => {
    const beats = beatsOf(timedWords('Tú solo escribes una frase, y kywai se encarga de todo lo demás.', 0, 5))
    expect(beats.flat()).toHaveLength(13)
    for (const b of beats) expect(b.length).toBeLessThanOrEqual(5)
    expect(beats[1].map((w) => w.text).join(' ')).toMatch(/frase,$/)
  })
})

describe('estilo cartoon', () => {
  const CARTOON = JSON.stringify({
    title: 'Cómo instalar la RAM',
    style: 'cartoon',
    theme: 'papel',
    scenes: [
      { heading: '¡Hola!', narration: '¡Hola! Hoy instalamos la *RAM*.', image: '', pose: 'wave', step: 0 },
      { heading: 'Desenchufa', narration: 'Primero *desenchufa* el PC.', image: 'a hand unplugging a cable', pose: 'point', step: 1 },
      { heading: 'Ups', narration: 'El polvo *no es decoración*.', image: '', pose: 'bailar', step: 'dos', joke: true }
    ],
    outro: '¡Hecho!'
  })

  it('lee gesto, paso y broma, y descarta lo que no vale', () => {
    const s = parseVideoScript(CARTOON)
    expect(s.style).toBe('cartoon')
    expect(s.scenes[1]).toMatchObject({ pose: 'point', step: 1 })
    expect(s.scenes[2].pose).toBeUndefined()
    expect(s.scenes[2].step).toBeUndefined()
    expect(s.scenes[2].joke).toBe(true)
    expect(parseVideoScript(SCRIPT).style).toBe('dinamico')
  })

  it('el personaje habla, señala, se ríe en la broma y la composición es determinista', () => {
    const script = parseVideoScript(CARTOON)
    const input = { script, format: 'horizontal' as const, timeline: buildTimeline([3, 3, 3]), images: [null, 'assets/escena-2.png', null], audio: 'a.wav', gsap: 'g.js' }
    const { html, sfx } = buildCartoonComposition(input)
    expect(html).toContain('id="mouth"')
    expect(html).toContain('id="s2k0ring"')
    expect(html).toContain('id="s3ja"')
    expect(html).toContain('PASO')
    expect(html).toContain('assets/escena-2.png')
    expect(sfx.some((x) => x.kind === 'boing')).toBe(true)
    expect(html).not.toMatch(/Math\.random|Date\.now|https?:\/\/(?!www\.w3\.org)/)
    expect(buildCartoonComposition(input).html).toBe(html)
  })

  it('varios planos por paso: cada uno a pantalla completa y el círculo de «mira aquí» en el último', () => {
    const script = parseVideoScript(CARTOON)
    const shots = [[null], ['assets/escena-2.png', 'assets/escena-2-2.png', 'assets/escena-2-3.png'], [null]]
    const { html } = buildCartoonComposition({ script, format: 'vertical', timeline: buildTimeline([3, 6, 3]), images: [null, null, null], shots, audio: 'a.wav', gsap: 'g.js' })
    for (const k of [0, 1, 2]) expect(html).toContain(`id="s2k${k}"`)
    expect(html).toContain('id="s2k2ring"')
    expect(html).not.toContain('id="s2k0ring"')
  })

  it('con un personaje elegido, el presentador es su imagen; en mixto, las escenas de texto lo apartan', () => {
    const script = parseVideoScript(JSON.stringify({ title: 't', style: 'mixto', scenes: [
      { mode: 'presentador', narration: 'Hola, soy Rosa', heading: 'Hola', shots: ['a'] },
      { mode: 'texto', narration: 'Esto lo cambia todo', heading: 'Lo cambia todo', shots: ['no'] },
      { mode: 'presentador', narration: 'Y ahora, el paso uno', heading: 'Paso uno', shots: ['b'] }
    ] }))
    expect(script.style).toBe('mixto')
    expect(script.scenes.map((x) => !!x.text)).toEqual([false, true, false])
    const { html } = buildCartoonComposition({ script, format: 'horizontal', timeline: buildTimeline([3, 3, 3]), images: ['x.png', 'y.png', 'z.png'], audio: 'a.wav', gsap: 'g.js', presenter: 'assets/presentador.png' })
    expect(html).toContain('id="hostimg" src="assets/presentador.png"')
    expect(html).not.toContain('id="mouth"')
    expect(html).not.toContain("'#armL'")
    // La escena de texto lleva las palabras en grande y no su imagen.
    expect(html).toContain('id="s2bw0"')
    expect(html).not.toContain('src="y.png"')
  })

  it('el encargo mixto pide alternar presentador y golpes de texto, y nombra al personaje', () => {
    const p = videoScriptPrompt({ topic: 'el pan', format: 'vertical', lang: 'es', style: 'mixto', cast: { images: ['/r/rosa.png'], name: 'Doña Rosa', about: 'abuela panadera' } })
    expect(p).toContain('"mode": "texto"')
    expect(p).toContain('Doña Rosa (el personaje elegido)')
    expect(p).toContain('abuela panadera')
    expect(p).toContain('/r/rosa.png')
  })

  it('lee hasta 3 planos y el primero hace de imagen', () => {
    const s = parseVideoScript(JSON.stringify({ title: 't', style: 'cartoon', scenes: [1, 2, 3].map((i) => ({ narration: `frase ${i}`, shots: ['a', 'b', 'c', 'd'] })) }))
    expect(s.scenes[0].shots).toEqual(['a', 'b', 'c'])
    expect(s.scenes[0].image).toBe('a')
  })

  it('el encargo cartoon pide pasos, bromas y gestos', () => {
    const p = videoScriptPrompt({ topic: 'instalar la RAM', format: 'horizontal', lang: 'es', style: 'cartoon' })
    expect(p).toContain('"joke": true')
    expect(p).toContain('"pose"')
    expect(p).toContain('"style": "cartoon"')
  })
})

describe('música y nombres', () => {
  it('los efectos son un WAV de la duración del vídeo', () => {
    const a = synthSfx([{ at: 0.1, kind: 'whoosh' }, { at: 0.5, kind: 'impact' }, { at: 0.9, kind: 'pop' }, { at: 0.2, kind: 'riser' }, { at: 1, kind: 'boing' }], 1.5, 8000)
    expect(a.length).toBe(44 + 12000 * 2)
  })

  it('la música sale con cualquier título (antes fallaba con algunos, p. ej. «Un niño corre»)', () => {
    for (const t of ['Un niño corre', 'Cómo instalar la RAM', 'x', 'Un título bastante largo con acentos: ñandú, pingüino']) {
      expect(synthMusic(0.2, t, 8000).length).toBe(44 + 1600 * 2)
    }
  })

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

describe('animaciones de Manim', () => {
  const CODE = 'from manim import *\nclass Escena(Scene):\n    def construct(self):\n        self.play(Create(Circle()))'
  const withManim = (n: number): string =>
    JSON.stringify({
      title: 'Ondas',
      lang: 'es',
      scenes: Array.from({ length: 5 }, (_, i) => ({ heading: `E${i}`, narration: `Escena número ${i} del vídeo.`, image: 'x', ...(i < n ? { manim: CODE } : {}) })),
      outro: 'Fin'
    })

  it('lee el código si trae la clase Escena, como mucho en 3 escenas', () => {
    expect(parseVideoScript(withManim(5)).scenes.filter((s) => s.manim)).toHaveLength(3)
    const bad = JSON.parse(withManim(1))
    bad.scenes[0].manim = 'print("hola")'
    expect(parseVideoScript(JSON.stringify(bad)).scenes[0].manim).toBeUndefined()
  })

  it('el encargo explica Manim solo si está instalado, y sin LaTeX pide Text', () => {
    const base = { topic: 'ondas', format: 'vertical' as const, lang: 'es' }
    expect(videoScriptPrompt(base)).not.toContain('"manim"')
    const p = videoScriptPrompt({ ...base, manim: { latex: false } })
    expect(p).toContain('class Escena(Scene)')
    expect(p).toContain('sin MathTex')
    expect(videoScriptPrompt({ ...base, manim: { latex: true } })).toContain('MathTex')
    expect(videoScriptPrompt({ ...base, style: 'cartoon', manim: { latex: false } })).toContain('el personaje')
  })

  it('el clip va como <video> con tiempo propio, fuera de la escena, y la escena deja los subtítulos abajo', () => {
    const script = parseVideoScript(withManim(1))
    const timeline = buildTimeline(script.scenes.map(() => 3))
    const input = { script, format: 'vertical' as const, timeline, images: script.scenes.map(() => 'assets/x.png'), clips: ['assets/manim-1.mp4', null, null, null, null], audio: 'a.wav', gsap: 'g.js' }
    for (const html of [buildComposition(input).html, buildCartoonComposition({ ...input, script: { ...script, style: 'cartoon' } }).html]) {
      const video = html.match(/<video id="s1m"[^>]*>/)?.[0] ?? ''
      expect(video).toContain('src="assets/manim-1.mp4"')
      expect(video).toContain('muted')
      expect(video).toContain(`data-start="${timeline.scenes[0].start}"`)
      // Antes que las escenas (debajo) y no dentro de ninguna.
      expect(html.indexOf('<video id="s1m"')).toBeLessThan(html.indexOf('<section id="s1"'))
      const s1 = html.slice(html.indexOf('<section id="s1"'), html.indexOf('</section>', html.indexOf('<section id="s1"')))
      expect(s1).not.toContain('<img')
    }
    expect(buildComposition(input).html).toContain('class="clip scene has-manim"')
  })
})

describe('estilo de las imágenes y escenas con movimiento', () => {
  const scenes = (n: number, extra: Record<string, unknown> = {}) =>
    Array.from({ length: n }, (_, i) => ({ narration: `frase número ${i} con varias palabras`, image: `escena ${i}`, ...extra }))

  it('lee el «look» y como mucho 3 escenas con «motion»', () => {
    const s = parseVideoScript(JSON.stringify({ title: 't', look: 'Ink doodle: black pen lines on cream paper', scenes: scenes(5, { motion: 'the camera pushes in slowly' }) }))
    expect(s.look).toBe('Ink doodle: black pen lines on cream paper')
    expect(s.scenes.filter((x) => x.motion)).toHaveLength(3)
    expect(parseVideoScript(JSON.stringify({ title: 't', scenes: scenes(3) })).look).toBeUndefined()
  })

  it('con referencias pide sacar el estilo de ellas; «motion» solo si hay FreeVideo', () => {
    const base = { topic: 'el café', format: 'vertical' as const, lang: 'es' }
    const p = videoScriptPrompt({ ...base, refs: ['/p/ref-1.png'] })
    expect(p).toContain('/p/ref-1.png')
    expect(p).toContain('"look"')
    expect(p).not.toContain('"motion"')
    expect(videoScriptPrompt({ ...base, motion: true })).toContain('"motion"')
    expect(videoScriptPrompt({ ...base, style: 'cartoon', refs: ['/p/r.jpg'], motion: true })).toContain('"motion"')
  })
})

describe('gancho y personajes fijos', () => {
  it('«personajes fijos» los guarda y no pide el estilo de dibujos', () => {
    expect(parseVideoRequest('/video con estos personajes fijos: la vuelta al cole')).toMatchObject({ topic: 'la vuelta al cole', saveCast: true, style: 'dinamico' })
    expect(parseVideoRequest('/video estilo acuarela con mis personajes fijos sobre el mar')).toMatchObject({ film: 'watercolor', topic: 'el mar', saveCast: true })
    expect(parseVideoRequest('/video un tutorial con personaje de cómo atarse')).toMatchObject({ style: 'cartoon' })
    expect(parseVideoRequest('/video un tutorial con personaje de cómo atarse')?.saveCast).toBeUndefined()
  })

  it('el encargo lleva el gancho y, con personajes, su descripción fija', () => {
    const base = { topic: 'el café', format: 'vertical' as const, lang: 'es' }
    expect(videoScriptPrompt(base)).toContain('Gancho en los 2 primeros segundos')
    expect(videoScriptPrompt({ ...base, style: 'cartoon' })).toContain('Gancho en los 2 primeros segundos')
    const p = videoScriptPrompt({ ...base, cast: { images: ['/p/personajes/ana.png'] } })
    expect(p).toContain('/p/personajes/ana.png')
    expect(p).toContain('"cast"')
    expect(videoScriptPrompt({ ...base, cast: { images: [], notes: 'Ana: red jacket' } })).toContain('Ana: red jacket')
    expect(videoScriptPrompt(base)).not.toContain('"cast"')
    expect(parseVideoScript(JSON.stringify({ title: 't', cast: 'Ana: red jacket', scenes: [1, 2, 3].map((i) => ({ narration: `frase ${i} con palabras` })) })).cast).toBe('Ana: red jacket')
  })
})

describe('voz con emoción por frase', () => {
  const script = (narration: string, extra: Record<string, unknown> = {}): string =>
    JSON.stringify({
      title: 'Prueba',
      lang: 'es',
      scenes: [
        { heading: 'Uno', narration, image: '', ...extra },
        { heading: 'Dos', narration: 'Segunda escena sin marcas.', image: '' },
        { heading: 'Tres', narration: '[firme] Tercera.', image: '' }
      ]
    })

  it('el guion guarda las frases con su emoción y deja la narración sin marcas', () => {
    const s = parseVideoScript(script('[triste] Tres horas después… nada. [emocionado] ¡Y en *diez* minutos, hecho!'))
    expect(s.scenes[0].narration).toBe('Tres horas después… nada. ¡Y en *diez* minutos, hecho!')
    expect(s.scenes[0].lines?.map((l) => l.emotion)).toEqual(['triste', 'emocionado'])
    expect(s.scenes[1].lines).toEqual([{ text: 'Segunda escena sin marcas.', emotion: 'neutral' }])
    expect(s.scenes[2].narration).toBe('Tercera.')
  })

  it('una escena de broma, sin marca, va con voz graciosa', () => {
    const s = parseVideoScript(script('Me equivoqué de cable.', { joke: true }))
    expect(s.scenes[0].lines?.[0].emotion).toBe('gracioso')
  })

  it('el encargo del guion pide la emoción delante de cada frase', () => {
    expect(videoScriptPrompt({ topic: 'x', format: 'vertical', lang: 'es' })).toContain('[emocionado]')
    expect(videoScriptPrompt({ topic: 'x', format: 'vertical', lang: 'es', style: 'cartoon' })).toContain('[susurro]')
  })

  it('los subtítulos siguen a cada frase con su pausa', () => {
    const sc = parseVideoScript(script('[triste] Uno dos. [alegre] Tres cuatro.')).scenes[0]
    sc.lineTimes = [{ at: 0, dur: 1 }, { at: 2, dur: 1 }]
    const words = sceneWords(sc, 10, 3)
    expect(words.map((w) => w.text)).toEqual(['Uno', 'dos.', 'Tres', 'cuatro.'])
    expect(words[0].start).toBe(10)
    expect(words[2].start).toBe(12)
    // Sin tiempos por frase, el reparto de siempre.
    delete sc.lineTimes
    expect(sceneWords(sc, 10, 3)).toEqual(timedWords(sc.narration, 10, 3))
  })
})

describe('diálogo entre dos personajes', () => {
  const duo = JSON.stringify({
    title: 'Charla',
    lang: 'es',
    speakers: [{ name: 'Hermes', gender: 'female' }, { name: 'Claude', gender: 'm' }, { name: 'Codex', gender: 'm' }],
    scenes: [
      { heading: 'Uno', narration: '[Claude, sorprendido] ¿Quién hace estos vídeos? [Hermes, alegre] Yo. [Claude] ¿Tú?', image: '' },
      { heading: 'Dos', narration: '[Hermes, firme] Cuatro pasos.', image: '' },
      { heading: 'Tres', narration: '[Claude, emocionado] ¡Vamos!', image: '' }
    ]
  })

  it('lee los dos personajes y quién dice cada frase', () => {
    const s = parseVideoScript(duo)
    expect(s.speakers).toEqual([{ name: 'Hermes', gender: 'f' }, { name: 'Claude', gender: 'm' }])
    expect(s.scenes[0].narration).toBe('¿Quién hace estos vídeos? Yo. ¿Tú?')
    expect(s.scenes[0].lines?.map((l) => [l.who, l.emotion])).toEqual([['Claude', 'sorprendido'], ['Hermes', 'alegre'], ['Claude', 'alegre']])
  })

  it('cada personaje tiene sus golpes de subtítulo y su etiqueta con el nombre', () => {
    const s = parseVideoScript(duo)
    const words = sceneWords(s.scenes[0], 0, 3)
    expect(beatsOf(words).map((b) => b.map((w) => w.who)[0])).toEqual(['Claude', 'Hermes', 'Claude'])
    const comp = buildComposition({ script: s, format: 'vertical', timeline: buildTimeline([3, 1, 1]), images: [null, null, null], audio: 'a.wav', gsap: 'g.js' })
    expect(comp.html).toContain('class="who"')
    expect(comp.html).toContain('>Hermes</span>')
  })

  it('el encargo pide el diálogo y los personajes', () => {
    const p = videoScriptPrompt({ topic: 'x', format: 'vertical', lang: 'es', dialogue: true, cast: { images: [], name: 'Robots de kywai' } })
    expect(p).toContain('DIÁLOGO entre Hermes y Claude')
    expect(p).toContain('"speakers"')
    expect(videoScriptPrompt({ topic: 'x', format: 'vertical', lang: 'es' })).not.toContain('"speakers"')
  })

  it('se pide con la marca o con palabras', () => {
    expect(parseVideoRequest('/video dialogo:si cómo hacer pan')).toMatchObject({ topic: 'cómo hacer pan', dialogue: true })
    expect(parseVideoRequest('/video un diálogo entre un gato y un perro sobre el pan')?.dialogue).toBe(true)
    expect(parseVideoRequest('/video cómo hacer pan')?.dialogue).toBeUndefined()
  })

  it('la estructura «Reel en 3 pasos» con marca o con palabras, y no en «Charla y tutorial»', () => {
    expect(parseVideoRequest('/video estructura:pasos deja de montar un agente por tarea')).toMatchObject({ topic: 'deja de montar un agente por tarea', structure: 'pasos' })
    expect(parseVideoRequest('/video con estructura en 3 pasos cómo ordenar el correo')).toMatchObject({ topic: 'cómo ordenar el correo', structure: 'pasos' })
    expect(parseVideoRequest('/video estructura:pasos estilo:kywai-voxel-bots las skills')).toMatchObject({ film: 'kywai-voxel-bots', structure: 'pasos', topic: 'las skills' })
    expect(parseVideoRequest('/video tipo:charla estructura:pasos el pan')?.structure).toBeUndefined()
    expect(parseVideoRequest('/video cómo hacer pan en 3 pasos')).toMatchObject({ topic: 'cómo hacer pan en 3 pasos' })
    expect(parseVideoRequest('/video cómo hacer pan en 3 pasos')?.structure).toBeUndefined()
    const base = { topic: 'las skills', format: 'vertical' as const, lang: 'es' }
    expect(videoScriptPrompt({ ...base, structure: 'pasos' })).toContain('«¿Te suena?»')
    expect(videoScriptPrompt({ ...base, style: 'cartoon', structure: 'pasos' })).toContain('"step": 1, 2 y 3')
    expect(videoScriptPrompt(base)).not.toContain('Reel en 3 pasos')
  })
})
