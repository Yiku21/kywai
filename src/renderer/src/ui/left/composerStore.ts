import { create } from 'zustand'

/** Borrador del compositor: sobrevive a cambios de pestaña y lo pueden rellenar otras piezas
 *  (ejemplos del estado vacío, arrastrar y soltar). */
interface ComposerState {
  text: string
  /** Rutas absolutas pendientes de adjuntar. */
  files: string[]
  focusNonce: number
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
  setText: (text) => set({ text }),
  addFiles: (paths) =>
    set((s) => {
      const next = [...s.files]
      for (const p of paths) if (p && !next.includes(p)) next.push(p)
      return next.length === s.files.length ? s : { files: next }
    }),
  removeFile: (path) => set((s) => ({ files: s.files.filter((f) => f !== path) })),
  clear: () => set({ text: '', files: [] }),
  requestFocus: () => set((s) => ({ focusNonce: s.focusNonce + 1 }))
}))
