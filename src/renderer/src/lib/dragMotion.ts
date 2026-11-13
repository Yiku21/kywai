// Lo que se ve al arrastrar: la tarjeta que acompaña al ratón (en vez de la copia borrosa del navegador) y, al soltar,
// las filas que se recolocan deslizándose hasta su sitio nuevo (técnica FLIP: se mide antes, se mide después y se
// anima la diferencia) mientras la fila soltada da un destello.

import { calm, reducedMotion, SPRING } from './motion'

/**
 * Pone como imagen del arrastre una tarjeta con el icono de la fila y su nombre, un poco inclinada (como algo que
 * llevas cogido). Hay que llamarla dentro de dragstart. Si algo falla, queda la imagen normal del navegador.
 */
export function setDragCard(e: { dataTransfer: DataTransfer | null; currentTarget: Element }, title: string): void {
  const dt = e.dataTransfer
  if (!dt || typeof dt.setDragImage !== 'function' || typeof document === 'undefined') return
  try {
    const cs = getComputedStyle(document.documentElement)
    const v = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback
    const wrap = document.createElement('div')
    // Fuera de la vista pero pintado (el navegador le hace la foto en este momento).
    wrap.style.cssText = 'position:fixed;left:-1000px;top:-1000px;padding:10px 14px 16px 10px;pointer-events:none;z-index:-1'
    const card = document.createElement('div')
    card.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:8px',
      'max-width:240px',
      'padding:8px 12px',
      'border-radius:10px',
      `background:${v('--bg-elevated', '#162033')}`,
      `border:1.5px solid ${v('--cyan', '#4fc3ff')}`,
      `color:${v('--text-1', '#e8eefc')}`,
      'font:600 13px/1.2 Inter,system-ui,sans-serif',
      'box-shadow:0 8px 18px rgba(0,0,0,.45)',
      calm() ? '' : 'transform:rotate(-2.5deg)'
    ].join(';')
    const icon = e.currentTarget.querySelector('svg')?.cloneNode(true) as SVGElement | undefined
    if (icon) {
      icon.setAttribute('width', '15')
      icon.setAttribute('height', '15')
      icon.style.cssText = `flex:none;color:${v('--cyan', '#4fc3ff')}`
      card.appendChild(icon)
    }
    const label = document.createElement('span')
    label.textContent = title
    label.style.cssText = 'overflow:hidden;white-space:nowrap;text-overflow:ellipsis'
    card.appendChild(label)
    wrap.appendChild(card)
    document.body.appendChild(wrap)
    dt.setDragImage(wrap, 22, 24)
    window.setTimeout(() => wrap.remove(), 0)
  } catch {
    /* imagen normal del navegador */
  }
}

/** Dónde está ahora cada fila con nombre (`attr`) dentro de `root`. */
export function measureRows(root: ParentNode, attr = 'data-slot'): Map<string, DOMRect> {
  const out = new Map<string, DOMRect>()
  for (const el of root.querySelectorAll<HTMLElement>(`[${attr}]`)) out.set(el.getAttribute(attr) ?? '', el.getBoundingClientRect())
  return out
}

/** Cuánto se ha movido cada fila respecto a `before` (solo las que se han movido). Pura, para probarla. */
export function rowShifts(before: Map<string, { left: number; top: number }>, after: Map<string, { left: number; top: number }>): Map<string, { dx: number; dy: number }> {
  const out = new Map<string, { dx: number; dy: number }>()
  for (const [key, a] of after) {
    const b = before.get(key)
    if (!b) continue
    const dx = b.left - a.left
    const dy = b.top - a.top
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) out.set(key, { dx, dy })
  }
  return out
}

/**
 * Tras soltar: espera a que la lista cambie (el orden nuevo llega un momento después) y entonces desliza cada fila
 * desde donde estaba hasta su sitio con muelle; la fila cuyo nombre acaba en `landed` da un destello. Se rinde a los
 * `timeout` ms si nada cambia.
 */
export function flipRows(root: HTMLElement, opts: { attr?: string; landed?: string; timeout?: number } = {}): void {
  if (reducedMotion() || typeof requestAnimationFrame === 'undefined') return
  const attr = opts.attr ?? 'data-slot'
  const before = measureRows(root, attr)
  const scroll = root.scrollTop
  const until = performance.now() + (opts.timeout ?? 900)
  const tick = (): void => {
    if (!root.isConnected) return
    const now = measureRows(root, attr)
    const shifts = rowShifts(before, now)
    // Un desplazamiento de la lista mueve todas las filas a la vez: eso no es recolocarse.
    const changed = shifts.size > 0 && root.scrollTop === scroll
    const appeared = [...now.keys()].some((k) => !before.has(k))
    if (!changed && !appeared) {
      if (performance.now() < until) requestAnimationFrame(tick)
      return
    }
    // El destello va solo en una fila: la primera con ese nombre que se ha movido o es nueva (la misma conversación
    // puede salir también en Recientes, que no cambia).
    const rows = [...root.querySelectorAll<HTMLElement>(`[${attr}]`)]
    const named = (el: HTMLElement): string => el.getAttribute(attr) ?? ''
    const mine = opts.landed ? rows.filter((el) => named(el).endsWith(opts.landed!)) : []
    const landedRow = mine.find((el) => shifts.has(named(el)) || !before.has(named(el))) ?? mine[0]
    for (const el of rows) {
      const sh = shifts.get(named(el))
      if (sh && !calm()) {
        el.animate([{ transform: `translate(${sh.dx}px, ${sh.dy}px)` }, { transform: 'none' }], { duration: SPRING.ms, easing: SPRING.easing })
      }
    }
    landedRow?.animate(
      [
        { borderRadius: '8px', backgroundColor: 'color-mix(in srgb, var(--cyan) 26%, transparent)', boxShadow: '0 0 0 1.5px color-mix(in srgb, var(--cyan) 70%, transparent)' },
        { borderRadius: '8px', backgroundColor: 'transparent', boxShadow: '0 0 0 1.5px transparent' }
      ],
      { duration: 700, easing: 'ease-out' }
    )
  }
  requestAnimationFrame(tick)
}
