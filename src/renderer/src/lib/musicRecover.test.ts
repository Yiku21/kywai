import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicResult } from '@shared/types'

const search = vi.hoisted(() => vi.fn<(q: string, kind?: string) => Promise<MusicResult[]>>())
vi.mock('./api', () => ({ api: { searchMusic: search }, isWeb: false }))

const { bindPlayer, officialUpload, playFrom, recoverFromError, sameSong, unbindPlayer, useMusic } = await import('./music')
const { YT_STATE } = await import('./youtube')

const song = { videoId: 'bloqueada01', title: 'DtMF', artist: 'Bad Bunny', durationSec: 237 }
const siguiente = { videoId: 'siguiente01', title: 'BAILE INoLVIDABLE', artist: 'Bad Bunny', durationSec: 368 }

function fakePlayer() {
  return {
    loadVideoById: vi.fn(),
    cueVideoById: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    seekTo: vi.fn(),
    getCurrentTime: () => 0,
    getDuration: () => 0,
    getPlayerState: () => YT_STATE.UNSTARTED,
    getPlaybackRate: () => 1,
    setVolume: vi.fn(),
    mute: vi.fn(),
    unMute: vi.fn(),
    destroy: vi.fn()
  }
}

beforeEach(() => {
  vi.useRealTimers()
  search.mockReset()
  localStorage.clear()
  useMusic.setState({ videoId: null, queue: [], index: -1, tracks: {}, error: null, notice: null, status: 'idle' })
})

describe('canciones que su discográfica no deja oír fuera de YouTube', () => {
  it('reconoce otra subida de la misma canción por título, artista y duración', () => {
    expect(sameSong({ videoId: 'x', title: 'Bad Bunny - DtMF (Letra/Lyrics)', artist: 'Fan', durationSec: 240 }, song)).toBe(true)
    expect(sameSong({ videoId: 'x', title: 'Bad Bunny - DtMF (1 hora en bucle)', artist: 'Fan', durationSec: 3600 }, song)).toBe(false)
    expect(sameSong({ videoId: 'x', title: 'Otra canción', artist: 'Bad Bunny', durationSec: 237 }, song)).toBe(false)
    // Una versión de otro grupo con el mismo título no vale.
    expect(sameSong({ videoId: 'x', title: 'DtMF - Banda Puro Santa Rosa', artist: 'Maz Actitud', durationSec: 236 }, song)).toBe(false)
    // Con varios artistas basta el primero.
    expect(sameSong({ videoId: 'x', title: 'un x100to (Letra)', artist: 'Grupo Frontera', durationSec: 195 }, { videoId: 'y', title: 'un x100to', artist: 'Grupo Frontera y Bad Bunny', durationSec: 195 })).toBe(true)
  })

  it('las subidas del propio artista o de su discográfica van al final (suelen estar bloqueadas igual)', () => {
    expect(officialUpload({ videoId: 'x', title: 'DtMF', artist: 'Bad Bunny' }, song)).toBe(true)
    expect(officialUpload({ videoId: 'x', title: 'DtMF', artist: 'BadBunnyVEVO' }, song)).toBe(true)
    expect(officialUpload({ videoId: 'x', title: 'DtMF', artist: 'Letras Latinas' }, song)).toBe(false)
  })

  it('error 150: prueba otra versión, lo avisa y la recuerda para la próxima vez', async () => {
    const player = fakePlayer()
    bindPlayer(player)
    search.mockResolvedValue([
      { videoId: 'bucle000001', title: 'DtMF 1 hora', artist: 'Bucles', durationSec: 3600 },
      { videoId: 'letra000001', title: 'Bad Bunny - DtMF (Letra)', artist: 'Letras Latinas', durationSec: 239 }
    ])
    playFrom([song, siguiente], 0)
    await recoverFromError(150, 'El autor no permite reproducir este vídeo fuera de YouTube.')
    expect(search).toHaveBeenCalledWith('Bad Bunny DtMF', 'videos')
    expect(player.loadVideoById).toHaveBeenLastCalledWith('letra000001', 0)
    const st = useMusic.getState()
    expect(st.queue[0]).toMatchObject({ videoId: 'letra000001', title: 'DtMF', via: 'Letras Latinas', origId: 'bloqueada01' })
    expect(st.notice).toMatch(/Suena otra versión de «DtMF» \(subida por Letras Latinas\)/)
    // Los nombres de la canción siguen siendo los de verdad (para el BPM).
    expect(st.tracks.letra000001).toMatchObject({ title: 'DtMF', artist: 'Bad Bunny' })

    // Cuando suena, se recuerda: la próxima vez va directa a esa versión.
    const { onPlayerState } = await import('./music')
    onPlayerState(YT_STATE.PLAYING)
    playFrom([song], 0)
    expect(useMusic.getState().queue[0]).toMatchObject({ videoId: 'letra000001', via: 'Letras Latinas' })
    unbindPlayer()
  })

  it('si fallan 3 seguidas deja de saltar (desde el navegador puede no sonar casi nada)', async () => {
    vi.useFakeTimers()
    const player = fakePlayer()
    bindPlayer(player)
    search.mockResolvedValue([])
    const list = ['a', 'b', 'c', 'd', 'e'].map((x) => ({ videoId: `${x.repeat(11)}`, title: `Canción ${x}`, artist: 'Artista', durationSec: 200 }))
    playFrom(list, 0)
    for (let i = 0; i < 3; i++) {
      await recoverFromError(150, 'Bloqueada')
      vi.advanceTimersByTime(2100)
    }
    expect(useMusic.getState().index).toBe(2)
    expect(useMusic.getState().error).not.toContain('Pasando a la siguiente')
    unbindPlayer()
  })

  it('sin otra versión que suene: lo dice y pasa a la siguiente', async () => {
    vi.useFakeTimers()
    const player = fakePlayer()
    bindPlayer(player)
    search.mockResolvedValue([{ videoId: 'nada0000001', title: 'Otra cosa', artist: 'X', durationSec: 200 }])
    playFrom([song, siguiente], 0)
    await recoverFromError(150, 'El autor no permite reproducir este vídeo fuera de YouTube.')
    expect(useMusic.getState().error).toBe(
      '«DtMF» no se puede oír fuera de YouTube (no lo permite su discográfica). No encontré otra versión que se pueda oír aquí. Pasando a la siguiente…'
    )
    vi.advanceTimersByTime(2100)
    expect(useMusic.getState().index).toBe(1)
    expect(player.loadVideoById).toHaveBeenLastCalledWith('siguiente01', 0)
    unbindPlayer()
  })
})
