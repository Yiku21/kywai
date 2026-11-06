// Asistente de configuración: detecta e instala los programas de cada agente, recarga el PATH y abre
// el inicio de sesión oficial de cada CLI. Nunca pide ni guarda contraseñas: cada CLI inicia sesión en
// su propia ventana (normalmente en el navegador). La única credencial que se escribe es la clave de API
// de Gemini, si el usuario la introduce, en el archivo donde la lee el propio Gemini CLI.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { SetupAuth, SetupInstallResult, SetupTool, SetupToolId } from '@shared/types'
import { emit } from './events'
import { getConfig } from './config'
import { agentKey, keys } from './keys'
import { lmsPath } from './agents/lmstudio'
import { findTerminal, terminalArgs } from './linuxDesktop'

const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'
const HOME = homedir()

interface Output {
  code: number | null
  out: string
}

/** Ejecuta una orden de consola (sin ventana) y devuelve su salida. `onLine` recibe cada línea. */
export function sh(command: string, timeoutMs: number, onLine?: (line: string) => void, cwd?: string): Promise<Output> {
  return new Promise((resolve) => {
    let out = ''
    let buf = ''
    const child = spawn(command, { shell: true, windowsHide: true, env: process.env, cwd })
    const take = (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      out = (out + text).slice(-20000)
      if (!onLine) return
      buf += text
      const lines = buf.split(/\r?\n|\r/)
      buf = lines.pop() ?? ''
      for (const l of lines) if (l.trim()) onLine(l)
    }
    child.stdout?.on('data', take)
    child.stderr?.on('data', take)
    const timer = setTimeout(() => {
      child.kill()
      resolve({ code: null, out: `${out}\n(tiempo de espera agotado)` })
    }, timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, out: String(e.message) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (onLine && buf.trim()) onLine(buf)
      resolve({ code, out })
    })
  })
}

// ---------- PATH ----------

async function regValue(key: string, name: string): Promise<string> {
  const r = await sh(`reg query "${key}" /v ${name}`, 8000)
  const m = r.out.match(new RegExp(`${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)`, 'i'))
  return m ? m[1].trim() : ''
}

const expandWin = (s: string): string => s.replace(/%([^%]+)%/g, (all, v: string) => process.env[v] ?? all)

/**
 * Vuelve a leer el PATH del sistema. Hace falta tras instalar algo (el proceso conserva el PATH con el
 * que arrancó) y en macOS siempre: una app abierta desde Finder no hereda el PATH de la terminal.
 */
export async function refreshPath(): Promise<void> {
  const found: string[] = []
  if (IS_WIN) {
    const machine = await regValue('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', 'Path')
    const user = await regValue('HKCU\\Environment', 'Path')
    found.push(...expandWin(`${machine};${user}`).split(';'))
    const appData = process.env.APPDATA
    const local = process.env.LOCALAPPDATA
    found.push(join(HOME, '.local', 'bin'), join(HOME, '.lmstudio', 'bin'))
    if (appData) found.push(join(appData, 'npm'))
    if (local) found.push(join(local, 'hermes', 'bin'), join(local, 'Programs', 'Ollama'))
  } else {
    const shell = process.env.SHELL || (IS_MAC ? '/bin/zsh' : '/bin/bash')
    const r = await sh(`${shell} -ilc 'printf "__PATH__%s__PATH__" "$PATH"'`, 10000)
    const m = r.out.match(/__PATH__(.*?)__PATH__/)
    if (m) found.push(...m[1].split(':'))
    found.push('/opt/homebrew/bin', '/usr/local/bin', join(HOME, '.local', 'bin'), join(HOME, '.lmstudio', 'bin'), join(HOME, '.npm-global', 'bin'))
  }
  const current = (process.env.PATH ?? '').split(delimiter)
  const seen = new Set(current.map((p) => (IS_WIN ? p.toLowerCase() : p)))
  for (const p of found) {
    const dir = p.trim()
    const key = IS_WIN ? dir.toLowerCase() : dir
    if (dir && !seen.has(key) && existsSync(dir)) {
      seen.add(key)
      current.push(dir)
    }
  }
  process.env.PATH = current.filter(Boolean).join(delimiter)
}

// ---------- Programas ----------

interface ToolDef {
  label: string
  /** Orden que imprime la versión (vacío: se comprueba de otra forma). */
  version: string
  url: string
  /** Orden de instalación en esta plataforma, o null si hay que descargarlo a mano. */
  install(ctx: { brew: boolean; winget: boolean; node: boolean }): { cmd: string; needs?: SetupToolId } | null
  /** Inicio de sesión interactivo (se abre en una terminal). */
  login?: string
}

