import { describe, expect, it } from 'vitest'
import { installOrder, parseSetupToolId } from './setupTool'

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

describe('installOrder', () => {
  it('instala antes Homebrew, Node.js y Python que los programas que los necesitan', () => {
    const ids = installOrder([{ id: 'cli:vibe' }, { id: 'claude' }, { id: 'python' }, { id: 'node' }, { id: 'brew' }] as { id: never }[]).map((t) => t.id)
    expect(ids).toEqual(['brew', 'python', 'node', 'cli:vibe', 'claude'])
  })
})
