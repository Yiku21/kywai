import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import type { AgentConfig, ChatMessage, ProviderKind } from '@shared/types'
import { IMPORT_LABEL, type ArchiveConversation, type ArchivePreview, type ImportFolder, type ImportKind, type ImportResult, type ImportScan, type ImportSession, type ImportSource, type ProjectReason } from '@shared/imports'
import { tr } from '@shared/i18n'
import { supportsResume, type AgentSession } from './agentSessions'
import { addImportedConversation, conversationMessages, dropImportedConversation, hasConversation, listConversations, moveConversation } from './conversations'
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
  conversations: Record<string, { projectId: string; conversationId: string; at: number; v?: number }>
  /** «chatgpt», «claude-ai», «claude-ai-project:<uuid>» → proyecto de kywai creado para ellos. */
  projects: Record<string, string>
}

let indexFile = ''
/** Carpeta personal donde buscar (las pruebas la cambian). */
let home = homedir()
/** Carpeta de datos de kywai: lo que se trabajó dentro es de kywai (proyectos, entornos aislados), no del usuario. */
let workspace = ''

export function initImports(workspaceRoot: string, homeDir = homedir()): void {
  indexFile = join(workspaceRoot, 'importados.json')
  workspace = workspaceRoot
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
  /** Archivos del turno (Claude.ai): los adjuntos con su texto y lo que creó el asistente; sin contenido, solo el nombre. */
  files?: TurnFile[]
  /** Imágenes que pegó el usuario (Hermes Desktop): rutas en el equipo donde se leyó la conversación. */
  localImages?: string[]
  /** Las mismas imágenes ya leídas, cuando la conversación llega de otro equipo (un cliente de kywai). */
  inlineImages?: InlineImage[]
}

/** Una imagen que viaja dentro de la conversación (de un cliente al servidor), en base64. */
export interface InlineImage {
  name: string
  mime: string
  data: string
}

/** Un archivo de un mensaje importado. Sin `content` es que la exportación solo trae el nombre (imágenes, PDF subidos). */
export interface TurnFile {
  name: string
  content?: string
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
  /** Resumen que trae la app de origen (Claude.ai): ayuda a saber de qué proyecto era. */
  summary?: string
  turns: Turn[]
}

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
    if (t.files?.length) last.files = mergeFiles(last.files ?? [], t.files)
    return
  }
  if (t.role === 'assistant' && !t.text && !t.tools && !t.files?.length) return
  if (t.role === 'user' && !t.text && !t.images?.length && !t.files?.length) return
  turns.push(t)
}

