import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import { addMatrixCity } from './matrixBuildings'
import { addCyberOperations } from './cyberOperations'
import { addMarfilPalace } from './marfilPalace'
import { addGrafitoFactory, addGrafitoReactor } from './grafitoFactory'
import { forestClear, forestHeight, forestRandom } from './forestLayout'

export type WorldStyle = 'clasico' | 'orbita' | 'marfil' | 'grafito' | 'bosque' | 'matrix' | 'eva'
export type Vec = [number, number, number]
export type Solid = 'box' | 'cylinder' | 'hex' | 'sphere' | 'dome' | 'rock' | 'cone' | 'ring' | 'leaf' | 'arch' | 'cable' | 'trunk' | 'orbitDeck' | 'orbitRail'
export interface Piece {
  shape: Solid
  at: Vec
  size: Vec
  color: string
  glow?: number
  rotation?: Vec
  quaternion?: THREE.Quaternion
}

/** Models are deterministic and batched by geometry/material, including the small details. */
export class Model {
  pieces: Piece[] = []
  add(shape: Solid, at: Vec, size: Vec, color: string, glow = 0, rotation?: Vec) {
    this.pieces.push({ shape, at, size, color, glow, rotation })
  }
  box(at: Vec, size: Vec, color: string, glow = 0, rotation?: Vec) { this.add('box', at, size, color, glow, rotation) }
  ring(at: Vec, radius: number, color: string, rotation: Vec = [Math.PI / 2, 0, 0], glow = 0.6) {
    this.add('ring', at, [radius, radius, radius], color, glow, rotation)
  }
  beam(a: Vec, b: Vec, width: number, color: string, shape: Solid = 'cylinder') {
    const v = new THREE.Vector3(...b).sub(new THREE.Vector3(...a))
    this.pieces.push({ shape, at: a.map((x, i) => (x + b[i]) / 2) as Vec, size: [width, v.length(), width], color,
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()) })
  }
}

function foliage(m: Model, center: Vec, radius: number, seed: number, count = 100) {
  for (let j = 0; j < count; j++) {
    const a = j * 2.399 + seed, b = Math.acos(1 - 2 * ((j * 0.618 + seed) % 1))
    const r = radius * (0.3 + 0.7 * ((j * 0.319 + 0.2) % 1))
    m.add('leaf', [center[0] + Math.cos(a) * Math.sin(b) * r, center[1] + Math.cos(b) * r * 0.65, center[2] + Math.sin(a) * Math.sin(b) * r],
      [radius * 0.27, radius * 0.48, radius * 0.35], ['#285d41', '#427c4b', '#71965b'][j % 3], 0, [0.95 + j % 4 * 0.2, a, 0.5 * Math.sin(j)])
  }
}

