import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useCowork, useData } from '@/store/cowork'
import { canvasTexture, glowTexture } from './assets'
import { holoVert, panelFrag } from './shaders'
import { registry } from './registry'
import { glowBlending, onPalette, palette, panelFrost, panelInk, tone } from './palette'
import { SnowPanel } from './navidad'
import { TombPanel } from './halloween'
import { RelicPanel } from './relicario'
import { LoomPanel } from './telar'

/** Centro (x, z) de cada zona en el suelo. */
export const ZONE_SPOTS = {
  tasks: [-9.7, -1.4] as [number, number],
  files: [-8.1, 5.5] as [number, number],
  tools: [9.7, -1.4] as [number, number],
  memory: [8.1, 5.7] as [number, number]
}

/** Las zonas miran hacia la posición habitual de la cámara. */
const facing = ([x, z]: [number, number]): number => Math.atan2(-x, 22 - z)

const FONT = '"Inter Variable", "Segoe UI", sans-serif'

function useFontsReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    document.fonts
      .load(`700 60px ${FONT}`)
      .catch(() => undefined)
      .finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])
  return ready
}

function panelMaterial(map: THREE.Texture, color: string, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: holoVert,
    fragmentShader: panelFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Con cristal esmerilado (temas de fiesta) el panel tapa lo de detrás: mezcla normal.
    blending: palette.frost ? THREE.NormalBlending : glowBlending(),
    uniforms: {
      ...panelFrost(),
      uMap: { value: map },
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uSeed: { value: seed },
      uAmbient: { value: 1 },
      uOpacity: { value: 0.85 },
      uInk: { value: panelInk() }
    }
  })
}

// ---------- Texturas ----------

function titleText(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, size: number): void {
  ctx.fillStyle = 'rgba(235,242,255,0.98)'
  ctx.font = `700 ${size}px ${FONT}`
  ctx.textAlign = 'left'
  lines.forEach((t, i) => ctx.fillText(t, x, y + i * size * 1.08))
}

function listText(ctx: CanvasRenderingContext2D, items: string[], x: number, y: number): void {
  ctx.font = `500 34px ${FONT}`
  items.forEach((t, i) => {
    ctx.fillStyle = 'rgba(160,190,255,0.9)'
    ctx.beginPath()
    const yy = y + i * 54
    ctx.moveTo(x, yy - 20)
    ctx.lineTo(x + 12, yy - 11)
    ctx.lineTo(x, yy - 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(225,235,255,0.92)'
    ctx.fillText(t, x + 28, yy)
  })
}

const tasksTexture = (): THREE.CanvasTexture =>
  canvasTexture(512, 620, (ctx) => {
    titleText(ctx, ['Nuevas', 'tareas'], 44, 104, 72)
    ctx.strokeStyle = 'rgba(235,245,255,0.95)'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.arc(256, 410, 118, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 16
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(256, 350)
    ctx.lineTo(256, 470)
    ctx.moveTo(196, 410)
    ctx.lineTo(316, 410)
    ctx.stroke()
  })

function iconTitleTexture(title: string, items: string[], icon: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  return canvasTexture(512, 512, (ctx) => {
    icon(ctx)
    titleText(ctx, [title], 112, 92, 56)
    listText(ctx, items, 50, 200)
  })
}

const folderIcon = (ctx: CanvasRenderingContext2D): void => {
  ctx.strokeStyle = 'rgba(235,245,255,0.95)'
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(40, 52)
  ctx.lineTo(62, 52)
  ctx.lineTo(70, 62)
  ctx.lineTo(94, 62)
  ctx.lineTo(94, 98)
  ctx.lineTo(40, 98)
  ctx.closePath()
  ctx.stroke()
}

const brainIcon = (ctx: CanvasRenderingContext2D): void => {
  ctx.strokeStyle = 'rgba(235,245,255,0.95)'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(56, 72, 22, Math.PI * 0.5, Math.PI * 1.6)
  ctx.arc(78, 58, 18, Math.PI * 1.1, Math.PI * 2.1)
  ctx.arc(80, 86, 16, Math.PI * 1.7, Math.PI * 0.6)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(66, 60)
  ctx.lineTo(66, 98)
  ctx.stroke()
}

const folderSheet = (): THREE.CanvasTexture =>
  canvasTexture(256, 200, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(10, 30)
    ctx.lineTo(90, 30)
    ctx.lineTo(110, 54)
    ctx.lineTo(246, 54)
    ctx.lineTo(246, 190)
    ctx.lineTo(10, 190)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  })

function toolIcon(kind: 'terminal' | 'web' | 'code' | 'plug'): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.strokeStyle = 'white'
    ctx.fillStyle = 'white'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    if (kind === 'terminal') {
      ctx.moveTo(30, 42)
      ctx.lineTo(56, 64)
      ctx.lineTo(30, 86)
      ctx.moveTo(66, 88)
      ctx.lineTo(98, 88)
    } else if (kind === 'web') {
      ctx.arc(64, 64, 38, 0, Math.PI * 2)
      ctx.moveTo(26, 64)
      ctx.lineTo(102, 64)
      ctx.ellipse(64, 64, 16, 38, 0, 0, Math.PI * 2)
    } else if (kind === 'code') {
      ctx.moveTo(44, 40)
      ctx.lineTo(22, 64)
      ctx.lineTo(44, 88)
      ctx.moveTo(84, 40)
      ctx.lineTo(106, 64)
      ctx.lineTo(84, 88)
      ctx.moveTo(72, 34)
      ctx.lineTo(56, 94)
    } else {
      ctx.moveTo(48, 26)
      ctx.lineTo(48, 46)
      ctx.moveTo(80, 26)
      ctx.lineTo(80, 46)
      ctx.moveTo(34, 46)
      ctx.lineTo(94, 46)
      ctx.lineTo(94, 62)
      ctx.quadraticCurveTo(94, 84, 64, 84)
      ctx.quadraticCurveTo(34, 84, 34, 62)
      ctx.closePath()
      ctx.moveTo(64, 84)
      ctx.lineTo(64, 104)
    }
    ctx.stroke()
  })
}

