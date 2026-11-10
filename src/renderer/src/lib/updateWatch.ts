// Aviso de actualización pendiente: el botón ⚙ brilla en amarillo cuando hay una versión nueva de kywai.
// Lo que sabe el motor (la app de este equipo o el servidor al que se conecta un cliente o el navegador) llega con
// updatePending() al abrir y con el evento update.pending. En el cliente de escritorio se mira además si hay una
// versión nueva de la app instalada en este equipo (la que se actualiza con «Actualizar este equipo…»).
import type { PendingUpdate, UpdateStatus } from '@shared/types'
import { useCowork } from '@/store/cowork'
import { api, clientActions } from './api'

/** Cada cuánto se vuelve a preguntar al motor (él no consulta GitHub al responder: es barato). */
const ASK_EVERY_MS = 30 * 60_000
/** El cliente de escritorio pregunta por su propia versión al poco de abrir y luego cada 6 h. */
const DEVICE_FIRST_MS = 60_000
const DEVICE_EVERY_MS = 6 * 60 * 60_000

/** Lo que dice una búsqueda hecha a mano (⚙ → Buscar actualizaciones) también enciende o apaga el aviso. */
export function pendingFromStatus(s: UpdateStatus): PendingUpdate | null {
  const r = s.release
  if (r) {
    if (r.state === 'error') return null
    return r.state === 'current' ? { pending: false } : { pending: true, version: r.latest }
  }
  if (!s.canUpdate && s.localChanges === undefined) return null // no se pudo consultar GitHub
  return s.commits.length ? { pending: true, commits: s.commits.length } : { pending: false }
}

/** true si el botón ⚙ debe brillar. */
export function hasPendingUpdate(st: { updatePending: PendingUpdate | null; deviceUpdate: string | null }): boolean {
  return !!st.updatePending?.pending || !!st.deviceUpdate
}

/** Empieza a vigilar. Devuelve cómo pararlo. */
export function startUpdateWatch(): () => void {
  const timers: number[] = []
  const a = api
  if (a?.updatePending) {
    const ask = (): void => {
      a.updatePending().then(
        (p) => useCowork.setState({ updatePending: p }),
        () => undefined // un servidor anterior a esto no lo sabe: sin aviso
      )
    }
    ask()
    timers.push(window.setInterval(ask, ASK_EVERY_MS))
  }
  const client = clientActions()
  if (client?.checkUpdate) {
    const check = client.checkUpdate
    const askDevice = (): void => {
      check().then(
        (r) => useCowork.setState({ deviceUpdate: r?.state === 'available' ? (r.latest ?? '?') : null }),
        () => undefined
      )
    }
    timers.push(window.setTimeout(askDevice, DEVICE_FIRST_MS))
    timers.push(window.setInterval(askDevice, DEVICE_EVERY_MS))
  }
  return () => timers.forEach((id) => window.clearInterval(id))
}