const ps = (script: string): string => `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`
const winget = (id: string): string =>
  `winget install -e --id ${id} --accept-package-agreements --accept-source-agreements --disable-interactivity`

type FixedToolId = Exclude<SetupToolId, `cli:${string}`>

const TOOLS: Record<FixedToolId, ToolDef> = {
  python: {
    label: 'Python',
    version: IS_WIN ? 'python --version' : 'python3 --version',
    url: 'https://www.python.org/downloads/',
    install: ({ brew, winget: wg }) => (IS_WIN ? (wg ? { cmd: winget('Python.Python.3.12') } : null) : brew ? { cmd: 'brew install python' } : null)
  },
  node: {
    label: 'Node.js',
    version: 'node --version',
    url: 'https://nodejs.org/',
    install: ({ brew, winget: wg }) => (IS_WIN ? (wg ? { cmd: winget('OpenJS.NodeJS.LTS') } : null) : brew ? { cmd: 'brew install node' } : null)
  },
  brew: {
    label: 'Homebrew',
    version: 'brew --version',
    url: 'https://brew.sh/',
    // Su instalador pide la contraseña del Mac: se instala a mano desde brew.sh.
    install: () => null
  },
  claude: {
    label: 'Claude Code',
    version: 'claude --version',
    url: 'https://docs.anthropic.com/claude-code',
    install: () => ({ cmd: IS_WIN ? ps('irm https://claude.ai/install.ps1 | iex') : 'curl -fsSL https://claude.ai/install.sh | bash' }),
    login: 'claude auth login'
  },
  codex: {
    label: 'Codex CLI',
    version: 'codex --version',
    url: 'https://github.com/openai/codex',
    // Instalador oficial de OpenAI: binario propio en ~/.local/bin (no necesita Node.js ni permisos de administrador).
    install: () => ({
      cmd: IS_WIN
        ? ps("$env:CODEX_NON_INTERACTIVE='1'; irm https://chatgpt.com/codex/install.ps1 | iex")
        : 'curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh'
    }),
    login: 'codex login'
  },
  gemini: {
    label: 'Gemini CLI',
    version: 'gemini --version',
    url: 'https://github.com/google-gemini/gemini-cli',
    install: ({ brew }) => (IS_MAC && brew ? { cmd: 'brew install gemini-cli' } : { cmd: 'npm install -g @google/gemini-cli', needs: 'node' }),
    // Abre Gemini: la primera vez pregunta cómo iniciar sesión (cuenta de Google o clave de API).
    login: 'gemini'
  },
  hermes: {
    label: 'Hermes Agent',
    version: 'hermes --version',
    url: 'https://github.com/NousResearch/hermes-agent',
    install: () => ({
      cmd: IS_WIN
        ? ps('& ([scriptblock]::Create((irm https://hermes-agent.nousresearch.com/install.ps1))) -NonInteractive')
        : 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup'
    }),
    // Asistente de Hermes: elegir proveedor y modelo (p. ej. OmniRoute o una cuenta propia).
    login: 'hermes setup'
  },
  muse: {
    label: 'Muse Code',
    version: 'muse --version',
    url: 'https://dev.meta.ai/docs/muse-code',
    // Instalador oficial de Meta: binario propio en ~/.local/bin (no necesita Node.js).
    install: () => ({ cmd: IS_WIN ? ps('irm https://dev.meta.ai/install.ps1 | iex') : 'curl -fsSL https://dev.meta.ai/install.sh | sh' }),
    // La primera vez pide iniciar sesión con el navegador (la suscripción de Muse Code); después, /login.
    login: 'muse'
  },
  lmstudio: {
    label: 'LM Studio',
    version: '',
    url: 'https://lmstudio.ai/',
    install: ({ brew, winget: wg }) =>
      IS_WIN ? (wg ? { cmd: winget('ElementLabs.LMStudio') } : null) : brew ? { cmd: 'brew install --cask lm-studio' } : null
  },
  ollama: {
    label: 'Ollama',
    version: 'ollama --version',
    url: 'https://ollama.com/download',
    install: ({ brew, winget: wg }) =>
      IS_WIN ? (wg ? { cmd: winget('Ollama.Ollama') } : null) : brew ? { cmd: 'brew install ollama && brew services start ollama' } : null
  }
}

/**
 * Lo que se sabe de un programa: los de fábrica y, con el prefijo «cli:», el de un agente de catálogo (su ficha dice
 * cómo se comprueba, se instala y se inicia sesión).
 */