const titleOnly = (title: string): THREE.CanvasTexture =>
  canvasTexture(512, 128, (ctx) => {
    titleText(ctx, [title], 30, 84, 58)
  })

// ---------- Piezas comunes ----------

const baseMat = new THREE.MeshStandardMaterial({ metalness: 0.55, roughness: 0.4 })
const edgeMat = new THREE.MeshBasicMaterial({ toneMapped: false })
onPalette((p) => {
  baseMat.color.set(tone('#10142e'))
  edgeMat.color.set(p.primary).multiplyScalar(1.4)
})

function Panel({
  map,
  color,
  seed,
  size,
  position,
  hover = false
}: {
  map: THREE.Texture
  color: string
  seed: number
  size: [number, number]
  position: [number, number, number]
  hover?: boolean
}) {
  const reduced = useCowork((st) => st.reducedEffects)
  const mat = useMemo(() => panelMaterial(map, color, seed), [map, color, seed])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(() => {
    mat.uniforms.uTime.value = registry.time
    mat.uniforms.uAmbient.value = reduced ? 0 : 1
    const target = hover ? 1.15 : 0.85
    mat.uniforms.uOpacity.value += (target - mat.uniforms.uOpacity.value) * 0.15
  })
  return (
    <>
      <mesh material={mat} position={position}>
        <planeGeometry args={size} />
      </mesh>
      {palette.decor === 'navidad' && <SnowPanel size={size} position={position} />}
      {palette.decor === 'relicario' && <RelicPanel size={size} position={position} />}
      {palette.decor === 'telar' && <LoomPanel size={size} position={position} />}
      {palette.decor === 'halloween' && <TombPanel size={size} position={position} crow={seed === 0.3} reduced={reduced} />}
    </>
  )
}

/** Peana oscura con canto luminoso y un halo en el suelo. */
function Plinth({ w, d, color = palette.primary }: { w: number; d: number; color?: string }) {
  const glow = useMemo(
    () => new THREE.MeshBasicMaterial({ map: glowTexture, color: new THREE.Color(color), transparent: true, opacity: 0.32, blending: glowBlending(), depthWrite: false }),
    [color]
  )
  useEffect(() => () => glow.dispose(), [glow])
  return (
    <group>
      <mesh material={baseMat} position={[0, 0.12, 0]}>
        <boxGeometry args={[w, 0.24, d]} />
      </mesh>
      <mesh material={edgeMat} position={[0, 0.245, d / 2]}>
        <boxGeometry args={[w, 0.014, 0.014]} />
      </mesh>
      <mesh material={glow} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[w * 2.2, d * 3, 1]}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  )
}

