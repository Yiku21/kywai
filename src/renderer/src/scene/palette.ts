// Colores del espacio digital según el tema (⚙ → «Temas…»). El clásico es índigo con acentos azul eléctrico y
// violeta; los demás recolorean suelo, ciudad, estaciones, circuitos, núcleo y luces. Al cambiar de tema el mundo se
// vuelve a montar (los materiales leen la paleta al crearse) y los compartidos se repintan con onPalette.
import * as THREE from 'three'

export const FOG_NEAR = 28
export const FOG_FAR = 62

type V3 = [number, number, number]

export interface ScenePalette {
  /** Tema claro: los brillos se mezclan normal (sumados, sobre un fondo claro, no se verían). */
  light: boolean
  bg: string
  fog: string
  /** Suelo: losas (de A a B), juntas, losas encendidas, resplandor bajo el proyecto y hacia los lados. */
  floorA: V3
  floorB: V3
  floorLine: V3
  floorTile: V3
  floorGlow: V3
  floorSide: V3
  /** Ciudad: fachadas (de A a B), ventanas, ventanas lejanas, cornisas y tejados. */
  cityA: V3
  cityB: V3
  windows: [V3, V3, V3]
  windowDim: V3
  edges: [V3, V3]
  roof: V3
  /** Acentos: principal (en el clásico, azul), secundario (violeta) y terciario (cian). */
  primary: string
  secondary: string
  accent: string
  /** Cuerpos de estaciones, núcleo y zonas. */
  body: string
  bodyTop: string
  /** Aro de las estaciones, su borde bajo y el acento en reposo. */
  rim: string
  rimLow: string
  idle: string
  lights: {
    sky: string
    ground: string
    hemi: number
    ambient: string
    ambientI: number
    key: string
    keyI: number
    fill: string
    fillI: number
    env: [string, string, string, string]
  }
  /** Fuerza del viñeteado de los bordes (en claro, poco). */
  vignette: number
  /** Tinta del texto de los paneles holográficos (blanco; en los temas claros, oscura para que se lea). */
  ink?: V3
  /** Decoración propia del tema (Decor.tsx) y disfraces de los robots (costumes.ts). */
  decor?: DecorId
  /** Forma del núcleo: la esfera de siempre, un cristal, un tejido, una calabaza o una bola de nieve. */
  core?: CoreStyle
  /** Cuentas de luz a lo largo de los circuitos del suelo (bombillas en Navidad, brasas en Halloween…). */
  beads?: { color: string; spacing: number; size: number; flicker: number }
  /** Paneles de las zonas como cristal esmerilado (opacidad del fondo y su color). */
  frost?: { opacity: number; color: V3 }
  /** Parte de ventanas encendidas en la ciudad (0.7 = el 30 %). */
  lit?: number
  /** Fuerza del bloom (1 normal): más en los temas de luces. */
  bloom?: number
  /** Suelo de adoquines en vez de losas. */
  cobble?: boolean
  /** Ventanas en arco en la ciudad. */
  arch?: boolean
  /** Aristas verticales encendidas en los edificios (fuerza). */
  corners?: number
  /** Trama de hilos en el suelo. */
  weave?: boolean
}

export type DecorId = 'relicario' | 'telar' | 'halloween' | 'navidad'
export type CoreStyle = 'sphere' | 'crystal' | 'weave' | 'pumpkin' | 'globe'

const CLASSIC: ScenePalette = {
  light: false,
  bg: '#04051a',
  fog: '#06071e',
  floorA: [0.016, 0.02, 0.058],
  floorB: [0.03, 0.036, 0.09],
  floorLine: [0.2, 0.32, 0.95],
  floorTile: [0.25, 0.3, 1.0],
  floorGlow: [0.06, 0.16, 0.5],
  floorSide: [0.12, 0.05, 0.3],
  cityA: [0.014, 0.017, 0.05],
  cityB: [0.035, 0.042, 0.11],
  windows: [
    [0.35, 0.95, 1.0],
    [0.62, 0.42, 1.0],
    [0.28, 0.5, 1.0]
  ],
  windowDim: [0.3, 0.48, 1.0],
  edges: [
    [0.25, 0.45, 1.0],
    [0.55, 0.35, 1.0]
  ],
  roof: [0.02, 0.03, 0.08],
  primary: '#3f7bff',
  secondary: '#8b5cff',
  accent: '#38d6ff',
  body: '#131733',
  bodyTop: '#1a2045',
  rim: '#4f8dff',
  rimLow: '#4f7dff',
  idle: '#5f8fb8',
  lights: {
    sky: '#3a3f9e',
    ground: '#05061a',
    hemi: 0.8,
    ambient: '#9aa6ff',
    ambientI: 0.22,
    key: '#dfe4ff',
    keyI: 1.15,
    fill: '#7c6bff',
    fillI: 0.4,
    env: ['#d8efff', '#4a6dff', '#8b6bff', '#9a6bff']
  },
  vignette: 0.55
}

