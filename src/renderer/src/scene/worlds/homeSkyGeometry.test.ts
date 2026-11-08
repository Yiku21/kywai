import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { homeSkyGeometry, HOME_SKY_RADIUS } from './homeSkyGeometry'

describe('Kywai panoramic sky dome',()=>{
  it('surrounds the camera in every direction, including at the panorama seam and the poles',()=>{
    const geometry=homeSkyGeometry(),material=new THREE.MeshBasicMaterial({side:THREE.BackSide}),mesh=new THREE.Mesh(geometry,material)
    const ray=new THREE.Raycaster(),direction=new THREE.Vector3()
    ray.near=.5;ray.far=420
    for(const origin of [new THREE.Vector3(0,11.2,32.5),new THREE.Vector3(36,25,-18)]) {
      mesh.position.copy(origin);mesh.updateMatrixWorld(true)
      for(let angle=0;angle<360;angle+=15) for(const height of [-89,-45,0,45,89]) {
        const a=angle*Math.PI/180,h=height*Math.PI/180
        direction.set(Math.sin(a)*Math.cos(h),Math.sin(h),Math.cos(a)*Math.cos(h))
        ray.set(origin,direction)
        const hits=ray.intersectObject(mesh,false)
        expect(hits.length).toBeGreaterThan(0)
        expect(hits[0].distance).toBeGreaterThan(HOME_SKY_RADIUS-2)
        expect(hits[0].distance).toBeLessThan(HOME_SKY_RADIUS+1)
      }
    }
    geometry.dispose();material.dispose()
  })
})
