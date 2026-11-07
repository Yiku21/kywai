import { useMemo, useEffect } from 'react'
import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import { forestClear, forestHeight, forestRandom } from './forestLayout'
import { forestSoilTexture } from './forestTextures'

function Soil({ stations }: { stations: StationConfig[] }) {
  const ground = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(155, 154, 178, 174)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, 0, -21)
    const position = geometry.attributes.position, uv = geometry.attributes.uv
    const colors: number[] = []
    const earth = new THREE.Color('#c5b3a1'), moss = new THREE.Color('#90a464'), color = new THREE.Color()
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i)
      position.setY(i, forestHeight(x, z))
      uv.setXY(i, x * .34, z * .34)
      const blend = .5 + .29 * Math.sin(x * .56 + Math.sin(z * .82)) + .18 * Math.cos(z * .77 - x * .32)
      const clearing = forestClear(x, z, stations) ? blend : blend * .24
      color.copy(earth).lerp(moss, clearing).multiplyScalar(.9 + Math.sin(x * .2 + z * .33) * .1)
      colors.push(color.r, color.g, color.b)
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    const map = forestSoilTexture()
    return { geometry, map }
  }, [stations])
  useEffect(() => () => { ground.geometry.dispose(); ground.map.dispose() }, [ground])
  return <mesh geometry={ground.geometry} receiveShadow raycast={() => {}}>
    <meshStandardMaterial map={ground.map} bumpMap={ground.map} bumpScale={.045} vertexColors roughness={.97} />
  </mesh>
}

function Ferns({ stations, detail }: { stations: StationConfig[]; detail: boolean }) {
  const ferns = useMemo(() => {
    const vertices: number[] = [], colors: number[] = [], indices: number[] = []
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7, length = .75 + i % 3 * .13
      const plant = (along: number, lateral: number, lift = 0) => [
        Math.cos(angle) * along * length - Math.sin(angle) * lateral,
        Math.sin(along * 2.17) * .49 + lift,
        Math.sin(angle) * along * length + Math.cos(angle) * lateral
      ]
      for (let j = 0; j < 13; j++) for (const side of [-1, 1]) {
        const at = .09 + j * .063, reach = (Math.sin(Math.PI * at) * .19 + .012) * side
        const index = vertices.length / 3
        vertices.push(...plant(at - .025, 0), ...plant(at + .028, 0), ...plant(at + .047, reach * .65, .023), ...plant(at + .094, reach, .018), ...plant(at + .045, reach * .44, .048))
        indices.push(index, index + 1, index + 4, index + 1, index + 2, index + 4, index + 2, index + 3, index + 4)
        colors.push(.38,.47,.27, .54,.64,.32, .77,.85,.57, .60,.73,.42, .76,.89,.48)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices); geometry.computeVertexNormals()
    const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .88, vertexColors: true, emissive: '#34481e', emissiveIntensity: .16 })
    const random = forestRandom(199), count = detail ? 450 : 215
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    const dummy = new THREE.Object3D(), color = new THREE.Color()
    let used = 0
    for (let i = 0; i < count * 3 && used < count; i++) {
      const foreground = i % 4 === 0
      const x = (random() - .5) * (foreground ? 31 : 64)
      const z = foreground ? 12 + random() * 21 : 16 - random() * 52
      if (!forestClear(x, z, stations, .63) || Math.sin(x * .8 + z * .7) + Math.cos(z * .63 - x * .27) < -.31) continue
      dummy.position.set(x, forestHeight(x, z), z)
      dummy.rotation.set(0, random() * Math.PI * 2, 0)
      dummy.scale.setScalar(.43 + random() * 1.1); dummy.updateMatrix()
      mesh.setMatrixAt(used, dummy.matrix)
      color.setHSL(.19 + random() * .09, .29 + random() * .22, .47 + random() * .23)
      mesh.setColorAt(used++, color)
    }
    mesh.count = used
    mesh.receiveShadow = true
    mesh.raycast = () => {}
    mesh.computeBoundingSphere()
    return mesh
  }, [detail, stations])
  useEffect(() => () => { ferns.geometry.dispose(); (ferns.material as THREE.Material).dispose(); ferns.dispose() }, [ferns])
  return <primitive object={ferns} />
}

/** Fine grass cover leaves clear routes between the project and each station. */
export function ForestFloor({ stations, detail }: { stations: StationConfig[]; detail: boolean }) {
  const grass = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.035, 0, 0, 0.035, 0, 0, -0.024, 0.44, 0.04, 0.024, 0.44, 0.04, -0.01, 0.8, 0.13, 0.01, 0.8, 0.13, 0, 1, 0.22
    ], 3))
    geometry.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6])
    geometry.setAttribute('color', new THREE.Float32BufferAttribute([
      0.3,0.4,0.24, 0.3,0.4,0.24, 0.6,0.72,0.38, 0.6,0.72,0.38, 0.8,0.9,0.55, 0.8,0.9,0.55, 0.9,1,0.7
    ], 3))
    geometry.computeVertexNormals()
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.93, color: '#a2a980' })
    const count = detail ? 44000 : 19000, mesh = new THREE.InstancedMesh(geometry, material, count)
    let used = 0
    const random = forestRandom(27)
    const dummy = new THREE.Object3D(), color = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const x = random() * 46 - 23, z = random() * 62 - 33
      if (!forestClear(x, z, stations)) continue
      const growth = .5 + .23 * Math.sin(x * .64 + z * .85) + .24 * Math.cos(z * 1.17 - x * .42)
      if (random() > growth) continue
      const h = .075 + random() * (.16 + growth * .14)
      dummy.position.set(x, forestHeight(x, z) - .009, z); dummy.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.68)
      dummy.scale.set(0.6 + random() * 0.9, h, h); dummy.updateMatrix()
      mesh.setMatrixAt(used, dummy.matrix)
      color.setHSL(0.14 + random() * 0.14, 0.23 + random() * 0.28, 0.36 + random() * 0.28)
      mesh.setColorAt(used++, color)
    }
    mesh.count = used; mesh.receiveShadow = true
    mesh.raycast = () => {}
    mesh.computeBoundingSphere()
    return mesh
  }, [stations, detail])
  useEffect(() => () => { grass.geometry.dispose(); (grass.material as THREE.Material).dispose(); grass.dispose() }, [grass])
  return <><Soil stations={stations} /><Ferns stations={stations} detail={detail} /><primitive object={grass} /></>
}
