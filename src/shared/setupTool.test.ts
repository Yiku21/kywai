import { describe, expect, it } from 'vitest'
import { parseSetupToolId } from './setupTool'

describe('parseSetupToolId', () => {
  it('acepta los programas de fábrica, Muse incluido', () => {
    for (const id of ['node', 'brew', 'python', 'claude', 'codex', 'gemini', 'hermes', 'muse', 'lmstudio', 'ollama']) {
      expect(parseSetupToolId(id)).toBe(id)
    }
  })
  it('acepta los agentes de catálogo (Aider y compañía)', () => {
    expect(parseSetupToolId('cli:aider')).toBe('cli:aider')
    expect(parseSetupToolId('cli:deepseek-aider')).toBe('cli:deepseek-aider')
  })
  it('rechaza lo demás', () => {
    for (const v of ['', 'rm', 'cli:', 'cli:a b', 'cli:../x', 'cli:a;b', 42, null]) {
      expect(() => parseSetupToolId(v)).toThrow('Programa no válido')
    }
  })
})
