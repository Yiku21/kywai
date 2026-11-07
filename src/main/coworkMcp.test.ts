import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))

import { loadConfig } from './config'
import { initInbox, listInbox } from './inbox'
import { memoryOf } from './memory'
import * as store from './projects'
import { initSkills, readSkill, skillPromptLines } from './skills'
import { repoInstructionLines } from './repoInstructions'
import { mcpForTask, releaseMcp, startCoworkMcp, stopCoworkMcp } from './coworkMcp'
import { claudeArgs } from './agents/claude'
import { buildCommandLine } from './agents/spawn'

let projectId = ''

beforeAll(async () => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-mcp-'))
  const cfg = loadConfig()
  store.initProjects(cfg.workspaceRoot)
  projectId = store.createProject('Con herramientas').id
  initInbox(cfg.workspaceRoot)
  initSkills(cfg.workspaceRoot)
  mkdirSync(join(cfg.workspaceRoot, 'habilidades', 'publicar'), { recursive: true })
  writeFileSync(join(cfg.workspaceRoot, 'habilidades', 'publicar', 'SKILL.md'), '---\nname: publicar-version\ndescription: Cómo publicamos una versión\n---\n\n1. Subir el número.\n')
  writeFileSync(join(cfg.workspaceRoot, 'habilidades', 'informe.md'), '# Informes en tres niveles\n\nResumen, detalle y anexos.\n')
  await startCoworkMcp(cfg.workspaceRoot)
})

afterAll(() => stopCoworkMcp())

/** Habla con el servidor MCP como lo haría un CLI: un JSON por línea por stdin/stdout. */
async function talk(envVars: Record<string, string>, msgs: object[]): Promise<Record<number, { result?: any; error?: any }>> {
  const launch = mcpForTask({ projectId, runId: 'r1', taskId: 't1', taskTitle: 'Tarea', agentId: 'codex', agentName: 'Codex' })!
  const child = spawn(process.execPath, launch.args, { env: { ...process.env, ...launch.env, ...envVars }, stdio: ['pipe', 'pipe', 'inherit'] })
  const out: Record<number, { result?: any; error?: any }> = {}
  const rl = createInterface({ input: child.stdout })
  const done = new Promise<void>((ok) => {
    rl.on('line', (l) => {
      const m = JSON.parse(l)
      out[m.id] = m
      if (Object.keys(out).length === msgs.filter((x) => 'id' in x).length) ok()
    })
  })
  for (const m of msgs) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n')
  await done
  child.kill()
  releaseMcp(launch)
  return out
}

describe('servidor MCP de kywai', () => {
  it('se presenta, lista sus herramientas y las ejecuta para su proyecto y su tarea', async () => {
    const r = await talk({}, [
      { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } } },
      { method: 'notifications/initialized' },
      { id: 2, method: 'tools/list' },
      { id: 3, method: 'tools/call', params: { name: 'anotar_memoria', arguments: { tipo: 'hecho', texto: 'El servidor usa Node 22' } } },
      { id: 4, method: 'tools/call', params: { name: 'leer_habilidad', arguments: { nombre: 'Publicar-Version' } } },
      { id: 5, method: 'tools/call', params: { name: 'preguntar_usuario', arguments: { pregunta: '¿Lo publico en la tienda o solo en GitHub?' } } },
      { id: 6, method: 'tools/call', params: { name: 'nada', arguments: {} } },
      { id: 7, method: 'otra/cosa' }
    ])
    expect(r[1].result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'ai-cowork' }, capabilities: { tools: {} } })
    expect(r[2].result.tools.map((t: { name: string }) => t.name)).toEqual(['memoria_proyecto', 'anotar_memoria', 'estado_equipo', 'preguntar_usuario', 'leer_habilidad'])
    expect(r[3].result.content[0].text).toMatch(/^Anotado como m\d+/)
    expect(memoryOf(projectId).find((m) => m.text === 'El servidor usa Node 22')).toMatchObject({ kind: 'fact', status: 'provisional', by: 'codex', taskId: 't1' })
    expect(r[4].result.content[0].text).toContain('1. Subir el número.')
    expect(r[5].result.isError).toBe(false)
    expect(listInbox().find((i) => i.kind === 'question' && i.projectId === projectId)).toMatchObject({ title: 'Codex te pregunta («Tarea»)', taskId: 't1' })
    expect(r[6].result).toMatchObject({ isError: true })
    expect(r[7].error.code).toBe(-32601)
  })

  it('un token que no es de una tarea en marcha no sirve', async () => {
    const r = await talk({ AICW_MCP_TOKEN: 'f'.repeat(48) }, [{ id: 1, method: 'tools/list' }, { id: 2, method: 'tools/call', params: { name: 'memoria_proyecto' } }])
    expect(r[1].error.message).toMatch(/terminó|token/)
    expect(r[2].result.isError).toBe(true)
  })
})

