import { spawnSync } from 'node:child_process'
import { createWriteStream, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AccessLog, isInside, listDirectory, listRoots, normalizePath, withinAny, writeZip } from './serverFiles'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cowork-fs-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('rutas', () => {
  it('solo acepta rutas absolutas y limpias', () => {
    expect(normalizePath(dir)).toBe(dir)
    expect(normalizePath('relativa/ruta')).toBeNull()
    expect(normalizePath('')).toBeNull()
    expect(normalizePath(`${dir}\0x`)).toBeNull()
    expect(normalizePath(42)).toBeNull()
    expect(normalizePath(join(dir, 'a', '..', 'b'))).toBe(join(dir, 'b'))
  })

  it('«dentro de» no se deja engañar por nombres parecidos ni por ..', () => {
    expect(isInside(join(dir, 'a', 'b'), dir)).toBe(true)
    expect(isInside(dir, dir)).toBe(true)
    expect(isInside(`${dir}-otro`, dir)).toBe(false)
    expect(isInside(join(dir, '..'), dir)).toBe(false)
    expect(withinAny(join(dir, 'x'), ['/otra', dir])).toBe(true)
  })

  it('las raíces incluyen la carpeta del usuario y las de los proyectos', () => {
    const roots = listRoots({ projects: [{ name: 'Proyecto', dir }], home: dir })
    expect(roots[0].kind).toBe('home')
    expect(roots.some((r) => r.kind === 'project' && r.path === dir && r.name.includes('Proyecto'))).toBe(true)
    expect(roots.some((r) => r.kind === 'drive' || r.kind === 'root')).toBe(true)
  })
})

describe('listar', () => {
  it('carpetas primero, luego archivos, con tamaños', async () => {
    mkdirSync(join(dir, 'zeta'))
    mkdirSync(join(dir, 'alfa'))
    writeFileSync(join(dir, 'b.txt'), 'hola')
    writeFileSync(join(dir, 'a.txt'), '12345678')
    const { entries, truncated } = await listDirectory(dir)
    expect(truncated).toBe(false)
    expect(entries.map((e) => `${e.kind}:${e.name}`)).toEqual(['dir:alfa', 'dir:zeta', 'file:a.txt', 'file:b.txt'])
    expect(entries.find((e) => e.name === 'a.txt')?.size).toBe(8)
  })
})

describe('zip', () => {
  // En Windows, el tar de Git no lee zip: se usa el del sistema (bsdtar).
  const TAR = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  const hasTar = spawnSync(TAR, ['--version']).status === 0

  async function zipTo(target: string, file: string): Promise<{ files: number; bytes: number; skipped: number }> {
    const out = createWriteStream(file)
    const result = await writeZip(target, out)
    await once(out, 'close').catch(() => {})
    return result
  }

  it('una carpeta con archivos, subcarpetas y una vacía se lista y se descomprime igual', async () => {
    const src = join(dir, 'proyecto')
    mkdirSync(join(src, 'sub', 'hondo'), { recursive: true })
    mkdirSync(join(src, 'vacia'))
    writeFileSync(join(src, 'leeme.txt'), 'Hola ñandú — ✓')
    writeFileSync(join(src, 'sub', 'datos.bin'), Buffer.alloc(300_000, 7))
    writeFileSync(join(src, 'sub', 'hondo', 'x.md'), '# x\n'.repeat(1000))
    const zip = join(dir, 'salida.zip')
    const result = await zipTo(src, zip)
    expect(result.files).toBe(3)
    expect(result.bytes).toBe(Buffer.byteLength('Hola ñandú — ✓') + 300_000 + 4000)
    expect(statSync(zip).size).toBeGreaterThan(100)
    if (!hasTar) return
    const list = spawnSync(TAR, ['-tf', zip], { encoding: 'utf8' })
    expect(list.status).toBe(0)
    const names = list.stdout.split(/\r?\n/).filter(Boolean).map((n) => n.replace(/\\/g, '/'))
    expect(names).toEqual(expect.arrayContaining(['proyecto/leeme.txt', 'proyecto/sub/datos.bin', 'proyecto/sub/hondo/x.md', 'proyecto/vacia/']))
    const out = join(dir, 'extraido')
    mkdirSync(out)
    expect(spawnSync(TAR, ['-xf', zip, '-C', out]).status).toBe(0)
    expect(readFileSync(join(out, 'proyecto', 'leeme.txt'), 'utf8')).toBe('Hola ñandú — ✓')
    expect(readFileSync(join(out, 'proyecto', 'sub', 'datos.bin')).equals(Buffer.alloc(300_000, 7))).toBe(true)
    expect(readFileSync(join(out, 'proyecto', 'sub', 'hondo', 'x.md'), 'utf8')).toBe('# x\n'.repeat(1000))
  })

  it('un archivo suelto también se baja como zip', async () => {
    const file = join(dir, 'solo.txt')
    writeFileSync(file, 'contenido')
    const zip = join(dir, 'solo.zip')
    expect((await zipTo(file, zip)).files).toBe(1)
    if (!hasTar) return
    expect(spawnSync(TAR, ['-tf', zip], { encoding: 'utf8' }).stdout).toContain('solo.txt')
  })

  it('no sigue enlaces simbólicos y salta lo que se le pide', async () => {
    const src = join(dir, 'p')
    mkdirSync(join(src, 'secreto'), { recursive: true })
    writeFileSync(join(src, 'ok.txt'), 'ok')
    writeFileSync(join(src, 'secreto', 'clave'), 'x')
    let linked = true
    try {
      symlinkSync(dir, join(src, 'enlace'), 'junction')
    } catch {
      linked = false
    }
    const out = createWriteStream(join(dir, 'p.zip'))
    const result = await writeZip(src, out, { skip: (abs) => abs.endsWith('secreto') })
    await once(out, 'close').catch(() => {})
    expect(result.files).toBe(1)
    expect(result.skipped).toBeGreaterThanOrEqual(linked ? 2 : 1)
  })
})

describe('registro de accesos', () => {
  it('guarda lo que pasa y lo devuelve de lo más reciente a lo más antiguo', () => {
    let t = 1000
    const log = new AccessLog(join(dir, 'accesos.jsonl'), () => t++)
    log.append({ device: 'Portátil', action: 'list', path: 'C:\\Users' })
    log.append({ device: 'Portátil', action: 'read', path: 'C:\\Users\\a.txt', bytes: 12 })
    log.append({ device: 'Navegador', action: 'denied', path: '/etc/passwd', note: 'restringido' })
    const entries = log.read()
    expect(entries.map((e) => e.action)).toEqual(['denied', 'read', 'list'])
    expect(entries[1]).toMatchObject({ device: 'Portátil', bytes: 12, t: 1001 })
    expect(log.read(2)).toHaveLength(2)
  })

  it('sin archivo devuelve una lista vacía y una línea rota no estropea el resto', () => {
    const file = join(dir, 'accesos.jsonl')
    const log = new AccessLog(file)
    expect(log.read()).toEqual([])
    log.append({ device: 'A', action: 'list', path: '/' })
    writeFileSync(file, readFileSync(file, 'utf8') + '{ no es json\n')
    expect(log.read()).toHaveLength(1)
  })
})
