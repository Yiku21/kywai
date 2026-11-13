// HTTPS para el acceso web con Tailscale Serve: el móvil abre https://<equipo>.<red>.ts.net (certificado de
// Tailscale, solo dentro de tu red) y Tailscale lo pasa a kywai en 127.0.0.1. Los navegadores solo dejan
// usar el micrófono en páginas HTTPS, así que sin esto el dictado no funciona desde el móvil.
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { WebHttpsInfo } from '@shared/types'

const CANDIDATES =
  process.platform === 'win32'
    ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Tailscale', 'tailscale.exe')]
    : process.platform === 'darwin'
      ? // La app del Mac (App Store o descarga directa) lleva dentro su CLI.
        ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/opt/homebrew/bin/tailscale', '/usr/local/bin/tailscale']
      : ['/usr/bin/tailscale', '/usr/local/bin/tailscale']

interface RunResult {
  ok: boolean
  stdout: string
  /** Salida y errores juntos (para mensajes y enlaces). */
  out: string
}

function run(cli: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(cli, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout), out: `${stdout}\n${stderr}`.trim() })
    })
  })
}

async function findCli(): Promise<string | null> {
  const known = CANDIDATES.find((p) => existsSync(p))
  if (known) return known
  // En el PATH (Linux, Homebrew u otras instalaciones).
  return (await run('tailscale', ['version'], 5000)).ok ? 'tailscale' : null
}

/** Estado de Tailscale: conectado, nombre del equipo (pc.red.ts.net) y si la red permite certificados HTTPS. */
export function parseStatus(json: string): { running: boolean; dnsName: string | null; certs: boolean } {
  try {
    const st = JSON.parse(json) as { BackendState?: string; Self?: { DNSName?: string }; CertDomains?: string[] | null }
    const dnsName = (st.Self?.DNSName ?? '').replace(/\.$/, '') || null
    return { running: st.BackendState === 'Running', dnsName, certs: !!st.CertDomains?.length }
  } catch {
    return { running: false, dnsName: null, certs: false }
  }
}

/** Destino que Tailscale Serve tiene en https:443, raíz «/» (o null si no hay ninguno). */
export function rootTarget(json: string): string | null {
  try {
    const cfg = JSON.parse(json) as { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string; Path?: string; Text?: string }> }> }
    for (const [host, web] of Object.entries(cfg.Web ?? {})) {
      if (!host.endsWith(':443')) continue
      const h = web.Handlers?.['/']
      if (h) return h.Proxy ?? h.Path ?? h.Text ?? 'otro contenido'
    }
  } catch {
    // Sin configuración o en otro formato.
  }
  return null
}

/** Ese destino es kywai en este puerto. */
export function isOurTarget(target: string | null, port: number): boolean {
  return !!target && new RegExp(`^(https?://)?(127\\.0\\.0\\.1|localhost):${port}/?$`).test(target)
}

