import type { StationConfig } from '@shared/types'
import type { Model, Vec } from './models'

const frame = '#354763'
const shell = '#17263c'
const recess = '#080e1b'
const trim = '#6c819a'
const cyan = '#54c9fa'
const violet = '#a47afd'

/** Clockwise ring around the entrance to the data tunnel, in world units. */
export const uplinkOutline: Vec[] = [
  [-3.65, .72, -15], [-3.65, 4.66, -15], [-2.46, 5.85, -15], [2.46, 5.85, -15],
  [3.65, 4.66, -15], [3.65, .72, -15], [2.83, -.1, -15], [-2.83, -.1, -15]
]

type SectorKind = 'cache' | 'relay' | 'switch'
interface Sector {
  at: Vec
  link: Vec
  width: number
  depth: number
  kind: SectorKind
  color: string
  remote?: boolean
}

export const cyberSectors: Sector[] = [{
  at: [0, 0, 19.85], link: [0, 0, 11.4], width: 4.6, depth: 6.2, kind: 'switch', color: '#8aa7f4'
}, ...[-1, 1].flatMap(side => {
  const color = side < 0 ? cyan : violet
  return [
    { at: [side * 7.45, 0, 16.3], link: [side * 7.45, 0, 11.4], width: 6.45, depth: 5.0, kind: 'cache', color },
    { at: [side * 6.5, 0, 24.6], link: [side * 7.45, 0, 18.7], width: 5.6, depth: 5.1, kind: 'switch', color },
    { at: [side * 20.1, 0, -8.8], link: [side * 15.7, 0, -8.8], width: 5.45, depth: 8.2, kind: 'relay', color },
    { at: [side * 23.7, 0, -23], link: [side * 20.1, 0, -12.3], width: 6.6, depth: 7.3, kind: 'switch', color },
    { at: [side * 12, 0, -47.7], link: [side * 3.8, 0, -43.7], width: 7.1, depth: 7.4, kind: 'relay', color, remote: true },
    { at: [side * 8.1, 0, -61.6], link: [side * 12, 0, -50.9], width: 6.9, depth: 7.1, kind: 'switch', color, remote: true },
    { at: [side * 6.55, 0, -75.3], link: [side * 8.1, 0, -64.4], width: 5.5, depth: 6.3, kind: 'relay', color, remote: true },
    { at: [side * 24.4, 0, -43.8], link: [side * 23.7, 0, -26.4], width: 8.2, depth: 8.4, kind: 'relay', color, remote: true }
  ] satisfies Sector[]
})]

function satelliteSector(m: Model, sector: Sector, free: (x: number, z: number, radius: number) => boolean) {
  const { at: [x, , z], link: [linkX, , linkZ], width, depth, kind, color, remote } = sector
  const dx = x - linkX, dz = z - linkZ
  const yaw = Math.atan2(dx, dz)
  const bridgeLength = Math.hypot(dx, dz)
  const bridge: Vec = [(x + linkX) / 2, -.21, (z + linkZ) / 2]
  m.box(bridge, [1.72, .24, bridgeLength], shell, 0, [0, yaw, 0])
  for (const side of [-1, 1]) m.box([bridge[0] + Math.cos(yaw) * side * .74, -.073, bridge[2] - Math.sin(yaw) * side * .74],
    [.055, .041, bridgeLength], color, .5, [0, yaw, 0])

  m.box([x, -.45, z], [width, .61, depth], shell)
  m.box([x, -.127, z], [width - .18, .17, depth - .18], frame)
  for (const side of [-1, 1]) {
    m.box([x + side * (width / 2 - .12), -.026, z], [.041, .036, depth - .21], color, .57)
    m.box([x, -.024, z + side * (depth / 2 - .12)], [width - .21, .036, .041], color, .57)
    for (const edge of [-1, 1]) {
      const px = x + side * (width / 2 - .26), pz = z + edge * (depth / 2 - .29)
      m.box([px, .095, pz], [.28, .28, .28], frame)
      m.box([px, .241, pz], [.104, .029, .105], '#c2e2f9', .7)
    }
    m.box([x + side * width * .34, -.018, z], [.032, .02, depth * .77], trim)
    for (let i = 0; i < 5; i++) {
      m.box([x + side * (width * .22 + i * .10), -.011, z + depth * .41], [.045, .018, .35], trim, 0, [0, side * .45, 0])
    }
  }
  if (!free(x, z, Math.max(width, depth) * .45 + 1.45)) return

  if (kind === 'cache') {
    for (let i = 0; i < 3; i++) {
      const slot = x + (i - 1) * 1.48
      m.box([slot, .17, z + .07], [1.24, .34, 2.46], '#253650')
      m.box([slot, .43, z - .10], [.96, .25, 1.91], shell)
      m.box([slot, .565, z - .10], [.55, .033, 1.24], recess)
      for (let rib = 0; rib < 7; rib++) m.box([slot, .582, z - .62 + rib * .18], [.49, .039, .044], trim)
      for (const side of [-1, 1]) m.box([slot + side * .42, .568, z - .13], [.027, .028, 1.71], color, .69)
      m.box([slot, .30, z + 1.33], [.63, .11, .067], recess)
      for (let pin = 0; pin < 4; pin++) m.box([slot - .2 + pin * .132, .308, z + 1.38], [.069, .022, .021], color, .9)
    }
  } else if (kind === 'relay') {
    for (const side of [-1, 1]) {
      const px = x + side * 1.19, pz = z + side * .93
      const height = remote ? 4.5 : 3.28
      m.box([px, .17, pz], [1.61, .34, 1.75], frame)
      m.box([px, height / 2, pz], [1.18, height, 1.26], shell)
      for (let bay = 0; bay < 6; bay++) {
        const y = .52 + bay * (height - .8) / 6
        m.box([px, y, pz], [1.56, .12, 1.62], frame)
        m.box([px, y + .08, pz + .81], [1.28, .042, .041], color, .66)
      }
      m.box([px, height + .078, pz], [1.3, .18, 1.38], frame)
      m.box([px, height + .39, pz], [.055, .53, .055], trim)
      m.box([px, height + .68, pz], [.093, .077, .093], color, .95)
    }
  } else {
    const height = remote ? 2.8 : z > 0 ? .58 : 1.15
    m.add('hex', [x, .19, z], [1.7, .40, 1.7], frame)
    m.add('hex', [x, height / 2 + .24, z], [1.26, height, 1.26], recess)
    m.add('hex', [x, height + .28, z], [1.42, .065, 1.42], color, .65)
    m.add('hex', [x, height + .36, z], [1.34, .15, 1.34], frame)
    m.ring([x, height + .45, z], .79, color, undefined, .67)
    for (let slot = 0; slot < 6; slot++) {
      const angle = slot * Math.PI / 3
      m.box([x + Math.sin(angle) * 1.78, .16, z + Math.cos(angle) * 1.78], [.28, .29, .64], trim, 0, [0, angle, 0])
    }
  }
}

