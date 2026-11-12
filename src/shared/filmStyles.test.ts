import { describe, expect, it } from 'vitest'
import { FILM_CATEGORIES, FILM_STYLES, findFilmStyle, isVideoCommand, KYWAI_FILM, takeFilmStyle } from './filmStyles'

describe('catálogo de estilos de película', () => {
  it('tiene los 66 de la biblioteca, el de los robots y los 6 propios de kywai, sin repetir', () => {
    expect(FILM_STYLES).toHaveLength(77)
    expect(new Set(FILM_STYLES.map((s) => s.slug)).size).toBe(77)
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
    expect(takeFilmStyle('estilo papel recortado los 5 mejores conectores')).toMatchObject({ style: { slug: 'kywai-paper-diorama' }, rest: 'los 5 mejores conectores' })
    expect(takeFilmStyle('estilo papel recortado rojo el año nuevo')).toMatchObject({ style: { slug: 'papercut-red' }, rest: 'el año nuevo' })
    expect(findFilmStyle('cartulina')?.slug).toBe('kywai-paper-diorama')
    expect(takeFilmStyle('estilo lista de comprobación 5 cosas antes de publicar')).toMatchObject({ style: { slug: 'kywai-checklist' }, rest: '5 cosas antes de publicar' })
    expect(findFilmStyle('checklist')?.slug).toBe('kywai-checklist')
    expect(takeFilmStyle('estilo robots de bloques deja de montar un agente por tarea')).toMatchObject({ style: { slug: 'kywai-voxel-bots' }, rest: 'deja de montar un agente por tarea' })
    expect(findFilmStyle('voxel')?.slug).toBe('kywai-voxel-bots')
    expect(takeFilmStyle('estilo anuncio de app kywai en 30 segundos')).toMatchObject({ style: { slug: 'kywai-app-promo' }, rest: 'kywai en 30 segundos' })
    expect(findFilmStyle('promo')?.slug).toBe('kywai-app-promo')
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

describe('orden del cuadro de texto', () => {
  it('reconoce «/video»', () => {
    expect(isVideoCommand('/video la luna')).toBe(true)
    expect(isVideoCommand('/vídeo')).toBe(true)
    expect(isVideoCommand('/videos')).toBe(false)
  })
})
