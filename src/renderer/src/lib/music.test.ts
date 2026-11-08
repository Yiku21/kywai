import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindPlayer, chooseVideo, musicClock, musicDanceSignal, musicLightLevel, onPlayerState, setManualBpm, tapBeat, tempoOf, unbindPlayer, useMusic } from './music'
import * as audio from './audio'
import * as audioSync from './audioSync'
import { YT_STATE, type YtPlayer } from './youtube'

/** Reproductor de YouTube simulado: avanza con el reloj falso cuando está en reproducción. */
function fakePlayer() {
  let state: number = YT_STATE.CUED
  let position = 0
  let rate = 1
  let since = performance.now()
  const now = (): number => (state === YT_STATE.PLAYING ? position + ((performance.now() - since) / 1000) * rate : position)
  const settle = (): void => {
    position = now()
    since = performance.now()
  }
  const player: YtPlayer = {
    cueVideoById: () => undefined,
    loadVideoById: () => undefined,
    playVideo: () => { settle(); state = YT_STATE.PLAYING; onPlayerState(state) },
    pauseVideo: () => { settle(); state = YT_STATE.PAUSED; onPlayerState(state) },
    seekTo: (s) => { position = s; since = performance.now() },
    getCurrentTime: now,
    getDuration: () => 240,
    getPlayerState: () => state,
    getPlaybackRate: () => rate,
    setVolume: () => undefined,
    mute: () => undefined,
    unMute: () => undefined,
    destroy: () => undefined
  }
  return { player, setRate: (r: number) => { settle(); rate = r } }
}

describe('música del espacio', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] })
    useMusic.setState({ videoId: null, tracks: {}, taps: [], lightsOn: true, lookup: 'searching' })
    chooseVideo('dQw4w9WgXcQ', 0, false)
    setManualBpm(120)
  })
  afterEach(() => {
    unbindPlayer()
    vi.useRealTimers()
  })

  it('el modo manual da tempo a una canción sin BPM encontrado', () => {
    expect(tempoOf(useMusic.getState().tracks.dQw4w9WgXcQ)).toMatchObject({ mode: 'manual', bpm: 120, confidence: 'manual' })
    expect(musicClock.bpm).toBe(120)
  })

  it('las luces laten mientras suena y se apagan en pausa; se resincronizan al reanudar y al saltar', () => {
    const { player } = fakePlayer()
    bindPlayer(player)
    player.playVideo()
    vi.advanceTimersByTime(10_000)
    // Justo en un pulso (120 BPM, desfase 0): destello; a mitad de pulso, casi apagado.
    expect(musicClock.mediaTimeAt(performance.now())).toBeCloseTo(10, 1)
    expect(musicLightLevel(performance.now() + 40, false)).toBeGreaterThan(0.5)
    expect(musicLightLevel(performance.now() + 250, false)).toBeLessThan(0.1)

    player.pauseVideo()
    expect(musicLightLevel(performance.now() + 20, false)).toBe(0)
    vi.advanceTimersByTime(5000)
    player.playVideo()
    expect(musicClock.mediaTimeAt(performance.now())).toBeCloseTo(10, 1)

    // Salto a 42,25 s: el sondeo lo detecta y el pulso se recoloca (a mitad de pulso).
    player.seekTo(42.25, true)
    vi.advanceTimersByTime(260)
    expect(musicClock.mediaTimeAt(performance.now())).toBeCloseTo(42.51, 1)
    const phase = musicClock.beatAt(performance.now())!.phase
    expect(Math.abs(phase - 0.02)).toBeLessThan(0.05)
  })

  it('sigue el cambio de velocidad', () => {
    const { player, setRate } = fakePlayer()
    bindPlayer(player)
    player.playVideo()
    vi.advanceTimersByTime(1000)
    setRate(2)
    vi.advanceTimersByTime(1000)
    expect(musicClock.playbackRate).toBe(2)
    expect(musicClock.mediaTimeAt(performance.now())).toBeCloseTo(player.getCurrentTime(), 1)
  })

  it('marcar el pulso alinea el desfase con lo que se oye', () => {
    const { player } = fakePlayer()
    bindPlayer(player)
    player.playVideo()
    vi.advanceTimersByTime(3000)
    // El usuario oye los pulsos 0,1 s después de lo que cree el reloj.
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(i === 0 ? 100 : 500)
      tapBeat(performance.now())
    }
    const track = useMusic.getState().tracks.dQw4w9WgXcQ
    expect(track.manualBpm).toBe(120)
    expect(track.offset).toBeCloseTo(0.1, 1)
  })

  it('sin luces activadas no hay pulso', () => {
    const { player } = fakePlayer()
    bindPlayer(player)
    player.playVideo()
    useMusic.setState({ lightsOn: false })
    expect(musicLightLevel(performance.now() + 20, false)).toBe(0)
  })

  it('el baile sigue al tempo aunque las luces estén apagadas y se detiene al pausar', () => {
    const { player } = fakePlayer()
    bindPlayer(player); player.playVideo()
    useMusic.setState({ lightsOn: false })
    expect(musicLightLevel(performance.now() + 40, false)).toBe(0)
    expect(musicDanceSignal(performance.now() + 40)).toMatchObject({ playing: true, beats: 0.08 })
    expect(musicDanceSignal(performance.now() + 40).pulse).toBeGreaterThan(0.5)
    player.pauseVideo()
    expect(musicDanceSignal(performance.now())).toEqual({ playing: false, beats: null, pulse: 0 })
  })

  it('el baile se resincroniza al saltar de canción y al cambiar la velocidad', () => {
    const { player, setRate } = fakePlayer()
    bindPlayer(player); player.playVideo()
    vi.advanceTimersByTime(1000)
    expect(musicDanceSignal(performance.now()).beats).toBeCloseTo(2)
    setRate(2); vi.advanceTimersByTime(1000)
    expect(musicDanceSignal(performance.now()).beats).toBeCloseTo(6)
    player.seekTo(42.25, true); vi.advanceTimersByTime(260)
    expect(musicDanceSignal(performance.now()).beats).toBeCloseTo(musicClock.mediaTimeAt(performance.now()) * 2)
    expect(musicDanceSignal(performance.now()).beats).toBeGreaterThan(84)
  })

  it('sin BPM usa los golpes del audio propio y al silenciar deja de bailar', () => {
    const { player } = fakePlayer()
    bindPlayer(player); player.playVideo(); setManualBpm(null)
    const spy = vi.spyOn(audioSync, 'audioLightLevel').mockReturnValue(0.8)
    const previous = audio.getVolume(), muted = audio.isMuted()
    try {
      expect(musicDanceSignal(performance.now())).toEqual({ playing: true, beats: null, pulse: 0.8 })
      audio.setMuted(true)
      expect(musicDanceSignal(performance.now()).playing).toBe(false)
      audio.setMuted(false); audio.setVolume(0)
      expect(musicDanceSignal(performance.now()).playing).toBe(false)
    } finally { spy.mockRestore(); audio.setVolume(previous); audio.setMuted(muted) }
  })

  it('la música ambiental también comparte su pulso real con el baile', () => {
    const spy = vi.spyOn(audio, 'ambientMusicBeat').mockReturnValue(3.08)
    try {
      expect(musicDanceSignal(performance.now()).playing).toBe(true)
      expect(musicDanceSignal(performance.now()).beats).toBe(3.08)
    } finally { spy.mockRestore() }
  })
})
