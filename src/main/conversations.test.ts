// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChatMessage, Task } from '@shared/types'
import * as store from './projects'
import { exportSessions, initAgentSessions, rememberSession } from './agentSessions'
import {
  deleteConversation,
  listConversations,
  newConversation,
  openConversation,
  recentConversations,
  renameConversation,
  search,
  setPinned,
  snippetOf,
  titleFrom
} from './conversations'

let dir = ''
let n = 0

function msg(projectId: string, text: string, user = true, at = Date.now() + n): ChatMessage {
  n++
  return { id: `m${n}`, projectId, author: user ? { type: 'user' } : { type: 'agent', agentId: 'claude' }, text, createdAt: at }
}

function task(projectId: string, title: string, status: Task['status'] = 'done'): Task {
  n++
  return { id: `t${n}`, projectId, runId: 'r', title, description: '', agentId: 'claude', dependsOn: [], status, difficulty: 'normal', createdAt: Date.now(), artifactIds: [], result: `Resultado de ${title}` } as unknown as Task
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'conv-'))
  store.initProjects(dir)
  initAgentSessions(dir)
})

afterEach(() => {
  store.flushAll()
  rmSync(dir, { recursive: true, force: true })
})

describe('título', () => {
  it('sale del primer mensaje tuyo, cortado en una palabra', () => {
    expect(titleFrom([msg('p', 'Hola', false), msg('p', 'Haz un **juego** de cartas')])).toBe('Haz un juego de cartas')
    const long = titleFrom([msg('p', 'Quiero una barra lateral como la de Claude con los chats, el buscador, los proyectos fijados y los ajustes')])
    expect(long.endsWith('…')).toBe(true)
    expect(long.length).toBeLessThanOrEqual(61)
  })

  it('sin mensajes tuyos, la fecha', () => {
    expect(titleFrom([], new Date(2026, 10, 7).getTime())).toMatch(/^Conversación del 7/)
  })
})

