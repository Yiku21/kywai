import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { FlaskConical } from 'lucide-react'
import { api, isWeb } from '@/lib/api'
import { initAudio } from '@/lib/audio'
import { lastProjectId, useCowork } from '@/store/cowork'
import { demoEngine } from '@/demo/engine'
import { SceneLabels } from '@/scene/SceneLabels'
import { Header } from '@/ui/Header'
import { LeftPanel } from '@/ui/left/LeftPanel'
import { ChatResizer } from '@/ui/left/ChatResizer'
import { readChatWidth, saveChatWidth, TABS_QUERY } from '@/ui/left/chatWidth'
import { ArtifactViewer } from '@/ui/ArtifactViewer'
import { SetupWizard } from './ui/setup/SetupWizard'
import { RestartOverlay } from './ui/RestartOverlay'
import { UsageDialog } from './ui/usage/UsageDialog'
import { QualityDialog } from './ui/usage/QualityDialog'
import { ServerFiles } from './ui/files/ServerFiles'
import { TaskTraceDialog } from './ui/trace/TaskTraceDialog'
import { SpaceHeader } from '@/ui/space/SpaceHeader'
import { BottomBar } from '@/ui/space/BottomBar'
import { SelectionPanel } from '@/ui/space/SelectionPanel'
import { MusicPanel } from '@/ui/space/MusicPanel'
import { HermesModelDialog } from '@/ui/space/HermesModelDialog'
import { useTheme } from '@/lib/theme'
import { useMediaQuery } from '@/ui/common/hooks'
import s from './App.module.css'
import { lang, t } from '@/lib/i18n'

// El espacio 3D (Three.js y compañía, la mayor parte del código) se carga aparte: el chat aparece sin esperarlo.
const World = lazy(() => import('@/scene/World').then((m) => ({ default: m.World })))

/** Conecta con el motor de agentes (Electron) o arranca la demo si no hay motor. */
function useBoot(): void {
  useEffect(() => {
    if (!api) return
    const st = useCowork.getState()
    const off = api.onEvent((e) => useCowork.getState().applyEvent(e))
    let alive = true
    ;(async () => {
      const [config, runtime, projects] = await Promise.all([api.getConfig(), api.getRuntime(), api.listProjects()])
      if (!alive) return
      st.hydrateLive(config, runtime.runtimes, runtime.quotas)
      // El motor aún no sabe en qué idioma escribir los avisos y las respuestas: el de esta interfaz.
      if (!config.language) api.setLanguage?.(lang()).catch(() => {})
      st.setProjects(projects)
      // Bandeja «Te necesita» (lo nuevo llega por eventos inbox.updated).
      api.listInbox().then(
        (list) => {
          if (alive) useCowork.setState({ inbox: list.filter((i) => !i.resolvedAt) })
        },
        () => undefined
      )
      // Registro de consumo (para el resumen bajo cada plan y el panel ⋮ → Consumo).
      api.getUsageRuns().then(
        (list) => {
          if (!alive) return
          const usageRuns = { ...useCowork.getState().usageRuns }
          for (const r of list) usageRuns[r.runId] ??= r
          useCowork.setState({ usageRuns })
        },
        () => undefined
      )
      // Se vuelve al último proyecto abierto; si ya no existe, al más reciente.
      const last = lastProjectId()
      const first = projects.find((p) => p.id === last) ?? projects[0]
      if (first) {
        const state = await api.loadProject(first.id)
        if (alive) useCowork.getState().loadProjectState(state)
      }
    })().catch((err) => console.error('No se pudo conectar con el motor de agentes', err))
    return () => {
      alive = false
      off()
    }
  }, [])

  // La demo arranca al entrar en modo Demo (si está vacía) y se detiene al salir.
  const mode = useCowork((st) => st.mode)
  useEffect(() => {
    if (mode === 'demo') {
      if (useCowork.getState().demo.messages.length === 0 && !demoEngine.getState().running) demoEngine.start()
    } else demoEngine.stop()
  }, [mode])
}

