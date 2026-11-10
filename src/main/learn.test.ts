import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./voice', () => ({ ensureUv: async () => undefined }))
import { isMediaFile, learnPrompt, parseLearnedSkill, parseLearnRequest, saveLearnedSkill } from './learn'

const BODY = 'Paso 1: '.padEnd(260, 'x')

describe('/aprende', () => {
  it('separa el enlace de lo que se quiere sacar', () => {
    expect(parseLearnRequest('/aprende https://youtu.be/abc123 para escribir ofertas')).toEqual({ url: 'https://youtu.be/abc123', note: 'para escribir ofertas' })
    expect(parseLearnRequest('/aprende')).toEqual({ note: '' })
    expect(parseLearnRequest('/aprende solo la parte de luces')).toEqual({ note: 'solo la parte de luces' })
    expect(parseLearnRequest('/aprendetodo')).toBeNull()
    expect(parseLearnRequest('aprende esto')).toBeNull()
    expect(isMediaFile('clase.MP4')).toBe(true)
    expect(isMediaFile('pódcast.m4a')).toBe(true)
    expect(isMediaFile('notas.pdf')).toBe(false)
  })

  it('el encargo lleva la transcripción y pide solo el SKILL.md', () => {
    const p = learnPrompt({ source: 'https://youtu.be/x', title: 'Ofertas', note: 'para ofertas', transcript: 'hola mundo', transcriptFile: '/t.txt', frames: ['/f1.jpg'], existing: ['pdf'] })
    expect(p).toContain('hola mundo')
    expect(p).toContain('/f1.jpg')
    expect(p).toContain('no repitas ninguno: pdf')
    expect(p).toContain('empezando por «---»')
    expect(learnPrompt({ source: 's', note: '', transcript: 'a'.repeat(70_000), transcriptFile: '/t.txt', frames: [], existing: [] })).toContain('la entera está en /t.txt')
  })

  it('lee la habilidad de la respuesta y la guarda sin pisar otra', () => {
    const s = parseLearnedSkill('Aquí está:\n```markdown\n---\nname: Ofertas Irresistibles\ndescription: Cómo escribir ofertas\n---\n' + BODY + '\n```')
    expect(s).toMatchObject({ name: 'ofertas-irresistibles', description: 'Cómo escribir ofertas' })
    expect(() => parseLearnedSkill('nada')).toThrow()
    expect(() => parseLearnedSkill('---\nname: x\ndescription: y\n---\ncorto')).toThrow(/vacía/)
    const dir = mkdtempSync(join(tmpdir(), 'skills-'))
    expect(saveLearnedSkill(dir, s, 'https://youtu.be/x').name).toBe('ofertas-irresistibles')
    const second = saveLearnedSkill(dir, s, 'https://youtu.be/x')
    expect(second.name).toBe('ofertas-irresistibles-2')
    const text = readFileSync(second.file, 'utf8')
    expect(text).toMatch(/^---\nname: ofertas-irresistibles-2\ndescription: Cómo escribir ofertas\n---/)
    expect(text).toContain('Aprendida por kywai de: https://youtu.be/x')
  })
})
