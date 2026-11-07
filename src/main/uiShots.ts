// Capturas de la interfaz para el verificador: si una tarea tocó una web (HTML, CSS, componentes…), kywai la abre
// en una ventana oculta de Electron a tamaño de escritorio y de móvil, guarda las capturas y apunta los errores de la
// consola. El verificador las recibe como imágenes: así comprueba cómo se ve de verdad, no solo cómo está escrito.
import { createServer, type Server } from 'node:http'
import { promises as fsp, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, relative, resolve, sep } from 'node:path'

export interface UiShot {
  /** Ruta de la captura relativa a la carpeta de trabajo (así la reciben los CLI). */
  path: string
  /** Página capturada, relativa a la carpeta. */
  page: string
  /** «escritorio» o «móvil». */
  view: string
}

export interface UiShots {
  shots: UiShot[]
  /** Errores de consola, recursos que no cargaron y fallos de carga (sin repetir, como mucho 12). */
  errors: string[]
}

/** Lo que cuenta como cambio de interfaz. Los .js/.ts solo si están en carpetas de interfaz. */
const UI_EXT = new Set(['.html', '.htm', '.css', '.scss', '.sass', '.less', '.jsx', '.tsx', '.vue', '.svelte', '.astro'])
const UI_DIR = /(^|\/)(src|app|pages|components|ui|public|static|assets|web|www|frontend|client)\//i
/** Dónde suele estar la página de entrada (lo ya compilado primero: un index.html de Vite sin compilar no se ve). */
const ENTRIES = ['dist/index.html', 'build/index.html', 'out/index.html', 'index.html', 'public/index.html', 'docs/index.html', 'www/index.html']
const VIEWS = [
  { view: 'escritorio', width: 1280, height: 800, mobile: false },
  { view: 'móvil', width: 390, height: 844, mobile: true }
]
const MAX_PAGES = 2
const LOAD_TIMEOUT_MS = 15_000
const SETTLE_MS = 900
export const SHOTS_DIR = '.ai-cowork/verificacion'

export function touchesUi(changed: string[]): boolean {
  return changed.some((f) => {
    const p = f.replace(/\\/g, '/')
    const ext = extname(p).toLowerCase()
    return UI_EXT.has(ext) || ((ext === '.js' || ext === '.ts' || ext === '.mjs') && UI_DIR.test(p))
  })
}

/** Las páginas que conviene abrir: las HTML que cambió la tarea o, si no, la entrada de la web del proyecto. */
export function pagesToShoot(dir: string, changed: string[]): string[] {
  if (!touchesUi(changed)) return []
  const html = changed
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => /\.html?$/i.test(f) && !f.startsWith('.ai-cowork/') && !f.includes('node_modules/') && existsSync(join(dir, f)))
    .sort((a, b) => Number(!/(^|\/)index\.html?$/i.test(a)) - Number(!/(^|\/)index\.html?$/i.test(b)) || a.length - b.length)
  if (html.length) return html.slice(0, MAX_PAGES)
  const entry = ENTRIES.find((e) => existsSync(join(dir, e)))
  return entry ? [entry] : []
}

type Capturer = (dir: string, pages: string[], outDir: string, tag: string) => Promise<UiShots | null>
let capturer: Capturer = electronCapture

/** Para las comprobaciones sin Electron. */
export function __setUiCapturerForChecks(fn: Capturer | null): void {
  capturer = fn ?? electronCapture
}

/** Abre las páginas de la tarea y guarda sus capturas en .ai-cowork/verificacion. null si no hay nada que ver o no se pudo. */
export async function captureUi(dir: string, changed: string[], tag: string): Promise<UiShots | null> {
  const pages = pagesToShoot(dir, changed)
  if (!pages.length) return null
  try {
    const outDir = join(dir, SHOTS_DIR)
    await fsp.mkdir(outDir, { recursive: true })
    const r = await capturer(dir, pages, outDir, tag.replace(/[^\w-]/g, '').slice(0, 24) || 'tarea')
    return r && r.shots.length ? r : null
  } catch (e) {
    console.warn('[cowork] no se pudo capturar la interfaz', e)
    return null
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.txt': 'text/plain'
}

/** Servidor de solo lectura en 127.0.0.1 con raíz en la carpeta de la página (así las rutas «/assets/…» funcionan). */
function serveDir(root: string): Promise<{ server: Server; port: number }> {
  const base = resolve(root)
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x')
      let file = normalize(join(base, decodeURIComponent(url.pathname)))
      if (file !== base && !file.startsWith(base + sep)) return void res.writeHead(403).end()
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
      if (!existsSync(file)) return void res.writeHead(404).end()
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' })
      void fsp.readFile(file).then((b) => res.end(b), () => res.end())
    } catch {
      res.writeHead(400).end()
    }
  })
  return new Promise((ok, ko) => {
    server.once('error', ko)
    server.listen(0, '127.0.0.1', () => ok({ server, port: (server.address() as { port: number }).port }))
  })
}

