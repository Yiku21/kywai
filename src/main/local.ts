import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import type { AgentId, LocalEngine, LocalEngineStatus, LocalModel, LocalPullState } from '@shared/types'
import { OLLAMA_URL } from './agents/ollama'
import { lmsListModels, lmsPath, lmsServerRunning, lmsStartServer } from './agents/lmstudio'
import { commandExists, num, obj, str } from './agents/spawn'
import { emit } from './events'

// ---------- Estado de los motores locales ----------

async function ollamaStatus(): Promise<LocalEngineStatus> {
  const installed = await commandExists('ollama').catch(() => false)
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) throw new Error('down')
    const j = (await res.json()) as { models?: unknown[] }
    const models: LocalModel[] = (j.models ?? [])
      .map((m) => obj(m))
      .filter((m): m is Record<string, unknown> => !!m)
      .map((m) => {
        const details = obj(m.details)
        return {
          id: str(m.name) || str(m.model),
          label: str(m.name) || str(m.model),
          sizeBytes: num(m.size) || undefined,
          params: str(details?.parameter_size) || undefined,
          quantization: str(details?.quantization_level) || undefined
        }
      })
      .filter((m) => !!m.id)
    return { engine: 'ollama', installed: true, running: true, models, canStart: false, canPull: true }
  } catch {
    return { engine: 'ollama', installed, running: false, models: [], canStart: false, canPull: false }
  }
}

async function lmStudioStatus(): Promise<LocalEngineStatus> {
  const installed = !!lmsPath()
  if (!installed) return { engine: 'lmstudio', installed, running: false, models: [], canStart: false, canPull: false }
  const [running, models] = await Promise.all([lmsServerRunning(), lmsListModels().catch(() => [] as LocalModel[])])
  return { engine: 'lmstudio', installed, running, models, canStart: !running, canPull: false }
}

export async function listLocalEngines(): Promise<LocalEngineStatus[]> {
  return Promise.all([lmStudioStatus(), ollamaStatus()])
}

export async function startLocalServer(engine: LocalEngine): Promise<void> {
  if (engine !== 'lmstudio') throw new Error('Este motor se inicia desde su propia aplicación')
  await lmsStartServer()
}

// ---------- Descarga de modelos (Ollama) ----------

const MODEL_RE = /^[\w.:\-\/]+$/
let pullCtl: AbortController | null = null

function pullEvent(p: LocalPullState): void {
  emit({ kind: 'local.pull', pull: p })
}

/**
 * Descarga un modelo con Ollama. El progreso llega a la interfaz con eventos local.pull.
 * `onDone` se llama al terminar con éxito (p. ej. para asignarlo a un agente).
 */
export function pullOllamaModel(model: string, onDone: (model: string, agentId?: AgentId) => Promise<void>, agentId?: AgentId): void {
  if (typeof model !== 'string' || !MODEL_RE.test(model)) throw new Error('Nombre de modelo no válido')
  if (pullCtl) throw new Error('Ya hay una descarga en curso')
  const ctl = new AbortController()
  pullCtl = ctl
  pullEvent({ model, status: 'starting' })

  void (async () => {
    const layers = new Map<string, { total: number; completed: number }>()
    let lastEmit = 0
    try {
      const res = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, stream: true }),
        signal: ctl.signal
      })
      if (!res.ok || !res.body) throw new Error((await res.text().catch(() => '')) || `Ollama respondió ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let success = false
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line.startsWith('{')) continue
          const o = JSON.parse(line) as Record<string, unknown>
          if (str(o.error)) throw new Error(str(o.error))
          const status = str(o.status)
          const digest = str(o.digest)
          if (digest && num(o.total)) layers.set(digest, { total: num(o.total), completed: num(o.completed) })
          if (status === 'success') success = true
          const now = Date.now()
          if (now - lastEmit > 250 || status === 'success') {
            lastEmit = now
            let total = 0
            let completed = 0
            for (const l of layers.values()) {
              total += l.total
              completed += l.completed
            }
            pullEvent({
              model,
              status: /verif|writing|success/i.test(status) ? 'verifying' : 'downloading',
              total: total || undefined,
              completed: total ? completed : undefined,
              message: status
            })
          }
        }
      }
      if (!success) throw new Error('La descarga terminó sin confirmar')
      await onDone(model, agentId)
      pullEvent({ model, status: 'done' })
    } catch (e) {
      if (ctl.signal.aborted) pullEvent({ model, status: 'cancelled' })
      else {
        const msg = (e as Error).message || 'Error desconocido'
        pullEvent({ model, status: 'error', message: /fetch failed|ECONNREFUSED/i.test(msg) ? 'Ollama no está en ejecución' : msg.slice(0, 200) })
      }
    } finally {
      if (pullCtl === ctl) pullCtl = null
    }
  })()
}

export function cancelLocalPull(): void {
  pullCtl?.abort()
}

// ---------- Archivos pegados (Ctrl+V) ----------

const MAX_PASTE = 25 * 1024 * 1024

export function savePastedFile(name: unknown, data: unknown): string {
  if (!(data instanceof Uint8Array)) throw new Error('Datos no válidos')
  if (data.byteLength === 0 || data.byteLength > MAX_PASTE) throw new Error('El archivo pegado es demasiado grande (máx. 25 MB)')
  const raw = typeof name === 'string' && name.trim() ? name.trim() : 'pegado.png'
  const ext = extname(raw).toLowerCase().replace(/[^.\w]/g, '').slice(0, 8) || '.png'
  const base = raw
    .slice(0, raw.length - extname(raw).length)
    .normalize('NFKD')
    .replace(/[^\w\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'pegado'
  const dir = join(tmpdir(), 'ai-cowork-pegados', `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${base}${ext}`)
  writeFileSync(file, data)
  return file
}