function toolDef(id: SetupToolId): ToolDef | null {
  if (!id.startsWith('cli:')) return (TOOLS as Record<string, ToolDef>)[id] ?? null
  const agent = getConfig().agents.find((a) => a.id === id.slice(4))
  const spec = agent?.cli
  if (!agent || !spec) return null
  const how = spec.install ? (IS_WIN ? spec.install.windows : IS_MAC ? spec.install.mac : spec.install.linux) : undefined
  return {
    label: agent.name,
    version: [spec.command, ...spec.versionArgs].join(' '),
    url: spec.url ?? '',
    install: () => (how ? { cmd: how, needs: spec.install?.needs } : null),
    login: spec.login
  }
}

const VERSION_RE = /\d+\.\d+(?:\.\d+)?/

async function probe(id: SetupToolId): Promise<{ installed: boolean; version?: string }> {
  if (id === 'lmstudio') {
    const lms = lmsPath()
    return { installed: !!lms }
  }
  const def = toolDef(id)
  if (!def) return { installed: false }
  const r = await sh(def.version, 20000)
  if (r.code !== 0) return { installed: false }
  return { installed: true, version: r.out.match(VERSION_RE)?.[0] }
}

async function context(): Promise<{ brew: boolean; winget: boolean; node: boolean }> {
  const [brew, wg, node] = await Promise.all([
    IS_MAC ? probe('brew') : Promise.resolve({ installed: false }),
    IS_WIN ? sh('winget --version', 10000).then((r) => ({ installed: r.code === 0 })) : Promise.resolve({ installed: false }),
    probe('node')
  ])
  return { brew: brew.installed, winget: wg.installed, node: node.installed }
}

const PLATFORM_TOOLS: SetupToolId[] = IS_MAC
  ? ['brew', 'node', 'claude', 'codex', 'gemini', 'hermes', 'muse', 'lmstudio', 'ollama']
  : ['node', 'claude', 'codex', 'gemini', 'hermes', 'muse', 'lmstudio', 'ollama']

/** Estado de todos los programas que puede necesitar AI Cowork en este equipo. */
export async function detectTools(): Promise<SetupTool[]> {
  await refreshPath()
  const ctx = await context()
  // Los programas de fábrica y los de los agentes de catálogo que haya en este equipo.
  const cliAgents = getConfig().agents.filter((a) => a.provider === 'cli' && a.cli)
  const catalog: SetupToolId[] = cliAgents.map((a) => `cli:${a.id}` as SetupToolId)
  // Python solo se mira si algún agente de catálogo lo necesita (Mistral Vibe, gptme…): sin él en la lista, el
  // asistente no lo enseñaba ni lo instalaba y esos agentes se quedaban en «Primero instala Python». No se mira
  // siempre porque, en un Mac sin herramientas de desarrollo, «python3» abre una ventana para instalarlas.
  const python: SetupToolId[] = cliAgents.some((a) => a.cli?.install?.needs === 'python') ? ['python'] : []
  return Promise.all(
    [...PLATFORM_TOOLS, ...python, ...catalog].map(async (id) => {
      const t = toolDef(id)!
      const p = await probe(id)
      const plan = t.install(ctx)
      return { id, label: t.label, installed: p.installed, version: p.version, canInstall: !!plan, needs: plan?.needs, url: t.url }
    })
  )
}

let installing: Promise<SetupInstallResult> | null = null

/** Instala un programa mostrando su salida en el asistente (una instalación a la vez). */
export async function installTool(id: SetupToolId): Promise<SetupInstallResult> {
  const def = toolDef(id)
  if (!def) throw new Error('Programa desconocido')
  if (installing) throw new Error('Ya hay una instalación en curso; espera a que termine')
  const run = async (): Promise<SetupInstallResult> => {
    const ctx = await context()
    const plan = def.install(ctx)
    if (!plan) return { ok: false, message: `${def.label} se instala desde su web` }
    if (plan.needs === 'node' && !ctx.node) return { ok: false, message: 'Primero instala Node.js' }
    if (plan.needs === 'python' && !(await probe('python')).installed) return { ok: false, message: 'Primero instala Python' }
    const log = (line: string) => emit({ kind: 'setup.log', toolId: id, line: line.slice(0, 400) })
    log(`$ ${plan.cmd}`)
    const r = await sh(plan.cmd, 25 * 60 * 1000, log)
    await refreshPath()
    const after = await probe(id)
    if (after.installed) {
      log(`✓ ${def.label} instalado${after.version ? ` (${after.version})` : ''}`)
      return { ok: true, message: `${def.label} instalado` }
    }
    const reason = r.code === 0 ? 'terminó, pero no aparece todavía (puede que haga falta reiniciar la app)' : `falló (código ${r.code ?? '—'})`
    log(`✗ La instalación ${reason}`)
    return { ok: false, message: `La instalación de ${def.label} ${reason}` }
  }
  installing = run()
  try {
    return await installing
  } finally {
    installing = null
  }
}

