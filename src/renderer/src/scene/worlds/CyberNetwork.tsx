import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { cyberSectors, uplinkOutline } from './cyberOperations'
import type { Vec } from './models'
import { stencil } from './WorldMarkings'

const vertex = /* glsl */ `
varying vec2 pathUv;
varying vec3 world;
void main() {
  pathUv = uv;
  world = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`

const networkGrid = /* glsl */ `
varying vec3 world;
float grid(vec2 p) {
  vec2 distance = abs(fract(p - .5) - .5) / max(fwidth(p), vec2(.001));
  return 1.0 - min(1.0, min(distance.x, distance.y));
}
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 edge = b - a;
  return length(p - a - edge * clamp(dot(p - a, edge) / dot(edge, edge), 0.0, 1.0));
}
void main() {
  vec2 p = world.xz;
  float fine = grid(p * .45), major = grid(p * .09);
  float fade = exp(-length(vec2(p.x * .78, p.y + 14.0)) * .019);
  float tunnel = exp(-abs(p.x) * .16) * exp(-abs(p.y + 31.0) * .019);
  vec3 color = vec3(.008,.013,.036) + vec3(.013,.034,.103) * tunnel;
  color += vec3(.032,.11,.28) * (fine * .32 + major * .75) * fade;
  vec2 tile = p / 6.7;
  vec2 local = fract(tile);
  vec2 cell = floor(tile);
  float seed = fract(sin(dot(cell, vec2(17.31, 41.27))) * 43758.5);
  if (seed > .5) local.x = 1.0 - local.x;
  if (fract(seed * 11.0) > .5) local = local.yx;
  vec2 start = vec2(.19,.0), elbow = vec2(.19,.41), knee = vec2(.38,.6), end = vec2(.83,.6);
  float trace = min(segment(local,start,elbow),min(segment(local,elbow,knee),segment(local,knee,end)));
  float contact = abs(length(local - end) - .048);
  float smoothing = clamp(length(fwidth(tile)), .004, .045);
  float etched = 1.0 - smoothstep(.008,.009+smoothing,min(trace,contact));
  color += mix(vec3(.035,.13,.25),vec3(.12,.065,.24),seed) * etched * fade * .61;
  float distanceFade = smoothstep(55.0, 92.0, length(p - vec2(0.0,-12.0)));
  gl_FragColor = vec4(color, 1.0 - distanceFade);
  #include <colorspace_fragment>
}`

const traffic = /* glsl */ `
uniform float time;
uniform float phase;
uniform vec3 ink;
uniform float repeats;
varying vec2 pathUv;
void main() {
  float lane = fract(pathUv.x * repeats - time * .48 + phase);
  float head = smoothstep(.59, .66, lane) * (1.0 - smoothstep(.88, .91, lane));
  float trail = pow(smoothstep(.25,.9,lane), 3.0) * (1.0 - smoothstep(.9,.97,lane));
  float endFade = smoothstep(0.0,.065,pathUv.x) * (1.0 - smoothstep(.93,1.0,pathUv.x));
  gl_FragColor = vec4(ink * (.57 + head * 1.65), (.17 + head * .57 + trail * .29) * endFade);
  #include <colorspace_fragment>
}`

function paths() {
  const all: { points: Vec[]; color: string; radius: number; repeats: number }[] = []
  for (const side of [-1, 1]) {
    for (const [x, y] of [[1.9, .06], [3.1, .08], [2.8, 4.9]]) all.push({
      points: [[x * side, y, -13.7], [x * side, y, -28], [x * side, y, -50]],
      color: side < 0 ? '#55caff' : '#ad83ff', radius: .033, repeats: 6
    })
    for (let i = 0; i < 2; i++) {
      const x = side * (14.6 - i * .22), height = 6.17 - i * .23
      all.push({
        points: [[x, .12, 10], [x, .12, -7], [x, .19, -10.8], [side * 13.95, 1.1, -12],
          [side * 13.95, 5.1, -12], [side * 12.9, height, -12.45], [side * 10.2, height, -13.13],
          [side * 5.5, height, -14.45], [side * 3.6, height, -14.62]],
        color: i ? '#9b72f5' : '#53d6ff', radius: .031, repeats: 9
      })
    }
  }
  for (const { at: [x, , z], link: [linkX, , linkZ], color, remote } of cyberSectors) {
    const dx = x - linkX, dz = z - linkZ, length = Math.hypot(dx, dz)
    const offsetX = dz / length * .38, offsetZ = -dx / length * .38
    for (const side of [-1, 1]) all.push({
      points: [[linkX + offsetX * side, -.028, linkZ + offsetZ * side], [x + offsetX * side, -.028, z + offsetZ * side]],
      color, radius: remote ? .031 : .026, repeats: Math.max(2, Math.round(length / 3))
    })
  }
  return all
}

