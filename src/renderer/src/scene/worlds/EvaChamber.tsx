import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GlowPoints } from '../GlowPoints'
import { registry } from '../registry'
import { earthVertex } from './earthShaders'
import { stencil } from './WorldMarkings'

const glassFragment = /* glsl */ `
uniform float time;
uniform float charge;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 view = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 3.0);
  float reflection = pow(max(0.0, dot(normal, normalize(vec3(-0.7, 0.0, 0.65)))), 34.0);
  float seal = exp(-vUv.y * 42.0) + exp(-(1.0 - vUv.y) * 42.0);
  float scanPosition = 0.5 - 0.46 * cos(time * 0.78);
  float sweep = exp(-pow((vUv.y - scanPosition) * 90.0, 2.0));
  sweep += exp(-max(0.0, scanPosition - vUv.y) * 31.0) * step(vUv.y, scanPosition) * 0.16;
  float mist = exp(-vUv.y * 9.5) * (0.54 + 0.23 * sin(vUv.x * 37.7 + time * 0.9 + sin(vUv.y * 33.0 - time * 0.7)));
  vec3 glass = vec3(0.12, 0.26, 0.17) + vec3(0.24, 0.17, 0.34) * reflection;
  vec3 light = vec3(0.62, 1.25, 0.29) * (seal * 0.32 + sweep * (0.5 + charge * 0.14));
  float opacity = 0.045 + rim * 0.42 + reflection * 0.21 + seal * 0.19 + sweep * 0.38 + mist * 0.32;
  gl_FragColor = vec4(glass + light, clamp(opacity, 0.0, 0.84));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const plasmaFragment = /* glsl */ `
