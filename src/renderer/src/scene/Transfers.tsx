import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { StationConfig, Transfer } from '@shared/types'
import { sceneBus } from '@/lib/bus'
import { currentData, useCowork } from '@/store/cowork'
import { GEO, docTexture, glowTexture } from './assets'
import { arcFrag, holoVert, traceFrag } from './shaders'
import { registry } from './registry'
import { useLabelOverrides } from './labelStore'
import { useBubbles } from './bubbleStore'
import { setAnchorObject } from './anchors'
import { usePackets, type PacketSpec, type Trace } from './packetStore'
import { ROBOT_Y, hash01, stationTracePoints, stationVec } from './layout'
import { glowBlending, onPalette, palette, tone } from './palette'
import { GlowPoints } from './GlowPoints'
import { t } from '@/lib/i18n'

const CYAN = new THREE.Color()
onPalette(() => CYAN.set(tone('#4f8dff')))
const CORE_TOP = new THREE.Vector3(0, 1.55, 0)

function easeInOut(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

function agentPos(id: string, stations: StationConfig[]): THREE.Vector3 | null {
  const brain = registry.brains.get(id)
  if (brain) return brain.pos.clone().add(new THREE.Vector3(0, 0.1, 0))
  const a = currentData().agents[id]
  const st = a && stations.find((x) => x.id === a.stationId)
  return st ? stationVec(st, ROBOT_Y) : null
}

function stationOf(id: string, stations: StationConfig[]): StationConfig | undefined {
  const a = currentData().agents[id]
  return a ? stations.find((x) => x.id === a.stationId) : undefined
}

export function Transfers({ stations }: { stations: StationConfig[] }) {
  const reduced = useCowork((st) => st.reducedEffects)
  const mode = useCowork((st) => st.mode)
  const packets = usePackets((st) => st.list)
  const seen = useRef(new Set<string>())
  const lane = useRef(0)

  const traces = useMemo<Trace[]>(
    () =>
      stations.map((st) => {
        const curve = new THREE.CatmullRomCurve3(stationTracePoints(st), false, 'centripetal')
        const geo = new THREE.TubeGeometry(curve, 90, 0.028, 6, false)
        const mat = new THREE.ShaderMaterial({
          vertexShader: holoVert,
          fragmentShader: traceFrag,
          transparent: true,
          depthWrite: false,
          blending: glowBlending(),
          uniforms: {
            uTime: { value: 0 },
            uBase: { value: CYAN.clone() },
            uActiveColor: { value: CYAN.clone() },
            uActive: { value: 0 },
            uPhase: { value: hash01(st.id) },
            uAmbient: { value: 1 },
            uLen: { value: curve.getLength() },
            uDir: { value: 1 }
          }
        })
        return { stationId: st.id, geo, mat, users: 0, color: CYAN.clone(), dir: 1 }
      }),
    [stations]
  )
  useEffect(
    () => () =>
      traces.forEach((t) => {
        t.geo.dispose()
        t.mat.dispose()
      }),
    [traces]
  )

  const spawn = useCallback(
    (tr: Transfer) => {
      // Un mismo evento nunca se anima dos veces.
      if (seen.current.has(tr.id)) return
      seen.current.add(tr.id)
      const d = currentData()
      const fromAgent = tr.fromId !== 'core' && tr.fromId !== 'user' ? d.agents[tr.fromId] : undefined
      const color = new THREE.Color(fromAgent?.color ?? tone(tr.fromId === 'user' ? '#dfe8ff' : '#38d6ff'))
      const fromIsCore = tr.fromId === 'core' || tr.fromId === 'user'
      const toIsCore = tr.toId === 'core'
      const fromPos = fromIsCore ? CORE_TOP.clone() : agentPos(tr.fromId, stations)
      const toPos = toIsCore ? CORE_TOP.clone() : agentPos(tr.toId, stations)
      if (!fromPos || !toPos) return

      let curve: THREE.Curve<THREE.Vector3>
      let arc: PacketSpec['arc'] = null
      let trace: Trace | null = null
      if (fromIsCore !== toIsCore) {
        // Núcleo ↔ agente: recorre la conexión del suelo de esa estación.
        const agentId = fromIsCore ? tr.toId : tr.fromId
        const st = stationOf(agentId, stations)
        trace = (st && traces.find((t) => t.stationId === st.id)) || null
        const pts = st ? stationTracePoints(st).map((p) => new THREE.Vector3(p.x, 0.55, p.z)) : []
        const robot = fromIsCore ? toPos : fromPos
        const path = [robot, ...pts, CORE_TOP.clone()]
        if (fromIsCore) path.reverse()
        curve = new THREE.CatmullRomCurve3(path, false, 'centripetal', 0.3)
        if (trace) {
          trace.users++
          trace.color.copy(color)
          trace.dir = fromIsCore ? -1 : 1
        }
      } else {
        // Agente ↔ agente: arco luminoso elevado; carriles distintos si hay varias a la vez.
        const a = fromPos.clone().add(new THREE.Vector3(0, 0.55, 0))
        const b = toPos.clone().add(new THREE.Vector3(0, 0.55, 0))
        const l = lane.current++ % 3
        const mid = a.clone().add(b).multiplyScalar(0.5)
        mid.y += 1.6 + a.distanceTo(b) * 0.12 + l * 0.55
        curve = new THREE.QuadraticBezierCurve3(a, mid, b)
        arc = { geo: new THREE.TubeGeometry(curve, 72, 0.02, 6, false), len: curve.getLength() }
      }
      const duration = THREE.MathUtils.clamp(curve.getLength() / 4.6, 1.5, 3.0)
      const now = registry.time
      const toAgent = toIsCore ? null : tr.toId

      // El emisor se orienta y emite; el receptor mira lo que llega.
      if (!fromIsCore) registry.brains.get(tr.fromId)?.onSend(toPos, now)
      if (toAgent) registry.brains.get(toAgent)?.onExpect(fromPos, now, now + duration)
      if (!fromIsCore) {
        const st = stationOf(tr.fromId, stations)
        if (st) registry.stations.get(st.id)?.pulse(color.getStyle(), 0.45)
      } else registry.core?.pulse(color.getStyle(), 0.3)

      const overrides = useLabelOverrides.getState()
      if (!fromIsCore) overrides.set(tr.fromId, { text: t('Enviando: {title}', { title: tr.payload.title || tr.label }), tone: 'send' }, duration * 1000)
      if (toAgent) overrides.set(toAgent, { text: t('Recibiendo tarea'), tone: 'receive' }, duration * 1000 + 300)

      usePackets.getState().add({
        id: tr.id,
        transfer: tr,
        curve,
        duration,
        color,
        colorHex: `#${color.getHexString()}`,
        arc,
        trace,
        toAgent,
        toCore: toIsCore,
        shown: false,
        arrived: false
      })
    },
    [stations, traces]
  )

  // Eventos reales del sistema → animaciones (sin retrasar ni inventar nada).
  useEffect(
    () =>
      sceneBus.on((e) => {
        if (e.kind === 'transfer.started') spawn(e.transfer)
        else if (e.kind === 'task.completed') {
          registry.brains.get(e.agentId)?.onCelebrate(registry.time)
          registry.brains.get(e.agentId)?.onSay?.('done')
          const st = stationOf(e.agentId, stations)
          const agent = currentData().agents[e.agentId]
          if (st && agent) registry.stations.get(st.id)?.pulse(agent.color, 1)
          useLabelOverrides.getState().set(e.agentId, { text: t('Completado'), tone: 'done' }, 1800)
        }
      }),
    [spawn, stations]
  )

  // Al cambiar entre datos reales y demo se limpian las animaciones en curso.
  useEffect(() => {
    usePackets.getState().clear()
    traces.forEach((t) => (t.users = 0))
    useLabelOverrides.getState().clearAll()
    useBubbles.getState().clearAll()
  }, [mode, traces])

  const arrive = useCallback(
    (p: PacketSpec) => {
      const now = registry.time
      if (p.toAgent) {
        registry.brains.get(p.toAgent)?.onReceive(now)
        const st = stationOf(p.toAgent, stations)
        if (st) registry.stations.get(st.id)?.pulse(p.colorHex, 1)
        useLabelOverrides.getState().set(p.toAgent, { text: t('Recibido'), tone: 'done' }, 1300)
      } else if (p.toCore) registry.core?.pulse(p.colorHex, 1)
      if (p.trace) p.trace.users = Math.max(0, p.trace.users - 1)
    },
    [stations]
  )

  useFrame((_, dt) => {
    const t = registry.time
    for (const tr of traces) {
      const u = tr.mat.uniforms
      u.uTime.value = t
      u.uAmbient.value = reduced ? 0 : 1
      const target = tr.users > 0 ? 1 : 0
      u.uActive.value += (target - u.uActive.value) * Math.min(1, dt * (target ? 6 : 2.5))
      ;(u.uActiveColor.value as THREE.Color).copy(tr.color)
      u.uDir.value = tr.dir
    }
  })

  // Cuentas de luz por los caminos de cada estación al núcleo, si el tema las lleva.
  const beads = useMemo(() => {
    const b = palette.beads
    if (!b) return null
    const pos: number[] = []
    for (const st of stations) {
      const curve = new THREE.CatmullRomCurve3(stationTracePoints(st), false, 'centripetal')
      const n = Math.max(2, Math.round(curve.getLength() / b.spacing))
      for (const p of curve.getSpacedPoints(n)) pos.push(p.x, 0.07, p.z)
    }
    return pos
  }, [stations])

  return (
    <group>
      {traces.map((tr) => (
        <mesh key={tr.stationId} geometry={tr.geo} material={tr.mat} />
      ))}
      {beads && palette.beads && <GlowPoints positions={beads} color={palette.beads.color} intensity={2.4} size={palette.beads.size * 1.1} flicker={palette.beads.flicker} reduced={reduced} />}
      {packets.map((p) => (
        <Packet key={p.id} spec={p} onArrive={arrive} />
      ))}
    </group>
  )
}

function Packet({ spec, onArrive }: { spec: PacketSpec; onArrive(p: PacketSpec): void }) {
  const card = useRef<THREE.Group>(null!)
  const label = useRef<THREE.Group>(null!)
  const trail = useRef<THREE.Sprite[]>([])
  const start = useRef(registry.time)
  const arrivedAt = useRef<number | null>(null)
  const flags = useRef({ shown: false, finished: false })
  const specRef = useRef(spec)
  specRef.current = spec

  const mats = useMemo(() => {
    const cardMat = new THREE.MeshBasicMaterial({ map: docTexture, color: spec.color.clone().lerp(new THREE.Color('#ffffff'), 0.35).multiplyScalar(1.5), transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    const glow = new THREE.SpriteMaterial({ map: glowTexture, color: spec.color.clone(), blending: glowBlending(), transparent: true, depthWrite: false, opacity: 0.9 })
    const trailMat = new THREE.SpriteMaterial({ map: glowTexture, color: spec.color.clone(), blending: glowBlending(), transparent: true, depthWrite: false, opacity: 0.5 })
    const arcMat = spec.arc
      ? new THREE.ShaderMaterial({
          vertexShader: holoVert,
          fragmentShader: arcFrag,
          transparent: true,
          depthWrite: false,
          blending: glowBlending(),
          uniforms: { uTime: { value: 0 }, uColor: { value: spec.color.clone() }, uOpacity: { value: 0 }, uHead: { value: 0 }, uLen: { value: spec.arc.len } }
        })
      : null
    return { cardMat, glow, trailMat, arcMat }
  }, [spec.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      mats.cardMat.dispose()
      mats.glow.dispose()
      mats.trailMat.dispose()
      mats.arcMat?.dispose()
      specRef.current.arc?.geo.dispose()
    },
    [mats]
  )

  useEffect(() => {
    const id = `transfer:${spec.id}`
    setAnchorObject(id, label.current)
    return () => setAnchorObject(id, null)
  }, [spec.id])

  const pos = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    const sp = specRef.current
    const t = registry.time
    const p = (t - start.current) / sp.duration
    const e = easeInOut(Math.min(1, Math.max(0, p)))
    sp.curve.getPointAt(e, pos)
    card.current.position.copy(pos)
    card.current.quaternion.copy(state.camera.quaternion)
    if (p >= 0.06 && !flags.current.shown) {
      flags.current.shown = true
      usePackets.getState().patch(sp.id, { shown: true })
    }
    // La etiqueta se detiene antes del destino para no tapar la tarjeta del receptor.
    if (e < 0.8) label.current.position.copy(pos).add(new THREE.Vector3(0, 0.42, 0))

    trail.current.forEach((s, k) => {
      const ek = Math.max(0, e - (k + 1) * 0.022)
      sp.curve.getPointAt(ek, s.position)
      const sc = 0.32 - k * 0.05
      s.scale.set(sc, sc, 1)
      s.visible = e < 1 && ek > 0
    })

    if (mats.arcMat) {
      mats.arcMat.uniforms.uTime.value = t
      mats.arcMat.uniforms.uHead.value = e
      const fadeOut = arrivedAt.current !== null ? Math.max(0, 1 - (t - arrivedAt.current) / 0.9) : 1
      mats.arcMat.uniforms.uOpacity.value = Math.min(1, p * 4) * fadeOut
    }

    if (p >= 1 && arrivedAt.current === null) {
      arrivedAt.current = t
      onArrive(sp)
      usePackets.getState().patch(sp.id, { arrived: true })
    }
    if (arrivedAt.current !== null) {
      const k = Math.min(1, (t - arrivedAt.current) / 0.45)
      card.current.scale.setScalar(Math.max(0.001, 1 - k))
      if (t - arrivedAt.current > 1.4 && !flags.current.finished) {
        flags.current.finished = true
        usePackets.getState().remove(sp.id)
      }
    }
  })

  return (
    <group>
      {spec.arc && mats.arcMat && <mesh geometry={spec.arc.geo} material={mats.arcMat} />}
      <group ref={card}>
        <sprite material={mats.glow} scale={[0.95, 0.95, 1]} />
        <mesh geometry={GEO.packetCard} material={mats.cardMat} />
      </group>
      {[0, 1, 2, 3].map((k) => (
        <sprite
          key={k}
          ref={(s) => {
            if (s) trail.current[k] = s
          }}
          material={mats.trailMat}
          visible={false}
        />
      ))}
      <group ref={label} />
    </group>
  )
}
