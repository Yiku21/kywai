import type { ChatMessage, CoworkEvent } from '@shared/types'
import type { DataSlice } from '@/store/cowork'
import type { SfxName } from './audio'
import { revealKey, startReveal } from './reveal'

/** Quién habla: su proveedor da el timbre, y el becario suena más agudo que su jefe. */
export interface Speaker { id: string; provider: string; becario: boolean }
/** Devuelve cuándo empieza a hablar y a qué ritmo (para escribir el texto a la vez), o nada si no suena. */
export type SpeakFn = (speaker: Speaker, text: string, error: boolean) => { delayMs: number; rate: number } | null | void

/** Un mensaje recién creado se oye aunque llegue de golpe; uno viejo que se reenvía (reconexión) no. */
const FRESH_MS = 20_000
/** Letras que suenan de un mensaje que llega entero, y de cada trozo de uno que llega en streaming. */
const WHOLE_SYLLABLES = 28
const DELTA_SYLLABLES = 10

/** Se llama con el estado ANTERIOR, después del filtro de IDs del store. */
export function createEventAudio(play: (name: SfxName) => void, speak?: SpeakFn) {
  const heard = { live: new Set<string>(), demo: new Set<string>() }
  /** Cuántos caracteres de cada mensaje de agente ya han sonado (para no repetir al llegar el texto entero). */
  const spoken = { live: new Map<string, number>(), demo: new Map<string, number>() }
  /** Lo que ya sonó de cada mensaje de tarea: sus frases y su resultado. */
  const workSaid = { live: new Map<string, Set<string>>(), demo: new Map<string, Set<string>>() }
  const workLines = (m: ChatMessage): string[] => [
    ...(m.work?.steps ?? []).flatMap((s) => (s.kind === 'note' && s.text.trim() ? [s.text.trim()] : [])),
    ...(m.text.trim() ? [m.text.trim()] : [])
  ]
  /**
   * Mensaje de una tarea: suena cada frase nueva que cuenta el agente mientras trabaja y, al acabar, su resultado
   * (salvo que sea la última frase, que ya sonó). Lo que contaba antes de abrir la app o de reconectar no se repite.
   */
  function sayWork(before: DataSlice, demo: boolean, m: ChatMessage, agentId: string): void {
    const map = workSaid[demo ? 'demo' : 'live']
    let said = map.get(m.id)
    if (!said) {
      const previous = before.messages.find((x) => x.id === m.id)
      said = new Set(previous ? workLines(previous) : !demo && Date.now() - m.createdAt >= FRESH_MS ? workLines(m) : [])
      map.set(m.id, said)
      if (map.size > 300) map.delete(map.keys().next().value!)
    }
    for (const line of workLines(m)) {
      if (said.has(line)) continue
      said.add(line)
      say(before, demo, m.id, agentId, line, line.length, m.tone === 'error', WHOLE_SYLLABLES, line === m.text.trim() ? revealKey(m.id) : revealKey(m.id, line))
    }
  }
  /** [key]: lo que se escribe a la vez que habla (un mensaje entero o una frase de su tarea); sin ella, solo suena. */
  function say(before: DataSlice, demo: boolean, messageId: string, agentId: string, text: string, total: number, error: boolean, max: number, key?: string): void {
    if (!speak) return
    const map = spoken[demo ? 'demo' : 'live']
    map.set(messageId, total)
    if (map.size > 500) map.delete(map.keys().next().value!)
    if (!text.trim()) return
    const becario = agentId.includes('-becario-')
    const provider = before.agents[agentId]?.provider ?? agentId.split('-becario-')[0]
    const voice = speak({ id: agentId, provider, becario }, max === DELTA_SYLLABLES ? text : text.slice(0, max * 3), error)
    // Lo que llega de golpe se escribe letra a letra al ritmo de su voz.
    if (voice && key) startReveal(key, text, voice.rate, voice.delayMs, max)
  }
  return {
    resetDemo(): void { heard.demo.clear(); spoken.demo.clear() },
    handle(e: CoworkEvent, before: DataSlice): void {
      const projectId = 'projectId' in e ? e.projectId
        : e.kind === 'task.upsert' ? e.task.projectId
          : e.kind === 'message.upsert' ? e.message.projectId
            : e.kind === 'artifact.created' ? e.artifact.projectId : undefined
      if (!e.demo && projectId && before.project?.id !== projectId) return
      const seen = heard[e.demo ? 'demo' : 'live']
      function once(key: string, name: SfxName): void {
        if (seen.has(key)) return
        seen.add(key)
        if (seen.size > 4000) seen.delete(seen.values().next().value!)
        play(name)
      }
      function taskErrorKey(agentId: string, runId?: string): string | undefined {
        const task = Object.values(before.tasks).find((t) =>
          t.agentId === agentId && (!runId || t.runId === runId) && (t.status === 'running' || t.status === 'failed'))
        return task ? `error:task:${task.id}` : undefined
      }
      // La voz del agente va aparte de los avisos: suena mientras escribe, trozo a trozo si llega en streaming.
      if (e.kind === 'message.delta') {
        const target = before.messages.find((m) => m.id === e.messageId)
        const who = target?.author
        if (target && who?.type === 'agent') {
          const done = spoken[e.demo ? 'demo' : 'live'].get(target.id) ?? target.text.length
          say(before, !!e.demo, target.id, who.agentId, e.text, done + e.text.length, target.tone === 'error', DELTA_SYLLABLES)
        }
      } else if (e.kind === 'message.upsert' && e.message.work && e.message.author.type === 'agent') {
        sayWork(before, !!e.demo, e.message, e.message.author.agentId)
      } else if (e.kind === 'message.upsert' && (e.demo || Date.now() - e.message.createdAt < FRESH_MS)) {
        const m = e.message
        const who = m.author
        const done = spoken[e.demo ? 'demo' : 'live'].get(m.id) ?? 0
        if (who.type === 'agent' && m.text.length > done) {
          say(before, !!e.demo, m.id, who.agentId, m.text.slice(done), m.text.length, m.tone === 'error', done ? DELTA_SYLLABLES : WHOLE_SYLLABLES, done ? undefined : revealKey(m.id))
        }
      }
      switch (e.kind) {
        case 'task.upsert': {
          const task = e.task
          const previous = before.tasks[task.id]
          if (previous?.status === task.status) break // progreso, actividad y tokens no suenan
          if (task.status === 'running') once(`start:${task.id}:${task.startedAt ?? 0}`, 'taskStart')
          if (task.status === 'done') once(`done:${task.id}`, 'taskComplete')
          if (task.status === 'failed') once(`error:task:${task.id}`, 'error')
          break
        }
        case 'task.completed':
          // El motor envía también task.upsert(done); ambos representan el mismo final.
          if (before.tasks[e.taskId]?.status !== 'done') once(`done:${e.taskId}`, 'taskComplete')
          break
        case 'agent.runtime': {
          const rt = e.runtime
          const previous = before.runtimes[rt.agentId]
          if (rt.activity === previous?.activity) break
          if (rt.activity === 'error' || (rt.activity === 'offline' && !!rt.reason && previous?.activity !== 'offline')) {
            const taskId = rt.taskId ?? previous?.taskId
            const key = taskId ? `error:task:${taskId}` : taskErrorKey(rt.agentId)
            // Los errores sin tarea pueden repetirse legítimamente tras recuperarse.
            if (key) once(key, 'error')
            else play('error')
          } else if (rt.activity === 'thinking' && !rt.taskId && before.activeRunId && previous?.activity !== 'working') {
            once(`planning:${before.activeRunId}`, 'taskStart')
          }
          break
        }
        case 'message.upsert': {
          const message = e.message
          if (message.author.type === 'user' || message.streaming || !message.text.trim()) break
          const previous = before.messages.find((m) => m.id === message.id)
          if (previous && !previous.streaming && previous.text.trim()) break
          if (message.tone === 'error') {
            const key = message.author.type === 'agent' ? taskErrorKey(message.author.agentId, message.runId) : undefined
            once(key ?? `message:${message.id}`, 'error')
          } else once(`message:${message.id}`, message.taskIds?.length ? 'projectCreated' : 'message')
          break
        }
        case 'transfer.started':
          if (!before.transfers.some((t) => t.id === e.transfer.id)) once(`transfer:${e.transfer.id}`, 'transfer')
          break
        case 'artifact.created':
          if (!before.artifacts[e.artifact.id]) once(`file:${e.artifact.id}`, 'fileCreated')
          break
        case 'run.finished':
          if (!e.ok && before.activeRunId === e.runId &&
            !Object.values(before.tasks).some((t) => t.runId === e.runId && (t.status === 'failed' || t.status === 'cancelled')) &&
            !before.messages.some((m) => m.runId === e.runId && m.tone === 'error')) once(`run-error:${e.runId}`, 'error')
          break
      }
    }
  }
}
