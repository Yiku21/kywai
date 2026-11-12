import { describe, expect, it } from 'vitest'
import type { InboxItem } from '@shared/types'
import { FRESH_MS, inboxArrivals } from './inboxAlert'

const NOW = 1_800_000_000_000
const item = (id: string, over: Partial<InboxItem> = {}): InboxItem => ({ id, kind: 'question', title: id, actions: [], createdAt: NOW - 1000, ...over })

describe('aviso de «Te necesita»', () => {
  it('suena y llama con lo nuevo que espera tu decisión, una sola vez', () => {
    const known = new Set<string>()
    expect(inboxArrivals(known, [item('a')], NOW)).toEqual({ pending: true, ring: true })
    // El mismo aviso otra vez (otra lista, reconexión): ya no.
    expect(inboxArrivals(known, [item('a')], NOW)).toEqual({ pending: false, ring: false })
    expect(inboxArrivals(known, [item('a'), item('b', { kind: 'plan' })], NOW)).toEqual({ pending: true, ring: true })
  })

  it('lo viejo (al abrir la app) solo palpita, sin sonar', () => {
    expect(inboxArrivals(new Set(), [item('v', { createdAt: NOW - FRESH_MS - 1 })], NOW)).toEqual({ pending: true, ring: false })
  })

  it('ignora lo informativo («Terminado») y lo ya resuelto', () => {
    const known = new Set<string>()
    expect(inboxArrivals(known, [item('d', { kind: 'done' }), item('r', { resolvedAt: NOW })], NOW)).toEqual({ pending: false, ring: false })
  })
})
