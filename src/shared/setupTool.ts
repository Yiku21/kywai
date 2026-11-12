import type { SetupToolId } from './types'

const BUILT_IN = new Set(['node', 'brew', 'python', 'uv', 'claude', 'codex', 'gemini', 'hermes', 'muse', 'lmstudio', 'ollama', 'colibri'])

/**
 * Comprueba el programa que pide instalar, iniciar sesión o revisar la interfaz: uno de fábrica o el de un agente
 * de catálogo (`cli:<id del agente>`). Antes solo se aceptaban los de fábrica sin Muse, y «Instalar» fallaba en
 * silencio con Muse Code, Aider y el resto del catálogo.
 */
export function parseSetupToolId(v: unknown): SetupToolId {
  if (typeof v === 'string' && (BUILT_IN.has(v) || /^cli:[A-Za-z0-9_.-]{1,64}$/.test(v))) return v as SetupToolId
  throw new Error('Programa no válido')
}

/**
 * El programa de un agente que hay que instalar y en el que se inicia sesión: el de fábrica (Claude, Codex, Gemini,
 * Hermes, Muse) o el de catálogo (`cli:<id>`). Los locales (LM Studio, Ollama, Colibri) no tienen sesión: null.
 */
export function loginToolOf(a: { id: string; provider: string }): SetupToolId | null {
  if (a.provider === 'cli') return `cli:${a.id}` as SetupToolId
  if (a.provider === 'claude' || a.provider === 'codex' || a.provider === 'gemini' || a.provider === 'hermes' || a.provider === 'muse') return a.provider
  return null
}

/** Lo que necesitan los demás para instalarse va primero (Homebrew, Node.js, Python); el resto, en su orden. */
export function installOrder<T extends { id: SetupToolId }>(tools: T[]): T[] {
  const rank = (id: SetupToolId): number => (id === 'brew' ? 0 : id === 'node' || id === 'python' ? 1 : 2)
  return [...tools].sort((a, b) => rank(a.id) - rank(b.id))
}
