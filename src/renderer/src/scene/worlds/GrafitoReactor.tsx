import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { registry } from '../registry'
import { earthVertex } from './earthShaders'
import { reactorPipes, reactorVents } from './grafitoFactory'
import { IndustrialPipes, SteamPlumes } from './IndustrialEffects'
import { stencil } from './WorldMarkings'

const furnace = /* glsl */ `
uniform float time;
uniform float load;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main(){
  float angle = vUv.x*6.2831853;
  float drift = sin(angle*4.0+vUv.y*7.0-time*1.6)+.37*sin(angle*11.0-vUv.y*10.0+time*2.0);
  float vein = pow(.5+.5*sin(angle*7.0+vUv.y*17.0-time*3.3+drift*2.2),7.0);
  float run = smoothstep(.29,.89,.5+.5*sin(vUv.y*22.0-time*3.0+drift*.64));
  float edge = pow(1.0-clamp(dot(normalize(vNormal),normalize(cameraPosition-vWorld)),0.0,1.0),2.0);
  vec3 base = mix(vec3(.41,.064,.011),vec3(1.0,.31,.04),.24+.41*run);
  vec3 hot = vec3(1.5,.78,.19)*vein+vec3(.61,.15,.016)*edge;
  gl_FragColor = vec4((base+hot)*(1.0+load*.31),1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const glass = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main(){
  vec3 normal=normalize(vNormal), view=normalize(cameraPosition-vWorld);
  float rim=pow(1.0-clamp(dot(normal,view),0.0,1.0),2.8);
  float seals=exp(-vUv.y*39.0)+exp(-(1.0-vUv.y)*39.0);
  float glint=pow(max(0.0,dot(normal,normalize(vec3(-.56,0.0,.77)))),28.0);
  vec3 color=vec3(.20,.19,.17)+vec3(.37,.19,.057)*seals+vec3(.48,.41,.32)*glint;
  gl_FragColor=vec4(color,.053+.36*rim+.17*glint+.22*seals);
  #include <colorspace_fragment>
}`

function dialTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#222629'; ctx.beginPath(); ctx.arc(128, 128, 123, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#bda681'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(128, 128, 108, 0, Math.PI * 2); ctx.stroke()
  for (let i = 0; i < 21; i++) {
    const a = Math.PI * (.75 + i * .075)
    const inside = i % 5 === 0 ? 82 : 92
    ctx.strokeStyle = i > 16 ? '#ea8061' : '#e4d6b9'; ctx.lineWidth = i % 5 === 0 ? 4 : 2
    ctx.beginPath(); ctx.moveTo(128 + Math.cos(a) * inside, 128 + Math.sin(a) * inside)
    ctx.lineTo(128 + Math.cos(a) * 102, 128 + Math.sin(a) * 102); ctx.stroke()
  }
  ctx.textAlign = 'center'; ctx.fillStyle = '#e5d3aa'; ctx.font = 'bold 27px monospace'; ctx.fillText('bar',128,180)
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8
  return map
}

