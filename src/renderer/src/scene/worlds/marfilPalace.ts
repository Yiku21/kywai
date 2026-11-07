import type { StationConfig } from '@shared/types'
import type { Model } from './models'
import { forestRandom } from './forestLayout'

const ivory = '#eee5d2'
const limestone = '#d6c7aa'
const shade = '#b9a789'
const bronze = '#b39658'
const bark = '#716048'
const leaves = ['#4e6d42', '#718b53', '#93a269']

export const palaceCourt = { width: 21.06, depth: 28.8, z: -1.9 }
export const palaceCanal = { x: 11.73, width: 2.23, depth: 28.8, z: -1.9, y: -.005 }
export const palaceFountains = [-10.4, -2.9, 6.6]

function column(m: Model, x: number, z: number, height: number, base = 0, radius = .27, detailed = true) {
  m.box([x, base + .112, z], [radius * 3.5, .224, radius * 3.5], limestone)
  m.add('cylinder', [x, base + .255, z], [radius * 1.42, .13, radius * 1.42], ivory)
  m.add('cylinder', [x, base + (height + .17) / 2, z], [radius, height - .49, radius], ivory)
  const flutes = detailed ? 18 : 12
  for (let i = 0; i < flutes; i++) {
    const angle = i * Math.PI * 2 / flutes
    const offset = radius * .97
    m.add('cylinder', [x + Math.sin(angle) * offset, base + height / 2 + .025, z + Math.cos(angle) * offset],
      [radius * .12, height - .81, radius * .12], '#e0d3b8')
  }
  for (const [y, ratio, thickness] of [[height - .36, 1.19, .10], [height - .23, 1.39, .16], [height - .07, 1.72, .15]]) {
    m.add('cylinder', [x, base + y, z], [radius * ratio, thickness, radius * ratio], ivory)
  }
  m.ring([x, base + height - .385, z], radius * 1.15, bronze, undefined, 0)
  m.box([x, base + height - .048, z], [radius * 3.65, .115, radius * 3.4], limestone)
  for (const side of [-1, 1]) {
    const sx = x + side * radius * 1.18, front = z + radius * 1.3
    m.add('cylinder', [sx, base + height - .19, front], [radius * .39, .135, radius * .39], ivory, 0, [Math.PI / 2, 0, 0])
    m.ring([sx, base + height - .19, front + .076], radius * .30, bronze, [0, 0, 0], 0)
  }
}

function arcadeBay(m: Model, x: number, z: number, detailed: boolean) {
  const radius = 2.48, spring = 3.54
  for (const side of [-1, 1]) column(m, x + side * radius, z, spring, 0, .29, detailed)
  m.add('arch', [x, spring, z], [radius, radius, 2.24], limestone)
  m.add('arch', [x, spring, z + .372], [radius * 1.017, radius * 1.017, .27], ivory)
  m.add('arch', [x, spring, z + .415], [radius * .94, radius * .94, .10], '#cfbd97')
  for (let i = 0; i < 15; i++) {
    const angle = Math.PI * (i + .5) / 15
    const radial = radius * .953
    m.box([x + Math.cos(angle) * radial, spring + Math.sin(angle) * radial, z + .465],
      [i === 7 ? .38 : .27, i === 7 ? .37 : .26, .16], i === 7 ? '#f7eedb' : i % 2 ? ivory : '#e6d9bf', 0, [0, 0, angle - Math.PI / 2])
  }
  m.add('sphere', [x, spring + radius * .965, z + .554], [.071, .09, .045], bronze)
}

function canopy(m: Model, x: number, y: number, z: number, rx: number, ry: number, rz: number, count: number, seed: number) {
  const random = forestRandom(seed)
  for (let i = 0; i < count; i++) {
    const v = random() * 2 - 1, angle = random() * Math.PI * 2
    const radius = Math.cbrt(random()), ring = Math.sqrt(1 - v * v) * radius
    const size = .105 + random() * .18
    m.add('leaf', [x + Math.cos(angle) * ring * rx, y + v * radius * ry, z + Math.sin(angle) * ring * rz],
      [size * .68, size * 1.31, size * .51], leaves[Math.floor(random() * leaves.length)], 0,
      [.48 + random() * 1.45, angle, (random() - .5) * 1.8])
  }
}

