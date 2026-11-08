import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { forestRandom } from './forestLayout'

/** Individual needle sprays give the snowy treeline an irregular, layered silhouette. */
export function WinterConifers({ detailed }: { detailed: boolean }) {
  const resources = useMemo(() => {
    const random = forestRandom(5821), canvas = document.createElement('canvas')
    canvas.width = 512; canvas.height = 1024
    const ctx = canvas.getContext('2d')!
    ctx.lineCap = 'round'
    ctx.fillStyle = '#345b54'; ctx.beginPath(); ctx.moveTo(256, 1010)
    for (let j = 0; j <= 64; j++) { const t = j / 64; ctx.lineTo(256 - Math.sin(t * Math.PI) ** .7 * (184 + j % 3 * 17), 990 - t * 940) }
    for (let j = 64; j >= 0; j--) { const t = j / 64; ctx.lineTo(256 + Math.sin(t * Math.PI) ** .7 * (184 + j % 3 * 17), 990 - t * 940) }
    ctx.closePath(); ctx.fill()
    for (let side = -1; side <= 1; side += 2) for (let j = 0; j < 85; j++) {
      const t = j / 85, y = 990 - t * 940, reach = Math.sin(t * Math.PI) ** .7 * 230
      for (let k = 0; k < 5; k++) {
        const x = 256 + side * reach * k / 5, yy = y - k * 18
        ctx.strokeStyle = ['#3b6561', '#284b47', '#527972'][j % 3]; ctx.lineWidth = 3 + random() * 3
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + side * (18 + random() * 18), yy - 36 - random() * 20); ctx.stroke()
      }
      if (j % 4 !== 0) {
        ctx.strokeStyle = j % 3 ? '#cfdee3' : '#e2e9e8'; ctx.lineWidth = 14 + random() * 18
        ctx.beginPath(); ctx.moveTo(254, y - 5); ctx.quadraticCurveTo(256 + side * reach * .45, y - 35, 256 + side * reach * .78, y - 55); ctx.stroke()
      }
    }
    ctx.strokeStyle = '#6b6a5d'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(256, 1010); ctx.lineTo(256, 30); ctx.stroke()
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8
    const geo = new THREE.PlaneGeometry(1, 1, 6, 16), p = geo.getAttribute('position')
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -.09 * Math.sin((y + .5) * Math.PI) - .12 * Math.abs(p.getX(i))) }
    geo.computeVertexNormals()
    const material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: .25, side: THREE.DoubleSide, roughness: .97, color: '#c1d1d7' })
    const count = detailed ? 60 : 30, branches = new THREE.InstancedMesh(geo, material, count * 80)
    const dummy = new THREE.Object3D(), trunks: { at: [number, number, number]; h: number; r: number }[] = []
    let index = 0
    for (let i = 0; i < count; i++) {
      const x = (random() - .5) * 85, z = -28 - random() * 28, h = 4.5 + random() * 6.3
      trunks.push({ at: [x, h * .45, z], h: h * .9, r: h * .025 })
      for (let tier = 0; tier < 10; tier++) for (let arm = 0; arm < 8; arm++) {
        const a = arm * Math.PI / 4 + tier * 1.7 + i + random() * .2, t = tier / 10, length = h * .38 * (1 - t * .89), dy = h * (.17 + t * .78 + random() * .035)
        dummy.position.set(x + Math.sin(a) * length * .43, dy - length * .12, z + Math.cos(a) * length * .43)
        dummy.rotation.set(-Math.PI / 2 - .15 - random() * .17, 0, -a)
        dummy.scale.set(length * .9, length * 1.35, length)
        dummy.updateMatrix(); branches.setMatrixAt(index++, dummy.matrix)
      }
    }
    branches.count = index; branches.instanceMatrix.needsUpdate = true; branches.computeBoundingSphere(); branches.raycast = () => {}; branches.receiveShadow = true
    const trunkGeo = new THREE.CylinderGeometry(.5, 1, 1, 10), trunkMat = new THREE.MeshStandardMaterial({ color: '#505553', roughness: 1 })
    const stems = new THREE.InstancedMesh(trunkGeo, trunkMat, trunks.length)
    trunks.forEach((t, i) => { dummy.position.set(...t.at); dummy.rotation.set(0, 0, 0); dummy.scale.set(t.r, t.h, t.r); dummy.updateMatrix(); stems.setMatrixAt(i, dummy.matrix) })
    stems.instanceMatrix.needsUpdate = true; stems.computeBoundingSphere(); stems.raycast = () => {}
    return { branches, stems, texture, geo, material, trunkGeo, trunkMat }
  }, [detailed])
  useEffect(() => () => { resources.branches.dispose(); resources.stems.dispose(); resources.texture.dispose(); resources.geo.dispose(); resources.material.dispose(); resources.trunkGeo.dispose(); resources.trunkMat.dispose() }, [resources])
  return <group><primitive object={resources.branches} /><primitive object={resources.stems} /></group>
}
