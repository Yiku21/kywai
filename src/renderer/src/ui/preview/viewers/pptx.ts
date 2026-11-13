// Presentaciones de PowerPoint (.pptx) para el panel de vista previa: se abre el archivo (un zip con XML) y cada
// diapositiva se convierte en una lista de cajas con su posición, relleno, texto, imagen o tabla, heredando lo que
// falte del diseño y del patrón, como hace PowerPoint. No es un PowerPoint completo (no hay animaciones, gráficos ni
// SmartArt), pero se lee bien y sin nube. Lo pinta SlidesView.tsx.
import { unzipSync } from 'fflate'

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
/** EMU (la unidad de Office) por píxel a 96 ppp. */
const EMU = 9525

export interface Run {
  text: string
  /** Tamaño en píxeles de la diapositiva. */
  size: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  font?: string
  /** Salto de línea dentro del párrafo (<a:br/>). */
  br?: boolean
}

export interface Para {
  align: 'left' | 'center' | 'right' | 'justify'
  /** Sangría del párrafo y de su primera línea, en píxeles. */
  marL: number
  indent: number
  bullet?: { char: string; color?: string; size?: number }
  /** Interlineado (1 = sencillo) y espacio antes/después en píxeles. */
  line?: number
  before?: number
  after?: number
  runs: Run[]
  /** Tamaño del texto de un párrafo vacío (para que conserve su alto). */
  emptySize: number
}

export interface TextBody {
  anchor: 'top' | 'middle' | 'bottom'
  insets: [number, number, number, number]
  wrap: boolean
  paras: Para[]
  /** Reducción que pide PowerPoint para que el texto quepa (normAutofit fontScale). */
  scale: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
  rot?: number
  flipH?: boolean
  flipV?: boolean
}

export interface Line {
  color: string
  width: number
  dash?: boolean
}

export type Item =
  | { kind: 'shape'; box: Box; geom: string; radius?: number; fill?: string; line?: Line; path?: { d: string; w: number; h: number }[]; text?: TextBody }
  | { kind: 'line'; box: Box; line: Line }
  | { kind: 'pic'; box: Box; media: string; crop?: [number, number, number, number]; geom: string }
  | { kind: 'table'; box: Box; cols: number[]; rows: { h: number; cells: (TableCell | null)[] }[] }
  | { kind: 'missing'; box: Box; label: 'chart' | 'diagram' | 'media' | 'object' }

export interface TableCell {
  text: TextBody
  fill?: string
  colSpan?: number
  rowSpan?: number
}

export interface Slide {
  background: string
  backgroundImage?: string
  items: Item[]
  hidden: boolean
}

export interface Deck {
  width: number
  height: number
  slides: Slide[]
  /** Imágenes: ruta dentro del zip → bytes (las convierte en direcciones blob: quien pinta). */
  media: Map<string, Uint8Array>
}

// ---------------------------------------------------------------- XML

type El = Element

function kid(el: El | null | undefined, name: string): El | null {
  if (!el) return null
  for (const c of Array.from(el.children)) if (c.localName === name) return c
  return null
}

function kids(el: El | null | undefined, name?: string): El[] {
  if (!el) return []
  return Array.from(el.children).filter((c) => !name || c.localName === name)
}

function path(el: El | null | undefined, ...names: string[]): El | null {
  let cur: El | null | undefined = el
  for (const n of names) cur = kid(cur, n)
  return cur ?? null
}

function num(el: El | null | undefined, attr: string): number | undefined {
  const v = el?.getAttribute(attr)
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml')
}

/** Ruta dentro del zip de un destino relativo («../media/image1.png» desde «ppt/slides/slide1.xml»). */
export function resolvePart(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = from.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return parts.join('/')
}

// ---------------------------------------------------------------- Colores

export function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

export function hslToHex(h: number, s: number, l: number): string {
  const f = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number, g: number, b: number
  if (s === 0) r = g = b = l
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = f(p, q, h + 1 / 3)
    g = f(p, q, h)
    b = f(p, q, h - 1 / 3)
  }
  return [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')
}

const PRESET: Record<string, string> = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080',
  grey: '808080', darkGray: 'A9A9A9', lightGray: 'D3D3D3', orange: 'FFA500', purple: '800080', navy: '000080'
}

interface Theme {
  colors: Record<string, string>
  major: string
  minor: string
}

