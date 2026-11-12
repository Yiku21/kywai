// Los dos temas de empresa (Ajustes → Tema → «Empresa»): sobrios, para usar kywai en el trabajo o enseñarlo a un cliente.
// - Oficina: planta diáfana de día, suelo claro pulido, muro cortina con la ciudad detrás, puestos con pantallas,
//   una sala de reuniones de cristal y plantas.
// - Sede central: planta alta de un rascacielos de noche, piedra oscura, nogal y latón, con la ciudad encendida detrás.
// Todo queda fuera de la zona de trabajo (los puestos se respetan aunque se salgan del polígono).
import type { StationConfig } from '@shared/types'
import type { Model, Solid, Vec, WorldStyle } from './models'

export const CORPORATE_WORLDS = ['oficina', 'sede'] as const
export type CorporateWorld = (typeof CORPORATE_WORLDS)[number]

export function isCorporate(style: WorldStyle | undefined): style is CorporateWorld {
  return (CORPORATE_WORLDS as readonly string[]).includes(style ?? '')
}

const rnd = (i: number) => { const n = Math.sin(i * 91.7 + 17.3) * 43758.5453; return n - Math.floor(n) }

/** Colores de cada escenario. El material de cada pieza sale de su color (corporateSurface). */
const OFFICE = {
  floor: '#d2d6da', seam: '#bcc2c8', carpet: '#7a8796', carpetEdge: '#aeb6bf',
  white: '#eef1f4', wall: '#e4e7ea', oak: '#b88d5f', steel: '#9ba5af', dark: '#222831',
  screen: '#86b6ff', accent: '#2f6fe4', glass: '#cfe2ee', skyline: '#b9c8d6', skylineFar: '#cdd8e2',
  chair: '#3b4653', fabric: '#5f6e7f', pot: '#e9ecee', soil: '#4a3b2e', leaves: ['#3c7650', '#5a8f5e', '#2e5f41']
}
const HQ = {
  floor: '#1e242c', seam: '#2c343e', rug: '#243145', brass: '#c8a86a',
  walnut: '#5b3f2b', walnutDark: '#3e2b1f', mullion: '#2a313a', stone: '#d9dbde', dark: '#11151b',
  screen: '#8fb4ff', glass: '#9fb3c6', tower: '#151c28', towerFar: '#111723', window: '#ffd8a0', windowCool: '#bcd3ff',
  leather: '#2b2521', warm: '#ffcf8a', pot: '#2d333b', soil: '#2a2119', leaves: ['#355f45', '#4b7a55', '#284c37']
}

/**
 * Luces de la Oficina que solo se ven al anochecer en modo automático (ventanas de la ciudad, lámparas): WorldModel
 * les sube el brillo con officeClock.night y las esconde de día.
 */
export const OFFICE_AFTER_DARK = ['#ffd6a1', '#c5d9ff', '#ffe4bd']

/** Vidrio de verdad (transparente) en los muros cortina y las salas de reuniones. */
export const CORPORATE_GLASS = [OFFICE.glass, HQ.glass]

const WOOD = [OFFICE.oak, HQ.walnut, HQ.walnutDark]
const METAL = [OFFICE.steel, HQ.mullion]
const BRASS = [HQ.brass]
const SOFT = [OFFICE.carpet, OFFICE.chair, OFFICE.fabric, HQ.rug, HQ.leather, OFFICE.soil, HQ.soil]
const STONE = [OFFICE.floor, OFFICE.seam, HQ.floor, HQ.seam, HQ.stone]

/** El acabado de cada pieza: madera, metal, latón, tela, piedra pulida o pintura lisa. */
export function corporateSurface(shape: Solid, color: string): 'wood' | 'alloy' | 'brass' | 'rubber' | 'stone' | 'paint' | 'leaf' {
  if (shape === 'leaf') return 'leaf'
  if (WOOD.includes(color)) return 'wood'
  if (BRASS.includes(color)) return 'brass'
  if (METAL.includes(color)) return 'alloy'
  if (SOFT.includes(color)) return 'rubber'
  if (STONE.includes(color)) return 'stone'
  return 'paint'
}

