import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '', getPath: () => '' } }))
const { withEstimatedUsage } = await import('./index')

describe('tokens estimados de los CLIs que no los dicen', () => {
  const res = { ok: true, text: 'x'.repeat(400), usage: { input: 0, output: 0 } }

  it('Hermes y los de catálogo: unos 4 caracteres por token del encargo y de la respuesta, marcado como estimado', () => {
    expect(withEstimatedUsage('hermes', 'y'.repeat(1001), res).usage).toEqual({ input: 251, output: 100, cached: 0, estimated: true })
    expect(withEstimatedUsage('cli', 'abcd', res).usage.estimated).toBe(true)
  })

  it('no toca a los que informan de sus tokens ni a un CLI de catálogo que sí los dio', () => {
    expect(withEstimatedUsage('claude', 'y'.repeat(1000), res)).toBe(res)
    const given = { ...res, usage: { input: 10, output: 5 } }
    expect(withEstimatedUsage('cli', 'y'.repeat(1000), given)).toBe(given)
  })
})
