import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { registry } from '../registry'
import type { Vec } from './models'
import skinUrl from '../../assets/submarino/whale-skin-v3.png'
import scalesUrl from '../../assets/submarino/fish-scales-v3.png'

const TAU=Math.PI*2
const random=(i:number)=>{const x=Math.sin(i*117.13+9.7)*43758.545;return x-Math.floor(x)}
function tube(points:Vec[],radius:number){return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),48,radius,5,false)}
function fin(points:number[][],thickness=.035){const s=new THREE.Shape();s.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i+=3){const a=points[i],b=points[i+1],c=points[i+2];if(c)s.bezierCurveTo(a[0],a[1],b[0],b[1],c[0],c[1])}s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:thickness,bevelEnabled:true,bevelThickness:thickness,bevelSize:thickness,bevelSegments:2,steps:1,curveSegments:24});g.computeBoundingBox();const box=g.boundingBox!,uv=g.attributes.uv,pos=g.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,(pos.getX(i)-box.min.x)/(box.max.x-box.min.x),(pos.getY(i)-box.min.y)/(box.max.y-box.min.y));return g}

// A blunt rostrum, deep throat and narrow peduncle keep the whale silhouette anatomical.
function surface(t:number,a:number,whale:boolean):Vec {
 const x=whale?2.9-(t<.12?Math.pow(t/.12,1.65)*.792:t*6.6):2.3-t*5.6
 const knots=whale?[0,.62,.72,.77,.76,.68,.57,.44,.31,.20,.12,.075,0]:[0,.22,.39,.49,.50,.45,.36,.27,.19,.12,.07,.045,0]
 const u=t*(knots.length-1),i=Math.min(knots.length-2,Math.floor(u)),f=u-i,h=f*f*(3-2*f)
 const r=knots[i]*(1-h)+knots[i+1]*h
 const jaw=whale?-.10*Math.sin(t*Math.PI)-.075*Math.exp(-Math.pow((t-.13)*7,2)):0
 const pleats=whale?.009*Math.cos(a*34)*Math.pow(Math.max(0,-Math.cos(a)),5)*Math.sin(Math.min(1,t/.65)*Math.PI):0
 return [x,Math.cos(a)*(r+pleats)+jaw,Math.sin(a)*r*(whale?.92:.77)]
}
function bodyGeometry(whale:boolean) {
 const p:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[],nx=112,nr=64
 const top=new THREE.Color(whale?'#bdced5':'#a6c9d1'),bottom=new THREE.Color('#e4e5d6')
 for(let i=0;i<=nx;i++)for(let j=0;j<=nr;j++){
  const t=i/nx,a=j/nr*TAU;p.push(...surface(t,a,whale));uv.push(t,j/nr)
  const blend=THREE.MathUtils.smoothstep(-Math.cos(a),.12,.72),c=top.clone().lerp(bottom,blend)
  colors.push(c.r,c.g,c.b)
  if(i<nx&&j<nr){const n=i*(nr+1)+j;indices.push(n,n+nr+1,n+1,n+1,n+nr+1,n+nr+2)}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g
}

function OceanAnimal({whale,at,scale=1,seed,reduced}:{whale:boolean;at:Vec;scale?:number;seed:number;reduced:boolean}){
 const swimTime=useMemo(()=>({value:0}),[])
 const root=useRef<THREE.Group>(null!),tail=useRef<THREE.Group>(null!),dorsalFin=useRef<THREE.Mesh>(null!),flippers=useRef<THREE.Group>(null!),source=useTexture(skinUrl)
 const resources=useMemo(()=>{
  const body=bodyGeometry(whale)
  const pectoral=whale?fin([[0,0],[-.3,-.15],[-.3,-1.4],[-1.2,-2.1],[-1.55,-2.35],[-1.7,-2.1],[-1.3,-1.8],[-.8,-1.1],[-.8,-.1],[0,0]],.025):fin([[0,0],[-.5,-.3],[-1,-1.2],[-1.6,-1.4],[-1.1,-.6],[-.8,-.1],[0,0]],.022)
  const dorsal=whale?fin([[0,0],[-.20,.08],[-.26,.47],[-.57,.49],[-.49,.29],[-.55,.09],[-1.05,0]],.035):fin([[0,0],[-.15,.4],[-.3,.75],[-.45,.83],[-.55,.45],[-.6,.12],[-1.1,0]],.035)
  const fluke=whale?fin([[0,0],[-.3,.6],[-.45,1.35],[-.9,1.6],[-.6,.8],[-1.0,.2],[-.9,0],[-1,-.2],[-.6,-.8],[-.9,-1.6],[-.45,-1.35],[-.3,-.6],[0,0]],.025):fin([[0,0],[-.5,.6],[-.8,1.5],[-1.05,1.6],[-.8,.5],[-.65,.15],[-.6,0],[-.7,-.25],[-.8,-.75],[-1.1,-1],[-.5,-.85],[-.2,-.25],[0,0]],.025)
  if(whale){
   // Humpback flippers have a gently cupped surface and an irregular leading edge.
   const p=pectoral.attributes.position
   for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setXYZ(i,x+.018*Math.sin(y*25)*Math.sin(Math.min(1,-y/2.35)*Math.PI),y,p.getZ(i)+.065*Math.sin(-y/2.35*Math.PI))}
   pectoral.computeVertexNormals()
  }
  const lines:THREE.BufferGeometry[]=[],scars:THREE.BufferGeometry[]=[]
  if(whale)for(let j=0;j<46;j++){
   const start=.09+random(j+410)*.65,angle=(random(j+510)*2-1)*2.12,length=.012+random(j+610)*.045
   scars.push(tube(Array.from({length:10},(_,k)=>{const v=surface(start+k/9*length,angle+Math.sin(k/9*2.3+j)*.035,true);return [v[0],v[1]*1.012,v[2]*1.012] as Vec}),.003+random(j+710)*.003))
  }
  // Surface-following lips and throat grooves avoid floating decorative lines.
  for(const side of [-1,1])lines.push(tube(Array.from({length:30},(_,i)=>{
   const t=.025+i/29*(whale?.36:.20),v=surface(t,side*(Math.PI*.60),whale)
   return [v[0],v[1]-.009,v[2]*1.014] as Vec
  }),whale?.012:.007))
  if(whale)for(let j=-8;j<=8;j++)lines.push(tube(Array.from({length:34},(_,i)=>{
   const t=.045+i/33*.58,a=Math.PI+j*.073,v=surface(t,a,true)
   return [v[0],v[1]-.012,v[2]*1.015] as Vec
  }),.008))
  else for(const side of [-1,1])for(let j=0;j<5;j++)lines.push(tube(Array.from({length:12},(_,i)=>{
   const a=side*(1.12+i/11*1.05),v=surface(.30+j*.019,a,false);return [v[0],v[1],v[2]*1.018] as Vec
  }),.008))
  const map=source.clone();map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(1.25,1);map.anisotropy=8
  const skin=new THREE.MeshPhysicalMaterial({map,bumpMap:map,bumpScale:.105,vertexColors:true,roughness:.78,metalness:0,clearcoat:.035})
  skin.onBeforeCompile=shader=>{
   shader.uniforms.swimTime=swimTime
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
float ventral=smoothstep(-.10,.63,-cos(vMapUv.y*6.283185));
diffuseColor.rgb*=1.22;
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.68,.72,.68)*(.82+.18*sampledDiffuseColor.r),ventral*.82);
#endif`)
   shader.vertexShader='uniform float swimTime;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat tailWeight=smoothstep(.2,3.7,-position.x);transformed.'+(whale?'y':'z')+'+=sin(swimTime-position.x*.8)*tailWeight*.20;')
  };skin.customProgramCacheKey=()=>whale?'humpback-v4':'shark-v4'
  const bellyFin=new THREE.MeshPhysicalMaterial({map,bumpMap:map,bumpScale:.055,color:'#eef1df',roughness:.78,side:THREE.DoubleSide,clearcoat:.025})
  const finMat=new THREE.MeshPhysicalMaterial({map,bumpMap:map,bumpScale:.028,color:whale?'#a2bbc1':'#b1c6ca',roughness:.75,side:THREE.DoubleSide,clearcoat:.035})
  bellyFin.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
