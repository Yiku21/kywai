import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

// ---------- Escape: solo se cierra la capa superior (popover > visor > panel) ----------

type EscEntry = { cb: () => void }
const escStack: EscEntry[] = []
let escInstalled = false

function onEscKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const top = escStack[escStack.length - 1]
  if (!top) return
  e.preventDefault()
  top.cb()
}

/** Registra `cb` para Escape mientras `active`. Si hay varias capas abiertas, solo responde la última.
 *  Un control interno puede evitar el cierre llamando a `e.preventDefault()` en su onKeyDown. */
export function useEscape(active: boolean, cb: () => void): void {
  const ref = useRef(cb)
  useEffect(() => {
    ref.current = cb
  })
  useEffect(() => {
    if (!active) return
    const entry: EscEntry = { cb: () => ref.current() }
    escStack.push(entry)
    if (!escInstalled) {
      document.addEventListener('keydown', onEscKey)
      escInstalled = true
    }
    return () => {
      const i = escStack.indexOf(entry)
      if (i !== -1) escStack.splice(i, 1)
    }
  }, [active])
}

// ---------- Reloj ----------

/** Devuelve Date.now() y vuelve a renderizar cada `intervalMs` mientras `enabled`. */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs, enabled])
  return now
}

// ---------- Media queries ----------

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}

function osReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// ---------- Interpolación de números ----------

/** Interpola suavemente hacia `target` (~600 ms). Solo usa requestAnimationFrame mientras anima
 *  y solo actualiza el estado cuando cambia el valor redondeado. */
export function useTweenedNumber(target: number | null | undefined, duration = 600): number | null {
  const [value, setValue] = useState<number | null>(target ?? null)
  const current = useRef<number | null>(target ?? null)

  useEffect(() => {
    if (target == null) {
      current.current = null
      setValue(null)
      return
    }
    const from = current.current
    if (from == null || Math.abs(from - target) < 0.5 || osReducedMotion()) {
      current.current = target
      setValue(target)
      return
    }
    let raf = 0
    let lastShown = Math.round(from)
    const start = performance.now()
    const step = (t: number): void => {
      const k = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - k, 3)
      const v = from + (target - from) * eased
      current.current = v
      const shown = Math.round(v)
      if (shown !== lastShown || k === 1) {
        lastShown = shown
        setValue(k === 1 ? target : v)
      }
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    // Si el objetivo cambia a mitad, la siguiente animación parte del valor intermedio.
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}
