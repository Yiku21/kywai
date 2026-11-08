import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import { homeSlot } from './homeLayout'
import { plaqueBacking, plaqueFace, plaqueTopFace, type PlaqueCurve } from './homePlaques'

export function HomeNameplate({text,station}:{text:string;station:StationConfig}) {
  const [x,z]=station.position,slot=homeSlot(station.position)
  const resources=useMemo(()=>{
    const rectangular=['aider','kilo','copilot','codex'].includes(slot??'')
    const width=slot==='hermes'?1.45:slot==='copilot'?2.35:rectangular?1.8:1.95
    const height=slot==='hermes'?.30:rectangular?.205:.33
    let curve:PlaqueCurve|undefined,position:[number,number,number]
    if(slot==='hermes') {
      position=[0,1.045,0]
    } else if(rectangular) position=[x,.755,z+1.655]
    else {curve={radiusX:z>5?1.75:1.55,radiusZ:1.08,offset:.095};position=[x,.46,z+.67]}
    const angle=Math.atan2(x,z)-.18
    const face=slot==='hermes'?plaqueTopFace(width,height,2.8,angle):plaqueFace(width,height,curve)
    const back=slot==='hermes'?plaqueTopFace(width+.04,height+.025,2.8,angle).translate(0,-.003,0):plaqueBacking(width,height,curve)
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*height/width)
    const c=canvas.getContext('2d')!,h=canvas.height
    c.fillStyle='#d4b982';c.fillRect(0,0,1024,h);c.strokeStyle='#947349';c.lineWidth=5;c.strokeRect(8,8,1008,h-16)
    for(const xx of [29,995])for(const yy of [26,h-26]){c.beginPath();c.fillStyle='#886b42';c.arc(xx,yy,5,0,Math.PI*2);c.fill()}
    let size=Math.floor(h*.52);c.font=`600 ${size}px Georgia,serif`
    while(c.measureText(text).width>884&&size>20){size--;c.font=`600 ${size}px Georgia,serif`}
    c.fillStyle='#463323';c.textAlign='center';c.textBaseline='middle';c.fillText(text,512,h*.53)
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8
    return {face,back,map,position}
  },[text,x,z,slot])
  useEffect(()=>()=>{resources.face.dispose();resources.back.dispose();resources.map.dispose()},[resources])
  return <group position={resources.position} name={`fitted-nameplate-${station.id}`}>
    <mesh geometry={resources.back} receiveShadow><meshStandardMaterial color="#84613f" roughness={.76} side={THREE.DoubleSide} /></mesh>
    <mesh geometry={resources.face} receiveShadow><meshStandardMaterial map={resources.map} roughness={.66} metalness={.28} /></mesh>
  </group>
}
