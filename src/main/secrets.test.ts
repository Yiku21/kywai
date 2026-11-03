import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentKeys, type KeyCipher } from './secrets'

let dir: string
const reverse = (s: string): string => [...s].reverse().join('')
const cipher: KeyCipher = { available: () => true, encrypt: (p) => `enc:${reverse(p)}`, decrypt: (s) => (s.startsWith('enc:') ? reverse(s.slice(4)) : null) }
const plain: KeyCipher = { available: () => false, encrypt: (p) => p, decrypt: (s) => s }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cowork-keys-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('claves de los agentes', () => {
  it('se guardan cifradas y se leen de vuelta', () => {
    const file = join(dir, 'keys.json')
    const keys = new AgentKeys(file, cipher)
    expect(keys.has('deepseek')).toBe(false)
    keys.set('deepseek', 'sk-0123456789abcdef')
    expect(keys.has('deepseek')).toBe(true)
    expect(keys.get('deepseek')).toBe('sk-0123456789abcdef')
    // En el archivo no está en claro.
    expect(readFileSync(file, 'utf8')).not.toContain('sk-0123456789abcdef')
    // Otro arranque la sigue leyendo.
    expect(new AgentKeys(file, cipher).get('deepseek')).toBe('sk-0123456789abcdef')
  })

  it('sin llavero se guarda en el archivo del usuario y se puede quitar', () => {
    const keys = new AgentKeys(join(dir, 'keys.json'), plain)
    keys.set('amp', 'sgamp_abcdefgh1234')
    expect(keys.get('amp')).toBe('sgamp_abcdefgh1234')
    keys.clear('amp')
    expect(keys.get('amp')).toBeNull()
  })

  it('rechaza lo que no parece una clave', () => {
    const keys = new AgentKeys(join(dir, 'keys.json'), cipher)
    expect(() => keys.set('x', 'corta')).toThrow()
    expect(() => keys.set('x', 'con espacios y símbolos; rm -rf')).toThrow()
    expect(() => keys.set('x', 'a'.repeat(500))).toThrow()
    expect(keys.has('x')).toBe(false)
  })
})