uniform float time;
uniform float charge;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  float u = vUv.x * 6.2831853;
  float flow = sin(u * 6.0 + vUv.y * 18.0 + time * 1.1 + sin(u * 4.0 - vUv.y * 13.0 - time * 0.8) * 1.9);
  float veins = pow(1.0 - abs(flow), 11.0);
  float band = sin(vUv.y * 16.0 - time * 1.35 + cos(u * 3.0) * 1.4) * 0.5 + 0.5;
  float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(cameraPosition - vWorld)), 0.0, 1.0), 2.2);
  vec3 plasma = mix(vec3(0.10, 0.24, 0.018), vec3(0.34, 0.75, 0.10), band);
  plasma += vec3(0.58, 0.95, 0.18) * veins * 1.65 + vec3(0.34, 0.44, 0.09) * rim;
  gl_FragColor = vec4(plasma * (1.0 + charge * 0.25), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const particles = Array.from({ length: 44 }, (_, i) => {
  const angle = i * 2.39996
  const radius = 0.54 + (i * 0.618 % 1) * 0.47
  return [Math.cos(angle) * radius, -1.08 - (i * 0.39 % 1) * 1.92, Math.sin(angle) * radius]
}).flat()

/** Animated interior of the tank. The shell, footing and anchors are in centerpieceModel. */
export function EvaChamber({ reduced, charge }: { reduced: boolean; charge: RefObject<number> }) {
  const heart = useRef<THREE.Group>(null!)
  const gimbal = useRef<THREE.Group>(null!)
  const crown = useRef<THREE.Group>(null!)
  const arcLight = useRef<THREE.MeshStandardMaterial>(null!)
  const uniforms = useMemo(() => ({ time: { value: 2.1 }, charge: { value: 0 } }), [])
  const label = useMemo(() => stencil('EVA / 01', 'CONTENCIÓN · ACTIVA', '#cbd6af'), [])
  const casing = useMemo(() => new THREE.LatheGeometry([
    [0.04, 0.72], [0.2, 0.69], [0.34, 0.58], [0.48, 0.41], [0.55, 0.28],
    [0.53, 0.21], [0.47, 0.18], [0.42, 0.22], [0.36, 0.37], [0.21, 0.55], [0.04, 0.61]
  ].reverse().map(([r, y]) => new THREE.Vector2(r, y)), 80), [])
  useEffect(() => () => { label.dispose(); casing.dispose() }, [label, casing])

  useFrame((_, delta) => {
    if (!reduced) uniforms.time.value += Math.min(delta, 0.1)
    const t = uniforms.time.value
    const intensity = reduced ? 0 : charge.current * 0.5 + registry.beat * 0.55
    uniforms.charge.value = intensity
    heart.current.rotation.y = t * 0.35
    heart.current.position.y = 2.04 + Math.sin(t * 1.3) * 0.065
    gimbal.current.rotation.set(0.18 + Math.sin(t * 0.55) * 0.16, -t * 0.23, -0.29)
    crown.current.rotation.y = t * 0.27
    arcLight.current.emissiveIntensity = 1.1 + (0.5 + 0.5 * Math.sin(t * 1.9)) * 0.35 + intensity * 0.4
  })

  return <>
    <mesh position={[0, 2.04, 0]} renderOrder={3}>
      <cylinderGeometry args={[1.12, 1.12, 2.18, 96, 1, true]} />
      <shaderMaterial vertexShader={earthVertex} fragmentShader={glassFragment} uniforms={uniforms} transparent depthWrite={false} />
    </mesh>
    <group ref={heart} position={[0, 2.04, 0]} rotation-z={-0.14}>
      <mesh>
        <sphereGeometry args={[0.48, 64, 48]} />
        <shaderMaterial vertexShader={earthVertex} fragmentShader={plasmaFragment} uniforms={uniforms} />
      </mesh>
      {[false, true].map(inverted => <group key={String(inverted)} rotation-z={inverted ? Math.PI : 0}>
        <mesh geometry={casing}>
          <meshStandardMaterial color="#5a4183" metalness={0.78} roughness={0.26} side={THREE.DoubleSide} />
        </mesh>
        <mesh position-y={0.225} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.515, 0.028, 10, 72]} />
          <meshStandardMaterial color="#acafbf" metalness={0.78} roughness={0.29} />
        </mesh>
        <mesh position-y={0.43} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.46, 0.012, 8, 72]} />
          <meshStandardMaterial color="#a8e951" emissive="#a8e951" emissiveIntensity={1.05} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => {
          const angle = i * Math.PI / 3
          return <mesh key={i} position={[Math.sin(angle) * 0.49, 0.31, Math.cos(angle) * 0.49]} rotation={[0.35, angle, 0, 'YXZ']}>
            <boxGeometry args={[0.081, 0.16, 0.035]} />
            <meshStandardMaterial color="#30283b" metalness={0.65} roughness={0.34} />
          </mesh>
        })}
      </group>)}
    </group>
    <group ref={gimbal} position={[0, 2.03, 0]}>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.81, 0.024, 10, 96]} />
        <meshStandardMaterial color="#81768e" metalness={0.75} roughness={0.32} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0.25]}>
        <torusGeometry args={[0.83, 0.018, 8, 72, 4.1]} />
        <meshStandardMaterial ref={arcLight} color="#d2fa81" emissive="#a0db41" />
      </mesh>
      <mesh rotation={[0.82, 0.68, 0]}>
        <torusGeometry args={[0.89, 0.011, 8, 64, 2.7]} />
        <meshStandardMaterial color="#c391f0" emissive="#9448e4" emissiveIntensity={1.25} />
      </mesh>
    </group>
    <group rotation-z={Math.PI}>
      <GlowPoints positions={particles} color="#c8ff73" size={0.051} intensity={1.9} opacity={0.7}
        fall={reduced ? 0 : 0.33} fallHeight={1.97} fallBase={-3.05} sway={0.025} reduced={reduced} />
    </group>
    <group ref={crown} position={[0, 3.725, 0]}>
      <group rotation-x={-Math.PI / 2}>
        {[0, 1, 2].map(i => <mesh key={i} rotation-z={i * Math.PI * 2 / 3}>
          <torusGeometry args={[0.69, 0.022, 8, 48, 1.15]} />
          <meshStandardMaterial color="#bfe578" emissive="#a0db41" emissiveIntensity={1.15} />
        </mesh>)}
      </group>
    </group>
    <mesh position={[0, 0.62, 1.386]}>
      <planeGeometry args={[0.83, 0.2075]} />
      <meshBasicMaterial map={label} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  </>
}
