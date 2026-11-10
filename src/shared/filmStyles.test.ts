import { describe, expect, it } from 'vitest'
import { FILM_CATEGORIES, FILM_STYLES, findFilmStyle, isVideoCommand, KYWAI_FILM, takeFilmStyle, videoStyleOf, withVideoStyle } from './filmStyles'

describe('catálogo de estilos de película', () => {
  it('tiene los 66 de la biblioteca, el de los robots y los 6 propios de kywai, sin repetir', () => {
    expect(FILM_STYLES).toHaveLength(73)
    expect(new Set(FILM_STYLES.map((s) => s.slug)).size).toBe(73)
    expect(FILM_STYLES[0].slug).toBe(KYWAI_FILM)
    for (const s of FILM_STYLES) {
      expect(FILM_CATEGORIES.some((c) => c.id === s.category)).toBe(true)
      expect(s.line && s.lineEn && s.en && s.name).toBeTruthy()
    }
  })

  it('encuentra un estilo por su carpeta, su nombre o un nombre corto', () => {
    expect(findFilmStyle('pixel-rpg')?.slug).toBe('pixel-rpg')
    expect(findFilmStyle('Acuarela')?.slug).toBe('watercolor')
    expect(findFilmStyle('ukiyo-e')?.slug).toBe('ukiyoe')
    expect(findFilmStyle('años 30')?.slug).toBe('rubber-hose')
    expect(findFilmStyle('Watercolor Brush')?.slug).toBe('watercolor')
    expect(findFilmStyle('cartoon')).toBeUndefined()
    expect(findFilmStyle('neón')?.slug).toBe('kywai-neon-silhouette')
    expect(takeFilmStyle('estilo garabatos de tinta cómo ahorrar')).toMatchObject({ style: { slug: 'kywai-ink-doodle' }, rest: 'cómo ahorrar' })
  })

  it('separa el estilo del tema', () => {
    expect(takeFilmStyle('estilo acuarela sobre el ciclo del agua')).toMatchObject({ style: { slug: 'watercolor' }, rest: 'sobre el ciclo del agua' })
    expect(takeFilmStyle('estilo pixel rpg de 16 bits: cómo se hace un pan')).toMatchObject({ style: { slug: 'pixel-rpg' } })
    expect(takeFilmStyle('estilo:rubber-hose la historia del café')).toMatchObject({ style: { slug: 'rubber-hose' }, rest: 'la historia del café' })
    expect(takeFilmStyle('cómo funciona un motor, estilo plano técnico')).toMatchObject({ style: { slug: 'blueprint' }, rest: 'cómo funciona un motor' })
    expect(takeFilmStyle('un estilo de vida sano')).toBeNull()
    expect(takeFilmStyle('estilo cartoon de la fotosíntesis')).toBeNull()
  })
})

describe('selector de estilos del cuadro de texto', () => {
  it('reconoce la orden y el estilo marcado', () => {
    expect(isVideoCommand('/video la luna')).toBe(true)
    expect(isVideoCommand('/vídeo')).toBe(true)
    expect(isVideoCommand('/videos')).toBe(false)
    expect(videoStyleOf('/video estilo:watercolor la luna')).toBe('watercolor')
    expect(videoStyleOf('/video estilo:cartoon la luna')).toBe('cartoon')
    expect(videoStyleOf('/video la luna')).toBe('dinamico')
    expect(videoStyleOf('/video estilo:nada la luna')).toBe('dinamico')
  })

  it('pone, cambia y quita la marca detrás de /video', () => {
    expect(withVideoStyle('/video ', 'pixel-rpg')).toBe('/video estilo:pixel-rpg ')
    expect(withVideoStyle('/video la luna', 'watercolor')).toBe('/video estilo:watercolor la luna')
    expect(withVideoStyle('/video estilo:watercolor la luna', 'ukiyoe')).toBe('/video estilo:ukiyoe la luna')
    expect(withVideoStyle('/video estilo:watercolor la luna', 'dinamico')).toBe('/video la luna')
    expect(withVideoStyle('/video la luna estilo:watercolor', 'cartoon')).toBe('/video estilo:cartoon la luna')
  })
})
