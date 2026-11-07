import type { ConversationSummary } from '@shared/types'
import { locale, t } from '@/lib/i18n'

export interface HistoryGroup {
  key: string
  label: string
  items: ConversationSummary[]
}

/**
 * Agrupa las conversaciones (ya ordenadas de la más reciente a la más antigua) por cuándo se habló por última vez:
 * Hoy, Ayer, Últimos 7 días, Últimos 30 días y, las de antes, por mes («octubre de 2026»).
 */
export function groupByDate(list: ConversationSummary[], now = Date.now()): HistoryGroup[] {
  const d = new Date(now)
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const day = 86_400_000
  const groups: HistoryGroup[] = []
  const add = (key: string, label: string, c: ConversationSummary): void => {
    let g = groups.find((x) => x.key === key)
    if (!g) groups.push((g = { key, label, items: [] }))
    g.items.push(c)
  }
  for (const c of [...list].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const at = c.updatedAt
    if (at >= today) add('today', t('Hoy'), c)
    else if (at >= today - day) add('yesterday', t('Ayer'), c)
    else if (at >= today - 7 * day) add('week', t('Últimos 7 días'), c)
    else if (at >= today - 30 * day) add('month', t('Últimos 30 días'), c)
    else {
      const m = new Date(at)
      const label = m.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })
      add(`m-${m.getFullYear()}-${m.getMonth()}`, label.charAt(0).toUpperCase() + label.slice(1), c)
    }
  }
  return groups
}
