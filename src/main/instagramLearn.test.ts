import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { __setInstagramFetchForTests } from './instagram'
import { hookOf, learningLines, reelResults, saveResults, savedReels, type ReelResult } from './instagramLearn'

afterEach(() => __setInstagramFetchForTests(null))

const reel = (id: string, views: number, caption: string, saved = 0): ReelResult => ({ id, date: '2026-11-0' + id, permalink: `https://www.instagram.com/reel/${id}/`, caption, views, reach: views, likes: 1, comments: 0, saved, shares: 0, avgWatch: 4.2 })

describe('/instagram resultados', () => {
  it('lee solo los reels y sus estadísticas (el visionado medio en segundos)', async () => {
    const urls: string[] = []
    __setInstagramFetchForTests(async (url) => {
      urls.push(url)
      const out = /\/media\?/.test(url)
        ? { data: [{ id: 'R1', media_product_type: 'REELS', caption: 'Gancho uno\nmás texto', timestamp: '2026-11-10T10:00:00+0000', permalink: 'p1', like_count: 3 }, { id: 'F1', media_product_type: 'FEED' }] }
        : { data: [{ name: 'views', total_value: { value: 1200 } }, { name: 'saved', values: [{ value: 7 }] }, { name: 'ig_reels_avg_watch_time', total_value: { value: 5340 } }] }
      return { ok: true, status: 200, text: async () => JSON.stringify(out) }
    })
    const rows = await reelResults('IGx', '17')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'R1', date: '2026-11-10', views: 1200, saved: 7, likes: 3, shares: null, avgWatch: 5.3 })
    expect(urls.some((u) => u.includes('/F1/'))).toBe(false)
    expect(hookOf(rows[0].caption)).toBe('Gancho uno')
  })

  it('guarda el resumen y, con 3 reels o más, los encargos aprenden de él', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ig-res-')), 'instagram', 'resultados.md')
    expect(learningLines(file)).toEqual([])
    saveResults(file, [reel('1', 100, 'Poco'), reel('2', 5000, 'El que más')], 'kywai.app')
    expect(savedReels(file)).toBe(2)
    expect(learningLines(file)).toEqual([])
    const summary = saveResults(file, [reel('1', 100, 'Poco'), reel('2', 5000, 'El que más'), reel('3', 900, 'Medio', 80)], 'kywai.app', new Date('2026-11-12T00:00:00Z'))
    expect(summary.split('\n')[1]).toContain('«El que más»')
    expect(summary.split('\n')[2]).toContain('«Medio»')
    expect(readFileSync(file, 'utf8')).toContain('Actualizado el 2026-11-12')
    expect(savedReels(file)).toBe(3)
    expect(learningLines(file).join('\n')).toContain(file)
  })
})
