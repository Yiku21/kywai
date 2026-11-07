/**
 * Servidor de pruebas para la app del móvil (Órbita): el servidor web y el motor reales de kywai con agentes
 * simulados (sin llamar a ningún modelo ni gastar cuota). Planifican, trabajan con su paso a paso, crean resultados
 * y proponen recuerdos, para ver el mundo vivo en el emulador.
 *
 *   node src/main/__checks__/buildMobileDevServer.mjs <tmp>/dev.cjs   (con la cuota sustituida: no consulta a nadie)
 *   AICW_CHECK_ROOT=<carpeta temporal> node <tmp>/dev.cjs [puerto] [código]
 *
 * Desde el emulador de Android el ordenador es http://10.0.2.2:<puerto>.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getConfig, loadConfig, setAgentAccess, setHermesModel, setPlanApproval } from '../config'
import { hermesModelLabel, hermesModelsInfo } from '../hermesModels'
import { emit } from '../events'
import { addMemory, deleteMemory, setInstructions, updateMemory } from '../memory'
import { mobileSigningKey } from '../mobileAuth'
import { __setOrbitaReleaseDirForChecks } from '../orbitaRelease'
import { __setBackendsForChecks, activeRunsFor, allAgents, approvePlan, cancelRun, discardRun, rejectPlan, resetAgent, resumeRun, runtimeSnapshot, sendMessage } from '../orchestrator'
import * as store from '../projects'
import { flushTaskTraces, initTaskTraces } from '../taskTrace'
import { flushUsageLog, initUsageLog, usageRuns } from '../usageLog'
import { startWebServer, stopWebServer, webMethods } from '../webServer'
import type { RunAgentOptions, RunAgentResult } from '../agents/types'

const port = Number(process.argv[2] ?? 8790)
const code = process.argv[3] ?? 'orbita-dev-code-0123456789'

const sleep = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms)
  signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('abort')) }, { once: true })
})

/**
 * Plan fijo: tres tareas en paralelo y una que espera a otra, para ver envíos, esperas y entregas. Si le pides
 * cambios al plan, quita la investigación (así se ve el plan cambiado).
 */
function plan(prompt: string): string {
  const ask = /## Petición[^\n]*\n+([^\n]+)/.exec(prompt)?.[1]?.slice(0, 60) ?? 'la petición'
  const feedback = /## Su respuesta a ese plan\n+([^\n]+)/.exec(prompt)?.[1]
  if (feedback) {
    return JSON.stringify({
      reply: `Cambiado según lo que me dices («${feedback.slice(0, 60)}»): sin la investigación. Claude diseña la propuesta y, cuando esté, Codex construye la interfaz.`,
      tasks: [
        { key: 't1', title: 'Diseñar la propuesta', description: 'Estructura, tono y bocetos de la propuesta.', agent: 'claude', difficulty: 'medium', dependsOn: [], deliverable: 'file', acceptance: 'Hay un documento propuesta.md', files: ['propuesta.md'] },
        { key: 't3', title: 'Construir la interfaz', description: 'Prototipo HTML a partir de la propuesta.', agent: 'codex', difficulty: 'medium', dependsOn: ['t1'], deliverable: 'file', files: ['prototipo.html', 'prototipo/'] },
      ],
    })
  }
  return JSON.stringify({
    reply: `He entendido que quieres «${ask}». Claude diseña la propuesta (es el mejor en diseño), Gemini busca referencias a la vez y Codex construye la interfaz cuando la propuesta esté lista.`,
    tasks: [
      { key: 't1', title: 'Diseñar la propuesta', description: 'Estructura, tono y bocetos de la propuesta.', agent: 'claude', difficulty: 'medium', dependsOn: [], deliverable: 'file', acceptance: 'Hay un documento propuesta.md', files: ['propuesta.md'] },
      { key: 't2', title: 'Investigar referencias', description: 'Tres referencias visuales con lo que aporta cada una.', agent: 'gemini', difficulty: 'easy', dependsOn: [], deliverable: 'file', files: ['referencias.md'] },
      { key: 't3', title: 'Construir la interfaz', description: 'Prototipo HTML a partir de la propuesta.', agent: 'codex', difficulty: 'medium', dependsOn: ['t1'], deliverable: 'file', files: ['prototipo.html', 'prototipo/'] },
    ],
    memory: [{ kind: 'preference', text: 'Iluminación suave, sin exceso de neón.' }],
  })
}

