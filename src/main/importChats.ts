import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import type { AgentConfig, ChatMessage, ProviderKind } from '@shared/types'
import { IMPORT_LABEL, type ImportFolder, type ImportKind, type ImportResult, type ImportScan, type ImportSession, type ImportSource } from '@shared/imports'
import { tr } from '@shared/i18n'
import { supportsResume, type AgentSession } from './agentSessions'
import { addImportedConversation, hasConversation } from './conversations'
import * as store from './projects'

/**
 * Importar conversaciones de otras apps, para no perder lo que el usuario ya tiene al pasarse a kywai:
 *
 * - **En este equipo** (el servidor): las sesiones de Claude Code (~/.claude/projects/<carpeta>/<id>.jsonl), de
 *   Codex (~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl) y de Hermes / Hermes Desktop (~/.hermes/state.db, solo leer). Cada carpeta donde se trabajó pasa a ser un proyecto de
 *   kywai con esa carpeta (o el que ya trabaja en ella) y cada sesión, una conversación retomable: lleva la sesión
 *   del programa, así que al seguirla el agente vuelve con `--resume` / `exec resume` a su sesión real.
 * - **Desde un archivo**: la exportación de ChatGPT (zip con conversations.json e imágenes) y la de Claude.ai (zip
 *   con conversations.json y projects.json). Sus proyectos pasan a proyectos de kywai con sus instrucciones y
 *   documentos; al seguir una conversación, el coordinador recibe lo hablado como contexto (como en cualquier chat).
 *
 * Los originales nunca se tocan. Lo importado se apunta en workspace/importados.json para no duplicarlo.
 */

// ---------- Registro de lo importado ----------

interface ImportIndex {
  /** «claude-code:<id>», «chatgpt:<id>»… → dónde quedó. */
  conversations: Record<string, { projectId: string; conversationId: string; at: number }>
  /** «chatgpt», «claude-ai», «claude-ai-project:<uuid>» → proyecto de kywai creado para ellos. */
  projects: Record<string, string>
}

let indexFile = ''
/** Carpeta personal donde buscar (las pruebas la cambian). */
let home = homedir()

export function initImports(workspaceRoot: string, homeDir = homedir()): void {
  indexFile = join(workspaceRoot, 'importados.json')
  home = homeDir
}

function loadIndex(): ImportIndex {
  try {
    if (indexFile && existsSync(indexFile)) {
      const raw = JSON.parse(readFileSync(indexFile, 'utf8')) as Partial<ImportIndex>
      return { conversations: raw.conversations ?? {}, projects: raw.projects ?? {} }
    }
  } catch {
    /* un registro roto no impide importar: como mucho se duplicaría algo */
  }
  return { conversations: {}, projects: {} }
}

function saveIndex(ix: ImportIndex): void {
  if (!indexFile) return
  writeFileSync(indexFile, JSON.stringify(ix, null, 1), 'utf8')
}

function alreadyImported(ix: ImportIndex, key: string): boolean {
  const hit = ix.conversations[key]
  return !!hit && hasConversation(hit.projectId, hit.conversationId)
}

// ---------- Lo que se saca de cada app ----------

/** Un turno de la conversación, ya sin lo interno de cada app. */
export interface Turn {
  role: 'user' | 'assistant'
  text: string
  at: number
  /** Herramientas que usó el asistente en este turno (nombre → veces). */
  tools?: Record<string, number>
  /** Imágenes que adjuntó el usuario (ChatGPT): ids de archivo de la exportación. */
  images?: string[]
}

export interface ParsedConversation {
  /** Id en la app de origen (sesión, hilo o conversación). */
  sourceId: string
  title: string
  createdAt: number
  updatedAt: number
  /** Carpeta donde se trabajó (Claude Code, Codex). */
  cwd?: string
  /** Proyecto de la app de origen (Claude.ai). */
  sourceProject?: string
  turns: Turn[]
}

const TEXT_MAX = 40_000
const TITLE_MAX = 80

const time = (v: unknown, fallback: number): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? Math.round(v * 1000) : Math.round(v)
  if (typeof v === 'string') {
    const n = Date.parse(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Quita lo que la app mete en el mensaje del usuario y no escribió él (recordatorios del sistema, contexto). */
function cleanUserText(text: string): string {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/g, '')
    .trim()
}

/** Mensajes del usuario que en realidad son de la app (órdenes «/…», salida de órdenes locales, avisos). */
function isNoiseUserText(text: string): boolean {
  const t = text.trimStart()
  return (
    !t ||
    t.startsWith('<command-name>') ||
    t.startsWith('<command-message>') ||
    t.startsWith('<local-command-stdout>') ||
    t.startsWith('<local-command-stderr>') ||
    t.startsWith('<user_instructions>') ||
    t.startsWith('<environment_context>') ||
    t.startsWith('<permissions') ||
    t.startsWith('# AGENTS.md instructions') ||
    t.startsWith('Caveat: The messages below were generated') ||
    t.startsWith('[Request interrupted')
  )
}

/** Junta los mensajes seguidos del asistente (una respuesta con varias herramientas) en un solo turno. */
function pushTurn(turns: Turn[], t: Turn): void {
  const last = turns[turns.length - 1]
  if (t.role === 'assistant' && last?.role === 'assistant') {
    if (t.text) last.text = last.text ? `${last.text}\n\n${t.text}` : t.text
    for (const [k, n] of Object.entries(t.tools ?? {})) (last.tools ??= {})[k] = (last.tools[k] ?? 0) + n
    return
  }
  if (t.role === 'assistant' && !t.text && !t.tools) return
  if (t.role === 'user' && !t.text && !t.images?.length) return
  turns.push(t)
}

function parseLines(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const o = JSON.parse(line) as unknown
      if (o && typeof o === 'object' && !Array.isArray(o)) out.push(o as Record<string, unknown>)
    } catch {
      /* la última línea puede estar a medio escribir (sesión abierta): se salta */
    }
  }
  return out
}