// ---------- Colores en sRGB (como se escriben en CSS) ----------

const rgbOf = (hex: string): V3 => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as V3
}
const hexOf = (c: V3): string => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')
const mixRgb = (a: V3, b: V3, t: number): V3 => a.map((v, i) => v + (b[i] - v) * t) as V3
const mixHex = (a: string, b: string, t: number): string => hexOf(mixRgb(rgbOf(a), rgbOf(b), t))

function hslOf([r, g, b]: V3): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s, l }
}

/** Un tema a partir de sus colores base: el borde bajo de las estaciones y el acento en reposo se derivan. */
function theme(p: Omit<ScenePalette, 'rimLow' | 'idle'>): ScenePalette {
  return { ...p, rimLow: p.rim, idle: mixHex(p.primary, p.body, 0.45) }
}

export type SceneThemeId = 'clasico' | 'orbita' | 'marfil' | 'grafito' | 'bosque' | 'matrix' | 'eva' | 'relicario' | 'telar' | 'halloween' | 'navidad'

export const PALETTES: Record<SceneThemeId, ScenePalette> = {
  clasico: CLASSIC,
  orbita: CLASSIC,
  // Claro y cálido: suelo de piedra, ciudad blanca con ventanas doradas, circuitos verdes y aros dorados.
  marfil: theme({
    light: true,
    bg: '#ece7dc',
    fog: '#e8e2d5',
    floorA: [0.86, 0.84, 0.78],
    floorB: [0.91, 0.89, 0.83],
    floorLine: [-1.6, -1.0, -1.4],
    floorTile: [0.3, 0.3, 0.2],
    floorGlow: [0.06, 0.06, 0.03],
    floorSide: [-0.06, -0.04, -0.06],
    cityA: [0.8, 0.78, 0.72],
    cityB: [0.94, 0.92, 0.87],
    windows: [
      [0.92, 0.72, 0.38],
      [0.48, 0.66, 0.54],
      [0.96, 0.84, 0.55]
    ],
    windowDim: [0.74, 0.72, 0.66],
    edges: [
      [0.76, 0.6, 0.32],
      [0.42, 0.62, 0.48]
    ],
    roof: [0.04, 0.04, 0.03],
    primary: '#2f8f68',
    secondary: '#c49a4a',
    accent: '#3fae84',
    body: '#d6cfbf',
    bodyTop: '#ebe5d8',
    rim: '#c49a4a',
    lights: {
      sky: '#fffaf0',
      ground: '#bfb6a2',
      hemi: 1.0,
      ambient: '#ffffff',
      ambientI: 0.55,
      key: '#fff6e6',
      keyI: 1.3,
      fill: '#cfe6da',
      fillI: 0.4,
      env: ['#ffffff', '#e8dcc0', '#cfe8da', '#d9cdb4']
    },
    vignette: 0.18,
    ink: [0.02, 0.16, 0.1]
  }),
  // Negro grafito con oro: losas oscuras, ventanas cálidas y aros dorados.
  grafito: theme({
    light: false,
    bg: '#0c0d0f',
    fog: '#111214',
    floorA: [0.035, 0.036, 0.04],
    floorB: [0.055, 0.056, 0.06],
    floorLine: [0.45, 0.4, 0.32],
    floorTile: [0.6, 0.5, 0.3],
    floorGlow: [0.2, 0.15, 0.08],
    floorSide: [0.1, 0.08, 0.05],
    cityA: [0.03, 0.03, 0.035],
    cityB: [0.07, 0.07, 0.075],
    windows: [
      [1.0, 0.82, 0.5],
      [0.9, 0.9, 0.92],
      [1.0, 0.7, 0.35]
    ],
    windowDim: [0.6, 0.5, 0.35],
    edges: [
      [0.85, 0.65, 0.35],
      [0.7, 0.7, 0.72]
    ],
    roof: [0.03, 0.03, 0.03],
    primary: '#d9a24a',
    secondary: '#9a9ea8',
    accent: '#f0c070',
    body: '#1b1d21',
    bodyTop: '#25282d',
    rim: '#d9a24a',
    lights: {
      sky: '#8a8a92',
      ground: '#08080a',
      hemi: 0.8,
      ambient: '#d8d8e0',
      ambientI: 0.25,
      key: '#fff1dc',
      keyI: 1.15,
      fill: '#c08a40',
      fillI: 0.35,
      env: ['#fff3e0', '#c8a060', '#a0a4ae', '#b08850']
    },
    vignette: 0.55
  }),
  // Verde bosque: losas verdes muy oscuras, circuitos verdes claros y aros dorados.
  bosque: theme({
    light: false,
    bg: '#07120d',
    fog: '#0a1711',
    floorA: [0.025, 0.05, 0.035],
    floorB: [0.04, 0.075, 0.05],
    floorLine: [0.45, 0.75, 0.5],
    floorTile: [0.6, 0.9, 0.6],
    floorGlow: [0.15, 0.3, 0.15],
    floorSide: [0.15, 0.12, 0.05],
    cityA: [0.02, 0.04, 0.03],
    cityB: [0.05, 0.09, 0.065],
    windows: [
      [1.0, 0.85, 0.5],
      [0.6, 1.0, 0.7],
      [0.95, 0.75, 0.4]
    ],
    windowDim: [0.5, 0.6, 0.4],
    edges: [
      [0.85, 0.7, 0.35],
      [0.5, 0.85, 0.6]
    ],
    roof: [0.02, 0.04, 0.03],
    primary: '#7fd6a0',
    secondary: '#d4af5a',
    accent: '#b7f0c8',
    body: '#10241a',
    bodyTop: '#173325',
    rim: '#d4af5a',
    lights: {
      sky: '#4f8a62',
      ground: '#04100a',
      hemi: 0.8,
      ambient: '#cfeedd',
      ambientI: 0.22,
      key: '#f3ffe9',
      keyI: 1.1,
      fill: '#d4af5a',
      fillI: 0.35,
      env: ['#e8fff0', '#5fbf86', '#d4af5a', '#3f9a6a']
    },
    vignette: 0.55
  }),
  // Matrix: negro con verde neón en circuitos, ventanas, aros y núcleo.
  matrix: theme({
    light: false,
    bg: '#010502',
    fog: '#020a04',
    floorA: [0.006, 0.02, 0.008],
    floorB: [0.012, 0.04, 0.016],
    floorLine: [0.1, 0.95, 0.35],
    floorTile: [0.2, 1.0, 0.4],
    floorGlow: [0.04, 0.4, 0.12],
    floorSide: [0.02, 0.2, 0.06],
    cityA: [0.004, 0.018, 0.008],
    cityB: [0.015, 0.05, 0.022],
    windows: [
      [0.35, 1.0, 0.5],
      [0.15, 0.8, 0.3],
      [0.6, 1.0, 0.7]
    ],
    windowDim: [0.1, 0.5, 0.2],
    edges: [
      [0.2, 1.0, 0.4],
      [0.1, 0.7, 0.3]
    ],
    roof: [0.0, 0.03, 0.01],
    primary: '#2bff6a',
    secondary: '#119a44',
    accent: '#8dffb0',
    body: '#06110a',
    bodyTop: '#0b1c11',
    rim: '#2bff6a',
    lights: {
      sky: '#1d6b35',
      ground: '#010502',
      hemi: 0.8,
      ambient: '#9dffb8',
      ambientI: 0.2,
      key: '#d9ffe4',
      keyI: 1.0,
      fill: '#2bff6a',
      fillI: 0.35,
      env: ['#d9ffe4', '#2bff6a', '#119a44', '#0b5c2a']
    },
    vignette: 0.6
  }),
  // EVA-01: morado con verde lima, como la Unidad 01.
  eva: theme({
    light: false,
    bg: '#130822',
    fog: '#180b2b',
    floorA: [0.04, 0.018, 0.07],
    floorB: [0.065, 0.033, 0.11],
    floorLine: [0.6, 1.0, 0.2],
    floorTile: [0.65, 1.0, 0.25],
    floorGlow: [0.25, 0.4, 0.06],
    floorSide: [0.3, 0.12, 0.5],
    cityA: [0.05, 0.025, 0.09],
    cityB: [0.1, 0.055, 0.17],
    windows: [
      [0.7, 1.0, 0.25],
      [1.0, 0.55, 0.15],
      [0.75, 0.5, 1.0]
    ],
    windowDim: [0.4, 0.5, 0.15],
    edges: [
      [0.65, 1.0, 0.2],
      [0.55, 0.3, 0.95]
    ],
    roof: [0.04, 0.02, 0.07],
    primary: '#a6ff3a',
    secondary: '#7b3cff',
    accent: '#c9ff6e',
    body: '#2a1748',
    bodyTop: '#36205c',
    rim: '#a6ff3a',
    lights: {
      sky: '#5b2fa0',
      ground: '#0a0414',
      hemi: 0.8,
      ambient: '#d6c2ff',
      ambientI: 0.22,
      key: '#f2e9ff',
      keyI: 1.1,
      fill: '#a6ff3a',
      fillI: 0.35,
      env: ['#efe6ff', '#7b3cff', '#a6ff3a', '#5a2aa8']
    },
    vignette: 0.55
  }),
  // Relicario: cristal y oro sobre negro pulido; el núcleo es un cristal tallado.
  relicario: theme({
    light: false,
    bg: '#06070a',
    fog: '#0a0b0e',
    // Piedra negra pulida en losas grandes, con juntas de oro fino y un charco de luz dorada en el centro.
    floorA: [0.008, 0.008, 0.01],
    floorB: [0.026, 0.024, 0.026],
    floorLine: [0.28, 0.2, 0.08],
    floorTile: [0.6, 0.48, 0.25],
    floorGlow: [0.32, 0.22, 0.09],
    floorSide: [0.05, 0.045, 0.04],
    cityA: [0.012, 0.014, 0.02],
    cityB: [0.05, 0.052, 0.062],
    windows: [
      [1.3, 1.05, 0.65],
      [1.0, 1.02, 1.1],
      [1.25, 0.9, 0.5]
    ],
    windowDim: [0.45, 0.38, 0.26],
    edges: [
      [1.3, 1.0, 0.55],
      [0.95, 0.95, 1.05]
    ],
    roof: [0.02, 0.02, 0.022],
    lit: 0.55,
    corners: 0.9,
    primary: '#e8c27a',
    secondary: '#cfd6e6',
    accent: '#fff1c9',
    body: '#16181d',
    bodyTop: '#262a32',
    rim: '#e8c27a',
    lights: {
      sky: '#9a9aa8',
      ground: '#050506',
      hemi: 0.8,
      ambient: '#e8e8f0',
      ambientI: 0.22,
      key: '#fff1d8',
      keyI: 1.2,
      fill: '#e8c27a',
      fillI: 0.5,
      env: ['#ffffff', '#ffd27a', '#dfe6f4', '#8a7a5a']
    },
    vignette: 0.6,
    beads: { color: '#ffe2a0', spacing: 0.55, size: 0.08, flicker: 0.9 },
    bloom: 1.3,
    frost: { opacity: 0.6, color: [0.02, 0.022, 0.028] },
    decor: 'relicario',
    core: 'crystal'
  }),
  // Telar: hilos de plata tejidos en membranas, con destellos dorados; el núcleo es una cinta entrelazada.
  telar: theme({
    light: false,
    bg: '#0a0b0f',
    fog: '#0e1015',
    // Pizarra oscura con una trama de hilos de plata en diagonal.
    floorA: [0.02, 0.022, 0.028],
    floorB: [0.04, 0.042, 0.05],
    floorLine: [0.42, 0.44, 0.5],
    floorTile: [0.5, 0.48, 0.45],
    floorGlow: [0.16, 0.15, 0.13],
    floorSide: [0.06, 0.06, 0.08],
    cityA: [0.018, 0.019, 0.024],
    cityB: [0.05, 0.052, 0.06],
    windows: [
      [1.0, 1.04, 1.12],
      [1.2, 1.0, 0.7],
      [0.85, 0.9, 1.05]
    ],
    windowDim: [0.36, 0.38, 0.45],
    edges: [
      [0.95, 0.98, 1.08],
      [1.2, 1.0, 0.65]
    ],
    roof: [0.02, 0.02, 0.025],
    lit: 0.6,
    corners: 0.55,
    weave: true,
    primary: '#c9d0de',
    secondary: '#f0c27a',
    accent: '#ffffff',
    body: '#1c1e24',
    bodyTop: '#2a2c34',
    rim: '#d8dce6',
    lights: {
      sky: '#8a8fa0',
      ground: '#060608',
      hemi: 0.8,
      ambient: '#e4e6f0',
      ambientI: 0.24,
      key: '#f4f2ff',
      keyI: 1.15,
      fill: '#f0c27a',
      fillI: 0.4,
      env: ['#ffffff', '#c9d0de', '#f0c27a', '#6a6f80']
    },
    vignette: 0.6,
    beads: { color: '#fff3dc', spacing: 0.4, size: 0.075, flicker: 0.9 },
    bloom: 1.25,
    frost: { opacity: 0.55, color: [0.022, 0.024, 0.03] },
    decor: 'telar',
    core: 'weave'
  }),
  // Halloween: noche morada, ventanas y velas naranjas, calabazas; el núcleo es una calabaza encendida.
  halloween: theme({
    light: false,
    bg: '#0d0714',
    fog: '#170b22',
    // Adoquines oscuros con un charco de luz naranja en el centro y bruma morada hacia los lados.
    floorA: [0.03, 0.024, 0.04],
    floorB: [0.075, 0.055, 0.08],
    floorLine: [0.6, 0.3, 0.08],
    floorTile: [1.0, 0.5, 0.12],
    floorGlow: [0.45, 0.18, 0.04],
    floorSide: [0.25, 0.08, 0.4],
    cityA: [0.025, 0.02, 0.035],
    cityB: [0.07, 0.055, 0.085],
    windows: [
      [1.4, 0.7, 0.2],
      [1.3, 0.9, 0.4],
      [1.2, 0.5, 0.15]
    ],
    windowDim: [0.6, 0.3, 0.1],
    edges: [
      [0.5, 0.25, 0.08],
      [0.3, 0.15, 0.45]
    ],
    roof: [0.03, 0.02, 0.04],
    lit: 0.55,
    arch: true,
    cobble: true,
    primary: '#ff8a1f',
    secondary: '#8a4dff',
    accent: '#ffc15a',
    body: '#1d1622',
    bodyTop: '#2a2030',
    rim: '#ff8a1f',
    lights: {
      sky: '#5a3a8a',
      ground: '#0a050e',
      hemi: 0.75,
      ambient: '#d8c0ff',
      ambientI: 0.2,
      key: '#ffd0a0',
      keyI: 0.95,
      fill: '#ff8a1f',
      fillI: 0.55,
      env: ['#ffe0c0', '#ff8a1f', '#8a4dff', '#5a2a8a']
    },
    vignette: 0.65,
    beads: { color: '#ff8a2a', spacing: 0.42, size: 0.1, flicker: 0.7 },
    bloom: 1.35,
    frost: { opacity: 0.94, color: [0.032, 0.027, 0.042] },
    decor: 'halloween',
    core: 'pumpkin'
  }),
  // Navidad: suelo nevado, plataformas como regalos, luces doradas; el núcleo es una bola de nieve con su árbol.
  navidad: theme({
    light: false,
    bg: '#0b1424',
    fog: '#0d1626',
    // Losas de hielo: gris azulado con las juntas más oscuras y un charco de luz cálida en el centro.
    floorA: [0.045, 0.058, 0.082],
    floorB: [0.08, 0.094, 0.122],
    floorLine: [-0.05, -0.05, -0.04],
    floorTile: [0.6, 0.45, 0.25],
    floorGlow: [0.5, 0.32, 0.1],
    floorSide: [0.0, 0.01, 0.03],
    cityA: [0.05, 0.06, 0.09],
    cityB: [0.14, 0.16, 0.2],
    windows: [
      [1.3, 0.9, 0.5],
      [1.2, 0.75, 0.4],
      [1.0, 0.85, 0.6]
    ],
    windowDim: [0.5, 0.38, 0.22],
    edges: [
      [1.4, 1.0, 0.5],
      [1.2, 0.9, 0.5]
    ],
    roof: [0.55, 0.6, 0.66],
    lit: 0.45,
    primary: '#e8b84a',
    secondary: '#d83a3a',
    accent: '#3fbf6a',
    body: '#174a2e',
    bodyTop: '#eef3f7',
    rim: '#e8b84a',
    lights: {
      sky: '#7f95c0',
      ground: '#1a2232',
      hemi: 0.85,
      ambient: '#c8d4f0',
      ambientI: 0.28,
      key: '#ffe6c4',
      keyI: 1.15,
      fill: '#ffb860',
      fillI: 0.5,
      env: ['#fff4e0', '#ffcf80', '#d83a3a', '#3fbf6a']
    },
    vignette: 0.6,
    beads: { color: '#ffd38a', spacing: 0.32, size: 0.12, flicker: 0.25 },
    bloom: 1.5,
    frost: { opacity: 0.74, color: [0.11, 0.17, 0.19] },
    decor: 'navidad',
    core: 'globe'
  })
}

