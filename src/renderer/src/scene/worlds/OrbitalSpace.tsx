import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import moonUrl from '@/assets/orbit/moon.jpg'
import jupiterUrl from '@/assets/orbit/jupiter.jpg'
import saturnUrl from '@/assets/orbit/saturn.jpg'
import sunUrl from '@/assets/orbit/sun.jpg'
import { EarthGlobe } from './EarthGlobe'
import { earthVertex } from './earthShaders'
import { advanceOrbit, celestialPosition, orbitFrame, SUN_OFFSET, sunDirection } from './orbit'

const planetFragment = /* glsl */ `
uniform sampler2D surfaceMap;
uniform vec3 sun;
uniform float selfLit;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main(){
  vec3 color=texture2D(surfaceMap,vUv).rgb;
  float lit=max(dot(normalize(vNormal),normalize(sun)),0.0);
  color *= mix(0.025+lit*1.5,3.3,selfLit);
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

function OrbitClock({ reduced }: { reduced: boolean }) {
  useFrame((_, delta) => {
    orbitFrame.angle = advanceOrbit(orbitFrame.angle, delta, reduced)
    if (!reduced) orbitFrame.cloudTime += Math.min(delta, 0.1)
  }, -50)
  return null
}

function CelestialBody({ url, offset, distance, elevation, radius, rings = false, solar = false }: {
  url: string; offset: number; distance: number; elevation: number; radius: number; rings?: boolean; solar?: boolean
}) {
  const map = useTexture(url)
  const group = useRef<THREE.Group>(null!)
  const uniforms = useMemo(() => ({ surfaceMap: { value: map }, sun: { value: new THREE.Vector3(...sunDirection(0)).normalize() }, selfLit: { value: solar ? 1 : 0 } }), [map, solar])
  useEffect(() => { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.needsUpdate = true }, [map])
  useFrame(() => {
    group.current.position.set(...celestialPosition(orbitFrame.angle, offset, distance, elevation))
    uniforms.sun.value.set(...sunDirection(orbitFrame.angle)).normalize()
  })
  return <group ref={group} position={celestialPosition(0, offset, distance, elevation)}>
    <mesh rotation={[0.1, rings ? 0.3 : 2.2, rings ? 0.35 : 0.05]} raycast={() => null}>
      <sphereGeometry args={[radius, 72, 48]} />
      <shaderMaterial vertexShader={earthVertex} fragmentShader={planetFragment} uniforms={uniforms} />
    </mesh>
    {rings && <mesh rotation={[-1.05, 0.12, 0.35]} raycast={() => null}>
      <ringGeometry args={[radius * 1.3, radius * 2.3, 160]} />
      <shaderMaterial transparent side={THREE.DoubleSide} depthWrite={false}
        vertexShader={`varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
        fragmentShader={`varying vec3 p; void main(){float r=length(p.xy)/${radius.toFixed(2)}; float grain=0.55+0.2*sin(r*190.0)+0.1*sin(r*470.0);float gap=1.0-smoothstep(1.90,1.93,r)*(1.0-smoothstep(1.98,2.01,r));vec3 c=mix(vec3(0.25,0.21,0.16),vec3(0.72,0.65,0.49),grain);gl_FragColor=vec4(c,grain*gap*0.88);}`} />
    </mesh>}
    {solar && <Billboard><mesh raycast={() => null}>
      <planeGeometry args={[radius * 8, radius * 8]} />
      <shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending}
        vertexShader={`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
        fragmentShader={`varying vec2 vUv;void main(){vec2 p=vUv-.5;float r=length(p);float a=exp(-r*18.0)*0.55+exp(-r*65.0);float ray=pow(abs(sin(atan(p.y,p.x)*7.0)),24.0)*exp(-r*17.0)*0.08;gl_FragColor=vec4(1.0,.64,.25,(a+ray)*smoothstep(.5,.37,r));}`} />
    </mesh></Billboard>}
  </group>
}

function Starfield() {
  const sky = useRef<THREE.Group>(null!)
  const dpr = useThree(s => s.viewport.dpr)
  const data = useMemo(() => {
    const count = 6200, positions = new Float32Array(count * 3), seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const band = i >= 4200
      const y = band ? Math.sin(i*17.31)*0.065 : 1 - 2 * (i + 0.5) / 4200
      const r = Math.sqrt(1-y*y), a = i * 2.399963
      const x = Math.cos(a)*r*225, z = Math.sin(a)*r*225
      positions.set([x*0.9-y*225*0.435, x*0.435+y*225*0.9, z], i*3)
      seeds[i] = band ? ((i*0.61803)%1)*0.55 : (i*0.61803)%1
    }
    return { positions, seeds }
  }, [])
  const uniforms = useMemo(() => ({ pixelRatio: { value: dpr } }), [dpr])
  useFrame(() => { sky.current.rotation.y = orbitFrame.angle })
  return <group ref={sky}>
    <points raycast={() => null}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[data.positions, 3]} /><bufferAttribute attach="attributes-seed" args={[data.seeds, 1]} /></bufferGeometry>
      <shaderMaterial uniforms={uniforms} transparent depthWrite={false}
        vertexShader={`uniform float pixelRatio;attribute float seed;varying float brightness;void main(){brightness=seed;gl_PointSize=(1.1+1.8*pow(seed,9.0))*pixelRatio;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
        fragmentShader={`varying float brightness;void main(){float r=length(gl_PointCoord-.5);float alpha=smoothstep(.5,.05,r)*(.45+.55*brightness);vec3 color=mix(vec3(.68,.81,1.0),vec3(1.0,.9,.75),brightness);gl_FragColor=vec4(color,alpha);}`} />
    </points>
  </group>
}

/** Sky in the rotating reference frame of the station. Nothing in the working area is transformed. */
export function OrbitalSpace({ reduced }: { reduced: boolean }) {
  const size = useThree(s => s.size)
  const pitch = -Math.max(0, Math.min(0.65, (1.1 - size.width / size.height) * 1.1))
  useEffect(() => { orbitFrame.pitch = pitch }, [pitch])
  return <>
    <OrbitClock reduced={reduced} />
    <Suspense fallback={null}>
      <Starfield />
      <group rotation-x={pitch}>
      <EarthGlobe position={[-5, -14, -38]} radius={10.4} />
      <CelestialBody url={moonUrl} offset={0.27} distance={115} elevation={-36} radius={4.7} />
      <CelestialBody url={saturnUrl} offset={-0.37} distance={140} elevation={-43} radius={4.8} rings />
      <CelestialBody url={jupiterUrl} offset={2.3} distance={150} elevation={-48} radius={8} />
      <CelestialBody url={sunUrl} offset={SUN_OFFSET} distance={145} elevation={-38} radius={4.5} solar />
      </group>
    </Suspense>
  </>
}
