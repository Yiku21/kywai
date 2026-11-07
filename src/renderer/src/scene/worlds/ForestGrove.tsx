import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { forestHeight, forestRandom, type ForestTree } from './forestLayout'
import { barkTexture } from './forestTextures'

const noRaycast = () => {}
const foliageColors = ['#346044', '#426d49', '#628544', '#80964d', '#a2a254'].map(color => new THREE.Color(color))
const heartGold = new THREE.Color('#b6a653')

function treeMeshes(trees: ForestTree[], detailed: boolean, centerpiece: boolean) {
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = []
  const leafGeometry = new THREE.BufferGeometry()
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, -.51, 0, -.21, -.26, .02, -.30, .04, -.01, -.17, .31, -.04,
    0, .56, -.11, .17, .31, -.04, .30, .04, -.01, .21, -.26, .02, 0, .02, .11
  ], 3))
  leafGeometry.setIndex(Array.from({ length: 8 }, (_, i) => [8, i, (i + 1) % 8]).flat())
  leafGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    .5, 0, .18, .25, 0, .51, .23, .76, .5, 1, .77, .76, 1, .51, .82, .25, .5, .51
  ], 2))
  leafGeometry.computeVertexNormals()
  const wind = { value: 0 }
  const leafMaterial = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.86, emissive: '#273a1b', emissiveIntensity: 0.24 })
  leafMaterial.onBeforeCompile = shader => {
    shader.uniforms.forestWind = wind
    shader.vertexShader = `uniform float forestWind;\nvarying vec2 forestLeafUv;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        forestLeafUv = uv;
        float phase = dot(instanceMatrix[3].xz, vec2(.21, .34));
        transformed.z += sin(forestWind + phase) * .105 * position.y;
        transformed.x += sin(forestWind * .71 + phase) * .052 * position.y;`)
    shader.fragmentShader = `varying vec2 forestLeafUv;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
        float vein = 1.0 - smoothstep(.014, .041, abs(forestLeafUv.x - .5));
        diffuseColor.rgb *= .72 + .24 * forestLeafUv.y + .20 * vein;`)
  }
  leafMaterial.customProgramCacheKey = () => 'enchanted-forest-leaves'
  const leavesPerCluster = (tree: ForestTree) => centerpiece ? 100 : tree.fine ? (detailed ? 78 : 55) : detailed ? 37 : 27
  const limbCount = (tree: ForestTree) => tree.fine ? 7 : 5
  const capacity = trees.reduce((total, tree) => total + (limbCount(tree) * 3 + 1) * leavesPerCluster(tree), 0)
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, capacity)
  const dummy = new THREE.Object3D(), leafColor = new THREE.Color(), barkColor = new THREE.Color()
  const point = new THREE.Vector3()
  let leafCount = 0

  for (const tree of trees) {
    const { x, z, height, fine } = tree
    const random = forestRandom(tree.seed)
    const base = centerpiece ? 0.19 : forestHeight(x, z)
    const radius = height * (centerpiece ? 0.092 : fine ? 0.073 : 0.039 + random() * 0.016)
    const phase = random() * Math.PI * 2
    const lean = height * (0.03 + random() * 0.075)
    const trunk = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, base - 0.21, z),
      new THREE.Vector3(x + Math.sin(phase) * lean * 0.38, base + height * .27, z + Math.cos(phase) * lean * .44),
      new THREE.Vector3(x + Math.sin(phase + 1.2) * lean, base + height * .65, z + Math.cos(phase + 1.2) * lean),
      new THREE.Vector3(x + Math.sin(phase + .5) * lean, base + height * .96, z + Math.cos(phase + .5) * lean)
    ])

    const limb = (curve: THREE.CatmullRomCurve3, start: number, end: number, segments: number, sides: number, flare = false) => {
      const frames = curve.computeFrenetFrames(segments, false)
      const offset = positions.length / 3, length = curve.getLength()
      const wrap = Math.max(1, Math.round(start * 2.8)), textureOffset = random()
      for (let i = 0; i <= segments; i++) {
        const t = i / segments, p = curve.getPointAt(t)
        const taper = THREE.MathUtils.lerp(start, end, t ** .74)
        for (let j = 0; j <= sides; j++) {
          const a = j / sides * Math.PI * 2
          const relief = 1 + .085 * Math.sin(a * 5 + t * 5) + (flare ? Math.exp(-t * 16) * (.5 + .33 * Math.cos(a * 5 + phase)) : 0)
          point.copy(p).addScaledVector(frames.normals[i], Math.cos(a) * taper * relief).addScaledVector(frames.binormals[i], Math.sin(a) * taper * relief)
          positions.push(point.x, point.y, point.z)
          uvs.push(j / sides * wrap, textureOffset + t * length * .43)
          const moss = Math.max(0, 1 - (p.y - base) * .48) * (.42 + .28 * Math.sin(a * 3 + phase))
          barkColor.setRGB(0.84 - moss * .29, 0.79 + moss * .09, 0.72 - moss * .32)
          colors.push(barkColor.r, barkColor.g, barkColor.b)
          if (i < segments && j < sides) {
            const vertex = offset + i * (sides + 1) + j
            indices.push(vertex, vertex + 1, vertex + sides + 1, vertex + 1, vertex + sides + 2, vertex + sides + 1)
          }
        }
      }
    }

    const crown = (center: THREE.Vector3, extent: number, hue: number) => {
      for (let i = 0; i < leavesPerCluster(tree); i++) {
        const a = random() * Math.PI * 2, y = random() * 2 - 1
        const r = Math.cbrt(random()) * extent, flat = Math.sqrt(1 - y * y)
        dummy.position.set(center.x + Math.sin(a) * r * flat, center.y + y * r * .52, center.z + Math.cos(a) * r * flat)
        dummy.rotation.set(Math.PI * (.31 + random() * .34), a, (random() - .5) * 1.5)
        const size = height * (centerpiece ? .046 : .036) * (.58 + random() * .9)
        dummy.scale.set(size, size * (1.0 + random() * .62), size)
        dummy.updateMatrix()
        leaves.setMatrixAt(leafCount, dummy.matrix)
        const colorIndex = Math.min(4, Math.floor(random() ** 1.28 * 4.3 + hue))
        leafColor.copy(foliageColors[colorIndex])
        if (centerpiece) leafColor.lerp(heartGold, .29)
        leafColor.multiplyScalar(.69 + random() * .60 + y * .09)
        leaves.setColorAt(leafCount++, leafColor)
      }
    }

    limb(trunk, radius, radius * .06, fine ? 23 : 13, fine ? 15 : 8, true)
    for (let j = 0; j < (fine ? 6 : 3); j++) {
      const a = phase + j * 2.39996, length = radius * (1.7 + random() * 2.3)
      const endX = x + Math.sin(a) * length, endZ = z + Math.cos(a) * length
      const endY = centerpiece ? base - .02 : forestHeight(endX, endZ) - .035
      const root = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x + Math.sin(a) * radius * .46, base + radius * .86, z + Math.cos(a) * radius * .46),
        new THREE.Vector3(x + Math.sin(a + .12) * length * .46, base + radius * .12, z + Math.cos(a + .12) * length * .46),
        new THREE.Vector3(endX, endY, endZ)
      ])
      limb(root, radius * .49, radius * .046, fine ? 9 : 5, fine ? 9 : 5)
    }
    for (let j = 0; j < limbCount(tree); j++) {
      const a = phase + j * 2.39996
      const start = trunk.getPointAt(.35 + j * .055 + random() * .09)
      const reach = height * ((fine ? .19 : .14) + random() * .10)
      const rise = height * (.17 + random() * .11)
      const branch = new THREE.CatmullRomCurve3([
        start, new THREE.Vector3(start.x + Math.sin(a) * reach * .46, start.y + rise * .30, start.z + Math.cos(a) * reach * .46),
        new THREE.Vector3(start.x + Math.sin(a + .16) * reach, start.y + rise, start.z + Math.cos(a + .16) * reach)
      ])
      limb(branch, radius * (.46 - j * .026), radius * .055, fine ? 11 : 6, fine ? 9 : 6)
      for (const side of [-1, 0, 1]) {
        const fork = branch.getPointAt(side === 0 ? .85 : .53 + random() * .19)
        const direction = a + side * (.53 + random() * .21), extension = reach * (.26 + random() * .46)
        const tip = new THREE.Vector3(fork.x + Math.sin(direction) * extension, fork.y + rise * (.39 + random() * .35), fork.z + Math.cos(direction) * extension)
        const curve = new THREE.CatmullRomCurve3([fork, fork.clone().lerp(tip, .52).add(new THREE.Vector3(0, -.09, 0)), tip])
        limb(curve, radius * .16, radius * .018, 5, 5)
        crown(tip, height * (fine ? .119 : .10), .25 + j * .07)
      }
    }
    crown(trunk.getPointAt(1), height * .15, .75)
  }

  const barkGeometry = new THREE.BufferGeometry()
  barkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  barkGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  barkGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  barkGeometry.setIndex(indices)
  barkGeometry.computeVertexNormals()
  const bark = barkTexture()
  const barkMaterial = new THREE.MeshStandardMaterial({ map: bark, bumpMap: bark, bumpScale: .095, vertexColors: true, roughness: .94, side: THREE.DoubleSide })
  leaves.count = leafCount
  leaves.instanceMatrix.needsUpdate = true
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true
  leaves.computeBoundingSphere()
  leaves.raycast = noRaycast
  leaves.castShadow = centerpiece || detailed
  leaves.receiveShadow = true
  return { leaves, wind, bark, barkGeometry, barkMaterial }
}

export function ForestGrove({ trees, detailed, reduced, centerpiece = false }: { trees: ForestTree[]; detailed: boolean; reduced: boolean; centerpiece?: boolean }) {
  const grove = useMemo(() => treeMeshes(trees, detailed, centerpiece), [trees, detailed, centerpiece])
  useFrame((_, dt) => { if (!reduced) grove.wind.value += Math.min(dt, .1) * .85 })
  useEffect(() => () => {
    grove.bark.dispose(); grove.barkGeometry.dispose(); grove.barkMaterial.dispose()
    grove.leaves.geometry.dispose(); (grove.leaves.material as THREE.Material).dispose(); grove.leaves.dispose()
  }, [grove])
  return <group>
    <mesh geometry={grove.barkGeometry} material={grove.barkMaterial} castShadow receiveShadow raycast={centerpiece ? undefined : noRaycast} />
    <primitive object={grove.leaves} />
  </group>
}
