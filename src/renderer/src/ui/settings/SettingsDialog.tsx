import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  ArrowLeftRight,
  Bot,
  ChevronDown,
  Coffee,
  Download,
  DownloadCloud,
  FlaskConical,
  FolderSync,
  Globe,
  HardDrive,
  Info,
  Languages,
  LogOut,
  Monitor,
  Palette,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  UserCheck,
  Volume2,
  VolumeX,
  Wand2,
  X
} from 'lucide-react'
import type { ClientUpdateState } from '@shared/types'
import { useCowork, type SettingsTab } from '@/store/cowork'
import { api, clientActions, clientInfo, isWeb } from '@/lib/api'
import { openServerFiles } from '@/lib/serverFiles'
import { isMuted, setMuted, subscribeAudio } from '@/lib/audio'
import { LANGS, lang, setLang, t } from '@/lib/i18n'
import { RemoteAccess } from '../header/RemoteAccess'
import { UpdateDialog } from '../header/UpdateDialog'
import { SyncDialog } from '../files/SyncDialog'
import { SoundRows } from '../header/AudioToggle'
import { ThemeGrid } from '../header/ThemeDialog'
import { themeLabel, useTheme } from '@/lib/theme'
import { ROLE_TITLE, explainWhere, useWhere } from '../header/useWhere'
import { useEscape } from '../common/hooks'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './SettingsDialog.module.css'

/** Página de Ko-fi del autor: «Apoyar kywai» la abre en el navegador para quien quiera invitar a un café. */
export const DONATE_URL = 'https://ko-fi.com/yilsander'

/** Abre (o cierra) la ventana de Ajustes desde cualquier sitio (rueda ⚙, Ctrl+,). */
export function openSettings(tab: SettingsTab | null = 'general'): void {
  useCowork.setState({ settingsTab: tab })
}

/** Ctrl+, (⌘, en el Mac), como en otras apps. */
export function isSettingsKey(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === ','
}

type Sub = 'remote' | 'update' | 'sync' | null

/**
 * Ventana de Ajustes, como en Claude: pestañas a la izquierda (General, Agentes, Conexión, Acerca de) y lo de cada
 * una a la derecha. Lo que tiene su propia ventana (acceso desde otros dispositivos, actualizaciones, sincronizar)
 * se abre en lugar de esta y, al cerrarla, se vuelve aquí.
 */
export function SettingsDialog() {
  const tab = useCowork((st) => st.settingsTab)
  const hasBackend = useCowork((st) => st.hasBackend)
  const client = clientActions()
  const [sub, setSub] = useState<Sub>(null)
  const close = (): void => openSettings(null)
  useEscape(!!tab && !sub, close)
  if (!tab) return null

  if (sub === 'remote') return <RemoteAccess onClose={() => setSub(null)} />
  if (sub === 'update') return <UpdateDialog onClose={() => setSub(null)} />
  if (sub === 'sync') return <SyncDialog onClose={() => setSub(null)} />

  const tabs: Array<{ id: SettingsTab; label: string; icon: ReactNode }> = [
    { id: 'general', label: t('General'), icon: <SlidersHorizontal size={17} /> },
    ...(hasBackend ? [{ id: 'agents' as const, label: t('Agentes'), icon: <Bot size={17} /> }] : []),
    { id: 'connection', label: t('Conexión'), icon: <Smartphone size={17} /> },
    { id: 'about', label: t('Acerca de'), icon: <Info size={17} /> }
  ]
  const current = tabs.find((x) => x.id === tab) ?? tabs[0]

  return (
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={s.win} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <nav className={s.nav} aria-label={t('Ajustes')}>
          <h2 id="settings-title" className={s.navTitle}>
            {t('Ajustes')}
          </h2>
          <div role="tablist" aria-orientation="vertical" className={s.tabs}>
            {tabs.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={x.id === current.id}
                className={cx(s.tab, x.id === current.id && s.tabOn)}
                onClick={() => openSettings(x.id)}
              >
                <span className={s.tabIcon} aria-hidden="true">
                  {x.icon}
                </span>
                {x.label}
              </button>
            ))}
          </div>
        </nav>
        <section className={s.body} role="tabpanel" aria-label={current.label}>
          <button type="button" className={cx(u.iconBtn, s.close)} aria-label={t('Cerrar')} title={t('Cerrar (Esc)')} onClick={close}>
            <X size={18} aria-hidden="true" />
          </button>
          {current.id === 'general' && <GeneralTab />}
          {current.id === 'agents' && <AgentsTab />}
          {current.id === 'connection' && <ConnectionTab openSub={setSub} client={!!client} />}
          {current.id === 'about' && <AboutTab openSub={setSub} />}
        </section>
      </div>
    </div>
  )
}

