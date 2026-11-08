import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { registry } from '../registry'
import { glowTexture } from '../assets'

/** Cut crown, girdle and pavilion: clear faces, reflective edges and restrained scintillation. */
export function RelicGem({ radius, reduced }: {radius:number;reduced:boolean}) {
  const flares=useRef<(THREE.Sprite|null)[]>([])
  const resources=useMemo(()=>{
    const profile=[[0,-.94],[.48,-.25],[.68,.12],[.68,.20],[.53,.58],[.26,.91],[0,.91]]
    const geometry=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r*radius,y*radius)),12).toNonIndexed()
    geometry.rotateY(Math.PI/12);geometry.computeVertexNormals()
    const p=geometry.getAttribute('position'),color=new THREE.Color(),colors:number[]=[]
    for(let i=0;i<p.count;i++){
      const face=Math.floor(i/3),variation=.88+.12*Math.sin(face*17.7)**2
      color.setRGB(variation*.88,variation*.97,variation);colors.push(color.r,color.g,color.b)
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3))
    const material=new THREE.MeshPhysicalMaterial({vertexColors:true,color:'#f0fbff',transparent:true,opacity:.94,depthWrite:false,roughness:.028,metalness:0,transmission:.97,thickness:.65,ior:1.52,dispersion:.045,clearcoat:1,clearcoatRoughness:.025,attenuationColor:new THREE.Color('#dcf3f7'),attenuationDistance:60,envMapIntensity:2.2,flatShading:true})
    const edges=new THREE.EdgesGeometry(geometry,8),edgeMat=new THREE.LineBasicMaterial({color:'#d3e7ef',transparent:true,opacity:.14,depthWrite:false})
    const glints=Array.from({length:8},(_,i)=>{
      const a=i/8*Math.PI*2+.1,r=.68*radius
      return {at:new THREE.Vector3(Math.sin(a)*r,.16*radius,Math.cos(a)*r),mat:new THREE.SpriteMaterial({map:glowTexture,color:i%3?'#c7e8ff':'#ffe8b6',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false})}
    })
    return {geometry,material,edges,edgeMat,glints}
  },[radius])
  useFrame(()=>{
    const t=reduced?0:registry.time
    resources.glints.forEach((g,i)=>{
      const pulse=reduced?.1:Math.pow(Math.max(0,Math.sin(t*.43+i*2.1)),32)
      g.mat.opacity=.05+pulse*.8
      const sprite=flares.current[i];if(sprite)sprite.scale.setScalar(.05+pulse*.27)
    })
  })
  useEffect(()=>()=>{resources.geometry.dispose();resources.material.dispose();resources.edges.dispose();resources.edgeMat.dispose();resources.glints.forEach(g=>g.mat.dispose())},[resources])
  return <group>
    <pointLight position={[0,1.5,2]} color="#b1e3ef" intensity={5} distance={6} decay={2}/>
    <mesh geometry={resources.geometry} material={resources.material}/>
    <lineSegments geometry={resources.edges} material={resources.edgeMat} raycast={()=>{}}/>
    {resources.glints.map((g,i)=><sprite key={i} ref={s=>{flares.current[i]=s}} position={g.at} material={g.mat} scale={.1} raycast={()=>{}}/>)}
    <mesh scale={[.16,.28,.16]}><octahedronGeometry args={[1,0]}/><meshPhysicalMaterial color="#adf0f2" roughness={.08} metalness={.1} emissive="#4cbbca" emissiveIntensity={.32} clearcoat={1}/></mesh>
  </group>
}
