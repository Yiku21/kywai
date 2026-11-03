// Instrucciones del repositorio para todos los CLI. Cada uno lee de forma nativa solo su archivo (Claude, CLAUDE.md;
// Codex y otros, AGENTS.md; Gemini, GEMINI.md), así que un proyecto con AGENTS.md dejaba a Claude sin esas reglas y
// uno con CLAUDE.md dejaba sin ellas a Codex y Gemini. AI Cowork añade al encargo los que el CLI no lee por sí mismo.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentConfig } from '@shared/types'

const FILES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'] as const
const MAX_CHARS = 6000

/** Qué archivo lee ya cada CLI por su cuenta (no se repite en el encargo). */
const NATIVE: Partial<Record<AgentConfig['provider'], (typeof FILES)[number]>> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md'
}

const cache = new Map<string, { mtime: number; text: string }>()

function read(file: string): string {
  try {
    const st = statSync(file)
    if (!st.isFile()) return ''
    const hit = cache.get(file)
    if (hit && hit.mtime === st.mtimeMs) return hit.text
    const text = readFileSync(file, 'utf8').trim()
    cache.set(file, { mtime: st.mtimeMs, text })
    return text
  } catch {
    return ''
  }
}

/**
 * Secciones «## Instrucciones del repositorio (X)» con los archivos que este proveedor no lee solo. Si dos
 * archivos dicen lo mismo (CLAUDE.md que solo importa @AGENTS.md, o copias), se pone una vez.
 */
export function repoInstructionLines(root: string, provider: AgentConfig['provider'] | null): string[] {
  const native = provider ? NATIVE[provider] : undefined
  const nativeText = native ? read(join(root, native)) : ''
  const seen = new Set<string>(nativeText ? [nativeText] : [])
  const out: string[] = []
  for (const f of FILES) {
    if (f === native) continue
    const text = read(join(root, f))
    // «@AGENTS.md» (lo que suele llevar un CLAUDE.md que solo apunta al otro) no aporta nada.
    if (!text || seen.has(text) || /^(@\S+\s*)+$/.test(text)) continue
    seen.add(text)
    out.push('', `## Instrucciones del repositorio (${f})`, text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…(recortado: el archivo completo está en ${f})` : text)
  }
  return out
}
