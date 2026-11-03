import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { AgentConfig, StationConfig } from '@shared/types'
import { avatarFor } from '@shared/defaults'
import { useCowork } from '@/store/cowork'
import { GEO, glowTexture } from './assets'
import { holoFrag, holoVert } from './shaders'
import { registry, type PulseTarget } from './registry'
import { PLATFORM_Y, consoleSide, hash01 } from './layout'
import { glowBlending, onPalette, palette } from './palette'
import { GiftDressing, giftBase } from './navidad'
import { StoneDressing, pedestal, stoneMaterial } from './halloween'
import { GlassDressing, glassMaterial, glassTiers } from './relicario'
import { LoomSeat, invisibleMaterial } from './telar'

/** Aro de las plataformas (del tema; en el clásico, azul). */
const CYAN = new THREE.Color()

/** Un toro de 6 segmentos tiene los vértices girados 30° respecto a CylinderGeometry(…, 6): se compensa. */
export const HEX_RING_ROT: [number, number, number] = [Math.PI / 2, 0, Math.PI / 6]
const ERR = new THREE.Color('#ff5468')
const IDLE_ACCENT = new THREE.Color()

export const graphiteMat = new THREE.MeshStandardMaterial({ metalness: 0.55, roughness: 0.42 })
const topMat = new THREE.MeshStandardMaterial({ metalness: 0.5, roughness: 0.35 })
const lowRimMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.8 })
onPalette((p) => {
  CYAN.set(p.rim)
  IDLE_ACCENT.set(p.idle)
  graphiteMat.color.set(p.body)
  topMat.color.set(p.bodyTop)
  lowRimMat.color.set(p.rimLow).multiplyScalar(0.55)
})

const GIFT_BASE = giftBase(1.6, 0.5)

/** Contenido de las pantallas según el tipo de agente. */
function screenModes(agent?: AgentConfig): [number, number] {
  if (!agent) return [4, 1]
  switch (avatarFor(agent).logo) {
    case 'gemini':
      return [2, 1]
    case 'qwen':
      return [4, 1]
    case 'claude':
      return [3, 2]
    case 'openai':
      return [0, 1]
    case 'hermes':
      return [4, 2]
    case 'muse':
      return [2, 4]
    default:
      return [4, 2]
  }
}

function makeHoloMat(mode: number, seed: number, color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: holoVert,
    fragmentShader: holoFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: glowBlending(),
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: color.clone() },
      uActive: { value: 0 },
      uMode: { value: mode },
      uSeed: { value: seed },
      uOpacity: { value: 0.5 },
      uAmbient: { value: 1 }
    }
  })
}

interface Props {
  station: StationConfig
  occupant?: AgentConfig
  showLight: boolean
}

