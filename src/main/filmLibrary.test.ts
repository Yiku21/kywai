import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { filmStyle, KYWAI_FILM } from '@shared/filmStyles'
import { FILM_STYLES } from '@shared/filmStyles'
import { filmPrompt, filmTitle, findFilm, KYWAI_GUIDE_FILE } from './filmLibrary'
import { KYWAI_FILM_GUIDES } from './kywaiFilmGuides'

describe('películas con estilo', () => {
  const robots = { id: 'robots-kywai', name: 'Hermes, Claude y Codex (los robots de kywai)', images: ['/kywai/robots/hermes.png'], look: 'Hermes: …', builtin: true }
  const base = { topic: 'el ciclo del agua', format: 'horizontal' as const, lang: 'es', studioDir: '/estudio', work: '/proyecto/.ai-cowork/videos/x' }

  it('el encargo apunta a la guía del estilo, a la carpeta y al archivo final', () => {
    const p = filmPrompt({ ...base, style: filmStyle('watercolor')! })
    expect(p).toContain('Watercolor Brush')
    expect(p).toContain(join('/estudio', 'lemo-opuscar', 'styles', 'watercolor', 'STYLE.md'))
    expect(p).toContain(join(base.work, 'pelicula.mp4'))
    expect(p).toContain('No preguntes nada')
    expect(p).toContain('BLOQUEADA:')
    expect(p).not.toContain('material real')
    expect(filmPrompt({ ...base, style: filmStyle('satellite-briefing')! })).toContain('material real')
  })

  it('el de los robots usa el kit de animación pintada y no su mascota', () => {
    const p = filmPrompt({ ...base, style: filmStyle(KYWAI_FILM)!, format: 'vertical', character: robots })
    expect(p).toContain(join('/estudio', 'animacion-pintada', 'KYWAI.md'))
    expect(p).toContain('kywaiRobot()')
    expect(p).toContain('Clawd) no sale')
    expect(p).toContain('vertical 1080×1920')
    // Sin personaje, el kit dibuja otros; los robots no se piden.
    expect(filmPrompt({ ...base, style: filmStyle(KYWAI_FILM)! })).not.toContain('kywaiRobot()')
  })

  it('el personaje elegido sale en el estilo de la película, con sus imágenes y su aspecto', () => {
    const rosa = { id: 'dona-rosa-3f9a', name: 'Doña Rosa', about: 'una abuela panadera con delantal azul', images: ['/p/personajes/dona-rosa-3f9a/imagen-1.png'], look: 'Rosa: elderly woman, grey bun, blue apron' }
    const p = filmPrompt({ ...base, style: filmStyle('watercolor')!, character: rosa, kind: 'mixto' })
    expect(p).toContain('Protagonista elegido por el usuario: Doña Rosa')
    expect(p).toContain(rosa.images[0])
    expect(p).toContain(rosa.look)
    expect(p).toContain('una abuela panadera')
    expect(p).toContain('Tipo «mixto»')
    // Los robots en otro estilo: con sus imágenes de referencia (no con el kit pintado).
    const r = filmPrompt({ ...base, style: filmStyle('pixel-rpg')!, character: robots })
    expect(r).toContain('/kywai/robots/hermes.png')
    expect(r).not.toContain('kywaiRobot()')
  })

  it('la voz elegida va en el encargo', () => {
    expect(filmPrompt({ ...base, style: filmStyle('watercolor')!, voice: 'kokoro-em_alex' })).toContain('-v em_alex')
    expect(filmPrompt({ ...base, style: filmStyle('watercolor')!, voice: 'gemini-kore' })).toContain('voiceName "Kore"')
    expect(filmPrompt({ ...base, style: filmStyle('watercolor')!, voice: 'voicebox-mia' })).toContain('"voice": "mia"')
    expect(filmPrompt({ ...base, style: filmStyle('watercolor')!, voice: 'mac-carmen' })).toContain('com.apple.siri.natural.Carmen')
    // En español, sin elegir, Álvaro (Edge); en otro idioma, sin regla de voz.
    expect(filmPrompt({ ...base, style: filmStyle('watercolor')! })).toContain('--voice es-ES-AlvaroNeural')
    expect(filmPrompt({ ...base, lang: 'en', style: filmStyle('watercolor')! })).not.toContain('Voz elegida')
  })

  it('los estilos propios de kywai traen su guía y usan el motor de un estilo de la biblioteca', () => {
    const own = FILM_STYLES.filter((s) => s.base)
    expect(own).toHaveLength(6)
    for (const s of own) {
      const guide = KYWAI_FILM_GUIDES[s.slug]
      for (const h of ['## 1.', '## 2.', '## 3.', '## 6.', '## 7.', '## 8.', '## 10.', '## 11.']) expect(guide).toContain(h)
      expect(guide).toContain(`setup.sh demo ${s.base}`)
      expect(filmStyle(s.base!)).toBeDefined()
    }
    const p = filmPrompt({ ...base, style: filmStyle('kywai-ink-doodle')! })
    expect(p).toContain(join(base.work, KYWAI_GUIDE_FILE))
    expect(p).toContain('demo whiteboard')
    expect(p).not.toContain(join('styles', 'kywai-ink-doodle'))
  })

  it('los estilos 3D llevan la lista de escena viva; todos, el gancho', () => {
    expect(filmPrompt({ ...base, style: filmStyle('lowpoly-island')! })).toContain('Escena 3D viva')
    expect(filmPrompt({ ...base, style: filmStyle('kywai-crystal-3d')! })).toContain('Bucles que nunca paran')
    expect(filmPrompt({ ...base, style: filmStyle('watercolor')! })).not.toContain('Escena 3D viva')
    expect(filmPrompt({ ...base, style: filmStyle('watercolor')! })).toContain('Gancho en los 2 primeros segundos')
  })

  it('encuentra el vídeo final y el título', () => {
    const dir = mkdtempSync(join(tmpdir(), 'film-'))
    expect(findFilm(dir)).toBeNull()
    mkdirSync(join(dir, 'out'))
    mkdirSync(join(dir, 'node_modules'))
    writeFileSync(join(dir, 'node_modules', 'x.mp4'), Buffer.alloc(20_000))
    writeFileSync(join(dir, 'out', 'prueba.mp4'), Buffer.alloc(20_000))
    writeFileSync(join(dir, 'out', 'final.mp4'), Buffer.alloc(40_000))
    const old = new Date(Date.now() - 60_000)
    utimesSync(join(dir, 'out', 'prueba.mp4'), old, old)
    expect(findFilm(dir)).toBe(join(dir, 'out', 'final.mp4'))
    writeFileSync(join(dir, 'pelicula.mp4'), Buffer.alloc(1))
    expect(findFilm(dir)).toBe(join(dir, 'pelicula.mp4'))
    expect(filmTitle('Título: «La gota viajera»\nUna gota recorre el mundo.')).toBe('La gota viajera')
    expect(filmTitle('sin título')).toBeNull()
  })
})
