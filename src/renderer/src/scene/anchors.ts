import * as THREE from 'three'
import { create } from 'zustand'

/**
 * Etiquetas HTML ancladas a objetos 3D. La escena registra el objeto (posición) y la capa HTML
 * registra el elemento; un único proyector actualiza las posiciones cada fotograma.
 */
export interface Anchor {
  obj: THREE.Object3D | null
  el: HTMLElement | null
  opacity: number
}

export const anchors = new Map<string, Anchor>()

function get(id: string): Anchor {
  let a = anchors.get(id)
  if (!a) {
    a = { obj: null, el: null, opacity: 1 }
    anchors.set(id, a)
  }
  return a
}

export function setAnchorObject(id: string, obj: THREE.Object3D | null): void {
  const a = get(id)
  a.obj = obj
  if (!obj && !a.el) anchors.delete(id)
}

export function setAnchorElement(id: string, el: HTMLElement | null): void {
  const a = get(id)
  a.el = el
  if (!el && !a.obj) anchors.delete(id)
}

export function setAnchorOpacity(id: string, v: number): void {
  const a = anchors.get(id)
  if (a) a.opacity = v
}

/** Robot bajo el cursor (para resaltar su etiqueta). */
export const useSceneHover = create<{ agentId: string | null; set(id: string | null): void }>((set) => ({
  agentId: null,
  set: (agentId) => set({ agentId })
}))
