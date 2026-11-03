import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isExcluded, type BaseState, type SyncNotice, type SyncPairConfig } from '@shared/sync'
import { RemoteConflict, localIO, syncOnce, type RemoteIO, type SyncContext } from './syncEngine'
import { walkTree } from './serverFiles'

let root: string
let L: string
let R: string
let trashed: { side: 'local' | 'remote'; path: string }[]
let notices: Omit<SyncNotice, 't'>[]
let base: BaseState

const T = 1_700_000_000_000
const abs = (dir: string, rel: string): string => join(dir, ...rel.split('/'))

function write(dir: string, rel: string, text: string, mtime = T): void {
  const f = abs(dir, rel)
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, text)
  utimesSync(f, mtime / 1000, mtime / 1000)
}
const read = (dir: string, rel: string): string => readFileSync(abs(dir, rel), 'utf8')
const names = (dir: string): string[] =>
  (function walk(d: string, p = ''): string[] {
    return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name), `${p}${e.name}/`) : [`${p}${e.name}`]))
  })(dir).sort()

/** El «servidor» de las pruebas: otra carpeta del mismo disco con la misma semántica que la API real. */
function fsRemote(): RemoteIO {
  return {
    abs: (b, rel) => abs(b, rel),
    async tree(dir, exclude) {
      const t = await walkTree(dir, { skip: (rel) => isExcluded(rel, exclude) })
      return { files: new Map(t.files.map((f) => [f.p, { size: f.s, mtime: f.m }])), dirs: new Set(t.dirs), truncated: t.truncated }
    },
    async download(remoteAbs, localAbs, mtime) {
      mkdirSync(dirname(localAbs), { recursive: true })
      copyFileSync(remoteAbs, localAbs)
      utimesSync(localAbs, mtime / 1000, mtime / 1000)
    },
    async upload(localAbs, remoteAbs, mtime, expect) {
      const cur = existsSync(remoteAbs) ? Math.round(statSync(remoteAbs).mtimeMs) : null
      if (expect === 'none' && cur !== null) throw new RemoteConflict('existe')
      if (expect !== 'none' && (cur === null || Math.abs(cur - expect) > 2)) throw new RemoteConflict('cambió')
      mkdirSync(dirname(remoteAbs), { recursive: true })
      copyFileSync(localAbs, remoteAbs)
      utimesSync(remoteAbs, mtime / 1000, mtime / 1000)
    },
    async mkdir(remoteAbs) {
      mkdirSync(remoteAbs, { recursive: true })
    },
    async trash(remoteAbs) {
      trashed.push({ side: 'remote', path: remoteAbs })
      rmSync(remoteAbs, { recursive: true, force: true })
    },
    async hash(remoteAbs) {
      return createHash('sha256').update(readFileSync(remoteAbs)).digest('hex')
    }
  }
}

function pair(over: Partial<SyncPairConfig> = {}): SyncPairConfig {
  return { id: 'p1', name: 'Prueba', localDir: L, remoteDir: R, enabled: true, exclude: ['node_modules', '.git', '*.part'], ...over }
}

function ctx(over: Partial<SyncContext> = {}): SyncContext {
  return { device: 'PC-Casa', now: () => new Date(2026, 9, 12, 15, 30), activity: () => {}, notice: (n) => notices.push(n), confirmDeletes: false, ...over }
}

const io = (): { local: ReturnType<typeof localIO>; remote: RemoteIO } => ({
  local: localIO(async (p) => {
    trashed.push({ side: 'local', path: p })
    rmSync(p, { recursive: true, force: true })
  }),
  remote: fsRemote()
})

