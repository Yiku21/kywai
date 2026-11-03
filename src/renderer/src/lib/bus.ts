// Bus de eventos para la escena 3D. El store publica aquí cada evento nuevo (ya sin duplicados)
// del modo visible, y la escena reacciona sin pasar por renders de React.
import type { CoworkEvent } from '@shared/types'

type Listener = (e: CoworkEvent) => void
const listeners = new Set<Listener>()

export const sceneBus = {
  emit(e: CoworkEvent): void {
    for (const l of listeners) l(e)
  },
  on(l: Listener): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  }
}
