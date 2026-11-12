import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import { registry, type PulseTarget } from '../registry'
import { setAnchorObject } from '../anchors'
import { useCowork } from '@/store/cowork'
import { Model, type Vec } from './models'
import { WorldModel } from './WorldScenery'
import { GlowPoints } from '../GlowPoints'
import { nightRamp, spaceNight } from '../nightLight'
import { homeSkyGeometry } from './homeSkyGeometry'
import { AtlantisCity } from './AtlantisCity'
import { OceanGiants, LivingJellyfish, FishShoals } from './UnderseaLife'
import sandUrl from '../../assets/submarino/sand.png'
import reefUrl from '../../assets/submarino/reef.png'
import nacreUrl from '../../assets/submarino/nacre.png'
const TAU = Math.PI * 2
const rand = (n: number) => { const x=Math.sin(n*127.13+31.7)*43758.5453;return x-Math.floor(x) }
const spots: [number,number][] = [[-7.3,-.3],[-5.8,-6.6],[7.4,-.4],[5.5,5.6],[-5.5,5.6],[.1,-18],[5.8,-6.5],[-12.8,-.3],[12.8,-.4],[-11.3,-6.6],[11.3,-6.5],[-11,5.6],[11,5.6]]
const PLATFORM_CLEARANCE = 5.2
/** Distribución solo visual: los puestos adicionales siempre dejan espacio entre plataformas. */
export function underseaLayout(stations: StationConfig[]): StationConfig[] {
  const positions = spots.slice(0, stations.length)
  for (let ring = 0; positions.length < stations.length; ring++) {
    const radius = 12 + ring * PLATFORM_CLEARANCE
    const count = Math.floor(TAU * radius / PLATFORM_CLEARANCE)
    for (let i = 0; i < count && positions.length < stations.length; i++) {
      const angle = i * TAU / count
      const point: [number, number] = [Math.sin(angle) * radius, Math.cos(angle) * radius]
      if (positions.every(([x, z]) => Math.hypot(x - point[0], z - point[1]) >= PLATFORM_CLEARANCE)) positions.push(point)
    }
  }
  return stations.map((station, i) => ({ ...station, position: [...positions[i]] }))
}
function tube(points: THREE.Vector3[], radius: number, segments=32) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),segments,radius,6,false)
}
function Ring({at,radius,width=.035,color='#a67f3e',rotation=[Math.PI/2,0,0]}:{at:Vec;radius:number;width?:number;color?:string;rotation?:Vec}) {
  return <mesh position={at} rotation={rotation}><torusGeometry args={[radius,width,8,64]}/><meshStandardMaterial color={color} metalness={.8} roughness={.26}/></mesh>
}
export function UnderseaPlatform() {
  const parts=useMemo(()=>{
    const m=new Model()
    m.add('cylinder',[0,-.24,0],[1.75,.6,1.75],'#d7d5c6')
    m.add('cylinder',[0,.08,0],[1.8,.14,1.8],'#eee9d8')
    m.add('cylinder',[0,-.48,0],[1.65,.12,1.65],'#9d7c43')
    for(let i=0;i<24;i++){
      const a=i/24*TAU,x=Math.sin(a),z=Math.cos(a)
      m.add('sphere',[x*1.76,-.20,z*1.76],[.035,.035,.035],'#a47a39')
      m.beam([x*1.77,-.42,z*1.77],[x*1.77,.03,z*1.77],.018,'#a5a998')
    }
    for(let i=0;i<5;i++){
      const a=i*TAU/5,x=Math.sin(a),z=Math.cos(a)
      m.add('sphere',[x*1.75,-.22,z*1.75],[.25,.25,.08],'#ac8544',0,[0,a,0])
      m.add('sphere',[x*1.8,-.22,z*1.8],[.19,.19,.06],'#2dc9d5',.3,[0,a,0])
    }
    m.beam([-1.22,.14,.2],[-1.22,1.46,.2],.055,'#8e672f')
    m.beam([-1.22,1.46,.2],[-.87,1.46,.2],.045,'#c59a52')
    m.add('cylinder',[-.87,1.23,.2],[.17,.27,.17],'#ffdb8a',1.6)
    for(const y of [1.07,1.39])m.add('cylinder',[-.87,y,.2],[.2,.04,.2],'#a87c3c')
    for(let j=0;j<6;j++){const a=j/6*TAU;m.beam([-.87+Math.sin(a)*.17,1.08,.2+Math.cos(a)*.17],[-.87+Math.sin(a)*.17,1.39,.2+Math.cos(a)*.17],.018,'#a87c3c')}
    m.add('cylinder',[1.15,.22,.5],[.28,.08,.28],'#b78e4b')
    for(let i=0;i<7;i++){const a=i*2.4;m.beam([1.15,.25,.5],[1.15+Math.sin(a)*.13,.53+rand(i)*.2,.5+Math.cos(a)*.13],.035,'#efaf9a')}
    // Brass console, books, specimen jar and armillary instrument leave the avatar clear.
    m.box([.35,.25,1.05],[.95,.13,.65],'#96703b')
    m.box([.35,.35,1.05],[.90,.08,.58],'#d1b378')
    m.beam([.35,.35,.95],[.35,.64,.95],.045,'#a77e3c')
    m.box([.65,.79,.95],[1.08,.55,.055],'#a98545')
    m.box([.65,.80,.99],[.98,.46,.035],'#12768a',.18)
    for(let i=0;i<7;i++){m.add('sphere',[-.05+i*.13,.407,1.22],[.025,.013,.025],i%2?'#7be3e6':'#d2ad65',.2);m.box([.22+i*.14,.66+Math.sin(i*1.5)*.07,1.015],[.025,.14,.012],'#6feaff',.9)}
    m.add('cylinder',[-.82,.21,1.02],[.24,.12,.24],'#9e763e')
    m.beam([-.82,.27,1.02],[-.82,.75,1.02],.04,'#c4a36d')
    m.ring([-.82,.86,1.02],.34,'#ba9458',[.5,.1,.3],0)
    m.ring([-.82,.86,1.02],.30,'#d3ad6c',[1.2,.7,.2],0)
    for(let i=0;i<6;i++){const a=i/6*TAU;m.beam([-.82,.86,1.02],[-.82+Math.sin(a)*.36,.86+Math.cos(a)*.36,1.02],.012,'#c8a36a')}
    for(let i=0;i<3;i++){m.box([.92,.19+i*.085,1.06],[.38,.08,.48],i%2?'#98734b':'#c8b68b');m.box([.92,.19+i*.085,1.31],[.32,.052,.012],'#ded0ad')}
    for(let i=0;i<12;i++){const a=i/12*TAU;m.add('sphere',[Math.sin(a)*1.68,.17,Math.cos(a)*1.68],[.027,.02,.027],'#9e7944')}
    return m.pieces
  },[])
  return <><WorldModel pieces={parts} style="submarino"/><Ring at={[0,.145,0]} radius={1.77}/><Ring at={[0,-.47,0]} radius={1.67}/><mesh position={[1.15,.52,.5]}><sphereGeometry args={[.28,24,16,0,TAU,0,Math.PI/2]}/><meshPhysicalMaterial color="#a5f5ff" transparent opacity={.2} metalness={.2} roughness={.05} side={THREE.DoubleSide}/></mesh></>
}
const caustics = `uniform float seaTime;varying vec3 seaWorld;
float seaCaustic(vec2 p) {
 vec2 q=p*.78;q+=vec2(sin(q.y*1.8+seaTime*.32),cos(q.x*1.4-seaTime*.26))*.29;
 vec2 cell=floor(q),f=fract(q);float d1=10.,d2=10.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
 vec2 g=vec2(float(x),float(y)),v=cell+g;
 vec2 h=fract(sin(vec2(dot(v,vec2(127.1,311.7)),dot(v,vec2(269.5,183.3))))*43758.5453);
 vec2 o=.5+.35*sin(seaTime*.35+6.2831*h);float d=length(g+o-f);
 if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;
 }return pow(1.-smoothstep(.005,.075,d2-d1),2.)*(.55+.45*sin(p.x*1.7+p.y*.9+seaTime*.45)*sin(p.y*1.4-seaTime*.3));
}`
function Seabed({reduced}:{reduced:boolean}) {
 const [sand,reef]=useTexture([sandUrl,reefUrl]),time=useMemo(()=>({value:0}),[])
 const mat=useMemo(()=>{
 const map=sand.clone();map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(13,13);map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true
 const material=new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.035,color:'#b8c4b5',roughness:.84})
 material.onBeforeCompile=s=>{s.uniforms.seaTime=time;s.vertexShader='varying vec3 seaWorld;\n'+s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nseaWorld=(modelMatrix*vec4(transformed,1.)).xyz;');s.fragmentShader=caustics+'\n'+s.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat c=seaCaustic(seaWorld.xz);totalEmissiveRadiance+=vec3(.66,.91,1.)*c*.30;diffuseColor.rgb+=c*.10;')};material.customProgramCacheKey=()=> 'undersea-sand-caustics-v2';return material
 },[sand,time])
 useEffect(()=>()=>{mat.map?.dispose();mat.dispose()},[mat]);useFrame(()=>{time.value=reduced?0:registry.time})
 return <><mesh rotation={[-Math.PI/2,0,0]} position={[0,-.55,-12]} receiveShadow material={mat}><planeGeometry args={[140,140,1,1]}/></mesh><ReefArch texture={reef}/></>
}
function ReefArch({texture}:{texture:THREE.Texture}) {
 const resources=useMemo(()=>{
 const m=new Model()
 for(let i=0;i<55;i++){const a=i/54*Math.PI,x=-8.8+Math.cos(a)*5.2,y=.5+Math.sin(a)*5.1,z=-15.5;for(let j=0;j<2;j++)m.add('rock',[x+(rand(i*8+j)-.5)*1.05,y+(rand(i+j*4)-.5)*1.3,z+(rand(i+j*3)-.5)*1.8],[.30+rand(i)*.45,.3+rand(i+2)*.45,.35+rand(i+8)*.4],'#8eaab0')}
 for(const side of [-1,1])for(let i=0;i<14;i++)m.add('rock',[side*(17+rand(i+71)*9),rand(i+92)*.5,-24+rand(i+18)*38],[.35+rand(i)*.75,.15+rand(i+9)*.4,.35+rand(i+4)*.8],'#5f9fac')
 const geo=new THREE.IcosahedronGeometry(1,3);const positions=geo.attributes.position;for(let i=0;i<positions.count;i++){const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),r=1+.12*Math.sin(x*17+y*13)*Math.sin(z*19-x*11)+.055*Math.sin(y*41+z*29);positions.setXYZ(i,x*r,y*r,z*r)}geo.computeVertexNormals();const map=texture.clone();map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true
 const mat=new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.23,color:'#8a9c96',roughness:.95}),mesh=new THREE.InstancedMesh(geo,mat,m.pieces.length),dummy=new THREE.Object3D()
 m.pieces.forEach((p,i)=>{dummy.position.set(...p.at);dummy.scale.set(...p.size);dummy.rotation.set(i*.7,i*1.3,i*.4);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)});mesh.castShadow=true;mesh.receiveShadow=true;return {mesh,geo,mat,map}
 },[texture])
 useEffect(()=>()=>{resources.geo.dispose();resources.mat.dispose();resources.map.dispose();resources.mesh.dispose()},[resources]);return <primitive object={resources.mesh}/>
}
function shellGeometry(top:boolean) {
 const vertices:number[]=[],uv:number[]=[],indices:number[]=[],edge:THREE.Vector3[]=[];const nx=112,ny=36
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
 const a=-Math.PI/2+i/nx*Math.PI,r=j/ny,rad=r*(1+.045*Math.cos(a*22)),x=Math.sin(a)*rad*2.95
 const y=top?.65+Math.cos(a)*rad*3.2:.65-Math.sin(r*Math.PI)*.55
 const z=top?-.8-Math.cos(a)*rad*.55-Math.sin(r*Math.PI)*.7:-.8+Math.cos(a)*rad*2.8
 vertices.push(x,y+Math.cos(a*22)*.13*r,z);uv.push(i/nx,r);if(j===ny)edge.push(new THREE.Vector3(x,y,z))
 if(i<nx&&j<ny){const n=j*(nx+1)+i;indices.push(n,n+1,n+nx+1,n+1,n+nx+2,n+nx+1)}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return {g,lip:tube(edge,.027,140)}
}
function PearlShell({reduced}:{reduced:boolean}) {
 const pulse=useRef({start:-100,strength:0}),anchor=useRef<THREE.Group>(null!),heartLight=useRef<THREE.PointLight>(null!)
 useEffect(()=>{const fx:PulseTarget={pulse:(_color,strength=1)=>{pulse.current={start:registry.time,strength}}};registry.core=fx;setAnchorObject('core',anchor.current);return()=>{if(registry.core===fx)registry.core=null;setAnchorObject('core',null)}},[])
 const source=useTexture(nacreUrl),pearl=useRef<THREE.Mesh>(null!),orbits=useRef<THREE.Group>(null!)
 const nacre=useMemo(()=>{const t=source.clone();t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t},[source])
 const shells=useMemo(()=>[shellGeometry(true),shellGeometry(false)],[])
 useEffect(()=>()=>{nacre.dispose();shells.forEach(s=>{s.g.dispose();s.lip.dispose()})},[shells,nacre])
 useFrame(()=>{const t=reduced?0:registry.time;pearl.current.position.y=1.02+Math.sin(t*.7)*.06;orbits.current.rotation.y=t*.18;heartLight.current.intensity=4+Math.max(0,1-(registry.time-pulse.current.start)/1.4)*pulse.current.strength*12})
 return <group position={[0,.06,0]} scale={1.12} onClick={e=>{e.stopPropagation();useCowork.getState().select(null);useCowork.getState().cameraCommand({type:'focus',x:0,z:0})}}><group ref={anchor} position={[0,4.4,0]}/>
 <mesh position={[0,-.25,.2]} castShadow><cylinderGeometry args={[2.15,1.9,.35,64]}/><meshStandardMaterial color="#aa874a" roughness={.27} metalness={.8}/></mesh>
 {shells.map((s,i)=><group key={i}><mesh geometry={s.g} castShadow receiveShadow><meshPhysicalMaterial map={nacre} color={i?'#f1dcec':'#d6d4f4'} side={THREE.DoubleSide} metalness={.26} roughness={.19} iridescence={1} iridescenceIOR={1.35} iridescenceThicknessRange={[170,530]} clearcoat={1} emissive="#2485a9" emissiveIntensity={.12}/></mesh><mesh geometry={s.lip}><meshStandardMaterial color="#c6a36a" metalness={.82} roughness={.22}/></mesh></group>)}
 <Ring at={[0,.52,.52]} radius={1.05} width={.065}/><Ring at={[0,.6,.52]} radius={.87} width={.025}/>
 <mesh ref={pearl} position={[0,1.02,.52]}><sphereGeometry args={[.58,48,32]}/><meshPhysicalMaterial color="#e0c4e9" metalness={.2} roughness={.15} iridescence={1} clearcoat={1} emissive="#9985b9" emissiveIntensity={.1}/></mesh>
 <pointLight ref={heartLight} position={[0,1.7,.7]} color="#5eeaff" intensity={9} distance={7} decay={2}/>
 <group ref={orbits} position={[0,2.25,.2]}>{[0,1,2].map(i=><mesh key={i} rotation={[.45+i*.67,i*.9,.2]}><torusGeometry args={[.91,.014,6,100]}/><meshBasicMaterial color="#79eeff" toneMapped={false}/></mesh>)}<mesh><icosahedronGeometry args={[.32,0]}/><meshBasicMaterial color="#72f8ff" wireframe toneMapped={false}/></mesh></group>
 {[-1,1].map(side=><group key={side} position={[side*1.65,.02,1.05]}><mesh><sphereGeometry args={[.19,16,12]}/><meshStandardMaterial color="#ffe2a0" emissive="#ffb345" emissiveIntensity={2}/></mesh><Ring at={[0,0,.14]} radius={.18} width={.03} rotation={[0,0,0]}/></group>)}
 </group>
}
function ReefGarden({stations,detailed,reduced}:{stations:StationConfig[];detailed:boolean;reduced:boolean}) {
 const plants=useRef<THREE.Group>(null!)
 const data=useMemo(()=>{
 const m=new Model(),leaves:{at:Vec;height:number;seed:number}[]=[]
 function coral(x:number,z:number,scale:number,seed:number){
 const color=['#287fb1','#3194ba','#b898b5','#d6a9b8','#49b2bd','#7d8ec2'][seed%6]
 for(let j=0;j<7;j++){const a=j*2.4,h=(.45+rand(seed+j)*.65)*scale,b:Vec=[x+Math.sin(a)*scale*.3,h-.35,z+Math.cos(a)*scale*.3];m.beam([x,-.4,z],b,.043*scale,color)
 for(let k=0;k<3;k++){const e:Vec=[b[0]+Math.sin(a+k*1.8)*.3*scale,b[1]+(.12+rand(j+k)*.35)*scale,b[2]+Math.cos(a+k*1.8)*.25*scale];m.beam(b,e,.025*scale,color);m.add('sphere',e,[.035*scale,.05*scale,.035*scale],color,.08)}}
 }
 for(let i=0;i<(detailed?430:210);i++){const x=(rand(i+300)*2-1)*19,z=rand(i+500)*39-25;if((Math.abs(x)<9&&z>-12&&z<10)||stations.some(s=>Math.hypot(x-s.position[0],z-s.position[1])<2.8))continue;coral(x,z,.55+rand(i+9)*.95,i);if(i%5===0)leaves.push({at:[x,-.5,z],height:1.7+rand(i+22)*2.6,seed:i})}
 for(const [index,s] of stations.entries())for(let i=0;i<12;i++){const a=i/12*TAU,r=1.9+rand(i+index*10)*.6,x=s.position[0]+Math.sin(a)*r,z=s.position[1]+Math.cos(a)*r;m.add('rock',[x,-.45,z],[.18+rand(i)*.15,.10+rand(i+4)*.10,.16+rand(i+8)*.15],'#7b9d9f');if(i%2===0)coral(x,z,.35+rand(i)*.4,index*17+i)}
 for(let i=0;i<36;i++){const a=i/36*TAU;coral(Math.sin(a)*2.8,Math.cos(a)*2.1,.5+rand(i)*.3,i)}
 for(let i=0;i<45;i++){const x=(i%2?1:-1)*(10+rand(i)*5),z=rand(i+40)*25-10;m.add('cylinder',[x,-.05,z],[.12,.8+rand(i),.12],'#148cb8');m.ring([x,.4+rand(i)*.5,z],.13,'#40c7df',undefined,.1)}
 // Fan corals and low anemone beds fill the reefs with fine, branching silhouettes.
 for(let i=0;i<(detailed?48:24);i++){
 const x=(i%2?1:-1)*(9+rand(i+202)*9),z=rand(i+501)*30-18,color=i%3?'#367fb0':'#a48dbd';
 for(let j=0;j<11;j++){const a=-1.3+j/10*2.6,h=.65+rand(i+33)*1.2,b:Vec=[x+Math.sin(a)*h,-.35+Math.cos(a)*h,z+Math.sin(j)*.08];m.beam([x,-.45,z],b,.022,color);for(let k=1;k<5;k++){const f=k/5,px=x+(b[0]-x)*f,py=-.4+(b[1]+.4)*f;m.beam([px,py,z],[px+(j%2?1:-1)*.22,py+.17,z+.02],.012,color)}}
 for(let j=0;j<18;j++){const a=j*2.4,r=.25+rand(j+i)*.65;m.beam([x,-.45,z],[x+Math.sin(a)*r,-.25+rand(i+j)*.5,z+Math.cos(a)*r],.045,i%2?'#239ed2':'#8faddd')}
 }
 for(let i=0;i<(detailed?54:26);i++){const side=i%2?1:-1;leaves.push({at:[side*(18+rand(i+811)*9),-.5,-14-rand(i+922)*29],height:5+rand(i+65)*6,seed:i+100})}
 return {pieces:m.pieces,leaves}
 },[stations,detailed])
 useFrame(()=>{if(plants.current)plants.current.children.forEach((g,i)=>{g.rotation.z=reduced?0:Math.sin(registry.time*.55+i)*.075;g.rotation.x=reduced?0:Math.cos(registry.time*.42+i)*.045})})
 return <><WorldModel pieces={data.pieces} style="submarino"/><group ref={plants}>{data.leaves.map((p,i)=><Kelp key={i} at={p.at} height={p.height} seed={p.seed} reduced={reduced}/>)}</group></>
}
// Branching stipes support individual crinkled blades, with an open silhouette.
function Kelp({at,height,seed,reduced}:{at:Vec;height:number;seed:number;reduced:boolean}) {
 const time=useMemo(()=>({value:0}),[])
 const material=useMemo(()=>{
  const mat=new THREE.MeshPhysicalMaterial({color:seed%3?'#4d8a56':'#788c42',side:THREE.DoubleSide,roughness:.64,clearcoat:.18})
  mat.onBeforeCompile=shader=>{shader.uniforms.kelpTime=time;shader.vertexShader='uniform float kelpTime;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat heightWeight=max(0.,position.y);transformed.x+=sin(kelpTime*1.1+position.y*2.2)*heightWeight*.025;transformed.z+=cos(kelpTime*.9+position.y*2.7)*heightWeight*.023;')};mat.customProgramCacheKey=()=> 'living-kelp-blades';return mat
 },[seed,time])
 useEffect(()=>()=>material.dispose(),[material]);useFrame(()=>{time.value=reduced?0:registry.time+seed})
 const geometry=useMemo(()=>{
  const vertices:number[]=[],uv:number[]=[],indices:number[]=[]
  const strip=(segments:number,point:(t:number,side:number)=>Vec)=>{
   const offset=vertices.length/3
   for(let i=0;i<=segments;i++){const t=i/segments;for(const side of [-1,1]){vertices.push(...point(t,side));uv.push((side+1)/2,t)}if(i<segments){const n=offset+i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2)}}
  }
  const center=(t:number):Vec=>[Math.sin(t*5+seed)*.23*t,t*height,Math.sin(t*3+seed)*.20*t]
  strip(40,(t,side)=>{const p=center(t);return [p[0]+side*.018,p[1],p[2]]})
  for(let j=0;j<12;j++){
   const root=.12+j*.065,start=center(root),direction=j%2?1:-1,len=height*(.14+rand(j+seed)*.07),angle=j*2.4+seed
   strip(22,(t,side)=>{
    const width=Math.pow(Math.sin(Math.PI*t),.8)*(.10+height*.013)*(1+.13*Math.sin(t*35+j))
    return [start[0]+Math.cos(angle)*t*len*.58+side*width*Math.sin(angle),start[1]+Math.sin(t*1.8)*len*.65+Math.sin(t*30+j)*width*.18,start[2]+Math.sin(angle)*t*len*.58+side*width*Math.cos(angle)+direction*Math.sin(t*6)*.06]
   })
  }
  strip(28,(t,side)=>{const p=center(.82+t*.18),w=Math.sin(t*Math.PI)*.16;return [p[0]+side*w,p[1],p[2]+Math.sin(t*6)*w]})
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g
 },[height,seed]);useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <group position={at}>{[0,1,2].map(i=><mesh key={i} geometry={geometry} material={material} rotation={[i*.08,i*2.1,0]} scale={[1,1-i*.17,1]}/>)}</group>
}
function Bubbles({reduced,count}:{reduced:boolean;count:number}) {
 const mesh=useRef<THREE.InstancedMesh>(null!),dummy=useMemo(()=>new THREE.Object3D(),[])
 useFrame(()=>{const t=reduced?0:registry.time;for(let i=0;i<count;i++){const y=(rand(i+31)*13+t*(.25+rand(i)*.35))%13,x=(i%2?1:-1)*(3.5+rand(i+7)*12)+Math.sin(t*.6+i)*.16,z=rand(i+92)*28-17;dummy.position.set(x,y,z);dummy.scale.setScalar(.035+Math.pow(rand(i+18),3)*.18);dummy.updateMatrix();mesh.current.setMatrixAt(i,dummy.matrix)}mesh.current.instanceMatrix.needsUpdate=true})
 return <instancedMesh ref={mesh} args={[undefined,undefined,count]} frustumCulled={false}><sphereGeometry args={[1,12,10]}/><shaderMaterial transparent depthWrite={false} uniforms={{}} vertexShader={"varying vec3 bubbleNormal;varying vec3 bubbleView;void main(){vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.);bubbleNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);bubbleView=normalize(-p.xyz);gl_Position=projectionMatrix*p;}"} fragmentShader={"varying vec3 bubbleNormal;varying vec3 bubbleView;void main(){float rim=pow(1.-abs(dot(normalize(bubbleNormal),normalize(bubbleView))),2.4);float shine=pow(max(0.,dot(normalize(bubbleNormal),normalize(vec3(-.4,.8,1.)))),32.);gl_FragColor=vec4(vec3(.45,.85,1.)+shine*.7,rim*.58+shine*.65+.015);}"}/></instancedMesh>
}
function SunRays({reduced}:{reduced:boolean}) {
 const mat=useMemo(()=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},uNight:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float time;uniform float uNight;varying vec2 vUv;void main(){float x=sin(vUv.x*3.14159);float a=pow(x,3.)*.045*(.7+.3*sin(time*.4+vUv.x*18.))*pow(vUv.y,.7)*(1.-.85*uNight);gl_FragColor=vec4(.3,.88,1.,a);}'}),[])
 useEffect(()=>()=>mat.dispose(),[mat]);useFrame(()=>{mat.uniforms.time.value=reduced?0:registry.time})
 return <group>{Array.from({length:15},(_,i)=><mesh key={i} material={mat} position={[-9+i*1.25,7,-9-(i%4)*3]} rotation={[0,0,-.12+(i-7)*.028]}><planeGeometry args={[.55+rand(i)*1.2,18]}/></mesh>)}</group>
}
function WaterCeiling({reduced}:{reduced:boolean}) {
 const surface=useRef<THREE.Mesh>(null!)
 const material=useMemo(()=>new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{time:{value:0},uNight:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform float time;uniform float uNight;varying vec2 vUv;void main(){vec2 p=vUv*130.;float w=sin(p.x*2.+sin(p.y*1.5+time*.3)*1.5+time*.45)*sin(p.y*2.4+sin(p.x+time*.2));float line=pow(abs(w),10.);vec3 col=mix(vec3(.015,.34,.45),vec3(.05,.7,.79),.5+w*.3);col+=vec3(.45,.9,1.)*line*1.1;col*=1.-.86*uNight;gl_FragColor=vec4(col,1.);}`}),[])
 useEffect(()=>()=>material.dispose(),[material]);useFrame((state)=>{material.uniforms.time.value=reduced?0:registry.time;surface.current.position.y=Math.max(11.6,state.camera.position.y+2.5)})
 return <mesh ref={surface} rotation={[Math.PI/2,0,0]} position={[0,11.6,-45]} material={material}><planeGeometry args={[200,220]}/></mesh>
}
export function UnderseaWorld({stations,reduced,detailed}:{stations:StationConfig[];reduced:boolean;detailed:boolean}) {
 return <group><Suspense fallback={null}><Seabed reduced={reduced}/><PearlShell reduced={reduced}/></Suspense><ReefGarden stations={stations} detailed={detailed} reduced={reduced}/><SeaTreasures/><Suspense fallback={null}><ReefAccents detailed={detailed} reduced={reduced}/></Suspense><Suspense fallback={null}><AtlantisCity detailed={detailed}/><OceanGiants reduced={reduced}/></Suspense><WaterDepth/><MantaRay reduced={reduced}/><WaterCeiling reduced={reduced}/><SunRays reduced={reduced}/><Bioluminescence detailed={detailed} reduced={reduced}/><Bubbles reduced={reduced} count={detailed?180:80}/><Suspense fallback={null}><FishShoals detailed={detailed} reduced={reduced}/></Suspense><LivingJellyfish at={[-12,8,-9]} seed={1} scale={1.25} reduced={reduced}/><LivingJellyfish at={[11,8,-13]} seed={4} scale={1.65} reduced={reduced}/><LivingJellyfish at={[3.4,6,-18]} seed={9} scale={.7} reduced={reduced}/><LivingJellyfish at={[-2,7,-21]} seed={12} scale={.6} reduced={reduced}/><LivingJellyfish at={[-7,9,-34]} seed={15} scale={.5} reduced={reduced}/><LivingJellyfish at={[17,9,-36]} seed={18} scale={.65} reduced={reduced}/></group>
}
function MantaRay({reduced}:{reduced:boolean}) {
 const root=useRef<THREE.Group>(null!),left=useRef<THREE.Mesh>(null!),right=useRef<THREE.Mesh>(null!)
 const shapes=useMemo(()=>{const shape=new THREE.Shape();shape.moveTo(0,.5);shape.bezierCurveTo(.5,.15,1.3,.2,2.1,.75);shape.bezierCurveTo(1.5,-.6,.8,-.8,0,-.55);shape.closePath();const wing=new THREE.ShapeGeometry(shape,20);const tail=tube([new THREE.Vector3(0,0,.5),new THREE.Vector3(0,-.1,1.4),new THREE.Vector3(.35,-.15,2.6)],.025,24);return {wing,tail}},[])
 useEffect(()=>()=>{shapes.wing.dispose();shapes.tail.dispose()},[shapes])
 useFrame(()=>{const t=reduced?0:registry.time;root.current.position.set(6+Math.sin(t*.23)*5,8.1+Math.sin(t*.7)*.45,-19+Math.cos(t*.23)*2);root.current.rotation.y=-.4+Math.sin(t*.08)*.15;left.current.rotation.y=Math.sin(t*1.5)*.35;right.current.rotation.y=-Math.sin(t*1.5)*.35})
 return <group ref={root}><mesh scale={[.35,.12,.8]}><sphereGeometry args={[1,24,16]}/><meshStandardMaterial color="#5aa9c3" roughness={.4}/></mesh><group rotation={[-Math.PI/2,0,0]}><mesh ref={left} geometry={shapes.wing}><meshStandardMaterial color="#61adc4" roughness={.4} side={THREE.DoubleSide}/></mesh><mesh ref={right} geometry={shapes.wing} scale={[-1,1,1]}><meshStandardMaterial color="#61adc4" roughness={.4} side={THREE.DoubleSide}/></mesh></group><mesh geometry={shapes.tail}><meshStandardMaterial color="#2f7896"/></mesh></group>
}
function SeaTreasures() {
 const pieces=useMemo(()=>{
 const m=new Model()
 for(let i=0;i<16;i++){
 const x=(rand(i+47)*2-1)*11,z=rand(i+87)*20-8
 if(Math.hypot(x,z)<3.5)continue
 const color=i%2?'#329ad4':'#d5bc9d',scale=.22+rand(i)*.23
 for(let arm=0;arm<5;arm++){
 const a=arm/5*TAU+i;m.beam([x,-.47,z],[x+Math.sin(a)*scale*1.6,-.46,z+Math.cos(a)*scale*1.6],scale*.35,color)
 }
 m.add('sphere',[x,-.46,z],[scale*.5,.08,scale*.5],color)
 }
 return m.pieces
 },[])
 return <WorldModel pieces={pieces} style="submarino"/>
}

// A continuous water column merges the seabed fog into the distant blue water.
function WaterDepth() {
 const dome=useRef<THREE.Mesh>(null!)
 const resources=useMemo(()=>({geometry:homeSkyGeometry(),material:new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,depthTest:false,
  uniforms:{deep:{value:new THREE.Color('#075570')},light:{value:new THREE.Color('#047a98')},uNight:{value:0}},
  vertexShader:'varying vec3 waterDirection;void main(){waterDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform vec3 deep;uniform vec3 light;uniform float uNight;varying vec3 waterDirection;
   void main(){vec3 d=normalize(waterDirection);float height=smoothstep(-.25,.65,d.y);
   float sun=pow(max(0.,dot(d,normalize(vec3(-.3,.8,-.5)))),8.)*(1.-uNight);
   vec3 water=mix(deep,light,height*.6+sun*.35);
   // De noche el agua se vuelve casi negra, azul muy profundo (lo que brilla es la vida del arrecife).
   gl_FragColor=vec4(mix(water,mix(vec3(.004,.03,.05),vec3(.006,.05,.075),height),uNight),1.);
   #include <colorspace_fragment>
  }`
 })}),[])
 useFrame(({camera})=>{dome.current.position.copy(camera.position)})
 useEffect(()=>()=>{resources.geometry.dispose();resources.material.dispose()},[resources])
 return <mesh ref={dome} geometry={resources.geometry} material={resources.material} renderOrder={-30} frustumCulled={false} raycast={()=>{}}/>
}
function ReefAccents({detailed,reduced}:{detailed:boolean;reduced:boolean}) {
 const source=useTexture(reefUrl),root=useRef<THREE.Group>(null!)
 const resources=useMemo(()=>{
  const plate=new THREE.SphereGeometry(1,48,16,0,TAU,0,Math.PI*.44),pos=plate.attributes.position
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),a=Math.atan2(z,x),r=Math.hypot(x,z);pos.setXYZ(i,x*(1+.08*Math.sin(a*9)),y*.19+Math.sin(a*12)*.045*r,z*(1+.08*Math.sin(a*9)))}plate.computeVertexNormals()
  const map=source.clone();map.colorSpace=THREE.SRGBColorSpace;map.repeat.set(2,2);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.needsUpdate=true
  const material=new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.075,color:'#259bd1',roughness:.55,side:THREE.DoubleSide})
  const sponge=new THREE.CylinderGeometry(.19,.13,1,16,6,true),sp= sponge.attributes.position
  for(let i=0;i<sp.count;i++){const y=sp.getY(i),a=Math.atan2(sp.getZ(i),sp.getX(i)),w=1+.1*Math.sin(a*7+y*8);sp.setXYZ(i,sp.getX(i)*w,y,sp.getZ(i)*w)}sponge.computeVertexNormals()
  const spongeMaterial=new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.09,color:'#18b4d2',roughness:.7,side:THREE.DoubleSide})
  return {plate,map,material,sponge,spongeMaterial}
 },[source])
 useEffect(()=>()=>{resources.plate.dispose();resources.sponge.dispose();resources.map.dispose();resources.material.dispose();resources.spongeMaterial.dispose()},[resources])
 useFrame(()=>{root.current.children.forEach((g,i)=>{g.rotation.z=reduced?0:Math.sin(registry.time*.45+i)*.012})})
 return <group ref={root}>{Array.from({length:detailed?52:26},(_,i)=>{
  const x=(i%2?1:-1)*(10+rand(i+631)*7),z=-19+rand(i+441)*32,r=.45+rand(i+77)*.8
  return <group key={i} position={[x,-.35,z]}>{[0,1,2].map(j=><mesh key={j} geometry={resources.plate} material={resources.material} position={[Math.sin(j*2.4)*.32,j*.24,Math.cos(j*2.4)*.3]} scale={[r*(1-j*.18),1,r*(1-j*.18)]} rotation={[.12*Math.sin(i),i*.8+j,.12*Math.cos(i)]} castShadow receiveShadow/>)}{i%2===0&&[0,1,2,3].map(j=><group key={'s'+j} position={[.7+Math.sin(j*2.4)*.3,.2+rand(i+j)*.25,Math.cos(j*2.4)*.3]} rotation={[.1*Math.sin(j),0,.12*Math.cos(j)]}><mesh geometry={resources.sponge} material={resources.spongeMaterial} scale={[1,.7+rand(i+j)*.7,1]} castShadow/><mesh position={[0,(.7+rand(i+j)*.7)*.5,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.19,.025,6,20]}/><meshStandardMaterial color="#69d8ec" roughness={.6} emissive="#2ff0ff" emissiveIntensity={0} userData={{nightEmissive:1.6}}/></mesh></group>)}</group>
 })}</group>
}