describe('conversaciones de un proyecto', () => {
  it('nueva: guarda la abierta con sus tareas terminadas y deja el chat vacío; las tareas a medias se quedan', () => {
    const p = store.createProject('Prueba')
    const st = store.getProject(p.id)
    st.messages.push(msg(p.id, 'Primera conversación'), msg(p.id, 'Hecho', false))
    st.tasks.push(task(p.id, 'Terminada'), task(p.id, 'En pausa', 'blocked'))
    newConversation(p.id)
    expect(st.messages).toEqual([])
    expect(st.tasks.map((t) => t.title)).toEqual(['En pausa'])
    const list = listConversations(p.id)
    expect(list).toHaveLength(2)
    expect(list[0].current).toBe(true)
    expect(list[0].messageCount).toBe(0)
    expect(list[1]).toMatchObject({ title: 'Primera conversación', messageCount: 2 })
  })

  it('nueva sobre un chat vacío no guarda nada', () => {
    const p = store.createProject('Vacío')
    const a = newConversation(p.id)
    expect(newConversation(p.id)).toBe(a)
    expect(listConversations(p.id)).toHaveLength(1)
  })

  it('retomar: intercambia la abierta con la guardada, con mensajes, tareas y sesiones de los agentes', () => {
    const p = store.createProject('Retomar')
    const st = store.getProject(p.id)
    st.messages.push(msg(p.id, 'Conversación A'))
    st.tasks.push(task(p.id, 'Tarea A'))
    rememberSession(p.id, 'claude', { sessionId: 'sesion-a', provider: 'claude', cwd: '/x', taskTitle: 'Tarea A', at: Date.now() })
    const idA = listConversations(p.id)[0].id
    newConversation(p.id)
    expect(exportSessions(p.id)).toEqual({})
    st.messages.push(msg(p.id, 'Conversación B'))
    openConversation(p.id, idA)
    expect(st.messages.map((m) => m.text)).toEqual(['Conversación A'])
    expect(st.tasks.map((t) => t.title)).toEqual(['Tarea A'])
    expect(st.conversation?.id).toBe(idA)
    expect(exportSessions(p.id).claude?.sessionId).toBe('sesion-a')
    const list = listConversations(p.id)
    expect(list.find((c) => c.current)?.title).toBe('Conversación A')
    expect(list.filter((c) => !c.current).map((c) => c.title)).toEqual(['Conversación B'])
  })

  it('se guarda en disco y sobrevive a recargar el proyecto', () => {
    const p = store.createProject('Disco')
    const st = store.getProject(p.id)
    st.messages.push(msg(p.id, 'Para guardar'))
    newConversation(p.id)
    store.flushAll()
    const raw = JSON.parse(readFileSync(join(st.project.dir, 'project.json'), 'utf8')) as { conversations: { title: string }[] }
    expect(raw.conversations.map((c) => c.title)).toEqual(['Para guardar'])
  })

  it('renombrar y borrar (va a conversaciones/borradas); la abierta no se puede borrar', () => {
    const p = store.createProject('Nombres')
    const st = store.getProject(p.id)
    st.messages.push(msg(p.id, 'Vieja'))
    newConversation(p.id)
    const old = listConversations(p.id).find((c) => !c.current)!
    renameConversation(p.id, old.id, '  Nombre   nuevo ')
    expect(listConversations(p.id).find((c) => c.id === old.id)?.title).toBe('Nombre nuevo')
    expect(() => deleteConversation(p.id, st.conversation!.id)).toThrow(/abierta/)
    deleteConversation(p.id, old.id)
    expect(listConversations(p.id)).toHaveLength(1)
    expect(existsSync(join(st.project.dir, 'conversaciones', 'borradas', `${old.id}.json`))).toBe(true)
  })

  it('las copias antiguas de «Limpiar el chat» (historial/) aparecen como conversaciones', () => {
    const p = store.createProject('Antiguo')
    const st = store.getProject(p.id)
    mkdirSync(join(st.project.dir, 'historial'), { recursive: true })
    writeFileSync(
      join(st.project.dir, 'historial', 'chat-2026-10-01_10-00.json'),
      JSON.stringify({ project: 'Antiguo', savedAt: 1, messages: [msg(p.id, 'Del historial', true, 1000)], tasks: [] })
    )
    writeFileSync(join(st.project.dir, 'historial', 'chat-vacio.json'), JSON.stringify({ messages: [] }))
    const list = listConversations(p.id)
    expect(list.map((c) => c.title)).toContain('Del historial')
    expect(list).toHaveLength(2)
    // Una sola vez: no se duplican al volver a listar.
    expect(listConversations(p.id)).toHaveLength(2)
  })

  it('recientes: de todos los proyectos, solo con mensajes, de la más reciente a la más antigua', () => {
    const a = store.createProject('A')
    const b = store.createProject('B')
    store.getProject(a.id).messages.push(msg(a.id, 'en A', true, 1000))
    store.getProject(b.id).messages.push(msg(b.id, 'en B', true, 2000))
    expect(recentConversations().map((c) => c.title)).toEqual(['en B', 'en A'])
  })

  it('fijar un proyecto', () => {
    const p = store.createProject('Fijo')
    setPinned(p.id, true)
    expect(store.listProjects().find((x) => x.id === p.id)?.pinned).toBe(true)
    setPinned(p.id, false)
    expect(store.getProject(p.id).project.pinned).toBeUndefined()
  })
})

describe('buscador', () => {
  it('encuentra en conversaciones guardadas, tareas y memoria, sin distinguir tildes ni mayúsculas', () => {
    const p = store.createProject('Busca')
    const st = store.getProject(p.id)
    st.messages.push(msg(p.id, 'Revisa la verificación del plan'))
    st.tasks.push(task(p.id, 'Arreglar la VERIFICACION'))
    newConversation(p.id)
    st.memory = [{ id: 'm1', kind: 'decision', text: 'Toda verificación pide evidencia', status: 'confirmed', by: 'user', byName: 'Tú', createdAt: 1, updatedAt: 1 } as never]
    const hits = search('verificacion')
    expect(hits.map((h) => h.kind).sort()).toEqual(['conversation', 'memory', 'task'])
    expect(hits.find((h) => h.kind === 'conversation')?.conversationId).toBeTruthy()
    expect(search('v')).toEqual([])
    expect(search('verificacion', 'otro-proyecto')).toEqual([])
  })

  it('el trozo de texto rodea lo encontrado', () => {
    const s = snippetOf(`${'a '.repeat(100)}aquí está la palabra clave ${'b '.repeat(100)}`, 'clave', 60)
    expect(s.startsWith('…')).toBe(true)
    expect(s).toContain('clave')
  })
})
