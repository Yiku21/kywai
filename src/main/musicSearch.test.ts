import { describe, expect, it } from 'vitest'
import { isLive, musicSourceOf, streamUrlOf, webPageOf } from '@shared/musicSources'
import { filterRadios, parseAudiusResults, parseSomaChannels } from './musicSearch'

describe('fuentes de música sin anuncios', () => {
  it('reconoce la fuente de cada canción de la cola', () => {
    expect(musicSourceOf('dQw4w9WgXcQ')).toBe('youtube')
    expect(musicSourceOf('audius:YmJWK')).toBe('audius')
    expect(musicSourceOf('radio:groovesalad')).toBe('radio')
    expect(isLive('radio:groovesalad')).toBe(true)
    expect(isLive('audius:YmJWK')).toBe(false)
  })

  it('da la dirección del audio solo con ids válidos', () => {
    expect(streamUrlOf('audius:YmJWK')).toBe('https://api.audius.co/v1/tracks/YmJWK/stream?app_name=AICowork')
    expect(streamUrlOf('radio:groovesalad')).toBe('https://ice2.somafm.com/groovesalad-128-mp3')
    expect(streamUrlOf('audius:../../x')).toBeNull()
    expect(streamUrlOf('radio:Evil/../x')).toBeNull()
    expect(streamUrlOf('dQw4w9WgXcQ')).toBeNull()
  })

  it('abre la canción en su web', () => {
    expect(webPageOf('audius:YmJWK', '/artista/cancion')).toBe('https://audius.co/artista/cancion')
    expect(webPageOf('audius:YmJWK', '//malo.com')).toBe('https://audius.co')
    expect(webPageOf('radio:groovesalad')).toBe('https://somafm.com/groovesalad/')
    expect(webPageOf('dQw4w9WgXcQ')).toBe('https://music.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  it('lee las canciones de Audius y descarta las que no se pueden escuchar gratis', () => {
    const json = {
      data: [
        {
          id: 'YmJWK',
          title: 'Lofi Night',
          duration: 125.4,
          genre: 'Lo-Fi',
          permalink: '/beatmaker/lofi-night',
          is_streamable: true,
          access: { stream: true },
          artwork: { '150x150': 'https://cdn.example/150.jpg' },
          user: { name: 'Beat Maker', handle: 'beatmaker' }
        },
        { id: '95wro', title: 'No se puede', is_streamable: false, user: { name: 'X' } },
        { id: 'gated1', title: 'De pago', is_streamable: true, is_stream_gated: true, user: { name: 'X' } },
        { id: 'del1', title: 'Borrada', is_streamable: true, is_delete: true, user: { name: 'X' } },
        { id: 'bad/id', title: 'Id raro', user: { name: 'X' } }
      ]
    }
    expect(parseAudiusResults(json)).toEqual([
      {
        videoId: 'audius:YmJWK',
        title: 'Lofi Night',
        artist: 'Beat Maker',
        album: 'Lo-Fi',
        durationSec: 125,
        thumbnail: 'https://cdn.example/150.jpg',
        permalink: '/beatmaker/lofi-night'
      }
    ])
    expect(parseAudiusResults(null)).toEqual([])
  })

  it('lee las radios de SomaFM, las más escuchadas primero, y las filtra', () => {
    const json = {
      channels: [
        { id: 'beatblender', title: 'Beat Blender', description: 'Deep-house y downtempo.', genre: 'electronic', listeners: '119', image: 'https://api.somafm.com/logos/120/beatblender120.png' },
        { id: 'groovesalad', title: 'Groove Salad', description: 'Ambient y downtempo.', genre: 'ambient|electronic', listeners: '1500', largeimage: 'https://api.somafm.com/logos/256/groovesalad256.png' },
        { id: 'Mal/ID', title: 'Malo' }
      ]
    }
    const list = parseSomaChannels(json)
    expect(list.map((r) => r.videoId)).toEqual(['radio:groovesalad', 'radio:beatblender'])
    expect(list[0]).toMatchObject({ title: 'Groove Salad', artist: 'SomaFM', thumbnail: 'https://api.somafm.com/logos/256/groovesalad256.png' })
    expect(filterRadios(list, 'ámbient').map((r) => r.title)).toEqual(['Groove Salad'])
    expect(filterRadios(list, 'downtempo house').map((r) => r.title)).toEqual(['Beat Blender'])
    expect(filterRadios(list, '')).toHaveLength(2)
  })
})
