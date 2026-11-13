import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAgent } from '@shared/agentCatalog'
import { DEFAULT_AGENTS, DEFAULT_STATIONS } from '@shared/defaults'
import { loginToolOf, parseSetupToolId, programToolOf } from '@shared/setupTool'
import { accountGeminiKey, accountLaunch, prepareAccountDir, setAccountsRoot, withAccount } from './accounts'
import { loginScript } from '../loginScript'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'kywai-cuentas-'))

describe('otra cuenta: agente nuevo', () => {
  it('Claude B: misma ficha que Claude, con su id, nombre, color, estación, carpeta y sin la cuota de siempre', () => {
    const claude = DEFAULT_AGENTS.find((a) => a.provider === 'claude')!
    const { agent, station } = buildAgent({ accountOf: 'claude' }, DEFAULT_AGENTS, DEFAULT_STATIONS)
    expect(agent.id).toBe('claude-cuenta')
    expect(agent.accountId).toBe('claude-cuenta')
    expect(agent.provider).toBe('claude')
    expect(agent.name).toBe(`${claude.name} B`)
    expect(agent.model).toBe(claude.model)
    expect(agent.strengths).toEqual(claude.strengths)
    expect(agent.quotaGroupId).toBeUndefined()
    expect(agent.color).not.toBe(claude.color)
    expect(agent.stationId).toBe('st-claude-cuenta')
    expect(station?.id).toBe('st-claude-cuenta')
    // Una tercera cuenta sigue con la letra siguiente y otro id.
    const next = buildAgent({ accountOf: 'claude' }, [...DEFAULT_AGENTS, agent], [...DEFAULT_STATIONS, station!])
    expect(next.agent.id).toBe('claude-cuenta-2')
    expect(next.agent.name).toBe(`${claude.name} C`)
    expect(buildAgent({ accountOf: 'codex', name: 'Codex trabajo' }, DEFAULT_AGENTS, DEFAULT_STATIONS).agent.name).toBe('Codex trabajo')
  })

  it('inicia sesión en su propia ventana, pero instala el mismo programa', () => {
    const a = { id: 'claude-cuenta', provider: 'claude', accountId: 'claude-cuenta' }
    expect(loginToolOf(a)).toBe('account:claude-cuenta')
    expect(programToolOf(a)).toBe('claude')
    expect(loginToolOf({ id: 'claude', provider: 'claude' })).toBe('claude')
    expect(parseSetupToolId('account:claude-cuenta')).toBe('account:claude-cuenta')
    expect(() => parseSetupToolId('account:../x')).toThrow()
  })
})

