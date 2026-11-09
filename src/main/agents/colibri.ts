import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { LocalModel } from '@shared/types'
import { cleanLocalUrl } from '@shared/localEngines'
import { tr } from '@shared/i18n'
import { runOpenAiLocal, type OpenAiLocalBackend } from './lmstudio'
import { clip, num, obj, str } from './spawn'
import type { RunAgentOptions, RunAgentResult } from './types'

// Colibri (github.com/JustVugg/colibri, Apache-2.0) sirve modelos MoE grandes (Qwen3.6, GLM, DeepSeek…) leyendo del
// disco lo que no cabe en memoria. Su instalación («./start-here.sh» o «coli setup») guarda la configuración en
// setup.json y `coli start --background` lo arranca con una API compatible con OpenAI (127.0.0.1:8000/v1 de fábrica).
// Sirve un solo modelo a la vez. Con otra dirección en Ajustes vale también para otro servidor compatible
// (llama.cpp, MLX…): entonces kywai no puede encenderlo, solo usarlo.

export const COLIBRI_DEFAULT_URL = 'http://127.0.0.1:8000'
export const COLIBRI_OFFLINE = 'Servidor de Colibri apagado: pulsa «Encender» en el indicador Local o arráncalo con «coli start»'
/** Contexto que da Colibri a un modelo de chat si nadie lo fija (lo dice /v1/models cuando está encendido). */
const DEFAULT_CONTEXT = 65_536
/** Lo que puede tardar en cargar un modelo grande desde el disco. */
const LOAD_TIMEOUT_MS = 15 * 60 * 1000

/** Dirección elegida en Ajustes (config.colibriUrl); la fija el arranque de la app. */
let configuredUrl: () => string | undefined = () => undefined
export function setColibriUrlSource(fn: () => string | undefined): void {
  configuredUrl = fn
}

/** La parte de setup.json de Colibri que usa kywai. */
export interface ColibriSetup {
  /** Ruta del lanzador `coli` (un script de Python). */
  launcher: string
  host: string
  port: number
  modelId: string
  modelName: string
}

/** Carpeta donde la instalación de Colibri guarda setup.json (como setup_flow.setup_home). */
export function colibriSetupHome(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home = homedir()): string {
  const explicit = env.COLI_SETUP_HOME
  if (explicit) return resolve(explicit.replace(/^~(?=$|[\\/])/, home))
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'colibri')
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'colibri')
  return join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'colibri')
}

/** Lee setup.json; null si Colibri no está instalado (o la instalación no terminó). */
export function parseColibriSetup(text: string): ColibriSetup | null {
  let raw: Record<string, unknown> | null
  try {
    raw = obj(JSON.parse(text))
  } catch {
    return null
  }
  if (!raw || (raw.status !== undefined && raw.status !== 'ready')) return null
  const launcher = str(raw.launcher)
  if (!launcher) return null
  const port = num(raw.port) || 8000
  const host = str(raw.host) || '127.0.0.1'
  const model = obj(raw.model)
  return { launcher, host, port, modelId: str(model?.id) || str(model?.name), modelName: str(model?.name) || str(model?.id) }
}

export function readColibriSetup(): ColibriSetup | null {
  try {
    const setup = parseColibriSetup(readFileSync(join(colibriSetupHome(), 'setup.json'), 'utf8'))
    return setup && existsSync(setup.launcher) ? setup : null
  } catch {
    return null
  }
}

/** Dirección del servidor: la de Ajustes, si no la de la instalación, si no la de fábrica. */
export function colibriUrl(setup: ColibriSetup | null = readColibriSetup()): string {
  const custom = cleanLocalUrl(configuredUrl() ?? '')
  if (custom) return custom
  if (setup) {
    const host = setup.host === '0.0.0.0' || setup.host === '' ? '127.0.0.1' : setup.host
    return `http://${host.includes(':') ? `[${host}]` : host}:${setup.port}`
  }
  return COLIBRI_DEFAULT_URL
}

/** Hay otra dirección en Ajustes: un servidor que kywai no instala ni enciende. */
function usesCustomUrl(): boolean {
  return !!cleanLocalUrl(configuredUrl() ?? '')
}

let lastContext = DEFAULT_CONTEXT

