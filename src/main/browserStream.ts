// Navegador de kywai visto desde otro dispositivo, en vídeo (como AnyDesk): la pestaña se graba con la captura de
// pestaña de Chromium y va por WebRTC directo entre el servidor y tu cliente o tu navegador (por Tailscale o la red
// de casa, sin pasar por ningún servidor de fuera). Ratón y teclado vuelven por un canal de datos del mismo enlace.
// Si el vídeo no conecta (por ejemplo, entrando por un túnel sin acceso directo), la pestaña sigue con imágenes
// (browserFrame en browser.ts).
//
// Quién manda el vídeo: una ventana oculta de kywai (sin nada de fuera: solo el código de abajo) que pide la captura
// de la pestaña; setDisplayMediaRequestHandler solo se la da a ella y solo de la pestaña del navegador.
import { app, BrowserWindow, ipcMain, session } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { browserInputArg } from '@shared/browser'
import { browserMeta, browserRemoteInput, browserRemoteViewport, browserWebContents, onBrowserMeta } from './browser'

const PARTITION = 'kywai-transmision'
let streamer: BrowserWindow | null = null
let ready: Promise<BrowserWindow> | null = null

/** La página de la ventana oculta: graba la pestaña y atiende a cada vista remota con su propia conexión. */
export const STREAMER_HTML = `<!doctype html><meta charset="utf-8"><title>kywai</title><script>
'use strict'
const { ipcRenderer } = require('electron')
let stream = null
let target = -1
let lastMeta = null
let idleSince = Date.now()
const peers = new Set()
function gather(pc) {
  return new Promise((done) => {
    if (pc.iceGatheringState === 'complete') return done()
    const t = setTimeout(done, 2500)
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); done() } })
  })
}
async function getStream(id) {
  const live = stream && stream.getVideoTracks()[0] && stream.getVideoTracks()[0].readyState === 'live'
  if (live && target === id) return stream
  if (stream) stream.getTracks().forEach((t) => t.stop())
  stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: false })
  target = id
  // Texto nítido antes que movimiento suave: es una web con letras, no una película.
  try { stream.getVideoTracks()[0].contentHint = 'detail' } catch (e) {}
  return stream
}
function sendMeta(dc) {
  if (lastMeta && dc && dc.readyState === 'open') dc.send(JSON.stringify(Object.assign({ type: 'meta' }, lastMeta)))
}
window.kywaiOffer = async (sdp, id, meta) => {
  lastMeta = meta
  const s = await getStream(id)
  const pc = new RTCPeerConnection({ iceServers: [] })
  const peer = { pc, dc: null }
  peers.add(peer)
  const drop = () => { peers.delete(peer); try { pc.close() } catch (e) {} ; if (!peers.size) idleSince = Date.now() }
  pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop() })
  pc.addEventListener('datachannel', (ev) => {
    const dc = ev.channel
    peer.dc = dc
    dc.addEventListener('open', () => sendMeta(dc))
    dc.addEventListener('message', (m) => ipcRenderer.send('kywai-stream:input', String(m.data).slice(0, 40000)))
    dc.addEventListener('close', drop)
  })
  for (const t of s.getVideoTracks()) pc.addTrack(t, s)
  await pc.setRemoteDescription({ type: 'offer', sdp })
  await pc.setLocalDescription(await pc.createAnswer())
  for (const sender of pc.getSenders()) {
    try {
      const p = sender.getParameters()
      if (!p.encodings || !p.encodings.length) p.encodings = [{}]
      p.encodings[0].maxBitrate = 8000000
      p.degradationPreference = 'maintain-resolution'
      await sender.setParameters(p)
    } catch (e) {}
  }
  await gather(pc)
  return pc.localDescription.sdp
}
ipcRenderer.on('kywai-stream:meta', (_e, m) => { lastMeta = m; for (const p of peers) sendMeta(p.dc) })
// Sin nadie mirando un rato: se deja de grabar la pestaña.
setInterval(() => {
  if (peers.size || !stream || Date.now() - idleSince < 30000) return
  stream.getTracks().forEach((t) => t.stop())
  stream = null
}, 10000)
</script>`

