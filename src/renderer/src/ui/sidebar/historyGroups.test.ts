import { describe, expect, it } from 'vitest'
import type { ConversationSummary } from '@shared/types'
import { groupByDate } from './historyGroups'

const now = new Date(2026, 10, 7, 18, 0).getTime()
const day = 86_400_000
const conv = (id: string, at: number): ConversationSummary => ({ id, projectId: 'p', title: id, createdAt: at, updatedAt: at, messageCount: 1 })

describe('historial agrupado por fecha', () => {
  it('hoy, ayer, 7 días, 30 días y luego por mes', () => {
    const groups = groupByDate(
      [conv('vieja', new Date(2026, 6, 3).getTime()), conv('hoy', now - 3600_000), conv('ayer', now - day), conv('semana', now - 4 * day), conv('mes', now - 20 * day)],
      now
    )
    expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday', 'week', 'month', 'm-2026-6'])
    expect(groups[4].label).toMatch(/^J/)
    expect(groups.flatMap((g) => g.items.map((c) => c.id))).toEqual(['hoy', 'ayer', 'semana', 'mes', 'vieja'])
  })
})