/** Piezas en coordenadas locales de un mueble, giradas [yaw] alrededor de (x0, z0). */
function placer(m: Model, x0: number, z0: number, yaw: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw)
  const at = (x: number, y: number, z: number): Vec => [x0 + x * c + z * s, y, z0 - x * s + z * c]
  return {
    box: (p: Vec, size: Vec, color: string, glow = 0) => m.box(at(...p), size, color, glow, [0, yaw, 0]),
    add: (shape: Solid, p: Vec, size: Vec, color: string, glow = 0) => m.add(shape, at(...p), size, color, glow, [0, yaw, 0]),
    at
  }
}

/** Silla de oficina: base de cinco radios, columna, asiento y respaldo. Mira hacia -z local. */
function chair(m: Model, x: number, z: number, yaw: number, color: string, frame: string) {
  const p = placer(m, x, z, yaw)
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2
    m.beam(p.at(0, 0.07, 0), p.at(Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3), 0.03, frame)
    m.add('sphere', p.at(Math.cos(a) * 0.3, 0.035, Math.sin(a) * 0.3), [0.035, 0.035, 0.035], '#1d2228')
  }
  m.beam(p.at(0, 0.07, 0), p.at(0, 0.42, 0), 0.035, frame)
  p.add('cushion', [0, 0.47, 0], [0.48, 0.09, 0.46], color)
  p.add('cushion', [0, 0.82, 0.24], [0.46, 0.5, 0.08], color)
  for (const side of [-1, 1]) p.box([side * 0.25, 0.6, 0.02], [0.03, 0.03, 0.32], frame)
}

/** Puesto de trabajo: mesa, pantalla encendida, teclado y silla. La persona mira hacia -z local. */
function desk(m: Model, x: number, z: number, yaw: number, o: { top: string; leg: string; screen: string; glow: string; seat: string }) {
  const p = placer(m, x, z, yaw)
  p.box([0, 0.74, 0], [1.5, 0.045, 0.78], o.top)
  for (const side of [-1, 1]) p.box([side * 0.71, 0.36, 0], [0.04, 0.72, 0.7], o.leg)
  p.box([0, 0.5, -0.36], [1.38, 0.38, 0.02], o.leg)
  p.box([0, 0.79, -0.26], [0.2, 0.012, 0.14], o.screen)
  p.box([0, 0.92, -0.26], [0.04, 0.26, 0.03], o.screen)
  p.box([0, 1.12, -0.25], [0.66, 0.4, 0.035], o.screen)
  p.box([0, 1.12, -0.23], [0.6, 0.34, 0.006], o.glow, 0.45)
  p.box([0, 0.77, 0.04], [0.42, 0.015, 0.13], '#d7dbe0')
  p.box([0.32, 0.77, 0.06], [0.07, 0.02, 0.11], '#d7dbe0')
  chair(m, p.at(0, 0, 0.62)[0], p.at(0, 0, 0.62)[2], yaw, o.seat, o.leg)
}

/** Planta en maceta: tallos y hojas grandes. */
function plant(m: Model, x: number, z: number, h: number, pot: string, soil: string, leaves: string[], seed: number) {
  m.add('planter', [x, 0.28 * h, z], [0.34 * h, 0.56 * h, 0.34 * h], pot)
  m.add('cylinder', [x, 0.56 * h, z], [0.28 * h, 0.02, 0.28 * h], soil)
  for (let j = 0; j < 14; j++) {
    const a = j * 2.399 + seed, r = 0.12 + (j % 4) * 0.07, y = 0.75 * h + (j % 5) * 0.16 * h
    m.beam([x, 0.55 * h, z], [x + Math.cos(a) * r, y, z + Math.sin(a) * r], 0.012, '#4c6b3d')
    m.add('leaf', [x + Math.cos(a) * (r + 0.1), y + 0.05, z + Math.sin(a) * (r + 0.1)], [0.18 * h, 0.42 * h, 0.2], leaves[j % leaves.length], 0, [0.9 + (j % 3) * 0.25, -a + Math.PI / 2, 0.3 * Math.sin(j)])
  }
}

/** Seto bajo en jardinera alargada (cierra el borde de delante). */
function hedge(m: Model, x: number, z: number, w: number, box: string, leaves: string[], seed: number) {
  m.box([x, 0.28, z], [w, 0.56, 0.8], box)
  for (let j = 0; j < Math.round(w * 22); j++) {
    const lx = x - w / 2 + 0.2 + rnd(j + seed) * (w - 0.4), lz = z - 0.28 + rnd(j * 3 + seed) * 0.56
    m.add('leaf', [lx, 0.7 + rnd(j * 7 + seed) * 0.3, lz], [0.2, 0.44, 0.2], leaves[j % leaves.length], 0, [0.7 + rnd(j) * 0.6, rnd(j * 5) * 6.28, 0.2])
  }
}

