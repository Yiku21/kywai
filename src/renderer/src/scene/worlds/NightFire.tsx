// Fuego que se enciende al anochecer: hogueras y antorchas con luz de verdad (una luz puntual que irradia alrededor,
// parpadea como una llama y tiñe el suelo, las columnas y los robots cercanos). De día están apagadas: leña, piedra y
// el soporte de la antorcha, sin llama ni luz. Se usan en Marfil (antorchas y un brasero) y en el Bosque (hogueras).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { registry } from '../registry'
import { nightRamp, spaceNight } from '../nightLight'
import { GlowPoints } from '../GlowPoints'

const flameVertex = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

/** Una llama en un plano que mira a la cámara: lengua de fuego con ruido que sube, blanca en el centro y roja fuera. */
const flameFragment = /* glsl */ `
uniform float uTime;
uniform float uLit;
uniform float uSeed;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y); }
void main(){
  vec2 p = vUv - vec2(.5, 0.0);
  float t = uTime * 2.2 + uSeed;
  float n = noise(vec2(p.x * 5.0, vUv.y * 4.0 - t)) * .6 + noise(vec2(p.x * 11.0, vUv.y * 8.0 - t * 1.7)) * .4;
  float width = .34 * (1.0 - vUv.y) * (1.0 - vUv.y * .25) + .02;
  float body = 1.0 - smoothstep(width * .55, width, abs(p.x + (n - .5) * .16 * vUv.y));
  body *= smoothstep(0.0, .08, vUv.y) * (1.0 - smoothstep(.55 + n * .35, .98, vUv.y));
  float core = body * (1.0 - smoothstep(0.0, .5, vUv.y)) * (1.0 - smoothstep(0.0, width * .6, abs(p.x)));
  vec3 color = mix(vec3(1.0, .28, .04), vec3(1.0, .72, .25), body) + vec3(1.0, .9, .65) * core;
  gl_FragColor = vec4(color * 2.6 * uLit, body * uLit);
}`

function useFlameMaterial(seed: number) {
  const material = useMemo(() => new THREE.ShaderMaterial({ vertexShader: flameVertex, fragmentShader: flameFragment,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uLit: { value: 0 }, uSeed: { value: seed } } }), [seed])
  useEffect(() => () => material.dispose(), [material])
  return material
}

/** Luz y llama de un fuego, encendidos según la noche: [from]–[to] es cuándo prende (a media tarde, del todo de noche). */
function Flame({ height, width, light, distance, seed, reduced }: { height: number; width: number; light: number; distance: number; seed: number; reduced: boolean }) {
  const material = useFlameMaterial(seed)
  const lamp = useRef<THREE.PointLight>(null!)
  const flame = useRef<THREE.Group>(null!)
  useFrame(() => {
    const lit = nightRamp(spaceNight.value, 0.2, 0.75)
    const t = registry.time + seed
    const flicker = reduced ? 1 : 1 + 0.1 * Math.sin(t * 9.1) + 0.07 * Math.sin(t * 15.3 + 1.2) + 0.05 * Math.sin(t * 3.7)
    material.uniforms.uTime.value = reduced ? seed : registry.time
    material.uniforms.uLit.value = lit
    flame.current.visible = lit > 0.01
    flame.current.scale.set(1, 0.85 + 0.15 * flicker, 1)
    // La luz siempre está (con 0 de día): encenderla y apagarla obligaría a recompilar todos los materiales.
    lamp.current.intensity = light * lit * flicker
  })
  return <>
    <group ref={flame}>
      <Billboard lockX lockZ>
        <mesh material={material} position={[0, height / 2, 0]} raycast={() => {}} renderOrder={5}>
          <planeGeometry args={[width, height]} />
        </mesh>
      </Billboard>
    </group>
    <pointLight ref={lamp} position={[0, height * 0.55, 0]} color="#ff9a45" intensity={0} distance={distance} decay={1.6} />
  </>
}

