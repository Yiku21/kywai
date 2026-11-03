// Consulta activa de las cuotas, sin gastar uso: Claude Code con «/usage» (se resuelve en local, 0 tokens) y
// Codex con su app-server («account/rateLimits/read»). Así las cuotas se ven aunque el agente todavía no haya
// trabajado en este equipo; antes solo llegaban con las tareas.
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CodexRateLimits, CodexRateWindow } from './agents/codex'
import { buildCommandLine, killTree, obj } from './agents/spawn'
import type { RateLimitInfo, RateLimitWindow } from './agents/types'

const IS_WIN = process.platform === 'win32'
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Partes de la fecha y hora de un instante en una zona horaria (IANA). */
function zoneParts(ms: number, zone: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric'
  }).formatToParts(new Date(ms))
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value)
  return { y: get('year'), mo: get('month') - 1, d: get('day'), h: get('hour') % 24, mi: get('minute') }
}

/** Hora de reloj en una zona → instante (ms). */
function zonedTime(y: number, mo: number, d: number, h: number, mi: number, zone: string | null): number {
  if (!zone) return new Date(y, mo, d, h, mi).getTime()
  const guess = Date.UTC(y, mo, d, h, mi)
  const p = zoneParts(guess, zone)
  return guess - (Date.UTC(p.y, p.mo, p.d, p.h, p.mi) - guess)
}

/** «Oct 11, 5:19am (Etc/GMT+5)», «Oct 12, 2am (…)» o «5:19am (…)» → ms; null si no se entiende. */
export function parseResetTime(text: string, now = Date.now()): number | null {
  const m = text.trim().match(/^(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:\(([^)]+)\))?/i)
  if (!m) return null
  const [, mon, day, hh, mm, ampm, rawZone] = m
  let zone: string | null = rawZone?.trim() || null
  try {
    if (zone) new Intl.DateTimeFormat('en-US', { timeZone: zone })
  } catch {
    zone = null
  }
  let h = Number(hh)
  if (ampm) h = (h % 12) + (ampm.toLowerCase() === 'pm' ? 12 : 0)
  const mi = Number(mm ?? 0)
  if (h > 23 || mi > 59) return null
  const today = zone ? zoneParts(now, zone) : (() => {
    const t = new Date(now)
    return { y: t.getFullYear(), mo: t.getMonth(), d: t.getDate() }
  })()
  if (mon) {
    const mo = MONTHS.indexOf(mon.toLowerCase())
    if (mo < 0) return null
    let at = zonedTime(today.y, mo, Number(day), h, mi, zone)
    // «Jan 2» visto a finales de diciembre es del año siguiente.
    if (at < now - 12 * 3600_000) at = zonedTime(today.y + 1, mo, Number(day), h, mi, zone)
    return at
  }
  let at = zonedTime(today.y, today.mo, today.d, h, mi, zone)
  if (at < now - 60_000) at += 24 * 3600_000
  return at
}

