// Carpeta de sesión de cada «otra cuenta» (src/shared/accounts.ts) y cómo se lanza su programa con ella.
//
// La carpeta vive en los datos de kywai (cuentas/<accountId>). Lo que no es de la cuenta (habilidades, plugins,
// órdenes, instrucciones generales y ajustes) se enlaza desde la carpeta de siempre del programa, para que el agente
// nuevo tenga las mismas Extensiones que el de siempre. La sesión (credenciales, historial, cuota) queda aparte.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentConfig } from '@shared/types'
import { ACCOUNT_ENV, accountOf, type AccountProvider } from '@shared/accounts'

/** Carpeta donde van las cuentas (la pone la app al arrancar; sin ella, en las pruebas, no se separa nada). */
let root: string | null = null

export function setAccountsRoot(dir: string | null): void {
  root = dir
}

/** Carpeta de sesión de una cuenta (null si no hay carpeta de cuentas). */
export function accountDirOf(accountId: string): string | null {
  return root ? join(root, accountId) : null
}

/** La carpeta de siempre de cada programa (la que usa el agente de fábrica). */
function usualDir(provider: AccountProvider, home = homedir()): string {
  if (provider === 'claude') return process.env.CLAUDE_CONFIG_DIR || join(home, '.claude')
  if (provider === 'codex') return process.env.CODEX_HOME || join(home, '.codex')
  return join(process.env.GEMINI_CLI_HOME || home, '.gemini')
}

/** Lo que se comparte con el de siempre (nunca credenciales, historial ni ajustes con la sesión dentro). */
const SHARED: Record<AccountProvider, string[]> = {
  claude: ['skills', 'agents', 'commands', 'plugins', 'output-styles', 'CLAUDE.md', 'settings.json'],
  codex: ['config.toml', 'AGENTS.md', 'skills', 'prompts', 'rules'],
  // settings.json de Gemini guarda cómo entra (clave o Google): cada cuenta tiene el suyo.
  gemini: ['extensions', 'GEMINI.md', 'commands']
}

/** Carpeta donde el programa espera sus archivos dentro de la de la cuenta (Gemini usa <home>/.gemini). */
function programDir(provider: AccountProvider, dir: string): string {
  return provider === 'gemini' ? join(dir, '.gemini') : dir
}

/**
 * Crea la carpeta de la cuenta y enlaza lo compartido que aún falte. Un enlace que no se pueda crear (Windows sin
 * permiso para enlaces de archivo) se copia; si tampoco, se deja: el agente funciona igual, solo sin eso.
 */
export function prepareAccountDir(provider: AccountProvider, dir: string, home = homedir()): void {
  const target = programDir(provider, dir)
  mkdirSync(target, { recursive: true })
  const from = usualDir(provider, home)
  for (const name of SHARED[provider]) {
    const src = join(from, name)
    const dst = join(target, name)
    if (!existsSync(src)) continue
    try {
      lstatSync(dst)
      continue // ya está (enlace, copia o uno propio de la cuenta): no se toca
    } catch {
      // No existe: se enlaza.
    }
    const isDir = statSync(src).isDirectory()
    try {
      symlinkSync(src, dst, isDir ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file')
    } catch {
      if (!isDir) {
        try {
          copyFileSync(src, dst)
        } catch {
          /* sin eso */
        }
      }
    }
  }
}

/** Una clave «GEMINI_API_KEY=…» del .env de la cuenta de Gemini, si la tiene. */
export function accountGeminiKey(dir: string): string | null {
  try {
    const m = readFileSync(join(dir, '.gemini', '.env'), 'utf8').match(/^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*["']?([^"'\s]+)/m)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export interface AccountLaunch {
  env: Record<string, string>
  unsetEnv: string[]
}

/**
 * Variables con las que se lanza el programa de una «otra cuenta» (o de su copia o becario): su carpeta de sesión y,
 * en Gemini, su propia clave (la de siempre, si está en el entorno de kywai, ganaría a la del .env de la cuenta).
 * null si el agente es el de siempre.
 */
export function accountLaunch(agent: Pick<AgentConfig, 'provider' | 'accountId'>, prepare = true): AccountLaunch | null {
  const id = accountOf(agent)
  if (!id) return null
  const dir = accountDirOf(id)
  if (!dir) return null
  const provider = agent.provider as AccountProvider
  if (prepare) {
    try {
      prepareAccountDir(provider, dir)
    } catch (e) {
      console.error('[cowork] no se pudo preparar la carpeta de la cuenta', id, e)
    }
  }
  const env: Record<string, string> = { [ACCOUNT_ENV[provider]]: dir }
  const unsetEnv: string[] = []
  if (provider === 'gemini') {
    const key = accountGeminiKey(dir)
    if (key) env.GEMINI_API_KEY = key
    else unsetEnv.push('GEMINI_API_KEY')
    unsetEnv.push('GOOGLE_API_KEY')
  }
  // Una clave o un token de la cuenta de siempre en el entorno ganarían a la sesión de esta cuenta.
  if (provider === 'claude') unsetEnv.push('ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN')
  if (provider === 'codex') unsetEnv.push('OPENAI_API_KEY')
  return { env, unsetEnv }
}

/** Mezcla las variables de la cuenta con las que ya lleve una ejecución. */
export function withAccount<T extends { env?: Record<string, string>; unsetEnv?: string[] }>(agent: Pick<AgentConfig, 'provider' | 'accountId'>, run: T): T {
  const acc = accountLaunch(agent)
  if (!acc) return run
  const unset = [...(run.unsetEnv ?? []), ...acc.unsetEnv].filter((k) => !(k in acc.env) && !(run.env && k in run.env))
  return { ...run, env: { ...(run.env ?? {}), ...acc.env }, unsetEnv: unset }
}