function Head({ title, hint }: { title: string; hint: string }) {
  return (
    <header className={s.head}>
      <h3 className={s.title}>{title}</h3>
      <p className={s.subtitle}>{hint}</p>
    </header>
  )
}

/** Una fila: icono, nombre y explicación, y a la derecha su control (interruptor, botón, desplegable…). */
function Row({ icon, label, hint, children, disabled }: { icon: ReactNode; label: string; hint?: ReactNode; children?: ReactNode; disabled?: boolean }) {
  return (
    <div className={cx(s.row, disabled && s.rowDisabled)}>
      <span className={s.rowIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={s.rowText}>
        <span className={s.rowLabel}>{label}</span>
        {hint && <span className={s.rowHint}>{hint}</span>}
      </span>
      {children && <span className={s.rowCtl}>{children}</span>}
    </div>
  )
}

function Switch({ on, label, onChange, color, disabled }: { on: boolean; label: string; onChange: () => void; color?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={cx(s.switchBtn)}
      onClick={onChange}
    >
      <span className={cx(u.switch, on && u.switchOn)} style={color ? { ['--sw' as string]: color } : undefined} aria-hidden="true" />
    </button>
  )
}

function ActionButton({ children, onClick, disabled, title, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string; danger?: boolean }) {
  return (
    <button type="button" className={cx(u.btn, u.btnSm, danger && u.btnDanger)} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

function GeneralTab() {
  const mode = useCowork((st) => st.mode)
  const hasBackend = useCowork((st) => st.hasBackend)
  const reduced = useCowork((st) => st.reducedEffects)
  const muted = useSyncExternalStore(subscribeAudio, isMuted, isMuted)
  const theme = useTheme()
  /** Los temas van plegados: se despliegan con la flecha (casi nunca se cambian). */
  const [themesOpen, setThemesOpen] = useState(false)
  const currentLang = LANGS.find((l) => l.id === lang()) ?? LANGS[0]
  return (
    <>
      <Head title={t('General')} hint={t('Cómo se ve y cómo suena kywai en este dispositivo.')} />
      <Row icon={<Languages size={18} />} label="Idioma · Language" hint={t('Textos de la app y de los agentes')}>
        <select
          className={s.select}
          value={currentLang.id}
          aria-label="Idioma · Language"
          onChange={(e) => void setLang(e.currentTarget.value as typeof currentLang.id, (id) => api?.setLanguage?.(id) ?? Promise.resolve())}
        >
          {LANGS.map((l) => (
            <option key={l.id} value={l.id} lang={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Row>
      <Row icon={muted ? <VolumeX size={18} /> : <Volume2 size={18} />} label={t('Sonido')} hint={muted ? t('Silenciado') : t('Música, efectos y voces de los agentes')}>
        <Switch on={!muted} label={t('Sonido')} onChange={() => setMuted(!isMuted())} />
      </Row>
      {!muted && (
        <div className={s.indent}>
          <SoundRows />
        </div>
      )}
      <Row icon={<Sparkles size={18} />} label={t('Reducir efectos ambientales')} hint={t('Menos animaciones y brillos en el espacio')}>
        <Switch on={reduced} label={t('Reducir efectos ambientales')} onChange={() => useCowork.getState().setReducedEffects(!reduced)} />
      </Row>
      {hasBackend ? (
        <Row icon={<FlaskConical size={18} />} label={t('Modo demo')} hint={t('Simulación reproducible, sin llamadas reales')}>
          <Switch on={mode === 'demo'} label={t('Modo demo')} color="var(--demo)" onChange={() => useCowork.getState().setMode(mode === 'demo' ? 'live' : 'demo')} />
        </Row>
      ) : (
        <Row icon={<Info size={18} />} label={t('Solo demo (sin motor)')} hint={t('Abre la app de escritorio para usar agentes reales')} />
      )}
      <div className={s.block}>
        <div className={s.blockHead}>
          <Palette size={18} aria-hidden="true" className={s.rowIcon} />
          <span className={s.rowText}>
            <span className={s.rowLabel}>{t('Tema')}</span>
            <span className={s.rowHint}>{t('El aspecto de kywai en este dispositivo. Se aplica al momento y se recuerda.')}</span>
          </span>
          <button type="button" className={cx(u.btn, u.btnSm, s.expand)} aria-expanded={themesOpen} onClick={() => setThemesOpen((v) => !v)}>
            {themeLabel(theme)}
            <ChevronDown size={15} aria-hidden="true" className={cx(s.chev, themesOpen && s.chevOpen)} />
          </button>
        </div>
        {themesOpen && <ThemeGrid />}
      </div>
    </>
  )
}

function AgentsTab() {
  const mode = useCowork((st) => st.mode)
  const access = useCowork((st) => st.config.agentAccess)
  const approval = useCowork((st) => st.config.planApproval !== false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const live = mode === 'live' && !!api

  async function call(fn: () => Promise<unknown>): Promise<void> {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <>
      <Head title={t('Agentes')} hint={t('Qué pueden hacer los agentes y cuándo te preguntan.')} />
      {!isWeb && (
        <Row icon={<Wand2 size={18} />} label={t('Configurar agentes…')} hint={t('Elegir agentes, instalar sus programas e iniciar sesión')}>
          <ActionButton
            onClick={() => {
              openSettings(null)
              useCowork.getState().openSetup(true)
            }}
          >
            {t('Abrir')}
          </ActionButton>
        </Row>
      )}
      <Row
        icon={<ShieldCheck size={18} />}
        label={t('Acceso completo para los agentes')}
        hint={access === 'full' ? t('Ejecutan comandos, instalan y usan internet sin pedir permiso') : t('Solo editan la carpeta del proyecto; no instalan ni usan internet')}
      >
        <Switch on={access === 'full'} label={t('Acceso completo para los agentes')} onChange={() => void call(() => api!.setAgentAccess(access === 'full' ? 'project' : 'full'))} />
      </Row>
      <Row
        icon={<UserCheck size={18} />}
        label={t('Pedir mi visto bueno a cada plan')}
        hint={approval ? t('Hermes te enseña qué hará cada agente y espera a que lo apruebes') : t('Las tareas empiezan en cuanto Hermes reparte el trabajo')}
      >
        <Switch on={approval} label={t('Pedir mi visto bueno a cada plan')} onChange={() => void call(() => api!.setPlanApproval(!approval))} />
      </Row>
      <Row icon={<RefreshCw size={18} className={cx(refreshing && u.spin)} />} label={t('Cuotas')} hint={t('Consultar de nuevo las cuotas')}>
        <ActionButton
          disabled={!live || refreshing}
          title={!live ? t('No disponible en modo demo') : undefined}
          onClick={() => {
            setRefreshing(true)
            void call(() => api!.refreshQuotas()).finally(() => setRefreshing(false))
          }}
        >
          {refreshing ? t('Actualizando cuotas…') : t('Actualizar cuotas')}
        </ActionButton>
      </Row>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </>
  )
}

function ConnectionTab({ openSub, client }: { openSub: (s: Sub) => void; client: boolean }) {
  const hasBackend = useCowork((st) => st.hasBackend)
  const where = useWhere()
  const actions = clientActions()
  const [confirmForget, setConfirmForget] = useState(false)
  const WhereIcon = where?.role === 'server' ? Server : where?.role === 'client' ? Monitor : Globe
  return (
    <>
      <Head title={t('Conexión')} hint={t('Dónde estás y cómo llegar a kywai desde otros equipos.')} />
      {where && (
        <Row
          icon={<WhereIcon size={18} />}
          label={`${ROLE_TITLE[where.role]}${where.role !== 'server' && where.host ? ` → ${where.host}` : where.host ? ` · ${where.host}` : ''}`}
          hint={explainWhere(where)}
        />
      )}
      {hasBackend && !isWeb && (
        <Row icon={<Smartphone size={18} />} label={t('Acceso desde otros dispositivos…')} hint={t('Usar kywai desde el móvil o el portátil (Tailscale)')}>
          <ActionButton onClick={() => openSub('remote')}>{t('Abrir')}</ActionButton>
        </Row>
      )}
      {hasBackend && isWeb && (
        <Row icon={<HardDrive size={18} />} label={t('Archivos del servidor…')} hint={t('Explorar su disco, abrir archivos y bajar carpetas como zip')}>
          <ActionButton
            onClick={() => {
              openSettings(null)
              openServerFiles()
            }}
          >
            {t('Abrir')}
          </ActionButton>
        </Row>
      )}
      {client && actions && (
        <>
          <Row icon={<FolderSync size={18} />} label={t('Sincronizar carpetas…')} hint={t('Mantener una carpeta de este equipo igual que una del servidor')}>
            <ActionButton onClick={() => openSub('sync')}>{t('Abrir')}</ActionButton>
          </Row>
          <Row icon={<ArrowLeftRight size={18} />} label={t('Cambiar de servidor…')} hint={t('Conectar este equipo con otro kywai')}>
            <ActionButton onClick={() => void actions.switchServer()}>{t('Cambiar')}</ActionButton>
          </Row>
          <Row icon={<LogOut size={18} />} label={t('Olvidar este dispositivo y desconectar')} hint={t('Deja de estar emparejado; para volver hará falta un código nuevo')}>
            <ActionButton danger onClick={() => (confirmForget ? void actions.forget() : setConfirmForget(true))}>
              {confirmForget ? t('Pulsa otra vez') : t('Olvidar')}
            </ActionButton>
          </Row>
        </>
      )}
    </>
  )
}

function AboutTab({ openSub }: { openSub: (s: Sub) => void }) {
  const hasBackend = useCowork((st) => st.hasBackend)
  const restart = useRestart()
  const client = clientActions()
  const [clientUpdate, setClientUpdate] = useState<ClientUpdateState | null>(null)
  const [busy, setBusy] = useState(false)
  const [clientVersion, setClientVersion] = useState<string | null>(null)

  useEffect(() => {
    if (client) void clientInfo().then((i) => setClientVersion(i?.version ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!client])

  /** Primer toque: busca una versión nueva en el servidor; si la hay, el segundo la descarga e instala. */
  async function updateThisDevice(): Promise<void> {
    if (!client?.checkUpdate || busy) return
    setBusy(true)
    try {
      if (clientUpdate?.state === 'available' && client.installUpdate) {
        await client.installUpdate()
        return
      }
      setClientUpdate(await client.checkUpdate())
    } catch (e) {
      setClientUpdate({ state: 'error', current: clientVersion ?? '', message: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const clientUpdateHint = !client?.checkUpdate
    ? t('Esta app es una versión anterior: instala la nueva una vez a mano')
    : busy
      ? t('Un momento…')
      : clientUpdate?.state === 'available'
        ? t('Hay la versión {latest}: pulsa otra vez para instalarla y reiniciar', { latest: clientUpdate.latest })
        : clientUpdate?.state === 'current'
          ? t('Tienes la última versión ({current}){message}', { current: clientUpdate.current, message: clientUpdate.message ? ` · ${clientUpdate.message}` : '' })
          : clientUpdate
            ? (clientUpdate.message ?? t('No se pudo comprobar'))
            : t('Versión instalada: {version} · se descarga de tu servidor', { version: clientVersion ?? '—' })

  return (
    <>
      <Head title={t('Acerca de')} hint={t('Versión, actualizaciones y reinicio.')} />
      {hasBackend && (
        <Row icon={<Download size={18} />} label={t('Buscar actualizaciones…')} hint={t('Descargar la última versión desde GitHub')}>
          <ActionButton onClick={() => openSub('update')}>{t('Buscar')}</ActionButton>
        </Row>
      )}
      {client && (
        <Row
          icon={<DownloadCloud size={18} />}
          label={clientUpdate?.state === 'available' ? t('Instalar la versión nueva de este equipo') : t('Actualizar este equipo…')}
          hint={clientUpdateHint}
        >
          <ActionButton disabled={busy || !client.checkUpdate} onClick={() => void updateThisDevice()}>
            {clientUpdate?.state === 'available' ? t('Instalar') : t('Comprobar')}
          </ActionButton>
        </Row>
      )}
      {client && (
        <Row icon={<RotateCw size={18} />} label={t('Recargar la interfaz')} hint={t('Vuelve a cargarla desde el servidor (Ctrl+R)')}>
          <ActionButton onClick={() => void client.reload()}>{t('Recargar')}</ActionButton>
        </Row>
      )}
      {hasBackend && (
        <Row
          icon={<RotateCcw size={18} />}
          label={t('Reiniciar kywai')}
          hint={restart.confirming ? t('Se detendrán las tareas en curso') : t('Por si se queda pillada: la cierra y la vuelve a abrir')}
        >
          <ActionButton danger={restart.confirming} onClick={restart.run}>
            {restart.confirming ? t('Pulsa otra vez para reiniciar') : t('Reiniciar')}
          </ActionButton>
        </Row>
      )}
      <Row icon={<Coffee size={18} />} label={t('Apoyar kywai ☕')} hint={t('Si te gusta la app, invítame a un café en Ko-fi')}>
        <ActionButton onClick={openDonate}>Ko-fi</ActionButton>
      </Row>
    </>
  )
}

export function openDonate(): void {
  if (api) void api.openExternal(DONATE_URL).catch(() => {})
  else window.open(DONATE_URL, '_blank', 'noopener')
}

/** Reiniciar pide un segundo toque (detiene las tareas en curso); el aviso caduca solo. */
export function useRestart(onRestart?: () => void): { confirming: boolean; run: () => void } {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const id = window.setTimeout(() => setConfirming(false), 5000)
    return () => window.clearTimeout(id)
  }, [confirming])
  return {
    confirming,
    run: () => {
      const a = api
      if (!a) return
      if (!confirming) return setConfirming(true)
      setConfirming(false)
      onRestart?.()
      useCowork.setState({ restarting: true, settingsTab: null })
      a.restartApp().catch(() => {
        // Desde el navegador la conexión puede cortarse justo al reiniciar: es lo esperado.
      })
    }
  }
}
