import { useEffect, useState } from 'react'
import { currentData, useCowork } from '@/store/cowork'
import { useMusic } from '@/lib/music'
import { REST_AFTER_MS } from './frameRate'

/** ¿Hay algo que mirar en el 3D? Un agente trabajando, pensando o esperando, o música sonando (los robots bailan). */
function lively(): boolean {
  if (useMusic.getState().status === 'playing') return true
  for (const rt of Object.values(currentData().runtimes)) {
    if (rt.activity === 'working' || rt.activity === 'thinking' || rt.activity === 'waiting') return true
  }
  return false
}

/**
 * La escena entra en reposo cuando lleva [REST_AFTER_MS] sin nada que mirar: ningún agente trabaja, no suena música
 * y no mueves el ratón, la rueda ni tocas sobre el espacio 3D ([target]). Cualquiera de esas cosas la despierta al
 * momento.
 */
export function useSceneRest(target: HTMLElement | null, enabled: boolean): boolean {
  const [resting, setResting] = useState(false)
  useEffect(() => {
    if (!enabled) {
      setResting(false)
      return
    }
    let last = Date.now()
    let timer = 0
    const arm = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(check, Math.max(0, last + REST_AFTER_MS - Date.now()) + 50)
    }
    const check = () => {
      if (lively()) {
        last = Date.now()
        setResting(false)
      } else if (Date.now() - last >= REST_AFTER_MS) {
        setResting(true)
        return
      }
      arm()
    }
    const wake = () => {
      last = Date.now()
      setResting(false)
      arm()
    }
    const offData = useCowork.subscribe((s, prev) => {
      const d = s[s.mode]
      const p = prev[prev.mode]
      if (d.runtimes !== p.runtimes || d.transfers !== p.transfers || s.selection !== prev.selection || s.mode !== prev.mode) {
        if (lively() || d.transfers !== p.transfers || s.selection !== prev.selection) wake()
      }
    })
    const offMusic = useMusic.subscribe((st, prev) => {
      if (st.status !== prev.status && st.status === 'playing') wake()
    })
    const events = ['pointermove', 'pointerdown', 'wheel', 'keydown'] as const
    for (const e of events) target?.addEventListener(e, wake, { passive: true })
    arm()
    return () => {
      window.clearTimeout(timer)
      offData()
      offMusic()
      for (const e of events) target?.removeEventListener(e, wake)
    }
  }, [target, enabled])
  return resting
}
