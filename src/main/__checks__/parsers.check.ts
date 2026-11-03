/*
 * Offline sanity checks for the CLI adapters' JSONL parsers, plan parsing, quotas and helpers.
 * Not part of the app bundle. Run from the repo root:
 *
 *   npx esbuild src/main/__checks__/parsers.check.ts --bundle --platform=node --format=cjs \
 *     --tsconfig=tsconfig.node.json --outfile=%TEMP%/aicw-checks.cjs && node %TEMP%/aicw-checks.cjs
 *
 * Fixture lines were captured from real runs on this machine (Claude Code 2.1.296, Codex 0.154.0,
 * Gemini CLI 0.59.0) or follow their documented formats.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AppConfig, TraceEntry } from '@shared/types'
import { finishTrace, getTaskTrace, startTrace, traceUpdate } from '../taskTrace'
import { DEFAULT_CONFIG } from '@shared/defaults'
import { CLAUDE_AUTH_MESSAGE, claudeArgs, createClaudeParser } from '../agents/claude'
import { codexArgs, createCodexParser, lastRateLimitsIn, readCodexRateLimits } from '../agents/codex'
import { createGeminiParser, geminiArgs } from '../agents/gemini'
import { ThinkSplitter } from '../agents/ollama'
import { createQwenParser } from '../agents/qwen'
import { buildCommandLine, quoteArg } from '../agents/spawn'
import type { JsonlParser, ParserCallbacks, ProcessOutcome, RateLimitInfo } from '../agents/types'
import { parsePlan } from '../plan'
import { createHermesParser, hermesArgs } from '../agents/hermes'
import { createMuseParser, museArgs } from '../agents/muse'
import { artifactKind, resolveInProject, sanitizeFileName } from '../projects'
import { computeQuotas, initQuota, recordUsage, refreshQuotas, setClaudeRateLimit } from '../quota'

let passed = 0
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (e) {
    console.error(`FAIL  ${name}`)
    throw e
  }
}

interface Rec {
  activity: string[]
  thinking: number
  text: string[]
  progress: number[]
  usage: { contextUsed?: number; contextCapacity?: number }[]
  rate: RateLimitInfo[]
  files: string[]
}

function recorder(): { cb: ParserCallbacks; rec: Rec } {
  const rec: Rec = { activity: [], thinking: 0, text: [], progress: [], usage: [], rate: [], files: [] }
  const cb: ParserCallbacks = {
    onActivity: (t) => rec.activity.push(t),
    onThinking: () => rec.thinking++,
    onText: (t) => rec.text.push(t),
    onProgress: (p) => rec.progress.push(p),
    onUsage: (u) => rec.usage.push(u),
    onRateLimit: (r) => rec.rate.push(r),
    onFile: (f) => rec.files.push(f)
  }
  return { cb, rec }
}

function feed(p: JsonlParser, lines: string[]): void {
  for (const l of lines) {
    const t = l.trim()
    if (t.startsWith('{')) p.line(JSON.parse(t) as Record<string, unknown>)
    else p.raw?.(t)
  }
}

const OK_EXIT: ProcessOutcome = { code: 0, stderrTail: '', cancelled: false }

// ---------- fixtures ----------

const CLAUDE_REAL = [
  '{"type":"system","subtype":"init","cwd":"C:\\\\Users\\\\usuario\\\\AppData\\\\Local\\\\Temp\\\\aicw\\\\claude","session_id":"b264124d","tools":["Read","Write"],"mcp_servers":[],"model":"claude-haiku-5-5","permissionMode":"plan","apiKeySource":"none","claude_code_version":"2.1.296"}',
  '{"type":"assistant","message":{"model":"claude-sonnet-5-5","id":"msg_011","type":"message","role":"assistant","content":[{"type":"text","text":"hola"}],"stop_reason":null,"usage":{"input_tokens":2,"cache_creation_input_tokens":11275,"cache_read_input_tokens":15764,"output_tokens":4,"service_tier":"standard"}},"parent_tool_use_id":null,"session_id":"b264124d"}',
  '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1791678000,"rateLimitType":"five_hour","overageStatus":"rejected","overageDisabledReason":"org_level_disabled","isUsingOverage":false,"unifiedWindows":{"five_hour":{"utilization":0.25,"resetsAt":1791678000},"seven_day":{"utilization":0.06,"resetsAt":1791788400}}},"uuid":"faae909a","session_id":"b264124d"}',
  '{"duration_api_ms":1502,"stop_reason":"end_turn","session_id":"b264124d","total_cost_usd":0.0467204,"usage":{"input_tokens":2,"cache_creation_input_tokens":11275,"cache_read_input_tokens":15764,"output_tokens":4},"modelUsage":{"claude-sonnet-5-5":{"inputTokens":2,"outputTokens":4,"cacheReadInputTokens":15764,"cacheCreationInputTokens":11275,"contextWindow":1000000,"maxOutputTokens":128000}},"permission_denials":[],"terminal_reason":"completed","is_error":false,"num_turns":1,"subtype":"success","api_error_status":null,"result":"hola","type":"result","duration_ms":1579}'
]

const CLAUDE_AUTH_EXPIRED = [
  '{"type":"system","subtype":"init","cwd":"C:\\\\tmp","session_id":"s1","tools":[],"model":"claude-sonnet-5-5","permissionMode":"plan"}',
  '{"type":"assistant","message":{"model":"<synthetic>","role":"assistant","content":[{"type":"text","text":"Failed to authenticate: OAuth session expired. Please run /login"}],"usage":{"input_tokens":0,"output_tokens":0}},"session_id":"s1","error":"authentication_failed"}',
  '{"type":"result","subtype":"success","is_error":true,"result":"Failed to authenticate: OAuth session expired. Please run /login","terminal_reason":"api_error","usage":{"input_tokens":0,"output_tokens":0},"session_id":"s1"}'
]

const CODEX_REAL_OK = [
  '{"type":"thread.started","thread_id":"01a127b4-70cf-7c82-93f6-4b49a5135ee1"}',
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"hola"}}',
  '{"type":"turn.completed","usage":{"input_tokens":13468,"cached_input_tokens":2816,"cache_write_input_tokens":0,"output_tokens":5,"reasoning_output_tokens":0}}'
]

const CODEX_REAL_BAD_MODEL = [
  '{"type":"thread.started","thread_id":"01a127b4-29fa-7203-85dd-d79771e2f77a"}',
  '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Model metadata for `gpt-6-luna` not found. Defaulting to fallback metadata; this can degrade performance and cause issues."}}',
  '{"type":"turn.started"}',
  '{"type":"error","message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The \'gpt-6-luna\' model is not supported when using Codex with a ChatGPT account.\\"}}"}',
  '{"type":"turn.failed","error":{"message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The \'gpt-6-luna\' model is not supported when using Codex with a ChatGPT account.\\"}}"}}'
]

const GEMINI_REAL = [
  'Warning: 256-color support not detected. Using a terminal with at least 256-color support is recommended for a better visual experience.',
  'Ripgrep is not available. Falling back to GrepTool.',
  '{"type":"init","timestamp":"2026-10-10T21:25:20.220Z","session_id":"4069a2df","model":"gemini-3.1-flash-lite"}',
  '{"type":"message","timestamp":"2026-10-10T21:25:20.222Z","role":"user","content":"Responde solo: hola\\n\\nFollow the instructions above."}',
  '{"type":"tool_use","timestamp":"2026-10-10T21:25:25.669Z","tool_name":"update_topic","tool_id":"update_topic__call_204001","parameters":{"strategic_intent":"Initialize the session.","title":"Session Initialization"}}',
  '{"type":"tool_result","timestamp":"2026-10-10T21:25:25.686Z","tool_id":"update_topic__call_204001","status":"success","output":"..."}',
  '{"type":"message","timestamp":"2026-10-10T21:25:29.051Z","role":"assistant","content":"ho","delta":true}',
  '{"type":"message","timestamp":"2026-10-10T21:25:29.052Z","role":"assistant","content":"la","delta":true}',
  '{"type":"result","timestamp":"2026-10-10T21:25:29.075Z","status":"success","stats":{"total_tokens":21118,"input_tokens":19755,"output_tokens":29,"cached":8133,"input":11622,"duration_ms":8855,"tool_calls":1,"models":{"gemini-3.1-flash-lite":{"total_tokens":21118}}}}'
]

// Muse Code 1.4.6 en el Mac mini: «Crea hola.txt con el texto hola, ejecuta ls -la y responde: listo» (líneas reales).
const MUSE_SESSION = '"stream":{"kind":"session","id":"01a12de5-8073-7d41-8d3a-d05ef636b537"}'
const MUSE_RUN = '"command_id":"a1119975-1d2e-4baa-a848-bedb075bd0c8","run_stream":{"kind":"run","id":"a1119975-1d2e-4baa-a848-bedb075bd0c8"}'
const MUSE_REAL = [
  `{"schema_version":1,${MUSE_SESSION},"sequence":3,"record_type":"event","payload_type":"run.model.configured","payload":{"kind":"run_model_configured",${MUSE_RUN},"provider_id":"meta","profile_id":"tbh","model_id":"muse-spark-1.3","display_label":"muse-spark-1.3","source":"startup"}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":7,"record_type":"event","payload_type":"task.lifecycle.proposed","payload":{"kind":"task_lifecycle",${MUSE_RUN},"task_id":"01a12de5-8888-7e82-9f37-056e00d26d14","event":{"kind":"proposed","task_id":"01a12de5-8888-7e82-9f37-056e00d26d14","task_kind":"reminder.agent.skill-reminder"}}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":13,"record_type":"event","payload_type":"task.lifecycle.proposed","payload":{"kind":"task_lifecycle",${MUSE_RUN},"task_id":"01a12de5-88d9-7c02-937c-ae583a88f98f","event":{"kind":"proposed","task_id":"01a12de5-88d9-7c02-937c-ae583a88f98f","task_kind":"model.meta.response"}}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":19,"record_type":"event","payload_type":"task.lifecycle.status","payload":{"kind":"task_lifecycle",${MUSE_RUN},"task_id":"01a12de5-88d9-7c02-937c-ae583a88f98f","event":{"kind":"status","task_id":"01a12de5-88d9-7c02-937c-ae583a88f98f","message":"completed meta model stream attempt 1/10","details":{"phase":"stream_succeeded","facets":[{"kind":"external_attempt","system":"meta","operation":"model.response","attempt":1,"max_attempts":10,"error_kind":"stream_succeeded"},{"kind":"producer","detail":{"kind":"provider","provider":"meta","model":"muse-spark-1.3-contributor"}}]}}}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":22,"record_type":"event","payload_type":"task.lifecycle.proposed","payload":{"kind":"task_lifecycle",${MUSE_RUN},"task_id":"01a12de5-adbf-7b12-993d-4d8b71ad7d97","event":{"kind":"proposed","task_id":"01a12de5-adbf-7b12-993d-4d8b71ad7d97","task_kind":"tool.write_file"}}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":24,"record_type":"event","payload_type":"task.lifecycle.scheduled","payload":{"kind":"task_lifecycle",${MUSE_RUN},"task_id":"01a12de5-adbf-7b12-993d-4d8b71ad7d97","event":{"kind":"scheduled","task_id":"01a12de5-adbf-7b12-993d-4d8b71ad7d97","idempotency_key":"tool:call_01a12de5a895714991109358eaecaaba"}}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":28,"record_type":"event","payload_type":"task.lifecycle.output","payload":{"kind":"task_lifecycle",${MUSE_RUN},"task_id":"01a12de5-adbf-7b12-993d-4d8b71ad7d97","event":{"kind":"output","task_id":"01a12de5-adbf-7b12-993d-4d8b71ad7d97","chunk":"wrote 5 bytes to /Users/usuario/muse-prueba/hola.txt","final_result":true}}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":30,"record_type":"event","payload_type":"tool.result","payload":{"kind":"tool_result",${MUSE_RUN},"call_id":"call_01a12de5a895714991109358eaecaaba","text":"wrote 5 bytes to /Users/usuario/muse-prueba/hola.txt","edit_facts":{"tool_name":"write_file","path":"hola.txt","added":1},"correlation_facts":{"tool_name":"write_file","outcome":"success"}}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":48,"record_type":"event","payload_type":"task.lifecycle.proposed","payload":{"kind":"task_lifecycle",${MUSE_RUN},"task_id":"01a12de5-c32a-7cc1-90db-e0b3b894fa2a","event":{"kind":"proposed","task_id":"01a12de5-c32a-7cc1-90db-e0b3b894fa2a","task_kind":"tool.bash"}}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":50,"record_type":"event","payload_type":"task.lifecycle.scheduled","payload":{"kind":"task_lifecycle",${MUSE_RUN},"task_id":"01a12de5-c32a-7cc1-90db-e0b3b894fa2a","event":{"kind":"scheduled","task_id":"01a12de5-c32a-7cc1-90db-e0b3b894fa2a","idempotency_key":"tool:call_01a12de5b931738ba575776110e3a643"}}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":53,"record_type":"event","payload_type":"task.lifecycle.output","payload":{"kind":"task_lifecycle",${MUSE_RUN},"task_id":"01a12de5-c32a-7cc1-90db-e0b3b894fa2a","event":{"kind":"output","task_id":"01a12de5-c32a-7cc1-90db-e0b3b894fa2a","chunk":"{\\n  \\"chunk_id\\": \\"exec-1-1\\",\\n  \\"command\\": \\"ls -la\\",\\n  \\"description\\": \\"Listar archivos del directorio\\",\\n  \\"exit_code\\": 0,\\n  \\"terminal_status\\": \\"completed\\",\\n  \\"output\\": \\"total 96\\\\n-rw-r--r--   1 501  staff      5 Oct 11 21:16 hola.txt\\\\n\\",\\n  \\"truncated\\": false\\n}","final_result":true}}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":55,"record_type":"event","payload_type":"tool.result","payload":{"kind":"tool_result",${MUSE_RUN},"call_id":"call_01a12de5b931738ba575776110e3a643","text":"{}","correlation_facts":{"tool_name":"bash","outcome":"success"}}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":60,"record_type":"event","payload_type":"task.lifecycle.proposed","payload":{"kind":"task_lifecycle",${MUSE_RUN},"task_id":"01a12de5-c3fe-7db1-9003-6acee00b7504","event":{"kind":"proposed","task_id":"01a12de5-c3fe-7db1-9003-6acee00b7504","task_kind":"model.meta.response"}}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":66,"record_type":"status","durability":"ephemeral","payload_type":"run.output.delta","payload":{"kind":"run_output_delta",${MUSE_RUN},"text":"listo"}}`,
  `{"schema_version":1,${MUSE_SESSION},"sequence":84,"record_type":"event","payload_type":"run.terminal.completed","payload":{"kind":"run_terminal",${MUSE_RUN},"terminal":"completed","text":"listo","reason":null}}`
]

const CODEX_ROLLOUT_SAMPLE = [
  '{"timestamp":"2026-10-10T21:24:59Z","type":"session_meta","payload":{"id":"x"}}',
  '{"timestamp":"2026-10-10T21:25:00Z","type":"event_msg","payload":{"type":"token_count","info":null,"rate_limits":{"limit_id":"codex","limit_name":null,"primary":{"used_percent":40.0,"window_minutes":10080,"resets_at":1792166576},"secondary":null,"credits":{"has_credits":false,"unlimited":false,"balance":"0"},"individual_limit":null,"spend_control_reached":null,"plan_type":"prolite","rate_limit_reached_type":null}}}',
  '{"timestamp":"2026-10-10T21:25:05Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{}},"rate_limits":{"limit_id":"codex","limit_name":null,"primary":{"used_percent":53.0,"window_minutes":10080,"resets_at":1792166576},"secondary":{"used_percent":12.5,"window_minutes":300,"resets_at":1792000000},"credits":{"has_credits":false,"unlimited":false,"balance":"0"},"individual_limit":null,"spend_control_reached":null,"plan_type":"prolite","rate_limit_reached_type":null}}}',
  '{"timestamp":"2026-10-10T21:25:06Z","type":"event_msg","payload":{"type":"task_complete"}}'
]

async function main(): Promise<void> {
  console.log('Claude')
  await check('real success run: text, usage, context capacity, rate limits', () => {
    const { cb, rec } = recorder()
    const p = createClaudeParser(cb)
    feed(p, CLAUDE_REAL)
    const r = p.finish(OK_EXIT)
    assert.equal(r.ok, true)
    assert.equal(r.text, 'hola')
    assert.deepEqual(r.usage, { input: 2 + 11275 + 15764, output: 4, cached: 15764 })
    assert.equal(rec.rate.length, 1)
    const w = rec.rate[0].windows
    assert.equal(w.length, 2)
    assert.equal(w[0].name, 'five_hour')
    assert.equal(w[0].usedPct, 25)
    assert.equal(w[0].resetsAt, 1791678000 * 1000)
    assert.equal(w[1].usedPct, 6)
    assert.ok(rec.usage.some((u) => u.contextUsed === 2 + 11275 + 15764))
    assert.ok(rec.usage.some((u) => u.contextCapacity === 1_000_000))
    assert.deepEqual(rec.activity, ['Redactando'])
  })
  await check('expired login → auth', () => {
    const p = createClaudeParser({})
    feed(p, CLAUDE_AUTH_EXPIRED)
    const r = p.finish({ code: 1, stderrTail: '', cancelled: false })
    assert.equal(r.ok, false)
    assert.equal(r.errorKind, 'auth')
    assert.equal(r.errorMessage, CLAUDE_AUTH_MESSAGE)
  })
  await check('usage limit text → quota', () => {
    const p = createClaudeParser({})
    feed(p, [
      '{"type":"assistant","message":{"model":"<synthetic>","content":[{"type":"text","text":"Claude AI usage limit reached|1791678000"}]}}',
      '{"type":"result","subtype":"success","is_error":true,"result":"Claude AI usage limit reached|1791678000","terminal_reason":"api_error","session_id":"s"}'
    ])
    const r = p.finish({ code: 1, stderrTail: '', cancelled: false })
    assert.equal(r.errorKind, 'quota')
  })
  await check('rejected rate_limit_event → quota', () => {
    const { cb, rec } = recorder()
    const p = createClaudeParser(cb)
    feed(p, [
      '{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1791678000,"rateLimitType":"five_hour"}}',
      '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"","session_id":"s"}'
    ])
    const r = p.finish({ code: 1, stderrTail: '', cancelled: false })
    assert.equal(r.errorKind, 'quota')
    assert.match(r.errorMessage ?? '', /límite de uso/)
    assert.equal(rec.rate[0].status, 'rejected')
  })
  await check('tool activities, files, todo progress, thinking', () => {
    const { cb, rec } = recorder()
    const p = createClaudeParser(cb)
    feed(p, [
      '{"type":"assistant","message":{"model":"claude-sonnet-5-5","content":[{"type":"thinking","thinking":"..."}]}}',
      '{"type":"assistant","message":{"model":"claude-sonnet-5-5","content":[{"type":"tool_use","name":"Read","input":{"file_path":"C:\\\\p\\\\attachments\\\\brief.pdf"}}]}}',
      '{"type":"assistant","message":{"model":"claude-sonnet-5-5","content":[{"type":"tool_use","name":"Write","input":{"file_path":"C:\\\\p\\\\artifacts\\\\index.html","content":"x"}}]}}',
      '{"type":"assistant","message":{"model":"claude-sonnet-5-5","content":[{"type":"tool_use","name":"TodoWrite","input":{"todos":[{"content":"a","status":"completed"},{"content":"b","status":"in_progress"},{"content":"c","status":"pending"}]}}]}}',
      '{"type":"assistant","message":{"model":"claude-sonnet-5-5","content":[{"type":"tool_use","name":"Bash","input":{"command":"ls"}},{"type":"tool_use","name":"WebSearch","input":{}},{"type":"tool_use","name":"Grep","input":{}},{"type":"tool_use","name":"Task","input":{}},{"type":"tool_use","name":"Foo","input":{}}]}}',
      '{"type":"result","subtype":"success","is_error":false,"result":"Hecho","terminal_reason":"completed","session_id":"s"}'
    ])
    const r = p.finish(OK_EXIT)
    assert.equal(r.ok, true)
    assert.equal(rec.thinking, 1)
    assert.deepEqual(rec.activity, [
      'Leyendo brief.pdf',
      'Creando index.html',
      'Organizando las tareas',
      'Ejecutando un comando',
      'Buscando en la web',
      'Buscando archivos',
      'Delegando una subtarea',
      'Usando Foo'
    ])
    assert.deepEqual(rec.progress, [1 / 3])
    assert.deepEqual(rec.files, ['C:\\p\\artifacts\\index.html'])
  })
  await check('CLI not installed → missing', () => {
    const p = createClaudeParser({})
    const r = p.finish({ code: 9009, stderrTail: "'claude' is not recognized as an internal or external command", cancelled: false })
    assert.equal(r.errorKind, 'missing')
  })
  await check('cancelled', () => {
    const r = createClaudeParser({}).finish({ code: null, stderrTail: '', cancelled: true })
    assert.equal(r.errorKind, 'cancelled')
  })
  await check('args (plan/work, invalid model dropped)', () => {
    assert.deepEqual(claudeArgs('haiku', 'plan'), [
      '-p', '--output-format', 'stream-json', '--verbose', '--model', 'haiku', '--permission-mode', 'plan', '--strict-mcp-config', '--no-session-persistence'
    ])
    assert.ok(!claudeArgs('bad model; rm', 'work').includes('--model'))
    assert.ok(claudeArgs('', 'work').includes('acceptEdits'))
    // Acceso completo: trabaja sin pedir permisos; planificar sigue siendo de solo lectura.
    const mode = (args: string[]) => args[args.indexOf('--permission-mode') + 1]
    assert.equal(mode(claudeArgs('', 'work', 'full')), 'bypassPermissions')
    assert.equal(mode(claudeArgs('', 'plan', 'full')), 'plan')
  })

  console.log('Codex')
  await check('real success run', () => {
    const p = createCodexParser({})
    feed(p, CODEX_REAL_OK)
    const r = p.finish(OK_EXIT)
    assert.equal(r.ok, true)
    assert.equal(r.text, 'hola')
    assert.deepEqual(r.usage, { input: 13468, output: 5, cached: 2816 })
  })
  await check('real "model not supported" run → modelUnavailable', () => {
    const p = createCodexParser({})
    feed(p, CODEX_REAL_BAD_MODEL)
    const r = p.finish({ code: 1, stderrTail: '', cancelled: false })
    assert.equal(r.ok, false)
    assert.equal(r.modelUnavailable, true)
    assert.equal(r.errorKind, 'failed')
  })
  await check('items → activity, files, progress, thinking', () => {
    const { cb, rec } = recorder()
    const p = createCodexParser(cb)
    feed(p, [
      '{"type":"item.completed","item":{"id":"1","type":"reasoning","text":"**Planning**"}}',
      '{"type":"item.started","item":{"id":"2","type":"command_execution","command":"powershell -Command Get-ChildItem -Recurse -Force | Select-Object -First 20","status":"in_progress"}}',
      '{"type":"item.completed","item":{"id":"3","type":"file_change","changes":[{"path":"E:\\\\p\\\\artifacts\\\\app.py","kind":"add"},{"path":"E:\\\\p\\\\artifacts\\\\README.md","kind":"add"}],"status":"completed"}}',
      '{"type":"item.started","item":{"id":"4","type":"todo_list","items":[{"text":"a","completed":true},{"text":"b","completed":false}]}}',
      '{"type":"item.updated","item":{"id":"4","type":"todo_list","items":[{"text":"a","completed":true},{"text":"b","completed":true}]}}',
      '{"type":"item.started","item":{"id":"5","type":"web_search","query":"x"}}',
      '{"type":"item.completed","item":{"id":"6","type":"agent_message","text":"Listo: creé app.py"}}',
      '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":50,"output_tokens":10,"reasoning_output_tokens":5}}'
    ])
    const r = p.finish(OK_EXIT)
    assert.equal(r.ok, true)
    assert.equal(r.text, 'Listo: creé app.py')
    assert.equal(rec.thinking, 1)
    assert.equal(rec.activity[0], 'Ejecutando: powershell -Command Get-ChildItem -Recu…')
    assert.equal(rec.activity[1], 'Editando app.py, README.md')
    assert.ok(rec.activity.includes('Buscando en la web'))
    assert.deepEqual(rec.progress, [0.5, 1])
    assert.equal(rec.files.length, 2)
    assert.deepEqual(r.usage, { input: 100, output: 15, cached: 50 })
  })
  await check('usage limit → quota, 401 → auth', () => {
    const q = createCodexParser({})
    feed(q, ['{"type":"turn.failed","error":{"message":"You\'ve hit your usage limit. Try again later."}}'])
    assert.equal(q.finish({ code: 1, stderrTail: '', cancelled: false }).errorKind, 'quota')
    const a = createCodexParser({})
    feed(a, ['{"type":"error","message":"unexpected status 401 Unauthorized: token expired"}'])
    assert.equal(a.finish({ code: 1, stderrTail: '', cancelled: false }).errorKind, 'auth')
  })
  // En Windows se fuerza el modo protegido estándar (el «elevated» de la app de Codex falla).
  const WIN_SANDBOX = process.platform === 'win32' ? ['-c', 'windows.sandbox=unelevated'] : []
  await check('args: images first, stdin dash last, unsafe image dropped', () => {
    assert.deepEqual(codexArgs('gpt-6-astra', 'work', ['attachments/a.png', 'attachments\\b.jpg', '../x.png', 'C:/abs.png']), [
      'exec', '-i', 'attachments/a.png', '-i', 'attachments/b.jpg', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', ...WIN_SANDBOX, '-m', 'gpt-6-astra', '-'
    ])
    assert.deepEqual(codexArgs('', 'plan'), ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', ...WIN_SANDBOX, '-'])
    // Acceso completo: sin entorno protegido al trabajar (puede instalar y usar internet).
    assert.deepEqual(codexArgs('', 'work', [], 'full'), ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'danger-full-access', '-'])
    assert.deepEqual(codexArgs('', 'plan', [], 'full'), codexArgs('', 'plan'))
  })
  await check('hermes: solo la respuesta, sin avisos; args sin texto del usuario', () => {
    const p = createHermesParser()
    const feed = (l: string): void => (l.trim().startsWith('{') ? p.line(JSON.parse(l)) : p.raw!(l))
    ;[
      'hermes: source-update completion failed: an update is still running',
      'Preparing the isolated Hermes runtime…',
      '  → Installing Python dependencies…',
      '  ✓ Installing Python dependencies',
      '⚠ install out of sync (ffmpeg: not installed or outdated)',
      '{"reply":"ok","tasks":[]}',
      'session_id: 20261010_194225_40291e'
    ].forEach(feed)
    const r = p.finish({ code: 0, stderrTail: '', cancelled: false })
    assert.equal(r.ok, true)
    assert.equal(r.text, '{"reply":"ok","tasks":[]}')
    assert.deepEqual(parsePlan(r.text).tasks, [])
    const auth = createHermesParser()
    auth.raw!('Error: 401 Unauthorized from provider')
    assert.equal(auth.finish({ code: 1, stderrTail: '', cancelled: false }).errorKind, 'auth')
    const args = hermesArgs(String.raw`C:\Temp\ai-cowork-hermes\q.txt`, 'auto/smart', 'plan')
    assert.deepEqual(args.slice(0, 4), ['chat', '-Q', '--query-file', 'C:/Temp/ai-cowork-hermes/q.txt'])
    assert.ok(args.includes('web,memory,skills,todo,session_search'))
    assert.ok(!args.join(' ').includes('terminal'), 'al planificar no tiene terminal')
  })
  await check('rollout: last rate_limits object', () => {
    const rl = lastRateLimitsIn(CODEX_ROLLOUT_SAMPLE.join('\n'))
    assert.ok(rl)
    assert.equal((rl!.primary as { used_percent: number }).used_percent, 53)
  })
  await check('rollout dir walk (synthetic ~/.codex)', async () => {
    const home = mkdtempSync(join(tmpdir(), 'aicw-codex-'))
    try {
      const older = join(home, 'sessions', '2026', '10', '09')
      const newer = join(home, 'sessions', '2026', '10', '10')
      mkdirSync(older, { recursive: true })
      mkdirSync(newer, { recursive: true })
      writeFileSync(join(older, 'rollout-a.jsonl'), CODEX_ROLLOUT_SAMPLE.slice(0, 2).join('\n'))
      // newest file without rate limits (failed run) → must fall back to the next one
      writeFileSync(join(newer, 'rollout-c.jsonl'), CODEX_REAL_BAD_MODEL.join('\n'))
      writeFileSync(join(newer, 'rollout-b.jsonl'), CODEX_ROLLOUT_SAMPLE.join('\n'))
      const t = Date.now() / 1000
      utimesSync(join(older, 'rollout-a.jsonl'), t - 300, t - 300)
      utimesSync(join(newer, 'rollout-b.jsonl'), t - 100, t - 100)
      utimesSync(join(newer, 'rollout-c.jsonl'), t - 10, t - 10)
      const r = await readCodexRateLimits(home)
      assert.ok(r)
      assert.equal(r!.windows.primary?.usedPercent, 53)
      assert.equal(r!.windows.secondary?.windowMinutes, 300)
      assert.equal(r!.planType, 'prolite')
      assert.ok(r!.file.endsWith('rollout-b.jsonl'))
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  console.log('Gemini')
  await check('real success run (warnings ignored, deltas concatenated)', () => {
    const { cb, rec } = recorder()
    const p = createGeminiParser(cb)
    feed(p, GEMINI_REAL)
    const r = p.finish(OK_EXIT)
    assert.equal(r.ok, true)
    assert.equal(r.text, 'hola')
    assert.equal(r.model, 'gemini-3.1-flash-lite')
    assert.deepEqual(r.usage, { input: 19755, output: 29, cached: 8133 })
    assert.equal(rec.activity[0], 'Organizando el trabajo')
  })
  await check('tools, todos, quota/auth errors', () => {
    const { cb, rec } = recorder()
    const p = createGeminiParser(cb)
    feed(p, [
      '{"type":"init","model":"auto"}',
      '{"type":"tool_use","tool_name":"read_file","parameters":{"absolute_path":"E:\\\\p\\\\attachments\\\\datos.csv"}}',
      '{"type":"tool_use","tool_name":"write_file","parameters":{"file_path":"artifacts/informe.md","content":"x"}}',
      '{"type":"tool_use","tool_name":"write_todos","parameters":{"todos":[{"description":"a","status":"completed"},{"description":"b","status":"pending"}]}}',
      '{"type":"tool_use","tool_name":"google_web_search","parameters":{"query":"x"}}',
      '{"type":"message","role":"assistant","content":"Listo","delta":true}',
      '{"type":"result","status":"success","stats":{"input_tokens":10,"output_tokens":2,"cached":0}}'
    ])
    assert.equal(p.finish(OK_EXIT).ok, true)
    assert.deepEqual(rec.activity.slice(0, 4), ['Leyendo datos.csv', 'Creando informe.md', 'Organizando las tareas', 'Buscando en la web'])
    assert.deepEqual(rec.progress, [0.5])
    assert.deepEqual(rec.files, ['artifacts/informe.md'])
    const q = createGeminiParser({})
    feed(q, ['{"type":"init","model":"auto"}', '{"type":"result","status":"error","error":{"type":"FatalError","message":"[API Error: 429 RESOURCE_EXHAUSTED] Quota exceeded"}}'])
    assert.equal(q.finish({ code: 1, stderrTail: '', cancelled: false }).errorKind, 'quota')
    const a = createGeminiParser({})
    a.line({ type: 'init' })
    assert.equal(a.finish({ code: 1, stderrTail: 'Error: API key not valid. Please pass a valid API key.', cancelled: false }).errorKind, 'auth')
  })
  await check('args + command line quoting', () => {
    const line = buildCommandLine('gemini', geminiArgs('gemini-3.1-flash-lite', 'plan'))
    assert.equal(
      line,
      'gemini -p "Follow the instructions above." -o stream-json --skip-trust --approval-mode plan -m gemini-3.1-flash-lite --allowed-mcp-server-names none'
    )
    assert.ok(geminiArgs('', 'work').includes('auto_edit'))
    assert.ok(geminiArgs('', 'work', 'full').includes('yolo'))
    assert.ok(geminiArgs('', 'plan', 'full').includes('plan') && !geminiArgs('', 'plan', 'full').includes('yolo'))
    assert.throws(() => quoteArg('a&b'))
    assert.throws(() => quoteArg('"x"'))
    assert.throws(() => quoteArg('%PATH%'))
    assert.throws(() => buildCommandLine('rm -rf', []))
  })

  console.log('Muse Code')
  await check('real run (Mac mini): piensa, escribe hola.txt, ejecuta ls -la y responde', () => {
    const { cb, rec } = recorder()
    const steps: Array<{ type: string; id?: string; title?: string; ok?: boolean; output?: string; text?: string }> = []
    const p = createMuseParser({ ...cb, onTrace: (u) => steps.push(u as never) })
    feed(p, MUSE_REAL)
    const r = p.finish({ code: 0, stderrTail: 'muse: workspace root: /Users/usuario/muse-prueba (cwd default)\nmuse: Agent delegation: auto unavailable: workspace is untrusted.\n', cancelled: false })
    assert.equal(r.ok, true)
    assert.equal(r.text, 'listo')
    assert.equal(r.model, 'muse-spark-1.3')
    assert.deepEqual(r.usage, { input: 0, output: 0, cached: 0 })
    assert.deepEqual(rec.files, ['hola.txt'])
    assert.ok(rec.thinking >= 1, 'piensa antes de actuar')
    assert.ok(rec.activity.includes('Escribiendo hola.txt'))
    assert.ok(rec.activity.includes('Ejecutando: ls -la'))
    assert.deepEqual(rec.text, ['listo'])
    // El registro de la tarea: la escritura (con su archivo) y el comando con su salida, en el mismo paso.
    const write = steps.filter((s) => s.id === '01a12de5-adbf-7b12-993d-4d8b71ad7d97')
    assert.deepEqual(write.map((s) => s.title ?? (s.ok ? 'ok' : 'falló')), ['Escribiendo un archivo', 'ok', 'Escribiendo hola.txt'])
    const cmd = steps.filter((s) => s.id === '01a12de5-c32a-7cc1-90db-e0b3b894fa2a')
    assert.equal(cmd[1].title, 'Ejecutando: ls -la')
    assert.equal(cmd[2].ok, true)
    assert.match(cmd[2].output ?? '', /hola\.txt/)
  })

  await check('fallos: límite del plan → quota, sesión → auth, sin CLI → missing, cancelada', () => {
    const term = (reason: string): string =>
      `{"schema_version":1,"record_type":"event","payload_type":"run.terminal.failed","payload":{"kind":"run_terminal","terminal":"failed","text":"","reason":${JSON.stringify(reason)}}}`
    const quota = createMuseParser({})
    feed(quota, [term('provider error: 429 Too Many Requests: usage limit reached for this 5-hour window')])
    assert.equal(quota.finish({ code: 1, stderrTail: '', cancelled: false }).errorKind, 'quota')
    const auth = createMuseParser({})
    feed(auth, [term('meta provider: 401 Unauthorized (credentials expired)')])
    const a = auth.finish({ code: 1, stderrTail: '', cancelled: false })
    assert.equal(a.errorKind, 'auth')
    assert.match(a.errorMessage ?? '', /\/login/)
    const missing = createMuseParser({}).finish({ code: 127, stderrTail: 'zsh: command not found: muse', cancelled: false })
    assert.equal(missing.errorKind, 'missing')
    assert.equal(createMuseParser({}).finish({ code: null, stderrTail: '', cancelled: true }).errorKind, 'cancelled')
    // Sin terminar y sin más que los avisos de Muse: error genérico, sin los avisos.
    const odd = createMuseParser({}).finish({ code: 1, stderrTail: 'muse: workspace root: /tmp/x (cwd default)\n', cancelled: false })
    assert.equal(odd.errorKind, 'failed')
    assert.doesNotMatch(odd.errorMessage ?? '', /workspace root/)
  })

  await check('args: planificar sin escribir; proyecto con sandbox sin red; acceso completo; imágenes y modelo', () => {
    const plan = museArgs('/tmp/p.md', '', 'plan')
    assert.deepEqual(plan, ['exec', '--json', '--prompt-file', '/tmp/p.md', '--no-session-log', '--disable-approval', '--disable-write', '--disable-shell'])
    const project = museArgs('/tmp/p.md', '', 'work', ['attachments/a.png', '../x.png'], 'project', 'medium')
    assert.deepEqual(project.slice(5), ['--disable-approval', '--trust-workspace', '--sandbox-network', 'restricted', '--image', 'attachments/a.png', '--reasoning-effort', 'medium'])
    const full = museArgs('/tmp/p.md', 'muse-spark-1.2', 'work', [], 'full')
    assert.deepEqual(full.slice(5), ['--yolo', '--model', 'muse-spark-1.2'])
    // Sin modelo, Muse Code usa el suyo (respeta el modo Contributor); nunca el texto del encargo en la orden.
    assert.ok(!project.includes('--model'))
  })

  console.log('Qwen Code (format detection)')
  await check('claude-style and gemini-style streams', () => {
    const c = createQwenParser({})
    feed(c, CLAUDE_REAL)
    assert.equal(c.finish(OK_EXIT).text, 'hola')
    const g = createQwenParser({})
    feed(g, GEMINI_REAL)
    assert.equal(g.finish(OK_EXIT).text, 'hola')
  })

  console.log('Ollama')
  await check('think splitter', () => {
    const s = new ThinkSplitter()
    const outs: [string, string][] = ['<thi', 'nk>razono', ' mucho</think>\n\nHola', ' mundo <', 'b>'].map((c) => s.push(c))
    assert.equal(s.visible, 'Hola mundo <b>')
    assert.equal(outs.map((o) => o[0]).join(''), 'Hola mundo <b>')
    assert.equal(outs.map((o) => o[1]).join(''), 'razono mucho')
  })

  console.log('Task trace (ver lo que hace el agente)')
  const traceOf = (make: (cb: ParserCallbacks) => JsonlParser, lines: string[], taskId: string): TraceEntry[] => {
    startTrace(taskId, 'p1')
    const p = make({ onTrace: (u) => traceUpdate(taskId, u) })
    feed(p, lines)
    finishTrace(taskId)
    return getTaskTrace(taskId)
  }
  await check('Claude: razonamiento, comando con su resultado, edición como diff y respuesta', () => {
    const e = traceOf(createClaudeParser, [
      '{"type":"assistant","message":{"model":"claude-x","content":[{"type":"thinking","thinking":"Miro los tests"},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"npm test","description":"Run tests"}}]}}',
      '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"2 failing","is_error":true}]}}',
      '{"type":"assistant","message":{"model":"claude-x","content":[{"type":"tool_use","id":"t2","name":"Edit","input":{"file_path":"/p/a.js","old_string":"x = 1","new_string":"x = 2"}}]}}',
      '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t2","content":[{"type":"text","text":"ok"}]}]}}',
      '{"type":"assistant","message":{"model":"claude-x","content":[{"type":"text","text":"Arreglado"}]}}'
    ], 'trace-claude')
    assert.deepEqual(e.map((x) => x.kind), ['thinking', 'tool', 'tool', 'text'])
    assert.equal(e[1].title, 'Ejecutando: npm test')
    assert.equal(e[1].ok, false)
    assert.equal(e[1].output, '2 failing')
    assert.equal(e[2].tool, 'edit')
    assert.match(e[2].body ?? '', /- x = 1\n\+ x = 2/)
    assert.equal(e[2].ok, true)
    assert.equal(e[3].body, 'Arreglado')
  })
  await check('Codex: el comando empieza y luego llega su salida (misma entrada); la lista de pasos se actualiza', () => {
    const e = traceOf(createCodexParser, [
      '{"type":"item.completed","item":{"id":"r1","type":"reasoning","text":"**Plan**"}}',
      '{"type":"item.started","item":{"id":"c1","type":"command_execution","command":"bash -lc \'npm test\'","status":"in_progress"}}',
      '{"type":"item.completed","item":{"id":"c1","type":"command_execution","command":"bash -lc \'npm test\'","aggregated_output":"fail","exit_code":1,"status":"failed"}}',
      '{"type":"item.started","item":{"id":"l1","type":"todo_list","items":[{"text":"a","completed":true},{"text":"b","completed":false}]}}',
      '{"type":"item.updated","item":{"id":"l1","type":"todo_list","items":[{"text":"a","completed":true},{"text":"b","completed":true}]}}',
      '{"type":"item.completed","item":{"id":"f1","type":"file_change","changes":[{"path":"/p/app.js","kind":"add"}],"status":"completed"}}',
      '{"type":"item.completed","item":{"id":"m1","type":"agent_message","text":"Listo"}}'
    ], 'trace-codex')
    assert.deepEqual(e.map((x) => x.kind), ['thinking', 'tool', 'tool', 'tool', 'text'])
    assert.equal(e[1].title, 'Ejecutando: npm test')
    assert.equal(e[1].ok, false)
    assert.match(e[1].output ?? '', /fail\n\(código de salida 1\)/)
    assert.equal(e[2].title, 'Lista de pasos (2/2)')
    assert.equal(e[2].body, '☑ a\n☑ b')
    assert.equal(e[3].body, 'nuevo: /p/app.js')
    assert.equal(e[3].ok, true)
  })
  await check('Gemini: texto en trozos se junta en un paso; herramienta con su resultado', () => {
    const e = traceOf(createGeminiParser, [
      '{"type":"init","model":"gemini-x"}',
      '{"type":"message","role":"assistant","content":"Hola ","delta":true}',
      '{"type":"message","role":"assistant","content":"mundo","delta":true}',
      '{"type":"tool_use","tool_name":"run_shell_command","tool_id":"g1","parameters":{"command":"ls"}}',
      '{"type":"tool_result","tool_id":"g1","status":"success","output":"a.txt"}'
    ], 'trace-gemini')
    assert.deepEqual(e.map((x) => x.kind), ['text', 'tool'])
    assert.equal(e[0].body, 'Hola mundo')
    assert.equal(e[1].output, 'a.txt')
    assert.equal(e[1].ok, true)
  })
  await check('Muse: su respuesta llega a trozos y se junta entera (no se queda solo el último)', () => {
    const delta = (seq: number, text: string): string =>
      `{"schema_version":1,${MUSE_SESSION},"sequence":${seq},"record_type":"status","durability":"ephemeral","payload_type":"run.output.delta","payload":{"kind":"run_output_delta",${MUSE_RUN},"text":${JSON.stringify(text)}}}`
    const e = traceOf(createMuseParser, [delta(1, 'Reviso '), delta(2, 'el vídeo '), delta(3, 'y te cuento.')], 'trace-muse')
    assert.deepEqual(e.map((x) => x.kind), ['text'])
    assert.equal(e[0].body, 'Reviso el vídeo y te cuento.')
  })

  console.log('Plan parsing')
  await check('fenced json, prose around, braces in strings', () => {
    const t = 'Claro, aquí va el plan:\n```json\n{"reply":"Vamos {allá}","tasks":[{"key":"t1","title":"A","description":"usa {x}","agent":"codex","difficulty":"easy","dependsOn":[],"deliverable":"file"}]}\n```\nSaludos'
    const p = parsePlan(t)
    assert.equal(p.reply, 'Vamos {allá}')
    assert.equal(p.tasks.length, 1)
    const bare = parsePlan('Nota {no json} y luego {"reply": "ok", "tasks": []} fin')
    assert.equal(bare.reply, 'ok')
    const prose = parsePlan('Solo texto, sin JSON.')
    assert.equal(prose.reply, 'Solo texto, sin JSON.')
    assert.deepEqual(prose.tasks, [])
  })

  console.log('Projects helpers')
  await check('sanitizeFileName / artifactKind / resolveInProject', () => {
    assert.equal(sanitizeFileName('Mi foto (1).PNG'), 'Mi-foto-1.PNG')
    assert.equal(sanitizeFileName('año 2024 ñandú.txt'), 'ano-2024-nandu.txt')
    assert.equal(sanitizeFileName('..\\..\\evil.png'), 'evil.png')
    assert.equal(sanitizeFileName('???'), 'archivo')
    assert.equal(artifactKind('artifacts/index.HTML'), 'html')
    assert.equal(artifactKind('a/b.md'), 'markdown')
    assert.equal(artifactKind('x.svg'), 'image')
    assert.equal(artifactKind('x.py'), 'code')
    assert.equal(artifactKind('x.txt'), 'text')
    assert.equal(artifactKind('x.pdf'), 'other')
    const dir = join(tmpdir(), 'proj')
    assert.ok(resolveInProject(dir, 'artifacts/a.html'))
    assert.equal(resolveInProject(dir, '../outside.txt'), null)
    assert.equal(resolveInProject(dir, 'artifacts/../../x'), null)
    assert.equal(resolveInProject(dir, 'C:/Windows/win.ini'), null)
  })

  console.log('Quotas')
  await check('local / claude real / codex real / gemini none / estimates', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aicw-quota-'))
    const home = mkdtempSync(join(tmpdir(), 'aicw-codexq-'))
    const prevHome = process.env.CODEX_HOME
    try {
      const cfg: AppConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig
      cfg.workspaceRoot = root
      initQuota(root, () => cfg, () => cfg.agents)
      let q = computeQuotas(cfg, cfg.agents)
      const byId = (id: string) => q.find((x) => x.id === id)!
      assert.equal(byId('local').unlimited, true)
      assert.equal(byId('local').kind, 'local')
      assert.equal(byId('anthropic').remainingPct, null)
      assert.equal(byId('anthropic').source, 'none')
      assert.match(byId('google').note ?? '', /no informa la cuota/)
      assert.deepEqual(byId('anthropic').agentIds, ['claude'])

      // Claude real data from a rate_limit_event (future reset times)
      const now = Date.now()
      setClaudeRateLimit({
        provider: 'claude',
        status: 'allowed',
        windows: [
          { name: 'five_hour', usedPct: 25, resetsAt: now + 3600_000 },
          { name: 'seven_day', usedPct: 6, resetsAt: now + 5 * 86400_000 }
        ],
        receivedAt: now
      })
      // Gemini budget estimate
      cfg.quotaGroups.find((g) => g.id === 'google')!.budget = { limit: 1000, unit: 'tokens', period: 'diario' }
      recordUsage('google', 250)
      recordUsage('google', 150)
      // Codex real data (synthetic CODEX_HOME)
      const day = join(home, 'sessions', '2026', '10', '10')
      mkdirSync(day, { recursive: true })
      const future = Math.floor(now / 1000) + 86400
      writeFileSync(
        join(day, 'rollout-z.jsonl'),
        CODEX_ROLLOUT_SAMPLE.join('\n').replace(/1792166576/g, String(future)).replace(/1792000000/g, String(future - 3600))
      )
      process.env.CODEX_HOME = home
      q = await refreshQuotas({ codex: true })
      const a = byId('anthropic')
      assert.equal(a.source, 'real')
      assert.equal(a.remainingPct, 75)
      assert.equal(a.period, 'Ventana de 5 h')
      const o = byId('openai')
      assert.equal(o.source, 'real')
      assert.equal(o.remainingPct, 47) // min(100-53, 100-12.5)
      assert.equal(o.period, 'Ventana semanal')
      assert.equal(o.resetsAt, future * 1000)
      assert.match(o.note ?? '', /Ventana de 5 h: 88% restante/)
      const g = byId('google')
      assert.equal(g.source, 'estimate')
      assert.equal(g.kind, 'tokens')
      assert.equal(g.remainingPct, 60)
      assert.equal(g.remaining, 600)
      assert.equal(g.usedTokens, 400)
      assert.equal(g.usedRequests, 2)
      console.log('     ', JSON.stringify(q.map((x) => [x.id, x.remainingPct, x.source, x.period ?? ''])))
    } finally {
      if (prevHome === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = prevHome
      rmSync(root, { recursive: true, force: true })
      rmSync(home, { recursive: true, force: true })
    }
  })
  await check('real ~/.codex rollout on this machine (informational)', async () => {
    const r = await readCodexRateLimits()
    console.log('     ', r ? JSON.stringify({ ...r.windows, plan: r.planType, reached: r.reachedType, updatedAt: new Date(r.updatedAt).toISOString() }) : 'no data')
  })

  console.log(`\n${passed} checks passed`)
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
