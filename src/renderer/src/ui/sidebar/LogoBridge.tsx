import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../common/hooks'
import s from './LogoBridge.module.css'

/** Ancho de la barra plegada (Sidebar.module.css .rail). */
const RAIL_W = 58
/** Lo que dura unirse (con el balanceo final del líquido) y separarse. */
const JOIN_MS = 980
const SPLIT_MS = 640
/** Hasta aquí del avance, la gota y la barra aún no se tocan. */
const TOUCH = 0.3

interface Geo {
  /** Dónde va el dibujo dentro de la cabecera: su esquina y su tamaño. */
  left: number
  top: number
  /** Borde de abajo del logo y borde de arriba de la barra, medidos desde `top`. */
  logoBottom: number
  barTop: number
  /** Media anchura de la barra y radio de sus esquinas. */
  barHalf: number
  barR: number
}

/** Selector del botón del logo de la cabecera (Header.tsx). */
export const LOGO_SELECTOR = '[data-kywai-logo]'

const clamp = (v: number): number => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3)
/** Muelle amortiguado de 0 a 1: se pasa, vuelve y se asienta con un par de vaivenes (como un líquido). */
const spring = (t: number): number => {
  const raw = (x: number): number => 1 - Math.exp(-8 * x) * Math.cos(11 * x)
  return raw(t) + (1 - raw(1)) * t
}

/** Media anchura de la base del líquido sobre la barra cuando ya se tocan: llega pronto a la barra entera. */
function baseHalf(p: number, barHalf: number): number {
  const t = clamp((p - TOUCH) / (1 - TOUCH))
  return lerp(9, barHalf, easeOut(clamp(t / 0.45)))
}

/** Cuánto de la barra entera ocupa ya la base (0 = montículo, 1 = todo su ancho): con ello se cuadran sus esquinas. */
export function spread(p: number, barHalf: number): number {
  return p < TOUCH ? 0 : clamp((baseHalf(p, barHalf) - 9) / (barHalf - 9))
}

/**
 * Forma del líquido cuando el avance es `p` (0 = separados, 1 = unidos del todo), en un lienzo de ancho `w` cuyo
 * y = 0 es hasta donde sube la barra, con el borde de abajo del logo en `logoBottom` y el de arriba de la barra en
 * `barTop`. Primero cae una gota de debajo del logo y sube un montículo de la barra; al tocarse, la columna engorda
 * hasta el ancho de la barra y luego sube recta (con un pequeño rebote) hasta envolver el logo: al final es la misma
 * barra, un rectángulo uniforme con las esquinas de arriba redondeadas. Al separarse se recorre al revés.
 * Va por detrás del logo. `fill` es el relleno y `edge` su contorno sin la base (ahí se funde con la barra).
 */
