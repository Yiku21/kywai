// Servidores MCP que kywai apunta en la configuración PROPIA de Hermes (~/.hermes/config.yaml), no solo en la de cada
// tarea (HERMES_MANAGED_DIR). El gateway de Hermes valida las herramientas pedidas con «-t» contra ~/.hermes: un
// servidor que solo está en la carpeta de la tarea hace que rechace la sesión entera (13 nov). Apuntado ahí, Hermes
// lo puede usar también al COORDINAR. Solo se apuntan servidores sin claves (hoy, Lightpanda), en un bloque marcado
// que kywai pone y quita; el resto del archivo no se toca.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mcpRuntimeFor } from '@shared/extensions'
import type { ResolvedMcpServer } from './extensions'
import { hermesHome } from './hermesModels'
import { which } from './linuxDesktop'

/** Servidores que pueden ir en la configuración de Hermes: los de este programa, sin claves. */
export const HERMES_HOME_RUNTIMES = ['lightpanda'] as const

const ID_RE = /^[a-z][a-z0-9_-]{0,30}$/
const start = (id: string): string => `# kywai:${id} (lo pone y lo quita kywai)`
const end = (id: string): string => `# /kywai:${id}`
const SECTION_RE = /^mcp_servers:\s*(\{\s*\})?\s*(#.*)?$/

export interface HermesHomeEntry {
  id: string
  command: string
  args: string[]
  env: Record<string, string>
}

function blockOf(e: HermesHomeEntry, ind: string): string[] {
  const env = Object.keys(e.env).length ? [`${ind}${ind}env: ${JSON.stringify(e.env)}`] : []
  // JSON es YAML válido: comillas y barras quedan bien escapadas sin hacerlo a mano.
  return [start(e.id), `${e.id}:`, `${ind}command: ${JSON.stringify(e.command)}`, `${ind}args: ${JSON.stringify(e.args)}`].map((l) => ind + l).concat(env, [ind + end(e.id)])
}

/** Quita el bloque de kywai de ese servidor (si lo hay). Si la sección queda vacía, la deja como «{}». */
function without(lines: string[], id: string): string[] {
  const a = lines.findIndex((l) => l.trim() === start(id))
  if (a < 0) return lines
  const b = lines.findIndex((l, i) => i > a && l.trim() === end(id))
  if (b < 0) return lines
  const out = [...lines.slice(0, a), ...lines.slice(b + 1)]
  const sec = out.findIndex((l) => SECTION_RE.test(l))
  if (sec >= 0) {
    const next = out.slice(sec + 1).find((l) => l.trim() && !l.trim().startsWith('#'))
    if (!next || !/^\s/.test(next)) out[sec] = 'mcp_servers: {}'
  }
  return out
}

/**
 * La configuración de Hermes con el bloque de kywai de `id` puesto (entry) o quitado (null). Si el usuario ya tiene un
 * servidor propio con ese nombre, o una sección `mcp_servers` escrita en una línea, no se toca nada.
 */
export function withHermesMcp(yaml: string, id: string, entry: HermesHomeEntry | null): string {
  if (!ID_RE.test(id)) return yaml
  const eol = yaml.includes('\r\n') ? '\r\n' : '\n'
  let lines = without(yaml.split(/\r?\n/), id)
  if (entry) {
    if (lines.some((l) => new RegExp(`^\\s+${id}:\\s*(#.*)?$`).test(l))) return yaml
    const sec = lines.findIndex((l) => SECTION_RE.test(l))
    if (sec < 0) {
      if (lines.some((l) => /^mcp_servers:/.test(l))) return yaml
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
      lines = [...lines, 'mcp_servers:', ...blockOf(entry, '  '), '']
    } else {
      const child = lines.slice(sec + 1).find((l) => l.trim() && !l.trim().startsWith('#'))
      const ind = child && /^\s/.test(child) ? child.match(/^\s+/)![0] : '  '
      lines = [...lines.slice(0, sec), 'mcp_servers:', ...blockOf(entry, ind), ...lines.slice(sec + 1)]
    }
  }
  return lines.join(eol)
}

/** Los servidores que kywai tiene apuntados en esta configuración de Hermes. */
export function hermesMcpIds(yaml: string): string[] {
  const ids: string[] = []
  for (const l of yaml.split(/\r?\n/)) {
    const m = l.trim().match(/^# kywai:([a-z][a-z0-9_-]{0,30}) /)
    if (m && yaml.includes(end(m[1]))) ids.push(m[1])
  }
  return ids
}

/** Lo que se apunta en Hermes de un servidor de Extensiones encendido para Hermes, o null si no es de los que van. */
export function hermesHomeEntry(s: Pick<ResolvedMcpServer, 'id' | 'transport' | 'command' | 'args' | 'env'>, resolve: (cmd: string) => string | null = which): HermesHomeEntry | null {
  if (s.transport !== 'stdio' || !s.command || !ID_RE.test(s.id)) return null
  const runtime = mcpRuntimeFor(s.command)
  if (!runtime || !(HERMES_HOME_RUNTIMES as readonly string[]).includes(runtime)) return null
  // Con la ruta entera: Hermes puede arrancar con otro PATH (sin ~/.local/bin).
  const command = /[\\/]/.test(s.command) ? s.command : resolve(s.command)
  if (!command) return null
  return { id: s.id, command, args: s.args, env: s.env }
}

const configFile = (): string => join(hermesHome(), 'config.yaml')

/**
 * Deja en ~/.hermes/config.yaml justo los servidores de kywai que tocan: los encendidos para Hermes (y que funcionan)
 * que pueden ir ahí. Si Hermes aún no tiene configuración, no se crea.
 */
export function syncHermesHome(list: ResolvedMcpServer[], file = configFile()): void {
  try {
    if (!existsSync(file)) return
    const before = readFileSync(file, 'utf8')
    const wanted = new Map<string, HermesHomeEntry>()
    for (const s of list) {
      const e = hermesHomeEntry(s)
      if (e) wanted.set(e.id, e)
    }
    let yaml = before
    for (const id of hermesMcpIds(before)) if (!wanted.has(id)) yaml = withHermesMcp(yaml, id, null)
    // Se vuelve a escribir aunque ya esté: así se corrige la ruta si el programa cambió de sitio.
    for (const e of wanted.values()) yaml = withHermesMcp(yaml, e.id, e)
    if (yaml !== before) writeFileSync(file, yaml, { encoding: 'utf8', mode: statSync(file).mode & 0o777 })
  } catch (e) {
    console.warn('[cowork] no se pudo actualizar la configuración de Hermes', e)
  }
}

/** Los servidores de kywai que la configuración de Hermes ya tiene (los puede pedir con «-t» también al coordinar). */
export function hermesHomeToolsets(file = configFile()): string[] {
  try {
    return existsSync(file) ? hermesMcpIds(readFileSync(file, 'utf8')) : []
  } catch {
    return []
  }
}
