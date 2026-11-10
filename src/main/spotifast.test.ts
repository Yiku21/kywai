// Spotifast de mentira (un script en el PATH) para ver qué órdenes le manda kywai. Solo en Linux y macOS.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findSpotifast, spotifast } from './spotifast'

const unix = process.platform !== 'win32'

describe.runIf(unix)('mando de Spotifast', () => {
  let dir: string
  let oldPath: string | undefined
  let log: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spotifast-'))
    log = join(dir, 'log.txt')
    oldPath = process.env.PATH
  })
  afterEach(() => {
    process.env.PATH = oldPath
    rmSync(dir, { recursive: true, force: true })
  })

  function fake(running: boolean): void {
    const script = `#!/bin/sh
echo "$*" >> "${log}"
if [ "$1" = "now-playing" ]; then
  ${running ? `printf 'playing\\tGo\\tThe Band\\tAlbum\\t1000\\t200000\\t40\\toff\\toff\\t\\tno\\t\\n'` : `echo "Spotifast is not running" >&2; exit 1`}
fi
exit 0
`
    const file = join(dir, 'spotifast')
    writeFileSync(file, script)
    chmodSync(file, 0o755)
    process.env.PATH = `${dir}:/bin:/usr/bin`
  }

  it('sin Spotifast instalada lo dice', async () => {
    process.env.PATH = dir
    if (findSpotifast(process.platform, dir)) return // este equipo tiene Spotifast de verdad
    expect(await spotifast({ kind: 'status' })).toEqual({ installed: false, running: false, state: 'stopped' })
  })

  it('lee qué suena y manda las órdenes con sus argumentos', async () => {
    fake(true)
    const status = await spotifast({ kind: 'status' })
    expect(status).toMatchObject({ installed: true, running: true, state: 'playing', title: 'Go', artists: 'The Band', volume: 40 })
    await spotifast({ kind: 'next' })
    await spotifast({ kind: 'search', query: 'danza rota', type: 'artist' })
    const sent = readFileSync(log, 'utf8')
    expect(sent).toContain('next\n')
    expect(sent).toContain('play-search --kind artist -- danza rota\n')
  })

  it('cerrada: pausa o siguiente no hacen nada', async () => {
    fake(false)
    expect(await spotifast({ kind: 'playpause' })).toEqual({ installed: true, running: false, state: 'stopped' })
    expect(readFileSync(log, 'utf8')).not.toContain('play-pause')
  })

  it('rechaza órdenes que no son suyas', async () => {
    fake(true)
    await expect(spotifast({ kind: 'link', link: 'https://example.com/x' })).rejects.toThrow()
  })
})