/** Ciudad lejana al otro lado del cristal: bloques con ventanas (encendidas de noche). */
function skyline(m: Model, near: string, far: string, night: boolean, detail: boolean) {
  for (let i = 0; i < 30; i++) {
    const x = -96 + i * 6.6 + rnd(i) * 3, z = -50 - rnd(i * 3) * 45, w = 4 + rnd(i * 5) * 5, d = 4 + rnd(i * 7) * 4
    const h = 14 + rnd(i * 11) * 26, color = night ? (z < -72 ? far : near) : [near, far, '#c5d1dc'][i % 3]
    m.box([x, h / 2 - 22, z], [w, h, d], color)
    m.box([x, h - 22 + 0.25, z], [w * 0.6, 0.5, d * 0.6], color)
    if (!night) {
      // De día, fachadas de vidrio en bandas y montantes.
      for (let y = -20; y < h - 23; y += 1.1) m.box([x, y, z + d / 2 + 0.02], [w * 0.94, 0.55, 0.02], '#a3b9cd')
      for (let k = 1; k < Math.floor(w / 1.2); k++) m.box([x - w / 2 + k * 1.2, h / 2 - 22, z + d / 2 + 0.04], [0.08, h - 1.5, 0.02], color)
      // Las oficinas de enfrente que se encienden al anochecer (modo automático), sobre las bandas de vidrio.
      for (let y = -20, r = 0; y < h - 23; y += 1.1, r++) for (let c = 0; c < Math.floor(w / 0.9); c++) {
        const k = i * 991 + r * 37 + c
        if (rnd(k) > 0.36 || (!detail && r % 2)) continue
        m.box([x - w / 2 + (c + 0.5) * (w / Math.floor(w / 0.9)), y, z + d / 2 + 0.035], [w / Math.floor(w / 0.9) * 0.6, 0.4, 0.02], OFFICE_AFTER_DARK[rnd(k * 3) > 0.25 ? 0 : 1], 1.3)
      }
      continue
    }
    const cols = Math.max(2, Math.floor(w / 0.62)), rows = Math.floor((h - 2) / 0.78)
    for (let r = 0; r < rows; r += detail ? 1 : 2) for (let c = 0; c < cols; c++) {
      const k = i * 997 + r * 31 + c
      if (rnd(k) > 0.34) continue
      m.box([x - w / 2 + (c + 0.5) * (w / cols), -21 + r * 0.78, z + d / 2 + 0.02], [w / cols * 0.62, 0.34, 0.02], rnd(k * 3) > 0.25 ? HQ.window : HQ.windowCool, 1.3)
    }
    if (rnd(i * 13) > 0.6) m.add('sphere', [x, h - 22 + 0.9, z], [0.12, 0.12, 0.12], '#ff5a4a', 2)
  }
}

/** Muro cortina: vidrio, montantes y travesaños, con zócalo y remate. */
function curtainWall(m: Model, a: Vec, b: Vec, height: number, frame: string, glass: string, head: string, step = 2.4) {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]), yaw = Math.atan2(b[0] - a[0], b[2] - a[2]) - Math.PI / 2
  const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2, ux = (b[0] - a[0]) / len, uz = (b[2] - a[2]) / len
  m.box([cx, height / 2, cz], [len, height, 0.03], glass, 0, [0, yaw, 0])
  m.box([cx, 0.06, cz], [len, 0.12, 0.3], frame, 0, [0, yaw, 0])
  m.box([cx, height + 0.2, cz], [len + 0.2, 0.4, 0.5], head, 0, [0, yaw, 0])
  for (const y of [height * 0.36, height * 0.72]) m.box([cx, y, cz], [len, 0.06, 0.12], frame, 0, [0, yaw, 0])
  for (let d = 0; d <= len + 0.01; d += len / Math.max(1, Math.round(len / step))) {
    m.box([a[0] + ux * d, height / 2, a[2] + uz * d], [0.08, height, 0.16], frame, 0, [0, yaw, 0])
  }
}

