import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { forestRandom } from './forestLayout'

function windowShape() {
  const s=new THREE.Shape()
  s.moveTo(-2.24,.25);s.lineTo(-2.24,6.95)
  s.bezierCurveTo(-2.24,8.6,-1.3,9.68,0,10.35)
  s.bezierCurveTo(1.3,9.68,2.24,8.6,2.24,6.95)
  s.lineTo(2.24,.25);s.closePath();return s
}

/** Glazed panels, chased brass and cut cabochons give the sanctuary physical depth. */
export function RelicVault() {
  const resources=useMemo(()=>{
    const N=1024,canvas=document.createElement('canvas');canvas.width=N;canvas.height=N*2
    const ctx=canvas.getContext('2d')!,random=forestRandom(1857)
    ctx.fillStyle='#193c4a';ctx.fillRect(0,0,N,N*2)
    const cells=9,step=N/cells
    // Hammered and leaded pieces: each pane has a different depth of blue and amber.
    for(let y=-1;y<19;y++) for(let x=-1;x<10;x++) {
      const px=x*step+(y%2)*step*.5,py=y*step
      const grad=ctx.createLinearGradient(px,py,px+step,py+step)
      const color=['#365d6d','#214352','#426b78','#3b5b62','#526c72','#6b7266'][Math.floor(random()*6)]
      grad.addColorStop(0,color);grad.addColorStop(1,'#182e3c');ctx.fillStyle=grad
      ctx.beginPath();ctx.moveTo(px,py-step*.55);ctx.lineTo(px+step*.52,py);ctx.lineTo(px,py+step*.55);ctx.lineTo(px-step*.52,py);ctx.closePath();ctx.fill()
      ctx.strokeStyle='#7c7256';ctx.lineWidth=2;ctx.stroke()
      ctx.strokeStyle='rgba(185,217,224,.14)';ctx.lineWidth=.7
      for(let k=0;k<4;k++){ctx.beginPath();ctx.moveTo(px-step*.2+k*9,py-step*.25);ctx.quadraticCurveTo(px+step*.12,py,px+k*6,py+step*.3);ctx.stroke()}
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8
    const shape=windowShape(),geo=new THREE.ExtrudeGeometry(shape,{depth:.10,bevelEnabled:true,bevelSize:.02,bevelThickness:.02,bevelSegments:2,curveSegments:64})
    // Extruded UVs are in world units; normalize to one whole panel.
    const uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)+2.24)/4.48,uv.getY(i)/10.4)
    const glass=new THREE.MeshPhysicalMaterial({map:texture,color:'#b3cbd1',roughness:.21,metalness:.18,clearcoat:1,clearcoatRoughness:.15,envMapIntensity:1.25,emissive:'#255364',emissiveMap:texture,emissiveIntensity:.38})
    const pieces:THREE.BufferGeometry[]=[]
    const curve=(points:THREE.Vector3[],radius=.027,closed=false)=>{
      pieces.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,closed),Math.max(24,points.length*4),radius,8,closed))
    }
    const loop=(x:number,y:number,r:number,squash=1)=>curve(Array.from({length:65},(_,i)=>{const a=i/64*Math.PI*2;return new THREE.Vector3(x+Math.cos(a)*r,y+Math.sin(a)*r*squash,.15)}),.026,true)
    for(const x of [-1.55,0,1.55]) curve([new THREE.Vector3(x,.3,.15),new THREE.Vector3(x,3.3,.15),new THREE.Vector3(x,6.7,.15)],.024)
    for(const y of [1,5.2,6.7])curve([new THREE.Vector3(-2.2,y,.15),new THREE.Vector3(0,y,.15),new THREE.Vector3(2.2,y,.15)],.018)
    loop(0,7.65,1.3);loop(0,7.65,1.39)
    for(let j=0;j<8;j++){
      const a=j/8*Math.PI*2
      loop(Math.cos(a)*.77,7.65+Math.sin(a)*.77,.39,1.1)
    }
    // Repeated scrollwork is geometry, so highlights follow the real curves.
    for(const side of [-1,1])for(const y of [1.7,3.4,5.7]){
      curve(Array.from({length:65},(_,i)=>{
        const t=i/64,a=t*Math.PI*3.6,r=.47*(1-t)+.025
        return new THREE.Vector3(side*(1.55+Math.cos(a)*r*.65),y+Math.sin(a)*r,.16)
      }),.018)
    }
    const tracery=mergeGeometries(pieces);pieces.forEach(g=>g.dispose())
    const gold=new THREE.MeshPhysicalMaterial({color:'#bfa16a',metalness:.93,roughness:.27,clearcoat:.12,envMapIntensity:1.7})
    const gemGeo=new THREE.OctahedronGeometry(.13,0),gemMat=new THREE.MeshPhysicalMaterial({color:'#b1dae2',metalness:.15,roughness:.06,clearcoat:1,envMapIntensity:2})
    const placements:{x:number;y:number;z:number;a:number;sy:number}[]=[]
    for(const side of [-1,1])for(const [tx,tz,base,h] of [[side*13,-31,1.2,18],[side*30,-50,2,24]])for(let tier=0;tier<4;tier++)for(let k=0;k<6;k++){
      const a=k*Math.PI/3,r=2.45-tier*.28
      placements.push({x:tx+Math.sin(a)*(r+.075),y:base+tier*h/4+.45,z:tz+Math.cos(a)*(r+.075),a,sy:(h/4-.8)/10.35})
    }
    const towerGlass=new THREE.InstancedMesh(geo,glass,placements.length),dummy=new THREE.Object3D()
    placements.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(0,v.a,0);dummy.scale.set(.145,v.sy,.4);dummy.updateMatrix();towerGlass.setMatrixAt(i,dummy.matrix)})
    towerGlass.instanceMatrix.needsUpdate=true;towerGlass.computeBoundingSphere();towerGlass.raycast=()=>{}
    return {texture,geo,glass,tracery,gold,gemGeo,gemMat,towerGlass}
  },[])
  useEffect(()=>()=>{resources.texture.dispose();resources.geo.dispose();resources.glass.dispose();resources.tracery.dispose();resources.gold.dispose();resources.gemGeo.dispose();resources.gemMat.dispose();resources.towerGlass.dispose()},[resources])
  return <group>
    <primitive object={resources.towerGlass}/>
    {[-12.5,-7.5,7.5,12.5].map(x=><group key={x} position={[x,0,-17.35]}>
      <mesh geometry={resources.geo} material={resources.glass} receiveShadow raycast={()=>{}}/>
      <mesh geometry={resources.tracery} material={resources.gold} raycast={()=>{}}/>
      {[1,5.2,7.65].map(y=><mesh key={y} position={[0,y,.21]} geometry={resources.gemGeo} material={resources.gemMat} scale={[1,1.3,.5]} raycast={()=>{}}/>)}
    </group>)}
    <pointLight position={[0,8,-39]} color="#a0dce7" intensity={65} distance={20} decay={2}/>
    <pointLight position={[-10,5,-13]} color="#98d9e8" intensity={22} distance={14} decay={2}/>
    <pointLight position={[10,5,-13]} color="#f2cd8c" intensity={22} distance={14} decay={2}/>
  </group>
}
