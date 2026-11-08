import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import moonUrl from '@/assets/orbit/moon.jpg'
import { registry } from '../registry'
import { SteamPlumes } from './IndustrialEffects'
import { villageChimneys } from './heritageWorlds'
import type { Vec, WorldStyle } from './models'
import type { StationConfig } from '@shared/types'
import { WorldDepthAir } from './WorldDepthAir'
import { CrystalWeave } from './CrystalWeave'
import { SeasonalWeather } from './SeasonalWeather'
import { RelicCraft } from './RelicCraft'
import { WinterConifers } from './WinterConifers'
import { ForestGrove } from './ForestGrove'
import type { ForestTree } from './forestLayout'

const deadTrees: ForestTree[] = Array.from({ length: 32 }, (_, i) => ({ x: (i % 2 ? -1 : 1) * (18 + Math.sin(i * 4) ** 2 * 10), z: -28 + (i / 2) * 2.2, height: 6 + Math.sin(i * 13) ** 2 * 7, seed: i * 137 + 73, fine: true }))

const noRaycast = () => {}
function SacredMobile({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null!)
  useFrame(() => { group.current.rotation.y = reduced ? .2 : registry.time * .055 })
  return <group ref={group} position={[0, 8.3, -6]}>
    {[3.1, 3.45, 3.8].map((r, i) => <mesh key={i} rotation={[Math.PI / 2 + i * .09, i * .15, 0]}>
      <torusGeometry args={[r, .022, 12, 160]} /><meshStandardMaterial color="#c4ac78" metalness={.82} roughness={.28} emissive="#ac8a4a" emissiveIntensity={.17} />
    </mesh>)}
    {Array.from({ length: 16 }, (_, i) => {
      const a = i / 16 * Math.PI * 2, x = Math.cos(a) * 3.44, z = Math.sin(a) * 3.44, drop = .8 + i % 3 * .4
      return <group key={i} position={[x, 0, z]}>
        <mesh position-y={-drop / 2}><cylinderGeometry args={[.009, .009, drop, 6]} /><meshStandardMaterial color="#bdad84" metalness={.8} roughness={.3} /></mesh>
        <mesh position-y={-drop - .18} scale={[.11, .32, .11]}><octahedronGeometry args={[1, 0]} /><meshPhysicalMaterial color="#c0e3ef" metalness={.12} roughness={.07} transparent opacity={.78} clearcoat={1} envMapIntensity={1.8} /></mesh>
      </group>
    })}
  </group>
}

function RelicCanals({ reduced }: { reduced: boolean }) {
  const material = useMemo(() => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float time;varying vec2 vUv;void main(){vec2 p=vUv*vec2(7.,55.);float wave=sin(p.y*3.+sin(p.x*2.+time*.35)*1.3-time*.45)*sin(p.x*3.-time*.21+p.y*.6);float shimmer=pow(.5+.5*wave,16.);float reflections=pow(.5+.5*cos(p.y*2.3+sin(p.x*3.+time*.13)*.5),22.);float edge=pow(abs(vUv.x-.5)*2.,12.);vec3 c=mix(vec3(.08,.19,.25),vec3(.57,.55,.39),shimmer*.5+reflections*.3);gl_FragColor=vec4(c,.55+edge*.1);}` }), [])
  useFrame(() => { material.uniforms.time.value = reduced ? 0 : registry.time })
  useEffect(() => () => material.dispose(), [material])
  return <>{[-1, 1].map(s => <mesh key={s} position={[s * 17, -.085, -4]} rotation-x={-Math.PI / 2} material={material} raycast={noRaycast}><planeGeometry args={[3.4, 34]} /></mesh>)}</>
}

const moteVertex = `uniform float time; uniform float winter; attribute float seed; varying float brightness;
void main(){vec3 p=position; p.x+=sin(seed*79.+time*.15)*.4; p.z+=cos(seed*41.+time*.18)*.4;
p.y=winter>.5?mod(p.y-time*(.12+seed*.15)+30.,30.):p.y+sin(seed*31.+time*.4)*.12;
vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((winter>.5?36.:24.)/max(1.,-mv.z),1.,4.);brightness=.35+.65*pow(.5+.5*sin(seed*71.+time*.5),2.);}`
const moteFrag = `uniform vec3 color; varying float brightness;
void main(){float a=1.-smoothstep(.04,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(color,a*brightness*.7);}`
function Motes({ style, reduced, detailed }: { style: WorldStyle; reduced: boolean; detailed: boolean }) {
  const resources = useMemo(() => {
    const count = detailed ? 900 : 350, position = [], seed = []
    for (let i = 0; i < count; i++) { const v = (n: number) => { const q = Math.sin(n * 51.43) * 45321; return q - Math.floor(q) }; position.push((v(i * 3 + 1) - .5) * 68, v(i * 3 + 2) * 28, (v(i * 3 + 3) - .7) * 75); seed.push(v(i + 1)) }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1))
    const mat = new THREE.ShaderMaterial({ vertexShader: moteVertex, fragmentShader: moteFrag, transparent: true, depthWrite: false,
      uniforms: { time: { value: 0 }, winter: { value: style === 'navidad' ? 1 : 0 }, color: { value: new THREE.Color(style === 'relicario' ? '#e6c88d' : '#becbdf') } } })
    return { geo, mat }
  }, [style, detailed])
  useFrame(() => { resources.mat.uniforms.time.value = reduced ? 0 : registry.time })
  useEffect(() => () => { resources.geo.dispose(); resources.mat.dispose() }, [resources])
  return <points geometry={resources.geo} material={resources.mat} raycast={noRaycast} />
}

function Moon() {
  const map = useLoader(THREE.TextureLoader, moonUrl)
  return <mesh position={[-15, 6.5, -43]} rotation={[.2, -.9, .08]} raycast={noRaycast}>
    <sphereGeometry args={[3.8, 96, 64]} /><meshBasicMaterial map={map} color="#d5d9eb" toneMapped={false} />
  </mesh>
}

function Aurora({ reduced }: { reduced: boolean }) {
  const material = useMemo(() => new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false,
    uniforms: { time: { value: 0 } }, vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float time;varying vec2 vUv;void main(){float curve=.42+sin(vUv.x*7.+time*.035)*.16+sin(vUv.x*16.-time*.03)*.04;
    float ribbon=exp(-abs(vUv.y-curve)*14.)*smoothstep(curve-.02,curve+.04,vUv.y);float rays=.65+.35*sin(vUv.x*390.+sin(vUv.x*30.)*8.);
    vec3 c=mix(vec3(.16,.56,.48),vec3(.37,.29,.62),vUv.x);gl_FragColor=vec4(c,ribbon*rays*.65*sin(vUv.x*3.14159));}` }), [])
  useFrame(() => { material.uniforms.time.value = reduced ? 0 : registry.time })
  useEffect(() => () => material.dispose(), [material])
  return <mesh position={[0, 9, -50]} material={material} raycast={noRaycast}><planeGeometry args={[100, 28]} /></mesh>
}