function office(m: Model, stations: StationConfig[], detail: boolean) {
  const o = OFFICE
  const free = (x: number, z: number, gap = 2.7) => !stations.some(s => Math.hypot(s.position[0] - x, s.position[1] - z) < gap)
  const half = Math.max(17, ...stations.map(s => Math.abs(s.position[0]) + 5)), W = half + 4
  const back = Math.min(-16, ...stations.map(s => s.position[1] - 6)), front = Math.max(14, ...stations.map(s => s.position[1] + 5))
  // Suelo claro pulido en losas grandes y moqueta bajo el equipo.
  m.box([0, -0.24, (back + front + 30) / 2], [W * 2 + 2, 0.4, front + 30 - back], o.floor)
  for (let x = -W + 1; x < W; x += 2.4) m.box([x, -0.038, (back + front + 30) / 2], [0.025, 0.01, front + 30 - back], o.seam)
  for (let z = back + 1.2; z < front + 30; z += 2.4) m.box([0, -0.038, z], [W * 2, 0.01, 0.025], o.seam)
  m.box([0, -0.03, -1.5], [half * 2 - 6, 0.025, 22], o.carpet)
  for (const s of [-1, 1]) m.box([s * (half - 3), -0.025, -1.5], [0.08, 0.03, 22.1], o.carpetEdge)
  for (const z of [-12.5, 9.5]) m.box([0, -0.025, z], [half * 2 - 5.9, 0.03, 0.08], o.carpetEdge)
  // Muro cortina al fondo y a la derecha, con la ciudad de día detrás.
  curtainWall(m, [-W, 0, back], [W, 0, back], 8.6, o.steel, o.glass, o.white)
  curtainWall(m, [W, 0, back], [W, 0, front - 3], 8.6, o.steel, o.glass, o.white)
  skyline(m, o.skyline, o.skylineFar, false, detail)
  // A la izquierda, pared blanca con un panel de listones de roble y una pantalla de la empresa.
  m.box([-W, 4.3, (back + front - 3) / 2], [0.4, 8.6, front - 3 - back], o.wall)
  m.box([-W + 0.24, 2.6, -6], [0.06, 5.2, 9], o.oak)
  for (let z = -10.3; z <= -1.7; z += 0.24) m.box([-W + 0.3, 2.6, z], [0.06, 5.2, 0.1], o.oak)
  m.box([-W + 0.32, 3.1, 3.5], [0.06, 1.6, 2.8], o.dark)
  m.box([-W + 0.36, 3.1, 3.5], [0.01, 1.45, 2.65], o.screen, 0.35)
  for (const [y, w] of [[3.55, 1.6], [3.15, 2.2], [2.75, 1.2]] as const) m.box([-W + 0.37, y, 3.5 - (2.2 - w) / 2], [0.01, 0.12, w], '#e8f0ff', 0.6)
  // Columnas redondas blancas.
  for (const s of [-1, 1]) for (const z of [-2, 6.5]) if (free(s * (half - 2), z, 2.2)) {
    m.add('cylinder', [s * (half - 2), 4.3, z], [0.32, 8.6, 0.32], o.white)
    m.add('cylinder', [s * (half - 2), 0.05, z], [0.4, 0.1, 0.4], o.steel)
  }
  // Puestos de trabajo a la izquierda: bancadas enfrentadas con mampara.
  for (const bx of [-W + 3.4, -W + 6.6]) for (let z = back + 4; z <= 7; z += 2.9) {
    if (!free(bx, z, 3) || Math.abs(bx) < half - 5) continue
    desk(m, bx - 0.45, z, -Math.PI / 2, { top: o.white, leg: o.steel, screen: o.dark, glow: o.screen, seat: o.chair })
    desk(m, bx + 0.45, z, Math.PI / 2, { top: o.white, leg: o.steel, screen: o.dark, glow: o.screen, seat: o.chair })
    m.box([bx, 1.0, z], [0.04, 0.5, 1.5], '#c9d4de')
  }
  // Sala de reuniones de cristal al fondo a la derecha.
  const rx0 = W - 7.5, rz0 = back, rz1 = back + 7
  if (free(rx0 + 3.5, rz0 + 3.5, 4.5)) {
    curtainWall(m, [rx0, 0, rz0], [rx0, 0, rz1], 3.2, o.steel, o.glass, o.white, 1.6)
    curtainWall(m, [rx0, 0, rz1], [W, 0, rz1], 3.2, o.steel, o.glass, o.white, 1.6)
    const tx = rx0 + 3.6, tz = rz0 + 3.6
    m.box([tx, 0.74, tz], [1.4, 0.06, 3.6], o.oak)
    for (const dz of [-1.1, 1.1]) m.box([tx, 0.37, tz + dz], [0.5, 0.72, 0.12], o.steel)
    for (const dz of [-1.2, 0, 1.2]) for (const sx of [-1, 1]) chair(m, tx + sx * 1.15, tz + dz, sx * Math.PI / 2, o.fabric, o.steel)
    m.box([W - 0.35, 2.1, tz], [0.08, 1.3, 2.2], o.dark)
    m.box([W - 0.4, 2.1, tz], [0.01, 1.18, 2.08], o.screen, 0.35)
    plant(m, rx0 + 0.7, rz0 + 0.7, 1.4, o.pot, o.soil, o.leaves, 3)
  }
  // Rincón de descanso delante a la derecha: sofá, mesa baja, alfombra y plantas.
  const lx = W - 3.4, lz = front - 7
  if (free(lx, lz, 3.4)) {
    m.box([lx, -0.02, lz], [4.2, 0.02, 3.6], '#c7ccd2')
    m.add('cushion', [lx + 1.3, 0.25, lz], [0.85, 0.5, 2.6], o.fabric)
    m.add('cushion', [lx + 1.65, 0.65, lz], [0.3, 0.6, 2.6], o.fabric)
    m.add('cushion', [lx, 0.25, lz - 1.55], [2.2, 0.5, 0.8], o.fabric)
    m.add('cylinder', [lx - 0.3, 0.36, lz + 0.2], [0.55, 0.05, 0.55], o.oak)
    m.add('cylinder', [lx - 0.3, 0.17, lz + 0.2], [0.05, 0.34, 0.05], o.steel)
    plant(m, lx + 1.7, lz + 2.1, 1.7, o.pot, o.soil, o.leaves, 7)
  }
  // Plantas altas en las esquinas y seto bajo delante, con el paso libre en el centro.
  for (const [x, z, h, seed] of [[-W + 1.2, back + 1.2, 2, 1], [-W + 1.2, front - 4, 1.8, 2], [W - 8.4, back + 0.9, 1.6, 4]] as const) if (free(x, z, 2)) plant(m, x, z, h, o.pot, o.soil, o.leaves, seed)
  for (const s of [-1, 1]) for (const x of [4.6, 10.4]) if (free(s * x, front - 1, 2.4)) hedge(m, s * x, front - 1, 4.6, o.white, o.leaves, x * 10 + s)
}

