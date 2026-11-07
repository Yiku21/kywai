// Modo cliente: esta instalación de AI Cowork no ejecuta agentes; se empareja con otro AI Cowork (el principal, por
// ejemplo en un equipo encendido 24/7) y muestra su interfaz. Todo el trabajo, los archivos y los agentes siguen en
// el servidor; aquí solo hay la ventana, la llave de este dispositivo y los puentes con el sistema de este equipo.
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, Notification, safeStorage, session, shell, type IpcMainInvokeEvent } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ClientUpdateState } from '@shared/types'
import { createReadStream, existsSync, mkdirSync, promises as fsp } from 'node:fs'
import { createHash } from 'node:crypto'
import { hostname } from 'node:os'
import { basename, join } from 'node:path'
import { contextMenuItems } from './contextMenu'
import { verifyRelease, type SignedRelease } from './clientRelease'
import { CLIENT_RELEASE_PUBLIC_KEY } from './clientReleaseKey'
import { SyncManager } from './syncManager'
import { defaultWorkspaceRoot } from './config'
import {
  parseServerAddress,
  pairingProblem,
  readClientFile,
  writeClientFile,
  type AppMode,
  type ClientFile,
  type ClientServer
} from './clientConfig'
import { lang, langFromLocale, setCurrentLang, tr } from '@shared/i18n'

const COOKIE = 'cowork_token'
const APP_ICON = join(app.getAppPath(), 'build', 'icon.ico')

export function clientFilePath(): string {
  return join(app.getPath('userData'), 'client.json')
}

/**
 * Con qué modo arranca esta instalación. Sin archivo: una instalación nueva pregunta (servidor o cliente); la que ya
 * tenía datos de AI Cowork es un servidor y no se le pregunta nada.
 */
export function savedMode(): ClientFile | null {
  const saved = readClientFile(clientFilePath())
  if (saved) return saved
  if (!app.isPackaged || existsSync(join(defaultWorkspaceRoot(), 'config.json'))) return { mode: 'server' }
  return null
}

/**
 * Chromium solo deja usar el micrófono en páginas seguras. El servidor va por la red privada de Tailscale
 * (cifrada), así que su dirección se marca como segura para esta app; hay que hacerlo antes de que arranque.
 */
export function prepareClientSwitches(): void {
  const saved = readClientFile(clientFilePath())
  if (saved?.mode === 'client' && saved.server) app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', saved.server.origin)
}

// ---------- Llave de este dispositivo ----------

// Textos de la página de arriba que cambian con el idioma: [trozo tal cual en PAGE, texto en español que se traduce].
// Las traducciones no llevan comillas simples: van dentro de cadenas de JavaScript de la página.
const PAGE_TEXTS: Array<[string, string]> = [
  ['>Bienvenido a AI Cowork<', 'Bienvenido a AI Cowork'],
  ['¿Cómo vas a usar este equipo?', '¿Cómo vas a usar este equipo?'],
  ['Este equipo es mi servidor<', 'Este equipo es mi servidor'],
  ['Aquí corren los agentes y se guardan los proyectos. Lo normal en el equipo que está siempre encendido.', 'Aquí corren los agentes y se guardan los proyectos. Lo normal en el equipo que está siempre encendido.'],
  ['Conectar con mi AI Cowork principal', 'Conectar con mi AI Cowork principal'],
  ['Se empareja con tu servidor y usa su espacio, sus proyectos y sus archivos desde aquí.', 'Se empareja con tu servidor y usa su espacio, sus proyectos y sus archivos desde aquí.'],
  ['>Conectar con tu AI Cowork<', 'Conectar con tu AI Cowork'],
  ['En el equipo servidor abre ⋮ → «Acceso desde otros dispositivos…», activa el acceso y genera un código de 6 cifras. Este equipo necesita Tailscale conectado.', 'En el equipo servidor abre ⋮ → «Acceso desde otros dispositivos…», activa el acceso y genera un código de 6 cifras. Este equipo necesita Tailscale conectado.'],
  ['>Dirección del servidor<', 'Dirección del servidor'],
  ['"100.101.102.103 o mac-mini"', '100.101.102.103 o mac-mini'],
  ['>Código de 6 cifras (o el código de acceso)<', 'Código de 6 cifras (o el código de acceso)'],
  ['>Conectar</button>', 'Conectar'],
  ["textContent = 'Conectar'", 'Conectar'],
  ["textContent = 'Conectando…'", 'Conectando…'],
  ['También puedes pegar el enlace de acceso completo en la dirección: trae el código.', 'También puedes pegar el enlace de acceso completo en la dirección: trae el código.'],
  ['>Sin conexión con ', 'Sin conexión con'],
  ["'No se llega al servidor.'", 'No se llega al servidor.'],
  ['Se reintenta solo cada pocos segundos. Comprueba que Tailscale está conectado en este equipo y que AI Cowork está abierto en el servidor.', 'Se reintenta solo cada pocos segundos. Comprueba que Tailscale está conectado en este equipo y que AI Cowork está abierto en el servidor.'],
  ['>Reintentar<', 'Reintentar'],
  ['>Cambiar de servidor<', 'Cambiar de servidor'],
  ['>Abriendo ', 'Abriendo']
]

