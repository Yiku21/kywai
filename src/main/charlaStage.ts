// El plató 3D de «Charla y tutorial» con los robots de kywai: Hermes, Claude y Codex hechos en three.js (no imágenes
// fijas) que hablan de verdad (boca y cuerpo al ritmo de cada sílaba), miran a quien habla, reaccionan con la emoción
// de cada frase (saltan si se sorprenden, se ríen, se agachan si están tristes…) y una cámara de cine que cambia de
// plano cuando cambia quién habla (general, primer plano, por encima del hombro, la pantalla) y nunca está quieta
// (acercamientos, arcos, grúa y cámara en mano). Detrás, una pantalla gigante muestra la imagen de cada paso.
// Todo es una función del tiempo de la línea de GSAP: HyperFrames salta de fotograma en fotograma y sale igual.
import { round, sceneWords, timedWords, VOICE_LEAD_S, type TimedWord, type VideoScript, type VideoTimeline } from './videoScript'

export type RobotLook = 'hermes' | 'claude' | 'codex'

/** Los robots que sabe hacer el plató (por el nombre del personaje del diálogo). */
const LOOKS: Record<string, RobotLook> = { hermes: 'hermes', claude: 'claude', codex: 'codex' }

/** Los dos personajes del diálogo, si los dos son robots de kywai (si no, el vídeo va con imágenes). */
export function stageLooks(script: Pick<VideoScript, 'speakers'>): [RobotLook, RobotLook] | null {
  const s = script.speakers ?? []
  if (s.length !== 2) return null
  const a = LOOKS[s[0].name.trim().toLowerCase()]
  const b = LOOKS[s[1].name.trim().toLowerCase()]
  return a && b && a !== b ? [a, b] : null
}

export type ShotKind = 'wide' | 'close0' | 'close1' | 'ots0' | 'ots1' | 'screen'
export type ShotMove = 'push' | 'pull' | 'arcL' | 'arcR' | 'crane'

export interface StageShot {
  start: number
  end: number
  kind: ShotKind
  move: ShotMove
}

export interface StageLine {
  /** Quién habla (0 o 1) o -1 si no se sabe. */
  who: number
  start: number
  end: number
  emotion: string
}

export interface StageData {
  looks: [RobotLook, RobotLook]
  total: number
  /** Sílabas de cada robot: [quién, inicio, duración, apertura de la boca]. */
  syl: [number, number, number, number][]
  lines: StageLine[]
  shots: StageShot[]
  /** Qué imagen sale en la pantalla gigante desde cada momento: [inicio, índice de la imagen o -1]. */
  screens: [number, number][]
  /** Momentos en que se marca un punto de la tarjeta (quien habla da un saltito). */
  ticks: number[]
  outroStart: number
  accent: string
  accent2: string
}

function syllables(word: string): number {
  const m = word.toLowerCase().match(/[aeiouáéíóúüàèìòùâêîôûy]+/g)
  return Math.max(1, Math.min(4, m ? m.length : 1))
}

/** Las frases de una escena con quién las dice, su emoción y cuándo suenan. */
function sceneLines(sc: VideoScript['scenes'][number], words: TimedWord[], end: number, names: string[]): StageLine[] {
  const L = sc.lines ?? []
  if (!L.length) return words.length ? [{ who: names.indexOf(words[0].who ?? ''), start: words[0].start, end, emotion: 'neutral' }] : []
  const out: StageLine[] = []
  let i = 0
  for (const l of L) {
    const n = timedWords(l.text, 0, 1).length
    const part = words.slice(i, i + n)
    i += n
    if (part.length) out.push({ who: names.indexOf(l.who ?? ''), start: part[0].start, end: 0, emotion: l.emotion })
  }
  out.forEach((l, k) => (l.end = k + 1 < out.length ? out[k + 1].start : end))
  return out
}

/**
 * El plan de cámara de una escena: el primer turno en plano general (o mirando a la pantalla si es un paso) y cada
 * cambio de quién habla, un corte a un primer plano o a un plano por encima del hombro del otro. Los turnos largos se
 * parten en dos para que la cámara no se quede en lo mismo.
 */
