// HTTPS para el acceso web con Tailscale Serve: el móvil abre https://<equipo>.<red>.ts.net (certificado de
// Tailscale, solo dentro de tu red) y Tailscale lo pasa a AI Cowork en 127.0.0.1. Los navegadores solo dejan
// usar el micrófono en páginas HTTPS, así que sin esto el dictado no funciona desde el móvil.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
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

/** Ese destino es AI Cowork en este puerto. */
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

/** Publica AI Cowork por HTTPS dentro de la red de Tailscale (queda guardado en Tailscale, también tras reiniciar). */
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

/** Quita la publicación por HTTPS (solo si es la de AI Cowork). */
export async function disableHttps(port: number): Promise<WebHttpsInfo> {
  const cli = await findCli()
  if (!cli) return httpsInfo(port)
  if (isOurTarget(rootTarget((await run(cli, ['serve', 'status', '--json'], 8000)).stdout), port)) {
    const r = await run(cli, ['serve', '--yes', '--https=443', 'off'], 15_000)
    if (!r.ok) throw new Error(`Tailscale no pudo quitar el HTTPS: ${lastLine(r.out)}`)
  }
  return httpsInfo(port)
}