/** Architecture stays outside the work area so custom station layouts remain usable. */
export function environmentModel(style: WorldStyle, stations: StationConfig[], detail: boolean): Piece[] {
  const m = new Model()
  const occupied = (x: number, z: number, gap = 2.8) => stations.some(s => Math.hypot(s.position[0] - x, s.position[1] - z) < gap)
  if (style === 'clasico') addCyberOperations(m, stations, detail)
  if (style === 'orbita') {
    // Open vacuum between independent docks; a broken station ring surrounds them.
    m.add('orbitDeck', [0, -0.5, -2], [1, 0.3, 1], '#283d50')
    m.add('orbitRail', [0, -0.3, -2], [1, 1, 1], '#abc0cb')
    m.add('orbitRail', [0, -0.3, -2], [0.928, 1, 0.917], '#72daff', 0.7)
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2
      const x = Math.cos(a) * 14, z = Math.sin(a) * 12 - 2
      if (z > 7 || occupied(x, z)) continue
      m.beam([Math.cos(a) * 12.7, -0.32, Math.sin(a) * 10.7 - 2], [Math.cos(a) * 14, -0.32, Math.sin(a) * 12 - 2], 0.018, '#5e7180')
    }
    for (const s of [-1, 1]) {
      m.add('cylinder', [s * 11.8, 1.2, -9], [1.1, 5, 1.1], '#667b89', 0, [Math.PI / 2, 0, 0])
      for (let z = -11.4; z < -6.5; z += 0.4) m.ring([s * 11.8, 1.2, z], 1.105, '#263e50', [0, 0, 0], 0)
      for (const z of [-10.6, -7.4]) {
        m.ring([s * 11.8, 1.2, z], 1.13, '#71dfff', [0, 0, 0], 0.8)
        m.add('cylinder', [s * 11.8, 1.2, z + 0.16], [1.15, 0.15, 1.15], '#253844', 0, [Math.PI / 2, 0, 0])
      }
      m.add('cylinder', [s * 11.8, 1.2, -6.46], [0.8, 0.08, 0.8], '#071723', 0, [Math.PI / 2, 0, 0])
      m.ring([s * 11.8, 1.2, -6.4], 0.8, '#90c3d8', [0, 0, 0], 0.35)
      for (let j = 0; j < 8; j++) {
        const a = j / 8 * Math.PI * 2
        m.box([s * 11.8 + Math.cos(a) * 0.92, 1.2 + Math.sin(a) * 0.92, -6.39], [0.1, 0.06, 0.1], '#adbfca', 0, [0, 0, a])
      }
      for (let j = 0; j < 4; j++) {
        m.box([s * (15 + j * 1.1), 1.2, -9], [1, 0.08, 4.5], '#10265a', 0, [0, 0, s * 0.12])
        for (let k = 0; k < 5; k++) m.box([s * (15 + j * 1.1), 1.25, -11 + k], [1, 0.03, 0.04], '#658cc7')
      }
    }
  }
  if (style === 'marfil') addMarfilPalace(m, stations, detail)
  if (style === 'grafito') addGrafitoFactory(m, stations, detail)
  if (style === 'bosque') {
    const random = forestRandom(31)
    for (let i = 0; i < (detail ? 175 : 86); i++) {
      const x = (random() - .5) * 37, z = 13 - random() * 37
      if (!forestClear(x, z, stations, .46)) continue
      const y = forestHeight(x, z), size = .16 + random() ** 2 * .64
      m.add('rock', [x, y + size * .11, z], [size, size * .47, size * .72], i % 3 === 0 ? '#756e61' : '#596555', 0, [.15, random() * 6, .15])
      if (i % 4 === 0) for (let j = 0; j < 4; j++) {
        const dx = (random() - .5) * .66, dz = (random() - .5) * .66
        const h = .14 + random() * .19
        m.add('cylinder', [x + dx, y + h / 2, z + dz], [.021, h, .021], '#ae9d7f')
        m.add('dome', [x + dx, y + h, z + dz], [h * .42, h * .21, h * .42], j % 3 ? '#ae743c' : '#c1bc8e')
      }
      if (i % 5 === 0) for (let j = 0; j < 4; j++) {
        const fx = x + (random() - .5) * .98, fz = z + (random() - .5) * .98
        const h = .16 + random() * .26
        const fy = forestHeight(fx, fz)
        const petal = i % 10 === 0 ? '#ad90b7' : '#dfcda4'
        m.beam([fx, fy, fz], [fx + .025, fy + h, fz], .012, '#637747')
        for (let k = 0; k < 5; k++) {
          const a = k * Math.PI * .4 + j
          m.add('sphere', [fx + .025 + Math.sin(a) * .047, fy + h, fz + Math.cos(a) * .047], [.031, .019, .055], petal, .12, [0, a, 0])
        }
        m.add('sphere', [fx + .025, fy + h + .019, fz], [.021, .017, .021], '#e5b975', .4)
      }
    }
    for (const [x, z] of [[-7.8, -8.5], [7.2, -8.3], [-5.8, 6.6], [5.5, 6.4], [-11.8, -4.9], [12.1, -5.8]]) {
      if (!forestClear(x, z, stations, .24)) continue
      const y = forestHeight(x, z)
      m.add('rock', [x, y + .13, z], [.27, .35, .25], '#596555')
      m.beam([x, y + .15, z], [x, y + .95, z], .035, '#75654b')
      m.add('sphere', [x, y + 1.02, z], [.109, .18, .11], '#ffe19b', 1.55)
      for (const tilt of [-.4, .4]) m.ring([x, y + 1.02, z], .205, '#be9864', [0, tilt, 0], 0)
    }
  }
  if (style === 'matrix') {
    m.box([0, -1.2, -2], [80, 0.05, 80], '#010805')
    for (let i = -20; i <= 20; i++) {
      m.box([i * 2, -1.15, -3], [0.018, 0.015, 70], '#186844', 0.25)
      m.box([0, -1.15, i * 2 - 3], [70, 0.015, 0.018], '#186844', 0.25)
    }
    addMatrixCity(m, stations, detail)
  }
  if (style === 'eva') {
    m.box([0, -0.35, -2], [30, 0.6, 29], '#211a32')
    for (let x = -12; x <= 12; x += 4) {
      m.box([x, -0.025, -2], [0.5, 0.035, 27], '#4c4758')
      m.box([x + 0.2, 0, -2], [0.06, 0.02, 26], '#a7d94c', 0.2)
    }
    for (let i = -2; i <= 2; i++) {
      const x = i * 5.5
      m.box([x, 3.4, -14], [5.2, 6.8, 0.7], '#38254d')
      m.box([x, 3.1, -13.6], [4.3, 5.5, 0.08], '#141620')
      for (let row = 0; row < 6; row++) {
        const y = 0.75 + row * 0.86
        for (const side of [-1, 1]) {
          m.box([x + side * 1.05, y, -13.49], [1.94, 0.78, 0.09], row % 2 ? '#33313e' : '#292936')
          m.box([x + side * 1.05, y - 0.28, -13.42], [1.6, 0.025, 0.025], '#63636d')
          for (const edge of [-0.78, 0.78]) m.add('sphere', [x + side * 1.05 + edge, y + 0.25, -13.41], [0.025, 0.025, 0.016], '#a3a3ad')
        }
      }
      for (const s of [-1, 1]) {
        m.box([x + s * 2.1, 3.1, -13.5], [0.14, 5.3, 0.12], '#93d83d', 0.8)
        m.box([x + s * 2.55, 3.5, -12.8], [0.4, 7, 1.5], '#573982')
      }
      m.box([x, 6.2, -12.6], [4.7, 0.8, 1.5], '#6b4694')
      for (let j = 0; j < 6; j++) m.box([x - 1.8 + j * 0.7, 6.2, -11.82], [0.3, 0.5, 0.06], '#cf9e38', 0, [0, 0, -0.45])
    }
    for (const s of [-1, 1]) for (let z = -7; z <= 5; z += 6) {
      if (occupied(s * 12.4, z)) continue
      m.box([s * 12.4, 2, z], [1.2, 4, 1.4], '#63468c')
      m.box([s * 12.4, 4.12, z], [1.45, 0.16, 1.6], '#90949a')
      m.box([s * 12.4, 0.2, z], [1.5, 0.4, 1.7], '#303139')
      for (let y = 0.8; y < 3.8; y += 0.75) {
        m.box([s * 12.4, y, z + 0.73], [0.96, 0.62, 0.12], '#3b2c4f')
        for (let j = 0; j < 5; j++) m.box([s * 12.4 - 0.33 + j * 0.16, y, z + 0.81], [0.055, 0.4, 0.035], '#151820')
        for (const dx of [-0.5, 0.5]) m.add('sphere', [s * 12.4 + dx, y + 0.2, z + 0.76], [0.025, 0.025, 0.025], '#b2abbf')
      }
      m.box([s * 12.4, 3.85, z + 0.75], [0.65, 0.07, 0.06], '#a1d354', 0.6)
      m.beam([s * 12.4, 3.5, z], [s * 10.9, 2.6, z], 0.23, '#8a8495')
      m.beam([s * 12.4, 3.5, z], [s * 11.7, 3.08, z], 0.29, '#353c46')
    }
  }
  // Purpose-built access paths; they stop before the robot platforms.
  for (const st of stations) {
    const [x, z] = st.position, len = Math.hypot(x, z)
    if (len < 4) continue
    const dx = x / len, dz = z / len, yaw = Math.atan2(dx, dz)
    if (style === 'bosque') {
      for (let d = 2.7; d < len - 1.7; d += 0.32) m.box([dx * d, 0.01, dz * d], [1, 0.12, 0.26], '#826342', 0, [0, yaw, 0])
    } else if (style === 'orbita') {
      m.box([dx * len / 2, -0.2, dz * len / 2], [0.95, 0.14, Math.max(0.1, len - 2.2)], '#20303e', 0, [0, yaw, 0])
      for (let d = 2.6; d < len - 1.5; d += 0.24) m.box([dx * d, -0.11, dz * d], [0.79, 0.03, 0.1], '#567181', 0, [0, yaw, 0])
      for (const s of [-1, 1]) {
        m.box([dx * len / 2 + dz * s * 0.46, -0.08, dz * len / 2 - dx * s * 0.46], [0.018, 0.025, Math.max(0.1, len - 2.2)], '#76d4ed', 0.9, [0, yaw, 0])
      }
    }
  }
  if (style === 'eva') for (const s of [-1, 1]) for (let z = -10; z <= 5; z += 5) {
    m.box([s * 11.3, 0.2, z], [1, 0.4, 2.5], '#151820')
    for (let j = 0; j < 11; j++) m.box([s * 11.3, 0.43, z - 1.1 + j * 0.21], [0.8, 0.04, 0.08], '#6d6979')
    m.beam([s * 12.3, 0.1, z], [s * 12.3, 2.6, z - 0.5], 0.08, '#bebac2')
    m.beam([s * 12.3, 1.1, z], [s * 12.3, 2.9, z - 0.5], 0.15, '#393745')
  }
  return m.pieces
}

