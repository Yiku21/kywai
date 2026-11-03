// Las claves de API de los agentes de catálogo en este equipo (cifradas con el llavero del sistema si se puede).
import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { AgentKeys } from './secrets'

let instance: AgentKeys | null = null

export function keys(): AgentKeys {
  return (instance ??= new AgentKeys(join(app.getPath('userData'), 'agent-keys.json'), {
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
  }))
}

/** La clave guardada de un agente, o null. */
export function agentKey(agentId: string): string | null {
  try {
    return keys().get(agentId)
  } catch {
    return null
  }
}
