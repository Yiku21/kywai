import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import type { AgentConfig, StationConfig } from '@shared/types'
import { useCowork, useData } from '@/store/cowork'
import { musicLightLevel } from '@/lib/music'
import { useTheme } from '@/lib/theme'
import { sceneQuality, useQuality } from './quality'
import { registry } from './registry'
import { Ambient } from './Ambient'
import { Backdrop } from './Backdrop'
import { Circuits } from './Circuits'
import { Zones } from './Zones'
import { Decor } from './Decor'
import { FOG_FAR, FOG_NEAR, palette } from './palette'
import { Core } from './Core'
import { Station } from './Station'
import { Robot } from './Robot'
import { Transfers } from './Transfers'
import { CameraRig } from './CameraRig'
import { LabelProjector } from './LabelProjector'
import { t } from '@/lib/i18n'

/**
 * Reloj de la escena y pulso de la música: se actualizan antes que cualquier otra animación.
 * El reloj solo avanza: react-three-fiber pone su `clock.elapsedTime` a 0 cada vez que cambia el frameloop
 * (pestaña oculta/visible, foco/sin foco), y si la escena lo usara el tiempo retrocedería y las animaciones en
 * curso se descontrolarían (un archivo que ya había llegado salía gigante y tardaba minutos en encogerse).
 * Cada paso se limita a 0,25 s para que, al volver tras un rato fuera, las animaciones sigan donde se quedaron.
 */
function SceneClock() {
  useFrame((_, delta) => {
    registry.time += Math.min(Math.max(delta, 0), 0.25)
    registry.beat = musicLightLevel(performance.now(), useCowork.getState().reducedEffects)
  }, -100)
  return null
}

function Stations({ stations, showLights }: { stations: StationConfig[]; showLights: boolean }) {
  const agents = useData((d) => d.agents)
  const byStation = useMemo(() => {
    const m: Record<string, AgentConfig> = {}
    for (const a of Object.values(agents)) m[a.stationId] = a
    return m
  }, [agents])
  return (
    <>
      {stations.map((st) => (
        <Station key={st.id} station={st} occupant={byStation[st.id]} showLight={showLights} />
      ))}
    </>
  )
}

function Robots({ stations }: { stations: StationConfig[] }) {
  const agents = useData((d) => d.agents)
  const order = useData((d) => d.agentOrder)
  const [leaving, setLeaving] = useState<Record<string, AgentConfig>>({})
  const prev = useRef<Record<string, AgentConfig>>({})

  // Los agentes eliminados (sub-agentes que terminan) salen con una animación antes de desmontarse.
  useEffect(() => {
    const removed = Object.values(prev.current).filter((a) => !agents[a.id] && a.isSubagent)
    prev.current = agents
    if (!removed.length) return
    setLeaving((l) => ({ ...l, ...Object.fromEntries(removed.map((a) => [a.id, a])) }))
    const timer = window.setTimeout(() => {
      setLeaving((l) => {
        const c = { ...l }
        removed.forEach((a) => delete c[a.id])
        return c
      })
    }, 900)
    return () => window.clearTimeout(timer)
  }, [agents])

  const list = [
    ...order.map((id) => agents[id]).filter(Boolean).map((agent) => ({ agent, leaving: false })),
    ...Object.values(leaving)
      .filter((a) => !agents[a.id])
      .map((agent) => ({ agent, leaving: true }))
  ]

  return (
    <>
      {list.map(({ agent, leaving: isLeaving }) => {
        const st = stations.find((s) => s.id === agent.stationId)
        if (!st) return null
        return <Robot key={agent.id} agent={agent} station={st} stations={stations} leaving={isLeaving} />
      })}
    </>
  )
}

/**
 * Lo que tapa la interfaz por cada lado cuando el mundo ocupa toda la ventana (tema Órbita): el chat a la izquierda,
 * las barras arriba y abajo. El mundo se centra y se encuadra en la zona libre.
 */
export interface ViewInsets {
  left: number
  top: number
  bottom: number
}

/**
 * Centra lo que se ve en la zona libre sin mover la cámara (desplaza la proyección). Las etiquetas y los clics usan la
 * misma proyección, así que siguen en su sitio.
 */
function ViewShift({ view }: { view?: ViewInsets }) {
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera
  const size = useThree((st) => st.size)
  const x = view ? view.left / 2 : 0
  const y = view ? (view.top - view.bottom) / 2 : 0
  useEffect(() => {
    if (x || y) camera.setViewOffset(size.width, size.height, -x, -y, size.width, size.height)
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height, x, y])
  return null
}

