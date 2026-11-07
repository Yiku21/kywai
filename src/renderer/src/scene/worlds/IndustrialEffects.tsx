import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import { conveyor, conveyorClear, factoryPipes, factoryVents, pumpCells, type PipeRun } from './grafitoFactory'
import type { Vec } from './models'

const vertical = new THREE.Vector3(0, 1, 0)
const noRaycast = () => {}

export function IndustrialPipes({ runs }: { runs: PipeRun[] }) {
  const pipes = useMemo(() => runs.map(({ points, radius, copper }) => {
    const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), false, 'centripetal')
    const length = path.getLength()
    const count = Math.min(15, Math.max(2, Math.floor(length / 3.2)))
    const flanges = Array.from({ length: count }, (_, i) => {
      const t = (i + .19) / count
      return { at: path.getPointAt(t), rotation: new THREE.Quaternion().setFromUnitVectors(vertical, path.getTangentAt(t)) }
    })
    return { geometry: new THREE.TubeGeometry(path, Math.min(180, Math.max(24, points.length * 15)), radius, 18, false), radius, copper, flanges }
  }), [runs])
  useEffect(() => () => { pipes.forEach(pipe => pipe.geometry.dispose()) }, [pipes])
  return <>{pipes.map(({ geometry, radius, copper, flanges }) => <group key={geometry.uuid}>
    <mesh geometry={geometry} castShadow receiveShadow raycast={noRaycast}>
      <meshStandardMaterial color={copper ? '#8f6747' : '#606a70'} metalness={.71} roughness={.43} />
    </mesh>
    {flanges.map(({ at, rotation }, i) => <mesh key={i} position={at} quaternion={rotation} raycast={noRaycast}>
      <cylinderGeometry args={[radius * 1.30, radius * 1.30, radius * .51, 24]} />
      <meshStandardMaterial color={copper ? '#574d43' : '#83898b'} metalness={.65} roughness={.5} />
    </mesh>)}
  </group>)}</>
}

const steamVertex = /* glsl */ `
uniform float time;
uniform float plumeScale;
attribute vec3 outlet;
attribute float seed;
varying vec2 vUv;
varying float phase;
varying float variation;
void main(){
  vUv=uv;
  variation=fract(seed*5.913);
  phase=fract(seed + time*(.145+variation*.065));
  float rise=phase*(1.06+phase*.22)*2.7*plumeScale;
  float spread=(.17+phase*1.24)*plumeScale;
  vec3 p=outlet+vec3((.22+sin(seed*47.0+phase*6.0)*.35)*phase*plumeScale,rise,sin(seed*32.0+phase*5.5)*.46*phase*plumeScale);
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  mv.xy+=position.xy*vec2(spread,spread*(1.08+.48*variation));
  gl_Position=projectionMatrix*mv;
}`
const steamFragment = /* glsl */ `
uniform float time;
varying vec2 vUv;
varying float phase;
varying float variation;
float hash(vec2 p){return fract(sin(dot(p,vec2(41.37,289.71)))*43758.54);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
void main(){
  vec2 p=vUv*4.1+vec2(variation*14.2,phase*2.5-time*.13);
  float n=noise(p)*.59+noise(p*2.17+7.1)*.28+noise(p*4.13-5.3)*.13;
  float veil=1.0-smoothstep(.13,.50,length(vUv-.5));
  float birth=smoothstep(0.0,.15,phase), fade=1.0-smoothstep(.42,1.0,phase);
  float opacity=veil*veil*smoothstep(.15,.75,n)*birth*fade*.39;
  vec3 vapor=mix(vec3(.37,.39,.41),vec3(.86,.83,.77),smoothstep(.20,.82,n));
  gl_FragColor=vec4(vapor,opacity);
  #include <colorspace_fragment>
}`