describe('otra cuenta: cómo se lanza', () => {
  afterEach(() => {
    setAccountsRoot(null)
    vi.unstubAllEnvs()
  })

  it('el de siempre se lanza tal cual; la otra cuenta, con su carpeta', () => {
    const root = tmp()
    setAccountsRoot(root)
    expect(accountLaunch({ provider: 'claude' })).toBeNull()
    expect(accountLaunch({ provider: 'hermes', accountId: 'x' } as never)).toBeNull()
    const home = tmp()
    vi.stubEnv('HOME', home)
    vi.stubEnv('CLAUDE_CONFIG_DIR', join(home, '.claude'))
    const c = accountLaunch({ provider: 'claude', accountId: 'claude-cuenta' })!
    expect(c.env.CLAUDE_CONFIG_DIR).toBe(join(root, 'claude-cuenta'))
    expect(c.unsetEnv).toContain('ANTHROPIC_API_KEY')
    vi.stubEnv('CODEX_HOME', join(home, '.codex'))
    expect(accountLaunch({ provider: 'codex', accountId: 'codex-cuenta' })!.env.CODEX_HOME).toBe(join(root, 'codex-cuenta'))
    vi.stubEnv('GEMINI_CLI_HOME', home)
    const g = accountLaunch({ provider: 'gemini', accountId: 'gemini-cuenta' })!
    expect(g.env.GEMINI_CLI_HOME).toBe(join(root, 'gemini-cuenta'))
    // Sin clave propia, no hereda la de siempre.
    expect(g.unsetEnv).toContain('GEMINI_API_KEY')
    writeFileSync(join(root, 'gemini-cuenta', '.gemini', '.env'), 'GEMINI_API_KEY=AIzaOtraClave123\n')
    expect(accountGeminiKey(join(root, 'gemini-cuenta'))).toBe('AIzaOtraClave123')
    const g2 = accountLaunch({ provider: 'gemini', accountId: 'gemini-cuenta' })!
    expect(g2.env.GEMINI_API_KEY).toBe('AIzaOtraClave123')
    expect(g2.unsetEnv).not.toContain('GEMINI_API_KEY')
  })

  it('mezcla sus variables con las de la ejecución sin quitar las que esta pone', () => {
    setAccountsRoot(tmp())
    type Run = { command: string; env?: Record<string, string>; unsetEnv?: string[] }
    const base: Run = { command: 'gemini', env: { GEMINI_API_KEY: 'de-la-tarea' } }
    const run = withAccount({ provider: 'gemini', accountId: 'g' }, base)
    expect(run.env?.GEMINI_CLI_HOME).toBeTruthy()
    expect(run.unsetEnv).not.toContain('GEMINI_API_KEY')
    const plain: Run = { command: 'claude' }
    expect(withAccount({ provider: 'claude' }, plain)).toEqual({ command: 'claude' })
  })

  it('enlaza las habilidades y ajustes de siempre, nunca la sesión', () => {
    const home = tmp()
    const usual = join(home, '.claude')
    mkdirSync(join(usual, 'skills', 'mi-habilidad'), { recursive: true })
    writeFileSync(join(usual, 'settings.json'), '{"model":"opus"}')
    writeFileSync(join(usual, '.credentials.json'), '{"secreto":1}')
    vi.stubEnv('CLAUDE_CONFIG_DIR', usual)
    const dir = join(tmp(), 'claude-cuenta')
    prepareAccountDir('claude', dir, home)
    expect(existsSync(join(dir, 'skills', 'mi-habilidad'))).toBe(true)
    expect(readFileSync(join(dir, 'settings.json'), 'utf8')).toContain('opus')
    expect(existsSync(join(dir, '.credentials.json'))).toBe(false)
    // Una segunda vez no rompe nada (ya están).
    prepareAccountDir('claude', dir, home)
    expect(lstatSync(join(dir, 'skills')).isSymbolicLink() || lstatSync(join(dir, 'skills')).isDirectory()).toBe(true)
  })

  it('la ventana de «Iniciar sesión» entra con la carpeta de la cuenta y avisa de usar la otra', () => {
    const env = { env: { CLAUDE_CONFIG_DIR: '/datos/kywai/cuentas/claude-cuenta' }, unsetEnv: ['ANTHROPIC_API_KEY'] }
    const sh = loginScript('claude', 'Claude B', 'mac', 'claude auth login', env, true)
    expect(sh).toContain("export CLAUDE_CONFIG_DIR='/datos/kywai/cuentas/claude-cuenta'")
    expect(sh).toContain('unset ANTHROPIC_API_KEY')
    expect(sh.indexOf('export CLAUDE_CONFIG_DIR')).toBeLessThan(sh.indexOf('claude auth login'))
    expect(sh).toContain('OTRA cuenta')
    const win = loginScript('claude', 'Claude B', 'win', 'claude auth login', { env: { CLAUDE_CONFIG_DIR: 'C:\\Users\\yo\\AppData\\Roaming\\AI Cowork\\cuentas\\claude-cuenta' }, unsetEnv: [] }, true)
    expect(win).toContain('set "CLAUDE_CONFIG_DIR=C:\\Users\\yo\\AppData\\Roaming\\AI Cowork\\cuentas\\claude-cuenta"')
    expect(loginScript('claude', 'Claude Code', 'mac', 'claude auth login')).not.toContain('CLAUDE_CONFIG_DIR')
  })
})
