import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEVICE_INACTIVE_MS, DeviceRegistry } from './devices'

describe('DeviceRegistry', () => {
  it('registra dispositivos con identificador propio', () => {
    const reg = new DeviceRegistry(null)
    const a = reg.register({ name: 'Pixel', kind: 'mobile' })
    const b = reg.register({ name: 'MacBook', kind: 'client', platform: 'darwin' })
    expect(a.id).not.toBe(b.id)
    expect(reg.list().map((d) => d.name).sort()).toEqual(['MacBook', 'Pixel'])
    expect(reg.isActive(a.id)).toBe(true)
  })

  it('revocar uno no afecta a los demás', () => {
    const reg = new DeviceRegistry(null)
    const a = reg.register({ name: 'A', kind: 'mobile' })
    const b = reg.register({ name: 'B', kind: 'client' })
    expect(reg.revoke(a.id)).toBe(true)
    expect(reg.isActive(a.id)).toBe(false)
    expect(reg.isActive(b.id)).toBe(true)
    expect(reg.revoke('no-existe')).toBe(false)
  })

  it('un dispositivo inactivo deja de valer y usarlo antes de tiempo lo mantiene', () => {
    let t = 1_000_000
    const reg = new DeviceRegistry(null, () => t)
    const d = reg.register({ name: 'A', kind: 'mobile' })
    t += DEVICE_INACTIVE_MS - 1000
    expect(reg.isActive(d.id)).toBe(true)
    reg.touch(d.id, '100.64.0.2')
    t += DEVICE_INACTIVE_MS - 1000
    expect(reg.isActive(d.id)).toBe(true)
    expect(reg.get(d.id)?.lastIp).toBe('100.64.0.2')
    t += 2000
    expect(reg.isActive(d.id)).toBe(false)
  })

  it('un revocado no se reactiva al usarlo', () => {
    const reg = new DeviceRegistry(null)
    const d = reg.register({ name: 'A', kind: 'client' })
    reg.revoke(d.id)
    reg.touch(d.id)
    expect(reg.isActive(d.id)).toBe(false)
  })

  it('se guarda y se recupera al reiniciar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cowork-dev-'))
    try {
      const file = join(dir, 'devices.json')
      const first = new DeviceRegistry(file)
      const a = first.register({ name: 'Portátil', kind: 'client' })
      const b = first.register({ name: 'Móvil', kind: 'mobile' })
      first.revoke(b.id)
      expect(JSON.parse(readFileSync(file, 'utf8')).devices).toHaveLength(2)
      const second = new DeviceRegistry(file)
      expect(second.isActive(a.id)).toBe(true)
      expect(second.isActive(b.id)).toBe(false)
      expect(second.get(a.id)?.name).toBe('Portátil')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('un registro estropeado no impide arrancar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cowork-dev-'))
    try {
      const file = join(dir, 'devices.json')
      new DeviceRegistry(file).register({ name: 'A', kind: 'mobile' })
      writeFileSync(file, '{no es json')
      expect(new DeviceRegistry(file).list()).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
