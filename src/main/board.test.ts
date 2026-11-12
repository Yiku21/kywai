// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoworkEvent } from '@shared/types'

const emitted = vi.hoisted(() => [] as unknown[])
const taps = vi.hoisted(() => [] as Array<(e: CoworkEvent) => void>)
vi.mock('./events', () => ({
  emit: (e: unknown) => emitted.push(e),
  tapEvents: (fn: (e: CoworkEvent) => void) => {
    taps.push(fn)
    return () => taps.splice(taps.indexOf(fn), 1)
  }
}))

import { __resetBoardForTests, boardCommand, forgetProjectBoard, getBoard, initBoard, pump } from './board'
import { nextCard } from '@shared/board'

let dir = ''
let sent: Array<{ text: string; routine: { id: string; name: string } }> = []
let states: Record<string, 'running' | 'waiting' | null> = {}
let n = 0

type RunEvent = { kind: 'run.started'; runId: string; projectId: string } | { kind: 'run.finished'; runId: string; projectId: string; ok: boolean }

function fire(e: RunEvent): void {
  for (const fn of [...taps]) fn({ id: `e${++n}`, ts: Date.now(), ...e } as CoworkEvent)
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

function start(): void {
  initBoard(
    dir,
    {
      send: async (input, routine) => {
        sent.push({ text: input.text, routine })
        const runId = `run${sent.length}`
        states[runId] = 'running'
        return { runId }
      },
      runState: (_p, runId) => states[runId] ?? null,
      projectExists: (p) => p === 'p1' || p === 'p2'
    },
    { firstCheckMs: 60_000 }
  )
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aicw-board-'))
  emitted.length = 0
  sent = []
  states = {}
  __resetBoardForTests(dir)
})

afterEach(() => {
  __resetBoardForTests()
  rmSync(dir, { recursive: true, force: true })
})

