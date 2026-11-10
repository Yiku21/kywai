// Actualizador propio del Mac: qué .zip se baja de la Release y que el script cambia la app sin dejarla rota.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => tmpdir() }, net: {} }))

const { MAC_SWAP_SCRIPT, macDownloadUrl, pickMacZip } = await import('./macUpdate')

const files = [
  { url: 'kywai-0.1.301-x64.zip', sha512: 'x64zip' },
  { url: 'kywai-0.1.301-arm64.zip', sha512: 'armzip' },
  { url: 'kywai-0.1.301-arm64.dmg', sha512: 'armdmg' }
]

describe('elegir la descarga', () => {
  it('toma el .zip de la arquitectura de este Mac', () => {
    expect(pickMacZip({ files }, 'arm64')).toEqual({ url: 'kywai-0.1.301-arm64.zip', sha512: 'armzip' })
    expect(pickMacZip({ files }, 'x64')).toEqual({ url: 'kywai-0.1.301-x64.zip', sha512: 'x64zip' })
    expect(pickMacZip({ files: files.slice(2) }, 'arm64')).toBeNull()
  })

  it('arma la dirección de la Release', () => {
    expect(macDownloadUrl('0.1.301', 'kywai-0.1.301-arm64.zip')).toBe(
      'https://github.com/Yiku21/kywai/releases/download/v0.1.301/kywai-0.1.301-arm64.zip'
    )
  })
})

describe('script que cambia la app', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function setup(): { current: string; next: string; script: string } {
    dir = mkdtempSync(join(tmpdir(), 'kywai-mac-'))
    const current = join(dir, 'kywai.app')
    const next = join(dir, '.kywai-actualizacion', 'kywai.app')
    mkdirSync(join(current, 'Contents'), { recursive: true })
    mkdirSync(join(next, 'Contents'), { recursive: true })
    writeFileSync(join(current, 'Contents', 'version'), 'vieja')
    writeFileSync(join(next, 'Contents', 'version'), 'nueva')
    const script = join(dir, 'cambiar.sh')
    writeFileSync(script, MAC_SWAP_SCRIPT, { mode: 0o755 })
    return { current, next, script }
  }

  it('cuando kywai ya se cerró, deja la nueva en su sitio y limpia', () => {
    const { current, next, script } = setup()
    // Un pid que no existe: como si kywai ya se hubiera cerrado.
    const r = spawnSync('bash', [script, '999999', current, next, '0'])
    expect(r.status).toBe(0)
    expect(readFileSync(join(current, 'Contents', 'version'), 'utf8')).toBe('nueva')
    expect(existsSync(`${current}.anterior`)).toBe(false)
    expect(existsSync(join(dir, '.kywai-actualizacion'))).toBe(false)
  })

  it('pasa la nueva por el firmador antes de cambiarla', () => {
    const { current, next, script } = setup()
    const signer = join(dir, 'firmar.sh')
    writeFileSync(signer, 'echo firmada > "$1/Contents/firma"\n')
    spawnSync('bash', [script, '999999', current, next, '0', signer])
    expect(readFileSync(join(current, 'Contents', 'firma'), 'utf8').trim()).toBe('firmada')
  })
})
