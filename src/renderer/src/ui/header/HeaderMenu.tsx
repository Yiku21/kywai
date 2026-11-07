import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeftRight, Award, BarChart3, Check, ChevronDown, Coffee, Download, DownloadCloud, FolderOpen, FolderSync, Globe, HardDrive, Info, Languages, LogOut, Monitor, MoreVertical, Palette, Settings, Volume2, VolumeX, RefreshCw, RotateCcw, RotateCw, Server, SlidersHorizontal, Smartphone, Wand2 } from 'lucide-react'
import { useCowork } from '@/store/cowork'
import { api, clientActions, clientInfo, isWeb } from '@/lib/api'
import { openServerFiles } from '@/lib/serverFiles'
import type { ClientUpdateState } from '@shared/types'
import { RemoteAccess } from './RemoteAccess'
import { SoundRows } from './AudioToggle'
import { isMuted, setMuted, subscribeAudio } from '@/lib/audio'
import { UpdateDialog } from './UpdateDialog'
import { ThemeDialog } from './ThemeDialog'
import { SyncDialog } from '../files/SyncDialog'
import { ROLE_TITLE, explainWhere, useWhere } from './useWhere'
import { THEMES, useTheme } from '@/lib/theme'
import { menuKeyNav, Popover } from '../common/Popover'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import h from '../Header.module.css'
import s from './HeaderMenu.module.css'
import { LANGS, lang, setLang, t } from '@/lib/i18n'

const SETTINGS_OPEN_KEY = 'aicowork.menu.settingsOpen'

/** Página de Ko-fi del autor: «Apoyar AI Cowork» la abre en el navegador para quien quiera invitar a un café. */
export const DONATE_URL = 'https://ko-fi.com/yilsander'

/**
 * Menú de Ajustes: la rueda del pie de la barra lateral (antes el ⚙ de la cabecera). Con `sidebar`, el botón es la
 * rueda, el menú sale a su derecha y lleva también lo que había arriba a la derecha (abrir la carpeta y el sonido).
 */
