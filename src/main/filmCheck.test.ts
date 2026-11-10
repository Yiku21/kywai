import { describe, expect, it } from 'vitest'
import { contactSheetArgs, filmCheckArgs, filmFixRequest, filmReviewPrompt, flatFramesArgs, flatLookIssue, flatShare, parseFilmCheck, parsePpm } from './filmCheck'

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

  it('la revisión pide que una película 3D se vea 3D de verdad', () => {
    const base = { styleName: 'x', topic: 'y', work: '/w', sheet: 's', seconds: 10, beats: '', author: 'A', reply: '', vertical: true }
    expect(filmReviewPrompt({ ...base, is3d: true })).toContain('3D de verdad')
    expect(filmReviewPrompt({ ...base, is3d: false })).toContain('marcador de posición')
  })
})

/** Imagen de prueba w×h con el color que dé `color(x, y)`, como píxeles RGB. */
function image(w: number, h: number, color: (x: number, y: number) => [number, number, number]): Uint8Array {
  const px = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) px.set(color(x, y), (y * w + x) * 3)
  return px
}

describe('¿parece un dibujo plano?', () => {
  // Cielo, casa roja, ventana y suelo verde de colores lisos: lo que sale cuando no se hace 3D de verdad.
  const drawing = image(96, 170, (x, y) => (y < 90 ? (x > 30 && x < 66 && y > 50 ? (x > 40 && x < 50 && y > 60 && y < 70 ? [255, 255, 255] : [220, 20, 20]) : [135, 206, 235]) : [40, 170, 40]))
  // Luz que cambia por toda la imagen y grano: lo que deja un render con luz, sombras y materiales.
  const render = image(96, 170, (x, y) => [Math.min(255, 60 + x * 1.5 + ((x * 7 + y * 13) % 11)), Math.min(255, 40 + y + ((x * 5 + y * 3) % 9)), 90 + ((x + y) % 60)])

  it('un dibujo de colores lisos se ve plano y un render no', () => {
    expect(flatShare(drawing)).toBeGreaterThan(0.95)
    expect(flatShare(render)).toBeLessThan(0.3)
  })

  it('un fotograma casi negro no cuenta', () => {
    expect(flatShare(image(10, 10, () => [5, 5, 5]))).toBeNull()
    expect(flatShare(new Uint8Array(0))).toBeNull()
  })

  it('avisa si la mitad o más de los fotogramas son planos', () => {
    expect(flatLookIssue([0.9, 0.85, 0.3, 0.8, null, 0.2])).toContain('Parece un dibujo plano')
    expect(flatLookIssue([0.9, 0.85, 0.3, 0.8, null, 0.2])).toContain('en 3 de 5 fotogramas')
    expect(flatLookIssue([0.9, 0.3, 0.2, 0.4])).toBeNull()
    expect(flatLookIssue([0.9, 0.9, null, null, null, null])).toBeNull()
  })

  it('lee un PPM y saca 6 fotogramas pequeños', () => {
    const header = new TextEncoder().encode('P6\n# kywai\n2 1\n255\n')
    const ppm = new Uint8Array([...header, 1, 2, 3, 4, 5, 6])
    expect(parsePpm(ppm)).toEqual({ w: 2, h: 1, px: new Uint8Array([1, 2, 3, 4, 5, 6]) })
    expect(parsePpm(new TextEncoder().encode('P3\n2 1\n255\n'))).toBeNull()
    const args = flatFramesArgs('a.mp4', '/t/f%02d.ppm', 30).join(' ')
    expect(args).toContain('fps=0.2000,scale=96:-2')
    expect(args).toContain('-frames:v 6')
  })
})
