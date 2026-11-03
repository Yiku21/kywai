import { create } from 'zustand'
import type * as THREE from 'three'
import type { Transfer } from '@shared/types'

export interface Trace {
  stationId: string
  geo: THREE.TubeGeometry
  mat: THREE.ShaderMaterial
  /** Transferencias activas que usan esta conexión. */
  users: number
  color: THREE.Color
  dir: number
}

export interface PacketSpec {
  id: string
  transfer: Transfer
  curve: THREE.Curve<THREE.Vector3>
  duration: number
  color: THREE.Color
  colorHex: string
  arc: { geo: THREE.TubeGeometry; len: number } | null
  trace: Trace | null
  toAgent: string | null
  toCore: boolean
  /** Estado de la etiqueta HTML. */
  shown: boolean
  arrived: boolean
}

interface PacketState {
  list: PacketSpec[]
  add(p: PacketSpec): void
  patch(id: string, p: Partial<Pick<PacketSpec, 'shown' | 'arrived'>>): void
  remove(id: string): void
  clear(): void
}

/** Paquetes en tránsito: los usa la escena (3D) y la capa de etiquetas (HTML). */
export const usePackets = create<PacketState>((set) => ({
  list: [],
  add: (p) => set((s) => ({ list: [...s.list, p] })),
  patch: (id, p) => set((s) => ({ list: s.list.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
  remove: (id) => set((s) => ({ list: s.list.filter((x) => x.id !== id) })),
  clear: () => set({ list: [] })
}))
