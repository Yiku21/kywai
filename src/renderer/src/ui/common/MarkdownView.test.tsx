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

async function render(web: boolean, text: string, bridge: Record<string, unknown> | null = null): Promise<void> {
  vi.doMock('@/lib/api', () => ({ isWeb: web, isClient: !!bridge, clientBridge: () => bridge, api: null }))
  const { MarkdownView } = await import('./MarkdownView')
  await act(async () => {
    root.render(<MarkdownView text={text} />)
  })
}

const text = [
  '![Capturas](/Users/usuario/Proyecto/artifacts/mapas/hoja.png)',
  '![Relativa](artifacts/mapas/otra.png)',
  '![Externa](https://example.com/x.png)',
  '[Rutas absolutas](/Users/usuario/Proyecto/artifacts/mapas/rutas.md)',
  '[Web](https://example.com)'
].join('\n\n')

describe('imágenes y enlaces con rutas locales', () => {
  it('en la interfaz web las rutas del servidor se piden a su API', async () => {
    await render(true, text)
    const imgs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(imgs[0]).toBe('/api/fs/read?path=%2FUsers%2Fusuario%2FProyecto%2Fartifacts%2Fmapas%2Fhoja.png')
    // Sin proyecto abierto, una relativa no se adivina.
    expect(imgs[1]).toBe('artifacts/mapas/otra.png')
    expect(imgs[2]).toBe('https://example.com/x.png')
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links[0]).toBe('/api/fs/read?path=%2FUsers%2Fusuario%2FProyecto%2Fartifacts%2Fmapas%2Frutas.md')
    expect(links[1]).toBe('https://example.com')
  })

  it('en el cliente de escritorio, un enlace a un archivo del servidor se abre con la aplicación del equipo', async () => {
    const openRemotePath = vi.fn(async () => {})
    await render(true, '[Rutas](/Users/usuario/rutas.md)', { openRemotePath })
    const a = container.querySelector('a')!
    await act(async () => {
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(openRemotePath).toHaveBeenCalledWith('/Users/usuario/rutas.md')
  })

  it('en la app de escritorio del servidor no se toca nada', async () => {
    await render(false, text)
    const imgs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(imgs[0]).toBe('/Users/usuario/Proyecto/artifacts/mapas/hoja.png')
    expect(container.querySelector('a')!.getAttribute('href')).toBe('/Users/usuario/Proyecto/artifacts/mapas/rutas.md')
  })
})