function server(m: Model, x: number, z: number, height: number, index: number, detail: boolean) {
  const face = z + .61
  m.box([x, height / 2, z], [1.43, height, 1.18], shell)
  m.box([x, height / 2, face], [1.17, height - .27, .046], recess)
  for (const y of [.14, height - .1]) m.box([x, y, z], [1.58, .14, 1.25], frame)
  for (const side of [-1, 1]) {
    m.box([x + side * .64, height / 2, face], [.072, height - .23, .086], trim)
    m.box([x + side * .53, height / 2, face + .045], [.019, height - .41, .026], index % 3 ? cyan : violet, .55)
    for (const y of [.26, height - .27]) m.add('cylinder', [x + side * .65, y, face + .052], [.027, .02, .027], recess, 0, [Math.PI / 2, 0, 0])
  }
  for (let row = 0; row < Math.floor((height - .6) / .32); row++) {
    const y = .42 + row * .32
    m.box([x, y, face + .045], [1.02, .24, .07], row % 3 === 0 ? frame : shell)
    m.box([x - .17, y, face + .091], [.55, .125, .029], recess)
    m.box([x + .25, y + .023, face + .09], [.16, .065, .045], trim)
    for (let pin = 0; pin < 3; pin++) m.box([x + .37 + pin * .043, y - .068, face + .09], [.021, .022, .016], (row + pin + index) % 7 === 0 ? '#ffd180' : cyan, .92)
    if (detail) for (let vent = 0; vent < 8; vent++) m.box([x - .393 + vent * .064, y, face + .111], [.016, .072, .012], frame)
  }
  m.box([x, height - .27, face + .052], [.76, .105, .042], '#132b4b')
  for (let i = 0; i < 5; i++) m.box([x - .3 + i * .13, height - .27, face + .079], [.087, .022, .012], index % 3 ? cyan : violet, .52)
  for (let i = 0; i < 6; i++) m.box([x, height + .015, z - .35 + i * .14], [.91, .034, .041], trim)
}

