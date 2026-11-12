// Cifrado con una clave propia de kywai, guardada en su carpeta de datos (solo la lee el usuario del equipo).
// En Mac sustituye al llavero del sistema: macOS ata «Permitir siempre» a la huella exacta de cada compilación cuando
// la app no está firmada con una cuenta de desarrollador de Apple, y kywai se compila de nuevo en cada actualización,
// así que el llavero volvía a pedir la contraseña tras cada una. Lo cifrado antes con el llavero se sigue leyendo
// (con un último aviso) y se vuelve a cifrar con esta clave.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { KeyCipher } from './secrets'

const PREFIX = 'local1:'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

/** Lee la clave del archivo, o la crea (aleatoria, solo legible por el usuario) si aún no existe. */
function loadKey(keyFile: string): Buffer {
  try {
    const key = readFileSync(keyFile)
    if (key.length === KEY_BYTES) return key
  } catch {
    /* no existe todavía */
  }
  mkdirSync(dirname(keyFile), { recursive: true })
  const key = randomBytes(KEY_BYTES)
  try {
    // 'wx': si otro proceso la acaba de crear, se usa la suya.
    writeFileSync(keyFile, key, { mode: 0o600, flag: 'wx' })
    return key
  } catch {
    const other = readFileSync(keyFile)
    if (other.length === KEY_BYTES) return other
    // Archivo dañado: se sustituye (lo cifrado con él ya no se podía leer).
    writeFileSync(keyFile, key, { mode: 0o600 })
    return key
  }
}

/** Cifrado AES-256-GCM con la clave de `keyFile`. */
export function fileKeyCipher(keyFile: string): KeyCipher {
  let key: Buffer | null = null
  const getKey = (): Buffer => (key ??= loadKey(keyFile))
  return {
    available: () => {
      try {
        getKey()
        return true
      } catch {
        return false
      }
    },
    encrypt: (plain) => {
      const iv = randomBytes(IV_BYTES)
      const c = createCipheriv('aes-256-gcm', getKey(), iv)
      const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
      return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')
    },
    decrypt: (sealed) => {
      if (!sealed.startsWith(PREFIX)) return null
      try {
        const raw = Buffer.from(sealed.slice(PREFIX.length), 'base64')
        if (raw.length < IV_BYTES + TAG_BYTES) return null
        const d = createDecipheriv('aes-256-gcm', getKey(), raw.subarray(0, IV_BYTES))
        d.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
        return Buffer.concat([d.update(raw.subarray(IV_BYTES + TAG_BYTES)), d.final()]).toString('utf8')
      } catch {
        return null
      }
    }
  }
}

/**
 * Cifra siempre con la clave propia; lo que no lleva su marca se lee con `legacy` (el llavero) y queda marcado como
 * `outdated` para que quien lo guarda lo vuelva a cifrar con la clave propia.
 */
export function migratingCipher(local: KeyCipher, legacy: KeyCipher): KeyCipher {
  return {
    available: local.available,
    encrypt: local.encrypt,
    decrypt: (sealed) => (sealed.startsWith(PREFIX) ? local.decrypt(sealed) : legacy.decrypt(sealed)),
    outdated: (sealed) => !sealed.startsWith(PREFIX)
  }
}