function NightBackdrop({ style }: { style: WorldStyle }) {
  const material = useMemo(() => new THREE.ShaderMaterial({ depthWrite: false, uniforms: { web: { value: style === 'telar' ? 1 : 0 }, tint: { value: new THREE.Color(style === 'telar' ? '#303755' : style === 'relicario' ? '#1e3049' : style === 'halloween' ? '#29213b' : '#1f3d55') } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 tint;uniform float web;varying vec2 vUv;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
    void main(){float cloud=n(vUv*7.)*.5+n(vUv*17.)*.3+n(vUv*43.)*.2;vec2 cell=floor(vUv*vec2(460.,180.));float star=step(.995,h(cell))*pow(max(0.,1.-length(fract(vUv*vec2(460.,180.))-.5)*2.),5.);vec2 q=(vUv-vec2(.5,.42))*vec2(2.5,1.9);float haze=exp(-dot(q,q)*2.8)*pow(max(0.,cloud),2.2);vec3 nebula=mix(vec3(.04,.12,.22),vec3(.20,.10,.24),n(vUv*11.));gl_FragColor=vec4(tint*(.25+cloud*.8)*(1.-vUv.y*.55)+vec3(.63,.72,.9)*star*.8+nebula*haze*web*1.35,1.);}` }), [style])
  useEffect(() => () => material.dispose(), [material])
  return <mesh position={[0, 11, -75]} material={material} raycast={noRaycast}><planeGeometry args={[180, 100]} /></mesh>
}

const mistVertex = `uniform float time; varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`
const mistFrag = `uniform float time;varying vec2 vUv;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}void main(){float noise=n(vUv*vec2(9.,3.)+vec2(time*.023,0.))*.7+n(vUv*vec2(23.,8.)-vec2(time*.035,0.))*.3;float edge=sin(vUv.x*3.14159)*sin(vUv.y*3.14159);gl_FragColor=vec4(.44,.41,.57,noise*edge*.25);}`
function LowMist({ reduced }: { reduced: boolean }) {
  const material = useMemo(() => new THREE.ShaderMaterial({ vertexShader: mistVertex, fragmentShader: mistFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: { value: 0 } } }), [])
  useFrame(() => { material.uniforms.time.value = reduced ? 0 : registry.time })
  useEffect(() => () => material.dispose(), [material])
  return <>{[-12, -5, 2, 8].map((z, i) => <mesh key={z} position={[0, .15 + i * .07, z]} rotation-x={-Math.PI / 2 + .08} material={material} raycast={noRaycast}><planeGeometry args={[44, 7]} /></mesh>)}</>
}

export function HeritageAtmosphere({ style, stations, reduced, detailed }: { style: WorldStyle; stations: StationConfig[]; reduced: boolean; detailed: boolean }) {
  const vents = useMemo(() => villageChimneys.map(p => [...p] as Vec), [style, detailed])
  return <>
    <NightBackdrop style={style} />
    <Motes style={style} reduced={reduced} detailed={detailed} />
    {style === 'relicario' && <><WorldDepthAir crystal={false} reduced={reduced} detailed={detailed}/><pointLight position={[-13,8,-29]} color="#9cd9e7" intensity={75} distance={24} decay={2}/><pointLight position={[13,8,-29]} color="#e6c58a" intensity={75} distance={24} decay={2}/><RelicCraft detailed={detailed} /><SacredMobile reduced={reduced} /><RelicCanals reduced={reduced} /></>}
    {style === 'telar' && <><WorldDepthAir crystal reduced={reduced} detailed={detailed}/><CrystalWeave stations={stations} reduced={reduced} detailed={detailed} /></>}
    {style === 'halloween' && <><ForestGrove trees={deadTrees} detailed={detailed} reduced={reduced} bare /><Suspense fallback={null}><Moon /></Suspense><LowMist reduced={reduced} /><SeasonalWeather winter={false} reduced={reduced} detailed={detailed} /></>}
    {style === 'navidad' && <><SeasonalWeather winter reduced={reduced} detailed={detailed} /><WinterConifers detailed={detailed} /><Aurora reduced={reduced} /><SteamPlumes vents={vents} reduced={reduced} detailed={detailed} plumeScale={.65} /></>}
  </>
}
