// Más documentos para el panel de vista previa, leídos en el propio equipo y convertidos en HTML seguro (sin
// scripts ni direcciones de fuera): OpenDocument de LibreOffice (.odt, .odp), RTF, libros ePub y la miniatura que
// guardan dentro Pages y Keynote. Quien pinta (RichDocView) lo mete en una caja aislada.
import { unzipSync, type Unzipped } from 'fflate'

/** Lo que sale de convertir un documento: su HTML (ya como nodos) y las imágenes que usa (ruta → bytes). */
export interface RichDoc {
  body: HTMLElement
  /** Una imagen de vista previa en lugar del documento (Pages, Keynote): su ruta en `media`. */
  preview?: string
  /** El documento trae un PDF de vista previa (Pages y Keynote antiguos): su ruta en `media`. */
  pdf?: string
  media: Map<string, Uint8Array>
}

const XLINK = 'http://www.w3.org/1999/xlink'
const IMG_EXT = /\.(png|jpe?g|gif|bmp|webp|svg)$/i

export function unzip(bytes: ArrayBuffer | Uint8Array, keep?: (name: string) => boolean): Unzipped {
  return unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), keep ? { filter: (f) => keep(f.name) } : undefined)
}

const dec = new TextDecoder()
const xml = (data: Uint8Array | undefined): Document | null => (data ? new DOMParser().parseFromString(dec.decode(data), 'application/xml') : null)

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag)
  if (cls) e.className = cls
  return e
}

/** Un enlace solo si va a una web o a un correo (nada de javascript:, file:…). */
function safeHref(href: string | null): string | null {
  if (!href) return null
  return /^(https?:|mailto:|#)/i.test(href.trim()) ? href.trim() : null
}

// ================================================================ OpenDocument (.odt, .odp)

interface OdfStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  size?: string
  align?: string
  background?: string
  parent?: string
}

