// Navegador de kywai: una pestaña de navegador dentro de la app (WebContentsView) con su propia sesión guardada en
// disco (partición «persist:kywai-navegador», aparte de la de kywai). Tú entras ahí con tus cuentas y los agentes la
// usan con las herramientas del servidor MCP de kywai (src/main/coworkMcp.ts):
//   - leer, hacer capturas, ir a una dirección, volver atrás y desplazarse: sin preguntar;
//   - hacer clic, escribir y pulsar teclas: con tu permiso (en el chat y en «Te necesita»).
// Nunca leen ni escriben campos de contraseña ni de tarjeta, y no hay herramienta para ejecutar código ni ver cookies.
//
// La pestaña está siempre pegada a la ventana principal. Cuando no se ve, se aparta a la esquina de abajo a la derecha
// con su tamaño y solo 1 píxel dentro de la ventana: así sigue pintándose y los agentes pueden leerla y hacer capturas.
// Comprobado con Electron: oculta con setVisible(false), en una ventana oculta o del todo fuera de la ventana, Chromium
// no la maqueta (mide 0×0) o no da capturas de una página nueva tras navegar.
import { BrowserWindow, WebContentsView, session, type WebContents, type WebFrameMain } from 'electron'
import { BLANK_URL, safeUrl, siteOf, type BrowserRect, type BrowserRemoteInput, type BrowserState } from '@shared/browser'
import { emit } from './events'

const PARTITION = 'persist:kywai-navegador'
/** Tamaño de la pestaña mientras no se ve (el de una ventana normal: así las capturas se parecen a lo que verías). */
const HIDDEN_SIZE = { width: 1280, height: 860 }
/** Mundo aislado de los scripts de kywai: la página no puede ver ni cambiar sus funciones. */
const WORLD = 1717
/** Texto máximo que devuelve una lectura (el resto se pide con «parte»). */
export const READ_CHARS = 24000
const MAX_ELEMENTS = 300
const MAX_FRAMES = 12

let host: BrowserWindow | null = null
let view: WebContentsView | null = null
/** Dónde la quiere la interfaz (null: no se ve). */
let shownRect: BrowserRect | null = null
let lastSize = { ...HIDDEN_SIZE }
let agentNow: NonNullable<BrowserState['agent']> | null = null
let agentTimer: ReturnType<typeof setTimeout> | null = null
/** Tareas que ya enseñaron la pestaña (se abre sola la primera vez que un agente la usa en cada tarea). */
const revealed = new Set<string>()
/** Tareas a las que pulsaste «Parar»: no pueden volver a usar el navegador. */
const stopped = new Set<string>()
/** Marcos de la última lectura: «f2e7» es el elemento 7 del marco 2 (0 es la página). */
let frames: WebFrameMain[] = []
let stateTimer: ReturnType<typeof setTimeout> | null = null

/** Google y otros no dejan iniciar sesión en «Electron»: se presenta como el Chrome en que se basa. */
function chromeAgent(ua: string): string {
  return ua.replace(/\s?(Electron|kywai|ai-cowork|AI Cowork)\/\S+/gi, '')
}

/** La ventana principal (al abrirse otra vez, la pestaña se pasa a la nueva). */
export function attachBrowser(win: BrowserWindow | null): void {
  if (host === win) return
  if (view && host && !host.isDestroyed()) {
    try {
      host.contentView.removeChildView(view)
    } catch {
      /* ya no estaba */
    }
  }
  host = win
  shownRect = null
  // Al cambiar el tamaño de la ventana, la esquina se mueve (la interfaz recoloca la pestaña cuando se ve).
  win?.on('resize', () => {
    if (!shownRect) place()
  })
  if (view && host) {
    host.contentView.addChildView(view)
    place()
  }
}

