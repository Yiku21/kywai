import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { registry } from '../registry'
import { forestRandom } from './forestLayout'

const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}float fbm(vec2 p){return n(p)*.57+n(p*2.13+7.)*.28+n(p*4.29-11.)*.15;}`

function WeatherFog({ winter, reduced, detailed }: { winter: boolean; reduced: boolean; detailed: boolean }) {
  const resources = useMemo(() => {
    const random = forestRandom(732), count = detailed ? 90 : 42
    const geo = new THREE.InstancedBufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3)); geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2)); geo.setIndex([0,1,2,0,2,3])
    const centers: number[] = [], scales: number[] = [], seeds: number[] = []
    for(let i=0;i<count;i++) {
      const z=-30+random()*44, x=(random()-.5)*65
      const back=z < -10, side=Math.abs(x)>11
      centers.push(x,back ? 1+random()*3 : .15+random()*.6,z)
      scales.push(5+random()*9,back ? 2+random()*3 : side ? 1.6 : .9); seeds.push(random())
    }
    geo.setAttribute('center',new THREE.InstancedBufferAttribute(new Float32Array(centers),3)); geo.setAttribute('extent',new THREE.InstancedBufferAttribute(new Float32Array(scales),2)); geo.setAttribute('seed',new THREE.InstancedBufferAttribute(new Float32Array(seeds),1)); geo.instanceCount=count
    const mat = new THREE.ShaderMaterial({ transparent:true,depthWrite:false,uniforms:{time:{value:0},winter:{value:winter?1:0}},
      vertexShader:`uniform float time;attribute vec3 center;attribute vec2 extent;attribute float seed;varying vec2 vUv;varying float vSeed;varying float vDepth;void main(){vUv=uv;vSeed=seed;vec3 p=center;p.x+=sin(time*.06+seed*16.)*1.4;vec4 mv=modelViewMatrix*vec4(p,1.);vDepth=center.z;mv.xy+=position.xy*extent;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`uniform float time;uniform float winter;varying vec2 vUv;varying float vSeed;varying float vDepth;${noise}
      void main(){vec2 q=(vUv-.5)*vec2(1.,1.24);float edge=pow(1.-smoothstep(.1,.5,length(q)),2.);float cloud=fbm(vUv*vec2(5.,3.)+vec2(time*.035+vSeed*19.,-time*.018));float density=smoothstep(.17,.78,cloud)*edge;vec3 cold=mix(vec3(.28,.31,.46),vec3(.39,.52,.65),winter);vec3 c=mix(cold,vec3(.65,.5,.3),winter*.12*pow(cloud,4.));float strength=vDepth < -10. ? .3 : .17;gl_FragColor=vec4(c,density*strength);}` })
    return { geo,mat }
  },[winter,detailed])
  useFrame(()=>{ resources.mat.uniforms.time.value=reduced?0:registry.time })
  useEffect(()=>()=>{resources.geo.dispose();resources.mat.dispose()},[resources])
  return <mesh geometry={resources.geo} material={resources.mat} frustumCulled={false} raycast={()=>{}} />
}

function FallingParticles({ winter, reduced, detailed }: { winter:boolean;reduced:boolean;detailed:boolean }) {
  const resources=useMemo(()=>{
    const random=forestRandom(7211), positions:number[]=[],seeds:number[]=[]
    for(let i=0;i<(winter ? detailed?2200:850 : detailed?440:180);i++){positions.push((random()-.5)*58,random()*22,-30+random()*48);seeds.push(random())}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1))
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},winter:{value:winter?1:0}},
      vertexShader:`uniform float time;uniform float winter;attribute float seed;varying float vSeed;varying float fade;varying float angle;void main(){vSeed=seed;vec3 p=position;float speed=winter>.5?.28+seed*.42:.1+seed*.2;p.y=mod(position.y-time*speed+220.,22.);p.x+=sin(time*.23+seed*74.+p.y*.25)*(winter>.5?.8:2.);p.z+=cos(time*.15+seed*31.)*.5;fade=smoothstep(.05,1.3,p.y)*(1.-smoothstep(19.,22.,p.y));angle=time*(.25+seed)+seed*31.;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((winter>.5?110.:150.)*(.4+seed)/max(1.,-mv.z),1.,winter>.5?10.:13.);}`,
      fragmentShader:`uniform float winter;varying float vSeed;varying float fade;varying float angle;void main(){vec2 p=gl_PointCoord-.5;float a;vec3 c;if(winter>.5){float d=length(p);a=exp(-d*d*22.)*(1.-smoothstep(.35,.5,d));c=mix(vec3(.58,.72,.9),vec3(1.),vSeed);}else{vec2 q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p;float leaf=length(vec2(q.x*2.,q.y));a=1.-smoothstep(.22,.39,leaf);c=mix(vec3(.43,.13,.045),vec3(.88,.44,.12),vSeed);}gl_FragColor=vec4(c,a*fade*(winter>.5?.72:.65));}`})
    return{geo,mat}
  },[winter,detailed])
  useFrame(()=>{resources.mat.uniforms.time.value=reduced?0:registry.time})
  useEffect(()=>()=>{resources.geo.dispose();resources.mat.dispose()},[resources])
  return <points geometry={resources.geo} material={resources.mat} frustumCulled={false} raycast={()=>{}} />
}

