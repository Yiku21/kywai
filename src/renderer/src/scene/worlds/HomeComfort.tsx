import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { StationConfig } from '@shared/types'
import { Model, type Vec } from './models'
import { homeSurfaceMaps } from './homeMaterials'
import { homeFern, homePalm, homeShrub } from './homeBotany'

export function homeComfortParts(stations:StationConfig[]) {
  const m=new Model(),wood='#b88754',brass='#b99a60'
  // Curved reading benches: cushions, welt cords and a timber back rail.
  for(const side of [-1,1]) for(let j=0;j<7;j++) {
    const a=side*(1.34+j*.13),r=14.35,x=Math.sin(a)*r,z=Math.cos(a)*r-1
    m.box([x,.48,z],[1.65,.32,1.18],wood,0,[0,a,0])
    m.add('cushion',[x,.78,z],[1.53,.27,1.09],'#8fa7a0',0,[0,a,0])
    const bx=Math.sin(a)*14.9,bz=Math.cos(a)*14.9-1
    m.box([bx,1.09,bz],[1.67,.58,.10],wood,0,[0,a,0])
    if(j%2===0) m.add('cushion',[bx*.985,1.16,bz*.985],[.72,.67,.22],j%3?'#b8a590':'#9b829e',0,[-.12,a,.1*(j%3-1)])
    for(const dx of [-.70,.70]) {const xx=x+Math.cos(a)*dx,zz=z-Math.sin(a)*dx;m.beam([xx,.2,zz],[xx,.66,zz],.055,wood)}
  }
  // Turned legs, curved arms and upholstery piping on the user's chair.
  for(const side of [-1,1]) {
    for(const z of [5.4,6.6]) {
      m.add('cylinder',[side*.70,.35,z],[.045,.65,.045],wood)
      m.add('sphere',[side*.70,.12,z],[.075,.095,.075],wood)
      m.add('cylinder',[side*.70,.60,z],[.07,.09,.07],brass)
    }
    m.beam([side*.76,.78,5.33],[side*.76,1.2,5.33],.04,brass)
    m.box([side*.76,1.23,5.98],[.16,.11,1.42],wood)
    m.beam([side*.76,1.18,6.6],[side*.76,1.93,6.6],.045,wood)
  }
  for(let j=0;j<24;j++) {
    const a=j/24*Math.PI*2
    m.add('sphere',[Math.cos(a)*.66,.79,6+Math.sin(a)*.60],[.022,.022,.022],'#d1b28a')
  }
  // Clay pots have a real rim and an open soil surface; each species has a different growth habit.
  const pots:Vec[]=[[-13.1,.02,8.2],[13.1,.02,8.2],[-11.2,.02,11.7],[11.2,.02,11.7],[-5.5,.02,-10.6],[5.5,.02,-10.6]]
  for(let i=0;i<pots.length;i++) {
    const [x,y,z]=pots[i],r=i<4?.55:.38,h=i<4?.95:.62
    m.add('planter',[x,y+h*.5,z],[r,h,r],i%2?'#b58464':'#aa7658')
    m.add('cylinder',[x,y+h*.93,z],[r*.78,.035,r*.78],'#625840')
    if(i%3===0) homePalm(m,x,y+h,z,512+i,2.1)
    else if(i%3===1) homeFern(m,x,y+h,z,432+i,1.1)
    else homeShrub(m,x,y+h,z,218+i,1.55,65)
    m.ring([x,y+.12,z],r*.72,brass,undefined,0)
  }
  // Hanging ivy baskets: cords meet the ribs and the trails grow down around the windows.
  for(const side of [-1,1]) for(let j=0;j<2;j++) {
    const x=side*(j?7.0:12.5),y=j?6.3:5.8,z=j?-10.5:-1.0
    m.add('planter',[x,y,z],[.40,.48,.40],'#b58464')
    for(let k=0;k<3;k++) {
      const a=k*Math.PI*2/3
      m.beam([x+Math.cos(a)*.37,y+.26,z+Math.sin(a)*.37],[x,y+1.8,z],.009,brass)
    }
    const ceiling=1+11.5*Math.sqrt(Math.max(0,1-(Math.hypot(x,z+1)/16.65)**2))
    m.beam([x,y+1.8,z],[x,ceiling,z],.012,brass)
    homeFern(m,x,y+.25,z,713+j, .65)
    const ivyFirst=m.pieces.length
    for(let trail=0;trail<5;trail++) {
      let last:Vec=[x+Math.sin(trail)*.30,y+.2,z+Math.cos(trail)*.3]
      for(let k=0;k<16;k++) {
        const a=trail*1.4+k*.5,at:Vec=[x+Math.sin(a)*(.28+k*.013),y+.12-k*.115,z+Math.cos(a)*(.26+k*.01)]
        m.beam(last,at,.007,'#607551')
        m.add('leaf',[at[0]+Math.sin(a)*.04,at[1]-.04,at[2]],[.12,.20,.055],['#557550','#78935e','#94a575'][k%3],0,[.8,a,.6]);last=at
      }
    }
    for(let i=ivyFirst;i<m.pieces.length;i++)m.pieces[i].wind={root:[x,y+.2,z],height:-2.1,flexibility:1.0}
  }
  // Personal stools and modest storage add furniture below the work surfaces.
  for(const st of stations) {
    const [x,z]=st.position
    if(Math.hypot(x-2,z+2.2)<.1) continue
    for(const dx of [-.32,.32]) for(const dz of [-.42,.15]) m.beam([x+dx,.07,z+dz-.65],[x+dx,.55,z+dz-.65],.035,wood)
    m.add('cushion',[x,.63,z-.78],[.91,.18,.82],'#b8a590')
  }
  // Brass-edged clipboard, pen, mug handle and a woven basket by the entry bench.
  m.box([7,1.35,11.45],[2.25,.045,1.2],'#8e623f',0,[.2,0,0])
  m.box([7,1.40,11.45],[2.12,.02,1.08],'#f5ead4',0,[.2,0,0])
  m.box([7,1.56,10.93],[.42,.05,.14],brass)
  m.beam([7.85,1.36,11.7],[7.43,1.45,11.0],.015,brass)
  m.ring([-5.58,.88,12],.12,'#c7ab7b',[0,Math.PI/2,0],0)
  m.add('cylinder',[-8.9,.34,12.1],[.42,.58,.42],'#d0ae7c')
  for(let j=0;j<11;j++) m.ring([-8.9,.1+j*.05,12.1],.425,'#84613f',undefined,0)
  for(let j=0;j<14;j++){const a=j/14*Math.PI*2;m.beam([-8.9+Math.cos(a)*.42,.06,12.1+Math.sin(a)*.42],[-8.9+Math.cos(a)*.42,.64,12.1+Math.sin(a)*.42],.008,'#d1b28a')}
  return m.pieces
}

