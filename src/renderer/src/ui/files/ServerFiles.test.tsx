import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerFiles } from './ServerFiles'
import { crumbs, childPath, openServerFiles, requestServerFolder, closeFilesRequest } from '@/lib/serverFiles'

let container: HTMLDivElement
let root: Root

const tree: Record<string, unknown> = {
  '/api/fs/roots': { roots: [{ name: 'Carpeta del usuario', path: '/home/usuario', kind: 'home' }, { name: 'Sistema de archivos (/)', path: '/', kind: 'root' }], restricted: false, platform: 'linux', sep: '/' },
  '/home/usuario': { path: '/home/usuario', parent: '/home', truncated: false, entries: [{ name: 'Proyectos', kind: 'dir', size: 0, mtime: 1 }, { name: 'nota.txt', kind: 'file', size: 2048, mtime: 1 }] },
  '/home/usuario/Proyectos': { path: '/home/usuario/Proyectos', parent: '/home/usuario', truncated: false, entries: [] }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'http://x')
      const key = url.pathname === '/api/fs/roots' ? '/api/fs/roots' : (url.searchParams.get('path') ?? '')
      const body = tree[key]
      return { ok: !!body, status: body ? 200 : 404, json: async () => body ?? { error: 'No existe' } }
    })
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => closeFilesRequest(null))
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('rutas del explorador', () => {
  it('migas de pan con el separador del servidor', () => {
    expect(crumbs('/home/usuario/Proyectos', '/').map((c) => c.path)).toEqual(['/', '/home', '/home/usuario', '/home/usuario/Proyectos'])
    expect(crumbs('C:\\Users\\usuario', '\\').map((c) => c.path)).toEqual(['C:\\', 'C:\\Users', 'C:\\Users\\usuario'])
    expect(childPath('/home/usuario', 'a.txt', '/')).toBe('/home/usuario/a.txt')
    expect(childPath('C:\\', 'x', '\\')).toBe('C:\\x')
  })
})

describe('explorador de los archivos del servidor', () => {
  it('lista la carpeta del usuario, entra en una carpeta y sube', async () => {
    await act(async () => root.render(<ServerFiles />))
    act(() => openServerFiles())
    await flush()
    expect(container.textContent).toContain('Archivos del servidor')
    expect(container.textContent).toContain('Proyectos')
    expect(container.textContent).toContain('nota.txt')
    expect(container.textContent).toContain('2 KB')

    const dir = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Proyectos') && b.title === 'Abrir la carpeta')!
    await act(async () => dir.click())
    await flush()
    expect(container.textContent).toContain('Esta carpeta está vacía')

    const up = container.querySelector<HTMLButtonElement>('[aria-label="Subir una carpeta"]')!
    await act(async () => up.click())
    await flush()
    expect(container.textContent).toContain('nota.txt')
  })

  it('al elegir una carpeta de trabajo devuelve su ruta y no deja elegir archivos', async () => {
    await act(async () => root.render(<ServerFiles />))
    let chosen: string | null | undefined
    act(() => {
      void requestServerFolder().then((d) => (chosen = d))
    })
    await flush()
    expect(container.textContent).toContain('Elegir la carpeta de trabajo')
    const file = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('nota.txt'))!
    expect(file.disabled).toBe(true)
    const use = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Usar esta carpeta'))!
    await act(async () => use.click())
    await flush()
    expect(chosen).toBe('/home/usuario')
    expect(container.textContent).not.toContain('Elegir la carpeta de trabajo')
  })

  it('cerrar sin elegir devuelve null', async () => {
    await act(async () => root.render(<ServerFiles />))
    let chosen: string | null | undefined
    act(() => {
      void requestServerFolder().then((d) => (chosen = d))
    })
    await flush()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Cerrar"]')!.click())
    await flush()
    expect(chosen).toBeNull()
  })
})