function odfStyles(...docs: (Document | null)[]): Map<string, OdfStyle> {
  const map = new Map<string, OdfStyle>()
  for (const d of docs) {
    if (!d) continue
    for (const st of Array.from(d.getElementsByTagName('*')).filter((e) => e.localName === 'style' && e.prefix === 'style')) {
      const name = st.getAttribute('style:name')
      if (!name) continue
      const out: OdfStyle = { parent: st.getAttribute('style:parent-style-name') ?? undefined }
      for (const p of Array.from(st.children)) {
        if (p.localName === 'text-properties') {
          const w = p.getAttribute('fo:font-weight')
          if (w) out.bold = w === 'bold' || Number(w) >= 600
          const i = p.getAttribute('fo:font-style')
          if (i) out.italic = i === 'italic' || i === 'oblique'
          const u = p.getAttribute('style:text-underline-style')
          if (u) out.underline = u !== 'none'
          const s = p.getAttribute('style:text-line-through-style')
          if (s) out.strike = s !== 'none'
          const c = p.getAttribute('fo:color')
          if (c && /^#[0-9a-f]{6}$/i.test(c)) out.color = c
          const sz = p.getAttribute('fo:font-size')
          if (sz && /^[\d.]+pt$/.test(sz)) out.size = sz
          const bg = p.getAttribute('fo:background-color')
          if (bg && /^#[0-9a-f]{6}$/i.test(bg)) out.background = bg
        } else if (p.localName === 'paragraph-properties') {
          const a = p.getAttribute('fo:text-align')
          if (a) out.align = a === 'start' ? 'left' : a === 'end' ? 'right' : a
        }
      }
      map.set(name, out)
    }
  }
  return map
}

function resolved(styles: Map<string, OdfStyle>, name: string | null): OdfStyle {
  const out: OdfStyle = {}
  const seen = new Set<string>()
  let cur = name
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const st = styles.get(cur)
    if (!st) break
    for (const k of ['bold', 'italic', 'underline', 'strike', 'color', 'size', 'align', 'background'] as const) {
      if (out[k] === undefined && st[k] !== undefined) (out as Record<string, unknown>)[k] = st[k]
    }
    cur = st.parent ?? null
  }
  return out
}

function applyStyle(node: HTMLElement, st: OdfStyle, block: boolean): void {
  if (st.bold) node.style.fontWeight = '700'
  if (st.italic) node.style.fontStyle = 'italic'
  const deco = [st.underline && 'underline', st.strike && 'line-through'].filter(Boolean).join(' ')
  if (deco) node.style.textDecoration = deco
  if (st.color) node.style.color = st.color
  if (st.background) node.style.backgroundColor = st.background
  if (st.size) node.style.fontSize = st.size
  if (block && st.align && ['left', 'right', 'center', 'justify'].includes(st.align)) node.style.textAlign = st.align
}

/** Columnas o filas repetidas (LibreOffice escribe «1.024 columnas vacías» así): se corta. */
const MAX_REPEAT = 40

class OdfWriter {
  constructor(
    private doc: Document,
    private styles: Map<string, OdfStyle>,
    private files: Unzipped,
    private media: Map<string, Uint8Array>
  ) {}

  /** Hijos de un elemento de ODF, convertidos y añadidos a `into`. */
  children(src: Element, into: HTMLElement): void {
    for (const n of Array.from(src.childNodes)) this.node(n, into)
  }

  node(n: Node, into: HTMLElement): void {
    if (n.nodeType === 3) {
      into.append(this.doc.createTextNode(n.textContent ?? ''))
      return
    }
    if (n.nodeType !== 1) return
    const e = n as Element
    const name = `${e.prefix}:${e.localName}`
    switch (name) {
      case 'text:h': {
        const lvl = Math.min(6, Math.max(1, Number(e.getAttribute('text:outline-level') ?? 1)))
        const h = el(this.doc, `h${lvl}` as 'h1')
        applyStyle(h, resolved(this.styles, e.getAttribute('text:style-name')), true)
        this.children(e, h)
        into.append(h)
        return
      }
      case 'text:p': {
        const p = el(this.doc, 'p')
        applyStyle(p, resolved(this.styles, e.getAttribute('text:style-name')), true)
        this.children(e, p)
        if (!p.textContent && !p.querySelector('img')) p.append(' ')
        into.append(p)
        return
      }
      case 'text:span': {
        const span = el(this.doc, 'span')
        applyStyle(span, resolved(this.styles, e.getAttribute('text:style-name')), false)
        this.children(e, span)
        into.append(span)
        return
      }
      case 'text:a': {
        const href = safeHref(e.getAttributeNS(XLINK, 'href') ?? e.getAttribute('xlink:href'))
        const a = el(this.doc, href ? 'a' : 'span')
        if (href && a instanceof HTMLAnchorElement) a.href = href
        this.children(e, a)
        into.append(a)
        return
      }
      case 'text:s':
        into.append(' '.repeat(Math.min(200, Number(e.getAttribute('text:c') ?? 1))))
        return
      case 'text:tab':
        into.append('\t')
        return
      case 'text:line-break':
        into.append(el(this.doc, 'br'))
        return
      case 'text:list': {
        const ul = el(this.doc, 'ul')
        for (const item of Array.from(e.children)) {
          if (item.localName !== 'list-item' && item.localName !== 'list-header') continue
          const li = el(this.doc, 'li')
          this.children(item, li)
          // Un elemento que solo lleva otra lista dentro (un nivel más) no lleva viñeta propia.
          if (li.firstElementChild?.tagName === 'UL' && !Array.from(li.childNodes).some((c) => c.nodeType === 3 && c.textContent?.trim())) li.style.listStyleType = 'none'
          ul.append(li)
        }
        into.append(ul)
        return
      }
      case 'table:table':
        into.append(this.table(e))
        return
      case 'draw:frame':
      case 'draw:a':
      case 'text:section':
      case 'text:index-body':
      case 'text:table-of-content':
      case 'text:alphabetical-index':
      case 'text:illustration-index':
      case 'draw:g':
        this.children(e, into)
        return
      case 'draw:text-box':
      case 'draw:custom-shape':
      case 'draw:rect':
      case 'draw:ellipse': {
        const box = el(this.doc, 'div', 'odf-box')
        this.children(e, box)
        if (box.textContent?.trim() || box.querySelector('img')) into.append(box)
        return
      }
      case 'draw:image': {
        const href = e.getAttributeNS(XLINK, 'href') ?? e.getAttribute('xlink:href') ?? ''
        if (IMG_EXT.test(href) && this.files[href]) {
          this.media.set(href, this.files[href])
          const img = el(this.doc, 'img')
          img.dataset.media = href
          img.alt = ''
          const frame = e.parentElement
          const w = frame?.getAttribute('svg:width')
          if (w && /^[\d.]+(cm|mm|in|pt)$/.test(w)) img.style.width = w
          into.append(img)
        } else if (!e.querySelector('*')) {
          return
        } else this.children(e, into)
        return
      }
      case 'text:note': {
        // La nota al pie: solo su número (el texto entero, abajo, haría falta maquetarlo).
        const cit = Array.from(e.children).find((c) => c.localName === 'note-citation')
        if (cit) {
          const sup = el(this.doc, 'sup')
          sup.textContent = cit.textContent
          into.append(sup)
        }
        return
      }
      case 'office:annotation':
      case 'text:tracked-changes':
      case 'text:sequence-decls':
      case 'office:forms':
      case 'presentation:notes':
      case 'svg:title':
      case 'svg:desc':
        return
      default:
        this.children(e, into)
    }
  }

  table(t: Element): HTMLTableElement {
    const table = el(this.doc, 'table')
    const rows: Element[] = []
    const collect = (parent: Element): void => {
      for (const c of Array.from(parent.children)) {
        if (c.localName === 'table-row') {
          const rep = Math.min(MAX_REPEAT, Number(c.getAttribute('table:number-rows-repeated') ?? 1))
          for (let i = 0; i < rep; i++) rows.push(c)
        } else if (c.localName === 'table-rows' || c.localName === 'table-header-rows' || c.localName === 'table-row-group') collect(c)
      }
    }
    collect(t)
    // Las filas vacías del final (LibreOffice deja muchas) no se pintan.
    while (rows.length && !rows[rows.length - 1].textContent?.trim()) rows.pop()
    for (const r of rows) {
      const tr = el(this.doc, 'tr')
      const cells: Element[] = []
      for (const c of Array.from(r.children)) {
        if (c.localName !== 'table-cell' && c.localName !== 'covered-table-cell') continue
        const rep = Math.min(MAX_REPEAT, Number(c.getAttribute('table:number-columns-repeated') ?? 1))
        for (let i = 0; i < rep; i++) cells.push(c)
      }
      while (cells.length && !cells[cells.length - 1].textContent?.trim() && cells[cells.length - 1].localName === 'table-cell') cells.pop()
      for (const c of cells) {
        if (c.localName === 'covered-table-cell') continue
        const td = el(this.doc, 'td')
        const cs = Number(c.getAttribute('table:number-columns-spanned') ?? 1)
        const rs = Number(c.getAttribute('table:number-rows-spanned') ?? 1)
        if (cs > 1) td.colSpan = cs
        if (rs > 1) td.rowSpan = rs
        this.children(c, td)
        tr.append(td)
      }
      table.append(tr)
    }
    return table
  }
}

export function readOdf(bytes: ArrayBuffer | Uint8Array, doc: Document = document): RichDoc {
  const files = unzip(bytes, (n) => n === 'content.xml' || n === 'styles.xml' || n === 'mimetype' || n.startsWith('Pictures/') || n.startsWith('Thumbnails/'))
  const content = xml(files['content.xml'])
  if (!content) throw new Error('No es un documento OpenDocument (falta content.xml)')
  const styles = odfStyles(xml(files['styles.xml']), content)
  const media = new Map<string, Uint8Array>()
  const w = new OdfWriter(doc, styles, files, media)
  const body = el(doc, 'article', 'doc')
  const officeBody = Array.from(content.documentElement.children).find((c) => c.localName === 'body')
  const kind = Array.from(officeBody?.children ?? [])[0]
  if (kind?.localName === 'presentation' || kind?.localName === 'drawing') {
    // Presentación: una tarjeta por diapositiva, con sus textos e imágenes en orden.
    body.className = 'deck'
    let n = 0
    for (const page of Array.from(kind.children).filter((c) => c.localName === 'page')) {
      n++
      const card = el(doc, 'section', 'page')
      const label = el(doc, 'div', 'page-num')
      label.textContent = String(n)
      card.append(label)
      for (const frame of Array.from(page.children)) {
        const cls = frame.getAttribute('presentation:class')
        if (cls === 'title') {
          const h = el(doc, 'h2')
          h.textContent = frame.textContent?.trim() ?? ''
          if (h.textContent) card.append(h)
        } else w.node(frame, card)
      }
      body.append(card)
    }
  } else if (kind) {
    w.children(kind, body)
  }
  if (!body.textContent?.trim() && !body.querySelector('img')) {
    const thumb = files['Thumbnails/thumbnail.png']
    if (thumb) {
      media.set('Thumbnails/thumbnail.png', thumb)
      return { body, preview: 'Thumbnails/thumbnail.png', media }
    }
  }
  return { body, media }
}

// ================================================================ RTF

/** Las páginas de código más habituales de RTF (\ansicpg): 1252 es la de Windows en español e inglés. */
function cpDecoder(cp: number): TextDecoder {
  try {
    return new TextDecoder(cp === 65001 ? 'utf-8' : `windows-${cp}`)
  } catch {
    return new TextDecoder('windows-1252')
  }
}

/** Partes del RTF que no son texto del documento (tablas de letras y colores, imágenes, datos…). */
const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'mmathPr', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'fldinst', 'bkmkstart', 'bkmkend', 'filetbl', 'revtbl', 'pgdsctbl', 'operator', 'author', 'title'])

