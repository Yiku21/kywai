import type { ConversationSummary, ProjectSummary } from '@shared/types'
import { applyOrder } from './dragOrder'

/**
 * Filtro de la lista «Proyectos» de la barra lateral (el botón junto a su título): cómo se agrupa, en qué orden va,
 * cuántos chats se ven de cada proyecto y qué proyectos salen. Se guarda en este equipo (cada pantalla a su gusto).
 */
export type ProjectGrouping = 'project' | 'date'
export type ProjectSort = 'manual' | 'recent' | 'name'
export type ProjectStatus = 'all' | 'busy' | 'unseen' | 'week'

export interface ProjectFilter {
  grouping: ProjectGrouping
  sort: ProjectSort
  status: ProjectStatus
  /** Todos los chats de cada proyecto a la vista, sin la fila «Ver los X restantes». */
  showAll: boolean
}

export const DEFAULT_FILTER: ProjectFilter = { grouping: 'project', sort: 'manual', status: 'all', showAll: false }

/** Chats que se ven de cada proyecto antes de «Ver los X restantes». */
export const CHAT_PREVIEW = 3

const KEY = 'ai-cowork.projectFilter'
const GROUPINGS: ProjectGrouping[] = ['project', 'date']
const SORTS: ProjectSort[] = ['manual', 'recent', 'name']
const STATUSES: ProjectStatus[] = ['all', 'busy', 'unseen', 'week']

export function readProjectFilter(): ProjectFilter {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ProjectFilter> | null
    if (raw && typeof raw === 'object') {
      return {
        grouping: GROUPINGS.includes(raw.grouping as ProjectGrouping) ? (raw.grouping as ProjectGrouping) : DEFAULT_FILTER.grouping,
        sort: SORTS.includes(raw.sort as ProjectSort) ? (raw.sort as ProjectSort) : DEFAULT_FILTER.sort,
        status: STATUSES.includes(raw.status as ProjectStatus) ? (raw.status as ProjectStatus) : DEFAULT_FILTER.status,
        showAll: raw.showAll === true
      }
    }
  } catch {
    // Sin almacenamiento o guardado roto: lo de siempre.
  }
  return { ...DEFAULT_FILTER }
}

export function saveProjectFilter(f: ProjectFilter): void {
  try {
    if (isDefaultFilter(f)) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(f))
  } catch {
    // Sin almacenamiento (ventana privada…): dura hasta cerrar.
  }
}

export function isDefaultFilter(f: ProjectFilter): boolean {
  return f.grouping === DEFAULT_FILTER.grouping && f.sort === DEFAULT_FILTER.sort && f.status === DEFAULT_FILTER.status && f.showAll === DEFAULT_FILTER.showAll
}

/** En orden: el que dejó el usuario arrastrando (lo nuevo arriba), lo más reciente primero o por nombre. */
export function sortItems<T extends { updatedAt: number }>(list: T[], sort: ProjectSort, idOf: (x: T) => string, nameOf: (x: T) => string, manual: string[] | undefined): T[] {
  if (sort === 'recent') return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
  if (sort === 'name') return [...list].sort((a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base', numeric: true }))
  return applyOrder(list, idOf, manual)
}

const WEEK = 7 * 86_400_000

/** Proyectos que pasan el filtro de estado. `unseen`: proyectos con resultados terminados que aún no has visto. */
export function filterProjects(list: ProjectSummary[], status: ProjectStatus, unseen: ReadonlySet<string>, now = Date.now()): ProjectSummary[] {
  if (status === 'busy') return list.filter((p) => p.busy)
  if (status === 'unseen') return list.filter((p) => unseen.has(p.id))
  if (status === 'week') return list.filter((p) => now - p.updatedAt <= WEEK)
  return list
}

/**
 * Los chats que se ven de una lista: los primeros {@link CHAT_PREVIEW} (y el abierto, aunque vaya más abajo, para no
 * perder dónde estás); el resto queda tras «Ver los X restantes». Con `all` se ven todos.
 */
export function previewChats(list: ConversationSummary[], all: boolean, activeId?: string | null): { shown: ConversationSummary[]; hidden: number } {
  if (all || list.length <= CHAT_PREVIEW + 1) return { shown: list, hidden: 0 }
  const shown = list.slice(0, CHAT_PREVIEW)
  const active = activeId ? list.find((c, i) => i >= CHAT_PREVIEW && c.id === activeId) : undefined
  if (active) shown.push(active)
  return { shown, hidden: list.length - shown.length }
}
