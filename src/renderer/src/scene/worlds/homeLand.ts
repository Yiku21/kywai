import * as THREE from 'three'

const hash=(x:number,y:number)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n)}
export const landNoise=(x:number,y:number)=>{
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,a=fx*fx*(3-2*fx),b=fy*fy*(3-2*fy)
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),a),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),a),b)
}
export const smoothLand=(x:number)=>{const t=THREE.MathUtils.clamp(x,0,1);return t*t*(3-2*t)}
export function homeLandHeight(x:number,z:number) {
  const distance=Math.hypot(x,z+1),outside=smoothLand((distance-17.7)/4)
  const undulation=(landNoise(x*.34,z*.34)-.5)*.18+(landNoise(x*1.4,z*1.4)-.5)*.045
  const garden=-1.10+outside*(.22+Math.sin(x*.21)*Math.cos(z*.15)*.34+undulation)
  return garden-smoothLand((-z-18)/12)*(7.5+Math.sin(x*.23)*.5)
}

export function lawnPositions(count:number) {
  const positions:{x:number;z:number;height:number;angle:number;variation:number}[]=[]
  let state=419731
  const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296}
  for(let i=0;i<count*5&&positions.length<count;i++) {
    const near=rnd()<.72,x=(rnd()-.5)*(near?56:76),z=near?12+rnd()*34:-16+rnd()*66
    if(Math.hypot(x,z+1)<17.65 || (z>17.5&&Math.abs(x)<3.63)) continue
    const variation=landNoise(x*.24,z*.24)
    positions.push({x,z,height:.12+rnd()**1.4*.22+variation*.035,angle:rnd()*Math.PI*2,variation})
  }
  return positions
}