function clothFold() {
  const g=new THREE.PlaneGeometry(1.35,1.75,56,52),p=g.getAttribute('position')
  for(let i=0;i<p.count;i++) {
    const u=p.getX(i)/1.35+.5,t=p.getY(i)/1.75+.5
    const z=11.57+t*1.65,drop=Math.max(0,(t-.56)/.44),y=.94-drop*.87
    p.setXYZ(i,-7.55+(u-.5)*1.35,y+Math.sin(u*37+t*3)*.028*(.4+drop),z-(drop*drop)*.42)
  }
  g.computeVertexNormals();return g
}

export function HomeComfort() {
  const resources=useMemo(()=>{
    const fabric=homeSurfaceMaps('linen'),wood=homeSurfaceMaps('oak')
    const s=new THREE.Shape();s.moveTo(-.68,.78);s.lineTo(-.72,1.65);s.quadraticCurveTo(-.73,1.96,-.45,2.04);s.quadraticCurveTo(0,2.16,.45,2.04);s.quadraticCurveTo(.73,1.96,.72,1.65);s.lineTo(.68,.78);s.closePath()
    const back=new THREE.ExtrudeGeometry(s,{depth:.15,bevelEnabled:true,bevelThickness:.055,bevelSize:.055,bevelSegments:5,curveSegments:30}),p=back.getAttribute('position')
    for(let i=0;i<p.count;i++)p.setZ(i,6.40+p.getZ(i)-.19*(1-(p.getX(i)/.77)**2)+(p.getY(i)-.8)*.10)
    back.computeVertexNormals()
    const seat=new RoundedBoxGeometry(1.48,.28,1.38,6,.13),throwGeo=clothFold()
    const seams:THREE.BufferGeometry[]=[]
    for(const y of [.88,1.95])seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({length:41},(_,i)=>{const x=-.64+i/40*1.28;return new THREE.Vector3(x,y,6.59-.19*(1-(x/.77)**2)+(y-.8)*.10)})),40,.009,6,false))
    return {fabric,wood,back,seat,throwGeo,seams}
  },[])
  useEffect(()=>()=>{resources.back.dispose();resources.seat.dispose();resources.throwGeo.dispose();resources.seams.forEach(g=>g.dispose());Object.values(resources.fabric).forEach(t=>t.dispose());Object.values(resources.wood).forEach(t=>t.dispose())},[resources])
  return <group name="upholstery-and-soft-furnishings">
    <mesh geometry={resources.back} castShadow receiveShadow><meshPhysicalMaterial {...resources.fabric} color="#659994" roughness={.94} sheen={1} sheenColor="#acccc0" sheenRoughness={.85} /></mesh>
    <mesh geometry={resources.seat} position={[0,.78,6]} castShadow receiveShadow><meshPhysicalMaterial {...resources.fabric} color="#88afa5" roughness={.94} sheen={1} sheenColor="#b8cbbb" /></mesh>
    {resources.seams.map((g,i)=><mesh key={i} geometry={g}><meshStandardMaterial color="#c1cbb3" roughness={.9} /></mesh>)}
    <mesh geometry={resources.throwGeo} castShadow receiveShadow><meshPhysicalMaterial {...resources.fabric} color="#7caaa2" roughness={.95} sheen={1} sheenColor="#bed3c1" side={THREE.DoubleSide} /></mesh>
  </group>
}
