import * as THREE from 'three'

export interface PlaqueCurve {radiusX:number;radiusZ:number;angle?:number;inward?:boolean;offset:number}

/** UVs stay horizontal while the plate follows its supporting cylindrical/elliptical furniture. */
export function plaqueFace(width:number,height:number,curve?:PlaqueCurve) {
  const steps=curve?48:1,p:number[]=[],uv:number[]=[],ids:number[]=[]
  for(let i=0;i<=steps;i++) for(let row=0;row<2;row++) {
    const u=i/steps,y=(row-.5)*height
    if(curve) {
      const direction=curve.inward?-1:1,a=(curve.angle??0)+direction*(u-.5)*width/curve.radiusX
      const normal=new THREE.Vector2(Math.sin(a)/curve.radiusX,Math.cos(a)/curve.radiusZ).normalize().multiplyScalar(direction)
      p.push(Math.sin(a)*curve.radiusX+normal.x*curve.offset,y,Math.cos(a)*curve.radiusZ+normal.y*curve.offset)
    } else p.push((u-.5)*width,y,0)
    uv.push(u,row)
    if(i<steps&&row===0){const k=i*2;ids.push(k,k+2,k+1,k+1,k+2,k+3)}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ids);g.computeVertexNormals();return g
}

/** Thin brass inlay on the wooden annulus, so the tabletop overhang cannot hide the coordinator's name. */
export function plaqueTopFace(width:number,depth:number,radius:number,angle:number) {
  const g=plaqueFace(width,depth,{radiusX:radius,radiusZ:radius,angle,inward:true,offset:0}),p=g.getAttribute('position')
  for(let i=0;i<p.count;i++) {
    const r=Math.hypot(p.getX(i),p.getZ(i)),scale=(r+p.getY(i))/r
    p.setXYZ(i,p.getX(i)*scale,0,p.getZ(i)*scale)
  }
  g.computeVertexNormals();return g
}

export function plaqueBacking(width:number,height:number,curve?:PlaqueCurve) {
  if(!curve){const g=new THREE.BoxGeometry(width+.065,height+.04,.034);g.translate(0,0,-.020);return g}
  // Join matching front and rear strips; the wooden support follows the same arc as the inscription.
  const front=plaqueFace(width+.065,height+.04,{...curve,offset:curve.offset-.005})
  const back=plaqueFace(width+.065,height+.04,{...curve,offset:curve.offset-.036})
  const f=front.getAttribute('position'),b=back.getAttribute('position'),p:number[]=[],uv:number[]=[],ids:number[]=[]
  const add=(a:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3,e:THREE.Vector3)=>{
    const k=p.length/3;for(const v of [a,c,d,e])p.push(v.x,v.y,v.z);uv.push(0,0,1,0,0,1,1,1);ids.push(k,k+1,k+2,k+1,k+3,k+2)
  }
  const v=(a:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,i:number)=>new THREE.Vector3().fromBufferAttribute(a,i)
  for(let i=0;i<f.count-2;i+=2) {
    add(v(f,i),v(f,i+2),v(f,i+1),v(f,i+3))
    add(v(b,i+2),v(b,i),v(b,i+3),v(b,i+1))
    add(v(b,i),v(b,i+2),v(f,i),v(f,i+2))
    add(v(f,i+1),v(f,i+3),v(b,i+1),v(b,i+3))
  }
  add(v(b,0),v(f,0),v(b,1),v(f,1));const last=f.count-2;add(v(f,last),v(b,last),v(f,last+1),v(b,last+1))
  front.dispose();back.dispose()
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ids);g.computeVertexNormals();return g
}