export function planShots(lines: StageLine[], start: number, end: number, step: boolean, seed: number): StageShot[] {
  const moves: ShotMove[] = ['push', 'arcL', 'pull', 'arcR', 'push', 'crane']
  const runs: { who: number; start: number; end: number }[] = []
  for (const l of lines) {
    const last = runs[runs.length - 1]
    if (last && last.who === l.who) last.end = l.end
    else runs.push({ who: l.who, start: l.start, end: l.end })
  }
  if (!runs.length) return [{ start: round(start), end: round(end), kind: 'wide', move: 'crane' }]
  runs[0].start = start
  runs[runs.length - 1].end = end
  const shots: StageShot[] = []
  let m = seed
  runs.forEach((r, k) => {
    const who = r.who < 0 ? 0 : r.who
    const kind: ShotKind = k === 0 ? (step ? 'screen' : 'wide') : ((k % 2 ? `close${who}` : `ots${who}`) as ShotKind)
    const move: ShotMove = k === 0 ? (step ? 'push' : 'crane') : moves[m++ % moves.length]
    const len = r.end - r.start
    if (len > 4.2) {
      const mid = round(r.start + len * 0.55)
      shots.push({ start: round(r.start), end: mid, kind, move })
      shots.push({ start: mid, end: round(r.end), kind: kind === 'wide' ? `close${who}` as ShotKind : 'wide', move: moves[m++ % moves.length] })
    } else shots.push({ start: round(r.start), end: round(r.end), kind, move })
  })
  return shots
}

/** Los datos del plató para un guion ya con voz: sílabas, frases, planos, pantallas y gestos. */
export function buildStageData(script: VideoScript, tl: VideoTimeline, looks: [RobotLook, RobotLook], images: (string | null)[], th: { accent: string; accent2: string }): StageData {
  const names = (script.speakers ?? []).map((s) => s.name)
  const syl: StageData['syl'] = []
  const lines: StageLine[] = []
  const shots: StageShot[] = [{ start: 0, end: tl.intro, kind: 'wide', move: 'crane' }]
  const screens: [number, number][] = [[0, images[0] ? 0 : -1]]
  const ticks: number[] = []
  let r = script.title.length * 7919 + 17
  const rnd = (): number => (r = (r * 1664525 + 1013904223) >>> 0) / 4294967296
  script.scenes.forEach((sc, i) => {
    const t = tl.scenes[i]
    const voiceAt = t.start + VOICE_LEAD_S
    const words = sceneWords(sc, voiceAt, t.voice)
    words.forEach((w, j) => {
      const who = Math.max(0, names.indexOf(w.who ?? ''))
      const end = j + 1 < words.length ? words[j + 1].start : voiceAt + t.voice
      const pause = /[.!?…]$/.test(w.text) ? 6 : /[,;:]$/.test(w.text) ? 3 : 0
      const letters = w.text.replace(/[^\p{L}\p{N}]/gu, '').length + 2
      const speak = (end - w.start) * (letters / (letters + pause))
      const n = syllables(w.text)
      const d = speak / n
      for (let k = 0; k < n; k++) syl.push([who, round(w.start + k * d), round(Math.max(0.06, d)), round(0.55 + rnd() * 0.45)])
    })
    const ls = sceneLines(sc, words, t.start + t.duration, names)
    lines.push(...ls)
    shots.push(...planShots(ls, t.start, t.start + t.duration, !!sc.step, i * 3 + 1))
    screens.push([t.start, images[i] ? i : -1])
    const items = sc.step ? sc.items ?? [] : []
    items.forEach((_, k) => ticks.push(round(voiceAt + (t.voice * (k + 0.6)) / (items.length + 0.4))))
  })
  shots.push({ start: tl.outroStart, end: tl.total, kind: 'wide', move: 'pull' })
  return { looks, total: tl.total, syl, lines, shots, screens, ticks, outroStart: tl.outroStart, accent: th.accent, accent2: th.accent2 }
}

/**
 * El programa del plató (JavaScript para el navegador, módulo). Lee `window.__stage` (los datos), las imágenes de la
 * pantalla de los <img class="stageimg"> y dibuja en el canvas #stage cada vez que la línea de GSAP cambia de tiempo.
 * Necesita assets/three.module.js (y three.core.js) junto al vídeo.
 */