/** Decorative traffic is independent of the real transfers and respects reduced effects. */
export function CyberNetwork({ reduced }: { reduced: boolean }) {
  const scene = useMemo(() => {
    const time = { value: 0.8 }
    const traces = paths().map(({ points, color, radius, repeats }, i) => {
      const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal')
      const geometry = new THREE.TubeGeometry(curve, points.length === 2 ? 1 : 116, radius, 7, false)
      const uniforms = { time, phase: { value: i * .224 }, ink: { value: new THREE.Color(color) }, repeats: { value: repeats } }
      return { geometry, uniforms }
    })

    const points: number[] = [], colors: number[] = []
    const line = (a: Vec, b: Vec, color: THREE.Color) => {
      points.push(...a, ...b)
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
    }
    for (let ring = 1; ring <= 14; ring++) {
      const z = -15.4 - ring * 2.37
      const color = new THREE.Color(ring % 3 ? '#4aa3f0' : '#9369ed').multiplyScalar(1.2 - ring * .062)
      uplinkOutline.forEach((a, i) => {
        const b = uplinkOutline[(i + 1) % uplinkOutline.length]
        line([a[0], a[1] - .04, z], [b[0], b[1] - .04, z], color)
      })
    }
    // Wire volumes mark remote network nodes beyond the physical server banks.
    for (const side of [-1, 1]) for (let i = 0; i < 15; i++) {
      const x = side * (16.2 + (i * 7 % 13) * 1.55), z = -16 - (i * 11 % 19) * 2.35
      const y = 2.5 + (i * 5 % 8) * 1.06, r = .37 + (i % 4) * .19
      const color = new THREE.Color(i % 3 ? '#3863a9' : '#7e56b9').multiplyScalar(.65)
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        line([x - r, y + sx * r, z + sy * r], [x + r, y + sx * r, z + sy * r], color)
        line([x + sx * r, y - r, z + sy * r], [x + sx * r, y + r, z + sy * r], color)
        line([x + sx * r, y + sy * r, z - r], [x + sx * r, y + sy * r, z + r], color)
      }
    }
    const wire = new THREE.BufferGeometry()
    wire.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    wire.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const title = stencil('UPLINK / 01', 'TRONCAL DE DATOS', '#b4e1ff')
    return { time, traces, wire, title }
  }, [])
  useEffect(() => () => {
    scene.traces.forEach(trace => trace.geometry.dispose())
    scene.wire.dispose()
    scene.title.dispose()
  }, [scene])
  useFrame((_, dt) => { if (!reduced) scene.time.value += Math.min(dt, .1) })
  return <>
    <mesh position={[0, -.88, -18]} rotation-x={-Math.PI / 2} raycast={() => {}} renderOrder={-1}>
      <planeGeometry args={[250, 220]} />
      <shaderMaterial vertexShader={vertex} fragmentShader={networkGrid} transparent depthWrite={false} toneMapped={false} />
    </mesh>
    <lineSegments geometry={scene.wire} raycast={() => {}}>
      <lineBasicMaterial vertexColors transparent opacity={.83} depthWrite={false} fog={false} toneMapped={false} />
    </lineSegments>
    {scene.traces.map(trace => <mesh key={trace.geometry.uuid} geometry={trace.geometry} raycast={() => {}}>
      <shaderMaterial vertexShader={vertex} fragmentShader={traffic} uniforms={trace.uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </mesh>)}
    <mesh position={[0, 6.91, -14.839]} raycast={() => {}}>
      <planeGeometry args={[3.93, .98]} />
      <meshBasicMaterial map={scene.title} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  </>
}
