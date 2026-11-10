import { describe, expect, it } from 'vitest'
import type { UpdateStatus } from '@shared/types'
import { hasPendingUpdate, pendingFromStatus } from './updateWatch'

const base: UpdateStatus = { canUpdate: true, commits: [] }
const commit = { hash: 'abc1234', date: '2026-11-10', subject: 'Algo nuevo' }

describe('aviso de actualización pendiente', () => {
  it('app de GitHub Releases: avisa si hay versión nueva, bajando o descargada', () => {
    for (const state of ['available', 'downloading', 'downloaded'] as const) {
      expect(pendingFromStatus({ ...base, canUpdate: false, release: { state, current: '0.1.1', latest: '0.1.2', selfInstall: true } })).toEqual({ pending: true, version: '0.1.2' })
    }
    expect(pendingFromStatus({ ...base, canUpdate: false, release: { state: 'current', current: '0.1.2', selfInstall: true } })).toEqual({ pending: false })
  })

  it('si no se pudo consultar GitHub no cambia el aviso', () => {
    expect(pendingFromStatus({ ...base, canUpdate: false, release: { state: 'error', current: '0.1.1', selfInstall: true } })).toBeNull()
    expect(pendingFromStatus({ canUpdate: false, commits: [], reason: 'sin conexión' })).toBeNull()
  })

  it('app compilada desde git (Mac mini): avisa si hay commits nuevos, también con cambios locales', () => {
    expect(pendingFromStatus({ ...base, commits: [commit] })).toEqual({ pending: true, commits: 1 })
    expect(pendingFromStatus({ canUpdate: false, commits: [commit, commit], localChanges: ['a.ts'] })).toEqual({ pending: true, commits: 2 })
    expect(pendingFromStatus(base)).toEqual({ pending: false })
  })

  it('el botón brilla por el motor o por la app de este equipo (cliente)', () => {
    expect(hasPendingUpdate({ updatePending: null, deviceUpdate: null })).toBe(false)
    expect(hasPendingUpdate({ updatePending: { pending: false }, deviceUpdate: null })).toBe(false)
    expect(hasPendingUpdate({ updatePending: { pending: true, version: '0.1.2' }, deviceUpdate: null })).toBe(true)
    expect(hasPendingUpdate({ updatePending: { pending: false }, deviceUpdate: '0.1.9' })).toBe(true)
  })
})
