import { describe, expect, it } from 'vitest'
import { PERSONAS, PHRASE_BOOKS, personaFor, type PersonaId, type SayEvent } from './personality'

const EVENTS: SayEvent[] = ['task', 'done', 'error', 'wake', 'listen', 'bored', 'sleep', 'tired', 'chatter']

describe('personalidad de los robots', () => {
  it('cada idioma tiene frases para cada carácter y cada momento', () => {
    for (const [lang, book] of Object.entries(PHRASE_BOOKS)) {
      for (const id of Object.keys(PERSONAS) as PersonaId[]) {
        for (const ev of EVENTS) {
          const list = book[id]?.[ev]
          expect(list?.length, `${lang}/${id}/${ev}`).toBeGreaterThan(0)
          for (const line of list) expect(line.trim().length, `${lang}/${id}/${ev}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('cada agente tiene su carácter', () => {
    expect(personaFor({ id: 'hermes', provider: 'hermes' }).id).toBe('boss')
    expect(personaFor({ id: 'claude', provider: 'claude' }).id).toBe('sage')
    expect(personaFor({ id: 'codex', provider: 'codex' }).id).toBe('dev')
    expect(personaFor({ id: 'gemini', provider: 'gemini' }).id).toBe('sunny')
    expect(personaFor({ id: 'qwen', provider: 'ollama' }).id).toBe('lazy')
    expect(personaFor({ id: 'lm', provider: 'lmstudio' }).id).toBe('lazy')
    expect(personaFor({ id: 'muse', provider: 'muse' }).id).toBe('dreamer')
    expect(personaFor({ id: 'sub', provider: 'claude', isSubagent: true }).id).toBe('rookie')
  })

  it('no se duermen todos a la vez', () => {
    const rests = new Set(Object.values(PERSONAS).map((p) => p.restAfter))
    expect(rests.size).toBeGreaterThan(4)
  })
})
