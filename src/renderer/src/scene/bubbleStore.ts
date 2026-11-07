import { create } from 'zustand'
import { lineFor, type PersonaId, type SayEvent } from './personality'

/** Bocadillo de texto junto a la cabeza de un robot. */
export interface Bubble {
  text: string
  event: SayEvent
  until: number
}

/** Lo importante (tarea, terminado, error) se dice siempre; lo demás, si no hay mucho jaleo. */
const IMPORTANT: ReadonlySet<SayEvent> = new Set(['task', 'done', 'error'])
/** Bocadillos a la vez como mucho (los importantes no cuentan para este límite). */
const MAX_CASUAL = 2
/** Segundos mínimos entre dos frases del mismo robot (las importantes, menos). */
const GAP_CASUAL = 14
const GAP_IMPORTANT = 4

interface BubbleState {
  map: Record<string, Bubble>
  /** Intenta que un robot diga algo. Devuelve si lo dijo. */
  say(agentId: string, persona: PersonaId, event: SayEvent): boolean
  clearAll(): void
}

const timers = new Map<string, number>()
const lastSaid = new Map<string, number>()

export const useBubbles = create<BubbleState>((set, get) => ({
  map: {},
  say(agentId, persona, event) {
    const now = Date.now()
    const important = IMPORTANT.has(event)
    const last = lastSaid.get(agentId) ?? 0
    // Al despertar contesta aunque acabe de decir otra cosa (p. ej. que se iba a dormir).
    const gap = event === 'wake' ? 1 : important ? GAP_IMPORTANT : GAP_CASUAL
    if (now - last < gap * 1000) return false
    if (!important) {
      const casual = Object.values(get().map).filter((b) => b.until > now && !IMPORTANT.has(b.event)).length
      if (casual >= MAX_CASUAL) return false
    }
    const text = lineFor(persona, event)
    const ms = Math.min(5200, 2400 + text.length * 55)
    lastSaid.set(agentId, now)
    set((s) => ({ map: { ...s.map, [agentId]: { text, event, until: now + ms } } }))
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
    return true
  },
  clearAll() {
    for (const t of timers.values()) window.clearTimeout(t)
    timers.clear()
    lastSaid.clear()
    set({ map: {} })
  }
}))
