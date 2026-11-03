import { describe, expect, it } from 'vitest'
import { confidenceFor, matchScore, nameSimilarity, parseVideoTitle, plausibleBpm } from './music'

describe('parseVideoTitle', () => {
  it('separa «Artista - Canción» y quita las coletillas del vídeo', () => {
    expect(parseVideoTitle('Daft Punk - Get Lucky (Official Video) ft. Pharrell Williams, Nile Rodgers', 'DaftPunkVEVO')).toEqual({
      artist: 'Daft Punk',
      title: 'Get Lucky'
    })
    expect(parseVideoTitle('Rosalía – DESPECHÁ [Video Oficial]', 'Rosalía')).toEqual({ artist: 'Rosalía', title: 'DESPECHÁ' })
    expect(parseVideoTitle('Queen - Bohemian Rhapsody (Official Video Remastered) | HD', 'Queen Official')).toEqual({
      artist: 'Queen',
      title: 'Bohemian Rhapsody'
    })
  })

  it('sin guion, el artista es el canal («- Topic», «VEVO»)', () => {
    expect(parseVideoTitle('Blinding Lights', 'The Weeknd - Topic')).toEqual({ artist: 'The Weeknd', title: 'Blinding Lights' })
    expect(parseVideoTitle('Shape of You (Lyrics)', 'EdSheeranVEVO')).toEqual({ artist: 'EdSheeran', title: 'Shape of You' })
  })

  it('no confunde «con» con un artista invitado', () => {
    expect(parseVideoTitle('Bailando con lobos', 'Cabas').title).toBe('Bailando con lobos')
  })
})

describe('coincidencias', () => {
  it('compara nombres sin acentos, mayúsculas ni «feat.»', () => {
    expect(nameSimilarity('Rosalía', 'ROSALIA')).toBe(1)
    expect(nameSimilarity('Get Lucky (feat. Pharrell Williams)', 'Get Lucky')).toBe(1)
    expect(nameSimilarity('Get Lucky', 'Lose Yourself to Dance')).toBe(0)
  })

  it('puntúa más alto la canción correcta y su duración', () => {
    const q = { artist: 'Daft Punk', title: 'Get Lucky', durationSec: 369 }
    const good = matchScore(q, { artist: 'Daft Punk', title: 'Get Lucky', durationSec: 367 })
    const edit = matchScore(q, { artist: 'Daft Punk', title: 'Get Lucky', durationSec: 248 })
    const other = matchScore(q, { artist: 'Daft Punk', title: 'Instant Crush', durationSec: 337 })
    expect(good).toBeGreaterThan(edit)
    expect(edit).toBeGreaterThan(other)
    expect(confidenceFor(good)).toBe('alta')
    expect(confidenceFor(other)).toBe('baja')
  })

  it('descarta BPM imposibles', () => {
    expect(plausibleBpm(0)).toBe(false)
    expect(plausibleBpm(116.1)).toBe(true)
    expect(plausibleBpm(400)).toBe(false)
  })
})
