// Respuesta al tacto en toda la interfaz, sin tocar cada componente:
//  · Onda: al pulsar un botón, pestaña, fila u opción de menú, sale una onda desde el punto exacto donde has pulsado
//    y se queda dentro de su forma.
//  · Resalte que se desliza: en las listas marcadas con data-glide (pestañas, barra lateral, menús, Ajustes), el fondo
//    de «estás encima» es una sola pieza que viaja de una fila a otra con muelle, en vez de encenderse y apagarse.
// En modo tranquilo («Reducir efectos») no hay onda y el resalte salta sin viajar; con «Reducir movimiento», tampoco.

import { calm, reducedMotion } from './motion'

const RIPPLE_TARGETS = 'button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="option"], [role="switch"], [data-ripple]'
const RIPPLE_MS = 520

/** Radio que necesita la onda para cubrir la pieza desde (x, y): la distancia a su esquina más lejana. */
export function rippleRadius(x: number, y: number, width: number, height: number): number {
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y))
}

function ripple(e: PointerEvent): void {
  if (e.button !== 0 || !e.isTrusted || calm()) return
  const el = e.target instanceof Element ? e.target.closest<HTMLElement>(RIPPLE_TARGETS) : null
  if (!el || el.matches(':disabled, [aria-disabled="true"], [data-no-ripple]') || el.closest('[data-no-ripple]')) return
  const r = el.getBoundingClientRect()
  // Piezas enormes (zonas enteras que también son botones) no llevan onda.
  if (r.width < 4 || r.height < 4 || r.width * r.height > 140_000) return
  const cs = getComputedStyle(el)
  const host = document.createElement('span')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${cs.borderRadius};overflow:hidden;pointer-events:none;z-index:2500;contain:strict`
  const x = e.clientX - r.left
  const y = e.clientY - r.top
  const radius = rippleRadius(x, y, r.width, r.height)
  const wave = document.createElement('span')
  wave.style.cssText = `position:absolute;left:${x - radius}px;top:${y - radius}px;width:${radius * 2}px;height:${radius * 2}px;border-radius:50%;background:${cs.color};will-change:transform,opacity`
  host.appendChild(wave)
  document.body.appendChild(host)
  const anim = wave.animate(
    [
      { transform: 'scale(0.08)', opacity: 0.2 },
      { transform: 'scale(1)', opacity: 0 }
    ],
    { duration: RIPPLE_MS, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'forwards' }
  )
  const done = (): void => host.remove()
  anim.onfinish = done
  anim.oncancel = done
  window.setTimeout(done, RIPPLE_MS + 100)
}

const GLIDE_ITEMS = 'button, a[href], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="option"]'

interface Glide {
  pill: HTMLElement
  shown: boolean
}

const glides = new WeakMap<HTMLElement, Glide>()

function pillFor(box: HTMLElement): Glide {
  let g = glides.get(box)
  if (g && g.pill.isConnected) return g
  const pill = document.createElement('span')
  pill.setAttribute('aria-hidden', 'true')
  pill.dataset.glidePill = ''
  box.appendChild(pill)
  g = { pill, shown: false }
  glides.set(box, g)
  return g
}

function hide(box: HTMLElement): void {
  const g = glides.get(box)
  if (!g || !g.shown) return
  g.shown = false
  g.pill.style.opacity = '0'
}

function glide(e: PointerEvent): void {
  const target = e.target instanceof Element ? e.target : null
  const box = target?.closest<HTMLElement>('[data-glide]')
  if (!box || !target) return
  // El elemento de más dentro que cuenta como fila (los botoncitos de dentro de una fila no).
  let item = target.closest<HTMLElement>(GLIDE_ITEMS)
  const own = box.dataset.glide
  if (own) item = target.closest<HTMLElement>(own)
  // Los botoncitos de dentro de una fila (data-no-glide) no se llevan el resalte: se queda en su fila.
  if (item?.closest('[data-no-glide]')) return
  if (!item || !box.contains(item) || item === box || item.matches(':disabled, [aria-disabled="true"], [data-no-glide]')) return hide(box)
  const g = pillFor(box)
  const b = box.getBoundingClientRect()
  const r = item.getBoundingClientRect()
  const x = r.left - b.left - box.clientLeft + box.scrollLeft
  const y = r.top - b.top - box.clientTop + box.scrollTop
  const s = g.pill.style
  // La primera vez (o tras esconderse) aparece ya en su sitio; después viaja.
  s.transitionProperty = g.shown && !calm() ? 'transform, width, height, opacity' : 'opacity'
  s.transform = `translate(${x}px, ${y}px)`
  s.width = `${r.width}px`
  s.height = `${r.height}px`
  s.borderRadius = getComputedStyle(item).borderRadius
  s.opacity = '1'
  g.shown = true
}

let started = false

/** Empieza a escuchar (una sola vez, al arrancar la interfaz). */
export function startTouchFeedback(): void {
  if (started || typeof document === 'undefined') return
  started = true
  document.addEventListener('pointerdown', (e) => {
    if (!reducedMotion()) ripple(e)
  }, true)
  if (reducedMotion()) return
  document.addEventListener('pointerover', glide, true)
  document.addEventListener(
    'pointerout',
    (e) => {
      const box = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-glide]') : null
      if (box && !(e.relatedTarget instanceof Node && box.contains(e.relatedTarget))) hide(box)
    },
    true
  )
  // Mientras arrastras algo o se desplaza la lista, el resalte no pinta nada.
  const hideAll = (): void => document.querySelectorAll<HTMLElement>('[data-glide]').forEach(hide)
  document.addEventListener('dragstart', hideAll, true)
  document.addEventListener('scroll', (e) => e.target instanceof HTMLElement && e.target.matches('[data-glide]') && hide(e.target), true)
}