export function App() {
  useEffect(initAudio, [])
  useBoot()
  const mode = useCowork((st) => st.mode)
  const expanded = useCowork((st) => st.spaceExpanded)
  const mobileView = useCowork((st) => st.mobileView)
  // Primer arranque en este equipo (o abierto desde el menú ⋮): asistente de configuración.
  // Solo en el propio equipo: instala programas y abre ventanas de inicio de sesión allí.
  const restarting = useCowork((st) => st.restarting)
  const usageOpen = useCowork((st) => st.usageOpen)
  const qualityOpen = useCowork((st) => st.qualityOpen)
  const hermesModelOpen = useCowork((st) => st.hermesModelOpen)
  const showSetup = useCowork((st) => !isWeb && st.hasBackend && st.configLoaded && (!st.config.setupDone || st.setupOpen))
  // Tema Órbita: el espacio 3D ocupa toda la ventana y la interfaz flota encima como cristal esmerilado.
  const glass = useTheme() === 'orbita'
  // Ventana estrecha: el chat ocupa todo y el 3D pasa a la pestaña «Espacio» de la cabecera (el chat manda).
  const narrow = useMediaQuery(TABS_QUERY)
  const left = useRef<HTMLElement>(null)
  // Ancho del chat elegido arrastrando su borde (null = automático). Mientras se arrastra no hay animación.
  const [chatWidth, setChatWidth] = useState<number | null>(readChatWidth)
  const [resizing, setResizing] = useState(false)
  const onResize = (width: number | null, done: boolean): void => {
    setChatWidth(width)
    setResizing(!done)
    if (done) saveChatWidth(width)
  }
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const el = left.current
    if (!glass || !el) return
    const measure = (): void => setInset(expanded ? 0 : Math.round(el.getBoundingClientRect().right))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [glass, expanded])

  return (
    <div className={s.app}>
      {glass && (
        <div className={s.world}>
          {/* El centro del mundo, en la zona que deja libre el chat. */}
          <Suspense fallback={null}>
            <World view={narrow ? undefined : { left: inset, top: 140, bottom: 76 }} />
          </Suspense>
          <SceneLabels />
        </div>
      )}
      <Header />
      <div
        className={s.body}
        data-expanded={expanded}
        data-mobile={mobileView}
        data-custom-width={chatWidth != null || undefined}
        data-resizing={resizing || undefined}
        style={chatWidth != null ? ({ '--chat-w': `${chatWidth}px` } as CSSProperties) : undefined}
      >
        <div className={s.leftCol}>
          <aside ref={left} className={s.left} aria-label={t('Chat, archivos, tareas y resultados')} aria-hidden={expanded || undefined}>
            <LeftPanel />
          </aside>
          {!narrow && !expanded && <ChatResizer panel={left} width={chatWidth} onResize={onResize} />}
        </div>
        <section className={s.space} data-demo={mode === 'demo'} aria-label={t('Espacio digital')}>
          <SpaceHeader />
          <div className={s.stage}>
            {!glass && (
              <Suspense fallback={null}>
                <World />
              </Suspense>
            )}
            {!glass && <SceneLabels />}
            <SelectionPanel />
            <MusicPanel />
            {mode === 'demo' && (
              <div className={s.demoRibbon}>
                <FlaskConical size={13} aria-hidden="true" />
                {t('Demo · datos simulados')}
              </div>
            )}
          </div>
          <BottomBar />
        </section>
      </div>
      <ArtifactViewer />
      {showSetup && <SetupWizard />}
      {usageOpen && <UsageDialog onClose={() => useCowork.setState({ usageOpen: false })} />}
      {qualityOpen && <QualityDialog onClose={() => useCowork.setState({ qualityOpen: false })} />}
      <ServerFiles />
      {hermesModelOpen && <HermesModelDialog onClose={() => useCowork.setState({ hermesModelOpen: false })} />}
      <TaskTraceDialog />
      {restarting && <RestartOverlay />}
    </div>
  )
}
