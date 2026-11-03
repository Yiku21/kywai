import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { forgetSessions, initAgentSessions, lastSession, rememberSession, SESSION_MAX_AGE_MS, supportsResume } from './agentSessions'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aicw-sessions-'))
  initAgentSessions(dir)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const NOW = Date.UTC(2026, 9, 13, 12)
const s = (sessionId: string, extra = {}) => ({ sessionId, provider: 'claude' as const, cwd: '/p/web', taskTitle: 'Hacer la web', at: NOW, ...extra })

describe('sesiones de CLI que se retoman', () => {
  it('solo Claude Code y Codex saben retomar una sesión', () => {
    expect(supportsResume('claude')).toBe(true)
    expect(supportsResume('codex')).toBe(true)
    expect(supportsResume('gemini')).toBe(false)
    expect(supportsResume('hermes')).toBe(false)
  })

  it('recuerda la última sesión de cada agente y la devuelve si es del mismo CLI y la misma carpeta', () => {
    rememberSession('p1', 'claude', s('11111111-aaaa-4bbb-8ccc-000000000001'))
    rememberSession('p1', 'claude', s('11111111-aaaa-4bbb-8ccc-000000000002', { taskTitle: 'Añadir buscador' }))
    expect(lastSession('p1', 'claude', { provider: 'claude', cwd: '/p/web' }, NOW)).toMatchObject({ sessionId: '11111111-aaaa-4bbb-8ccc-000000000002', taskTitle: 'Añadir buscador' })
    expect(lastSession('p1', 'claude', { provider: 'codex', cwd: '/p/web' }, NOW)).toBeUndefined()
    expect(lastSession('p1', 'claude', { provider: 'claude', cwd: '/otra' }, NOW)).toBeUndefined()
    expect(lastSession('p1', 'codex', { provider: 'codex', cwd: '/p/web' }, NOW)).toBeUndefined()
  })

  it('una sesión vieja no se retoma', () => {
    rememberSession('p1', 'codex', s('22222222-aaaa-4bbb-8ccc-000000000001', { provider: 'codex' }))
    expect(lastSession('p1', 'codex', { provider: 'codex', cwd: '/p/web' }, NOW + SESSION_MAX_AGE_MS - 1)).toBeDefined()
    expect(lastSession('p1', 'codex', { provider: 'codex', cwd: '/p/web' }, NOW + SESSION_MAX_AGE_MS + 1)).toBeUndefined()
  })

  it('se guarda en agent-sessions/<proyecto>.json y sobrevive a vaciar la caché; olvidar el proyecto lo borra', () => {
    rememberSession('p1', 'claude', s('33333333-aaaa-4bbb-8ccc-000000000001'))
    expect(readFileSync(join(dir, 'agent-sessions', 'p1.json'), 'utf8')).toContain('33333333-aaaa-4bbb-8ccc-000000000001')
    forgetSessions()
    expect(lastSession('p1', 'claude', { provider: 'claude', cwd: '/p/web' }, NOW)?.sessionId).toBe('33333333-aaaa-4bbb-8ccc-000000000001')
    forgetSessions('p1')
    expect(lastSession('p1', 'claude', { provider: 'claude', cwd: '/p/web' }, NOW)).toBeUndefined()
    expect(readFileSync(join(dir, 'agent-sessions', 'p1.json'), 'utf8')).toBe('{}')
  })
})
