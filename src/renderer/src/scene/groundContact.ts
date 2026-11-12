import * as THREE from 'three'

/**
 * Altura del punto más bajo de lo que se ve de un modelo, medida en el espacio de `root` (sin su propia posición,
 * giro ni escala). Sirve para apoyar en su plataforma cualquier aspecto de agente sin conocer su forma: no cuenta
 * mallas invisibles ni casi transparentes (llamas de propulsor, halos, zonas para el puntero).
 */
export function lowestPoint(root: THREE.Object3D): number {
  const inv = new THREE.Matrix4()
  root.updateMatrixWorld(true)
  inv.copy(root.matrixWorld).invert()
  const m = new THREE.Matrix4()
  const box = new THREE.Box3()
  const part = new THREE.Box3()
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.SkinnedMesh) return
    let v: THREE.Object3D | null = o
    while (v && v !== root) {
      if (!v.visible) return
      v = v.parent
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (mats.every((mt: THREE.Material) => !mt.visible || (mt.transparent && mt.opacity < 0.3))) return
    const geo = o.geometry as THREE.BufferGeometry
    if (!geo.boundingBox) geo.computeBoundingBox()
    if (!geo.boundingBox) return
    m.multiplyMatrices(inv, o.matrixWorld)
    part.copy(geo.boundingBox).applyMatrix4(m)
    box.union(part)
  })
  return box.isEmpty() ? 0 : box.min.y
}
