// Las claves de API de los agentes de catálogo en este equipo (cifradas: en Mac con una clave propia de kywai, en
// Windows y Linux con el cifrado del sistema si se puede).
import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { fileKeyCipher, migratingCipher } from './localCipher'
import { ProjectSecrets } from './projectSecrets'
import { AgentKeys, type KeyCipher } from './secrets'

let instance: AgentKeys | null = null

/** Cifrado con el llavero del sistema (si no hay, se guardan sin cifrar en la carpeta de datos de este equipo). */
const keychainCipher: KeyCipher = {
  available: () => {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  },
  encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
  decrypt: (sealed) => {
    try {
      return safeStorage.decryptString(Buffer.from(sealed, 'base64'))
    } catch {
      return null
    }
  }
}

let macCipher: KeyCipher | null = null

/**
 * En Mac, clave propia en la carpeta de datos en vez del llavero: kywai se compila de nuevo en cada actualización y,
 * sin firma de una cuenta de desarrollador de Apple, macOS volvía a pedir la contraseña del llavero tras cada una
 * aunque se pulsara «Permitir siempre». Lo cifrado antes con el llavero se lee una última vez y se pasa a la clave
 * propia. En Windows y Linux sigue el cifrado del sistema.
 */
function cipher(): KeyCipher {
  if (process.platform !== 'darwin') return keychainCipher
  return (macCipher ??= migratingCipher(fileKeyCipher(join(app.getPath('userData'), 'clave-local.key')), keychainCipher))
}

export const systemCipher: KeyCipher = {
  available: () => cipher().available(),
  encrypt: (plain) => cipher().encrypt(plain),
  decrypt: (sealed) => cipher().decrypt(sealed),
  outdated: (sealed) => cipher().outdated?.(sealed) ?? false
}

export function keys(): AgentKeys {
  return (instance ??= new AgentKeys(join(app.getPath('userData'), 'agent-keys.json'), systemCipher))
}

/** La clave guardada de un agente, o null. */
export function agentKey(agentId: string): string | null {
  try {
    return keys().get(agentId)
  } catch {
    return null
  }
}

let secretsInstance: ProjectSecrets | null = null

/** Los secretos de los proyectos (pestaña «Secretos»), cifrados igual que las claves de los agentes. */
export function projectSecrets(): ProjectSecrets {
  return (secretsInstance ??= new ProjectSecrets(join(app.getPath('userData'), 'secretos-proyectos.json'), systemCipher))
}
