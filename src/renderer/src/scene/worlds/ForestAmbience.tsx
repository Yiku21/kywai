import { useMemo } from 'react'
import * as THREE from 'three'
import { GlowPoints } from '../GlowPoints'
import { forestHeight, forestRandom, type ForestTree } from './forestLayout'
import { palette } from '../palette'

const skyVertex = /* glsl */ `
varying vec3 direction;
void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const skyFragment = /* glsl */ `
varying vec3 direction;
uniform vec3 horizonColor;
void main() {
  vec3 ray = normalize(direction);
  float morning = pow(max(0.0, dot(ray, normalize(vec3(-.29,.22,-1.0)))), 12.0);
  vec3 sky = mix(horizonColor, vec3(.027,.073,.057) + vec3(.12,.13,.057) * morning, smoothstep(.035,.40,ray.y));
  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const veilVertex = /* glsl */ `
varying vec2 texCoord;
void main() { texCoord = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const mistFragment = /* glsl */ `
varying vec2 texCoord;
void main() {
  vec2 p = texCoord - .5;
  float ripple = sin(texCoord.x * 14.0 + cos(texCoord.y * 10.0) * .6) * .08;
  float veil = exp(-pow((p.y + ripple + .17) * 4.2, 2.0)) * (1.0 - smoothstep(.18, .5, abs(p.x)));
  float edge = smoothstep(0.0,.17,texCoord.y) * (1.0-smoothstep(.5,1.0,texCoord.y));
  gl_FragColor = vec4(.14,.29,.23,veil*edge*.22);
  #include <colorspace_fragment>
}`
const shaftFragment = /* glsl */ `
varying vec2 texCoord;
void main() {
  float reach = mix(.48,.105,texCoord.y);
  float beam = 1.0 - smoothstep(0.0,reach,abs(texCoord.x-.5));
  float ends = smoothstep(0.0,.23,texCoord.y) * (1.0-smoothstep(.81,1.0,texCoord.y));
  gl_FragColor = vec4(.64,.57,.30,beam*beam*ends*.14);
  #include <colorspace_fragment>
}`

export function ForestAmbience({ trees, detailed, reduced }: { trees: ForestTree[]; detailed: boolean; reduced: boolean }) {
  const horizon = useMemo(() => ({ horizonColor: { value: new THREE.Color(palette.fog) } }), [])
  const flies = useMemo(() => {
    const random = forestRandom(42)
    const near = trees.filter(t => t.z > -33 && t.z < 19 && Math.abs(t.x) < 26)
    const distant = near.flatMap(tree => Array.from({ length: detailed ? 10 : 6 }, () => {
      const angle = random() * Math.PI * 2, radius = .8 + random() * 3.2
      const y = forestHeight(tree.x, tree.z) + .47 + random() ** 1.32 * Math.min(10.2, tree.height * .82)
      return [tree.x + Math.sin(angle) * radius, y, tree.z + Math.cos(angle) * radius]
    })).flat()
    for (let i = 0; i < 22; i++) {
      const angle = i * 2.39996, radius = .95 + random() * 2.6
      distant.push(Math.sin(angle) * radius, .45 + random() * 3.8, Math.cos(angle) * radius)
    }
    return distant
  }, [trees, detailed])
  return <>
    <mesh raycast={() => {}} renderOrder={-10}>
      <sphereGeometry args={[137, 48, 24]} />
      <shaderMaterial vertexShader={skyVertex} fragmentShader={skyFragment} uniforms={horizon} side={THREE.BackSide} depthWrite={false} toneMapped={false} />
    </mesh>
    {[-42, -29, -17].map((z, i) => <mesh key={z} position={[i % 2 ? -6 : 3, 2.4 + i * .4, z]} raycast={() => {}}>
      <planeGeometry args={[72 - i * 12, 8.4]} />
      <shaderMaterial vertexShader={veilVertex} fragmentShader={mistFragment} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>)}
    {[-10, -3, 5].map((x, i) => <mesh key={x} position={[x, 7.8 + i * .5, -15 - i * 4]} rotation={[0, -.18, .36]} raycast={() => {}}>
      <planeGeometry args={[5.8 + i * .42, 17.8]} />
      <shaderMaterial vertexShader={veilVertex} fragmentShader={shaftFragment} transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>)}
    <GlowPoints positions={flies} color="#ffd681" size={.11} intensity={2.45} opacity={.89}
      fall={reduced ? 0 : .08} fallBase={.34} fallHeight={10.3} sway={.43} flicker={reduced ? 0 : .32} reduced={reduced} />
  </>
}
