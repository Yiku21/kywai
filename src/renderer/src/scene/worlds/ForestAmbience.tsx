import { useMemo } from 'react'
import * as THREE from 'three'
import { GlowPoints } from '../GlowPoints'
import type { StationConfig } from '@shared/types'
import { forestClear, forestHeight, forestRandom, type ForestTree } from './forestLayout'
import { palette } from '../palette'
import { Bonfire } from './NightFire'

const skyVertex = /* glsl */ `
varying vec3 direction;
void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const skyFragment = /* glsl */ `
varying vec3 direction;
uniform vec3 horizonColor;
uniform float uNight;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 ray = normalize(direction);
  float morning = pow(max(0.0, dot(ray, normalize(vec3(-.29,.22,-1.0)))), 12.0) * (1.0 - uNight);
  vec3 horizon = mix(horizonColor, vec3(.012,.025,.03), uNight * .85);
  vec3 top = mix(vec3(.027,.073,.057), vec3(.006,.012,.022), uNight);
  vec3 sky = mix(horizon, top + vec3(.12,.13,.057) * morning, smoothstep(.035,.40,ray.y));
  // Estrellas entre las copas de noche.
  float star = step(.997, hash(floor(ray.xz / (ray.y + 1.2) * 240.0))) * smoothstep(.12,.4,ray.y) * uNight;
  sky += vec3(.8,.85,1.0) * star;
  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const veilVertex = /* glsl */ `
varying vec2 texCoord;
void main() { texCoord = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const mistFragment = /* glsl */ `
varying vec2 texCoord;
uniform float uNight;
void main() {
  vec2 p = texCoord - .5;
  float ripple = sin(texCoord.x * 14.0 + cos(texCoord.y * 10.0) * .6) * .08;
  float veil = exp(-pow((p.y + ripple + .17) * 4.2, 2.0)) * (1.0 - smoothstep(.18, .5, abs(p.x)));
  float edge = smoothstep(0.0,.17,texCoord.y) * (1.0-smoothstep(.5,1.0,texCoord.y));
  gl_FragColor = vec4(mix(vec3(.14,.29,.23), vec3(.035,.07,.065), uNight),veil*edge*.22);
  #include <colorspace_fragment>
}`
const shaftFragment = /* glsl */ `
varying vec2 texCoord;
uniform float uNight;
void main() {
  float reach = mix(.48,.105,texCoord.y);
  float beam = 1.0 - smoothstep(0.0,reach,abs(texCoord.x-.5));
  float ends = smoothstep(0.0,.23,texCoord.y) * (1.0-smoothstep(.81,1.0,texCoord.y));
  // Los rayos de sol entre los árboles se apagan al anochecer.
  gl_FragColor = vec4(.64,.57,.30,beam*beam*ends*.14*(1.0-uNight));
  #include <colorspace_fragment>
}`

export function ForestAmbience({ trees, detailed, reduced }: { trees: ForestTree[]; detailed: boolean; reduced: boolean }) {
  const horizon = useMemo(() => ({ horizonColor: { value: new THREE.Color(palette.fog) }, uNight: { value: 0 } }), [])
  const mists = useMemo(() => [0, 1, 2].map(() => ({ uNight: { value: 0 } })), [])
  const shafts = useMemo(() => [0, 1, 2].map(() => ({ uNight: { value: 0 } })), [])
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
      <shaderMaterial vertexShader={veilVertex} fragmentShader={mistFragment} uniforms={mists[i]} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>)}
    {[-10, -3, 5].map((x, i) => <mesh key={x} position={[x, 7.8 + i * .5, -15 - i * 4]} rotation={[0, -.18, .36]} raycast={() => {}}>
      <planeGeometry args={[5.8 + i * .42, 17.8]} />
      <shaderMaterial vertexShader={veilVertex} fragmentShader={shaftFragment} uniforms={shafts[i]} transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>)}
    <GlowPoints positions={flies} color="#ffd681" size={.11} intensity={2.45} opacity={.89}
      fall={reduced ? 0 : .08} fallBase={.34} fallHeight={10.3} sway={.43} flicker={reduced ? 0 : .32} nightGain={1.8} reduced={reduced} lively />
  </>
}

/** Sitios para las hogueras del claro: los dos primeros libres de puestos, caminos y árboles grandes. */
const CAMPFIRE_SPOTS: [number, number][] = [[-6.8, -7.2], [7.2, 10.8], [7, -7.5], [-7.2, 10.8], [-5, 12], [5, 12.5]]

/** Hogueras en el claro: de día leña apagada; al anochecer, fuego con su luz alrededor. */
export function ForestCampfires({ stations, reduced }: { stations: StationConfig[]; reduced: boolean }) {
  const spots = useMemo(() => CAMPFIRE_SPOTS.filter(([x, z]) => forestClear(x, z, stations, 1.3)).slice(0, 2), [stations])
  return <>{spots.map(([x, z], i) => <Bonfire key={`${x}:${z}`} position={[x, forestHeight(x, z), z]} seed={i * 3.1} reduced={reduced} />)}</>
}
