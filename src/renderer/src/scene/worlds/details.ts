import type { StationConfig } from '@shared/types'
import { Model, type Vec, type WorldStyle } from './models'

function bolts(m: Model, x: number, y: number, z: number, width: number, depth: number, color = '#a2a9ae') {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.add('cylinder', [x + sx * width / 2, y, z + sz * depth / 2], [0.026, 0.018, 0.026], color)
}

function hatch(m: Model, x: number, z: number, width: number, depth: number, color: string) {
  m.box([x, 0.018, z], [width, 0.035, depth], '#101820')
  m.box([x, 0.044, z], [width - 0.1, 0.018, depth - 0.1], color)
  bolts(m, x, 0.06, z, width - 0.22, depth - 0.22)
  for (const side of [-1, 1]) m.box([x + side * width * 0.3, 0.06, z], [0.16, 0.015, 0.035], '#a2a9ae')
}

function railing(m: Model, a: Vec, b: Vec, color: string) {
  m.beam(a, b, 0.026, color)
  m.beam([a[0], a[1] - 0.25, a[2]], [b[0], b[1] - 0.25, b[2]], 0.018, color)
  const n = Math.max(1, Math.ceil(Math.hypot(a[0] - b[0], a[2] - b[2]) / 1.15))
  for (let i = 0; i <= n; i++) {
    const x = a[0] + (b[0] - a[0]) * i / n, z = a[2] + (b[2] - a[2]) * i / n
    m.beam([x, 0.05, z], [x, a[1], z], 0.023, color)
    m.box([x, 0.04, z], [0.16, 0.04, 0.16], color)
  }
}

