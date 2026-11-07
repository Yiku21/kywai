// Ficha automática del proyecto para el coordinador: qué hay en la carpeta (árbol resumido), de qué va (principio del
// README), con qué se construye y se prueba (package.json y otros manifiestos) y qué se tocó hace poco. La hace
// kywai leyendo el disco, sin llamar a ningún modelo: así quien planifica deja de hacerlo a ciegas aunque no
// pueda abrir archivos (Hermes en modo plan no tiene herramientas de archivos).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Carpetas que no aportan nada al plan (dependencias, compilados, datos de la app). */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'release', 'target', 'coverage', '.next', '.nuxt', '.cache',
  '.gradle', '.idea', '.vscode', '__pycache__', '.venv', 'venv', '.ai-cowork', 'workspace', 'attachments', '.DS_Store', '.Trash'
])
const MAX_ENTRIES = 150
const MAX_DEPTH = 3
const README_LINES = 40
const README_CHARS = 2500
const RECENT = 10
const RECENT_DAYS = 14
const CACHE_MS = 60_000

/** Manifiestos que dicen cómo se construye y se prueba (se cita su nombre y, en package.json, sus scripts). */
const MANIFESTS = ['package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'Gemfile', 'composer.json', 'CMakeLists.txt', 'Makefile', 'Dockerfile', 'docker-compose.yml']

export interface BriefOptions {
  /** Para las pruebas: «ahora». */
  now?: number
}

interface Entry {
  rel: string
  dir: boolean
  mtime: number
}

/** Árbol de la carpeta hasta MAX_DEPTH niveles y MAX_ENTRIES entradas, sin dependencias ni compilados. */
function walk(root: string): { entries: Entry[]; truncated: boolean } {
  const entries: Entry[] = []
  let truncated = false
  const visit = (dir: string, rel: string, depth: number): void => {
    if (entries.length >= MAX_ENTRIES) {
      truncated = true
      return
    }
    let names: string[]
    try {
      names = readdirSync(dir).sort((a, b) => a.localeCompare(b))
    } catch {
      return
    }
    for (const name of names) {
      if (name.startsWith('.') && name !== '.github') continue
      if (SKIP_DIRS.has(name)) continue
      if (entries.length >= MAX_ENTRIES) {
        truncated = true
        return
      }
      const abs = join(dir, name)
      let st
      try {
        st = statSync(abs)
      } catch {
        continue
      }
      const r = rel ? `${rel}/${name}` : name
      entries.push({ rel: r, dir: st.isDirectory(), mtime: st.mtimeMs })
      if (st.isDirectory() && depth < MAX_DEPTH) visit(abs, r, depth + 1)
    }
  }
  visit(root, '', 1)
  return { entries, truncated }
}

/** Scripts y dependencias de package.json (solo nombres: lo que hace falta para saber cómo se prueba y con qué se construye). */
function packageLines(root: string): string[] {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, unknown>
    const out: string[] = []
    const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? (pkg.scripts as Record<string, string>) : {}
    const names = Object.keys(scripts).slice(0, 20)
    if (names.length) out.push(`- package.json: scripts npm ${names.map((n) => `«${n}»`).join(', ')}${Object.keys(scripts).length > 20 ? ' …' : ''}`)
    const deps = Object.keys({ ...(pkg.dependencies as object | undefined), ...(pkg.devDependencies as object | undefined) }).slice(0, 30)
    if (deps.length) out.push(`- dependencias: ${deps.join(', ')}${deps.length === 30 ? ' …' : ''}`)
    return out
  } catch {
    return []
  }
}

/** Con qué se prueba, según lo que hay en la carpeta (para que el coordinador pida pruebas reales en "acceptance"). */
export function testCommand(root: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    if (pkg.scripts?.test && !/no test specified/.test(pkg.scripts.test)) return 'npm test'
    if (pkg.scripts?.typecheck) return 'npm run typecheck'
  } catch {
    /* sin package.json */
  }
  const has = (f: string): boolean => {
    try {
      statSync(join(root, f))
      return true
    } catch {
      return false
    }
  }
  if (has('pytest.ini') || has('pyproject.toml') || has('tests') || has('test')) return has('pyproject.toml') || has('pytest.ini') ? 'pytest' : null
  if (has('Cargo.toml')) return 'cargo test'
  if (has('go.mod')) return 'go test ./...'
  if (has('gradlew')) return './gradlew test'
  return null
}

const cache = new Map<string, { at: number; lines: string[] }>()

/**
 * Líneas de la sección «El proyecto» del prompt del coordinador. Se cachea un minuto por carpeta (se llama en cada
 * planificación y leer el disco no es gratis). `[]` si la carpeta no existe o está vacía.
 */
export function projectBrief(root: string, opts: BriefOptions = {}): string[] {
  const hit = cache.get(root)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.lines
  const lines = buildBrief(root, opts.now ?? Date.now())
  cache.set(root, { at: Date.now(), lines })
  return lines
}

/** Olvida la caché (las pruebas y el cambio de carpeta de un proyecto). */
export function forgetBrief(root?: string): void {
  if (root) cache.delete(root)
  else cache.clear()
}

function buildBrief(root: string, now: number): string[] {
  let entries: Entry[]
  let truncated: boolean
  try {
    ;({ entries, truncated } = walk(root))
  } catch {
    return []
  }
  if (!entries.length) return []
  const out: string[] = ['', '## El proyecto (ficha automática de la carpeta: léela antes de planificar)']

  // De qué va: el principio del README.
  const readme = entries.find((e) => !e.dir && /^readme(\.md|\.txt)?$/i.test(e.rel))
  if (readme) {
    try {
      const text = readFileSync(join(root, readme.rel), 'utf8').split(/\r?\n/).slice(0, README_LINES).join('\n').slice(0, README_CHARS).trim()
      if (text) out.push(`### Principio de ${readme.rel}`, text, '')
    } catch {
      /* sin README legible */
    }
  }

  // Con qué se construye y se prueba.
  const manifests = entries.filter((e) => !e.dir && MANIFESTS.includes(e.rel)).map((e) => e.rel)
  const pkg = packageLines(root)
  const test = testCommand(root)
  out.push('### Cómo se construye y se prueba')
  if (manifests.length) out.push(`- manifiestos: ${manifests.join(', ')}`)
  out.push(...pkg)
  out.push(test ? `- pruebas: «${test}» (pide en "acceptance" que pasen)` : '- pruebas: no se ha detectado ningún comando de pruebas (si la tarea crea código, pide que deje alguna)', '')

  // Qué se tocó hace poco (los agentes y el usuario trabajan ahí).
  const recent = entries
    .filter((e) => !e.dir && now - e.mtime < RECENT_DAYS * 86_400_000)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, RECENT)
  if (recent.length) out.push('### Archivos cambiados en los últimos días', ...recent.map((e) => `- ${e.rel}`), '')

  // El árbol.
  out.push(`### Carpetas y archivos${truncated ? ` (las ${MAX_ENTRIES} primeras entradas)` : ''}`)
  out.push(...entries.map((e) => `- ${e.rel}${e.dir ? '/' : ''}`))
  return out
}