/** Un color de DrawingML (srgbClr, schemeClr…) con sus retoques (lumMod, tint…) a CSS. `ph` es el phClr del estilo. */
function color(el: El | null | undefined, ctx: Ctx, ph?: string): string | undefined {
  if (!el) return undefined
  let hex: string | undefined
  switch (el.localName) {
    case 'srgbClr':
      hex = el.getAttribute('val') ?? undefined
      break
    case 'schemeClr': {
      const v = el.getAttribute('val') ?? ''
      if (v === 'phClr') hex = ph?.replace('#', '')
      else hex = ctx.scheme(v)
      break
    }
    case 'sysClr':
      hex = el.getAttribute('lastClr') ?? (el.getAttribute('val') === 'window' ? 'FFFFFF' : '000000')
      break
    case 'prstClr':
      hex = PRESET[el.getAttribute('val') ?? ''] ?? '000000'
      break
    case 'scrgbClr': {
      const c = (a: string): string => Math.round((num(el, a) ?? 0) / 100000 * 255).toString(16).padStart(2, '0')
      hex = c('r') + c('g') + c('b')
      break
    }
    case 'hslClr':
      hex = hslToHex((num(el, 'hue') ?? 0) / 21600000, (num(el, 'sat') ?? 0) / 100000, (num(el, 'lum') ?? 0) / 100000)
      break
    default:
      return undefined
  }
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return undefined
  let alpha = 1
  let [h, s, l] = hexToHsl(hex)
  let touched = false
  for (const m of kids(el)) {
    const v = (num(m, 'val') ?? 0) / 100000
    switch (m.localName) {
      case 'lumMod':
        l *= v
        touched = true
        break
      case 'lumOff':
        l += v
        touched = true
        break
      case 'tint':
        l = l + (1 - l) * (1 - v)
        touched = true
        break
      case 'shade':
        l *= v
        touched = true
        break
      case 'satMod':
        s *= v
        touched = true
        break
      case 'alpha':
        alpha = v
        break
    }
  }
  if (touched) hex = hslToHex(h, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l)))
  if (alpha < 1) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`
  }
  return `#${hex.toLowerCase()}`
}

const COLOR_TAGS = new Set(['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'])
const colorChild = (el: El | null | undefined): El | null => kids(el).find((c) => COLOR_TAGS.has(c.localName)) ?? null

/** Relleno de una forma: «none», un color o undefined (no lo dice: se hereda). */
function fill(spPr: El | null | undefined, ctx: Ctx, ph?: string): string | 'none' | undefined {
  if (!spPr) return undefined
  if (kid(spPr, 'noFill')) return 'none'
  const solid = kid(spPr, 'solidFill')
  if (solid) return color(colorChild(solid), ctx, ph)
  const grad = kid(spPr, 'gradFill')
  if (grad) {
    const stops = kids(kid(grad, 'gsLst'), 'gs')
      .map((g) => ({ pos: (num(g, 'pos') ?? 0) / 1000, c: color(colorChild(g), ctx, ph) }))
      .filter((g): g is { pos: number; c: string } => !!g.c)
      .sort((a, b) => a.pos - b.pos)
    if (stops.length === 1) return stops[0].c
    if (stops.length > 1) {
      const ang = (num(kid(grad, 'lin'), 'ang') ?? 5400000) / 60000
      return `linear-gradient(${Math.round(ang + 90)}deg, ${stops.map((g) => `${g.c} ${Math.round(g.pos)}%`).join(', ')})`
    }
  }
  if (kid(spPr, 'pattFill')) return color(colorChild(path(spPr, 'pattFill', 'fgClr')), ctx, ph)
  return undefined
}

// ---------------------------------------------------------------- Contexto de una diapositiva

interface Part {
  path: string
  doc: Document
  rels: Map<string, string>
}

/** Una diapositiva con su diseño (layout) y su patrón (master): de ahí se hereda lo que falte. */
interface Ctx {
  theme: Theme
  clrMap: Record<string, string>
  scheme(v: string): string | undefined
  slide: Part
  layout: Part | null
  master: Part | null
  /** Estilo de texto por defecto de la presentación (defaultTextStyle). */
  defaults: El | null
  media: Map<string, Uint8Array>
  files: Record<string, Uint8Array>
}

type PhInfo = { type: string; idx?: string }

function phOf(sp: El): PhInfo | null {
  const nv = kids(sp).find((c) => c.localName.startsWith('nv'))
  const ph = path(nv, 'nvPr', 'ph')
  if (!ph) return null
  return { type: ph.getAttribute('type') ?? 'body', idx: ph.getAttribute('idx') ?? undefined }
}

const TITLE = new Set(['title', 'ctrTitle'])

/** La forma equivalente en el diseño o el patrón: por idx, y si no, por tipo. */
function findPh(part: Part | null, ph: PhInfo): El | null {
  if (!part) return null
  const tree = path(part.doc.documentElement, 'cSld', 'spTree')
  const all = kids(tree, 'sp').map((sp) => ({ sp, info: phOf(sp) })).filter((x): x is { sp: El; info: PhInfo } => !!x.info)
  const sameType = (a: string, b: string): boolean => a === b || (TITLE.has(a) && TITLE.has(b))
  if (ph.idx != null) {
    const byIdx = all.find((x) => x.info.idx === ph.idx && (ph.type === 'body' || sameType(x.info.type, ph.type)))
    if (byIdx) return byIdx.sp
  }
  return all.find((x) => sameType(x.info.type, ph.type))?.sp ?? (ph.idx != null ? all.find((x) => x.info.idx === ph.idx)?.sp ?? null : null)
}