const run = (over: Partial<SyncContext> = {}, p = pair()): ReturnType<typeof syncOnce> => syncOnce(p, base, io(), ctx(over))

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cowork-sync-'))
  L = join(root, 'local')
  R = join(root, 'remote')
  mkdirSync(L)
  mkdirSync(R)
  trashed = []
  notices = []
  base = { files: {}, dirs: [] }
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('primera sincronización y cambios normales', () => {
  it('lo que hay en cada lado pasa al otro y la segunda ronda no hace nada', async () => {
    write(L, 'a.txt', 'aqui')
    write(R, 'b.txt', 'alli')
    write(L, 'sub/hondo/c.md', 'c')
    const r1 = await run()
    expect(r1).toMatchObject({ uploaded: 2, downloaded: 1, errors: [] })
    expect(names(L)).toEqual(['a.txt', 'b.txt', 'sub/hondo/c.md'])
    expect(names(R)).toEqual(['a.txt', 'b.txt', 'sub/hondo/c.md'])
    // La fecha viaja con el archivo: la segunda ronda lo ve igual.
    expect(Math.round(statSync(abs(R, 'a.txt')).mtimeMs)).toBe(T)
    const r2 = await run()
    expect(r2).toMatchObject({ uploaded: 0, downloaded: 0, deletedLocal: 0, deletedRemote: 0, conflicts: 0 })
  })

  it('un cambio en un lado pasa al otro', async () => {
    write(L, 'a.txt', 'v1')
    await run()
    write(L, 'a.txt', 'version 2 desde aquí', T + 60_000)
    expect((await run()).uploaded).toBe(1)
    expect(read(R, 'a.txt')).toBe('version 2 desde aquí')
    write(R, 'a.txt', 'v3 desde el servidor', T + 120_000)
    expect((await run()).downloaded).toBe(1)
    expect(read(L, 'a.txt')).toBe('v3 desde el servidor')
  })

  it('lo excluido no se sincroniza', async () => {
    write(L, 'src/a.ts', 'a')
    write(L, 'node_modules/x/index.js', 'x')
    write(L, '.git/HEAD', 'ref')
    write(L, 'src/temp.part', 'p')
    await run()
    expect(names(R)).toEqual(['src/a.ts'])
  })
})

describe('conflictos', () => {
  it('si cambió en los dos lados con distinto contenido, se conservan las dos versiones', async () => {
    write(L, 'informe.txt', 'base')
    await run()
    write(L, 'informe.txt', 'mi cambio aquí', T + 60_000)
    write(R, 'informe.txt', 'cambio en el servidor!', T + 90_000)
    const r = await run()
    expect(r.conflicts).toBe(1)
    expect(read(L, 'informe.txt')).toBe('cambio en el servidor!')
    const copy = names(L).find((n) => n.includes('conflicto'))!
    expect(copy).toBe('informe (conflicto PC-Casa 2026-10-12 15-30).txt')
    expect(read(L, copy)).toBe('mi cambio aquí')
    expect(notices.some((n) => n.kind === 'conflict')).toBe(true)
    // La siguiente ronda sube la copia: las dos versiones acaban en los dos lados.
    await run()
    expect(names(R)).toEqual(['informe (conflicto PC-Casa 2026-10-12 15-30).txt', 'informe.txt'])
    expect((await run()).conflicts).toBe(0)
  })

  it('si cambió en los dos lados al mismo contenido, no hay conflicto', async () => {
    write(L, 'a.txt', 'base')
    await run()
    write(L, 'a.txt', 'igual!', T + 60_000)
    write(R, 'a.txt', 'igual!', T + 90_000)
    const r = await run()
    expect(r.conflicts).toBe(0)
    expect(names(L)).toEqual(['a.txt'])
    expect((await run())).toMatchObject({ uploaded: 0, downloaded: 0 })
  })

  it('un archivo que ya existía distinto en los dos lados la primera vez también conserva los dos', async () => {
    write(L, 'a.txt', 'uno')
    write(R, 'a.txt', 'dos distintos')
    expect((await run()).conflicts).toBe(1)
    expect(names(L).length).toBe(2)
  })
})

