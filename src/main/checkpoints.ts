// Instantáneas de la carpeta de un proyecto, guardadas en un repositorio git propio de kywai (nunca en el .git
// del usuario, que no se toca). Sirven para tres cosas:
//  - ver qué cambió exactamente una tarea (diff entre la instantánea de antes y la de después),
//  - deshacer una tarea aunque después se hayan cambiado otros archivos (fusión a tres bandas, como git revert),
//  - trabajar en una copia aislada cuando otra tarea ya está usando la carpeta, e integrar al terminar.
// Funciona igual si la carpeta es un repositorio git o no: respeta sus .gitignore y añade las exclusiones de
// kywai (node_modules, compilados, datos internos…). Solo usa órdenes de git disponibles desde la 2.20 (la
// del Mac con las herramientas de Xcode es la 2.39): nada de merge-tree --write-tree.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, promises as fsp, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { devNull } from 'node:os'
import { dirname, join, sep } from 'node:path'

/** Archivos más grandes que esto no entran en la instantánea (vídeos, modelos, discos…): no se deshacen. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024
/** Si una carpeta tiene más archivos que esto, no se le hacen instantáneas (sería lento y ocuparía mucho). */
export const MAX_FILES = 40_000

/** Carpetas pesadas que una copia aislada enlaza a las de la carpeta original en vez de copiarlas. */
const SHARED_DIRS = ['node_modules', '.venv', 'venv', '.gradle']

const EXCLUDES = [
  '# AI Cowork: lo que nunca entra en las instantáneas',
  // Sin barra final: en una copia aislada son enlaces a las de la carpeta original, no carpetas.
  'node_modules',
  '.venv',
  'venv',
  '.gradle',
  '__pycache__/',
  '.next/',
  '.nuxt/',
  '.turbo/',
  '.cache/',
  'coverage/',
  'dist/',
  'build/',
  'out/',
  'target/',
  '.DS_Store',
  'Thumbs.db',
  '/project.json*',
  '/attachments/',
  '/avances/',
  '/historial/',
  '/.ai-cowork/*',
  '!/.ai-cowork/entregables/'
]

export interface ChangeFile {
  path: string
  /** A añadido, M modificado, D borrado. */
  status: 'A' | 'M' | 'D'
  add: number
  del: number
  binary?: boolean
}

export interface ChangeSet {
  files: ChangeFile[]
  /** Parche unificado (recortado a maxBytes). */
  patch: string
  truncated: boolean
}

export interface ApplyResult {
  /** Archivos escritos o borrados en la carpeta. */
  applied: string[]
  /** Archivos en los que los dos lados cambiaron lo mismo: no se tocaron (o llevan marcas de conflicto si se pidió). */
  conflicts: string[]
}

interface GitOpts {
  workTree?: string
  index?: string
  input?: string | Buffer
  cwd?: string
  /** Códigos de salida que no son error (por defecto solo 0). */
  ok?: number[]
}

interface GitOut {
  code: number
  stdout: Buffer
  stderr: string
}

let gitAvailable: boolean | null = null

/** ¿Hay git en este equipo? (sin git no hay instantáneas: todo lo demás sigue funcionando). */
export async function hasGit(): Promise<boolean> {
  if (gitAvailable != null) return gitAvailable
  try {
    const r = await raw(['--version'], process.cwd())
    gitAvailable = r.code === 0
  } catch {
    gitAvailable = false
  }
  return gitAvailable
}

function raw(args: string[], cwd: string, env?: NodeJS.ProcessEnv, input?: string | Buffer): Promise<GitOut> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, env: env ?? process.env, windowsHide: true })
    const out: Buffer[] = []
    let err = ''
    child.stdout.on('data', (d: Buffer) => out.push(d))
    child.stderr.on('data', (d: Buffer) => {
      if (err.length < 8000) err += d.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(out), stderr: err.trim() }))
    if (input != null) child.stdin.end(input)
    else child.stdin.end()
  })
}

/** Sha-1 de un blob de git para un contenido (para saber si un archivo sigue como lo dejó la instantánea). */
export function blobSha(content: Buffer): string {
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
}

const NULL_SHA = '0000000000000000000000000000000000000000'

/** Un repositorio de instantáneas (uno por proyecto). */
export class Shadow {
  constructor(readonly gitDir: string, private readonly extraExcludes: string[] = []) {}