/** La página en el idioma de la app. */
function localizedPage(): string {
  let html = PAGE.replace('<html lang="es">', `<html lang="${lang()}">`)
  for (const [chunk, text] of PAGE_TEXTS) html = html.split(chunk).join(chunk.replace(text, tr(text).replace(/'/g, '’')))
  return html
}

function sealToken(token: string): { token: string; encrypted: boolean } {
  try {
    if (safeStorage.isEncryptionAvailable()) return { token: safeStorage.encryptString(token).toString('base64'), encrypted: true }
  } catch {
    /* sin llavero: se guarda en el archivo del usuario (solo él puede leerlo) */
  }
  return { token, encrypted: false }
}

function openToken(server: ClientServer): string | null {
  if (!server.encrypted) return server.token
  try {
    return safeStorage.decryptString(Buffer.from(server.token, 'base64'))
  } catch {
    return null
  }
}

// ---------- Páginas propias (elegir modo, conectar, sin conexión) ----------

type ViewName = 'chooser' | 'connect' | 'offline' | 'opening'
interface View {
  name: ViewName
  message?: string
  server?: { name: string; origin: string }
  /** Dirección que ya había escrito o con la que estaba emparejado. */
  address?: string
}

const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Cowork</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#060a12;color:#e9eef8;font:15px system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:min(460px,92vw);padding:30px;border-radius:18px;background:#0e1524;border:1px solid #23324d}
h1{margin:0 0 6px;font-size:21px}p{margin:0 0 18px;color:#9aa8bf;line-height:1.5}label{display:block;margin:14px 0 6px;font-size:13px;color:#9aa8bf}
input{width:100%;height:44px;padding:0 12px;border-radius:10px;border:1px solid #2c3d5c;background:#0a101d;color:#e9eef8;font-size:15px}
input:focus{outline:2px solid #38d6ff55;border-color:#38d6ff}
button{height:44px;padding:0 18px;border:0;border-radius:10px;font-weight:650;font-size:15px;cursor:pointer;background:#38d6ff;color:#04121c}
button.ghost{background:#16213a;color:#cfd9ec;border:1px solid #2c3d5c}button:disabled{opacity:.55;cursor:default}
.row{display:flex;gap:10px;margin-top:18px}.row>button{flex:1}.choice{display:block;width:100%;height:auto;margin-top:12px;padding:16px;text-align:left}
.choice small{display:block;margin-top:4px;font-weight:400;color:#04121cb0}.choice.ghost small{color:#9aa8bf}
.msg{margin-top:14px;padding:10px 12px;border-radius:10px;background:#3a1a22;color:#ffb4c0;font-size:14px;line-height:1.45}.msg.info{background:#10263a;color:#a9d8ff}
.hint{margin-top:10px;font-size:13px;color:#7f8ca3;line-height:1.5}.hidden{display:none}
</style></head><body><main id="root"></main><script>
const api = window.coworkClient
const root = document.getElementById('root')
function el(html){ root.innerHTML = html }
function esc(s){ return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) }
function msg(v){ return v.message ? '<div class="msg ' + (v.name === 'offline' || v.name === 'opening' ? 'info' : '') + '" role="alert">' + esc(v.message) + '</div>' : '' }
function render(v){
  if (v.name === 'chooser') {
    el('<h1>Bienvenido a AI Cowork</h1><p>¿Cómo vas a usar este equipo?</p>' +
      '<button class="choice" id="server">Este equipo es mi servidor<small>Aquí corren los agentes y se guardan los proyectos. Lo normal en el equipo que está siempre encendido.</small></button>' +
      '<button class="choice ghost" id="client">Conectar con mi AI Cowork principal<small>Se empareja con tu servidor y usa su espacio, sus proyectos y sus archivos desde aquí.</small></button>')
    document.getElementById('server').onclick = () => api.chooseMode('server')
    document.getElementById('client').onclick = () => api.chooseMode('client')
  } else if (v.name === 'connect') {
    el('<h1>Conectar con tu AI Cowork</h1><p>En el equipo servidor abre ⋮ → «Acceso desde otros dispositivos…», activa el acceso y genera un código de 6 cifras. Este equipo necesita Tailscale conectado.</p>' +
      '<form id="f"><label for="a">Dirección del servidor</label><input id="a" placeholder="100.101.102.103 o mac-mini" autocomplete="off" spellcheck="false" value="' + esc(v.address) + '">' +
      '<label for="c">Código de 6 cifras (o el código de acceso)</label><input id="c" placeholder="123 456" autocomplete="off" spellcheck="false">' +
      '<div class="row"><button id="go">Conectar</button></div></form>' + msg(v) +
      '<p class="hint">También puedes pegar el enlace de acceso completo en la dirección: trae el código.</p>')
    const f = document.getElementById('f')
    f.onsubmit = async (e) => {
      e.preventDefault()
      const go = document.getElementById('go')
      go.disabled = true; go.textContent = 'Conectando…'
      const r = await api.pair(document.getElementById('a').value, document.getElementById('c').value)
      if (r && r.error) { go.disabled = false; go.textContent = 'Conectar'; render({ name: 'connect', address: document.getElementById('a').value, message: r.error }) }
    }
    document.getElementById(v.address ? 'c' : 'a').focus()
  } else if (v.name === 'offline') {
    el('<h1>Sin conexión con ' + esc(v.server && v.server.name) + '</h1><p>' + esc(v.message || 'No se llega al servidor.') + '</p>' +
      '<p class="hint">Se reintenta solo cada pocos segundos. Comprueba que Tailscale está conectado en este equipo y que AI Cowork está abierto en el servidor.</p>' +
      '<div class="row"><button id="retry">Reintentar</button><button class="ghost" id="switch">Cambiar de servidor</button></div>')
    document.getElementById('retry').onclick = () => api.retry()
    document.getElementById('switch').onclick = () => api.switchServer()
  } else {
    el('<h1>Abriendo ' + esc(v.server && v.server.name) + '…</h1><p>' + esc(v.message || '') + '</p>')
  }
}
api.onView(render)
api.view().then(render)
</script></body></html>`

// ---------- Ventana ----------

let win: BrowserWindow | null = null
let view: View = { name: 'opening' }
let retryTimer: NodeJS.Timeout | null = null
let current: { server: ClientServer; token: string } | null = null
/** Servidor con el que se arrancó (para el interruptor de página segura). */
let startedWith: string | null = null

function sendView(): void {
  if (win && !win.isDestroyed() && win.webContents.getURL().startsWith('data:')) win.webContents.send('client:view', view)
}

function showView(next: View): void {
  view = next
  if (retryTimer) clearInterval(retryTimer)
  retryTimer = null
  const w = ensureWindow()
  const onLocal = w.webContents.getURL().startsWith('data:')
  if (onLocal) sendView()
  else void w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(localizedPage())}`)
  if (next.name === 'offline') retryTimer = setInterval(() => void openServer(), 5000)
}

function ensureWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win
  const w = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#060a12',
    title: 'AI Cowork',
    autoHideMenuBar: true,
    icon: existsSync(APP_ICON) ? APP_ICON : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/client.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win = w
  // Ctrl/Cmd+R y F5 recargan la interfaz (sin barra de menús no hay otro sitio donde poner el atajo).
  w.webContents.on('before-input-event', (e, input) => {
    const reload = input.type === 'keyDown' && (input.key === 'F5' || (input.key.toLowerCase() === 'r' && (input.control || input.meta)))
    if (!reload) return
    e.preventDefault()
    void openServer()
  })
  w.once('ready-to-show', () => w.show())
  w.webContents.on('did-finish-load', sendView)
  w.webContents.on('context-menu', (_e, params) => {
    const items = contextMenuItems(params, {
      replaceMisspelling: (word) => w.webContents.replaceMisspelling(word),
      addToDictionary: (word) => w.webContents.session.addWordToSpellCheckerDictionary(word),
      openLink: (url) => void shell.openExternal(url),
      copyText: (t) => clipboard.writeText(t),
      copyImage: (x, y) => w.webContents.copyImageAt(x, y)
    })
    if (items.length) Menu.buildFromTemplate(items).popup({ window: w })
  })
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('data:')) return
    if (current && new URL(url).origin === new URL(current.server.origin).origin) return
    e.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
  // El servidor ya no reconoce este dispositivo (se revocó o caducó): hay que emparejarlo de nuevo.
  w.webContents.on('did-navigate', (_e, _url, status) => {
    if (status === 401 && current) {
      showView({ name: 'connect', address: current.server.origin, message: tr('Este dispositivo ya no está emparejado con el servidor. Genera un código nuevo y vuelve a conectar.') })
    }
  })
  w.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || url.startsWith('data:')) return
    if (current) showView({ name: 'offline', server: { name: current.server.name, origin: current.server.origin }, message: tr('No se pudo cargar AI Cowork desde el servidor.') })
  })
  w.on('closed', () => {
    if (win === w) win = null
  })
  return w
}

async function probe(origin: string, token: string): Promise<'ok' | 'denied' | 'down'> {
  try {
    const res = await fetch(`${origin}/api/ping`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000), cache: 'no-store' })
    if (res.status === 401) return 'denied'
    return res.ok ? 'ok' : 'down'
  } catch {
    return 'down'
  }
}

/** Abre la interfaz del servidor (o explica por qué no se pudo). */
async function openServer(): Promise<void> {
  const saved = readClientFile(clientFilePath())
  if (saved?.mode !== 'client' || !saved.server) {
    showView({ name: 'connect' })
    return
  }
  const server = saved.server
  const token = openToken(server)
  if (!token) {
    showView({ name: 'connect', address: server.origin, message: tr('No se pudo leer la llave guardada de este dispositivo. Vuelve a conectar.') })
    return
  }
  current = { server, token }
  const result = await probe(server.origin, token)
  if (!win || win.isDestroyed()) ensureWindow()
  if (result === 'denied') {
    showView({ name: 'connect', address: server.origin, message: tr('El servidor ya no reconoce este dispositivo (se revocó, caducó o el servidor es una versión anterior). Genera un código nuevo y vuelve a conectar.') })
    return
  }
  if (result === 'down') {
    if (view.name !== 'offline') showView({ name: 'offline', server: { name: server.name, origin: server.origin }, message: tr('No se llega a {origin}.', { origin: server.origin }) })
    return
  }
  if (retryTimer) clearInterval(retryTimer)
  retryTimer = null
  await session.defaultSession.cookies.set({
    url: server.origin,
    name: COOKIE,
    value: token,
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 3600
  })
  win!.setTitle(`AI Cowork · ${server.name}`)
  await win!.loadURL(`${server.origin}/`)
  scheduleUpdateChecks()
  syncManager().start()
}

async function pairWith(addressInput: string, codeInput: string): Promise<{ error?: string }> {
  const addr = parseServerAddress(String(addressInput ?? ''))
  if (!addr) return { error: tr('Escribe la dirección del servidor, por ejemplo 100.101.102.103 o mac-mini.') }
  const code = String(codeInput ?? '').trim() || addr.code || ''
  if (!code) return { error: tr('Escribe el código de 6 cifras que muestra el servidor.') }
  let res: Response
  try {
    res = await fetch(`${addr.origin}/api/mobile/v1/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, deviceName: hostname().replace(/\.local$/i, '').slice(0, 100) || 'Cliente', kind: 'client', platform: process.platform }),
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    return { error: tr('No se pudo conectar con {origin}. Comprueba que Tailscale está conectado en este equipo, que AI Cowork está abierto en el servidor y que tiene activado el acceso desde otros dispositivos.', { origin: addr.origin }) }
  }
  const data = (await res.json().catch(() => ({}))) as { accessToken?: string; deviceId?: string; serverName?: string; code?: string }
  if (!res.ok || !data.accessToken) return { error: pairingProblem(res.status, data.code) }

  const sealed = sealToken(data.accessToken)
  const server: ClientServer = {
    origin: addr.origin,
    name: (data.serverName || addr.host).slice(0, 80),
    ...(data.deviceId ? { deviceId: data.deviceId } : {}),
    ...sealed
  }
  writeClientFile(clientFilePath(), { mode: 'client', server })
  // La dirección del servidor se declara «segura» (micrófono) al arrancar: si es otra, hay que arrancar de nuevo.
  if (startedWith !== addr.origin) {
    showView({ name: 'opening', server: { name: server.name, origin: server.origin }, message: tr('Emparejado. Reiniciando para terminar…') })
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 600)
    return {}
  }
  void openServer()
  return {}
}

// ---------- Sincronizar carpetas con el servidor ----------

let sync: SyncManager | null = null

function syncManager(): SyncManager {
  return (sync ??= new SyncManager({
    file: join(app.getPath('userData'), 'sync.json'),
    stateDir: join(app.getPath('userData'), 'sync-state'),
    getServer: () => (current ? { origin: current.server.origin, token: current.token } : null),
    device: hostname().replace(/\.local$/i, '') || 'cliente',
    // A la papelera del sistema, nunca borrado del todo.
    trash: (p) => shell.trashItem(p),
    notify: (title, body) => {
      if (Notification.isSupported()) new Notification({ title, body }).show()
    }
  }))
}

// ---------- Actualizar este equipo (el propio cliente) ----------
// El instalador lo publica el servidor (npm run publicar-cliente) y se descarga de él con la llave de este dispositivo.
// «Buscar actualizaciones» de la interfaz actualiza el SERVIDOR; esto actualiza la app instalada aquí.

const UPDATE_EVERY_MS = 6 * 3600_000
let updateTimer: NodeJS.Timeout | null = null
let offeredVersion: string | null = null
/** Lo que dice el servidor de la versión nueva (con su firma), para comprobar el instalador antes de abrirlo. */
let availableRelease: SignedRelease | null = null
let installing = false

function updaterSupported(): boolean {
  return process.platform === 'win32' && (app.isPackaged || process.env['AICW_UPDATE_DEV'] === '1')
}

async function checkUpdate(): Promise<ClientUpdateState> {
  const installed = app.getVersion()
  if (!updaterSupported()) {
    return {
      state: 'unsupported',
      current: installed,
      message: process.platform === 'darwin' ? tr('En el Mac el cliente se actualiza con scripts/actualizar-mac.sh.') : tr('Este equipo no se actualiza desde el servidor.')
    }
  }
  if (!current) return { state: 'error', current: installed, message: tr('Sin conexión con el servidor.') }
  try {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.disableDifferentialDownload = true
    autoUpdater.allowDowngrade = false
    autoUpdater.forceDevUpdateConfig = !app.isPackaged
    autoUpdater.requestHeaders = { Authorization: `Bearer ${current.token}` }
    autoUpdater.setFeedURL({ provider: 'generic', url: `${current.server.origin}/app/client` })
    const result = await autoUpdater.checkForUpdates()
    availableRelease = result?.isUpdateAvailable ? (result.updateInfo as SignedRelease) : null
    if (result?.isUpdateAvailable) return { state: 'available', current: installed, latest: result.updateInfo.version }
    return { state: 'current', current: installed }
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e)
    // Sin instalador publicado en el servidor: no hay nada que actualizar (no es un fallo).
    if (/404|latest\.yml/i.test(text)) return { state: 'current', current: installed, message: tr('El servidor todavía no ofrece una versión nueva del cliente.') }
    return { state: 'error', current: installed, message: text.split('\n')[0].slice(0, 200) }
  }
}

function sha512Of(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    createReadStream(file).on('error', reject).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('base64')))
  })
}

/** Descarga la versión nueva del servidor y la instala (la app se cierra y vuelve a abrirse sola). */
async function installUpdate(): Promise<void> {
  if (installing) return
  installing = true
  try {
    const checked = await checkUpdate()
    if (checked.state !== 'available') throw new Error(checked.message ?? tr('No hay una versión nueva que instalar.'))
    showView({ name: 'opening', message: tr('Descargando la versión {latest} del servidor…', { latest: checked.latest }) })
    const files = await autoUpdater.downloadUpdate()
    // Solo se instala lo que firmó el dueño con su clave (quien tenga el código del servidor puede subir archivos).
    const exe = files.find((f) => /\.exe$/i.test(f))
    const problem = exe && availableRelease ? verifyRelease(availableRelease, await sha512Of(exe), CLIENT_RELEASE_PUBLIC_KEY) : tr('No se encontró el instalador descargado.')
    if (problem) throw new Error(problem)
    autoUpdater.quitAndInstall(true, true)
  } catch (e) {
    installing = false
    void openServer()
    throw e
  }
}

/** Al abrir y cada pocas horas: si el servidor ofrece una versión nueva, la ofrece (una vez por versión y sesión). */
function scheduleUpdateChecks(): void {
  if (updateTimer || !updaterSupported()) return
  const run = async (): Promise<void> => {
    const r = await checkUpdate().catch(() => null)
    if (!r || r.state !== 'available' || !r.latest || r.latest === offeredVersion) return
    offeredVersion = r.latest
    const options: Electron.MessageBoxOptions = {
      type: 'info',
      buttons: [tr('Instalar y reiniciar'), tr('Más tarde')],
      defaultId: 0,
      cancelId: 1,
      message: tr('Hay una versión nueva de AI Cowork para este equipo ({latest})', { latest: r.latest }),
      detail: tr('Tienes la {current}. Se descarga de tu servidor y la app se reinicia sola al terminar.', { current: r.current })
    }
    const answer = win && !win.isDestroyed() ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
    if (answer.response === 0) await installUpdate().catch((e) => dialog.showErrorBox('AI Cowork', tr('No se pudo actualizar: {message}', { message: (e as Error).message })))
  }
  setTimeout(() => void run(), 15_000).unref()
  updateTimer = setInterval(() => void run(), UPDATE_EVERY_MS)
  updateTimer.unref()
}

// ---------- Archivos del servidor en este equipo ----------

/** Descarga un archivo del proyecto a una carpeta temporal y lo abre con la aplicación de este equipo. */
async function openRemoteFile(projectId: unknown, relPath: unknown): Promise<void> {
  if (!current) throw new Error(tr('Sin conexión con el servidor'))
  if (typeof projectId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(projectId) || typeof relPath !== 'string' || !relPath) {
    throw new Error(tr('Archivo no válido'))
  }
  const parts = relPath.split('/').filter(Boolean)
  if (!parts.length || parts.some((p) => p === '..' || p.includes('\\') || p.includes('\0'))) throw new Error(tr('Archivo no válido'))
  const url = `${current.server.origin}/api/file/${encodeURIComponent(projectId)}/${parts.map(encodeURIComponent).join('/')}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${current.token}` }, signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(res.status === 404 ? tr('El archivo ya no está en el servidor') : tr('El servidor respondió {status}', { status: res.status }))
  const dir = join(app.getPath('temp'), 'ai-cowork-cliente', projectId)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, basename(parts[parts.length - 1]))
  await fsp.writeFile(file, Buffer.from(await res.arrayBuffer()))
  const problem = await shell.openPath(file)
  if (problem) throw new Error(problem)
}

/** Abre un archivo cualquiera del servidor: lo descarga a una carpeta temporal y lo abre con la aplicación de este equipo. */
async function openRemotePath(path: unknown): Promise<void> {
  if (!current) throw new Error(tr('Sin conexión con el servidor'))
  if (typeof path !== 'string' || !path || path.length > 4096 || path.includes('\0')) throw new Error(tr('Ruta no válida'))
  const res = await fetch(`${current.server.origin}/api/fs/read?path=${encodeURIComponent(path)}&download=1`, {
    headers: { Authorization: `Bearer ${current.token}` },
    signal: AbortSignal.timeout(10 * 60_000)
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: '' })) as { error?: string }).error || tr('El servidor respondió {status}', { status: res.status }))
  const name = basename(path.replace(/\\/g, '/')) || 'archivo'
  const dir = join(app.getPath('temp'), 'ai-cowork-cliente', 'servidor')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, name)
  await fsp.writeFile(file, Buffer.from(await res.arrayBuffer()))
  const problem = await shell.openPath(file)
  if (problem) throw new Error(problem)
}

/** Baja una carpeta del servidor como zip: pregunta dónde guardarla y la deja ahí. */
async function saveRemoteFolder(path: unknown): Promise<string | null> {
  if (!current) throw new Error(tr('Sin conexión con el servidor'))
  if (typeof path !== 'string' || !path || path.length > 4096 || path.includes('\0')) throw new Error(tr('Ruta no válida'))
  const base = basename(path.replace(/\\/g, '/').replace(/\/+$/, '')) || 'disco'
  const options: Electron.SaveDialogOptions = { title: tr('Guardar la carpeta como zip'), defaultPath: join(app.getPath('downloads'), `${base}.zip`), filters: [{ name: tr('Zip'), extensions: ['zip'] }] }
  const chosen = win && !win.isDestroyed() ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (chosen.canceled || !chosen.filePath) return null
  const res = await fetch(`${current.server.origin}/api/fs/zip?path=${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${current.token}` },
    signal: AbortSignal.timeout(60 * 60_000)
  })
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({ error: '' })) as { error?: string }).error || tr('El servidor respondió {status}', { status: res.status }))
  const { Readable } = await import('node:stream')
  const { createWriteStream } = await import('node:fs')
  const { pipeline } = await import('node:stream/promises')
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(chosen.filePath))
  shell.showItemInFolder(chosen.filePath)
  return chosen.filePath
}

// ---------- Arranque ----------

function fromLocalPage(e: IpcMainInvokeEvent): boolean {
  return !!win && !win.isDestroyed() && e.sender === win.webContents && e.senderFrame?.url.startsWith('data:') === true
}

function fromServerPage(e: IpcMainInvokeEvent): boolean {
  return !!win && !win.isDestroyed() && e.sender === win.webContents && !!current && e.senderFrame?.url.startsWith(current.server.origin) === true
}

/** Olvidar este servidor (con confirmación): el equipo deja de estar emparejado y vuelve a la pantalla de conectar. */
async function forgetServer(): Promise<void> {
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    buttons: ['Olvidar', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    message: tr('¿Olvidar la conexión con este servidor?'),
    detail: tr('Este equipo dejará de estar emparejado. Para volver a usarlo tendrás que pedir un código nuevo en el servidor.')
  }
  const r = win && !win.isDestroyed() ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
  if (r.response !== 0) return
  writeClientFile(clientFilePath(), { mode: 'client' })
  current = null
  sync?.stop()
  void session.defaultSession.clearStorageData()
  showView({ name: 'connect' })
}

/**
 * En Windows y Linux no hay barra de menús (se comía un trozo de la ventana): Recargar, Cambiar de servidor y Olvidar
 * este dispositivo están en el menú ⋮ de la interfaz. En el Mac la barra del sistema no ocupa la ventana, así que
 * lleva el menú de siempre (copiar, pegar, ver, ventana) y las mismas tres opciones.
 */
function buildMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: tr('Servidor'),
      submenu: [
        { label: tr('Recargar'), accelerator: 'CmdOrCtrl+R', click: () => void openServer() },
        { label: tr('Cambiar de servidor…'), click: () => showView({ name: 'connect', address: current?.server.origin }) },
        { label: tr('Olvidar este dispositivo y desconectar'), click: () => void forgetServer() }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerClientIpc(): void {
  ipcMain.handle('client:view', (e) => (fromLocalPage(e) ? view : null))
  ipcMain.handle('client:chooseMode', (e, mode: unknown) => {
    if (!fromLocalPage(e) || (mode !== 'server' && mode !== 'client')) return
    chooserDone?.(mode)
  })
  ipcMain.handle('client:pair', (e, address: unknown, code: unknown) => (fromLocalPage(e) ? pairWith(String(address ?? ''), String(code ?? '')) : { error: 'No permitido' }))
  ipcMain.handle('client:retry', (e) => {
    if (fromLocalPage(e)) void openServer()
  })
  ipcMain.handle('client:switchServer', (e) => {
    if (fromLocalPage(e) || fromServerPage(e)) showView({ name: 'connect', address: current?.server.origin })
  })
  // Desde el menú ⋮ de la interfaz del servidor.
  ipcMain.handle('client:reload', (e) => {
    if (fromServerPage(e)) void openServer()
  })
  ipcMain.handle('client:forget', async (e) => {
    if (fromServerPage(e)) await forgetServer()
  })
  ipcMain.handle('client:openFile', async (e, projectId: unknown, relPath: unknown) => {
    if (!fromServerPage(e)) throw new Error('No permitido')
    await openRemoteFile(projectId, relPath)
  })
  ipcMain.handle('client:info', (e) =>
    fromServerPage(e) ? { client: true, server: current?.server.name ?? '', device: hostname().replace(/\.local$/i, ''), version: app.getVersion() } : null
  )
  // Sincronización de carpetas (la interfaz del servidor las gestiona; el motor corre aquí, junto a los archivos).
  const id = (v: unknown): string => {
    if (typeof v !== 'string' || !v || v.length > 80) throw new Error(tr('Pareja no válida'))
    return v
  }
  ipcMain.handle('client:syncList', (e) => (fromServerPage(e) ? syncManager().list() : []))
  ipcMain.handle('client:syncAdd', async (e, remoteDir: unknown) => {
    if (!fromServerPage(e)) throw new Error('No permitido')
    if (typeof remoteDir !== 'string' || !remoteDir || remoteDir.length > 4096 || remoteDir.includes('\0')) throw new Error(tr('Carpeta del servidor no válida'))
    const options: Electron.OpenDialogOptions = {
      title: tr('Carpeta de este equipo con la que sincronizar'),
      buttonLabel: tr('Sincronizar con esta carpeta'),
      properties: ['openDirectory', 'createDirectory']
    }
    const chosen = win && !win.isDestroyed() ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (chosen.canceled || !chosen.filePaths[0]) return null
    return syncManager().add({ localDir: chosen.filePaths[0], remoteDir })
  })
  ipcMain.handle('client:syncRemove', (e, pair: unknown) => {
    if (fromServerPage(e)) syncManager().remove(id(pair))
  })
  ipcMain.handle('client:syncToggle', (e, pair: unknown, enabled: unknown) => {
    if (fromServerPage(e)) syncManager().setEnabled(id(pair), enabled === true)
  })
  ipcMain.handle('client:syncNow', (e, pair: unknown) => {
    if (fromServerPage(e)) syncManager().syncNow(id(pair))
  })
  ipcMain.handle('client:syncConfirm', (e, pair: unknown) => {
    if (fromServerPage(e)) syncManager().confirmDeletes(id(pair))
  })
  ipcMain.handle('client:openRemotePath', async (e, path: unknown) => {
    if (!fromServerPage(e)) throw new Error('No permitido')
    await openRemotePath(path)
  })
  ipcMain.handle('client:saveRemoteFolder', async (e, path: unknown) => {
    if (!fromServerPage(e)) throw new Error('No permitido')
    return saveRemoteFolder(path)
  })
  ipcMain.handle('client:update', async (e) => (fromServerPage(e) ? checkUpdate() : null))
  ipcMain.handle('client:installUpdate', async (e) => {
    if (!fromServerPage(e)) throw new Error('No permitido')
    await installUpdate()
  })
}

let chooserDone: ((mode: AppMode) => void) | null = null
let ipcReady = false

function setup(): void {
  if (ipcReady) return
  ipcReady = true
  registerClientIpc()
}

/** Pregunta cómo se va a usar este equipo (solo en una instalación nueva). */
/** El cliente y la primera pantalla no tienen config.json del motor: siguen el idioma del sistema. */
function useSystemLang(): void {
  setCurrentLang(langFromLocale(app.getLocale()))
}

export function chooseMode(): Promise<AppMode> {
  useSystemLang()
  setup()
  return new Promise((resolve) => {
    chooserDone = (mode) => {
      chooserDone = null
      writeClientFile(clientFilePath(), { mode })
      resolve(mode)
    }
    showView({ name: 'chooser' })
  })
}

/** Arranca AI Cowork como cliente: ventana con la interfaz del servidor al que está emparejado este equipo. */
export async function bootClient(): Promise<void> {
  useSystemLang()
  setup()
  buildMenu()
  startedWith = readClientFile(clientFilePath())?.server?.origin ?? null
  showView({ name: 'opening', message: tr('Conectando con el servidor…') })
  await openServer()
}

/** Cierra la ventana de elegir modo cuando ya hay otra (el arranque de servidor crea la suya). */
export function closeClientWindow(): void {
  const w = win
  win = null
  if (w && !w.isDestroyed()) w.destroy()
}

/** Pone al frente la ventana del cliente (al abrir la app otra vez); false si este arranque no es un cliente. */
export function focusClient(): boolean {
  if (!win || win.isDestroyed()) return false
  if (win.isMinimized()) win.restore()
  win.focus()
  return true
}
