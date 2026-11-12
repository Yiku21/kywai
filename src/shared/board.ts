// Tablero de tareas de un proyecto (estilo Kanban): dejas tarjetas en «Por hacer» y el equipo las va cogiendo solas,
// una tras otra, aunque no estés delante. Cada tarjeta se envía al chat como si la escribieras tú (pasa por el plan
// de Hermes, los agentes, la verificación con sus correcciones y el relevo a otro agente) y se mueve sola de columna.
// Aquí va lo que comparten el motor (src/main/board.ts) y la interfaz (pestaña Tablero).

/**
 * todo: por hacer · doing: el equipo trabaja en ella · review: espera algo de ti (su plan pide tu visto bueno) ·
 * done: terminada · failed: no salió (falló, se detuvo o se cerró kywai mientras trabajaba): «Reintentar» la vuelve
 * a poner la primera de «Por hacer».
 */
export type BoardCardStatus = 'todo' | 'doing' | 'review' | 'done' | 'failed'

export interface BoardCard {
  id: string
  /** Lo que se pide, tal cual se enviará al chat (también vale una orden: «/video …»). */
  text: string
  status: BoardCardStatus
  createdAt: number
  startedAt?: number
  finishedAt?: number
  /** La petición del chat que la está haciendo (o la hizo). */
  runId?: string
  /** Por qué falló o cualquier aviso corto. */
  note?: string
}

export interface Board {
  projectId: string
  /** En pausa no se coge ninguna tarjeta nueva (la que está en marcha sigue). */
  paused: boolean
  cards: BoardCard[]
}

/** Las órdenes que acepta el motor (un único método: boardCommand). */
export type BoardCommand =
  | { type: 'add'; text: string }
  | { type: 'edit'; id: string; text: string }
  | { type: 'move'; id: string; to: 'top' | 'up' | 'down' }
  | { type: 'remove'; id: string }
  | { type: 'retry'; id: string }
  | { type: 'pause'; paused: boolean }
  | { type: 'clearDone' }

export const MAX_BOARD_CARDS = 200
export const MAX_BOARD_TEXT = 8000

/** Las columnas, en orden. «Te espera» junta las que esperan tu visto bueno y las que no salieron. */
export type BoardColumnId = 'todo' | 'doing' | 'waiting' | 'done'
export const BOARD_COLUMNS: BoardColumnId[] = ['todo', 'doing', 'waiting', 'done']

export function columnOf(c: BoardCard): BoardColumnId {
  switch (c.status) {
    case 'todo':
      return 'todo'
    case 'doing':
      return 'doing'
    case 'review':
    case 'failed':
      return 'waiting'
    default:
      return 'done'
  }
}

/** La tarjeta ocupa al equipo: hasta que termine (o la apruebes) no se coge la siguiente. */
export const isActiveCard = (c: BoardCard): boolean => c.status === 'doing' || c.status === 'review'

/** La siguiente que toca coger (la primera de «Por hacer»), o null si hay una en marcha, está en pausa o no queda nada. */
export function nextCard(board: Pick<Board, 'paused' | 'cards'>): BoardCard | null {
  if (board.paused || board.cards.some(isActiveCard)) return null
  return board.cards.find((c) => c.status === 'todo') ?? null
}

/** Las tarjetas de una columna en el orden en que se ven: «Por hacer» en el de la cola; el resto, lo último arriba. */
export function cardsIn(board: Pick<Board, 'cards'>, col: BoardColumnId): BoardCard[] {
  const list = board.cards.filter((c) => columnOf(c) === col)
  if (col === 'todo') return list
  return [...list].sort((a, b) => (b.finishedAt ?? b.startedAt ?? b.createdAt) - (a.finishedAt ?? a.startedAt ?? a.createdAt))
}

/** Marca con la que el chat sabe que un mensaje lo envió el tablero (va en el campo routine.id del mensaje). */
export const BOARD_ROUTINE_PREFIX = 'board:'
export const isBoardRoutineId = (id: string | undefined): boolean => !!id && id.startsWith(BOARD_ROUTINE_PREFIX)
