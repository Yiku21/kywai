import { describe, expect, it } from 'vitest'
import { conflictName, isExcluded, planSync, type BaseState, type FileState, type SyncAction } from './sync'

const T = 1_700_000_000_000
const st = (size: number, mtime = T): FileState => ({ size, mtime })
const files = (o: Record<string, FileState>): Map<string, FileState> => new Map(Object.entries(o))
const base = (o: Record<string, FileState> = {}, dirs: string[] = []): BaseState => ({ files: o, dirs })
const plan = (b: BaseState, l: Record<string, FileState>, r: Record<string, FileState>, ld: string[] = [], rd: string[] = []): SyncAction[] =>
  planSync(b, files(l), files(r), new Set(ld), new Set(rd))
const kinds = (a: SyncAction[]): string[] => a.map((x) => `${x.kind}:${'path' in x ? x.path : ''}`)

describe('archivos', () => {
  it('lo que ya es igual no se toca (y se anota si no estaba)', () => {
    expect(plan(base({ 'a.txt': st(5) }), { 'a.txt': st(5) }, { 'a.txt': st(5) })).toEqual([])
    expect(kinds(plan(base(), { 'a.txt': st(5) }, { 'a.txt': st(5) }))).toEqual(['same:a.txt'])
    // La fecha se redondea: dos milisegundos de diferencia son lo mismo.
    expect(plan(base({ 'a.txt': st(5) }), { 'a.txt': st(5, T + 2) }, { 'a.txt': st(5) })).toEqual([])
  })

  it('un archivo nuevo en un lado pasa al otro', () => {
    expect(kinds(plan(base(), { 'nuevo.txt': st(3) }, {}))).toEqual(['upload:nuevo.txt'])
    expect(kinds(plan(base(), {}, { 'nuevo.txt': st(3) }))).toEqual(['download:nuevo.txt'])
  })

  it('un cambio en un solo lado pasa al otro', () => {
    const b = base({ 'a.txt': st(5, T) })
    expect(kinds(plan(b, { 'a.txt': st(9, T + 5000) }, { 'a.txt': st(5, T) }))).toEqual(['upload:a.txt'])
    expect(kinds(plan(b, { 'a.txt': st(5, T) }, { 'a.txt': st(9, T + 5000) }))).toEqual(['download:a.txt'])
  })

  it('un cambio en los dos lados con distinto tamaño conserva las dos versiones', () => {
    const b = base({ 'a.txt': st(5, T) })
    expect(kinds(plan(b, { 'a.txt': st(7, T + 1000) }, { 'a.txt': st(9, T + 2000) }))).toEqual(['conflict:a.txt'])
  })

  it('un cambio en los dos lados con el mismo tamaño pide mirar el contenido', () => {
    const b = base({ 'a.txt': st(5, T) })
    const a = plan(b, { 'a.txt': st(7, T + 1000) }, { 'a.txt': st(7, T + 2000) })
    expect(a).toEqual([{ kind: 'compare', path: 'a.txt', local: st(7, T + 1000), remote: st(7, T + 2000) }])
  })

  it('la primera vez, un archivo que existe en los dos lados distinto es un conflicto', () => {
    expect(kinds(plan(base(), { 'a.txt': st(7) }, { 'a.txt': st(9) }))).toEqual(['conflict:a.txt'])
    expect(kinds(plan(base(), { 'a.txt': st(7, T) }, { 'a.txt': st(7, T + 9000) }))).toEqual(['compare:a.txt'])
  })
})

describe('borrados', () => {
  const b = base({ 'a.txt': st(5, T) })

  it('borrado en el servidor, sin tocar aquí: se borra aquí', () => {
    expect(kinds(plan(b, { 'a.txt': st(5, T) }, {}))).toEqual(['deleteLocal:a.txt'])
  })

  it('borrado aquí, sin tocar en el servidor: se borra allí', () => {
    expect(kinds(plan(b, {}, { 'a.txt': st(5, T) }))).toEqual(['deleteRemote:a.txt'])
  })

  it('si se editó en un lado mientras lo borraban en el otro, gana la edición', () => {
    expect(kinds(plan(b, { 'a.txt': st(8, T + 5000) }, {}))).toEqual(['upload:a.txt'])
    expect(kinds(plan(b, {}, { 'a.txt': st(8, T + 5000) }))).toEqual(['download:a.txt'])
  })

  it('borrado en los dos lados: no hay nada que hacer', () => {
    expect(plan(b, {}, {})).toEqual([])
  })

  it('sin base, un archivo que falta en un lado nunca se da por borrado', () => {
    expect(kinds(plan(base(), { 'a.txt': st(5) }, {}))).toEqual(['upload:a.txt'])
  })
})

describe('carpetas', () => {
  it('una carpeta nueva (vacía) en un lado se crea en el otro', () => {
    expect(kinds(plan(base(), {}, {}, ['vacia'], []))).toEqual(['mkdirRemote:vacia'])
    expect(kinds(plan(base(), {}, {}, [], ['vacia']))).toEqual(['mkdirLocal:vacia'])
  })

  it('una carpeta que ya estaba sincronizada y falta en un lado se borra en el otro', () => {
    const b = base({}, ['vieja'])
    expect(kinds(plan(b, {}, {}, ['vieja'], []))).toEqual(['rmdirLocal:vieja'])
    expect(kinds(plan(b, {}, {}, [], ['vieja']))).toEqual(['rmdirRemote:vieja'])
  })
})

describe('exclusiones', () => {
  const ex = ['.git', 'node_modules', '*.tmp', '~$*']

  it('excluye por nombre en cualquier nivel y por patrón', () => {
    expect(isExcluded('app/node_modules/x/index.js', ex)).toBe(true)
    expect(isExcluded('.git/config', ex)).toBe(true)
    expect(isExcluded('docs/borrador.TMP', ex)).toBe(true)
    expect(isExcluded('~$informe.docx', ex)).toBe(true)
    expect(isExcluded('src/index.ts', ex)).toBe(false)
    expect(isExcluded('mi.github/readme.md', ex)).toBe(false)
  })

  it('un patrón con caracteres especiales no rompe', () => {
    expect(isExcluded('a/b(1).txt', ['b(1).*'])).toBe(true)
  })
})

describe('copia de conflicto', () => {
  it('conserva la carpeta y la extensión y dice de quién es', () => {
    const when = new Date(2026, 9, 12, 15, 30)
    expect(conflictName('docs/informe.final.pdf', 'PC-Casa', when)).toBe('docs/informe.final (conflicto PC-Casa 2026-10-12 15-30).pdf')
    expect(conflictName('Makefile', 'PC/Casa', when)).toBe('Makefile (conflicto PCCasa 2026-10-12 15-30)')
    expect(conflictName('.env', 'x', when)).toBe('.env (conflicto x 2026-10-12 15-30)')
  })
})