export function bridgePaths(
  p: number,
  w: number,
  logoBottom: number,
  barTop: number,
  barHalf: number,
  barR: number,
  /** 1 = uniéndose (el líquido sube con inercia y se balancea), -1 = separándose (baja suave). */
  dir: 1 | -1 = 1
): { fill: string[]; edges: string[] } {
  const cx = w / 2
  const h = barTop
  const g = barTop - logoBottom
  const f = (n: number): string => n.toFixed(2)
  if (p <= 0.01) return { fill: [], edges: [] }
  if (p < TOUCH) {
    const y1 = h + 1 // pisa la raya del borde de la barra
    const q = easeInOut(p / TOUCH)
    // Gota que cuelga de debajo del logo (nace escondida tras él).
    const y0 = logoBottom - 2
    const a = 6
    const d = lerp(4.5, 3, q)
    const tip = y0 + (g + 2) * 0.56 * q - d
    const drip =
      tip <= y0
        ? `M${f(cx - a)},${f(y0)} C${f(cx - a * 0.5)},${f(y0 + g * 0.75 * q)} ${f(cx + a * 0.5)},${f(y0 + g * 0.75 * q)} ${f(cx + a)},${f(y0)}`
        : `M${f(cx - a)},${f(y0)} C${f(cx - a)},${f(lerp(y0, tip, 0.6))} ${f(cx - d)},${f(lerp(y0, tip, 0.4))} ${f(cx - d)},${f(tip)} C${f(cx - d)},${f(tip + d * 1.33)} ${f(cx + d)},${f(tip + d * 1.33)} ${f(cx + d)},${f(tip)} C${f(cx + d)},${f(lerp(y0, tip, 0.4))} ${f(cx + a)},${f(lerp(y0, tip, 0.6))} ${f(cx + a)},${f(y0)}`
    // Montículo que sube de la barra.
    const b = 9
    const e = lerp(6, 3.5, q)
    const top = h - g * 0.46 * q + e
    const mound =
      top >= h
        ? `M${f(cx - b)},${y1} C${f(cx - b * 0.5)},${f(h - g * 0.62 * q)} ${f(cx + b * 0.5)},${f(h - g * 0.62 * q)} ${f(cx + b)},${y1}`
        : `M${f(cx - b)},${y1} C${f(cx - b)},${f(h - (h - top) * 0.6)} ${f(cx - e)},${f(h - (h - top) * 0.4)} ${f(cx - e)},${f(top)} C${f(cx - e)},${f(top - e * 1.33)} ${f(cx + e)},${f(top - e * 1.33)} ${f(cx + e)},${f(top)} C${f(cx + e)},${f(h - (h - top) * 0.4)} ${f(cx + b)},${f(h - (h - top) * 0.6)} ${f(cx + b)},${y1}`
    return { fill: [`${drip} Z`, `${mound} Z`], edges: [drip, mound] }
  }
  // Unidos: la columna engorda hasta el ancho de la barra y sube recta hasta arriba.
  const t = clamp((p - TOUCH) / (1 - TOUCH))
  const b = baseHalf(p, barHalf)
  const n = Math.min(lerp(2.5, barHalf, easeInOut(clamp(t / 0.7))), b)
  /** Altura de la superficie del líquido con el avance `x`: al unirse sube como un muelle; al separarse, suave. */
  const levelAt = (x: number): number => {
    const k = clamp((clamp((x - TOUCH) / (1 - TOUCH)) - 0.22) / 0.78)
    return lerp(logoBottom - 3, 0, dir > 0 ? spring(k) : easeInOut(k))
  }
  const yT = Math.max(-1.5, levelAt(p))
  const r = Math.max(0, Math.min(barR, n, (h - yT) / 2))
  // La superficie se curva según se mueve: hacia arriba mientras sube, hacia abajo al frenar o bajar; con el muelle,
  // eso da el balanceo del final.
  const kNow = clamp((t - 0.22) / 0.78)
  const slosh = dir > 0 ? 3.2 * Math.exp(-4.2 * kNow) * Math.sin(12.5 * kNow) : 0
  const dome = clamp((n - 9) / 16) * clamp((n - r) / 10) * Math.max(-5, Math.min(6, (yT - levelAt(clamp(p + dir * 0.014))) * 1.6 + slosh))
  // Con la base ya en todo el ancho no pisa la barra (su borde de arriba se quita): si no, tapa esa raya.
  const yBase = b >= barHalf - 0.01 ? h : h + 1
  const sh = h - g * 0.9
  /** El contorno metido `i` px hacia dentro: 0 para el relleno y medio para la línea del borde, que va por dentro. */
  const outline = (i: number): string => {
    const nn = n - i
    const bb = b - i
    const top = yT + i
    const rr = Math.max(0, r - i)
    // La línea del borde baja 1 px más: cubre la esquina de la barra, que sin su raya de arriba queda a medias.
    const y1 = i > 0 ? h + 1 : yBase
    return (
      `M${f(cx - bb)},${y1} C${f(cx - bb)},${f(h - g * 0.5)} ${f(cx - nn)},${f(h - g * 0.4)} ${f(cx - nn)},${f(sh)} ` +
      `L${f(cx - nn)},${f(top + rr)} A${f(rr)},${f(rr)} 0 0 1 ${f(cx - nn + rr)},${f(top)} Q${f(cx)},${f(top - dome * 2)} ${f(cx + nn - rr)},${f(top)} A${f(rr)},${f(rr)} 0 0 1 ${f(cx + nn)},${f(top + rr)} ` +
      `L${f(cx + nn)},${f(sh)} C${f(cx + nn)},${f(h - g * 0.4)} ${f(cx + bb)},${f(h - g * 0.5)} ${f(cx + bb)},${y1}`
    )
  }
  return { fill: [`${outline(0)} Z`], edges: [outline(0.5)] }
}