export function readRtf(text: string, doc: Document = document): RichDoc {
  if (!text.trimStart().startsWith('{\\rtf')) throw new Error('No es un archivo RTF')
  const body = el(doc, 'article', 'doc')
  type State = { b: boolean; i: boolean; u: boolean; skip: boolean; uc: number }
  let st: State = { b: false, i: false, u: false, skip: false, uc: 1 }
  const stack: State[] = []
  let decoder = cpDecoder(1252)
  let para = el(doc, 'p')
  let align = ''
  let run = ''
  let runFmt = ''
  let pendingBytes: number[] = []
  let skipChars = 0
  const fmtKey = (): string => `${+st.b}${+st.i}${+st.u}`
  const flushBytes = (): void => {
    if (pendingBytes.length) {
      run += decoder.decode(new Uint8Array(pendingBytes))
      pendingBytes = []
    }
  }
  const flushRun = (): void => {
    flushBytes()
    if (!run) return
    const [b, i, u] = runFmt.split('').map((c) => c === '1')
    let node: Node = doc.createTextNode(run)
    if (b || i || u) {
      const span = el(doc, 'span')
      if (b) span.style.fontWeight = '700'
      if (i) span.style.fontStyle = 'italic'
      if (u) span.style.textDecoration = 'underline'
      span.append(node)
      node = span
    }
    para.append(node)
    run = ''
  }
  const add = (s: string): void => {
    if (st.skip) return
    if (skipChars > 0) {
      skipChars--
      return
    }
    flushBytes()
    const k = fmtKey()
    if (k !== runFmt) {
      flushRun()
      runFmt = k
    }
    run += s
  }
  const endPara = (): void => {
    flushRun()
    if (align) para.style.textAlign = align
    if (!para.textContent) para.append(' ')
    body.append(para)
    para = el(doc, 'p')
  }
  let i = 0
  let groupStart = false
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (c === '{') {
      flushBytes()
      stack.push({ ...st })
      groupStart = true
      i++
      continue
    }
    if (c === '}') {
      flushRun()
      st = stack.pop() ?? st
      runFmt = fmtKey()
      i++
      continue
    }
    if (c === '\\') {
      const next = text[i + 1]
      if (next === "'") {
        const hex = text.slice(i + 2, i + 4)
        if (!st.skip && skipChars > 0) skipChars--
        else if (!st.skip) {
          const k = fmtKey()
          if (k !== runFmt) {
            flushRun()
            runFmt = k
          }
          pendingBytes.push(parseInt(hex, 16))
        }
        i += 4
        groupStart = false
        continue
      }
      flushBytes()
      if (next === '*') {
        if (groupStart) st.skip = true
        i += 2
        continue
      }
      if (next && !/[a-zA-Z]/.test(next)) {
        if (next === '\\' || next === '{' || next === '}') add(next)
        else if (next === '~') add(' ')
        else if (next === '-' || next === '_') add(next === '_' ? '-' : '')
        else if (next === '\n' || next === '\r') endPara()
        i += 2
        groupStart = false
        continue
      }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(text.slice(i + 1, i + 40))
      if (!m) {
        i++
        continue
      }
      const word = m[1]
      const arg = m[2] != null ? Number(m[2]) : undefined
      i += 1 + m[0].length
      if (groupStart && RTF_SKIP.has(word)) st.skip = true
      groupStart = false
      switch (word) {
        case 'par':
        case 'sect':
        case 'page':
          if (!st.skip) endPara()
          break
        case 'line':
          if (!st.skip) {
            flushRun()
            para.append(el(doc, 'br'))
          }
          break
        case 'tab':
          add('\t')
          break
        case 'cell':
          add('\t')
          break
        case 'row':
          if (!st.skip) endPara()
          break
        case 'pard':
          align = ''
          break
        case 'qc':
          align = 'center'
          break
        case 'qr':
          align = 'right'
          break
        case 'qj':
          align = 'justify'
          break
        case 'ql':
          align = ''
          break
        case 'b':
          st.b = arg !== 0
          break
        case 'i':
          st.i = arg !== 0
          break
        case 'ul':
          st.u = arg !== 0
          break
        case 'ulnone':
          st.u = false
          break
        case 'plain':
          st.b = st.i = st.u = false
          break
        case 'ansicpg':
          if (arg) decoder = cpDecoder(arg)
          break
        case 'uc':
          st.uc = arg ?? 1
          break
        case 'u':
          if (arg != null && !st.skip) {
            add(String.fromCharCode(arg < 0 ? arg + 65536 : arg))
            skipChars = st.uc
          }
          break
        case 'emdash':
          add('—')
          break
        case 'endash':
          add('–')
          break
        case 'bullet':
          add('•')
          break
        case 'lquote':
          add('‘')
          break
        case 'rquote':
          add('’')
          break
        case 'ldblquote':
          add('“')
          break
        case 'rdblquote':
          add('”')
          break
      }
      continue
    }
    if (c === '\r' || c === '\n') {
      i++
      continue
    }
    groupStart = false
    add(c)
    i++
  }
  endPara()
  // Los párrafos vacíos del final sobran.
  while (body.lastElementChild && body.lastElementChild.textContent === ' ') body.lastElementChild.remove()
  return { body, media: new Map() }
}

