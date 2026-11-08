import { useEffect, useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { Model, type Vec } from './models'
import reefUrl from '../../assets/submarino/atlantis.png'

const TAU=Math.PI*2
const random=(i:number)=>{const x=Math.sin(i*127.1+3.7)*43758.5;return x-Math.floor(x)}

/** A fully three-dimensional city: open arcades, terraces and a ribbed observatory. */
export function AtlantisCity({detailed}:{detailed:boolean}) {
 const texture=useTexture(reefUrl)
 const resources=useMemo(()=>{
  const m=new Model(),stone='#a6bab0',pale='#cfccae',bronze='#a58c51',dark='#386d79',glow='#2ad4df'
  const column=(x:number,y:number,z:number,h:number,r=.24)=>{
   m.add('cylinder',[x,y+h/2,z],[r,h,r],stone)
   for(const dy of [0,.14,h-.20,h])m.add('cylinder',[x,y+dy,z],[r*1.44,.13,r*1.44],pale)
   m.box([x,y+h+.12,z],[r*3.2,.16,r*3.2],pale)
   if(detailed)for(let k=0;k<8;k++){const a=k/8*TAU;m.beam([x+Math.sin(a)*r,y+.25,z+Math.cos(a)*r],[x+Math.sin(a)*r,y+h-.3,z+Math.cos(a)*r],.022,dark)}
  }
  const arch=(x:number,y:number,z:number,r:number,h:number)=>{
   column(x-r,y,z,h,.22);column(x+r,y,z,h,.22)
   for(let j=0;j<17;j++){const a=j/16*Math.PI;m.box([x+Math.cos(a)*r,y+h+Math.sin(a)*r,z],[r*.22,.30,.57],j%4===0?pale:stone,0,[0,0,a-Math.PI/2])}
   m.box([x,y+h+r+.05,z],[.32,.42,.66],bronze)
  }
  const balustrade=(x:number,y:number,z:number,width:number)=>{
   for(let j=0;j<=Math.floor(width/.52);j++)m.add('cylinder',[x-width/2+j*.52,y+.42,z],[.065,.68,.065],pale)
   for(const dy of [.03,.79])m.box([x,y+dy,z],[width+.2,.13,.22],pale)
   for(let j=0;j<width/2;j++)m.add('sphere',[x-width/2+j*2,y+.95,z],[.13,.13,.13],bronze)
  }
  const pavilion=(x:number,z:number,y:number,r:number,h:number,roof=true)=>{
   for(const dy of [0,.25])m.add('cylinder',[x,y+dy,z],[r*1.2,.24,r*1.2],stone)
   for(let j=0;j<12;j++){const a=j/12*TAU;column(x+Math.cos(a)*r,y+.45,z+Math.sin(a)*r,h,.20)}
   for(const dy of [0,.22,.44])m.add('cylinder',[x,y+h+.55+dy,z],[r*1.15,.16,r*1.15],dy===.22?bronze:pale)
   if(roof){m.add('dome',[x,y+h+1,z],[r*1.12,r*.62,r*1.12],dark);for(let j=0;j<12;j++){const a=j/12*TAU;for(let k=0;k<12;k++){const b=k/12*Math.PI/2,c=(k+1)/12*Math.PI/2;m.beam([x+Math.cos(a)*Math.cos(b)*r*1.13,y+h+1+Math.sin(b)*r*.63,z+Math.sin(a)*Math.cos(b)*r*1.13],[x+Math.cos(a)*Math.cos(c)*r*1.13,y+h+1+Math.sin(c)*r*.63,z+Math.sin(a)*Math.cos(c)*r*1.13],.035,bronze)}}m.add('cone',[x,y+h+1+r*.63+.40,z],[.15,.8,.15],bronze)}
  }
  // Staircase leads the eye from the open reef into an elevated palace.
  for(let i=0;i<27;i++){const z=-23-i*.44,y=-.45+i*.16;m.box([6,y,z],[5.8,.25,.5],i%4===0?pale:stone);for(const side of [-1,1])m.box([6+side*3.15,y+.25,z],[.4,.7,.48],stone)}
  m.box([6,1.7,-38],[15,4.3,10],dark)
  for(let x=-1;x<=13;x+=2.8)arch(x,-.35,-32.85,1.12,1.8)
  for(const y of [3.85,4.15])m.box([6,y,-37.4],[16,.24,11],pale)
  for(const side of [-1,1])balustrade(6+side*5.4,4.3,-32.2,4.6)
  pavilion(6,-38,4.35,3.5,5.1)
  // Oculus and concentric entrance archivolts beneath the main dome.
  arch(6,4.4,-34.5,1.48,2.5)
  m.add('cylinder',[6,5.75,-34.4],[.74,.09,.74],glow,.55,[Math.PI/2,0,0])
  for(let i=0;i<3;i++)m.ring([6,5.75,-34.30-i*.08],.80+i*.15,bronze,[0,0,0],0)
  for(const side of [-1,1]){
   pavilion(6+side*6,-38,4.35,1.55,4.1)
   for(let i=0;i<5;i++){const x=6+side*(10+i*3.0),z=-33-i*.7;arch(x,1.7,z,1.35,2.7);m.box([x,5.95,z],[3.1,.3,1.5],stone);balustrade(x,6.15,z+.6,2.8)}
   for(let i=0;i<3;i++)pavilion(6+side*(13+i*7),-39-i*4,random(i+side)*2,2.0+random(i)*.5,5+i*.6,i%2===0)
  }
  // Two layers of smaller silhouettes imply a sprawling city in the water haze.
  for(let i=0;i<15;i++){
   const x=-34+i*5.5,z=-49-random(i+70)*12,h=4+random(i+90)*7
   m.box([x,h*.5-1,z],[3.2,h,3.8],dark)
   pavilion(x,z,h-1,1.7,2.3,i%3!==0)
   for(let j=0;j<3;j++)arch(x,h*.3+j*1.6,z+2,.55,.6)
  }
  // Turquoise inlay, scalloped cornices, golden mosaics and worn sea-god reliefs.
  for(let i=0;i<85;i++){
   const x=-23+i*.7,y=6.05,z=-33.1-Math.abs(x-6)*.20
   m.add('sphere',[x,y,z],[.12,.15,.045],i%3?glow:bronze,i%3?.10:0)
   if(i%3===0)m.ring([x,y+.28,z],.16,bronze,[0,0,0],0)
  }
  for(const side of [-1,1]){
   const x=6+side*10,z=-29
   m.box([x,.1,z],[2.1,1.0,1.8],stone)
   m.add('cylinder',[x,1.5,z],[.55,2.1,.65],stone)
   m.add('sphere',[x,3.15,z],[.57,.72,.56],pale)
   m.add('cone',[x,2.7,z+.35],[.45,.9,.3],stone)
   m.beam([x,2.7,z],[x+side*1.1,2.1,z],.20,stone)
   m.beam([x+side*1.1,.4,z],[x+side*1.1,4.8,z],.045,bronze)
   for(let k=-1;k<=1;k++){m.beam([x+side*1.1,4.1,z],[x+side*1.1+k*.35,4.3,z],.045,bronze);m.beam([x+side*1.1+k*.35,4.3,z],[x+side*1.1+k*.35,4.95-Math.abs(k)*.2,z],.045,bronze)}
  }
  // Ruined gateways closer to the reef give the background a middle distance.
  for(const [x,z,angle] of [[-18,-18,.1],[17,-16,-.15],[-24,-29,.2],[25,-25,-.12]]){
   column(x,-.4,z,2.6,.30);column(x+2.5,-.4,z,2.2,.30);m.box([x+1.2,2.45,z],[3.5,.42,.9],pale,0,[0,0,angle]);m.box([x+.4,-.35,z+1.2],[.65,.44,1.6],stone,0,[0,.6,.15])
  }
  // Individual stone courses and encrusted cornices give the palace a weathered scale.
  for(let row=0;row<6;row++)for(let j=0;j<22;j++){
   const x=-1.5+j*.70+(row%2)*.35,y=-.05+row*.62,z=-32.78;
   if(Math.abs(x-6)<3.3)continue;
   m.box([x,y,z],[.64,.54,.10+random(j+row*22)*.09],(j+row)%4?pale:stone);
  }
  for(const side of [-1,1])for(let i=0;i<24;i++){
   const x=6+side*(4+random(i+41)*13),z=-30-random(i+91)*5,y=-.3+random(i+8)*.13;
   m.box([x,y,z],[.25+random(i)*.55,.2+random(i+5)*.3,.25+random(i+2)*.6],stone,0,[.1,random(i)*3,.08]);
  }
  for(let j=0;j<48;j++){
   const a=j/48*TAU,x=6+Math.cos(a)*4.05,z=-38+Math.sin(a)*4.05;
   m.add('sphere',[x,10.02,z],[.11,.14,.11],j%3?glow:bronze,j%3?.12:0);
   if(j%2===0)m.ring([x,9.72,z],.12,bronze,[0,-a+Math.PI/2,0],0);
  }
  // Carved fan medallions and inset mosaics break up the broad terrace walls.
  for(const side of [-1,1])for(let j=0;j<3;j++){
   const x=6+side*(5.1+j*3.05),z=-32.35-j*.58,y=2.5;
   m.box([x,y,z],[1.52,1.28,.13],dark);
   for(const dy of [-.72,.72])m.box([x,y+dy,z+.09],[1.82,.11,.16],bronze);
   m.ring([x,y,z+.12],.48,pale,[0,0,0],0);
   for(let k=0;k<9;k++){const a=k/8*Math.PI;m.beam([x,y-.28,z+.20],[x+Math.cos(a)*.40,y-.20+Math.sin(a)*.65,z+.20],.027,pale)}
   for(let k=0;k<5;k++)m.add('sphere',[x-.58+k*.29,y+.60,z+.19],[.05,.06,.035],glow,.06);
  }
  // Marine growth is attached to masonry, rather than scattered in empty water.
  for(let i=0;i<(detailed?180:70);i++){
   const x=-27+random(i+11)*61,z=-33-Math.abs(x-6)*.2,y=6.4
   for(let j=0;j<3;j++)m.beam([x,y,z],[x+Math.sin(j*2.4)*.24,y+.24+random(i+j)*.55,z+Math.cos(j*2.4)*.18],.026,i%3?'#538c75':'#ac9ea1')
  }
  const map=texture.clone();map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(2,2);map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true
  const geometries:Record<string,THREE.BufferGeometry>={box:new THREE.BoxGeometry(),cylinder:new THREE.CylinderGeometry(1,1,1,20),sphere:new THREE.SphereGeometry(1,16,12),cone:new THREE.ConeGeometry(1,1,20),dome:new THREE.SphereGeometry(1,40,20,0,TAU,0,Math.PI/2),ring:new THREE.TorusGeometry(1,.055,6,32)}
  const batches=new Map<string,typeof m.pieces>()
  for(const p of m.pieces){const k=p.shape+p.color+(p.glow||0);const list=batches.get(k)||[];list.push(p);batches.set(k,list)}
  const materials:THREE.Material[]=[],meshes:THREE.InstancedMesh[]=[],dummy=new THREE.Object3D()
  for(const parts of batches.values()){
   const first=parts[0],metal=first.color===bronze,luminous=first.color===glow
   const mat=new THREE.MeshStandardMaterial({map:metal||luminous?null:map,bumpMap:metal||luminous?null:map,bumpScale:.16,color:first.color,roughness:metal?.45:.88,metalness:metal?.65:.06,emissive:first.color,emissiveIntensity:first.glow||0})
   if(!metal&&!luminous){
    mat.onBeforeCompile=shader=>{
     shader.vertexShader='varying vec3 ruinPosition;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 ruinPoint=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nruinPoint=instanceMatrix*ruinPoint;\n#endif\nruinPosition=(modelMatrix*ruinPoint).xyz;');
     shader.fragmentShader='varying vec3 ruinPosition;\n'+shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat salt=sin(ruinPosition.x*5.3+sin(ruinPosition.y*6.))*sin(ruinPosition.z*7.1-ruinPosition.y*3.);float algae=smoothstep(.25,.8,salt)*.22;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.15,.29,.20),algae);diffuseColor.rgb*=.94+.06*sin(ruinPosition.y*24.);');
    };mat.customProgramCacheKey=()=> 'atlantis-aged-stone';
   }
   materials.push(mat);const mesh=new THREE.InstancedMesh(geometries[first.shape],mat,parts.length)
   parts.forEach((p,i)=>{dummy.position.set(...p.at);dummy.rotation.set(...(p.rotation||[0,0,0]) as Vec);if(p.quaternion)dummy.quaternion.copy(p.quaternion);dummy.scale.set(...p.size);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)})
   mesh.receiveShadow=true;meshes.push(mesh)
  }
  return {meshes,materials,geometries,map}
 },[texture,detailed])
 useEffect(()=>()=>{resources.meshes.forEach(m=>m.dispose());resources.materials.forEach(m=>m.dispose());Object.values(resources.geometries).forEach(g=>g.dispose());resources.map.dispose()},[resources])
 return <group position={[0,-.1,4]} scale={[1,.76,1]}>{resources.meshes.map((mesh,i)=><primitive key={i} object={mesh}/>)}</group>
}
