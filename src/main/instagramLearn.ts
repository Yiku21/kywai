// «/instagram resultados»: los números reales de los últimos reels de la cuenta de kywai (vistas, alcance, guardados,
// envíos, tiempo medio de visionado…) en instagram/resultados.md. Con 3 reels o más, los guiones de «/video» y los
// textos de «/instagram» lo leen: copian la forma de los ganchos que funcionaron y evitan lo que no.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { graphGet } from './instagram'

/** Reels con números para que valga la pena aprender de ellos. */
export const MIN_REELS_TO_LEARN = 3

export interface ReelResult {
  id: string
  date: string
  permalink: string
  caption: string
  views: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  saved: number | null
  shares: number | null
  /** Tiempo medio de visionado, en segundos. */
  avgWatch: number | null
}

/** Dónde se guardan (junto a las demás cosas del Instagram de kywai). */
export const resultsFile = (workspaceRoot: string): string => join(workspaceRoot, 'instagram', 'resultados.md')

interface Media {
  id: string
  caption?: string
  media_product_type?: string
  timestamp?: string
  permalink?: string
  like_count?: number
  comments_count?: number
}

/** Los últimos reels (como mucho `limit`) con sus estadísticas. Una métrica que la API no dé queda en null. */
export async function reelResults(token: string, userId: string, opts: { limit?: number; signal?: AbortSignal } = {}): Promise<ReelResult[]> {
  const media = await graphGet<{ data?: Media[] }>(token, `${userId}/media`, { fields: 'id,caption,media_product_type,timestamp,permalink,like_count,comments_count', limit: '40' }, opts.signal)
  const reels = (media.data ?? []).filter((m) => m.media_product_type === 'REELS').slice(0, opts.limit ?? 12)
  const out: ReelResult[] = []
  for (const m of reels) {
    const ins = await graphGet<{ data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
      token,
      `${m.id}/insights`,
      { metric: 'views,reach,likes,comments,saved,shares,ig_reels_avg_watch_time' },
      opts.signal
    ).catch(() => null)
    const v = (n: string): number | null => {
      const x = ins?.data?.find((d) => d.name === n)
      const val = x?.total_value?.value ?? x?.values?.[0]?.value
      return typeof val === 'number' ? val : null
    }
    const avg = v('ig_reels_avg_watch_time')
    out.push({
      id: m.id,
      date: m.timestamp?.slice(0, 10) ?? '',
      permalink: m.permalink ?? '',
      caption: (m.caption ?? '').trim(),
      views: v('views'),
      reach: v('reach'),
      likes: v('likes') ?? m.like_count ?? null,
      comments: v('comments') ?? m.comments_count ?? null,
      saved: v('saved'),
      shares: v('shares'),
      // La API da milisegundos.
      avgWatch: avg == null ? null : Math.round(avg / 100) / 10
    })
  }
  return out
}

/** Lo que engancha de un reel: la primera línea de su texto (lo que se ve antes de «más»). */
export const hookOf = (caption: string): string => caption.split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 140) ?? ''

/** Cuánto gustó: vistas, y a igualdad, guardados y envíos (lo que más empuja el algoritmo). */
const score = (r: ReelResult): number => (r.views ?? r.reach ?? 0) + 20 * ((r.saved ?? 0) + (r.shares ?? 0))

const n = (x: number | null): string => (x == null ? '?' : String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'))

export function resultsMarkdown(rows: ReelResult[], username: string, now = new Date()): string {
  const ranked = [...rows].sort((a, b) => score(b) - score(a))
  const top = ranked.slice(0, 3)
  const bottom = ranked.length >= 6 ? ranked.slice(-3).reverse() : []
  const line = (r: ReelResult): string => `- «${hookOf(r.caption) || '(sin texto)'}» · ${n(r.views)} vistas · ${n(r.saved)} guardados · ${n(r.shares)} envíos${r.avgWatch != null ? ` · ${r.avgWatch} s de media` : ''}`
  return [
    `# Resultados de los reels de @${username || '?'}`,
    '',
    `Actualizado el ${now.toISOString().slice(0, 10)} con la API oficial de Instagram (${rows.length} reels). Se actualiza con «/instagram resultados».`,
    '',
    '## Los que mejor funcionaron',
    top.length ? top.map(line).join('\n') : '(todavía ninguno)',
    ...(bottom.length ? ['', '## Los que peor funcionaron', bottom.map(line).join('\n')] : []),
    '',
    '## Todos (del más nuevo al más antiguo)',
    '',
    '| Fecha | Gancho | Vistas | Alcance | Me gusta | Comentarios | Guardados | Envíos | Visionado medio | Enlace |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.date} | ${(hookOf(r.caption) || '').replace(/\|/g, '/')} | ${n(r.views)} | ${n(r.reach)} | ${n(r.likes)} | ${n(r.comments)} | ${n(r.saved)} | ${n(r.shares)} | ${r.avgWatch == null ? '?' : `${r.avgWatch} s`} | ${r.permalink} |`)
  ].join('\n')
}

/** Guarda el resumen y devuelve el mensaje corto para el chat. */
export function saveResults(file: string, rows: ReelResult[], username: string, now = new Date()): string {
  const md = resultsMarkdown(rows, username, now)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, md, 'utf8')
  // Sin el título ni la fecha ni la tabla: los mejores y los peores.
  return md.split('\n## Todos')[0].split('\n').slice(4).join('\n').trim()
}

/** Cuántos reels tiene el resumen guardado (0 si no hay). */
export function savedReels(file: string): number {
  if (!existsSync(file)) return 0
  try {
    return readFileSync(file, 'utf8').split('\n').filter((l) => /^\| \d{4}-\d{2}-\d{2} \|/.test(l)).length
  } catch {
    return 0
  }
}

/** Las líneas que se añaden a los encargos de guion y de texto cuando ya hay de qué aprender. */
export function learningLines(file: string): string[] {
  const count = savedReels(file)
  if (count < MIN_REELS_TO_LEARN) return []
  return [
    '',
    `Lo que de verdad funcionó en el Instagram de kywai (números reales de ${count} reels): ${file}. Léelo antes de escribir: copia la FORMA de los ganchos de los que mejor funcionaron (no el texto) y evita lo que tienen en común los que peor.`
  ]
}
