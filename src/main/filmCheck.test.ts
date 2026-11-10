import { describe, expect, it } from 'vitest'
import { contactSheetArgs, filmCheckArgs, filmFixRequest, filmReviewPrompt, parseFilmCheck } from './filmCheck'

describe('comprobación de la película', () => {
  it('una película limpia no tiene fallos', () => {
    expect(parseFilmCheck('', 40, true)).toEqual([])
  })

  it('perdona los fundidos a negro del principio y del final y el cierre quieto', () => {
    const log = [
      '[blackdetect @ 0x1] black_start:0 black_end:0.9 black_duration:0.9',
      '[blackdetect @ 0x1] black_start:38.6 black_end:40 black_duration:1.4',
      '[freezedetect @ 0x2] lavfi.freezedetect.freeze_start: 36.5',
      '[silencedetect @ 0x3] silence_start: 39.2'
    ].join('\n')
    expect(parseFilmCheck(log, 40, true)).toEqual([])
  })

  it('ve negro, imagen congelada y silencio a mitad', () => {
    const log = [
      '[blackdetect @ 0x1] black_start:12.04 black_end:14.5 black_duration:2.46',
      '[freezedetect @ 0x2] lavfi.freezedetect.freeze_start: 20',
      '[freezedetect @ 0x2] lavfi.freezedetect.freeze_duration: 6',
      '[freezedetect @ 0x2] lavfi.freezedetect.freeze_end: 26',
      '[silencedetect @ 0x3] silence_start: 5',
      '[silencedetect @ 0x3] silence_end: 10.5 | silence_duration: 5.5'
    ].join('\n')
    const issues = parseFilmCheck(log, 40, true)
    expect(issues).toHaveLength(3)
    expect(issues[0]).toContain('Pantalla negra de 12 s a 14.5 s')
    expect(issues[1]).toContain('Imagen congelada de 20 s a 26 s')
    expect(issues[2]).toContain('Silencio total de 5 s a 10.5 s')
  })

  it('sin sonido o demasiado corta', () => {
    const issues = parseFilmCheck('', 3, false)
    expect(issues.some((x) => x.includes('Dura solo 3 s'))).toBe(true)
    expect(issues.some((x) => x.includes('No tiene pista de sonido'))).toBe(true)
    expect(filmCheckArgs('a.mp4', false)).toContain('-an')
    expect(filmCheckArgs('a.mp4', true).join(' ')).toContain('silencedetect')
  })

  it('la hoja de contacto reparte 12 fotogramas', () => {
    const args = contactSheetArgs('a.mp4', 'hoja.jpg', 60, true).join(' ')
    expect(args).toContain('fps=0.2000')
    expect(args).toContain('tile=4x3')
    expect(args).toContain('scale=270:-2')
  })

  it('la revisión lleva los beats, las reglas y el veredicto', () => {
    const p = filmReviewPrompt({ styleName: 'Acuarela', topic: 'un dragón', work: '/w', sheet: '/w/hoja.jpg', seconds: 36, beats: '0–22 flota', author: 'Claude', reply: 'Título: X', is3d: false, vertical: false })
    expect(p).toContain('0–22 flota')
    expect(p).toContain('uno cada 3 s')
    expect(p).toContain('Pausa en el impacto')
    expect(p).not.toContain('Escena 3D viva')
    expect(p).toContain('VEREDICTO: CUMPLE')
    expect(filmReviewPrompt({ styleName: 'x', topic: 'y', work: '/w', sheet: 's', seconds: 10, beats: '', author: 'A', reply: '', is3d: true, vertical: true })).toContain('No dejó beats.md')
  })

  it('la corrección dice qué arreglar y dónde', () => {
    const f = filmFixRequest('kywai', '- Pantalla negra de 12 s a 14 s.', '/w', 1)
    expect(f).toContain('corrección 1 de 2')
    expect(f).toContain('Pantalla negra')
    expect(f).toContain('pelicula.mp4')
  })
})
