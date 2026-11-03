// Registro de dispositivos emparejados (móviles y clientes de escritorio). Cada uno tiene su identificador dentro
// de su token, así se puede ver cuándo se usó por última vez, revocar uno sin tocar los demás y dejar de aceptar
// los que llevan mucho sin usarse. Los tokens anteriores (sin identificador) siguen valiendo hasta que se genere un
// código de acceso nuevo.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'

export type DeviceKind = 'mobile' | 'client'

export interface DeviceRecord {
  id: string
  name: string
  kind: DeviceKind
  platform?: string
  createdAt: number
  lastSeenAt: number
  lastIp?: string
  revokedAt?: number
}

/** Un dispositivo que no se usa en este tiempo deja de valer y hay que volver a emparejarlo. */
export const DEVICE_INACTIVE_MS = 90 * 24 * 3600_000
/** Cuánto se espera entre dos escrituras de «visto por última vez» del mismo dispositivo. */
const TOUCH_WRITE_MS = 60_000
const MAX_DEVICES = 200

export class DeviceRegistry {
  private devices = new Map<string, DeviceRecord>()
  private lastWrite = new Map<string, number>()

  /** `file`: dónde se guarda (null: solo en memoria, para pruebas). */
  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
    private readonly inactiveMs: number = DEVICE_INACTIVE_MS
  ) {
    this.load()
  }

  private load(): void {
    if (!this.file) return
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as { devices?: DeviceRecord[] }
      for (const d of data.devices ?? []) {
        if (d && typeof d.id === 'string' && typeof d.name === 'string' && (d.kind === 'mobile' || d.kind === 'client')) this.devices.set(d.id, d)
      }
    } catch {
      /* todavía no hay registro o no se puede leer: empieza vacío */
    }
  }

  private save(): void {
    if (!this.file) return
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify({ devices: [...this.devices.values()] }, null, 2), { encoding: 'utf8', mode: 0o600 })
      renameSync(tmp, this.file)
    } catch (e) {
      console.error('[cowork] dispositivos: no se pudo guardar el registro', e)
    }
  }

  register(input: { name: string; kind: DeviceKind; platform?: string; ip?: string }): DeviceRecord {
    if (this.devices.size >= MAX_DEVICES) {
      // Se hace sitio quitando primero los revocados y, si no, el que lleva más sin usarse.
      const victim = [...this.devices.values()].sort((a, b) => Number(!!b.revokedAt) - Number(!!a.revokedAt) || a.lastSeenAt - b.lastSeenAt)[0]
      if (victim) this.devices.delete(victim.id)
    }
    const at = this.now()
    const record: DeviceRecord = {
      id: randomBytes(9).toString('base64url'),
      name: input.name.trim().slice(0, 120) || (input.kind === 'client' ? 'Cliente' : 'Móvil'),
      kind: input.kind,
      ...(input.platform ? { platform: input.platform.slice(0, 40) } : {}),
      createdAt: at,
      lastSeenAt: at,
      ...(input.ip ? { lastIp: input.ip.slice(0, 64) } : {})
    }
    this.devices.set(record.id, record)
    this.save()
    return { ...record }
  }

  get(id: string): DeviceRecord | undefined {
    const d = this.devices.get(id)
    return d && { ...d }
  }

  /** Vale: existe, no se revocó y se ha usado hace menos del tiempo de inactividad. */
  isActive(id: string): boolean {
    const d = this.devices.get(id)
    return !!d && !d.revokedAt && this.now() - d.lastSeenAt < this.inactiveMs
  }

  /** Anota que se usó (y desde dónde); escribe a disco como mucho una vez por minuto y dispositivo. */
  touch(id: string, ip?: string): void {
    const d = this.devices.get(id)
    if (!d || d.revokedAt) return
    const at = this.now()
    d.lastSeenAt = at
    if (ip) d.lastIp = ip.slice(0, 64)
    if (at - (this.lastWrite.get(id) ?? 0) >= TOUCH_WRITE_MS) {
      this.lastWrite.set(id, at)
      this.save()
    }
  }

  revoke(id: string): boolean {
    const d = this.devices.get(id)
    if (!d) return false
    if (!d.revokedAt) {
      d.revokedAt = this.now()
      this.save()
    }
    return true
  }

  /** Quita un dispositivo de la lista (también los revocados). */
  forget(id: string): boolean {
    const had = this.devices.delete(id)
    if (had) this.save()
    return had
  }

  /** Más recientes primero. */
  list(): DeviceRecord[] {
    return [...this.devices.values()].map((d) => ({ ...d })).sort((a, b) => b.lastSeenAt - a.lastSeenAt)
  }
}