function ensureView(): WebContentsView {
  if (view && !view.webContents.isDestroyed()) return view
  const ses = session.fromPartition(PARTITION)
  ses.setUserAgent(chromeAgent(ses.getUserAgent()))
  // Nada de cámara, micrófono, ubicación ni notificaciones: solo copiar al portapapeles y pantalla completa.
  const allowed = new Set(['clipboard-sanitized-write', 'fullscreen'])
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)))
  ses.setPermissionCheckHandler((_wc, perm) => allowed.has(perm))
  const v = new WebContentsView({
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: true }
  })
  v.setBackgroundColor('#ffffff')
  const wc = v.webContents
  wc.setBackgroundThrottling(false)
  // Solo webs (http/https). Las ventanitas de «Iniciar sesión con Google» se abren como ventana aparte en la misma
  // sesión; un enlace «en pestaña nueva» se abre aquí mismo.
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (!safeUrl(url) && url !== BLANK_URL) return { action: 'deny' }
    if (disposition === 'new-window') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          autoHideMenuBar: true,
          ...(host && !host.isDestroyed() ? { parent: host } : {}),
          webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false }
        }
      }
    }
    void wc.loadURL(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (!safeUrl(url) && url !== BLANK_URL) e.preventDefault()
  })
  for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading'] as const) {
    wc.on(ev as 'did-stop-loading', () => pushState())
  }
  wc.on('render-process-gone', () => pushState())
  view = v
  if (host && !host.isDestroyed()) host.contentView.addChildView(v)
  place()
  return v
}

/** Coloca la pestaña donde dice la interfaz o, si no se ve, fuera de la ventana. */
function place(): void {
  if (!view || !host || host.isDestroyed()) return
  const zoom = host.webContents.getZoomFactor() || 1
  if (shownRect) {
    const r = {
      x: Math.round(shownRect.x * zoom),
      y: Math.round(shownRect.y * zoom),
      width: Math.max(1, Math.round(shownRect.width * zoom)),
      height: Math.max(1, Math.round(shownRect.height * zoom))
    }
    lastSize = { width: r.width, height: r.height }
    view.setBounds(r)
  } else {
    const [w, h] = host.getContentSize()
    view.setBounds({ x: w - 1, y: h - 1, ...lastSize })
  }
}

function wcOf(): WebContents {
  return ensureView().webContents
}

export function browserState(): BrowserState {
  const wc = view && !view.webContents.isDestroyed() ? view.webContents : null
  const url = wc?.getURL() ?? ''
  return {
    url: url === BLANK_URL ? '' : url,
    title: wc?.getTitle() && url !== BLANK_URL ? wc.getTitle() : '',
    loading: wc?.isLoading() ?? false,
    canGoBack: wc?.navigationHistory.canGoBack() ?? false,
    canGoForward: wc?.navigationHistory.canGoForward() ?? false,
    agent: agentNow
  }
}

function pushState(reveal = false): void {
  if (reveal) {
    emit({ kind: 'browser.state', state: { ...browserState(), reveal: true } })
    return
  }
  if (stateTimer) return
  stateTimer = setTimeout(() => {
    stateTimer = null
    emit({ kind: 'browser.state', state: browserState() })
  }, 80)
}

// ---------- Lo que hace la interfaz ----------

/** La pestaña se ve en ese sitio de la ventana (o deja de verse con null). */
export function showBrowser(rect: BrowserRect | null): BrowserState {
  if (rect) ensureView()
  shownRect = rect && rect.width > 0 && rect.height > 0 ? rect : null
  place()
  return browserState()
}

export function navigateBrowser(url: string): BrowserState {
  const safe = safeUrl(url)
  if (!safe) throw new Error('Solo se pueden abrir direcciones http o https')
  void wcOf().loadURL(safe).catch(() => undefined)
  return browserState()
}

