import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { episodeBrief, episodeFromFilmReply, episodeRules, loadSeries, nextEpisode, parseSeriesRequest, recordEpisode, startSeries } from './series'
import { parseVideoScript, videoScriptPrompt } from './videoScript'

describe('/serie', () => {
  it('entiende empezar, seguir con lo votado y preguntar cómo va', () => {
    expect(parseSeriesRequest('/serie un gato detective en Madrid en 4 episodios')).toEqual({ kind: 'new', idea: 'un gato detective en Madrid', episodes: 4, video: '/video un gato detective en Madrid' })
    expect(parseSeriesRequest('/serie a robot chef, in 3 episodes')).toMatchObject({ idea: 'a robot chef', episodes: 3 })
    expect(parseSeriesRequest('/serie estilo acuarela una bruja novata')).toMatchObject({ kind: 'new', episodes: 5, video: '/video estilo acuarela una bruja novata' })
    expect(parseSeriesRequest('/serie dragones en 40 capítulos')).toMatchObject({ episodes: 10 })
    expect(parseSeriesRequest('/serie siguiente ganó: abre la puerta')).toEqual({ kind: 'next', vote: 'abre la puerta' })
    expect(parseSeriesRequest('/serie next won B')).toEqual({ kind: 'next', vote: 'B' })
    expect(parseSeriesRequest('/serie siguiente')).toEqual({ kind: 'next' })
    expect(parseSeriesRequest('/serie')).toEqual({ kind: 'status' })
    expect(parseSeriesRequest('/video una serie de gatos')).toBeNull()
    expect(parseSeriesRequest('haz una serie')).toBeNull()
  })

  it('guarda los episodios y los protagonistas, y aparta la serie anterior al empezar otra', () => {
    const root = mkdtempSync(join(tmpdir(), 'serie-'))
    const s = startSeries(root, { idea: 'un gato detective', total: 2, format: 'vertical', style: 'dinamico' }, 1000)
    expect(nextEpisode(s)).toBe(1)
    recordEpisode(root, { n: 1, title: 'El robo', summary: 'Roban el queso.', cliffhanger: 'Se apaga la luz.', question: '¿Enciende la linterna o huye? A o B' }, 'Misha: grey cat with a red scarf')
    const after = loadSeries(root)!
    expect(after.characters).toBe('Misha: grey cat with a red scarf')
    expect(nextEpisode(after)).toBe(2)
    // Los protagonistas no cambian aunque otro episodio traiga otros.
    recordEpisode(root, { n: 2, title: 'Final', summary: 'Lo resuelve.' }, 'Otro')
    expect(loadSeries(root)!.characters).toBe('Misha: grey cat with a red scarf')
    expect(nextEpisode(loadSeries(root)!)).toBeNull()
    startSeries(root, { idea: 'otra', total: 3, format: 'vertical', style: 'cartoon' }, 2000)
    expect(loadSeries(root)!.idea).toBe('otra')
    expect(readdirSync(join(root, '.ai-cowork')).sort()).toEqual(['serie-1jk.json', 'serie.json'])
  })

  it('el encargo del episodio cuenta lo anterior, lo votado y pide suspense con pregunta (salvo el último)', () => {
    const root = mkdtempSync(join(tmpdir(), 'serie-'))
    startSeries(root, { idea: 'un gato detective', total: 3, format: 'vertical', style: 'dinamico' })
    const s = recordEpisode(root, { n: 1, title: 'El robo', summary: 'Roban el queso.', question: '¿Linterna o huye?' })!
    const b = episodeBrief(s, 2, 'linterna', false)
    const prompt = videoScriptPrompt({ topic: 'un gato detective (episodio 2 de 3)', format: 'vertical', lang: 'es', episode: b })
    expect(prompt).toContain('episodio 2 de una serie de 3')
    expect(prompt).toContain('Episodio 1 «El robo»: Roban el queso.')
    expect(prompt).toContain('«linterna»')
    expect(prompt).toContain('SUSPENSE')
    expect(prompt).toContain('"episode": {"summary"')
    expect(prompt).toContain('"cast": inventa')
    const last = episodeRules(episodeBrief(s, 3, undefined, true)).join('\n')
    expect(last).toContain('ÚLTIMO episodio')
    expect(last).not.toContain('SUSPENSE')
    expect(last).toContain('personajes fijos')
    expect(episodeRules(episodeBrief(s, 1, undefined, false), true).join('\n')).toContain('«Resumen: …»')
  })

  it('lee lo que pasó del guion y de la respuesta de una película', () => {
    const script = parseVideoScript(
      JSON.stringify({
        title: 'El robo',
        cast: 'Misha: grey cat',
        episode: { summary: 'Roban el queso.', cliffhanger: 'Se apaga la luz.', question: '¿A o B?' },
        scenes: [1, 2, 3].map((i) => ({ heading: `E${i}`, narration: `Frase ${i} con *algo*`, image: 'a cat' }))
      })
    )
    expect(script.episode).toEqual({ summary: 'Roban el queso.', cliffhanger: 'Se apaga la luz.', question: '¿A o B?' })
    expect(episodeFromFilmReply('Título: El robo\nUn gato.\nResumen: Roban el queso.\nSuspense: Luz fuera.\nPregunta: ¿A o B?')).toEqual({ summary: 'Roban el queso.', cliffhanger: 'Luz fuera.', question: '¿A o B?' })
  })
})
