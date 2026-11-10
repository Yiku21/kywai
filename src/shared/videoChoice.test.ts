import { describe, expect, it } from 'vitest'
import { ROBOTS_CHARACTER, stripVideoTags, videoChoiceOf, withVideoChoice } from './videoChoice'

describe('lo elegido al escribir /video', () => {
  it('lee el tipo, el personaje y el estilo marcados', () => {
    expect(videoChoiceOf('/video la luna')).toEqual({ kind: 'rapido', character: null, style: null })
    expect(videoChoiceOf('/video tipo:mixto personaje:robots-kywai estilo:watercolor la luna')).toEqual({ kind: 'mixto', character: ROBOTS_CHARACTER, style: 'watercolor' })
    expect(videoChoiceOf('/video tipo:nada estilo:nada la luna')).toEqual({ kind: 'rapido', character: null, style: null })
  })

  it('entiende las marcas de antes', () => {
    expect(videoChoiceOf('/video estilo:cartoon la luna').kind).toBe('presentador')
    expect(videoChoiceOf('/video estilo:dinamico la luna').kind).toBe('rapido')
  })

  it('el estilo pintado a mano lleva los robots salvo que se diga otro personaje', () => {
    expect(videoChoiceOf('/video estilo:kywai-pintado la luna').character).toBe(ROBOTS_CHARACTER)
    expect(videoChoiceOf('/video personaje:ninguno estilo:kywai-pintado la luna').character).toBeNull()
    expect(videoChoiceOf('/video personaje:dona-rosa-3f9a estilo:kywai-pintado la luna').character).toBe('dona-rosa-3f9a')
  })

  it('pone y cambia las marcas detrás de /video sin tocar el tema', () => {
    expect(withVideoChoice('/video ', { kind: 'mixto', character: ROBOTS_CHARACTER, style: 'pixel-rpg' })).toBe('/video tipo:mixto personaje:robots-kywai estilo:pixel-rpg ')
    expect(withVideoChoice('/video tipo:mixto la luna', { kind: 'rapido', character: null, style: null })).toBe('/video la luna')
    expect(withVideoChoice('/video la luna estilo:watercolor', { kind: 'presentador', character: null, style: 'watercolor' })).toBe('/video tipo:presentador estilo:watercolor la luna')
    expect(withVideoChoice('/video la luna', { kind: 'rapido', character: null, style: 'kywai-pintado' })).toBe('/video personaje:ninguno estilo:kywai-pintado la luna')
    expect(withVideoChoice('hola', { kind: 'mixto', character: null, style: null })).toBe('hola')
  })

  it('quita las marcas', () => {
    expect(stripVideoTags('/video tipo:mixto personaje:x estilo:watercolor la luna')).toBe('/video la luna')
  })
})