function xfrmBox(xfrm: El | null): Box | null {
  const off = kid(xfrm, 'off')
  const ext = kid(xfrm, 'ext')
  if (!off || !ext) return null
  const rot = (num(xfrm, 'rot') ?? 0) / 60000
  return {
    x: (num(off, 'x') ?? 0) / EMU,
    y: (num(off, 'y') ?? 0) / EMU,
    w: (num(ext, 'cx') ?? 0) / EMU,
    h: (num(ext, 'cy') ?? 0) / EMU,
    rot: rot || undefined,
    flipH: xfrm?.getAttribute('flipH') === '1' || undefined,
    flipV: xfrm?.getAttribute('flipV') === '1' || undefined
  }
}

// ---------------------------------------------------------------- Texto

/** Los niveles de estilo que valen para un párrafo, del más fuerte al más débil. */
function levelChain(lstStyles: (El | null)[], lvl: number): El[] {
  const name = `lvl${lvl + 1}pPr`
  return lstStyles.map((ls) => kid(ls, name)).filter((x): x is El => !!x)
}

function firstAttr(chain: (El | null)[], attr: string): string | undefined {
  for (const el of chain) {
    const v = el?.getAttribute(attr)
    if (v != null) return v
  }
  return undefined
}

function firstKid(chain: (El | null)[], name: string): El | null {
  for (const el of chain) {
    const k = kid(el, name)
    if (k) return k
  }
  return null
}

function spacing(el: El | null): { pct?: number; px?: number } | undefined {
  if (!el) return undefined
  const pct = num(kid(el, 'spcPct'), 'val')
  if (pct != null) return { pct: pct / 100000 }
  const pts = num(kid(el, 'spcPts'), 'val')
  if (pts != null) return { px: (pts / 100) * (4 / 3) }
  return undefined
}

function fontName(name: string | null | undefined, ctx: Ctx): string | undefined {
  if (!name) return undefined
  if (name.startsWith('+mj')) return ctx.theme.major
  if (name.startsWith('+mn')) return ctx.theme.minor
  return name
}

const AUTONUM: Record<string, (n: number) => string> = {
  arabicPeriod: (n) => `${n}.`,
  arabicParenR: (n) => `${n})`,
  arabicPlain: (n) => `${n}`,
  alphaLcPeriod: (n) => `${String.fromCharCode(96 + ((n - 1) % 26) + 1)}.`,
  alphaUcPeriod: (n) => `${String.fromCharCode(64 + ((n - 1) % 26) + 1)}.`,
  alphaLcParenR: (n) => `${String.fromCharCode(96 + ((n - 1) % 26) + 1)})`,
  romanUcPeriod: (n) => `${roman(n)}.`,
  romanLcPeriod: (n) => `${roman(n).toLowerCase()}.`
}

function roman(n: number): string {
  const t: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, s] of t) while (n >= v) (out += s), (n -= v)
  return out
}

/** Viñetas de la letra Symbol/Wingdings (carácter privado) → el mismo símbolo en Unicode. */
const SYMBOL_BULLET: Record<string, string> = { '\uF0B7': '•', '\uF0A7': '▪', '\uF06E': '■', '\uF0D8': '➢', '\uF0FC': '✓', '\uF076': '❖', '\uF0A8': '□', 'Ø': '➢', '§': '▪', 'ü': '✓', 'q': '❑', 'v': '❖', 'n': '■', 'l': '●' }

/**
 * Texto de una forma. `inherited` son los txBody de la misma forma en el diseño y el patrón; `master` es el estilo de
 * su clase en el patrón (títulos, cuerpo u otro). `fontColor` es el color de texto que pide el estilo de la forma.
 */