export function browserCommand(cmd: 'back' | 'forward' | 'reload' | 'stop' | 'home'): BrowserState {
  const wc = wcOf()
  if (cmd === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  else if (cmd === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  else if (cmd === 'reload') wc.reload()
  else if (cmd === 'stop') wc.stop()
  else if (cmd === 'home') void wc.loadURL(BLANK_URL)
  return browserState()
}

/** «Parar»: el agente que lo usa ahora ya no puede seguir usándolo en esa tarea. */
export function stopBrowserAgent(): BrowserState {
  if (agentNow) stopped.add(agentNow.taskId)
  agentNow = null
  pushState()
  return browserState()
}

/** «Cerrar sesión en todo»: borra cookies, almacenamiento y caché de la pestaña. */
export async function clearBrowserSession(): Promise<BrowserState> {
  const ses = session.fromPartition(PARTITION)
  await ses.clearStorageData()
  await ses.clearCache()
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.navigationHistory.clear()
    await view.webContents.loadURL(BLANK_URL).catch(() => undefined)
  }
  pushState()
  return browserState()
}

/** Una imagen de la pestaña para otro dispositivo (cliente o navegador web), que la ve así y manda clics. */
export async function browserFrame(): Promise<{ image: string; width: number; height: number } | null> {
  if (!view || view.webContents.isDestroyed()) ensureView()
  const img = await capture()
  if (!img) return null
  const { width, height } = view!.getBounds()
  const small = img.getSize().width > 1400 ? img.resize({ width: 1400 }) : img
  return { image: `data:image/jpeg;base64,${small.toJPEG(70).toString('base64')}`, width, height }
}

/** Clics, rueda y teclas desde otro dispositivo (en píxeles de la pestaña). */
export function browserRemoteInput(input: BrowserRemoteInput): void {
  const wc = wcOf()
  if (input.type === 'click') clickAt(wc, input.x, input.y)
  else if (input.type === 'scroll') wc.sendInputEvent({ type: 'mouseWheel', x: Math.round(input.x), y: Math.round(input.y), deltaX: 0, deltaY: -Math.round(input.dy) })
  else if (input.type === 'text') wc.insertText(input.text.slice(0, 2000))
  else if (input.type === 'key') pressKey(wc, input.key)
}

function clickAt(wc: WebContents, x: number, y: number): void {
  const p = { x: Math.round(x), y: Math.round(y), button: 'left' as const, clickCount: 1 }
  wc.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y })
  wc.sendInputEvent({ type: 'mouseDown', ...p })
  wc.sendInputEvent({ type: 'mouseUp', ...p })
}

function pressKey(wc: WebContents, key: string): void {
  const code = key === 'Space' ? 'Space' : key
  wc.sendInputEvent({ type: 'keyDown', keyCode: code })
  if (key === 'Enter') wc.sendInputEvent({ type: 'char', keyCode: '\r' })
  else if (key === 'Space') wc.sendInputEvent({ type: 'char', keyCode: ' ' })
  wc.sendInputEvent({ type: 'keyUp', keyCode: code })
}

async function capture(): Promise<Electron.NativeImage | null> {
  if (!view || view.webContents.isDestroyed() || !host || host.isDestroyed()) return null
  try {
    const img = await Promise.race([view.webContents.capturePage(), new Promise<null>((r) => setTimeout(() => r(null), 5000))])
    return img && !img.isEmpty() ? img : null
  } catch {
    return null
  }
}

// ---------- Lo que hacen los agentes ----------

export interface BrowserAgent {
  taskId: string
  agentName: string
  taskTitle: string
}

/** Lo que pide un agente: marca quién lo usa (sale encima de la pestaña) y la abre la primera vez en cada tarea. */
export function useByAgent(who: BrowserAgent, action: string): void {
  if (stopped.has(who.taskId)) throw new Error('El usuario ha parado tu uso del navegador en esta tarea. No lo vuelvas a usar: sigue sin él y explica lo que falta.')
  if (!host || host.isDestroyed()) throw new Error('La ventana de kywai no está abierta en el equipo de los agentes: el navegador no está disponible.')
  ensureView()
  agentNow = { taskId: who.taskId, name: who.agentName, taskTitle: who.taskTitle, action }
  if (agentTimer) clearTimeout(agentTimer)
  agentTimer = setTimeout(() => {
    agentNow = null
    pushState()
  }, 12000)
  const first = !revealed.has(who.taskId)
  if (first) {
    revealed.add(who.taskId)
    if (revealed.size > 500) revealed.delete(revealed.values().next().value as string)
  }
  pushState(first)
}

