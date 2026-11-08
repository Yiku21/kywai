import * as THREE from 'three'
import { Model, type Vec } from './models'

export const gardenGreens=['#557550','#78935e','#94a575','#426c51']
const rnd=(i:number)=>{const n=Math.sin(i*137.17+41.8)*43758.5;return n-Math.floor(n)}
const lerp=(a:Vec,b:Vec,t:number)=>a.map((v,i)=>v+(b[i]-v)*t) as Vec

/** A leaf grows from a stem: its long axis follows the petiole, with a curved midrib. */
function leaf(m:Model,a:Vec,b:Vec,width:number,color:string,twist=0) {
  const axis=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis.clone().normalize())
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),twist))
  m.pieces.push({shape:'leaf',at:lerp(a,b,.5),size:[width,axis.length(),width*.3],color,quaternion:q})
}

export function homeFern(m:Model,x:number,y:number,z:number,seed:number,h=1) {
  const first=m.pieces.length
  for(let j=0;j<8;j++) {
    const a=j*Math.PI/4+rnd(seed+j)*.3,r=h*(.75+rnd(seed+j*9)*.35)
    const point=(t:number):Vec=>[x+Math.cos(a)*r*t,y+h*(Math.sin(t*Math.PI*.84)*.70+.10*t),z+Math.sin(a)*r*t]
    for(let k=0;k<12;k++) {
      const t=(k+1)/13,p=point(t),next=point((k+2)/13)
      m.beam(point(k/13),p,.008,'#607551')
      for(const side of [-1,1]) {
        const length=(.14+Math.sin(t*Math.PI)*.23)*h
        const end:Vec=[p[0]+Math.cos(a+side*1.18)*length,next[1]+length*.12,p[2]+Math.sin(a+side*1.18)*length]
        leaf(m,p,end,length*.34,gardenGreens[(j+k)%4],side*.3)
      }
    }
  }
  for(let i=first;i<m.pieces.length;i++) m.pieces[i].wind={root:[x,y,z],height:h,flexibility:1.15}
}

export function homePalm(m:Model,x:number,y:number,z:number,seed:number,h=2.5) {
  const first=m.pieces.length
  for(let j=0;j<9;j++) {
    const a=j*2.399+rnd(seed+j)*.3,r=h*(.30+rnd(seed+j*3)*.20)
    const top:Vec=[x+Math.cos(a)*r,y+h*(.75+rnd(seed+j)*.3),z+Math.sin(a)*r]
    m.beam([x,y,z],top,.012,'#607551')
    for(let k=0;k<5;k++) {
      const a2=a+(k-2)*.22,end:Vec=[top[0]+Math.cos(a2)*h*.25,top[1]-h*.2,top[2]+Math.sin(a2)*h*.25]
      leaf(m,top,end,h*.18,gardenGreens[j%4],a)
    }
  }
  for(let i=first;i<m.pieces.length;i++) m.pieces[i].wind={root:[x,y,z],height:h,flexibility:1.0}
}

export function homeShrub(m:Model,x:number,y:number,z:number,seed:number,h:number,count:number) {
  const first=m.pieces.length
  const branches=Math.max(5,Math.round(count/9))
  m.beam([x,y,z],[x,y+h*.36,z],.025,'#84613f')
  for(let j=0;j<branches;j++) {
    const a=j*2.399+rnd(seed+j),r=h*(.23+rnd(seed+j*11)*.25)
    const start:Vec=[x,y+h*.15,z],end:Vec=[x+Math.cos(a)*r,y+h*(.62+rnd(seed+j*7)*.42),z+Math.sin(a)*r]
    m.beam(start,end,.009,'#607551')
    for(let k=0;k<6;k++) {
      const p=lerp(start,end,.25+k*.12)
      for(const side of [-1,1]) {
        const b=a+side*1.2,l=h*(.14+rnd(seed+j+k)*.10)
        leaf(m,p,[p[0]+Math.cos(b)*l,p[1]+l*.25,p[2]+Math.sin(b)*l],l*.5,gardenGreens[(j+k)%4],a*.3)
      }
    }
    if(j%3===0) {
      for(let k=0;k<5;k++) {const b=k*Math.PI*2/5;m.add('sphere',[end[0]+Math.cos(b)*.045,end[1]+.04,end[2]+Math.sin(b)*.045],[.048,.025,.048],j%2?'#bca2cf':'#f1d8a1')}
    }
  }
  for(let i=first;i<m.pieces.length;i++) m.pieces[i].wind={root:[x,y,z],height:h,flexibility:0.85}
}

export function homePlant(m:Model,x:number,y:number,z:number,seed:number,h=1,count=38) {
  const kind=Math.abs(seed)%7
  if(kind===2||kind===5) homeFern(m,x,y,z,seed,h*.70)
  else if(kind===3) homePalm(m,x,y,z,seed,h*1.2)
  else homeShrub(m,x,y,z,seed,h,count)
}