/** Hoguera: un corro de piedras, leña cruzada y, de noche, fuego con chispas que suben. */
export function Bonfire({ position, scale = 1, seed = 0, reduced }: { position: [number, number, number]; scale?: number; seed?: number; reduced: boolean }) {
  const sparks = useMemo(() => Array.from({ length: 18 }, (_, i) => {
    const a = i * 2.39996 + seed, r = 0.08 + (i * 0.37 % 1) * 0.22
    return [Math.cos(a) * r, 0.4 + (i * 0.61 % 1) * 1.6, Math.sin(a) * r]
  }).flat(), [seed])
  const stones = useMemo(() => Array.from({ length: 11 }, (_, i) => {
    const a = i / 11 * Math.PI * 2 + seed
    return { at: [Math.cos(a) * 0.62, 0.07, Math.sin(a) * 0.62] as [number, number, number], s: 0.13 + (i * 0.53 % 1) * 0.06, r: a }
  }), [seed])
  const ember = useRef<THREE.MeshStandardMaterial>(null!)
  const sparkGroup = useRef<THREE.Group>(null!)
  useFrame(() => {
    const lit = nightRamp(spaceNight.value, 0.2, 0.75)
    ember.current.emissiveIntensity = 2.4 * lit
    sparkGroup.current.visible = lit > 0.05
  })
  return <group position={position} scale={scale}>
    {stones.map((s, i) => <mesh key={i} position={s.at} rotation={[0.3, s.r, 0.2]} scale={[s.s * 1.2, s.s, s.s]} castShadow receiveShadow raycast={() => {}}>
      <dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#6f6a62" roughness={0.95} />
    </mesh>)}
    {[0, 1, 2, 3].map((i) => <mesh key={i} position={[0, 0.16, 0]} rotation={[0.42, i * Math.PI / 2 + 0.4, 0]} castShadow raycast={() => {}}>
      <cylinderGeometry args={[0.07, 0.085, 0.95, 7]} /><meshStandardMaterial color="#4a3020" roughness={0.9} />
    </mesh>)}
    <mesh position={[0, 0.06, 0]} rotation-x={-Math.PI / 2} raycast={() => {}}>
      <circleGeometry args={[0.42, 20]} />
      <meshStandardMaterial ref={ember} color="#2a1508" emissive="#ff5a14" emissiveIntensity={0} roughness={1} />
    </mesh>
    <Flame height={1.5} width={1.05} light={26} distance={13} seed={seed} reduced={reduced} />
    <group ref={sparkGroup}>
      <GlowPoints positions={sparks} color="#ffb24a" intensity={2.4} size={0.06} fall={reduced ? 0 : -0.6} fallBase={0.35} fallHeight={2.6} sway={0.18} flicker={0.8} nightGain={0} reduced={reduced} />
    </group>
  </group>
}

/** Antorcha: un poste con un cuenco de bronce arriba; de noche, una llama con su luz. */
export function Torch({ position, height = 2.2, seed = 0, reduced }: { position: [number, number, number]; height?: number; seed?: number; reduced: boolean }) {
  return <group position={position}>
    <mesh position={[0, height / 2, 0]} castShadow raycast={() => {}}>
      <cylinderGeometry args={[0.05, 0.07, height, 8]} /><meshStandardMaterial color="#6b5236" metalness={0.3} roughness={0.7} />
    </mesh>
    <mesh position={[0, height + 0.05, 0]} castShadow raycast={() => {}}>
      <cylinderGeometry args={[0.2, 0.09, 0.2, 12]} /><meshStandardMaterial color="#a8803f" metalness={0.75} roughness={0.38} />
    </mesh>
    <mesh position={[0, 0.03, 0]} raycast={() => {}}>
      <cylinderGeometry args={[0.18, 0.22, 0.06, 12]} /><meshStandardMaterial color="#a8803f" metalness={0.75} roughness={0.38} />
    </mesh>
    <group position={[0, height + 0.12, 0]}>
      <Flame height={0.62} width={0.42} light={14} distance={9} seed={seed} reduced={reduced} />
    </group>
  </group>
}