function textBody(tx: El | null, inherited: (El | null)[], master: El | null, ctx: Ctx, fontColor?: string, isTable = false): TextBody | undefined {
  if (!tx) return undefined
  const bodies = [tx, ...inherited]
  const bodyPrs = bodies.map((b) => kid(b, 'bodyPr'))
  const lstStyles = [...bodies.map((b) => kid(b, 'lstStyle')), master, ctx.defaults]
  const anchorAttr = firstAttr(bodyPrs, 'anchor') ?? (isTable ? 't' : 't')
  const ins = (a: string, d: number): number => {
    const v = firstAttr(bodyPrs, a)
    return (v != null ? Number(v) : d) / EMU
  }
  const autofit = firstKid(bodyPrs, 'normAutofit')
  const scale = (num(autofit, 'fontScale') ?? 100000) / 100000
  const lnReduce = (num(autofit, 'lnSpcReduction') ?? 0) / 100000
  const counters: number[] = []
  const paras: Para[] = []
  for (const p of kids(tx, 'p')) {
    const pPr = kid(p, 'pPr')
    const lvl = num(pPr, 'lvl') ?? 0
    const chain = [pPr, ...levelChain(lstStyles, lvl)]
    const defRPrs = chain.map((c) => (c === pPr ? null : kid(c, 'defRPr')))
    const algn = firstAttr(chain, 'algn') ?? 'l'
    const marL = Number(firstAttr(chain, 'marL') ?? 0) / EMU
    const indent = Number(firstAttr(chain, 'indent') ?? 0) / EMU
    const lnSpc = spacing(firstKid(chain, 'lnSpc'))
    const spcBef = spacing(firstKid(chain, 'spcBef'))
    const spcAft = spacing(firstKid(chain, 'spcAft'))
    const runs: Run[] = []
    const runProps = (rPr: El | null): Omit<Run, 'text'> => {
      const rChain = [rPr, ...defRPrs]
      const sz = Number(firstAttr(rChain, 'sz') ?? 1800)
      // El color propio (del trozo o de la lista de estilos de la forma) manda; luego el que pide el estilo de la forma
      // (texto blanco en una forma de color, cabecera de tabla); y por último el del diseño y el patrón.
      const ownFill = firstKid([rPr, kid(kid(kid(tx, 'lstStyle'), `lvl${lvl + 1}pPr`), 'defRPr')], 'solidFill')
      const fillEl = ownFill ?? (fontColor ? null : firstKid(rChain, 'solidFill'))
      const latin = firstKid(rChain, 'latin')
      const u = firstAttr(rChain, 'u')
      return {
        size: (sz / 100) * (4 / 3) * scale,
        bold: firstAttr(rChain, 'b') === '1' || undefined,
        italic: firstAttr(rChain, 'i') === '1' || undefined,
        underline: (u != null && u !== 'none') || undefined,
        strike: (firstAttr(rChain, 'strike') ?? 'noStrike') !== 'noStrike' || undefined,
        color: (fillEl ? color(colorChild(fillEl), ctx) : undefined) ?? fontColor,
        font: fontName(latin?.getAttribute('typeface'), ctx)
      }
    }
    for (const r of kids(p)) {
      if (r.localName === 'r' || r.localName === 'fld') {
        const text = kid(r, 't')?.textContent ?? ''
        runs.push({ text, ...runProps(kid(r, 'rPr')) })
      } else if (r.localName === 'br') {
        runs.push({ text: '', br: true, ...runProps(kid(r, 'rPr')) })
      }
    }
    const endProps = runProps(kid(p, 'endParaRPr'))
    // Viñeta: la del párrafo o la heredada, salvo buNone; solo si el párrafo tiene texto.
    let bullet: Para['bullet']
    const hasText = runs.some((r) => r.text.trim())
    const buOwner = chain.find((c) => kid(c, 'buNone') || kid(c, 'buChar') || kid(c, 'buAutoNum') || kid(c, 'buBlip'))
    if (hasText && buOwner && !kid(buOwner, 'buNone')) {
      const buClr = color(colorChild(firstKid(chain, 'buClr')), ctx)
      const buSz = num(firstKid(chain, 'buSzPct'), 'val')
      const first = runs.find((r) => r.text.trim()) ?? endProps
      const size = buSz ? first.size * (buSz / 100000) : undefined
      const ch = kid(buOwner, 'buChar')
      const auto = kid(buOwner, 'buAutoNum')
      if (ch) {
        const c = ch.getAttribute('char') ?? '•'
        // Las letras («n», «ü»…) solo son símbolos si la viñeta va en Wingdings o Symbol.
        const symbolFont = /wingdings|symbol|webdings/i.test(firstKid(chain, 'buFont')?.getAttribute('typeface') ?? '')
        const mapped = /[\uF000-\uF0FF]/.test(c) || symbolFont ? SYMBOL_BULLET[c] : undefined
        bullet = { char: mapped ?? (/[\uF000-\uF0FF]/.test(c) ? '•' : c), color: buClr ?? first.color, size }
      } else if (auto) {
        counters.length = lvl + 1
        const start = num(auto, 'startAt') ?? 1
        counters[lvl] = (counters[lvl] ?? start - 1) + 1
        const fmt = AUTONUM[auto.getAttribute('type') ?? 'arabicPeriod'] ?? AUTONUM.arabicPeriod
        bullet = { char: fmt(counters[lvl]), color: buClr ?? first.color, size }
      } else bullet = { char: '•', color: buClr ?? first.color, size }
    }
    if (!bullet || !kid(buOwner ?? null, 'buAutoNum')) counters.length = Math.min(counters.length, lvl)
    paras.push({
      align: algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' || algn === 'dist' ? 'justify' : 'left',
      marL,
      indent,
      bullet,
      line: lnSpc?.pct != null ? Math.max(0.6, lnSpc.pct - lnReduce) : undefined,
      before: spcBef?.px ?? (spcBef?.pct != null ? spcBef.pct * endProps.size : undefined),
      after: spcAft?.px ?? (spcAft?.pct != null ? spcAft.pct * endProps.size : undefined),
      runs,
      emptySize: endProps.size
    })
  }
  return {
    anchor: anchorAttr === 'ctr' ? 'middle' : anchorAttr === 'b' ? 'bottom' : 'top',
    insets: [ins('lIns', 91440), ins('tIns', 45720), ins('rIns', 91440), ins('bIns', 45720)],
    wrap: firstAttr(bodyPrs, 'wrap') !== 'none',
    paras,
    scale
  }
}

