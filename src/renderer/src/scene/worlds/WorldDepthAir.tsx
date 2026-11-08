import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { forestRandom } from './forestLayout'
import { registry } from '../registry'

/** Separate world-space veils between the near galleries, middle landforms and far horizon. */
export function WorldDepthAir({ crystal,reduced,detailed }: {crystal:boolean;reduced:boolean;detailed:boolean}){
  const resources=useMemo(()=>{
    const random=forestRandom(7980),count=detailed?64:30,geo=new THREE.InstancedBufferGeometry()
    geo.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3))
    geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geo.setIndex([0,1,2,0,2,3])
    const centers:number[]=[],sizes:number[]=[],seeds:number[]=[]
    for(let i=0;i<count;i++){
      const z=-18-random()*64,x=(random()-.5)*94
      centers.push(x,crystal?-3+random()*21:.2+random()*4,z)
      sizes.push(6+random()*11,crystal?4+random()*7:1.2+random()*3.2);seeds.push(random())
    }
    geo.setAttribute('center',new THREE.InstancedBufferAttribute(new Float32Array(centers),3));geo.setAttribute('size',new THREE.InstancedBufferAttribute(new Float32Array(sizes),2));geo.setAttribute('seed',new THREE.InstancedBufferAttribute(new Float32Array(seeds),1));geo.instanceCount=count
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},color:{value:new THREE.Color(crystal?'#526a9b':'#4a7283')}},
      vertexShader:`uniform float time;attribute vec3 center;attribute vec2 size;attribute float seed;varying vec2 vUv;varying float vSeed;void main(){vUv=uv;vSeed=seed;vec3 p=center;p.x+=sin(time*.027+seed*17.)*1.3;vec4 mv=modelViewMatrix*vec4(p,1.);mv.xy+=position.xy*size;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`uniform float time;uniform vec3 color;varying vec2 vUv;varying float vSeed;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}void main(){vec2 p=vUv*4.+vec2(vSeed*17.+time*.016,-time*.009);float cloud=n(p)*.6+n(p*2.13)*.28+n(p*4.3)*.12;float edge=pow(max(0.,1.-smoothstep(.12,.5,length((vUv-.5)*vec2(1.,1.3)))),2.);gl_FragColor=vec4(color,smoothstep(.15,.8,cloud)*edge*.14);}`})
    return{geo,mat}
  },[crystal,detailed])
  useFrame(()=>{resources.mat.uniforms.time.value=reduced?0:registry.time})
  useEffect(()=>()=>{resources.geo.dispose();resources.mat.dispose()},[resources])
  return <mesh geometry={resources.geo} material={resources.mat} frustumCulled={false} raycast={()=>{}}/>
}