describe('habilidades e instrucciones del repositorio', () => {
  it('lista las habilidades (carpeta con SKILL.md o .md suelto) y las lee por nombre', () => {
    const lines = skillPromptLines(true).join('\n')
    expect(lines).toContain('- publicar-version: Cómo publicamos una versión')
    expect(lines).toContain('- informe: Informes en tres niveles')
    expect(lines).not.toContain('LEEME')
    expect(skillPromptLines(false).join('\n')).toMatch(/publicar[/\\]SKILL\.md/)
    expect(readSkill('no-existe')).toBeNull()
  })

  it('cada CLI recibe los archivos de instrucciones que no lee por su cuenta, sin repetir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aicw-repo-'))
    writeFileSync(join(dir, 'AGENTS.md'), 'Usa pnpm.')
    writeFileSync(join(dir, 'CLAUDE.md'), '@AGENTS.md\n')
    expect(repoInstructionLines(dir, 'claude')).toEqual(['', '## Instrucciones del repositorio (AGENTS.md)', 'Usa pnpm.'])
    expect(repoInstructionLines(dir, 'codex')).toEqual([])
    expect(repoInstructionLines(dir, 'gemini').join('\n')).toContain('Usa pnpm.')
    writeFileSync(join(dir, 'CLAUDE.md'), 'Usa pnpm.')
    expect(repoInstructionLines(dir, 'gemini').filter((l) => l === 'Usa pnpm.')).toHaveLength(1)
  })
})

describe('el servidor MCP en la línea de comandos', () => {
  it('Claude: la configuración va en un archivo y la línea de comandos se puede lanzar por la consola', () => {
    const launch = mcpForTask({ projectId, runId: 'r1', taskId: 't1', taskTitle: 'Tarea', agentId: 'claude', agentName: 'Claude' })!
    const a = claudeArgs('', 'work', 'project', 'high', undefined, { name: 'ai-cowork', ...launch })
    expect(a[a.indexOf('--mcp-config') + 1]).toBe(launch.configFile)
    expect(a[a.indexOf('--allowedTools') + 1]).toBe('mcp__ai-cowork')
    expect(a).toContain('--strict-mcp-config')
    // Lo que rompió las tareas el 13 oct: un argumento con JSON no pasa por la consola y el CLI ni arranca.
    expect(() => buildCommandLine('claude', a)).not.toThrow()
    const cfg = JSON.parse(readFileSync(launch.configFile, 'utf8'))
    expect(cfg.mcpServers['ai-cowork']).toMatchObject({ type: 'stdio', command: process.execPath, env: { AICW_MCP_TOKEN: launch.token } })
    releaseMcp(launch)
    expect(existsSync(launch.configFile)).toBe(false)
    expect(claudeArgs('', 'work', 'project', undefined, undefined, { name: 'x y', ...launch })).not.toContain('--mcp-config')
  })

  it('una ruta con espacios (la app en /Applications/AI Cowork.app) también pasa', () => {
    const a = claudeArgs('', 'work', 'project', undefined, undefined, { name: 'ai-cowork', command: '/x', args: [], env: {}, configFile: '/Users/usuario/Library/Application Support/AI Cowork/mcp/tarea-ab12.json' })
    expect(buildCommandLine('claude', a)).toContain('"/Users/usuario/Library/Application Support/AI Cowork/mcp/tarea-ab12.json"')
  })
})
