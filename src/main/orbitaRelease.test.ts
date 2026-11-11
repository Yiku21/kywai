import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: true, getAppPath: () => '/nada', getPath: () => '/nada' } }))

import { __setOrbitaReleaseDirForChecks, __setOrbitaRemoteForChecks, orbitaRelease, ORBITA_REMOTE_BASE } from './orbitaRelease'

/** Un «repositorio público» de mentira: lo que haya en files se sirve; cuenta las descargas. */
function fakeRepo(files: Record<string, Buffer | string>): { fetch: (url: string) => Promise<Response>; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    fetch: async (url: string) => {
      calls.push(url.slice(ORBITA_REMOTE_BASE.length))
      const body = files[url.slice(ORBITA_REMOTE_BASE.length)]
      return body === undefined ? new Response('no', { status: 404 }) : new Response(body)
    }
  }
}

function published(versionCode: number): { apk: Buffer; json: string; sha256: string } {
  const apk = randomBytes(3000)
  const sha256 = createHash('sha256').update(apk).digest('hex')
  return { apk, sha256, json: JSON.stringify({ versionCode, versionName: `1.${versionCode}`, sha256, builtAt: '2026-11-11T15:39:52Z' }) }
}

describe('Órbita en un kywai descargado de Releases (sin código)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aicw-orbita-remota-'))
    __setOrbitaReleaseDirForChecks(null)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    __setOrbitaRemoteForChecks(undefined)
    __setOrbitaReleaseDirForChecks(undefined)
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('baja la última del repositorio público, la guarda y no la vuelve a bajar enseguida', async () => {
    const v = published(369)
    const repo = fakeRepo({ 'orbita.json': v.json, 'orbita.apk': v.apk })
    __setOrbitaRemoteForChecks({ dir, fetch: repo.fetch })
    const release = await orbitaRelease()
    expect(release?.info).toEqual({ versionCode: 369, versionName: '1.369', size: 3000, sha256: v.sha256, builtAt: '2026-11-11T15:39:52Z' })
    expect(readFileSync(release!.apk).equals(v.apk)).toBe(true)
    expect(repo.calls).toEqual(['orbita.json', 'orbita.apk'])
    expect((await orbitaRelease())?.info.versionCode).toBe(369)
    expect(repo.calls).toHaveLength(2)
  })

  it('con la misma versión ya guardada solo consulta orbita.json', async () => {
    const v = published(369)
    __setOrbitaRemoteForChecks({ dir, fetch: fakeRepo({ 'orbita.json': v.json, 'orbita.apk': v.apk }).fetch })
    await orbitaRelease()
    const repo = fakeRepo({ 'orbita.json': v.json, 'orbita.apk': v.apk })
    __setOrbitaRemoteForChecks({ dir, fetch: repo.fetch })
    expect((await orbitaRelease())?.info.versionCode).toBe(369)
    expect(repo.calls).toEqual(['orbita.json'])
  })

  it('cambia a la nueva cuando se publica otra', async () => {
    const vieja = published(369)
    __setOrbitaRemoteForChecks({ dir, fetch: fakeRepo({ 'orbita.json': vieja.json, 'orbita.apk': vieja.apk }).fetch })
    await orbitaRelease()
    const nueva = published(370)
    __setOrbitaRemoteForChecks({ dir, fetch: fakeRepo({ 'orbita.json': nueva.json, 'orbita.apk': nueva.apk }).fetch })
    const release = await orbitaRelease()
    expect(release?.info.versionCode).toBe(370)
    expect(readFileSync(release!.apk).equals(nueva.apk)).toBe(true)
  })

  it('una APK que no es la anotada no se guarda y se sigue ofreciendo la anterior', async () => {
    const vieja = published(369)
    __setOrbitaRemoteForChecks({ dir, fetch: fakeRepo({ 'orbita.json': vieja.json, 'orbita.apk': vieja.apk }).fetch })
    await orbitaRelease()
    const nueva = published(370)
    __setOrbitaRemoteForChecks({ dir, fetch: fakeRepo({ 'orbita.json': nueva.json, 'orbita.apk': randomBytes(3000) }).fetch })
    expect((await orbitaRelease())?.info.versionCode).toBe(369)
    expect(existsSync(join(dir, 'orbita.apk.part'))).toBe(false)
  })

  it('sin internet ni nada guardado no ofrece nada (y no se rompe)', async () => {
    __setOrbitaRemoteForChecks({ dir, fetch: async () => { throw new Error('sin red') } })
    expect(await orbitaRelease()).toBeNull()
    __setOrbitaRemoteForChecks({ dir, fetch: fakeRepo({ 'orbita.json': '{"versionCode":1}' }).fetch })
    expect(await orbitaRelease()).toBeNull()
  })

  it('con el código en el equipo (git) usa su carpeta y no baja nada', async () => {
    const v = published(475)
    const src = mkdtempSync(join(tmpdir(), 'aicw-orbita-src-'))
    try {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(join(src, 'orbita.apk'), v.apk)
      writeFileSync(join(src, 'orbita.json'), v.json)
      __setOrbitaReleaseDirForChecks(src)
      const repo = fakeRepo({})
      __setOrbitaRemoteForChecks({ dir, fetch: repo.fetch })
      expect((await orbitaRelease())?.info.versionCode).toBe(475)
      expect(repo.calls).toEqual([])
    } finally {
      rmSync(src, { recursive: true, force: true })
    }
  })
})
