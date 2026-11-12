import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyDub, dubPrompt, findDubSource, markDelivered, markedNarration, parseDubRequest } from './dub'
import { parseVideoScript } from './videoScript'

const original = parseVideoScript(
  JSON.stringify({
    title: 'Cómo hago vídeos',
    lang: 'es',
    theme: 'neon',
    speakers: [{ name: 'Hermes', gender: 'm' }, { name: 'Ada', gender: 'f' }],
    scenes: [
      { heading: 'El problema', narration: '[Hermes, sorprendido] ¿Tres horas? [Ada, alegre] *Diez* minutos.', image: 'a tired editor', motion: 'steam rises' },
      { heading: 'La idea', narration: 'Deja la tarea y vuelve.', image: 'a calm desk', manim: 'class Escena(Scene):\n    def construct(self):\n        self.add(Text("Hola"))' },
      { heading: 'El final', narration: '[firme] Pruébalo hoy.', image: 'a sunrise', pose: 'point' }
    ],
    outro: 'Sígueme'
  })
)

const reply = JSON.stringify({
  title: 'How I make videos',
  outro: 'Follow me',
  scenes: [
    { heading: 'The problem', narration: '[Hermes, sorprendido] Three hours? [Ada, alegre] *Ten* minutes.' },
    { heading: 'The idea', narration: 'Leave the task and come back.', manim: 'class Escena(Scene):\n    def construct(self):\n        self.add(Text("Hello"))' },
    { heading: 'The end', narration: '[firme] Try it today.' }
  ]
})

describe('/doblar', () => {
  it('lee el idioma (también «al inglés») y lo demás', () => {
    expect(parseDubRequest('/doblar inglés')).toEqual({ lang: { code: 'en', name: 'inglés' }, note: '' })
    expect(parseDubRequest('/doblar al portugués más informal')).toEqual({ lang: { code: 'pt', name: 'portugués' }, note: 'más informal' })
    expect(parseDubRequest('/dub french')?.lang?.code).toBe('fr')
    expect(parseDubRequest('/doblar')).toEqual({ lang: null, note: '' })
    expect(parseDubRequest('/doblar klingon')?.lang).toBeNull()
    expect(parseDubRequest('/dobladillo')).toBeNull()
  })

  it('las marcas de emoción y de quién habla vuelven a la narración', () => {
    expect(markedNarration(original.scenes[0])).toBe('[Hermes, sorprendido] ¿Tres horas? [Ada, alegre] *Diez* minutos.')
    const p = dubPrompt({ script: original, lang: { code: 'en', name: 'inglés' }, note: '' })
    expect(p).toContain('al inglés')
    expect(p).toContain('[Hermes, sorprendido]')
    expect(p).toContain('self.add(Text(\\"Hola\\"))')
    expect(p).not.toContain('a tired editor')
  })

  it('el guion doblado: textos nuevos, mismas imágenes, movimiento, poses y voces', () => {
    const d = applyDub(original, `Listo:\n${reply}`, { code: 'en', name: 'inglés' })
    expect(d.lang).toBe('en')
    expect(d.title).toBe('How I make videos')
    expect(d.outro).toBe('Follow me')
    expect(d.scenes.map((s) => s.image)).toEqual(original.scenes.map((s) => s.image))
    expect(d.scenes[0].motion).toBe('steam rises')
    expect(d.scenes[2].pose).toBe('point')
    expect(d.scenes[0].lines).toEqual([
      { text: 'Three hours?', emotion: 'sorprendido', who: 'Hermes' },
      { text: '*Ten* minutes.', emotion: 'alegre', who: 'Ada' }
    ])
    expect(d.scenes[1].manim).toContain('Hello')
    expect(d.speakers).toEqual(original.speakers)
    expect(() => applyDub(original, JSON.stringify({ scenes: [{ narration: 'x' }] }), { code: 'en', name: 'inglés' })).toThrow(/1 escenas/)
  })

  it('encuentra la carpeta del vídeo: por la marca al entregarlo o, en los antiguos, por el nombre', () => {
    const root = mkdtempSync(join(tmpdir(), 'aicw-doblar-'))
    const mk = (id: string, title: string, format: string, age: number): string => {
      const dir = join(root, '.ai-cowork', 'videos', id)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'guion.json'), JSON.stringify({ format, ...original, title }))
      const t = Date.now() / 1000 - age
      utimesSync(dir, t, t)
      return dir
    }
    const old = mk('a', 'Cómo hago vídeos', 'vertical', 100)
    const marked = mk('b', 'Otro título', 'horizontal', 50)
    markDelivered(marked, 'videos/mi-video.mp4')
    expect(findDubSource(root, 'videos/mi-video.mp4')).toMatchObject({ dir: marked, format: 'horizontal' })
    expect(findDubSource(root, 'videos/como-hago-videos-vertical-2.mp4')).toMatchObject({ dir: old, format: 'vertical' })
    expect(findDubSource(root, 'videos/de-fuera.mp4')).toBeNull()
  })
})