/** Platform top remains at y=.2 so the existing robots, pulses and hit areas agree. */
export function platformModel(style: WorldStyle): Piece[] {
  const m = new Model()
  switch (style) {
    case 'clasico':
      m.box([0, -.18, 0], [3.12, .34, 2.83], '#13233b')
      m.box([0, .052, 0], [3.17, .18, 2.87], '#344763')
      m.box([0, .17, 0], [2.92, .08, 2.63], '#0d1b2d')
      for (const s of [-1, 1]) {
        m.box([s * 1.48, 0.23, 0], [0.045, 0.06, 2.6], '#61ccff', 1.1)
        for (let i = 0; i < 5; i++) {
          m.box([s * 1.57, -0.08, -0.8 + i * 0.4], [0.04, 0.18, 0.18], '#527796')
          m.box([s * 1.594, -.085, -.8 + i * .4], [.022, .035, .086], '#78bbe7', .48)
        }
        m.box([s * 1.29, .054, 1.452], [.25, .093, .08], '#687b92')
      }
      m.box([0, .049, 1.452], [1.41, .105, .062], '#0b1629')
      for (let i = 0; i < 6; i++) m.box([-.49 + i * .2, .05, 1.491], [.11, .023, .024], i % 3 ? '#54c9fa' : '#a47afd', .72)
      break
    case 'orbita':
      m.add('cylinder', [0, -0.25, 0], [1.72, 0.14, 1.72], '#162633')
      m.add('cylinder', [0, -0.05, 0], [1.58, 0.28, 1.58], '#5b717f')
      m.add('cylinder', [0, 0.13, 0], [1.65, 0.08, 1.65], '#b0bcc1')
      m.add('cylinder', [0, 0.19, 0], [1.45, 0.04, 1.45], '#142b3b')
      m.ring([0, 0.23, 0], 1.47, '#a4e8ff', undefined, 0.7)
      m.ring([0, -0.18, 0], 1.66, '#459ab9', undefined, 0.5)
      for (let i = 0; i < 32; i++) {
        const a = i / 32 * Math.PI * 2
        m.box([Math.cos(a) * 1.58, -0.05, Math.sin(a) * 1.58], [0.08, 0.22, 0.12], '#152937', 0, [0, -a, 0])
        if (i % 2 === 0) m.add('cylinder', [Math.cos(a) * 1.56, 0.18, Math.sin(a) * 1.56], [0.025, 0.03, 0.025], '#dae5e8')
      }
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2
        m.box([Math.cos(a) * 1.68, -0.05, Math.sin(a) * 1.68], [0.18, 0.23, 0.32], '#718a98', 0, [0, -a, 0])
        m.add('cylinder', [Math.cos(a) * 1.15, -0.47, Math.sin(a) * 1.15], [0.17, 0.3, 0.17], '#162633')
        m.ring([Math.cos(a) * 1.15, -0.63, Math.sin(a) * 1.15], 0.14, '#70bfff', undefined, 1.2)
      }
      break
    case 'marfil':
      for (let i = 0; i < 3; i++) m.add('cylinder', [0, -0.3 + i * 0.2, 0], [1.9 - i * 0.18, 0.2, 1.9 - i * 0.18], i === 2 ? '#fff4db' : '#cfc3a8')
      m.ring([0, 0.22, 0], 1.51, '#b39658', undefined, 0)
      for (const s of [-1, 1]) {
        m.add('cylinder', [s * 1.45, 0.3, -0.95], [0.22, 0.45, 0.22], '#cfc3a8')
        foliage(m, [s * 1.45, 0.7, -0.95], 0.36, 0.2, 50)
      }
      break
    case 'grafito':
      m.add('cylinder', [0, -0.1, 0], [1.55, 0.6, 1.55], '#42474d')
      m.add('cylinder', [0, 0.18, 0], [1.36, 0.08, 1.36], '#20282e')
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2
        m.box([Math.cos(a) * 1.55, -0.1, Math.sin(a) * 1.55], [0.23, 0.32, 0.23], '#70757b', 0, [0, -a, 0])
        m.add('cylinder', [Math.cos(a) * 1.15, 0.25, Math.sin(a) * 1.15], [0.055, 0.06, 0.055], '#b7a778')
      }
      m.ring([0, 0.23, 0], 1.4, '#dca448', undefined, 0.4)
      break
    case 'bosque':
      m.add('cylinder', [0, -0.19, 0], [1.72, 0.39, 1.72], '#4e5547')
      m.add('cylinder', [0, 0.06, 0], [1.68, 0.29, 1.68], '#59422c')
      m.add('cylinder', [0, 0.193, 0], [1.57, 0.058, 1.57], '#aa8651')
      for (const r of [1.43, 1.59, 1.68]) m.ring([0, r > 1.65 ? .104 : .221, 0], r, '#af9360', undefined, .08)
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8
        m.add('leaf', [Math.sin(a) * 1.51, .227, Math.cos(a) * 1.51], [.064, .17, .04], '#bdab73', .08, [-Math.PI / 2, 0, a])
      }
      break
    case 'matrix':
      m.box([0, 0.1, 0], [2.8, 0.18, 2.8], '#09281a')
      for (const s of [-1, 1]) {
        m.box([s * 1.41, 0.2, 0], [0.025, 0.035, 2.85], '#59ff9c', 1)
        m.box([0, 0.2, s * 1.41], [2.85, 0.035, 0.025], '#59ff9c', 1)
      }
      for (let i = 0; i < 9; i++) {
        const x = (i % 3 - 1) * 0.9, z = (Math.floor(i / 3) - 1) * 0.9
        m.box([x, -0.25 - (i % 3) * 0.18, z], [0.78, 0.35, 0.78], '#0b3821')
      }
      break
    case 'eva':
      m.add('hex', [0, -0.1, 0], [1.8, 0.6, 1.8], '#503570')
      m.add('hex', [0, 0.18, 0], [1.6, 0.06, 1.6], '#282333')
      for (const s of [-1, 1]) {
        m.box([s * 1.35, 0.42, -0.85], [0.24, 0.8, 0.5], '#72529d')
        m.box([s * 1.35, 0.88, -0.85], [0.25, 0.04, 0.51], '#bcf056', 0.7)
        m.beam([s * 1.6, 0.1, -0.9], [s * 1.35, 0.7, -0.85], 0.06, '#9a9fa8')
        m.box([s * 1.28, 0.24, 0.5], [0.12, 0.08, 1], '#b7ed47', 0.8)
      }
      for (let i = 0; i < 6; i++) m.box([-0.9 + i * 0.36, 0.24, 1.2], [0.18, 0.04, 0.32], '#d6a444', 0, [0, 0.5, 0])
      break
  }
  if (['clasico', 'matrix', 'eva'].includes(style)) {
    for (const s of [-1, 1]) for (let j = 0; j < 12; j++) {
      m.box([s * 1.45, 0.03, -0.9 + j * 0.16], [0.05, 0.09, 0.08], '#66818d')
    }
    for (const x of [-1.25, 1.25]) for (const z of [-1.15, 1.15]) m.add('cylinder', [x, 0.23, z], [0.025, 0.02, 0.025], '#bcc9cc')
  }
  return m.pieces
}

