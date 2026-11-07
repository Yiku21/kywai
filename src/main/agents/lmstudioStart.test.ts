// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkLmStudio, ensureLmsServer } from './lmstudio'

// Una carpeta personal falsa donde «está instalado» el CLI `lms` de LM Studio, y `lms` simulado.
const { execFile, home } = vi.hoisted(() => ({ execFile: vi.fn(), home: { dir: '' } }))
vi.mock('node:child_process', async (orig) => ({ ...(await orig<typeof import('node:child_process')>()), execFile: (...a: unknown[]) => execFile(...a) }))
vi.mock('node:os', async (orig) => ({ ...(await orig<typeof import('node:os')>()), homedir: () => home.dir }))
home.dir = mkdtempSync(join(tmpdir(), 'lms-'))
const bin = join(home.dir, '.lmstudio', 'bin')
mkdirSync(bin, { recursive: true })
const lmsFile = join(bin, process.platform === 'win32' ? 'lms.exe' : 'lms')
const setInstalled = (on: boolean): void => (on ? writeFileSync(lmsFile, '') : rmSync(lmsFile, { force: true }))


let running = false
beforeEach(() => {
  running = false
  setInstalled(true)
  execFile.mockReset()
  execFile.mockImplementation((_bin: string, args: string[], _o: unknown, cb: (e: Error | null, out: string, err: string) => void) => {
    if (args[0] === 'server' && args[1] === 'start') running = true
    cb(null, args[0] === 'ps' ? '[]' : '', '')
  })
  vi.stubGlobal('fetch', async () => {
    if (!running) throw new Error('ECONNREFUSED')
    return new Response(JSON.stringify({ data: [{ id: 'qwen' }] }), { status: 200 })
  })
})
afterEach(() => vi.unstubAllGlobals())

const starts = (): number => execFile.mock.calls.filter((c) => (c[1] as string[])[0] === 'server').length

describe('encender LM Studio', () => {
  it('si el servidor está apagado lo enciende con «lms server start», una sola vez aunque lo pidan varios', async () => {
    const [a, b] = await Promise.all([ensureLmsServer(), ensureLmsServer()])
    expect(a && b).toBe(true)
    expect(starts()).toBe(1)
  })

  it('si ya está encendido no hace nada', async () => {
    running = true
    expect(await ensureLmsServer()).toBe(true)
    expect(starts()).toBe(0)
  })

  it('sin LM Studio instalado no intenta nada', async () => {
    setInstalled(false)
    expect(await ensureLmsServer()).toBe(false)
    expect(execFile).not.toHaveBeenCalled()
  })

  it('la comprobación normal (cada 30 s) no lo enciende; la pedida sí', async () => {
    expect((await checkLmStudio('qwen')).ok).toBe(false)
    expect(starts()).toBe(0)
    expect((await checkLmStudio('qwen', true)).ok).toBe(true)
    expect(starts()).toBe(1)
  })
})