float patches=smoothstep(.035,.15,sampledDiffuseColor.r);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.75,.78,.70),patches*.68+.08);
#endif`)};bellyFin.customProgramCacheKey=()=> 'humpback-mottled-flipper-v4'

  return {body,pectoral,dorsal,fluke,lines,scars,map,skin,finMat,bellyFin}
 },[source,whale,swimTime])
 useEffect(()=>()=>{resources.body.dispose();resources.pectoral.dispose();resources.dorsal.dispose();resources.fluke.dispose();resources.lines.forEach(g=>g.dispose());resources.scars.forEach(g=>g.dispose());resources.map.dispose();resources.skin.dispose();resources.finMat.dispose();resources.bellyFin.dispose()},[resources])
 useFrame(()=>{
  const t=reduced?0:registry.time,phase=t*(whale?.62:1.65)+seed,course=t*.045+seed
  swimTime.value=phase
  root.current.position.set(at[0]+Math.sin(course)*7,at[1]+Math.sin(t*.16+seed)*.28,at[2]+Math.cos(course)*1.1)
  root.current.rotation.set(.025*Math.sin(t*.19+seed),Math.atan2(1.1*Math.sin(course),7*Math.cos(course)),.035*Math.sin(t*.16+seed))
  // The tail follows the travelling wave at the peduncle; it never disconnects.
  tail.current.position[whale?'y':'z']=Math.sin(phase+(whale?3.5:3)*.8)*.19
  tail.current.rotation[whale?'z':'y']=Math.cos(phase+(whale?3.5:3)*.8)*.24
  if(whale)tail.current.rotation.x=.20+Math.sin(phase*.5)*.10
  const dorsalX=whale?-1.25:-.25,dorsalWeight=THREE.MathUtils.smoothstep(-dorsalX,.2,3.7)
  dorsalFin.current.position[whale?'y':'z']=(whale?.46:0)+Math.sin(phase-dorsalX*.8)*dorsalWeight*.20
  flippers.current.rotation.x=Math.sin(phase*.55)*.11
  flippers.current.rotation.z=Math.sin(phase*.55+.8)*.045
 })
 return <group ref={root} position={at} scale={scale}>
  <mesh geometry={resources.body} material={resources.skin} castShadow/>
  <mesh ref={dorsalFin} geometry={resources.dorsal} material={resources.finMat} position={[whale?-1.25:-.25,whale?.46:.47,0]} scale={whale?[.65,.6,.8]:[1,1,1]}/>
  <group ref={flippers}>{[-1,1].map(side=><mesh key={side} geometry={resources.pectoral} material={whale?resources.bellyFin:resources.finMat} position={[whale?.9:.55,-.20,side*(whale?.65:.35)]} rotation={[-side*1.05,0,side*.03]} scale={[1,1,side]}/>)}</group>
  <group ref={tail} position={[whale?-3.50:-3.0,0,0]}><mesh geometry={resources.fluke} material={resources.finMat} rotation={whale?[Math.PI/2,0,0]:[0,0,0]}/></group>
  {resources.lines.map((g,i)=><mesh key={i} geometry={g}><meshStandardMaterial color={whale?'#536d76':'#254653'} roughness={.6}/></mesh>)}
  {resources.scars.map((g,i)=><mesh key={`scar-${i}`} geometry={g}><meshStandardMaterial color="#b4c3bf" roughness={.94} transparent opacity={.44}/></mesh>)}
  {[-1,1].map(side=><group key={side} position={[whale?1.75:1.65,-.035,side*(whale?.61:.27)]}><mesh><sphereGeometry args={[whale?.048:.035,16,12]}/><meshPhysicalMaterial color="#061f29" roughness={.13} clearcoat={1}/></mesh><mesh position={[.018,.02,side*.045]}><sphereGeometry args={[.017,8,8]}/><meshBasicMaterial color="#b7dce0"/></mesh></group>)}
  {whale&&Array.from({length:24},(_,i)=>{
   const row=Math.floor(i/6),t=.035+(i%6)*.034+random(i+25)*.012,a=(row<2?1:-1)*(.48+(row%2)*.74+(random(i+93)-.5)*.18),v=surface(t,a,true)
   return <mesh key={i} position={[v[0],v[1]+.018,v[2]*1.03]} scale={[1,.75,1]}><sphereGeometry args={[.027+random(i)*.022,10,8]}/><meshStandardMaterial color={i%3?'#71858b':'#b8b5a5'} roughness={.91}/></mesh>
  })}

 </group>
}

