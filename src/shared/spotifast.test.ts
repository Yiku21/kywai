import { describe, expect, it } from 'vitest'
import { checkAction, cleanSearch, parseNowPlaying, spotifastArgs, spotifyUriOf } from './spotifast'

describe('Spotifast', () => {
  it('lee lo que suena («now-playing --raw»)', () => {
    const raw = 'playing\tDanza rota\tSoda Stereo\tSueño Stereo\t61000\t215000\t40\toff\tcontext\thttps://i.scdn.co/image/ab67\tyes\tMac mini\n'
    expect(parseNowPlaying(raw)).toEqual({
      state: 'playing',
      title: 'Danza rota',
      artists: 'Soda Stereo',
      album: 'Sueño Stereo',
      positionMs: 61000,
      durationMs: 215000,
      volume: 40,
      art: 'https://i.scdn.co/image/ab67',
      device: 'Mac mini'
    })
    expect(parseNowPlaying('stopped\n')).toEqual({ state: 'stopped' })
    expect(parseNowPlaying('')).toEqual({ state: 'stopped' })
    // Solo los nueve campos de versiones viejas, y una carátula que no es https.
    expect(parseNowPlaying('paused\tGo\tThe Band\t\t0\t1000\t50\ton\toff\tfile:///x')).toMatchObject({ state: 'paused', title: 'Go', art: undefined, device: undefined })
  })

  it('convierte enlaces de Spotify en URI y rechaza lo demás', () => {
    expect(spotifyUriOf('https://open.spotify.com/intl-es/track/4uLU6hMCjMI75M1A2tKUQC?si=abc')).toBe('spotify:track:4uLU6hMCjMI75M1A2tKUQC')
    expect(spotifyUriOf('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')
    expect(spotifyUriOf('spotify:album:1DFixLWuPkv3KT3TnV35m3')).toBe('spotify:album:1DFixLWuPkv3KT3TnV35m3')
    expect(spotifyUriOf('https://evil.example/track/4uLU6hMCjMI75M1A2tKUQC')).toBeNull()
    expect(spotifyUriOf('spotify:track:a b')).toBeNull()
    expect(spotifyUriOf('../../etc/passwd')).toBeNull()
  })

  it('limpia la búsqueda', () => {
    expect(cleanSearch('  danza   rota ')).toBe('danza rota')
    expect(cleanSearch('a\u0007b')).toBeNull()
    expect(cleanSearch('x'.repeat(201))).toBeNull()
    expect(cleanSearch(3)).toBeNull()
  })

  it('comprueba las acciones y arma la orden sin shell', () => {
    expect(checkAction({ kind: 'rm -rf' })).toBeNull()
    expect(checkAction(null)).toBeNull()
    expect(checkAction({ kind: 'volume', percent: 140 })).toEqual({ kind: 'volume', percent: 100 })
    expect(checkAction({ kind: 'seekTo', seconds: -1 })).toBeNull()
    expect(checkAction({ kind: 'link', link: 'https://example.com' })).toBeNull()
    const search = checkAction({ kind: 'search', query: '--kind artist soda', type: 'nope' })
    expect(search).toEqual({ kind: 'search', query: '--kind artist soda', type: 'track' })
    // Las palabras van tras «--»: no se leen como opciones.
    expect(spotifastArgs(search!)).toEqual(['play-search', '--kind', 'track', '--', '--kind', 'artist', 'soda'])
    expect(spotifastArgs({ kind: 'seekTo', seconds: 61 })).toEqual(['seek-to', '61'])
    expect(spotifastArgs({ kind: 'link', link: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC' })).toEqual(['play-uri', 'spotify:track:4uLU6hMCjMI75M1A2tKUQC'])
    expect(spotifastArgs({ kind: 'status' })).toEqual(['now-playing', '--raw'])
  })
})
