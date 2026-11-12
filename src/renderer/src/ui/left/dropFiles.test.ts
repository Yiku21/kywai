import { describe, expect, it, vi } from 'vitest'
import { droppedPaths } from './dropFiles'

const file = (name: string): File => new File(['hola'], name)

describe('droppedPaths', () => {
  it('usa la ruta del archivo en el escritorio', async () => {
    const save = vi.fn()
    const r = await droppedPaths({ pathForFile: (f) => `/tmp/${f.name}`, savePastedFile: save }, [file('a.txt')])
    expect(r).toEqual({ paths: ['/tmp/a.txt'], error: null })
    expect(save).not.toHaveBeenCalled()
  })

  it('sube el archivo si la llamada devuelve otra cosa que un texto (navegador y cliente)', async () => {
    // Por la red, pathForFile devolvía una promesa: entraba en la lista y la ventana se quedaba en negro.
    const save = vi.fn(async (name: string) => `/subidos/${name}`)
    const asyncPath = (() => Promise.resolve('x')) as unknown as (f: File) => string
    const r = await droppedPaths({ pathForFile: asyncPath, savePastedFile: save }, [file('foto.png')])
    expect(r).toEqual({ paths: ['/subidos/foto.png'], error: null })
    expect(save).toHaveBeenCalledOnce()
  })

  it('sube el archivo si no tiene ruta y avisa si falla la subida', async () => {
    const save = vi.fn(async (name: string) => {
      if (name === 'mal.bin') throw new Error('No se pudo subir el archivo')
      return `/subidos/${name}`
    })
    const r = await droppedPaths({ pathForFile: () => '', savePastedFile: save }, [file('bien.txt'), file('mal.bin')])
    expect(r.paths).toEqual(['/subidos/bien.txt'])
    expect(r.error).toBe('No se pudo subir el archivo')
  })
})
