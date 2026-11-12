// El plató 3D de «Charla y tutorial» con los robots de kywai: Hermes, Claude y Codex hechos en three.js (no imágenes
// fijas) que hablan de verdad (boca y cuerpo al ritmo de cada sílaba), miran a quien habla, reaccionan con la emoción
// de cada frase (saltan si se sorprenden, se ríen, se agachan si están tristes…) y una cámara de cine que cambia de
// plano cuando cambia quién habla (general, primer plano, por encima del hombro, la pantalla) y nunca está quieta
// (acercamientos, arcos, grúa y cámara en mano). Detrás, una pantalla gigante muestra la imagen de cada paso.
// Todo es una función del tiempo de la línea de GSAP: HyperFrames salta de fotograma en fotograma y sale igual.
import { esc, round, sceneWords, timedWords, VOICE_LEAD_S, type CharacterPose, type TimedWord, type VideoScript, type VideoTimeline } from './videoScript'

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

export type ShotKind = 'wide' | 'close0' | 'close1' | 'ots0' | 'ots1' | 'xcu0' | 'xcu1' | 'low' | 'high' | 'side' | 'screen'
export type ShotMove = 'push' | 'pull' | 'arcL' | 'arcR' | 'crane' | 'orbit' | 'dutch' | 'snap' | 'whip'

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

/** Dónde está el presentador en una escena (modo de un solo robot). «close»: se acerca a la cámara. */
export type PresenterSpot = 'left' | 'right' | 'center' | 'close'

/** Lo que hace el presentador en una escena: su gesto y su sitio (llega andando al empezar la escena). */
export interface StageAct {
  start: number
  end: number
  pose: CharacterPose
  spot: PresenterSpot
}

export interface StageData {
  /** «duo»: dos robots charlando en el plató. «solo»: un presentador sobre fondo transparente (para el cartoon). */
  mode?: 'duo' | 'solo'
  /** Los robots: dos en «duo», uno en «solo». */
  looks: RobotLook[]
  /** Solo: el gesto y el sitio de cada escena. */
  acts?: StageAct[]
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
  const moves: ShotMove[] = ['push', 'whip', 'arcL', 'snap', 'pull', 'orbit', 'arcR', 'dutch', 'push', 'crane']
  // Cada turno, un plano distinto: primer plano, por encima del hombro, muy de cerca, contrapicado, de lado, picado…
  const turn = (k: number, who: number): ShotKind => {
    const c = (['close', 'ots', 'xcu', 'low', 'close', 'side', 'ots', 'high'] as const)[(k - 1 + seed) % 8]
    return (c === 'close' || c === 'ots' || c === 'xcu' ? `${c}${who}` : c) as ShotKind
  }
  const second: ShotKind[] = ['wide', 'low', 'side', 'high']
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
    const kind: ShotKind = k === 0 ? (step ? 'screen' : 'wide') : turn(k, who)
    const move: ShotMove = k === 0 ? (step ? 'push' : 'crane') : moves[m++ % moves.length]
    const len = r.end - r.start
    if (len > 4.2) {
      const mid = round(r.start + len * 0.55)
      shots.push({ start: round(r.start), end: mid, kind, move })
      shots.push({ start: mid, end: round(r.end), kind: kind === 'wide' ? (`close${who}` as ShotKind) : second[(k + seed) % 4] === kind ? 'wide' : second[(k + seed) % 4], move: moves[m++ % moves.length] })
    } else shots.push({ start: round(r.start), end: round(r.end), kind, move })
  })
  return shots
}

/** Con qué emoción reacciona el cuerpo a cada gesto del presentador. */
const POSE_EMOTION: Record<CharacterPose, string> = {
  explain: 'neutral',
  point: 'firme',
  surprised: 'sorprendido',
  laugh: 'gracioso',
  shrug: 'neutral',
  thumbs: 'alegre',
  think: 'calma',
  wave: 'alegre'
}

function wordSyllables(words: TimedWord[], voiceEnd: number, who: number, out: StageData['syl'], rnd: () => number): void {
  words.forEach((w, j) => {
    const end = j + 1 < words.length ? words[j + 1].start : voiceEnd
    const pause = /[.!?…]$/.test(w.text) ? 6 : /[,;:]$/.test(w.text) ? 3 : 0
    const letters = w.text.replace(/[^\p{L}\p{N}]/gu, '').length + 2
    const speak = (end - w.start) * (letters / (letters + pause))
    const n = syllables(w.text)
    const d = speak / n
    for (let k = 0; k < n; k++) out.push([who, round(w.start + k * d), round(Math.max(0.06, d)), round(0.55 + rnd() * 0.45)])
  })
}

