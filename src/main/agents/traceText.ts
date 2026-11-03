// Cómo se ve cada herramienta en el registro de una tarea: un título corto y el detalle (comando, cambios…).
import type { TraceTool } from '@shared/types'
import { baseName, clip, obj, str } from './spawn'

type Json = Record<string, unknown>

export interface ToolTrace {
  tool: TraceTool
  title: string
  body?: string
}

/** `bash -lc 'npm test'` o `powershell.exe -Command "npm test"` → `npm test`. */
export function unwrapShell(cmd: string): string {
  const m = /^\s*(?:"[^"]+"|\S+)\s+(?:-NoProfile\s+)?(?:-lc|-c|-Command)\s+(['"])([\s\S]*)\1\s*$/i.exec(cmd)
  return m ? m[2] : cmd
}

/** Cambio de texto como diff sencillo: lo quitado con «-», lo puesto con «+». */
export function editDiff(before: string, after: string): string {
  const minus = before ? before.split('\n').map((l) => `- ${l}`) : []
  const plus = after ? after.split('\n').map((l) => `+ ${l}`) : []
  return [...minus, ...plus].join('\n')
}

/** Contenido de un resultado de herramienta (texto, o lista de bloques de texto e imágenes). */
export function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((c) => {
      const b = obj(c)
      if (!b) return ''
      if (str(b.type) === 'image') return '[imagen]'
      return str(b.text)
    })
    .filter(Boolean)
    .join('\n')
}

/** Lista de pasos del agente («☑ hecho», «▸ en curso», «☐ pendiente»). */
export function todoTrace(items: unknown, done: (t: Json) => boolean, text: (t: Json) => string, active?: (t: Json) => boolean): ToolTrace {
  const list = (Array.isArray(items) ? items : []).map(obj).filter((t): t is Json => !!t)
  const n = list.filter(done).length
  return {
    tool: 'todo',
    title: list.length ? `Lista de pasos (${n}/${list.length})` : 'Organizando las tareas',
    body: list.map((t) => `${done(t) ? '☑' : active?.(t) ? '▸' : '☐'} ${text(t)}`).join('\n') || undefined
  }
}

function json(a: Json): string | undefined {
  if (!Object.keys(a).length) return undefined
  try {
    return JSON.stringify(a, null, 2)
  } catch {
    return undefined
  }
}