export const STAGE_RUNTIME = String.raw`
import * as THREE from './assets/three.module.js'
const D = window.__stage
const cv = document.getElementById('stage')
const W = cv.width, H = cv.height
const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true })
R.setPixelRatio(1)
R.shadowMap.enabled = true
R.shadowMap.type = THREE.PCFShadowMap
R.toneMapping = THREE.ACESFilmicToneMapping
R.toneMappingExposure = 1.08
R.outputColorSpace = THREE.SRGBColorSpace
const S = new THREE.Scene()
S.background = new THREE.Color('#2b2030')
S.fog = new THREE.Fog('#3b2b38', 9, 20)
const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, flatShading: true }, o || {}))
const gloss = (c, o) => new THREE.MeshPhysicalMaterial(Object.assign({ color: c, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.25 }, o || {}))
const glow = (c, k) => new THREE.MeshStandardMaterial({ color: '#000000', emissive: c, emissiveIntensity: k || 1.6, roughness: 0.4 })
function put(parent, geo, m, x, y, z, rx, ry, rz, sx, sy, sz) {
  const me = new THREE.Mesh(geo, m)
  me.position.set(x || 0, y || 0, z || 0)
  me.rotation.set(rx || 0, ry || 0, rz || 0)
  if (sx) me.scale.set(sx, sy || sx, sz || sx)
  me.castShadow = true
  me.receiveShadow = true
  parent.add(me)
  return me
}

// ---------- la maqueta: una salita de juguete ----------
put(S, new THREE.BoxGeometry(16, 0.3, 12), mat('#c98b5a'), 0, -0.15, 0)
for (let i = -7.5; i < 8; i += 1.1) put(S, new THREE.BoxGeometry(0.035, 0.31, 12), mat('#a86c42'), i, -0.14, 0)
put(S, new THREE.BoxGeometry(16, 9, 0.3), mat('#e7c9a0'), 0, 4.4, -4.2)
put(S, new THREE.BoxGeometry(0.3, 9, 12), mat('#d9b48a'), -6.5, 4.4, 0)
put(S, new THREE.BoxGeometry(0.3, 9, 12), mat('#d9b48a'), 6.5, 4.4, 0)
put(S, new THREE.BoxGeometry(16, 0.25, 0.32), mat('#b98a5e'), 0, 0.12, -4.0)
put(S, new THREE.CylinderGeometry(2.3, 2.3, 0.05, 12), mat(D.accent2, { roughness: 1 }), 0, 0.03, 0.3)
put(S, new THREE.CylinderGeometry(1.9, 1.9, 0.055, 12), mat('#f6e7cf', { roughness: 1 }), 0, 0.04, 0.3)
// la pantalla gigante (muestra la imagen de cada paso)
put(S, new THREE.BoxGeometry(4.7, 2.85, 0.24), mat('#2b2638'), 0, 2.75, -3.9)
const scrMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
const scr = put(S, new THREE.PlaneGeometry(4.4, 2.55), scrMat, 0, 2.75, -3.77)
scr.castShadow = false
const scrGlow = new THREE.PointLight('#ffd9a8', 7, 7, 1.6)
scrGlow.position.set(0, 2.6, -3.0)
S.add(scrGlow)
// estantería, libros, planta, lámpara, cubos de juguete
put(S, new THREE.BoxGeometry(1.8, 0.12, 0.6), mat('#8d5a3b'), -4.6, 2.2, -3.8)
put(S, new THREE.BoxGeometry(1.8, 0.12, 0.6), mat('#8d5a3b'), -4.6, 3.3, -3.8)
;['#ff7a3d', '#3f8f8a', '#f2c14e', '#7c5cbf', '#e8e0d0'].forEach((c, i) => put(S, new THREE.BoxGeometry(0.22, 0.72 - (i % 2) * 0.12, 0.5), mat(c), -5.2 + i * 0.28, 2.62 - (i % 2) * 0.06, -3.8, 0, 0, i === 4 ? 0.28 : 0))
put(S, new THREE.CylinderGeometry(0.42, 0.32, 0.65, 7), mat('#c4553a'), 4.3, 0.33, -2.6)
for (let i = 0; i < 7; i++) put(S, new THREE.ConeGeometry(0.26, 1.3, 5), mat(i % 2 ? '#4c9a52' : '#5fb05f'), 4.3 + Math.cos(i * 0.9) * 0.22, 1.2, -2.6 + Math.sin(i * 0.9) * 0.22, Math.sin(i * 2) * 0.35, 0, Math.cos(i * 2) * 0.35)
put(S, new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), mat('#3a3040'), -3.7, 1.2, -1.6)
put(S, new THREE.ConeGeometry(0.42, 0.45, 12, 1, true), mat('#f2c14e', { side: THREE.DoubleSide }), -3.7, 2.45, -1.6)
const lamp = new THREE.PointLight('#ffcf8a', 5, 5, 1.6)
lamp.position.set(-3.7, 2.2, -1.6)
S.add(lamp)
;[['#ff7a3d', 2.9, 0.25, 1.3], ['#3f8f8a', 3.4, 0.25, 1.75], ['#f2c14e', 3.15, 0.75, 1.5]].forEach((b) => put(S, new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(b[0]), b[1], b[2], b[3], 0, 0.4, 0))
put(S, new THREE.BoxGeometry(1.0, 0.22, 0.7), mat('#7c5cbf'), -2.8, 0.11, 1.6, 0, 0.3, 0)
put(S, new THREE.BoxGeometry(0.92, 0.2, 0.64), mat('#f2c14e'), -2.8, 0.32, 1.6, 0, 0.12, 0)

// ---------- luces de cine ----------
S.add(new THREE.HemisphereLight('#ffe2c0', '#3a2a4a', 0.6))
const key = new THREE.SpotLight('#ffd2a0', 150, 40, 0.55, 0.55, 1.6)
key.position.set(4.5, 8.5, 6.5)
key.castShadow = true
key.shadow.mapSize.set(1024, 1024)
key.shadow.bias = -0.0004
key.target.position.set(0, 0.8, 0)
S.add(key, key.target)
const rim = new THREE.DirectionalLight('#86c8ff', 1.7)
rim.position.set(-5, 5, -5)
S.add(rim)
const fill = new THREE.DirectionalLight('#ffe8d0', 0.35)
fill.position.set(-3, 2, 6)
S.add(fill)

// ---------- los robots ----------
const CREAM = '#fff1d6'
function eyeArc(parent, x, y, z, color) {
  const e = put(parent, new THREE.TorusGeometry(0.075, 0.02, 8, 24, Math.PI), glow(color, 2.2), x, y, z)
  e.castShadow = false
  return e
}
function visor(parent, r, y, w, h) {
  return put(parent, new THREE.SphereGeometry(r, 48, 24, Math.PI * 0.5 - w, w * 2, Math.PI * 0.5 - h, h * 2), gloss('#121018', { roughness: 0.18, clearcoat: 1 }), 0, y, 0)
}
function mouthOf(parent, y, z, color) {
  const m = put(parent, new THREE.CapsuleGeometry(0.035, 0.1, 6, 12), glow(color, 2), 0, y, z, 0, 0, Math.PI / 2)
  m.castShadow = false
  return m
}
function makeClaude() {
  const g = new THREE.Group(), body = new THREE.Group(), face = new THREE.Group()
  g.add(body)
  const skin = gloss('#f26a1b')
  put(body, new THREE.SphereGeometry(0.55, 48, 32), skin, 0, 0.55, 0, 0, 0, 0, 1, 0.94, 0.96)
  const tip = put(body, new THREE.ConeGeometry(0.2, 0.55, 24), skin, 0.2, 1.05, -0.05, 0, 0, -0.75)
  tip.scale.set(1, 1, 0.8)
  body.add(face)
  visor(face, 0.535, 0.62, 0.9, 0.2)
  const eyes = [eyeArc(face, -0.17, 0.6, 0.5, CREAM), eyeArc(face, 0.17, 0.6, 0.5, CREAM)]
  const mouth = mouthOf(face, 0.5, 0.52, CREAM)
  for (let i = 0; i < 8; i++) put(body, new THREE.BoxGeometry(0.018, 0.12, 0.01), glow(CREAM, 1.4), 0, 0.27, 0.5, -0.45, 0, (i * Math.PI) / 8).castShadow = false
  return { g, body, eyes, mouth }
}
function makeHermes() {
  const g = new THREE.Group(), body = new THREE.Group(), face = new THREE.Group()
  g.add(body)
  put(body, new THREE.CapsuleGeometry(0.42, 0.38, 12, 32), gloss('#f4ecdd', { roughness: 0.4 }), 0, 0.62, 0)
  put(body, new THREE.TorusGeometry(0.4, 0.035, 10, 40), gloss('#d4a440', { metalness: 0.8, roughness: 0.3 }), 0, 0.14, 0, Math.PI / 2)
  const hair = gloss('#141218', { roughness: 0.22, clearcoat: 1 })
  put(body, new THREE.SphereGeometry(0.47, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, 0, 0.82, -0.02, 0, 0, 0, 1.04, 0.95, 1.04)
  put(body, new THREE.SphereGeometry(0.2, 20, 14), hair, -0.43, 0.7, 0, 0, 0, 0.2, 0.75, 1.5, 1.05)
  put(body, new THREE.SphereGeometry(0.2, 20, 14), hair, 0.43, 0.7, 0, 0, 0, -0.2, 0.75, 1.5, 1.05)
  put(body, new THREE.CylinderGeometry(0.06, 0.06, 0.06, 16), gloss('#d4a440', { metalness: 0.8 }), 0.47, 0.82, 0.05, 0, 0, Math.PI / 2)
  body.add(face)
  visor(face, 0.445, 0.72, 0.62, 0.22)
  const eyes = [0, 1].map((k) => {
    const e = put(face, new THREE.CircleGeometry(0.075, 24), glow('#ffb21f', 1.25), k ? 0.15 : -0.15, 0.73, 0.43)
    e.castShadow = false
    return e
  })
  const mouth = mouthOf(face, 0.6, 0.43, '#ffb21f')
  const gold = gloss('#d4a440', { metalness: 0.85, roughness: 0.3 })
  put(body, new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), gold, 0, 0.36, 0.43, -0.25)
  put(body, new THREE.TorusGeometry(0.05, 0.01, 6, 16, Math.PI), gold, -0.05, 0.43, 0.42, -0.25, 0, 0.3)
  put(body, new THREE.TorusGeometry(0.05, 0.01, 6, 16, Math.PI), gold, 0.05, 0.43, 0.42, -0.25, 0, -0.3)
  return { g, body, eyes, mouth }
}
function makeCodex() {
  const g = new THREE.Group(), body = new THREE.Group(), face = new THREE.Group()
  g.add(body)
  const sh = new THREE.Shape()
  const w = 0.42, h = 0.4, rr = 0.2
  sh.moveTo(-w + rr, -h); sh.lineTo(w - rr, -h); sh.quadraticCurveTo(w, -h, w, -h + rr); sh.lineTo(w, h - rr); sh.quadraticCurveTo(w, h, w - rr, h)
  sh.lineTo(-w + rr, h); sh.quadraticCurveTo(-w, h, -w, h - rr); sh.lineTo(-w, -h + rr); sh.quadraticCurveTo(-w, -h, -w + rr, -h)
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.1, bevelSegments: 6, curveSegments: 16 })
  geo.translate(0, 0, -0.25)
  put(body, geo, gloss('#1f9d6a'), 0, 0.58, 0)
  body.add(face)
  put(face, new THREE.BoxGeometry(0.62, 0.3, 0.05), gloss('#0d1512', { roughness: 0.15 }), 0, 0.68, 0.4)
  const eyes = [-1, 1].map((k) => {
    const e = new THREE.Group()
    e.position.set(k * 0.14, 0.68, 0.43)
    const m = glow('#5cffb0', 2.4)
    put(e, new THREE.BoxGeometry(0.1, 0.022, 0.01), m, 0, 0.025, 0, 0, 0, k * 0.55).castShadow = false
    put(e, new THREE.BoxGeometry(0.1, 0.022, 0.01), m, 0, -0.025, 0, 0, 0, -k * 0.55).castShadow = false
    face.add(e)
    return e
  })
  const mouth = mouthOf(face, 0.58, 0.43, '#5cffb0')
  return { g, body, eyes, mouth }
}
const MAKE = { hermes: makeHermes, claude: makeClaude, codex: makeCodex }
const X = [-0.62, 0.62]
const bots = D.looks.map((l, i) => {
  const b = MAKE[l]()
  b.g.position.set(X[i], 0, i ? 0.15 : 0)
  S.add(b.g)
  return b
})

// ---------- la pantalla: cada escena con su imagen ----------
const imgs = Array.from(document.querySelectorAll('img.stageimg'))
const texs = imgs.map((im) => {
  const t = new THREE.Texture(im)
  t.colorSpace = THREE.SRGBColorSpace
  return t
})
const blank = (() => {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 296
  const x = c.getContext('2d')
  const gr = x.createLinearGradient(0, 0, 512, 296)
  gr.addColorStop(0, D.accent)
  gr.addColorStop(1, D.accent2)
  x.fillStyle = gr
  x.fillRect(0, 0, 512, 296)
  x.fillStyle = 'rgba(255,255,255,0.85)'
  for (let i = 0; i < 4; i++) x.fillRect(60, 70 + i * 48, 220 + ((i * 97) % 170), 22)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
})()
let shown = null
function screenAt(t) {
  let idx = -1
  for (const s of D.screens) if (t >= s[0]) idx = s[1]
  const im = idx >= 0 ? imgs[idx] : null
  const tex = im && im.complete && im.naturalWidth ? texs[idx] : blank
  if (tex !== shown) {
    if (tex !== blank) tex.needsUpdate = true
    scrMat.map = tex
    scrMat.needsUpdate = true
    shown = tex
  }
}

// ---------- animación ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const ease = (v) => v * v * (3 - 2 * v)
const bell = (t, s, d) => (t < s || t > s + d ? 0 : Math.sin((Math.PI * (t - s)) / d))
function talkOf(i, t) {
  let v = 0
  for (const s of D.syl) if (s[0] === i && t >= s[1] && t <= s[1] + s[2]) v = Math.max(v, s[3] * Math.sin((Math.PI * (t - s[1])) / s[2]))
  return v
}
function lineAt(t) {
  let cur = null
  for (const l of D.lines) if (t >= l.start && t < l.end) cur = l
  return cur
}
function poseBot(i, t) {
  const b = bots[i]
  const other = 1 - i
  const talk = talkOf(i, t)
  const line = lineAt(t)
  const mine = !!line && line.who === i
  const em = line ? line.emotion : 'neutral'
  const k = line ? ease(clamp((t - line.start) / 0.3, 0, 1)) : 0
  const toward = i ? -1 : 1
  let y = 0, rx = 0, ry = 0, rz = 0, sq = 1, eye = 1, eyeY = 1, bright = 1
  // respira siempre (cada uno a su ritmo)
  sq += Math.sin(t * 2.4 + i * 1.7) * 0.012
  y += Math.sin(t * 1.3 + i) * 0.012
  // habla: rebota y se estira con cada sílaba
  y += talk * 0.045
  sq += talk * 0.05
  // mira a quien habla; quien habla mira a cámara y un poco al otro
  ry = line && line.who === other ? toward * 0.55 : mine ? toward * 0.2 : toward * 0.12
  ry += Math.sin(t * 0.9 + i * 2) * 0.05
  if (mine) {
    if (em === 'sorprendido') { y += bell(t, line.start, 0.45) * 0.28; eye = 1 + 0.35 * k; rx = -0.08 * k }
    else if (em === 'emocionado') { y += Math.abs(Math.sin((t - line.start) * 7)) * 0.07 * k; eye = 1.15; bright = 1.3 }
    else if (em === 'alegre') { rz = Math.sin(t * 5.5) * 0.06 * k; bright = 1.15 }
    else if (em === 'gracioso') { rz = Math.sin(t * 16) * 0.1 * k; y += Math.abs(Math.sin(t * 9)) * 0.04 }
    else if (em === 'triste') { y -= 0.05 * k; rx = 0.18 * k; eyeY = 0.55; bright = 0.6; sq -= 0.04 * k }
    else if (em === 'firme') { rx = -0.12 * k; eyeY = 0.75 }
    else if (em === 'susurro') { rz = toward * -0.12 * k; ry += toward * 0.25 * k }
    else if (em === 'calma') { rz = Math.sin(t * 1.6) * 0.03 }
    // asiente al acabar cada frase
    rx += bell(t, line.end - 0.35, 0.35) * 0.12
    for (const tk of D.ticks) y += bell(t, tk, 0.3) * 0.1
  } else if (line && line.who === other) {
    // reacciona a lo que dice el otro
    if (em === 'gracioso') { rz = Math.sin(t * 14) * 0.07; y += Math.abs(Math.sin(t * 8)) * 0.03 }
    else if (em === 'sorprendido') { y += bell(t, line.start + 0.15, 0.35) * 0.12; eye = 1.2 }
    rx += bell(t, line.end - 0.2, 0.45) * 0.16
  }
  // el cierre: los dos saltan y se balancean
  if (t >= D.outroStart) {
    y += Math.abs(Math.sin((t - D.outroStart) * 5 + i * 1.4)) * 0.16
    rz = Math.sin((t - D.outroStart) * 6 + i) * 0.12
    ry = toward * 0.1
  }
  // parpadeo
  const bt = (t + i * 1.3) % 3.7
  const blink = bt < 0.12 ? Math.max(0.1, Math.abs(bt - 0.06) / 0.06) : 1
  b.g.position.y = y
  b.g.rotation.set(rx, ry, rz)
  b.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq))
  b.eyes.forEach((e) => {
    e.scale.set(eye, eye * eyeY * blink, 1)
    if (e.material) {
      if (e.material.userData.k === undefined) e.material.userData.k = e.material.emissiveIntensity
      e.material.emissiveIntensity = e.material.userData.k * bright
    }
  })
  b.mouth.scale.set(1, 0.4 + talk * 1.6, 1)
  b.mouth.material.emissiveIntensity = 0.6 + talk * 2.2
}

// ---------- cámara ----------
const cam = new THREE.PerspectiveCamera(W > H ? 34 : 40, W / H, 0.1, 60)
const V = new THREE.Vector3(), T = new THREE.Vector3(), Q = new THREE.Vector3()
function framing(kind) {
  const v = W < H
  switch (kind) {
    // En vertical los personajes van en la mitad de abajo: arriba están la tarjeta del paso y los subtítulos.
    case 'close0': return v ? [[X[0] + 0.3, 1.3, 3.7], [X[0], 1.2, 0]] : [[X[0] + 0.35, 1.0, 2.4], [X[0], 0.8, 0]]
    case 'close1': return v ? [[X[1] - 0.3, 1.3, 3.8], [X[1], 1.2, 0.15]] : [[X[1] - 0.35, 1.0, 2.5], [X[1], 0.8, 0.15]]
    case 'ots0': return v ? [[X[1] + 0.35, 1.35, 3.4], [X[0], 1.15, 0]] : [[X[1] + 0.45, 1.1, 2.4], [X[0], 0.8, 0]]
    case 'ots1': return v ? [[X[0] - 0.35, 1.35, 3.5], [X[1], 1.15, 0.15]] : [[X[0] - 0.45, 1.1, 2.5], [X[1], 0.8, 0.15]]
    case 'screen': return v ? [[0, 1.05, 6.6], [0, 2.0, -3.9]] : [[0.3, 1.3, 4.6], [0, 1.9, -3.9]]
    default: return v ? [[0, 1.95, 6.3], [0, 1.85, 0]] : [[0, 1.5, 4.6], [0, 1.0, 0]]
  }
}
function placeCam(t) {
  let sh = D.shots[0]
  for (const s of D.shots) if (t >= s.start) sh = s
  const f = framing(sh.kind)
  const p = clamp((t - sh.start) / Math.max(0.5, sh.end - sh.start), 0, 1)
  const e = 1 - Math.pow(1 - p, 2)
  V.set(f[0][0], f[0][1], f[0][2])
  T.set(f[1][0], f[1][1], f[1][2])
  Q.copy(T).sub(V)
  if (sh.move === 'push') V.addScaledVector(Q, 0.16 * e)
  else if (sh.move === 'pull') V.addScaledVector(Q, 0.12 - 0.2 * e)
  else if (sh.move === 'crane') { V.y += 0.9 * (1 - e); V.addScaledVector(Q, -0.1 * (1 - e)) }
  else {
    const a = (sh.move === 'arcL' ? -1 : 1) * (0.2 * e - 0.1)
    const dx = V.x - T.x, dz = V.z - T.z
    V.x = T.x + dx * Math.cos(a) - dz * Math.sin(a)
    V.z = T.z + dx * Math.sin(a) + dz * Math.cos(a)
  }
  // cámara en mano: un temblor suave y lento
  V.x += Math.sin(t * 1.1) * 0.012 + Math.sin(t * 2.7) * 0.005
  V.y += Math.sin(t * 1.4 + 1) * 0.01
  T.x += Math.sin(t * 0.8 + 2) * 0.01
  cam.position.copy(V)
  cam.lookAt(T)
}

const tl = window.__timelines.main
function draw() {
  const t = tl.time()
  screenAt(t)
  poseBot(0, t)
  poseBot(1, t)
  placeCam(t)
  R.render(S, cam)
}
tl.eventCallback('onUpdate', draw)
imgs.forEach((im) => { if (!im.complete) im.addEventListener('load', draw) })
draw()
`
