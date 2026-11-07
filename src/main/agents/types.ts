import type { AgentAccess, AgentConfig, Effort, ProviderKind, TokenUsage, TraceTool } from '@shared/types'

export type AgentMode = 'plan' | 'work'

export type AgentErrorKind = 'auth' | 'quota' | 'missing' | 'offline' | 'failed' | 'cancelled'

/** One rate-limit window reported by a CLI (utilization 0..100). */
export interface RateLimitWindow {
  /** 'five_hour' | 'seven_day' | ... (as reported). */
  name: string
  usedPct: number | null
  resetsAt?: number | null
}

export interface RateLimitInfo {
  provider: ProviderKind
  /** 'allowed' | 'allowed_warning' | 'rejected' | ... */
  status?: string
  windows: RateLimitWindow[]
  /** Global reset time (ms) when no per-window data exists. */
  resetsAt?: number | null
  receivedAt: number
}

export interface UsageUpdate {
  /** Tokens of context used by the latest model call. */
  contextUsed?: number
  contextCapacity?: number
}

export type { Effort }

/**
 * Un paso para el registro de la tarea. Con `id`, un paso posterior con el mismo id lo actualiza
 * (el resultado de una herramienta, una lista de pasos que avanza…). `delta` añade texto al último paso igual.
 */
export type TraceUpdate =
  | { type: 'thinking'; text: string; delta?: boolean; id?: string }
  | { type: 'text'; text: string; delta?: boolean; id?: string }
  | { type: 'tool'; id?: string; tool: TraceTool; title: string; body?: string }
  | { type: 'result'; id: string; ok: boolean; output?: string }
  | { type: 'note'; text: string; error?: boolean }

/** Cómo lanzar un servidor MCP por stdio. */
export interface McpServerLaunch {
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  /** La misma configuración en un archivo JSON ({ mcpServers }): lo que se pasa por la línea de comandos. */
  configFile: string
}

export interface RunAgentOptions {
  agent: AgentConfig
  /** Model to pass to the CLI ('' = CLI default). */
  model: string
  /** Esfuerzo de razonamiento (sin indicar = el predeterminado del CLI). */
  effort?: Effort
  prompt: string
  /** Project directory (absolute). */
  cwd: string
  mode: AgentMode
  /** Permisos al trabajar (por defecto, solo la carpeta del proyecto). */
  access?: AgentAccess
  /** Image attachments as paths RELATIVE to cwd. */
  images?: string[]
  /**
   * Sesión anterior del CLI que retomar (Claude: session_id; Codex: thread_id). El agente vuelve con lo que leyó,
   * hizo y decidió entonces en su memoria de trabajo. Solo tiene sentido en la misma carpeta y la misma familia.
   */
  resume?: string
  /**
   * Mensaje directo del usuario («@Agente …»): el prompt es su texto tal cual y no se le añaden instrucciones de
   * equipo (LM Studio lo manda sin su mensaje de sistema).
   */
  direct?: boolean
  /** Servidor MCP de AI Cowork para esta tarea (solo los CLI que lo admiten por la línea de comandos). */
  mcp?: McpServerLaunch
  signal: AbortSignal
  /** Human readable activity (Spanish). `kind` tells if it came from a tool or from text output. */
  onActivity?: (text: string, kind: 'tool' | 'text') => void
  onThinking?: (text: string) => void
  onText?: (text: string) => void
  /** Real progress 0..1 (only from todo lists). */
  onProgress?: (progress: number) => void
  onUsage?: (usage: UsageUpdate) => void
  onRateLimit?: (info: RateLimitInfo) => void
  /** A file the agent wrote/edited (absolute or relative to cwd), when the CLI reports it. */
  onFile?: (path: string) => void
  /** Paso a paso de lo que hace (para ver la tarea en directo). Se llama antes que onActivity del mismo paso. */
  onTrace?: (update: TraceUpdate) => void
}

export interface RunAgentResult {
  ok: boolean
  /** Final answer text. */
  text: string
  usage: TokenUsage
  errorKind?: AgentErrorKind
  /** Short Spanish message for the UI. */
  errorMessage?: string
  /** The CLI rejected the model (e.g. light model not available for this account). */
  modelUnavailable?: boolean
  /** Resolved model reported by the CLI, if any. */
  model?: string
  /** Sesión del CLI que se puede retomar después con `resume` (Claude: session_id; Codex: thread_id). */
  sessionId?: string
}

/** Callbacks a pure JSONL parser invokes; same names as RunAgentOptions. */
export type ParserCallbacks = Pick<
  RunAgentOptions,
  'onActivity' | 'onThinking' | 'onText' | 'onProgress' | 'onUsage' | 'onRateLimit' | 'onFile' | 'onTrace'
>

/** Outcome of the CLI process, given to a parser to compute the final result. */
export interface ProcessOutcome {
  code: number | null
  stderrTail: string
  spawnError?: Error
  cancelled: boolean
  timedOut?: boolean
}

export interface JsonlParser {
  /** Si existe, la salida llega aquí tal cual (sin partirla en líneas ni descartar vacías) y no se usa line/raw. */
  chunk?(text: string): void
  line(obj: Record<string, unknown>): void
  /** Non-JSON stdout lines (warnings, etc.). */
  raw?(line: string): void
  finish(outcome: ProcessOutcome): RunAgentResult
}

export const EMPTY_USAGE: TokenUsage = { input: 0, output: 0, cached: 0 }
