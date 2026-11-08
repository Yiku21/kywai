import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { registry } from '../registry'
import { forestRandom } from './forestLayout'
import { orbWebCurves, threadGeometry } from './crystalThreads'
import { surfaceMaps } from './surfaces'

export const crystalIslands = [
  { at:[-21,3,-8],size:5.7,yaw:.4 }, { at:[22,5,-13],size:6.7,yaw:-.6 },
  { at:[-25,10,-29],size:8.3,yaw:.8 }, { at:[25,-3,-34],size:7.2,yaw:-.3 },
  { at:[-9,9,-48],size:9.5,yaw:.2 }, { at:[29,14,-62],size:12,yaw:-.7 },
  { at:[-37,-5,-52],size:11,yaw:.5 }, { at:[-19,-2,14],size:4.2,yaw:-.5 },
  { at:[20,4,12],size:4.8,yaw:.8 }
] as const

const webs=[
  {at:[-15,6,-16],r:10,rotation:[.95,.52,-.22]},
  {at:[17,4,-25],r:10,rotation:[.68,-.6,.45]},
  {at:[-4,11,-42],r:15,rotation:[1.16,.2,-.28]},
  {at:[-30,-3,-34],r:11,rotation:[.4,.4,.8]},
  {at:[22,11,-50],r:13,rotation:[1.0,-.8,-.3]},
  {at:[-20,-2,8],r:7,rotation:[.15,-.4,.6]},
  {at:[22,5,5],r:8,rotation:[.8,.9,-.45]}
]

function quartzGeometry(){
  const profile=[new THREE.Vector2(0,-.65),new THREE.Vector2(.76,-.49),new THREE.Vector2(1,-.25),new THREE.Vector2(.88,.35),new THREE.Vector2(0,.8)]
  const g=new THREE.LatheGeometry(profile,7).toNonIndexed();g.computeVertexNormals();return g
}

