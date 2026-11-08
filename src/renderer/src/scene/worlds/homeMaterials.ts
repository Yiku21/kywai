import * as THREE from 'three'

export type HomeSurface = 'oak' | 'linen' | 'limestone' | 'terracotta' | 'garden' | 'foliage'
const hash=(x:number,y:number)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n)}
const noise=(x:number,y:number)=>{
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,a=fx*fx*(3-2*fx),b=fy*fy*(3-2*fy)
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),a),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),a),b)
}

/** Tactile, fine-scale finishes, scoped to the home rather than changing the other worlds. */
export function homeSurfaceMaps(surface:HomeSurface) {
  const n=512,albedo=new Uint8Array(n*n*4),normal=new Uint8Array(n*n*4),rough=new Uint8Array(n*n*4),height=new Float32Array(n*n)
  for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
    const fine=hash(x,y),broad=noise(x/91,y/91),detail=noise(x/17,y/17)
    let shade=.9,h=.5,r=.7
    if(surface==='oak') {
      const flow=noise(x/110,y/90)*9+Math.sin(y/97)*1.4
      const grain=Math.sin(x*.53+flow),fineGrain=Math.sin(x*2.17+flow*3)
      const pores=Math.pow(Math.max(0,grain),16)
      shade=.80+broad*.17+grain*.045+fineGrain*.012-pores*.07
      h=.5+grain*.012+fineGrain*.003+fine*.002;r=.55+detail*.12
    } else if(surface==='linen') {
      const warp=Math.sin(x*Math.PI/2),weft=Math.sin(y*Math.PI/2)
      h=.5+warp*.07+weft*.07+fine*.015
      shade=.84+(warp+weft)*.035+broad*.09+fine*.035;r=.89
    } else if(surface==='limestone') {
      const vein=Math.abs(Math.sin(x*.018+noise(x/120,y/140)*3.8+y*.009))
      const pore=fine>.985?.14:0
      shade=.90+broad*.07+detail*.025-Math.exp(-vein*65)*.045-pore*.2
      h=.5+detail*.015+fine*.004-pore*.08;r=.68+detail*.13
    } else if(surface==='terracotta') {
      shade=.81+broad*.1+fine*.07;h=.5+fine*.035+Math.sin(y*.55)*.008;r=.88
    } else if(surface==='foliage') {
      const u=x/n,v=y/n,mid=Math.exp(-Math.abs(u-.5)*180)
      const branch=Math.exp(-Math.abs(((v*13-Math.abs(u-.5)*8)%1+1)%1-.5)*65)
      shade=.78+broad*.13+detail*.04+mid*.07+branch*.06+fine*.015
      h=.50+mid*.045+branch*.022+fine*.003;r=.86+fine*.10
    } else {
      const u=x/n,v=y/n
      const tile=(scale:number)=>THREE.MathUtils.lerp(THREE.MathUtils.lerp(noise(x/scale,y/scale),noise((x-n)/scale,y/scale),u),THREE.MathUtils.lerp(noise(x/scale,(y-n)/scale),noise((x-n)/scale,(y-n)/scale),u),v)
      const grain=tile(13),soil=tile(37)
      shade=.84+grain*.10+soil*.035+fine*.025;h=.47+grain*.045+fine*.024;r=.98
    }
    const k=(y*n+x)*4;height[y*n+x]=h
    albedo.set([shade*255,shade*255,shade*255,255],k);rough.set([r*255,r*255,r*255,255],k)
  }
  for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
    const dx=height[y*n+(x+1)%n]-height[y*n+(x+n-1)%n],dy=height[((y+1)%n)*n+x]-height[((y+n-1)%n)*n+x]
    const v=new THREE.Vector3(-dx*2,-dy*2,1).normalize(),k=(y*n+x)*4
    normal.set([(v.x*.5+.5)*255,(v.y*.5+.5)*255,(v.z*.5+.5)*255,255],k)
  }
  const texture=(data:Uint8Array)=>{const t=new THREE.DataTexture(data,n,n);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=8;t.needsUpdate=true;return t}
  const map=texture(albedo);map.colorSpace=THREE.SRGBColorSpace
  return {map,normalMap:texture(normal),roughnessMap:texture(rough)}
}
