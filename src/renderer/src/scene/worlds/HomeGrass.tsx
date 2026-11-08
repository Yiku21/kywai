import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HOME_BREEZE_GLSL, HOME_PLANT_TRANSFORM } from './homeBreeze'
import { homeLandHeight, lawnPositions } from './homeLand'
import { registry } from '../registry'

function tuftGeometry() {
  const p:number[]=[],uv:number[]=[],ids:number[]=[]
  for(let blade=0;blade<4;blade++) {
    const a=blade*2.399,offset=p.length/3
    for(let i=0;i<=4;i++) for(const side of [-1,1]) {
      const t=i/4,w=.015*(1-t)**.75+.00015,x=side*w+Math.sin(t*1.8)*t*.06,z=t*t*.14
      p.push(Math.cos(a)*x+Math.sin(a)*z,t,Math.cos(a)*z-Math.sin(a)*x);uv.push(side<0?0:1,t)
      if(i<4&&side===-1){const k=offset+i*2;ids.push(k,k+2,k+1,k+1,k+2,k+3)}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ids);g.computeVertexNormals();return g
}

export function HomeGrass({detailed,reduced}:{detailed:boolean;reduced:boolean}) {
  const resources=useMemo(()=>{
    const geometry=tuftGeometry(),time={value:0},enabled={value:1}
    const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,metalness:0,side:THREE.DoubleSide})
    material.onBeforeCompile=shader=>{
      shader.uniforms.homeWindTime=time;shader.uniforms.homeWindEnabled=enabled
      shader.vertexShader=`uniform float homeWindTime;uniform float homeWindEnabled;varying vec2 lawnUv;${HOME_BREEZE_GLSL}\n`+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        lawnUv=uv;vec4 homePlantRoot=vec4(instanceMatrix[3].xyz,length(instanceMatrix[1].xyz));float homePlantFlex=1.65;
        ${HOME_PLANT_TRANSFORM}`)
      shader.fragmentShader='varying vec2 lawnUv;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float growth=smoothstep(0.,.95,lawnUv.y);
        diffuseColor.rgb*=mix(vec3(.58,.65,.42),vec3(1.05,1.10,.86),growth);
        if(!gl_FrontFacing) diffuseColor.rgb*=1.13;`)
    }
    material.customProgramCacheKey=()=> 'kywai-grass-breeze'
    const positions=lawnPositions(detailed?48000:18000),mesh=new THREE.InstancedMesh(geometry,material,positions.length)
    const dummy=new THREE.Object3D(),green=new THREE.Color('#8ca252'),dry=new THREE.Color('#b7b078'),color=new THREE.Color()
    positions.forEach((p,i)=>{
      dummy.position.set(p.x,homeLandHeight(p.x,p.z)+.006,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(.7+p.height,p.height,.7+p.height);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)
      color.copy(dry).lerp(green,p.variation);mesh.setColorAt(i,color)
    })
    mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor!.needsUpdate=true;mesh.receiveShadow=true;mesh.castShadow=false;mesh.computeBoundingSphere();mesh.name='coastal-lawn-with-breeze'
    return {geometry,material,mesh,time,enabled}
  },[detailed])
  useFrame(()=>{resources.time.value=registry.time*.7;resources.enabled.value=reduced?0:1})
  useEffect(()=>()=>{resources.mesh.dispose();resources.geometry.dispose();resources.material.dispose()},[resources])
  return <primitive object={resources.mesh} />
}
