import { create } from 'zustand'
import type { InboxItem } from '@shared/types'
import { needsYou } from '@shared/inbox'
import { useCowork } from '@/store/cowork'
import { playSfx } from './audio'

/**
 * Aviso de «Te necesita»: cuando llega algo nuevo que espera tu decisión, la campanita de la barra palpita con un
 * brillo suave, suena su propio timbre (con «Música y efectos») y el coordinador te llama en el espacio 3D con una
 * campanita sobre la cabeza. Todo se calma al abrir «Te necesita».
 */
const CALL_KEY = 'aicowork.agentes.avisoEn3d'

function readCallIn3d(): boolean {
  try {
    return localStorage.getItem(CALL_KEY) !== '0'
  } catch {
    return true
  }
}

interface InboxAlertState {
  /**
   * El coordinador avisa en el espacio 3D (campanita sobre la cabeza, saludo, bocadillo y voz). Se apaga en
   * Ajustes → Agentes; la campanita de la barra y su timbre siguen igual. Por dispositivo.
   */
  callIn3d: boolean
  setCallIn3d(on: boolean): void
  /** Hay avisos que aún no has mirado: la campanita palpita (en la barra y sobre el coordinador). */
  ringing: boolean
  /** Cuándo llegó el último aviso nuevo (ms): el coordinador saluda y te llama. 0 si nunca. */
  calledAt: number
  /** Sube cada vez que algo pide abrir «Te necesita» (por ejemplo, un clic en el coordinador que te llama). */
  openSeq: number
  /** Has abierto «Te necesita»: deja de palpitar. */
  markSeen(): void
  /** Abre la bandeja «Te necesita» desde fuera del botón. */
  requestOpen(): void
}

export const useInboxAlert = create<InboxAlertState>((set) => ({
  callIn3d: readCallIn3d(),
  setCallIn3d(on) {
    try {
      localStorage.setItem(CALL_KEY, on ? '1' : '0')
    } catch {
      /* sin almacenamiento: vale para esta sesión */
    }
    set({ callIn3d: on })
  },
  ringing: false,
  calledAt: 0,
  openSeq: 0,
  markSeen: () => set({ ringing: false }),
  requestOpen: () => set((s) => ({ openSeq: s.openSeq + 1, ringing: false }))
}))

/** Un aviso creado hace más de esto no suena (lo viejo que llega al abrir la app o al reconectar solo palpita). */
export const FRESH_MS = 5 * 60_000

/**
 * Qué cambia con una lista nueva de la bandeja. [known]: ids que ya se habían visto (se actualiza aquí).
 * `pending`: hay algo que espera tu decisión y no estaba antes; `ring`: además es reciente, así que suena y llama.
 */
export function inboxArrivals(known: Set<string>, items: InboxItem[], now: number): { pending: boolean; ring: boolean } {
  let pending = false
  let ring = false
  for (const item of items) {
    if (!needsYou(item) || item.resolvedAt || known.has(item.id)) continue
    known.add(item.id)
    pending = true
    if (now - item.createdAt < FRESH_MS) ring = true
  }
  return { pending, ring }
}

let started = false

/** Escucha la bandeja del store (una vez, al arrancar la interfaz). */
export function startInboxAlert(): () => void {
  if (started) return () => {}
  started = true
  const known = new Set<string>()
  let prev = useCowork.getState().inbox
  const check = (items: InboxItem[]) => {
    const { pending, ring } = inboxArrivals(known, items, Date.now())
    const left = items.some((i) => needsYou(i) && !i.resolvedAt)
    if (ring) {
      playSfx('needsYou')
      useInboxAlert.setState({ ringing: true, calledAt: Date.now() })
    } else if (pending) useInboxAlert.setState({ ringing: true })
    else if (!left && useInboxAlert.getState().ringing) useInboxAlert.setState({ ringing: false })
  }
  check(prev)
  const stop = useCowork.subscribe((st) => {
    if (st.mode !== 'live' || st.inbox === prev) return
    prev = st.inbox
    check(prev)
  })
  return () => {
    stop()
    started = false
  }
}
