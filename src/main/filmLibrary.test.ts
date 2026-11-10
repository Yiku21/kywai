import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { filmStyle, KYWAI_FILM } from '@shared/filmStyles'
import { filmPrompt, filmTitle, findFilm } from './filmLibrary'

describe('películas con estilo', () => {
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
    const p = filmPrompt({ ...base, style: filmStyle(KYWAI_FILM)!, format: 'vertical' })
    expect(p).toContain(join('/estudio', 'animacion-pintada', 'KYWAI.md'))
    expect(p).toContain('kywaiRobot()')
    expect(p).toContain('Clawd) no sale')
    expect(p).toContain('vertical 1080×1920')
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
