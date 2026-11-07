import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { dirname } from 'node:path'
import type { DeviceKind, DeviceRegistry } from './devices'
import { MobileError } from './mobileErrors'

/**
 * Un móvil emparejado no caduca: solo se desempareja al generar un código de acceso nuevo. La fecha de caducidad
 * (100 años) se mantiene en la respuesta porque el contrato la pide y las versiones anteriores de la app la leen.
 */
export const MOBILE_TOKEN_TTL_MS = 100 * 365 * 24 * 3600_000

export function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Un código corto para emparejar vale 10 minutos y un solo uso. */
export const PAIRING_PIN_TTL_MS = 10 * 60_000

/**
 * Clave con la que se firman los tokens del móvil, guardada en `file` (se crea la primera vez). Así los móviles
 * emparejados siguen valiendo al reiniciar o actualizar kywai; antes cada arranque los invalidaba y la app del
 * móvil volvía a pedir el código.
 */
export function mobileSigningKey(file: string): Buffer {
  try {
    const saved = readFileSync(file, 'utf8').trim()
    if (/^[0-9a-f]{64}$/.test(saved)) return Buffer.from(saved, 'hex')
  } catch {
    /* no existe todavía */
  }
  const key = randomBytes(32)
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, key.toString('hex'), { encoding: 'utf8', mode: 0o600 })
  } catch (e) {
    console.error('[cowork] móvil: no se pudo guardar la clave de los tokens', e)
  }
  return key
}

/**
 * Credenciales de transporte sin una segunda base de usuarios o sesiones. No caducan (tampoco las de 30 días que
 * se dieron antes): se revocan al generar un código de acceso nuevo (forma parte de la firma) o al cambiar la clave;
 * sin `secret`, solo valen mientras dure este proceso.
 */
export class MobileAuth {
  /** Código de 6 cifras para emparejar sin teclear el código de acceso entero (lo genera el Mac a petición). */
  private pin: { value: string; expires: number } | null = null

  constructor(
    private readonly code: string,
    private readonly now: () => number = Date.now,
    private readonly secret: Buffer = randomBytes(32),
    /** Registro de dispositivos: cada emparejamiento queda anotado y se puede revocar por separado. */
    private readonly devices?: DeviceRegistry
  ) {}

  /** Nuevo código de emparejamiento (sustituye al anterior). */
  newPin(): { pin: string; expiresAt: number } {
    const value = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const expires = this.now() + PAIRING_PIN_TTL_MS
    this.pin = { value, expires }
    return { pin: value, expiresAt: expires }
  }

  /** El código de 6 cifras vigente (se gasta al usarlo). */
  private usePin(code: string): boolean {
    const typed = code.replace(/[\s-]+/g, '')
    if (!this.pin || this.pin.expires <= this.now() || !/^\d{6}$/.test(typed) || !equalSecret(typed, this.pin.value)) return false
    this.pin = null
    return true
  }

  pair(code: string, deviceName: string, info: { kind?: DeviceKind; platform?: string; ip?: string } = {}): { accessToken: string; expiresAt: string; deviceId?: string } {
    const valid = (!!this.code && equalSecret(code, this.code)) || this.usePin(code)
    if (!valid) throw new MobileError(401, 'INVALID_PAIRING_CODE', 'Código de acceso incorrecto')
    const expires = this.now() + MOBILE_TOKEN_TTL_MS
    const device = this.devices?.register({ name: deviceName, kind: info.kind ?? 'mobile', platform: info.platform, ip: info.ip })
    const claims = Buffer.from(JSON.stringify({ exp: expires, deviceName, ...(device ? { did: device.id } : {}), nonce: randomBytes(16).toString('base64url') })).toString('base64url')
    return { accessToken: `${claims}.${this.sign(claims)}`, expiresAt: new Date(expires).toISOString(), ...(device ? { deviceId: device.id } : {}) }
  }

  /** Quién llama: su identificador de dispositivo (los tokens anteriores al registro no lo tienen). */
  authenticate(req: Pick<IncomingMessage, 'headers'> & { socket?: { remoteAddress?: string } }): { expires: number; deviceId?: string } {
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(req.headers.authorization ?? '')
    if (!match || match[1].length > 2048) throw new MobileError(401, 'UNAUTHORIZED', 'Se necesita un token móvil Bearer válido')
    return this.verify(match[1], req.socket?.remoteAddress)
  }

  /** Comprueba un token (el que va en Authorization o en la cookie de un cliente de escritorio). */
  verify(token: string, ip?: string): { expires: number; deviceId?: string } {
    if (token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new MobileError(401, 'UNAUTHORIZED', 'Token móvil no válido')
    const [claims, signature] = token.split('.')
    if (!equalSecret(signature, this.sign(claims))) throw new MobileError(401, 'UNAUTHORIZED', 'Token móvil no válido')
    let exp: unknown
    let did: unknown
    try {
      const parsed = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')) as { exp?: unknown; did?: unknown }
      exp = parsed.exp
      did = parsed.did
    } catch {
      throw new MobileError(401, 'UNAUTHORIZED', 'Token móvil no válido')
    }
    if (typeof exp !== 'number' || !Number.isSafeInteger(exp)) throw new MobileError(401, 'UNAUTHORIZED', 'Token móvil no válido')
    // La fecha del token no se aplica: vale mientras el dispositivo no se revoque ni pase tiempo sin usarse.
    if (typeof did === 'string' && this.devices) {
      if (!this.devices.isActive(did)) throw new MobileError(401, 'DEVICE_REVOKED', 'Este dispositivo ya no está emparejado: vuelve a emparejarlo')
      this.devices.touch(did, ip)
      return { expires: Number.POSITIVE_INFINITY, deviceId: did }
    }
    return { expires: Number.POSITIVE_INFINITY }
  }

  private sign(claims: string): string {
    return createHmac('sha256', this.secret).update(this.code).update('\0').update(claims).digest('base64url')
  }
}
