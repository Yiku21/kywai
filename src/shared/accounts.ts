// «Otra cuenta» de un agente: el mismo programa (Claude Code, Codex o Gemini CLI) con su propia carpeta de sesión,
// para tener en el equipo, por ejemplo, dos Claude con dos suscripciones distintas. Cada uno inicia sesión aparte,
// tiene su tarjeta, su robot y su cuota, y Hermes lo reparte como a un agente más.
//
// Solo valen los programas que dejan elegir su carpeta de sesión con una variable de entorno (comprobado en sus
// versiones de noviembre de 2026):
//   · Claude Code: CLAUDE_CONFIG_DIR (en Mac, el llavero también se separa: «Claude Code-credentials-<hash>»).
//   · Codex: CODEX_HOME (auth.json va dentro).
//   · Gemini CLI: GEMINI_CLI_HOME (hace de carpeta personal: su .gemini/ va dentro).
import type { AgentConfig, ProviderKind } from './types'

export type AccountProvider = 'claude' | 'codex' | 'gemini'

export const ACCOUNT_PROVIDERS: readonly AccountProvider[] = ['claude', 'codex', 'gemini']

/** La variable que cambia la carpeta de sesión de cada programa. */
export const ACCOUNT_ENV: Record<AccountProvider, string> = {
  claude: 'CLAUDE_CONFIG_DIR',
  codex: 'CODEX_HOME',
  gemini: 'GEMINI_CLI_HOME'
}

export function isAccountProvider(p: ProviderKind | string | undefined): p is AccountProvider {
  return p === 'claude' || p === 'codex' || p === 'gemini'
}

/** Identificador de carpeta válido (letras, números, guion): se usa como nombre de carpeta. */
export function cleanAccountId(v: unknown): string | undefined {
  return typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v) ? v : undefined
}

/** ¿Este agente (o la copia o el becario de uno) usa otra cuenta? Devuelve el nombre de su carpeta. */
export function accountOf(a: Pick<AgentConfig, 'provider' | 'accountId'>): string | null {
  return isAccountProvider(a.provider) && a.accountId ? a.accountId : null
}
