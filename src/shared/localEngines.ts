import type { LocalEngine } from './types'

/** Los motores locales, en el orden en que se ofrecen. */
export const LOCAL_ENGINES: readonly LocalEngine[] = ['lmstudio', 'ollama', 'colibri']

/** Nombre visible de cada motor local. */
export const LOCAL_ENGINE_LABEL: Record<LocalEngine, string> = { lmstudio: 'LM Studio', ollama: 'Ollama', colibri: 'Colibri' }

/** El agente corre en un motor local de este equipo (LM Studio, Ollama o Colibri). */
export function isLocalEngine(provider: unknown): provider is LocalEngine {
  return provider === 'ollama' || provider === 'lmstudio' || provider === 'colibri'
}

/**
 * Deja una dirección de servidor compatible con OpenAI como «http://host:puerto» (sin «/v1» ni barra final), o null
 * si no vale. Sin esquema se supone http.
 */
export function cleanLocalUrl(raw: string): string | null {
  let v = raw.trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return null
  }
  if (u.username || u.password || u.search || u.hash) return null
  const path = u.pathname.replace(/\/+$/, '').replace(/\/v1$/, '')
  if (path) return null
  return `${u.protocol}//${u.host}`
}