export function SteamPlumes({ vents, reduced, plumeScale = 1, detailed = true }: { vents: Vec[]; reduced: boolean; plumeScale?: number; detailed?: boolean }) {
  const resources = useMemo(() => {
    const count = detailed ? 14 : 9
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5,-.5,0, .5,-.5,0, .5,.5,0, -.5,.5,0], 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 1,0, 1,1, 0,1], 2))
    geometry.setIndex([0,1,2, 0,2,3])
    const outlet: number[] = [], seeds: number[] = []
    vents.forEach((vent, index) => {
      for (let i = 0; i < count; i++) {
        outlet.push(...vent)
        seeds.push((i / count + index * .193) % 1)
      }
    })
    geometry.setAttribute('outlet', new THREE.InstancedBufferAttribute(new Float32Array(outlet), 3))
    geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1))
    geometry.instanceCount = seeds.length
    return { geometry, uniforms: { time: { value: 1.8 }, plumeScale: { value: plumeScale } } }
  }, [vents, detailed, plumeScale])
  useEffect(() => () => resources.geometry.dispose(), [resources])
  useFrame((_, dt) => { if (!reduced) resources.uniforms.time.value += Math.min(dt,.1) })
  return <mesh geometry={resources.geometry} frustumCulled={false} renderOrder={5} raycast={noRaycast}>
    <shaderMaterial vertexShader={steamVertex} fragmentShader={steamFragment} uniforms={resources.uniforms} transparent depthWrite={false} toneMapped={false} />
  </mesh>
}

function gearGeometry(radius: number, teeth: number, thickness: number) {
  const shape = new THREE.Shape()
  const steps = [0, .19, .63, .83]
  for (let i = 0; i < teeth; i++) for (const [j, step] of steps.entries()) {
    const a = (i + step) * Math.PI * 2 / teeth
    const r = radius * (j === 1 || j === 2 ? 1 : .89)
    if (i === 0 && j === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  shape.closePath()
  const bore = new THREE.Path(); bore.absarc(0, 0, radius * .32, 0, Math.PI * 2, true); shape.holes.push(bore)
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSegments: 2, bevelSize: .022, bevelThickness: .023, curveSegments: 36 }).translate(0, 0, -thickness / 2)
}

function PumpDrive({ position, reduced, phase }: { position: Vec; reduced: boolean; phase: number }) {
  const large = useRef<THREE.Group>(null!), small = useRef<THREE.Group>(null!)
  const rod = useRef<THREE.Mesh>(null!), crosshead = useRef<THREE.Mesh>(null!)
  const motion = useMemo(() => ({ time: phase, large: gearGeometry(.98, 22, .17), small: gearGeometry(.49, 11, .15), crank: new THREE.Vector3(), travel: new THREE.Vector3(), delta: new THREE.Vector3() }), [phase])
  useEffect(() => () => { motion.large.dispose(); motion.small.dispose() }, [motion])
  useFrame((_, dt) => {
    if (!reduced) motion.time += Math.min(dt, .1)
    const angle = motion.time * 1.07
    large.current.rotation.z = angle
    small.current.rotation.z = -angle * 2 + .15
    const { crank, travel, delta } = motion
    crank.set(-.88 + Math.cos(angle) * .39, 1.57 + Math.sin(angle) * .39, 1.015)
    travel.set(1.39 + Math.cos(angle) * .35, 1.57, 1.015)
    crosshead.current.position.copy(travel)
    delta.subVectors(travel, crank)
    rod.current.position.copy(crank).addScaledVector(delta,.5)
    rod.current.scale.y = delta.length()
    rod.current.quaternion.setFromUnitVectors(vertical, delta.normalize())
  })
  return <group position={position}>
    <group ref={large} position={[-.88, 1.57, .79]}>
      <mesh geometry={motion.large} castShadow>
        <meshStandardMaterial color="#887154" metalness={.8} roughness={.42} />
      </mesh>
      <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[.29,.29,.27,40]} /><meshStandardMaterial color="#757f84" metalness={.79} roughness={.36} /></mesh>
      {[0,1,2,3,4,5].map(i => <mesh key={i} position={[Math.sin(i * Math.PI / 3) * .57,Math.cos(i * Math.PI / 3) * .57,.11]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[.055,.055,.055,6]} /><meshStandardMaterial color="#b3a68e" metalness={.73} roughness={.41} />
      </mesh>)}
    </group>
    <group ref={small} position={[.54,1.57,.79]}>
      <mesh geometry={motion.small} castShadow><meshStandardMaterial color="#586469" metalness={.78} roughness={.36} /></mesh>
      <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[.14,.14,.24,24]} /><meshStandardMaterial color="#989d9d" metalness={.8} roughness={.45} /></mesh>
    </group>
    <mesh ref={rod}><cylinderGeometry args={[.052,.052,1,12]} /><meshStandardMaterial color="#a6adb0" metalness={.85} roughness={.27} /></mesh>
    <mesh ref={crosshead}><boxGeometry args={[.42,.32,.22]} /><meshStandardMaterial color="#9b7449" metalness={.7} roughness={.39} /></mesh>
  </group>
}