export function GrafitoReactor({ reduced, charge }: { reduced: boolean; charge: RefObject<number> }) {
  const crown = useRef<THREE.Group>(null!), rotor = useRef<THREE.Group>(null!), needle = useRef<THREE.Group>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const resources = useMemo(() => ({ uniforms: { time: { value: 1.25 }, load: { value: .35 } },
    title: stencil('REACTOR / 07', 'CÁMARA TÉRMICA', '#e3c08c'), gauge: dialTexture() }), [])
  useEffect(() => () => { resources.title.dispose(); resources.gauge.dispose() }, [resources])
  useFrame((_, dt) => {
    if (!reduced) resources.uniforms.time.value += Math.min(dt,.1)
    const t = resources.uniforms.time.value
    const load = reduced ? .35 : .48 + .23 * Math.sin(t * 1.2) + charge.current * .51 + registry.beat * .3
    resources.uniforms.load.value = load
    crown.current.rotation.y = t * .65
    rotor.current.rotation.y = -t * .91
    needle.current.rotation.z = -.41 - load * .62
    light.current.intensity = 3.7 + load * 2.3
  })

  return <>
    <IndustrialPipes runs={reactorPipes} />
    <SteamPlumes vents={reactorVents} reduced={reduced} plumeScale={.61} />
    <mesh position={[0,1.91,0]} renderOrder={3}>
      <cylinderGeometry args={[1.10,1.10,1.94,96,1,true]} />
      <shaderMaterial vertexShader={earthVertex} fragmentShader={glass} transparent depthWrite={false} />
    </mesh>
    <mesh position={[0,1.93,0]}>
      <cylinderGeometry args={[.435,.49,1.57,72,6]} />
      <shaderMaterial vertexShader={earthVertex} fragmentShader={furnace} uniforms={resources.uniforms} />
    </mesh>
    <group ref={rotor} position={[0,1.91,0]}>
      {[-.69,-.38,.39,.69].map(y => <mesh key={y} position-y={y} rotation-x={Math.PI / 2}>
        <torusGeometry args={[.51,.037,10,72]} /><meshStandardMaterial color="#7b664d" metalness={.72} roughness={.43} />
      </mesh>)}
      {Array.from({ length: 9 }, (_, i) => {
        const angle = i * Math.PI * 2 / 9
        return <group key={i} rotation-y={angle}>
          <mesh position={[.54,.02,0]}><boxGeometry args={[.135,1.47,.065]} /><meshStandardMaterial color="#46484a" metalness={.8} roughness={.44} /></mesh>
          <mesh position={[.612,.01,.001]}><boxGeometry args={[.031,1.16,.035]} /><meshStandardMaterial color="#d79b56" emissive="#ff7b32" emissiveIntensity={.83} roughness={.52} /></mesh>
        </group>
      })}
    </group>
    <group ref={crown} position={[0,3.53,0]}>
      <mesh rotation-x={Math.PI / 2}><torusGeometry args={[.817,.048,12,84]} /><meshStandardMaterial color="#8a8c89" metalness={.77} roughness={.33} /></mesh>
      {Array.from({ length: 12 }, (_, i) => <group key={i} rotation-y={i * Math.PI / 6}>
        <mesh position={[.47,.01,0]} rotation-y={.24}><boxGeometry args={[.54,.085,.105]} /><meshStandardMaterial color="#7c7770" metalness={.73} roughness={.32} /></mesh>
        {i % 3 === 0 && <mesh position={[.80,.049,0]}><boxGeometry args={[.07,.03,.17]} /><meshStandardMaterial color="#f3b863" emissive="#ff9a48" emissiveIntensity={1.12} /></mesh>}
      </group>)}
      <mesh><cylinderGeometry args={[.228,.286,.116,48]} /><meshStandardMaterial color="#82745f" metalness={.78} roughness={.38} /></mesh>
    </group>
    <group position={[0,3.17,1.338]}>
      <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[.211,.211,.085,48]} /><meshStandardMaterial color="#a99d86" metalness={.75} roughness={.33} /></mesh>
      <mesh position-z={.044}><circleGeometry args={[.187,48]} /><meshBasicMaterial map={resources.gauge} /></mesh>
      <group ref={needle} position-z={.047}>
        <mesh position-y={.061}><boxGeometry args={[.013,.129,.014]} /><meshBasicMaterial color="#ff8f5c" toneMapped={false} /></mesh>
      </group>
    </group>
    <mesh position={[0,.651,1.435]}>
      <planeGeometry args={[.83,.2075]} /><meshBasicMaterial map={resources.title} transparent depthWrite={false} toneMapped={false} />
    </mesh>
    <pointLight ref={light} position={[0,1.84,0]} color="#ffa958" distance={6.5} decay={2} intensity={5} />
  </>
}