function firstUserTitle(turns: Turn[]): string {
  const first = turns.find((t) => t.role === 'user' && t.text)?.text ?? ''
  const one = first.replace(/[#*_`>[\]]/g, '').replace(/\s+/g, ' ').trim()
  if (one.length <= TITLE_MAX) return one
  const cut = one.slice(0, TITLE_MAX)
  const space = cut.lastIndexOf(' ')
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`
}

/** Una sesión de Claude Code (un .jsonl): mensajes del usuario y respuestas, sin herramientas ni sub-agentes. */
export function parseClaudeCode(text: string, sessionId: string, fallbackAt = Date.now()): ParsedConversation {
  const turns: Turn[] = []
  let cwd = ''
  let summary = ''
  let first = 0
  let last = 0
  for (const o of parseLines(text)) {
    if (o.type === 'summary' && !summary) summary = str(o.summary)
    if (o.type !== 'user' && o.type !== 'assistant') continue
    if (o.isSidechain === true || o.isMeta === true) continue
    if (!cwd && str(o.cwd)) cwd = str(o.cwd)
    const at = time(o.timestamp, fallbackAt)
    first ||= at
    last = Math.max(last, at)
    const msg = (o.message ?? {}) as { content?: unknown }
    const blocks: unknown[] = typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : Array.isArray(msg.content) ? msg.content : []
    if (o.type === 'user') {
      const texts = blocks
        .filter((b): b is { type: string; text: string } => !!b && typeof b === 'object' && (b as { type?: unknown }).type === 'text')
        .map((b) => cleanUserText(str(b.text)))
        .filter((t) => !isNoiseUserText(t))
      // Solo resultados de herramientas: no lo escribió el usuario.
      if (texts.length) pushTurn(turns, { role: 'user', text: texts.join('\n\n'), at })
      continue
    }
    const parts: string[] = []
    const tools: Record<string, number> = {}
    for (const b of blocks) {
      if (!b || typeof b !== 'object') continue
      const block = b as { type?: unknown; text?: unknown; name?: unknown }
      if (block.type === 'text' && str(block.text).trim()) parts.push(str(block.text).trim())
      else if (block.type === 'tool_use' && str(block.name)) tools[str(block.name)] = (tools[str(block.name)] ?? 0) + 1
    }
    pushTurn(turns, { role: 'assistant', text: parts.join('\n\n'), at, tools: Object.keys(tools).length ? tools : undefined })
  }
  return {
    sourceId: sessionId,
    title: summary.slice(0, TITLE_MAX) || firstUserTitle(turns),
    createdAt: first || fallbackAt,
    updatedAt: last || fallbackAt,
    cwd: cwd || undefined,
    turns
  }
}

/** Una sesión de Codex (rollout-*.jsonl), en el formato actual (session_meta + response_item) o el antiguo. */
export function parseCodex(text: string, fallbackAt = Date.now()): ParsedConversation {
  const turns: Turn[] = []
  let id = ''
  let cwd = ''
  let first = 0
  let last = 0
  for (const o of parseLines(text)) {
    const payload = (o.payload && typeof o.payload === 'object' ? o.payload : o) as Record<string, unknown>
    if (o.type === 'session_meta' || (!id && typeof o.id === 'string' && !o.type)) {
      id ||= str(payload.id)
      cwd ||= str(payload.cwd)
      first ||= time(payload.timestamp ?? o.timestamp, 0)
      continue
    }
    if (o.type === 'turn_context' && !cwd) cwd = str(payload.cwd)
    if (o.type && o.type !== 'response_item') continue
    const at = time(o.timestamp, last || first || fallbackAt)
    const kind = str(payload.type)
    if (kind === 'message') {
      const role = str(payload.role)
      if (role !== 'user' && role !== 'assistant') continue
      const content = Array.isArray(payload.content) ? payload.content : []
      const texts = content
        .map((c) => (c && typeof c === 'object' ? str((c as { text?: unknown }).text) : ''))
        .map((t) => {
          // Formato antiguo: la carpeta solo viene dentro del contexto del entorno.
          if (!cwd) cwd = /<cwd>([^<]+)<\/cwd>/.exec(t)?.[1]?.trim() ?? ''
          return role === 'user' ? cleanUserText(t) : t.trim()
        })
        .filter((t) => (role === 'user' ? !isNoiseUserText(t) : !!t))
      if (!texts.length) continue
      first ||= at
      last = Math.max(last, at)
      pushTurn(turns, { role, text: texts.join('\n\n'), at })
    } else if (kind === 'function_call' || kind === 'custom_tool_call' || kind === 'local_shell_call') {
      const name = kind === 'local_shell_call' ? 'shell' : str(payload.name) || 'tool'
      last = Math.max(last, at)
      pushTurn(turns, { role: 'assistant', text: '', at, tools: { [name]: 1 } })
    }
  }
  return {
    sourceId: id,
    title: firstUserTitle(turns),
    createdAt: first || fallbackAt,
    updatedAt: last || first || fallbackAt,
    cwd: cwd || undefined,
    turns
  }
}

interface GptNode {
  parent?: string | null
  message?: {
    author?: { role?: string }
    create_time?: number | null
    recipient?: string
    content?: { content_type?: string; parts?: unknown[]; text?: string }
    metadata?: { is_visually_hidden_from_conversation?: boolean }
  } | null
}

/** Exportación de ChatGPT (conversations.json): sigue la rama que se ve en la app (current_node → raíz). */
export function parseChatGpt(data: unknown): ParsedConversation[] {
  if (!Array.isArray(data)) return []
  const out: ParsedConversation[] = []
  for (const c of data as Record<string, unknown>[]) {
    if (!c || typeof c !== 'object' || !c.mapping || typeof c.mapping !== 'object') continue
    const mapping = c.mapping as Record<string, GptNode>
    const created = time(c.create_time, Date.now())
    const chain: GptNode[] = []
    const seen = new Set<string>()
    let node = str(c.current_node)
    if (!node || !mapping[node]) {
      // Sin rama actual: la hoja más reciente.
      node = Object.keys(mapping).filter((k) => !(mapping[k] as { children?: unknown[] }).children?.length).pop() ?? ''
    }
    while (node && mapping[node] && !seen.has(node)) {
      seen.add(node)
      chain.push(mapping[node])
      node = str(mapping[node].parent)
    }
    chain.reverse()
    const turns: Turn[] = []
    for (const n of chain) {
      const m = n.message
      if (!m) continue
      const role = m.author?.role
      if (role !== 'user' && role !== 'assistant') continue
      if (m.metadata?.is_visually_hidden_from_conversation) continue
      // Llamadas del asistente a sus herramientas (navegador, Python…): no son su respuesta.
      if (role === 'assistant' && m.recipient && m.recipient !== 'all') continue
      const type = m.content?.content_type
      if (type !== 'text' && type !== 'multimodal_text') continue
      const texts: string[] = []
      const images: string[] = []
      for (const p of m.content?.parts ?? []) {
        if (typeof p === 'string') {
          if (p.trim()) texts.push(p.trim())
        } else if (p && typeof p === 'object') {
          const ptr = str((p as { asset_pointer?: unknown }).asset_pointer)
          const fid = /^(file[-_][A-Za-z0-9]+)/.exec(ptr.split('://').pop() ?? '')?.[1]
          if (fid) images.push(fid)
        }
      }
      pushTurn(turns, { role, text: texts.join('\n\n'), at: time(m.create_time, created), images: images.length ? images : undefined })
    }
    if (!turns.length) continue
    out.push({
      sourceId: str(c.id) || str(c.conversation_id) || `${created}`,
      title: str(c.title).slice(0, TITLE_MAX) || firstUserTitle(turns),
      createdAt: created,
      updatedAt: time(c.update_time, turns[turns.length - 1].at),
      turns
    })
  }
  return out
}

export interface ClaudeAiProject {
  uuid: string
  name: string
  instructions: string
  docs: { name: string; content: string }[]
}

/** Exportación de Claude.ai: conversations.json (chat_messages) y projects.json (instrucciones y documentos). */
export function parseClaudeAi(conversations: unknown, projects?: unknown): { conversations: ParsedConversation[]; projects: ClaudeAiProject[] } {
  const convs: ParsedConversation[] = []
  for (const c of Array.isArray(conversations) ? (conversations as Record<string, unknown>[]) : []) {
    if (!c || typeof c !== 'object' || !Array.isArray(c.chat_messages)) continue
    const created = time(c.created_at, Date.now())
    const turns: Turn[] = []
    for (const m of c.chat_messages as Record<string, unknown>[]) {
      const role = m.sender === 'human' ? 'user' : m.sender === 'assistant' ? 'assistant' : null
      if (!role) continue
      const blocks = Array.isArray(m.content) ? (m.content as Record<string, unknown>[]) : []
      const fromBlocks = blocks.filter((b) => b?.type === 'text').map((b) => str(b.text).trim()).filter(Boolean).join('\n\n')
      let text = fromBlocks || str(m.text).trim()
      const tools: Record<string, number> = {}
      for (const b of blocks) if (b?.type === 'tool_use' && str(b.name)) tools[str(b.name)] = (tools[str(b.name)] ?? 0) + 1
      const files = [...(Array.isArray(m.attachments) ? m.attachments : []), ...(Array.isArray(m.files) ? m.files : [])]
        .map((f) => str((f as { file_name?: unknown }).file_name))
        .filter(Boolean)
      if (files.length) text = `${text}${text ? '\n\n' : ''}${files.map((f) => `📎 ${f}`).join('\n')}`
      pushTurn(turns, { role, text, at: time(m.created_at, created), tools: Object.keys(tools).length ? tools : undefined })
    }
    if (!turns.length) continue
    const project = c.project && typeof c.project === 'object' ? str((c.project as { uuid?: unknown }).uuid) : ''
    convs.push({
      sourceId: str(c.uuid) || `${created}`,
      title: str(c.name).slice(0, TITLE_MAX) || firstUserTitle(turns),
      createdAt: created,
      updatedAt: time(c.updated_at, turns[turns.length - 1].at),
      sourceProject: str(c.project_uuid) || project || undefined,
      turns
    })
  }
  const projs: ClaudeAiProject[] = []
  for (const p of Array.isArray(projects) ? (projects as Record<string, unknown>[]) : []) {
    if (!p || typeof p !== 'object' || !str(p.uuid) || p.is_starter_project === true) continue
    const docs = (Array.isArray(p.docs) ? (p.docs as Record<string, unknown>[]) : [])
      .map((d) => ({ name: str(d.filename) || 'documento.md', content: str(d.content) }))
      .filter((d) => d.content)
    const instructions = [str(p.prompt_template).trim(), str(p.description).trim() && !str(p.prompt_template).trim() ? str(p.description).trim() : '']
      .filter(Boolean)
      .join('\n\n')
    projs.push({ uuid: str(p.uuid), name: str(p.name).trim() || 'Proyecto de Claude.ai', instructions, docs })
  }
  return { conversations: convs, projects: projs }
}

// ---------- Leer un zip sin cargarlo entero (las exportaciones de ChatGPT pasan de 1 GB con imágenes) ----------

interface ZipEntry {
  name: string
  method: number
  compressed: number
  size: number
  offset: number
}

export class ZipReader {
  private fd: number
  readonly entries: ZipEntry[] = []

  constructor(path: string) {
    this.fd = openSync(path, 'r')
    try {
      this.readDirectory(statSync(path).size)
    } catch (e) {
      this.close()
      throw e
    }
  }

  private read(pos: number, len: number): Buffer {
    const buf = Buffer.alloc(len)
    let done = 0
    while (done < len) {
      const n = readSync(this.fd, buf, done, len - done, pos + done)
      if (n <= 0) break
      done += n
    }
    return buf.subarray(0, done)
  }

  private readDirectory(fileSize: number): void {
    const tailLen = Math.min(fileSize, 66_000)
    const tail = this.read(fileSize - tailLen, tailLen)
    let eocd = -1
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i
        break
      }
    }
    if (eocd < 0) throw new Error(tr('No es un archivo zip válido'))
    let count = tail.readUInt16LE(eocd + 10)
    let dirSize = tail.readUInt32LE(eocd + 12)
    let dirOffset = tail.readUInt32LE(eocd + 16)
    // Zip64: el directorio está apuntado desde el localizador que va justo antes.
    if ((count === 0xffff || dirOffset === 0xffffffff) && eocd >= 20 && tail.readUInt32LE(eocd - 20) === 0x07064b50) {
      const rec = this.read(Number(tail.readBigUInt64LE(eocd - 12)), 56)
      if (rec.readUInt32LE(0) === 0x06064b50) {
        count = Number(rec.readBigUInt64LE(32))
        dirSize = Number(rec.readBigUInt64LE(40))
        dirOffset = Number(rec.readBigUInt64LE(48))
      }
    }
    const dir = this.read(dirOffset, dirSize)
    let p = 0
    for (let i = 0; i < count && p + 46 <= dir.length; i++) {
      if (dir.readUInt32LE(p) !== 0x02014b50) break
      const method = dir.readUInt16LE(p + 10)
      let compressed = dir.readUInt32LE(p + 20)
      let size = dir.readUInt32LE(p + 24)
      const nameLen = dir.readUInt16LE(p + 28)
      const extraLen = dir.readUInt16LE(p + 30)
      const commentLen = dir.readUInt16LE(p + 32)
      let offset = dir.readUInt32LE(p + 42)
      const name = dir.subarray(p + 46, p + 46 + nameLen).toString('utf8')
      let e = p + 46 + nameLen
      const end = e + extraLen
      while (e + 4 <= end) {
        const id = dir.readUInt16LE(e)
        const len = dir.readUInt16LE(e + 2)
        if (id === 0x0001) {
          let q = e + 4
          if (size === 0xffffffff) (size = Number(dir.readBigUInt64LE(q)), (q += 8))
          if (compressed === 0xffffffff) (compressed = Number(dir.readBigUInt64LE(q)), (q += 8))
          if (offset === 0xffffffff) offset = Number(dir.readBigUInt64LE(q))
        }
        e += 4 + len
      }
      if (!name.endsWith('/')) this.entries.push({ name, method, compressed, size, offset })
      p = end + commentLen
    }
  }

  find(test: (name: string) => boolean): ZipEntry | undefined {
    return this.entries.find((e) => test(e.name))
  }

  data(entry: ZipEntry): Buffer {
    const head = this.read(entry.offset, 30)
    if (head.readUInt32LE(0) !== 0x04034b50) throw new Error(tr('No es un archivo zip válido'))
    const start = entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28)
    const raw = this.read(start, entry.compressed)
    if (entry.method === 0) return raw
    if (entry.method === 8) return inflateRawSync(raw)
    throw new Error(tr('El zip usa una compresión que kywai no sabe leer'))
  }

  close(): void {
    try {
      closeSync(this.fd)
    } catch {
      /* ya cerrado */
    }
  }
}

// ---------- Buscar en este equipo ----------

interface LocalFile {
  kind: 'claude-code' | 'codex' | 'hermes'
  /** El .jsonl de la sesión (Claude Code, Codex) o la base state.db (Hermes). */
  file: string
  mtime: number
  /** Hermes: las sesiones de la base que forman esta conversación (la primera y sus continuaciones al compactar). */
  sessionIds?: string[]
}

/** Ids de sesión → archivo, de la última búsqueda (importar no vuelve a recorrer el disco entero). */
const lastScan = new Map<string, LocalFile>()

const HEAD_BYTES = 256 * 1024

function readHead(file: string, bytes = HEAD_BYTES): string {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const n = readSync(fd, buf, 0, bytes, 0)
    return buf.subarray(0, n).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

function claudeRoot(): string {
  const env = process.env.CLAUDE_CONFIG_DIR
  return join(env && env.trim() ? env : join(home, '.claude'), 'projects')
}

function codexRoot(): string {
  const env = process.env.CODEX_HOME
  return join(env && env.trim() ? env : join(home, '.codex'), 'sessions')
}

function listClaudeFiles(): LocalFile[] {
  const root = claudeRoot()
  const out: LocalFile[] = []
  let dirs: string[] = []
  try {
    dirs = readdirSync(root)
  } catch {
    return out
  }
  for (const d of dirs) {
    let names: string[] = []
    try {
      names = readdirSync(join(root, d))
    } catch {
      continue
    }
    for (const n of names) {
      // agent-*.jsonl son sub-agentes: van dentro de la sesión que los lanzó.
      if (!n.endsWith('.jsonl') || n.startsWith('agent-')) continue
      const file = join(root, d, n)
      try {
        out.push({ kind: 'claude-code', file, mtime: statSync(file).mtimeMs })
      } catch {
        /* se borró mientras se miraba */
      }
    }
  }
  return out
}

function listCodexFiles(): LocalFile[] {
  const out: LocalFile[] = []
  const walk = (dir: string, depth: number): void => {
    let names: string[] = []
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const n of names) {
      const p = join(dir, n)
      if (n.endsWith('.jsonl') && n.startsWith('rollout-')) {
        try {
          out.push({ kind: 'codex', file: p, mtime: statSync(p).mtimeMs })
        } catch {
          /* se borró mientras se miraba */
        }
      } else if (depth < 4 && !n.includes('.')) {
        walk(p, depth + 1)
      }
    }
  }
  walk(codexRoot(), 0)
  return out
}

function parseLocal(f: LocalFile, text: string): ParsedConversation {
  return f.kind === 'claude-code' ? parseClaudeCode(text, basename(f.file, '.jsonl'), f.mtime) : parseCodex(text, f.mtime)
}

// ---------- Hermes (también Hermes Desktop: usan la misma base) ----------

interface SqliteDb {
  prepare(sql: string): { all(...params: unknown[]): unknown[] }
  close(): void
}

/** Abre una base SQLite solo para leer con el SQLite que trae Node (Electron 44 → Node 24), sin dependencias. */
function openSqlite(file: string): SqliteDb | null {
  const get = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule
  const mod = get?.('node:sqlite') as { DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => SqliteDb } | undefined
  if (!mod) return null
  return new mod.DatabaseSync(file, { readOnly: true })
}

/** Dónde guarda Hermes sus sesiones: $HERMES_HOME o ~/.hermes (en Windows, %LOCALAPPDATA%\hermes). */
function hermesRoots(): string[] {
  const env = process.env.HERMES_HOME
  if (env && env.trim()) return [env]
  const roots = [join(home, '.hermes')]
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) roots.push(join(process.env.LOCALAPPDATA, 'hermes'))
  return roots
}

/** state.db del perfil por defecto y de cada perfil (profiles/<nombre>/state.db). */
function hermesDbs(): { file: string; profile: string }[] {
  const out: { file: string; profile: string }[] = []
  for (const root of hermesRoots()) {
    if (existsSync(join(root, 'state.db'))) out.push({ file: join(root, 'state.db'), profile: '' })
    try {
      for (const name of readdirSync(join(root, 'profiles'))) {
        const file = join(root, 'profiles', name, 'state.db')
        if (existsSync(file)) out.push({ file, profile: name })
      }
    } catch {
      /* sin perfiles */
    }
  }
  return out
}

/**
 * Las conversaciones que kywai le encarga a Hermes (planificar, trabajar, verificar, responder) también acaban en su
 * base; ya están en los chats de kywai, así que no se importan. Sus encargos empiezan siempre así (orchestrator.ts).
 */
export const KYWAI_PROMPT_RE = /^Eres [^\n]{1,80}?(el coordinador|parte de un equipo de agentes)/

interface HermesSessionRow {
  id: string
  source: string
  title: string
  cwd: string
  started: number
  ended: number
  parent: string
  endReason: string
}

const cols = (db: SqliteDb, table: string): Set<string> => new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name))

/**
 * Las conversaciones de una base de Hermes. Al compactar una conversación larga, Hermes la sigue en una sesión
 * nueva con parent_session_id: se juntan en una sola. Las delegaciones (sub-agentes) no se siguen.
 */
export function readHermesDb(file: string, withMessages: boolean, only?: Set<string>): ParsedConversation[] {
  const db = openSqlite(file)
  if (!db) return []
  try {
    const sc = cols(db, 'sessions')
    const mc = cols(db, 'messages')
    const pick = (c: string, as = c): string => (sc.has(c) ? `${c} AS ${as}` : `NULL AS ${as}`)
    const rows = (db
      .prepare(`SELECT id, ${pick('source')}, ${pick('title')}, ${pick('cwd')}, ${pick('started_at', 'started')}, ${pick('ended_at', 'ended')}, ${pick('parent_session_id', 'parent')}, ${pick('end_reason', 'endReason')} FROM sessions`)
      .all() as Record<string, unknown>[]).map(
      (r): HermesSessionRow => ({
        id: str(r.id),
        source: str(r.source),
        title: str(r.title),
        cwd: str(r.cwd),
        started: time(r.started, 0),
        ended: time(r.ended, 0),
        parent: str(r.parent),
        endReason: str(r.endReason)
      })
    )
    const byId = new Map(rows.map((r) => [r.id, r]))
    // Solo se sigue la continuación de una sesión que acabó por compactarse.
    const continues = (r: HermesSessionRow): boolean => !!r.parent && byId.has(r.parent) && /compress|compact|split/i.test(byId.get(r.parent)!.endReason)
    const next = new Map<string, HermesSessionRow>()
    for (const r of rows) if (continues(r) && !next.has(r.parent)) next.set(r.parent, r)
    // El resumen que Hermes mete al compactar no es parte de la conversación.
    const active = mc.has('_compressed_summary') ? ' AND (_compressed_summary IS NULL OR _compressed_summary = 0)' : ''
    const hidden = new Set(sc.has('hidden') ? (db.prepare('SELECT id FROM sessions WHERE hidden = 1').all() as { id: string }[]).map((r) => r.id) : [])
    const internal = resolve(store.projectsRoot()) + sep
    const msgSql = `SELECT role, content, ${mc.has('tool_calls') ? 'tool_calls' : 'NULL AS tool_calls'}, timestamp FROM messages WHERE session_id = ?${active} ORDER BY timestamp, id`
    const firstSql = `SELECT content FROM messages WHERE session_id = ? AND role = 'user'${active} ORDER BY timestamp, id LIMIT 1`
    const out: ParsedConversation[] = []
    for (const root of rows) {
      if (continues(root)) continue
      if (only && !only.has(root.id)) continue
      // Ocultas en Hermes, o trabajo de kywai en la carpeta interna de uno de sus proyectos.
      if (hidden.has(root.id) || (root.cwd && resolve(root.cwd).startsWith(internal))) continue
      const chain = [root]
      while (next.has(chain[chain.length - 1].id) && chain.length < 200) chain.push(next.get(chain[chain.length - 1].id)!)
      const first = str((db.prepare(firstSql).all(root.id)[0] as { content?: unknown } | undefined)?.content)
      if (!first.trim() || KYWAI_PROMPT_RE.test(first.trimStart())) continue
      const turns: Turn[] = []
      if (withMessages) {
        for (const s of chain) {
          for (const m of db.prepare(msgSql).all(s.id) as Record<string, unknown>[]) {
            const at = time(m.timestamp, s.started)
            if (m.role === 'user') {
              pushTurn(turns, { role: 'user', text: cleanUserText(str(m.content)), at })
            } else if (m.role === 'assistant') {
              const tools: Record<string, number> = {}
              try {
                const calls = JSON.parse(str(m.tool_calls) || '[]') as { function?: { name?: unknown }; name?: unknown }[]
                for (const c of Array.isArray(calls) ? calls : []) {
                  const name = str(c?.function?.name) || str(c?.name)
                  if (name) tools[name] = (tools[name] ?? 0) + 1
                }
              } catch {
                /* llamadas ilegibles: solo se pierde el resumen */
              }
              pushTurn(turns, { role: 'assistant', text: str(m.content).trim(), at, tools: Object.keys(tools).length ? tools : undefined })
            }
          }
        }
      } else {
        turns.push({ role: 'user', text: first, at: root.started })
      }
      const last = chain[chain.length - 1]
      out.push({
        sourceId: root.id,
        title: root.title.slice(0, TITLE_MAX) || firstUserTitle(turns.length ? turns : [{ role: 'user', text: first, at: 0 }]),
        createdAt: root.started || Date.now(),
        updatedAt: Math.max(last.ended, last.started, turns[turns.length - 1]?.at ?? 0) || root.started || Date.now(),
        cwd: chain.map((s) => s.cwd).find(Boolean) || undefined,
        turns
      })
    }
    return out
  } finally {
    db.close()
  }
}

function listHermes(): { f: LocalFile; conv: ParsedConversation }[] {
  const out: { f: LocalFile; conv: ParsedConversation }[] = []
  for (const { file } of hermesDbs()) {
    let convs: ParsedConversation[] = []
    try {
      convs = readHermesDb(file, false)
    } catch (e) {
      console.warn('[cowork] no se pudo leer la base de Hermes', (e as Error).message)
      continue
    }
    for (const conv of convs) out.push({ f: { kind: 'hermes', file, mtime: conv.updatedAt, sessionIds: [conv.sourceId] }, conv })
  }
  return out
}

const sameDir = (a: string, b: string): boolean => {
  const norm = (p: string): string => resolve(p).replace(/[\\/]+$/, '')
  return process.platform === 'win32' || process.platform === 'darwin' ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b)
}

function projectForDir(cwd: string): { id: string; name: string } | undefined {
  const p = store.listProjects().find((x) => x.workDir && sameDir(x.workDir, cwd))
  return p ? { id: p.id, name: p.name } : undefined
}

/** Lo que hay en este equipo de Claude Code, Codex y Hermes, agrupado por carpeta (las más recientes primero). */
export function scanImports(): ImportScan {
  const ix = loadIndex()
  lastScan.clear()
  const sources: ImportSource[] = []
  const fromFiles = (files: LocalFile[]): { f: LocalFile; conv: ParsedConversation }[] =>
    files.flatMap((f) => {
      try {
        return [{ f, conv: parseLocal(f, readHead(f.file)) }]
      } catch {
        return []
      }
    })
  const hermesWhere = hermesRoots()[0] ?? join(home, '.hermes')
  for (const [kind, found, where] of [
    ['claude-code', fromFiles(listClaudeFiles()), claudeRoot()],
    ['codex', fromFiles(listCodexFiles()), codexRoot()],
    ['hermes', listHermes(), hermesWhere]
  ] as const) {
    const byDir = new Map<string, ImportFolder>()
    for (const { f, conv } of found) {
      // Sin nada que el usuario escribiera: una sesión vacía o solo de arranque. Hermes puede no tener carpeta.
      if (!conv.sourceId || (!conv.cwd && kind !== 'hermes') || !conv.turns.some((t) => t.role === 'user')) continue
      const id = `${kind}:${conv.sourceId}`
      lastScan.set(id, f)
      const dir = conv.cwd ?? ''
      let folder = byDir.get(dir)
      if (!folder) {
        const proj = dir ? projectForDir(dir) : undefined
        folder = {
          cwd: dir,
          name: dir ? basename(dir) || dir : tr('Sin carpeta'),
          exists: dir ? existsSync(dir) : true,
          projectId: proj?.id,
          projectName: proj?.name,
          sessions: []
        }
        byDir.set(dir, folder)
      }
      const s: ImportSession = { id, title: conv.title || tr('Sin título'), updatedAt: Math.max(f.mtime, conv.updatedAt), imported: alreadyImported(ix, id) }
      folder.sessions.push(s)
    }
    const folders = [...byDir.values()]
    for (const fo of folders) fo.sessions.sort((a, b) => b.updatedAt - a.updatedAt)
    folders.sort((a, b) => (b.sessions[0]?.updatedAt ?? 0) - (a.sessions[0]?.updatedAt ?? 0))
    sources.push({ kind, label: IMPORT_LABEL[kind], where, folders })
  }
  return { sources }
}

// ---------- Convertir a conversaciones de kywai ----------

/** El agente de kywai que hace de ese programa (el primero con ese proveedor), si lo hay. */
function agentFor(provider: ProviderKind, agents: AgentConfig[]): AgentConfig | undefined {
  return agents.find((a) => a.provider === provider && !a.isSubagent)
}

function toolLine(tools: Record<string, number> | undefined): string {
  const list = Object.entries(tools ?? {})
  if (!list.length) return ''
  return `_🔧 ${list.map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(' · ')}_`
}

function clip(text: string): string {
  return text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}\n\n…` : text
}

/**
 * Los turnos como mensajes del chat. Las respuestas llevan al agente de kywai de esa familia si existe (se ve su
 * robot); si no, el nombre de la app de origen.
 */
export function toMessages(conv: ParsedConversation, projectId: string, label: string, agentId: string | undefined, images?: Map<string, ChatMessage['attachments']>): ChatMessage[] {
  return conv.turns.map((t) => {
    const tools = t.role === 'assistant' ? toolLine(t.tools) : ''
    const text = clip([t.text, tools].filter(Boolean).join('\n\n'))
    const atts = (t.images ?? []).flatMap((id) => images?.get(id) ?? [])
    return {
      id: `m-${randomUUID()}`,
      projectId,
      author: t.role === 'user' ? { type: 'user' as const } : { type: 'agent' as const, agentId: agentId ?? label },
      text,
      createdAt: t.at,
      attachments: atts.length ? atts : undefined,
      importedFrom: t.role === 'assistant' && !agentId ? label : undefined
    }
  })
}

interface Ctx {
  ix: ImportIndex
  agents: AgentConfig[]
  result: ImportResult
}

function newResult(kind: ImportKind): ImportResult {
  return { kind, conversations: 0, skipped: 0, projectsCreated: 0, projectIds: [], documents: 0, resumable: 0 }
}

function noteProject(r: ImportResult, id: string): void {
  if (!r.projectIds.includes(id)) r.projectIds.push(id)
}

/** Un proyecto de kywai apuntado en el registro que sigue existiendo, o uno nuevo con ese nombre. */
function projectFor(ctx: Ctx, key: string, name: string): string {
  const known = ctx.ix.projects[key]
  if (known && store.listProjects().some((p) => p.id === known)) return known
  const p = store.createProject(name)
  ctx.ix.projects[key] = p.id
  ctx.result.projectsCreated++
  return p.id
}

/** Proyecto para una carpeta de trabajo: el que ya trabaja en ella o uno nuevo que trabaja en ella (si se puede). */
function projectForCwd(ctx: Ctx, cwd: string): string {
  const found = projectForDir(cwd)
  if (found) return found.id
  const id = projectFor(ctx, `dir:${cwd}`, basename(cwd) || cwd)
  if (!store.getProject(id).project.workDir && existsSync(cwd)) {
    try {
      store.setWorkDir(id, cwd)
    } catch {
      /* carpeta no permitida (la personal entera, la del sistema): el proyecto queda con su carpeta interna */
    }
  }
  return id
}

function importLocalOne(ctx: Ctx, key: string, f: LocalFile): void {
  if (alreadyImported(ctx.ix, key)) {
    ctx.result.skipped++
    return
  }
  const conv =
    f.kind === 'hermes'
      ? readHermesDb(f.file, true, new Set(f.sessionIds ?? []))[0]
      : parseLocal(f, readFileSync(f.file, 'utf8'))
  if (!conv || !conv.turns.length || (!conv.cwd && f.kind !== 'hermes')) return
  // Sin carpeta, o en la carpeta personal entera (kywai no da acceso a toda ella): a un proyecto con el nombre de la app.
  const projectId = conv.cwd && !sameDir(conv.cwd, home) ? projectForCwd(ctx, conv.cwd) : projectFor(ctx, f.kind, IMPORT_LABEL[f.kind])
  const provider: ProviderKind = f.kind === 'claude-code' ? 'claude' : f.kind === 'codex' ? 'codex' : 'hermes'
  const agent = agentFor(provider, ctx.agents)
  const label = IMPORT_LABEL[f.kind]
  // La sesión real solo se puede retomar desde su misma carpeta y con un agente de kywai de ese programa.
  const sessions: Record<string, AgentSession> = {}
  if (agent && conv.cwd && supportsResume(provider) && sameDir(store.workRoot(projectId), conv.cwd)) {
    sessions[agent.id] = { sessionId: conv.sourceId, provider, cwd: store.workRoot(projectId), taskTitle: conv.title, at: conv.updatedAt, imported: true }
    ctx.result.resumable++
  }
  const conversationId = addImportedConversation(projectId, {
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages: toMessages(conv, projectId, label, agent?.id),
    sessions,
    importedFrom: label
  })
  ctx.ix.conversations[key] = { projectId, conversationId, at: Date.now() }
  ctx.result.conversations++
  noteProject(ctx.result, projectId)
}

/** Importa las sesiones elegidas de «En este equipo». */
export function importLocal(ids: unknown, agents: AgentConfig[]): ImportResult {
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  if (!lastScan.size) scanImports()
  const first = list.map((id) => lastScan.get(id)).find(Boolean)
  const ctx: Ctx = { ix: loadIndex(), agents, result: newResult(first?.kind ?? 'claude-code') }
  try {
    for (const id of list) {
      const f = lastScan.get(id)
      if (!f) continue
      try {
        importLocalOne(ctx, id, f)
      } catch (e) {
        console.warn('[cowork] no se pudo importar', id, (e as Error).message)
      }
    }
  } finally {
    saveIndex(ctx.ix)
  }
  return ctx.result
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }

/** Copia a los adjuntos del proyecto las imágenes de una conversación de ChatGPT que vienen en el zip. */
function chatGptImages(zip: ZipReader | undefined, conv: ParsedConversation, projectId: string): Map<string, ChatMessage['attachments']> {
  const out = new Map<string, ChatMessage['attachments']>()
  if (!zip) return out
  const dir = join(store.projectDir(projectId), 'attachments')
  for (const id of conv.turns.flatMap((t) => t.images ?? [])) {
    if (out.has(id)) continue
    const entry = zip.find((n) => basename(n).startsWith(id) && !!MIME[extname(n).toLowerCase()])
    if (!entry || entry.size > 30 * 1024 * 1024) continue
    try {
      const name = store.sanitizeFileName(basename(entry.name))
      const fileName = `imp-${id}-${name}`.slice(0, 120)
      mkdirSync(dir, { recursive: true })
      const bytes = zip.data(entry)
      writeFileSync(join(dir, fileName), bytes)
      out.set(id, [{ id: `a-${randomUUID()}`, name, relPath: `attachments/${fileName}`, mime: MIME[extname(name).toLowerCase()] ?? 'image/png', size: bytes.length }])
    } catch {
      /* una imagen que no se lee no impide la conversación */
    }
  }
  return out
}

function importChatGpt(ctx: Ctx, convs: ParsedConversation[], zip?: ZipReader): void {
  let projectId = ''
  for (const conv of convs) {
    const key = `chatgpt:${conv.sourceId}`
    if (alreadyImported(ctx.ix, key)) {
      ctx.result.skipped++
      continue
    }
    projectId ||= projectFor(ctx, 'chatgpt', 'ChatGPT')
    const conversationId = addImportedConversation(projectId, {
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messages: toMessages(conv, projectId, IMPORT_LABEL.chatgpt, undefined, chatGptImages(zip, conv, projectId)),
      importedFrom: IMPORT_LABEL.chatgpt
    })
    ctx.ix.conversations[key] = { projectId, conversationId, at: Date.now() }
    ctx.result.conversations++
    noteProject(ctx.result, projectId)
  }
}

function importClaudeAi(ctx: Ctx, parsed: ReturnType<typeof parseClaudeAi>): void {
  const projectOf = new Map<string, string>()
  for (const p of parsed.projects) {
    const key = `claude-ai-project:${p.uuid}`
    const isNew = !ctx.ix.projects[key] || !store.listProjects().some((x) => x.id === ctx.ix.projects[key])
    const id = projectFor(ctx, key, p.name)
    projectOf.set(p.uuid, id)
    noteProject(ctx.result, id)
    if (!isNew) continue
    const st = store.getProject(id)
    if (p.instructions) st.instructions = p.instructions.slice(0, 20_000)
    const dir = join(st.project.dir, 'documentos')
    for (const d of p.docs) {
      try {
        mkdirSync(dir, { recursive: true })
        let name = store.sanitizeFileName(d.name)
        if (!extname(name)) name = `${name}.md`
        let n = 2
        while (existsSync(join(dir, name))) name = name.replace(/(-\d+)?(\.[^.]+)$/, `-${n++}$2`)
        writeFileSync(join(dir, name), d.content, 'utf8')
        store.upsertArtifact({ id: `art-${randomUUID()}`, projectId: id, name, relPath: `documentos/${name}`, kind: store.artifactKind(name), size: Buffer.byteLength(d.content), createdAt: Date.now() })
        ctx.result.documents++
      } catch {
        /* un documento que no se guarda no impide los demás */
      }
    }
    store.scheduleSave(id)
  }
  for (const conv of parsed.conversations) {
    const key = `claude-ai:${conv.sourceId}`
    if (alreadyImported(ctx.ix, key)) {
      ctx.result.skipped++
      continue
    }
    const projectId = (conv.sourceProject && projectOf.get(conv.sourceProject)) || projectFor(ctx, 'claude-ai', 'Claude.ai')
    const conversationId = addImportedConversation(projectId, {
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messages: toMessages(conv, projectId, IMPORT_LABEL['claude-ai'], undefined),
      importedFrom: IMPORT_LABEL['claude-ai']
    })
    ctx.ix.conversations[key] = { projectId, conversationId, at: Date.now() }
    ctx.result.conversations++
    noteProject(ctx.result, projectId)
  }
}

const isConvsJson = (n: string): boolean => n === 'conversations.json' || n.endsWith('/conversations.json')
const isProjectsJson = (n: string): boolean => n === 'projects.json' || n.endsWith('/projects.json')

function parseJson(buf: Buffer): unknown {
  try {
    return JSON.parse(buf.toString('utf8')) as unknown
  } catch {
    throw new Error(tr('El archivo conversations.json no se puede leer'))
  }
}

/** ChatGPT o Claude.ai, por la forma de sus conversaciones. */
function detect(data: unknown): 'chatgpt' | 'claude-ai' | null {
  if (!Array.isArray(data)) return null
  const first = data.find((c) => c && typeof c === 'object') as Record<string, unknown> | undefined
  if (!first) return Array.isArray(data) ? 'chatgpt' : null
  if ('mapping' in first) return 'chatgpt'
  if ('chat_messages' in first) return 'claude-ai'
  return null
}

/** Importa un archivo exportado de ChatGPT o Claude.ai: el zip tal cual o solo su conversations.json. */
export function importArchive(path: unknown, agents: AgentConfig[]): ImportResult {
  if (typeof path !== 'string' || !path.trim()) throw new Error(tr('Elige el archivo exportado'))
  const file = resolve(path)
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(tr('No se encuentra el archivo'))
  const ext = extname(file).toLowerCase()
  let zip: ZipReader | undefined
  let convData: unknown
  let projData: unknown
  try {
    if (ext === '.json') convData = parseJson(readFileSync(file))
    else zip = new ZipReader(file)
    if (zip) {
      const entry = zip.find(isConvsJson)
      if (!entry) throw new Error(tr('Ese zip no tiene conversations.json: elige la exportación de ChatGPT o de Claude.ai'))
      convData = parseJson(zip.data(entry))
      const pe = zip.find(isProjectsJson)
      if (pe) projData = parseJson(zip.data(pe))
    }
    const kind = detect(convData)
    if (!kind) throw new Error(tr('No reconozco ese archivo: elige la exportación de ChatGPT o de Claude.ai'))
    const ctx: Ctx = { ix: loadIndex(), agents, result: newResult(kind) }
    try {
      if (kind === 'chatgpt') importChatGpt(ctx, parseChatGpt(convData), zip)
      else importClaudeAi(ctx, parseClaudeAi(convData, projData))
    } finally {
      saveIndex(ctx.ix)
    }
    return ctx.result
  } finally {
    zip?.close()
    // Lo que se subió por la web para importarlo (ver /api/import-upload) ya no hace falta.
    const uploads = join(tmpdir(), 'kywai-importar') + sep
    if (file.startsWith(uploads)) rmSync(dirname(file), { recursive: true, force: true })
  }
}