/**
 * Con la barra plegada, el logo de kywai se coloca sobre su columna y la barra sube hasta envolverlo: cae una gota,
 * toca la barra y el líquido crece hasta ser la misma barra, recta hasta arriba, con el logo dentro. Al abrirla, el
 * líquido baja, se estrecha y se corta. Se dibuja en la cabecera, por detrás del logo.
 */
export function LogoBridge({ joined }: { joined: boolean }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [geo, setGeo] = useState<Geo | null>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [p, setP] = useState(joined ? 1 : 0)
  const anchor = useRef<HTMLSpanElement>(null)
  const pRef = useRef(p)
  pRef.current = p

  // Mide dónde quedan el logo y la barra; el logo se mueve en horizontal hasta el centro de la barra plegada.
  useLayoutEffect(() => {
    const nav = anchor.current?.closest('nav')
    const logo = document.querySelector<HTMLElement>(LOGO_SELECTOR)
    const header = logo?.closest('header')
    if (!nav || !logo || !header) return
    setHost(header)
    const root = document.documentElement
    const measure = (): void => {
      const n = nav.getBoundingClientRect()
      const hd = header.getBoundingClientRect()
      const cx = n.left + RAIL_W / 2
      // El botón no se mueve (se mueve el dibujo de dentro): su sitio es el de siempre.
      const l = logo.getBoundingClientRect()
      root.style.setProperty('--logo-shift', `${Math.round(cx - (l.left + l.width / 2))}px`)
      // Hueco para que lo que sigue al logo (el nombre) quede a la derecha de la barra y no debajo.
      const gapX = parseFloat(getComputedStyle(logo.parentElement ?? logo).columnGap) || 12
      root.style.setProperty('--logo-room', `${Math.max(0, Math.round(n.left + RAIL_W + 10 - l.right - gapX))}px`)
      // La barra sube dejando sobre el logo el mismo margen que le queda a los lados.
      const side = (RAIL_W - l.width) / 2
      const top = Math.max(hd.top + 2, l.top - side)
      const gap = n.top - l.bottom
      const barR = parseFloat(getComputedStyle(nav).borderBottomLeftRadius) || 16
      // Tema de cristal: hueco exacto de la columna en el cristal de la cabecera (Header.module.css).
      root.style.setProperty('--bridge-x', `${(cx - RAIL_W / 2 - hd.left).toFixed(2)}px`)
      root.style.setProperty('--bridge-y', `${(top - hd.top).toFixed(2)}px`)
      root.style.setProperty(
        '--bridge-hole',
        `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${RAIL_W}' height='400'%3E%3Crect width='${RAIL_W}' height='440' rx='${barR}'/%3E%3C/svg%3E")`
      )
      setGeo(
        gap > 4 && gap < 140
          ? { left: cx - hd.left, top: top - hd.top, logoBottom: l.bottom - top, barTop: n.top - top, barHalf: RAIL_W / 2, barR }
          : null
      )
    }
    measure()
    // La cabecera cambia de alto sin que cambie la ventana (cuotas que llegan, avisos): se vigila ella, la barra y
    // el logo, o el líquido se quedaría corto y la columna saldría partida.
    const ro = new ResizeObserver(measure)
    for (const el of [document.body, header, nav, logo]) ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      for (const v of ['--logo-shift', '--logo-room', '--bridge-x', '--bridge-y', '--bridge-hole']) root.style.removeProperty(v)
      root.removeAttribute('data-logo-joined')
      root.removeAttribute('data-logo-fused')
      nav.style.removeProperty('--bar-join-r')
      nav.removeAttribute('data-fused')
    }
  }, [])

  // El logo se desliza a la columna (y pierde su tesela) solo mientras está unido.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-logo-joined', joined && !!geo)
  }, [joined, geo])

  // Según el líquido ocupa el ancho de la barra, sus esquinas de arriba se cuadran; con todo el ancho, se quita su
  // raya de arriba: la barra sigue recta dentro del líquido.
  useLayoutEffect(() => {
    const nav = anchor.current?.closest('nav')
    if (!nav) return
    const u = geo ? spread(p, geo.barHalf) : 0
    if (u > 0 && geo) nav.style.setProperty('--bar-join-r', `${(geo.barR * (1 - u)).toFixed(2)}px`)
    else nav.style.removeProperty('--bar-join-r')
    nav.toggleAttribute('data-fused', u >= 0.999)
    document.documentElement.toggleAttribute('data-logo-fused', u >= 0.999 && p >= 0.999)
  }, [p, geo])

  // Anima el avance hacia 1 (unirse) o 0 (separarse).
  useEffect(() => {
    const target = joined ? 1 : 0
    if (reduced) return setP(target)
    const from = pRef.current
    if (from === target) return
    // Al unirse, primero llega el logo a su sitio y luego cae la gota.
    const delay = joined ? 120 : 0
    const dur = (joined ? JOIN_MS : SPLIT_MS) * Math.abs(target - from)
    let raf = 0
    let start = 0
    const tick = (now: number): void => {
      if (!start) start = now + delay
      const t = clamp((now - start) / dur)
      setP(lerp(from, target, t))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [joined, reduced])

  const W = RAIL_W + 8
  const shape = geo ? bridgePaths(p, W, geo.logoBottom, geo.barTop, geo.barHalf, geo.barR, joined ? 1 : -1) : { fill: [], edges: [] }
  // En el tema de cristal, el fondo de la barra no llega a la fila de su raya de arriba: unida, la cubre el líquido.
  const glassBase = geo && p >= 0.999 ? ` M${W / 2 - geo.barHalf},${geo.barTop - 0.5} h${geo.barHalf * 2} v1.5 h${-geo.barHalf * 2} Z` : ''
  return (
    <>
      <span ref={anchor} hidden />
      {geo &&
        host &&
        shape.fill.length > 0 &&
        createPortal(
          <>
            {/* Solo en el tema de cristal: el mismo cristal que la barra, recortado con la forma del líquido. */}
            <div className={s.glass} style={{ left: geo.left - W / 2, top: geo.top, width: W, height: geo.barTop + 1, clipPath: `path('${shape.fill.join(' ')}${glassBase}')` }} aria-hidden="true" />
          <svg className={s.bridge} width={W} height={geo.barTop} style={{ left: geo.left - W / 2, top: geo.top }} viewBox={`0 0 ${W} ${geo.barTop}`} aria-hidden="true">
            {/* El relleno y, encima y por dentro, la línea del borde: igual que el borde de la barra sobre su fondo. */}
            {shape.fill.map((d, i) => (
              <path key={`f${i}`} className={s.fill} d={d} />
            ))}
            {shape.edges.map((d, i) => (
              <path key={`e${i}`} className={s.edge} d={d} />
            ))}
          </svg>
          </>,
          host
        )}
    </>
  )
}