function headquarters(m: Model, stations: StationConfig[], detail: boolean) {
  const o = HQ
  const free = (x: number, z: number, gap = 2.7) => !stations.some(s => Math.hypot(s.position[0] - x, s.position[1] - z) < gap)
  const half = Math.max(17, ...stations.map(s => Math.abs(s.position[0]) + 5)), W = half + 4
  const back = Math.min(-16, ...stations.map(s => s.position[1] - 6)), front = Math.max(14, ...stations.map(s => s.position[1] + 5))
  // Piedra oscura pulida, alfombra con cenefa de latón bajo el equipo.
  m.box([0, -0.24, (back + front + 30) / 2], [W * 2 + 2, 0.4, front + 30 - back], o.floor)
  for (let x = -W + 1.5; x < W; x += 3) m.box([x, -0.038, (back + front + 30) / 2], [0.02, 0.01, front + 30 - back], o.seam)
  for (let z = back + 1.5; z < front + 30; z += 3) m.box([0, -0.038, z], [W * 2, 0.01, 0.02], o.seam)
  m.box([0, -0.03, -1.5], [half * 2 - 6, 0.025, 22], o.rug)
  for (const inset of [0.25, 0.55]) {
    for (const s of [-1, 1]) m.box([s * (half - 3 - inset), -0.016, -1.5], [0.05, 0.012, 22 - inset * 2], o.brass)
    for (const z of [-12.5 + inset, 9.5 - inset]) m.box([0, -0.016, z], [half * 2 - 6 - inset * 2, 0.012, 0.05], o.brass)
  }
  // Ventanal de suelo a techo al fondo y a la derecha, con la ciudad de noche.
  curtainWall(m, [-W, 0, back], [W, 0, back], 9, o.mullion, o.glass, o.dark, 3)
  curtainWall(m, [W, 0, back], [W, 0, front - 3], 9, o.mullion, o.glass, o.dark, 3)
  skyline(m, o.tower, o.towerFar, true, detail)
  // A la izquierda, pared de nogal con estantes iluminados y un aparador largo.
  m.box([-W, 4.5, (back + front - 3) / 2], [0.4, 9, front - 3 - back], o.walnutDark)
  for (let z = back + 0.4; z < front - 3; z += 0.36) m.box([-W + 0.24, 4.5, z], [0.07, 9, 0.2], o.walnut)
  for (const zc of [-9, -2.5, 4]) {
    m.box([-W + 0.45, 2.6, zc], [0.5, 3.2, 2.4], o.dark)
    for (const y of [1.4, 2.4, 3.4]) {
      m.box([-W + 0.5, y, zc], [0.44, 0.05, 2.3], o.walnut)
      m.box([-W + 0.5, y + 0.03, zc], [0.4, 0.012, 2.2], o.warm, 0.9)
      for (let k = 0; k < 6; k++) if (rnd(zc * 7 + y * 3 + k) > 0.35) m.box([-W + 0.52, y + 0.2, zc - 0.9 + k * 0.36], [0.26, 0.32 + rnd(k + zc) * 0.08, 0.07 + rnd(k * 3) * 0.05], ['#7d6a54', '#3d4654', '#a39276'][k % 3])
    }
    m.box([-W + 0.8, 0.42, zc], [0.9, 0.84, 2.6], o.walnut)
    m.box([-W + 1.26, 0.86, zc], [0.04, 0.02, 2.4], o.brass)
  }
  // Columnas de piedra clara con anillos de latón.
  for (const [s, z] of [[-1, -2], [1, -2], [1, 6.5]] as const) if (free(s * (half - 2), z, 2.2)) {
    m.box([s * (half - 2), 4.5, z], [0.7, 9, 0.7], o.stone)
    for (const y of [0.15, 3.2]) m.box([s * (half - 2), y, z], [0.76, 0.06, 0.76], o.brass)
  }
  // Sala del consejo de cristal al fondo a la derecha: mesa larga de nogal y sillas de piel.
  const rx0 = W - 8, rz0 = back, rz1 = back + 7.5
  if (free(rx0 + 4, rz0 + 4, 4.5)) {
    curtainWall(m, [rx0, 0, rz0], [rx0, 0, rz1], 3.3, o.mullion, o.glass, o.dark, 1.65)
    curtainWall(m, [rx0, 0, rz1], [W, 0, rz1], 3.3, o.mullion, o.glass, o.dark, 1.65)
    const tx = rx0 + 3.9, tz = rz0 + 3.8
    m.box([tx, 0.74, tz], [1.5, 0.08, 4.4], o.walnut)
    m.box([tx, 0.79, tz], [0.04, 0.005, 4.0], o.brass)
    for (const dz of [-1.4, 1.4]) m.box([tx, 0.36, tz + dz], [0.7, 0.7, 0.3], o.walnutDark)
    for (const dz of [-1.6, -0.55, 0.55, 1.6]) for (const sx of [-1, 1]) chair(m, tx + sx * 1.2, tz + dz, sx * Math.PI / 2, o.leather, o.mullion)
    chair(m, tx, tz - 2.65, 0, o.leather, o.mullion)
    plant(m, rx0 + 0.7, rz1 - 0.7, 1.5, o.pot, o.soil, o.leaves, 5)
  }
  // Recepción delante a la izquierda: mostrador de piedra y nogal con su luz.
  const dx = -W + 4.4, dz = front - 6.5
  if (free(dx, dz, 3.4)) {
    m.box([dx, 0.55, dz], [3.2, 1.1, 0.9], o.walnut)
    m.box([dx, 1.13, dz], [3.4, 0.06, 1.05], o.stone)
    m.box([dx, 0.08, dz + 0.47], [3.0, 0.02, 0.02], o.warm, 1.2)
    desk(m, dx, dz - 0.9, Math.PI, { top: o.walnut, leg: o.mullion, screen: o.dark, glow: o.screen, seat: o.leather })
  }
  // Rincón de espera delante a la derecha: dos butacas, mesa de latón y plantas.
  const lx = W - 3.6, lz = front - 7
  if (free(lx, lz, 3.4)) {
    m.box([lx, -0.02, lz], [3.8, 0.02, 3.2], '#323a47')
    for (const dzz of [-0.9, 0.9]) {
      m.add('cushion', [lx + 0.9, 0.28, lz + dzz], [0.9, 0.5, 0.9], o.leather)
      m.add('cushion', [lx + 1.3, 0.68, lz + dzz], [0.22, 0.65, 0.9], o.leather)
    }
    m.add('cylinder', [lx - 0.5, 0.4, lz], [0.5, 0.04, 0.5], o.stone)
    m.add('cylinder', [lx - 0.5, 0.2, lz], [0.06, 0.4, 0.06], o.brass)
    plant(m, lx + 1.5, lz + 2.1, 1.7, o.pot, o.soil, o.leaves, 9)
  }
  for (const [x, z, h, seed] of [[-W + 1.4, back + 1.2, 2, 11], [W - 8.8, back + 0.9, 1.7, 12]] as const) if (free(x, z, 2)) plant(m, x, z, h, o.pot, o.soil, o.leaves, seed)
  // Aparadores bajos delante, con el paso libre en el centro.
  for (const s of [-1, 1]) for (const x of [4.6, 10.4]) if (free(s * x, front - 1, 2.4)) {
    m.box([s * x, 0.36, front - 1], [4.4, 0.72, 0.7], o.walnut)
    m.box([s * x, 0.735, front - 1], [4.45, 0.03, 0.72], o.stone)
    m.box([s * x, 0.04, front - 0.64], [4.2, 0.02, 0.02], o.warm, 1.1)
    m.add('planter', [s * x + 1.4, 0.98, front - 1], [0.18, 0.5, 0.18], o.pot)
    for (let j = 0; j < 6; j++) m.add('leaf', [s * x + 1.4 + Math.cos(j) * 0.08, 1.36 + j * 0.03, front - 1 + Math.sin(j) * 0.08], [0.1, 0.32, 0.1], o.leaves[j % 3], 0, [0.6, j, 0])
  }
}

