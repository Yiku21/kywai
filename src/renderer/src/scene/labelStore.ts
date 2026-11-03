import { create } from 'zustand'

/** Texto temporal de la etiqueta de un robot ("Enviando…", "Recibiendo…", "Completado"). */
export interface LabelOverride {
  text: string
  tone: 'send' | 'receive' | 'done'
  until: number
}

interface LabelState {
  map: Record<string, LabelOverride>
  set(agentId: string, o: Omit<LabelOverride, 'until'>, ms: number): void
  clearAll(): void
}

const timers = new Map<string, number>()

export const useLabelOverrides = create<LabelState>((set) => ({
  map: {},
  set(agentId, o, ms) {
    const until = Date.now() + ms
    set((s) => ({ map: { ...s.map, [agentId]: { ...o, until } } }))
    const prev = timers.get(agentId)
    if (prev) window.clearTimeout(prev)
    timers.set(
      agentId,
      window.setTimeout(() => {
        timers.delete(agentId)
        set((s) => {
          if (!s.map[agentId] || s.map[agentId].until > Date.now() + 5) return s
          const map = { ...s.map }
          delete map[agentId]
          return { map }
        })
      }, ms)
    )
  },
  clearAll() {
    for (const t of timers.values()) window.clearTimeout(t)
    timers.clear()
    set({ map: {} })
  }
}))