// ---------- Inicio de sesión ----------

/** Abre una terminal visible con la orden de inicio de sesión del CLI (el usuario la completa allí). */
export async function openLogin(id: SetupToolId): Promise<void> {
  const def = toolDef(id)
  const cmd = def?.login
  if (!def || !cmd) throw new Error('Este agente no necesita iniciar sesión')
  const title = `AI Cowork - ${def.label}`
  if (IS_WIN) {
    const child = spawn('cmd.exe', ['/d', '/c', `start "${title}" cmd /k ${cmd}`], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true
    })
    child.unref()
  } else if (IS_MAC) {
    const script = `tell application "Terminal" to do script "${cmd}"\ntell application "Terminal" to activate`
    const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' })
    child.unref()
  } else {
    // Linux: la terminal del escritorio ($TERMINAL, x-terminal-emulator, GNOME, KDE, Xfce…).
    const terminal = findTerminal()
    if (!terminal) throw new Error(`No se encontró ninguna terminal. Abre una y ejecuta: ${cmd}`)
    const child = spawn(terminal, terminalArgs(terminal, cmd), { detached: true, stdio: 'ignore' })
    child.on('error', () => undefined)
    child.unref()
  }
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function envFileHas(file: string, name: string): boolean {
  try {
    return new RegExp(`^\\s*(export\\s+)?${name}\\s*=\\s*\\S`, 'm').test(readFileSync(file, 'utf8'))
  } catch {
    return false
  }
}

async function geminiKeyConfigured(): Promise<boolean> {
  if (process.env.GEMINI_API_KEY) return true
  if (envFileHas(join(HOME, '.gemini', '.env'), 'GEMINI_API_KEY') || envFileHas(join(HOME, '.env'), 'GEMINI_API_KEY')) return true
  return IS_WIN ? !!(await regValue('HKCU\\Environment', 'GEMINI_API_KEY')) : false
}