/**
 * Un solo robot de presentador (modo «solo», para el estilo cartoon): habla con las palabras que se le dan, hace el
 * gesto de cada escena y llega andando a su sitio. El lienzo es transparente: va encima de las ilustraciones.
 * `voiceEnd` de cada escena: cuándo acaba la voz (para la última palabra); sin él, el final de la escena.
 */
export function buildPresenterData(input: {
  scenes: { start: number; duration: number; words: TimedWord[]; voiceEnd?: number; pose?: CharacterPose; spot?: PresenterSpot; joke?: boolean }[]
  tl: VideoTimeline
  robot?: RobotLook
  accent: string
  accent2: string
}): StageData {
  const { tl } = input
  const syl: StageData['syl'] = []
  const lines: StageLine[] = []
  const acts: StageAct[] = []
  let r = tl.scenes.length * 7919 + 31
  const rnd = (): number => (r = (r * 1664525 + 1013904223) >>> 0) / 4294967296
  input.scenes.forEach((sc) => {
    const end = sc.start + sc.duration
    const pose: CharacterPose = sc.joke ? 'laugh' : sc.pose ?? 'explain'
    wordSyllables(sc.words, sc.voiceEnd ?? end, 0, syl, rnd)
    if (sc.words.length) lines.push({ who: 0, start: sc.words[0].start, end, emotion: POSE_EMOTION[pose] })
    acts.push({ start: round(sc.start), end: round(end), pose, spot: sc.spot ?? 'right' })
  })
  return { mode: 'solo', looks: [input.robot ?? 'hermes'], acts, total: tl.total, syl, lines, shots: [], screens: [], ticks: [], outroStart: tl.outroStart, accent: input.accent, accent2: input.accent2 }
}

/**
 * Lo que hay que poner en el HTML de la composición para el plató: el lienzo (a pantalla completa; en «solo», con el
 * fondo transparente), las imágenes de la pantalla gigante y los dos scripts. `scripts` va después del script de la
 * línea de GSAP (window.__timelines.main), y hace falta assets/three.module.js y three.core.js junto al vídeo.
 */
export function stageHtml(data: StageData, W: number, H: number, images: (string | null)[] = []): { canvas: string; scripts: string } {
  const imgs = images.map((src) => (src ? `<img class="stageimg" src="${esc(src)}" alt="">` : '<img class="stageimg" alt="">')).join('')
  return {
    canvas: `<canvas id="stage" width="${W}" height="${H}"></canvas>${imgs ? `\n${imgs}` : ''}`,
    scripts: `<script>window.__stage = ${JSON.stringify(data).replace(/</g, '\\u003c')};</script>\n<script type="module">${STAGE_RUNTIME}</script>`
  }
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
    // Cada palabra mueve la boca de quien la dice.
    for (let j = 0; j < words.length; ) {
      const who = Math.max(0, names.indexOf(words[j].who ?? ''))
      let k = j
      while (k < words.length && Math.max(0, names.indexOf(words[k].who ?? '')) === who) k++
      wordSyllables(words.slice(j, k), k < words.length ? words[k].start : voiceAt + t.voice, who, syl, rnd)
      j = k
    }
    const ls = sceneLines(sc, words, t.start + t.duration, names)
    lines.push(...ls)
    shots.push(...planShots(ls, t.start, t.start + t.duration, !!sc.step, i * 3 + 1))
    screens.push([t.start, images[i] ? i : -1])
    const items = sc.step ? sc.items ?? [] : []
    items.forEach((_, k) => ticks.push(round(voiceAt + (t.voice * (k + 0.6)) / (items.length + 0.4))))
  })
  shots.push({ start: tl.outroStart, end: tl.total, kind: 'wide', move: 'pull' })
  return { mode: 'duo', looks, total: tl.total, syl, lines, shots, screens, ticks, outroStart: tl.outroStart, accent: th.accent, accent2: th.accent2 }
}

/**
 * El programa del plató (JavaScript para el navegador, módulo). Lee `window.__stage` (los datos), las imágenes de la
 * pantalla de los <img class="stageimg"> y dibuja en el canvas #stage cada vez que la línea de GSAP cambia de tiempo.
 * Necesita assets/three.module.js (y three.core.js) junto al vídeo.
 */