/** A deep field of floating crystal landforms, rather than an empty sky behind one web. */
export function CrystalExpanse({reduced,detailed}:{reduced:boolean;detailed:boolean}){
  const resources=useMemo(()=>{
    const random=forestRandom(9027),geometries:THREE.BufferGeometry[]=[]
    const unit=quartzGeometry(),matrix=new THREE.Matrix4(),dummy=new THREE.Object3D()
    for(const island of crystalIslands){
      for(let i=0;i<(detailed?24:14);i++){
        const a=i*2.399,r=Math.sqrt(random())*island.size*.58
        const h=island.size*(.35+random()*.85)
        dummy.position.set(island.at[0]+Math.sin(a)*r,island.at[1]+h*.12,island.at[2]+Math.cos(a)*r*.7)
        dummy.rotation.set((random()-.5)*.65,island.yaw+a,(random()-.5)*.65)
        dummy.scale.set(island.size*(.085+random()*.075),h,island.size*(.08+random()*.07))
        dummy.updateMatrix();matrix.copy(dummy.matrix)
        geometries.push(unit.clone().applyMatrix4(matrix))
      }
    }
    const clusters=mergeGeometries(geometries);geometries.forEach(g=>g.dispose())
    const coreParts:THREE.BufferGeometry[]=[]
    const rawRock=new THREE.IcosahedronGeometry(1,5)
    rawRock.deleteAttribute('normal')
    const rock=mergeVertices(rawRock),rp=rock.getAttribute('position');rawRock.dispose()
    for(let i=0;i<rp.count;i++){
      const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),n=1+.10*Math.sin(x*11+z*4)*Math.cos(y*9)
      rp.setXYZ(i,x*n,y*n,z*n)
    }
    rock.computeVertexNormals()
    for(const island of crystalIslands){
      dummy.position.set(island.at[0],island.at[1]-island.size*.29,island.at[2])
      dummy.rotation.set(.18,island.yaw,.2);dummy.scale.set(island.size*.8,island.size*.44,island.size*.67);dummy.updateMatrix()
      coreParts.push(rock.clone().applyMatrix4(dummy.matrix))
    }
    rock.dispose()
    const cores=mergeGeometries(coreParts);coreParts.forEach(g=>g.dispose())
    const coreMaps=surfaceMaps('earth')
    const coreMat=new THREE.MeshPhysicalMaterial({color:'#263f54',...coreMaps,normalScale:new THREE.Vector2(.45,.45),roughness:.7,metalness:.28,clearcoat:.6,envMapIntensity:1.1})
    const color=new THREE.Color(),p=clusters.getAttribute('position'),colors:number[]=[]
    for(let i=0;i<p.count;i++){
      color.set(p.getY(i)>6?'#63899b':'#355c72');color.lerp(new THREE.Color('#a1bfd0'),Math.sin(p.getX(i)*.33+p.getZ(i)*.2)**2*.25)
      colors.push(color.r,color.g,color.b)
    }
    clusters.setAttribute('color',new THREE.Float32BufferAttribute(colors,3))
    const crystal=new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.16,metalness:.17,transmission:.32,thickness:.24,ior:1.46,clearcoat:1,clearcoatRoughness:.07,envMapIntensity:1.65,flatShading:true})
    crystal.onBeforeCompile=shader=>{
      shader.vertexShader=`varying vec3 vCrystal;\n${shader.vertexShader}`.replace('#include <begin_vertex>','#include <begin_vertex>\nvCrystal=position;')
      shader.fragmentShader=`varying vec3 vCrystal;\n${shader.fragmentShader}`.replace('#include <color_fragment>',`#include <color_fragment>
        float mineral=.5+.5*sin(vCrystal.y*62.+sin(vCrystal.x*17.+vCrystal.z*11.)*1.4);
        diffuseColor.rgb*=.92+.08*mineral;`)
    }
    crystal.customProgramCacheKey=()=> 'cosmic-cut-quartz-striae'
    const edges=new THREE.EdgesGeometry(clusters,22),edgeMat=new THREE.LineBasicMaterial({color:'#8eb8cc',transparent:true,opacity:.14,depthWrite:false})
    const drifting=new THREE.InstancedMesh(unit,new THREE.MeshPhysicalMaterial({color:'#89a9c4',roughness:.1,metalness:.2,clearcoat:1,transparent:true,opacity:.66}),detailed?96:46)
    const specs=Array.from({length:drifting.count},()=>({x:(random()-.5)*82,y:-7+random()*24,z:16-random()*95,size:.08+random()**2*.42,phase:random()*6.28}))
    drifting.frustumCulled=false;drifting.raycast=()=>{}
    return {clusters,crystal,edges,edgeMat,drifting,specs,dummy,unit,cores,coreMat,coreMaps}
  },[detailed])
  useFrame(()=>{
    const t=reduced?0:registry.time*.075
    resources.specs.forEach((s,i)=>{
      const d=resources.dummy
      d.position.set(s.x+Math.sin(t*.7+s.phase)*.35,s.y+Math.sin(t+s.phase)*.45,s.z+Math.cos(t*.4+s.phase)*.25)
      d.rotation.set(s.phase+t*.1,t*.2+s.phase,.4);d.scale.set(s.size,s.size*2.5,s.size);d.updateMatrix();resources.drifting.setMatrixAt(i,d.matrix)
    })
    resources.drifting.instanceMatrix.needsUpdate=true
  })
  useEffect(()=>()=>{resources.clusters.dispose();resources.crystal.dispose();resources.edges.dispose();resources.edgeMat.dispose();resources.drifting.dispose();(resources.drifting.material as THREE.Material).dispose();resources.unit.dispose();resources.cores.dispose();resources.coreMat.dispose();Object.values(resources.coreMaps).forEach(t=>t.dispose())},[resources])
  return <group>
    <mesh geometry={resources.cores} material={resources.coreMat} receiveShadow raycast={()=>{}}/>
    <mesh geometry={resources.clusters} material={resources.crystal} receiveShadow raycast={()=>{}}/>
    <lineSegments geometry={resources.edges} material={resources.edgeMat} raycast={()=>{}}/>
    <primitive object={resources.drifting}/>
    {webs.slice(0,detailed?7:5).map((w,i)=><SuspendedWeb key={i} index={i} at={w.at as [number,number,number]} rotation={w.rotation as [number,number,number]} radius={w.r} reduced={reduced} detailed={detailed}/>)}
    <CosmicCocoons reduced={reduced}/>
    <pointLight position={[-18,7,-12]} color="#99dce9" intensity={35} distance={23} decay={2}/>
    <pointLight position={[19,9,-19]} color="#b8a6f0" intensity={40} distance={25} decay={2}/>
  </group>
}

