import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import { sceneBus } from '@/lib/bus'
import { currentData, useCowork } from '@/store/cowork'
import { glowTexture } from './assets'
import { registry } from './registry'
import { ROBOT_Y, stationVec } from './layout'
import { glowBlending } from './palette'

const POOL = 18
const FLIGHT = 0.85
const CORE = new THREE.Vector3(0, 1.55, 0)
/** Como mucho una chispa cada tanto por agente: un agente que lanza 40 comandos seguidos no llena la escena. */
const MIN_GAP = 0.35

interface Spark {
  from: THREE.Vector3
  to: THREE.Vector3
  start: number
  color: THREE.Color
  colorHex: string
  live: boolean
}

/**
 * Una chispa por cada paso real de un agente (un comando, un archivo que lee o edita, lo que escribe): sale de su
 * robot y vuela al proyecto, que late al recibirla. Viene de los registros de la tarea, nunca de un temporizador:
 * si el agente no hace nada, no sale ninguna.
 */
export function Sparks({ stations }: { stations: StationConfig[] }) {
  const reduced = useCowork((st) => st.reducedEffects)
  const group = useRef<THREE.Group>(null)
  const sparks = useMemo<Spark[]>(
    () => Array.from({ length: POOL }, () => ({ from: new THREE.Vector3(), to: new THREE.Vector3(), start: 0, color: new THREE.Color(), colorHex: '#fff', live: false })),
    []
  )
  const materials = useMemo(
    () => sparks.map(() => new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: glowBlending() })),
    [sparks]
  )
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])
  const lastByAgent = useRef(new Map<string, number>())
  const stationsRef = useRef(stations)
  stationsRef.current = stations

  useEffect(() => {
    if (reduced) return
    return sceneBus.on((e) => {
      if (e.kind !== 'task.trace') return
      const task = currentData().tasks[e.taskId]
      const agent = task && currentData().agents[task.agentId]
      if (!task || !agent || task.status !== 'running') return
      const now = registry.time
      if (now - (lastByAgent.current.get(agent.id) ?? -9) < MIN_GAP) return
      lastByAgent.current.set(agent.id, now)
      const brain = registry.brains.get(agent.id)
      const st = stationsRef.current.find((x) => x.id === agent.stationId)
      const from = brain ? brain.pos.clone().add(new THREE.Vector3(0, 0.35, 0)) : st ? stationVec(st, ROBOT_Y + 0.35) : null
      if (!from) return
      const slot = sparks.find((s) => !s.live) ?? sparks.reduce((a, b) => (a.start < b.start ? a : b))
      slot.from.copy(from)
      slot.to.copy(CORE)
      slot.start = now
      slot.color.set(agent.color)
      slot.colorHex = agent.color
      slot.live = true
    })
  }, [reduced, sparks])

  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const g = group.current
    if (!g) return
    const now = registry.time
    sparks.forEach((s, i) => {
      const sprite = g.children[i] as THREE.Sprite
      if (!s.live) {
        sprite.visible = false
        return
      }
      const k = (now - s.start) / FLIGHT
      if (k >= 1) {
        s.live = false
        sprite.visible = false
        registry.core?.pulse(s.colorHex, 0.35)
        return
      }
      // Arco: sube por encima de la línea recta y cae en el proyecto, acelerando al final.
      const e = k * k * (3 - 2 * k)
      tmp.lerpVectors(s.from, s.to, e)
      tmp.y += Math.sin(Math.PI * k) * 0.9
      sprite.position.copy(tmp)
      const size = 0.32 * (1 - 0.4 * k)
      sprite.scale.set(size, size, size)
      materials[i].color.copy(s.color)
      sprite.visible = true
    })
  })

  if (reduced) return null
  return (
    <group ref={group}>
      {sparks.map((_, i) => (
        <sprite key={i} visible={false} material={materials[i]} />
      ))}
    </group>
  )
}
