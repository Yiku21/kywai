import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanSecretName, ProjectSecrets, secretsPromptNote } from './projectSecrets'
import { withSecretValues } from './coworkMcp'
import type { KeyCipher } from './secrets'

let dir: string
const reverse = (s: string): string => [...s].reverse().join('')
const cipher: KeyCipher = { available: () => true, encrypt: (p) => `enc:${reverse(p)}`, decrypt: (s) => (s.startsWith('enc:') ? reverse(s.slice(4)) : null) }
const PIT = 'pit-1a2b3c4d-5e6f-7a8b-9c0d-112233445566'

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cowork-secretos-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('secretos del proyecto', () => {
  it('se guardan cifrados y la lista nunca trae el valor', () => {
    const file = join(dir, 's.json')
    const s = new ProjectSecrets(file, cipher)
    const list = s.set('p1', { name: 'ghl pit', value: `  ${PIT}\n`, note: 'Token de GHL, solo lectura' })
    expect(list).toEqual([{ name: 'GHL_PIT', note: 'Token de GHL, solo lectura', updatedAt: expect.any(Number) }])
    expect(JSON.stringify(list)).not.toContain(PIT)
    expect(readFileSync(file, 'utf8')).not.toContain(PIT)
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(s.env('p1')).toEqual({ GHL_PIT: PIT })
    // Cada proyecto tiene los suyos.
    expect(s.env('p2')).toEqual({})
    expect(new ProjectSecrets(file, cipher).env('p1')).toEqual({ GHL_PIT: PIT })
  })

  it('cambiar la nota o el nombre sin volver a pegar el valor lo conserva', () => {
    const s = new ProjectSecrets(join(dir, 's.json'), cipher)
    s.set('p1', { name: 'GHL_PIT', value: PIT })
    s.set('p1', { name: 'GHL_TOKEN', previous: 'GHL_PIT', note: 'nuevo nombre' })
    expect(s.list('p1').map((x) => x.name)).toEqual(['GHL_TOKEN'])
    expect(s.env('p1')).toEqual({ GHL_TOKEN: PIT })
    expect(() => s.set('p1', { name: 'OTRO' })).toThrow(/valor/)
  })

  it('no admite nombres reservados ni valores muy cortos', () => {
    expect(cleanSecretName('mi-clave api')).toBe('MI_CLAVE_API')
    expect(() => cleanSecretName('PATH')).toThrow(/reservado/)
    expect(() => cleanSecretName('CLAUDE_CONFIG_DIR')).toThrow(/reservado/)
    expect(() => cleanSecretName('KYWAI_X')).toThrow(/reservado/)
    expect(() => cleanSecretName('1ABC')).toThrow()
    expect(() => cleanSecretName('ÑANDÚ')).toThrow()
    const s = new ProjectSecrets(join(dir, 's.json'), cipher)
    expect(() => s.set('p1', { name: 'X', value: 'abc' })).toThrow(/corto/)
  })

  it('tapa el valor en cualquier texto, también escapado en JSON o en una URL', () => {
    const s = new ProjectSecrets(join(dir, 's.json'), cipher)
    s.set('p1', { name: 'GHL_PIT', value: PIT })
    s.set('p2', { name: 'CLAVE_RARA', value: 'a"b/c d+e' })
    expect(s.redact(`curl -H "Authorization: Bearer ${PIT}"`)).toBe('curl -H "Authorization: Bearer [secreto GHL_PIT]"')
    expect(s.redact(JSON.stringify({ v: 'a"b/c d+e' }))).toBe('{"v":"[secreto CLAVE_RARA]"}')
    expect(s.redact(`https://x.test/?k=${encodeURIComponent('a"b/c d+e')}`)).toBe('https://x.test/?k=[secreto CLAVE_RARA]')
    expect(s.redact('nada que tapar')).toBe('nada que tapar')
    // Al quitarlo deja de taparse; al eliminar el proyecto se van todos.
    s.remove('p2', 'CLAVE_RARA')
    expect(s.redact('a"b/c d+e')).toBe('a"b/c d+e')
    s.forgetProject('p1')
    expect(s.list('p1')).toEqual([])
    expect(s.redact(PIT)).toBe(PIT)
  })

  it('el encargo solo lleva los nombres y el navegador escribe el valor con {{secreto:NOMBRE}}', () => {
    const note = secretsPromptNote(['GHL_PIT', 'GHL_LOCATION_ID'])
    expect(note).toContain('$GHL_PIT')
    expect(note).not.toContain(PIT)
    expect(secretsPromptNote([])).toBe('')
    const env = { GHL_PIT: PIT }
    expect(withSecretValues('Bearer {{secreto:GHL_PIT}}', 'p1', env)).toBe(`Bearer ${PIT}`)
    expect(withSecretValues('{{ secreto: ghl_pit }}', 'p1', env)).toBe(PIT)
    expect(() => withSecretValues('{{secreto:OTRO}}', 'p1', env)).toThrow(/pestaña «Secretos»/)
  })
})