function SuspendedWeb({at,rotation,radius,reduced,detailed,index}:{at:[number,number,number];rotation:[number,number,number];radius:number;reduced:boolean;detailed:boolean;index:number}){
  const ref=useRef<THREE.Group>(null!)
  const resources=useMemo(()=>{
    const geo=threadGeometry(orbWebCurves(radius,detailed?32:22,detailed?21:13,radius*.22),1,0,144)
    const mat=new THREE.LineBasicMaterial({color:index%2?'#9caed1':'#96c8d3',transparent:true,opacity:index>3?.17:.3,depthWrite:false})
    return {geo,mat}
  },[radius,detailed,index])
  useFrame(()=>{
    const t=reduced?0:registry.time*.035
    ref.current.rotation.set(rotation[0]+Math.sin(t+index)*.025,rotation[1]+Math.cos(t*.7+index)*.025,rotation[2])
  })
  useEffect(()=>()=>{resources.geo.dispose();resources.mat.dispose()},[resources])
  return <group ref={ref} position={at}><lineSegments geometry={resources.geo} material={resources.mat} raycast={()=>{}}/></group>
}

function CosmicCocoons({reduced}:{reduced:boolean}){
  const resources=useMemo(()=>{
    const g=new THREE.SphereGeometry(1,32,24),wire=new THREE.BufferGeometry(),positions:number[]=[]
    for(const sign of [-1,1])for(let offset=0;offset<3;offset++)for(let j=0;j<640;j++)for(const t of [j/640,(j+1)/640]){
      const y=t*2-1,r=Math.sqrt(Math.max(0,1-y*y)),a=t*Math.PI*2*17*sign+offset*.14
      positions.push(Math.sin(a)*r,y,Math.cos(a)*r)
    }
    wire.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
    const mat=new THREE.MeshPhysicalMaterial({color:'#94bbd0',roughness:.08,metalness:.15,clearcoat:1,transparent:true,opacity:.32,depthWrite:false})
    const thread=new THREE.LineBasicMaterial({color:'#a2c5d6',transparent:true,opacity:.22,depthWrite:false})
    return {g,wire,mat,thread}
  },[])
  useEffect(()=>()=>{resources.g.dispose();resources.wire.dispose();resources.mat.dispose();resources.thread.dispose()},[resources])
  const bodies=[[-17,8,-17,1.3],[20,2,-24,1.7],[-9,8,-39,2.4],[17,14,-44,2.1],[-28,4,-34,1.6]]
  return <>{bodies.map(([x,y,z,s],i)=><group key={i} position={[x,y,z]} scale={[s,s*1.8,s]} rotation={[.2,i,.2]}>
    <mesh geometry={resources.g} material={resources.mat}/>
    <lineSegments geometry={resources.wire} material={resources.thread} raycast={()=>{}}/>
    <mesh scale={.19}><octahedronGeometry args={[1,1]}/><meshStandardMaterial color="#b3e7ed" emissive="#7db6d7" emissiveIntensity={reduced?.2:.45}/></mesh>
  </group>)}</>
}