export const STAGE_RUNTIME = String.raw`
import * as THREE from './assets/three.module.js'
const D = window.__stage
// «solo»: un presentador sobre fondo transparente (sin plató, solo su sombra en el suelo).
const SOLO = D.mode === 'solo'
const cv = document.getElementById('stage')
const W = cv.width, H = cv.height
const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, alpha: SOLO, premultipliedAlpha: false })
if (SOLO) R.setClearColor(0x000000, 0)
R.setPixelRatio(1)
R.shadowMap.enabled = true
R.shadowMap.type = THREE.PCFShadowMap
R.toneMapping = THREE.ACESFilmicToneMapping
R.toneMappingExposure = 1.08
R.outputColorSpace = THREE.SRGBColorSpace
const S = new THREE.Scene()
if (!SOLO) {
  S.background = new THREE.Color('#2b2030')
  S.fog = new THREE.Fog('#3b2b38', 9, 20)
}
// El plató va en su grupo: en «solo» no se ve.
const SET = new THREE.Group()
SET.visible = !SOLO
S.add(SET)
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
put(SET, new THREE.BoxGeometry(16, 0.3, 12), mat('#c98b5a'), 0, -0.15, 0)
for (let i = -7.5; i < 8; i += 1.1) put(SET, new THREE.BoxGeometry(0.035, 0.31, 12), mat('#a86c42'), i, -0.14, 0)
put(SET, new THREE.BoxGeometry(16, 9, 0.3), mat('#e7c9a0'), 0, 4.4, -4.2)
put(SET, new THREE.BoxGeometry(0.3, 9, 12), mat('#d9b48a'), -6.5, 4.4, 0)
put(SET, new THREE.BoxGeometry(0.3, 9, 12), mat('#d9b48a'), 6.5, 4.4, 0)
put(SET, new THREE.BoxGeometry(16, 0.25, 0.32), mat('#b98a5e'), 0, 0.12, -4.0)
put(SET, new THREE.CylinderGeometry(2.3, 2.3, 0.05, 12), mat(D.accent2, { roughness: 1 }), 0, 0.03, 0.3)
put(SET, new THREE.CylinderGeometry(1.9, 1.9, 0.055, 12), mat('#f6e7cf', { roughness: 1 }), 0, 0.04, 0.3)
// la pantalla gigante (muestra la imagen de cada paso)
put(SET, new THREE.BoxGeometry(4.7, 2.85, 0.24), mat('#2b2638'), 0, 2.75, -3.9)
const scrMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
const scr = put(SET, new THREE.PlaneGeometry(4.4, 2.55), scrMat, 0, 2.75, -3.77)
scr.castShadow = false
const scrGlow = new THREE.PointLight('#ffd9a8', 7, 7, 1.6)
scrGlow.position.set(0, 2.6, -3.0)
SET.add(scrGlow)
// estantería, libros, planta, lámpara, cubos de juguete
put(SET, new THREE.BoxGeometry(1.8, 0.12, 0.6), mat('#8d5a3b'), -4.6, 2.2, -3.8)
put(SET, new THREE.BoxGeometry(1.8, 0.12, 0.6), mat('#8d5a3b'), -4.6, 3.3, -3.8)
;['#ff7a3d', '#3f8f8a', '#f2c14e', '#7c5cbf', '#e8e0d0'].forEach((c, i) => put(SET, new THREE.BoxGeometry(0.22, 0.72 - (i % 2) * 0.12, 0.5), mat(c), -5.2 + i * 0.28, 2.62 - (i % 2) * 0.06, -3.8, 0, 0, i === 4 ? 0.28 : 0))
put(SET, new THREE.CylinderGeometry(0.42, 0.32, 0.65, 7), mat('#c4553a'), 4.3, 0.33, -2.6)
for (let i = 0; i < 7; i++) put(SET, new THREE.ConeGeometry(0.26, 1.3, 5), mat(i % 2 ? '#4c9a52' : '#5fb05f'), 4.3 + Math.cos(i * 0.9) * 0.22, 1.2, -2.6 + Math.sin(i * 0.9) * 0.22, Math.sin(i * 2) * 0.35, 0, Math.cos(i * 2) * 0.35)
put(SET, new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), mat('#3a3040'), -3.7, 1.2, -1.6)
put(SET, new THREE.ConeGeometry(0.42, 0.45, 12, 1, true), mat('#f2c14e', { side: THREE.DoubleSide }), -3.7, 2.45, -1.6)
const lamp = new THREE.PointLight('#ffcf8a', 5, 5, 1.6)
lamp.position.set(-3.7, 2.2, -1.6)
SET.add(lamp)
;[['#ff7a3d', 2.9, 0.25, 1.3], ['#3f8f8a', 3.4, 0.25, 1.75], ['#f2c14e', 3.15, 0.75, 1.5]].forEach((b) => put(SET, new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(b[0]), b[1], b[2], b[3], 0, 0.4, 0))
put(SET, new THREE.BoxGeometry(1.0, 0.22, 0.7), mat('#7c5cbf'), -2.8, 0.11, 1.6, 0, 0.3, 0)
put(SET, new THREE.BoxGeometry(0.92, 0.2, 0.64), mat('#f2c14e'), -2.8, 0.32, 1.6, 0, 0.12, 0)

if (SOLO) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.3 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  S.add(floor)
}

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
// Muñecos de juguete: pies, cuerpo, cuello y una cabeza grande con la cara en una pantalla. Cada uno con lo suyo:
// Hermes con alas en el casco y antena, Claude con su sol de rayos y Codex de bloque con el «>_» en el pecho.
const CREAM = '#fff1d6'
const DARK = '#2a2530'
/** Caja de esquinas redondas de w×h×d (centrada). */
function rbox(w, h, d, b) {
  const x = w / 2 - b, y = h / 2 - b, r = Math.min(x, y) * 0.55
  const sh = new THREE.Shape()
  sh.moveTo(-x + r, -y); sh.lineTo(x - r, -y); sh.quadraticCurveTo(x, -y, x, -y + r); sh.lineTo(x, y - r); sh.quadraticCurveTo(x, y, x - r, y)
  sh.lineTo(-x + r, y); sh.quadraticCurveTo(-x, y, -x, y - r); sh.lineTo(-x, -y + r); sh.quadraticCurveTo(-x, -y, -x + r, -y)
  const geo = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 6, curveSegments: 14 })
  geo.translate(0, 0, -(d - 2 * b) / 2)
  return geo
}
function eyeArc(parent, x, y, z, color) {
  const e = put(parent, new THREE.TorusGeometry(0.07, 0.02, 8, 24, Math.PI), glow(color, 2.2), x, y, z)
  e.castShadow = false
  return e
}
function mouthOf(parent, y, z, color) {
  const m = put(parent, new THREE.CapsuleGeometry(0.03, 0.09, 6, 12), glow(color, 2), 0, y, z, 0, 0, Math.PI / 2)
  m.castShadow = false
  return m
}
/** Pies y cuello comunes: los pies le dan peso al muñeco y dejan ver que anda. */
function legs(body, color) {
  const m = gloss(color, { roughness: 0.45 })
  put(body, new THREE.SphereGeometry(0.1, 20, 14), m, -0.13, 0.06, 0.04, 0, 0, 0, 1, 0.6, 1.35)
  put(body, new THREE.SphereGeometry(0.1, 20, 14), m, 0.13, 0.06, 0.04, 0, 0, 0, 1, 0.6, 1.35)
}
/** La pantalla de la cara: un cristal oscuro con brillo. */
function screen(face, w, h, z) {
  const s = put(face, rbox(w, h, 0.06, 0.025), gloss('#0f0d14', { roughness: 0.12, clearcoat: 1 }), 0, 0, z)
  s.castShadow = false
  return s
}
function makeHermes() {
  const g = new THREE.Group(), body = new THREE.Group(), face = new THREE.Group()
  g.add(body)
  const shell = gloss('#f4ecdd', { roughness: 0.38 })
  const gold = gloss('#d4a440', { metalness: 0.85, roughness: 0.28 })
  legs(body, DARK)
  put(body, rbox(0.5, 0.4, 0.36, 0.13), shell, 0, 0.34, 0)
  put(body, rbox(0.52, 0.06, 0.38, 0.025), gold, 0, 0.2, 0)
  put(body, new THREE.CylinderGeometry(0.07, 0.08, 0.1, 16), gloss(DARK), 0, 0.58, 0)
  // el caduceo del pecho
  put(body, new THREE.CylinderGeometry(0.01, 0.01, 0.16, 8), gold, 0, 0.38, 0.19)
  put(body, new THREE.TorusGeometry(0.04, 0.009, 6, 16, Math.PI), gold, -0.04, 0.43, 0.185, 0, 0, 0.3)
  put(body, new THREE.TorusGeometry(0.04, 0.009, 6, 16, Math.PI), gold, 0.04, 0.43, 0.185, 0, 0, -0.3)
  // la cabeza: casco crema con alas doradas y antena
  face.position.set(0, 0.9, 0)
  body.add(face)
  put(face, rbox(0.78, 0.6, 0.58, 0.2), shell, 0, 0, 0)
  screen(face, 0.62, 0.4, 0.28)
  ;[-1, 1].forEach((sx) => {
    put(face, new THREE.CylinderGeometry(0.1, 0.1, 0.06, 24), gold, sx * 0.4, 0, 0, 0, 0, Math.PI / 2)
    for (let k = 0; k < 3; k++) put(face, new THREE.SphereGeometry(1, 16, 10), gloss('#fff8ec', { roughness: 0.3 }), sx * (0.45 + k * 0.015), 0.07 + k * 0.06, -0.06 - k * 0.07, -0.5 - k * 0.22, 0, sx * 0.25, 0.028, 0.07 + k * 0.012, 0.24 - k * 0.04)
  })
  put(face, new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), gold, 0, 0.37, 0)
  put(face, new THREE.SphereGeometry(0.045, 16, 12), glow('#ffb21f', 1.6), 0, 0.47, 0).castShadow = false
  const eyes = [-1, 1].map((k) => {
    const e = put(face, new THREE.CapsuleGeometry(0.045, 0.06, 6, 16), glow('#ffb21f', 1.3), k * 0.14, 0.04, 0.32)
    e.castShadow = false
    return e
  })
  const mouth = mouthOf(face, -0.1, 0.32, '#ffb21f')
  return { g, body, eyes, mouth }
}
function makeClaude() {
  const g = new THREE.Group(), body = new THREE.Group(), face = new THREE.Group()
  g.add(body)
  const skin = gloss('#f26a1b')
  legs(body, '#5a2a14')
  put(body, new THREE.SphereGeometry(0.27, 32, 24), skin, 0, 0.34, 0, 0, 0, 0, 1, 0.92, 0.85)
  for (let i = 0; i < 8; i++) put(body, new THREE.BoxGeometry(0.014, 0.09, 0.01), glow(CREAM, 1.3), 0, 0.36, 0.235, -0.2, 0, (i * Math.PI) / 8).castShadow = false
  put(body, new THREE.CylinderGeometry(0.07, 0.08, 0.1, 16), gloss('#5a2a14'), 0, 0.6, 0)
  face.position.set(0, 0.92, 0)
  body.add(face)
  put(face, new THREE.SphereGeometry(0.4, 48, 32), skin, 0, 0, 0, 0, 0, 0, 1.05, 0.9, 0.92)
  // el sol de rayos detrás de la cabeza (como su logo)
  const ray = gloss('#ff9a52', { roughness: 0.35 })
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI * 0.1 + (i / 10) * Math.PI * 1.2
    put(face, new THREE.CapsuleGeometry(0.045, 0.14, 6, 12), ray, Math.cos(a) * 0.43, Math.sin(a) * 0.4 + 0.02, -0.16, 0, 0, a - Math.PI / 2)
  }
  const v = put(face, new THREE.SphereGeometry(0.405, 48, 24, Math.PI * 0.5 - 0.85, 1.7, Math.PI * 0.5 - 0.32, 0.64), gloss('#141018', { roughness: 0.15, clearcoat: 1 }), 0, 0, 0, 0, 0, 0, 1.05, 0.9, 0.92)
  v.castShadow = false
  const eyes = [eyeArc(face, -0.14, 0.03, 0.37, CREAM), eyeArc(face, 0.14, 0.03, 0.37, CREAM)]
  const mouth = mouthOf(face, -0.1, 0.37, CREAM)
  return { g, body, eyes, mouth }
}
function makeCodex() {
  const g = new THREE.Group(), body = new THREE.Group(), face = new THREE.Group()
  g.add(body)
  const shell = gloss('#1f9d6a')
  legs(body, '#0d3a28')
  put(body, rbox(0.5, 0.42, 0.38, 0.1), shell, 0, 0.34, 0)
  const pr = glow('#5cffb0', 1.8)
  put(body, new THREE.BoxGeometry(0.05, 0.012, 0.01), pr, -0.06, 0.38, 0.195, 0, 0, 0.6).castShadow = false
  put(body, new THREE.BoxGeometry(0.05, 0.012, 0.01), pr, -0.06, 0.355, 0.195, 0, 0, -0.6).castShadow = false
  put(body, new THREE.BoxGeometry(0.08, 0.014, 0.01), pr, 0.04, 0.33, 0.195).castShadow = false
  put(body, new THREE.CylinderGeometry(0.07, 0.08, 0.1, 16), gloss('#0d3a28'), 0, 0.59, 0)
  face.position.set(0, 0.9, 0)
  body.add(face)
  put(face, rbox(0.8, 0.58, 0.6, 0.13), shell, 0, 0, 0)
  screen(face, 0.64, 0.38, 0.29)
  ;[-1, 1].forEach((sx) => put(face, rbox(0.08, 0.2, 0.2, 0.03), gloss('#0d3a28'), sx * 0.42, 0, 0))
  put(face, new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), gloss('#0d3a28'), 0.2, 0.36, 0)
  put(face, new THREE.BoxGeometry(0.07, 0.07, 0.07), glow('#5cffb0', 1.6), 0.2, 0.45, 0).castShadow = false
  const eyes = [-1, 1].map((k) => {
    const e = new THREE.Group()
    e.position.set(k * 0.14, 0.04, 0.33)
    const m = glow('#5cffb0', 2.4)
    put(e, new THREE.BoxGeometry(0.1, 0.022, 0.01), m, 0, 0.025, 0, 0, 0, k * 0.55).castShadow = false
    put(e, new THREE.BoxGeometry(0.1, 0.022, 0.01), m, 0, -0.025, 0, 0, 0, -k * 0.55).castShadow = false
    face.add(e)
    return e
  })
  const mouth = mouthOf(face, -0.1, 0.33, '#5cffb0')
  return { g, body, eyes, mouth }
}
const MAKE = { hermes: makeHermes, claude: makeClaude, codex: makeCodex }
const HAND = { hermes: '#f4ecdd', claude: '#f26a1b', codex: '#1f9d6a' }
const X = [-0.62, 0.62]
const bots = D.looks.map((l, i) => {
  const b = MAKE[l]()
  b.g.position.set(X[i], 0, i ? 0.15 : 0)
  // manitas flotantes (como un muñeco de juguete): dan los gestos
  b.hands = [-1, 1].map((sx) => put(b.g, new THREE.SphereGeometry(0.085, 20, 14), gloss(HAND[l]), sx * 0.36, 0.34, 0.08))
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
// ---------- presentador («solo»): su sitio y su gesto en cada escena ----------
const VERT = W < H
const SPOTS = VERT
  ? { left: [-0.28, 0], right: [0.28, 0], center: [0, 0], close: [0, 1.0] }
  : { left: [-1.7, 0], right: [1.7, 0], center: [0, 0], close: [0, 1.5] }
const WALK = 0.7
function actAt(t) {
  const A = D.acts || []
  let k = -1
  for (let j = 0; j < A.length; j++) if (t >= A[j].start) k = j
  return { act: k >= 0 ? A[k] : null, prev: k > 0 ? A[k - 1] : null }
}
/** Dónde está el presentador: llega andando (a saltitos) a su sitio al empezar cada escena. */
function soloPlace(b, t) {
  const { act, prev } = actAt(t)
  const to = SPOTS[act ? act.spot : 'right'] || SPOTS.right
  const from = SPOTS[prev ? prev.spot : act ? act.spot : 'right'] || to
  const p = act ? clamp((t - act.start) / WALK, 0, 1) : 1
  const e = ease(p)
  const x = from[0] + (to[0] - from[0]) * e
  const z = from[1] + (to[1] - from[1]) * e
  const moving = p < 1 && (from[0] !== to[0] || from[1] !== to[1])
  b.g.position.x = x
  b.g.position.z = z
  return { hop: moving ? Math.abs(Math.sin(p * Math.PI * 4)) * 0.14 : 0, face: moving ? Math.atan2(to[0] - from[0], to[1] - from[1]) * 0.6 : -x * 0.12, pose: act ? act.pose : 'explain', since: act ? t - act.start : 9 }
}
/** Las manitas: dónde van según el gesto (o la emoción en el diálogo), con el habla moviéndolas. */
function handsFor(b, g, t, talk, toward) {
  const L = b.hands[0].position, Rh = b.hands[1].position
  let l = [-0.36, 0.34 + Math.sin(t * 2.1) * 0.02, 0.08], r = [0.36, 0.34 + Math.sin(t * 2.3 + 1) * 0.02, 0.08]
  const s1 = Math.sin(t * 9), s2 = Math.sin(t * 5.3)
  switch (g) {
    case 'point': r = [toward * 0.62, 0.8, 0.3]; break
    case 'surprised': l = [-0.52, 1.12, 0.2]; r = [0.52, 1.12, 0.2]; break
    case 'laugh': l = [-0.26, 0.3 + s1 * 0.04, 0.3]; r = [0.26, 0.3 - s1 * 0.04, 0.3]; break
    case 'shrug': l = [-0.58, 0.62 + s2 * 0.03, 0.2]; r = [0.58, 0.62 - s2 * 0.03, 0.2]; break
    case 'thumbs': r = [0.42, 0.95 + Math.abs(s2) * 0.06, 0.4]; break
    case 'think': r = [0.16, 0.66, 0.4]; break
    case 'wave': r = [0.55 + Math.sin(t * 12) * 0.12, 1.15, 0.12]; break
    case 'down': l = [-0.34, 0.22, 0.06]; r = [0.34, 0.22, 0.06]; break
    case 'idle': break
    default: r = [0.42 - talk * 0.1, 0.42 + talk * 0.25 + s2 * 0.04, 0.22 + talk * 0.15]; l = [-0.4, 0.38 + Math.sin(t * 3.1) * 0.04 + talk * 0.08, 0.15]
  }
  L.set(l[0], l[1], l[2])
  Rh.set(r[0], r[1], r[2])
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
  // las manitas: en el diálogo, según la emoción de la frase
  let gesture = mine ? ({ sorprendido: 'surprised', gracioso: 'laugh', alegre: 'explain', emocionado: 'thumbs', triste: 'down', firme: 'point', calma: 'think' })[em] || 'explain' : line && line.who === other && em === 'gracioso' ? 'laugh' : 'idle'
  if (t >= D.outroStart) gesture = i ? 'wave' : 'thumbs'
  if (SOLO) {
    const sp = soloPlace(b, t)
    gesture = t >= D.outroStart ? 'thumbs' : sp.pose
    y += sp.hop
    ry = sp.face + Math.sin(t * 0.9) * 0.05
    const kk = ease(clamp(sp.since / 0.35, 0, 1))
    if (gesture === 'surprised') { y += bell(t, t - sp.since, 0.45) * 0.25; eye = 1.3 }
    else if (gesture === 'laugh') { rz = Math.sin(t * 16) * 0.1 * kk; eye = 0.9; eyeY = 0.5 }
    else if (gesture === 'shrug') { rz = Math.sin(t * 3) * 0.08 * kk; sq -= 0.03 * kk }
    else if (gesture === 'think') { rz = 0.1 * kk; rx = -0.08 * kk; eyeY = 0.8 }
    else if (gesture === 'point') { ry += (b.g.position.x > 0 ? -0.35 : 0.35) * kk }
    else if (gesture === 'thumbs') { y += Math.abs(Math.sin(t * 6)) * 0.05 }
    else if (gesture === 'wave') { rz = Math.sin(t * 6) * 0.06 }
  }
  handsFor(b, gesture, t, talk, SOLO ? (b.g.position.x > 0 ? -1 : 1) : toward)
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
    case 'close0': return v ? [[X[0] + 0.3, 1.45, 3.7], [X[0], 1.4, 0]] : [[X[0] + 0.35, 1.15, 2.4], [X[0], 0.95, 0]]
    case 'close1': return v ? [[X[1] - 0.3, 1.45, 3.8], [X[1], 1.4, 0.15]] : [[X[1] - 0.35, 1.15, 2.5], [X[1], 0.95, 0.15]]
    case 'ots0': return v ? [[X[1] + 0.35, 1.5, 3.4], [X[0], 1.35, 0]] : [[X[1] + 0.45, 1.25, 2.4], [X[0], 0.95, 0]]
    case 'ots1': return v ? [[X[0] - 0.35, 1.5, 3.5], [X[1], 1.35, 0.15]] : [[X[0] - 0.45, 1.25, 2.5], [X[1], 0.95, 0.15]]
    // muy de cerca: solo la cara (para remarcar una frase)
    case 'xcu0': return v ? [[X[0] + 0.12, 1.0, 2.2], [X[0], 1.3, 0]] : [[X[0] + 0.12, 0.95, 1.5], [X[0], 0.92, 0]]
    case 'xcu1': return v ? [[X[1] - 0.12, 1.0, 2.25], [X[1], 1.3, 0.15]] : [[X[1] - 0.12, 0.95, 1.55], [X[1], 0.92, 0.15]]
    // contrapicado desde el suelo: los dos parecen grandes
    case 'low': return v ? [[0.2, 0.28, 4.2], [0, 1.6, 0]] : [[0.2, 0.28, 3.4], [0, 1.1, 0]]
    // picado desde arriba: se ve la maqueta entera
    case 'high': return v ? [[1.2, 4.6, 4.4], [0, 1.3, 0]] : [[1.0, 3.8, 3.8], [0, 0.6, 0]]
    // de lado: los dos de perfil, uno delante del otro
    case 'side': return v ? [[3.4, 1.3, 1.6], [-0.2, 1.5, 0]] : [[3.0, 1.1, 1.4], [-0.1, 0.85, 0]]
    case 'screen': return v ? [[0, 1.05, 6.6], [0, 2.0, -3.9]] : [[0.3, 1.3, 4.6], [0, 1.9, -3.9]]
    default: return v ? [[0, 1.95, 6.3], [0, 1.85, 0]] : [[0, 1.5, 4.6], [0, 1.0, 0]]
  }
}
function placeCam(t) {
  if (SOLO) {
    // cámara fija con un respiro lento (el movimiento lo pone la composición de encima)
    if (VERT) { V.set(0, 1.7, 4.2); T.set(0, 1.6, 0) } else { V.set(0, 1.3, 5); T.set(0, 1.1, 0) }
    V.x += Math.sin(t * 0.7) * 0.05
    V.y += Math.sin(t * 0.9 + 1) * 0.03
    cam.position.copy(V)
    cam.lookAt(T)
    return
  }
  let sh = D.shots[0]
  for (const s of D.shots) if (t >= s.start) sh = s
  const f = framing(sh.kind)
  const p = clamp((t - sh.start) / Math.max(0.5, sh.end - sh.start), 0, 1)
  const e = 1 - Math.pow(1 - p, 2)
  const since = t - sh.start
  V.set(f[0][0], f[0][1], f[0][2])
  T.set(f[1][0], f[1][1], f[1][2])
  // barrido rápido: la cámara llega de lado al plano (0,35 s)
  if (sh.move === 'whip') T.x += (1 - ease(clamp(since / 0.35, 0, 1))) * (sh.kind.endsWith('1') ? -1.4 : 1.4)
  Q.copy(T).sub(V)
  if (sh.move === 'push') V.addScaledVector(Q, 0.16 * e)
  else if (sh.move === 'pull') V.addScaledVector(Q, 0.12 - 0.2 * e)
  else if (sh.move === 'crane') { V.y += 0.9 * (1 - e); V.addScaledVector(Q, -0.1 * (1 - e)) }
  else if (sh.move === 'orbit') {
    // gira alrededor de los dos (unos 35°)
    const a = 0.3 - 0.6 * e
    const dx = V.x - T.x, dz = V.z - T.z
    V.x = T.x + dx * Math.cos(a) - dz * Math.sin(a)
    V.z = T.z + dx * Math.sin(a) + dz * Math.cos(a)
  } else if (sh.move === 'arcL' || sh.move === 'arcR') {
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
  // golpe de zoom al empezar el plano; plano holandés (inclinado)
  const fov = (W > H ? 34 : 40) * (sh.move === 'snap' ? 1 - 0.2 * ease(clamp(since / 0.22, 0, 1)) : 1)
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix() }
  if (sh.move === 'dutch') cam.rotateZ(0.13 * (sh.kind.endsWith('1') ? -1 : 1))
}

const tl = window.__timelines.main
function draw() {
  const t = tl.time()
  screenAt(t)
  bots.forEach((_, i) => poseBot(i, t))
  placeCam(t)
  R.render(S, cam)
}
tl.eventCallback('onUpdate', draw)
imgs.forEach((im) => { if (!im.complete) im.addEventListener('load', draw) })
draw()
`
