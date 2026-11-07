import type { StationConfig } from '@shared/types'
import type { Model, Vec } from './models'

const iron = '#34393e'
const steel = '#6d7477'
const cast = '#25292e'
const bronze = '#a17a4c'
const warning = '#bf8a3d'
const heat = '#ffb25f'

export const pumpCells: Vec[] = [[-8.75, 0, -11.8], [9.4, 0, -12.4]]
export const factoryVents: Vec[] = [[-13.65, 1.62, -4.9], [13.65, 1.62, -3.7], [-12.7, 4.3, -18.9], [12.1, 5.25, -22.1], [-2.7, 6.15, -28.4], [6.2, 6.88, -26.9]]
export const reactorVents: Vec[] = [[-.94, 3.18, -.87], [.94, 3.18, -.87]]
export const conveyor = { front: -13.2, back: -27.15, y: .71 }

export function conveyorClear(stations: StationConfig[]) {
  return !stations.some(st => Math.abs(st.position[0]) < 3.15 && st.position[1] <= conveyor.front + 1.6 && st.position[1] >= conveyor.back - 5.1)
}

export interface PipeRun { points: Vec[]; radius: number; copper?: boolean }
export const factoryPipes: PipeRun[] = [
  { points: [[-15, 1, 8.5], [-15, 1, -11], [-15, 1.33, -16.6], [-15, 4.3, -17.15], [-14, 7.25, -17.25], [-12.7, 7.5, -17.25], [12.7, 7.5, -17.25], [14.9, 7.4, -17.25], [15.35, 6.3, -17.25], [15.35, 1.12, -17.25], [15.35, .91, -14.9], [15.35, .91, 8.5]], radius: .26 },
  { points: [[-16.1, .69, 10.2], [-16.1, .69, -20.4], [-15.7, .72, -22], [-14.6, 1.36, -22.55], [-11.7, 1.36, -22.55], [-9.5, 1.32, -23.7], [-9.15, 2.6, -25.3], [-9.15, 4.8, -25.3]], radius: .18, copper: true },
  { points: [[15.93, .62, 9.5], [15.93, .62, -23.4], [15.7, 1.17, -24.9], [14.65, 1.24, -25.33], [5.9, 1.24, -25.33], [4.9, 1.65, -25.33], [4.7, 3.55, -25.33]], radius: .17, copper: true },
  { points: [[-10.8, 4.46, -22.4], [-10.8, 6.94, -22.4], [-10.25, 7.88, -22.55], [-8.86, 8.05, -22.55], [6.9, 8.05, -22.55], [8.25, 7.76, -22.55], [8.66, 6.74, -22.55], [8.66, 4.5, -22.55]], radius: .31 },
  ...factoryVents.map(([x, y, z]): PipeRun => ({ points: [[x + Math.sign(x) * 1.37, y - 1.1, z], [x + Math.sign(x) * .31, y - 1.06, z], [x, y - .68, z], [x, y, z]], radius: .13 }))
]

export const reactorPipes: PipeRun[] = [-1, 1].flatMap(side => [
  { points: [[side * .94, .67, -.02], [side * 1.44, .7, -.02], [side * 1.55, 1.08, -.08], [side * 1.55, 2.68, -.08], [side * 1.43, 3.15, -.11], [side * .9, 3.18, -.11]] as Vec[], radius: .094, copper: true },
  { points: [[side * .79, 2.68, -.6], [side * .95, 2.78, -.86], [side * .94, 3.18, -.87]] as Vec[], radius: .08 }
])

function valve(m: Model, x: number, y: number, z: number, radius = .18) {
  m.add('cylinder', [x, y, z], [radius * .42, .21, radius * .42], steel, 0, [Math.PI / 2, 0, 0])
  m.ring([x, y, z + .125], radius, '#9d5c44', [0, 0, 0], 0)
  for (let i = 0; i < 4; i++) m.box([x, y, z + .125], [radius * 1.98, .029, .033], '#9d5c44', 0, [0, 0, i * Math.PI / 4])
}