/** Espera a que la página termine de cargar (y un momento más, para lo que pinta después). */
async function settle(maxMs = 12000): Promise<void> {
  const wc = wcOf()
  const start = Date.now()
  await new Promise((r) => setTimeout(r, 250))
  while (wc.isLoading() && Date.now() - start < maxMs) await new Promise((r) => setTimeout(r, 150))
  await new Promise((r) => setTimeout(r, 500))
}

function framesOf(wc: WebContents): WebFrameMain[] {
  const all = wc.mainFrame.framesInSubtree.filter((f) => !f.isDestroyed() && /^https?:|^about:/.test(f.url || 'about:'))
  return [wc.mainFrame, ...all.filter((f) => f !== wc.mainFrame)].slice(0, MAX_FRAMES)
}

async function inFrame<T>(frame: WebFrameMain, code: string): Promise<T | null> {
  try {
    // La página, en el mundo aislado de kywai (la web no ve ni cambia sus funciones); los marcos, en el suyo propio.
    const wc = view?.webContents
    const run = wc && frame === wc.mainFrame ? (wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]) as Promise<T>) : (frame.executeJavaScript(code) as Promise<T>)
    return (await Promise.race([run, new Promise<null>((r) => setTimeout(() => r(null), 6000))])) as T | null
  } catch {
    return null
  }
}

interface FrameRead {
  text: string
  elements: string[]
  scroll: { y: number; max: number }
  visible: boolean
}

/** Estado corto: dónde está y qué se ve. */
export function stateForAgent(): string {
  const st = browserState()
  if (!st.url) return 'El navegador de kywai está en una página en blanco. Usa navegador_ir para abrir una dirección o pide al usuario que entre en su cuenta en la pestaña «Navegador».'
  return `Página: ${st.title || '(sin título)'}\nDirección: ${st.url}${st.loading ? '\n(Aún está cargando.)' : ''}${st.canGoBack ? '\nSe puede volver atrás.' : ''}`
}

/**
 * Lee la página: texto visible y elementos con los que se puede hacer algo, numerados («e12», o «f1e3» dentro de un
 * marco). Los números valen hasta la siguiente lectura.
 */
export async function readForAgent(part = 1): Promise<string> {
  const wc = wcOf()
  await settle(6000)
  frames = framesOf(wc)
  const reads: (FrameRead | null)[] = []
  for (let i = 0; i < frames.length; i++) reads.push(await inFrame<FrameRead>(frames[i], READ_SCRIPT(i === 0 ? 'e' : `f${i}e`)))
  const st = browserState()
  const out: string[] = [`Página: ${st.title || '(sin título)'}`, `Dirección: ${st.url || BLANK_URL}`]
  const main = reads[0]
  if (main) out.push(`Desplazamiento: ${main.scroll.y} de ${main.scroll.max} px`)
  const texts: string[] = []
  const elements: string[] = []
  reads.forEach((r, i) => {
    if (!r || (!r.visible && i > 0)) return
    const head = i === 0 ? '' : `\n[Marco ${i}: ${frames[i].url.slice(0, 120)}]\n`
    if (r.text.trim()) texts.push(head + r.text)
    if (r.elements.length) elements.push(...(i === 0 ? r.elements : [`[Marco ${i}]`, ...r.elements]))
  })
  const full = texts.join('\n')
  const parts = Math.max(1, Math.ceil(full.length / READ_CHARS))
  const p = Math.min(Math.max(1, Math.floor(part)), parts)
  out.push('', `## Texto${parts > 1 ? ` (parte ${p} de ${parts}; pide parte=${p < parts ? p + 1 : 1} para seguir)` : ''}`, full.slice((p - 1) * READ_CHARS, p * READ_CHARS) || '(la página no tiene texto visible)')
  if (p === 1) {
    out.push('', '## Elementos (usa su referencia con navegador_clic o navegador_escribir; valen hasta la próxima lectura)')
    out.push(elements.length ? elements.slice(0, MAX_ELEMENTS + 20).join('\n') : '(ninguno)')
    if (elements.length > MAX_ELEMENTS + 20) out.push(`… y ${elements.length - MAX_ELEMENTS - 20} más (desplázate o lee de nuevo para verlos)`)
  }
  return out.join('\n')
}