function Zone({ spot, children, onClick }: { spot: [number, number]; children: (hover: boolean) => ReactNode; onClick?: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <group
      position={[spot[0], 0, spot[1]]}
      rotation={[0, facing(spot), 0]}
      onPointerOver={
        onClick
          ? (e) => {
              e.stopPropagation()
              setHover(true)
              document.body.style.cursor = 'pointer'
            }
          : undefined
      }
      onPointerOut={
        onClick
          ? () => {
              setHover(false)
              document.body.style.cursor = ''
            }
          : undefined
      }
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation()
              onClick()
            }
          : undefined
      }
    >
      {children(hover)}
    </group>
  )
}

// ---------- Zonas ----------

function TasksZone() {
  const map = useMemo(tasksTexture, [])
  useEffect(() => () => map.dispose(), [map])
  return (
    <Zone
      spot={ZONE_SPOTS.tasks}
      onClick={() => {
        useCowork.getState().setLeftTab('chat')
        useCowork.getState().setMobileView('chat')
        window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Escribe una tarea para el equipo"]')?.focus(), 60)
      }}
    >
      {(hover) => (
        <>
          <Plinth w={2.1} d={0.7} />
          <Panel map={map} color={palette.accent} seed={0.2} size={[1.95, 2.36]} position={[0, 1.52, 0]} hover={hover} />
        </>
      )}
    </Zone>
  )
}

function FilesZone() {
  const attachments = useData((d) => d.attachments.length)
  const artifacts = useData((d) => Object.keys(d.artifacts).length)
  const project = useData((d) => d.project)
  const folder = project?.workDir ? project.workDir.split(/[\\/]/).filter(Boolean).pop() : null
  const map = useMemo(
    () =>
      iconTitleTexture('Archivos', [`Adjuntos · ${attachments}`, `Resultados · ${artifacts}`, folder ? `Carpeta · ${folder}` : 'Carpeta del proyecto', 'Abrir archivos'], folderIcon),
    [attachments, artifacts, folder]
  )
  useEffect(() => () => map.dispose(), [map])
  const sheet = useMemo(folderSheet, [])
  const sheetMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: sheet, color: new THREE.Color(tone('#6f9bff')).multiplyScalar(1.2), transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: glowBlending(), depthWrite: false, toneMapped: false }),
    [sheet]
  )
  useEffect(
    () => () => {
      sheet.dispose()
      sheetMat.dispose()
    },
    [sheet, sheetMat]
  )
  return (
    <Zone
      spot={ZONE_SPOTS.files}
      onClick={() => {
        useCowork.getState().setLeftTab('files')
        useCowork.getState().setMobileView('chat')
      }}
    >
      {(hover) => (
        <>
          <group position={[-0.95, 0, 0]}>
            <Plinth w={1.5} d={0.9} />
            {[0, 1, 2, 3, 4].map((i) => (
              <mesh key={i} material={sheetMat} position={[-0.42 + i * 0.2, 0.72 + i * 0.03, 0.2 - i * 0.1]} rotation={[0, 0.35, 0]}>
                <planeGeometry args={[0.95, 0.74]} />
              </mesh>
            ))}
          </group>
          <Panel map={map} color={palette.primary} seed={0.6} size={[1.7, 1.7]} position={[0.9, 1.05, 0.1]} hover={hover} />
        </>
      )}
    </Zone>
  )
}

const TOOL_KINDS = ['terminal', 'web', 'code', 'plug'] as const
const toolColors = (): string[] => [palette.accent, palette.primary, '#5ff0a6', palette.secondary]

function ToolsZone() {
  const title = useMemo(() => titleOnly('Herramientas'), [])
  const icons = useMemo(() => TOOL_KINDS.map(toolIcon), [])
  const mats = useMemo(
    () => icons.map((t, i) => new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(toolColors()[i]).multiplyScalar(1.5), transparent: true, depthWrite: false, toneMapped: false })),
    [icons]
  )
  const tileMat = useMemo(() => new THREE.MeshStandardMaterial({ color: tone('#141a3c'), metalness: 0.4, roughness: 0.35, emissive: new THREE.Color(palette.primary), emissiveIntensity: 0.12 }), [])
  useEffect(
    () => () => {
      title.dispose()
      icons.forEach((t) => t.dispose())
      mats.forEach((m) => m.dispose())
      tileMat.dispose()
    },
    [title, icons, mats, tileMat]
  )
  const tiles = useRef<THREE.Group[]>([])
  const reduced = useCowork((st) => st.reducedEffects)
  useFrame(() => {
    const t = registry.time
    tiles.current.forEach((g, i) => {
      if (g) g.position.y = 0.62 + (reduced ? 0 : Math.sin(t * 1.1 + i * 1.3) * 0.05)
    })
  })
  return (
    <Zone spot={ZONE_SPOTS.tools}>
      {() => (
        <>
          <Plinth w={2.7} d={0.9} />
          {TOOL_KINDS.map((k, i) => (
            <group
              key={k}
              ref={(g) => {
                if (g) tiles.current[i] = g
              }}
              position={[-0.96 + i * 0.64, 0.62, 0]}
            >
              <mesh material={tileMat}>
                <boxGeometry args={[0.5, 0.5, 0.18]} />
              </mesh>
              <mesh material={mats[i]} position={[0, 0, 0.095]}>
                <planeGeometry args={[0.4, 0.4]} />
              </mesh>
            </group>
          ))}
          <Panel map={title} color={palette.primary} seed={0.3} size={[2.3, 0.58]} position={[0, 1.45, 0]} />
        </>
      )}
    </Zone>
  )
}