function boiler(m: Model, x: number, z: number, height: number, radius: number) {
  m.add('cylinder', [x, .18, z], [radius * 1.21, .36, radius * 1.21], cast)
  m.add('cylinder', [x, height / 2, z], [radius, height, radius], iron)
  m.add('dome', [x, height, z], [radius, .42, radius], steel)
  for (const y of [.4, 1.17, height - .81, height - .08]) {
    m.add('cylinder', [x, y, z], [radius * 1.045, .119, radius * 1.045], steel)
    m.ring([x, y + .069, z], radius * 1.038, bronze, undefined, 0)
  }
  m.box([x, height * .51, z + radius + .036], [.66, height * .63, .077], cast)
  m.box([x, height * .51, z + radius + .079], [.095, height * .48, .027], heat, .72)
  for (let level = 0; level < 8; level++) m.box([x + .131, height * .29 + level * height * .059, z + radius + .078], [.097, .019, .028], steel)
  for (const side of [-1, 1]) m.box([x + side * .51, .47, z + radius * .86], [.20, .94, .23], steel)
  valve(m, x + radius * .64, height * .43, z + radius * .84, .17)
  m.add('cylinder', [x, height + .53, z], [radius * .27, .27, radius * .27], steel)
}

export function addGrafitoReactor(m: Model) {
  for (const [y, radius, thickness, color] of [[.31, 1.72, .28, cast], [.50, 1.51, .16, steel], [.69, 1.36, .21, iron],
    [.88, 1.25, .17, steel], [2.93, 1.24, .17, steel], [3.12, 1.35, .21, iron], [3.30, 1.29, .12, steel], [3.42, 1.03, .19, cast]] as const) {
    m.add('cylinder', [0, y, 0], [radius, thickness, radius], color)
  }
  for (const y of [.59, .973, 2.83, 3.24]) m.ring([0, y, 0], y === .59 ? 1.48 : y === 3.24 ? 1.31 : 1.18, bronze, undefined, .11)
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10, x = Math.sin(a), z = Math.cos(a)
    for (const y of [.978, 3.373]) m.add('hex', [x * 1.17, y, z * 1.17], [.038, .028, .038], cast)
    m.box([x * 1.53, .385, z * 1.53], [.15, .075, .075], i % 4 === 0 ? warning : steel, 0, [0, a, 0])
  }
  for (const angle of [-2.4, -1.12, 1.12, 2.4]) {
    const x = Math.sin(angle), z = Math.cos(angle)
    m.box([x * 1.21, 1.92, z * 1.21], [.245, 1.96, .29], cast, 0, [0, angle, 0])
    m.box([x * 1.368, 1.93, z * 1.368], [.104, 1.43, .049], steel, 0, [0, angle, 0])
    for (const y of [1.12, 2.76]) m.box([x * 1.235, y, z * 1.235], [.33, .29, .37], iron, 0, [0, angle, 0])
    m.box([x * 1.398, 2.42, z * 1.398], [.061, .25, .03], heat, .88, [0, angle, 0])
  }
  for (const side of [-1, 1]) valve(m, side * 1.45, 1.08, .15)
  m.box([0, .65, 1.386], [.87, .27, .09], cast)
  for (let i = 0; i < 4; i++) for (const side of [-1, 1]) m.box([side * (.49 + i * .081), .65, 1.281], [.039, .129, .027], warning, 0, [0, 0, -.38])
}

