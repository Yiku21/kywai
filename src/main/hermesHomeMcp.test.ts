import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => tmpdir(), getPath: () => tmpdir() } }))
import { mcpRuntimeFor } from '@shared/extensions'
import { hermesHomeEntry, hermesHomeToolsets, hermesMcpIds, syncHermesHome, withHermesMcp, type HermesHomeEntry } from './hermesHomeMcp'
import { lightpandaInstallCommand } from './setup'
import { hermesArgs } from './agents/hermes'
import type { ResolvedMcpServer } from './extensions'

const LP: HermesHomeEntry = { id: 'lightpanda', command: '/Users/yo/.local/bin/lightpanda', args: ['mcp'], env: { LIGHTPANDA_DISABLE_TELEMETRY: 'true' } }
const CONFIG = 'model:\n  provider: omnirouter\n  default: claude/opus\n'

const server = (over: Partial<ResolvedMcpServer> = {}): ResolvedMcpServer => ({
  id: 'lightpanda',
  title: 'Lightpanda',
  transport: 'stdio',
  command: 'lightpanda',
  args: ['mcp'],
  url: '',
  env: { LIGHTPANDA_DISABLE_TELEMETRY: 'true' },
  headers: {},
  agents: ['hermes'],
  test: { ok: true, message: 'ok', at: 0 },
  ...over
})

describe('Lightpanda en la configuración de Hermes', () => {
  it('añade la sección mcp_servers al final si no la hay, sin tocar lo demás', () => {
    const out = withHermesMcp(CONFIG, 'lightpanda', LP)
    expect(out.startsWith(CONFIG.trimEnd())).toBe(true)
    expect(out).toContain('mcp_servers:\n  # kywai:lightpanda')
    expect(out).toContain('    command: "/Users/yo/.local/bin/lightpanda"')
    expect(out).toContain('    args: ["mcp"]')
    expect(out).toContain('    env: {"LIGHTPANDA_DISABLE_TELEMETRY":"true"}')
    expect(hermesMcpIds(out)).toEqual(['lightpanda'])
  })

  it('entra en la sección que ya hay con su sangría y sin quitar los servidores del usuario', () => {
    const yaml = 'mcp_servers:\n    github:\n        command: "npx"\nmodel:\n  default: x\n'
    const out = withHermesMcp(yaml, 'lightpanda', LP)
    expect(out).toContain('mcp_servers:\n    # kywai:lightpanda')
    expect(out).toContain('        command: "/Users/yo/.local/bin/lightpanda"')
    expect(out).toContain('    github:\n        command: "npx"')
    // Quitarlo deja el archivo como estaba.
    expect(withHermesMcp(out, 'lightpanda', null)).toBe(yaml)
  })

  it('poner dos veces no lo duplica y quitarlo deja una sección vacía válida', () => {
    const once = withHermesMcp(CONFIG, 'lightpanda', LP)
    expect(withHermesMcp(once, 'lightpanda', LP)).toBe(once)
    const gone = withHermesMcp(once, 'lightpanda', null)
    expect(gone).toContain('mcp_servers: {}')
    expect(hermesMcpIds(gone)).toEqual([])
    expect(withHermesMcp('mcp_servers: {}\n', 'lightpanda', LP)).toContain('mcp_servers:\n  # kywai:lightpanda')
  })

  it('no toca un servidor propio con el mismo nombre ni una sección escrita en una línea', () => {
    const own = 'mcp_servers:\n  lightpanda:\n    command: "/opt/lp"\n'
    expect(withHermesMcp(own, 'lightpanda', LP)).toBe(own)
    const inline = 'mcp_servers: {github: {command: npx}}\n'
    expect(withHermesMcp(inline, 'lightpanda', LP)).toBe(inline)
  })

  it('respeta los finales de línea de Windows', () => {
    const out = withHermesMcp('model:\r\n  default: x\r\n', 'lightpanda', LP)
    expect(out).toContain('\r\nmcp_servers:\r\n')
    expect(out.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('solo van los de Lightpanda, con la ruta entera del programa', () => {
    expect(hermesHomeEntry(server(), () => '/home/yo/.local/bin/lightpanda')?.command).toBe('/home/yo/.local/bin/lightpanda')
    expect(hermesHomeEntry(server(), () => null)).toBeNull()
    expect(hermesHomeEntry(server({ id: 'fetch', command: 'uvx', args: ['mcp-server-fetch'] }), () => '/x/uvx')).toBeNull()
    expect(hermesHomeEntry(server({ transport: 'http', command: '' }), () => '/x')).toBeNull()
  })

  it('syncHermesHome no crea la configuración si Hermes no tiene, y la deja al día si la tiene', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kywai-hermes-'))
    const file = join(dir, 'config.yaml')
    syncHermesHome([server({ command: '/opt/lp/lightpanda' })], file)
    expect(hermesHomeToolsets(file)).toEqual([])
    writeFileSync(file, CONFIG)
    syncHermesHome([server({ command: '/opt/lp/lightpanda' })], file)
    expect(hermesHomeToolsets(file)).toEqual(['lightpanda'])
    expect(readFileSync(file, 'utf8')).toContain('command: "/opt/lp/lightpanda"')
    // Apagado para Hermes (ya no llega en la lista): se quita.
    syncHermesHome([], file)
    expect(hermesHomeToolsets(file)).toEqual([])
    expect(readFileSync(file, 'utf8').startsWith(CONFIG.trimEnd())).toBe(true)
  })

  it('Hermes lo pide con -t también al coordinar', () => {
    const toolsets = (a: string[]) => a[a.indexOf('-t') + 1].split(',')
    expect(toolsets(hermesArgs('/tmp/q.txt', '', 'plan', undefined, [], false, ['lightpanda']))).toContain('lightpanda')
    expect(toolsets(hermesArgs('/tmp/q.txt', '', 'work', undefined, ['lightpanda'], false, ['lightpanda'])).filter((x) => x === 'lightpanda')).toHaveLength(1)
  })
})

describe('instalar Lightpanda', () => {
  it('reconoce su orden para ofrecer el botón «Instalar Lightpanda»', () => {
    expect(mcpRuntimeFor('lightpanda')).toBe('lightpanda')
    expect(mcpRuntimeFor('/Users/yo/.local/bin/lightpanda')).toBe('lightpanda')
  })

  it('baja el programa de su sistema a ~/.local/bin, y en Windows no hay', () => {
    expect(lightpandaInstallCommand('darwin', 'arm64')).toContain('/nightly/lightpanda-aarch64-macos')
    expect(lightpandaInstallCommand('darwin', 'x64')).toContain('/nightly/lightpanda-x86_64-macos')
    expect(lightpandaInstallCommand('linux', 'x64')).toContain('/nightly/lightpanda-x86_64-linux')
    expect(lightpandaInstallCommand('linux', 'arm64')).toContain('/nightly/lightpanda-aarch64-linux')
    expect(lightpandaInstallCommand('linux', 'x64')).toContain('"$HOME/.local/bin/lightpanda" version')
    expect(lightpandaInstallCommand('win32', 'x64')).toBeNull()
  })
})
