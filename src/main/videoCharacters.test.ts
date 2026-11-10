import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { addVideoCharacter, initVideoCharacters, listVideoCharacters, removeVideoCharacter, saveCharacterLook, videoCharacter } from './videoCharacters'

// Un PNG de 1×1.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

describe('personajes de los vídeos', () => {
  let ws: string
  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'personajes-'))
    const robot = join(ws, 'hermes-Ab12Cd34.png')
    writeFileSync(robot, PNG)
    initVideoCharacters(ws, [robot])
  })

  it('los robots van primero, de fábrica, y sus imágenes se copian fuera de la app', () => {
    const list = listVideoCharacters()
    expect(list[0]).toMatchObject({ id: 'robots-kywai', builtin: true, images: 1 })
    const r = videoCharacter('robots-kywai')!
    expect(r.images).toEqual([join(ws, 'personajes', 'robots-kywai', 'hermes.png')])
    expect(r.look).toContain('Hermes')
    expect(() => removeVideoCharacter('robots-kywai')).toThrow()
  })

  it('crea un personaje con descripción, imágenes o ambas, y se puede borrar', () => {
    const { id, characters } = addVideoCharacter({ name: 'Doña Rosa', description: 'Abuela panadera', images: [{ name: 'rosa.png', data: PNG.toString('base64') }] })
    expect(id).toMatch(/^dona-rosa-[0-9a-f]{4}$/)
    expect(characters.map((c) => c.name)).toEqual(['Robots de kywai', 'Doña Rosa'])
    const c = videoCharacter(id)!
    expect(c).toMatchObject({ name: 'Doña Rosa', about: 'Abuela panadera' })
    expect(c.images).toHaveLength(1)
    expect(readFileSync(c.images[0]).equals(PNG)).toBe(true)
    // Solo descripción también vale.
    expect(addVideoCharacter({ name: 'Pipo', description: 'Un perro salchicha con gafas' }).id).toMatch(/^pipo-/)
    removeVideoCharacter(id)
    expect(videoCharacter(id)).toBeNull()
  })

  it('pide nombre y algo más, y rechaza lo que no es una imagen', () => {
    expect(() => addVideoCharacter({ name: '' })).toThrow('nombre')
    expect(() => addVideoCharacter({ name: 'Nadie' })).toThrow('Describe')
    expect(() => addVideoCharacter({ name: 'Malo', images: [{ name: 'x.png', data: Buffer.from('hola').toString('base64') }] })).toThrow('no es una imagen')
  })

  it('el aspecto que escribe el guion se guarda una sola vez', () => {
    const { id } = addVideoCharacter({ name: 'Pipo', description: 'Un perro' })
    expect(saveCharacterLook(id, 'Pipo: dachshund with round glasses')).toBe(true)
    expect(saveCharacterLook(id, 'otra cosa')).toBe(false)
    expect(videoCharacter(id)!.look).toBe('Pipo: dachshund with round glasses')
    expect(saveCharacterLook('robots-kywai', 'x')).toBe(false)
  })
})
