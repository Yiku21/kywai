import type { AgentConfig, ProviderKind } from '@shared/types'
import { runClaude } from './claude'
import { runCodex } from './codex'
import { runGemini } from './gemini'
import { checkOllama, runOllama } from './ollama'
import { checkLmStudio, runLmStudio } from './lmstudio'
import { runHermes } from './hermes'
import { runMuse } from './muse'
import { runQwen } from './qwen'
import { runGeneric } from './generic'
import { commandExists } from './spawn'
import type { RunAgentOptions, RunAgentResult } from './types'
import { tr } from '@shared/i18n'

export type { RunAgentOptions, RunAgentResult, RateLimitInfo, AgentErrorKind } from './types'

const CLI: Record<Exclude<ProviderKind, 'ollama' | 'lmstudio' | 'cli'>, { command: string; label: string }> = {
  claude: { command: 'claude', label: 'Claude Code' },
  codex: { command: 'codex', label: 'Codex' },
  gemini: { command: 'gemini', label: 'Gemini' },
  qwen: { command: 'qwen', label: 'Qwen Code' },
  hermes: { command: 'hermes', label: 'Hermes Agent' },
  muse: { command: 'muse', label: 'Muse Code' }
}

/** Providers that can only produce text (no file tools). */
export function isTextOnly(provider: ProviderKind): boolean {
  // LM Studio tiene herramientas propias (localTools); Ollama, por ahora, solo texto.
  return provider === 'ollama'
}

/** Proveedores que se ejecutan en este equipo (se re-comprueban a menudo). */
export function isLocalProvider(provider: ProviderKind): boolean {
  return provider === 'ollama' || provider === 'lmstudio'
}

export function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  switch (opts.agent.provider) {
    case 'claude':
      return runClaude(opts)
    case 'codex':
      return runCodex(opts)
    case 'gemini':
      return runGemini(opts)
    case 'qwen':
      return runQwen(opts)
    case 'ollama':
      return runOllama(opts)
    case 'lmstudio':
      return runLmStudio(opts)
    case 'hermes':
      return runHermes(opts)
    case 'muse':
      return runMuse(opts)
    case 'cli':
      return runGeneric(opts)
    default:
      return Promise.resolve({
        ok: false,
        text: '',
        usage: { input: 0, output: 0 },
        errorKind: 'missing',
        errorMessage: tr('Proveedor desconocido: {String}', { String: String(opts.agent.provider) })
      })
  }
}

const cliCache = new Map<string, Promise<boolean>>()

/** Presence check without any paid call. Returns null if usable, or the offline reason. */
export async function checkAgentPresence(agent: AgentConfig, fresh = false): Promise<string | null> {
  if (agent.provider === 'ollama') {
    const r = await checkOllama(agent.model)
    return r.ok ? null : (r.reason ?? tr('Ollama no disponible'))
  }
  if (agent.provider === 'lmstudio') {
    // Comprobación pedida (arranque, «Encender LM Studio», ⟳): si el servidor está apagado, se enciende.
    const r = await checkLmStudio(agent.model, fresh)
    return r.ok ? null : (r.reason ?? tr('LM Studio no disponible'))
  }
  // Agente de catálogo: su programa es el que dice su ficha.
  const cli = agent.provider === 'cli' ? (agent.cli ? { command: agent.cli.command, label: agent.name } : undefined) : CLI[agent.provider]
  if (!cli) return agent.provider === 'cli' ? tr('{name} no tiene configurado cómo lanzarlo', { name: agent.name }) : tr('Proveedor desconocido: {String}', { String: String(agent.provider) })
  if (fresh) cliCache.delete(cli.command)
  let p = cliCache.get(cli.command)
  if (!p) {
    p = commandExists(cli.command)
    cliCache.set(cli.command, p)
  }
  return (await p) ? null : tr('No se encontró el CLI de {label}', { label: cli.label })
}
