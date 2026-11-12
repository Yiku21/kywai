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
import { ForestAmbience, ForestCampfires } from './ForestAmbience'
import { forestStands, type ForestTree } from './forestLayout'
import { environmentDetails, platformDetails } from './details'
import { WorldMarkings } from './WorldMarkings'
import { IndustrialFactory } from './IndustrialEffects'
import { OrbitalSpace } from './OrbitalSpace'
import { MatrixAtmosphere } from './MatrixAtmosphere'
import { CyberNetwork } from './CyberNetwork'
import { HeritageAtmosphere } from './HeritageAtmosphere'
import { HERITAGE_WORLDS } from './heritageWorlds'
import { HOME_PLANT_DECLARATIONS, HOME_PLANT_TRANSFORM } from './homeBreeze'
import { UnderseaPlatform } from './UnderseaWorld'
import { MarfilGarden } from './MarfilGarden'
import { CORPORATE_GLASS, OFFICE_AFTER_DARK, isCorporate } from './corporateWorlds'
import { officeClock } from '@/lib/officeClock'
import { NightRadiance } from '../NightRadiance'

/** Luces que irradian de noche desde lo que brilla en cada mapa (cuántas, cuánta luz y hasta dónde llegan). */
const RADIANCE: Partial<Record<WorldStyle, { max: number; power: number; distance: number }>> = {
  grafito: { max: 6, power: 14, distance: 11 }, clasico: { max: 5, power: 10, distance: 10 },
  matrix: { max: 4, power: 9, distance: 10 }, eva: { max: 4, power: 10, distance: 10 }
}

