/*
 * Offline simulation of the orchestrator with fake CLIs (no network, no paid calls).
 * Run from the repo root:
 *
 *   npx esbuild src/main/__checks__/orchestrator.check.ts --bundle --platform=node --format=cjs \
 *     --tsconfig=tsconfig.node.json --alias:electron=./src/main/__checks__/electron-stub.ts \
 *     --outfile=%TEMP%/aicw-orch.cjs && node %TEMP%/aicw-orch.cjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChatMessage, CoworkEvent, ProjectState, Task } from '@shared/types'
import { SUBAGENT_COLOR } from '@shared/defaults'
import type { RunAgentOptions, RunAgentResult } from '../agents/types'
import { getConfig, loadConfig } from '../config'
import { tapEvents } from '../events'
import {
  __clearBlocksForChecks,
  __setBackendsForChecks,
  activeRunsFor,
  allAgents,
  approvePlan,
  cancelAll,
  getTaskChanges,
  undoTask,
  cancelRun,
  initOrchestrator,
  rejectPlan,
  refreshPresence,
  resetAgent,
  resumeRun,
  runtimeSnapshot,
  sendMessage
} from '../orchestrator'
import { memoryOf, setInstructions } from '../memory'
import { setGuideEnv } from '../coordinatorGuide'
import { INTERRUPTED_ERROR } from '@shared/defaults'
import * as store from '../projects'
import { initQuota, setQuotaProbing } from '../quota'
import { initUsageLog, usageRuns } from '../usageLog'
import { __setUiCapturerForChecks } from '../uiShots'
import { buildCommandLine } from '../agents/spawn'
import { claudeArgs } from '../agents/claude'
import { codexArgs } from '../agents/codex'
import { initAgentSessions } from '../agentSessions'
import { getTaskTrace } from '../taskTrace'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const events: CoworkEvent[] = []
tapEvents((e) => events.push(e))

interface Call {
  agentId: string
  model: string
  effort?: string
  mode: 'plan' | 'work'
  images: string[]
  prompt: string
  resume?: string
}
const calls: Call[] = []
let planResponses: Record<string, RunAgentResult> = {}
let workBehaviour: (o: RunAgentOptions) => Promise<RunAgentResult> | null = () => null
/** Hermes empieza no disponible: así se prueba que planifica Claude de respaldo. */
let hermesOnline = false
let fileCounter = 0

async function defaultWork(o: RunAgentOptions): Promise<RunAgentResult> {
  o.onThinking?.('...')
  await sleep(30)
  const name = `${o.agent.id}-${++fileCounter}.md`
  o.onActivity?.(`Creando ${name}`, 'tool')
  mkdirSync(join(o.cwd, 'artifacts'), { recursive: true })
  writeFileSync(join(o.cwd, 'artifacts', name), `# ${o.agent.id}\n`)
  o.onFile?.(join(o.cwd, 'artifacts', name))
  o.onProgress?.(0.5)
  o.onUsage?.({ contextUsed: 1000, contextCapacity: 200_000 })
  await sleep(60)
  // Claude y Codex devuelven la sesión con la que trabajaron (se retoma al corregir o continuar).
  const sessionId = o.agent.id.startsWith('claude') || o.agent.id.startsWith('codex') ? `${o.agent.id}-sess-${fileCounter}` : undefined
  return { ok: true, text: `Hecho por ${o.agent.id}: creé artifacts/${name}`, usage: { input: 100, output: 20 }, sessionId }
}

/** Qué contesta el verificador (otra familia, modo plan) a cada comprobación; sin lista, «cumple». */
let verdicts: string[] = []
const isVerify = (o: RunAgentOptions): boolean => o.mode === 'plan' && o.prompt.includes('«VEREDICTO: CUMPLE»')
const isVerifyCall = (c: { mode: string; prompt: string }): boolean => c.mode === 'plan' && c.prompt.includes('«VEREDICTO: CUMPLE»')

async function fakeRun(o: RunAgentOptions): Promise<RunAgentResult> {
  calls.push({ agentId: o.agent.id, model: o.model, effort: o.effort, mode: o.mode, images: o.images ?? [], prompt: o.prompt, resume: o.resume })
  // Lo que se le pasaría al CLI de verdad tiene que poder lanzarse por la consola (si no, ni arranca).
  if (o.agent.provider === 'claude') buildCommandLine('claude', claudeArgs(o.model, o.mode, o.access, o.effort, o.resume, o.mcp))
  if (o.agent.provider === 'codex') buildCommandLine('codex', codexArgs(o.model, o.mode, o.images, o.access, o.effort, o.resume))
  if (o.mode === 'plan' && o.prompt.includes('Redacta la respuesta final para el usuario')) {
    await sleep(10)
    return { ok: true, text: 'Ya está hecho: el motor, la web y el script de build quedan en artifacts/. Para probarlo, abre artifacts/index.html.', usage: { input: 40, output: 20 } }
  }
  if (isVerify(o)) {
    await sleep(10)
    return { ok: true, text: verdicts.shift() ?? 'VEREDICTO: CUMPLE\nLeí los archivos y hacen lo pedido.', usage: { input: 30, output: 5 } }
  }
  if (o.mode === 'plan') {
    await sleep(20)
    const r = planResponses[o.agent.id]
    assert.ok(r, `unexpected planner ${o.agent.id}`)
    return r
  }
  const custom = workBehaviour(o)
  if (custom) return custom
  return defaultWork(o)
}

function plan(reply: string, tasks: unknown[], contract?: string, memory?: unknown[]): RunAgentResult {
  return { ok: true, text: '```json\n' + JSON.stringify({ reply, contract, memory, tasks }) + '\n```', usage: { input: 50, output: 10 } }
}

