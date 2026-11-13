import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => tmpdir(), getPath: () => tmpdir() } }))

import { mcpRuntimeFor, parseMcpPaste } from '@shared/extensions'
import { fileKeyCipher, migratingCipher } from './localCipher'
import {
  McpRegistry,
  claudeServers,
  codexMcp,
  geminiEnv,
  geminiExtension,
  geminiTaskSettings,
  guideLines,
  hermesMcp,
  initExtensions,
  launcherScript,
  secretVar,
  serversFor,
  setMcpAgents,
  testHttp,
  testStdio,
  type ResolvedMcpServer
} from './extensions'
import { claudeArgs } from './agents/claude'
import { codexArgs } from './agents/codex'
import { geminiArgs } from './agents/gemini'
import { hermesArgs } from './agents/hermes'
import { buildCommandLine } from './agents/spawn'

const dir = mkdtempSync(join(tmpdir(), 'kywai-ext-'))

/** Servidor MCP mínimo: su herramienta lleva en la descripción la variable SECRETO que recibió. */
const ECO = join(dir, 'eco.cjs')
writeFileSync(
  ECO,
  `const rl = require('readline').createInterface({ input: process.stdin })
const send = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
rl.on('line', (l) => {
  let m
  try { m = JSON.parse(l) } catch { return }
  if (m.method === 'initialize') send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'eco', version: '1' } } })
  else if (m.method === 'tools/list') send({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'eco_' + (process.env.SECRETO || 'nada'), inputSchema: { type: 'object' } }] } })
  else if (m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, result: {} })
})
`
)

const plain = { available: () => false, encrypt: (s: string) => s, decrypt: (s: string) => s }
const rot = { available: () => true, encrypt: (s: string) => Buffer.from(s).toString('base64'), decrypt: (s: string) => Buffer.from(s, 'base64').toString() }

function server(over: Partial<ResolvedMcpServer> = {}): ResolvedMcpServer {
  return { id: 'eco', title: 'Eco', transport: 'stdio', command: process.execPath, args: [ECO], url: '', env: { SECRETO: 'hola' }, headers: {}, agents: ['claude'], test: { ok: true, at: 1, message: 'ok', tools: ['eco_hola'] }, ...over }
}