/** La paleta del tema actual (se cambia con setScenePalette antes de montar el mundo). */
export let palette: ScenePalette = CLASSIC

const listeners = new Set<(p: ScenePalette) => void>()

/** Repinta materiales compartidos (creados una vez al cargar el módulo) con cada paleta, también la actual. */
export function onPalette(fn: (p: ScenePalette) => void): void {
  listeners.add(fn)
  fn(palette)
}

export function setScenePalette(id: string): void {
  const next = PALETTES[id as SceneThemeId] ?? CLASSIC
  if (next === palette) return
  palette = next
  listeners.forEach((fn) => fn(next))
}

/** Mezcla de los brillos: sumados en los temas oscuros; normales en los claros (sumados no se verían). */
export function glowBlending(): THREE.Blending {
  return palette.light ? THREE.NormalBlending : THREE.AdditiveBlending
}

/**
 * Un color de la escena clásica pasado al tema actual: los azules al principal, los violetas al secundario, los cian
 * al terciario (con la misma claridad relativa) y los cuerpos oscuros al de las estaciones. Los demás tonos (verde,
 * rojo, los colores de cada agente) se quedan. En el clásico devuelve el mismo color.
 */
export function tone(hex: string): string {
  const p = palette
  if (p === CLASSIC) return hex
  const src = rgbOf(hex)
  const { h, l } = hslOf(src)
  if (l < 0.2) return mixHex(p.body, p.bodyTop, Math.min(1, Math.max(0, (l - 0.09) / 0.09)))
  if (h < 185 || h > 275) return hex
  const target = h < 212 ? p.accent : h < 240 ? p.primary : p.secondary
  const ref = hslOf(rgbOf(target)).l
  // Los tonos claros se acercan al blanco; en un tema claro, al revés (sobre marfil el blanco no se ve).
  if (l > ref) return mixHex(target, p.light ? '#24302a' : '#ffffff', ((l - ref) / (1 - ref)) * (p.light ? 0.4 : 1))
  return mixHex(target, '#000000', (ref - l) / ref)
}