export function addGrafitoFactory(m: Model, stations: StationConfig[], detail: boolean) {
  const free = (x: number, z: number, radius = 2.5) => !stations.some(st => Math.hypot(x - st.position[0], z - st.position[1]) < radius)
  m.box([0, -.412, -6.1], [36.9, .64, 66], cast)
  for (let x = -17; x <= 17; x += 2) for (let z = -37; z <= 25; z += 2) {
    const sector = (x * x + z * 13 + 900) % 7
    m.box([x, -.058, z], [1.973, .07, 1.973], sector < 2 ? '#33363b' : '#3e4043')
    if (sector === 0 && detail && free(x, z, 1.4)) {
      for (const offset of [-.79, .79]) m.box([x + offset, -.015, z - .8], [.082, .024, .10], steel)
    }
  }
  // Service aisles with recessed trench covers and painted hazard bands.
  for (const side of [-1, 1]) {
    const x = side * 12.44
    m.box([x, -.018, -4.8], [.72, .029, 27.5], cast)
    for (let i = 0; i < 58; i++) m.box([x, .001, -17.9 + i * .45], [.68, .033, .11], steel)
    for (let i = 0; i < 25; i++) m.box([side * 11.77, .004, -15 + i * .98], [.12, .012, .49], warning, 0, [0, -.35, 0])
    for (const z of [-20.2, -26.9, -32.8]) {
      const bx = side * (z < -30 ? 7.2 : 10.8)
      if (free(bx, z, 3.0)) boiler(m, bx, z, z < -25 ? 5.85 : 4.6, z < -25 ? 1.52 : 1.32)
    }
    for (const z of [-12.5, -22.9, -33.9]) {
      const px = side * 16.05
      m.box([px, .23, z], [1.0, .46, .95], steel)
      m.box([px, 4.25, z], [.49, 8.2, .54], iron)
      for (const edge of [-1, 1]) m.box([px + edge * .27, 4.21, z], [.075, 8.02, .58], steel)
      m.box([px, 7.85, z], [.82, .62, .84], steel)
      m.beam([px, 6.66, z], [px - side * 1.66, 8.22, z], .18, steel, 'box')
    }
    m.box([side * 16.05, 8.21, -23.4], [.51, .33, 22.6], iron)
    for (const z of [-15.3, -23.2]) {
      m.box([side * 14.55, .56, z], [1.15, 1.16, .61], cast)
      m.box([side * 14.55, .91, z + .34], [.74, .26, .085], steel)
      for (let i = 0; i < 4; i++) m.box([side * 14.55 - .24 + i * .16, .91, z + .395], [.057, .041, .028], heat, .92)
    }
    for (const [i, z] of [14.7, 17.55, 21.4].entries()) {
      const x = side * (8.45 + i * 1.24)
      if (!free(x, z, 2.2)) continue
      m.box([x, .065, z], [2.14, .13, 1.52], cast)
      for (const edge of [-1, 1]) {
        m.add('cylinder', [x + edge * .46, .541, z], [.36, .86, .36], iron)
        for (const y of [.274, .831]) m.add('cylinder', [x + edge * .46, y, z], [.381, .079, .381], steel)
        m.add('cylinder', [x + edge * .46, .985, z], [.295, .039, .295], steel)
        m.box([x + edge * .46, .57, z + .363], [.194, .158, .029], warning)
      }
    }
    for (let i = 0; i < 14; i++) m.box([side * 3.73, .002, 11.2 + i * .91], [.105, .023, .52], warning, 0, [0, -.36, 0])
  }
  for (const [x, , z] of pumpCells) {
    if (!free(x, z)) continue
    m.box([x, .18, z], [4.56, .36, 2.66], steel)
    m.box([x - 1.05, 1.05, z - .12], [1.29, 1.4, 1.52], iron)
    m.box([x + 1.49, 1.12, z - .12], [1.14, 1.48, 1.17], iron)
    m.box([x, 2.47, z - .43], [4.36, .19, .36], steel)
    for (let i = 0; i < 10; i++) m.box([x - 2.01 + i * .43, .32, z + 1.36], [.17, .17, .039], warning, 0, [0, 0, -.4])
  }
  for (const [x, y, z] of factoryVents) {
    m.add('cylinder', [x, y - .09, z], [.21, .18, .21], steel)
    m.ring([x, y + .005, z], .157, bronze, undefined, 0)
  }
  if (conveyorClear(stations)) {
    const length = conveyor.front - conveyor.back, z = (conveyor.front + conveyor.back) / 2
    m.box([0, .365, z], [2.6, .32, length], cast)
    m.box([0, .57, z], [2.05, .22, length], '#4e5356')
    for (const side of [-1, 1]) {
      m.box([side * 1.21, .63, z], [.15, .22, length + .17], steel)
      for (let i = 0; i < 6; i++) {
        const legZ = conveyor.front - .6 - i * 2.53
        m.box([side * 1.04, .225, legZ], [.18, .45, .31], steel)
        m.box([side * 1.27, .673, legZ], [.065, .083, .21], warning)
      }
    }
    for (let i = 0; i < 34; i++) m.box([0, .682, conveyor.front - .21 - i * .401], [2.07, .036, .135], steel)
    const ovenZ = conveyor.back - 1.7
    m.box([0, .30, ovenZ], [5.38, .6, 3.51], iron)
    for (const side of [-1, 1]) {
      m.box([side * 1.96, 2.13, ovenZ], [1.38, 3.61, 3.43], iron)
      m.box([side * 1.34, 1.89, conveyor.back + .046], [.27, 2.52, .23], steel)
      m.box([side * 2.17, 2.07, conveyor.back + .042], [.15, 2.36, .12], bronze)
      m.add('cylinder', [side * 1.29, 4.35, ovenZ], [.28, 1.35, .28], steel)
      m.add('cylinder', [side * 1.29, 5.06, ovenZ], [.38, .18, .38], iron)
    }
    m.box([0, 3.58, ovenZ], [5.39, .72, 3.51], iron)
    m.box([0, 3.34, conveyor.back + .11], [3.21, .20, .33], steel)
    m.box([0, 3.46, conveyor.back + .287], [2.91, .056, .046], warning)
    m.box([0, 1.8, ovenZ - .82], [3.1, 2.81, .17], '#734832', .6)
  }

  // A taller wall and a pair of overhead crane rails close the distant factory hall.
  m.box([0, 9.2, -38.0], [36.6, 18.4, .55], iron)
  m.box([0, 10.35, -37.48], [36.35, .37, .68], steel)
  m.box([0, 16.95, -37.55], [36.35, .56, .72], cast)
  for (const x of [-15, -9, -3, 3, 9, 15]) {
    m.box([x, 5.8, -37.59], [5.22, 5.27, .18], '#1c2025')
    m.box([x, 5.79, -37.476], [4.74, 4.81, .071], '#54534b', .16)
    for (let i = -2; i <= 2; i++) m.box([x + i * .95, 5.79, -37.398], [.069, 4.89, .071], cast)
    for (const y of [3.51, 4.9, 6.6, 8.1]) m.box([x, y, -37.398], [4.84, .087, .074], cast)
    m.box([x - 2.72, 9.15, -37.51], [.22, 17.68, .41], steel)
    m.box([x, 13.38, -37.59], [4.77, 3.12, .12], cast)
    m.box([x, 13.38, -37.505], [4.53, 2.92, .068], '#707173', .12)
    for (const dx of [-1.13, 0, 1.13]) m.box([x + dx, 13.38, -37.461], [.072, 2.94, .05], iron)
    m.box([x, 13.38, -37.459], [4.56, .072, .054], iron)
    m.beam([x - 2.68, 10.65, -37.13], [x + 2.68, 16.55, -37.13], .117, steel, 'box')
  }
  m.box([0, 8.35, -19.3], [32.2, .49, .93], iron)
  m.box([0, 8.066, -18.84], [30.45, .106, .101], warning)
  for (const x of [-13.4, -6.75, 0, 6.75, 13.4]) {
    m.box([x, 7.89, -19.06], [1.32, .22, .47], cast)
    m.box([x, 7.77, -19.06], [1.1, .032, .39], '#ffda9a', .95)
  }
}
