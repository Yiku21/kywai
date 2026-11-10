import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { imagePromptText, isVideoFile, projectCast, saveCastImages, saveCastNotes } from './videoStudio'

describe('personajes fijos y referencias', () => {
  it('guarda las imágenes una vez y la descripción solo la primera vez', () => {
    const root = mkdtempSync(join(tmpdir(), 'cast-'))
    expect(projectCast(root)).toBeNull()
    const src = mkdtempSync(join(tmpdir(), 'src-'))
    writeFileSync(join(src, 'ana.png'), 'png')
    writeFileSync(join(src, 'notas.txt'), 'x')
    expect(saveCastImages(root, [join(src, 'ana.png'), join(src, 'notas.txt')])).toBe(1)
    expect(saveCastImages(root, [join(src, 'ana.png')])).toBe(0)
    expect(projectCast(root)).toEqual({ images: [join(root, 'personajes', 'ana.png')] })
    expect(saveCastNotes(root, 'Ana: red jacket, short black hair')).toBe(true)
    expect(saveCastNotes(root, 'otra')).toBe(false)
    expect(projectCast(root)?.notes).toBe('Ana: red jacket, short black hair')
    expect(readFileSync(join(root, 'personajes', 'personajes.md'), 'utf8')).toContain('# Personajes fijos')
  })

  it('la descripción de los personajes va en cada imagen; con ellos, el estilo con presentador sí tiene caras', () => {
    const p = imagePromptText('Ana opens the door', true, 'flat ink', false, 'Ana: red jacket')
    expect(p).toContain('Recurring characters')
    expect(p).toContain('Visual style: flat ink')
    expect(p).not.toContain('no faces')
    expect(imagePromptText('a door', true)).toContain('no faces')
  })

  it('reconoce los vídeos adjuntos', () => {
    expect(isVideoFile('reel.MP4')).toBe(true)
    expect(isVideoFile('foto.png')).toBe(false)
  })
})
