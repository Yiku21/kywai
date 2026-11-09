// Traer la configuración de Hermes / Hermes Desktop a kywai (⚙ → «Importar de otras apps…» → Hermes): sus skills
// propias pasan a las «habilidades» de kywai (las ven todos los agentes), lo que Hermes sabe del usuario (memories/
// MEMORY.md, USER.md y SOUL.md) queda en una habilidad «lo-que-sabe-hermes», y sus servidores MCP pasan a Extensiones
// (apagados, con sus claves guardadas como las demás). Lo de Hermes no se toca.
//
// En un PC cliente, el PC lo lee (readHermesSetup) y lo sube como «kywai-hermes-setup» al servidor, que lo aplica
// (applyHermesSetup). Los MCP de otro sistema (rutas de Windows en un Mac) no se traen: no arrancarían.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { McpServerInput } from '@shared/extensions'
import { MCP_ID_RE } from '@shared/extensions'
import type { HermesSetupChoice, HermesSetupResult, HermesSetupScan } from '@shared/imports'
import { tr } from '@shared/i18n'
import { hermesHome } from './hermesModels'
import { listSkills } from './skills'

export const SETUP_FORMAT = 'kywai-hermes-setup'
/** La habilidad donde queda lo que Hermes sabe del usuario. */
export const MEMORY_SKILL = 'lo-que-sabe-hermes'
const MEMORY_FILES = ['MEMORY.md', 'USER.md', 'SOUL.md'] as const
const MAX_SKILL_FILES = 40
const MAX_FILE_BYTES = 512 * 1024
const MAX_SKILL_BYTES = 4 * 1024 * 1024

export interface HermesSetupBundle {
  format: typeof SETUP_FORMAT
  v: 1
  device: string
  /** Sistema donde se leyó (win32, darwin, linux): un MCP de otro sistema no arranca aquí. */
  os: string
  skills: { name: string; files: Record<string, string> }[]
  memory: Partial<Record<(typeof MEMORY_FILES)[number], string>>
  mcp: McpServerInput[]
}

// ---------- Un YAML pequeño (lo que escribe Hermes en config.yaml) ----------

type Yaml = string | number | boolean | null | Yaml[] | { [k: string]: Yaml }

function scalar(v: string): Yaml {
  const t = v.trim()
  if (!t) return null
  if (t.startsWith('"')) {
    try {
      return JSON.parse(t) as string
    } catch {
      return t.slice(1, -1)
    }
  }
  if (t.startsWith("'")) return t.slice(1, t.endsWith("'") ? -1 : undefined).replace(/''/g, "'")
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      return JSON.parse(t) as Yaml
    } catch {
      if (t.startsWith('[')) return t.slice(1, -1).split(',').map((x) => scalar(x)).filter((x) => x !== null)
      return t
    }
  }
  const noComment = t.replace(/\s+#.*$/, '')
  if (/^(true|yes|on)$/i.test(noComment)) return true
  if (/^(false|no|off)$/i.test(noComment)) return false
  if (/^(null|~)$/i.test(noComment)) return null
  if (/^-?\d+(\.\d+)?$/.test(noComment)) return Number(noComment)
  return noComment
}

/** Lee mapas, listas y valores sencillos por sangría (sin anclas ni textos de varias líneas). */
export function parseYaml(text: string): { [k: string]: Yaml } {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trimStart().startsWith('#'))
    .map((l) => ({ indent: l.length - l.trimStart().length, text: l.trim() }))
  let i = 0
  const block = (indent: number): Yaml => {
    if (i < lines.length && lines[i].text.startsWith('- ') && lines[i].indent >= indent) {
      const list: Yaml[] = []
      const at = lines[i].indent
      while (i < lines.length && lines[i].indent === at && lines[i].text.startsWith('-')) {
        list.push(scalar(lines[i].text.replace(/^-\s*/, '')))
        i++
      }
      return list
    }
    const map: { [k: string]: Yaml } = {}
    const at = i < lines.length ? lines[i].indent : indent
    while (i < lines.length && lines[i].indent === at && lines[i].indent >= indent) {
      const m = /^("[^"]*"|'[^']*'|[^:]+?):(\s+(.*))?$/.exec(lines[i].text)
      i++
      if (!m) continue
      const key = String(scalar(m[1]))
      const value = m[3] ?? ''
      if (value.trim()) map[key] = scalar(value)
      else if (i < lines.length && (lines[i].indent > at || (lines[i].indent === at && lines[i].text.startsWith('- ')))) map[key] = block(lines[i].indent)
      else map[key] = null
    }
    return map
  }
  const out = block(0)
  return out && typeof out === 'object' && !Array.isArray(out) ? out : {}
}

