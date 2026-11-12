import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanOrder, getSidebarOrder, initSidebarOrder, setSidebarOrder } from './sidebarOrder'

describe('orden de la barra lateral (servidor)', () => {
  it('guarda solo lo que llega y lo lee de vuelta', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orden-'))
    initSidebarOrder(dir)
    expect(getSidebarOrder()).toEqual({ projects: [], favorites: [], chats: {} })
    setSidebarOrder({ projects: ['b', 'a'] })
    setSidebarOrder({ favorites: ['p:a', 'c:b:x1'], chats: { b: ['x2', 'x1'] } })
    setSidebarOrder({ chats: { a: ['y'] } })
    const saved = JSON.parse(readFileSync(join(dir, 'orden-barra.json'), 'utf8'))
    expect(saved).toEqual({ projects: ['b', 'a'], favorites: ['p:a', 'c:b:x1'], chats: { b: ['x2', 'x1'], a: ['y'] } })
    initSidebarOrder(dir)
    expect(getSidebarOrder().chats.b).toEqual(['x2', 'x1'])
    setSidebarOrder({ chats: { a: [] } })
    expect(getSidebarOrder().chats.a).toBeUndefined()
  })

  it('descarta basura, rutas y repetidos', () => {
    expect(cleanOrder({ projects: ['a', 'a', '../x', 3], favorites: 'x', chats: { '../p': ['z'], ok: ['1', null] } })).toEqual({
      projects: ['a'],
      favorites: [],
      chats: { ok: ['1'] }
    })
  })
})