// ================================================================ ePub

/** Se quita todo lo que pueda ejecutar algo o cargar cosas de fuera; las imágenes del libro se marcan con data-media. */
function sanitizeInto(src: Element, into: HTMLElement, doc: Document, files: Unzipped, base: string, media: Map<string, Uint8Array>): void {
  const ALLOWED = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'em', 'strong', 'b', 'i', 'u', 's', 'sub', 'sup', 'br', 'hr', 'blockquote', 'pre', 'code', 'span', 'div', 'section', 'article', 'aside', 'header', 'footer', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'a', 'img', 'small', 'big', 'dl', 'dt', 'dd', 'cite', 'q', 'abbr', 'mark', 'nav'])
  for (const n of Array.from(src.childNodes)) {
    if (n.nodeType === 3) {
      into.append(doc.createTextNode(n.textContent ?? ''))
      continue
    }
    if (n.nodeType !== 1) continue
    const e = n as Element
    const tag = e.localName.toLowerCase()
    if (tag === 'image' || tag === 'svg') {
      const href = e.getAttributeNS(XLINK, 'href') ?? e.querySelector('image')?.getAttributeNS(XLINK, 'href')
      if (href) {
        const img = doc.createElement('img')
        const path = joinPath(base, href)
        if (files[path] && IMG_EXT.test(path)) {
          media.set(path, files[path])
          img.dataset.media = path
          into.append(img)
        }
      }
      continue
    }
    if (!ALLOWED.has(tag)) {
      if (!['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta', 'video', 'audio', 'head'].includes(tag)) sanitizeInto(e, into, doc, files, base, media)
      continue
    }
    const out = doc.createElement(tag)
    if (tag === 'a') {
      const href = safeHref(e.getAttribute('href'))
      if (href) (out as HTMLAnchorElement).href = href
    } else if (tag === 'img') {
      const path = joinPath(base, e.getAttribute('src') ?? '')
      if (!files[path] || !IMG_EXT.test(path)) continue
      media.set(path, files[path])
      out.dataset.media = path
      ;(out as HTMLImageElement).alt = e.getAttribute('alt') ?? ''
    } else if (tag === 'td' || tag === 'th') {
      const cs = Number(e.getAttribute('colspan') ?? 1)
      const rs = Number(e.getAttribute('rowspan') ?? 1)
      if (cs > 1) (out as HTMLTableCellElement).colSpan = cs
      if (rs > 1) (out as HTMLTableCellElement).rowSpan = rs
    }
    const id = e.getAttribute('id')
    if (id) out.id = id
    sanitizeInto(e, out, doc, files, base, media)
    into.append(out)
  }
}