  private env(o: GitOpts): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {}
    // Nada del entorno de git del usuario (GIT_DIR de un hook, índices…) debe colarse.
    for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v
    env.GIT_DIR = this.gitDir
    if (o.workTree) env.GIT_WORK_TREE = o.workTree
    if (o.index) env.GIT_INDEX_FILE = o.index
    env.GIT_CONFIG_NOSYSTEM = '1'
    env.GIT_CONFIG_GLOBAL = devNull
    env.GIT_TERMINAL_PROMPT = '0'
    env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = 'AI Cowork'
    env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = 'ai-cowork@localhost'
    return env
  }

  private async git(args: string[], o: GitOpts = {}): Promise<Buffer> {
    const base = ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'core.quotepath=off', '-c', 'core.longpaths=true', '-c', 'core.fsmonitor=false', '-c', 'core.precomposeunicode=true']
    const r = await raw([...base, ...args], o.cwd ?? o.workTree ?? this.gitDir, this.env(o), o.input)
    if (!(o.ok ?? [0]).includes(r.code)) throw new Error(`git ${args[0]}: ${r.stderr || `salida ${r.code}`}`)
    return r.stdout
  }

  private async text(args: string[], o: GitOpts = {}): Promise<string> {
    return (await this.git(args, o)).toString('utf8').trim()
  }

  /** Crea el repositorio la primera vez (y repone las exclusiones de kywai). */
  async init(): Promise<void> {
    if (!existsSync(join(this.gitDir, 'HEAD'))) {
      mkdirSync(this.gitDir, { recursive: true })
      await raw(['init', '--quiet', '--bare', this.gitDir], dirname(this.gitDir), this.env({}))
      await this.git(['config', 'core.bare', 'false'])
      await this.git(['config', 'gc.auto', '256'])
    }
    const info = join(this.gitDir, 'info')
    mkdirSync(info, { recursive: true })
    const want = [...EXCLUDES, ...this.extraExcludes].join('\n') + '\n'
    const file = join(info, 'exclude')
    let have = ''
    try {
      have = readFileSync(file, 'utf8')
    } catch {
      /* first time */
    }
    if (have !== want) writeFileSync(file, want)
  }

  private indexFor(key: string): string {
    return join(this.gitDir, `index-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`)
  }

  private refFor(key: string): string {
    return `refs/heads/${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  }

  /**
   * Instantánea de la carpeta: un commit con todos sus archivos (menos los excluidos y los enormes). Cada clave
   * («main», «copia-<tarea>») lleva su índice, para que las siguientes solo lean lo que cambió.
   */
  async snapshot(dir: string, key: string, label: string): Promise<string> {
    await this.init()
    const index = this.indexFor(key)
    const o = { workTree: dir, index, cwd: dir }
    const listed = (await this.git(['ls-files', '-z', '--others', '--modified', '--deleted', '--exclude-standard'], o)).toString('utf8')
    const paths = [...new Set(listed.split('\0').filter((p) => p && !p.endsWith('/')))]
    if (paths.length > MAX_FILES) throw new Error(`La carpeta tiene demasiados archivos (${paths.length}) para guardar instantáneas`)
    const keep: string[] = []
    for (const p of paths) {
      try {
        const s = await fsp.lstat(join(dir, p))
        if (s.isFile() && s.size > MAX_FILE_BYTES) continue
        if (!s.isFile() && !s.isSymbolicLink()) continue
      } catch {
        /* borrado: update-index --remove lo quita */
      }
      keep.push(p)
    }
    if (keep.length) await this.git(['update-index', '--add', '--remove', '-z', '--stdin'], { ...o, input: keep.join('\0') + '\0' })
    const tree = await this.text(['write-tree'], o)
    const ref = this.refFor(key)
    const parent = await this.text(['rev-parse', '--verify', '--quiet', ref], { ok: [0, 1] })
    if (parent) {
      const parentTree = await this.text(['rev-parse', `${parent}^{tree}`])
      if (parentTree === tree) return parent
    }
    const commit = await this.text(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', label.slice(0, 200) || 'instantánea'])
    await this.git(['update-ref', ref, commit])
    return commit
  }

  /** Guarda una referencia a un commit para que no se borre nunca (antes/después de cada tarea). */
  async keep(name: string, commit: string): Promise<void> {
    await this.git(['update-ref', `refs/cowork/${name.replace(/[^a-zA-Z0-9_/-]/g, '_')}`, commit])
  }

  /** Lo que cambió entre dos instantáneas: archivos con líneas +/− y el parche (recortado). */
  async changes(from: string, to: string, maxBytes = 400_000): Promise<ChangeSet> {
    const status = (await this.git(['diff-tree', '-r', '-z', '--no-renames', '--name-status', from, to])).toString('utf8').split('\0')
    const files = new Map<string, ChangeFile>()
    for (let i = 0; i + 1 < status.length; i += 2) {
      const st = status[i]
      const path = status[i + 1]
      if (!st || !path) continue
      files.set(path, { path, status: st === 'A' ? 'A' : st === 'D' ? 'D' : 'M', add: 0, del: 0 })
    }
    const nums = (await this.git(['diff-tree', '-r', '-z', '--no-renames', '--numstat', from, to])).toString('utf8').split('\0')
    for (const rec of nums) {
      const m = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(rec)
      if (!m) continue
      const f = files.get(m[3])
      if (!f) continue
      if (m[1] === '-') f.binary = true
      else {
        f.add = Number(m[1])
        f.del = Number(m[2])
      }
    }
    const full = await this.git(['diff-tree', '-p', '--no-renames', '--no-color', '--no-ext-diff', from, to])
    const truncated = full.length > maxBytes
    const patch = full.subarray(0, maxBytes).toString('utf8')
    return { files: [...files.values()], patch, truncated }
  }

  /**
   * Fusión a tres bandas en un índice aparte (sin tocar ninguna carpeta): aplica el cambio base→theirs sobre ours.
   * Devuelve el commit resultante y los archivos en conflicto. Con markers, los conflictos de texto llevan las
   * marcas <<<<<<< ======= >>>>>>> (para que un agente los resuelva); si no, se quedan como en ours.
   */
  async merge3(base: string, ours: string, theirs: string, markers: boolean): Promise<{ commit: string; conflicts: string[] }> {
    const index = join(this.gitDir, `index-merge-${process.pid}-${Date.now()}`)
    const o = { index }
    try {
      await this.git(['read-tree', '-m', '-i', '--aggressive', base, ours, theirs], o)
      const unmerged = (await this.git(['ls-files', '-u', '-z'], o)).toString('utf8').split('\0').filter(Boolean)
      const byPath = new Map<string, Map<number, { mode: string; sha: string }>>()
      for (const rec of unmerged) {
        const m = /^(\d+) ([0-9a-f]+) (\d)\t(.*)$/s.exec(rec)
        if (!m) continue
        const stages = byPath.get(m[4]) ?? new Map()
        stages.set(Number(m[3]), { mode: m[1], sha: m[2] })
        byPath.set(m[4], stages)
      }
      const conflicts: string[] = []
      const info: string[] = []
      for (const [path, st] of byPath) {
        const b = st.get(1)
        const us = st.get(2)
        const them = st.get(3)
        info.push(`0 ${NULL_SHA}\t${path}`)
        // Los dos lados cambiaron el mismo archivo de texto: git merge-file línea a línea.
        if (b && us && them && us.mode !== '120000' && them.mode !== '120000') {
          const merged = await this.mergeFile(b.sha, us.sha, them.sha)
          if (merged.clean || markers) {
            const sha = await this.text(['hash-object', '-w', '--stdin'], { input: merged.content })
            info.push(`${them.mode === us.mode ? us.mode : them.mode} ${sha} 0\t${path}`)
            if (!merged.clean) conflicts.push(path)
            continue
          }
          conflicts.push(path)
          info.push(`${us.mode} ${us.sha} 0\t${path}`)
          continue
        }
        // Añadido a la vez con distinto contenido, o cambiado en un lado y borrado en el otro.
        conflicts.push(path)
        const pick = markers ? (them ?? null) : (us ?? null)
        if (pick) info.push(`${pick.mode} ${pick.sha} 0\t${path}`)
      }
      if (info.length) await this.git(['update-index', '--index-info'], { ...o, input: info.join('\n') + '\n' })
      const tree = await this.text(['write-tree'], o)
      const commit = await this.text(['commit-tree', tree, '-p', ours, '-m', 'fusión'])
      return { commit, conflicts }
    } finally {
      rmSync(index, { force: true })
    }
  }

  private async mergeFile(base: string, ours: string, theirs: string): Promise<{ clean: boolean; content: Buffer }> {
    const tmp = join(this.gitDir, `merge-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmp, { recursive: true })
    try {
      const files = ['base', 'ours', 'theirs']
      const shas = [base, ours, theirs]
      for (let i = 0; i < 3; i++) writeFileSync(join(tmp, files[i]), await this.git(['cat-file', 'blob', shas[i]]))
      // Salida: número de conflictos (0 = limpio); negativo o > 127 = error.
      const r = await raw(['merge-file', '-p', '-L', 'actual', '-L', 'antes', '-L', 'tarea', join(tmp, 'ours'), join(tmp, 'base'), join(tmp, 'theirs')], tmp, this.env({}))
      if (r.code < 0 || r.code > 127) throw new Error(`git merge-file: ${r.stderr}`)
      return { clean: r.code === 0, content: r.stdout }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }

  /**
   * Lleva la carpeta del estado «from» (una instantánea suya recién hecha) al estado «to». Antes de escribir cada
   * archivo comprueba que sigue como en «from»: si alguien lo cambió entretanto, no lo toca y lo da como conflicto.
   */
  async materialize(dir: string, from: string, to: string): Promise<ApplyResult> {
    const rawOut = (await this.git(['diff-tree', '-r', '-z', '--no-renames', '--raw', from, to])).toString('utf8').split('\0')
    const applied: string[] = []
    const conflicts: string[] = []
    for (let i = 0; i + 1 < rawOut.length; i += 2) {
      const m = /^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) ([AMDT])/.exec(rawOut[i])
      const path = rawOut[i + 1]
      if (!m || !path) continue
      const [, , dstMode, srcSha, dstSha] = m
      if (dstMode === '160000' || m[1] === '160000') continue
      const abs = join(dir, ...path.split('/'))
      if (!abs.startsWith(dir.endsWith(sep) ? dir : dir + sep)) continue
      const current = await currentSha(abs)
      if (current !== (srcSha === NULL_SHA ? null : srcSha) || (await isDir(abs))) {
        conflicts.push(path)
        continue
      }
      try {
        if (dstSha === NULL_SHA) {
          await fsp.rm(abs, { force: true })
        } else {
          const content = await this.git(['cat-file', 'blob', dstSha])
          await fsp.mkdir(dirname(abs), { recursive: true })
          await fsp.rm(abs, { force: true })
          if (dstMode === '120000') await fsp.symlink(content.toString('utf8'), abs)
          else {
            await fsp.writeFile(abs, content)
            if (process.platform !== 'win32') await fsp.chmod(abs, dstMode === '100755' ? 0o755 : 0o644)
          }
        }
        applied.push(path)
      } catch {
        conflicts.push(path)
      }
    }
    return { applied, conflicts }
  }

  /**
   * Aplica a la carpeta el cambio base→theirs sobre lo que la carpeta tiene ahora (fusión a tres bandas). Con
   * strict, si algo choca no se aplica nada. Devuelve también la instantánea de la carpeta justo antes (current).
   */
  async apply(dir: string, key: string, base: string, theirs: string, opts: { strict: boolean; label: string }): Promise<ApplyResult & { current: string; result: string }> {
    const current = await this.snapshot(dir, key, `${opts.label} (antes)`)
    const merged = await this.merge3(base, current, theirs, !opts.strict)
    if (opts.strict && merged.conflicts.length) return { applied: [], conflicts: merged.conflicts, current, result: current }
    const done = await this.materialize(dir, current, merged.commit)
    const after = await this.snapshot(dir, key, opts.label)
    return { applied: done.applied, conflicts: [...new Set([...merged.conflicts, ...done.conflicts])], current, result: after }
  }

  /** Copia aislada de una instantánea en otra carpeta (con node_modules y similares enlazados a los de origen). */
  async makeCopy(commit: string, copyDir: string, sourceDir: string, key: string): Promise<void> {
    await this.init()
    rmSync(copyDir, { recursive: true, force: true })
    mkdirSync(copyDir, { recursive: true })
    const index = this.indexFor(key)
    rmSync(index, { force: true })
    const o = { workTree: copyDir, index, cwd: copyDir }
    await this.git(['read-tree', commit], o)
    await this.git(['checkout-index', '-a', '-f'], o)
    await this.git(['update-ref', this.refFor(key), commit])
    for (const name of SHARED_DIRS) {
      const src = join(sourceDir, name)
      if (!existsSync(src) || existsSync(join(copyDir, name))) continue
      try {
        await fsp.symlink(src, join(copyDir, name), process.platform === 'win32' ? 'junction' : 'dir')
      } catch {
        /* sin enlace: la tarea tendrá que instalar dependencias */
      }
    }
  }

  /** Borra la copia aislada y su índice (las instantáneas se quedan: el cambio se puede ver y deshacer). */
  removeCopy(copyDir: string, key: string): void {
    // Los enlaces a node_modules se quitan antes para que rm no entre en la carpeta original.
    for (const name of SHARED_DIRS) {
      const link = join(copyDir, name)
      try {
        if (lstatSync(link).isSymbolicLink()) unlinkSync(link)
      } catch {
        /* no estaba */
      }
    }
    rmSync(copyDir, { recursive: true, force: true })
    rmSync(this.indexFor(key), { force: true })
  }
}

async function isDir(abs: string): Promise<boolean> {
  try {
    return (await fsp.lstat(abs)).isDirectory()
  } catch {
    return false
  }
}

async function currentSha(abs: string): Promise<string | null> {
  try {
    const s = await fsp.lstat(abs)
    if (s.isSymbolicLink()) return blobSha(Buffer.from(await fsp.readlink(abs), 'utf8'))
    if (!s.isFile()) return null
    return blobSha(await fsp.readFile(abs))
  } catch {
    return null
  }
}