/** Captura de lo que se ve (PNG). */
export async function captureForAgent(): Promise<Buffer> {
  await settle(6000)
  const img = await capture()
  if (!img) throw new Error('No se pudo hacer la captura: la ventana de kywai debe estar abierta (puede estar detrás de otras) en el equipo de los agentes.')
  return img.getSize().width > 1600 ? img.resize({ width: 1600 }).toPNG() : img.toPNG()
}

export async function goForAgent(url: string): Promise<string> {
  const safe = safeUrl(url)
  if (!safe) throw new Error('Solo se pueden abrir direcciones http o https')
  await wcOf().loadURL(safe).catch(() => undefined)
  await settle()
  return stateForAgent()
}

export async function backForAgent(): Promise<string> {
  const wc = wcOf()
  if (!wc.navigationHistory.canGoBack()) throw new Error('No hay página anterior')
  wc.navigationHistory.goBack()
  await settle()
  return stateForAgent()
}

export async function scrollForAgent(direction: 'abajo' | 'arriba', ref?: string): Promise<string> {
  if (ref) {
    const t = target(ref)
    const ok = await inFrame<boolean>(t.frame, `(() => { const el = document.querySelector('[data-kywai-ref="${t.ref}"]'); if (!el) return false; el.scrollIntoView({ block: 'center' }); return true })()`)
    if (!ok) throw new Error(`No encuentro ${ref}: lee la página otra vez (navegador_leer)`)
  } else {
    const dy = direction === 'arriba' ? -0.85 : 0.85
    await inFrame(wcOf().mainFrame, `(() => { const s = document.scrollingElement || document.documentElement; const big = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.clientHeight > innerHeight * 0.4).sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0]; const el = s.scrollHeight > innerHeight + 40 ? s : (big || s); el.scrollBy(0, Math.round(${dy} * (el === s ? innerHeight : el.clientHeight))) })()`)
  }
  await new Promise((r) => setTimeout(r, 400))
  return `Hecho. ${stateForAgent()}\nLee la página otra vez para ver lo nuevo.`
}

/** Elemento de una referencia de la última lectura. */
function target(ref: string): { frame: WebFrameMain; ref: string } {
  const m = /^(?:f(\d{1,2}))?e(\d{1,5})$/.exec(ref.trim())
  if (!m) throw new Error(`Referencia no válida: «${ref}». Usa las de navegador_leer (p. ej. e12 o f1e3).`)
  const frame = frames[m[1] ? Number(m[1]) : 0]
  if (!frame || frame.isDestroyed()) throw new Error('La página ha cambiado desde la última lectura: lee otra vez (navegador_leer)')
  return { frame, ref: ref.trim() }
}

interface ElementInfo {
  found: boolean
  secret?: boolean
  label?: string
  x?: number
  y?: number
  tag?: string
  editable?: boolean
}