/** Enlace que da Tailscale cuando la red todavía no permite HTTPS/Serve. */
export function enableLink(out: string): string | null {
  return out.match(/https:\/\/login\.tailscale\.com\/[^\s"'<>]+/)?.[0] ?? null
}

const lastLine = (out: string): string => out.split('\n').filter((l) => l.trim()).pop() ?? 'sin detalles'

export async function httpsInfo(port: number): Promise<WebHttpsInfo> {
  const cli = await findCli()
  if (!cli) return { available: false, active: false, url: null, problem: 'No encuentro el programa de Tailscale en este equipo.' }
  const st = parseStatus((await run(cli, ['status', '--json'], 8000)).stdout)
  if (!st.running || !st.dnsName) return { available: true, active: false, url: null, problem: 'Tailscale no está conectado en este equipo.' }
  const target = rootTarget((await run(cli, ['serve', 'status', '--json'], 8000)).stdout)
  const active = isOurTarget(target, port)
  const problem =
    !active && target
      ? `Tailscale Serve ya publica otra cosa en https://${st.dnsName} (${target}); quítala antes con «tailscale serve --https=443 off».`
      : undefined
  return { available: true, active, url: active ? `https://${st.dnsName}` : null, problem }
}

/** Publica kywai por HTTPS dentro de la red de Tailscale (queda guardado en Tailscale, también tras reiniciar). */
export async function enableHttps(port: number): Promise<WebHttpsInfo> {
  const before = await httpsInfo(port)
  if (before.active || !before.available || before.problem) return before
  const cli = (await findCli())!
  // Si la red no permite HTTPS todavía, Tailscale da un enlace para permitirlo y espera: se corta y se muestra.
  const r = await run(cli, ['serve', '--bg', '--yes', '--https=443', `http://127.0.0.1:${port}`], 25_000)
  const after = await httpsInfo(port)
  if (after.active) return after
  const link = enableLink(r.out)
  if (link) return { ...after, enableUrl: link }
  throw new Error(`Tailscale no pudo activar HTTPS: ${lastLine(r.out)}`)
}

/** Quita la publicación por HTTPS (solo si es la de kywai). */
export async function disableHttps(port: number): Promise<WebHttpsInfo> {
  const cli = await findCli()
  if (!cli) return httpsInfo(port)
  if (isOurTarget(rootTarget((await run(cli, ['serve', 'status', '--json'], 8000)).stdout), port)) {
    const r = await run(cli, ['serve', '--yes', '--https=443', 'off'], 15_000)
    if (!r.ok) throw new Error(`Tailscale no pudo quitar el HTTPS: ${lastLine(r.out)}`)
  }
  return httpsInfo(port)
}

// ---------- enlace público de un solo archivo con Tailscale Funnel (para que Instagram descargue un reel) ----------

/** Puertos que Funnel admite. El 443 se deja siempre para el HTTPS privado de kywai (Serve): nunca se abre a internet. */
const FUNNEL_PORTS = [8443, 10000]

/** Puertos que Tailscale Serve/Funnel ya usa en este equipo (para no pisar ni abrir a internet nada que no sea nuestro). */
export function usedServePorts(json: string): Set<number> {
  const used = new Set<number>()
  try {
    const cfg = JSON.parse(json) as { TCP?: Record<string, unknown>; Web?: Record<string, unknown> }
    for (const k of Object.keys(cfg.TCP ?? {})) used.add(Number(k))
    for (const host of Object.keys(cfg.Web ?? {})) used.add(Number(host.split(':').pop()))
  } catch {
    // Sin configuración.
  }
  return used
}

type RunFn = (cli: string, args: string[], timeoutMs: number) => Promise<RunResult>
let runImpl: RunFn = run
let findCliImpl: () => Promise<string | null> = findCli

export function __setTailscaleForTests(r: RunFn | null, cli?: () => Promise<string | null>): void {
  runImpl = r ?? run
  findCliImpl = cli ?? findCli
}

/**
 * Sirve UN archivo en internet desde este equipo con Tailscale Funnel hasta que se llame a `close`: un servidor
 * diminuto en 127.0.0.1 que solo entrega ese archivo en una dirección con un código al azar (todo lo demás da 404) y
 * Funnel en un puerto propio (8443 o 10000). Nunca toca el 443, que es el acceso privado a kywai.
 */
export async function openFunnelLink(file: string, signal?: AbortSignal): Promise<{ url: string; close: () => Promise<void> }> {
  const cli = await findCliImpl()
  if (!cli) throw new Error('no encuentro Tailscale en este equipo')
  const st = parseStatus((await runImpl(cli, ['status', '--json'], 8000)).stdout)
  if (!st.running || !st.dnsName) throw new Error('Tailscale no está conectado en este equipo')
  const used = usedServePorts((await runImpl(cli, ['serve', 'status', '--json'], 8000)).stdout)
  const port = FUNNEL_PORTS.find((p) => !used.has(p))
  if (!port) throw new Error(`los puertos de Funnel (${FUNNEL_PORTS.join(' y ')}) ya están ocupados en Tailscale`)
  const token = randomBytes(24).toString('hex')
  const ext = /\.(jpe?g|png)$/i.exec(file)?.[0].toLowerCase().replace('.jpeg', '.jpg') ?? '.mp4'
  const path = `/kywai/${token}${ext}`
  const server = await serveOneFile(file, path)
  const local = server.address() as AddressInfo
  const stopServer = (): Promise<void> => new Promise((r) => server.close(() => r()))
  if (signal?.aborted) {
    await stopServer()
    throw new Error('Cancelado')
  }
  // Si la red no permite Funnel todavía, Tailscale da un enlace para permitirlo y espera: se corta y se dice.
  const r = await runImpl(cli, ['funnel', '--bg', '--yes', `--https=${port}`, `http://127.0.0.1:${local.port}`], 25_000)
  const on = usedServePorts((await runImpl(cli, ['serve', 'status', '--json'], 8000)).stdout).has(port)
  if (!r.ok || !on) {
    await runImpl(cli, ['funnel', '--yes', `--https=${port}`, 'off'], 15_000)
    await stopServer()
    const link = enableLink(r.out)
    throw new Error(link ? `Funnel no está permitido en tu red de Tailscale; actívalo una vez aquí: ${link}` : `no se pudo abrir: ${lastLine(r.out)}`)
  }
  let closed = false
  return {
    url: `https://${st.dnsName}:${port}${path}`,
    close: async () => {
      if (closed) return
      closed = true
      await runImpl(cli, ['funnel', '--yes', `--https=${port}`, 'off'], 15_000)
      await stopServer()
    }
  }
}

/** Servidor en 127.0.0.1 (puerto libre) que solo entrega `file` en `path` (GET/HEAD, con Range); lo demás, 404. */
export function serveOneFile(file: string, path: string): Promise<Server> {
  const size = statSync(file).size
  const server = createServer((req, res) => {
    const url = (req.url ?? '').split('?')[0]
    if ((req.method !== 'GET' && req.method !== 'HEAD') || url !== path) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('no encontrado')
      return
    }
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
    let start = 0
    let end = size - 1
    if (m && (m[1] || m[2])) {
      if (m[1]) {
        start = Number(m[1])
        if (m[2]) end = Math.min(Number(m[2]), size - 1)
      } else start = Math.max(0, size - Number(m[2]))
      if (start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
        return
      }
    }
    const type = /\.jpg$/i.test(path) ? 'image/jpeg' : /\.png$/i.test(path) ? 'image/png' : 'video/mp4'
    const headers = { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
    if (m && (m[1] || m[2])) res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}` })
    else res.writeHead(200, headers)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}
