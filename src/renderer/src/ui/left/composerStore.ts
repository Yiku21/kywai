import { create } from 'zustand'
import type { ChatReplyRef } from '@shared/types'

/** Borrador del compositor: sobrevive a cambios de pestaña y lo pueden rellenar otras piezas
 *  (ejemplos del estado vacío, arrastrar y soltar). */
interface ComposerState {
  text: string
  /** Rutas absolutas pendientes de adjuntar. */
  files: string[]
  focusNonce: number
  /** «Responder» pulsado bajo la respuesta de un agente: lo siguiente que envíes va a ese agente sobre esa respuesta. */
  replyTo: ChatReplyRef | null
  setReplyTo(replyTo: ChatReplyRef | null): void
  setText(text: string): void
  addFiles(paths: string[]): void
  removeFile(path: string): void
  clear(): void
  requestFocus(): void
}

export const useComposer = create<ComposerState>((set) => ({
  text: '',
  files: [],
  focusNonce: 0,
  replyTo: null,
  setReplyTo: (replyTo) => set((s) => ({ replyTo, focusNonce: replyTo ? s.focusNonce + 1 : s.focusNonce })),
  setText: (text) => set({ text }),
  addFiles: (paths) =>
    set((s) => {
      const next = [...s.files]
      for (const p of paths) if (p && !next.includes(p)) next.push(p)
      return next.length === s.files.length ? s : { files: next }
    }),
  removeFile: (path) => set((s) => ({ files: s.files.filter((f) => f !== path) })),
  clear: () => set({ text: '', files: [], replyTo: null }),
  requestFocus: () => set((s) => ({ focusNonce: s.focusNonce + 1 }))
}))