/** Fotogramas por segundo con la ventana sin foco (sigue viéndose moverse, pero gasta mucho menos). */
const IDLE_FPS = 20

/** Sin foco, la escena se dibuja a [IDLE_FPS] en vez de a la frecuencia de la pantalla. */
function IdleFrames({ active }: { active: boolean }) {
  const invalidate = useThree((st) => st.invalidate)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => invalidate(), 1000 / IDLE_FPS)
    return () => window.clearInterval(id)
  }, [active, invalidate])
  return null
}

/** ¿Tiene foco la ventana? (un iframe propio, como el reproductor de música, cuenta como foco). */
function useWindowFocus(): boolean {
  const [focused, setFocused] = useState(() => document.hasFocus())
  useEffect(() => {
    const update = () => window.setTimeout(() => setFocused(document.hasFocus()), 0)
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    return () => {
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
    }
  }, [])
  return focused
}

/** Espacio digital 3D. [view]: lo que tapa la interfaz cuando ocupa toda la ventana (tema Órbita). */
export function World({ view }: { view?: ViewInsets } = {}) {
  const level = useQuality((s) => s.level)
  const lower = useQuality((s) => s.lower)
  const raise = useQuality((s) => s.raise)
  const max = useQuality((s) => s.max)
  const q = useMemo(() => sceneQuality(level, max), [level, max])
  const reduced = useCowork((s) => s.reducedEffects)
  const stations = useCowork((s) => s.config.stations)
  const [visible, setVisible] = useState(() => !document.hidden)
  const focused = useWindowFocus()
  // Cada tema tiene sus colores (palette.ts, ya aplicados al cambiarlo): la escena se vuelve a montar con ellos.
  const theme = useTheme()
  const p = palette
  const L = p.lights

  // Pausa total cuando la ventana o pestaña está oculta.
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return (
    <Canvas
      dpr={q.dpr}
      frameloop={!visible ? 'never' : focused ? 'always' : 'demand'}
      camera={{ fov: 30, position: [0, 15.4, 19.8], near: 0.5, far: 150 }}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false }}
      onPointerMissed={() => useCowork.getState().select(null)}
      aria-label={t('Espacio digital con los agentes trabajando')}
    >
      <color key={`bg-${theme}`} attach="background" args={[p.bg]} />
      <fog key={`fog-${theme}`} attach="fog" args={[p.fog, FOG_NEAR, FOG_FAR]} />
      <SceneClock />
      <IdleFrames active={visible && !focused} />
      {/* Solo mide con foco: a [IDLE_FPS] bajaría la calidad sin motivo. */}
      {focused && <PerformanceMonitor onDecline={lower} onIncline={raise} flipflops={3} bounds={() => [42, 58]} />}

      <group key={theme}>
        <hemisphereLight args={[L.sky, L.ground, L.hemi]} />
        <ambientLight intensity={L.ambientI} color={L.ambient} />
        <directionalLight position={[-7, 14, 9]} intensity={L.keyI} color={L.key} />
        <directionalLight position={[8, 6, -6]} intensity={L.fillI} color={L.fill} />

        {/* Entorno para reflejos de los visores (generado localmente, sin descargas) */}
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" intensity={1.3} color={L.env[0]} position={[0, 4, 6]} scale={[9, 2.2, 1]} />
          <Lightformer form="rect" intensity={1.2} color={L.env[1]} position={[-6, 2, 1]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} />
          <Lightformer form="ring" intensity={0.9} color={L.env[2]} position={[5, 5, -3]} scale={2.5} />
          <Lightformer form="rect" intensity={0.6} color={L.env[3]} position={[0, -3, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        </Environment>

        <Backdrop reduced={reduced} />
        <Ambient q={q} reduced={reduced} />
        <Circuits stations={stations} reduced={reduced} />
        <Zones />
        <Core />
        <Stations stations={stations} showLights={q.stationLights} />
        <Transfers stations={stations} />
        <Robots stations={stations} />
        <Decor stations={stations} q={q} reduced={reduced} />
      </group>
      <CameraRig view={view} />
      <ViewShift view={view} />
      <LabelProjector />

      {q.bloom && (
        <EffectComposer multisampling={q.msaa} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={(reduced ? 0.35 : 0.55) * (p.light ? 0.5 : 1) * (p.bloom ?? 1)} luminanceThreshold={1} luminanceSmoothing={0.18} radius={0.6} />
          <Vignette offset={0.28} darkness={p.vignette} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
