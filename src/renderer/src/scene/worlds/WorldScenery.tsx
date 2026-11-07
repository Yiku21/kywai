import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import type { QualitySettings } from '../quality'
import { registry } from '../registry'
import { centerpieceModel, environmentModel, platformModel, type Piece, type WorldStyle } from './models'
import { detailedGeometry, surfaceFor, surfaceMaps } from './surfaces'
import { OrbitalPlanet } from './OrbitalPlanet'
import { useCowork } from '@/store/cowork'
import { ForestFloor } from './ForestFloor'
import { ForestGrove } from './ForestGrove'
import { ForestAmbience } from './ForestAmbience'
import { forestStands, type ForestTree } from './forestLayout'
import { environmentDetails, platformDetails } from './details'
import { WorldMarkings } from './WorldMarkings'
import { IndustrialFactory } from './IndustrialEffects'
import { OrbitalSpace } from './OrbitalSpace'
import { MatrixAtmosphere } from './MatrixAtmosphere'
import { CyberNetwork } from './CyberNetwork'
import { MarfilGarden } from './MarfilGarden'

/** Shared geometry and material per batch; cleaned up when changing theme. No per-frame rebuilds. */
function Model({ pieces, style }: { pieces: Piece[]; style: WorldStyle }) {
  const resources = useMemo(() => {
    const textures = new Map<string, ReturnType<typeof surfaceMaps>>()
    const geometry = new Map<string, THREE.BufferGeometry>()
    const wind = { value: 0 }
    const groups = new Map<string, Piece[]>()
    for (const p of pieces) {
      const key = `${p.shape}:${p.color}:${p.glow ?? 0}`
      const group = groups.get(key) ?? []
      group.push(p)
      groups.set(key, group)
    }
    const batches = [...groups].map(([key, parts]) => {
      const first = parts[0]
      const small = parts.every(p => Math.max(...p.size) < 0.13)
      const glazing = style === 'matrix' && first.shape === 'box' && parts.every(p => Math.min(...p.size) < 0.06)
      const geometryKey = `${first.shape}:${small}:${glazing}`
      if (!geometry.has(geometryKey)) geometry.set(geometryKey, glazing ? new THREE.BoxGeometry(1, 1, 1) : detailedGeometry(first.shape, small))
      const geo = geometry.get(geometryKey)!
      const surface = surfaceFor(style, first.shape, first.color)
      if (!textures.has(surface)) textures.set(surface, surfaceMaps(surface))
      const maps = textures.get(surface)!
      const metallic = surface === 'alloy' || surface === 'brass'
      const mat = new THREE.MeshPhysicalMaterial({ color: first.color, roughness: 1,
        metalness: metallic ? 0.72 : surface === 'water' ? 0.2 : 0.02, ...maps,
        normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: surface === 'water' ? 1 : surface === 'stone' || surface === 'paint' ? 0.25 : metallic ? 0.08 : 0,
        clearcoatRoughness: 0.3, envMapIntensity: metallic ? 1.0 : 0.7,
        side: first.shape === 'leaf' ? THREE.DoubleSide : THREE.FrontSide,
        emissive: first.color, emissiveIntensity: first.glow || 0 })
      if (first.shape === 'leaf') {
        mat.onBeforeCompile = shader => {
          shader.uniforms.worldWind = wind
          shader.vertexShader = `uniform float worldWind;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.x += sin(worldWind + instanceMatrix[3].x * 0.8 + instanceMatrix[3].z * 0.5) * 0.035 * (position.y + 0.5);`)
        }
        mat.customProgramCacheKey = () => 'world-leaf-wind'
      }
      const mesh = new THREE.InstancedMesh(geo, mat, parts.length)
      mesh.castShadow = !small && !(first.glow && first.glow > 0.4)
      mesh.receiveShadow = true
      const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), size = new THREE.Vector3(), quat = new THREE.Quaternion()
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        quat.copy(p.quaternion ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation ?? [0, 0, 0]))))
        matrix.compose(pos.set(...p.at), quat, size.set(...p.size))
        mesh.setMatrixAt(i, matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      mesh.name = `world-${key}`
      return mesh
    })
    return { batches, textures, geometry, wind }
  }, [pieces, style])
  useFrame(() => {
    resources.wind.value = useCowork.getState().reducedEffects ? 0 : registry.time * 0.7
    const water = resources.textures.get('water')
    if (water && !useCowork.getState().reducedEffects) water.normalMap.offset.set(registry.time * 0.014, registry.time * 0.009)
  })
  useEffect(() => () => {
    resources.textures.forEach(maps => Object.values(maps).forEach(t => t.dispose()))
    resources.geometry.forEach(g => g.dispose())
    resources.batches.forEach(m => {
      ;(m.material as THREE.Material).dispose()
      m.dispose()
    })
  }, [resources])
  return <group>{resources.batches.map(m => <primitive key={m.uuid} object={m} />)}</group>
}

export function WorldPlatform({ style }: { style: WorldStyle }) {
  const pieces = useMemo(() => [...platformModel(style), ...platformDetails(style)], [style])
  return <Model pieces={pieces} style={style} />
}