/**
 * Bioluminiscencia: de noche el agua se llena de plancton que brilla en turquesa, azul y algo de violeta, a la
 * deriva entre el arrecife; de día no se ve. (Los corales y medusas también se encienden, con NightGlow.)
 */
function Bioluminescence({detailed,reduced}:{detailed:boolean;reduced:boolean}) {
 const group=useRef<THREE.Group>(null!)
 const data=useMemo(()=>{
  const n=detailed?420:200,positions:number[]=[],colors:number[]=[]
  const palette=[new THREE.Color('#38f6ff'),new THREE.Color('#2a8bff'),new THREE.Color('#5dffc8'),new THREE.Color('#9b7bff')]
  for(let i=0;i<n;i++){
   const x=(rand(i+901)*2-1)*22,z=-32+rand(i+1301)*44,y=-.2+Math.pow(rand(i+1701),1.6)*9.5
   if(Math.hypot(x,z)<1.6&&y<3)continue
   positions.push(x,y,z)
   const c=palette[i%4].clone().multiplyScalar(1.6+rand(i+2101)*1.4);colors.push(c.r,c.g,c.b)
  }
  return {positions,colors}
 },[detailed])
 useFrame(()=>{group.current.visible=nightRamp(spaceNight.value,.15,.5)>.02})
 return <group ref={group} visible={false}><GlowPoints positions={data.positions} colors={data.colors} size={.13} flicker={reduced?0:.45} fall={reduced?0:-.05} fallBase={-.3} fallHeight={10} sway={.5} opacity={.9} nightGain={1.2} reduced={reduced}/></group>
}