export function addCyberOperations(m: Model, stations: StationConfig[], detail: boolean) {
  const free = (x: number, z: number, radius: number) => !stations.some(st => Math.hypot(x - st.position[0], z - st.position[1]) < radius)
  for (const sector of cyberSectors) satelliteSector(m, sector, free)
  m.box([0, -.51, -2.4], [31.9, .64, 28.3], '#121d32')
  m.box([0, -.21, -2.4], [31.45, .25, 27.88], frame)
  for (let col = 0; col < 14; col++) for (let row = 0; row < 12; row++) {
    const x = (col - 6.5) * 2.22, z = (row - 6.55) * 2.29
    const sector = (col * 7 + row * 11) % 9
    m.box([x, -.077, z], [2.18, .06, 2.25], sector < 2 ? '#293b58' : sector < 5 ? '#202e47' : '#26344b')
    if (sector === 0 && free(x, z, 2.1)) {
      m.box([x, -.032, z], [1.68, .027, 1.32], recess)
      for (let j = 0; j < (detail ? 12 : 7); j++) m.box([x - .72 + j * (detail ? .13 : .23), -.011, z], [.041, .018, 1.18], '#4e6179')
    }
    if (sector % 3 === 1) for (const side of [-1, 1]) m.box([x + .92 * side, -.034, z - .93], [.09, .013, .19], trim)
  }
  for (const side of [-1, 1]) {
    const x = side * 15.18
    m.box([x, -.026, -2.45], [.48, .06, 27], recess)
    for (const dx of [-.14, .14]) m.box([x + dx, .009, -2.45], [.023, .025, 26.8], side > 0 ? violet : cyan, .8)
    for (let i = 0; i < 12; i++) {
      const z = -14.4 + i * 2.2
      m.box([x, .067, z], [.63, .13, .32], frame)
      if (i % 2 === 0) {
        m.box([side * 15.56, .33, z], [.12, .56, .12], frame)
        m.box([side * 15.56, .625, z], [.075, .037, .078], cyan, .72)
      }
    }
    m.box([side * 15.56, .49, -3.4], [.048, .062, 23], trim)
    m.box([side * 15.91, -.31, -2.4], [.035, .055, 26.6], side > 0 ? violet : cyan, .56)
    for (let i = 0; i < 5; i++) {
      const sx = side * (5.03 + i * 1.68), z = -13.8 - (i % 2) * .62
      if (free(sx, z, 2.15)) server(m, sx, z, 3.45 + (i * 7 % 5) * .41, i + (side > 0 ? 1 : 0), detail)
      if (free(sx + side * .45, -19, 2.15)) server(m, sx + side * .45, -19, 4.5 + (i % 3) * .63, i + 4, false)
    }
    // Structural frames and fiber ducts run above the service aisles.
    for (const z of [-12, -20, -28]) {
      const x = side * 13.28
      if (!free(x, z, 1.95)) continue
      m.box([x, 3.57, z], [.39, 7.2, .58], shell)
      m.box([x, 3.57, z + .29], [.21, 6.86, .075], frame)
      m.box([x, 3.61, z + .34], [.048, 5.99, .025], side > 0 ? violet : cyan, .86)
      m.box([x, 6.83, z], [.74, .51, .95], frame)
    }
    m.box([side * 13.3, 6.96, -20], [.52, .38, 17], frame)
    m.box([side * 13.04, 6.98, -20], [.025, .055, 16.7], cyan, .67)
    for (const [i, z] of [-26.6, -37.9].entries()) {
      const x = side * (8.8 + i * 6.4), height = 7.05 - i
      if (!free(x, z, 2.85)) continue
      const light = side > 0 ? violet : cyan
      m.box([x, -.36, z], [4.35, .45, 4.52], shell)
      m.add('hex', [x, height / 2, z], [1.22, height, 1.22], '#1b2b47')
      for (let level = 0; level < 5; level++) {
        const y = height * (.18 + level * .17)
        m.add('hex', [x, y, z], [1.69, .24, 1.69], frame)
        m.add('hex', [x, y + .152, z], [1.61, .047, 1.61], light, .51)
      }
      for (const dx of [-.62, .62]) {
        m.box([x + dx, height * .52, z + 1.06], [.068, height * .86, .06], light, .46)
        m.box([x + dx, height + .29, z], [.09, .75, .09], trim)
        m.box([x + dx, height + .68, z], [.066, .073, .066], light, .9)
      }
    }
  }

  m.box([0, 6.73, -15.58], [27, .52, 1.25], shell)
  for (const z of [-16.07, -14.98]) {
    m.box([0, 6.66, z], [26.8, .113, .13], trim)
    m.box([0, 6.54, z], [26.8, .039, .073], cyan, .67)
  }
  m.box([0, 6.91, -14.90], [4.65, .56, .11], '#101e35')
  for (let i = 0; i < uplinkOutline.length; i++) {
    const a = uplinkOutline[i], b = uplinkOutline[(i + 1) % uplinkOutline.length]
    m.beam(a, b, .48, frame, 'box')
    m.beam([a[0], a[1], a[2] + .256], [b[0], b[1], b[2] + .256], .079, cyan, 'box')
    m.box(a, [.48, .31, .65], trim)
  }
  m.box([0, -.22, -31], [8.3, .30, 31], shell)
  for (let i = 0; i < 16; i++) {
    const z = -15.5 - i * 1.85
    m.box([0, -.055, z], [7.37, .063, 1.69], i % 4 === 0 ? frame : recess)
    m.box([0, -.017, z + .82], [7.25, .012, .033], i % 3 ? cyan : violet, .55)
  }
}