function LightShafts({ winter,reduced }: {winter:boolean;reduced:boolean}) {
  const resources=useMemo(()=>{
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},color:{value:new THREE.Color(winter?'#b5d7f0':'#b7afd9')}},
      vertexShader:`varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vView=-mv.xyz;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`uniform float time;uniform vec3 color;varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;${noise}void main(){float facing=pow(abs(dot(normalize(vNormal),normalize(vView))),2.);float ends=pow(max(0.,sin(clamp(vUv.y,0.,1.)*3.14159265)),1.3);float dust=.7+fbm(vec2(vUv.x*7.,vUv.y*4.-time*.018))*.3;gl_FragColor=vec4(color,facing*ends*dust*.075);}`})
    const beams=[{a:new THREE.Vector3(-15,16,-22),b:new THREE.Vector3(-9,-.5,-6)},{a:new THREE.Vector3(-12,17,-23),b:new THREE.Vector3(2,-.5,2)},{a:new THREE.Vector3(16,14,-23),b:new THREE.Vector3(9,-.5,-3)}].map(({a,b})=>({at:a.clone().add(b).multiplyScalar(.5),q:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),a.clone().sub(b).normalize()),geo:new THREE.CylinderGeometry(.16,2.5,a.distanceTo(b),32,1,true)}))
    return {mat,beams}
  },[winter])
  useFrame(()=>{resources.mat.uniforms.time.value=reduced?0:registry.time})
  useEffect(()=>()=>{resources.mat.dispose();resources.beams.forEach(b=>b.geo.dispose())},[resources])
  return <>{resources.beams.map((b,i)=><mesh key={i} position={b.at} quaternion={b.q} geometry={b.geo} material={resources.mat} raycast={()=>{}}/>)}</>
}

function Mountains() {
  const resources=useMemo(()=>{
    const items=[0,1,2].map(layer=>{
      const random=forestRandom(321+layer*53),points:number[]=[],colors:number[]=[],color=new THREE.Color()
      const ridge=Array.from({length:81},(_,i)=>({x:(i-40)*2,y:3+Math.sin(i*.38+layer)*2+Math.sin(i*.9)*1.3+random()*1.2+layer*1.2}))
      for(let i=0;i<80;i++){
        const a=ridge[i],b=ridge[i+1]
        for(const [x,y,top] of [[a.x,-10,0],[b.x,-10,0],[a.x,a.y,1],[a.x,a.y,1],[b.x,-10,0],[b.x,b.y,1]]){
          points.push(x,y,0);color.set(top?'#49637b':'#203348').lerp(new THREE.Color('#24364e'),layer*.18);colors.push(color.r,color.g,color.b)
        }
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return{geo,z:-61-layer*7}
    })
    const mat=new THREE.MeshBasicMaterial({vertexColors:true,fog:false});return{items,mat}
  },[])
  useEffect(()=>()=>{resources.items.forEach(x=>x.geo.dispose());resources.mat.dispose()},[resources])
  return <>{resources.items.map((x,i)=><mesh key={i} geometry={x.geo} material={resources.mat} position-z={x.z} raycast={()=>{}}/>)}</>
}

export function SeasonalWeather({ winter,reduced,detailed }: {winter:boolean;reduced:boolean;detailed:boolean}) {
  return <>
    {winter&&<Mountains/>}
    <WeatherFog winter={winter} reduced={reduced} detailed={detailed}/>
    <LightShafts winter={winter} reduced={reduced}/>
    <FallingParticles winter={winter} reduced={reduced} detailed={detailed}/>
  </>
}