async function waitFor(pred: () => boolean, ms = 15000, what = 'condition'): Promise<void> {
  const t0 = Date.now()
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`)
    await sleep(20)
  }
}

function runEvents(runId: string, from: number): CoworkEvent[] {
  return events.slice(from).filter((e) => !('runId' in e) || (e as { runId?: string }).runId === runId)
}

function finished(runId: string): CoworkEvent | undefined {
  return events.find((e) => e.kind === 'run.finished' && e.runId === runId)
}

function lastTasks(from: number): Map<string, Task> {
  const m = new Map<string, Task>()
  for (const e of events.slice(from)) if (e.kind === 'task.upsert') m.set(e.task.id, e.task)
  return m
}

function describe(e: CoworkEvent): string {
  switch (e.kind) {
    case 'agent.runtime':
      return `agent.runtime ${e.runtime.agentId}=${e.runtime.activity}${e.runtime.waitingFor ? `→${e.runtime.waitingFor}` : ''}${e.runtime.location === 'core' ? '@core' : ''} "${e.runtime.lastActivity ?? ''}"`
    case 'task.upsert':
      return `task.upsert "${e.task.title}" ${e.task.status} (${e.task.agentId})`
    case 'transfer.started':
      return `transfer ${e.transfer.fromId} → ${e.transfer.toId} "${e.transfer.label}"`
    case 'message.upsert':
      return `message ${e.message.author.type === 'agent' ? e.message.author.agentId : e.message.author.type}${e.message.tone === 'error' ? ' (error)' : ''}: ${e.message.text.split('\n')[0].slice(0, 60)}`
    case 'agent.spawned':
      return `agent.spawned ${e.agent.id} @${e.agent.stationId}`
    case 'agent.removed':
      return `agent.removed ${e.agentId}`
    case 'agent.moved':
      return `agent.moved ${e.agentId} → ${e.to}`
    case 'artifact.created':
      return `artifact.created ${e.artifact.relPath}`
    case 'task.completed':
      return `task.completed ${e.agentId}`
    case 'run.started':
    case 'run.finished':
      return `${e.kind}${e.kind === 'run.finished' ? ` ok=${e.ok}` : ''}`
    case 'quota.update':
      return 'quota.update'
    default:
      return e.kind
  }
}

let passed = 0
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (e) {
    console.error(`FAIL  ${name}`)
    throw e
  }
}

async function main(): Promise<void> {
  // En macOS tmpdir está bajo /var, que validateWorkDir rechaza por ser una carpeta del sistema.
  const checkBase = join(process.cwd(), '.ai-cowork', 'entregables')
  mkdirSync(checkBase, { recursive: true })
  const root = mkdtempSync(join(checkBase, 'aicw-orch-'))
  process.env.AICW_CHECK_ROOT = root
  process.env.CODEX_HOME = join(root, 'no-codex')
  try {
    const cfg = loadConfig()
    assert.equal(cfg.workspaceRoot, join(root, 'workspace'))
    assert.ok(readFileSync(join(root, 'workspace', 'config.json'), 'utf8').includes('"plannerOrder"'))
    assert.equal(cfg.planApproval, true, 'por defecto se pide el visto bueno a cada plan')
    // Los escenarios de siempre ejecutan el plan al momento; el del visto bueno lo activa.
    cfg.planApproval = false
    // Muse viene en el equipo por defecto; aquí se apaga para que los repartos de siempre no cambien.
    const muse = cfg.agents.find((a) => a.id === 'muse')
    assert.ok(muse && muse.provider === 'muse' && muse.stationId === 'st-muse', 'Muse está en el equipo por defecto')
    muse.enabled = false
    store.initProjects(cfg.workspaceRoot)
    store.ensureFirstProject()
    initQuota(cfg.workspaceRoot, getConfig, allAgents)
    setQuotaProbing(false)
    initUsageLog(cfg.workspaceRoot)
    initAgentSessions(cfg.workspaceRoot)
    __setBackendsForChecks({
      run: fakeRun,
      presence: async (a) =>
        a.provider === 'ollama'
          ? 'Modelo local no descargado: ejecuta `ollama pull qwen3:14b`'
          : a.provider === 'hermes' && !hermesOnline
            ? 'Hermes no disponible (prueba)'
            : null
    })
    initOrchestrator()
    await sleep(50)
    const project = store.listProjects()[0]
    assert.equal(project.name, 'Mi primer proyecto')

    await check('startup runtimes (qwen offline)', async () => {
      const rts = runtimeSnapshot()
      assert.deepEqual(rts.map((r) => r.agentId).sort(), ['claude', 'codex', 'gemini', 'hermes', 'qwen'])
      assert.equal(rts.find((r) => r.agentId === 'hermes')!.activity, 'offline')
      const q = rts.find((r) => r.agentId === 'qwen')!
      assert.equal(q.activity, 'offline')
      assert.match(q.reason ?? '', /ollama pull/)
    })

    // ---------- A: full run with deps, becario, light-model fallback, integration ----------
    await check('A: plan → becario → deps → artifacts → integration', async () => {
      const img = join(root, 'Mi foto.png')
      writeFileSync(img, 'png')
      planResponses = {
        claude: plan('Vamos a ello', [
          { key: 'req', title: 'Analizar requisitos', description: 'Lee attachments/Mi-foto.png', agent: 'gemini', difficulty: 'medium', dependsOn: [], deliverable: 'file' },
          { key: 'script', title: 'Script de build', description: 'Crea build.py', agent: 'codex', difficulty: 'easy', dependsOn: [], deliverable: 'text' },
          { key: 'web', title: 'Diseñar la web', description: 'Crea artifacts/index.html', agent: 'claude', difficulty: 'hard', dependsOn: ['req', 'script'], deliverable: 'file' }
        ])
      }
      workBehaviour = (o) =>
        o.agent.provider === 'codex' && o.model === 'gpt-6-luna'
          ? Promise.resolve({
              ok: false,
              text: '',
              usage: { input: 0, output: 0 },
              errorKind: 'failed',
              modelUnavailable: true,
              errorMessage: "The 'gpt-6-luna' model is not supported when using Codex with a ChatGPT account."
            })
          : null
      const from = events.length
      const { runId } = await sendMessage({ projectId: project.id, text: 'Haz una web', filePaths: [img] })
      await waitFor(() => !!finished(runId), 20000, 'run A')
      await waitFor(() => events.some((e) => e.kind === 'agent.removed'), 8000, 'becario removal')
      const evs = runEvents(runId, from)
      console.log('     --- event log (A) ---')
      for (const e of events.slice(from)) if (e.kind !== 'quota.update') console.log('     ' + describe(e))

      const fin = finished(runId)!
      assert.equal(fin.kind === 'run.finished' && fin.ok, true)
      const ts = lastTasks(from)
      assert.equal(ts.size, 3)
      for (const t of ts.values()) assert.equal(t.status, 'done', t.title)
      const script = [...ts.values()].find((t) => t.title === 'Script de build')!
      assert.equal(script.agentId, 'codex') // fell back to the parent with its main model
      assert.equal(script.model, 'gpt-6.1-sol')
      // Registro de la tarea: los dos intentos (el becario, rechazado, y Codex) con cómo acabó cada uno, y la verificación.
      const notes = getTaskTrace(script.id).filter((e) => e.kind === 'note' || e.kind === 'error').map((e) => `${e.kind}:${e.title}`)
      assert.equal(notes.length, 7, notes.join(' | '))
      assert.match(notes[4], /^note:Claude comprueba el resultado contra la petición$/)
      assert.equal(notes[5], 'note:Claude: cumple')
      // Lo que cambió queda guardado como instantáneas: se puede ver y deshacer.
      assert.match(notes[6], /^note:Cambios guardados: 1 archivo \(\+1 −0\)/)
      assert.match(notes[0], /^note:.+ empieza con .+ · esfuerzo medio$/)
      assert.match(notes[1], /^error:.*not supported/)
      assert.match(notes[2], /^note:Codex empieza con .+ · esfuerzo medio$/)
      assert.match(notes[3], /^note:Terminó en \d+ s/)
      const web = [...ts.values()].find((t) => t.title === 'Diseñar la web')!
      assert.equal(web.artifactIds.length, 1)
      assert.equal(web.progress, 1)
      // codex calls: light model first (becario), then main model; images only to... every work call gets them, adapters decide
      const codexCalls = calls.filter((c) => c.agentId.startsWith('codex') && c.mode === 'work')
      // Fácil y de solo texto: becario con el modelo ligero; rechazado → el principal. Siempre con esfuerzo medio (calidad por defecto).
      assert.deepEqual(codexCalls.map((c) => [c.agentId, c.model, c.effort]), [
        ['codex-becario-1', 'gpt-6-luna', 'medium'],
        ['codex', 'gpt-6.1-sol', 'medium']
      ])
      // Planificar con esfuerzo alto; la tarea difícil de Claude, con Opus y esfuerzo alto.
      assert.equal(calls.find((c) => c.mode === 'plan')!.effort, 'high')
      const hard = calls.find((c) => c.prompt.includes('## Tu tarea: Diseñar la web'))!
      assert.deepEqual([hard.model, hard.effort], ['opus', 'high'])
      // Relativa a la carpeta del proyecto, o absoluta a ella si la tarea trabaja en una copia aparte.
      assert.equal(codexCalls[0].images.length, 1)
      assert.match(codexCalls[0].images[0].replace(/\\/g, '/'), /(^|\/)attachments\/Mi-foto\.png$/)
      const plannerCall = calls.find((c) => c.mode === 'plan')!
      assert.match(plannerCall.prompt, /id: "qwen" · Qwen — .*disponible: no \(Modelo local no descargado/)
      // Ficha de cada agente: qué se le da mejor, qué evitar, modelos y cuota.
      assert.match(
        plannerCall.prompt,
        /id: "claude" · Claude — [^\n]*\n {2}se le da mejor: [^\n]+\n {2}evitar: [^\n]+\n {2}modelos: fáciles → Sonnet 5\.5 con esfuerzo medio[^\n]*difíciles → Opus 5\.5 con esfuerzo alto\n {2}cómo son: /
      )
      assert.match(plannerCall.prompt, /cuota restante: /)
      assert.match(plannerCall.prompt, /attachments\/Mi-foto\.png/)
      const webCall = calls.find((c) => c.prompt.includes('## Tu tarea: Diseñar la web'))!
      assert.match(webCall.prompt, /## Resultados de las tareas previas/)
      assert.match(webCall.prompt, /artifacts\/gemini-\d+\.md \(resultado de «Analizar requisitos»\)/)

      const kinds = evs.map((e) => e.kind)
      assert.equal(kinds[0], 'message.upsert') // user message
      assert.equal(kinds[1], 'run.started')
      const spawned = events.slice(from).find((e) => e.kind === 'agent.spawned')
      assert.ok(spawned && spawned.kind === 'agent.spawned')
      assert.equal(spawned.agent.id, 'codex-becario-1')
      assert.equal(spawned.agent.color, SUBAGENT_COLOR)
      assert.equal(spawned.agent.stationId, 'st-sub-1')
      assert.equal(spawned.agent.parentId, 'codex')
      const labels = events.slice(from).filter((e) => e.kind === 'transfer.started').map((e) => (e.kind === 'transfer.started' ? e.transfer.label : ''))
      for (const l of ['Nueva tarea', 'Delegada: Script de build', 'Devuelta: Script de build', 'Analizar requisitos → Claude', 'Script de build → Claude', 'Resultado: Diseñar la web'])
        assert.ok(labels.includes(l), `transfer "${l}" missing in ${JSON.stringify(labels)}`)
      assert.ok(
        events.slice(from).some((e) => e.kind === 'agent.runtime' && e.runtime.agentId === 'claude' && e.runtime.activity === 'waiting' && !!e.runtime.waitingFor),
        'claude should wait for its dependencies'
      )
      const moves = events.slice(from).filter((e) => e.kind === 'agent.moved')
      assert.deepEqual(moves.map((e) => (e.kind === 'agent.moved' ? `${e.agentId}:${e.to}` : '')), ['claude:core', 'claude:station'])
      // La respuesta final de verdad (redactada por el coordinador con los resultados delante) y, debajo, la lista de ✓.
      const summary = events.slice(from).find((e) => e.kind === 'message.upsert' && e.message.text.includes('**Resumen del trabajo**'))
      assert.ok(summary && summary.kind === 'message.upsert')
      assert.ok(summary.message.text.startsWith('Ya está hecho: el motor, la web y el script de build'), summary.message.text)
      assert.ok(calls.slice(from).some((c) => c.mode === 'plan' && c.prompt.includes('## Lo que hizo cada tarea') && c.prompt.includes('### «Script de build»')), 'el coordinador ve todos los resultados')
      assert.equal((summary.message.text.match(/✓/g) ?? []).length, 3)
      const arts = events.slice(from).filter((e) => e.kind === 'artifact.created')
      assert.equal(arts.length, 3)
      // Los archivos van en la carpeta desplegable del chat, no listados uno detrás de otro en el resumen.
      assert.ok(!summary.message.text.includes('**Archivos**'))
      assert.equal(summary.message.artifactIds?.length, 3)
      for (const e of events.slice(from)) {
        assert.ok(e.id && e.ts, 'every event needs id and ts')
        assert.equal(e.demo, undefined)
      }
      assert.equal(new Set(events.map((e) => e.id)).size, events.length, 'event ids unique')
      // runtime throttling: lastActivity text never repeats in consecutive emits for the same agent within the same state
      const rt = runtimeSnapshot()
      assert.ok(rt.every((r) => r.activity !== 'working' && r.activity !== 'thinking'), 'all idle at the end')
      assert.ok(!rt.some((r) => r.agentId.includes('becario')), 'becario removed')
    })

    // ---------- B: planner auth failure → next planner; task for blocked agent reassigned ----------
    await check('B: Claude auth error → Gemini plans; Claude task reassigned', async () => {
      planResponses = {
        claude: {
          ok: false,
          text: '',
          usage: { input: 0, output: 0 },
          errorKind: 'auth',
          errorMessage: 'Sesión de Claude expirada: abre una terminal, ejecuta `claude` e inicia sesión'
        },
        gemini: plan('Me encargo', [{ key: 'x', title: 'Revisar texto', description: 'Revisión y redacción', agent: 'claude', difficulty: 'medium', dependsOn: [], deliverable: 'text' }])
      }
      workBehaviour = () => null
      const from = events.length
      const { runId } = await sendMessage({ projectId: project.id, text: 'Revisa el texto', filePaths: [] })
      await waitFor(() => !!finished(runId), 10000, 'run B')
      const fin = finished(runId)!
      assert.equal(fin.kind === 'run.finished' && fin.ok, true)
      const msgs = events.slice(from).filter((e) => e.kind === 'message.upsert').map((e) => (e.kind === 'message.upsert' ? e.message : null)!)
      assert.ok(msgs.some((m) => m.tone === 'error' && m.text.startsWith('No pude planificar: Sesión de Claude expirada')))
      const t = [...lastTasks(from).values()][0]
      assert.notEqual(t.agentId, 'claude')
      assert.equal(t.status, 'done')
      const claudeRt = runtimeSnapshot().find((r) => r.agentId === 'claude')!
      assert.equal(claudeRt.activity, 'error')
      assert.match(claudeRt.reason ?? '', /Sesión de Claude expirada/)
    })

    // ---------- C: quota error → retry once on another agent ----------
    await check('C: Gemini quota error → task reassigned to Codex', async () => {
      planResponses = {
        gemini: plan('Ok', [
          { key: 'a', title: 'Resumir documento', description: 'Resume', agent: 'gemini', difficulty: 'medium', dependsOn: [], deliverable: 'file' },
          { key: 'b', title: 'Programar script', description: 'programar un script', agent: 'codex', difficulty: 'medium', dependsOn: ['a'], deliverable: 'text' }
        ])
      }
      workBehaviour = (o) =>
        o.agent.id === 'gemini'
          ? Promise.resolve({ ok: false, text: '', usage: { input: 0, output: 0 }, errorKind: 'quota', errorMessage: 'Gemini alcanzó su límite de uso' })
          : null
      const from = events.length
      const { runId } = await sendMessage({ projectId: project.id, text: 'Resume y programa', filePaths: [] })
      await waitFor(() => !!finished(runId), 12000, 'run C')
      const ts = [...lastTasks(from).values()]
      const a = ts.find((t) => t.title === 'Resumir documento')!
      assert.equal(a.status, 'done')
      assert.equal(a.agentId, 'codex')
      assert.equal(a.assignedBy, 'gemini')
      assert.ok(events.slice(from).some((e) => e.kind === 'transfer.started' && e.transfer.label === 'Reasignada: Resumir documento'))
      assert.equal(ts.find((t) => t.title === 'Programar script')!.status, 'done')
      assert.equal(runtimeSnapshot().find((r) => r.agentId === 'gemini')!.activity, 'error')
    })

    // ---------- D: generic failure cancels dependents ----------
    await check('D: generic failure sin compañero libre → dependents cancelled, run not ok', async () => {
      planResponses = {
        codex: plan('Ok', [
          { key: 'x', title: 'Paso 1', description: 'a', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'text' },
          { key: 'y', title: 'Paso 2', description: 'b', agent: 'codex', difficulty: 'medium', dependsOn: ['x'], deliverable: 'text' }
        ])
      }
      workBehaviour = () => Promise.resolve({ ok: false, text: '', usage: { input: 0, output: 0 }, errorKind: 'failed', errorMessage: 'boom' })
      const fromCalls = calls.length
      const from = events.length
      const { runId } = await sendMessage({ projectId: project.id, text: 'Dos pasos', filePaths: [] })
      await waitFor(() => !!finished(runId), 10000, 'run D')
      const fin = finished(runId)!
      assert.equal(fin.kind === 'run.finished' && fin.ok, false)
      const ts = [...lastTasks(from).values()]
      assert.equal(ts.find((t) => t.title === 'Paso 1')!.status, 'failed')
      // Claude y Gemini siguen bloqueados (B, C): sin compañero libre, no hay reintento.
      const tried = calls.slice(fromCalls).filter((c) => c.mode === 'work' && c.prompt.includes('## Tu tarea: Paso 1'))
      assert.equal(tried.length, 1)
      const y = ts.find((t) => t.title === 'Paso 2')!
      assert.equal(y.status, 'cancelled')
      assert.equal(y.error, 'Depende de una tarea fallida')
    })

    // ---------- E: cancel a running task ----------
    await check('E: cancelRun kills running work and finishes the run', async () => {
      planResponses = {
        codex: plan('Ok', [{ key: 'z', title: 'Tarea larga', description: 'a', agent: 'codex', difficulty: 'hard', dependsOn: [], deliverable: 'text' }])
      }
      workBehaviour = (o) =>
        new Promise((resolve) => {
          o.onActivity?.('Ejecutando: sleep', 'tool')
          o.signal.addEventListener('abort', () => resolve({ ok: false, text: '', usage: { input: 0, output: 0 }, errorKind: 'cancelled', errorMessage: 'Cancelada' }))
        })
      const from = events.length
      const { runId } = await sendMessage({ projectId: project.id, text: 'Algo largo', filePaths: [] })
      await waitFor(() => [...lastTasks(from).values()].some((t) => t.status === 'running'), 5000, 'task running')
      await waitFor(() => runtimeSnapshot().find((r) => r.agentId === 'codex')!.activity === 'working', 3000, 'codex working')
      cancelRun(runId)
      const fin = finished(runId)!
      assert.equal(fin.kind === 'run.finished' && fin.ok, false)
      assert.equal([...lastTasks(from).values()][0].status, 'cancelled')
      await sleep(100)
      assert.equal(runtimeSnapshot().find((r) => r.agentId === 'codex')!.activity, 'idle')
    })

    // ---------- F: modelo según dificultad y cadena de respaldo ----------
    await check('F: difícil → modelo potente; si se rechaza, habitual; si también, el del CLI', async () => {
      planResponses = {
        codex: plan('Ok', [{ key: 'h', title: 'Arquitectura', description: 'diseñar', agent: 'codex', difficulty: 'hard', dependsOn: [], deliverable: 'text' }])
      }
      const rejected = (o: RunAgentOptions): RunAgentResult => ({
        ok: false,
        text: '',
        usage: { input: 0, output: 0 },
        errorKind: 'failed',
        modelUnavailable: true,
        errorMessage: `The '${o.model}' model is not supported when using Codex with a ChatGPT account.`
      })
      workBehaviour = (o) => (o.mode === 'work' && o.model ? Promise.resolve(rejected(o)) : null)
      const from = calls.length
      const fromEv = events.length
      const { runId } = await sendMessage({ projectId: project.id, text: 'Diseña la arquitectura', filePaths: [] })
      await waitFor(() => !!finished(runId), 10000, 'run F')
      // Lo difícil de Codex: GPT-6.1 Sol con esfuerzo muy alto (no Astra); si se rechaza, el del CLI, con el mismo esfuerzo.
      const work = calls.slice(from).filter((c) => c.mode === 'work').map((c) => [c.model, c.effort])
      assert.deepEqual(work, [
        ['gpt-6.1-sol', 'xhigh'],
        ['', 'xhigh']
      ])
      const t = [...lastTasks(fromEv).values()][0]
      assert.equal(t.status, 'done')
    })

    // ---------- G: un agente que no puede hacer la tarea no la da por hecha ----------
    await check('G: «BLOQUEADA: motivo» → tarea con error, no completada', async () => {
      planResponses = {
        codex: plan('Ok', [{ key: 'b', title: 'Tocar la app', description: 'editar src/', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'file' }])
      }
      workBehaviour = (o) =>
        o.mode === 'work'
          ? Promise.resolve({ ok: true, text: '**BLOQUEADA:** el código está fuera de la carpeta permitida.', usage: { input: 1, output: 1 } })
          : null
      const fromEv = events.length
      const { runId } = await sendMessage({ projectId: project.id, text: 'Añade audio', filePaths: [] })
      await waitFor(() => !!finished(runId), 10000, 'run G')
      const t = [...lastTasks(fromEv).values()][0]
      assert.equal(t.status, 'failed')
      assert.equal(t.error, 'Bloqueada: el código está fuera de la carpeta permitida.')
      const fin = finished(runId)!
      assert.equal(fin.kind === 'run.finished' && fin.ok, false)
    })

    // ---------- G2: si un agente se bloquea, otro compañero termina la tarea ----------
    await check('G2: «BLOQUEADA» → la tarea pasa a otro compañero y se completa', async () => {
      __clearBlocksForChecks() // Claude vuelve a estar disponible: planifica y puede recoger la tarea
      const p = plan('Ok', [{ key: 'i', title: 'Instalar dependencias', description: 'npm install', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'text' }])
      planResponses = { claude: p, codex: p }
      workBehaviour = (o) =>
        o.mode === 'work' && o.agent.id === 'codex'
          ? Promise.resolve({ ok: true, text: 'BLOQUEADA: npm devuelve EACCES.', usage: { input: 1, output: 1 } })
          : null
      const from = calls.length
      const fromEv = events.length
      const { runId } = await sendMessage({ projectId: project.id, text: 'Instala las dependencias', filePaths: [] })
      await waitFor(() => !!finished(runId), 10000, 'run G2')
      const work = calls.slice(from).filter((c) => c.mode === 'work')
      assert.equal(work[0].agentId, 'codex')
      assert.ok(work[0].prompt.includes('Tienes acceso completo'), 'el agente sabe que puede instalar y usar internet')
      assert.equal(work.length, 2)
      assert.notEqual(work[1].agentId, 'codex')
      assert.equal([...lastTasks(fromEv).values()][0].status, 'done')
      assert.ok(events.slice(fromEv).some((e) => e.kind === 'message.upsert' && e.message.text.includes('Se la paso a')))
      const fin = finished(runId)!
      assert.equal(fin.kind === 'run.finished' && fin.ok, true)
    })

    // ---------- H: Hermes coordina (planifica) pero nunca recibe tareas ----------
    await check('H: Hermes planifica; si el plan le asigna una tarea, pasa a un trabajador', async () => {
      hermesOnline = true
      await refreshPresence()
      planResponses = {
        hermes: plan('Lo reparto yo', [{ key: 'h1', title: 'Resumen del proyecto', description: 'resumir', agent: 'hermes', difficulty: 'medium', dependsOn: [], deliverable: 'text' }])
      }
      workBehaviour = () => null
      const from = calls.length
      const fromEv = events.length
      const { runId } = await sendMessage({ projectId: project.id, text: 'Resume el proyecto', filePaths: [] })
      await waitFor(() => !!finished(runId), 10000, 'run H')
      const plannerCall = calls.slice(from).find((c) => c.mode === 'plan')!
      assert.equal(plannerCall.agentId, 'hermes')
      assert.ok(!plannerCall.prompt.includes('id: "hermes"'), 'Hermes no aparece como trabajador en el equipo')
      const t = [...lastTasks(fromEv).values()][0]
      assert.notEqual(t.agentId, 'hermes')
      assert.equal(t.status, 'done')
      assert.ok(events.slice(fromEv).some((e) => e.kind === 'message.upsert' && e.message.author.type === 'agent' && e.message.author.agentId === 'hermes'))
    })

    // ---------- I: si el coordinador no devuelve el JSON pedido, planifica el siguiente ----------
    await check('I: Hermes responde sin plan válido → planifica Claude', async () => {
      hermesOnline = true
      await refreshPresence()
      planResponses = {
        hermes: { ok: true, text: 'El encargo llegó truncado. Reenvíame el texto completo.', usage: { input: 1, output: 1 } },
        claude: plan('¡Hola! ¿En qué te ayudo?', [])
      }
      const from = calls.length
      const fromEv = events.length
      const { runId } = await sendMessage({ projectId: project.id, text: 'hola', filePaths: [] })
      await waitFor(() => !!finished(runId), 10000, 'run I')
      const planners = calls.slice(from).filter((c) => c.mode === 'plan').map((c) => c.agentId)
      assert.deepEqual(planners, ['hermes', 'claude'])
      assert.ok(
        events.slice(fromEv).some((e) => e.kind === 'message.upsert' && e.message.author.type === 'agent' && e.message.author.agentId === 'claude' && e.message.text.includes('¡Hola!'))
      )
    })

    // ---------- J: en equipo, en paralelo con contrato común y una integración final ----------
    await check('J: en equipo → partes a la vez con el contrato común y luego «Integrar y probar»', async () => {
      const contract = 'motor/formulas.js exporta evaluar(texto, celdas) → número | texto | error. La interfaz vive en public/.'
      const teamPlan = plan(
        'Lo hacemos en equipo',
        [
          { key: 'motor', title: 'Motor de fórmulas', description: 'Crea motor/formulas.js', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'file' },
          { key: 'ui', title: 'Interfaz de la hoja', description: 'Crea public/index.html', agent: 'claude', difficulty: 'medium', dependsOn: [], deliverable: 'file' },
          { key: 'int', title: 'Integrar y probar', description: 'Junta las partes', agent: 'codex', difficulty: 'medium', dependsOn: ['motor', 'ui'], deliverable: 'text' }
        ],
        contract
      )
      planResponses = { hermes: teamPlan, claude: teamPlan }
      workBehaviour = () => null
      const from = calls.length
      const fromEv = events.length
      const { runId } = await sendMessage({ projectId: project.id, text: 'Haz la hoja de cálculo en equipo', filePaths: [] })
      await waitFor(() => !!finished(runId), 15000, 'run J')
      const fin = finished(runId)!
      assert.equal(fin.kind === 'run.finished' && fin.ok, true)
      const ts = [...lastTasks(fromEv).values()]
      assert.equal(ts.length, 3)
      const motor = ts.find((t) => t.title === 'Motor de fórmulas')!
      const ui = ts.find((t) => t.title === 'Interfaz de la hoja')!
      const int = ts.find((t) => t.title === 'Integrar y probar')!
      // Las dos partes trabajan a la vez: cada una empieza antes de que termine la otra.
      assert.ok(motor.startedAt! < ui.finishedAt! && ui.startedAt! < motor.finishedAt!, 'motor e interfaz en paralelo')
      assert.ok(int.startedAt! >= Math.max(motor.finishedAt!, ui.finishedAt!), 'la integración espera a las dos')
      const work = calls.slice(from).filter((c) => c.mode === 'work')
      const parts = work.filter((c) => !c.prompt.includes('## Tu tarea: Integrar'))
      assert.equal(parts.length, 2)
      for (const c of parts) {
        assert.match(c.prompt, /## Contrato común del equipo\nOtros agentes construyen las otras partes A LA VEZ/)
        assert.ok(c.prompt.includes(contract))
      }
      const integ = work.find((c) => c.prompt.includes('## Tu tarea: Integrar'))!
      assert.match(integ.prompt, /júntalas respetándolo/)
      assert.ok(integ.prompt.includes(contract))
    })

    // ---------- K: una petición nueva mientras el equipo trabaja ----------
    await check('K: petición nueva con Codex ocupado → el coordinador lo sabe, lo libre empieza ya y se puede detener solo una', async () => {
      __clearBlocksForChecks()
      let release: () => void = () => undefined
      const hold = new Promise<void>((r) => (release = r))
      workBehaviour = (o) =>
        o.prompt.includes('## Tu tarea: Motor largo')
          ? (async () => {
              o.onFile?.(join(o.cwd, 'motor', 'formulas.js'))
              o.onActivity?.('Escribiendo motor/formulas.js', 'tool')
              await Promise.race([hold, new Promise((r) => o.signal.addEventListener('abort', r))])
              return { ok: true, text: 'Motor hecho', usage: { input: 10, output: 5 } }
            })()
          : null
      const p1 = plan('Ok', [{ key: 'm', title: 'Motor largo', description: 'motor/formulas.js', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'text' }])
      planResponses = { hermes: p1, claude: p1 }
      const fromEv = events.length
      const first = await sendMessage({ projectId: project.id, text: 'Haz el motor', filePaths: [] })
      await waitFor(() => [...lastTasks(fromEv).values()].some((t) => t.title === 'Motor largo' && t.status === 'running'), 5000, 'motor en marcha')
      // Antes de lanzar el CLI se guarda la instantánea de la carpeta: se espera a que el agente diga qué toca.
      await waitFor(() => calls.some((c) => c.prompt.includes('## Tu tarea: Motor largo')), 5000, 'motor lanzado')
      await sleep(50)

      const p2 = plan('Ok', [
        { key: 'd', title: 'Documentación', description: 'README', agent: 'claude', difficulty: 'medium', dependsOn: [], deliverable: 'text' },
        { key: 'c', title: 'Script de Codex', description: 'otro script', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'text' }
      ])
      planResponses = { hermes: p2, claude: p2 }
      const fromCalls = calls.length
      const second = await sendMessage({ projectId: project.id, text: 'Mientras tanto, escribe la documentación', filePaths: [] })
      await waitFor(() => calls.slice(fromCalls).some((c) => c.mode === 'plan'), 5000, 'planificación de la segunda')
      const planner2 = calls.slice(fromCalls).find((c) => c.mode === 'plan')!
      // El coordinador ve que Codex está ocupado (y con qué) y qué archivos se están tocando en la carpeta.
      assert.match(planner2.prompt, /id: "codex" · Codex — [^\n]*disponible: sí, pero ocupado ahora con «Motor largo» desde hace \d+ min/)
      assert.match(planner2.prompt, /## Trabajo en marcha en esta carpeta[^\n]*\n- «Motor largo» \(Codex, en marcha desde hace \d+ min\) · archivos que está tocando: motor\/formulas\.js/)
      // Lo de Claude (libre) empieza ya y sabe qué archivos no tocar; lo de Codex espera a que termine.
      await waitFor(() => calls.slice(fromCalls).some((c) => c.prompt.includes('## Tu tarea: Documentación')), 5000, 'documentación empezada')
      const doc = calls.slice(fromCalls).find((c) => c.prompt.includes('## Tu tarea: Documentación'))!
      assert.match(doc.prompt, /## Otras tareas trabajando ahora en esta misma carpeta\n[^\n]+\n- «Motor largo» .*motor\/formulas\.js/)
      assert.equal(
        calls.slice(fromCalls).some((c) => c.prompt.includes('## Tu tarea: Script de Codex')),
        false,
        'la tarea de Codex espera a que termine el motor'
      )
      assert.deepEqual(activeRunsFor(project.id), [first.runId, second.runId])
      // Detener solo la segunda: la primera sigue.
      cancelRun(second.runId)
      assert.deepEqual(activeRunsFor(project.id), [first.runId])
      assert.equal(finished(first.runId), undefined)
      release()
      await waitFor(() => !!finished(first.runId), 5000, 'la primera termina')
      const fin = finished(first.runId)!
      assert.equal(fin.kind === 'run.finished' && fin.ok, true)
      workBehaviour = () => null
    })

    await check('L: memoria del proyecto — el coordinador anota lo que decides, los agentes lo que descubren, y todos la leen', async () => {
      __clearBlocksForChecks()
      setInstructions(project.id, 'Antes de terminar, ejecuta npm test.')
      const codeDir = join(root, 'codigo-ai-cowork')
      setGuideEnv({ codeDir, webUrls: () => ['http://100.64.0.9:8787'] })
      workBehaviour = (o) =>
        o.prompt.includes('## Tu tarea: Base de datos')
          ? Promise.resolve({
              ok: true,
              text: 'Hecho.\n\n## Para la memoria\n- decisión: Las reservas se guardan en SQLite.\n- pendiente: Falta validar el solape.',
              usage: { input: 10, output: 5 }
            })
          : null
      const p = plan(
        'Vale',
        [{ key: 'b', title: 'Base de datos', description: 'Crea la base', agent: 'claude', difficulty: 'medium', dependsOn: [], deliverable: 'text' }],
        undefined,
        [{ kind: 'preference', text: 'Todo en TypeScript' }]
      )
      planResponses = { hermes: p, claude: p }
      const fromCalls = calls.length
      const fromEv = events.length
      const r1 = await sendMessage({ projectId: project.id, text: 'Prepara la base de datos; todo en TypeScript, por favor', filePaths: [] })
      await waitFor(() => !!finished(r1.runId), 8000, 'run L1')
      assert.deepEqual(
        memoryOf(project.id).map((e) => [e.id, e.kind, e.status, e.by, e.text]),
        [
          ['m1', 'preference', 'confirmed', 'user', 'Todo en TypeScript'],
          ['m2', 'decision', 'provisional', 'claude', 'Las reservas se guardan en SQLite.'],
          ['m3', 'pending', 'provisional', 'claude', 'Falta validar el solape.']
        ]
      )
      assert.ok(events.slice(fromEv).some((e) => e.kind === 'memory.updated' && e.projectId === project.id && e.memory.length === 3))
      const planMsg = events
        .slice(fromEv)
        .find((e): e is Extract<CoworkEvent, { kind: 'message.upsert' }> => e.kind === 'message.upsert' && e.message.runId === r1.runId && !!e.message.taskIds?.length)!
      assert.match(planMsg.message.text, /\*Anotado en la memoria del proyecto:\* preferencia «Todo en TypeScript»/)
      // La tarea leyó las instrucciones y la memoria, y sabe cómo dejar sus notas.
      const task1 = calls.slice(fromCalls).find((c) => c.prompt.includes('## Tu tarea: Base de datos'))!
      assert.match(task1.prompt, /## Instrucciones del proyecto[^\n]*\nAntes de terminar, ejecuta npm test\./)
      assert.match(task1.prompt, /## Memoria del proyecto[\s\S]*- m1 · preferencia · confirmado · el usuario, [^:]+: Todo en TypeScript/)
      assert.match(task1.prompt, /«## Para la memoria»/)
      // Lo que sabe de AI Cowork: el coordinador, la guía entera; cada tarea, que no toque su código.
      assert.ok(task1.prompt.includes(`No modifiques nada en ${codeDir}: es el código de AI Cowork`))
      const planner1 = calls.slice(fromCalls).find((c) => c.mode === 'plan')!
      assert.match(planner1.prompt, /## Cómo funciona AI Cowork[\s\S]*Ahora los agentes tienen acceso completo/)
      // La petición no habla de AI Cowork: la lista de funciones de la app (con el enlace del acceso web) no va en el prompt.
      assert.ok(!planner1.prompt.includes('### Funciones de AI Cowork') && !planner1.prompt.includes('Ahora mismo: http://100.64.0.9:8787'), 'sin la lista de funciones de la app')
      // La siguiente petición la ve entera.
      workBehaviour = () => null
      const p2 = plan('Decidimos SQLite y TypeScript.', [])
      planResponses = { hermes: p2, claude: p2 }
      const from2 = calls.length
      const r2 = await sendMessage({ projectId: project.id, text: '¿Qué decidimos?', filePaths: [] })
      await waitFor(() => !!finished(r2.runId), 8000, 'run L2')
      const planner2 = calls.slice(from2).find((c) => c.mode === 'plan')!
      assert.match(planner2.prompt, /- m1 · preferencia · confirmado · el usuario/)
      assert.match(planner2.prompt, /- m2 · decisión · provisional · Claude \(«Base de datos»\), [^:]+: Las reservas se guardan en SQLite\./)
      assert.match(planner2.prompt, /- m3 · pendiente · provisional · Claude/)
      assert.match(planner2.prompt, /"memory": \[\{"kind"/)
      // Si la conversación habla de AI Cowork, sí lleva la lista de funciones (con el enlace del acceso web).
      const from3 = calls.length
      const r3 = await sendMessage({ projectId: project.id, text: '¿Cómo entro desde el móvil?', filePaths: [] })
      await waitFor(() => !!finished(r3.runId), 8000, 'run L3')
      const planner3 = calls.slice(from3).find((c) => c.mode === 'plan')!
      assert.match(planner3.prompt, /### Funciones de AI Cowork[\s\S]*Ahora mismo: http:\/\/100\.64\.0\.9:8787\./)
    })

    await check('M: cada tarea con su criterio de aceptación y sus archivos; si toca los de otra, se avisa', async () => {
      workBehaviour = (o) => {
        const write = (rel: string, text: string): void => {
          mkdirSync(join(o.cwd, rel, '..'), { recursive: true })
          writeFileSync(join(o.cwd, rel), text)
          o.onFile?.(join(o.cwd, rel))
        }
        if (o.prompt.includes('## Tu tarea: Motor')) {
          write('artifacts/app/motor/reglas.js', 'export const evaluar = () => 1\n')
          return Promise.resolve({ ok: true, text: 'Motor listo', usage: { input: 10, output: 5 } })
        }
        if (o.prompt.includes('## Tu tarea: Interfaz')) {
          return (async () => {
            await sleep(150)
            write('artifacts/app/ui/index.html', '<html></html>\n')
            write('artifacts/app/motor/reglas.js', '// pisado por la interfaz, más largo que el original\n')
            return { ok: true, text: 'Interfaz lista', usage: { input: 10, output: 5 } }
          })()
        }
        return null
      }
      const p = plan(
        'En equipo',
        [
          { key: 'm', title: 'Motor', description: 'reglas', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'file', acceptance: 'node --test pasa', files: ['artifacts/app/motor/'] },
          { key: 'u', title: 'Interfaz', description: 'html', agent: 'claude', difficulty: 'medium', dependsOn: [], deliverable: 'file', acceptance: 'la página carga sin errores', files: ['./artifacts/app/ui/'] }
        ],
        'motor/ exporta evaluar()'
      )
      planResponses = { hermes: p, claude: p }
      const fromCalls = calls.length
      const fromEv = events.length
      const r = await sendMessage({ projectId: project.id, text: 'Haz la app en equipo', filePaths: [] })
      await waitFor(() => !!finished(r.runId), 8000, 'run M')
      const ui = calls.slice(fromCalls).find((c) => c.prompt.includes('## Tu tarea: Interfaz'))!
      assert.match(ui.prompt, /## Criterio de aceptación\nLa tarea está hecha cuando: la página carga sin errores\nAntes de terminar, compruébalo tú mismo/)
      assert.match(ui.prompt, /## Tus archivos\nSolo puedes crear o modificar: artifacts\/app\/ui\/\./)
      const planMsg = events
        .slice(fromEv)
        .find((e): e is Extract<CoworkEvent, { kind: 'message.upsert' }> => e.kind === 'message.upsert' && e.message.runId === r.runId && !!e.message.taskIds?.length)!
      assert.equal(planMsg.message.contract, 'motor/ exporta evaluar()')
      const warn = events
        .slice(fromEv)
        .find((e): e is Extract<CoworkEvent, { kind: 'message.upsert' }> => e.kind === 'message.upsert' && e.message.text.startsWith('Aviso:'))
      assert.ok(warn, 'se avisa en el chat')
      assert.equal(warn.message.text, 'Aviso: Claude cambió archivos que no eran de su tarea «Interfaz»: `artifacts/app/motor/reglas.js` (de «Motor»). Revísalos si algo no encaja.')
      const ts = [...lastTasks(fromEv).values()]
      const iface = ts.find((t) => t.title === 'Interfaz')!
      assert.deepEqual(iface.outOfScope, ['artifacts/app/motor/reglas.js'])
      assert.equal(iface.acceptance, 'la página carga sin errores')
      assert.deepEqual(iface.files, ['artifacts/app/ui/'])
      assert.equal(ts.find((t) => t.title === 'Motor')!.outOfScope, undefined)
      assert.ok(getTaskTrace(iface.id).some((e) => e.kind === 'error' && e.title.startsWith('Cambió archivos fuera de su tarea')))
      workBehaviour = () => null
    })

    await check('N: reanudar lo que se quedó a medias al cerrar la app (sin repetir lo terminado)', async () => {
      workBehaviour = (o) =>
        o.prompt.includes('## Tu tarea: Segunda') && !o.prompt.includes('## Tarea retomada')
          ? (async () => {
              await new Promise((r) => o.signal.addEventListener('abort', r))
              return { ok: false, text: '', usage: { input: 5, output: 1 }, errorKind: 'cancelled', errorMessage: 'Cancelada' }
            })()
          : null
      const p = plan('Ok', [
        { key: 'a', title: 'Primera', description: 'uno', agent: 'claude', difficulty: 'medium', dependsOn: [], deliverable: 'text' },
        { key: 'b', title: 'Segunda', description: 'dos', agent: 'claude', difficulty: 'medium', dependsOn: ['a'], deliverable: 'text' }
      ])
      planResponses = { hermes: p, claude: p }
      const fromEv = events.length
      const r = await sendMessage({ projectId: project.id, text: 'Dos pasos', filePaths: [] })
      await waitFor(() => [...lastTasks(fromEv).values()].some((t) => t.title === 'Segunda' && t.status === 'running'), 8000, 'segunda en marcha')
      await waitFor(() => calls.some((c) => c.prompt.includes('## Tu tarea: Segunda')), 5000, 'segunda lanzada')
      cancelRun(r.runId, 'quit') // como al cerrar la app
      await sleep(50)
      const before = [...lastTasks(fromEv).values()]
      assert.equal(before.find((t) => t.title === 'Primera')!.status, 'done')
      assert.deepEqual([before.find((t) => t.title === 'Segunda')!.status, before.find((t) => t.title === 'Segunda')!.error], ['cancelled', INTERRUPTED_ERROR])

      const fromCalls = calls.length
      const fromEv2 = events.length
      await resumeRun(project.id, r.runId)
      await waitFor(() => events.slice(fromEv2).some((e) => e.kind === 'run.finished' && e.runId === r.runId), 8000, 'reanudada termina')
      const again = calls.slice(fromCalls).filter((c) => c.mode === 'work')
      assert.equal(again.length, 1, 'solo se repite lo que quedó a medias')
      assert.match(again[0].prompt, /## Tu tarea: Segunda[\s\S]*## Tarea retomada/)
      assert.match(again[0].prompt, /## Resultados de las tareas previas\n### Primera \(Claude\)/)
      const fin = events.slice(fromEv2).find((e) => e.kind === 'run.finished' && e.runId === r.runId)!
      assert.equal(fin.kind === 'run.finished' && fin.ok, true)
      const usage = usageRuns().find((u) => u.runId === r.runId)!
      assert.equal(usage.status, 'ok')
      assert.ok((usage.pausedMs ?? 0) >= 40, `tiempo parado: ${usage.pausedMs}`)
      assert.equal(usage.calls.filter((c) => c.kind === 'task').length, 3)
      await assert.rejects(resumeRun(project.id, r.runId), /No hay tareas interrumpidas/)
      workBehaviour = () => null
    })

    await check('O: a la vez, los archivos que crea el comando de otra tarea no se los apunta el modelo local que termina antes', async () => {
      const offlineHermes = async (a: { provider: string }): Promise<string | null> => (a.provider === 'hermes' && !hermesOnline ? 'Hermes no disponible (prueba)' : null)
      __setBackendsForChecks({ run: fakeRun, presence: offlineHermes })
      await refreshPresence()
      let release: () => void = () => undefined
      const hold = new Promise<void>((r) => (release = r))
      workBehaviour = (o) =>
        o.prompt.includes('## Tu tarea: App Android')
          ? (async () => {
              // Como «npx cap add android»: muchos archivos y ninguno se informa.
              mkdirSync(join(o.cwd, 'android', 'app'), { recursive: true })
              for (const f of ['build.gradle', 'app/AndroidManifest.xml', 'gradlew']) writeFileSync(join(o.cwd, 'android', f), f)
              await Promise.race([hold, new Promise((r) => o.signal.addEventListener('abort', r))])
              return { ok: true, text: 'APK lista', usage: { input: 10, output: 5 } }
            })()
          : o.prompt.includes('## Tu tarea: Música')
            ? (async () => {
                await sleep(80)
                return { ok: true, text: '# Pistas\nDo Re Mi', usage: { input: 10, output: 5 } }
              })()
            : null
      const p = plan('Ok', [
        { key: 'a', title: 'App Android', description: 'apk', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'file' },
        { key: 'm', title: 'Música', description: 'notas', agent: 'qwen', difficulty: 'easy', dependsOn: [], deliverable: 'file' }
      ])
      planResponses = { hermes: p, claude: p }
      const fromEv = events.length
      const r = await sendMessage({ projectId: project.id, text: 'APK y música', filePaths: [] })
      await waitFor(() => [...lastTasks(fromEv).values()].some((t) => t.title === 'Música' && t.status === 'done'), 8000, 'música hecha')
      release()
      await waitFor(() => !!finished(r.runId), 8000, 'run O')
      const paths = new Map<string, string>()
      for (const e of events.slice(fromEv)) if (e.kind === 'artifact.created') paths.set(e.artifact.id, e.artifact.relPath)
      const ts = [...lastTasks(fromEv).values()]
      const music = ts.find((t) => t.title === 'Música')!
      const android = ts.find((t) => t.title === 'App Android')!
      assert.equal(music.agentId, 'qwen')
      assert.deepEqual(music.artifactIds.map((id) => paths.get(id)).filter((p) => !p?.startsWith('artifacts/')), [], 'la música solo se lleva su archivo')
      assert.equal(music.artifactIds.length, 1)
      assert.deepEqual(android.artifactIds.map((id) => paths.get(id)).sort(), ['android/app/AndroidManifest.xml', 'android/build.gradle', 'android/gradlew'])
      workBehaviour = () => null
      __setBackendsForChecks({
        run: fakeRun,
        presence: async (a) => (a.provider === 'ollama' ? 'Modelo local no descargado: ejecuta `ollama pull qwen3:14b`' : offlineHermes(a))
      })
      await refreshPresence()
    })

    await check('Q: visto bueno — el plan espera; cambios replanifican con el plan anterior; «sí» lo aprueba; sobrevive a un reinicio', async () => {
      const qp = store.createProject('Visto bueno')
      getConfig().planApproval = true
      try {
        const p1 = plan('He entendido que quieres una web. Codex la programa y Claude diseña la portada.', [
          { key: 'web', title: 'Programar la web', description: 'Crea artifacts/index.html', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'file' },
          { key: 'portada', title: 'Diseñar la portada', description: 'Crea artifacts/portada.md', agent: 'claude', difficulty: 'easy', dependsOn: ['web'], deliverable: 'file' }
        ], '', [{ kind: 'preference', text: 'Todo en HTML sin frameworks' }])
        planResponses = { hermes: p1, claude: p1 }
        const proposals = (): ChatMessage[] => store.getProject(qp.id).messages.filter((m) => !!m.proposal)
        const fromEv = events.length
        const fromCalls = calls.length
        const memoryBefore = memoryOf(qp.id).length
        const r1 = await sendMessage({ projectId: qp.id, text: 'Hazme una web', filePaths: [] })
        await waitFor(() => !!finished(r1.runId), 5000, 'plan propuesto')
        const first = proposals().at(-1)!
        assert.equal(first.proposal!.status, 'pending')
        assert.deepEqual(first.proposal!.tasks.map((t) => [t.title, t.agentId, t.dependsOn]), [['Programar la web', 'codex', []], ['Diseñar la portada', 'claude', ['web']]])
        assert.equal(first.taskIds, undefined)
        assert.equal(lastTasks(fromEv).size, 0, 'nada empieza sin tu visto bueno')
        assert.ok(!calls.slice(fromCalls).some((c) => c.mode === 'work'))
        assert.equal(memoryOf(qp.id).length, memoryBefore, 'la memoria se anota al aprobar')
        assert.equal(activeRunsFor(qp.id).length, 0)
        assert.ok(calls.slice(fromCalls).find((c) => c.mode === 'plan')!.prompt.includes('Nadie empieza hasta que el usuario aprueba tu plan'))

        // Cambios: se planifica otra vez con el plan anterior y su respuesta; el anterior queda «revised».
        const p2 = plan('Vale: lo hace todo Codex.', [
          { key: 'web', title: 'Programar la web y la portada', description: 'Crea artifacts/index.html con la portada', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'file' }
        ])
        planResponses = { hermes: p2, claude: p2 }
        const callsBefore = calls.length
        const r2 = await sendMessage({ projectId: qp.id, text: 'Mejor que lo haga todo Codex', filePaths: [] })
        assert.equal(proposals().find((m) => m.id === first.id)!.proposal!.status, 'revised')
        await waitFor(() => !!finished(r2.runId), 5000, 'plan cambiado')
        const replan = calls.slice(callsBefore).find((c) => c.mode === 'plan')!.prompt
        assert.match(replan, /## Petición del usuario\nHazme una web\n/)
        assert.match(replan, /- web: «Programar la web» → Codex \(medium\): Crea artifacts\/index\.html/)
        assert.match(replan, /- portada: «Diseñar la portada» → Claude \(easy\), después de web/)
        assert.match(replan, /## Su respuesta a ese plan\nMejor que lo haga todo Codex/)
        const second = proposals().at(-1)!
        assert.equal(second.proposal!.status, 'pending')
        assert.equal(second.proposal!.request, 'Hazme una web\n\nCambios que pidió al revisar el plan: Mejor que lo haga todo Codex')

        // Reinicio de la app: el plan sigue guardado en su mensaje y se aprueba igual. «Sí, adelante» lo aprueba sin replanificar.
        store.flushAll()
        const callsBeforeYes = calls.length
        const fromYes = events.length
        const yes = await sendMessage({ projectId: qp.id, text: 'Sí, adelante', filePaths: [] })
        assert.equal(yes.runId, second.runId)
        // La misma petición vuelve a empezar (run.started) y termina cuando acaba su trabajo.
        assert.ok(events.slice(fromYes).some((e) => e.kind === 'run.started' && e.runId === second.runId))
        await waitFor(() => !!events.slice(fromYes).find((e) => e.kind === 'run.finished' && e.runId === second.runId && e.ok), 8000, 'plan aprobado y terminado')
        assert.ok([...lastTasks(fromYes).values()].every((t) => t.status === 'done'))
        assert.ok(!calls.slice(callsBeforeYes).some((c) => c.mode === 'plan' && !c.prompt.includes('«VEREDICTO: CUMPLE»')), 'aprobar no vuelve a planificar')
        const work = calls.slice(callsBeforeYes).find((c) => c.mode === 'work')!
        assert.equal(work.agentId, 'codex')
        assert.match(work.prompt, /Cambios que pidió al revisar el plan: Mejor que lo haga todo Codex/)
        const approved = store.getProject(qp.id).messages.find((m) => m.id === second.id)!
        assert.equal(approved.proposal!.status, 'approved')
        assert.equal(approved.taskIds?.length, 1)
        assert.match(approved.text, /Anotado en la memoria del proyecto/)
        assert.ok(memoryOf(qp.id).length > memoryBefore || approved.text.includes('Anotado'), 'la memoria se anota al aprobar')
        await assert.rejects(approvePlan(qp.id, second.id), /ya está en marcha|ya no está pendiente/)
        await assert.rejects(approvePlan(qp.id, first.id), /ya no está pendiente/)

        // Descartar: no se hace nada.
        planResponses = { hermes: p1, claude: p1 }
        const r3 = await sendMessage({ projectId: qp.id, text: 'Ahora otra web', filePaths: [] })
        await waitFor(() => !!finished(r3.runId), 5000, 'tercer plan')
        const third = proposals().at(-1)!
        const fromReject = events.length
        rejectPlan(qp.id, third.id)
        assert.equal(store.getProject(qp.id).messages.find((m) => m.id === third.id)!.proposal!.status, 'rejected')
        await sleep(100)
        assert.equal(lastTasks(fromReject).size, 0)
        assert.throws(() => rejectPlan(qp.id, third.id), /ya no está pendiente/)

        // Lo que se aprueba es lo que se ve: si AI Cowork ajusta el plan del coordinador, el mensaje lo dice.
        const p4 = plan('Claude diseña la API y Codex la programa.', [
          { key: 'd', title: 'Diseñar la API', description: 'Rutas y formatos', agent: 'claude', difficulty: 'medium', dependsOn: [], deliverable: 'text' },
          { key: 'p', title: 'Programar la API', description: 'Crea server.js', agent: 'codex', difficulty: 'medium', dependsOn: ['d'], deliverable: 'file' }
        ])
        planResponses = { hermes: p4, claude: p4 }
        const r4 = await sendMessage({ projectId: qp.id, text: 'Hazme una API', filePaths: [] })
        await waitFor(() => !!finished(r4.runId), 5000, 'plan ajustado')
        const fourth = proposals().at(-1)!
        assert.deepEqual(fourth.proposal!.tasks.map((t) => t.title), ['Programar la API'])
        assert.match(fourth.text, /\*Ajustes de AI Cowork al plan:\* «Diseñar la API» lo hace quien construye \(«Programar la API»\)\./)
        rejectPlan(qp.id, fourth.id)
      } finally {
        getConfig().planApproval = false
      }
    })

    await check('R: con capturas adjuntas planifica quien puede verlas (Hermes solo lee texto)', async () => {
      const rp = store.createProject('Capturas')
      __clearBlocksForChecks()
      hermesOnline = true
      await refreshPresence()
      planResponses = { hermes: plan('Respuesta de Hermes', []), claude: plan('En la captura se ve la pestaña Memoria: sí se recordará.', []) }
      const img = join(root, 'captura-001525.png')
      writeFileSync(img, 'png')
      const from = calls.length
      const r1 = await sendMessage({ projectId: rp.id, text: '¿Esto aquí está bien? ¿Se recordará?', filePaths: [img] })
      await waitFor(() => !!finished(r1.runId), 5000, 'respuesta con captura')
      const withImage = calls.slice(from).filter((c) => c.mode === 'plan')
      assert.deepEqual(withImage.map((c) => c.agentId), ['claude'], 'la mira Claude, no Hermes')
      assert.match(withImage[0].prompt, /Hay imágenes adjuntas \(capturas, fotos\): ábrelas y míralas/)
      assert.match(withImage[0].prompt, /captura-001525\.png/)
      // Sin capturas, coordina Hermes como siempre.
      const from2 = calls.length
      const r2 = await sendMessage({ projectId: rp.id, text: '¿Y sin captura?', filePaths: [] })
      await waitFor(() => !!finished(r2.runId), 5000, 'respuesta sin captura')
      assert.deepEqual(calls.slice(from2).filter((c) => c.mode === 'plan').map((c) => c.agentId), ['hermes'])
    })

    await check('S: cada tarea cuenta en el chat lo que hace (frases cortas y herramientas en una línea) y acaba con su resultado', async () => {
      const sp = store.createProject('Avisos')
      hermesOnline = false
      await refreshPresence()
      const p = plan('Ok', [{ key: 'f', title: 'Arreglar el formulario', description: 'validar el correo', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'text' }])
      planResponses = { claude: p, codex: p }
      workBehaviour = (o) =>
        o.mode === 'work'
          ? (async () => {
              o.onTrace?.({ type: 'text', text: 'Reviso cómo valida el formulario.' })
              o.onTrace?.({ type: 'tool', id: 'r1', tool: 'read', title: 'Leyendo src/form.ts' })
              o.onTrace?.({ type: 'tool', id: 'c1', tool: 'command', title: 'Ejecutando: npm test' })
              o.onTrace?.({ type: 'result', id: 'c1', ok: false, output: '1 failing' })
              await sleep(1300)
              o.onTrace?.({ type: 'text', text: 'Falla la prueba del correo: añado la comprobación.' })
              o.onTrace?.({ type: 'tool', id: 'e1', tool: 'edit', title: 'Editando src/form.ts' })
              o.onTrace?.({ type: 'text', text: 'Listo: ya valida el correo.' })
              return { ok: true, text: 'Listo: ya valida el correo.', usage: { input: 1, output: 1 } }
            })()
          : null
      const fromEv = events.length
      const from = calls.length
      const { runId } = await sendMessage({ projectId: sp.id, text: 'Arregla el formulario', filePaths: [] })
      // Mientras trabaja, su mensaje ya cuenta lo que hace.
      await waitFor(
        () => events.slice(fromEv).some((e) => e.kind === 'message.upsert' && e.message.work?.status === 'running' && e.message.work.steps.length >= 2),
        5000,
        'avisos mientras trabaja'
      )
      await waitFor(() => !!finished(runId), 10000, 'run S')
      assert.ok(calls.slice(from).some((c) => c.mode === 'work' && c.prompt.includes('cuenta lo que haces en frases cortas')), 'se le pide que lo cuente')
      const works = store.snapshotProject(sp.id).messages.filter((m) => m.work)
      assert.equal(works.length, 1, 'un mensaje por tarea, con el resultado dentro')
      const m = works[0]
      assert.equal(m.author.type === 'agent' && m.author.agentId, 'codex')
      assert.equal(m.work!.status, 'done')
      assert.equal(m.text, 'Listo: ya valida el correo.')
      // La última frase es el resultado: no se repite en los pasos.
      assert.deepEqual(m.work!.steps, [
        { kind: 'note', text: 'Reviso cómo valida el formulario.' },
        {
          kind: 'tools',
          summary: 'Ejecutó un comando y leyó un archivo',
          items: ['Leyendo src/form.ts', 'Ejecutando: npm test'],
          refs: [
            { id: '1-3', tool: 'read' },
            { id: '1-4', ok: false, tool: 'command' }
          ],
          failed: 1
        },
        { kind: 'note', text: 'Falla la prueba del correo: añado la comprobación.' },
        { kind: 'tools', summary: 'Editó un archivo', items: ['Editando src/form.ts'], refs: [{ id: '1-6', tool: 'edit' }] }
      ])

      // Si no puede, su mensaje lo dice; el compañero que la retoma tiene el suyo.
      workBehaviour = (o) =>
        o.mode === 'work' && o.agent.id === 'codex'
          ? Promise.resolve({ ok: false, text: '', errorKind: 'failed', errorMessage: 'npm devuelve EACCES.', usage: { input: 1, output: 1 } })
          : null
      const r2 = await sendMessage({ projectId: sp.id, text: 'Otra vez', filePaths: [] })
      await waitFor(() => !!finished(r2.runId), 10000, 'run S2')
      const second = store.snapshotProject(sp.id).messages.filter((x) => x.work && x.runId === r2.runId)
      assert.deepEqual(second.map((x) => [x.work!.status, x.tone ?? 'normal']), [['failed', 'error'], ['done', 'normal']])
      assert.match(second[0].text, /^No pude completar «Arreglar el formulario»: npm devuelve EACCES\. Se la paso a /)
    })

    await check('U: el resultado lo comprueba otro agente de otra familia; si ve fallos, el autor corrige una vez', async () => {
      hermesOnline = false
      await refreshPresence()
      const up = store.createProject('Verificado')
      planResponses = {
        claude: plan('Codex lo hace.', [
          { key: 't1', title: 'Formulario de alta', description: 'Crea artifacts/alta.html con validación.', agent: 'codex', difficulty: 'medium', deliverable: 'file', acceptance: 'el correo se valida' }
        ])
      }
      verdicts = ['VEREDICTO: FALLOS\n- artifacts/alta.html: no valida el correo (falta la expresión regular).']
      workBehaviour = () => null
      const from = calls.length
      const { runId } = await sendMessage({ projectId: up.id, text: 'Haz el formulario de alta', filePaths: [] })
      await waitFor(() => !!finished(runId), 15000, 'run U')
      const seq = calls.slice(from).map((c) => `${c.mode}:${c.agentId}`)
      // Codex trabaja → Claude (otra familia) verifica en modo plan → Codex corrige → Claude vuelve a verificar.
      assert.deepEqual(seq, ['plan:claude', 'work:codex', 'plan:claude', 'work:codex', 'plan:claude'])
      const fix = calls.slice(from)[3]
      assert.ok(fix.prompt.includes('## Corrección pedida por el verificador') && fix.prompt.includes('falta la expresión regular'), 'el autor recibe los fallos')
      // Corrige en la misma sesión del CLI con la que hizo el trabajo (la primera vez no hay nada que retomar).
      assert.equal(calls.slice(from)[1].resume, undefined)
      assert.match(fix.resume ?? '', /^codex-sess-\d+$/)
      assert.ok(fix.prompt.includes('## Retomas tu sesión anterior'), 'se le dice que retoma su sesión')
      const verify = calls.slice(from)[2]
      assert.ok(verify.prompt.includes('## Petición original del usuario') && verify.prompt.includes('Formulario de alta'), 'el verificador ve la petición y la tarea')
      const msgs = store.snapshotProject(up.id).messages
      assert.ok(msgs.some((m) => m.text.includes('Claude comprobó «Formulario de alta» y vio fallos; Codex los corrige')), 'se cuenta la corrección')
      const done = msgs.find((m) => m.work?.status === 'done')!
      assert.ok(done.text.includes('✔ Claude comprobó el resultado tras una corrección: cumple.'), done.text)
      const task = store.snapshotProject(up.id).tasks.find((t) => t.runId === runId)!
      assert.equal(task.status, 'done')
      assert.deepEqual([task.verification?.by, task.verification?.ok, task.verification?.fixes], ['claude', true, 1])
      const usage = usageRuns().find((r) => r.runId === runId)!
      assert.deepEqual(usage.calls.map((c) => c.kind), ['plan', 'task', 'verify', 'task', 'verify'])

      // «Sin revisión» se lo salta; y una tarea de solo texto no se verifica.
      verdicts = []
      const from2 = calls.length
      const r2 = await sendMessage({ projectId: up.id, text: 'Haz el formulario de alta, sin revisión', filePaths: [] })
      await waitFor(() => !!finished(r2.runId), 15000, 'run U2')
      assert.deepEqual(calls.slice(from2).map((c) => `${c.mode}:${c.agentId}`), ['plan:claude', 'work:codex'])
      // La segunda petición no era continuación: empieza de cero. Y queda guardada la última sesión del proyecto.
      assert.equal(calls.slice(from2)[1].resume, undefined)
      assert.ok(existsSync(join(root, 'workspace', 'agent-sessions', `${up.id}.json`)), 'agent-sessions/<proyecto>.json')

      // Una continuación («continues»: true) retoma la última sesión de ese agente en el proyecto.
      planResponses = {
        claude: plan('Codex sigue.', [
          { key: 't1', title: 'Añadir el teléfono al formulario', description: 'Amplía artifacts/alta.html.', agent: 'codex', difficulty: 'medium', deliverable: 'file', acceptance: 'pide teléfono', continues: true }
        ])
      }
      const from3 = calls.length
      const r3 = await sendMessage({ projectId: up.id, text: 'Ahora añade el teléfono, sin revisión', filePaths: [] })
      await waitFor(() => !!finished(r3.runId), 15000, 'run U3')
      const cont = calls.slice(from3).find((c) => c.mode === 'work')!
      assert.match(cont.resume ?? '', /^codex-sess-\d+$/)
      assert.ok(cont.prompt.includes('## Retomas tu sesión anterior'))
      const t3 = store.snapshotProject(up.id).tasks.find((t) => t.runId === r3.runId)!
      assert.equal(t3.continues, true)

      // Si la tarea toca una web, el verificador recibe capturas a tamaño de escritorio y de móvil, y los errores al abrirla.
      const shotPages: string[] = []
      __setUiCapturerForChecks(async (_dir, pages, _out, tag) => {
        shotPages.push(...pages)
        return { shots: [{ path: `.ai-cowork/verificacion/${tag}-1-escritorio.png`, page: pages[0], view: 'escritorio' }, { path: `.ai-cowork/verificacion/${tag}-1-movil.png`, page: pages[0], view: 'móvil' }], errors: ['[móvil] consola: boom is not defined (app.js:3)'] }
      })
      planResponses = {
        claude: plan('Codex hace la web.', [
          { key: 't1', title: 'Página de la tienda', description: 'Crea web/index.html.', agent: 'codex', difficulty: 'medium', deliverable: 'file', acceptance: 'se ve en el móvil' }
        ])
      }
      workBehaviour = (o) => {
        if (o.mode !== 'work') return null
        mkdirSync(join(o.cwd, 'web'), { recursive: true })
        writeFileSync(join(o.cwd, 'web', 'index.html'), '<h1>Tienda</h1>')
        o.onFile?.(join(o.cwd, 'web', 'index.html'))
        return Promise.resolve({ ok: true, text: 'Hecho: web/index.html', usage: { input: 10, output: 5 } })
      }
      try {
        const from4 = calls.length
        const r4 = await sendMessage({ projectId: up.id, text: 'Haz la página de la tienda', filePaths: [] })
        await waitFor(() => !!finished(r4.runId), 15000, 'run U4')
        const v4 = calls.slice(from4).find(isVerifyCall)!
        assert.deepEqual(shotPages, ['web/index.html'])
        assert.equal(v4.images.length, 2)
        assert.match(v4.images[1], /^\.ai-cowork\/verificacion\/.+-movil\.png$/)
        assert.ok(v4.prompt.includes('## Cómo se ve') && v4.prompt.includes('boom is not defined'), 'el verificador sabe qué mirar y ve los errores')
      } finally {
        __setUiCapturerForChecks(null)
        workBehaviour = () => null
      }
    })

    await check('V: «a dos manos» — otra familia hace la misma tarea en su carpeta y una tercera elige', async () => {
      hermesOnline = false
      await refreshPresence()
      const vp = store.createProject('Dos manos')
      planResponses = {
        claude: plan('Codex hace la landing.', [
          { key: 't1', title: 'Landing de la panadería', description: 'Crea una landing en artifacts/landing/.', agent: 'codex', difficulty: 'medium', deliverable: 'file', acceptance: 'carga sin errores' }
        ])
      }
      verdicts = []
      workBehaviour = (o) =>
        o.prompt.includes('## Tu tarea: Elegir la mejor opción')
          ? Promise.resolve({ ok: true, text: 'GANA: B\n\nLa B respeta mejor la petición.', usage: { input: 10, output: 5 } })
          : null
      const from = calls.length
      const { runId } = await sendMessage({ projectId: vp.id, text: 'Hazme la landing de la panadería a dos manos, sin revisión', filePaths: [] })
      await waitFor(() => !!finished(runId), 15000, 'run V')
      const ts = store.snapshotProject(vp.id).tasks.filter((t) => t.runId === runId)
      assert.deepEqual(
        ts.map((t) => [t.agentId, t.title, t.files ?? [], t.deliverable, t.status]),
        [
          ['codex', 'Landing de la panadería (opción A)', ['artifacts/opcion-a/'], 'file', 'done'],
          ['claude', 'Landing de la panadería (opción B)', ['artifacts/opcion-b/'], 'file', 'done'],
          ['gemini', 'Elegir la mejor opción de «Landing de la panadería»', [], 'text', 'done']
        ]
      )
      const work = calls.slice(from).filter((c) => c.mode === 'work')
      assert.deepEqual(work.map((c) => c.agentId).sort(), ['claude', 'codex', 'gemini'])
      assert.equal(work[2].agentId, 'gemini', 'el juez va el último, cuando las dos opciones están')
      assert.ok(work[2].prompt.includes('opción A en artifacts/opcion-a/ (de Codex)') && work[2].prompt.includes('GANA: A'), 'el juez sabe qué comparar')
      assert.ok(work[0].prompt.includes('Crea TODO dentro de artifacts/opcion-') && work[1].prompt.includes('Crea TODO dentro de artifacts/opcion-'))
      assert.match(ts[2].result ?? '', /^GANA: B/)
    })

    await check('T: «Reiniciar agente» tras un fallo — olvida el bloqueo, vuelve a estar disponible y recibe tareas', async () => {
      const tp = store.createProject('Reiniciar')
      __clearBlocksForChecks()
      const p = plan('Ok', [{ key: 'g', title: 'Resumir', description: 'resume el documento', agent: 'gemini', difficulty: 'medium', dependsOn: [], deliverable: 'text' }])
      planResponses = { claude: p, gemini: p }
      workBehaviour = (o) =>
        o.mode === 'work' && o.agent.id === 'gemini'
          ? Promise.resolve({ ok: false, text: '', usage: { input: 0, output: 0 }, errorKind: 'quota', errorMessage: '[API Error: An unknown error occurred.]' })
          : null
      const r1 = await sendMessage({ projectId: tp.id, text: 'Resume', filePaths: [] })
      await waitFor(() => !!finished(r1.runId), 10000, 'run T1')
      const gemini = (): ReturnType<typeof runtimeSnapshot>[number] => runtimeSnapshot().find((r) => r.agentId === 'gemini')!
      assert.equal(gemini().activity, 'error')
      workBehaviour = () => null
      const after = await resetAgent('gemini')
      assert.deepEqual([after.activity, after.reason, after.lastActivity], ['idle', undefined, 'Reiniciado'])
      // Ya no está bloqueado: lo siguiente que es suyo lo hace él.
      const from = calls.length
      const r2 = await sendMessage({ projectId: tp.id, text: 'Resume otra vez', filePaths: [] })
      await waitFor(() => !!finished(r2.runId), 10000, 'run T2')
      assert.deepEqual(calls.slice(from).filter((c) => c.mode === 'work').map((c) => c.agentId), ['gemini'])
      await assert.rejects(resetAgent('nadie'), /No existe ese agente/)
    })

    await check('P: eliminar un proyecto — se va lo suyo (y su .ai-cowork), nunca la carpeta del usuario ni otros proyectos', async () => {
      const userDir = join(root, 'carpeta-del-usuario')
      mkdirSync(join(userDir, '.ai-cowork', 'entregables'), { recursive: true })
      writeFileSync(join(userDir, 'codigo.js'), 'mío')
      const p = store.createProject('Para borrar')
      store.setWorkDir(p.id, userDir)
      const st = store.getProject(p.id)
      writeFileSync(join(st.project.dir, 'artifacts', 'resultado.md'), '# r')
      store.upsertTask({ id: 'tarea-de-p', projectId: p.id, runId: 'r', title: 't', description: '', agentId: 'codex', dependsOn: [], status: 'done', difficulty: 'easy', createdAt: 1, artifactIds: [] })
      store.scheduleSave(p.id) // guardado pendiente: no debe volver a crear la carpeta después de borrarla
      const { dirs, taskIds } = store.forgetProject(p.id)
      assert.deepEqual(dirs, [st.project.dir, join(userDir, '.ai-cowork')])
      assert.deepEqual(taskIds, ['tarea-de-p'])
      for (const d of dirs) rmSync(d, { recursive: true, force: true })
      await sleep(600)
      assert.equal(store.listProjects().some((x) => x.id === p.id), false)
      assert.equal(existsSync(st.project.dir), false, 'el guardado pendiente no la recrea')
      assert.equal(readFileSync(join(userDir, 'codigo.js'), 'utf8'), 'mío')
      assert.ok(store.listProjects().some((x) => x.id === project.id), 'los demás proyectos siguen')
      assert.throws(() => store.getProject(p.id), /no encontrado/)
    })

    await check('project.json persisted (debounced) with messages/tasks/artifacts/attachments', async () => {
      await sleep(600)
      store.flushAll()
      const saved = JSON.parse(readFileSync(join(project.dir, 'project.json'), 'utf8')) as ProjectState
      assert.equal(saved.project.id, project.id)
      assert.ok(saved.messages.length >= 10)
      assert.ok(saved.tasks.length >= 8)
      assert.ok(saved.artifacts.length >= 3)
      assert.deepEqual(saved.attachments.map((a) => a.relPath), ['attachments/Mi-foto.png'])
      assert.equal((saved.project as { dir?: string }).dir, undefined)
      // La memoria y las instrucciones van con el proyecto (y «Limpiar el chat» no las toca).
      assert.deepEqual(saved.memory?.map((e) => e.id), ['m1', 'm2', 'm3'])
      assert.equal(saved.instructions, 'Antes de terminar, ejecuta npm test.')
      const usage = JSON.parse(readFileSync(join(root, 'workspace', 'usage.json'), 'utf8')) as { records: { g: string }[] }
      assert.ok(usage.records.some((r) => r.g === 'openai'))
    })

    await check('Z: dos tareas a la vez → la segunda en una copia aparte, se integran las dos y una se deshace', async () => {
      __clearBlocksForChecks()
      const dir = store.workRoot(project.id)
      writeFileSync(join(dir, 'comun.txt'), 'a\nb\nc\nd\ne\nf\n')
      let arribaStarted: () => void = () => undefined
      const arribaGo = new Promise<void>((r) => (arribaStarted = r))
      let release: () => void = () => undefined
      const hold = new Promise<void>((r) => (release = r))
      const edit = (cwd: string, from: string, to: string): string => {
        const f = join(cwd, 'comun.txt')
        writeFileSync(f, readFileSync(f, 'utf8').replace(from, to))
        return f
      }
      workBehaviour = (o) => {
        if (o.mode !== 'work') return null
        if (o.prompt.includes('## Tu tarea: Arriba'))
          return (async () => {
            o.onFile?.(edit(o.cwd, 'a\n', 'A\n'))
            arribaStarted()
            await hold
            return { ok: true, text: 'Arriba hecho', usage: { input: 10, output: 5 } }
          })()
        if (o.prompt.includes('## Tu tarea: Abajo'))
          return (async () => {
            await arribaGo
            o.onFile?.(edit(o.cwd, 'f\n', 'F\n'))
            writeFileSync(join(o.cwd, 'abajo.txt'), 'nuevo\n')
            o.onFile?.(join(o.cwd, 'abajo.txt'))
            release()
            return { ok: true, text: 'Abajo hecho', usage: { input: 10, output: 5 } }
          })()
        return null
      }
      const p = plan('Ok', [
        { key: 'u', title: 'Arriba', description: 'primera línea', agent: 'claude', difficulty: 'medium', dependsOn: [], deliverable: 'file', files: ['comun.txt'] },
        { key: 'd', title: 'Abajo', description: 'última línea', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'file', files: ['comun.txt', 'abajo.txt'] }
      ], 'Arriba toca la primera línea de comun.txt; Abajo la última y crea abajo.txt')
      planResponses = { hermes: p, claude: p }
      const fromEv = events.length
      const r = await sendMessage({ projectId: project.id, text: 'Cambia las dos puntas de comun.txt en equipo', filePaths: [] })
      await waitFor(() => events.slice(fromEv).some((e) => e.kind === 'run.finished' && e.runId === r.runId), 15000, 'las dos terminan')
      assert.equal(readFileSync(join(dir, 'comun.txt'), 'utf8'), 'A\nb\nc\nd\ne\nF\n')
      assert.equal(readFileSync(join(dir, 'abajo.txt'), 'utf8'), 'nuevo\n')
      const ts = [...lastTasks(fromEv).values()]
      const arriba = ts.find((t) => t.title === 'Arriba')!
      const abajo = ts.find((t) => t.title === 'Abajo')!
      assert.equal([arriba, abajo].filter((t) => t.changes?.isolated).length, 1, 'una trabajó en una copia aparte')
      assert.ok(arriba.changes && abajo.changes)
      assert.equal(arriba.changes!.files, 1, 'lo integrado de la otra no cuenta como suyo')
      assert.ok(!existsSync(join(root, 'workspace', 'aislado', abajo.id)) && !existsSync(join(root, 'workspace', 'aislado', arriba.id)), 'las copias se borran')
      const diff = await getTaskChanges(project.id, abajo.id)
      assert.deepEqual(diff.files.map((f) => `${f.status} ${f.path}`).sort(), ['A abajo.txt', 'M comun.txt'])
      assert.match(diff.patch, /\+F/)
      // Deshacer la de arriba no toca lo que hizo la de abajo.
      const msg = await undoTask(project.id, arriba.id)
      assert.match(msg, /^Deshecha «Arriba»/)
      assert.equal(readFileSync(join(dir, 'comun.txt'), 'utf8'), 'a\nb\nc\nd\ne\nF\n')
      assert.ok(existsSync(join(dir, 'abajo.txt')))
      assert.match(await undoTask(project.id, arriba.id), /ya se deshizo/)
      workBehaviour = () => null
    })

    await check('registro de consumo: cada petición con sus llamadas (planificar y tareas), tiempo y resultado', async () => {
      const list = usageRuns()
      assert.ok(list.length >= 5, `peticiones registradas: ${list.length}`)
      assert.ok(list.every((r) => r.status !== 'running'), 'ninguna se queda «en marcha»')
      const ok = list.find((r) => r.status === 'ok' && r.calls.some((c) => c.kind === 'plan') && r.calls.some((c) => c.kind === 'task'))
      assert.ok(ok, 'hay una petición completada con planificación y tareas')
      assert.ok(ok.finishedAt! >= ok.startedAt && ok.tasks > 0 && ok.tasksDone === ok.tasks)
      assert.ok(ok.calls.every((c) => c.durationMs >= 0 && c.input >= 0 && c.output >= 0 && c.agentName))
      assert.ok(list.some((r) => r.status === 'cancelled'), 'las canceladas también quedan registradas')
      assert.ok(list.some((r) => r.calls.some((c) => !c.ok)), 'las llamadas fallidas también cuentan')
    })

    console.log(`\n${passed} orchestrator checks passed`)
  } finally {
    cancelAll()
    store.flushAll()
    await sleep(100)
    rmSync(root, { recursive: true, force: true })
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