export function OceanGiants({reduced}:{reduced:boolean}){
 return <><OceanAnimal whale at={[-10,8.5,-22]} scale={1.48} seed={3} reduced={reduced}/><OceanAnimal whale at={[-2,8.8,-38]} scale={.67} seed={2} reduced={reduced}/><OceanAnimal whale={false} at={[-17,6.5,-17]} scale={.86} seed={2} reduced={reduced}/><OceanAnimal whale={false} at={[17,7.0,-24]} scale={.95} seed={5} reduced={reduced}/><OceanAnimal whale={false} at={[1,8.2,-35]} scale={.65} seed={4} reduced={reduced}/></>
}

export function LivingJellyfish({at,scale=1,seed,reduced}:{at:Vec;scale?:number;seed:number;reduced:boolean}){
 const root=useRef<THREE.Group>(null!),bell=useRef<THREE.Group>(null!),time=useMemo(()=>({value:0}),[])
 const res=useMemo(()=>{
  const geom=new THREE.SphereGeometry(.72,64,32,0,TAU,0,Math.PI*.54),p=geom.attributes.position
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),a=Math.atan2(z,x),y=p.getY(i),edge=Math.pow(Math.max(0,1-y/.72),4);p.setXYZ(i,x*(1+.035*Math.cos(a*24)*edge),y*.66+.026*Math.cos(a*24)*edge,z*(1+.035*Math.cos(a*24)*edge))}geom.computeVertexNormals()
  const filaments:Array<THREE.BufferGeometry>=[],canals:Array<THREE.BufferGeometry>=[],oral:Array<THREE.BufferGeometry>=[]
  for(let i=0;i<24;i++){const a=i/24*TAU,len=1.5+random(i+seed)*1.6;filaments.push(tube(Array.from({length:28},(_,j)=>{const t=j/27;return [Math.cos(a)*.68+Math.sin(t*9+i)*t*.15,-.06-t*len,Math.sin(a)*.68+Math.cos(t*8+i)*t*.15] as Vec}),.0055))}
  for(let i=0;i<16;i++){const a=i/16*TAU;canals.push(tube(Array.from({length:16},(_,j)=>{const t=j/15*Math.PI*.52;return [Math.cos(a)*Math.sin(t)*.725,Math.cos(t)*.48,Math.sin(a)*Math.sin(t)*.725] as Vec}),.004))}
  for(let i=0;i<4;i++){
   const verts:number[]=[],uv:number[]=[],idx:number[]=[]
   for(let j=0;j<=60;j++){const t=j/60,a=i/4*TAU+t*4,rad=.12+t*.22;for(const side of [-1,1]){const w=(.065+.045*Math.sin(t*80))*Math.sin(t*Math.PI);verts.push(Math.cos(a)*rad+side*w,-t*2.1+.04*Math.sin(t*70+side),Math.sin(a)*rad+side*w*.6);uv.push((side+1)/2,t)}if(j<60){const n=j*2;idx.push(n,n+1,n+2,n+1,n+3,n+2)}}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();oral.push(g)
  }
  const tendrilMat=new THREE.MeshBasicMaterial({color:'#a7cce9',transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide})
  tendrilMat.onBeforeCompile=s=>{s.uniforms.jellyTime=time;s.vertexShader='uniform float jellyTime;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat fall=max(0.,-position.y);transformed.x+=sin(jellyTime*.85+position.y*3.)*fall*.095;transformed.z+=cos(jellyTime*.7+position.y*2.4)*fall*.075;')};tendrilMat.customProgramCacheKey=()=> 'living-jelly-tendrils'
  return {geom,filaments,canals,oral,tendrilMat}
 },[seed,time])
 useEffect(()=>()=>{res.geom.dispose();res.filaments.forEach(g=>g.dispose());res.canals.forEach(g=>g.dispose());res.oral.forEach(g=>g.dispose());res.tendrilMat.dispose()},[res])
 useFrame(()=>{const t=reduced?0:registry.time;time.value=t+seed;root.current.position.set(at[0]+Math.sin(t*.30+seed)*1.25,at[1]+Math.sin(t*.73+seed)*.72,at[2]+Math.cos(t*.30+seed)*.8);root.current.rotation.z=Math.sin(t*.3+seed)*.07;const pulse=Math.sin(t*2.15+seed);bell.current.scale.set(1+pulse*.11,1-pulse*.16,1+pulse*.11)})
 return <group ref={root} position={at} scale={scale}><group ref={bell}>
  <mesh geometry={res.geom}><meshPhysicalMaterial color="#acd8ed" transparent opacity={.23} roughness={.12} metalness={.04} clearcoat={1} side={THREE.DoubleSide} emissive="#3b88b6" emissiveIntensity={.20} userData={{nightEmissive:1.8}} depthWrite={false}/></mesh>
  <mesh rotation={[Math.PI/2,0,0]} position={[0,-.035,0]}><torusGeometry args={[.71,.009,5,96]}/><meshBasicMaterial color="#c9edff" transparent opacity={.48} depthWrite={false}/></mesh>
  {res.canals.map((g,i)=><mesh key={i} geometry={g}><meshBasicMaterial color="#c9eafa" transparent opacity={.24} depthWrite={false}/></mesh>)}
  {[0,1,2,3].map(i=><mesh key={i} position={[Math.cos(i/4*TAU)*.14,.32,Math.sin(i/4*TAU)*.14]} rotation={[Math.PI/2,0,i/4*TAU]} scale={[1,.75,1]}><torusGeometry args={[.105,.014,5,28]}/><meshBasicMaterial color="#eedcff" transparent opacity={.75} depthWrite={false}/></mesh>)}
 </group>{res.filaments.map((g,i)=><mesh key={i} geometry={g} material={res.tendrilMat}/>)}{res.oral.map((g,i)=><mesh key={i} geometry={g} material={res.tendrilMat}/>)}</group>
}