const vec = (v: V3): THREE.Vector3 => new THREE.Vector3(...v)

/** Tinta del texto de los paneles (panelFrag). */
export function panelInk(p: ScenePalette = palette): THREE.Vector3 {
  return vec(p.ink ?? [1, 1, 1])
}

/** Uniforms del cristal esmerilado de los paneles (panelFrag); sin él, los hologramas de siempre. */
export function panelFrost(p: ScenePalette = palette): { uFrost: { value: number }; uFrostColor: { value: THREE.Vector3 } } {
  return { uFrost: { value: p.frost?.opacity ?? 0 }, uFrostColor: { value: vec(p.frost?.color ?? [0, 0, 0]) } }
}

/** Colores del suelo para su shader (floorFrag). */
export function floorUniforms(p: ScenePalette = palette): Record<string, { value: THREE.Vector3 | number }> {
  return {
    uFloorA: { value: vec(p.floorA) },
    uFloorB: { value: vec(p.floorB) },
    uFloorLine: { value: vec(p.floorLine) },
    uFloorTile: { value: vec(p.floorTile) },
    uFloorGlow: { value: vec(p.floorGlow) },
    uFloorSide: { value: vec(p.floorSide) },
    uCobble: { value: p.cobble ? 1 : 0 },
    uWeave: { value: p.weave ? 1 : 0 }
  }
}

/** Colores de la ciudad para su shader (cityFrag). */
export function cityUniforms(p: ScenePalette = palette): Record<string, { value: THREE.Vector3 | number }> {
  return {
    uCityA: { value: vec(p.cityA) },
    uCityB: { value: vec(p.cityB) },
    uWin0: { value: vec(p.windows[0]) },
    uWin1: { value: vec(p.windows[1]) },
    uWin2: { value: vec(p.windows[2]) },
    uWinDim: { value: vec(p.windowDim) },
    uEdge0: { value: vec(p.edges[0]) },
    uEdge1: { value: vec(p.edges[1]) },
    uRoof: { value: vec(p.roof) },
    uLight: { value: p.light ? 1 : 0 },
    uLit: { value: p.lit ?? 0.7 },
    uArch: { value: p.arch ? 1 : 0 },
    uCorner: { value: p.corners ?? 0 }
  }
}