const INFO_SCRIPT = (ref: string): string => `(() => {
  const el = document.querySelector('[data-kywai-ref="${ref}"]')
  if (!el) return { found: false }
  el.scrollIntoView({ block: 'center', inline: 'center' })
  const r = el.getBoundingClientRect()
  const ac = (el.getAttribute('autocomplete') || '').toLowerCase()
  const secret = (el.type || '').toLowerCase() === 'password' || /password|cc-|one-time-code/.test(ac)
  const label = (el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.placeholder || el.innerText || el.title || el.name || el.value || el.tagName).toString().replace(/\\s+/g, ' ').trim().slice(0, 80)
  const editable = el.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
  return { found: true, secret, label: secret ? '' : label, x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 20), tag: el.tagName.toLowerCase(), editable }
})()`

/** Para el permiso: qué es ese elemento («Guardar», botón) y en qué sitio está. */
export async function describeRef(ref: string): Promise<{ label: string; site: string }> {
  const t = target(ref)
  const info = await inFrame<ElementInfo>(t.frame, INFO_SCRIPT(t.ref))
  if (!info?.found) throw new Error(`No encuentro ${ref}: lee la página otra vez (navegador_leer)`)
  if (info.secret) throw new Error('Ese campo es una contraseña, un código o una tarjeta: lo rellena el usuario, nunca un agente.')
  return { label: `«${info.label || info.tag}» (${info.tag})`, site: siteOf(browserState().url) }
}

export async function clickForAgent(ref: string): Promise<string> {
  const t = target(ref)
  const info = await inFrame<ElementInfo>(t.frame, INFO_SCRIPT(t.ref))
  if (!info?.found) throw new Error(`No encuentro ${ref}: lee la página otra vez (navegador_leer)`)
  await new Promise((r) => setTimeout(r, 150))
  if (t.frame === wcOf().mainFrame && info.x !== undefined && info.y !== undefined) clickAt(wcOf(), info.x, info.y)
  else {
    // Dentro de un marco: clic simulado en el propio elemento (no se sabe dónde cae el marco en la pestaña).
    await inFrame(t.frame, `(() => { const el = document.querySelector('[data-kywai-ref="${t.ref}"]'); if (!el) return; for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); el.click(); el.focus && el.focus() })()`)
  }
  await settle()
  return `Clic hecho en ${info.label ? `«${info.label}»` : ref}. ${stateForAgent()}\nLee la página otra vez para ver el resultado.`
}

export async function typeForAgent(ref: string, text: string, submit: boolean): Promise<string> {
  const t = target(ref)
  const info = await inFrame<ElementInfo>(t.frame, INFO_SCRIPT(t.ref))
  if (!info?.found) throw new Error(`No encuentro ${ref}: lee la página otra vez (navegador_leer)`)
  if (info.secret) throw new Error('Ese campo es una contraseña, un código o una tarjeta: lo rellena el usuario, nunca un agente.')
  if (info.tag === 'select') {
    const ok = await inFrame<boolean>(
      t.frame,
      `(() => { const el = document.querySelector('[data-kywai-ref="${t.ref}"]'); const want = ${JSON.stringify(text.trim().toLowerCase())}; const o = [...el.options].find((o) => o.text.trim().toLowerCase() === want || o.value.toLowerCase() === want) || [...el.options].find((o) => o.text.trim().toLowerCase().includes(want)); if (!o) return false; el.value = o.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`
    )
    if (!ok) throw new Error(`Esa lista no tiene la opción «${text}»`)
  } else {
    // Enfoca y selecciona lo que hubiera: lo escrito lo sustituye, como si lo tecleara una persona.
    await inFrame(
      t.frame,
      `(() => { const el = document.querySelector('[data-kywai-ref="${t.ref}"]'); if (!el) return; el.focus(); if (typeof el.select === 'function') el.select(); else { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r) } })()`
    )
    await new Promise((r) => setTimeout(r, 80))
    const wc = wcOf()
    if (text) wc.insertText(text.slice(0, 5000))
    else pressKey(wc, 'Delete')
    if (submit) pressKey(wc, 'Enter')
  }
  await settle(submit ? 12000 : 2000)
  return `Escrito en ${info.label ? `«${info.label}»` : ref}${submit ? ' y enviado con Intro' : ''}. ${stateForAgent()}`
}