/** Modelos que sirve ahora mismo (null si no responde). */
export async function colibriServedModels(url = colibriUrl()): Promise<LocalModel[] | null> {
  try {
    const res = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return null
    const j = obj(await res.json())
    const data = Array.isArray(j?.data) ? j.data : []
    const models = data
      .map((m) => obj(m))
      .filter((m): m is Record<string, unknown> => !!m && !!str(m.id))
      .map((m) => {
        const ctx = num(m.context_length) || num(m.max_model_len)
        if (ctx) lastContext = ctx
        return { id: str(m.id), label: str(m.id), params: ctx ? tr('{n} k de contexto', { n: Math.round(ctx / 1024) }) : undefined }
      })
    return models
  } catch {
    return null
  }
}

export interface ColibriState {
  installed: boolean
  running: boolean
  models: LocalModel[]
  canStart: boolean
}

export async function colibriStatus(): Promise<ColibriState> {
  const setup = readColibriSetup()
  const custom = usesCustomUrl()
  const served = await colibriServedModels(colibriUrl(setup))
  const installed = !!setup || custom || !!served
  if (served) return { installed, running: true, models: served, canStart: false }
  // Apagado: el modelo que dejó configurado la instalación (al encender, se usa el que sirva).
  const models = setup && !custom && setup.modelId ? [{ id: setup.modelId, label: setup.modelName || setup.modelId }] : []
  return { installed, running: false, models, canStart: !!setup && !custom }
}

/** Python con el que se lanza `coli` (el lanzador es un script de Python 3). */
function python(): { cmd: string; pre: string[] } {
  return process.platform === 'win32' ? { cmd: 'py', pre: ['-3'] } : { cmd: 'python3', pre: [] }
}

/** `coli start --background --no-browser`: arranca el servidor de la instalación sin abrir el navegador. */
export function colibriStart(): Promise<void> {
  const setup = readColibriSetup()
  if (usesCustomUrl()) return Promise.reject(new Error(tr('Ese servidor se enciende desde su propio programa')))
  if (!setup) return Promise.reject(new Error(tr('Colibri no está instalado')))
  const { cmd, pre } = python()
  return new Promise((resolvePromise, reject) => {
    execFile(cmd, [...pre, setup.launcher, 'start', '--background', '--no-browser'], { timeout: 180_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(new Error(clip(stderr || err.message, 300)))
      else resolvePromise()
    })
  })
}

let starting: Promise<boolean> | null = null

/** Enciende Colibri si está apagado y espera a que cargue el modelo. Una sola vez aunque lo pidan varios. */
export function ensureColibriServer(): Promise<boolean> {
  if (!starting) {
    starting = (async () => {
      if (await colibriServedModels()) return true
      if (usesCustomUrl() || !readColibriSetup()) return false
      try {
        await colibriStart()
      } catch (e) {
        console.warn('[cowork] no se pudo encender Colibri', e)
        return false
      }
      // `start` vuelve enseguida; el modelo tarda de segundos a minutos en cargar.
      const until = Date.now() + LOAD_TIMEOUT_MS
      while (Date.now() < until) {
        if (await colibriServedModels()) return true
        await new Promise((r) => setTimeout(r, 3000))
      }
      return false
    })().finally(() => {
      starting = null
    })
  }
  return starting
}

/** ¿Instalado y sirviendo? Con `autoStart`, si está apagado lo enciende en segundo plano (sin esperar a que cargue). */
export async function checkColibri(model: string, autoStart = false): Promise<{ ok: boolean; reason?: string }> {
  const setup = readColibriSetup()
  if (!setup && !usesCustomUrl()) return { ok: false, reason: tr('Colibri no está instalado') }
  if (!model) return { ok: false, reason: tr('No hay un modelo local configurado') }
  const served = await colibriServedModels(colibriUrl(setup))
  if (!served) {
    if (autoStart) void ensureColibriServer()
    return { ok: false, reason: autoStart && setup && !usesCustomUrl() ? tr('Colibri se está encendiendo: el modelo tarda unos minutos en cargar') : tr(COLIBRI_OFFLINE) }
  }
  if (!served.length) return { ok: false, reason: tr('Colibri no tiene ningún modelo cargado') }
  return { ok: true }
}

/** Colibri sirve un solo modelo: si cambió (otra instalación), se usa el que sirve. */
async function resolveModel(model: string): Promise<string> {
  const served = await colibriServedModels()
  if (!served?.length || served.some((m) => m.id === model)) return model
  return served[0].id
}

const COLIBRI_BACKEND: OpenAiLocalBackend = {
  name: 'Colibri',
  url: () => colibriUrl(),
  ensureServer: ensureColibriServer,
  offline: () => tr(COLIBRI_OFFLINE),
  resolveModel,
  contextCapacity: () => lastContext
}

export function runColibri(opts: RunAgentOptions): Promise<RunAgentResult> {
  return runOpenAiLocal(opts, COLIBRI_BACKEND)
}
