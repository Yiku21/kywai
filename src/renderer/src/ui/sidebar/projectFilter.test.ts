import { describe, expect, it } from 'vitest'
import type { ConversationSummary, ProjectSummary } from '@shared/types'
import { CHAT_PREVIEW, DEFAULT_FILTER, filterProjects, isDefaultFilter, previewChats, sortItems } from './projectFilter'

const chat = (id: string, updatedAt = 0): ConversationSummary => ({ id, projectId: 'p', title: id, createdAt: 0, updatedAt, messageCount: 1 })
const proj = (id: string, name: string, updatedAt: number, extra: Partial<ProjectSummary> = {}): ProjectSummary => ({ id, name, dir: '', createdAt: 0, updatedAt, ...extra })

describe('previewChats', () => {
  const list = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => chat(id))

  it('enseña los 3 primeros y cuenta el resto', () => {
    const r = previewChats(list, false)
    expect(r.shown.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(r.hidden).toBe(3)
    expect(CHAT_PREVIEW).toBe(3)
  })

  it('con «todos» no esconde nada', () => {
    expect(previewChats(list, true)).toEqual({ shown: list, hidden: 0 })
  })

  it('el chat abierto se ve aunque vaya más abajo', () => {
    const r = previewChats(list, false, 'e')
    expect(r.shown.map((c) => c.id)).toEqual(['a', 'b', 'c', 'e'])
    expect(r.hidden).toBe(2)
  })

  it('por uno solo no pone «Ver 1 restante»: lo enseña', () => {
    expect(previewChats(list.slice(0, 4), false).hidden).toBe(0)
  })
})

describe('orden y filtro de proyectos', () => {
  const ps = [proj('1', 'beta', 10), proj('2', 'Alfa', 30, { busy: true }), proj('3', 'proyecto 10', 20), proj('4', 'proyecto 9', 0)]

  it('ordena por fecha, por nombre (sin mayúsculas, números como números) o a mano', () => {
    const id = (p: ProjectSummary): string => p.id
    const name = (p: ProjectSummary): string => p.name
    expect(sortItems(ps, 'recent', id, name, []).map(id)).toEqual(['2', '3', '1', '4'])
    expect(sortItems(ps, 'name', id, name, []).map(id)).toEqual(['2', '1', '4', '3'])
    expect(sortItems(ps, 'manual', id, name, ['3', '1']).map(id)).toEqual(['2', '4', '3', '1'])
  })

  it('filtra por estado', () => {
    const now = 8 * 86_400_000
    expect(filterProjects(ps, 'all', new Set(), now)).toHaveLength(4)
    expect(filterProjects(ps, 'busy', new Set(), now).map((p) => p.id)).toEqual(['2'])
    expect(filterProjects(ps, 'unseen', new Set(['3']), now).map((p) => p.id)).toEqual(['3'])
    expect(filterProjects([proj('x', 'x', now - 1000), proj('y', 'y', 0)], 'week', new Set(), now).map((p) => p.id)).toEqual(['x'])
  })

  it('sabe si está como de fábrica', () => {
    expect(isDefaultFilter(DEFAULT_FILTER)).toBe(true)
    expect(isDefaultFilter({ ...DEFAULT_FILTER, showAll: true })).toBe(false)
  })
})
