import { describe, expect, it } from 'vitest'
import type { ChatMessage, TaskWork } from './types'
import { upsertChatMessage } from './chatOrder'

const msg = (id: string, createdAt: number, work?: Partial<TaskWork>): ChatMessage => ({
  id,
  projectId: 'p',
  author: { type: 'agent', agentId: 'claude' },
  text: '',
  createdAt,
  ...(work ? { work: { taskId: id, title: id, status: 'running', steps: [], ...work } } : {})
})

describe('orden del chat', () => {
  it('el bloque de una tarea que vuelve a trabajar baja al final', () => {
    const list = [msg('a', 1, { status: 'stopped' }), msg('b', 2, { status: 'running' })]
    const out = upsertChatMessage(list, msg('a', 3, { status: 'running' }))
    expect(out.map((m) => m.id)).toEqual(['b', 'a'])
  })

  it('las actualizaciones normales se quedan en su sitio', () => {
    const list = [msg('a', 1, { status: 'running' }), msg('b', 2)]
    expect(upsertChatMessage(list, msg('a', 1, { status: 'done' })).map((m) => m.id)).toEqual(['a', 'b'])
    // Un bloque que sigue trabajando no salta aunque cambie la hora (la demo la cambia en cada aviso).
    expect(upsertChatMessage(list, msg('a', 5, { status: 'running' })).map((m) => m.id)).toEqual(['a', 'b'])
    expect(upsertChatMessage(list, msg('c', 3)).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })
})
