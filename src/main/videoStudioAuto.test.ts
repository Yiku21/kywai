import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { autoInstallVideoStudio, initVideoStudio } from './videoStudio'

const dirs: string[] = []
afterEach(() => {
  delete process.env.KYWAI_NO_VIDEO_AUTOINSTALL
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('el estudio de vídeo viene de serie', () => {
  it('se puede desactivar con KYWAI_NO_VIDEO_AUTOINSTALL=1', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'estudio-'))
    dirs.push(ws)
    initVideoStudio(ws)
    process.env.KYWAI_NO_VIDEO_AUTOINSTALL = '1'
    expect(await autoInstallVideoStudio()).toBe('off')
  })

  it('si el último intento fue hace menos de un día, no lo repite en cada arranque', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'estudio-'))
    dirs.push(ws)
    initVideoStudio(ws)
    mkdirSync(join(ws, 'estudio-video'), { recursive: true })
    const now = Date.now()
    writeFileSync(join(ws, 'estudio-video', '.instalacion-automatica.json'), JSON.stringify({ at: now - 3600_000 }))
    expect(await autoInstallVideoStudio(now)).toBe('waiting')
  }, 20_000)
})
