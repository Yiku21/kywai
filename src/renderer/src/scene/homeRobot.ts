import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { RobotAvatar } from '@shared/types'
import { buildRobot } from './robotModel'
import { homeIdentity } from './homeIdentity'
import { homeSurfaceMaps } from './worlds/homeMaterials'

// Texture clones share immutable source pixels; each model owns its wrappers and cleanup.
// This also tolerates React StrictMode's setup/cleanup replay without a global refcount.
let clothSource:ReturnType<typeof homeSurfaceMaps>|null=null
function garmentMaps(){
  const source=clothSource??(clothSource=homeSurfaceMaps('linen'))
  return {map:source.map.clone(),normalMap:source.normalMap.clone(),roughnessMap:source.roughnessMap.clone()}
}

/** Individual silhouettes and clothing retain the live eye rig and activity animation. */
export function buildHomeRobot(avatar:RobotAvatar,color:string,name='') {
  const identity=homeIdentity(name,avatar),role=identity.role
  const model=buildRobot({...avatar,body:identity.body,accessory:identity.accessory,eyes:identity.eyes,
    eyeColor:color,accentColor:color,trimColor:'#b99a60'},identity.ceramic)
  model.bodyMat.roughness=.34;model.bodyMat.clearcoat=.30;model.bodyMat.clearcoatRoughness=.25
  model.bodyMat.emissive.set('#b7a689')
  const ceramic=model.bodyMat.clone(),brass=new THREE.MeshStandardMaterial({color:'#b99a60',metalness:.68,roughness:.36})
  ceramic.emissiveIntensity=.015
  const fabricMaps=garmentMaps()
  const cloth=new THREE.MeshPhysicalMaterial({color:identity.cloth,...fabricMaps,roughness:.92,sheen:1,sheenColor:new THREE.Color(identity.cloth).lerp(new THREE.Color('#fff4df'),.3),sheenRoughness:.8})
  const dark=new THREE.MeshStandardMaterial({color:'#40524c',roughness:.64}),rose=new THREE.MeshStandardMaterial({color:'#d6a3b8',roughness:.7})
  const sphere=new THREE.SphereGeometry(1,32,20),cylinder=new THREE.CylinderGeometry(1,1,1,24),box=new RoundedBoxGeometry(1,1,1,3,.12)
  const owned:THREE.BufferGeometry[]=[sphere,cylinder,box]
  const add=(geo:THREE.BufferGeometry,mat:THREE.Material,p:[number,number,number],s:[number,number,number])=>{
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(...p);mesh.scale.set(...s);mesh.castShadow=true;mesh.receiveShadow=true;model.root.add(mesh);return mesh
  }
  const ring=(p:[number,number,number],r:number,t:number,mat:THREE.Material,rot:[number,number,number]=[0,0,0])=>{
    const g=new THREE.TorusGeometry(r,t,8,48);owned.push(g);const mesh=add(g,mat,p,[1,1,1]);mesh.rotation.set(...rot);return mesh
  }
  add(sphere,ceramic,[0,-.71,-.02],[.32,.39,.25])
  add(cylinder,brass,[0,-.50,0],[.19,.06,.18])
  // Ceramic fingers, articulated wrists and inset elbow pivots.
  for(const side of [-1,1]) {
    add(sphere,brass,[side*.32,-.57,.02],[.085,.085,.085])
    const arm=add(sphere,ceramic,[side*.40,-.67,.16],[.105,.23,.11]);arm.rotation.z=side*.4
    add(sphere,ceramic,[side*.41,-.78,.34],[.11,.09,.14])
    add(cylinder,brass,[side*.43,-.70,.16],[.11,.035,.11])
    for(let j=0;j<3;j++) add(sphere,ceramic,[side*.41+(j-1)*.045,-.80,.45],[.019,.023,.06])
    add(cylinder,brass,[side*.45,.04,0],[.14,.075,.14]).rotation.z=Math.PI/2
  }
  if(['claude','qwen','hermes'].includes(role??'')) {
    ring([0,-.43,0],.27,.085,cloth,[Math.PI/2,0,0])
    const tail=add(box,cloth,[role==='hermes'?-.16:.21,-.73,.25],[.14,.45,.06]);tail.rotation.z=role==='claude'?-.22:.15
    for(let j=0;j<5;j++) add(cylinder,cloth,[(role==='hermes'?-.16:.21)+(j-2)*.024,-.97,.25],[.006,.06,.006])
  }
  if(['aider','codex','muse'].includes(role??'')) {
    add(box,cloth,[0,-.74,.23],[.48,.52,.04])
    add(box,cloth,[0,-.85,.27],[.33,.14,.035])
    for(const x of [-.18,.18]) {add(box,cloth,[x,-.53,.23],[.045,.30,.025]);add(sphere,brass,[x,-.68,.27],[.027,.027,.015])}
    if(role!=='muse') for(let j=0;j<3;j++) add(cylinder,brass,[-.1+j*.09,-.78,.30],[.012,.18,.012])
  }
  if(role==='claude') {
    for(const side of [-1,1]) ring([side*.19,.16,.49],.13,.011,brass)
    add(box,brass,[0,.16,.50],[.10,.014,.016])
  } else if(role==='aider') {
    for(const side of [-1,1]) {ring([side*.18,.34,.40],.12,.025,dark);add(cylinder,brass,[side*.18,.34,.39],[.08,.025,.08]).rotation.x=Math.PI/2}
    add(box,cloth,[0,.35,-.05],[.88,.12,.70])
  } else if(role==='copilot') {
    for(const side of [-1,1]) {
      add(cylinder,dark,[side*.48,.10,0],[.21,.10,.21]).rotation.z=Math.PI/2
      add(cylinder,cloth,[side*.54,.10,0],[.17,.06,.17]).rotation.z=Math.PI/2
    }
    const points=Array.from({length:33},(_,i)=>{const a=i/32*Math.PI;return new THREE.Vector3(Math.cos(a)*.49,.12+Math.sin(a)*.52,-.04)})
    const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,.035,8,false);owned.push(g);add(g,cloth,[0,0,0],[1,1,1])
  } else if(role==='muse') {
    for(let j=0;j<6;j++){const a=j*Math.PI/3;add(sphere,rose,[-.43+Math.cos(a)*.085,.35+Math.sin(a)*.085,.22],[.065,.065,.025])}
    add(sphere,brass,[-.43,.35,.25],[.045,.045,.025])
  } else if(role==='gemini') {
    for(const side of [-1,1]) add(box,cloth,[side*.33,-.63,.14],[.13,.22,.11]).rotation.z=side*.3
    ring([0,-.72,.255],.12,.014,brass)
  } else if(role==='kilo') {
    add(box,cloth,[0,-.79,.24],[.47,.22,.05])
    for(let j=0;j<4;j++) add(box,brass,[-.15+j*.10,-.79,.28],[.045,.035,.02])
    add(box,dark,[0,.46,-.03],[.85,.08,.65])
  } else if(role==='hermes') {
    for(const side of [-1,1]) for(let j=0;j<3;j++) add(box,brass,[side*(.40+j*.035),.13+j*.055,.04],[.17,.025,.04]).rotation.z=side*.4
    add(sphere,brass,[-.16,-.57,.31],[.055,.055,.025])
  }
  if(model.logoMat) {
    model.root.children.filter(o=>o instanceof THREE.Mesh&&o.material===model.logoMat).forEach(o=>{o.visible=false})
    const badgeGeo=new THREE.PlaneGeometry(.21,.21);owned.push(badgeGeo);add(badgeGeo,model.logoMat,[0,-.70,.285],[1,1,1])
  }
  const dispose=model.dispose
  model.dispose=()=>{owned.forEach(g=>g.dispose());ceramic.dispose();brass.dispose();cloth.dispose();dark.dispose();rose.dispose();Object.values(fabricMaps).forEach(t=>t.dispose());dispose()}
  return model
}
