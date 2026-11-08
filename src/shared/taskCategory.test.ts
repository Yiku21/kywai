import { describe, expect, it } from 'vitest'
import { taskCategory } from './taskCategory'

describe('taskCategory', () => {
  it('clasifica por el título antes que por la descripción', () => {
    expect(taskCategory('Mapa visual del Homelab (opción A)', 'genera un script que lo dibuje')).toBe('visual')
    expect(taskCategory('Landing de la panadería', 'con un logo')).toBe('web')
    expect(taskCategory('Arreglar el error del login')).toBe('code')
    expect(taskCategory('Redactar el informe mensual')).toBe('text')
    expect(taskCategory('Comparar proveedores de VPS')).toBe('research')
    expect(taskCategory('Ordenar la carpeta')).toBe('other')
  })
})
