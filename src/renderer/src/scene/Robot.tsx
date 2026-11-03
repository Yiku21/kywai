import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { AgentConfig, StationConfig } from '@shared/types'
import { avatarFor } from '@shared/defaults'
import { currentData, useCowork } from '@/store/cowork'
import { buildRobot } from './robotModel'
import { buildCostume } from './costumes'
import { palette } from './palette'
import { RobotBrain } from './robotBrain'
import { registry } from './registry'
import { GEO, checkTexture } from './assets'
import { ROBOT_Y, consoleOffset, consoleSide, coreBay, stationVec } from './layout'
import { setAnchorObject, setAnchorOpacity, useSceneHover } from './anchors'

/** Tamaño de los robots respecto a su modelo. */
const ROBOT_SCALE = 1.3

interface Props {
  agent: AgentConfig
  station: StationConfig
  stations: StationConfig[]
  leaving: boolean
}

const ERROR_EYE = new THREE.Color('#ff6b7a')
const OFF_EYE = new THREE.Color('#5d6a80')
const tmpColor = new THREE.Color()

export function Robot({ agent, station, stations, leaving }: Props) {
  const outer = useRef<THREE.Group>(null!)
  const indicators = useRef<THREE.Group>(null!)
  const thinkGroup = useRef<THREE.Group>(null!)
  const waitMesh = useRef<THREE.Mesh>(null!)
  const check = useRef<THREE.Sprite>(null!)
  const anchor = useRef<THREE.Group>(null!)
  const [hovered, setHovered] = useState(false)
  const hoverAmt = useRef(0)

  const avatar = avatarFor(agent)
  const avatarKey = JSON.stringify(avatar)
  const model = useMemo(() => buildRobot(avatar, agent.color), [avatarKey, agent.color]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => model.dispose(), [model])

  const brain = useMemo(() => new RobotBrain(agent.id), [agent.id])
  const reduced = useCowork((s) => s.reducedEffects)
  brain.reduced = reduced

  const indicatorMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(avatar.eyeColor).multiplyScalar(1.3), toneMapped: false }),
    [avatarKey] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const waitMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#a9bddb', transparent: true, opacity: 0.85 }), [])
  const checkMat = useMemo(
    () => new THREE.SpriteMaterial({ map: checkTexture, color: new THREE.Color('#5ff0a6').multiplyScalar(1.4), transparent: true, toneMapped: false, depthWrite: false }),
    []
  )
  useEffect(
    () => () => {
      indicatorMat.dispose()
      waitMat.dispose()
      checkMat.dispose()
    },
    [indicatorMat, waitMat, checkMat]
  )

  // Posiciones de referencia (estación, punto junto al núcleo, consola)
  useLayoutEffect(() => {
    brain.home.copy(stationVec(station, ROBOT_Y))
    brain.bay.copy(coreBay(station))
    brain.consolePos.copy(stationVec(station, ROBOT_Y + 0.1)).add(consoleOffset(station))
    brain.consoleSide = consoleSide(station)
  }, [brain, station])

  // Registro + aparición (sub-agentes)
  useEffect(() => {
    registry.brains.set(agent.id, brain)
    registry.stationAgent.set(station.id, agent.id)
    if (agent.isSubagent) brain.spawn(registry.time)
    return () => {
      if (registry.brains.get(agent.id) === brain) registry.brains.delete(agent.id)
      if (registry.stationAgent.get(station.id) === agent.id) registry.stationAgent.delete(station.id)
    }
  }, [agent.id, agent.isSubagent, brain, station.id])

  useEffect(() => {
    if (leaving) brain.leave(registry.time)
  }, [leaving, brain])

  useEffect(() => {
    if (leaving) return
    const id = `robot:${agent.id}`
    setAnchorObject(id, anchor.current)
    return () => setAnchorObject(id, null)
  }, [agent.id, leaving])

  // Estado real del agente → entradas del cerebro (sin renders de React).
  useEffect(() => {
    let last = ''
    const apply = () => {
      const d = currentData()
      const rt = d.runtimes[agent.id]
      const activity = rt?.activity ?? 'idle'
      const location = rt?.location ?? 'station'
      const waitFor = rt?.waitingFor ?? ''
      const sig = `${activity}|${location}|${waitFor}`
      if (sig === last) return
      last = sig
      let waitPos: THREE.Vector3 | null = null
      if (waitFor) {
        const other = d.agents[waitFor]
        const st = other && stations.find((x) => x.id === other.stationId)
        if (st) waitPos = stationVec(st, ROBOT_Y)
      }
      brain.setInputs(activity, location, waitPos, registry.time)
    }
    apply()
    return useCowork.subscribe(apply)
  }, [agent.id, brain, stations])

  useEffect(() => {
    model.root.traverse((o) => {
      if (o instanceof THREE.Sprite) o.raycast = () => {}
    })
  }, [model])

  // Disfraz del tema (gorro, bufanda o capa en Navidad y Halloween). Con gorro, las orejas o la antena se esconden.
  useEffect(() => {
    const costume = buildCostume(palette.decor, avatar)
    if (!costume) return
    model.root.add(costume.group)
    const hidden: THREE.Object3D[] = costume.hat ? [...model.ears, ...(model.antenna ? [model.antenna] : [])] : []
    hidden.forEach((o) => (o.visible = false))
    return () => {
      model.root.remove(costume.group)
      hidden.forEach((o) => (o.visible = true))
      costume.dispose()
    }
  }, [model]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((state, dt) => {
    const t = registry.time
    brain.update(t, dt, state.camera.position)
    const g = outer.current
    g.position.copy(brain.pos)
    const sc = Math.max(0.0001, brain.scale)
    g.scale.setScalar(sc * ROBOT_SCALE)
    g.visible = brain.scale > 0.01
    if (!leaving) setAnchorOpacity(`robot:${agent.id}`, brain.scale < 0.4 ? 0 : Math.min(1, (brain.scale - 0.4) / 0.4))

    hoverAmt.current += ((hovered ? 1 : 0) - hoverAmt.current) * Math.min(1, dt * 10)
    const h = hoverAmt.current

    const r = model.root
    r.rotation.set(brain.pitch, brain.yawWithSpin, brain.roll, 'YXZ')
    const sq = brain.squashY
    const hs = 1 + h * 0.04
    r.scale.set(hs / Math.sqrt(sq), hs * sq, hs / Math.sqrt(sq))

    // Ojos: apertura, mirada, expresión (feliz / error) por fundido de escala
    const open = Math.max(0.06, brain.eyeOpen)
    const happy = brain.eyeHappy
    const err = brain.eyeError
    const flatAmt = Math.max(err * 0.9, brain.offlineAmt * 0.8)
    const baseAmt = Math.max(0, 1 - happy - flatAmt)
    for (const e of model.eyes) {
      e.group.position.x = e.x + brain.eyeLookX * 0.035
      e.group.position.y = e.y + brain.eyeLookY * 0.028 + happy * 0.01
      e.group.rotation.z = -e.side * err * 0.32
      e.base.scale.set(Math.max(0.001, baseAmt), Math.max(0.001, baseAmt * open), 1)
      e.happy.scale.setScalar(Math.max(0.001, happy))
      e.flat.scale.set(Math.max(0.001, flatAmt), Math.max(0.001, flatAmt * (0.6 + 0.4 * open)), 1)
    }
    tmpColor.copy(model.eyeColor)
    if (err > 0.01) tmpColor.lerp(ERROR_EYE, err * 0.85)
    if (brain.offlineAmt > 0.01) tmpColor.lerp(OFF_EYE, brain.offlineAmt * 0.8)
    const eyeBoost = 1.25 + brain.glow * 1.6 + h * 0.4 - brain.restAmt * 0.45
    model.eyeMat.color.copy(tmpColor).multiplyScalar(eyeBoost)

    model.bodyMat.emissiveIntensity = 0.06 + brain.glow * 0.55 + h * 0.08
    if (model.logoMat) model.logoMat.opacity = 0.5 + brain.glow * 1.4 - brain.offlineAmt * 0.3
    model.thrusterMat.opacity = 0.18 + brain.glow * 1.1 - brain.restAmt * 0.12

    // Accesorios: movimiento secundario
    const w = Math.sin(t * 1.6 + brain.phase * 9)
    for (let i = 0; i < model.ears.length; i++) {
      const side = i === 0 ? -1 : 1
      const ear = model.ears[i]
      ear.rotation.z = -side * (0.1 + brain.restAmt * 0.32 + w * 0.035 * (reduced ? 0.3 : 1)) - brain.roll * 0.6
      ear.rotation.x = brain.restAmt * 0.35 - brain.ackAmt * 0.3 + brain.pitch * -0.4
    }
    if (model.antenna) {
      model.antenna.rotation.z = -brain.roll * 1.4 + w * 0.06 * (reduced ? 0.3 : 1)
      model.antenna.rotation.x = -brain.pitch * 0.9
      if (model.antennaMat) {
        const blink = brain.visual === 'thinking' || brain.visual === 'working' ? 0.5 + 0.5 * Math.sin(t * 5) : 0
        model.antennaMat.emissiveIntensity = 0.6 + brain.glow * 1.5 + blink * 0.8
      }
    }
    if (model.tuft) {
      model.tuft.rotation.z = -brain.roll * 0.7 + w * 0.04 * (reduced ? 0.3 : 1) - brain.restAmt * 0.12
      model.tuft.rotation.x = -brain.pitch * 0.5
    }
    if (model.halo) {
      // Flota y se mece; brilla más al pensar o trabajar y se apaga al reposar.
      model.halo.position.y = model.top - 0.08 + Math.sin(t * 1.3 + brain.phase * 7) * 0.02 * (reduced ? 0.3 : 1) - brain.restAmt * 0.05
      model.halo.rotation.y = brain.roll * 0.8
      model.halo.rotation.z = w * 0.05 * (reduced ? 0.3 : 1)
      if (model.haloMat) model.haloMat.opacity = 0.55 + brain.glow * 0.8 - brain.restAmt * 0.25 - brain.offlineAmt * 0.4
    }

    // Indicadores sobre la cabeza
    indicators.current.quaternion.copy(state.camera.quaternion)
    const th = brain.thinkingAmt
    thinkGroup.current.visible = th > 0.02
    thinkGroup.current.scale.setScalar(Math.max(0.001, th))
    thinkGroup.current.children.forEach((c, i) => {
      const a = t * (reduced ? 1.2 : 2.4) + (i * Math.PI * 2) / 3
      c.position.set(Math.cos(a) * 0.17, Math.sin(t * 4 + i) * 0.03, Math.sin(a) * 0.17)
    })
    thinkGroup.current.rotation.x = 0.5
    const wa = brain.waitingAmt
    waitMesh.current.visible = wa > 0.02
    waitMesh.current.scale.setScalar(Math.max(0.001, wa))
    waitMesh.current.rotation.z -= dt * (reduced ? 0.8 : 1.8)
    const ck = brain.checkAmt
    check.current.visible = ck > 0.02
    check.current.scale.setScalar(Math.max(0.001, ck * 0.4))
    check.current.position.y = 0.05 + ck * 0.12
    checkMat.opacity = ck
  })

  const labelY = model.top + 0.78

  return (
    <group ref={outer}>
      <primitive
        object={model.root}
        onPointerOver={(e: { stopPropagation(): void }) => {
          e.stopPropagation()
          setHovered(true)
          useSceneHover.getState().set(agent.id)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          if (useSceneHover.getState().agentId === agent.id) useSceneHover.getState().set(null)
          document.body.style.cursor = ''
        }}
        onClick={(e: { stopPropagation(): void }) => {
          e.stopPropagation()
          useCowork.getState().select({ type: 'agent', id: agent.id })
        }}
      />
      <group ref={indicators} position={[0, model.top + 0.2, 0]}>
        <group ref={thinkGroup}>
          <mesh geometry={GEO.thinkDot} material={indicatorMat} />
          <mesh geometry={GEO.thinkDot} material={indicatorMat} />
          <mesh geometry={GEO.thinkDot} material={indicatorMat} />
        </group>
        <mesh ref={waitMesh} geometry={GEO.waitArc} material={waitMat} />
        <sprite ref={check} material={checkMat} />
      </group>
      <group ref={anchor} position={[0, labelY, 0]} />
    </group>
  )
}
