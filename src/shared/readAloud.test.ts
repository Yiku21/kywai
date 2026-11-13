import { describe, expect, it } from 'vitest'
import { finalAnswerOf, READ_ALOUD_MAX, speechChunks, spokenText } from './readAloud'

describe('spokenText', () => {
  it('se salta los bloques de código y deja lo demás', () => {
    const md = 'Listo, cambia esto:\n\n```ts\nconst a = 1\n```\n\nY luego reinicia.'
    expect(spokenText(md)).toBe('Listo, cambia esto:\nY luego reinicia.')
  })

  it('un bloque sin cerrar tampoco se lee', () => {
    expect(spokenText('Mira:\n```js\nlet x = 2')).toBe('Mira:')
  })

  it('lee lo que va entre comillas de código dentro de una frase', () => {
    expect(spokenText('Ejecuta `npm install` y listo.')).toBe('Ejecuta npm install y listo.')
  })

  it('quita los signos de Markdown, enlaces, direcciones y emojis', () => {
    const md = '## Resultado\n\n- **Hecho**: la [guía](https://kywai.app/guia) está lista 🎉\n- Mira https://example.com/x\n> _Nota_ final'
    expect(spokenText(md)).toBe('Resultado.\nHecho: la guía está lista.\nMira.\nNota final.')
  })

  it('no lee tablas ni líneas de separación', () => {
    expect(spokenText('Antes.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\nDespués.')).toBe('Antes.\nDespués.')
  })

  it('no lee la lista «Resumen del trabajo» del final de un plan', () => {
    const md = 'La web ya está publicada y funciona.\n\n**Resumen del trabajo**\n\n✓ Maquetar — Claude\n✗ Probar — Codex: falló'
    expect(spokenText(md)).toBe('La web ya está publicada y funciona.')
  })

  it('una respuesta que es solo código se queda vacía', () => {
    expect(spokenText('```\nls -la\n```')).toBe('')
  })
})

describe('speechChunks', () => {
  it('el primer trozo es corto y ninguno corta una frase a medias', () => {
    const text = Array.from({ length: 12 }, (_, i) => `Esta es la frase número ${i + 1} de la respuesta del agente.`).join(' ')
    const chunks = speechChunks(text)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].length).toBeLessThanOrEqual(160)
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(320)
      expect(c.endsWith('.')).toBe(true)
    }
    expect(chunks.join(' ')).toBe(text)
  })

  it('parte una frase larguísima y no pasa del máximo', () => {
    const chunks = speechChunks(`${'palabra '.repeat(900)}fin.`)
    expect(chunks.every((c) => c.length <= 330)).toBe(true)
    expect(chunks.join(' ').length).toBeLessThanOrEqual(READ_ALOUD_MAX)
  })

  it('sin letras no hay nada que leer', () => {
    expect(speechChunks('')).toEqual([])
    expect(speechChunks('… !!')).toEqual([])
  })
})

describe('finalAnswerOf', () => {
  const agent = { type: 'agent' }
  it('es el último mensaje con texto de un agente en esa petición', () => {
    const messages = [
      { id: 'u', runId: 'r1', author: { type: 'user' }, text: 'hazlo' },
      { id: 'paso', runId: 'r1', author: agent, text: 'Resultado de la tarea' },
      { id: 'final', runId: 'r1', author: agent, text: 'Respuesta con todo delante' },
      { id: 'vacío', runId: 'r1', author: agent, text: ' ' },
      { id: 'otra', runId: 'r2', author: agent, text: 'De otra petición' }
    ]
    expect(finalAnswerOf(messages, 'r1')?.id).toBe('final')
  })

  it('no hay respuesta si aún se está escribiendo o no es de esa petición', () => {
    expect(finalAnswerOf([{ id: 'a', runId: 'r1', author: agent, text: 'Escribiendo', streaming: true }], 'r1')).toBeNull()
    expect(finalAnswerOf([{ id: 'a', runId: 'r1', author: agent, text: 'Hola' }], 'r9')).toBeNull()
  })
})