function planter(m: Model, x: number, z: number, h: number, seed: number, tall: boolean, detail: boolean) {
  m.add('cylinder', [x, .10, z], [.65, .2, .65], shade)
  m.add('cone', [x, .39, z], [.62, .56, .62], limestone, 0, [0, 0, Math.PI])
  m.add('cylinder', [x, .671, z], [.69, .135, .69], ivory)
  m.add('cylinder', [x, .748, z], [.575, .041, .575], '#66764b')
  m.ring([x, .725, z], .654, bronze, undefined, 0)
  m.beam([x, .73, z], [x + .09, 1.22 + h * .39, z - .05], tall ? .1 : .14, bark)
  if (tall) {
    for (let i = 0; i < 6; i++) {
      const y = 1.0 + h * (.14 + i * .139), r = .58 - i * .072
      canopy(m, x + Math.sin(i * .53 + seed) * .075, y, z, r, h * .19, r, detail ? 95 : 53, seed + i)
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.39996 + seed, radius = .39 + i % 3 * .16
      const endX = x + Math.cos(angle) * radius, endZ = z + Math.sin(angle) * radius
      const y = 1.45 + h * (.37 + i % 3 * .107)
      m.beam([x + .035, 1.13, z], [endX, y, endZ], .059, bark)
      canopy(m, endX, y, endZ, .7, .43, .65, detail ? 92 : 61, seed + i)
    }
  }
}

function balustrade(m: Model, x: number, z: number, length: number) {
  for (const y of [.11, .71]) m.box([x, y, z], [.25, .115, length], limestone)
  for (let offset = -length / 2 + .24; offset < length / 2; offset += .42) {
    m.add('cylinder', [x, .41, z + offset], [.073, .50, .073], ivory)
    m.add('sphere', [x, .385, z + offset], [.11, .139, .11], ivory)
  }
}

