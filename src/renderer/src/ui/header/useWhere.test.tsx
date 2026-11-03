import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('@/lib/api')
})

async function mount(apiModule: Record<string, unknown>): Promise<void> {
  vi.doMock('@/lib/api', () => apiModule)
  const { useWhere, ROLE_TITLE, explainWhere } = await import('./useWhere')
  function Probe() {
    const where = useWhere()
    return where ? <p data-where={where.role}>{ROLE_TITLE[where.role]} | {where.host} | {explainWhere(where)}</p> : null
  }
  await act(async () => {
    root.render(<Probe />)
    await Promise.resolve()
  })
}

const host = { getHostInfo: async () => ({ name: 'mac-mini', platform: 'darwin' }) }

describe('dónde estás', () => {
  it('en el servidor: es el servidor y lo dice con su nombre', async () => {
    await mount({ api: host, isWeb: false, isClient: false, clientInfo: async () => null })
    const p = container.querySelector<HTMLElement>('[data-where]')!
    expect(p.dataset.where).toBe('server')
    expect(p.textContent).toContain('Este equipo es el servidor')
    expect(p.textContent).toContain('mac-mini')
    expect(document.documentElement.dataset.role).toBe('server')
  })

  it('en el cliente: a qué servidor está conectado, desde qué equipo, y tiñe la ventana', async () => {
    await mount({ api: host, isWeb: true, isClient: true, clientInfo: async () => ({ server: 'mac-mini', device: 'PC-Casa' }) })
    const p = container.querySelector<HTMLElement>('[data-where]')!
    expect(p.dataset.where).toBe('client')
    expect(p.textContent).toContain('Cliente de escritorio')
    expect(p.textContent).toContain('PC-Casa')
    expect(p.textContent).toContain('mac-mini')
    expect(document.documentElement.dataset.role).toBe('client')
  })

  it('en el navegador: Navegador', async () => {
    await mount({ api: host, isWeb: true, isClient: false, clientInfo: async () => null })
    expect(container.querySelector<HTMLElement>('[data-where]')!.dataset.where).toBe('browser')
  })

  it('sin motor (demo en el navegador) no dice nada', async () => {
    await mount({ api: null, isWeb: false, isClient: false, clientInfo: async () => null })
    expect(container.querySelector('[data-where]')).toBeNull()
    expect(document.documentElement.dataset.role).toBeUndefined()
  })
})
