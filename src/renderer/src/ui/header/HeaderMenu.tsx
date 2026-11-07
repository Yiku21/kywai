import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Award, BarChart3, Coffee, Download, FolderOpen, Globe, HardDrive, Monitor, RotateCcw, Server, Settings } from 'lucide-react'
import { useCowork } from '@/store/cowork'
import { api, isWeb } from '@/lib/api'
import { openServerFiles } from '@/lib/serverFiles'
import { UpdateDialog } from './UpdateDialog'
import { ROLE_TITLE, explainWhere, useWhere } from './useWhere'
import { openDonate, openSettings, useRestart } from '../settings/SettingsDialog'
import { menuKeyNav, Popover } from '../common/Popover'
import { cx } from '../common/util'
import s from './HeaderMenu.module.css'
import { t } from '@/lib/i18n'

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const SETTINGS_KEYS = MAC ? '⌘,' : 'Ctrl+,'

/**
 * La rueda ⚙ del pie de la barra lateral: un menú corto (como en Claude). Los ajustes de verdad (idioma, tema,
 * sonido, permisos de los agentes, conexión…) están en la ventana de Ajustes; aquí, lo que se consulta o se hace.
 */
export function HeaderMenu({ sidebar }: { sidebar: { button: string } }) {
  const mode = useCowork((st) => st.mode)
  const hasBackend = useCowork((st) => st.hasBackend)
  const project = useCowork((st) => st.live.project)
  const [open, setOpen] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  const where = useWhere()
  const restart = useRestart(() => setOpen(false))
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  const live = mode === 'live'
  const canOpenFolder = !!api && live && !!project
  const go = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={sidebar.button}
        aria-label={t('Ajustes y más opciones')}
        title={t('Ajustes y más opciones')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Settings size={17} aria-hidden="true" />
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        align="end"
        side="right"
        role="menu"
        ariaLabel={t('Ajustes y más opciones')}
        id={menuId}
        className={s.menu}
        initialFocus="first"
        onKeyDown={menuKeyNav}
      >
        {where && (
          <>
            <div
              role="menuitem"
              aria-disabled="true"
              className={cx(s.item, s.static, s.where, s[`where_${where.role}`])}
              data-role-badge={where.role}
              title={explainWhere(where)}
            >
              {where.role === 'server' ? (
                <Server size={16} aria-hidden="true" className={s.whereIcon} />
              ) : where.role === 'client' ? (
                <Monitor size={16} aria-hidden="true" className={s.whereIcon} />
              ) : (
                <Globe size={16} aria-hidden="true" className={s.whereIcon} />
              )}
              <span className={s.itemText}>
                <span className={s.itemLabel}>
                  {ROLE_TITLE[where.role]}
                  {where.role !== 'server' && where.host ? ` → ${where.host}` : where.host ? ` · ${where.host}` : ''}
                </span>
                <span className={s.itemHint}>{explainWhere(where)}</span>
              </span>
            </div>
            <div className={s.sep} role="separator" />
          </>
        )}

        <button type="button" role="menuitem" className={s.item} onClick={go(() => openSettings('general'))}>
          <Settings size={16} aria-hidden="true" className={s.itemIcon} />
          <span className={s.itemLabel}>{t('Ajustes…')}</span>
          <kbd className={s.kbd}>{SETTINGS_KEYS}</kbd>
        </button>

        {hasBackend && (
          <button type="button" role="menuitem" className={s.item} onClick={go(() => useCowork.setState({ usageOpen: true }))}>
            <BarChart3 size={16} aria-hidden="true" className={s.itemIcon} />
            <span className={s.itemLabel}>{t('Consumo y tokens…')}</span>
          </button>
        )}

        {hasBackend && (
          <button type="button" role="menuitem" className={s.item} onClick={go(() => useCowork.setState({ qualityOpen: true }))}>
            <Award size={16} aria-hidden="true" className={s.itemIcon} />
            <span className={s.itemLabel}>{t('Cómo rinde cada agente…')}</span>
          </button>
        )}

        {hasBackend && isWeb && (
          <button type="button" role="menuitem" className={s.item} onClick={go(openServerFiles)}>
            <HardDrive size={16} aria-hidden="true" className={s.itemIcon} />
            <span className={s.itemLabel}>{t('Archivos del servidor…')}</span>
          </button>
        )}

        <button
          type="button"
          role="menuitem"
          className={s.item}
          disabled={!canOpenFolder}
          title={!api ? t('Sin motor de agentes') : !live ? t('No disponible en modo demo') : !project ? t('Abre o crea un proyecto primero') : undefined}
          onClick={go(() => {
            if (api && project) api.openPath(project.id).catch(() => {})
          })}
        >
          <FolderOpen size={16} aria-hidden="true" className={s.itemIcon} />
          <span className={s.itemLabel}>{t('Abrir carpeta del proyecto')}</span>
        </button>

        {hasBackend && (
          <>
            <div className={s.sep} role="separator" />
            <button type="button" role="menuitem" className={s.item} onClick={go(() => setUpdateOpen(true))}>
              <Download size={16} aria-hidden="true" className={s.itemIcon} />
              <span className={s.itemLabel}>{t('Buscar actualizaciones…')}</span>
            </button>
            <button type="button" role="menuitem" className={cx(s.item, restart.confirming && s.danger)} onClick={restart.run}>
              <RotateCcw size={16} aria-hidden="true" className={s.itemIcon} />
              <span className={s.itemText}>
                <span className={s.itemLabel}>{restart.confirming ? t('Pulsa otra vez para reiniciar') : t('Reiniciar kywai')}</span>
                {restart.confirming && <span className={s.itemHint}>{t('Se detendrán las tareas en curso')}</span>}
              </span>
            </button>
          </>
        )}

        <div className={s.sep} role="separator" />
        <button type="button" role="menuitem" className={s.item} onClick={go(openDonate)}>
          <Coffee size={16} aria-hidden="true" className={s.itemIcon} />
          <span className={s.itemLabel}>{t('Apoyar kywai ☕')}</span>
        </button>
      </Popover>
      {/* En el cuerpo de la página: dentro de la barra lateral quedaría debajo del chat (su capa la encierra). */}
      {updateOpen && createPortal(<UpdateDialog onClose={() => setUpdateOpen(false)} />, document.body)}
    </>
  )
}
