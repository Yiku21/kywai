import { describe, expect, it } from 'vitest'
import { lookalikes, titleOverlap } from './duplicateTasks'

describe('tareas casi repetidas', () => {
  it('ve que dos guías sobre la misma carpeta compartida son lo mismo', () => {
    expect(titleOverlap('Guía de la carpeta del equipo en el NAS', 'Guía: carpeta compartida del equipo para el Mac mini')).toBeGreaterThanOrEqual(0.7)
    expect(lookalikes(['Guía de la carpeta del equipo en el NAS'], ['Arreglar el login', 'Guía: carpeta compartida del equipo para el Mac mini'])).toEqual([
      { fresh: 'Guía de la carpeta del equipo en el NAS', existing: 'Guía: carpeta compartida del equipo para el Mac mini' }
    ])
  })

  it('no confunde tareas distintas del mismo proyecto', () => {
    expect(lookalikes(['Motor del juego y física'], ['Interfaz del juego y menús'])).toEqual([])
    expect(lookalikes(['Escribir el README'], ['Arreglar el login'])).toEqual([])
  })

  it('con títulos muy cortos no avisa', () => {
    expect(titleOverlap('Arreglar login', 'Arreglar login')).toBe(0)
  })
})