export function FishShoals({reduced,detailed}:{reduced:boolean;detailed:boolean}){
 const scales=useTexture(scalesUrl),fishTime=useMemo(()=>({value:0}),[])
 const bodies=useRef<THREE.InstancedMesh>(null!),tails=useRef<THREE.InstancedMesh>(null!),fins=useRef<THREE.InstancedMesh>(null!),pectorals=useRef<THREE.InstancedMesh>(null!),eyes=useRef<THREE.InstancedMesh>(null!),count=detailed?180:80
 const res=useMemo(()=>{
  const body=bodyGeometry(false);body.scale(.20,.40,.28)
  const tail=fin([[0,0],[-.12,.08],[-.20,.21],[-.30,.23],[-.24,.08],[-.24,-.08],[-.30,-.23],[-.20,-.21],[-.12,-.08],[0,0]],.004)
  const dorsal=fin([[.18,0],[.1,.16],[-.12,.20],[-.26,.03],[-.1,.04],[.05,.04],[.18,0]],.004)
  const map=scales.clone();map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(4.5,1);map.anisotropy=8
  const material=new THREE.MeshPhysicalMaterial({map,bumpMap:map,bumpScale:.015,vertexColors:true,roughness:.48,metalness:.12,clearcoat:.025})
  material.onBeforeCompile=shader=>{
   shader.uniforms.fishTime=fishTime
   shader.vertexShader='uniform float fishTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
float phase=fishTime*5.2+instanceMatrix[3].x*1.7;
transformed.z+=sin(phase-position.x*5.)*smoothstep(.05,.65,-position.x)*.045;`)
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
diffuseColor.rgb=mix(diffuseColor.rgb,diffuse,.30);
float along=vMapUv.x/4.5;
float lateral=pow(abs(sin(vMapUv.y*6.283185)),12.);
float gill=exp(-pow((along-.285)*100.,2.));
diffuseColor.rgb*=1.-gill*lateral*.50;
float stripes=pow(.5+.5*sin(along*42.),12.)*smoothstep(.13, .25,along)*(1.-smoothstep(.68,.83,along));
float reef=step(vColor.b,vColor.r*1.12);
diffuseColor.rgb*=1.-stripes*reef*.75;
diffuseColor.rgb+=vec3(.13,.16,.15)*lateral*(1.-reef);
#endif`)
  };material.customProgramCacheKey=()=> 'living-fish-v4'
  const pectoral=fin([[0,0],[-.03,-.04],[-.10,-.19],[-.22,-.23],[-.18,-.10],[-.06,-.02],[0,0]],.002)
  const membrane=new THREE.MeshStandardMaterial({color:'#d4d8ba',roughness:.67,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false})
  membrane.onBeforeCompile=shader=>{shader.vertexShader='varying vec2 finUv;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nfinUv=uv;');shader.fragmentShader='varying vec2 finUv;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat rays=pow(.5+.5*sin(atan(finUv.y-.98,finUv.x-.98)*65.),14.);diffuseColor.rgb*=.78+.22*rays;');};membrane.customProgramCacheKey=()=> 'fish-fin-rays-v4'
  return {body,tail,dorsal,pectoral,membrane,map,material,dummy:new THREE.Object3D(),q:new THREE.Quaternion(),v:new THREE.Vector3()}
 },[scales,fishTime])
 useEffect(()=>()=>{res.body.dispose();res.tail.dispose();res.dorsal.dispose();res.pectoral.dispose();res.membrane.dispose();res.map.dispose();res.material.dispose()},[res])
 useEffect(()=>{for(let i=0;i<count;i++){const c=new THREE.Color(i<140?'#c6dee1':['#487eb7','#d4bd70','#d5d4bc','#cc865b'][i%4]);bodies.current.setColorAt(i,c);tails.current.setColorAt(i,i<140?c:new THREE.Color('#d9bd56'));fins.current.setColorAt(i,c)}for(const mesh of [bodies.current,tails.current,fins.current]){if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;(mesh.material as THREE.Material).needsUpdate=true}},[count])
 useFrame(()=>{
  const t=reduced?0:registry.time,d=res.dummy;fishTime.value=t
  for(let i=0;i<count;i++){
   const school=Math.floor(i/35),j=i%35,a=j*2.399,spread=Math.sqrt(j)*.54,free=i>=140
   const cx=[-17,-3,16,-23,12,4][school]??4,cz=[-16,-24,-20,-35,-9,-30][school]??-18,cy=[6,5.5,5,8,3.5,8][school]??5
   const lag=(random(i+900)-.5)*.10,cruise=t*.17+school+lag
   const x=free?cx+Math.sin(t*.38+i)*8:cx+Math.sin(cruise)*4.8+Math.cos(a)*spread
   const y=cy+Math.sin(a)*spread*(free?1.2:.34)+Math.sin(t*.75+i)*.07,z=cz+Math.sin(a)*spread*(free?3.2:.65)+(free?(random(i+80)-.5)*9:0)+Math.cos(free?t*.38+i:cruise)*(free?2.8:1.9)
   const phase=free?t*.38+i:cruise,direction=Math.atan2(Math.sin(phase)*(free?1.064:.646),Math.cos(phase)*(free?3.04:1.632)),s=free?.65+random(i)*.36:.34+random(i)*.15
   d.position.set(x,y,z);d.rotation.set(0,direction,Math.sin(t*.6+i)*.035);d.scale.setScalar(s);d.updateMatrix();bodies.current.setMatrixAt(i,d.matrix)
   const q=res.q.copy(d.quaternion);res.v.set(-.64,0,Math.sin(t*5.2+x*1.7+3.2)*.044).multiplyScalar(s).applyQuaternion(q);d.position.set(x,y,z).add(res.v);d.rotation.y+=Math.cos(t*5.2+x*1.7+3.2)*.24;d.updateMatrix();tails.current.setMatrixAt(i,d.matrix)
   res.v.set(0,.178,0).multiplyScalar(s).applyQuaternion(q);d.position.set(x,y,z).add(res.v);d.quaternion.copy(q);d.updateMatrix();fins.current.setMatrixAt(i,d.matrix)
   for(let side=0;side<2;side++){
    res.v.set(.12,-.055,(side?1:-1)*.12).multiplyScalar(s).applyQuaternion(q);d.position.set(x,y,z).add(res.v);d.quaternion.copy(q);d.rotateX((side?1:-1)*(1.1+.15*Math.sin(t*3.1+i)));d.scale.setScalar(s);d.updateMatrix();pectorals.current.setMatrixAt(i*2+side,d.matrix)
    res.v.set(.29,.04,(side?1:-1)*.092).multiplyScalar(s).applyQuaternion(q);d.position.set(x,y,z).add(res.v);d.quaternion.copy(q);d.scale.setScalar(s*.025);d.updateMatrix();eyes.current.setMatrixAt(i*2+side,d.matrix)}
  }
  for(const mesh of [bodies.current,tails.current,fins.current,pectorals.current,eyes.current])mesh.instanceMatrix.needsUpdate=true
 })
 return <><instancedMesh ref={bodies} args={[res.body,res.material,count]} frustumCulled={false}/><instancedMesh ref={tails} args={[res.tail,undefined,count]} frustumCulled={false}><meshStandardMaterial roughness={.73} transparent opacity={.84} side={THREE.DoubleSide}/></instancedMesh><instancedMesh ref={fins} args={[res.dorsal,undefined,count]} frustumCulled={false}><meshStandardMaterial roughness={.73} transparent opacity={.84} side={THREE.DoubleSide}/></instancedMesh><instancedMesh ref={pectorals} args={[res.pectoral,res.membrane,count*2]} frustumCulled={false}/><instancedMesh ref={eyes} args={[undefined,undefined,count*2]} frustumCulled={false}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#071f2b" roughness={.15}/></instancedMesh></>
}
