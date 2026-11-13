import { describe, expect, it } from 'vitest'
import { IMAGE_LOOKS, imageLook } from './imageLooks'
import { filmStyle } from './filmStyles'
import { stripVideoTags, videoChoiceOf, withVideoChoice } from './videoChoice'

describe('aspectos de las imágenes con IA', () => {
  it('cada aspecto tiene id propio, sus textos y un bloque de estilo sin marcas ni estudios', () => {
    expect(new Set(IMAGE_LOOKS.map((l) => l.id)).size).toBe(IMAGE_LOOKS.length)
    for (const l of IMAGE_LOOKS) {
      expect(l.id).toMatch(/^[a-z0-9-]+$/)
      // Que no se confunda con un estilo de película de la biblioteca.
      expect(filmStyle(l.id)).toBeUndefined()
      expect(l.name && l.en && l.line && l.lineEn).toBeTruthy()
      expect(l.prompt.split(' ').length).toBeGreaterThan(20)
      expect(l.prompt).not.toMatch(/pixar|disney|dreamworks|zack|lego/i)
    }
    expect(imageLook('plastilina')?.en).toBe('Claymation')
    expect(imageLook('nada')).toBeUndefined()
  })

  it('se marca con «aspecto:» y no cuenta con un estilo de película', () => {
    expect(videoChoiceOf('/video aspecto:ganchillo la luna').look).toBe('ganchillo')
    expect(videoChoiceOf('/video aspecto:nada la luna').look).toBeUndefined()
    expect(videoChoiceOf('/video estilo:watercolor aspecto:ganchillo la luna').look).toBeUndefined()
    expect(withVideoChoice('/video la luna', { kind: 'presentador', character: null, style: null, look: 'comic' })).toBe('/video tipo:presentador aspecto:comic la luna')
    expect(withVideoChoice('/video aspecto:comic la luna', { kind: 'rapido', character: null, style: 'watercolor', look: 'comic' })).toBe('/video estilo:watercolor la luna')
    expect(stripVideoTags('/video aspecto:comic la luna')).toBe('/video la luna')
  })
})