function Crane({ reduced }: { reduced: boolean }) {
  const hoist = useRef<THREE.Group>(null!)
  const time = useRef(1.26)
  useFrame((_, dt) => {
    if (!reduced) time.current += Math.min(dt, .1)
    hoist.current.position.x = Math.sin(time.current * .24) * 9.7
  })
  return <group ref={hoist} position={[0,7.81,-18.84]}>
    <mesh><boxGeometry args={[1.23,.48,.71]} /><meshStandardMaterial color="#a07846" metalness={.65} roughness={.45} /></mesh>
    <mesh position-y={-.82}><cylinderGeometry args={[.018,.018,1.37,8]} /><meshStandardMaterial color="#575e62" metalness={.8} roughness={.55} /></mesh>
    <mesh position-y={-1.53}><torusGeometry args={[.19,.035,8,36,4.8]} /><meshStandardMaterial color="#ad8254" metalness={.76} roughness={.45} /></mesh>
    <mesh position={[.41,-.106,.38]}><sphereGeometry args={[.063,16,10]} /><meshStandardMaterial color="#ff8e4f" emissive="#ff7a3a" emissiveIntensity={1.38} /></mesh>
  </group>
}

function FoundryConveyor({ reduced }: { reduced: boolean }) {
  const pieces = useRef<THREE.InstancedMesh>(null!)
  const data = useMemo(() => ({ time: 1.1, dummy: new THREE.Object3D(), color: new THREE.Color(), steel: new THREE.Color('#817c72'), hot: new THREE.Color('#f39d56') }), [])
  useFrame((_, dt) => {
    if (!reduced) data.time += Math.min(dt, .1)
    for (let i = 0; i < 8; i++) {
      const k = (i / 8 + data.time * .083) % 1
      const scale = Math.min(1, k * 27, (1 - k) * 21)
      data.dummy.position.set(0, conveyor.y + .15 * scale, THREE.MathUtils.lerp(conveyor.front - .23, conveyor.back - 1.28, k))
      data.dummy.scale.set(scale, scale, scale)
      data.dummy.updateMatrix()
      pieces.current.setMatrixAt(i, data.dummy.matrix)
      data.color.copy(data.steel).lerp(data.hot, THREE.MathUtils.smoothstep(k, .60, 1))
      pieces.current.setColorAt(i, data.color)
    }
    pieces.current.instanceMatrix.needsUpdate = true
    if (pieces.current.instanceColor) pieces.current.instanceColor.needsUpdate = true
  })
  return <>
    <instancedMesh ref={pieces} args={[undefined,undefined,8]} frustumCulled={false} raycast={noRaycast}>
      <boxGeometry args={[1.31,.30,.67]} /><meshStandardMaterial color="#ffffff" metalness={.62} roughness={.49} />
    </instancedMesh>
    <pointLight position={[0,1.9,conveyor.back - .6]} color="#ff8d40" intensity={18} distance={9.6} decay={2} />
  </>
}

export function IndustrialFactory({ stations, reduced, detailed }: { stations: StationConfig[]; reduced: boolean; detailed: boolean }) {
  return <>
    <IndustrialPipes runs={factoryPipes} />
    {pumpCells.filter(([x, , z]) => !stations.some(st => Math.hypot(x - st.position[0], z - st.position[1]) < 2.5))
      .map((position, i) => <PumpDrive key={position[0]} position={position} phase={i * 1.27} reduced={reduced} />)}
    <Crane reduced={reduced} />
    {conveyorClear(stations) && <FoundryConveyor reduced={reduced} />}
    <SteamPlumes vents={factoryVents} reduced={reduced} detailed={detailed} plumeScale={1.26} />
  </>
}