describe('lo que se pega al añadir un servidor', () => {
  it('una línea de comandos', () => {
    expect(parseMcpPaste('npx -y @playwright/mcp@latest --headless')).toEqual([{ id: 'playwright', transport: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest', '--headless'] }])
    expect(parseMcpPaste('GITHUB_TOKEN=abc npx -y @modelcontextprotocol/server-github')).toEqual([
      { id: 'github', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: 'abc' } }
    ])
    expect(parseMcpPaste('uvx mcp-server-fetch')).toEqual([{ id: 'fetch', transport: 'stdio', command: 'uvx', args: ['mcp-server-fetch'] }])
  })

  it('el JSON de un README (mcpServers, una entrada suelta o con la orden en una cadena)', () => {
    const r = parseMcpPaste('{"mcpServers": {"memory": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"], "env": {"MEMORY_FILE_PATH": "/tmp/m.json"}}, "remoto": {"url": "https://ejemplo.com/mcp", "headers": {"Authorization": "Bearer x"}}}}')
    expect(r).toEqual([
      { id: 'memory', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], env: { MEMORY_FILE_PATH: '/tmp/m.json' } },
      { id: 'remoto', transport: 'http', url: 'https://ejemplo.com/mcp', headers: { Authorization: 'Bearer x' } }
    ])
    expect(parseMcpPaste('"context7": { "command": "npx -y @upstash/context7-mcp" },')).toEqual([{ id: 'context7', transport: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'] }])
    expect(typeof parseMcpPaste('{ roto')).toBe('string')
  })

  it('las órdenes «claude mcp add» y una dirección', () => {
    expect(parseMcpPaste('claude mcp add --transport http github https://api.githubcopilot.com/mcp/ -H "Authorization: Bearer abc"')).toEqual([
      { id: 'github', transport: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer abc' } }
    ])
    expect(parseMcpPaste('claude mcp add playwright -e A=1 -- npx @playwright/mcp@latest')).toEqual([{ id: 'playwright', transport: 'stdio', command: 'npx', args: ['@playwright/mcp@latest'], env: { A: '1' } }])
    expect(parseMcpPaste('https://mcp.notion.com/mcp')).toEqual([{ id: 'notion', transport: 'http', url: 'https://mcp.notion.com/mcp' }])
  })
})

describe('registro de servidores', () => {
  it('guarda las claves cifradas y nunca las devuelve a la interfaz', () => {
    const file = join(dir, 'r1.json')
    const r = new McpRegistry(file, rot)
    const info = r.save({ id: 'github', transport: 'stdio', command: 'npx', args: ['-y', 'x'], env: { GITHUB_TOKEN: 'secreto-123' } })
    expect(info.envNames).toEqual(['GITHUB_TOKEN'])
    expect(JSON.stringify(info)).not.toContain('secreto-123')
    expect(readFileSync(file, 'utf8')).not.toContain('secreto-123')
    expect(r.get('github')?.env.GITHUB_TOKEN).toBe('secreto-123')
  })

  it('lo cifrado con el llavero se pasa a la clave propia de kywai la primera vez que se lee', () => {
    const file = join(dir, 'r-llavero.json')
    new McpRegistry(file, rot).save({ id: 'github', transport: 'stdio', command: 'npx', args: ['x'], env: { GITHUB_TOKEN: 'secreto-123' } })
    let keychainReads = 0
    const keychain = { ...rot, decrypt: (s: string) => (keychainReads++, rot.decrypt(s)) }
    const cipher = migratingCipher(fileKeyCipher(join(dir, 'clave-local.key')), keychain)
    const r = new McpRegistry(file, cipher)
    expect(r.get('github')?.env.GITHUB_TOKEN).toBe('secreto-123')
    expect(readFileSync(file, 'utf8')).toContain('local1:')
    expect(r.get('github')?.env.GITHUB_TOKEN).toBe('secreto-123')
    expect(keychainReads).toBe(1)
  })

  it('un valor vacío deja el guardado; cambiar cómo arranca lo apaga para todos', () => {
    const r = new McpRegistry(join(dir, 'r2.json'), plain)
    r.save({ id: 'eco', transport: 'stdio', command: 'node', args: ['a.js'], env: { K: 'v1' } })
    r.setTest('eco', { ok: true, at: 1, message: 'ok' })
    r.setAgents('eco', ['claude', 'codex'])
    r.save({ id: 'eco', title: 'Eco nuevo', transport: 'stdio', command: 'node', args: ['a.js'], env: { K: '' } })
    expect(r.get('eco')?.env.K).toBe('v1')
    expect(r.get('eco')?.agents).toEqual(['claude', 'codex'])
    r.save({ id: 'eco', transport: 'stdio', command: 'node', args: ['b.js'], env: { K: '' } })
    expect(r.get('eco')?.agents).toEqual([])
    expect(r.get('eco')?.env.K).toBe('v1')
  })

  it('rechaza nombres reservados, direcciones sin https y caracteres de control', () => {
    const r = new McpRegistry(join(dir, 'r3.json'), plain)
    expect(() => r.save({ id: 'ai-cowork', transport: 'stdio', command: 'x' })).toThrow()
    expect(() => r.save({ id: 'Mal Nombre', transport: 'stdio', command: 'x' })).toThrow()
    expect(() => r.save({ id: 'web', transport: 'http', url: 'http://ejemplo.com/mcp' })).toThrow()
    expect(() => r.save({ id: 'web', transport: 'stdio', command: 'x', args: ['a\nb'] })).toThrow()
    expect(r.save({ id: 'local', transport: 'http', url: 'http://127.0.0.1:3000/mcp' }).url).toBe('http://127.0.0.1:3000/mcp')
  })

  it('al encenderlo para un agente lo prueba antes: si falla, se queda apagado y dice por qué', async () => {
    const r = new McpRegistry(join(dir, 'r4.json'), plain)
    initExtensions(r, { geminiDir: join(dir, 'gemini-ext') })
    r.save({ id: 'roto', transport: 'stdio', command: 'no-existe-este-programa-kywai' })
    const after = await setMcpAgents('roto', ['claude'])
    expect(after[0].agents).toEqual([])
    expect(after[0].test?.ok).toBe(false)
    r.save({ id: 'eco', transport: 'stdio', command: process.execPath, args: [ECO], env: { SECRETO: 'hola' } })
    const ok = await setMcpAgents('eco', ['claude', 'gemini'])
    expect(ok.find((x) => x.id === 'eco')?.agents).toEqual(['claude', 'gemini'])
    expect(serversFor('claude').map((s) => s.id)).toEqual(['eco'])
    expect(serversFor('codex')).toEqual([])
    // La extensión de Gemini se escribe sin la clave.
    const ext = readFileSync(join(dir, 'gemini-ext', 'gemini-extension.json'), 'utf8')
    expect(ext).toContain('"eco"')
    expect(ext).not.toContain('hola')
    expect(ext).toContain(`\${${secretVar('eco', 'SECRETO')}}`)
  }, 30_000)
})

describe('probar un servidor', () => {
  it('si falta uvx o npx, dice qué hay que instalar (uv o Node.js) para ofrecer el botón', async () => {
    expect(mcpRuntimeFor('uvx')).toBe('uv')
    expect(mcpRuntimeFor('/Users/x/.local/bin/uv')).toBe('uv')
    expect(mcpRuntimeFor('C:\\Program Files\\nodejs\\npx.cmd')).toBe('node')
    expect(mcpRuntimeFor('docker')).toBeNull()
    const r = await testStdio({ command: 'uvx', args: ['mcp-server-fetch'], env: { PATH: join(dir, 'vacio') } }, 5_000)
    expect(r.ok).toBe(false)
    expect(r.runtime).toBe('uv')
    expect(r.message).toContain('uvx')
  })

  it('local: lo arranca, saluda y pide sus herramientas', async () => {
    const r = await testStdio(server(), 15_000)
    expect(r.ok).toBe(true)
    expect(r.tools).toEqual(['eco_hola'])
  })

  it('local: dice por qué falla', async () => {
    const r = await testStdio({ command: process.execPath, args: ['-e', 'process.exit(3)'], env: {} }, 15_000)
    expect(r.ok).toBe(false)
    expect(r.message).toContain('3')
  })

  it('remoto: JSON o eventos, con la sesión y las cabeceras', async () => {
    let auth = ''
    const srv = createServer((req, res) => {
      let body = ''
      req.on('data', (d) => (body += d))
      req.on('end', () => {
        auth = String(req.headers.authorization ?? '')
        if (auth !== 'Bearer bueno') {
          res.writeHead(401).end()
          return
        }
        const m = JSON.parse(body) as { id?: number; method: string }
        if (m.method === 'initialize') {
          res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 's1' }).end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {} }))
        } else if (m.method === 'tools/list') {
          res.writeHead(200, { 'content-type': 'text/event-stream' }).end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'buscar' }] } })}\n\n`)
        } else res.writeHead(202).end()
      })
    })
    await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok))
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}/mcp`
    expect((await testHttp({ url, headers: { Authorization: 'Bearer bueno' } })).tools).toEqual(['buscar'])
    const no = await testHttp({ url, headers: {} })
    expect(no.ok).toBe(false)
    expect(no.message).toContain('Authorization')
    srv.close()
  })
})