export async function keyForAgent(key: string): Promise<string> {
  pressKey(wcOf(), key)
  await settle(4000)
  return `Tecla ${key} pulsada. ${stateForAgent()}`
}

/**
 * Script de lectura (en cada marco, en el mundo aislado de kywai). Marca los elementos con data-kywai-ref y devuelve
 * su lista en una línea cada uno. Los valores de contraseñas, códigos y tarjetas nunca salen.
 */
const READ_SCRIPT = (prefix: string): string => `(() => {
  const PREFIX = ${JSON.stringify(prefix)}
  for (const e of document.querySelectorAll('[data-kywai-ref]')) e.removeAttribute('data-kywai-ref')
  const vw = innerWidth, vh = innerHeight
  const shown = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null; const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return null; return r }
  const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=radio], [role=switch], [role=option], [role=combobox], [role=treeitem], [contenteditable=""], [contenteditable=true], [onclick], [tabindex]:not([tabindex="-1"])'
  const clean = (s, n) => (s || '').toString().replace(/\\s+/g, ' ').trim().slice(0, n)
  const lines = []
  let n = 0
  const all = []
  const collect = (root) => { for (const el of root.querySelectorAll(SEL)) all.push(el); for (const host of root.querySelectorAll('*')) if (host.shadowRoot) collect(host.shadowRoot) }
  collect(document)
  for (const el of all) {
    if (n >= ${MAX_ELEMENTS}) break
    if (el.closest('[aria-hidden=true]') || el.disabled) continue
    const r = shown(el)
    if (!r) continue
    const tag = el.tagName.toLowerCase()
    const type = (el.getAttribute('type') || '').toLowerCase()
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase()
    const secret = type === 'password' || /password|cc-|one-time-code/.test(ac)
    const role = el.getAttribute('role') || (tag === 'a' ? 'enlace' : tag === 'button' || type === 'submit' || type === 'button' ? 'botón' : tag === 'select' ? 'lista' : tag === 'textarea' || tag === 'input' ? 'campo' + (type && type !== 'text' ? ' ' + type : '') : el.isContentEditable ? 'texto editable' : 'clicable')
    let name = clean(el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('placeholder') || el.innerText || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('name') || '', 80)
    if (!name && tag === 'a') name = clean(el.getAttribute('href'), 80)
    let extra = ''
    if (secret) extra = ' [contraseña o dato privado: lo rellena el usuario]'
    else if (tag === 'input' || tag === 'textarea') { if (type === 'checkbox' || type === 'radio') extra = el.checked ? ' [marcado]' : ' [sin marcar]'; else if (el.value) extra = ' = «' + clean(el.value, 120) + '»' }
    else if (tag === 'select') extra = ' = «' + clean(el.options[el.selectedIndex] && el.options[el.selectedIndex].text, 80) + '»'
    else if (el.getAttribute('aria-checked')) extra = el.getAttribute('aria-checked') === 'true' ? ' [marcado]' : ' [sin marcar]'
    if (tag === 'a' && el.getAttribute('href') && !/^javascript:/i.test(el.getAttribute('href'))) extra += ' → ' + clean(el.href, 100)
    const off = r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw ? ' (fuera de la vista)' : ''
    n++
    const ref = PREFIX + n
    el.setAttribute('data-kywai-ref', ref)
    lines.push(ref + ': ' + role + (name ? ' «' + name + '»' : '') + extra + off)
  }
  const body = document.body
  const text = body ? body.innerText.replace(/[ \\t]+/g, ' ').replace(/\\n\\s*\\n\\s*\\n+/g, '\\n\\n').trim() : ''
  const s = document.scrollingElement || document.documentElement
  return { text, elements: lines, scroll: { y: Math.round(s.scrollTop), max: Math.max(0, Math.round(s.scrollHeight - innerHeight)) }, visible: vw > 20 && vh > 20 }
})()`