/** Texto de «/usage» de Claude Code → ventanas de uso (null si no es una suscripción o no se entiende). */
export function parseClaudeUsage(text: string, now = Date.now()): RateLimitInfo | null {
  const windows: RateLimitWindow[] = []
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(/^Current (session|week)(?:\s*\(([^)]+)\))?\s*:\s*(\d+(?:\.\d+)?)%\s*used(?:\s*[·•|-]\s*resets\s+(.+))?$/i)
    if (!m) continue
    const [, kind, scope, pct, reset] = m
    const name =
      kind.toLowerCase() === 'session'
        ? 'five_hour'
        : !scope || /^all/i.test(scope)
          ? 'seven_day'
          : `seven_day_${scope.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
    windows.push({ name, usedPct: Math.min(100, Number(pct)), resetsAt: reset ? parseResetTime(reset, now) : null })
  }
  return windows.length ? { provider: 'claude', status: 'allowed', windows, receivedAt: now } : null
}

/** Respuesta de «account/rateLimits/read» del app-server de Codex → límites de uso. */
export function parseCodexAppRateLimits(result: unknown, now = Date.now()): CodexRateLimits | null {
  const r = obj(result)
  const rl = obj(r?.rateLimits) ?? obj(obj(r?.rateLimitsByLimitId)?.codex)
  if (!rl) return null
  const win = (v: unknown): CodexRateWindow | undefined => {
    const w = obj(v)
    if (!w || typeof w.usedPercent !== 'number') return undefined
    return {
      usedPercent: w.usedPercent,
      windowMinutes: typeof w.windowDurationMins === 'number' ? w.windowDurationMins : null,
      resetsAt: typeof w.resetsAt === 'number' ? w.resetsAt * 1000 : null
    }
  }
  const primary = win(rl.primary)
  const secondary = win(rl.secondary)
  if (!primary && !secondary) return null
  return {
    windows: { primary, secondary },
    reachedType: rl.rateLimitReachedType == null ? null : String(rl.rateLimitReachedType),
    planType: rl.planType == null ? null : String(rl.planType),
    updatedAt: now,
    file: 'codex app-server'
  }
}

function start(command: string, args: string[]): ChildProcess | null {
  try {
    return spawn(buildCommandLine(command, args), {
      shell: true,
      cwd: tmpdir(),
      windowsHide: true,
      detached: !IS_WIN,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
    })
  } catch {
    return null
  }
}

interface RunOutput {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

/** Ejecuta una orden corta (sin entrada) y devuelve su salida. */
function runOnce(command: string, args: string[], timeoutMs: number): Promise<RunOutput> {
  return new Promise((resolve) => {
    const child = start(command, args)
    if (!child) return resolve({ code: null, stdout: '', stderr: 'no se pudo ejecutar', timedOut: false })
    // Sin entrada: así claude -p no espera nada por stdin.
    child.stdin?.on('error', () => undefined)
    child.stdin?.end()
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutMs)
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (d: string) => {
      stdout = (stdout + d).slice(-200_000)
    })
    child.stderr?.on('data', (d: string) => {
      stderr = (stderr + d).slice(-20_000)
    })
    child.on('error', (e) => {
      stderr += String(e.message)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

const firstLine = (s: string): string =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('{')) ?? ''

export interface ClaudeProbe {
  info: RateLimitInfo | null
  /** Por qué no hay dato (se muestra en la cuota de Claude). */
  problem?: string
  /** Claude Code pasa por otro servidor: la app puede quitar el desvío (fixClaudeDirect). */
  override?: boolean
}

/** Texto que devuelve «claude -p /usage --output-format json» (o la salida tal cual si no es JSON). */
function usageText(stdout: string): string {
  const i = stdout.indexOf('{')
  if (i >= 0) {
    try {
      const j = JSON.parse(stdout.slice(i)) as { result?: unknown }
      if (typeof j.result === 'string') return j.result
    } catch {
      // No es JSON: se usa el texto.
    }
  }
  return stdout
}

/** Variables que hacen que Claude Code no hable directamente con tu cuenta de claude.ai. */
const CLAUDE_OVERRIDES = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']

/**
 * Lo que Claude Code tiene configurado para ir por otro sitio (en ~/.claude/settings.json o en el entorno):
 * solo nombres de variables y el servidor de ANTHROPIC_BASE_URL, nunca claves.
 */
export function claudeOverrides(settingsJson: string | null, env: Record<string, string | undefined>): { server: string | null; names: string[] } {
  let fileEnv: Record<string, unknown> = {}
  let helper = false
  try {
    const j = obj(JSON.parse(settingsJson ?? '{}'))
    fileEnv = obj(j?.env) ?? {}
    helper = typeof j?.apiKeyHelper === 'string' && !!j.apiKeyHelper
  } catch {
    // Sin ajustes o ilegibles.
  }
  // Las variables de settings.json se aplican encima de las del entorno.
  const merged: Record<string, unknown> = { ...env, ...fileEnv }
  let server: string | null = null
  if (typeof merged.ANTHROPIC_BASE_URL === 'string' && merged.ANTHROPIC_BASE_URL) {
    try {
      const u = new URL(merged.ANTHROPIC_BASE_URL)
      // El servidor oficial de Anthropic no es un desvío.
      if (!/(^|\.)anthropic\.com$/i.test(u.hostname)) server = u.origin
    } catch {
      server = 'otro servidor'
    }
  }
  const set = (n: string): boolean =>
    n === 'ANTHROPIC_BASE_URL' ? !!server : typeof merged[n] === 'string' && merged[n] !== '' && merged[n] !== '0'
  const names = CLAUDE_OVERRIDES.filter(set)
  if (helper) names.push('apiKeyHelper')
  return { server, names }
}

function claudeSettingsPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json')
}

function readClaudeSettings(): string | null {
  try {
    return readFileSync(claudeSettingsPath(), 'utf8')
  } catch {
    return null
  }
}

/** Ajustes de Claude Code sin lo que lo desvía a otro servidor (todo ANTHROPIC_* de «env» y apiKeyHelper). */
export function withoutClaudeOverrides(settings: Record<string, unknown>): { settings: Record<string, unknown>; removed: string[] } {
  const out: Record<string, unknown> = { ...settings }
  const removed: string[] = []
  const env = obj(out.env)
  if (env) {
    const kept: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(env)) {
      if (k.startsWith('ANTHROPIC_') || k === 'CLAUDE_CODE_USE_BEDROCK' || k === 'CLAUDE_CODE_USE_VERTEX') removed.push(k)
      else kept[k] = v
    }
    if (Object.keys(kept).length) out.env = kept
    else delete out.env
  }
  if ('apiKeyHelper' in out) {
    delete out.apiKeyHelper
    removed.push('apiKeyHelper')
  }
  return { settings: out, removed }
}

/**
 * Hace que Claude Code use directamente tu cuenta: quita el desvío de ~/.claude/settings.json (guardando antes
 * una copia al lado) y dice qué quitó y qué variables de entorno siguen desviándolo, si las hay.
 */
export function removeClaudeOverrides(): { removed: string[]; backup: string | null; stillInEnv: string[] } {
  const stillInEnv = claudeOverrides(null, process.env).names
  const file = claudeSettingsPath()
  const raw = readClaudeSettings()
  if (raw == null) return { removed: [], backup: null, stillInEnv }
  let parsed: Record<string, unknown> | null
  try {
    parsed = obj(JSON.parse(raw))
  } catch {
    parsed = null
  }
  if (!parsed) throw new Error(`No se pudo leer ${file}: no es un JSON válido. Revísalo a mano.`)
  const { settings, removed } = withoutClaudeOverrides(parsed)
  if (!removed.length) return { removed, backup: null, stillInEnv }
  const stamp = new Date().toLocaleString('sv-SE').slice(0, 16).replace(' ', '_').replace(':', '-')
  const backup = `${file}.bak-aicowork-${stamp}`
  copyFileSync(file, backup)
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  return { removed, backup, stillInEnv }
}

/** Cómo tiene Claude Code la sesión iniciada («claude.ai» = tu cuenta con suscripción). */
export async function claudeAuthMethod(): Promise<{ loggedIn: boolean; method: string | null }> {
  const r = await runOnce('claude', ['auth', 'status', '--json'], 20_000)
  try {
    const j = obj(JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))))
    return { loggedIn: j?.loggedIn === true, method: typeof j?.authMethod === 'string' ? j.authMethod : null }
  } catch {
    return { loggedIn: false, method: null }
  }
}

/** Cuota de Claude con «/usage» (no llama al modelo ni guarda sesión). Si no se puede, explica por qué. */
export async function probeClaudeUsage(timeoutMs = 45_000): Promise<ClaudeProbe> {
  let r = await runOnce('claude', ['-p', '/usage', '--output-format', 'json', '--no-session-persistence'], timeoutMs)
  // Versiones antiguas de Claude Code no conocen la opción: se repite sin ella.
  if (r.code !== 0 && /unknown option|no-session-persistence/i.test(r.stderr + r.stdout)) {
    r = await runOnce('claude', ['-p', '/usage', '--output-format', 'json'], timeoutMs)
  }
  const text = usageText(r.stdout)
  const info = parseClaudeUsage(text)
  if (info) return { info }

  const version = firstLine((await runOnce('claude', ['--version'], 15_000)).stdout).replace(/\s*\(Claude Code\)\s*$/i, '')
  const where = IS_WIN ? '' : firstLine((await runOnce('command', ['-v', 'claude'], 10_000)).stdout)
  const which = [version && `versión ${version}`, where && `en ${where}`].filter(Boolean).join(', ')
  const suffix = which ? ` (Claude Code ${which})` : ''
  // Lo que respondió, tal cual (las primeras líneas): sirve para saber qué pasa y adaptar la lectura.
  const answer = (text || r.stderr)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('{'))
    .slice(0, 4)
    .join(' / ')
    .slice(0, 400)
  const ov = claudeOverrides(readClaudeSettings(), process.env)
  let problem: string
  if (ov.server) {
    problem =
      `Claude Code está configurado para pasar por ${ov.server} (ANTHROPIC_BASE_URL, p. ej. OmniRoute) en vez de ir directo a tu cuenta de Claude: ` +
      `así no ve tu suscripción y no puede dar la cuota. Está en ~/.claude/settings.json («env») o en tus variables de entorno${suffix}.`
  } else if (ov.names.length) {
    problem = `Claude Code tiene configurado ${ov.names.join(', ')} (en ~/.claude/settings.json o en el entorno) y no usa tu cuenta de Claude directamente, así que no puede dar la cuota${suffix}.`
  } else if (r.timedOut) {
    problem = `Claude Code no respondió a «/usage»${suffix}.`
  } else {
    problem = `No se pudo leer la cuota con «/usage»${suffix}. Respondió: «${answer || 'nada'}»`
  }
  return { info: null, problem, override: ov.names.length > 0 }
}

/** Cuota de Codex preguntando a su app-server (no gasta uso). */
export function probeCodexRateLimits(timeoutMs = 25_000): Promise<CodexRateLimits | null> {
  return new Promise((resolve) => {
    const child = start('codex', ['app-server'])
    if (!child) return resolve(null)
    let buf = ''
    let done = false
    const finish = (v: CodexRateLimits | null): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      killTree(child)
      resolve(v)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    const send = (o: unknown): void => {
      try {
        child.stdin?.write(`${JSON.stringify(o)}\n`)
      } catch {
        // El proceso ya terminó.
      }
    }
    child.stdin?.on('error', () => undefined)
    child.on('error', () => finish(null))
    child.on('close', () => finish(null))
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (d: string) => {
      buf += d
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        let m: { id?: unknown; result?: unknown } | null = null
        try {
          m = JSON.parse(line) as { id?: unknown; result?: unknown }
        } catch {
          continue
        }
        if (m.id === 0) {
          send({ method: 'initialized' })
          send({ method: 'account/rateLimits/read', id: 1 })
        } else if (m.id === 1) {
          finish(parseCodexAppRateLimits(m.result))
        }
      }
    })
    send({ method: 'initialize', id: 0, params: { clientInfo: { name: 'ai_cowork', title: 'AI Cowork', version: '1' } } })
  })
}