export function HeaderMenu({ sidebar }: { sidebar?: { button: string } } = {}) {
  const mode = useCowork((st) => st.mode)
  const hasBackend = useCowork((st) => st.hasBackend)
  const reduced = useCowork((st) => st.reducedEffects)
  const project = useCowork((st) => st.live.project)
  const access = useCowork((st) => st.config.agentAccess)
  const approval = useCowork((st) => st.config.planApproval !== false)
  const setMode = useCowork((st) => st.setMode)
  const setReducedEffects = useCowork((st) => st.setReducedEffects)
  const [open, setOpen] = useState(false)
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  /** Los interruptores de siempre (demo, efectos, acceso, visto bueno) van plegados: casi nunca se tocan. */
  const [settingsOpen, setSettingsOpen] = useState(() => {
    try {
      return localStorage.getItem(SETTINGS_OPEN_KEY) === 'true'
    } catch {
      return false
    }
  })
  /** La lista de idiomas se despliega al tocar «Idioma · Language». */
  const [langOpen, setLangOpen] = useState(false)
  const theme = useTheme()
  const where = useWhere()
  /** Reiniciar pide un segundo toque (detiene las tareas en curso). */
  const [confirmRestart, setConfirmRestart] = useState(false)

  async function restart(): Promise<void> {
    const a = api
    if (!a) return
    if (!confirmRestart) {
      setConfirmRestart(true)
      return
    }
    setOpen(false)
    setConfirmRestart(false)
    useCowork.setState({ restarting: true })
    try {
      await a.restartApp()
    } catch {
      // Desde el navegador la conexión puede cortarse justo al reiniciar: es lo esperado.
    }
  }
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  /** Solo en el cliente de escritorio: sus opciones de conexión (no hay barra de menús que las lleve). */
  const client = clientActions()
  const [clientUpdate, setClientUpdate] = useState<ClientUpdateState | null>(null)
  const [clientUpdateBusy, setClientUpdateBusy] = useState(false)
  const [clientVersion, setClientVersion] = useState<string | null>(null)

  useEffect(() => {
    if (client) void clientInfo().then((i) => setClientVersion(i?.version ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!client])

  /** Primer toque: busca una versión nueva en el servidor; si la hay, el segundo la descarga e instala. */
  async function updateThisDevice(): Promise<void> {
    if (!client?.checkUpdate || clientUpdateBusy) return
    setClientUpdateBusy(true)
    try {
      if (clientUpdate?.state === 'available' && client.installUpdate) {
        await client.installUpdate()
        return
      }
      setClientUpdate(await client.checkUpdate())
    } catch (e) {
      setClientUpdate({ state: 'error', current: clientVersion ?? '', message: errorText(e) })
    } finally {
      setClientUpdateBusy(false)
    }
  }

  const clientUpdateHint = !client?.checkUpdate
    ? t('Esta app es una versión anterior: instala la nueva una vez a mano')
    : clientUpdateBusy
      ? t('Un momento…')
      : clientUpdate?.state === 'available'
        ? t('Hay la versión {latest}: pulsa otra vez para instalarla y reiniciar', { latest: clientUpdate.latest })
        : clientUpdate?.state === 'current'
          ? t('Tienes la última versión ({current}){message}', { current: clientUpdate.current, message: clientUpdate.message ? ` · ${clientUpdate.message}` : '' })
          : clientUpdate
            ? (clientUpdate.message ?? t('No se pudo comprobar'))
            : t('Versión instalada: {version} · se descarga de tu servidor', { version: clientVersion ?? '—' })
  function toggleSettings(): void {
    setSettingsOpen((open) => {
      try {
        localStorage.setItem(SETTINGS_OPEN_KEY, String(!open))
      } catch {
        /* almacenamiento no disponible */
      }
      return !open
    })
  }

  const currentLang = LANGS.find((l) => l.id === lang()) ?? LANGS[0]

  /** Lo que dicen los interruptores, para verlo sin desplegar. */
  const settingsSummary = [
    currentLang.name,
    mode === 'demo' ? 'Demo' : null,
    reduced ? t('Efectos reducidos') : null,
    hasBackend ? (access === 'full' ? t('Acceso completo') : t('Solo la carpeta del proyecto')) : null,
    hasBackend ? (approval ? t('Con tu visto bueno') : t('Sin visto bueno')) : null
  ]
    .filter(Boolean)
    .join(' · ')

  const live = mode === 'live'
  const canRefresh = !!api && live
  const canOpenFolder = !!api && live && !!project

  async function refresh(): Promise<void> {
    const a = api
    if (!a || refreshing) return
    setRefreshing(true)
    setError(null)
    try {
      await a.refreshQuotas()
      setOpen(false)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setRefreshing(false)
    }
  }

  async function toggleAccess(): Promise<void> {
    const a = api
    if (!a) return
    setError(null)
    try {
      await a.setAgentAccess(access === 'full' ? 'project' : 'full')
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function togglePlanApproval(): Promise<void> {
    const a = api
    if (!a) return
    setError(null)
    try {
      await a.setPlanApproval(!approval)
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={sidebar ? sidebar.button : cx(u.iconBtn, h.headerBtn, s.trigger)}
        aria-label={sidebar ? t('Ajustes y más opciones') : t('Más opciones')}
        title={sidebar ? t('Ajustes y más opciones') : t('Más opciones')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setError(null)
          setOpen((o) => !o)
        }}
      >
        {sidebar ? <Settings size={17} aria-hidden="true" /> : <MoreVertical size={18} aria-hidden="true" />}
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        align="end"
        side={sidebar ? 'right' : 'below'}
        role="menu"
        ariaLabel={t('Más opciones')}
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
        {sidebar && <SidebarExtras />}
        <button
          type="button"
          role="menuitem"
          aria-expanded={settingsOpen}
          className={s.item}
          onClick={toggleSettings}
        >
          <SlidersHorizontal size={16} aria-hidden="true" className={s.itemIcon} />
          <span className={s.itemText}>
            <span className={s.itemLabel}>{t('Ajustes')}</span>
            <span className={s.itemHint}>{settingsSummary || t('Modo demo, efectos, permisos de los agentes…')}</span>
          </span>
          <ChevronDown size={16} aria-hidden="true" className={cx(s.chevron, settingsOpen && s.chevronOpen)} />
        </button>

        {settingsOpen && (
          <div className={s.group} role="group" aria-label={t('Ajustes')}>
            <button
              type="button"
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={langOpen}
              className={s.item}
              onClick={() => setLangOpen((open) => !open)}
            >
              <Languages size={16} aria-hidden="true" className={s.itemIcon} />
              <span className={s.itemText}>
                <span className={s.itemLabel}>Idioma · Language</span>
                <span className={s.itemHint}>{currentLang.name}</span>
              </span>
              <ChevronDown size={16} aria-hidden="true" className={cx(s.chevron, langOpen && s.chevronOpen)} />
            </button>
            {langOpen && (
              <div className={s.group} role="group" aria-label="Idioma · Language">
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={l.id === currentLang.id}
                    lang={l.id}
                    className={s.item}
                    onClick={() => {
                      setLangOpen(false)
                      void setLang(l.id, (id) => api?.setLanguage?.(id) ?? Promise.resolve())
                    }}
                  >
                    <span className={s.itemText}>
                      <span className={s.itemLabel}>{l.name}</span>
                    </span>
                    {l.id === currentLang.id && <Check size={16} aria-hidden="true" className={s.itemIcon} />}
                  </button>
                ))}
              </div>
            )}

            {hasBackend ? (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={mode === 'demo'}
                className={s.item}
                onClick={() => setMode(mode === 'demo' ? 'live' : 'demo')}
              >
                <span className={s.itemText}>
                  <span className={s.itemLabel}>{t('Modo demo')}</span>
                  <span className={s.itemHint}>{t('Simulación reproducible, sin llamadas reales')}</span>
                </span>
                <span
                  className={cx(u.switch, mode === 'demo' && u.switchOn)}
                  style={{ ['--sw' as string]: 'var(--demo)' }}
                  aria-hidden="true"
                />
              </button>
            ) : (
              <div
                role="menuitem"
                aria-disabled="true"
                className={cx(s.item, s.static)}
                title={t('Sin motor de agentes: abre la app de escritorio')}
              >
                <Info size={16} aria-hidden="true" className={s.itemIcon} />
                <span className={s.itemText}>
                  <span className={s.itemLabel}>{t('Solo demo (sin motor)')}</span>
                  <span className={s.itemHint}>{t('Abre la app de escritorio para usar agentes reales')}</span>
                </span>
              </div>
            )}

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={reduced}
              className={s.item}
              onClick={() => setReducedEffects(!reduced)}
            >
              <span className={s.itemText}>
                <span className={s.itemLabel}>{t('Reducir efectos ambientales')}</span>
                <span className={s.itemHint}>{t('Menos animaciones y brillos en el espacio')}</span>
              </span>
              <span className={cx(u.switch, reduced && u.switchOn)} aria-hidden="true" />
            </button>

            {hasBackend && (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={access === 'full'}
                className={s.item}
                onClick={toggleAccess}
              >
                <span className={s.itemText}>
                  <span className={s.itemLabel}>{t('Acceso completo para los agentes')}</span>
                  <span className={s.itemHint}>
                    {access === 'full'
                      ? t('Ejecutan comandos, instalan y usan internet sin pedir permiso')
                      : t('Solo editan la carpeta del proyecto; no instalan ni usan internet')}
                  </span>
                </span>
                <span className={cx(u.switch, access === 'full' && u.switchOn)} aria-hidden="true" />
              </button>
            )}

            {hasBackend && (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={approval}
                className={s.item}
                onClick={togglePlanApproval}
              >
                <span className={s.itemText}>
                  <span className={s.itemLabel}>{t('Pedir mi visto bueno a cada plan')}</span>
                  <span className={s.itemHint}>
                    {approval
                      ? t('Hermes te enseña qué hará cada agente y espera a que lo apruebes')
                      : t('Las tareas empiezan en cuanto Hermes reparte el trabajo')}
                  </span>
                </span>
                <span className={cx(u.switch, approval && u.switchOn)} aria-hidden="true" />
              </button>
            )}

          </div>
        )}

        <div className={s.sep} role="separator" />

        <button
          type="button"
          role="menuitem"
          className={s.item}
          onClick={() => {
            setThemeOpen(true)
            setOpen(false)
          }}
        >
          <Palette size={16} aria-hidden="true" className={s.itemIcon} />
          <span className={s.itemText}>
            <span className={s.itemLabel}>{t('Temas…')}</span>
            <span className={s.itemHint}>{t('El aspecto de la app · ahora')} {THEMES.find((t) => t.id === theme)?.name}</span>
          </span>
        </button>

        {hasBackend && (
          <button type="button" role="menuitem" className={s.item} onClick={() => void restart()}>
            <RotateCcw size={16} aria-hidden="true" className={s.itemIcon} />
            <span className={s.itemText}>
              <span className={s.itemLabel}>{confirmRestart ? t('Pulsa otra vez para reiniciar') : t('Reiniciar AI Cowork')}</span>
              <span className={s.itemHint}>
                {confirmRestart ? t('Se detendrán las tareas en curso') : t('Por si se queda pillada: la cierra y la vuelve a abrir')}
              </span>
            </span>
          </button>
        )}

        {hasBackend && (
          <button
            type="button"
            role="menuitem"
            className={s.item}
            onClick={() => {
              useCowork.setState({ usageOpen: true })
              setOpen(false)
            }}
          >
            <BarChart3 size={16} aria-hidden="true" className={s.itemIcon} />
            <span className={s.itemText}>
              <span className={s.itemLabel}>{t('Consumo y tokens…')}</span>
              <span className={s.itemHint}>{t('Lo que gasta cada petición, para ver si compensa')}</span>
            </span>
          </button>
        )}

        {hasBackend && (
          <button
            type="button"
            role="menuitem"
            className={s.item}
            onClick={() => {
              useCowork.setState({ qualityOpen: true })
              setOpen(false)
            }}
          >
            <Award size={16} aria-hidden="true" className={s.itemIcon} />
            <span className={s.itemText}>
              <span className={s.itemLabel}>{t('Cómo rinde cada agente…')}</span>
              <span className={s.itemHint}>{t('Lo que te sirvió, lo que pasó la verificación y lo que falló')}</span>
            </span>
          </button>
        )}

        {hasBackend && (
          <button
            type="button"
            role="menuitem"
            className={s.item}
            onClick={() => {
              setUpdateOpen(true)
              setOpen(false)
            }}
          >
            <Download size={16} aria-hidden="true" className={s.itemIcon} />
            <span className={s.itemText}>
              <span className={s.itemLabel}>{t('Buscar actualizaciones…')}</span>
              <span className={s.itemHint}>{t('Descargar la última versión desde GitHub')}</span>
            </span>
          </button>
        )}

        {hasBackend && isWeb && (
          <button
            type="button"
            role="menuitem"
            className={s.item}
            onClick={() => {
              openServerFiles()
              setOpen(false)
            }}
          >
            <HardDrive size={16} aria-hidden="true" className={s.itemIcon} />
            <span className={s.itemText}>
              <span className={s.itemLabel}>{t('Archivos del servidor…')}</span>
              <span className={s.itemHint}>{t('Explorar su disco, abrir archivos y bajar carpetas como zip')}</span>
            </span>
          </button>
        )}

        {hasBackend && !isWeb && (
          <button
            type="button"
            role="menuitem"
            className={s.item}
            onClick={() => {
              setRemoteOpen(true)
              setOpen(false)
            }}
          >
            <Smartphone size={16} aria-hidden="true" className={s.itemIcon} />
            <span className={s.itemText}>
              <span className={s.itemLabel}>{t('Acceso desde otros dispositivos…')}</span>
              <span className={s.itemHint}>{t('Usar AI Cowork desde el móvil o el portátil (Tailscale)')}</span>
            </span>
          </button>
        )}

        {hasBackend && !isWeb && (
          <button
            type="button"
            role="menuitem"
            className={s.item}
            onClick={() => {
              useCowork.getState().openSetup(true)
              setOpen(false)
            }}
          >
            <Wand2 size={16} aria-hidden="true" className={s.itemIcon} />
            <span className={s.itemText}>
              <span className={s.itemLabel}>{t('Configurar agentes…')}</span>
              <span className={s.itemHint}>{t('Elegir agentes, instalar sus programas e iniciar sesión')}</span>
            </span>
          </button>
        )}

        <button
          type="button"
          role="menuitem"
          className={s.item}
          disabled={!canRefresh || refreshing}
          title={!api ? t('Sin motor de agentes') : !live ? t('No disponible en modo demo') : t('Consultar de nuevo las cuotas')}
          onClick={refresh}
        >
          <RefreshCw size={16} aria-hidden="true" className={cx(s.itemIcon, refreshing && u.spin)} />
          <span className={s.itemLabel}>{refreshing ? t('Actualizando cuotas…') : t('Actualizar cuotas')}</span>
        </button>

        <button
          type="button"
          role="menuitem"
          className={s.item}
          disabled={!canOpenFolder}
          title={
            !api ? t('Sin motor de agentes') : !live ? t('No disponible en modo demo') : !project ? t('Abre o crea un proyecto primero') : undefined
          }
          onClick={() => {
            if (api && project) api.openPath(project.id).catch(() => {})
            setOpen(false)
          }}
        >
          <FolderOpen size={16} aria-hidden="true" className={s.itemIcon} />
          <span className={s.itemLabel}>{t('Abrir carpeta del proyecto')}</span>
        </button>

        <div className={s.sep} role="separator" />

        <button
          type="button"
          role="menuitem"
          className={s.item}
          onClick={() => {
            if (api) void api.openExternal(DONATE_URL).catch(() => {})
            else window.open(DONATE_URL, '_blank', 'noopener')
            setOpen(false)
          }}
        >
          <Coffee size={16} aria-hidden="true" className={s.itemIcon} />
          <span className={s.itemText}>
            <span className={s.itemLabel}>{t('Apoyar AI Cowork ☕')}</span>
            <span className={s.itemHint}>{t('Si te gusta la app, invítame a un café en Ko-fi')}</span>
          </span>
        </button>

        {client && (
          <>
            <div className={s.sep} role="separator" />
            <button
              type="button"
              role="menuitem"
              className={s.item}
              onClick={() => {
                setSyncOpen(true)
                setOpen(false)
              }}
            >
              <FolderSync size={16} aria-hidden="true" className={s.itemIcon} />
              <span className={s.itemText}>
                <span className={s.itemLabel}>{t('Sincronizar carpetas…')}</span>
                <span className={s.itemHint}>{t('Mantener una carpeta de este equipo igual que una del servidor')}</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={s.item}
              disabled={clientUpdateBusy || !client.checkUpdate}
              onClick={() => void updateThisDevice()}
            >
              <DownloadCloud size={16} aria-hidden="true" className={s.itemIcon} />
              <span className={s.itemText}>
                <span className={s.itemLabel}>
                  {clientUpdate?.state === 'available' ? t('Instalar la versión nueva de este equipo') : t('Actualizar este equipo…')}
                </span>
                <span className={s.itemHint}>{clientUpdateHint}</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={s.item}
              onClick={() => {
                setOpen(false)
                void client.reload()
              }}
            >
              <RotateCw size={16} aria-hidden="true" className={s.itemIcon} />
              <span className={s.itemText}>
                <span className={s.itemLabel}>{t('Recargar la interfaz')}</span>
                <span className={s.itemHint}>{t('Vuelve a cargarla desde el servidor (Ctrl+R)')}</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={s.item}
              onClick={() => {
                setOpen(false)
                void client.switchServer()
              }}
            >
              <ArrowLeftRight size={16} aria-hidden="true" className={s.itemIcon} />
              <span className={s.itemText}>
                <span className={s.itemLabel}>{t('Cambiar de servidor…')}</span>
                <span className={s.itemHint}>{t('Conectar este equipo con otro AI Cowork')}</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={s.item}
              onClick={() => {
                setOpen(false)
                void client.forget()
              }}
            >
              <LogOut size={16} aria-hidden="true" className={s.itemIcon} />
              <span className={s.itemText}>
                <span className={s.itemLabel}>{t('Olvidar este dispositivo y desconectar')}</span>
                <span className={s.itemHint}>{t('Deja de estar emparejado; para volver hará falta un código nuevo')}</span>
              </span>
            </button>
          </>
        )}

        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
      </Popover>
      {remoteOpen && <RemoteAccess onClose={() => setRemoteOpen(false)} />}
      {updateOpen && <UpdateDialog onClose={() => setUpdateOpen(false)} />}
      {themeOpen && <ThemeDialog onClose={() => setThemeOpen(false)} />}
      {syncOpen && <SyncDialog onClose={() => setSyncOpen(false)} />}
    </>
  )
}

/** El sonido, que estaba arriba a la derecha (abrir la carpeta del proyecto ya estaba en este menú). */
function SidebarExtras() {
  const muted = useSyncExternalStore(subscribeAudio, isMuted, isMuted)
  return (
    <>
      <button type="button" role="menuitemcheckbox" aria-checked={!muted} className={s.item} onClick={() => setMuted(!isMuted())}>
        {muted ? <VolumeX size={16} aria-hidden="true" className={s.itemIcon} /> : <Volume2 size={16} aria-hidden="true" className={s.itemIcon} />}
        <span className={s.itemText}>
          <span className={s.itemLabel}>{t('Sonido')}</span>
          <span className={s.itemHint}>{muted ? t('Silenciado') : t('Música, efectos y voces de los agentes')}</span>
        </span>
      </button>
      {!muted && (
        <div className={s.sound}>
          <SoundRows />
        </div>
      )}
      <div className={s.sep} role="separator" />
    </>
  )
}
