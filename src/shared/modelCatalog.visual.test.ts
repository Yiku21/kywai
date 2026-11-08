import { describe, expect, it } from 'vitest'
import { effortFor, isVisualTask } from './modelCatalog'

describe('piezas visuales con esfuerzo medio', () => {
  it('reconoce imágenes, mapas visuales y pósteres por el título', () => {
    expect(isVisualTask('Mapa visual del Homelab (opción A)', 'Genera el mapa con un script y expórtalo a PNG')).toBe(true)
    expect(isVisualTask('Póster del concierto')).toBe(true)
    expect(isVisualTask('Logo de la panadería')).toBe(true)
  })
  it('una web, una app o código no es una pieza visual aunque lleve imágenes', () => {
    expect(isVisualTask('Landing de la panadería', 'con un logo y una imagen de portada')).toBe(false)
    expect(isVisualTask('Arreglar el login de la app')).toBe(false)
    expect(isVisualTask('Script de copias de seguridad')).toBe(false)
  })
  it('Claude y Codex van con «medium» en lo visual y como siempre en lo demás', () => {
    expect(effortFor('claude', 'medium', { visual: true })).toBe('medium')
    expect(effortFor('codex', 'hard', { visual: true })).toBe('medium')
    expect(effortFor('claude', 'medium')).toBe('high')
    expect(effortFor('codex', 'hard')).toBe('xhigh')
  })
})
