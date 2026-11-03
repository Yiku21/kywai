import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { isNewBoot, isWeb, serverBoot } from '@/lib/api'
import u from './common/ui.module.css'
import s from './RestartOverlay.module.css'

/**
 * Pantalla de «Reiniciando…». En la app de escritorio la ventana se cierra y se vuelve a abrir sola; desde el
 * navegador se espera a que el equipo vuelva a responder y se recarga la página.
 */
export function RestartOverlay() {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const slowTimer = window.setTimeout(() => setSlow(true), 45_000)
    if (!isWeb) return () => window.clearTimeout(slowTimer)
    let alive = true
    const poll = async () => {
      while (alive) {
        await new Promise((r) => setTimeout(r, 1000))
        // Se recarga en cuanto responde la app ya reiniciada (otro arranque), aunque el corte haya durado un instante.
        if (alive && isNewBoot(await serverBoot())) {
          location.reload()
          return
        }
      }
    }
    void poll()
    return () => {
      alive = false
      window.clearTimeout(slowTimer)
    }
  }, [])

  return (
    <div className={s.overlay} role="alertdialog" aria-live="assertive" aria-label="Reiniciando AI Cowork">
      <div className={s.card}>
        <LoaderCircle size={28} className={u.spin} aria-hidden="true" />
        <p className={s.title}>Reiniciando AI Cowork…</p>
        <p className={s.text}>{isWeb ? 'Se volverá a conectar sola en unos segundos.' : 'La ventana se cerrará y se abrirá de nuevo.'}</p>
        {slow && (
          <p className={s.text}>
            Está tardando más de lo normal. {isWeb ? 'Recarga la página en un momento; si no vuelve, ábrela en el equipo.' : 'Si no se abre, ábrela desde su acceso directo.'}
          </p>
        )}
      </div>
    </div>
  )
}