const heartTree: ForestTree[] = [{ x: 0, z: 0, height: 4.45, seed: 18691, fine: true }]

export function WorldCenterpiece({ style }: { style: WorldStyle }) {
  const pieces = useMemo(() => centerpieceModel(style), [style])
  const reduced = useCowork(s => s.reducedEffects)
  return <>
    <Model pieces={pieces} style={style} />
    {style === 'orbita' && <Suspense fallback={null}><OrbitalPlanet position={[0, 2.05, 0]} radius={0.94} /></Suspense>}
    {style === 'bosque' && <ForestGrove trees={heartTree} detailed reduced={reduced} centerpiece />}
  </>
}

const rainVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const rainFragment = /* glsl */ `
  uniform float time;
  uniform sampler2D glyphs;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 cell = floor(vUv * vec2(95.0, 28.0));
    vec2 local = fract(vUv * vec2(95.0, 28.0));
    float head = fract(vUv.y + time * (0.03 + hash(vec2(cell.x, 1.0)) * 0.035) + hash(vec2(cell.x, 2.0)));
    float tail = pow(head, 7.0);
    float index = floor(hash(cell + floor(time * 0.65)) * 64.0);
    vec2 atlas = (vec2(mod(index, 8.0), floor(index / 8.0)) + local) / 8.0;
    float digit = texture2D(glyphs, atlas).a;
    float alpha = digit * tail * smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
    gl_FragColor = vec4(mix(vec3(0.04, 0.8, 0.25), vec3(0.65, 1.0, 0.8), pow(head, 35.0)) * 1.3, alpha * 0.7);
  }
`

function CodeRain({ reduced }: { reduced: boolean }) {
  const glyphs = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
    const ctx = canvas.getContext('2d')!
    const chars = '0123456789アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン<>+={}[]'
    ctx.fillStyle = '#fff'; ctx.font = '42px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 0; i < 64; i++) ctx.fillText(chars[i % chars.length], i % 8 * 64 + 32, Math.floor(i / 8) * 64 + 32)
    return new THREE.CanvasTexture(canvas)
  }, [])
  const material = useMemo(() => new THREE.ShaderMaterial({ vertexShader: rainVertex, fragmentShader: rainFragment,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: { value: 8 }, glyphs: { value: glyphs } } }), [glyphs])
  useEffect(() => () => { material.dispose(); glyphs.dispose() }, [material, glyphs])
  useFrame(() => { material.uniforms.time.value = reduced ? 8 : registry.time })
  return <group>
    <mesh material={material} position={[0, 11, -39]}><planeGeometry args={[72, 25]} /></mesh>
    <mesh material={material} position={[-17, 5, -3]} rotation-y={Math.PI / 2}><planeGeometry args={[22, 12]} /></mesh>
    <mesh material={material} position={[17, 5, -3]} rotation-y={-Math.PI / 2}><planeGeometry args={[22, 12]} /></mesh>
  </group>
}

function FloatingVoxels({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame(() => { ref.current.rotation.y = reduced ? 0.3 : registry.time * 0.09 })
  return <group ref={ref} position={[0, 2.05, 0]}>
    {Array.from({ length: 16 }, (_, i) => {
      const a = i * 2.399, r = 1.9 + i % 2 * 0.25
      return <mesh key={i} position={[Math.cos(a) * r, (i % 5 - 2) * 0.35, Math.sin(a) * r]} rotation={[0.2, a, 0.1]}>
        <boxGeometry args={[0.16, 0.16, 0.16]} /><meshStandardMaterial color="#61ff9c" emissive="#1fce68" emissiveIntensity={0.8} />
      </mesh>
    })}
  </group>
}

export function WorldScenery({ style, stations, q, reduced }: { style: WorldStyle; stations: StationConfig[]; q: QualitySettings; reduced: boolean }) {
  const detail = q.structures > 120
  const pieces = useMemo(() => [...environmentModel(style, stations, detail), ...environmentDetails(style, stations, detail)], [style, stations, detail])
  const trees = useMemo(() => style === 'bosque' ? forestStands(stations, detail) : [], [style, stations, detail])
  return <group name={`environment-${style}`}>
    <Model pieces={pieces} style={style} />
    <WorldMarkings style={style} stations={stations} />
    {style === 'grafito' && <IndustrialFactory stations={stations} reduced={reduced} detailed={detail} />}
    {style === 'clasico' && <CyberNetwork reduced={reduced} />}
    {style === 'marfil' && <MarfilGarden reduced={reduced} detailed={detail} />}
    {style === 'orbita' && <OrbitalSpace reduced={reduced} />}
    {style === 'bosque' && <>
      <ForestFloor stations={stations} detail={detail} />
      <ForestGrove trees={trees} detailed={detail} reduced={reduced} />
      <ForestAmbience trees={trees} detailed={detail} reduced={reduced} />
    </>}
    {style === 'matrix' && <><CodeRain reduced={reduced} /><FloatingVoxels reduced={reduced} /><MatrixAtmosphere reduced={reduced} detailed={detail} /></>}
  </group>
}
