// Agente local de Colibri: su setup.json, la dirección y una tarea contra un servidor falso compatible con OpenAI.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentConfig } from '@shared/types'
import { cleanLocalUrl, isLocalEngine } from '@shared/localEngines'
import { checkColibri, colibriSetupHome, colibriStatus, colibriUrl, parseColibriSetup, runColibri, setColibriUrlSource } from './colibri'

type Msg = { role: string; content: string | null; tool_calls?: unknown[] }

let server: Server
let url = ''
let replies: Msg[] = []
let got: Record<string, unknown>[] = []
beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        if (req.url?.startsWith('/v1/models')) {
          return void res.writeHead(200, { 'content-type': 'application/json' }).end('{"data":[{"id":"qwen3.6","context_length":65536}]}')
        }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          got.push(JSON.parse(body))
          const message = replies.shift() ?? { role: 'assistant', content: '' }
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 7, completion_tokens: 3 } }))
        })
      })
      server.listen(0, '127.0.0.1', () => {
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        setColibriUrlSource(() => `${url}/v1/`)
        resolve()
      })
    })
)
afterAll(() => {
  setColibriUrlSource(() => undefined)
  return new Promise<void>((r) => server.close(() => r()))
})

const agent = { id: 'local', name: 'Qwen', provider: 'colibri', model: 'qwen36-35b' } as AgentConfig

describe('instalación de Colibri', () => {
  it('lee setup.json de una instalación terminada', () => {
    const setup = parseColibriSetup(
      JSON.stringify({ status: 'ready', launcher: '/home/yo/colibri/c/coli', host: '127.0.0.1', port: 8001, model: { id: 'qwen36-35b', name: 'Qwen3.6-35B-A3B' } })
    )
    expect(setup).toEqual({ launcher: '/home/yo/colibri/c/coli', host: '127.0.0.1', port: 8001, modelId: 'qwen36-35b', modelName: 'Qwen3.6-35B-A3B' })
    expect(colibriUrl(setup)).toBe(`${url}`) // la dirección de Ajustes manda sobre la de la instalación
  })

  it('una instalación a medias o un archivo roto no cuentan', () => {
    expect(parseColibriSetup(JSON.stringify({ status: 'pending', launcher: '/x/coli' }))).toBeNull()
    expect(parseColibriSetup('{no es json')).toBeNull()
    expect(parseColibriSetup(JSON.stringify({ status: 'ready' }))).toBeNull()
  })

  it('busca setup.json donde lo deja Colibri en cada sistema', () => {
    expect(colibriSetupHome({}, 'darwin', '/Users/yo')).toBe(join('/Users/yo', 'Library', 'Application Support', 'colibri'))
    expect(colibriSetupHome({}, 'linux', '/home/yo')).toBe(join('/home/yo', '.local', 'share', 'colibri'))
    expect(colibriSetupHome({ XDG_DATA_HOME: '/datos' }, 'linux', '/home/yo')).toBe(join('/datos', 'colibri'))
    expect(colibriSetupHome({ LOCALAPPDATA: 'C:\\Users\\yo\\AppData\\Local' }, 'win32', 'C:\\Users\\yo')).toContain('colibri')
  })
})

describe('dirección del servidor', () => {
  it('acepta host:puerto con o sin http y sin /v1', () => {
    expect(cleanLocalUrl('127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
    expect(cleanLocalUrl('http://localhost:8000/v1/')).toBe('http://localhost:8000')
    expect(cleanLocalUrl('https://mac-mini.tail.ts.net:8000')).toBe('https://mac-mini.tail.ts.net:8000')
  })

  it('rechaza lo que no es una dirección de servidor', () => {
    expect(cleanLocalUrl('')).toBeNull()
    expect(cleanLocalUrl('ftp://equipo:21')).toBeNull()
    expect(cleanLocalUrl('http://equipo:8000/otra/ruta')).toBeNull()
    expect(cleanLocalUrl('http://yo:clave@equipo:8000')).toBeNull()
  })

  it('Colibri cuenta como motor local', () => {
    expect(isLocalEngine('colibri')).toBe(true)
    expect(isLocalEngine('claude')).toBe(false)
  })
})

describe('agente de Colibri', () => {
  it('con otra dirección en Ajustes, lista lo que sirve ese servidor y no se ofrece encenderlo', async () => {
    const st = await colibriStatus()
    expect(st).toMatchObject({ installed: true, running: true, canStart: false })
    expect(st.models).toEqual([{ id: 'qwen3.6', label: 'qwen3.6', params: '64 k de contexto' }])
    expect(await checkColibri('qwen3.6')).toEqual({ ok: true })
  })

  it('trabaja con herramientas y manda el modelo que sirve el servidor', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'colibri-'))
    try {
      replies = [
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: 'hola.txt', content: 'hola' }) } }] },
        { role: 'assistant', content: 'He creado hola.txt.' }
      ]
      got = []
      const r = await runColibri({ agent, model: 'qwen36-35b', prompt: 'crea hola.txt', cwd: dir, mode: 'work', signal: new AbortController().signal })
      expect(r).toMatchObject({ ok: true, text: 'He creado hola.txt.' })
      expect(readFileSync(join(dir, 'hola.txt'), 'utf8')).toBe('hola')
      // setup.json decía «qwen36-35b», pero el servidor lo sirve como «qwen3.6».
      expect(got.map((b) => b.model)).toEqual(['qwen3.6', 'qwen3.6'])
      expect(got[0].tools).toBeDefined()
      expect(got[0].enable_thinking).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('si no responde nadie, dice que está apagado sin intentar encender otro servidor', async () => {
    setColibriUrlSource(() => 'http://127.0.0.1:9')
    try {
      const r = await runColibri({ agent, model: 'qwen3.6', prompt: 'hola', cwd: process.cwd(), mode: 'work', signal: new AbortController().signal })
      expect(r).toMatchObject({ ok: false, errorKind: 'offline' })
      expect((await checkColibri('qwen3.6', true)).ok).toBe(false)
    } finally {
      setColibriUrlSource(() => url)
    }
  })
})