// ---------------------------------------------------------------- Formas

function lineOf(ln: El | null, ctx: Ctx, styleColor?: string): Line | undefined {
  if (ln && kid(ln, 'noFill')) return undefined
  const c = ln ? color(colorChild(kid(ln, 'solidFill')), ctx) : undefined
  const w = Math.max(0.75, (num(ln, 'w') ?? 12700) / EMU)
  const col = c ?? styleColor
  if (!col) return undefined
  const dash = kid(ln, 'prstDash')?.getAttribute('val')
  return { color: col, width: w, dash: !!dash && dash !== 'solid' }
}

function customPaths(geom: El | null): { d: string; w: number; h: number }[] | undefined {
  const list = kid(geom, 'pathLst')
  if (!list) return undefined
  const out: { d: string; w: number; h: number }[] = []
  for (const p of kids(list, 'path')) {
    const w = num(p, 'w') ?? 0
    const h = num(p, 'h') ?? 0
    let d = ''
    const pt = (el: El | null): string => `${num(el, 'x') ?? 0} ${num(el, 'y') ?? 0}`
    for (const cmd of kids(p)) {
      const pts = kids(cmd, 'pt')
      if (cmd.localName === 'moveTo') d += `M${pt(pts[0])}`
      else if (cmd.localName === 'lnTo') d += `L${pt(pts[0])}`
      else if (cmd.localName === 'cubicBezTo') d += `C${pts.map(pt).join(' ')}`
      else if (cmd.localName === 'quadBezTo') d += `Q${pts.map(pt).join(' ')}`
      else if (cmd.localName === 'close') d += 'Z'
    }
    if (d) out.push({ d, w, h })
  }
  return out.length ? out : undefined
}

function txStyleFor(ph: PhInfo | null, ctx: Ctx): El | null {
  const tx = path(ctx.master?.doc.documentElement, 'txStyles')
  if (!ph) return kid(tx, 'otherStyle')
  if (TITLE.has(ph.type)) return kid(tx, 'titleStyle')
  if (['body', 'subTitle', 'obj', 'tbl', 'chart', 'dgm', 'media', 'clipArt', 'pic'].includes(ph.type)) return kid(tx, 'bodyStyle')
  return kid(tx, 'otherStyle')
}

/** Transformación de un grupo: las coordenadas de sus hijos se pasan a las de la diapositiva. */
type Transform = (b: Box) => Box

const identity: Transform = (b) => b

function shapeItem(sp: El, ctx: Ctx, tf: Transform, fromPart: Part): Item | null {
  const ph = fromPart === ctx.slide ? phOf(sp) : null
  const layoutSp = ph ? findPh(ctx.layout, ph) : null
  const masterSp = ph ? findPh(ctx.master, ph) ?? (layoutSp ? findPh(ctx.master, phOf(layoutSp) ?? ph) : null) : null
  const spPr = kid(sp, 'spPr')
  const box = xfrmBox(kid(spPr, 'xfrm')) ?? xfrmBox(kid(kid(layoutSp, 'spPr'), 'xfrm')) ?? xfrmBox(kid(kid(masterSp, 'spPr'), 'xfrm'))
  if (!box) return null
  const style = kid(sp, 'style')
  const fillRef = kid(style, 'fillRef')
  const styleFill = fillRef && (num(fillRef, 'idx') ?? 0) > 0 ? color(colorChild(fillRef), ctx) : undefined
  const lnRef = kid(style, 'lnRef')
  const styleLine = lnRef && (num(lnRef, 'idx') ?? 0) > 0 ? color(colorChild(lnRef), ctx) : undefined
  const fontColor = color(colorChild(kid(style, 'fontRef')), ctx)
  const f = fill(spPr, ctx) ?? fill(kid(layoutSp, 'spPr'), ctx) ?? fill(kid(masterSp, 'spPr'), ctx) ?? styleFill
  const ln = kid(spPr, 'ln')
  const line = lineOf(ln, ctx, ln && !kid(ln, 'solidFill') && !kid(ln, 'noFill') ? styleLine : !ln ? styleLine : undefined)
  const prst = kid(spPr, 'prstGeom')?.getAttribute('prst') ?? (kid(spPr, 'custGeom') ? 'custom' : 'rect')
  const b = tf(box)
  if (sp.localName === 'cxnSp' || prst === 'line' || prst.startsWith('straightConnector') || prst.startsWith('bentConnector') || prst.startsWith('curvedConnector')) {
    const l = line ?? (styleLine ? { color: styleLine, width: 1 } : undefined)
    return l ? { kind: 'line', box: b, line: l } : null
  }
  let radius: number | undefined
  if (prst === 'roundRect') {
    const adj = kids(path(spPr, 'prstGeom', 'avLst'), 'gd').find((g) => g.getAttribute('name') === 'adj')?.getAttribute('fmla')
    const v = adj ? Number(adj.replace(/^val\s+/, '')) : 16667
    radius = (Math.min(b.w, b.h) * (Number.isFinite(v) ? v : 16667)) / 100000
  }
  const text = textBody(kid(sp, 'txBody'), [kid(layoutSp, 'txBody'), kid(masterSp, 'txBody')], txStyleFor(ph ?? (layoutSp ? phOf(layoutSp) : null), ctx), ctx, fontColor)
  const hasText = !!text?.paras.some((p) => p.runs.some((r) => r.text.trim()))
  // Un hueco del diseño sin rellenar en la diapositiva («Haga clic para agregar título») no se ve al presentar.
  if (!hasText && (ph || ((!f || f === 'none') && !line))) return null
  return {
    kind: 'shape',
    box: b,
    geom: prst,
    radius,
    fill: f === 'none' ? undefined : f,
    line,
    path: prst === 'custom' ? customPaths(kid(spPr, 'custGeom')) : undefined,
    text: hasText ? text : undefined
  }
}