export function addMarfilPalace(m: Model, stations: StationConfig[], detail: boolean) {
  const free = (x: number, z: number, r: number) => !stations.some(st => Math.hypot(st.position[0] - x, st.position[1] - z) < r)
  const { width, depth, z } = palaceCourt
  m.box([0, -.89, z - .5], [34.6, .8, depth + .5], shade)
  m.box([0, -.463, z], [34.32, .26, depth + .14], limestone)
  m.box([0, -.201, z], [width, .31, depth], ivory)
  for (const side of [-1, 1]) {
    m.box([side * 15.05, -.18, z], [4.42, .32, depth], ivory)
    m.box([side * palaceCanal.x, -.285, palaceCanal.z], [palaceCanal.width, .13, palaceCanal.depth], '#74a6a1')
    for (const edge of [-1, 1]) {
      const x = side * palaceCanal.x + edge * (palaceCanal.width / 2 + .11)
      m.box([x, .07, palaceCanal.z], [.22, .25, palaceCanal.depth + .24], limestone)
      m.box([x, .205, palaceCanal.z], [.10, .04, palaceCanal.depth + .19], ivory)
      m.box([x + edge * .06, .147, palaceCanal.z], [.018, .025, palaceCanal.depth - .2], bronze)
    }
    for (const bridgeZ of [-6.7, 3.35, 9.2]) {
      m.box([side * palaceCanal.x, .241, bridgeZ], [2.76, .165, 1.62], ivory)
      for (const edge of [-1, 1]) m.box([side * palaceCanal.x, .387, bridgeZ + edge * .75], [2.78, .15, .12], limestone)
      for (const edge of [-1, 1]) m.box([side * palaceCanal.x + edge * 1.48, .09, bridgeZ], [.33, .18, 1.66], limestone)
    }
    balustrade(m, side * 17.15, -12.19, 1.92)
    balustrade(m, side * 17.15, 1.19, 20.32)
    for (const [i, gardenZ] of [-12.8, -8.5, -4.85, -.7, 3.9, 7.4, 10.95].entries()) {
      const x = side * (i % 2 ? 15.72 : 14.68)
      if (free(x, gardenZ, 2)) planter(m, x, gardenZ, 1.94 + i % 3 * .29, i + (side > 0 ? 55 : 3), i % 2 === 0, detail)
    }
    for (let i = 0; i < 7; i++) {
      const bedZ = -12.4 + i * 3.68
      m.box([side * 16.22, .12, bedZ], [1.29, .31, 2.49], limestone)
      m.box([side * 16.22, .276, bedZ], [1.12, .035, 2.24], '#6c784a')
      for (let patch = 0; patch < 5; patch++) {
        const bz = bedZ - .85 + patch * .425
        canopy(m, side * (16.2 + (patch % 2 - .5) * .31), .48, bz, .42, .22, .36, detail ? 35 : 23, 41 + i * 31 + patch * 7)
        for (let bloom = 0; bloom < 3; bloom++) {
          const angle = bloom * 2.39 + patch
          m.add('sphere', [side * 16.2 + Math.sin(angle) * .36, .63 + (bloom % 2) * .13, bz + Math.cos(angle) * .23], [.089, .055, .079],
            i % 3 === 0 ? '#b5768e' : i % 3 === 1 ? '#e6cb96' : '#a79ac0')
        }
      }
    }
    for (const fountainZ of palaceFountains) {
      const x = side * (palaceCanal.x + .77)
      m.add('cylinder', [x, .105, fountainZ], [.23, .21, .23], limestone)
      m.add('cylinder', [x, .275, fountainZ], [.105, .22, .105], ivory)
      m.add('dome', [x, .401, fountainZ], [.28, .16, .28], ivory, 0, [0, 0, Math.PI])
      m.ring([x, .413, fountainZ], .267, bronze, undefined, 0)
    }
    // Planted wings extend beyond the balustrade on either side of the court.
    const wingX = side * 20.72, wingZ = -11.45
    m.box([wingX, -.56, wingZ], [6.3, .64, 12.45], shade)
    m.box([wingX, -.143, wingZ], [6.06, .23, 12.19], ivory)
    m.box([side * 17.79, .012, -10.1], [2.45, .17, 2.12], limestone)
    for (const pathSide of [-1, 1]) {
      m.box([side * 17.79, .136, -10.1 + pathSide * .96], [2.43, .094, .09], ivory)
    }
    for (const [i, gz] of [-15.7, -12.18, -8.35].entries()) {
      const gx = wingX + side * (i % 2 ? 1.13 : -.79)
      if (free(gx, gz, 2.1)) planter(m, gx, gz, 2.95 + i % 2 * .22, 340 + i + side * 17, i === 1, detail)
    }
    for (const end of [-1, 1]) {
      const bedZ = wingZ + end * 4.94
      m.box([wingX, .141, bedZ], [4.89, .32, 1.38], limestone)
      m.box([wingX, .308, bedZ], [4.63, .04, 1.14], '#66764b')
      for (let j = 0; j < 9; j++) {
        const px = wingX - 2.03 + j * .51
        canopy(m, px, .59, bedZ, .36, .29, .42, detail ? 42 : 27, 902 + j * 29 + end)
        m.add('sphere', [px, .793, bedZ + Math.sin(j * 2.9) * .3], [.093, .079, .088], j % 2 ? '#b5768e' : '#e6cb96')
      }
    }
    balustrade(m, wingX + side * 2.9, wingZ, 11.6)
  }
  const galleryZ = -13.65
  for (let i = -2; i <= 2; i++) {
    const x = i * 5.48
    if (!free(x - 2.48, galleryZ, 1.6) || !free(x + 2.48, galleryZ, 1.6)) continue
    arcadeBay(m, x, galleryZ, detail)
    if (i !== 0) for (let patch = 0; patch < 7; patch++) {
      const side = i < 0 ? -1 : 1
      canopy(m, x + side * (2.39 - .031 * patch), 5.85 - patch * .42, galleryZ + .44, .27, .42, .23,
        detail ? 40 : 24, 610 + i * 30 + patch)
    }
  }
  m.box([0, 6.14, galleryZ], [28.2, .28, 1.0], limestone)
  m.box([0, 6.4, galleryZ], [28.45, .23, 1.17], ivory)
  m.box([0, 6.49, galleryZ + .6], [28.12, .039, .057], bronze)
  for (let i = -33; i <= 33; i++) {
    const x = i * .412
    m.box([x, 6.163, galleryZ + .537], [.19, .143, .1], i % 5 === 0 ? bronze : ivory)
  }

  // Higher temple terrace behind the open bays. The stairs are continuous with the court.
  m.box([0, -.51, -22.8], [29.7, .63, 14.4], shade)
  m.box([0, -.075, -21.2], [28.9, .31, 12.2], ivory)
  for (let i = 0; i < 6; i++) m.box([0, .12 + i * .18, -19.1 - i * .55], [11.3, .24, 1.26], limestone)
  m.box([0, .56, -25.1], [12.6, 1.07, 8.28], limestone)
  m.box([0, 1.16, -25.14], [12.17, .24, 7.91], ivory)
  for (const side of [-1, 1]) for (const x of [-5.05, -3.02, -1.02, 1.02, 3.02, 5.05]) {
    column(m, x, -25.65 + side * 2.52, 4.92, 1.28, .31, false)
  }
  m.box([0, 6.36, -25.65], [12.32, .34, 6.15], limestone)
  m.box([0, 6.58, -25.65], [12.6, .13, 6.41], ivory)
  for (const side of [-1, 1]) {
    m.box([side * 3.11, 7.28, -25.65], [6.38, .24, 6.6], ivory, 0, [0, 0, side * -.227])
    m.beam([0, 8.02, -22.32], [side * 6.25, 6.58, -22.32], .14, bronze, 'box')
    for (const [i, x] of [8.4, 11.6, 13.6].entries()) planter(m, side * x, -20.9 - i * 2.18, 2.65, 95 + i + side * 10, i !== 1, detail)
  }
  m.box([0, 6.708, -22.222], [11.7, .051, .045], bronze)
  m.add('sphere', [0, 7.17, -22.215], [.257, .257, .083], bronze)
  m.ring([0, 7.17, -22.128], .327, bronze, [0, 0, 0], 0)
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6
    m.box([Math.sin(angle) * .398, 7.17 + Math.cos(angle) * .398, -22.212], [.043, .103, .038], bronze, 0, [0, 0, -angle])
  }
}
