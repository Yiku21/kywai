import { createServer, type Server } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { comfyImage, comfySize, comfyStatus, findComfyInstall, pickCheckpoint, txt2imgWorkflow } from './comfyui'

let server: Server | null = null
afterEach(() => {
  server?.close()
  server = null
})

/** Un ComfyUI de mentira: lista modelos, recibe el flujo, contesta en /history a la segunda y sirve la imagen. */
function fakeComfy(opts: { models: string[]; fail?: boolean }): Promise<{ url: string; got: Record<string, unknown>[] }> {
  const got: Record<string, unknown>[] = []
  let polls = 0
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname === '/object_info/CheckpointLoaderSimple') {
      res.end(JSON.stringify({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [opts.models, {}] } } } }))
    } else if (url.pathname === '/prompt' && req.method === 'POST') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        got.push(JSON.parse(body))
        res.end(JSON.stringify({ prompt_id: 'abc' }))
      })
    } else if (url.pathname === '/history/abc') {
      polls++
      if (polls < 2) return res.end('{}')
      if (opts.fail) return res.end(JSON.stringify({ abc: { status: { status_str: 'error', completed: false }, outputs: {} } }))
      res.end(JSON.stringify({ abc: { status: { status_str: 'success', completed: true }, outputs: { '7': { images: [{ filename: 'kywai-video_00001_.png', subfolder: '', type: 'output' }] } } } }))
    } else if (url.pathname === '/view') {
      res.end(Buffer.alloc(500, url.searchParams.get('filename') === 'kywai-video_00001_.png' ? 7 : 0))
    } else {
      res.statusCode = 404
      res.end()
    }
  })
  return new Promise((ok) =>
    server!.listen(0, '127.0.0.1', () => {
      const addr = server!.address() as { port: number }
      ok({ url: `http://127.0.0.1:${addr.port}`, got })
    })
  )
}

describe('ComfyUI', () => {
  it('elige un modelo SDXL y deja fuera los que necesitan otro flujo', () => {
    expect(pickCheckpoint(['flux1-dev.safetensors', 'v1-5-pruned.safetensors', 'juggernautXL_v9.safetensors'], '')).toBe('juggernautXL_v9.safetensors')
    expect(pickCheckpoint(['flux1-dev.safetensors', 'v1-5-pruned.safetensors'], '')).toBe('v1-5-pruned.safetensors')
    expect(pickCheckpoint(['flux1-dev.safetensors'], '')).toBeNull()
    expect(pickCheckpoint(['a.safetensors', 'b.ckpt'], 'b')).toBe('b.ckpt')
  })

  it('tamaños en vertical y horizontal según el modelo', () => {
    expect(comfySize(true, true)).toEqual({ width: 768, height: 1344 })
    expect(comfySize(false, false)).toEqual({ width: 896, height: 512 })
  })

  it('apagado: no responde y no se usa', async () => {
    const st = await comfyStatus('http://127.0.0.1:1')
    expect(st).toEqual({ running: false, info: null, models: 0 })
  })

  it('encendido sin modelos que sirvan: responde pero no se usa', async () => {
    const { url } = await fakeComfy({ models: ['flux1-schnell.safetensors'] })
    const st = await comfyStatus(url)
    expect(st.running).toBe(true)
    expect(st.info).toBeNull()
    expect(st.models).toBe(1)
  })

  it('genera la imagen con el flujo txt2img y la guarda', async () => {
    const { url, got } = await fakeComfy({ models: ['sd_xl_base_1.0.safetensors'] })
    const st = await comfyStatus(url)
    expect(st.info).toEqual({ url, checkpoint: 'sd_xl_base_1.0.safetensors', xl: true })
    const dir = mkdtempSync(join(tmpdir(), 'comfy-'))
    try {
      const out = join(dir, 'escena-1.png')
      expect(await comfyImage(st.info!, 'a cat installing RAM', true, out, { pollMs: 5 })).toBe(true)
      expect(readFileSync(out).length).toBe(500)
      const wf = got[0].prompt as ReturnType<typeof txt2imgWorkflow>
      expect((wf['2'] as { inputs: { text: string } }).inputs.text).toBe('a cat installing RAM')
      expect((wf['4'] as { inputs: { width: number; height: number } }).inputs).toMatchObject({ width: 768, height: 1344 })
      expect((wf['1'] as { inputs: { ckpt_name: string } }).inputs.ckpt_name).toBe('sd_xl_base_1.0.safetensors')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('si ComfyUI da error, devuelve false (la escena pasa a Gemini)', async () => {
    const { url } = await fakeComfy({ models: ['sd_xl_base_1.0.safetensors'], fail: true })
    const st = await comfyStatus(url)
    const dir = mkdtempSync(join(tmpdir(), 'comfy-'))
    try {
      expect(await comfyImage(st.info!, 'x', false, join(dir, 'a.png'), { pollMs: 5 })).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('encender ComfyUI al pedir un vídeo', () => {
  it('encuentra la carpeta con main.py (y su entorno de Python) o la app de escritorio', () => {
    const home = mkdtempSync(join(tmpdir(), 'comfy-'))
    expect(findComfyInstall(home, 'linux', {})).toBeNull()
    mkdirSync(join(home, 'Documents', 'ComfyUI', '.venv', 'bin'), { recursive: true })
    writeFileSync(join(home, 'Documents', 'ComfyUI', 'main.py'), '')
    writeFileSync(join(home, 'Documents', 'ComfyUI', '.venv', 'bin', 'python'), '')
    expect(findComfyInstall(home, 'linux', {})).toEqual({ kind: 'dir', dir: join(home, 'Documents', 'ComfyUI'), python: join(home, 'Documents', 'ComfyUI', '.venv', 'bin', 'python') })
    // KYWAI_COMFYUI_DIR manda
    const other = join(home, 'otra')
    mkdirSync(other)
    writeFileSync(join(other, 'main.py'), '')
    expect(findComfyInstall(home, 'linux', { KYWAI_COMFYUI_DIR: other })).toMatchObject({ kind: 'dir', dir: other, python: 'python3' })
    // la app de escritorio en Windows
    const win = mkdtempSync(join(tmpdir(), 'comfy-win-'))
    mkdirSync(join(win, 'AppData', 'Local', 'Programs', 'ComfyUI'), { recursive: true })
    writeFileSync(join(win, 'AppData', 'Local', 'Programs', 'ComfyUI', 'ComfyUI.exe'), '')
    expect(findComfyInstall(win, 'win32', {})).toEqual({ kind: 'app', path: join(win, 'AppData', 'Local', 'Programs', 'ComfyUI', 'ComfyUI.exe') })
  })
})
