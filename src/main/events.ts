import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { AgentId, AgentRuntime, CoworkEvent, MobileOnlyEvent } from '@shared/types'

/** CoworkEvent without the fields the emitter fills in. */
export type EventInput = CoworkEvent extends infer E ? (E extends CoworkEvent ? Omit<E, 'id' | 'ts' | 'demo'> : never) : never

let win: BrowserWindow | null = null
const taps = new Set<(e: CoworkEvent) => void>()

/** Observe every emitted event (logging / offline checks). Returns an unsubscribe. */
export function tapEvents(fn: (e: CoworkEvent) => void): () => void {
  taps.add(fn)
  return () => taps.delete(fn)
}

export function setEventWindow(w: BrowserWindow | null): void {
  win = w
}

export function emit(ev: EventInput): CoworkEvent {
  const full = { ...ev, id: randomUUID(), ts: Date.now() } as CoworkEvent
  for (const fn of taps) {
    try {
      fn(full)
    } catch {
      /* ignore */
    }
  }
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    try {
      win.webContents.send('cowork:event', full)
    } catch (e) {
      console.error('[cowork] send failed', e)
    }
  }
  return full
}

const mobileTaps = new Set<(e: MobileOnlyEvent) => void>()

/** Observa los eventos que solo van a la API móvil. Devuelve la función para dejar de observarlos. */
export function tapMobileEvents(fn: (e: MobileOnlyEvent) => void): () => void {
  mobileTaps.add(fn)
  return () => mobileTaps.delete(fn)
}

/** Como emit(), pero sin llegar a la ventana ni a la web (todavía no conocen estos tipos). */
export function emitMobileOnly(ev: Omit<MobileOnlyEvent, 'id' | 'ts' | 'demo'>): MobileOnlyEvent {
  const full: MobileOnlyEvent = { ...ev, id: randomUUID(), ts: Date.now() }
  for (const fn of mobileTaps) {
    try {
      fn(full)
    } catch {
      /* ignore */
    }
  }
  return full
}

// ---------- Runtimes ----------

const runtimes = new Map<AgentId, AgentRuntime>()
const lastEmit = new Map<AgentId, number>()
const pending = new Map<AgentId, NodeJS.Timeout>()
const MIN_GAP_MS = 500 // ≤ 2 updates/s per agent for activity text

export function getRuntime(agentId: AgentId): AgentRuntime {
  let rt = runtimes.get(agentId)
  if (!rt) {
    rt = { agentId, activity: 'idle', location: 'station' }
    runtimes.set(agentId, rt)
  }
  return rt
}

export function hasRuntime(agentId: AgentId): boolean {
  return runtimes.has(agentId)
}

export function allRuntimes(): AgentRuntime[] {
  return [...runtimes.values()].map((r) => ({ ...r }))
}

export function deleteRuntime(agentId: AgentId): void {
  runtimes.delete(agentId)
  lastEmit.delete(agentId)
  const t = pending.get(agentId)
  if (t) clearTimeout(t)
  pending.delete(agentId)
}

function flush(agentId: AgentId): void {
  const t = pending.get(agentId)
  if (t) clearTimeout(t)
  pending.delete(agentId)
  const rt = runtimes.get(agentId)
  if (!rt) return
  lastEmit.set(agentId, Date.now())
  emit({ kind: 'agent.runtime', runtime: { ...rt } })
}

/**
 * Patch an agent runtime and emit `agent.runtime`. Changes of activity/task/location/etc. are sent
 * immediately; changes that only touch lastActivity/context are throttled (trailing emit).
 * Keys present with value `undefined` clear the field.
 */
export function setRuntime(agentId: AgentId, patch: Partial<Omit<AgentRuntime, 'agentId'>>): AgentRuntime {
  const rt = getRuntime(agentId)
  let meaningful = false
  let changed = false
  for (const [k, v] of Object.entries(patch) as [keyof AgentRuntime, unknown][]) {
    const prev = rt[k]
    const same = k === 'context' ? JSON.stringify(prev) === JSON.stringify(v) : prev === v
    if (same) continue
    changed = true
    if (v === undefined) delete (rt as unknown as Record<string, unknown>)[k]
    else (rt as unknown as Record<string, unknown>)[k] = v
    if (k !== 'lastActivity' && k !== 'lastActivityAt' && k !== 'context') meaningful = true
  }
  if (!changed) return rt
  if ('lastActivity' in patch && patch.lastActivity !== undefined && !('lastActivityAt' in patch)) {
    rt.lastActivityAt = Date.now()
  }
  if (meaningful) {
    flush(agentId)
    return rt
  }
  const since = Date.now() - (lastEmit.get(agentId) ?? 0)
  if (since >= MIN_GAP_MS && !pending.has(agentId)) {
    flush(agentId)
  } else if (!pending.has(agentId)) {
    pending.set(
      agentId,
      setTimeout(() => flush(agentId), Math.max(0, MIN_GAP_MS - since))
    )
  }
  return rt
}
