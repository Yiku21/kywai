import * as THREE from 'three'

/** Camera-centred and closed below as well: no visible edge when panning, tilting or zooming. */
export const HOME_SKY_RADIUS=300
export function homeSkyGeometry(){
  const segments=96,rings=64,geometry=new THREE.SphereGeometry(HOME_SKY_RADIUS,segments,rings)
  const positions=geometry.getAttribute('position')
  // Close the duplicated longitude vertices exactly, including floating-point sin(2π) residue.
  for(let ring=0;ring<=rings;ring++){
    const first=ring*(segments+1),last=first+segments
    positions.setXYZ(last,positions.getX(first),positions.getY(first),positions.getZ(first))
  }
  return geometry
}