// ---------- Leer lo de Hermes ----------

const isObj = (v: unknown): v is Record<string, Yaml> => !!v && typeof v === 'object' && !Array.isArray(v)
const strMap = (v: unknown): Record<string, string> =>
  isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && typeof x !== 'object').map(([k, x]) => [k, String(x)])) : {}

/** Las variables de ~/.hermes/.env (para las «${VAR}» de su config.yaml). */
function readEnvFile(home: string): Record<string, string> {
  try {
    const out: Record<string, string> = {}
    for (const line of readFileSync(join(home, '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    }
    return out
  } catch {
    return {}
  }
}

const fillVars = (v: string, env: Record<string, string>): string => v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (all, name: string) => env[name] ?? process.env[name] ?? all)

/** Los servidores MCP de config.yaml como servidores de kywai (con las «${VAR}» ya cambiadas por su valor). */
export function hermesMcpServers(home = hermesHome()): McpServerInput[] {
  let cfg: Record<string, Yaml>
  try {
    cfg = parseYaml(readFileSync(join(home, 'config.yaml'), 'utf8'))
  } catch {
    return []
  }
  const servers = cfg.mcp_servers
  if (!isObj(servers)) return []
  const env = readEnvFile(home)
  const out: McpServerInput[] = []
  for (const [name, raw] of Object.entries(servers)) {
    if (!isObj(raw) || raw.enabled === false) continue
    const id = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+/, '').slice(0, 31)
    if (!MCP_ID_RE.test(id)) continue
    const fill = (m: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, fillVars(v, env)]))
    if (typeof raw.url === 'string' && raw.url) {
      out.push({ id, title: name, transport: 'http', url: fillVars(raw.url, env), headers: fill(strMap(raw.headers)) })
    } else if (typeof raw.command === 'string' && raw.command) {
      const args = Array.isArray(raw.args) ? raw.args.filter((a) => a !== null && typeof a !== 'object').map((a) => fillVars(String(a), env)) : []
      out.push({ id, title: name, transport: 'stdio', command: fillVars(raw.command, env), args, env: fill(strMap(raw.env)) })
    }
  }
  return out
}

/** Los nombres de las skills que trae Hermes de serie (las de su instalación), para no copiar esas. */
function bundledSkillNames(home: string): Set<string> {
  const out = new Set<string>()
  const walk = (dir: string, depth: number): void => {
    let names: string[] = []
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const n of names) {
      const p = join(dir, n)
      if (n === 'SKILL.md') out.add(dirname(p).split(sep).pop()!)
      else if (depth < 4 && !n.startsWith('.') && !n.includes('.')) walk(p, depth + 1)
    }
  }
  for (const d of ['skills', 'optional-skills']) walk(join(home, 'hermes-agent', d), 0)
  return out
}

interface FoundSkill {
  name: string
  description: string
  dir: string
  own: boolean
}

/** Las skills de ~/.hermes/skills (sin las archivadas), marcando las propias (las que no trae Hermes de serie). */
function hermesSkills(home: string): FoundSkill[] {
  const root = join(home, 'skills')
  if (!existsSync(root)) return []
  const bundled = bundledSkillNames(home)
  // Van por categorías (skills/<categoría>/<skill>/SKILL.md), y alguna suelta arriba; las de «.archive» no.
  let cats: string[] = []
  try {
    cats = readdirSync(root).filter((n) => !n.startsWith('.') && statSync(join(root, n)).isDirectory())
  } catch {
    /* sin categorías */
  }
  return [root, ...cats.map((c) => join(root, c))]
    .flatMap((d) => listSkills(d))
    .filter((s) => !relative(root, s.file).split(sep).some((part) => part.startsWith('.')) && s.file.endsWith(`${sep}SKILL.md`))
    .map((s) => {
      const name = dirname(s.file).split(sep).pop()!
      return { name, description: s.description, dir: dirname(s.file), own: bundled.size > 0 && !bundled.has(name) }
    })
}

function memoryTexts(home: string): HermesSetupBundle['memory'] {
  const out: HermesSetupBundle['memory'] = {}
  for (const f of MEMORY_FILES) {
    const file = f === 'SOUL.md' ? join(home, f) : join(home, 'memories', f)
    try {
      const text = readFileSync(file, 'utf8').trim()
      if (text) out[f] = text.slice(0, 50_000)
    } catch {
      /* no está */
    }
  }
  return out
}