/** Solid centerpieces; documents and transfer effects remain handled by Core. */
export function centerpieceModel(style: WorldStyle): Piece[] {
  const m = new Model()
  if (style === 'clasico') {
    m.add('cylinder', [0, .27, 0], [1.28, .14, 1.28], '#233652')
    m.add('cylinder', [0, .36, 0], [1.16, .075, 1.16], '#101c31')
    for (const radius of [1.14, 1.32, 1.57]) m.ring([0, .403, 0], radius, radius === 1.32 ? '#a47afd' : '#61ccff', undefined, .84)
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4, x = Math.sin(angle), z = Math.cos(angle)
      m.box([x * 1.44, .347, z * 1.44], [.21, .24, .4], '#354b67', 0, [0, angle, 0])
      m.box([x * 1.44, .481, z * 1.44], [.082, .022, .22], '#7de3ff', .95, [0, angle, 0])
    }
  }
  if (style === 'orbita') {
    m.ring([0, 2.05, 0], 1.3, '#c9eaf6', [1.2, 0.15, 0.4], 0.8)
  }
  if (style === 'marfil') {
    m.add('cylinder', [0, 0.35, 0], [1.9, 0.35, 1.9], '#f1e5ce')
    m.add('cylinder', [0, 0.55, 0], [1.7, 0.04, 1.7], '#6bada4')
    m.add('cylinder', [0, 0.76, 0], [0.28, 0.4, 0.28], '#eee5cf')
    m.add('cylinder', [0, 1.15, 0], [0.075, 0.48, 0.075], '#ba9956')
    for (const s of [-1, 1]) m.beam([0, 1.28, 0], [s * 0.65, 1.55, 0], 0.035, '#ba9956')
    for (let i = 0; i < 3; i++) m.ring([0, 2.05, 0], 1.2, '#ba9956', [i * 1.05, i * 1.05, 0.4], 0.15)
    for (let i = 0; i < 36; i++) {
      const a = i * Math.PI / 18
      m.box([Math.sin(a) * 1.2, 2.05 + Math.cos(a) * 1.2, 0], [0.035, 0.07, 0.025], '#ba9956', 0, [0, 0, -a])
    }
    m.add('sphere', [0, 2.05, 0], [0.38, 0.38, 0.38], '#72ad91')
  }
  if (style === 'grafito') addGrafitoReactor(m)
  if (style === 'eva') {
    const alloy = '#77758a', armor = '#52387c', dark = '#231b32', power = '#a6e844', warning = '#d89046'
    m.add('cylinder', [0, 0.39, 0], [1.41, 0.31, 1.41], dark)
    m.add('cylinder', [0, 0.63, 0], [1.33, 0.32, 1.33], armor)
    m.add('cylinder', [0, 0.84, 0], [1.32, 0.14, 1.32], alloy)
    m.add('cylinder', [0, 0.96, 0], [1.16, 0.14, 1.16], dark)
    m.add('cylinder', [0, 3.12, 0], [1.17, 0.14, 1.17], dark)
    m.add('cylinder', [0, 3.28, 0], [1.31, 0.20, 1.31], alloy)
    m.add('cylinder', [0, 3.48, 0], [1.21, 0.22, 1.21], armor)
    m.add('cylinder', [0, 3.63, 0], [0.86, 0.16, 0.86], dark)
    m.add('cylinder', [0, 3.73, 0], [0.42, 0.08, 0.42], alloy)
    for (const y of [0.91, 3.18]) m.ring([0, y, 0], 1.13, power, undefined, 0.75)
    for (const y of [0.47, 3.55]) m.ring([0, y, 0], y < 1 ? 1.33 : 1.21, '#b39ad5', undefined, 0.16)
    for (let i = 0; i < 20; i++) {
      const a = i * Math.PI / 10, x = Math.sin(a), z = Math.cos(a)
      for (const y of [0.93, 3.4]) m.add('hex', [x * 1.24, y, z * 1.24], [0.038, 0.035, 0.038], dark)
      m.box([x * 1.33, 0.63, z * 1.33], [0.12, 0.14, 0.06], i % 5 === 0 ? warning : dark, 0, [0, a, 0])
      if (i % 2 === 0) m.box([x * 0.99, 3.62, z * 0.99], [0.14, 0.07, 0.3], alloy, 0, [0, a, 0])
    }
    // The braces leave the front observation window clear.
    for (const a of [-2.23, -1.06, 1.06, 2.23]) {
      const x = Math.sin(a), z = Math.cos(a), yaw: Vec = [0, a, 0]
      m.beam([x * 1.48, 0.55, z * 1.48], [x * 1.32, 3.42, z * 1.32], 0.10, alloy)
      m.box([x * 1.4, 2.05, z * 1.4], [0.25, 1.82, 0.25], armor, 0, yaw)
      m.box([x * 1.535, 2.05, z * 1.535], [0.12, 1.25, 0.05], dark, 0, yaw)
      for (let i = 0; i < 7; i++) m.box([x * 1.57, 1.53 + i * 0.17, z * 1.57], [0.08, 0.093, 0.03], power, 0.7, yaw)
      for (const y of [0.78, 3.32]) m.box([x * 1.33, y, z * 1.33], [0.39, 0.32, 0.5], armor, 0, yaw)
      for (const y of [1.03, 3.04]) m.add('cylinder', [x * 1.39, y, z * 1.39], [0.15, 0.13, 0.15], dark)
      m.beam([x * 1.46, 0.65, z * 1.46], [x * 1.92, 0.29, z * 1.92], 0.065, dark)
    }
    m.box([0, 0.62, 1.33], [0.91, 0.28, 0.10], dark)
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      m.box([side * (0.53 + i * 0.12), 0.66, 1.23], [0.055, 0.12, 0.035], warning, 0.12, [0, 0, -0.42])
    }
    for (const y of [1.09, 2.99]) {
      m.add('cylinder', [0, y, 0], [0.54, 0.14, 0.54], dark)
      m.ring([0, y, 0], 0.54, power, undefined, 0.7)
    }
  }
  return m.pieces
}
