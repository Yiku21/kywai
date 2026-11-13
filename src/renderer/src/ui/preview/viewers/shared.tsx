// Piezas comunes de los visores del panel de vista previa (Word, Excel, PowerPoint…): leer el archivo entero como
// bytes, los estados «Cargando» y «No se pudo», y una caja aislada (Shadow DOM) para que los estilos del documento no
// se mezclen con los de kywai.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import { t } from '@/lib/i18n'
import { cx, errorText } from '../../common/util'
import u from '../../common/ui.module.css'
import s from './viewers.module.css'

/** Más que esto no se abre en el panel (se queda en «Abrir con…»): el navegador se quedaría sin memoria. */
export const MAX_PREVIEW_BYTES = 80 * 1024 * 1024

/** Lee el archivo entero. En el escritorio por cowork://file/…, en un cliente o el navegador por /api/file/…. */
export async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_PREVIEW_BYTES) throw new Error(t('Es demasiado grande para verlo aquí. Ábrelo con la aplicación del equipo.'))
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_PREVIEW_BYTES) throw new Error(t('Es demasiado grande para verlo aquí. Ábrelo con la aplicación del equipo.'))
  return buf
}

export type Bytes = { status: 'loading' } | { status: 'ready'; data: ArrayBuffer } | { status: 'error'; message: string }

/** Los bytes del archivo, leídos al montar el visor. */
export function useBytes(url: string): Bytes {
  const [state, setState] = useState<Bytes>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    fetchBytes(url).then(
      (data) => alive && setState({ status: 'ready', data }),
      (e) => alive && setState({ status: 'error', message: errorText(e) })
    )
    return () => {
      alive = false
    }
  }, [url])
  return state
}

export function ViewerBusy({ label }: { label?: string }) {
  return (
    <div className={s.state} role="status">
      <LoaderCircle size={22} className={u.spin} aria-hidden="true" />
      <span>{label ?? t('Preparando la vista previa…')}</span>
    </div>
  )
}

export function ViewerFail({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className={cx(s.state, s.stateError)} role="alert">
      <AlertCircle size={22} aria-hidden="true" />
      <span className={s.stateTitle}>{t('No se pudo mostrar el archivo')}</span>
      <span className={s.stateText}>{message}</span>
      {children}
    </div>
  )
}

/**
 * Una caja con su propio Shadow DOM: lo que se pinta dentro (los estilos de un documento de Word, por ejemplo) no
 * cambia nada de kywai, y los estilos de kywai no estropean el documento. Los enlaces se abren fuera (en el
 * navegador del equipo) y los internos (#marcador) saltan dentro de la caja.
 */
export function useShadowBox(): [RefObject<HTMLDivElement | null>, () => ShadowRoot | null] {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = ref.current
    if (!host) return
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    const onClick = (e: Event): void => {
      const a = (e.composedPath().find((n) => n instanceof HTMLAnchorElement) ?? null) as HTMLAnchorElement | null
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      e.preventDefault()
      if (href.startsWith('#')) {
        const id = decodeURIComponent(href.slice(1))
        const target = root.getElementById(id) ?? root.querySelector(`[name="${CSS.escape(id)}"]`)
        target?.scrollIntoView({ block: 'start' })
      } else if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
        window.open(href, '_blank', 'noopener,noreferrer')
      }
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [])
  return [ref, () => ref.current?.shadowRoot ?? ref.current?.attachShadow({ mode: 'open' }) ?? null]
}

/** Ancho disponible de un elemento, al día cuando el panel cambia de tamaño. */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}