/** Lo que hay en la configuración de Hermes de este equipo, para elegir qué traer. */
export function scanHermesSetup(home = hermesHome(), have: { skills?: string[]; mcp?: string[] } = {}): HermesSetupScan {
  const found = existsSync(join(home, 'config.yaml')) || existsSync(join(home, 'skills'))
  const haveSkills = new Set((have.skills ?? []).map((n) => n.toLowerCase()))
  const haveMcp = new Set(have.mcp ?? [])
  const mem = memoryTexts(home)
  return {
    found,
    where: home,
    skills: hermesSkills(home)
      .map((s) => ({ name: s.name, description: s.description, own: s.own, imported: haveSkills.has(s.name.toLowerCase()) }))
      .sort((a, b) => Number(b.own) - Number(a.own) || a.name.localeCompare(b.name)),
    memory: MEMORY_FILES.filter((f) => mem[f]).map((f) => ({ name: f, chars: mem[f]!.length })),
    memoryImported: haveSkills.has(MEMORY_SKILL),
    mcp: hermesMcpServers(home).map((s) => ({
      id: s.id,
      transport: s.transport,
      summary: s.transport === 'http' ? s.url ?? '' : [s.command, ...(s.args ?? [])].join(' ').slice(0, 160),
      secrets: Object.keys(s.env ?? {}).length + Object.keys(s.headers ?? {}).length,
      imported: haveMcp.has(s.id)
    }))
  }
}

/** Lee lo elegido para llevarlo a kywai (aquí mismo o subiéndolo al servidor desde un cliente). */
export function readHermesSetup(choice: HermesSetupChoice, device: string, home = hermesHome()): HermesSetupBundle {
  const wanted = new Set(Array.isArray(choice?.skills) ? choice.skills : [])
  const skills: HermesSetupBundle['skills'] = []
  for (const s of hermesSkills(home)) {
    if (!wanted.has(s.name)) continue
    const files: Record<string, string> = {}
    let bytes = 0
    const walk = (dir: string, depth: number): void => {
      let names: string[] = []
      try {
        names = readdirSync(dir)
      } catch {
        return
      }
      for (const n of names) {
        if (Object.keys(files).length >= MAX_SKILL_FILES || n.startsWith('.') || n === '__pycache__' || n === 'node_modules') continue
        const p = join(dir, n)
        try {
          const st = statSync(p)
          if (st.isDirectory()) {
            if (depth < 4) walk(p, depth + 1)
          } else if (st.size <= MAX_FILE_BYTES && bytes + st.size <= MAX_SKILL_BYTES) {
            const buf = readFileSync(p)
            if (buf.includes(0)) continue // solo texto: los binarios no hacen falta para leer la habilidad
            files[relative(s.dir, p).split(sep).join('/')] = buf.toString('utf8')
            bytes += st.size
          }
        } catch {
          /* se borró mientras se miraba */
        }
      }
    }
    walk(s.dir, 0)
    if (files['SKILL.md']) skills.push({ name: s.name, files })
  }
  const wantedMcp = new Set(Array.isArray(choice?.mcp) ? choice.mcp : [])
  return {
    format: SETUP_FORMAT,
    v: 1,
    device: device.slice(0, 80),
    os: process.platform,
    skills,
    memory: choice?.memory ? memoryTexts(home) : {},
    mcp: hermesMcpServers(home).filter((s) => wantedMcp.has(s.id))
  }
}

/** Un nombre de carpeta seguro para la habilidad. */
const skillFolder = (name: string): string => name.replace(/[^\p{L}\p{N} ._-]/gu, '-').replace(/^[\s.]+/, '').slice(0, 64) || 'habilidad'

/** Une sin salirse de la carpeta (null si la ruta intenta salir). */
function inside(root: string, rel: string): string | null {
  const abs = resolve(root, rel)
  return abs.startsWith(resolve(root) + sep) ? abs : null
}

