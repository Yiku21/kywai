// Fotos de páginas con una ventana oculta de Electron (como uiShots.ts), usadas por el estudio de vídeo:
//  · htmlToPng: una página HTML hecha por kywai (portadas, rótulos, marcos de móvil) → PNG del tamaño exacto, con fondo
//    transparente si se pide (para ponerla encima de un vídeo).
//  · capturePage: una web cualquiera entera (de arriba abajo), en ordenador o en móvil, y lo que kywai necesita saber
//    de ella (título, descripción, secciones con su altura y el color de la marca). La usa «/demo».
// La ventana se hace del tamaño de la foto (puede ser más grande que la pantalla: está oculta) y se fotografía con
// capturePage. El móvil se ve a doble resolución con el zoom de la página (el ancho CSS sigue siendo el de un móvil).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Electron = typeof import('electron')
type BrowserWindow = import('electron').BrowserWindow

async function electron(): Promise<Electron | null> {
  // Fuera de Electron (pruebas) no hay ventanas que abrir.
  if (!process.versions.electron) return null
  try {
    const e = await import('electron')
    return typeof e.BrowserWindow === 'function' ? e : null
  } catch {
    return null
  }
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Abre una ventana oculta en una sesión aparte y sin permisos, hace `fn` y la cierra pase lo que pase. */
async function withWindow<T>(fn: (win: BrowserWindow) => Promise<T>, opts: { width: number; height: number; partition: string; transparent?: boolean }): Promise<T | null> {
  const e = await electron()
  if (!e) return null
  const ses = e.session.fromPartition(`${opts.partition}-${Date.now()}`, { cache: false })
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  const win = new e.BrowserWindow({
    show: false,
    width: opts.width,
    height: opts.height,
    useContentSize: true,
    enableLargerThanScreen: true,
    ...(opts.transparent ? { transparent: true, frame: false, backgroundColor: '#00000000' } : {}),
    webPreferences: { session: ses, offscreen: false, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true, backgroundThrottling: false }
  })
  try {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    return await fn(win)
  } finally {
    if (!win.isDestroyed()) win.destroy()
    void ses.clearStorageData().catch(() => undefined)
  }
}

/** Pone la ventana a `w`×`h` (aunque no quepa en la pantalla) y la fotografía. */
async function shoot(win: BrowserWindow, w: number, h: number): Promise<Buffer | null> {
  win.setContentSize(Math.round(w), Math.round(h))
  await wait(450)
  if (win.isDestroyed()) return null
  const img = await win.webContents.capturePage()
  if (img.isEmpty()) return null
  const size = img.getSize()
  // Si el sistema no dejó la ventana tan grande, se recorta a lo que sí salió.
  return size.width >= Math.round(w) * 0.98 ? img.toPNG() : null
}

async function load(win: BrowserWindow, url: string, timeoutMs: number): Promise<void> {
  await Promise.race([win.loadURL(url).catch(() => undefined), wait(timeoutMs)])
}

/**
 * Una página HTML de kywai → PNG de `w`×`h` píxeles. Las imágenes se ponen con rutas absolutas (file://). Con
 * `transparent`, lo que no pinta la página queda transparente. Devuelve false fuera de Electron o si falla.
 */
export async function htmlToPng(html: string, size: { w: number; h: number }, out: string, opts: { transparent?: boolean } = {}): Promise<boolean> {
  const dir = mkdtempSync(join(tmpdir(), 'kywai-html-'))
  const file = join(dir, 'pagina.html')
  writeFileSync(file, html)
  try {
    const png = await withWindow(
      async (win) => {
        await load(win, `file://${file.replace(/\\/g, '/')}`, 20_000)
        // Que estén las fuentes y las imágenes antes de la foto.
        await win.webContents.executeJavaScript('Promise.race([Promise.all([document.fonts.ready, ...[...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r }))]), new Promise(r => setTimeout(r, 8000))]).then(() => true)').catch(() => undefined)
        return shoot(win, size.w, size.h)
      },
      { width: size.w, height: size.h, partition: 'kywai-html', transparent: opts.transparent }
    )
    if (!png?.length) return false
    writeFileSync(out, png)
    return true
  } catch (e) {
    console.warn('[cowork] no se pudo hacer la imagen', e)
    return false
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Una sección de la web: dónde empieza y cuánto mide (px de la foto) y cómo se llama. */
export interface PageSection {
  y: number
  h: number
  label: string
}

export interface PageCapture {
  /** La foto entera de la página (PNG). */
  file: string
  w: number
  h: number
  title: string
  description: string
  sections: PageSection[]
  /** Color de la marca (el de sus botones o el theme-color), en #rrggbb. */
  color: string
  /** Color de fondo de la página, en #rrggbb. */
  background: string
}

/** Lo que se lee de la página (corre dentro de ella). */
const READ_PAGE = `(() => {
  const hex = (c) => { const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/.exec(c || ''); if (!m || (m[4] !== undefined && +m[4] < 0.5)) return ''; return '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('') }
  const grey = (h) => { if (!h) return true; const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return Math.max(r, g, b) - Math.min(r, g, b) < 24 }
  let color = (document.querySelector('meta[name="theme-color"]') || {}).content || ''
  if (!/^#[0-9a-f]{6}$/i.test(color) || grey(color)) {
    color = ''
    for (const el of document.querySelectorAll('a, button, [class*="btn"], [class*="button"]')) {
      const c = hex(getComputedStyle(el).backgroundColor)
      if (c && !grey(c)) { color = c; break }
    }
  }
  const background = hex(getComputedStyle(document.body).backgroundColor) || hex(getComputedStyle(document.documentElement).backgroundColor) || '#ffffff'
  const seen = []
  for (const el of document.querySelectorAll('header, section, main > div, footer, h1, h2')) {
    const r = el.getBoundingClientRect()
    const y = Math.round(r.top + window.scrollY)
    const h = Math.round(r.height)
    if (h < 120 && !/^H[12]$/.test(el.tagName)) continue
    const label = ((el.matches('h1, h2') ? el : el.querySelector('h1, h2, h3')) || {}).innerText || el.getAttribute('aria-label') || el.tagName.toLowerCase()
    if (seen.some((s) => Math.abs(s.y - y) < 160)) continue
    seen.push({ y, h: Math.max(h, 400), label: String(label).replace(/\\s+/g, ' ').trim().slice(0, 80) })
  }
  seen.sort((a, b) => a.y - b.y)
  return {
    title: document.title || '',
    description: (document.querySelector('meta[name="description"], meta[property="og:description"]') || {}).content || '',
    h1: ((document.querySelector('h1') || {}).innerText || '').trim(),
    sections: seen.slice(0, 14),
    color, background,
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
  }
})()`

/** Baja poco a poco hasta el final (las webs que cargan al hacer scroll) y vuelve arriba. */
const SCROLL_THROUGH = `(async () => {
  const step = Math.max(400, Math.round(innerHeight * 0.8))
  for (let y = 0; y < Math.min(document.documentElement.scrollHeight, 20000); y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) }
  scrollTo(0, 0); await new Promise((r) => setTimeout(r, 400)); return true
})()`

/** Fija en píxeles lo que mide justo una pantalla de alto (los «100vh»): si no, crecería con la ventana. */
const FREEZE_VH = `(() => {
  const vh = innerHeight
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.height >= vh * 0.9 && r.height <= vh * 1.1) { el.style.setProperty('height', r.height + 'px', 'important'); el.style.setProperty('min-height', '0', 'important') }
  }
  return true
})()`

/**
 * La web entera (de arriba abajo, como mucho `maxHeight` px de CSS) en ordenador (1440 de ancho) o en móvil (390 de
 * ancho, a doble resolución). Solo se navega dentro de esa web. null fuera de Electron o si no carga.
 */
export async function capturePage(url: string, out: string, opts: { mobile?: boolean; maxHeight?: number } = {}): Promise<PageCapture | null> {
  if (!/^https?:\/\//i.test(url)) return null
  const width = opts.mobile ? 390 : 1440
  const height = opts.mobile ? 844 : 900
  const zoom = opts.mobile ? 2 : 1
  const maxHeight = opts.maxHeight ?? (opts.mobile ? 2600 : 6000)
  try {
    return await withWindow(
      async (win) => {
        const wc = win.webContents
        if (opts.mobile) wc.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
        const host = new URL(url).host
        wc.on('will-navigate', (e, to) => {
          try {
            if (new URL(to).host !== host) e.preventDefault()
          } catch {
            e.preventDefault()
          }
        })
        await load(win, url, 30_000)
        wc.setZoomFactor(zoom)
        await wait(1500)
        await Promise.race([wc.executeJavaScript(SCROLL_THROUGH).catch(() => undefined), wait(15_000)])
        // Las cosas que aparecen al bajar (animaciones de entrada) ya se han visto: se dejan visibles.
        await wc.insertCSS('*,*::before,*::after{animation-play-state:paused!important;transition:none!important} ::-webkit-scrollbar{display:none!important} html{scrollbar-width:none!important} [data-aos],[class*="reveal"],[class*="fade"]{opacity:1!important;transform:none!important}').catch(() => undefined)
        // Lo que mide «una pantalla» (100vh) se queda como está al hacer la ventana tan alta como la página.
        await wc.executeJavaScript(FREEZE_VH).catch(() => undefined)
        const info = (await wc.executeJavaScript(READ_PAGE).catch(() => null)) as null | { title: string; description: string; h1: string; sections: PageSection[]; color: string; background: string; height: number }
        if (!info) return null
        const h = Math.min(Math.max(height, info.height), maxHeight)
        const png = await shoot(win, width * zoom, h * zoom)
        if (!png) return null
        writeFileSync(out, png)
        return {
          file: out,
          w: width * zoom,
          h: h * zoom,
          title: (info.title || info.h1 || host).trim().slice(0, 120),
          description: (info.description || '').trim().slice(0, 300),
          sections: info.sections.filter((s) => s.y < h).map((s) => ({ y: s.y * zoom, h: Math.min(s.h, h - s.y) * zoom, label: s.label })),
          color: /^#[0-9a-f]{6}$/i.test(info.color) ? info.color.toLowerCase() : '',
          background: /^#[0-9a-f]{6}$/i.test(info.background) ? info.background.toLowerCase() : '#ffffff'
        }
      },
      { width: width * zoom, height: height * zoom, partition: 'kywai-demo' }
    )
  } catch (e) {
    console.warn('[cowork] no se pudo fotografiar la web', e)
    return null
  }
}
