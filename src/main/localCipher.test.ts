import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileKeyCipher, migratingCipher } from './localCipher'
import { AgentKeys, type KeyCipher } from './secrets'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cowork-cipher-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

// Imita el llavero: cuenta cuántas veces se le pide algo (cada vez sería un aviso de macOS).
function fakeKeychain(): KeyCipher & { reads: number } {
  const k = {
    reads: 0,
    available: () => true,
    encrypt: (p: string) => Buffer.from(`kc:${p}`).toString('base64'),
    decrypt: (s: string) => {
      k.reads++
      const t = Buffer.from(s, 'base64').toString('utf8')
      return t.startsWith('kc:') ? t.slice(3) : null
    }
  }
  return k
}

describe('cifrado con clave propia', () => {
  it('cifra y descifra, y la clave solo la lee el usuario', () => {
    const keyFile = join(dir, 'datos', 'clave-local.key')
    const c = fileKeyCipher(keyFile)
    const sealed = c.encrypt('sk-secreta-123456')
    expect(sealed).not.toContain('sk-secreta')
    expect(c.decrypt(sealed)).toBe('sk-secreta-123456')
    // Otro arranque, misma clave.
    expect(fileKeyCipher(keyFile).decrypt(sealed)).toBe('sk-secreta-123456')
    if (process.platform !== 'win32') expect(statSync(keyFile).mode & 0o777).toBe(0o600)
  })

  it('no acepta lo manipulado ni lo cifrado con otra clave', () => {
    const c = fileKeyCipher(join(dir, 'a.key'))
    const sealed = c.encrypt('hola mundo')
    const raw = Buffer.from(sealed.slice('local1:'.length), 'base64')
    raw[raw.length - 1] ^= 1
    expect(c.decrypt(`local1:${raw.toString('base64')}`)).toBeNull()
    expect(fileKeyCipher(join(dir, 'b.key')).decrypt(sealed)).toBeNull()
    expect(c.decrypt('basura')).toBeNull()
  })

  it('sustituye una clave dañada', () => {
    const keyFile = join(dir, 'clave.key')
    writeFileSync(keyFile, 'corta')
    const c = fileKeyCipher(keyFile)
    expect(c.decrypt(c.encrypt('x'))).toBe('x')
    expect(readFileSync(keyFile).length).toBe(32)
  })
})

describe('paso del llavero a la clave propia', () => {
  it('lee una vez del llavero, vuelve a cifrar y ya no lo usa', () => {
    const keychain = fakeKeychain()
    const file = join(dir, 'agent-keys.json')
    // Guardada con una versión anterior (llavero).
    new AgentKeys(file, keychain).set('deepseek', 'sk-0123456789abcdef')

    const cipher = migratingCipher(fileKeyCipher(join(dir, 'clave-local.key')), keychain)
    expect(new AgentKeys(file, cipher).get('deepseek')).toBe('sk-0123456789abcdef')
    expect(keychain.reads).toBe(1)
    expect(readFileSync(file, 'utf8')).toContain('local1:')

    // Siguientes arranques: ni un aviso más.
    expect(new AgentKeys(file, cipher).get('deepseek')).toBe('sk-0123456789abcdef')
    expect(keychain.reads).toBe(1)
  })

  it('si el llavero no la da, no se toca lo guardado', () => {
    const keychain = fakeKeychain()
    const file = join(dir, 'agent-keys.json')
    writeFileSync(file, JSON.stringify({ x: { value: 'no-es-del-llavero', encrypted: true } }))
    const cipher = migratingCipher(fileKeyCipher(join(dir, 'clave-local.key')), keychain)
    expect(new AgentKeys(file, cipher).get('x')).toBeNull()
    expect(readFileSync(file, 'utf8')).toContain('no-es-del-llavero')
  })
})
