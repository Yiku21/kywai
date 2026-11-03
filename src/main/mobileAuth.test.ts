// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MobileAuth, mobileSigningKey, MOBILE_TOKEN_TTL_MS, PAIRING_PIN_TTL_MS } from './mobileAuth'

describe('credenciales móviles', () => {
  it('valida el código y la firma; un móvil emparejado no caduca (ni los tokens de 30 días de antes)', () => {
    let now = Date.now()
    const auth = new MobileAuth('codigo-de-acceso', () => now)
    expect(() => auth.pair('incorrecto', 'Pixel')).toThrow('Código de acceso incorrecto')
    const token = auth.pair('codigo-de-acceso', 'Pixel')
    const request = { headers: { authorization: `Bearer ${token.accessToken}` } }
    expect(auth.authenticate(request).expires).toBe(Number.POSITIVE_INFINITY)
    // El contrato pide una fecha: 100 años.
    expect(Date.parse(token.expiresAt)).toBe(now + MOBILE_TOKEN_TTL_MS)
    expect(new Date(token.expiresAt).getUTCFullYear()).toBeGreaterThan(new Date(now).getUTCFullYear() + 90)
    expect(() => auth.authenticate({ headers: { authorization: `Bearer x${token.accessToken}` } })).toThrow('Token móvil no válido')
    expect(() => new MobileAuth('codigo-de-acceso', () => now).authenticate(request)).toThrow('Token móvil no válido')
    // Pasada la fecha del token sigue valiendo (así siguen valiendo también los de 30 días que se dieron antes).
    now += 2 * MOBILE_TOKEN_TTL_MS
    expect(() => auth.authenticate(request)).not.toThrow()
  })

  it('con la clave guardada, el móvil sigue emparejado al reiniciar AI Cowork; un código de acceso nuevo lo desempareja', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aicw-mobile-key-'))
    try {
      const file = join(dir, 'web-cert', 'mobile-key')
      const key = mobileSigningKey(file)
      expect(mobileSigningKey(file).equals(key)).toBe(true)
      const token = new MobileAuth('codigo-de-acceso', Date.now, key).pair('codigo-de-acceso', 'Pixel')
      const request = { headers: { authorization: `Bearer ${token.accessToken}` } }
      // «Reinicio»: otra instancia con la clave leída del disco.
      expect(() => new MobileAuth('codigo-de-acceso', Date.now, mobileSigningKey(file)).authenticate(request)).not.toThrow()
      expect(() => new MobileAuth('codigo-nuevo-de-acceso', Date.now, mobileSigningKey(file)).authenticate(request)).toThrow('Token móvil no válido')
      // Una clave estropeada se rehace (y los móviles tendrían que volver a emparejarse).
      writeFileSync(file, 'basura')
      expect(mobileSigningKey(file).equals(key)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('también empareja con el código de 6 cifras: caduca a los 10 minutos y sirve una sola vez', () => {
    let now = Date.now()
    const auth = new MobileAuth('codigo-de-acceso', () => now)
    expect(() => auth.pair('123456', 'Pixel')).toThrow('Código de acceso incorrecto')
    const { pin, expiresAt } = auth.newPin()
    expect(pin).toMatch(/^\d{6}$/)
    expect(expiresAt).toBe(now + PAIRING_PIN_TTL_MS)
    const token = auth.pair(`${pin.slice(0, 3)} ${pin.slice(3)}`, 'Z Fold')
    expect(auth.authenticate({ headers: { authorization: `Bearer ${token.accessToken}` } }).expires).toBeGreaterThan(now)
    expect(() => auth.pair(pin, 'Otro')).toThrow('Código de acceso incorrecto')
    const late = auth.newPin()
    now += PAIRING_PIN_TTL_MS
    expect(() => auth.pair(late.pin, 'Tarde')).toThrow('Código de acceso incorrecto')
    expect(() => auth.pair('codigo-de-acceso', 'Con el largo')).not.toThrow()
  })

  it('exige Bearer y no acepta el código web, cookies o valores mal formados', () => {
    const auth = new MobileAuth('codigo-de-acceso')
    for (const headers of [{}, { cookie: 'cowork_token=codigo-de-acceso' }, { authorization: 'codigo-de-acceso' }, { authorization: 'Bearer codigo-de-acceso' }, { authorization: 'Bearer a.b.c' }]) {
      expect(() => auth.authenticate({ headers })).toThrow()
    }
  })
})
