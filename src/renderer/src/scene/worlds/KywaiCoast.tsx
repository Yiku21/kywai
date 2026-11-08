import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useHomeNight } from '@/lib/homeLighting'
import { Model, type Vec } from './models'
import { WorldModel } from './WorldScenery'
import { homeFern, homePalm, homeShrub } from './homeBotany'
import { homeSurfaceMaps } from './homeMaterials'

import { homeLandHeight, smoothLand as smooth } from './homeLand'
import { HomeGrass } from './HomeGrass'
export { homeLandHeight } from './homeLand'

function gardenModel(detail:boolean) {
  const m=new Model()
  // Solid entry steps connect the interior to the paths of a coastal garden.
  for(let i=0;i<4;i++) m.box([0,-.15-i*.28,16.4+i*.72],[6.6+i*.2,.32,1.3],'#d0bea3')
  for(let row=0;row<20;row++) for(let col=0;col<4;col++) {
    const x=-2.5+col*1.67,z=19+row*1.1
    m.box([x,homeLandHeight(x,z)+.055,z],[1.64,.10,1.07],(row+col)%3?'#c4b091':'#d0bea3')
  }
  for(const side of [-1,1]) {
    for(let j=0;j<17;j++) {
      const x=side*(4.2+Math.sin(j*.6)*.4),z=19+j*1.12,y=homeLandHeight(x,z)
      homeShrub(m,x,y,z,329+j*47,1.0,detail?65:30)
      if(j%4===0) {
        m.add('cylinder',[side*3.7,y+.32,z],[.06,.62,.06],'#b99a60')
        m.box([side*3.7,y+.72,z],[.29,.24,.29],'#b88754')
        m.add('sphere',[side*3.7,y+.73,z],[.10,.13,.10],'#f1d8a1',.65)
      }
    }
    // Layered planting beds hide the edge of the foundations and make the house part of the shore.
    for(let i=0;i<(detail?44:25);i++) {
      const a=side*(.3+i/(detail?44:25)*1.45),r=18.7+(i%4)*.8,x=Math.sin(a)*r,z=Math.cos(a)*r-1,y=homeLandHeight(x,z)
      if(i%5===0) homePalm(m,x,y,z,930+i,2.1)
      else if(i%3===0) homeFern(m,x,y,z,900+i,1.25)
      else homeShrub(m,x,y,z,991+i*21,1.25+(i%3)*.3,detail?65:30)
    }
    for(let i=0;i<10;i++) {
      const x=side*(22+i*.56),z=-7+i*2.9,y=homeLandHeight(x,z)
      homePalm(m,x,y,z,1312+i,3.2+(i%3)*.3)
    }
    // Low stone terraces continue the architecture into the landscape.
    for(let j=0;j<18;j++) {
      const a=side*(.43+j*.052),r=19,x=Math.sin(a)*r,z=Math.cos(a)*r-1,y=homeLandHeight(x,z)
      m.box([x,y+.2,z],[.95,.42,.65],'#c4b091',0,[0,a,0])
    }
    // A proper porch beside the stairs, with warm entry lanterns.
    const x=side*5.1
    m.box([x,.75,15.3],[.90,1.8,.86],'#d0bea3')
    m.box([x,1.71,15.3],[1.12,.16,1.08],'#e4d1b0')
    for(const dx of [-.25,.25]) for(const dz of [-.25,.25]) m.box([x+dx,2.13,15.3+dz],[.035,.75,.035],'#b88754')
    for(const y of [1.79,2.49]) m.box([x,y,15.3],[.56,.055,.56],'#b99a60')
    m.add('sphere',[x,2.14,15.3],[.17,.27,.17],'#f1d8a1',.55)
    m.add('cone',[x,2.63,15.3],[.47,.28,.47],'#b99a60')
  }
  return m.pieces
}

export function KywaiCoast({detailed,reduced}:{detailed:boolean;reduced:boolean}) {
  const night=useHomeNight()
  const resources=useMemo(()=>{
    const maps=homeSurfaceMaps('garden');Object.values(maps).forEach(t=>t.repeat.set(38,35))
    const geometry=new THREE.PlaneGeometry(128,102,320,256);geometry.rotateX(-Math.PI/2);geometry.translate(0,0,23)
    const pos=geometry.getAttribute('position'),colors:number[]=[],a=new THREE.Color('#73754e'),b=new THREE.Color('#9a8b6f'),c=new THREE.Color()
    for(let i=0;i<pos.count;i++) {
      const x=pos.getX(i),z=pos.getZ(i),y=homeLandHeight(x,z);pos.setY(i,y)
      c.copy(a).lerp(b,smooth((-z-13)/13));c.multiplyScalar(.94+Math.sin(x*.41+z*.23)*.06);colors.push(c.r,c.g,c.b)
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals()
    return {geometry,maps}
  },[])
  const pieces=useMemo(()=>gardenModel(detailed),[detailed])
  useEffect(()=>()=>{resources.geometry.dispose();Object.values(resources.maps).forEach(t=>t.dispose())},[resources])
  return <group name="coastal-garden-and-foundations">
    <mesh geometry={resources.geometry} receiveShadow>
      <meshStandardMaterial {...resources.maps} vertexColors roughness={1} metalness={0} normalScale={new THREE.Vector2(.55,.55)} />
    </mesh>
    {[-1,1].flatMap(side=>[23,29,35].map(z=><pointLight key={`${side}-${z}`} position={[side*3.7,.15,z]} color="#ffd49c" intensity={night?2.5:0} distance={4} decay={2} />))}
    <HomeGrass detailed={detailed} reduced={reduced} />
    <WorldModel pieces={pieces} style="kywai" />
    {[-1,1].map(side=><pointLight key={side} position={[side*5.1,2.15,15.3]} color="#ffd29b" intensity={night?17:5} distance={night?10:5} decay={2} />)}
  </group>
}
