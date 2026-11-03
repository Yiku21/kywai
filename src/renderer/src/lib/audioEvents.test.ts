import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage, CoworkEvent } from '@shared/types'
import type { DataSlice } from '@/store/cowork'
import { createEventAudio, type SpeakFn } from './audioEvents'
import { __clearReveals, isRevealing, revealKey } from './reveal'

function slice(messages: ChatMessage[] = []): DataSlice {
  return {
    agents: { claude: { id: 'claude', provider: 'claude' }, 'claude-becario-1': { id: 'claude-becario-1', provider: 'claude' } },
    agentOrder: [], runtimes: {}, tasks: {}, messages, artifacts: {}, attachments: [], transfers: [], quotas: [],
    activeRunId: null, activeRunIds: [], memory: [], instructions: '', project: { id: 'p1' }
  } as unknown as DataSlice
}

function message(over: Partial<ChatMessage>): ChatMessage {
  return { id: 'm1', projectId: 'p1', author: { type: 'agent', agentId: 'claude' }, text: 'Terminé la primera parte.', createdAt: Date.now(), ...over }
}

function setup() {
  const play = vi.fn()
  const speak = vi.fn<SpeakFn>()
  const audio = createEventAudio(play, speak)
  const upsert = (m: ChatMessage, before = slice()): void => audio.handle({ kind: 'message.upsert', message: m } as CoworkEvent, before)
  return { play, speak, audio, upsert }
}

describe('voces de los agentes', () => {
  it('un mensaje de agente suena con su proveedor', () => {
    const { speak, upsert } = setup()
    upsert(message({}))
    expect(speak).toHaveBeenCalledTimes(1)
    expect(speak.mock.calls[0][0]).toEqual({ id: 'claude', provider: 'claude', becario: false })
    expect(speak.mock.calls[0][1]).toContain('Terminé')
  })

  it('el becario habla con la voz de su jefe, más aguda', () => {
    const { speak, upsert } = setup()
    upsert(message({ author: { type: 'agent', agentId: 'claude-becario-1' } }))
    expect(speak.mock.calls[0][0]).toMatchObject({ provider: 'claude', becario: true })
  })

  it('el usuario y el sistema no hablan, y el sistema sigue sonando como aviso', () => {
    const { speak, play, upsert } = setup()
    upsert(message({ id: 'u', author: { type: 'user' } }))
    upsert(message({ id: 's', author: { type: 'system' } }))
    expect(speak).not.toHaveBeenCalled()
    expect(play).toHaveBeenCalledWith('message')
  })

  it('el streaming suena por trozos y el texto final no repite lo ya dicho', () => {
    const { speak, audio, upsert } = setup()
    upsert(message({ text: '', streaming: true }))
    expect(speak).not.toHaveBeenCalled()
    const growing = slice([message({ text: '', streaming: true })])
    audio.handle({ kind: 'message.delta', messageId: 'm1', text: 'Hola ' } as CoworkEvent, growing)
    audio.handle({ kind: 'message.delta', messageId: 'm1', text: 'equipo' } as CoworkEvent, slice([message({ text: 'Hola ', streaming: true })]))
    expect(speak).toHaveBeenCalledTimes(2)
    upsert(message({ text: 'Hola equipo', streaming: false }))
    expect(speak).toHaveBeenCalledTimes(2)
    upsert(message({ text: 'Hola equipo. Listo.', streaming: false }))
    expect(speak).toHaveBeenCalledTimes(3)
    expect(speak.mock.calls[2][1]).toBe('. Listo.')
  })

  it('el mensaje de una tarea: suena cada frase nueva y el resultado no repite la última', () => {
    const { speak, upsert } = setup()
    const started = Date.now() - 5 * 60_000 // la tarea empezó hace rato: las frases suenan igual
    const work = (text: string, ...notes: string[]): ChatMessage =>
      message({ id: 'w1', text, createdAt: started, work: { taskId: 't1', title: 'Arreglar', status: text ? 'done' : 'running', steps: notes.map((n) => ({ kind: 'note' as const, text: n })) } })
    const first = work('', 'Reviso el formulario.')
    upsert(first, slice([work('')]))
    upsert(work('', 'Reviso el formulario.', 'Falla el correo: lo arreglo.'), slice([first]))
    upsert(work('Falla el correo: lo arreglo.', 'Reviso el formulario.'), slice([first]))
    expect(speak.mock.calls.map((c) => c[1])).toEqual(['Reviso el formulario.', 'Falla el correo: lo arreglo.'])
    // Al abrir la app a mitad de la tarea, lo que ya había contado no suena.
    const late = setup()
    late.upsert(work('', 'Reviso el formulario.', 'Falla el correo: lo arreglo.'))
    expect(late.speak).not.toHaveBeenCalled()
  })

  it('lo que suena se escribe a la vez, al ritmo de la voz; sin voz (silenciada) sale entero', () => {
    __clearReveals()
    const play = vi.fn()
    const voiced = createEventAudio(play, () => ({ delayMs: 0, rate: 15 }))
    voiced.handle({ kind: 'message.upsert', message: message({ id: 'r1' }) } as CoworkEvent, slice())
    expect(isRevealing(revealKey('r1'))).toBe(true)
    const work = message({ id: 'r2', text: '', work: { taskId: 't', title: 'T', status: 'running', steps: [{ kind: 'note', text: 'Reviso el código.' }] } })
    voiced.handle({ kind: 'message.upsert', message: work } as CoworkEvent, slice([{ ...work, work: { ...work.work!, steps: [] } }]))
    expect(isRevealing(revealKey('r2', 'Reviso el código.'))).toBe(true)
    const silent = createEventAudio(play, () => null)
    silent.handle({ kind: 'message.upsert', message: message({ id: 'r3' }) } as CoworkEvent, slice())
    expect(isRevealing(revealKey('r3'))).toBe(false)
  })

  it('un mensaje viejo que se reenvía no suena', () => {
    const { speak, upsert } = setup()
    upsert(message({ createdAt: Date.now() - 60_000 }))
    expect(speak).not.toHaveBeenCalled()
  })

  it('un error suena como error', () => {
    const { speak, upsert } = setup()
    upsert(message({ tone: 'error', text: 'Falló la compilación' }))
    expect(speak.mock.calls[0][2]).toBe(true)
  })
})
