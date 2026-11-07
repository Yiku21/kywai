import { describe, expect, it } from 'vitest'
import { findRanges, highlight, searchTerms } from './searchText'

describe('texto del buscador', () => {
  it('separa palabras y frases entre comillas como el motor', () => {
    expect(searchTerms('Barra  LATERAL')).toEqual(['barra', 'lateral'])
    expect(searchTerms('«modo oscuro» botón')).toEqual(['modo oscuro', 'boton'])
    expect(searchTerms('x')).toEqual([])
  })

  it('marca cada palabra sin tildes ni mayúsculas y junta los tramos que se pisan', () => {
    expect(highlight('La Verificación del plan', 'verificacion plan').filter((p) => p.hit).map((p) => p.text)).toEqual(['Verificación', 'plan'])
    expect(findRanges('abcdef', ['abc', 'cde'])).toEqual([[0, 5]])
    expect(highlight('nada', 'otra')).toEqual([{ text: 'nada', hit: false }])
  })
})
