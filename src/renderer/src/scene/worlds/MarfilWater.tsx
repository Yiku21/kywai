import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { earthVertex } from './earthShaders'
import { palaceCanal, palaceFountains } from './marfilPalace'

const surface = /* glsl */ `
uniform float time;
varying vec2 vUv;
varying vec3 vWorld;
float ripple(vec2 p, float phase) {
  float d = length(p);
  return sin(d * 35.0 - phase * 6.6) * exp(-d * 2.4) * smoothstep(0.0,.11,d);
}
void main() {
  vec2 p = vWorld.xz;
  float large = sin(p.y * 5.8 + p.x * 4.8 - time * 2.7);
  float fine = sin(p.x * 20.0 - p.y * 10.3 - time * 3.2 + large * 1.6);
  float crossWave = cos(p.y * 13.2 + p.x * 12.0 - time * 3.6 + fine * .8);
  float jetX = abs(p.x) - 11.18;
  float impact = ripple(vec2(jetX, p.y + 10.4), time) + ripple(vec2(jetX,p.y + 2.9),time) + ripple(vec2(jetX,p.y - 6.6),time);
  vec3 normal = normalize(vec3(.056 * large + .076 * fine + impact * .12, 1.0, .12 * crossWave));
  vec3 view = normalize(cameraPosition - vWorld);
  float reflectance = pow(1.0 - clamp(dot(view,normal),0.0,1.0), 2.5);
  float foam = pow(max(0.0, impact), 4.0) * .63;
  float caustic = pow(max(0.0, sin((large + fine * .45) * 6.7 + crossWave * .62)), 12.0);
  vec3 base = mix(vec3(.044,.32,.295), vec3(.21,.57,.53), (large + 1.0) * .21 + caustic * .27);
  vec3 color = mix(base, vec3(.60,.78,.80), .20 + reflectance * .47);
  float glint = pow(max(0.0,dot(reflect(-normalize(vec3(-.4,.8,.26)),normal),view)), 38.0);
  color += vec3(1.0,.94,.76) * (glint * .38 + foam * .40);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const sheetVertex = /* glsl */ `
varying vec2 uvWater;
void main(){ uvWater=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`
const cascade = /* glsl */ `
uniform float time;
varying vec2 uvWater;
void main(){
  float width=smoothstep(0.0,.09,uvWater.x)*(1.0-smoothstep(.91,1.0,uvWater.x));
  float current=sin(uvWater.x*161.0 + sin(uvWater.y*19.0+time*4.0)*.87);
  float stream=.5+.5*sin(uvWater.y*65.0+time*13.0+current*1.7);
  float ripple=.25+.75*pow(stream,3.5);
  vec3 color=mix(vec3(.21,.56,.58),vec3(.79,.94,.95),.46+ripple*.43);
  gl_FragColor=vec4(color,width*smoothstep(0.0,.21,uvWater.y)*(.34+ripple*.38));
  #include <colorspace_fragment>
}`

export function MarfilWater({ reduced, detailed }: { reduced: boolean; detailed: boolean }) {
  const droplets = useRef<THREE.InstancedMesh>(null!)
  const effects = useMemo(() => {
    const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0,.43,0), new THREE.Vector3(.46,1.48,0), new THREE.Vector3(.97,1.03,0), new THREE.Vector3(1.32,.035,0))
    const arc = new THREE.TubeGeometry(curve, 42, .022, 8, false)
    const jets = [-1, 1].flatMap(side => palaceFountains.map(z => ({ side, z, x: side * (palaceCanal.x + .77) })))
    return { curve, arc, jets, uniforms: { time: { value: .6 } }, dummy: new THREE.Object3D(), point: new THREE.Vector3() }
  }, [])
  const perJet = detailed ? 23 : 12
  useEffect(() => () => effects.arc.dispose(), [effects])
  useFrame((_, delta) => {
    if (!reduced) effects.uniforms.time.value += Math.min(delta,.1)
    const time = effects.uniforms.time.value
    for (const [i, { side, x, z }] of effects.jets.entries()) for (let j = 0; j < perJet; j++) {
      const progress = (j / perJet + time * .74 + i * .127) % 1
      const p = effects.curve.getPointAt(progress, effects.point)
      const spread = Math.sin(progress * Math.PI) * .05
      const size = (.7 + j % 4 * .19) * Math.min(1, progress * 18, (1 - progress) * 13)
      const dummy = effects.dummy
      dummy.position.set(x - p.x * side, p.y + Math.sin(j * 5.2) * spread, z + Math.sin(j * 12.2 + time) * spread)
      dummy.scale.set(size * .72, size * 1.2, size * .7)
      dummy.updateMatrix()
      droplets.current.setMatrixAt(i * perJet + j, dummy.matrix)
    }
    droplets.current.instanceMatrix.needsUpdate = true
  })
  return <>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * palaceCanal.x, palaceCanal.y, palaceCanal.z]} rotation-x={-Math.PI / 2} raycast={() => {}}>
        <planeGeometry args={[palaceCanal.width, palaceCanal.depth]} />
        <shaderMaterial vertexShader={earthVertex} fragmentShader={surface} uniforms={effects.uniforms} />
      </mesh>
      <mesh position={[side * palaceCanal.x, -2.03, palaceCanal.z + palaceCanal.depth / 2 + .039]} raycast={() => {}}>
        <planeGeometry args={[palaceCanal.width, 4.03]} />
        <shaderMaterial vertexShader={sheetVertex} fragmentShader={cascade} uniforms={effects.uniforms} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>)}
    {effects.jets.map(({ side, x, z }) => <mesh key={`${side}/${z}`} position={[x, 0, z]} rotation-y={side > 0 ? Math.PI : 0} geometry={effects.arc} raycast={() => {}}>
      <meshPhysicalMaterial color="#cfebe7" roughness={.11} metalness={.10} transparent opacity={.57} depthWrite={false} clearcoat={1} />
    </mesh>)}
    <instancedMesh ref={droplets} args={[undefined, undefined, effects.jets.length * perJet]} frustumCulled={false} raycast={() => {}}>
      <sphereGeometry args={[.033, 8, 6]} />
      <meshPhysicalMaterial color="#e3faf2" metalness={.18} roughness={.15} clearcoat={1} />
    </instancedMesh>
  </>
}