/** ¿Tiene sesión iniciada? Sin llamadas de pago: cada CLI informa de su estado o se leen sus archivos. */
export async function checkAuth(id: SetupToolId): Promise<SetupAuth> {
  const canLogin = !!toolDef(id)?.login
  const res = (ok: boolean, detail: string): SetupAuth => ({ id, ok, detail, canLogin })
  if (id.startsWith('cli:')) {
    // Agente de catálogo: su orden de comprobación, si la tiene; si no, no se puede saber sin hacer una consulta.
    const spec = getConfig().agents.find((a) => a.id === id.slice(4))?.cli
    if (spec?.apiKey) {
      if (agentKey(id.slice(4))) return res(true, 'Clave de API guardada')
      if (process.env[spec.apiKey.env]) return res(true, `Usa la variable ${spec.apiKey.env} de este equipo`)
      // Sin clave, vale también la sesión de su programa si sabe decir que la tiene (Kiro: kiro-cli login).
      if (spec.authCheck) {
        const r = await sh(spec.authCheck, 30000)
        if (r.code === 0) return res(true, 'Sesión iniciada')
      }
      return res(false, `Falta la clave de API (${spec.apiKey.label})`)
    }
    if (spec?.authCheck) {
      const r = await sh(spec.authCheck, 30000)
      return r.code === 0 ? res(true, 'Sesión iniciada') : res(false, 'Sin sesión')
    }
    return res(true, 'No se puede comprobar de antemano: si pide iniciar sesión, ábrelo una vez en una terminal')
  }
  switch (id) {
    case 'claude': {
      const r = await sh('claude auth status --json', 20000)
      const m = r.out.match(/\{[\s\S]*\}/)
      try {
        const j = m ? (JSON.parse(m[0]) as { loggedIn?: boolean; email?: string; authMethod?: string }) : null
        if (j?.loggedIn) return res(true, j.email ? `Sesión iniciada: ${j.email}` : 'Sesión iniciada')
      } catch {
        // Salida inesperada: se trata como sin sesión.
      }
      return res(false, r.code === null || r.code === -1 ? 'Claude Code no responde' : 'Sin sesión')
    }
    case 'codex': {
      const r = await sh('codex login status', 20000)
      // Un config.toml con opciones antiguas o mal escritas impide arrancar a Codex: se muestra el motivo.
      const broken = r.out.match(/(Error loading configuration[^\n]*|invalid type[^\n]*)(\n[^\n]+)?/i)
      if (broken) return res(false, `Configuración de Codex con errores (~/.codex/config.toml): ${broken[0].replace(/\s+/g, ' ').trim()}`)
      return /logged in/i.test(r.out) && !/not logged in/i.test(r.out)
        ? res(true, r.out.trim().split(/\r?\n/).pop()?.replace(/^Logged in using/i, 'Sesión iniciada con') ?? 'Sesión iniciada')
        : res(false, 'Sin sesión')
    }
    case 'gemini': {
      const s = readJson(join(HOME, '.gemini', 'settings.json'))
      const security = (s?.security as { auth?: { selectedType?: string } } | undefined)?.auth?.selectedType
      const type = security ?? (typeof s?.selectedAuthType === 'string' ? s.selectedAuthType : undefined)
      if (type === 'oauth-personal' && existsSync(join(HOME, '.gemini', 'oauth_creds.json'))) return res(true, 'Sesión iniciada con Google')
      if (type === 'gemini-api-key' && (await geminiKeyConfigured())) return res(true, 'Usa una clave de API de Gemini')
      if (type === 'vertex-ai') return res(true, 'Usa Vertex AI')
      return res(false, 'Sin sesión')
    }
    case 'hermes': {
      const r = await sh('hermes status', 60000)
      const provider = r.out.match(/Provider:\s*(\S+)/i)?.[1]
      const model = r.out.match(/Model:\s*(\S+)/i)?.[1]
      if (provider && !/^(none|—|-|not)/i.test(provider)) return res(true, `Proveedor: ${provider}${model ? ` · ${model}` : ''}`)
      return res(false, r.code === 0 ? 'Sin proveedor de modelos configurado' : 'Hermes no responde')
    }
    case 'muse': {
      // Muse Code no tiene una orden de «estado de sesión»: se mira si ya se ha usado en este equipo (guarda
      // ahí su configuración y sus sesiones). Si la sesión caduca, la primera tarea lo detecta y lo dice.
      const used = [join(HOME, '.config', 'muse'), join(HOME, '.local', 'share', 'muse')].some((d) => existsSync(d))
      return used ? res(true, 'Muse Code ya se ha usado en este equipo') : res(false, 'Sin usar todavía: ábrelo para iniciar sesión')
    }
    default:
      return res(true, 'No necesita iniciar sesión')
  }
}

/** Guarda la clave de API de un agente de catálogo (cifrada, en este equipo) y comprueba su estado. */
export async function saveAgentKey(agentId: string, key: string): Promise<SetupAuth> {
  const agent = getConfig().agents.find((a) => a.id === agentId)
  if (!agent?.cli?.apiKey) throw new Error('Este agente no usa una clave de API')
  keys().set(agentId, typeof key === 'string' ? key : '')
  return checkAuth(`cli:${agentId}`)
}

/** Guarda la clave de API de Gemini donde la lee Gemini CLI y la selecciona como método de acceso. */
export async function saveGeminiKey(key: string): Promise<SetupAuth> {
  const clean = typeof key === 'string' ? key.trim() : ''
  if (!/^[\w-]{20,200}$/.test(clean)) throw new Error('Esa clave no parece válida')
  const dir = join(HOME, '.gemini')
  mkdirSync(dir, { recursive: true })
  const envFile = join(dir, '.env')
  let env = ''
  try {
    env = readFileSync(envFile, 'utf8')
  } catch {
    // Archivo nuevo.
  }
  const line = `GEMINI_API_KEY=${clean}`
  env = /^\s*(export\s+)?GEMINI_API_KEY\s*=.*$/m.test(env)
    ? env.replace(/^\s*(export\s+)?GEMINI_API_KEY\s*=.*$/m, line)
    : `${env}${env && !env.endsWith('\n') ? '\n' : ''}${line}\n`
  writeFileSync(envFile, env, { encoding: 'utf8', mode: 0o600 })
  const settingsFile = join(dir, 'settings.json')
  const settings = readJson(settingsFile) ?? {}
  const security = (settings.security && typeof settings.security === 'object' ? settings.security : {}) as Record<string, unknown>
  const auth = (security.auth && typeof security.auth === 'object' ? security.auth : {}) as Record<string, unknown>
  settings.security = { ...security, auth: { ...auth, selectedType: 'gemini-api-key' } }
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8')
  process.env.GEMINI_API_KEY = clean
  return checkAuth('gemini')
}
