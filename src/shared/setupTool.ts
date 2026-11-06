import type { SetupToolId } from './types'

const BUILT_IN = new Set(['node', 'brew', 'python', 'claude', 'codex', 'gemini', 'hermes', 'muse', 'lmstudio', 'ollama'])

/**
 * Comprueba el programa que pide instalar, iniciar sesión o revisar la interfaz: uno de fábrica o el de un agente
 * de catálogo (`cli:<id del agente>`). Antes solo se aceptaban los de fábrica sin Muse, y «Instalar» fallaba en
 * silencio con Muse Code, Aider y el resto del catálogo.
 */
export function parseSetupToolId(v: unknown): SetupToolId {
  if (typeof v === 'string' && (BUILT_IN.has(v) || /^cli:[A-Za-z0-9_.-]{1,64}$/.test(v))) return v as SetupToolId
  throw new Error('Programa no válido')
}
