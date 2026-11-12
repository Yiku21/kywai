// Tablero de tareas (Kanban) de cada proyecto: el motor que coge las tarjetas de «Por hacer» una tras otra y las mueve
// de columna según cómo va su petición en el chat. Se guarda en «tablero.json» de la carpeta de datos (todos los
// proyectos en un archivo: así al arrancar no hay que cargar cada proyecto para saber si tiene tarjetas pendientes).
//
// Reglas: una sola tarjeta activa por proyecto (en marcha o esperando tu visto bueno); la siguiente sale cuando esa
// termina. Si kywai se cierra con una en marcha, al volver queda en «Te espera» como no terminada, para reintentarla
// (no se relanza sola: podría repetir cambios a medias). Lo que va al chat lleva la marca del tablero.
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CoworkEvent, SendMessageInput } from '@shared/types'
import { BOARD_ROUTINE_PREFIX, MAX_BOARD_CARDS, MAX_BOARD_TEXT, nextCard, type Board, type BoardCard, type BoardCommand } from '@shared/board'
import { tr } from '@shared/i18n'
import { emit, tapEvents } from './events'

export interface BoardDeps {
  /** Envía la tarjeta al chat como una petición del usuario, marcada como del tablero (orchestrator.sendMessage). */
  send(input: SendMessageInput, routine: { id: string; name: string }): Promise<{ runId: string }>
  /** En qué está esa petición: trabajando, esperando tu visto bueno a su plan, o null si ya terminó. */
  runState(projectId: string, runId: string): 'running' | 'waiting' | null
  /** El proyecto sigue existiendo. */
  projectExists(projectId: string): boolean
}

/** Cada cuánto se mira si toca coger otra tarjeta (además de al terminar una o al añadirla). */
export const BOARD_TICK_MS = 15_000

interface Stored {
  paused?: boolean
  cards: BoardCard[]
}

let dataDir = ''
let cache: Record<string, Stored> | null = null
let deps: BoardDeps | null = null
let untap: (() => void) | null = null
let timer: NodeJS.Timeout | null = null
/** Proyectos con una tarjeta lanzándose ahora mismo (entre que se envía y llega su runId). */
const launching = new Set<string>()
/** Peticiones que terminaron antes de que se apuntara su runId. */
const finishedEarly = new Map<string, boolean>()

const file = (): string => join(dataDir, 'tablero.json')

