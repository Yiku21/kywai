import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { anchors, type Anchor } from './anchors'

function shown(o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o
  while (p) {
    if (!p.visible) return false
    p = p.parent
  }
  return true
}

interface Placed {
  a: Anchor
  x: number
  y: number
  w: number
  h: number
  s: number
  dist: number
}

/** Desplazamiento vertical suavizado por etiqueta (evita saltos al separarlas). */
const offsets = new WeakMap<Anchor, number>()

/**
 * Proyecta cada ancla 3D a la pantalla y mueve su etiqueta HTML (sin renders de React).
 * Si dos etiquetas se solapan, la más lejana sube lo justo para que ambas se lean.
 */
export function LabelProjector() {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }, dt) => {
    const placed: Placed[] = []
    for (const a of anchors.values()) {
      const el = a.el
      if (!el) continue
      if (!a.obj || !shown(a.obj) || a.opacity <= 0.01) {
        el.style.visibility = 'hidden'
        continue
      }
      a.obj.getWorldPosition(v)
      const dist = v.distanceTo(camera.position)
      v.project(camera)
      if (v.z > 1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15) {
        el.style.visibility = 'hidden'
        continue
      }
      // En lienzos pequeños las etiquetas se reducen un poco más.
      const narrow = THREE.MathUtils.clamp(size.width / 760, 0.72, 1)
      const s = THREE.MathUtils.clamp(23 / dist, 0.78, 1.3) * narrow
      placed.push({
        a,
        x: (v.x * 0.5 + 0.5) * size.width,
        y: (-v.y * 0.5 + 0.5) * size.height,
        w: el.offsetWidth * s,
        h: el.offsetHeight * s,
        s,
        dist
      })
    }

    // Resolución de solapes: las más cercanas mandan; las lejanas se desplazan hacia arriba.
    placed.sort((p, q) => p.dist - q.dist)
    const targets = new Map<Anchor, number>()
    const rects: { x0: number; x1: number; y0: number; y1: number }[] = []
    for (const p of placed) {
      let lift = 0
      for (let iter = 0; iter < 6; iter++) {
        const x0 = p.x - p.w / 2
        const x1 = p.x + p.w / 2
        const y1 = p.y - lift
        const y0 = y1 - p.h
        const hit = rects.find((r) => x0 < r.x1 - 2 && x1 > r.x0 + 2 && y0 < r.y1 - 2 && y1 > r.y0 + 2)
        if (!hit) break
        lift += y1 - hit.y0 + 4
      }
      targets.set(p.a, lift)
      rects.push({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - lift - p.h, y1: p.y - lift })
    }

    const k = 1 - Math.exp(-dt * 10)
    for (const p of placed) {
      const prev = offsets.get(p.a) ?? 0
      const off = prev + ((targets.get(p.a) ?? 0) - prev) * k
      offsets.set(p.a, off)
      const el = p.a.el!
      // No dejar que la etiqueta se salga por arriba ni por los lados.
      const y = Math.max(p.h + 6, p.y - off)
      const x = Math.min(size.width - p.w / 2 - 6, Math.max(p.w / 2 + 6, p.x))
      el.style.visibility = 'visible'
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${p.s.toFixed(3)})`
      el.style.opacity = p.a.opacity >= 0.99 ? '' : p.a.opacity.toFixed(2)
      el.style.zIndex = String(Math.max(1, Math.round(500 - p.dist * 8)))
    }
  })
  return null
}
