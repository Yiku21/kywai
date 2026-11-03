import { describe, expect, it } from 'vitest'
import { createClaudeParser } from './claude'
import { createCodexParser } from './codex'
import type { ProcessOutcome } from './types'

const ended: ProcessOutcome = { code: 0, stderrTail: '', cancelled: false }

describe('la sesión del CLI se recoge para poder retomarla', () => {
  it('Claude Code: el session_id de la salida stream-json', () => {
    const p = createClaudeParser({})
    p.line({ type: 'system', subtype: 'init', session_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', model: 'claude-opus-5-5' })
    p.line({ type: 'result', subtype: 'success', result: 'Hecho.', session_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', usage: { input_tokens: 10, output_tokens: 2 } })
    const r = p.finish(ended)
    expect(r.ok).toBe(true)
    expect(r.sessionId).toBe('7c9e6679-7425-40de-944b-e07fc1f90ae7')
  })

  it('Codex: el thread_id del evento thread.started; sin él, nada', () => {
    const p = createCodexParser({})
    p.line({ type: 'thread.started', thread_id: '0b6f1c2e-3d4a-4f5b-8c6d-7e8f9a0b1c2d' })
    p.line({ type: 'item.completed', item: { type: 'agent_message', text: 'Listo.' } })
    p.line({ type: 'turn.completed', usage: { input_tokens: 5, output_tokens: 1 } })
    expect(p.finish(ended)).toMatchObject({ ok: true, text: 'Listo.', sessionId: '0b6f1c2e-3d4a-4f5b-8c6d-7e8f9a0b1c2d' })
    const q = createCodexParser({})
    q.line({ type: 'thread.started', thread_id: 'raro; rm -rf /' })
    q.line({ type: 'turn.completed', usage: {} })
    expect(q.finish(ended).sessionId).toBeUndefined()
  })
})
