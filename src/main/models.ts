import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentConfig, ModelOption } from '@shared/types'

/** Modelos de Claude Code (alias del CLI). Notas según la investigación del 11-10-2026 (docs/GUIA-MODELOS.md). */
const CLAUDE: ModelOption[] = [
  { id: 'haiku', label: 'Haiku', note: 'Muy rápido y barato; flojo programando' },
  { id: 'sonnet', label: 'Sonnet', note: 'Rápido; casi como Opus por la mitad de cuota' },
  { id: 'opus', label: 'Opus', note: 'El mejor en diseño y en lo difícil; gasta más' },
  { id: 'fable', label: 'Fable', note: 'En Pro se cobra aparte; en Max gasta su propia cuota' }
]

/** Notas de los modelos de Codex conocidos (las del CLI son genéricas). */
const CODEX_NOTES: Record<string, string> = {
  'gpt-6-luna': 'Muy barato (1/20 de Sol); flojo en terminal',
  'gpt-6.1-sol': 'El mejor en calidad por minuto',
  'gpt-6-sol': 'Superado por GPT-6.1 Sol',
  'gpt-6-astra': '5 veces la cuota de Sol sin mejorarlo'
}

/** Respaldo si no se puede leer la lista de Codex. */
const CODEX_FALLBACK: ModelOption[] = [
  { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' },
  { id: 'gpt-6-sol', label: 'GPT-6 Sol' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }
].map((o) => ({ ...o, note: CODEX_NOTES[o.id] }))

const GEMINI: ModelOption[] = [
  { id: 'gemini-3.8-flash', label: '3.8 Flash', note: 'El mejor Gemini para código; tiene nivel gratuito' },
  { id: 'gemini-3.5-flash-lite', label: '3.5 Flash-Lite', note: 'Muy rápido y barato' },
  { id: 'gemini-3.1-flash-lite', label: '3.1 Flash-Lite', note: 'Rápido; flojo programando' },
  { id: 'gemini-3.1-pro-preview', label: '3.1 Pro', note: 'Solo con clave de pago; lee documentos enormes' },
  { id: '', label: 'Auto', note: 'Con clave gratuita puede intentar Pro (de pago)' }
]

/** Modelos de Muse Code (Meta). Con la suscripción, cada uno gasta la misma cuota de 5 h. */
const MUSE: ModelOption[] = [
  { id: '', label: 'El de Muse Code', note: 'El que tenga configurado (respeta el modo Contributor)' },
  { id: 'muse-spark-1.3', label: 'Spark 1.3', note: 'El más nuevo: mejor en trabajo largo y gasta menos tokens' },
  { id: 'muse-spark-1.2', label: 'Spark 1.2', note: 'Pensado para código; superado por 1.3' },
  { id: 'muse-spark-1.1', label: 'Spark 1.1', note: 'El más antiguo' }
]

function prettyCodex(slug: string): string {
  return slug.replace(/^gpt-/i, 'GPT-').replace(/-([a-z])/g, (_, c: string) => ` ${c.toUpperCase()}`)
}

/** Modelos que el Codex CLI conoce para esta cuenta (~/.codex/models_cache.json). */
function codexOptions(): ModelOption[] {
  try {
    const file = join(homedir(), '.codex', 'models_cache.json')
    if (!existsSync(file)) return CODEX_FALLBACK
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { models?: unknown[]; data?: unknown[] }
    const list = (raw.models ?? raw.data ?? []) as Record<string, unknown>[]
    const out: ModelOption[] = list
      .filter((m) => typeof m.slug === 'string' && m.visibility !== 'hide')
      .map((m) => ({
        id: m.slug as string,
        label: typeof m.display_name === 'string' ? (m.display_name as string).replace(/-/g, ' ') : prettyCodex(m.slug as string),
        note: CODEX_NOTES[m.slug as string] ?? (typeof m.description === 'string' ? (m.description as string).slice(0, 60) : undefined)
      }))
    // Se añaden los conocidos que falten (la caché depende de la versión del CLI).
    for (const f of CODEX_FALLBACK) if (!out.some((o) => o.id === f.id)) out.push(f)
    return out.length ? out : CODEX_FALLBACK
  } catch {
    return CODEX_FALLBACK
  }
}

export function modelOptions(agent: AgentConfig): ModelOption[] {
  switch (agent.provider) {
    case 'claude':
      return CLAUDE
    case 'codex':
      return codexOptions()
    case 'gemini':
      return GEMINI
    case 'muse':
      return MUSE
    default:
      return agent.model ? [{ id: agent.model, label: agent.modelLabel || agent.model }] : []
  }
}
