import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import { CrystalExpanse } from './CrystalExpanse'
import { registry } from '../registry'
import { crystalConnections, threadGeometry, orbWebCurves, weaveAnchors } from './crystalThreads'

const threadVertex = `attribute float progress;attribute float seed;varying float vProgress;varying float vSeed;
void main(){vProgress=progress;vSeed=seed;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`
const threadFragment = `uniform float time;uniform float opacity;varying float vProgress;varying float vSeed;
void main(){float wave=fract(vProgress-time*(.025+fract(vSeed)*.018)+vSeed);float pulse=pow(max(0.,1.-abs(wave-.5)*2.),70.);
float glint=pow(.5+.5*sin(vProgress*130.+vSeed*87.-time*.3),40.);vec3 silver=mix(vec3(.29,.44,.57),vec3(.82,.90,1.),glint*.6+pulse);
gl_FragColor=vec4(silver+vec3(.65,.56,.35)*pulse,opacity+glint*.2+pulse*.45);}`

function useThreads(geometry: THREE.BufferGeometry, reduced: boolean, opacity: number) {
  const material = useMemo(() => new THREE.ShaderMaterial({ vertexShader: threadVertex, fragmentShader: threadFragment, transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, opacity: { value: opacity } } }), [opacity])
  useFrame(() => { material.uniforms.time.value = reduced ? 0 : registry.time })
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  return material
}

export function CrystalWeave({ stations, detailed, reduced }: { stations: StationConfig[]; detailed: boolean; reduced: boolean }) {
  const resources = useMemo(() => {
    const curves = crystalConnections(stations)
    const lines = threadGeometry(curves, detailed ? 3 : 2, .018)
    const canopy = orbWebCurves(24, detailed ? 36 : 24, detailed ? 26 : 17, 5.5)
    const warp = threadGeometry(canopy, 2, .018, 160)
    const tubes = curves.filter((_, i) => i % 3 === 0).map(curve => new THREE.TubeGeometry(curve, 96, .010, 8, false))
    const glass = new THREE.MeshPhysicalMaterial({ color: '#c4e5f4', metalness: .05, roughness: .08, clearcoat: 1, transparent: true, opacity: .67, envMapIntensity: 2 })
    return { lines, warp, tubes, glass }
  }, [stations, detailed])
  const material = useThreads(resources.lines, reduced, .48)
  const warpMaterial = useThreads(resources.warp, reduced, .48)
  useEffect(() => () => { resources.tubes.forEach(g => g.dispose()); resources.glass.dispose() }, [resources])
  return <group>
    <lineSegments geometry={resources.lines} material={material} raycast={() => {}} />
    <group position-y={-1.2}><lineSegments geometry={resources.warp} material={warpMaterial} raycast={() => {}} /></group>
    <CrystalExpanse reduced={reduced} detailed={detailed} />
    <CrystalDew reduced={reduced} />
    {resources.tubes.map(g => <mesh key={g.uuid} geometry={g} material={resources.glass} raycast={() => {}} />)}
    {weaveAnchors.map((p, i) => <group key={i} position={p}>
      <mesh scale={[.11,.24,.11]}><octahedronGeometry args={[1]} /><meshPhysicalMaterial color="#c4dce9" roughness={.06} metalness={.1} clearcoat={1} transparent opacity={.8} /></mesh>
      <mesh><sphereGeometry args={[.035,12,8]} /><meshBasicMaterial color="#fff1d2" /></mesh>
    </group>)}
  </group>
}

export function CrystalKnot({ radius, reduced }: { radius: number; reduced: boolean }) {
  const geometry = useMemo(() => {
    const curves: THREE.Curve<THREE.Vector3>[] = []
    for (let i=0;i<18;i++) {
      const a=i/18*Math.PI*2
      curves.push(new THREE.CatmullRomCurve3(Array.from({length:97},(_,j)=>{
        const t=j/96*Math.PI*2,r=radius*.8
        return new THREE.Vector3(Math.cos(t)*Math.cos(a)*r,Math.sin(t)*r,Math.cos(t)*Math.sin(a)*r)
      }),true))
    }
    for(let k=-6;k<=6;k++) {
      const lat=k/7*Math.PI/2,r=Math.cos(lat)*radius*.8
      curves.push(new THREE.CatmullRomCurve3(Array.from({length:129},(_,j)=>{
        const a=j/128*Math.PI*2; return new THREE.Vector3(Math.cos(a)*r,Math.sin(lat)*radius*.8,Math.sin(a)*r)
      }),true))
    }
    return threadGeometry(curves,2,.009,128)
  }, [radius])
  const material = useThreads(geometry, reduced, .59)
  return <group>
    <lineSegments geometry={geometry} material={material} raycast={() => {}} />
    <mesh scale={[.34,.56,.34]}><octahedronGeometry args={[radius,1]}/><meshPhysicalMaterial color="#b6e9f1" roughness={.06} metalness={.12} clearcoat={1} emissive="#4e9eaf" emissiveIntensity={.18} transparent opacity={.66}/></mesh>
  </group>
}

export function CrystalSeat({ r,y,reduced,yaw=0 }: {r:number;y:number;reduced:boolean;yaw?:number}) {
  const geometry=useMemo(()=>threadGeometry(orbWebCurves(r,24,15,r*.18),2,.008,96),[r])
  const material=useThreads(geometry,reduced,.53)
  return <group position-y={y+r*.054} rotation-y={yaw}><lineSegments geometry={geometry} material={material}/></group>
}

function CrystalDew({ reduced }: {reduced:boolean}) {
  const ref=useMemo(()=>{
    const geometry=new THREE.SphereGeometry(1,16,12)
    const material=new THREE.MeshPhysicalMaterial({color:'#cce7ef',roughness:.04,metalness:.12,clearcoat:1,transparent:true,opacity:.68,envMapIntensity:2})
    const mesh=new THREE.InstancedMesh(geometry,material,168),dummy=new THREE.Object3D()
    for(let i=0;i<168;i++) {
      const a=(i%28)/28*Math.PI*2,r=5+Math.floor(i/28)*3.4,unit=r/24
      dummy.position.set(Math.cos(a)*r,-1.2+5.5*(unit*unit-.3),Math.sin(a)*r*.83)
      const size=.033+Math.sin(i*51)**2*.052
      dummy.scale.set(size,size*1.35,size);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.raycast=()=>{}
    return {mesh,geometry,material}
  },[])
  useFrame(()=>{ref.material.emissive.set('#7295b5');ref.material.emissiveIntensity=reduced?.05:.05+Math.sin(registry.time*.4)*.025})
  useEffect(()=>()=>{ref.mesh.dispose();ref.geometry.dispose();ref.material.dispose()},[ref])
  return <primitive object={ref.mesh}/>
}