/** Smaller construction details follow the function and material of each world. */
export function environmentDetails(style: WorldStyle, stations: StationConfig[], detailed: boolean) {
  const m = new Model()
  const free = (x: number, z: number, radius = 2.3) => Math.hypot(x, z) > 3.4 && !stations.some(s => Math.hypot(x - s.position[0], z - s.position[1]) < radius)
  if (style === 'eva') {
    for (let x = -13; x < 14; x += 2) for (let z = -13; z < 12; z += 2) {
      m.box([x, -0.025, z], [1.96, 0.04, 1.96], '#272432')
      if (detailed && (x + z) % 4 === 0) bolts(m, x, 0.004, z, 1.7, 1.7, '#63636d')
    }
    for (const side of [-1, 1]) {
      for (const z of [-8, -1, 6]) if (free(side * 10.1, z)) {
        hatch(m, side * 10.1, z, 1.25, 1.7, '#41364f')
        for (let i = 0; i < 8; i++) m.box([side * 10.1 - 0.46 + i * 0.13, 0.06, z - 0.65], [0.06, 0.018, 0.18], '#cbb55c', 0, [0, -0.45, 0])
      }
      for (let z = -9; z < 9; z += 2.2) m.add('cable', [side * 13.1, 0.24, z], [2.1, 0.4, 1], '#101820', 0, [0, Math.PI / 2, 0])
      railing(m, [side * 13.9, 0.65, -10], [side * 13.9, 0.65, 7], '#6d7781')
    }
    for (const x of [-8, 8]) {
      railing(m, [x - 1, 0.8, -10.9], [x + 1, 0.8, -10.9], '#9aa19b')
      for (const s of [-1, 1]) {
        m.box([x + s * 0.95, 1.2, -11], [0.18, 0.6, 0.18], '#292936')
        m.box([x + s * 0.95, 1.51, -11], [0.12, 0.07, 0.12], '#cf9e38', 1)
      }
    }
    for (const side of [-1, 1]) {
      m.box([side * 9.5, 6.1, -10.8], [4, 0.12, 0.35], '#90949a')
      m.box([side * 9.5, 6.01, -10.8], [3.7, 0.03, 0.2], '#d3e7e6', 1.2)
    }
  }
  if (style === 'orbita') {
    for (const side of [-1, 1]) {
      // Antenna dish, support truss and concentric docking seals.
      m.beam([side * 11.8, 2, -9], [side * 11.8, 3.4, -9], 0.045, '#abc0cb')
      m.add('dome', [side * 11.8, 3.4, -9], [0.68, 0.2, 0.68], '#b0bcc1', 0, [0.25, 0, side * 0.25])
      m.beam([side * 11.8, 3.4, -9], [side * 11.8, 3.95, -9], 0.025, '#abc0cb')
      m.add('sphere', [side * 11.8, 3.98, -9], [0.05, 0.05, 0.05], '#72daff', 1)
      for (let j = 0; j < 12; j++) {
        const a = j / 12 * Math.PI * 2
        m.box([side * 11.8 + Math.cos(a) * 0.72, 1.2 + Math.sin(a) * 0.72, -6.35], [0.06, 0.16, 0.05], '#567181', 0, [0, 0, a])
      }
      for (let j = 0; j < 4; j++) for (let k = 0; k < 16; k++) m.box([side * (15 + j * 1.1), 1.27, -11.1 + k * 0.28], [0.88, 0.012, 0.012], '#446c9d')
      for (let j = 0; j < 4; j++) {
        m.beam([side * (14.6 + j * 1.1), 1.1, -11.2], [side * (15.5 + j * 1.1), 1.1, -6.8], 0.02, '#567181')
      }
    }
    for (let j = 0; j < 19; j++) {
      const a = -Math.PI / 4 + j / 18 * Math.PI * 1.5
      const x = Math.cos(a) * 13.8, z = -Math.sin(a) * 11.8 - 2
      if (!free(x, z)) continue
      m.beam([x, -0.22, z], [x, 0.42, z], 0.022, '#718a98')
      m.add('sphere', [x, 0.45, z], [0.035, 0.04, 0.035], '#a4e8ff', 0.7)
    }
  }
  if (style === 'bosque') {
    // Fallen logs, bracket fungi and leaf litter sit away from the agents and side controls.
    for (const [x, z, yaw] of [[-10,-6,0.7],[10,-5,-0.8],[-6,9,-0.4]] as Vec[]) {
      if (!free(x, z)) continue
      m.add('trunk', [x, 0.24, z], [0.3, 2.3, 0.3], '#543c2b', 0, [Math.PI / 2, 0, yaw])
      for (let i = 0; i < 5; i++) m.add('dome', [x + (i - 2) * 0.19, 0.35, z + 0.1], [0.14, 0.09, 0.14], '#c19d6f')
    }
    for (let i = 0; i < (detailed ? 220 : 90); i++) {
      const a = i * 2.399, r = 3.8 + (i * 0.419 % 10), x = Math.cos(a) * r, z = Math.sin(a) * r - 1
      if (!free(x, z, 1.9) || (Math.abs(x) > 7 && Math.abs(x) < 11 && z > -4 && z < 8)) continue
      m.add('leaf', [x, -0.045, z], [0.07 + i % 3 * 0.025, 0.23, 0.1], ['#92723d','#a08b4f','#59643a'][i % 3], 0, [Math.PI / 2, 0, a])
      if (i % 17 === 0) {
        m.add('cylinder', [x, 0.14, z], [0.024, 0.34, 0.024], '#d2c3a4')
        m.add('dome', [x, 0.31, z], [0.17, 0.11, 0.17], '#b66d4d')
      }
    }
  }
  if (style === 'matrix') {
    for (const s of [-1, 1]) for (const z of [-8, -2, 5]) if (free(s * 12, z)) {
      for (let i = 0; i < 8; i++) m.box([s * 12, -0.7 + i * 0.24, z], [0.28 + i * 0.07, 0.025, 0.28 + i * 0.07], '#189650', 0.5)
    }
  }
  return m.pieces
}

export function platformDetails(style: WorldStyle) {
  const m = new Model()
  if (style === 'eva' || style === 'clasico' || style === 'grafito' || style === 'orbita') {
    const frame = style === 'eva' ? '#90949a' : '#718a98'
    for (const s of [-1, 1]) {
      m.box([s * 1.03, 0.225, -0.95], [0.42, 0.025, 0.3], '#101820')
      for (let j = 0; j < 5; j++) m.box([s * 1.03 - 0.15 + j * 0.075, 0.245, -0.95], [0.025, 0.02, 0.22], frame)
      if (style !== 'orbita') m.add('cable', [s * 1.22, 0.04, -0.2], [0.8, 0.65, 0.8], '#101820', 0, [0, Math.PI / 2, 0])
    }
    if (style === 'eva') {
      for (const s of [-1, 1]) {
        m.box([s * 1.1, 0.23, 0.28], [0.18, 0.03, 0.9], '#41364f')
        for (let j = 0; j < 5; j++) m.box([s * 1.38, -0.12, -0.5 + j * 0.22], [0.05, 0.21, 0.12], '#90949a')
      }
    }
  }
  if (style === 'marfil') {
    for (let i = 0; i < 48; i++) {
      const a = i * Math.PI / 24
      m.add('cylinder', [Math.cos(a) * 1.72, -0.1, Math.sin(a) * 1.72], [0.025, 0.16, 0.025], '#b7af9c')
    }
    m.ring([0, 0.205, 0], 1.42, '#b39658', undefined, 0)
  }
  return m.pieces
}
