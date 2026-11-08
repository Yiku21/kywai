import * as THREE from 'three'

/** A continuous curved timber, with grain running along the whole arch, rather than segmented boxes. */
export function curvedHomeTimber(width=.36,depth=.34,maxT=Math.PI/2) {
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],steps=96
  const corners=[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]]
  for(let face=0;face<4;face++) {
    const offset=positions.length/3
    for(let i=0;i<=steps;i++) {
      const t=i/steps*maxT,x=16.65*Math.cos(t),y=1+11.5*Math.sin(t)
      const normal=new THREE.Vector2(11.5*Math.cos(t),16.65*Math.sin(t)).normalize()
      for(let side=0;side<2;side++) {
        const [n,z]=corners[(face+side)%4]
        positions.push(x+normal.x*n,y+normal.y*n,z);uvs.push(side,i/steps*8)
      }
      if(i<steps){const k=offset+i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3)}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g
}
