import { describe, expect, it } from 'vitest'
import { resolveLocalRef, serverUrlFor } from './localRefs'

describe('referencias a archivos locales', () => {
  it('rutas absolutas de Mac, Linux y Windows y file:// van al disco del servidor', () => {
    expect(resolveLocalRef('/Users/usuario/Proyecto/artifacts/capturas/mapa 1.png')).toEqual({ kind: 'fs', path: '/Users/usuario/Proyecto/artifacts/capturas/mapa 1.png' })
    expect(resolveLocalRef('C:\\Users\\usuario\\a.png')).toEqual({ kind: 'fs', path: 'C:\\Users\\usuario\\a.png' })
    expect(resolveLocalRef('D:/proyectos/a.png')).toEqual({ kind: 'fs', path: 'D:/proyectos/a.png' })
    expect(resolveLocalRef('file:///Users/usuario/a%20b.png')).toEqual({ kind: 'fs', path: '/Users/usuario/a b.png' })
    expect(resolveLocalRef('file:///C:/Users/usuario/a.png')).toEqual({ kind: 'fs', path: 'C:/Users/usuario/a.png' })
  })

  it('las relativas son del proyecto abierto y cowork://file también', () => {
    expect(resolveLocalRef('artifacts/capturas/a.png', 'proyecto')).toEqual({ kind: 'project', projectId: 'proyecto', rel: 'artifacts/capturas/a.png' })
    expect(resolveLocalRef('./notas/léeme.md', 'proyecto')).toEqual({ kind: 'project', projectId: 'proyecto', rel: 'notas/léeme.md' })
    expect(resolveLocalRef('cowork://file/otro/artifacts/x%20y.png')).toEqual({ kind: 'project', projectId: 'otro', rel: 'artifacts/x y.png' })
    // Sin proyecto abierto, o saliendo de él, no se adivina.
    expect(resolveLocalRef('artifacts/a.png')).toBeNull()
    expect(resolveLocalRef('../secreto.png', 'proyecto')).toBeNull()
  })

  it('lo que no es un archivo local se deja como está', () => {
    for (const r of ['https://example.com/a.png', 'http://x/a.png', '//cdn.example.com/a.png', 'data:image/png;base64,AAAA', 'blob:abc', 'mailto:a@b.c', '#seccion', '']) {
      expect(resolveLocalRef(r, 'proyecto'), r).toBeNull()
    }
  })

  it('la dirección en el servidor codifica la ruta', () => {
    expect(serverUrlFor({ kind: 'fs', path: '/Users/usuario/a b&c.png' })).toBe('/api/fs/read?path=%2FUsers%2Fusuario%2Fa%20b%26c.png')
    expect(serverUrlFor({ kind: 'project', projectId: 'proyecto', rel: 'artifacts/mi mapa.png' })).toBe('/api/file/proyecto/artifacts/mi%20mapa.png')
  })
})
