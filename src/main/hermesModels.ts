// Modelos de Hermes (el coordinador) para «/model» en el chat: los proveedores con sesión y sus modelos, tal como
// los lista `hermes model` en la terminal. Se leen de los archivos de Hermes (sin llamadas de pago ni claves) y la
// elección se aplica a cada encargo con sus opciones oficiales -m y --provider (no se toca su configuración).
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentConfig, HermesModelsInfo, HermesProvider } from '@shared/types'

/** Carpeta de Hermes Agent: HERMES_HOME, %LOCALAPPDATA%\hermes en Windows o ~/.hermes. */
export function hermesHome(): string {
  if (process.env.HERMES_HOME) return process.env.HERMES_HOME
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) return join(process.env.LOCALAPPDATA, 'hermes')
  return join(homedir(), '.hermes')
}

interface HermesConfigModel {
  provider: string
  model: string
  baseUrl: string
}

const unquote = (v: string): string => v.trim().replace(/^(['"])(.*)\1$/, '$2')

/**
 * Lo justo de config.yaml: el bloque `model:` (proveedor, modelo y dirección) y los nombres de `providers:` con su
 * dirección. Sin leer ni devolver claves.
 */
export function parseHermesConfig(yaml: string): { model: HermesConfigModel | null; named: Map<string, string> } {
  const named = new Map<string, string>()
  const model: HermesConfigModel = { provider: '', model: '', baseUrl: '' }
  let section = ''
  let entry = ''
  for (const raw of yaml.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue
    const indent = raw.length - raw.trimStart().length
    const m = /^\s*([\w.\-]+):\s*(.*)$/.exec(raw)
    if (!m) continue
    const [, key, value] = m
    if (indent === 0) {
      section = key
      entry = ''
      continue
    }
    if (section === 'model' && indent === 2) {
      if (key === 'provider') model.provider = unquote(value)
      else if (key === 'default') model.model = unquote(value)
      else if (key === 'base_url') model.baseUrl = unquote(value)
    } else if (section === 'providers') {
      if (indent === 2) entry = key
      else if (indent === 4 && entry && (key === 'base_url' || key === 'api') && value.trim()) named.set(entry, unquote(value))
    }
  }
  return { model: model.provider || model.model ? model : null, named }
}

const LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  copilot: 'GitHub Copilot',
  'github-copilot': 'GitHub Copilot',
  gemini: 'Google Gemini',
  google: 'Google Gemini',
  'openai-codex': 'ChatGPT o suscripción de Codex',
  codex: 'ChatGPT o suscripción de Codex',
  chatgpt: 'ChatGPT o suscripción de Codex',
  openai: 'OpenAI',
  deepinfra: 'DeepInfra',
  openrouter: 'OpenRouter',
  nous: 'Nous Portal',
  ollama: 'Ollama'
}

/**
 * La misma dirección aunque se escriba distinto: sin barra final, sin el «#…» que añaden las versiones nuevas de
 * Hermes a la clave de su caché («custom:http://127.0.0.1:20128/v1#aff94a1a…») y con localhost igual a 127.0.0.1.
 */
function urlKey(u: string): string {
  return u
    .trim()
    .replace(/#.*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
    .replace(/^(https?:\/\/)(localhost|0\.0\.0\.0|\[::1\])(?=[:/]|$)/, '$1127.0.0.1')
}
const sameUrl = (a: string, b: string): boolean => urlKey(a) === urlKey(b)

/** Proveedores con sus modelos según la caché del selector de Hermes (provider_models_cache.json). */
export function hermesProviders(cache: Record<string, unknown>, cfg: ReturnType<typeof parseHermesConfig>): HermesProvider[] {
  const out: HermesProvider[] = []
  for (const [key, value] of Object.entries(cache)) {
    const row = value && typeof value === 'object' ? (value as { models?: unknown }) : null
    const models = [...new Set((Array.isArray(row?.models) ? row!.models : []).filter((m): m is string => typeof m === 'string' && !!m.trim()))]
    if (!models.length) continue
    let id = key
    let label = LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
    if (key.startsWith('custom:')) {
      // Un servidor propio (OmniRoute…): se usa con el nombre que tiene en `providers:` de config.yaml.
      const url = key.slice('custom:'.length)
      const name = [...cfg.named].find(([, u]) => sameUrl(u, url))?.[0] ?? (cfg.model && sameUrl(cfg.model.baseUrl, url) ? cfg.model.provider : '')
      if (!name) continue
      id = name
      label = name
    }
    if (out.some((p) => p.id === id)) continue
    out.push({ id, label, models })
  }
  return out
}

function readJson(file: string): Record<string, unknown> {
  try {
    const v = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Lo que verá «/model»: el modelo con el que coordina Hermes en kywai y todos los que puede usar. */
export function hermesModelsInfo(agent: AgentConfig | undefined, home = hermesHome()): HermesModelsInfo {
  const cfgFile = join(home, 'config.yaml')
  const cfg = existsSync(cfgFile) ? parseHermesConfig(readFileSync(cfgFile, 'utf8')) : { model: null, named: new Map<string, string>() }
  const cacheFile = join(home, 'provider_models_cache.json')
  const cache = readJson(cacheFile)
  const providers = hermesProviders(cache, cfg)
  const hermesDefault = cfg.model ? { provider: cfg.model.provider, model: cfg.model.model } : null
  const fromApp = !!agent?.model
  const current = fromApp
    ? { provider: agent!.modelProvider || hermesDefault?.provider || '', model: agent!.model, fromApp: true }
    : { provider: hermesDefault?.provider ?? '', model: hermesDefault?.model ?? '', fromApp: false }
  // El proveedor actual, primero (como en la terminal).
  providers.sort((a, b) => Number(b.id === current.provider) - Number(a.id === current.provider))
  const times = Object.values(cache)
    .map((v) => (v && typeof v === 'object' ? Number((v as { at?: unknown }).at) : NaN))
    .filter((n) => Number.isFinite(n) && n > 0)
  return {
    installed: existsSync(cfgFile),
    current,
    hermesDefault,
    providers,
    updatedAt: times.length ? Math.round(Math.max(...times) * 1000) : null
  }
}

/** Etiqueta corta del modelo («claude/claude-opus-5» → «claude-opus-5»). */
export function hermesModelLabel(model: string): string {
  return model.split('/').filter(Boolean).pop() || model
}