/** Shared geometry and material per batch; cleaned up when changing theme. No per-frame rebuilds. */
export function WorldModel({ pieces, style }: { pieces: Piece[]; style: WorldStyle }) {
  const resources = useMemo(() => {
    const textures = new Map<string, ReturnType<typeof surfaceMaps>>()
    const geometry = new Map<string, THREE.BufferGeometry>()
    const wind = { value: 0 }, breezeEnabled = { value: 1 }
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
      const moving = style === 'kywai' && parts.some(p => p.wind)
      const geometryKey = `${first.shape}:${small}:${glazing}${moving ? `:wind-${key}` : ''}`
      if (!geometry.has(geometryKey)) geometry.set(geometryKey, glazing ? new THREE.BoxGeometry(1, 1, 1) : detailedGeometry(first.shape, small))
      const geo = geometry.get(geometryKey)!
      if(moving) {
        const roots=new Float32Array(parts.length*4),flex=new Float32Array(parts.length)
        parts.forEach((p,i)=>{if(p.wind){roots.set([...p.wind.root,p.wind.height],i*4);flex[i]=p.wind.flexibility}})
        geo.setAttribute('homePlantRoot',new THREE.InstancedBufferAttribute(roots,4))
        geo.setAttribute('homePlantFlex',new THREE.InstancedBufferAttribute(flex,1))
      }
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
      if (surface === 'linen') { mat.metalness=0;mat.sheen=1;mat.sheenColor.copy(new THREE.Color(first.color)).lerp(new THREE.Color('#f3ead7'),.3);mat.sheenRoughness=.85;mat.clearcoat=0 }
      if (style === 'kywai' && first.shape === 'leaf') {mat.metalness=0;mat.roughness=1;mat.sheen=0;mat.clearcoat=0;mat.emissiveIntensity=0}
      if (first.shape === 'crystal' && ['#b7d6e3','#8daebb','#c4dce9','#85bac9','#bfdce3'].includes(first.color)) {
        mat.map = null; mat.normalMap = null; mat.roughnessMap = null; mat.metalness = 0; mat.roughness = .035;
        mat.transmission = ['#85bac9','#bfdce3'].includes(first.color) ? .58 : .94; mat.thickness = .6; mat.ior = 1.46; mat.attenuationColor = new THREE.Color('#b1d1de'); mat.attenuationDistance = 5;
        mat.clearcoat = 1; mat.envMapIntensity = 1.7; mat.emissiveIntensity = 0; mat.flatShading = true;
      }
      // Vidrio de los muros cortina y las salas de reuniones de los temas de empresa: se ve la ciudad a través.
      if (isCorporate(style) && CORPORATE_GLASS.includes(first.color)) { mat.map=null;mat.normalMap=null;mat.roughnessMap=null;mat.roughness=.06;mat.metalness=.1;mat.clearcoat=1;mat.transparent=true;mat.opacity=style === 'oficina' ? .16 : .2;mat.depthWrite=false;mat.envMapIntensity=1.4 }
      if(style === 'relicario' && first.color === '#4c7d89') { mat.map=null;mat.normalMap=null;mat.roughnessMap=null;mat.roughness=.10;mat.metalness=.12;mat.clearcoat=1;mat.transparent=true;mat.opacity=.31;mat.depthWrite=false;mat.envMapIntensity=1.8 }
      if (!moving && first.shape === 'leaf') {
        mat.onBeforeCompile = shader => {
          shader.uniforms.worldWind = wind
          shader.vertexShader = `uniform float worldWind;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.x += sin(worldWind + instanceMatrix[3].x * 0.8 + instanceMatrix[3].z * 0.5) * 0.035 * (position.y + 0.5);`)
        }
        mat.customProgramCacheKey = () => 'world-leaf-wind'
      }
      const mesh = new THREE.InstancedMesh(geo, mat, parts.length)
      if(moving) {
        const animate=(shader:{uniforms:Record<string,{value:unknown}>;vertexShader:string})=>{
          shader.uniforms.homeWindTime=wind;shader.uniforms.homeWindEnabled=breezeEnabled
          shader.vertexShader=HOME_PLANT_DECLARATIONS+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\n${HOME_PLANT_TRANSFORM}`)
        }
        mat.onBeforeCompile=shader=>{
          animate(shader)
          if(first.shape==='leaf') shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(!gl_FrontFacing) diffuseColor.rgb*=vec3(1.12,1.10,.94);')
        }
        mat.customProgramCacheKey=()=>`kywai-coastal-breeze-${first.shape==='leaf'}`
        const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide})
        depth.onBeforeCompile=animate;depth.customProgramCacheKey=()=> 'kywai-coastal-breeze-depth'
        mesh.customDepthMaterial=depth
      }
      mesh.castShadow = !small && !(first.glow && first.glow > 0.4) && !(isCorporate(style) && CORPORATE_GLASS.includes(first.color))
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
    // Luces de la Oficina que se encienden al anochecer (modo automático).
    const afterDark = style === 'oficina' ? batches.filter(m => OFFICE_AFTER_DARK.includes(groups.get(m.name.slice(6))?.[0]?.color ?? '')) : []
    return { batches, textures, geometry, wind, breezeEnabled, afterDark }
  }, [pieces, style])
  useFrame(() => {
    for (const m of resources.afterDark) {
      const lit = officeClock.night
      m.visible = lit > 0.04
      ;(m.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 1.3 * lit
    }
    resources.wind.value = style === 'kywai' || !useCowork.getState().reducedEffects ? registry.time * 0.7 : 0
    resources.breezeEnabled.value = useCowork.getState().reducedEffects ? 0 : 1
    const water = resources.textures.get('water')
    if (water && !useCowork.getState().reducedEffects) water.normalMap.offset.set(registry.time * 0.014, registry.time * 0.009)
  })
  useEffect(() => () => {
    resources.textures.forEach(maps => Object.values(maps).forEach(t => t.dispose()))
    resources.geometry.forEach(g => g.dispose())
    resources.batches.forEach(m => {
      ;(m.material as THREE.Material).dispose()
      m.customDepthMaterial?.dispose()
      m.dispose()
    })
  }, [resources])
  return <group>{resources.batches.map(m => <primitive key={m.uuid} object={m} />)}</group>
}

export function WorldPlatform({ style }: { style: WorldStyle }) {
  const pieces = useMemo(() => [...platformModel(style), ...platformDetails(style)], [style])
  if (style === 'submarino') return <UnderseaPlatform />
  if (style === 'kywai') return <mesh><cylinderGeometry args={[1.8,1.8,.75,48]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
  return <WorldModel pieces={pieces} style={style} />
}

const heartTree: ForestTree[] = [{ x: 0, z: 0, height: 4.45, seed: 18691, fine: true }]

export function WorldCenterpiece({ style }: { style: WorldStyle }) {
  const pieces = useMemo(() => centerpieceModel(style), [style])
  const reduced = useCowork(s => s.reducedEffects)
  return <>
    <WorldModel pieces={pieces} style={style} />
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
  uniform float uNight;
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
    // De noche las letras verdes brillan más (y con el bloom iluminan la niebla).
    gl_FragColor = vec4(mix(vec3(0.04, 0.8, 0.25), vec3(0.65, 1.0, 0.8), pow(head, 35.0)) * (1.3 + 1.4 * uNight), alpha * (0.7 + 0.25 * uNight));
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
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: { value: 8 }, glyphs: { value: glyphs }, uNight: { value: 0 } } }), [glyphs])
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
    <WorldModel pieces={pieces} style={style} />
    {RADIANCE[style] && <NightRadiance pieces={pieces} {...RADIANCE[style]} />}
    {(HERITAGE_WORLDS as readonly string[]).includes(style) && <HeritageAtmosphere style={style} stations={stations} reduced={reduced} detailed={detail} />}
    <WorldMarkings style={style} stations={stations} />
    {style === 'grafito' && <IndustrialFactory stations={stations} reduced={reduced} detailed={detail} />}
    {style === 'clasico' && <CyberNetwork reduced={reduced} />}
    {style === 'marfil' && <MarfilGarden reduced={reduced} detailed={detail} />}
    {style === 'orbita' && <OrbitalSpace reduced={reduced} />}
    {style === 'bosque' && <>
      <ForestFloor stations={stations} detail={detail} />
      <ForestGrove trees={trees} detailed={detail} reduced={reduced} />
      <ForestAmbience trees={trees} detailed={detail} reduced={reduced} />
      <ForestCampfires stations={stations} reduced={reduced} />
    </>}
    {style === 'eva' && <MatrixAtmosphere reduced={reduced} detailed={detail} variant="eva" />}
    {style === 'matrix' && <><CodeRain reduced={reduced} /><FloatingVoxels reduced={reduced} /><MatrixAtmosphere reduced={reduced} detailed={detail} /></>}
  </group>
}