function read(): Record<string, Stored> {
  if (cache) return cache
  cache = {}
  if (!dataDir) return cache
  try {
    const d = JSON.parse(readFileSync(file(), 'utf8')) as { projects?: Record<string, Stored> }
    for (const [pid, b] of Object.entries(d.projects ?? {})) {
      if (!b || !Array.isArray(b.cards)) continue
      const cards = b.cards.filter((c) => c && typeof c.id === 'string' && typeof c.text === 'string' && typeof c.status === 'string')
      cache[pid] = { ...(b.paused ? { paused: true } : {}), cards }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') console.warn('[cowork] tablero.json no se pudo leer', e)
  }
  return cache
}

function save(): void {
  if (!dataDir || !cache) return
  try {
    mkdirSync(dataDir, { recursive: true })
    const tmp = `${file()}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify({ projects: cache }, null, 1), 'utf8')
    renameSync(tmp, file())
  } catch (e) {
    console.warn('[cowork] tablero.json no se pudo guardar', e)
  }
}

function boardOf(projectId: string): Stored {
  const all = read()
  return (all[projectId] ??= { cards: [] })
}

export function getBoard(projectId: string): Board {
  const b = read()[projectId]
  return JSON.parse(JSON.stringify({ projectId, paused: !!b?.paused, cards: b?.cards ?? [] })) as Board
}

function changed(projectId: string): void {
  const all = read()
  const b = all[projectId]
  if (b && !b.cards.length && !b.paused) delete all[projectId]
  save()
  emit({ kind: 'board.updated', board: getBoard(projectId) })
}

function newId(cards: BoardCard[]): string {
  for (;;) {
    const id = `b${randomBytes(4).toString('hex')}`
    if (!cards.some((c) => c.id === id)) return id
  }
}

const cleanText = (s: unknown): string => (typeof s === 'string' ? s.replace(/\r\n?/g, '\n').trim().slice(0, MAX_BOARD_TEXT) : '')

function findCard(b: Stored, id: unknown): BoardCard {
  const c = b.cards.find((x) => x.id === id)
  if (!c) throw new Error(tr('Esa tarjeta ya no está en el tablero'))
  return c
}

/** Cambios del tablero desde la interfaz (escritorio, web y cliente). Devuelve el tablero ya cambiado. */
export function boardCommand(projectId: string, cmd: BoardCommand, now = Date.now()): Board {
  const b = boardOf(projectId)
  switch (cmd?.type) {
    case 'add': {
      const text = cleanText(cmd.text)
      if (!text) throw new Error(tr('Escribe qué hay que hacer'))
      if (b.cards.length >= MAX_BOARD_CARDS) throw new Error(tr('Como mucho {MAX_BOARD_CARDS} tarjetas por tablero: quita las terminadas', { MAX_BOARD_CARDS }))
      b.cards.push({ id: newId(b.cards), text, status: 'todo', createdAt: now })
      break
    }
    case 'edit': {
      const c = findCard(b, cmd.id)
      if (c.status !== 'todo') throw new Error(tr('Solo se pueden cambiar las tarjetas que aún están por hacer'))
      const text = cleanText(cmd.text)
      if (!text) throw new Error(tr('Escribe qué hay que hacer'))
      c.text = text
      break
    }
    case 'move': {
      const c = findCard(b, cmd.id)
      if (c.status !== 'todo') throw new Error(tr('Solo se pueden ordenar las tarjetas que aún están por hacer'))
      const todo = b.cards.filter((x) => x.status === 'todo')
      const i = todo.indexOf(c)
      const j = cmd.to === 'top' ? 0 : cmd.to === 'up' ? Math.max(0, i - 1) : Math.min(todo.length - 1, i + 1)
      if (i === j) return getBoard(projectId)
      todo.splice(i, 1)
      todo.splice(j, 0, c)
      // Las de «Por hacer» quedan en su orden nuevo; el resto, donde estaban.
      let k = 0
      b.cards = b.cards.map((x) => (x.status === 'todo' ? todo[k++] : x))
      break
    }
    case 'remove': {
      const c = findCard(b, cmd.id)
      if (c.status === 'doing' || c.status === 'review')
        throw new Error(tr('El equipo está con esa tarjeta: detén su petición en el chat antes de quitarla'))
      b.cards = b.cards.filter((x) => x !== c)
      break
    }
    case 'retry': {
      const c = findCard(b, cmd.id)
      if (c.status !== 'failed' && c.status !== 'done') throw new Error(tr('Esa tarjeta no se puede reintentar ahora'))
      // La primera de la cola: es lo que esperas al pulsar «Reintentar».
      b.cards = [{ id: c.id, text: c.text, status: 'todo', createdAt: c.createdAt }, ...b.cards.filter((x) => x !== c)]
      break
    }
    case 'pause':
      if (cmd.paused) b.paused = true
      else delete b.paused
      break
    case 'clearDone':
      b.cards = b.cards.filter((x) => x.status !== 'done')
      break
    default:
      throw new Error(tr('Orden del tablero no válida'))
  }
  changed(projectId)
  if (cmd.type === 'add' || cmd.type === 'retry' || (cmd.type === 'pause' && !cmd.paused)) queueMicrotask(() => void pump(projectId))
  return getBoard(projectId)
}

/** Al borrar un proyecto: su tablero se va con él. */
export function forgetProjectBoard(projectId: string): void {
  const all = read()
  if (!all[projectId]) return
  delete all[projectId]
  save()
}

// ---------- Coger la siguiente ----------

/** Si no hay ninguna activa, envía la primera de «Por hacer» al chat. */
export async function pump(projectId: string, now = Date.now()): Promise<BoardCard | null> {
  if (!deps || launching.has(projectId)) return null
  const b = read()[projectId]
  if (!b) return null
  if (!deps.projectExists(projectId)) return null
  const card = nextCard({ paused: !!b.paused, cards: b.cards })
  if (!card) return null
  launching.add(projectId)
  card.status = 'doing'
  card.startedAt = now
  delete card.finishedAt
  delete card.note
  changed(projectId)
  try {
    const { runId } = await deps.send({ projectId, text: card.text, filePaths: [] }, { id: `${BOARD_ROUTINE_PREFIX}${card.id}`, name: tr('Tablero') })
    card.runId = runId
    const early = finishedEarly.get(runId)
    if (early !== undefined) {
      finishedEarly.delete(runId)
      settle(projectId, card, early)
    }
  } catch (e) {
    card.status = 'failed'
    card.finishedAt = Date.now()
    card.note = tr('No se pudo enviar: {message}', { message: (e as Error).message })
  } finally {
    launching.delete(projectId)
  }
  changed(projectId)
  // Una que falla al enviarse no frena la cola.
  if (card.status === 'failed') queueMicrotask(() => void pump(projectId))
  return card
}

function settle(projectId: string, card: BoardCard, ok: boolean): void {
  const state = card.runId ? deps?.runState(projectId, card.runId) : null
  if (state === 'waiting') {
    card.status = 'review'
    return
  }
  card.status = ok ? 'done' : 'failed'
  card.finishedAt = Date.now()
  if (!ok) card.note = tr('No salió bien: mira la petición en el chat y pulsa «Reintentar» si quieres otra vuelta.')
}

function onEvent(e: CoworkEvent): void {
  if (e.kind !== 'run.started' && e.kind !== 'run.finished') return
  const b = read()[e.projectId]
  const card = b?.cards.find((c) => c.runId === e.runId)
  if (!card) {
    if (e.kind === 'run.finished' && launching.has(e.projectId)) {
      if (finishedEarly.size > 100) finishedEarly.clear()
      finishedEarly.set(e.runId, e.ok)
    }
    return
  }
  if (e.kind === 'run.started') {
    // Plan aprobado o petición reanudada.
    if (card.status !== 'doing') {
      card.status = 'doing'
      delete card.finishedAt
      delete card.note
      changed(e.projectId)
    }
    return
  }
  settle(e.projectId, card, e.ok)
  changed(e.projectId)
  if (card.status !== 'review') queueMicrotask(() => void pump(e.projectId))
}

function pumpAll(): void {
  for (const pid of Object.keys(read())) void pump(pid)
}

// ---------- Arranque y parada ----------

export function initBoard(dir: string, d: BoardDeps, opts: { firstCheckMs?: number } = {}): void {
  stopBoard()
  dataDir = dir
  cache = null
  deps = d
  // Lo que estaba en marcha al cerrar kywai quedó a medias: a «Te espera», para reintentarlo a mano.
  for (const [pid, b] of Object.entries(read())) {
    let touched = false
    for (const c of b.cards) {
      if ((c.status === 'doing' || c.status === 'review') && (!c.runId || d.runState(pid, c.runId) === null)) {
        c.status = 'failed'
        c.finishedAt = Date.now()
        c.note = tr('Se cerró kywai mientras el equipo trabajaba en ella.')
        touched = true
      }
    }
    if (touched) save()
  }
  untap = tapEvents(onEvent)
  timer = setInterval(pumpAll, BOARD_TICK_MS)
  timer.unref?.()
  const first = setTimeout(pumpAll, opts.firstCheckMs ?? 20_000)
  first.unref?.()
}

export function stopBoard(): void {
  if (timer) clearInterval(timer)
  timer = null
  untap?.()
  untap = null
  deps = null
  launching.clear()
  finishedEarly.clear()
}

/** Solo para las pruebas: olvida lo leído del disco. */
export function __resetBoardForTests(dir = ''): void {
  stopBoard()
  dataDir = dir
  cache = null
}