function host(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

const command = (cmd: string): ToolTrace => ({ tool: 'command', title: `Ejecutando: ${clip(cmd, 70)}`, body: cmd })

const range = (a: Json): string => {
  const from = Number(a.offset ?? a.start_line ?? a.offset_line)
  const lines = Number(a.limit ?? a.max_lines)
  if (Number.isFinite(from) && from > 0) return Number.isFinite(lines) && lines > 0 ? ` (líneas ${from}–${from + lines})` : ` (desde la línea ${from})`
  return ''
}

/** Herramientas de Claude Code (y de Qwen Code, que usa el mismo formato). */
export function claudeToolTrace(name: string, input: Json | null): ToolTrace {
  const a = input ?? {}
  const file = str(a.file_path) || str(a.notebook_path) || str(a.path)
  switch (name) {
    case 'Read':
      return { tool: 'read', title: `Leyendo ${baseName(file)}`, body: file + range(a) }
    case 'Write':
      return { tool: 'write', title: `Creando ${baseName(file)}`, body: `${file}\n\n${str(a.content)}` }
    case 'Edit':
      return { tool: 'edit', title: `Editando ${baseName(file)}`, body: `${file}\n\n${editDiff(str(a.old_string), str(a.new_string))}` }
    case 'MultiEdit': {
      const edits = (Array.isArray(a.edits) ? a.edits : []).map(obj).filter((e): e is Json => !!e)
      const diffs = edits.map((e) => editDiff(str(e.old_string), str(e.new_string)))
      return { tool: 'edit', title: `Editando ${baseName(file)} (${edits.length} cambios)`, body: [file, ...diffs].join('\n\n') }
    }
    case 'NotebookEdit':
      return { tool: 'edit', title: `Editando ${baseName(file)}`, body: `${file}\n\n${str(a.new_source)}` }
    case 'Glob':
      return { tool: 'search', title: `Buscando archivos «${clip(str(a.pattern), 50)}»`, body: str(a.path) || undefined }
    case 'Grep':
      return {
        tool: 'search',
        title: `Buscando «${clip(str(a.pattern), 50)}»`,
        body: [str(a.path), str(a.glob)].filter(Boolean).join('  ') || undefined
      }
    case 'LS':
      return { tool: 'search', title: `Mirando la carpeta ${baseName(file)}`, body: file || undefined }
    case 'WebSearch':
      return { tool: 'web', title: `Buscando en la web: «${clip(str(a.query), 60)}»` }
    case 'WebFetch':
      return { tool: 'web', title: `Consultando ${host(str(a.url))}`, body: [str(a.url), str(a.prompt)].filter(Boolean).join('\n\n') }
    case 'Bash':
    case 'PowerShell':
      return command(str(a.command))
    case 'BashOutput':
      return { tool: 'command', title: 'Mirando la salida de un comando' }
    case 'KillShell':
    case 'KillBash':
      return { tool: 'command', title: 'Parando un comando' }
    case 'Task':
    case 'Agent':
      return { tool: 'agent', title: `Delegando: ${clip(str(a.description) || 'una subtarea', 60)}`, body: str(a.prompt) || undefined }
    case 'TodoWrite':
      return todoTrace(
        a.todos,
        (t) => str(t.status) === 'completed',
        (t) => str(t.content),
        (t) => str(t.status) === 'in_progress'
      )
    case 'ExitPlanMode':
      return { tool: 'other', title: 'Presentando el plan', body: str(a.plan) || undefined }
    default:
      return { tool: 'other', title: `Usando ${name || 'una herramienta'}`, body: json(a) }
  }
}

/** Herramientas de Gemini CLI. */
export function geminiToolTrace(name: string, params: Json | null): ToolTrace {
  const a = params ?? {}
  const file = str(a.file_path) || str(a.absolute_path) || str(a.path)
  switch (name) {
    case 'read_file':
      return { tool: 'read', title: `Leyendo ${baseName(file)}`, body: file + range(a) }
    case 'read_many_files': {
      const paths = (Array.isArray(a.paths) ? a.paths : []).map(str).filter(Boolean)
      return { tool: 'read', title: 'Leyendo archivos', body: paths.join('\n') || undefined }
    }
    case 'write_file':
      return { tool: 'write', title: `Creando ${baseName(file)}`, body: `${file}\n\n${str(a.content)}` }
    case 'replace':
    case 'edit':
    case 'smart_edit':
      return { tool: 'edit', title: `Editando ${baseName(file)}`, body: `${file}\n\n${editDiff(str(a.old_string), str(a.new_string))}` }
    case 'glob':
      return { tool: 'search', title: `Buscando archivos «${clip(str(a.pattern), 50)}»`, body: str(a.path) || undefined }
    case 'search_file_content':
    case 'grep':
    case 'grep_search':
      return { tool: 'search', title: `Buscando «${clip(str(a.pattern), 50)}»`, body: [str(a.path), str(a.include)].filter(Boolean).join('  ') || undefined }
    case 'list_directory':
      return { tool: 'search', title: `Mirando la carpeta ${baseName(file)}`, body: file || undefined }
    case 'run_shell_command':
      return command(str(a.command))
    case 'google_web_search':
    case 'web_search':
      return { tool: 'web', title: `Buscando en la web: «${clip(str(a.query), 60)}»` }
    case 'web_fetch':
      return { tool: 'web', title: 'Consultando una web', body: str(a.prompt) || str(a.url) || undefined }
    case 'write_todos':
      return todoTrace(
        a.todos,
        (t) => str(t.status) === 'completed',
        (t) => str(t.description) || str(t.content),
        (t) => str(t.status) === 'in_progress'
      )
    default:
      return { tool: 'other', title: `Usando ${name || 'una herramienta'}`, body: json(a) }
  }
}

/** Herramientas propias de los modelos locales (LM Studio). */
export function localToolTrace(name: string, a: Json): ToolTrace {
  const file = str(a.path)
  switch (name) {
    case 'list_files':
      return { tool: 'search', title: `Mirando la carpeta ${file || '.'}` }
    case 'search_files':
      return { tool: 'search', title: `Buscando «${clip(str(a.query), 50)}»`, body: file || undefined }
    case 'read_file':
      return { tool: 'read', title: `Leyendo ${baseName(file)}`, body: file + range(a) }
    case 'write_file':
      return { tool: 'write', title: `Creando ${baseName(file)}`, body: `${file}\n\n${str(a.content)}` }
    case 'edit_file':
      return { tool: 'edit', title: `Editando ${baseName(file)}`, body: `${file}\n\n${editDiff(str(a.old_text) || str(a.old_string), str(a.new_text) || str(a.new_string))}` }
    case 'web_search':
      return { tool: 'web', title: `Buscando en la web: «${clip(str(a.query), 60)}»` }
    case 'fetch_url':
      return { tool: 'web', title: `Consultando ${host(str(a.url))}`, body: str(a.url) || undefined }
    case 'update_plan':
      return todoTrace(a.steps, (t) => t.done === true, (t) => str(t.text) || str(t.step) || str(t.title))
    default:
      return { tool: 'other', title: `Usando ${name || 'una herramienta'}`, body: json(a) }
  }
}
