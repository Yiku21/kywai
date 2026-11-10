import type { SkillCatalogItem } from '@shared/extensions'
import type { ChatMessage, SkillSuggestion } from '@shared/types'

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Las habilidades de skills.sh que merece la pena sugerir: sin las que ya tienes (por nombre), sin las que ya
 * te propuso o descartaste en este proyecto, primero las de fuentes de confianza y luego las más instaladas.
 * Solo las que alguien usa de verdad (al menos `minInstalls`), como mucho `max`.
 */
export function pickSkillSuggestions(
  items: SkillCatalogItem[],
  installed: string[],
  seen: Set<string>,
  max = 3,
  minInstalls = 50
): SkillSuggestion[] {
  const have = new Set(installed.map(fold))
  const out: SkillSuggestion[] = []
  const sorted = [...items].sort((a, b) => Number(b.verified) - Number(a.verified) || b.installs - a.installs)
  for (const it of sorted) {
    if (out.length >= max) break
    const key = `${it.source}/${it.skillId}`.toLowerCase()
    if (seen.has(key) || have.has(fold(it.skillId)) || have.has(fold(it.name))) continue
    if (!it.verified && it.installs < minInstalls) continue
    seen.add(key)
    out.push({ source: it.source, skillId: it.skillId, name: it.name, installs: it.installs, verified: it.verified })
  }
  return out
}

/** Habilidades (dueño/repo/id) y búsquedas que ya salieron en tarjetas de este proyecto: no se repiten. */
export function proposedBefore(messages: ChatMessage[]): { keys: Set<string>; queries: Set<string> } {
  const keys = new Set<string>()
  const queries = new Set<string>()
  for (const m of messages) {
    const p = m.skillProposal
    if (!p) continue
    queries.add(fold(p.query))
    for (const it of p.items) keys.add(`${it.source}/${it.skillId}`.toLowerCase())
  }
  return { keys, queries }
}

export const skillQueryKey = fold
