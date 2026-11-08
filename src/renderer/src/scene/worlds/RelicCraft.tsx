import { useEffect, useMemo } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { RelicVault } from './RelicVault'
import { forestRandom } from './forestLayout'

/** A continuous polished surface reflects the real architecture and crystal mounts. */
export function RelicCraft({ detailed }: { detailed: boolean }) {
  const map = useMemo(() => {
    const N=2048,canvas=document.createElement('canvas');canvas.width=canvas.height=N
    const ctx=canvas.getContext('2d')!,random=forestRandom(5201)
    ctx.fillStyle='#202631';ctx.fillRect(0,0,N,N)
    for(let i=0;i<100;i++) {
      const x=random()*N,y=random()*N,length=80+random()*500
      ctx.strokeStyle=i%5?'rgba(132,141,153,.10)':'rgba(197,187,159,.19)';ctx.lineWidth=.5+random()*1.7
      ctx.beginPath();ctx.moveTo(x,y)
      for(let j=1;j<=9;j++)ctx.lineTo(x+j*length/9+Math.sin(j*.8+i)*17,y+j*length*.4/9+Math.sin(j*1.1+i)*12)
      ctx.stroke()
    }
    const step=N/20
    ctx.lineWidth=1.5;ctx.strokeStyle='rgba(178,151,100,.38)'
    for(let i=0;i<=20;i++){ctx.beginPath();ctx.moveTo(i*step,0);ctx.lineTo(i*step,N);ctx.moveTo(0,i*step);ctx.lineTo(N,i*step);ctx.stroke()}
    ctx.strokeStyle='rgba(196,168,110,.67)';ctx.lineWidth=2
    for(const r of [200,210,510,850]){ctx.beginPath();ctx.arc(N/2,N/2,r,0,Math.PI*2);ctx.stroke()}
    for(let i=0;i<64;i++){
      const a=i/64*Math.PI*2,r=850,x=N/2+Math.sin(a)*r,y=N/2+Math.cos(a)*r
      ctx.save();ctx.translate(x,y);ctx.rotate(-a);ctx.strokeRect(-3,-8,6,16);ctx.restore()
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture
  },[])
  useEffect(()=>()=>map.dispose(),[map])
  return <><RelicVault/><mesh position={[0,-.102,-1]} rotation-x={-Math.PI/2} receiveShadow raycast={()=>{}}>
    <planeGeometry args={[31,30]}/>
    <MeshReflectorMaterial map={map} color="#b0b5bd" resolution={detailed?1024:256} mirror={.28} blur={detailed?[80,30]:[30,15]} mixBlur={.55} mixStrength={.75} roughness={.24} metalness={.35} depthScale={.16} minDepthThreshold={.6} maxDepthThreshold={1.1} />
  </mesh></>
}