describe('lo que recibe cada CLI', () => {
  it('Hermes: un config.yaml propio de la tarea (ámbito gestionado) y sus nombres en -t, solo al trabajar', () => {
    const h = hermesMcp([server(), server({ id: 'web', transport: 'http', url: 'https://ejemplo.com/mcp', headers: { Authorization: 'Bearer x' } })], join(dir, 'mcp'), 'abc', { env: {}, managedExists: false })
    if ('skipped' in h) throw new Error(h.skipped)
    expect(h.env).toEqual({ HERMES_MANAGED_DIR: h.dir })
    const cfg = JSON.parse(readFileSync(join(h.dir, 'config.yaml'), 'utf8'))
    expect(cfg).toEqual({
      mcp_servers: {
        eco: { command: process.execPath, args: [ECO], env: { SECRETO: 'hola' }, connect_timeout: 60 },
        web: { url: 'https://ejemplo.com/mcp', headers: { Authorization: 'Bearer x' }, connect_timeout: 60 }
      }
    })
    const work = hermesArgs('/tmp/q.txt', '', 'work', undefined, h.names)
    expect(work[work.indexOf('-t') + 1]).toMatch(/,eco,web$/)
    const plan = hermesArgs('/tmp/q.txt', '', 'plan', undefined, h.names)
    expect(plan[plan.indexOf('-t') + 1]).not.toContain('eco')
    // Si el equipo ya tiene un ámbito gestionado de verdad, no se pisa.
    expect('skipped' in hermesMcp([server()], join(dir, 'mcp'), 'def', { env: { HERMES_MANAGED_DIR: '/x' } })).toBe(true)
    expect('skipped' in hermesMcp([server()], join(dir, 'mcp'), 'def', { env: {}, managedExists: true })).toBe(true)
  })

  it('Gemini: el navegador de una tarea va en unos ajustes de sistema propios, sin perder los del equipo', () => {
    const nav = server({ id: 'kywai-navegador', env: { AICW_MCP_TOKEN: 't1' } })
    const g = geminiTaskSettings([nav], join(dir, 'mcp'), 'g1', { systemFile: join(dir, 'no-existe.json') })
    expect(g.env).toEqual({ GEMINI_CLI_SYSTEM_SETTINGS_PATH: g.file })
    expect(JSON.parse(readFileSync(g.file, 'utf8'))).toEqual({
      mcpServers: { 'kywai-navegador': { command: process.execPath, args: [ECO], env: { AICW_MCP_TOKEN: 't1' }, timeout: 60000, trust: true } }
    })
    // Si el equipo ya tiene ajustes de sistema, se copian y se les suma el navegador.
    const sys = join(dir, 'system-settings.json')
    writeFileSync(sys, JSON.stringify({ general: { x: 1 }, mcpServers: { suyo: { command: 'a' } } }))
    const g2 = geminiTaskSettings([nav], join(dir, 'mcp'), 'g2', { systemFile: sys })
    const cfg = JSON.parse(readFileSync(g2.file, 'utf8'))
    expect(cfg.general).toEqual({ x: 1 })
    expect(Object.keys(cfg.mcpServers)).toEqual(['suyo', 'kywai-navegador'])
    expect(geminiArgs('', 'work', 'project', ['kywai-navegador']).join(' ')).toContain('--allowed-mcp-server-names kywai-navegador')
  })

  it('Claude: los servidores van en su archivo y sus herramientas se permiten', () => {
    expect(claudeServers([server()])).toEqual({ eco: { type: 'stdio', command: process.execPath, args: [ECO], env: { SECRETO: 'hola' } } })
    const a = claudeArgs('', 'work', 'project', undefined, undefined, { name: 'ai-cowork', command: 'x', args: [], env: {}, configFile: '/tmp/t.json', extraNames: ['eco', 'mal nombre'] })
    expect(a[a.indexOf('--allowedTools') + 1]).toBe('mcp__ai-cowork,mcp__eco')
    expect(() => buildCommandLine('claude', a)).not.toThrow()
  })

  it('Codex: un lanzador por servidor local, que arranca el servidor con sus claves', async () => {
    const c = codexMcp([server()], join(dir, 'mcp'), 'abc', false)
    expect(c.files).toHaveLength(1)
    expect(c.args).toEqual(['-c', `mcp_servers.eco.command=${c.files[0].replace(/\\/g, '/')}`, '-c', 'mcp_servers.eco.startup_timeout_sec=60'])
    // Todo cabe en la consola sin comillas raras.
    expect(() => buildCommandLine('codex', codexArgs('', 'work', [], 'project', undefined, undefined, c.args))).not.toThrow()
    // El lanzador funciona de verdad: el servidor recibe su variable.
    if (process.platform !== 'win32') expect((await testStdio({ command: c.files[0], args: [], env: {} }, 15_000)).tools).toEqual(['eco_hola'])
  })

  it('Codex: los remotos llevan sus cabeceras en variables, y lo que no cabe en la consola se queda fuera', () => {
    const c = codexMcp([server({ id: 'web', transport: 'http', url: 'https://ejemplo.com/mcp', headers: { Authorization: 'Bearer x' } }), server({ id: 'raro', transport: 'http', url: 'https://ejemplo.com/mcp?a=1&b=2', headers: {} })], join(dir, 'mcp'), 'abc', false)
    expect(c.args).toContain('mcp_servers.web.url=https://ejemplo.com/mcp')
    expect(c.args).toContain(`mcp_servers.web.env_http_headers.Authorization=${secretVar('web', 'H_Authorization')}`)
    expect(c.env[secretVar('web', 'H_Authorization')]).toBe('Bearer x')
    expect(c.skipped).toEqual(['raro'])
  })

  it('el lanzador de Windows no deja pasar lo que interpreta la consola', () => {
    expect(launcherScript({ command: 'npx', args: ['-y', 'x y'], env: { K: 'v' } }, true)).toBe('@echo off\r\nset "K=v"\r\ncall npx -y "x y"\r\n')
    expect(() => launcherScript({ command: 'npx', args: ['a&b'], env: {} }, true)).toThrow()
  })

  it('Gemini: solo los servidores de la tarea, con las claves por variables', () => {
    const list = [server(), server({ id: 'web', transport: 'http', url: 'https://ejemplo.com/mcp', env: {}, headers: { Authorization: 'Bearer x' } })]
    const ext = geminiExtension(list) as { name: string; mcpServers: Record<string, Record<string, unknown>> }
    expect(ext.name).toBe('kywai')
    expect(ext.mcpServers.web).toEqual({ httpUrl: 'https://ejemplo.com/mcp', headers: { Authorization: `\${${secretVar('web', 'H_Authorization')}}` } })
    expect(geminiEnv(list)).toEqual({ [secretVar('eco', 'SECRETO')]: 'hola', [secretVar('web', 'H_Authorization')]: 'Bearer x' })
    const a = geminiArgs('', 'work', 'project', ['eco', 'web'])
    expect(a[a.indexOf('--allowed-mcp-server-names') + 1]).toBe('eco,web')
    const none = geminiArgs('', 'work')
    expect(none[none.indexOf('--allowed-mcp-server-names') + 1]).toBe('none')
  })

  it('el coordinador sabe qué herramientas tiene cada agente', () => {
    const lines = guideLines(
      [
        { id: 'eco', title: 'Eco', transport: 'stdio', envNames: [], headerNames: [], agents: ['claude'], test: { ok: true, at: 1, message: '', tools: ['eco_hola'] } },
        { id: 'rota', title: 'Rota', transport: 'stdio', envNames: [], headerNames: [], agents: ['codex'], test: { ok: false, at: 1, message: '' } }
      ],
      { claude: ['Claude', 'Becario'], codex: ['Codex'] }
    )
    expect(lines.join('\n')).toContain('- Claude, Becario: Eco (eco_hola)')
    expect(lines.join('\n')).not.toContain('Rota')
    expect(guideLines([], { claude: ['Claude'] })).toEqual([])
  })
})