function joinPath(base: string, rel: string): string {
  const clean = decodeURIComponent(rel.split('#')[0])
  if (!clean) return ''
  const parts = base.split('/').slice(0, -1)
  for (const seg of clean.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

/** Más capítulos no se pintan (un libro entero puede tener cientos). */
export const MAX_CHAPTERS = 200

export function readEpub(bytes: ArrayBuffer | Uint8Array, doc: Document = document): RichDoc {
  const files = unzip(bytes)
  const container = xml(files['META-INF/container.xml'])
  const opfPath = container?.getElementsByTagName('rootfile')[0]?.getAttribute('full-path') ?? Object.keys(files).find((f) => f.endsWith('.opf'))
  const opf = opfPath ? xml(files[opfPath]) : null
  if (!opf || !opfPath) throw new Error('No es un libro ePub (falta el índice .opf)')
  const manifest = new Map<string, string>()
  for (const item of Array.from(opf.getElementsByTagName('*')).filter((e) => e.localName === 'item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) manifest.set(id, joinPath(opfPath, href))
  }
  const spine = Array.from(opf.getElementsByTagName('*'))
    .filter((e) => e.localName === 'itemref')
    .map((e) => manifest.get(e.getAttribute('idref') ?? ''))
    .filter((p): p is string => !!p)
  const media = new Map<string, Uint8Array>()
  const body = el(doc, 'article', 'doc book')
  const title = Array.from(opf.getElementsByTagName('*')).find((e) => e.localName === 'title')?.textContent?.trim()
  if (title) {
    const h = el(doc, 'h1', 'book-title')
    h.textContent = title
    body.append(h)
  }
  for (const path of spine.slice(0, MAX_CHAPTERS)) {
    const raw = files[path]
    if (!raw) continue
    const chapter = new DOMParser().parseFromString(dec.decode(raw), /\.x?html?$/i.test(path) && !/\.xhtml$/i.test(path) ? 'text/html' : 'application/xhtml+xml')
    const src = chapter.getElementsByTagName('body')[0] ?? chapter.documentElement
    const section = el(doc, 'section', 'chapter')
    sanitizeInto(src, section, doc, files, path, media)
    if (section.textContent?.trim() || section.querySelector('img')) body.append(section)
  }
  return { body, media }
}

// ================================================================ Pages y Keynote

/** Pages, Keynote (y Numbers, si no se puede leer como hoja) guardan dentro una imagen o un PDF de la primera página. */
export function readIwork(bytes: ArrayBuffer | Uint8Array, doc: Document = document): RichDoc {
  const files = unzip(bytes, (n) => /^(preview(-web)?\.jpg|QuickLook\/(Preview\.pdf|Thumbnail\.jpg|Preview\.jpg))$/i.test(n))
  const media = new Map<string, Uint8Array>()
  const body = el(doc, 'article', 'doc')
  const pdf = files['QuickLook/Preview.pdf']
  if (pdf) {
    media.set('QuickLook/Preview.pdf', pdf)
    return { body, pdf: 'QuickLook/Preview.pdf', media }
  }
  for (const name of ['preview.jpg', 'QuickLook/Preview.jpg', 'preview-web.jpg', 'QuickLook/Thumbnail.jpg']) {
    if (files[name]) {
      media.set(name, files[name])
      return { body, preview: name, media }
    }
  }
  throw new Error('Este archivo de Apple no trae vista previa dentro')
}