function picItem(pic: El, ctx: Ctx, tf: Transform, part: Part): Item | null {
  const spPr = kid(pic, 'spPr')
  const ph = part === ctx.slide ? phOf(pic) : null
  const box = xfrmBox(kid(spPr, 'xfrm')) ?? (ph ? xfrmBox(path(findPh(ctx.layout, ph), 'spPr', 'xfrm')) : null)
  if (!box) return null
  const blipFill = kid(pic, 'blipFill')
  const embed = kid(blipFill, 'blip')?.getAttributeNS(R_NS, 'embed')
  const target = embed ? part.rels.get(embed) : undefined
  if (!target) return { kind: 'missing', box: tf(box), label: 'media' }
  const media = resolvePart(part.path, target)
  const bytes = ctx.files[media]
  if (!bytes || !/\.(png|jpe?g|gif|bmp|webp|svg|tiff?)$/i.test(media)) return { kind: 'missing', box: tf(box), label: 'media' }
  ctx.media.set(media, bytes)
  const src = kid(blipFill, 'srcRect')
  const crop = src ? (['l', 't', 'r', 'b'].map((k) => (num(src, k) ?? 0) / 100000) as [number, number, number, number]) : undefined
  const prst = kid(spPr, 'prstGeom')?.getAttribute('prst') ?? 'rect'
  return { kind: 'pic', box: tf(box), media, crop: crop?.some((v) => v) ? crop : undefined, geom: prst }
}

/** Colores del estilo de tabla de PowerPoint por defecto (Estilo medio 2, énfasis 1): cabecera y bandas. */
function tableItem(frame: El, ctx: Ctx, tf: Transform): Item | null {
  const box = xfrmBox(kid(frame, 'xfrm'))
  if (!box) return null
  const data = path(frame, 'graphic', 'graphicData')
  const uri = data?.getAttribute('uri') ?? ''
  const tbl = kid(data, 'tbl')
  if (!tbl) {
    const label = uri.includes('chart') ? 'chart' : uri.includes('diagram') ? 'diagram' : 'object'
    return { kind: 'missing', box: tf(box), label }
  }
  const tblPr = kid(tbl, 'tblPr')
  const firstRow = tblPr?.getAttribute('firstRow') === '1'
  const bandRow = tblPr?.getAttribute('bandRow') === '1'
  const styled = !!kid(tblPr, 'tableStyleId')
  const accent = ctx.scheme('accent1') ?? '4472c4'
  const [h, s] = hexToHsl(accent)
  const light = `#${hslToHex(h, s, 0.88)}`
  const lighter = `#${hslToHex(h, s, 0.94)}`
  const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => (num(g, 'w') ?? 0) / EMU)
  const rows = kids(tbl, 'tr').map((tr, ri) => {
    const header = styled && firstRow && ri === 0
    const band = styled && bandRow && !header ? ((ri - (firstRow ? 1 : 0)) % 2 === 0 ? light : lighter) : undefined
    const cells = kids(tr, 'tc').map((tc): TableCell | null => {
      if (tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') return null
      const tcPr = kid(tc, 'tcPr')
      const own = fill(tcPr, ctx)
      const text = textBody(kid(tc, 'txBody'), [], null, ctx, header ? '#ffffff' : ctx.scheme('dk1') ? `#${ctx.scheme('dk1')}` : undefined, true)
      if (text) {
        if (header) for (const p of text.paras) for (const r of p.runs) r.bold = r.bold ?? true
        const m = (a: string, d: number): number => (num(tcPr, a) ?? d) / EMU
        text.insets = [m('marL', 91440), m('marT', 45720), m('marR', 91440), m('marB', 45720)]
        text.anchor = tcPr?.getAttribute('anchor') === 'ctr' ? 'middle' : tcPr?.getAttribute('anchor') === 'b' ? 'bottom' : 'top'
      }
      return {
        text: text ?? { anchor: 'top', insets: [0, 0, 0, 0], wrap: true, paras: [], scale: 1 },
        fill: own === 'none' ? undefined : own ?? (header ? `#${accent}` : band),
        colSpan: num(tc, 'gridSpan'),
        rowSpan: num(tc, 'rowSpan')
      }
    })
    return { h: (num(tr, 'h') ?? 0) / EMU, cells }
  })
  return { kind: 'table', box: tf(box), cols, rows }
}

