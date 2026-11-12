import { create } from 'zustand'
import type { ChatReplyRef } from '@shared/types'

/** Borrador del compositor: sobrevive a cambios de pestaña y lo pueden rellenar otras piezas
 *  (ejemplos del estado vacío, arrastrar y soltar). */
interface ComposerState {
  text: string
  /** Rutas absolutas pendientes de adjuntar. */
  files: string[]
  /** Archivos del proyecto elegidos con «Adjuntar al mensaje» (clic derecho en Archivos o Resultados). */
  deliverables: ComposerDeliverable[]
  focusNonce: number
  /** «Responder» pulsado bajo la respuesta de un agente: lo siguiente que envíes va a ese agente sobre esa respuesta. */
  replyTo: ChatReplyRef | null
  setReplyTo(replyTo: ChatReplyRef | null): void
  setText(text: string): void
  addFiles(paths: string[]): void
  removeFile(path: string): void
  /** Lo deja puesto para el siguiente mensaje (sin repetir) y lleva el foco al cuadro de escribir. */
  addDeliverable(d: ComposerDeliverable): void
  removeDeliverable(id: string): void
  clear(): void
  requestFocus(): void
}

export interface ComposerDeliverable {
  /** Entregable del equipo (artifact) o un adjunto tuyo que ya está en el proyecto (attachment). */
  kind: 'artifact' | 'attachment'
  id: string
  name: string
  /** Proyecto del entregable: al cambiar de proyecto deja de valer. */
  projectId: string
}

export const useComposer = create<ComposerState>((set) => ({
  text: '',
  files: [],
  deliverables: [],
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
  addDeliverable: (d) =>
    set((s) => ({
      deliverables: s.deliverables.some((x) => x.id === d.id) ? s.deliverables : [...s.deliverables.filter((x) => x.projectId === d.projectId), d],
      focusNonce: s.focusNonce + 1
    })),
  removeDeliverable: (id) => set((s) => ({ deliverables: s.deliverables.filter((d) => d.id !== id) })),
  clear: () => set({ text: '', files: [], deliverables: [], replyTo: null }),
  requestFocus: () => set((s) => ({ focusNonce: s.focusNonce + 1 }))
}))
