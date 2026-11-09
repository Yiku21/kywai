// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { McpServerInput } from '@shared/extensions'
import { applyHermesSetup, applyHermesSetupFile, hermesMcpServers, MEMORY_SKILL, parseYaml, readHermesSetup, scanHermesSetup } from './hermesSetup'

let root = ''
let home = ''
let skills = ''

// Como el config.yaml de Hermes Desktop en Windows (sin claves de verdad).
const CONFIG = `model:
  base_url: http://localhost:20128/v1
  default: auto/smart
  provider: omnirouter
toolsets:
  - hermes-cli
  - web
mcp_servers:
  godot-ai:
    command: "C:\\\\Users\\\\yo\\\\pythonw.exe"
    args: ["-c", "import sys", "--index", "https://pypi.org/simple"]
  notas:
    url: https://notas.example.com/mcp
    headers:
      Authorization: "Bearer \${NOTAS_TOKEN}"
  viejo:
    command: npx
    enabled: false
plugins:
  enabled:
    - homeassistant
  disabled: []
`

const skill = (dir: string, name: string, desc: string): void => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n\n1. Paso uno.\n`)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hermes-setup-'))
  home = join(root, 'hermes')
  skills = join(root, 'habilidades')
  mkdirSync(join(home, 'memories'), { recursive: true })
  mkdirSync(skills, { recursive: true })
  writeFileSync(join(home, 'config.yaml'), CONFIG)
  writeFileSync(join(home, '.env'), 'NOTAS_TOKEN=secreto-123\nOTRA=x\n')
  writeFileSync(join(home, 'memories', 'USER.md'), 'Habla español.\n§\nNo escribe código; prueba el juego.')
  writeFileSync(join(home, 'memories', 'MEMORY.md'), 'El proyecto Juego está en E:\\Juego.')
  writeFileSync(join(home, 'SOUL.md'), 'Eres cercano y directo.')
  // Una de serie (está también en la instalación de Hermes), una propia con un archivo de más y una archivada.
  skill(join(home, 'skills', 'github', 'github-auth'), 'github-auth', 'Autenticarse en GitHub')
  skill(join(home, 'hermes-agent', 'skills', 'github', 'github-auth'), 'github-auth', 'Autenticarse en GitHub')
  skill(join(home, 'skills', 'software-development', 'plan'), 'plan', 'Planificar antes de programar')
  mkdirSync(join(home, 'skills', 'software-development', 'plan', 'references'), { recursive: true })
  writeFileSync(join(home, 'skills', 'software-development', 'plan', 'references', 'ejemplo.md'), 'Un ejemplo.')
  skill(join(home, 'skills', '.archive', 'godot-25d'), 'godot-25d', 'Archivada')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('configuración de Hermes', () => {
  it('lee el YAML de Hermes: mapas, listas en bloque y en línea, y textos entre comillas', () => {
    const cfg = parseYaml(CONFIG)
    expect(cfg.toolsets).toEqual(['hermes-cli', 'web'])
    expect((cfg.model as Record<string, unknown>).default).toBe('auto/smart')
    const godot = (cfg.mcp_servers as Record<string, Record<string, unknown>>)['godot-ai']
    expect(godot.command).toBe('C:\\Users\\yo\\pythonw.exe')
    expect(godot.args).toEqual(['-c', 'import sys', '--index', 'https://pypi.org/simple'])
    expect(((cfg.plugins as Record<string, unknown>).enabled as string[])).toEqual(['homeassistant'])
  })

  it('sus MCP como servidores de kywai, con las ${VAR} de su .env y sin los apagados', () => {
    expect(hermesMcpServers(home)).toEqual([
      { id: 'godot-ai', title: 'godot-ai', transport: 'stdio', command: 'C:\\Users\\yo\\pythonw.exe', args: ['-c', 'import sys', '--index', 'https://pypi.org/simple'], env: {} },
      { id: 'notas', title: 'notas', transport: 'http', url: 'https://notas.example.com/mcp', headers: { Authorization: 'Bearer secreto-123' } }
    ])
  })

  it('enseña lo que hay, con las skills propias primero y sin las archivadas', () => {
    const scan = scanHermesSetup(home, { skills: [], mcp: ['notas'] })
    expect(scan.found).toBe(true)
    expect(scan.skills.map((s) => [s.name, s.own])).toEqual([
      ['plan', true],
      ['github-auth', false]
    ])
    expect(scan.memory.map((x) => x.name)).toEqual(['MEMORY.md', 'USER.md', 'SOUL.md'])
    expect(scan.mcp.map((x) => [x.id, x.secrets, x.imported])).toEqual([
      ['godot-ai', 0, false],
      ['notas', 1, true]
    ])
    expect(JSON.stringify(scan)).not.toContain('secreto-123')
  })

  it('trae skills, memoria y MCP; no pisa lo que ya hay ni trae un programa de otro sistema', () => {
    const saved: McpServerInput[] = []
    const bundle = readHermesSetup({ skills: ['plan'], memory: true, mcp: ['godot-ai', 'notas'] }, 'mi-pc', home)
    expect(bundle.skills[0].files).toEqual({ 'SKILL.md': expect.stringContaining('name: plan'), 'references/ejemplo.md': 'Un ejemplo.' })
    const r = applyHermesSetup({ ...bundle, os: process.platform === 'win32' ? 'darwin' : 'win32' }, skills, (s) => saved.push(s), [])
    expect(r).toMatchObject({ skills: ['plan'], memory: true, mcp: ['notas'] })
    expect(r.skipped).toEqual([expect.stringContaining('godot-ai')])
    expect(saved.map((s) => s.id)).toEqual(['notas'])
    expect(readFileSync(join(skills, 'plan', 'references', 'ejemplo.md'), 'utf8')).toBe('Un ejemplo.')
    const mem = readFileSync(join(skills, MEMORY_SKILL, 'SKILL.md'), 'utf8')
    expect(mem).toContain(`name: ${MEMORY_SKILL}`)
    expect(mem).toContain('- No escribe código; prueba el juego.')
    expect(mem).toContain('Eres cercano y directo.')
    // Otra vez: la skill ya está y el servidor también.
    const again = applyHermesSetup(bundle, skills, (s) => saved.push(s), ['notas'])
    expect(again.skills).toEqual([])
    expect(again.skipped.length).toBe(2)
    expect(scanHermesSetup(home, { skills: ['plan', MEMORY_SKILL], mcp: [] })).toMatchObject({ memoryImported: true, skills: [{ name: 'plan', imported: true }, { name: 'github-auth' }] })
  })

  it('no escribe fuera de la carpeta de habilidades ni lee subidas de otra carpeta', () => {
    const bad = { format: 'kywai-hermes-setup', v: 1, device: 'x', os: process.platform, memory: {}, mcp: [], skills: [{ name: 'mala', files: { 'SKILL.md': '---\nname: mala\n---\n', '../../fuera.md': 'no' } }] }
    applyHermesSetup(bad, skills, () => undefined, [])
    expect(existsSync(join(root, 'fuera.md'))).toBe(false)
    expect(existsSync(join(skills, 'mala', 'SKILL.md'))).toBe(true)
    expect(() => applyHermesSetup({ format: 'otra' }, skills, () => undefined, [])).toThrow()
    const outside = join(root, 'kywai-hermes.json')
    writeFileSync(outside, JSON.stringify(bad))
    expect(() => applyHermesSetupFile(outside, skills, () => undefined, [])).toThrow()
  })
})