function groupTransform(grp: El, outer: Transform): Transform {
  const xfrm = path(grp, 'grpSpPr', 'xfrm')
  const off = kid(xfrm, 'off')
  const ext = kid(xfrm, 'ext')
  const chOff = kid(xfrm, 'chOff')
  const chExt = kid(xfrm, 'chExt')
  if (!off || !ext || !chOff || !chExt) return outer
  const sx = (num(chExt, 'cx') ?? 0) ? (num(ext, 'cx') ?? 0) / (num(chExt, 'cx') ?? 1) : 1
  const sy = (num(chExt, 'cy') ?? 0) ? (num(ext, 'cy') ?? 0) / (num(chExt, 'cy') ?? 1) : 1
  const ox = (num(off, 'x') ?? 0) / EMU
  const oy = (num(off, 'y') ?? 0) / EMU
  const cx = (num(chOff, 'x') ?? 0) / EMU
  const cy = (num(chOff, 'y') ?? 0) / EMU
  return (b) => outer({ ...b, x: ox + (b.x - cx) * sx, y: oy + (b.y - cy) * sy, w: b.w * sx, h: b.h * sy })
}

function treeItems(tree: El | null, ctx: Ctx, tf: Transform, part: Part, out: Item[]): void {
  for (let el of kids(tree)) {
    if (el.localName === 'AlternateContent') {
      const pick = kid(el, 'Fallback') ?? kid(el, 'Choice')
      const first = kids(pick)[0]
      if (!first) continue
      el = first
    }
    let item: Item | null = null
    switch (el.localName) {
      case 'sp':
      case 'cxnSp':
        item = shapeItem(el, ctx, tf, part)
        break
      case 'pic':
        item = picItem(el, ctx, tf, part)
        break
      case 'graphicFrame':
        item = tableItem(el, ctx, tf)
        break
      case 'grpSp':
        treeItems(el, ctx, groupTransform(el, tf), part, out)
        break
    }
    if (item) out.push(item)
  }
}

/** Fondo de una parte: color (o degradado) y quizá una imagen. undefined: no lo dice (se hereda). */
function background(part: Part | null, ctx: Ctx): { css: string; image?: string } | undefined {
  const bg = path(part?.doc.documentElement, 'cSld', 'bg')
  if (!bg || !part) return undefined
  const bgPr = kid(bg, 'bgPr')
  if (bgPr) {
    const blip = path(bgPr, 'blipFill', 'blip')?.getAttributeNS(R_NS, 'embed')
    if (blip) {
      const target = part.rels.get(blip)
      const media = target ? resolvePart(part.path, target) : ''
      if (media && ctx.files[media] && /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(media)) {
        ctx.media.set(media, ctx.files[media])
        return { css: '#ffffff', image: media }
      }
    }
    const f = fill(bgPr, ctx)
    if (f && f !== 'none') return { css: f }
  }
  const ref = kid(bg, 'bgRef')
  if (ref) {
    const c = color(colorChild(ref), ctx)
    if (c) return { css: c }
  }
  return undefined
}

// ---------------------------------------------------------------- Presentación

function relsOf(files: Record<string, Uint8Array>, partPath: string, dec: TextDecoder): Map<string, string> {
  const dir = partPath.split('/').slice(0, -1).join('/')
  const name = partPath.split('/').pop()
  const raw = files[`${dir}/_rels/${name}.rels`]
  const map = new Map<string, string>()
  if (!raw) return map
  for (const r of Array.from(parseXml(dec.decode(raw)).documentElement.children)) {
    if (r.getAttribute('TargetMode') === 'External') continue
    const id = r.getAttribute('Id')
    const target = r.getAttribute('Target')
    if (id && target) map.set(id, target)
  }
  return map
}

function relTypeTarget(files: Record<string, Uint8Array>, partPath: string, dec: TextDecoder, type: string): string | null {
  const dir = partPath.split('/').slice(0, -1).join('/')
  const name = partPath.split('/').pop()
  const raw = files[`${dir}/_rels/${name}.rels`]
  if (!raw) return null
  for (const r of Array.from(parseXml(dec.decode(raw)).documentElement.children)) {
    if ((r.getAttribute('Type') ?? '').endsWith(`/${type}`)) return resolvePart(partPath, r.getAttribute('Target') ?? '')
  }
  return null
}

