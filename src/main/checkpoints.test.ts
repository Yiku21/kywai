import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync, lstatSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { blobSha, Shadow } from './checkpoints'

let base: string
let dir: string
let shadow: Shadow

const put = (rel: string, text: string, root = dir): void => {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, text)
}
const read = (rel: string, root = dir): string => readFileSync(join(root, rel), 'utf8')

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'cowork-cp-'))
  dir = join(base, 'proyecto')
  mkdirSync(dir)
  shadow = new Shadow(join(base, 'instantaneas', 'p1.git'))
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('instantáneas', () => {
  it('blobSha coincide con git', () => {
    expect(blobSha(Buffer.from(''))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  })

  it('ve lo que cambió una tarea, sin node_modules ni datos internos', async () => {
    put('a.txt', 'uno\n')
    put('node_modules/x/index.js', 'x')
    put('project.json', '{}')
    const before = await shadow.snapshot(dir, 'main', 'antes')
    put('a.txt', 'uno\ndos\n')
    put('src/nuevo.ts', 'export const n = 1\n')
    put('node_modules/x/index.js', 'y')
    const after = await shadow.snapshot(dir, 'main', 'después')
    const ch = await shadow.changes(before, after)
    expect(ch.files.map((f) => `${f.status} ${f.path} +${f.add} -${f.del}`).sort()).toEqual(['A src/nuevo.ts +1 -0', 'M a.txt +1 -0'])
    expect(ch.patch).toContain('+dos')
  })

  it('respeta el .gitignore de la carpeta y repite el commit si nada cambió', async () => {
    put('.gitignore', 'secreto.env\n')
    put('secreto.env', 'CLAVE=1')
    put('a.txt', '1')
    const c1 = await shadow.snapshot(dir, 'main', 'uno')
    const c2 = await shadow.snapshot(dir, 'main', 'dos')
    expect(c2).toBe(c1)
    put('a.txt', '2')
    const c3 = await shadow.snapshot(dir, 'main', 'tres')
    const ch = await shadow.changes(c1, c3)
    expect(ch.files.map((f) => f.path)).toEqual(['a.txt'])
  })

  it('deshace una tarea aunque después se cambiaran otros archivos', async () => {
    put('a.txt', 'l1\nl2\nl3\n')
    put('b.txt', 'b\n')
    const before = await shadow.snapshot(dir, 'main', 'antes')
    put('a.txt', 'l1\nl2 cambiada\nl3\n')
    put('c.txt', 'nuevo\n')
    const after = await shadow.snapshot(dir, 'main', 'después')
    // Otra tarea cambia otro archivo y otra línea del mismo.
    put('b.txt', 'b2\n')
    put('a.txt', 'l0\nl1\nl2 cambiada\nl3\n')
    const r = await shadow.apply(dir, 'main', after, before, { strict: true, label: 'deshacer' })
    expect(r.conflicts).toEqual([])
    expect(read('a.txt')).toBe('l0\nl1\nl2\nl3\n')
    expect(existsSync(join(dir, 'c.txt'))).toBe(false)
    expect(read('b.txt')).toBe('b2\n')
  })

  it('no deshace nada si la misma línea cambió después', async () => {
    put('a.txt', 'x\n')
    const before = await shadow.snapshot(dir, 'main', 'antes')
    put('a.txt', 'y\n')
    put('d.txt', 'd\n')
    const after = await shadow.snapshot(dir, 'main', 'después')
    put('a.txt', 'z\n')
    const r = await shadow.apply(dir, 'main', after, before, { strict: true, label: 'deshacer' })
    expect(r.conflicts).toEqual(['a.txt'])
    expect(r.applied).toEqual([])
    expect(read('a.txt')).toBe('z\n')
    expect(existsSync(join(dir, 'd.txt'))).toBe(true)
  })

  it('una copia aislada se integra en la carpeta, con marcas si choca', async () => {
    put('a.txt', 'a\n')
    put('m.txt', '1\n2\n3\n4\n5\n')
    mkdirSync(join(dir, 'node_modules'))
    put('node_modules/dep.js', 'dep')
    const start = await shadow.snapshot(dir, 'main', 'inicio')
    const copy = join(base, 'aislado', 't1')
    await shadow.makeCopy(start, copy, dir, 'copia-t1')
    expect(read('a.txt', copy)).toBe('a\n')
    expect(lstatSync(join(copy, 'node_modules')).isSymbolicLink()).toBe(true)
    // La tarea aislada trabaja en su copia…
    put('nuevo.txt', 'de la copia\n', copy)
    put('m.txt', '1\n2\n3\n4\n5 copia\n', copy)
    const done = await shadow.snapshot(copy, 'copia-t1', 'fin')
    // …mientras otra cambia la carpeta original.
    put('a.txt', 'a original\n')
    put('m.txt', '1 original\n2\n3\n4\n5\n')
    const r = await shadow.apply(dir, 'main', start, done, { strict: false, label: 'integrar' })
    expect(r.conflicts).toEqual([])
    expect(read('nuevo.txt')).toBe('de la copia\n')
    expect(read('m.txt')).toBe('1 original\n2\n3\n4\n5 copia\n')
    expect(read('a.txt')).toBe('a original\n')
    shadow.removeCopy(copy, 'copia-t1')
    expect(existsSync(copy)).toBe(false)
    expect(read('node_modules/dep.js')).toBe('dep')
  })

  it('al integrar un choque deja las marcas para resolverlo', async () => {
    put('m.txt', 'uno\n')
    const start = await shadow.snapshot(dir, 'main', 'inicio')
    const copy = join(base, 'aislado', 't2')
    await shadow.makeCopy(start, copy, dir, 'copia-t2')
    put('m.txt', 'copia\n', copy)
    const done = await shadow.snapshot(copy, 'copia-t2', 'fin')
    put('m.txt', 'original\n')
    const r = await shadow.apply(dir, 'main', start, done, { strict: false, label: 'integrar' })
    expect(r.conflicts).toEqual(['m.txt'])
    expect(read('m.txt')).toContain('<<<<<<<')
    expect(read('m.txt')).toContain('copia')
    expect(read('m.txt')).toContain('original')
  })

  it('no pisa un archivo que alguien cambió mientras se aplicaba', async () => {
    put('a.txt', '1\n')
    const from = await shadow.snapshot(dir, 'main', 'from')
    put('a.txt', '2\n')
    const to = await shadow.snapshot(dir, 'main', 'to')
    put('a.txt', '1\n')
    await shadow.snapshot(dir, 'main', 'vuelta')
    put('a.txt', 'otro\n')
    const r = await shadow.materialize(dir, from, to)
    expect(r.conflicts).toEqual(['a.txt'])
    expect(read('a.txt')).toBe('otro\n')
  })

  it('los enlaces simbólicos y borrados también se deshacen', async () => {
    put('t.txt', 't')
    const before = await shadow.snapshot(dir, 'main', 'antes')
    rmSync(join(dir, 't.txt'))
    symlinkSync('t.txt', join(dir, 'enlace'))
    const after = await shadow.snapshot(dir, 'main', 'después')
    const r = await shadow.apply(dir, 'main', after, before, { strict: true, label: 'deshacer' })
    expect(r.conflicts).toEqual([])
    expect(read('t.txt')).toBe('t')
    expect(existsSync(join(dir, 'enlace'))).toBe(false)
  })
})