/** Junta archivos sin repetir nombres: si uno viene con contenido y otro sin él, se queda el que lo tiene (el último). */
function mergeFiles(a: TurnFile[], b: TurnFile[]): TurnFile[] {
  const out = new Map<string, TurnFile>()
  for (const f of [...a, ...b]) {
    const name = f.name.trim()
    if (!name) continue
    // Uno sin contenido no pisa al que lo tiene; entre dos con contenido gana el último (la versión final).
    if (!out.has(name) || f.content !== undefined) out.set(name, { name, content: f.content })
  }
  return [...out.values()]
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

/** Padre de los primeros mensajes en la exportación de Claude.ai. */
const CLAUDE_ROOT = '00000000-0000-4000-8000-000000000000'

/**
 * Los mensajes de la rama que quedó: Claude.ai exporta también las respuestas regeneradas y los mensajes editados
 * (cuelgan del mismo padre). Se sigue hacia atrás desde el último mensaje escrito. Si los enlaces no cuadran, todos.
 */
function claudeBranch(msgs: Record<string, unknown>[]): Record<string, unknown>[] {
  if (msgs.length < 2 || !msgs.every((m) => str(m.uuid) && str(m.parent_message_uuid))) return msgs
  const byId = new Map(msgs.map((m) => [str(m.uuid), m]))
  let leaf = msgs[msgs.length - 1]
  for (const m of msgs) if (time(m.created_at, 0) >= time(leaf.created_at, 0)) leaf = m
  const chain: Record<string, unknown>[] = []
  const seen = new Set<string>()
  let cur: Record<string, unknown> | undefined = leaf
  while (cur && !seen.has(str(cur.uuid))) {
    seen.add(str(cur.uuid))
    chain.push(cur)
    const parent = str(cur.parent_message_uuid)
    if (parent === CLAUDE_ROOT) return chain.reverse()
    cur = byId.get(parent)
  }
  return msgs
}

/** Herramientas con las que el asistente de Claude.ai crea o cambia archivos (y las que los enseña al usuario). */
function claudeFileTool(b: Record<string, unknown>, made: Map<string, string>): string[] {
  const input = (b.input && typeof b.input === 'object' ? b.input : {}) as Record<string, unknown>
  const name = str(b.name)
  if (name === 'create_file' && str(input.path)) made.set(str(input.path), str(input.file_text))
  else if (name === 'Write' && str(input.file_path)) made.set(str(input.file_path), str(input.content))
  else if ((name === 'str_replace' || name === 'Edit') && made.has(str(input.path) || str(input.file_path))) {
    const path = str(input.path) || str(input.file_path)
    const before = made.get(path)!
    const old = str(input.old_str) || str(input.old_string)
    if (old && before.includes(old)) made.set(path, before.replace(old, str(input.new_str) || str(input.new_string)))
  } else if (name === 'present_files' && Array.isArray(input.filepaths)) {
    return (input.filepaths as unknown[]).map(str).filter(Boolean)
  }
  return []
}

/** El contenido de un archivo creado en la conversación, por su ruta o, si no, por su nombre. */
function madeFile(made: Map<string, string>, pathOrName: string): TurnFile {
  const name = basename(pathOrName.replace(/\\/g, '/'))
  if (made.has(pathOrName)) return { name, content: made.get(pathOrName) }
  let content: string | undefined
  for (const [p, c] of made) if (basename(p.replace(/\\/g, '/')) === name) content = c
  return { name, content }
}

/** Exportación de Claude.ai: conversations.json (chat_messages) y projects.json (instrucciones y documentos). */
export function parseClaudeAi(conversations: unknown, projects?: unknown): { conversations: ParsedConversation[]; projects: ClaudeAiProject[] } {
  const convs: ParsedConversation[] = []
  for (const c of Array.isArray(conversations) ? (conversations as Record<string, unknown>[]) : []) {
    if (!c || typeof c !== 'object' || !Array.isArray(c.chat_messages)) continue
    const created = time(c.created_at, Date.now())
    const turns: Turn[] = []
    /** Archivos que el asistente creó en esta conversación: ruta → contenido (con sus cambios). */
    const made = new Map<string, string>()
    for (const m of claudeBranch((c.chat_messages as Record<string, unknown>[]).filter((m) => m && typeof m === 'object'))) {
      const role = m.sender === 'human' ? 'user' : m.sender === 'assistant' ? 'assistant' : null
      if (!role) continue
      const blocks = Array.isArray(m.content) ? (m.content as Record<string, unknown>[]).filter((b) => b && typeof b === 'object') : []
      const fromBlocks = blocks.filter((b) => b.type === 'text').map((b) => str(b.text).trim()).filter(Boolean).join('\n\n')
      const text = fromBlocks || str(m.text).trim()
      const tools: Record<string, number> = {}
      let files: TurnFile[] = []
      for (const b of blocks) {
        if (b.type !== 'tool_use' || !str(b.name)) continue
        tools[str(b.name)] = (tools[str(b.name)] ?? 0) + 1
        files = mergeFiles(files, claudeFileTool(b, made).map((p) => madeFile(made, p)))
      }
      // Adjuntos del usuario: traen su texto. Los «files» (imágenes, PDF…) solo el nombre; los del asistente son lo que entregó.
      for (const a of Array.isArray(m.attachments) ? (m.attachments as Record<string, unknown>[]) : []) {
        const name = str(a?.file_name)
        if (name) files = mergeFiles(files, [{ name, content: str(a.extracted_content) || undefined }])
      }
      for (const f of Array.isArray(m.files) ? (m.files as Record<string, unknown>[]) : []) {
        const name = str(f?.file_name)
        if (name) files = mergeFiles(files, [role === 'assistant' ? madeFile(made, name) : { name }])
      }
      pushTurn(turns, { role, text, at: time(m.created_at, created), tools: Object.keys(tools).length ? tools : undefined, files: files.length ? files : undefined })
    }
    if (!turns.length) continue
    const project = c.project && typeof c.project === 'object' ? str((c.project as { uuid?: unknown }).uuid) : ''
    convs.push({
      sourceId: str(c.uuid) || `${created}`,
      title: str(c.name).slice(0, TITLE_MAX) || firstUserTitle(turns),
      createdAt: created,
      updatedAt: time(c.updated_at, turns[turns.length - 1].at),
      sourceProject: str(c.project_uuid) || project || undefined,
      summary: str(c.summary).trim() || undefined,
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

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** La palabra o frase entera dentro del texto (no «lab» dentro de «homelab»). */
function wordIn(text: string, phrase: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(phrase)}($|[^\\p{L}\\p{N}])`, 'u').test(text)
}

/**
 * El proyecto de Claude.ai de una conversación. La exportación no lo dice (las conversaciones no traen su proyecto),
 * así que se deduce: el nombre del proyecto en el título o el resumen, o que la conversación cite sus documentos.
 * Solo si un proyecto gana claramente; si no, la conversación queda suelta.
 */
export function guessClaudeProject(conv: ParsedConversation, projects: ClaudeAiProject[]): { uuid: string; reason: ProjectReason } | undefined {
  if (conv.sourceProject && projects.some((p) => p.uuid === conv.sourceProject)) return { uuid: conv.sourceProject, reason: 'export' }
  const head = `${conv.title}\n${conv.summary ?? ''}`.toLowerCase()
  const body = conv.turns.map((t) => `${t.text}\n${(t.files ?? []).map((f) => f.name).join('\n')}`).join('\n').toLowerCase()
  const scored = projects
    .map((p) => {
      const name = p.name.trim().toLowerCase()
      const byName = name.length >= 3 && wordIn(head, name)
      const docs = p.docs.filter((d) => d.name.length > 6 && body.includes(d.name.toLowerCase())).length
      return { uuid: p.uuid, score: (byName ? 3 : 0) + Math.min(docs, 3) * 2, reason: (byName ? 'name' : 'docs') as ProjectReason }
    })
    .filter((x) => x.score >= 2)
    .sort((x, y) => y.score - x.score)
  if (!scored.length || (scored[1] && scored[1].score === scored[0].score)) return undefined
  return { uuid: scored[0].uuid, reason: scored[0].reason }
}

// ---------- Leer un zip sin cargarlo entero (las exportaciones de ChatGPT pasan de 1 GB con imágenes) ----------

/** El ZIP puede ser grande; cada entrada se lee y descomprime con un límite independiente. */
const MAX_IMPORT_ENTRY = 256 * 1024 * 1024
const MAX_IMPORT_DIRECTORY = 32 * 1024 * 1024

interface ZipEntry {
  name: string
  method: number
  compressed: number
  size: number
  offset: number
}

export class ZipReader {
  private fd: number
  private fileSize: number
  readonly entries: ZipEntry[] = []

  constructor(path: string) {
    this.fd = openSync(path, 'r')
    this.fileSize = statSync(path).size
    try {
      this.readDirectory(this.fileSize)
    } catch (e) {
      this.close()
      throw e
    }
  }

  private read(pos: number, len: number): Buffer {
    if (!Number.isSafeInteger(pos) || !Number.isSafeInteger(len) || pos < 0 || len < 0 || len > MAX_IMPORT_ENTRY || pos > this.fileSize - len) throw new Error(tr('No es un archivo zip válido'))
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
    if (dirSize > MAX_IMPORT_DIRECTORY || count > 100_000) throw new Error(tr('La exportación supera los límites de lectura; divídela en archivos más pequeños'))
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
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > MAX_IMPORT_ENTRY || entry.compressed > MAX_IMPORT_ENTRY) throw new Error(tr('La exportación supera los límites de lectura; divídela en archivos más pequeños'))
    const head = this.read(entry.offset, 30)
    if (head.readUInt32LE(0) !== 0x04034b50) throw new Error(tr('No es un archivo zip válido'))
    const start = entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28)
    const raw = this.read(start, entry.compressed)
    if (entry.method === 0) return raw
    if (entry.method === 8) {
      try { return inflateRawSync(raw, { maxOutputLength: MAX_IMPORT_ENTRY }) }
      catch { throw new Error(tr('No es un archivo zip válido')) }
    }
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

// ---------- La app Claude de escritorio ----------
// Sus sesiones de código son de Claude Code (los mensajes están en ~/.claude/projects), pero el título que se ve en
// la app y la carpeta que eligió el usuario solo están en su índice: claude-code-sessions/<cuenta>/<org>/local_<id>.json
// (cliSessionId = el id del .jsonl). Las que se borraron en la app quedan como deleted_<id>.json. Los chats normales
// de la app no se guardan en el equipo: están en la cuenta y se traen con la exportación de Claude.ai.

interface DesktopSession {
  title: string
  cwd: string
  deleted: boolean
}

let desktopCache: Map<string, DesktopSession> | null = null

function claudeDesktopRoot(): string {
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support', 'Claude')
  if (process.platform === 'win32') return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Claude')
  return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'Claude')
}

/** Las carpetas sin elegir de la app Claude («scratch-AAAA-MM-DD-xxxxxx»): no son un proyecto del usuario. */
const isDesktopScratch = (cwd: string): boolean => /^scratch-\d{4}-\d{2}-\d{2}-[0-9a-z]{4,}$/i.test(basename(cwd))

export function claudeDesktopSessions(): Map<string, DesktopSession> {
  if (desktopCache) return desktopCache
  const out = new Map<string, DesktopSession>()
  const walk = (dir: string, depth: number): void => {
    let names: string[] = []
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const n of names) {
      const p = join(dir, n)
      if (/^(local|deleted)_.+\.json$/.test(n)) {
        try {
          const o = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>
          const id = str(o.cliSessionId)
          if (!id) continue
          // De varias carpetas posibles, la primera que sigue existiendo (si no, la que tenía).
          const dirs = [str(o.cwd), str(o.originCwd)].filter((d) => d && !isDesktopScratch(d))
          const deleted = n.startsWith('deleted_')
          if (out.get(id)?.deleted === false && deleted) continue
          out.set(id, { title: str(o.title).trim().slice(0, TITLE_MAX), cwd: dirs.find((d) => existsSync(d)) ?? dirs[0] ?? '', deleted })
        } catch {
          /* índice a medio escribir o de otra versión */
        }
      } else if (depth < 3 && !n.includes('.')) {
        walk(p, depth + 1)
      }
    }
  }
  walk(join(claudeDesktopRoot(), 'claude-code-sessions'), 0)
  desktopCache = out
  return out
}

function parseLocal(f: LocalFile, text: string): ParsedConversation | null {
  if (f.kind !== 'claude-code') return parseCodex(text, f.mtime)
  const conv = parseClaudeCode(text, basename(f.file, '.jsonl'), f.mtime)
  const desk = claudeDesktopSessions().get(conv.sourceId)
  // Borrada en la app Claude: el usuario no la quería.
  if (desk?.deleted) return null
  if (desk?.title) conv.title = desk.title
  if (desk?.cwd) conv.cwd = desk.cwd
  // Sin carpeta elegida en la app Claude: va al proyecto «Claude Code», sin la carpeta temporal.
  else if (conv.cwd && isDesktopScratch(conv.cwd)) conv.cwd = undefined
  return conv
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

/**
 * Sesiones que no abrió una persona: encargos de kywai, las de Claude cuando lo maneja un proyecto a distancia
 * (empiezan con un aviso «<wake …>»), las revisiones automáticas de permisos de Codex y las pruebas de «¿responde?».
 */
const AUTOMATIC_RES = [
  KYWAI_PROMPT_RE,
  /^<wake\b/,
  /^The following is the Codex agent history whose request action you are assessing/,
  /^Responde (únicamente|solo)\b[^\n]{0,30}$/i,
  // La prueba de «¿Hermes responde?» de kywai y de sus pruebas de desarrollo.
  /^Responde (únicamente|solo) con (este|un|el) JSON\b/i
]

/** La carpeta de proyectos; en un cliente de kywai no hay (sus proyectos están en el servidor). */
function safeProjectsRoot(): string {
  try {
    return store.projectsRoot()
  } catch {
    return ''
  }
}

/** Una carpeta de kywai: su carpeta de datos (proyectos, entornos aislados del verificador) aunque ya se borrara. */
function isKywaiDir(cwd: string): boolean {
  const p = resolve(cwd)
  const inside = (root: string): boolean => !!root && (p + sep).startsWith(resolve(root) + sep)
  // Las carpetas temporales de kywai («aicw», «aicw-…», «ai-cowork-hermes»): pruebas y consultas sueltas.
  return inside(workspace) || inside(safeProjectsRoot()) || /[\\/]AI Cowork[\\/]workspace[\\/]/i.test(p) || /[\\/](aicw(-[\w-]+)?|ai-cowork-hermes)([\\/]|$)/i.test(p)
}

/** No la empezó el usuario: trabajo de kywai (por su carpeta o por cómo empieza) o algo automático. */
export function isAutomaticSession(cwd: string | undefined, firstUserText: string): boolean {
  if (cwd && isKywaiDir(cwd)) return true
  const t = firstUserText.trimStart()
  return AUTOMATIC_RES.some((re) => re.test(t))
}

const firstUserText = (conv: ParsedConversation): string => conv.turns.find((t) => t.role === 'user')?.text ?? ''

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
    const msgSql = `SELECT role, content, ${mc.has('tool_calls') ? 'tool_calls' : 'NULL AS tool_calls'}, timestamp FROM messages WHERE session_id = ?${active} ORDER BY timestamp, id`
    const firstSql = `SELECT content FROM messages WHERE session_id = ? AND role = 'user'${active} ORDER BY timestamp, id LIMIT 1`
    const out: ParsedConversation[] = []
    for (const root of rows) {
      if (continues(root)) continue
      if (only && !only.has(root.id)) continue
      if (hidden.has(root.id)) continue
      const chain = [root]
      while (next.has(chain[chain.length - 1].id) && chain.length < 200) chain.push(next.get(chain[chain.length - 1].id)!)
      const first = str((db.prepare(firstSql).all(root.id)[0] as { content?: unknown } | undefined)?.content)
      if (!first.trim() || isAutomaticSession(root.cwd, hermesImages(first).text || first)) continue
      const turns: Turn[] = []
      if (withMessages) {
        for (const s of chain) {
          for (const m of db.prepare(msgSql).all(s.id) as Record<string, unknown>[]) {
            const at = time(m.timestamp, s.started)
            if (m.role === 'user') {
              const { text, images } = hermesImages(cleanUserText(str(m.content)))
              pushTurn(turns, { role: 'user', text, at, localImages: images.length ? images : undefined })
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

/**
 * Hermes Desktop guarda cada imagen pegada aparte (…\\Hermes\\composer-images\\composer_….png) y en el mensaje deja
 * una línea «@image:<ruta>», a veces seguida de «[screenshot]». Se quitan del texto y se devuelven las rutas.
 */
export function hermesImages(text: string): { text: string; images: string[] } {
  const images: string[] = []
  const rest = text
    .split(/\r?\n/)
    .filter((line) => {
      const m = /^\s*@image:(.+?)\s*$/.exec(line)
      if (!m) return true
      images.push(m[1].replace(/^["']|["']$/g, ''))
      return false
    })
    .filter((line) => !(images.length && /^\s*\[(screenshot|image|imagen)\]\s*$/i.test(line)))
    .join('\n')
    .trim()
  return { text: rest, images }
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
  let projects: ReturnType<typeof store.listProjects> = []
  try {
    projects = store.listProjects()
  } catch {
    /* en un cliente de kywai no hay proyectos aquí: están en el servidor */
  }
  const p = projects.find((x) => x.workDir && sameDir(x.workDir, cwd))
  return p ? { id: p.id, name: p.name } : undefined
}

/** Lo que hay en este equipo de Claude Code, Codex y Hermes, agrupado por carpeta (las más recientes primero). */
export function scanImports(): ImportScan {
  const ix = loadIndex()
  lastScan.clear()
  desktopCache = null
  const sources: ImportSource[] = []
  const fromFiles = (files: LocalFile[]): { f: LocalFile; conv: ParsedConversation }[] =>
    files.flatMap((f) => {
      try {
        const conv = parseLocal(f, readHead(f.file))
        return conv ? [{ f, conv }] : []
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
      // Sin nada que el usuario escribiera: una sesión vacía o solo de arranque.
      if (!conv.sourceId || !conv.turns.some((t) => t.role === 'user')) continue
      if (isAutomaticSession(conv.cwd, firstUserText(conv))) continue
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

/**
 * Los turnos como mensajes del chat. Las respuestas llevan al agente de kywai de esa familia si existe (se ve su
 * robot); si no, el nombre de la app de origen.
 */
export function toMessages(
  conv: ParsedConversation,
  projectId: string,
  label: string,
  agentId: string | undefined,
  images?: Map<string, ChatMessage['attachments']>
): ChatMessage[] {
  return conv.turns.map((t) => {
    const saved = (t.files ?? []).filter((f) => f.content !== undefined)
    const named = (t.files ?? []).filter((f) => f.content === undefined).map((f) => f.name)
    // Lo que la exportación no trae (imágenes, PDF subidos): solo su nombre, una vez y discreto.
    const missing = named.length ? `_📎 ${named.join(' · ')}_` : ''
    const text = [t.text, missing].filter(Boolean).join('\n\n')
    const atts = [...(t.images ?? []).flatMap((id) => images?.get(id) ?? []), ...saveImages(projectId, t), ...saveFiles(projectId, saved)]
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

/** Lo más que se copia de una imagen pegada (las capturas normales pesan mucho menos). */
const MAX_IMAGE_BYTES = 30 * 1024 * 1024
const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }

/** Lee una imagen pegada de este equipo para mandarla a otro (null si ya no está, no es imagen o pesa demasiado). */
export function readInlineImage(path: string): InlineImage | null {
  const mime = IMAGE_MIME[extname(path).toLowerCase()]
  if (!mime) return null
  try {
    if (statSync(path).size > MAX_IMAGE_BYTES) return null
    return { name: basename(path), mime, data: readFileSync(path).toString('base64') }
  } catch {
    return null
  }
}

/** Copia a los adjuntos del proyecto las imágenes que pegó el usuario (de este equipo o llegadas de un cliente). */
function saveImages(projectId: string, t: Turn): NonNullable<ChatMessage['attachments']> {
  const list = [...(t.localImages ?? []).map((p) => readInlineImage(p)), ...(t.inlineImages ?? [])].filter((x): x is InlineImage => !!x && !!IMAGE_MIME[extname(x.name).toLowerCase()])
  if (!list.length) return []
  const dir = join(store.projectDir(projectId), 'attachments')
  const out: NonNullable<ChatMessage['attachments']> = []
  for (const img of list) {
    try {
      const bytes = Buffer.from(img.data, 'base64')
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) continue
      mkdirSync(dir, { recursive: true })
      const name = store.sanitizeFileName(img.name) || 'imagen.png'
      const fileName = `imp-${randomUUID().slice(0, 8)}-${name}`.slice(0, 120)
      writeFileSync(join(dir, fileName), bytes)
      out.push({ id: `a-${randomUUID()}`, name, relPath: `attachments/${fileName}`, mime: IMAGE_MIME[extname(name).toLowerCase()] ?? 'image/png', size: bytes.length })
    } catch {
      /* una imagen que no se guarda no impide la conversación */
    }
  }
  return out
}

const TEXT_MIME: Record<string, string> = { '.md': 'text/markdown', '.html': 'text/html', '.htm': 'text/html', '.json': 'application/json', '.csv': 'text/csv', '.svg': 'image/svg+xml' }

/** Guarda en los adjuntos del proyecto los archivos de un mensaje que traen su contenido, para abrirlos desde el chat. */
function saveFiles(projectId: string, files: TurnFile[]): NonNullable<ChatMessage['attachments']> {
  if (!files.length) return []
  const dir = join(store.projectDir(projectId), 'attachments')
  const out: NonNullable<ChatMessage['attachments']> = []
  for (const f of files) {
    try {
      mkdirSync(dir, { recursive: true })
      const name = store.sanitizeFileName(f.name) || 'archivo.txt'
      const fileName = `imp-${randomUUID().slice(0, 8)}-${name}`.slice(0, 120)
      const bytes = Buffer.from(f.content ?? '', 'utf8')
      writeFileSync(join(dir, fileName), bytes)
      out.push({ id: `a-${randomUUID()}`, name, relPath: `attachments/${fileName}`, mime: TEXT_MIME[extname(name).toLowerCase()] ?? 'text/plain', size: bytes.length })
    } catch {
      /* un archivo que no se guarda no impide la conversación */
    }
  }
  return out
}

interface Ctx {
  ix: ImportIndex
  agents: AgentConfig[]
  result: ImportResult
  /** Proyectos cuyo chat abierto era una conversación que se volvió a importar. */
  cleared?: Set<string>
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

/** La conversación entera de una sesión encontrada en este equipo. */
function readLocalFull(f: LocalFile): ParsedConversation | null | undefined {
  return f.kind === 'hermes' ? readHermesDb(f.file, true, new Set(f.sessionIds ?? []))[0] : parseLocal(f, readFileSync(f.file, 'utf8'))
}

function importLocalOne(ctx: Ctx, key: string, f: LocalFile): void {
  if (alreadyImported(ctx.ix, key)) {
    ctx.result.skipped++
    return
  }
  const conv = readLocalFull(f)
  if (!conv || !conv.turns.length || isAutomaticSession(conv.cwd, firstUserText(conv))) return
  // Sin carpeta, o en la carpeta personal entera (kywai no da acceso a toda ella): a un proyecto con el nombre de la app.
  const projectId = conv.cwd && !isSystemDir(conv.cwd) && !sameDir(conv.cwd, home) ? projectForCwd(ctx, conv.cwd) : projectFor(ctx, f.kind, IMPORT_LABEL[f.kind])
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

// ---------- Desde un cliente de kywai ----------
// Un PC cliente no tiene proyectos ni agentes: sus sesiones de Claude Code, Codex y Hermes Desktop las lee él mismo,
// las junta en un JSON («kywai-chats», con las imágenes pegadas dentro) y lo sube al servidor por /api/import-upload;
// el servidor lo importa como cualquier exportación. No se pueden retomar (la sesión real está en el otro equipo).

export const BUNDLE_FORMAT = 'kywai-chats'
type LocalKind = LocalFile['kind']
const LOCAL_KINDS: LocalKind[] = ['claude-code', 'codex', 'hermes']

export interface ChatsBundle {
  format: typeof BUNDLE_FORMAT
  v: 1
  /** Nombre del equipo de donde vienen. */
  device: string
  /** Su carpeta personal: lo trabajado ahí mismo no es un proyecto. */
  home: string
  conversations: { kind: LocalKind; conv: ParsedConversation }[]
}

/** Lo más que pesan juntas las imágenes de un envío (en base64), para no mandar gigas por la red. */
const MAX_BUNDLE_IMAGES = 200 * 1024 * 1024

/** Junta las sesiones elegidas de este equipo (ids de scanImports) para mandarlas al servidor. */
export function exportLocal(ids: unknown, device: string): ChatsBundle {
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  if (!lastScan.size) scanImports()
  const out: ChatsBundle = { format: BUNDLE_FORMAT, v: 1, device: device.slice(0, 80), home, conversations: [] }
  let budget = MAX_BUNDLE_IMAGES
  for (const id of list) {
    const f = lastScan.get(id)
    if (!f) continue
    let conv: ParsedConversation | null | undefined
    try {
      conv = readLocalFull(f)
    } catch (e) {
      console.warn('[cowork] no se pudo leer', id, (e as Error).message)
      continue
    }
    if (!conv || !conv.turns.length || isAutomaticSession(conv.cwd, firstUserText(conv))) continue
    for (const t of conv.turns) {
      if (!t.localImages?.length) continue
      const imgs: InlineImage[] = []
      for (const path of t.localImages) {
        const img = readInlineImage(path)
        if (!img || img.data.length > budget) continue
        budget -= img.data.length
        imgs.push(img)
      }
      delete t.localImages
      if (imgs.length) t.inlineImages = imgs
    }
    out.conversations.push({ kind: f.kind, conv })
  }
  return out
}

function isBundle(data: unknown): data is ChatsBundle {
  return !!data && typeof data === 'object' && (data as { format?: unknown }).format === BUNDLE_FORMAT && Array.isArray((data as { conversations?: unknown }).conversations)
}

/** Lo que llega de otro equipo, comprobado campo a campo (no se fía de su forma). */
function cleanBundle(data: ChatsBundle): ChatsBundle {
  const turns = (v: unknown): Turn[] =>
    (Array.isArray(v) ? v : []).flatMap((x): Turn[] => {
      if (!x || typeof x !== 'object') return []
      const o = x as Record<string, unknown>
      if (o.role !== 'user' && o.role !== 'assistant') return []
      const tools = o.tools && typeof o.tools === 'object' && !Array.isArray(o.tools) ? Object.fromEntries(Object.entries(o.tools as Record<string, unknown>).filter(([, n]) => typeof n === 'number').slice(0, 50)) as Record<string, number> : undefined
      const imgs = (Array.isArray(o.inlineImages) ? o.inlineImages : [])
        .map((i) => (i && typeof i === 'object' ? (i as Record<string, unknown>) : {}))
        .filter((i) => typeof i.name === 'string' && typeof i.data === 'string' && typeof i.mime === 'string')
        .map((i) => ({ name: basename(String(i.name).replace(/\\/g, '/')), mime: String(i.mime), data: String(i.data) }))
      return [{ role: o.role, text: str(o.text), at: time(o.at, 0), tools: tools && Object.keys(tools).length ? tools : undefined, inlineImages: imgs.length ? imgs : undefined }]
    })
  return {
    format: BUNDLE_FORMAT,
    v: 1,
    device: str(data.device).slice(0, 80),
    home: str(data.home),
    conversations: data.conversations.flatMap((x) => {
      const kind = (x as { kind?: unknown })?.kind as LocalKind
      const c = (x as { conv?: unknown })?.conv as Record<string, unknown> | undefined
      if (!LOCAL_KINDS.includes(kind) || !c || typeof c !== 'object' || !str(c.sourceId)) return []
      const conv: ParsedConversation = {
        sourceId: str(c.sourceId).slice(0, 200),
        title: str(c.title).slice(0, TITLE_MAX),
        createdAt: time(c.createdAt, Date.now()),
        updatedAt: time(c.updatedAt, Date.now()),
        cwd: str(c.cwd) || undefined,
        turns: turns(c.turns)
      }
      if (!conv.title) conv.title = firstUserTitle(conv.turns)
      return conv.turns.length ? [{ kind, conv }] : []
    })
  }
}

/**
 * Carpetas que no son un proyecto: la raíz de un disco o la del sistema (una terminal de Windows abierta como
 * administrador empieza en C:\\Windows\\System32). Lo hablado ahí va al proyecto con el nombre de la app.
 */
export function isSystemDir(cwd: string): boolean {
  const p = cwd.trim().replace(/[\\/]+$/, '')
  return !p || /^[a-z]:$/i.test(p) || /^[a-z]:[\\/]windows([\\/]|$)/i.test(p) || /^\/(usr|bin|sbin|etc|System|private|var|tmp)?$/.test(p)
}

/** El último nombre de una ruta, sea de Windows o de Mac/Linux (la ruta es del otro equipo). */
const lastName = (p: string): string => p.split(/[\\/]+/).filter(Boolean).pop() ?? p
const samePath = (a: string, b: string): boolean => {
  const n = (p: string): string => p.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase()
  return n(a) === n(b)
}

/** Proyecto para una carpeta de otro equipo: el ya creado para ella, uno de kywai con ese nombre o uno nuevo. */
function projectForRemoteDir(ctx: Ctx, device: string, cwd: string): string {
  const key = `dir:${device}:${cwd}`
  const known = ctx.ix.projects[key]
  if (known && store.listProjects().some((p) => p.id === known)) return known
  const name = lastName(cwd) || cwd
  const same = store.listProjects().find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
  if (same) {
    ctx.ix.projects[key] = same.id
    return same.id
  }
  return projectFor(ctx, key, name)
}

function importBundle(ctx: Ctx, bundle: ChatsBundle): void {
  for (const { kind, conv } of bundle.conversations) {
    const key = `${kind}:${conv.sourceId}`
    if (alreadyImported(ctx.ix, key)) {
      ctx.result.skipped++
      continue
    }
    if (isAutomaticSession(conv.cwd, firstUserText(conv))) continue
    const projectId = conv.cwd && !isSystemDir(conv.cwd) && !(bundle.home && samePath(conv.cwd, bundle.home)) ? projectForRemoteDir(ctx, bundle.device, conv.cwd) : projectFor(ctx, kind, IMPORT_LABEL[kind])
    const provider: ProviderKind = kind === 'claude-code' ? 'claude' : kind === 'codex' ? 'codex' : 'hermes'
    const agent = agentFor(provider, ctx.agents)
    const label = IMPORT_LABEL[kind]
    const conversationId = addImportedConversation(projectId, {
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messages: toMessages(conv, projectId, label, agent?.id),
      importedFrom: bundle.device ? `${label} · ${bundle.device}` : label
    })
    ctx.ix.conversations[key] = { projectId, conversationId, at: Date.now() }
    ctx.result.conversations++
    noteProject(ctx.result, projectId)
  }
}

/** De estas sesiones (ids de scanImports, «hermes:<id>»…), las que ya se importaron en este servidor. */
export function importedIds(ids: unknown): string[] {
  const ix = loadIndex()
  return (Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === 'string' && alreadyImported(ix, id))
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

/** Versión de cómo se escriben las conversaciones de Claude.ai: las importadas con una anterior se reescriben al reimportar. */
const CLAUDE_FORMAT = 2

/** Lo que eligió el usuario al revisar: id de la conversación en Claude.ai → uuid de su proyecto ('' = suelta). */
export type ProjectChoices = Record<string, string>

/** El proyecto de Claude.ai de cada conversación: el que eligió el usuario o, si no, el que se deduce. */
function claudeTargets(parsed: ReturnType<typeof parseClaudeAi>, choices?: ProjectChoices): Map<string, { uuid: string; reason?: ProjectReason }> {
  const known = new Set(parsed.projects.map((p) => p.uuid))
  const out = new Map<string, { uuid: string; reason?: ProjectReason }>()
  for (const conv of parsed.conversations) {
    const picked = choices && Object.prototype.hasOwnProperty.call(choices, conv.sourceId) ? choices[conv.sourceId] : undefined
    if (typeof picked === 'string' && (picked === '' || known.has(picked))) out.set(conv.sourceId, { uuid: picked })
    else out.set(conv.sourceId, guessClaudeProject(conv, parsed.projects) ?? { uuid: '' })
  }
  return out
}

/** Dónde está ahora una conversación importada: donde se dejó o, si el usuario la movió, en otro proyecto. */
function locate(hit: ImportIndex['conversations'][string]): string | undefined {
  if (hasConversation(hit.projectId, hit.conversationId)) return hit.projectId
  return store.listProjects().find((p) => hasConversation(p.id, hit.conversationId))?.id
}

/** Un proyecto sin nada: ni conversaciones con mensajes, ni instrucciones, ni documentos, ni tareas, ni carpeta. */
function isEmptyProject(id: string): boolean {
  const st = store.getProject(id)
  return (
    !st.messages.length &&
    !st.tasks.length &&
    !st.artifacts.length &&
    !st.instructions?.trim() &&
    !st.routines?.length &&
    !st.project.workDir &&
    listConversations(id).every((c) => c.messageCount === 0)
  )
}

function importClaudeAi(ctx: Ctx, parsed: ReturnType<typeof parseClaudeAi>, choices?: ProjectChoices): void {
  const target = claudeTargets(parsed, choices)
  const used = new Set([...target.values()].map((t) => t.uuid))
  const projectOf = new Map<string, string>()
  for (const p of parsed.projects) {
    // Un proyecto sin instrucciones, sin documentos y sin conversaciones no se crea (saldría vacío).
    if (!p.instructions && !p.docs.length && !used.has(p.uuid)) continue
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
    const uuid = target.get(conv.sourceId)?.uuid ?? ''
    const projectId = (uuid && projectOf.get(uuid)) || projectFor(ctx, 'claude-ai', 'Claude.ai')
    const hit = ctx.ix.conversations[key]
    const where = hit ? locate(hit) : undefined
    if (hit && where) {
      // La movió el usuario a mano: se respeta donde la puso.
      if (where !== hit.projectId) {
        ctx.result.skipped++
        continue
      }
      // Ya siguió escribiendo en ella (no se reescribe: se perdería lo nuevo) o ya se importó limpia: como mucho,
      // se pone en su proyecto.
      if (hit.v === CLAUDE_FORMAT || conversationMessages(where, hit.conversationId).some((m) => m.createdAt > hit.at)) {
        if (where === projectId) {
          ctx.result.skipped++
        } else {
          const conversationId = moveConversation(where, hit.conversationId, projectId)
          ctx.ix.conversations[key] = { ...hit, projectId, conversationId }
          ctx.result.reordered = (ctx.result.reordered ?? 0) + 1
          noteProject(ctx.result, where)
          noteProject(ctx.result, projectId)
        }
        continue
      }
      // Importada tal cual y sin tocar: se vuelve a escribir limpia en su proyecto (sin duplicarla).
      if (dropImportedConversation(where, hit.conversationId)) (ctx.cleared ??= new Set()).add(where)
      noteProject(ctx.result, where)
      ctx.result.reordered = (ctx.result.reordered ?? 0) + 1
    } else {
      ctx.result.conversations++
    }
    const conversationId = addImportedConversation(projectId, {
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messages: toMessages(conv, projectId, IMPORT_LABEL['claude-ai'], undefined),
      importedFrom: IMPORT_LABEL['claude-ai']
    })
    ctx.ix.conversations[key] = { projectId, conversationId, at: Date.now(), v: CLAUDE_FORMAT }
    noteProject(ctx.result, projectId)
  }
  // Lo que importaciones anteriores dejaron vacío (el proyecto «Claude.ai» ya ordenado, proyectos sin nada): fuera.
  const empty: string[] = []
  for (const [key, id] of Object.entries(ctx.ix.projects)) {
    if (key !== 'claude-ai' && !key.startsWith('claude-ai-project:')) continue
    if (!store.listProjects().some((p) => p.id === id)) continue
    try {
      if (!isEmptyProject(id)) continue
    } catch {
      continue
    }
    empty.push(id)
    delete ctx.ix.projects[key]
  }
  if (empty.length) ctx.result.emptyProjectIds = empty
  ctx.result.projectIds = ctx.result.projectIds.filter((id) => !empty.includes(id))
  if (ctx.cleared?.size) ctx.result.clearedProjectIds = [...ctx.cleared].filter((id) => !empty.includes(id))
}

// Claude.ai manda ahora la exportación partida: un manifest-….json que nombra los zips (conversations-000.zip,
// projects-000.zip, memories-000.zip…) y los zips sueltos. Dentro puede venir un conversations.json con todas o un
// JSON por conversación en una carpeta. Se buscan por el nombre y se reconocen por su forma.
const jsonName = (n: string): string => basename(n).toLowerCase()
const isConvsJson = (n: string): boolean => /^conversations?(-\d+)?\.json$/.test(jsonName(n)) || (/(^|\/)conversations?\//i.test(n) && n.toLowerCase().endsWith('.json'))
const isProjectsJson = (n: string): boolean => /^projects?(-\d+)?\.json$/.test(jsonName(n)) || (/(^|\/)projects?\//i.test(n) && jsonName(n).endsWith('.json') && !/\/docs?\//i.test(n))

function parseJson(buf: Buffer, name = 'conversations.json'): unknown {
  try {
    return JSON.parse(buf.toString('utf8')) as unknown
  } catch {
    throw new Error(tr('El archivo {name} no se puede leer', { name: basename(name) }))
  }
}

/** Una lista de conversaciones (o proyectos), una sola, o envuelta en { conversations: [...] }. */
function asItems(data: unknown, key: string): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const inner = (data as Record<string, unknown>)[key]
    if (Array.isArray(inner)) return inner
    return [data]
  }
  return []
}

/** ChatGPT o Claude.ai, por la forma de sus conversaciones. */
function detect(data: unknown): 'chatgpt' | 'claude-ai' | null {
  if (!Array.isArray(data)) return null
  const first = data.find((c) => c && typeof c === 'object') as Record<string, unknown> | undefined
  if (!first) return 'chatgpt'
  if ('mapping' in first) return 'chatgpt'
  if ('chat_messages' in first) return 'claude-ai'
  return null
}

/** No se reconoce: se dicen los campos que trae (solo los nombres) para poder añadir ese formato. */
function unknownShape(items: unknown[]): string {
  const first = items.find((c) => c && typeof c === 'object' && !Array.isArray(c)) as Record<string, unknown> | undefined
  const keys = first ? Object.keys(first).slice(0, 12).join(', ') : ''
  return tr('No reconozco ese archivo: elige la exportación de ChatGPT o de Claude.ai') + (keys ? ` (${tr('campos: {keys}', { keys })})` : '')
}

/** Los zips que nombra un manifiesto de Claude.ai y están en su misma carpeta. */
function manifestFiles(file: string, data: unknown): string[] | null {
  const list = data && typeof data === 'object' ? (data as { data_files?: unknown }).data_files : undefined
  if (!Array.isArray(list)) return null
  return list
    .map((x) => (x && typeof x === 'object' ? str((x as { filename?: unknown }).filename) : ''))
    .filter((n) => n && basename(n) === n)
    .map((n) => join(dirname(file), n))
    .filter((p) => existsSync(p))
}

/** Lo leído de una exportación: sus conversaciones ya entendidas y el zip de las imágenes (ChatGPT). */
interface ReadArchive {
  kind: 'chatgpt' | 'claude-ai' | 'bundle'
  bundle?: ChatsBundle
  chatgpt?: ParsedConversation[]
  claude?: ReturnType<typeof parseClaudeAi>
  convZip?: ZipReader
  zips: ZipReader[]
  files: string[]
}

/** Lee la exportación de ChatGPT o Claude.ai: el zip tal cual, solo su conversations.json o varios zips / su manifiesto. */
function readArchive(paths: unknown): ReadArchive {
  const list = (Array.isArray(paths) ? paths : [paths]).filter((x): x is string => typeof x === 'string' && !!x.trim())
  if (!list.length) throw new Error(tr('Elige el archivo exportado'))
  const files = list.map((p) => resolve(p))
  for (const file of files) if (!existsSync(file) || !statSync(file).isFile()) throw new Error(tr('No se encuentra el archivo'))
  const zips: ZipReader[] = []
  const convs: unknown[] = []
  const projs: unknown[] = []
  let sawConvs = false
  let sawProjects = false
  let manifest = false
  /** El zip con las conversaciones (ChatGPT guarda ahí las imágenes). */
  let convZip: ZipReader | undefined
  let bundle: ChatsBundle | undefined
  try {
    const seen = new Set<string>()
    const queue = [...files]
    while (queue.length) {
      const file = queue.shift()!
      if (seen.has(file)) continue
      seen.add(file)
      if (extname(file).toLowerCase() === '.json') {
        if (statSync(file).size > MAX_IMPORT_ENTRY) throw new Error(tr('La exportación supera los límites de lectura; divídela en archivos más pequeños'))
        const data = parseJson(readFileSync(file), file)
        const named = manifestFiles(file, data)
        if (isBundle(data)) {
          const clean = cleanBundle(data)
          if (bundle) bundle.conversations.push(...clean.conversations)
          else bundle = clean
        } else if (named) {
          manifest = true
          queue.push(...named)
        } else if (isProjectsJson(file)) {
          sawProjects = true
          projs.push(...asItems(data, 'projects'))
        } else {
          sawConvs = true
          convs.push(...asItems(data, 'conversations'))
        }
        continue
      }
      const zip = new ZipReader(file)
      zips.push(zip)
      for (const e of zip.entries) {
        if (isConvsJson(e.name)) {
          sawConvs = true
          convZip ??= zip
          convs.push(...asItems(parseJson(zip.data(e), e.name), 'conversations'))
        } else if (isProjectsJson(e.name)) {
          sawProjects = true
          projs.push(...asItems(parseJson(zip.data(e), e.name), 'projects'))
        }
      }
    }
    if (bundle && !sawConvs && !sawProjects) return { kind: 'bundle', bundle, zips, files }
    if (!sawConvs && !sawProjects) {
      throw new Error(
        manifest
          ? tr('Pon los zips de la exportación (conversations-000.zip, projects-000.zip) en la misma carpeta que el manifiesto, o elígelos a la vez')
          : tr('Ahí no hay conversaciones: elige conversations-000.zip (y projects-000.zip) de Claude.ai, o el zip de ChatGPT')
      )
    }
    const kind = convs.length ? detect(convs) : 'claude-ai'
    if (!kind) throw new Error(unknownShape(convs))
    if (kind === 'chatgpt') return { kind, chatgpt: parseChatGpt(convs), convZip, zips, files }
    const claude = parseClaudeAi(convs, projs.length ? projs : undefined)
    // Hay conversaciones pero ninguna con la forma conocida: un formato nuevo. Mejor decirlo que importar cero.
    if (convs.length && !claude.conversations.length && !claude.projects.length) throw new Error(unknownShape(convs))
    return { kind, claude, zips, files }
  } catch (e) {
    for (const z of zips) z.close()
    throw e
  }
}

/** Lo que se subió por la web para importarlo (ver /api/import-upload) ya no hace falta. */
function dropUploads(files: string[]): void {
  const uploads = join(tmpdir(), 'kywai-importar') + sep
  for (const file of files) if (file.startsWith(uploads)) rmSync(dirname(file), { recursive: true, force: true })
}

/**
 * Lo que trae una exportación, sin importar nada: cada conversación con el proyecto donde irá (en Claude.ai se
 * deduce, porque la exportación no lo dice) para que el usuario lo revise y lo cambie antes de importar.
 */
export function previewArchive(paths: unknown): ArchivePreview {
  const read = readArchive(paths)
  try {
    const ix = loadIndex()
    const imported = (key: string): boolean => {
      const hit = ix.conversations[key]
      return !!hit && !!locate(hit)
    }
    if (read.kind === 'bundle') {
      const b = read.bundle!
      return {
        kind: b.conversations[0]?.kind ?? 'hermes',
        projects: [],
        conversations: b.conversations.map(({ kind, conv }) => ({ id: conv.sourceId, title: conv.title, updatedAt: conv.updatedAt, project: '', imported: imported(`${kind}:${conv.sourceId}`) }))
      }
    }
    if (read.kind === 'chatgpt') {
      return {
        kind: 'chatgpt',
        projects: [],
        conversations: read.chatgpt!.map((c) => ({ id: c.sourceId, title: c.title, updatedAt: c.updatedAt, project: '', imported: imported(`chatgpt:${c.sourceId}`) }))
      }
    }
    const parsed = read.claude!
    const target = claudeTargets(parsed)
    const conversations: ArchiveConversation[] = parsed.conversations
      .map((c) => ({ id: c.sourceId, title: c.title, updatedAt: c.updatedAt, project: target.get(c.sourceId)?.uuid ?? '', reason: target.get(c.sourceId)?.reason, imported: imported(`claude-ai:${c.sourceId}`) }))
      .sort((x, y) => y.updatedAt - x.updatedAt)
    return { kind: 'claude-ai', projects: parsed.projects.map((p) => ({ uuid: p.uuid, name: p.name })), conversations }
  } finally {
    for (const z of read.zips) z.close()
  }
}

/**
 * Importa la exportación de ChatGPT o Claude.ai. En Claude.ai, `choices` dice a qué proyecto va cada conversación
 * (lo revisado en la ventana); sin él, se deduce. Volver a importar la misma exportación no duplica: reescribe
 * limpias las ya importadas, las pone en su proyecto y quita los proyectos que se quedan vacíos.
 */
export function importArchive(paths: unknown, agents: AgentConfig[], choices?: unknown): ImportResult {
  const read = readArchive(paths)
  try {
    const ctx: Ctx = { ix: loadIndex(), agents, result: newResult(read.kind === 'bundle' ? (read.bundle!.conversations[0]?.kind ?? 'hermes') : read.kind) }
    try {
      if (read.kind === 'bundle') importBundle(ctx, read.bundle!)
      else if (read.kind === 'chatgpt') importChatGpt(ctx, read.chatgpt!, read.convZip)
      else importClaudeAi(ctx, read.claude!, choices && typeof choices === 'object' && !Array.isArray(choices) ? (choices as ProjectChoices) : undefined)
    } finally {
      saveIndex(ctx.ix)
    }
    return ctx.result
  } finally {
    for (const z of read.zips) z.close()
    dropUploads(read.files)
  }
}
