import { beforeEach, describe, expect, it } from 'vitest'
import { clearTempoCache, lookupTempo } from './musicTempo'

/** Deezer simulado: búsqueda y ficha de cada canción. */
function fakeDeezer(tracks: { id: number; title: string; artist: string; duration: number; bpm: number }[]) {
  const calls: string[] = []
  const fetcher = async (url: string): Promise<unknown> => {
    calls.push(url)
    const track = url.match(/\/track\/(\d+)$/)
    if (track) {
      const t = tracks.find((x) => x.id === Number(track[1]))!
      return { ...t, artist: { name: t.artist }, link: `https://www.deezer.com/track/${t.id}` }
    }
    return { data: tracks.map((t) => ({ id: t.id, title: t.title, duration: t.duration, artist: { name: t.artist } })) }
  }
  return { fetcher, calls }
}

describe('lookupTempo', () => {
  beforeEach(() => clearTempoCache())

  it('elige la mejor coincidencia y devuelve su BPM con la confianza', async () => {
    const { fetcher } = fakeDeezer([
      { id: 1, title: 'Instant Crush', artist: 'Daft Punk', duration: 337, bpm: 110 },
      { id: 2, title: 'Get Lucky', artist: 'Daft Punk', duration: 367, bpm: 116.1 }
    ])
    const r = await lookupTempo({ artist: 'Daft Punk', title: 'Get Lucky', durationSec: 369 }, fetcher)
    expect(r.match).toMatchObject({ bpm: 116.1, confidence: 'alta', source: 'deezer', url: 'https://www.deezer.com/track/2' })
  })

  it('sin BPM publicado o sin coincidencia fiable no inventa un tempo', async () => {
    const noBpm = fakeDeezer([{ id: 3, title: 'Get Lucky', artist: 'Daft Punk', duration: 367, bpm: 0 }])
    expect((await lookupTempo({ artist: 'Daft Punk', title: 'Get Lucky' }, noBpm.fetcher)).match).toBeNull()
    clearTempoCache()
    const other = fakeDeezer([{ id: 4, title: 'Something Else', artist: 'Nobody', duration: 200, bpm: 120 }])
    const r = await lookupTempo({ artist: 'Daft Punk', title: 'Get Lucky' }, other.fetcher)
    expect(r.match).toBeNull()
    expect(r.note).toMatch(/fiable/)
  })

  it('guarda en caché las búsquedas', async () => {
    const { fetcher, calls } = fakeDeezer([{ id: 5, title: 'Get Lucky', artist: 'Daft Punk', duration: 367, bpm: 116 }])
    await lookupTempo({ artist: 'Daft Punk', title: 'Get Lucky' }, fetcher)
    const n = calls.length
    await lookupTempo({ artist: 'daft punk', title: 'get lucky' }, fetcher)
    expect(calls.length).toBe(n)
  })

  it('pide el nombre de la canción', async () => {
    expect((await lookupTempo({ artist: 'x', title: '' })).match).toBeNull()
  })
})