const OUTPUTS: Record<string, [string, string]> = {
  claude: ['propuesta.md', '# Propuesta\n\n## Idea\n\nUn mundo vivo donde **los paneles flotan** sobre la ciudad.\n\n- Cristal esmerilado\n- Colores desaturados\n- Pequeños acentos\n'],
  gemini: ['referencias.md', '# Referencias\n\n1. Interfaces de cristal de los sistemas operativos actuales.\n2. Mapas de ciudades de noche.\n3. Paneles de control de estudios de animación.\n'],
  codex: ['prototipo.html', '<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{font-family:sans-serif;background:#0b1324;color:#eaf0fa;padding:24px}.c{border-radius:24px;padding:20px;background:rgba(255,255,255,.08)}</style></head><body><div class="c"><h1>ÓRBITA</h1><p>El mundo es la interfaz.</p></div></body></html>'],
}

const screen = (n: number, color: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="#0b1324"/><rect x="24" y="24" width="312" height="592" rx="28" fill="${color}" opacity=".35"/><text x="48" y="96" fill="#eaf0fa" font-family="sans-serif" font-size="28">Pantalla ${n}</text></svg>`
const PROTOTYPE: Array<[string, string]> = [
  ['01-bienvenida.svg', screen(1, '#4fc3d6')],
  ['02-inicio.svg', screen(2, '#8b7cf6')],
  ['03-chat.svg', screen(3, '#46c28e')],
  ['estilos.css', 'body { background: #0b1324; color: #eaf0fa; }\n'],
  ['notas.md', '# Prototipo\n\nTres pantallas y los estilos comunes.\n'],
]

async function work(o: RunAgentOptions): Promise<RunAgentResult> {
  const id = o.agent.provider === 'codex' ? 'codex' : o.agent.provider === 'gemini' ? 'gemini' : 'claude'
  const [file, content] = OUTPUTS[id]
  const step = (ms: number): Promise<void> => sleep(ms, o.signal)
  try {
    o.onTrace?.({ type: 'thinking', text: 'Leyendo la tarea y lo que ya hay en el proyecto…' })
    o.onThinking?.('Leyendo la tarea')
    await step(2500)
    o.onTrace?.({ type: 'tool', id: 'c1', tool: 'command', title: 'ls -la', body: 'ls -la' })
    o.onActivity?.('Revisando la carpeta del proyecto', 'tool')
    await step(1200)
    o.onTrace?.({ type: 'result', id: 'c1', ok: true, output: 'total 8\ndrwxr-xr-x  attachments\n-rw-r--r--  project.json' })
    for (let i = 1; i <= 4; i++) {
      o.onProgress?.(i / 5)
      o.onTrace?.({ type: 'text', text: `Paso ${i} de 4: preparando ${file}…` })
      o.onActivity?.(`Escribiendo ${file} (${i}/4)`, 'text')
      await step(2600)
    }
    o.onTrace?.({ type: 'tool', id: 'w1', tool: 'write', title: `Escribir ${file}`, body: content.slice(0, 200) })
    writeFileSync(join(o.cwd, file), content)
    o.onFile?.(file)
    // Codex entrega varios archivos en una carpeta: en el chat aparecen juntos en una carpeta desplegable.
    if (id === 'codex') {
      mkdirSync(join(o.cwd, 'prototipo'), { recursive: true })
      for (const [name, body] of PROTOTYPE) {
        writeFileSync(join(o.cwd, 'prototipo', name), body)
        o.onFile?.(`prototipo/${name}`)
      }
    }
    o.onTrace?.({ type: 'result', id: 'w1', ok: true })
    o.onProgress?.(1)
    await step(800)
    const memory = id === 'claude' ? '\n\n## Para la memoria\n- preferencia: Priorizar controles accesibles con una mano.' : ''
    return { ok: true, text: `Listo: ${file}.${memory}`, usage: { input: 1200, output: 400 } }
  } catch {
    return { ok: false, text: '', errorKind: 'cancelled', usage: { input: 0, output: 0 } }
  }
}

const cfg = loadConfig()
// Todos «instalados»; el coordinador planifica sin modelo.
cfg.agents = cfg.agents.map((a) => ({ ...a, enabled: a.provider !== 'ollama' && a.provider !== 'lmstudio' }))
store.initProjects(cfg.workspaceRoot)
store.ensureFirstProject()
mkdirSync(cfg.workspaceRoot, { recursive: true })
initUsageLog(cfg.workspaceRoot)
initTaskTraces(cfg.workspaceRoot)
__setBackendsForChecks({
  presence: async () => null,
  run: async (o) => {
    if (o.mode === 'plan') {
      await sleep(3500, o.signal).catch(() => undefined)
      return { ok: true, text: plan(o.prompt), usage: { input: 800, output: 300 } }
    }
    return work(o)
  },
})

webMethods.set('getConfig', getConfig)
webMethods.set('listProjects', store.listProjects)
webMethods.set('createProject', (name) => store.createProject(name as string))
webMethods.set('loadProject', (id) => {
  const active = activeRunsFor(id as string)
  return { ...store.snapshotProject(id as string), activeRunId: active.at(-1), activeRunIds: active }
})
webMethods.set('getRuntime', () => ({ runtimes: runtimeSnapshot(), quotas: [] }))
webMethods.set('getUsageRuns', usageRuns)
webMethods.set('refreshQuotas', async () => [])
webMethods.set('sendMessage', (input) => sendMessage(input as Parameters<typeof sendMessage>[0]))
webMethods.set('mobileStopRun', (id) => cancelRun(id as string, 'pause'))
webMethods.set('resumeRun', (id, runId) => resumeRun(id as string, runId as string))
webMethods.set('mobileDiscardRun', (id, runId) => discardRun(id as string, runId as string))
webMethods.set('mobileRunningProjects', () => store.listProjects().filter((p) => activeRunsFor(p.id).length).map((p) => p.id))
webMethods.set('resetAgent', (id) => resetAgent(id as string))
webMethods.set('addMemory', (id, input) => addMemory(id as string, input as Parameters<typeof addMemory>[1], { status: 'confirmed', by: 'user', byName: 'Tú' }))
webMethods.set('updateMemory', (id, memoryId, patch) => updateMemory(id as string, memoryId as string, patch as Parameters<typeof updateMemory>[2]))
webMethods.set('deleteMemory', (id, memoryId) => deleteMemory(id as string, memoryId as string))
webMethods.set('setInstructions', (id, text) => setInstructions(id as string, text as string))
// Dictado simulado (el real usa Whisper en el ordenador): devuelve un texto con la duración de la nota.
webMethods.set('transcribeAudio', async (path) => {
  const bytes = statSync(path as string).size
  await new Promise((r) => setTimeout(r, 1500))
  return `Nota de voz de prueba de ${Math.max(1, Math.round((bytes - 44) / 32000))} s: revisa el prototipo y dime qué cambiarías`
})
webMethods.set('setAgentAccess', (access) => {
  setAgentAccess(access as 'full' | 'project')
  emit({ kind: 'config.updated', config: getConfig() })
})
webMethods.set('approvePlan', (id, messageId) => approvePlan(id as string, messageId as string))
webMethods.set('rejectPlan', (id, messageId) => rejectPlan(id as string, messageId as string))
webMethods.set('setPlanApproval', (on) => {
  setPlanApproval(on as boolean)
  emit({ kind: 'config.updated', config: getConfig() })
})

// «/model»: los modelos de Hermes de este equipo (su configuración y su caché, sin claves) y el elegido aquí.
const hermes = (): ReturnType<typeof hermesModelsInfo> => hermesModelsInfo(getConfig().agents.find((a) => a.provider === 'hermes'))
webMethods.set('getHermesModels', hermes)
webMethods.set('setHermesModel', (choice) => {
  setHermesModel(choice as { provider: string; model: string } | null, hermesModelLabel)
  emit({ kind: 'config.updated', config: getConfig() })
  return hermes()
})

// La versión de Órbita publicada en este código (o ORBITA_RELEASE_DIR): Ajustes → «Buscar actualizaciones».
__setOrbitaReleaseDirForChecks(process.env.ORBITA_RELEASE_DIR ?? join(process.cwd(), 'android', 'release'))

// Clave guardada (como en el ordenador real): reiniciar el servidor no desempareja el móvil.
void startWebServer(port, code, undefined, allAgents, mobileSigningKey(join(cfg.workspaceRoot, 'mobile-key'))).then(() => {
  console.log(`Servidor de pruebas Órbita en http://127.0.0.1:${port} (emulador: http://10.0.2.2:${port})`)
  console.log(`Proyectos: ${store.listProjects().map((p) => p.name).join(', ')}`)
})

const stop = (): void => {
  void stopWebServer().finally(() => {
    flushTaskTraces()
    flushUsageLog()
    process.exit(0)
  })
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