/** Más diapositivas no se pintan (se avisa). */
export const MAX_SLIDES = 300

export function readPptx(bytes: ArrayBuffer | Uint8Array): Deck & { total: number } {
  const files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
    // Solo XML e imágenes: los vídeos y audios incrustados pueden pesar cientos de MB.
    filter: (f) => !/\.(mp4|m4v|mov|avi|wmv|mp3|wav|m4a|wma)$/i.test(f.name)
  })
  const dec = new TextDecoder()
  const cache = new Map<string, Part>()
  const part = (p: string | null): Part | null => {
    if (!p || !files[p]) return null
    let got = cache.get(p)
    if (!got) {
      got = { path: p, doc: parseXml(dec.decode(files[p])), rels: relsOf(files, p, dec) }
      cache.set(p, got)
    }
    return got
  }
  const presPath = relTypeTarget(files, '_rels/.rels', dec, 'officeDocument') ?? 'ppt/presentation.xml'
  const pres = part(presPath)
  if (!pres) throw new Error('No es una presentación de PowerPoint (falta presentation.xml)')
  const root = pres.doc.documentElement
  const sldSz = kid(root, 'sldSz')
  const width = (num(sldSz, 'cx') ?? 12192000) / EMU
  const height = (num(sldSz, 'cy') ?? 6858000) / EMU
  const defaults = kid(root, 'defaultTextStyle')
  const ids = kids(kid(root, 'sldIdLst'), 'sldId')
  const media = new Map<string, Uint8Array>()
  const slides: Slide[] = []
  for (const sid of ids.slice(0, MAX_SLIDES)) {
    const rid = sid.getAttributeNS(R_NS, 'id')
    const target = rid ? pres.rels.get(rid) : undefined
    const slide = target ? part(resolvePart(presPath, target)) : null
    if (!slide) continue
    const layout = part(relTypeTarget(files, slide.path, dec, 'slideLayout'))
    const master = layout ? part(relTypeTarget(files, layout.path, dec, 'slideMaster')) : null
    const themePart = master ? part(relTypeTarget(files, master.path, dec, 'theme')) : null
    const theme = readTheme(themePart)
    const clrMapEl = kid(master?.doc.documentElement, 'clrMap')
    const override = path(slide.doc.documentElement, 'clrMapOvr', 'overrideClrMapping') ?? path(layout?.doc.documentElement, 'clrMapOvr', 'overrideClrMapping')
    const clrMap: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }
    for (const src of [clrMapEl, override]) for (const a of Array.from(src?.attributes ?? [])) clrMap[a.name] = a.value
    const ctx: Ctx = {
      theme,
      clrMap,
      scheme: (v) => theme.colors[clrMap[v] ?? v] ?? theme.colors[v],
      slide,
      layout,
      master,
      defaults,
      media,
      files
    }
    const bg = background(slide, ctx) ?? background(layout, ctx) ?? background(master, ctx) ?? { css: '#ffffff' }
    const items: Item[] = []
    const showMaster = (p: Part | null): boolean => kid(p?.doc.documentElement, 'cSld') != null && p?.doc.documentElement.getAttribute('showMasterSp') !== '0'
    // Lo fijo del patrón y del diseño (logos, franjas…) va debajo; sus huecos de texto no se pintan.
    const decoration = (p: Part | null): void => {
      const tree = path(p?.doc.documentElement, 'cSld', 'spTree')
      const fixed = kids(tree).filter((el) => !(['sp', 'pic'].includes(el.localName) && phOf(el)))
      const holder = tree?.cloneNode(false) as El | undefined
      if (!holder || !p) return
      for (const el of fixed) holder.appendChild(el.cloneNode(true))
      treeItems(holder, ctx, identity, p, items)
    }
    if (showMaster(slide) && showMaster(layout)) decoration(master)
    if (showMaster(slide)) decoration(layout)
    treeItems(path(slide.doc.documentElement, 'cSld', 'spTree'), ctx, identity, slide, items)
    slides.push({ background: bg.css, backgroundImage: bg.image, items, hidden: slide.doc.documentElement.getAttribute('show') === '0' })
  }
  return { width, height, slides, media, total: ids.length }
}

function readTheme(p: Part | null): Theme {
  const colors: Record<string, string> = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' }
  const elements = path(p?.doc.documentElement, 'themeElements')
  for (const c of kids(kid(elements, 'clrScheme'))) {
    const v = kids(c)[0]
    const hex = v?.localName === 'srgbClr' ? v.getAttribute('val') : v?.localName === 'sysClr' ? v.getAttribute('lastClr') : null
    if (hex) colors[c.localName] = hex
  }
  const fonts = kid(elements, 'fontScheme')
  return {
    colors,
    major: path(fonts, 'majorFont', 'latin')?.getAttribute('typeface') || 'Calibri Light',
    minor: path(fonts, 'minorFont', 'latin')?.getAttribute('typeface') || 'Calibri'
  }
}
