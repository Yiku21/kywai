// Movimiento común de toda la interfaz: muelles (como el líquido del logo con la barra plegada) y el «modo tranquilo».
// Las curvas de muelle están en styles/motion.css como linear() (--spring, --spring-bouncy, --spring-soft); aquí está
// la misma física para lo que se anima desde JavaScript (Web Animations).
//
// Modo tranquilo (<html data-calm>): con «Reducir efectos ambientales» de Ajustes, nada se desplaza ni rebota, solo
// funde (--m vale 0 y las distancias de las animaciones se anulan). Con «Reducir movimiento» del sistema, además, todo
// es instantáneo (tokens.css deja --dur a 0).

import { useCowork } from '@/store/cowork'

/** Muelle amortiguado de 0 a 1 (rigidez k, rozamiento c, masa 1): posición a los `t` segundos. */
export function springAt(t: number, k = 260, c = 22): number {
  const w0 = Math.sqrt(k)
  const z = c / (2 * w0)
  if (z >= 1) return 1 - (1 + w0 * t) * Math.exp(-w0 * t)
  const wd = w0 * Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t))
}

/** Cuánto tarda en asentarse (en ms) el muelle: cuando ya no se separa de 1 más de 0,2 %. */
export function springMs(k = 260, c = 22): number {
  let last = 0
  for (let t = 0; t < 3; t += 1 / 240) if (Math.abs(springAt(t, k, c) - 1) > 0.002) last = t
  return Math.round(last * 1000)
}

/** La curva del muelle como easing de CSS (linear() con `n` puntos), para Web Animations o estilos en línea. */
export function springEasing(k = 260, c = 22, n = 32): string {
  const total = springMs(k, c) / 1000
  const pts: string[] = []
  for (let i = 0; i <= n; i++) pts.push(i === 0 ? '0' : i === n ? '1' : springAt((total * i) / n, k, c).toFixed(3))
  return `linear(${pts.join(', ')})`
}

/** Sin desplazamientos ni rebotes: «Reducir movimiento» del sistema o «Reducir efectos ambientales» de kywai. */
export function calm(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.calm !== undefined) return true
  return reducedMotion()
}

/** «Reducir movimiento» del sistema: ni siquiera fundidos largos. */
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

let synced = false

/** Pone o quita <html data-calm> según «Reducir efectos ambientales» (una vez, al arrancar la interfaz). */
export function startCalmSync(): void {
  if (synced || typeof document === 'undefined') return
  synced = true
  const apply = (on: boolean): void => {
    if (on) document.documentElement.dataset.calm = ''
    else delete document.documentElement.dataset.calm
  }
  apply(useCowork.getState().reducedEffects)
  useCowork.subscribe((st, prev) => {
    if (st.reducedEffects !== prev.reducedEffects) apply(st.reducedEffects)
  })
}

/** Curvas ya calculadas para Web Animations (las mismas que --spring, --spring-bouncy y --spring-soft). */
export const SPRING = { easing: springEasing(260, 22), ms: springMs(260, 22) }
export const SPRING_BOUNCY = { easing: springEasing(320, 17), ms: springMs(320, 17) }
export const SPRING_SOFT = { easing: springEasing(170, 24), ms: springMs(170, 24) }

export interface EnterOptions {
  /** Desde dónde llega (px): se mueve hasta su sitio. */
  x?: number
  y?: number
  /** Escala de partida (1 = su tamaño). */
  scale?: number
  /** El muelle que usa (SPRING por defecto). */
  spring?: { easing: string; ms: number }
  /** Funde desde transparente (sí por defecto). */
  fade?: boolean
  delay?: number
}

/**
 * Hace entrar un elemento ya pintado: llega desde (x, y, scale) a su sitio con muelle y funde a la vez. En modo
 * tranquilo solo funde (120 ms); con «Reducir movimiento», nada. Devuelve la animación (o null).
 */
export function enter(el: Element | null | undefined, o: EnterOptions = {}): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function' || reducedMotion()) return null
  const fade = o.fade !== false
  if (calm()) {
    if (!fade) return null
    return (el as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out', delay: o.delay })
  }
  const sp = o.spring ?? SPRING
  const from = `translate(${o.x ?? 0}px, ${o.y ?? 0}px) scale(${o.scale ?? 1})`
  const moves = (el as HTMLElement).animate([{ transform: from }, { transform: 'none' }], { duration: sp.ms, easing: sp.easing, delay: o.delay, fill: 'backwards' })
  if (fade) (el as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(220, sp.ms * 0.45), easing: 'ease-out', delay: o.delay, fill: 'backwards' })
  return moves
}
