import { useEffect } from 'react'
import { LayoutGrid, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react'
import { useCowork } from '@/store/cowork'
import s from './BottomBar.module.css'
import { t } from '@/lib/i18n'

/**
 * Controles de cámara del espacio: una botonera pequeña que flota en la esquina de abajo a la derecha del 3D (vista
 * general, acercar, alejar y pantalla completa). Los agentes y las transferencias ya se ven en el propio espacio y
 * «Efectos reducidos» está en el menú de Ajustes.
 */
export function BottomBar() {
  const expanded = useCowork((st) => st.spaceExpanded)
  const setSpaceExpanded = useCowork((st) => st.setSpaceExpanded)
  const cameraCommand = useCowork((st) => st.cameraCommand)

  // Las capas flotantes consumen Escape en document; la vista ampliada responde después.
  useEffect(() => {
    if (!expanded) return
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      setSpaceExpanded(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [expanded, setSpaceExpanded])

  return (
    <div className={s.controls} role="group" aria-label={t('Controles de vista')}>
      <button type="button" className={s.ctl} onClick={() => cameraCommand({ type: 'overview' })} title={t('Vista general')} aria-label={t('Vista general')}>
        <LayoutGrid size={16} aria-hidden="true" />
      </button>
      <button type="button" className={s.ctl} onClick={() => cameraCommand({ type: 'zoom', dir: 1 })} title={t('Acercar')} aria-label={t('Acercar')}>
        <ZoomIn size={16} aria-hidden="true" />
      </button>
      <button type="button" className={s.ctl} onClick={() => cameraCommand({ type: 'zoom', dir: -1 })} title={t('Alejar')} aria-label={t('Alejar')}>
        <ZoomOut size={16} aria-hidden="true" />
      </button>
      <span className={s.divider} aria-hidden="true" />
      <button
        type="button"
        className={s.ctl}
        onClick={() => setSpaceExpanded(!expanded)}
        aria-pressed={expanded}
        title={expanded ? t('Salir de pantalla completa') : t('Pantalla completa')}
        aria-label={expanded ? t('Salir de pantalla completa') : t('Pantalla completa')}
      >
        {expanded ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
      </button>
    </div>
  )
}