export function Station({ station, occupant, showLight }: Props) {
  const group = useRef<THREE.Group>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const [hovered, setHovered] = useState(false)
  const selected = useCowork(
    (s) =>
      (s.selection?.type === 'station' && s.selection.id === station.id) ||
      (s.selection?.type === 'agent' && !!occupant && s.selection.id === occupant.id)
  )
  const reduced = useCowork((s) => s.reducedEffects)
  // Navidad: la plataforma es un regalo (prisma recto con cintas, guirnalda y nieve); el aro del robot sube sobre la nieve.
  const gift = palette.decor === 'navidad'
  // Halloween: pedestal redondo de piedra tallada con velas y telarañas.
  const stone = palette.decor === 'halloween'
  // Relicario: tres discos de vidrio escalonados con filos de oro.
  const glass = palette.decor === 'relicario'
  // Telar: la estación es una silla de tela tejida (la base sigue ahí para pulsarla, pero no se ve).
  const loom = palette.decor === 'telar'
  const lift = gift ? 0.16 : stone || glass ? 0.04 : loom ? 0.2 : 0
  const phase = hash01(station.id)
  const side = consoleSide(station)
  const [x, z] = station.position

  // El brillo de la plataforma es el del agente (o sus remates metálicos, como el dorado de Hermes).
  const accent = useMemo(() => (occupant ? new THREE.Color(avatarFor(occupant).trimColor ?? occupant.color) : IDLE_ACCENT.clone()), [occupant])
  const modes = screenModes(occupant)

  const mats = useMemo(() => {
    const rim = new THREE.MeshBasicMaterial({ color: CYAN.clone(), toneMapped: false })
    const pad = new THREE.MeshBasicMaterial({ color: accent.clone(), toneMapped: false, transparent: true })
    const glow = new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: accent.clone(),
      transparent: true,
      blending: glowBlending(),
      depthWrite: false,
      opacity: 0.2
    })
    const pulses = [0, 1].map(
      () =>
        new THREE.MeshBasicMaterial({
          color: accent.clone(),
          transparent: true,
          blending: glowBlending(),
          depthWrite: false,
          side: THREE.DoubleSide,
          opacity: 0,
          toneMapped: false
        })
    )
    const screenColor = accent.clone().lerp(CYAN, 0.35)
    const screenA = makeHoloMat(modes[0], phase, screenColor)
    const screenB = makeHoloMat(modes[1], phase + 0.37, screenColor)
    return { rim, pad, glow, pulses, screenA, screenB }
  }, [accent, modes[0], modes[1], phase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      mats.rim.dispose()
      mats.pad.dispose()
      mats.glow.dispose()
      mats.pulses.forEach((m) => m.dispose())
      mats.screenA.dispose()
      mats.screenB.dispose()
    },
    [mats]
  )

  // Pulsos por eventos reales (inicio, recepción, finalización)
  const pulses = useRef([
    { start: -10, color: new THREE.Color(), strength: 1 },
    { start: -10, color: new THREE.Color(), strength: 1 }
  ])
  const nextPulse = useRef(0)
  const pulseMeshes = useRef<THREE.Mesh[]>([])
  useEffect(() => {
    const fx: PulseTarget = {
      pulse(color, strength = 1) {
        const p = pulses.current[nextPulse.current++ % 2]
        p.start = registry.time
        p.color.set(color)
        p.strength = strength
      }
    }
    registry.stations.set(station.id, fx)
    return () => {
      if (registry.stations.get(station.id) === fx) registry.stations.delete(station.id)
    }
  }, [station.id])

  const level = useRef(0.15)
  const tmp = useMemo(() => new THREE.Color(), [])

  useFrame((state, dt) => {
    const t = registry.time
    const brain = occupant ? registry.brains.get(occupant.id) : undefined
    const target = brain ? brain.stationLevel : 0.1
    level.current += (target - level.current) * Math.min(1, dt * 4)
    const lv = level.current
    const hov = hovered || selected ? 1 : 0

    const lev = reduced ? 0 : Math.sin(t * 0.55 + phase * 6.28) * 0.028
    group.current.position.y = PLATFORM_Y + lev

    let boost = 0
    pulses.current.forEach((p, i) => {
      const m = pulseMeshes.current[i]
      if (!m) return
      const k = (t - p.start) / 0.95
      if (k >= 0 && k < 1) {
        m.visible = true
        m.scale.setScalar(1 + k * 0.85)
        const mat = m.material as THREE.MeshBasicMaterial
        mat.color.copy(p.color).multiplyScalar(1.6)
        mat.opacity = (1 - k) * (1 - k) * 0.85 * p.strength
        boost += (1 - k) * p.strength
      } else m.visible = false
    })

    boost += registry.beat * 0.55
    const err = brain?.visual === 'error' ? 1 : 0
    tmp.copy(CYAN).lerp(accent, 0.85)
    if (err) tmp.lerp(ERR, 0.55)
    mats.rim.color.copy(tmp).multiplyScalar(0.7 + lv * 1.3 + boost * 1.2 + hov * 0.6)
    mats.pad.color.copy(err ? ERR : accent).multiplyScalar(0.25 + lv * 1.8 + boost + hov * 0.5)
    mats.pad.opacity = 0.45 + lv * 0.5
    mats.glow.opacity = 0.16 + lv * 0.3 + boost * 0.2
    for (const m of [mats.screenA, mats.screenB]) {
      m.uniforms.uTime.value = t
      m.uniforms.uActive.value = Math.min(1, lv)
      m.uniforms.uOpacity.value = 0.22 + Math.min(1, lv * 1.4) * 0.78 + hov * 0.15
      m.uniforms.uAmbient.value = reduced ? 0 : 1
    }
    if (light.current) {
      light.current.intensity = 0.15 + lv * 2.2 + boost * 2
      light.current.color.copy(err ? ERR : accent)
    }
  })

  const onOver = (e: { stopPropagation(): void }) => {
    e.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    setHovered(false)
    document.body.style.cursor = ''
  }
  const onClick = (e: { stopPropagation(): void }) => {
    e.stopPropagation()
    const s = useCowork.getState()
    s.select({ type: 'station', id: station.id })
    s.cameraCommand({ type: 'focus', x, z })
  }

  const screenPos: [number, number, number] = [side * 1.02, 1.12, -0.42]
  const screenYaw = Math.atan2(-screenPos[0], -screenPos[2] + 0.6)
  const smallPos: [number, number, number] = [-side * 0.78, 0.98, -0.88]
  const smallYaw = Math.atan2(-smallPos[0], -smallPos[2] + 1.2)

  return (
    <group position={[x, PLATFORM_Y, z]}>
      <group ref={group}>
        <mesh
          geometry={gift ? GIFT_BASE : stone ? pedestal(1.75, -0.32, 0.52) : glass ? glassTiers(2.05, -0.32, 0.52) : GEO.hexBase}
          material={stone ? stoneMaterial() : glass ? glassMaterial() : loom ? invisibleMaterial() : graphiteMat}
          position={[0, gift ? -0.07 : 0, 0]}
          onPointerOver={onOver}
          onPointerOut={onOut}
          onClick={onClick}
        />
        {stone && <StoneDressing r={1.75} top={0.2} reduced={reduced} seed={Math.round(phase * 1000)} />}
        {glass && <GlassDressing r={2.05} y0={-0.32} h={0.52} />}
        {loom && <LoomSeat r={1.75} y={0.36} reduced={reduced} yaw={phase * 6.28} />}
        {gift && <GiftDressing r={1.6} y0={-0.32} h={0.5} reduced={reduced} seed={Math.round(phase * 1000)} />}
        {/* En vidrio se transparentaría el hexágono de siempre: solo queda el aro del robot. */}
        {!glass && !loom && (
          <>
            <mesh geometry={GEO.hexTop} material={topMat} position={[0, 0.16, 0]} />
            <mesh geometry={GEO.hexRim} material={mats.rim} position={[0, 0.17, 0]} rotation={HEX_RING_ROT} />
            <mesh geometry={GEO.hexRimLow} material={lowRimMat} position={[0, -0.15, 0]} rotation={HEX_RING_ROT} />
          </>
        )}
        <mesh geometry={GEO.pad} material={mats.pad} position={[0, 0.185 + lift, 0]} rotation={[Math.PI / 2, 0, 0]} />
        {[0, 1].map((i) => (
          <mesh
            key={i}
            ref={(m) => {
              if (m) pulseMeshes.current[i] = m
            }}
            geometry={GEO.pulseRing}
            material={mats.pulses[i]}
            position={[0, 0.2 + lift, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={1.4}
            visible={false}
          />
        ))}
        <mesh geometry={GEO.glowPlane} material={mats.glow} position={[0, -0.32, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={4.2} />
        {/* Consola */}
        <mesh geometry={GEO.pedestal} material={graphiteMat} position={[side * 1.02, 0.4, -0.42]} rotation={[0, screenYaw, 0]} />
        <mesh geometry={GEO.screenMain} material={mats.screenA} position={screenPos} rotation={[-0.08, screenYaw, 0]} />
        <mesh geometry={GEO.screenSmall} material={mats.screenB} position={smallPos} rotation={[-0.05, smallYaw, 0]} />
        {showLight && <pointLight ref={light} position={[0, 1.4, 0.3]} distance={5.5} decay={2} intensity={0.3} />}
      </group>
    </group>
  )
}