describe('tablero de tareas', () => {
  it('coge las tarjetas de una en una y en orden, y las mueve de columna según su petición', async () => {
    start()
    boardCommand('p1', { type: 'add', text: 'Haz la página de precios' })
    boardCommand('p1', { type: 'add', text: '  Escribe las pruebas del carrito  ' })
    await flush()
    expect(sent.map((x) => x.text)).toEqual(['Haz la página de precios'])
    expect(sent[0].routine.id).toMatch(/^board:b/)
    let b = getBoard('p1')
    expect(b.cards.map((c) => c.status)).toEqual(['doing', 'todo'])
    expect(b.cards[1].text).toBe('Escribe las pruebas del carrito')

    // Termina la primera: pasa a Hecho y sale la segunda.
    states.run1 = null
    fire({ kind: 'run.finished', runId: 'run1', projectId: 'p1', ok: true })
    await flush()
    b = getBoard('p1')
    expect(b.cards.map((c) => c.status)).toEqual(['done', 'doing'])
    expect(sent).toHaveLength(2)

    // La segunda falla: a «Te espera» con su nota, y la cola sigue (vacía).
    states.run2 = null
    fire({ kind: 'run.finished', runId: 'run2', projectId: 'p1', ok: false })
    await flush()
    b = getBoard('p1')
    expect(b.cards[1].status).toBe('failed')
    expect(b.cards[1].note).toBeTruthy()
    expect(emitted.some((e) => (e as { kind: string }).kind === 'board.updated')).toBe(true)
  })

  it('si su plan espera tu visto bueno, la tarjeta espera y no sale la siguiente hasta que lo apruebes', async () => {
    start()
    boardCommand('p1', { type: 'add', text: 'uno' })
    boardCommand('p1', { type: 'add', text: 'dos' })
    await flush()
    states.run1 = 'waiting'
    fire({ kind: 'run.finished', runId: 'run1', projectId: 'p1', ok: true })
    await flush()
    expect(getBoard('p1').cards[0].status).toBe('review')
    expect(sent).toHaveLength(1)
    // Lo apruebas: vuelve a «En marcha».
    states.run1 = 'running'
    fire({ kind: 'run.started', runId: 'run1', projectId: 'p1' })
    expect(getBoard('p1').cards[0].status).toBe('doing')
  })

  it('en pausa no coge ninguna; al reanudar, sí', async () => {
    start()
    boardCommand('p1', { type: 'pause', paused: true })
    boardCommand('p1', { type: 'add', text: 'uno' })
    await flush()
    expect(sent).toHaveLength(0)
    boardCommand('p1', { type: 'pause', paused: false })
    await flush()
    expect(sent).toHaveLength(1)
  })

  it('ordenar, editar, reintentar y quitar', async () => {
    boardCommand('p1', { type: 'add', text: 'a' })
    boardCommand('p1', { type: 'add', text: 'b' })
    boardCommand('p1', { type: 'add', text: 'c' })
    const [a, , c] = getBoard('p1').cards
    boardCommand('p1', { type: 'move', id: c.id, to: 'top' })
    expect(getBoard('p1').cards.map((x) => x.text)).toEqual(['c', 'a', 'b'])
    boardCommand('p1', { type: 'move', id: a.id, to: 'down' })
    expect(getBoard('p1').cards.map((x) => x.text)).toEqual(['c', 'b', 'a'])
    boardCommand('p1', { type: 'edit', id: a.id, text: 'a2' })
    expect(getBoard('p1').cards[2].text).toBe('a2')
    expect(() => boardCommand('p1', { type: 'add', text: '   ' })).toThrow()
    expect(() => boardCommand('p1', { type: 'retry', id: a.id })).toThrow()
    boardCommand('p1', { type: 'remove', id: a.id })
    expect(getBoard('p1').cards).toHaveLength(2)

    // Una que falló vuelve la primera de la cola.
    start()
    await flush()
    states.run1 = null
    fire({ kind: 'run.finished', runId: 'run1', projectId: 'p1', ok: false })
    await flush()
    const failed = getBoard('p1').cards.find((x) => x.status === 'failed')!
    expect(failed.text).toBe('c')
    // La siguiente ya salió; al reintentar, la fallida queda la primera de «Por hacer».
    boardCommand('p1', { type: 'retry', id: failed.id })
    const todo = getBoard('p1').cards.filter((x) => x.status === 'todo')
    expect(todo[0].text).toBe('c')
    // No se puede quitar la que está en marcha.
    const doing = getBoard('p1').cards.find((x) => x.status === 'doing')!
    expect(() => boardCommand('p1', { type: 'remove', id: doing.id })).toThrow()
  })

  it('se guarda en tablero.json; al arrancar, lo que estaba en marcha queda como no terminado', async () => {
    start()
    boardCommand('p1', { type: 'add', text: 'uno' })
    await flush()
    expect(JSON.parse(readFileSync(join(dir, 'tablero.json'), 'utf8')).projects.p1.cards[0].status).toBe('doing')
    // Se cierra kywai: la petición ya no existe.
    __resetBoardForTests(dir)
    states = {}
    start()
    const card = getBoard('p1').cards[0]
    expect(card.status).toBe('failed')
    expect(card.note).toMatch(/cerró kywai/)
    // Y no se relanza sola.
    await pump('p1')
    expect(sent).toHaveLength(1)
  })

  it('un proyecto borrado se lleva su tablero y no se coge nada de proyectos que ya no existen', async () => {
    start()
    boardCommand('p3', { type: 'add', text: 'huérfana' })
    await flush()
    expect(sent).toHaveLength(0)
    forgetProjectBoard('p3')
    expect(getBoard('p3').cards).toHaveLength(0)
  })

  it('nextCard: nada si hay una activa o está en pausa', () => {
    const c = (status: 'todo' | 'doing' | 'review' | 'done' | 'failed', id = status) => ({ id, text: id, status, createdAt: 1 })
    expect(nextCard({ paused: false, cards: [c('done'), c('todo')] })?.id).toBe('todo')
    expect(nextCard({ paused: false, cards: [c('review'), c('todo')] })).toBeNull()
    expect(nextCard({ paused: true, cards: [c('todo')] })).toBeNull()
    expect(nextCard({ paused: false, cards: [c('failed'), c('todo')] })?.id).toBe('todo')
  })
})