describe('borrados', () => {
  it('borrado en el servidor: va a la papelera de aquí y avisa', async () => {
    write(L, 'a.txt', 'a')
    write(L, 'b.txt', 'b')
    await run()
    rmSync(abs(R, 'a.txt'))
    const r = await run()
    expect(r.deletedLocal).toBe(1)
    expect(trashed).toEqual([{ side: 'local', path: abs(L, 'a.txt') }])
    expect(names(L)).toEqual(['b.txt'])
    expect(notices.find((n) => n.kind === 'deleted-local')?.message).toContain('a.txt')
  })

  it('borrado aquí: va a la papelera del servidor y avisa', async () => {
    write(L, 'a.txt', 'a')
    write(L, 'b.txt', 'b')
    await run()
    rmSync(abs(L, 'b.txt'))
    const r = await run()
    expect(r.deletedRemote).toBe(1)
    expect(trashed).toEqual([{ side: 'remote', path: abs(R, 'b.txt') }])
    expect(notices.find((n) => n.kind === 'deleted-remote')?.message).toContain('b.txt')
  })

  it('si se editó en un lado mientras lo borraban en el otro, no se pierde la edición', async () => {
    write(L, 'a.txt', 'v1')
    await run()
    rmSync(abs(R, 'a.txt'))
    write(L, 'a.txt', 'editado a la vez', T + 60_000)
    const r = await run()
    expect(r.deletedLocal).toBe(0)
    expect(r.uploaded).toBe(1)
    expect(read(R, 'a.txt')).toBe('editado a la vez')
  })

  it('borrar muchos archivos de golpe se para y pide confirmación', async () => {
    for (let i = 0; i < 40; i++) write(L, `f${i}.txt`, `${i}`)
    await run()
    // El servidor «pierde» toda la carpeta (por ejemplo, un disco que no se montó).
    for (const n of names(R)) rmSync(abs(R, n))
    const r = await run()
    expect(r.paused).toMatch(/40 archivos/)
    expect(names(L).length).toBe(40)
    expect(trashed).toEqual([])
    // Confirmado, se hace.
    const r2 = await run({ confirmDeletes: true })
    expect(r2.paused).toBeUndefined()
    expect(r2.deletedLocal).toBe(40)
  })
})

describe('carpetas y fallos', () => {
  it('una carpeta vacía se crea al otro lado y se borra cuando se borra en uno', async () => {
    mkdirSync(abs(L, 'vacia'))
    await run()
    expect(existsSync(abs(R, 'vacia'))).toBe(true)
    rmSync(abs(R, 'vacia'), { recursive: true })
    await run()
    expect(existsSync(abs(L, 'vacia'))).toBe(false)
  })

  it('si el servidor cambió el archivo mientras se subía, no se pisa y se arregla en la ronda siguiente', async () => {
    write(L, 'a.txt', 'base')
    await run()
    write(L, 'a.txt', 'cambio mío', T + 60_000)
    const baseIO = io()
    // Entre mirar y subir, el servidor lo cambia.
    const racing: RemoteIO = {
      ...baseIO.remote,
      async upload(localAbs, remoteAbs, mtime, expect) {
        write(R, 'a.txt', 'cambio del servidor', T + 90_000)
        return baseIO.remote.upload(localAbs, remoteAbs, mtime, expect)
      }
    }
    const r1 = await syncOnce(pair(), base, { local: baseIO.local, remote: racing }, ctx())
    expect(r1.uploaded).toBe(0)
    expect(read(R, 'a.txt')).toBe('cambio del servidor')
    // Ahora cambió en los dos lados: conflicto, y no se pierde nada.
    const r2 = await run()
    expect(r2.conflicts).toBe(1)
    expect(names(L).length).toBe(2)
  })

  it('un error en un archivo no impide sincronizar los demás', async () => {
    write(L, 'bueno.txt', 'ok')
    write(L, 'malo.txt', 'x')
    const baseIO = io()
    const flaky: RemoteIO = {
      ...baseIO.remote,
      async upload(localAbs, remoteAbs, mtime, expect) {
        if (remoteAbs.endsWith('malo.txt')) throw new Error('disco lleno')
        return baseIO.remote.upload(localAbs, remoteAbs, mtime, expect)
      }
    }
    const r = await syncOnce(pair(), base, { local: baseIO.local, remote: flaky }, ctx())
    expect(r.uploaded).toBe(1)
    expect(r.errors).toEqual([expect.stringContaining('malo.txt: disco lleno')])
    expect(names(R)).toEqual(['bueno.txt'])
  })

  it('si falta la carpeta de este equipo, lo dice en vez de borrar nada del servidor', async () => {
    write(L, 'a.txt', 'a')
    await run()
    rmSync(L, { recursive: true })
    await expect(run()).rejects.toThrow()
    expect(names(R)).toEqual(['a.txt'])
  })
})