function memorySkill(device: string, memory: HermesSetupBundle['memory']): string {
  const parts = [
    '---',
    `name: ${MEMORY_SKILL}`,
    'description: Lo que Hermes aprendió del usuario (preferencias, proyectos, forma de trabajar) y su personalidad. Léela antes de una tarea en la que importen sus gustos o su contexto.',
    '---',
    '',
    `Copiado de la memoria de Hermes${device ? ` (${device})` : ''} al traer su configuración a kywai. La memoria del proyecto y lo que diga el usuario mandan sobre esto.`
  ]
  const label: Record<string, string> = { 'USER.md': 'Sobre el usuario', 'MEMORY.md': 'Lo que Hermes recordaba', 'SOUL.md': 'Personalidad de Hermes (SOUL.md)' }
  for (const f of ['USER.md', 'MEMORY.md', 'SOUL.md'] as const) {
    // Hermes separa cada recuerdo con «§».
    const text = memory[f]?.split(/\n?§\n?/).map((x) => x.trim()).filter(Boolean)
    if (text?.length) parts.push('', `## ${label[f]}`, '', ...text.map((x) => `- ${x.replace(/\n+/g, ' ')}`))
  }
  return parts.join('\n') + '\n'
}

/**
 * Aplica en este servidor lo traído de Hermes: las skills a la carpeta de habilidades (sin pisar una que ya exista),
 * la memoria a la habilidad «lo-que-sabe-hermes» (se reescribe) y los MCP a Extensiones, apagados.
 */
export function applyHermesSetup(raw: unknown, skillsDir: string, saveMcp: (s: McpServerInput) => void, existingMcp: string[]): HermesSetupResult {
  const b = raw as Partial<HermesSetupBundle>
  if (!b || b.format !== SETUP_FORMAT) throw new Error(tr('Ese archivo no es una configuración de Hermes'))
  if (!skillsDir) throw new Error(tr('Las habilidades no están disponibles'))
  const result: HermesSetupResult = { skills: [], memory: false, mcp: [], skipped: [] }
  const have = new Set(listSkills(skillsDir).map((s) => s.name.toLowerCase()))
  for (const s of Array.isArray(b.skills) ? b.skills : []) {
    if (!s || typeof s.name !== 'string' || !s.files || typeof s.files !== 'object' || typeof s.files['SKILL.md'] !== 'string') continue
    const name = skillFolder(s.name)
    const target = inside(skillsDir, name)
    if (!target) continue
    if (have.has(name.toLowerCase()) || existsSync(target)) {
      result.skipped.push(tr('«{name}»: ya había una habilidad con ese nombre', { name }))
      continue
    }
    let n = 0
    for (const [rel, text] of Object.entries(s.files)) {
      if (n >= MAX_SKILL_FILES || typeof text !== 'string' || text.length > MAX_FILE_BYTES) continue
      const abs = inside(target, rel)
      if (!abs) continue
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, text, 'utf8')
      n++
    }
    result.skills.push(name)
  }
  const memory = b.memory && typeof b.memory === 'object' ? (b.memory as HermesSetupBundle['memory']) : {}
  if (MEMORY_FILES.some((f) => typeof memory[f] === 'string' && memory[f]!.trim())) {
    const dir = join(skillsDir, MEMORY_SKILL)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), memorySkill(typeof b.device === 'string' ? b.device : '', memory), 'utf8')
    result.memory = true
  }
  const taken = new Set(existingMcp)
  for (const s of Array.isArray(b.mcp) ? b.mcp : []) {
    if (!s || typeof s.id !== 'string') continue
    if (s.transport !== 'http' && b.os && b.os !== process.platform) {
      result.skipped.push(tr('«{name}»: es un programa del otro equipo y aquí no arrancaría', { name: s.id }))
      continue
    }
    if (taken.has(s.id)) {
      result.skipped.push(tr('«{name}»: ya había un servidor con ese nombre', { name: s.id }))
      continue
    }
    try {
      saveMcp({ id: s.id, title: s.title || s.id, transport: s.transport === 'http' ? 'http' : 'stdio', command: s.command, args: s.args, url: s.url, env: s.env, headers: s.headers })
      taken.add(s.id)
      result.mcp.push(s.id)
    } catch (e) {
      result.skipped.push(`«${s.id}»: ${(e as Error).message}`)
    }
  }
  return result
}

/** Aplica lo subido por un cliente (/api/import-upload) y borra la subida. */
export function applyHermesSetupFile(path: unknown, skillsDir: string, saveMcp: (s: McpServerInput) => void, existingMcp: string[]): HermesSetupResult {
  if (typeof path !== 'string') throw new Error(tr('Elige el archivo exportado'))
  const uploads = join(tmpdir(), 'kywai-importar') + sep
  const file = resolve(path)
  if (!file.startsWith(uploads)) throw new Error(tr('Archivo no válido'))
  try {
    return applyHermesSetup(JSON.parse(readFileSync(file, 'utf8')) as unknown, skillsDir, saveMcp, existingMcp)
  } finally {
    rmSync(dirname(file), { recursive: true, force: true })
  }
}
