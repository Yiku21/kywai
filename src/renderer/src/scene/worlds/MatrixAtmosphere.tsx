import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const mistVertex = /* glsl */ `
varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`
const mistFragment = /* glsl */ `
uniform float time;
uniform float seed;
uniform float opacity;
varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
float fbm(vec2 p){float n=0.0,a=.5;for(int i=0;i<4;i++){n+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.03+11.2;a*=.5;}return n;}
void main(){
  vec2 p=vUv*vec2(5.5,2.6)+seed;
  p.x-=time*.026;
  float curl=fbm(p*.8+vec2(0,time*.018));
  float n=fbm(p+vec2(curl*1.7,-time*.014));
  float billow=smoothstep(.24,.76,n);
  float edge=smoothstep(0.0,.18,vUv.x)*(1.0-smoothstep(.82,1.0,vUv.x))*smoothstep(0.0,.23,vUv.y)*(1.0-smoothstep(.68,1.0,vUv.y));
  float a=billow*edge*opacity;
  vec3 c=mix(vec3(.04,.075,.055),vec3(.18,.26,.20),smoothstep(.28,.8,n));
  gl_FragColor=vec4(c,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** Shared, smooth machinery geometry. The thin articulated cables flex in the vertex shader. */
function machineResources(time: { value: number }) {
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const geometry = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g }
  const material = <T extends THREE.Material>(m: T) => { materials.push(m); return m }
  const metal = material(new THREE.MeshStandardMaterial({ color: '#33453e', metalness: .82, roughness: .32 }))
  const armor = material(new THREE.MeshStandardMaterial({ color: '#182820', metalness: .65, roughness: .42 }))
  const silver = material(new THREE.MeshStandardMaterial({ color: '#7f9387', metalness: .8, roughness: .33 }))
  const eye = material(new THREE.MeshStandardMaterial({ color: '#60140b', emissive: '#ff4b20', emissiveIntensity: 2.8, roughness: .2 }))
  const cableMat = material(new THREE.MeshStandardMaterial({ color: '#41594a', metalness: .8, roughness: .4 }))
  cableMat.onBeforeCompile = shader => {
    shader.uniforms.movementTime = time
    shader.vertexShader = `uniform float movementTime;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      float flex=1.0-smoothstep(-3.8,-.45,position.z);
      transformed.x+=sin(position.z*2.1+movementTime*.85+position.y*1.7)*.2*flex;
      transformed.y+=sin(position.z*2.7-movementTime*1.1+position.x)*.18*flex;`)
  }
  cableMat.customProgramCacheKey = () => 'matrix-machine-tendrils'
  const sphere = geometry(new THREE.SphereGeometry(1, 32, 24))
  const ring = geometry(new THREE.TorusGeometry(.64, .045, 10, 56))
  const body = new THREE.Group()
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale: [number, number, number]) => {
    const mesh = new THREE.Mesh(g, mat)
    mesh.position.set(...pos); mesh.scale.set(...scale); mesh.raycast = () => {}
    body.add(mesh)
    return mesh
  }
  add(sphere, metal, [0, 0, 0], [.66, .46, 1.05])
  add(sphere, armor, [0, .28, -.17], [.56, .23, .84])
  add(sphere, armor, [0, 0, .88], [.48, .34, .23])
  for (const z of [-.65, -.3, .05]) add(ring, silver, [0, 0, z], [1, .72, 1])
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2
    const x = Math.cos(a) * .32, y = Math.sin(a) * .22
    add(sphere, silver, [x, y, 1.01], [.092, .092, .07])
    add(sphere, eye, [x, y, 1.07], [.051, .051, .037])
  }
  const tubes: THREE.BufferGeometry[] = [], collars: THREE.BufferGeometry[] = []
  for (let arm = 0; arm < 8; arm++) {
    const a = arm * Math.PI / 4
    const cx = Math.cos(a), cy = Math.sin(a)
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cx * .45, cy * .33, -.4),
      new THREE.Vector3(cx * 1.1, cy * .82, -1.15),
      new THREE.Vector3(cx * 1.5, cy * .92 - .1, -2.1),
      new THREE.Vector3(cx * 1.05 + Math.sin(a * 2) * .3, cy * .7 - .3, -3.3),
      new THREE.Vector3(cx * 1.3, cy * .4 - .25, -4.1 - arm % 3 * .25)
    ])
    tubes.push(new THREE.TubeGeometry(curve, 48, .046, 7, false))
    for (let joint = 1; joint < 11; joint++) {
      const p = curve.getPoint(joint / 12)
      const g = new THREE.SphereGeometry(.066, 8, 6)
      g.translate(p.x, p.y, p.z); collars.push(g)
    }
    add(sphere, silver, [cx * .55, cy * .36, -.43], [.15, .14, .18])
  }
  const tubing = geometry(mergeGeometries(tubes)!)
  const joints = geometry(mergeGeometries(collars)!)
  tubes.forEach(g => g.dispose()); collars.forEach(g => g.dispose())
  add(tubing, cableMat, [0, 0, 0], [1, 1, 1])
  add(joints, cableMat, [0, 0, 0], [1, 1, 1])
  return { body, geometries, materials }
}

export function MatrixAtmosphere({ reduced, detailed }: { reduced: boolean; detailed: boolean }) {
  const resources = useMemo(() => {
    const time = { value: 0 }
    const template = machineResources(time)
    const fleet = Array.from({ length: detailed ? 3 : 2 }, (_, i) => {
      const group = template.body.clone(true)
      group.name = `distant-machine-${i}`
      group.scale.setScalar(i === 1 ? 1.15 : .92)
      return group
    })
    const plane = new THREE.PlaneGeometry(1, 1)
    const sheets = [
      [-15, 7, -20, 27, 12, .6], [12, 8, -21, 29, 13, .58],
      [0, 11, -27, 39, 15, .7], [-24, 5, -12, 18, 9, .48], [24, 5, -12, 18, 9, .48],
      [-6, 2, -13.8, 33, 6, .35], [9, 4, -24, 31, 10, .6]
    ].slice(0, detailed ? 7 : 3).map(([x, y, z, w, h, opacity], i) => {
      const mat = new THREE.ShaderMaterial({ vertexShader: mistVertex, fragmentShader: mistFragment, transparent: true, depthWrite: false,
        side: THREE.DoubleSide, uniforms: { time, seed: { value: i * 7.73 }, opacity: { value: opacity } } })
      const mesh = new THREE.Mesh(plane, mat)
      mesh.position.set(x, y, z); mesh.scale.set(w, h, 1); mesh.raycast = () => {}
      return mesh
    })
    return { time, template, fleet, plane, sheets }
  }, [detailed])
  useEffect(() => () => {
    resources.template.geometries.forEach(g => g.dispose())
    resources.template.materials.forEach(m => m.dispose())
    resources.sheets.forEach(s => s.material.dispose())
    resources.plane.dispose()
  }, [resources])
  useFrame((_, delta) => {
    if (!reduced) resources.time.value += Math.min(delta, .1)
    const t = resources.time.value
    resources.fleet.forEach((machine, i) => {
      const a = t * (.028 + i * .005) + [-.5, 1.3, 3.4][i]
      // Closed paths stay behind the workspace; no wrap/teleport at either edge.
      machine.position.set(Math.sin(a) * (8 + i * 3), 7.8 + i * .8 + Math.sin(a * 2) * .65, -21 - i * 2.5 + Math.cos(a) * 1.5)
      machine.rotation.set(Math.sin(t * .24 + i) * .045, Math.atan2(Math.cos(a) * (8 + i * 3), -Math.sin(a) * 1.5), Math.sin(a) * .08)
    })
  })
  return <group name="matrix-distant-atmosphere">
    {resources.fleet.map(m => <primitive key={m.uuid} object={m} />)}
    {resources.sheets.map(m => <primitive key={m.uuid} object={m} />)}
  </group>
}