/** Entorno de un tema de empresa. */
export function addCorporateWorld(m: Model, style: CorporateWorld, stations: StationConfig[], detail: boolean) {
  if (style === 'oficina') office(m, stations, detail)
  else headquarters(m, stations, detail)
}

/** Plataforma de cada puesto (arriba en y = 0,2, como las de los demás mapas). */
export function addCorporatePlatform(m: Model, style: CorporateWorld) {
  if (style === 'oficina') {
    m.add('cylinder', [0, -0.12, 0], [1.62, 0.36, 1.62], '#c9ced4')
    m.add('cylinder', [0, 0.155, 0], [1.56, 0.09, 1.56], OFFICE.white)
    m.ring([0, 0.205, 0], 1.38, OFFICE.accent, undefined, 0.5)
    m.ring([0, -0.29, 0], 1.6, OFFICE.steel, undefined, 0)
    return
  }
  m.add('cylinder', [0, -0.12, 0], [1.62, 0.36, 1.62], HQ.walnutDark)
  m.add('cylinder', [0, 0.155, 0], [1.56, 0.09, 1.56], HQ.floor)
  m.ring([0, 0.205, 0], 1.42, HQ.brass, undefined, 0.25)
  m.ring([0, 0.205, 0], 1.3, HQ.brass, undefined, 0.1)
  m.ring([0, 0.06, 0], 1.63, HQ.brass, undefined, 0)
}

/** Peana del núcleo: una mesa redonda baja (la esfera de cristal con los documentos flota encima). */
export function addCorporateCore(m: Model, style: CorporateWorld) {
  const top = style === 'oficina' ? OFFICE.white : HQ.walnut, foot = style === 'oficina' ? OFFICE.steel : HQ.brass
  m.add('cylinder', [0, 0.32, 0], [1.25, 0.06, 1.25], top)
  m.add('cylinder', [0, 0.25, 0], [1.1, 0.08, 1.1], style === 'oficina' ? '#d9dee3' : HQ.walnutDark)
  m.ring([0, 0.36, 0], 1.0, foot, undefined, style === 'oficina' ? 0 : 0.2)
  if (style === 'oficina') m.ring([0, 0.355, 0], 1.18, OFFICE.accent, undefined, 0.55)
}
