import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { geminiImageProblem, imagePromptText, isVideoFile, lookTrialPrompt, projectCast, saveCastImages, saveCastNotes } from './videoStudio'

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

  it('un aspecto elegido manda también en los dibujos con presentador', () => {
    expect(imagePromptText('a door', true, 'claymation', true)).toContain('Visual style: claymation')
    expect(imagePromptText('a door', true, 'claymation', false)).not.toContain('claymation')
  })

  it('la escena de prueba lleva el tema y el personaje elegido', () => {
    expect(lookTrialPrompt('  mi primer  cliente ')).toContain('about: "mi primer cliente"')
    expect(lookTrialPrompt('x', { name: 'Ana' })).toContain('Ana is the main character')
    expect(lookTrialPrompt('x', { name: 'Hermes, Claude y Codex', builtin: true })).toContain('are the main character')
    expect(lookTrialPrompt('')).not.toContain('about')
  })

  it('explica por qué Gemini no hace la imagen', () => {
    expect(geminiImageProblem(429, 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0')).toContain('facturación')
    expect(geminiImageProblem(429, 'Resource exhausted')).toContain('límite')
    expect(geminiImageProblem(400, 'API key not valid. Please pass a valid API key.')).toContain('no acepta la clave')
    expect(geminiImageProblem(500, 'boom')).toContain('500')
  })

  it('reconoce los vídeos adjuntos', () => {
    expect(isVideoFile('reel.MP4')).toBe(true)
    expect(isVideoFile('foto.png')).toBe(false)
  })
})