async function electronCapture(dir: string, pages: string[], outDir: string, tag: string): Promise<UiShots | null> {
  // Fuera de Electron (pruebas) no hay ventanas que abrir.
  if (!process.versions.electron) return null
  let electron: typeof import('electron')
  try {
    electron = await import('electron')
  } catch {
    return null
  }
  const { BrowserWindow, session } = electron
  if (typeof BrowserWindow !== 'function' || !session) return null
  const shots: UiShot[] = []
  const errors = new Set<string>()
  // Sesión aparte y sin persistencia: la web de la tarea no ve las cookies ni el almacenamiento de kywai.
  const ses = session.fromPartition(`verify-${tag}-${Date.now()}`, { cache: false })
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  for (const [n, page] of pages.entries()) {
    const pageDir = join(dir, page, '..')
    const { server, port } = await serveDir(pageDir)
    const url = `http://127.0.0.1:${port}/${encodeURIComponent(page.split('/').pop()!)}`
    try {
      for (const v of VIEWS) {
        const win = new BrowserWindow({
          show: false,
          width: v.width,
          height: v.height,
          useContentSize: true,
          webPreferences: { session: ses, offscreen: false, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true }
        })
        try {
          const wc = win.webContents
          if (v.mobile) wc.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
          // Solo se sale a la red local de la página: nada de abrir ventanas ni navegar fuera.
          wc.setWindowOpenHandler(() => ({ action: 'deny' }))
          wc.on('will-navigate', (e, to) => {
            if (!to.startsWith(`http://127.0.0.1:${port}/`)) e.preventDefault()
          })
          wc.on('console-message', (e) => {
            const source = e.sourceId?.replace(/^http:\/\/127\.0\.0\.1:\d+\//, '')
            if (e.level === 'error') errors.add(`[${v.view}] consola: ${e.message.slice(0, 300)}${source ? ` (${source}:${e.lineNumber})` : ''}`)
          })
          wc.on('did-fail-load', (_e, code, desc, failedUrl) => {
            if (code !== -3) errors.add(`[${v.view}] no cargó ${failedUrl.replace(/^http:\/\/127\.0\.0\.1:\d+\//, '')}: ${desc}`)
          })
          wc.on('render-process-gone', (_e, d) => errors.add(`[${v.view}] la página se cerró: ${d.reason}`))
          ses.webRequest.onCompleted({ urls: [`http://127.0.0.1:${port}/*`] }, (d) => {
            if (d.statusCode >= 400) errors.add(`[${v.view}] ${d.statusCode} al pedir ${d.url.replace(/^http:\/\/127\.0\.0\.1:\d+\//, '')}`)
          })
          await Promise.race([win.loadURL(url).catch(() => undefined), new Promise((r) => setTimeout(r, LOAD_TIMEOUT_MS))])
          await new Promise((r) => setTimeout(r, SETTLE_MS))
          if (win.isDestroyed()) continue
          const img = await wc.capturePage()
          if (img.isEmpty()) continue
          const name = `${tag}-${n + 1}-${v.mobile ? 'movil' : 'escritorio'}.png`
          await fsp.writeFile(join(outDir, name), img.toPNG())
          shots.push({ path: relative(dir, join(outDir, name)).split(sep).join('/'), page, view: v.view })
        } finally {
          if (!win.isDestroyed()) win.destroy()
        }
      }
    } finally {
      server.close()
    }
  }
  void ses.clearStorageData().catch(() => undefined)
  return { shots, errors: [...errors].slice(0, 12) }
}
