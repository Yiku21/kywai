import { describe, expect, it } from 'vitest'
import { emotionInstruction, emotionPause, narrationLines, voiceEmotion } from './voiceEmotion'

describe('emoción de la voz', () => {
  it('entiende la emoción en español, en inglés y con tildes o mayúsculas', () => {
    expect(voiceEmotion('Emocionado')).toBe('emocionado')
    expect(voiceEmotion('excited')).toBe('emocionado')
    expect(voiceEmotion('SAD')).toBe('triste')
    expect(voiceEmotion('susurrando')).toBe('susurro')
    expect(voiceEmotion('Hermes')).toBeNull()
  })

  it('parte la narración por sus marcas y quita las marcas del texto', () => {
    const r = narrationLines('[triste] Tres horas después… seguía en la *primera* escena. [emocionado] ¡Y kywai lo hizo en diez minutos!')
    expect(r.narration).toBe('Tres horas después… seguía en la *primera* escena. ¡Y kywai lo hizo en diez minutos!')
    expect(r.lines.map((l) => l.emotion)).toEqual(['triste', 'emocionado'])
  })

  it('sin marcas, una sola frase con la emoción por defecto; lo de antes de la primera marca también', () => {
    expect(narrationLines('Hola a todos.').lines).toEqual([{ text: 'Hola a todos.', emotion: 'neutral' }])
    expect(narrationLines('Hola. [alegre] ¡Qué bien!', 'calma').lines.map((l) => l.emotion)).toEqual(['calma', 'alegre'])
  })

  it('una marca desconocida no se lee ni rompe la frase', () => {
    const r = narrationLines('[sorprendido] ¿Diez minutos? [rarísimo] Sí.')
    expect(r.narration).toBe('¿Diez minutos? Sí.')
    expect(r.lines.map((l) => l.emotion)).toEqual(['sorprendido', 'sorprendido'])
  })

  it('en un diálogo, la marca dice también quién habla', () => {
    const r = narrationLines('[Hermes, sorprendido] ¿Yo? [Claude | alegre] Tú, sí. [triste] Vaya.', 'neutral', ['Hermes', 'Claude'])
    expect(r.lines).toEqual([
      { text: '¿Yo?', emotion: 'sorprendido', who: 'Hermes' },
      { text: 'Tú, sí.', emotion: 'alegre', who: 'Claude' },
      { text: 'Vaya.', emotion: 'triste', who: 'Claude' }
    ])
  })

  it('cada emoción tiene su instrucción y su pausa', () => {
    expect(emotionInstruction('triste')).toContain('sadly')
    expect(emotionPause('triste')).toBeGreaterThan(emotionPause('emocionado'))
  })
})