function sameFrame(a: Electron.WebFrameMain | null | undefined, b: Electron.WebFrameMain | null | undefined): boolean {
  return !!a && !!b && a.processId === b.processId && a.routingId === b.routingId
}

async function ensureStreamer(): Promise<BrowserWindow> {
  if (streamer && !streamer.isDestroyed() && ready) return ready
  ready = (async () => {
    const ses = session.fromPartition(PARTITION)
    const win = new BrowserWindow({
      show: false,
      width: 320,
      height: 240,
      // Solo carga el archivo de abajo, escrito por kywai, y no puede ir a ningún otro sitio.
      webPreferences: { session: ses, nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false }
    })
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    ses.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media' || perm === 'display-capture'))
    ses.setDisplayMediaRequestHandler((req, cb) => {
      if (!streamer || streamer.isDestroyed() || !sameFrame(req.frame, streamer.webContents.mainFrame)) return cb({})
      cb({ video: browserWebContents().mainFrame })
    })
    const file = join(app.getPath('userData'), 'kywai-transmision.html')
    writeFileSync(file, STREAMER_HTML, 'utf8')
    streamer = win
    win.on('closed', () => {
      if (streamer === win) {
        streamer = null
        ready = null
      }
    })
    await win.loadFile(file)
    return win
  })()
  try {
    return await ready
  } catch (e) {
    ready = null
    throw e
  }
}

/**
 * Una vista remota quiere el vídeo: recibe su oferta WebRTC (con todas sus direcciones ya reunidas) y devuelve la
 * respuesta del servidor. Si no se puede (sin ventana, sin captura), null: la vista sigue con imágenes.
 */
export async function browserRtcOffer(sdp: string): Promise<string | null> {
  const wc = browserWebContents()
  const win = await ensureStreamer()
  const answer: unknown = await win.webContents.executeJavaScript(`kywaiOffer(${JSON.stringify(sdp)}, ${wc.id}, ${JSON.stringify(browserMeta())})`)
  return typeof answer === 'string' && answer.startsWith('v=0') ? answer : null
}

/** Una oferta WebRTC creíble (texto SDP, no enorme). */
export function rtcOfferArg(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 60000 || !raw.startsWith('v=0')) return null
  return raw
}

/** Lo que llega por el canal de datos: el hueco de la vista (también es el «sigo aquí») o ratón y teclado. */
export function handleStreamInput(raw: string): void {
  let msg: unknown
  try {
    msg = JSON.parse(raw)
  } catch {
    return
  }
  const list = Array.isArray(msg) ? msg.slice(0, 60) : [msg]
  for (const m of list) {
    if (m && typeof m === 'object' && (m as { type?: unknown }).type === 'viewport') {
      const v = m as { width?: unknown; height?: unknown }
      const ok = typeof v.width === 'number' && typeof v.height === 'number' && v.width > 0 && v.height > 0 && v.width < 20000 && v.height < 20000
      browserRemoteViewport(ok ? { width: Math.round(v.width as number), height: Math.round(v.height as number) } : undefined)
      continue
    }
    const input = browserInputArg(m)
    if (input) browserRemoteInput(input)
  }
}

/** Se engancha una vez al arrancar: entradas de la ventana oculta y cambios de puntero o tamaño hacia ella. */
export function initBrowserStream(): void {
  ipcMain.on('kywai-stream:input', (e, data: unknown) => {
    if (!streamer || streamer.isDestroyed() || e.sender !== streamer.webContents || typeof data !== 'string') return
    handleStreamInput(data)
  })
  onBrowserMeta((m) => {
    if (streamer && !streamer.isDestroyed()) streamer.webContents.send('kywai-stream:meta', m)
  })
}
