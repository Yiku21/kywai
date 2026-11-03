// Claves de API de los agentes que las exigen (por ejemplo DeepSeek). Se guardan en la carpeta de datos de este equipo,
// cifradas con el llavero del sistema si se puede, y solo se leen aquí: nunca viajan por el acceso web ni a la API
// móvil, y no se escriben en el config.json ni en el registro de la tarea.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface KeyCipher {
  available(): boolean
  encrypt(plain: string): string
  decrypt(sealed: string): string | null
}

interface Stored {
  value: string
  encrypted: boolean
}

export class AgentKeys {
  constructor(
    private readonly file: string,
    private readonly cipher: KeyCipher
  ) {}

  private read(): Record<string, Stored> {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, Stored>
      return data && typeof data === 'object' ? data : {}
    } catch {
      return {}
    }
  }

  private write(data: Record<string, Stored>): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, this.file)
  }

  /** Guarda la clave de un agente (sin espacios ni saltos de línea, de longitud razonable). */
  set(agentId: string, key: string): void {
    const clean = key.trim()
    if (!/^[\w.\-:/+=]{8,400}$/.test(clean)) throw new Error('Esa clave no parece válida')
    const data = this.read()
    const encrypted = this.cipher.available()
    data[agentId] = { value: encrypted ? this.cipher.encrypt(clean) : clean, encrypted }
    this.write(data)
  }

  get(agentId: string): string | null {
    const s = this.read()[agentId]
    if (!s || typeof s.value !== 'string') return null
    return s.encrypted ? this.cipher.decrypt(s.value) : s.value
  }

  has(agentId: string): boolean {
    return !!this.get(agentId)
  }

  clear(agentId: string): void {
    const data = this.read()
    delete data[agentId]
    this.write(data)
  }
}