function MemoryZone() {
  // Lo que recuerda el proyecto (sin lo sustituido), por tipo.
  const counts = useData((d) => {
    const c = { decision: 0, fact: 0, preference: 0, pending: 0 }
    for (const e of d.memory) if (e.status !== 'superseded') c[e.kind]++
    return `${c.decision}|${c.preference}|${c.fact}|${c.pending}`
  })
  const map = useMemo(() => {
    const [dec, pref, fact, pend] = counts.split('|')
    return iconTitleTexture('Memoria', [`Decisiones · ${dec}`, `Preferencias · ${pref}`, `Hechos · ${fact}`, `Pendientes · ${pend}`], brainIcon)
  }, [counts])
  useEffect(() => () => map.dispose(), [map])
  // Caras un poco hacia atrás en profundidad: las aristas luminosas no pelean con ellas (parpadeo).
  const slabMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: tone('#121a44'),
        metalness: 0.5,
        roughness: 0.3,
        emissive: new THREE.Color(palette.primary),
        emissiveIntensity: 0.25,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      }),
    []
  )
  const ledMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.accent).multiplyScalar(1.6), toneMapped: false }), [])
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color(tone('#6fa0ff')).multiplyScalar(1.4), toneMapped: false }), [])
  const slabGeo = useMemo(() => new THREE.BoxGeometry(0.95, 0.2, 0.75), [])
  const slabEdges = useMemo(() => new THREE.EdgesGeometry(slabGeo), [slabGeo])
  useEffect(
    () => () => {
      slabMat.dispose()
      ledMat.dispose()
      lineMat.dispose()
      slabGeo.dispose()
      slabEdges.dispose()
    },
    [slabMat, ledMat, lineMat, slabGeo, slabEdges]
  )
  const reduced = useCowork((st) => st.reducedEffects)
  useFrame(() => {
    const t = registry.time
    ledMat.color.set(palette.accent).multiplyScalar(reduced ? 1.3 : 1.1 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3.1)))
  })
  const stack = (x: number, z: number, n: number) =>
    Array.from({ length: n }, (_, i) => (
      <group key={`${x}-${i}`} position={[x, 0.36 + i * 0.25, z]}>
        <mesh geometry={slabGeo} material={slabMat} />
        <lineSegments geometry={slabEdges} material={lineMat} />
        <mesh material={ledMat} position={[0.3, 0, 0.38]}>
          <boxGeometry args={[0.18, 0.03, 0.01]} />
        </mesh>
      </group>
    ))
  return (
    <Zone
      spot={ZONE_SPOTS.memory}
      onClick={() => {
        useCowork.getState().setLeftTab('memory')
        useCowork.getState().setMobileView('chat')
      }}
    >
      {() => (
        <>
          <group position={[0.85, 0, -0.1]}>
            <Plinth w={2.2} d={1.0} />
            {stack(-0.5, 0, 4)}
            {stack(0.55, 0.05, 3)}
          </group>
          <Panel map={map} color={palette.secondary} seed={0.8} size={[1.7, 1.7]} position={[-1.05, 1.05, 0.25]} />
        </>
      )}
    </Zone>
  )
}

/** Zonas alrededor de la oficina, como en la referencia: tareas, archivos, herramientas y memoria. */
export function Zones() {
  const fonts = useFontsReady()
  if (!fonts) return null
  return (
    <group>
      <TasksZone />
      <FilesZone />
      <ToolsZone />
      <MemoryZone />
    </group>
  )
}
