import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMusic } from '@/lib/music'
import { YT_STATE, type YtPlayer } from '@/lib/youtube'
import type { EmbedOptions } from '@/lib/ytEmbed'
import { MusicPanel } from './MusicPanel'

const fixture = vi.hoisted(() => ({ options: null as EmbedOptions | null, player: null as YtPlayer | null }))
vi.mock('@/lib/ytEmbed', () => ({
  createEmbedPlayer: (_host: HTMLElement, options: EmbedOptions) => {
    fixture.options = options
    return fixture.player
  }
}))

const fakePlayer = (state = YT_STATE.CUED): YtPlayer =>
  ({
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    loadVideoById: vi.fn(),
    cueVideoById: vi.fn(),
    seekTo: vi.fn(),
    getPlayerState: () => state,
    getCurrentTime: () => 0,
    getPlaybackRate: () => 1,
    getDuration: () => 240,
    setVolume: vi.fn(),
    mute: vi.fn(),
    unMute: vi.fn(),
    destroy: vi.fn()
  }) as unknown as YtPlayer

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.options = null
  fixture.player = fakePlayer()
  useMusic.setState({ open: true, mini: false, bar: false, videoId: null, tracks: {}, status: 'idle', lookup: 'searching', queue: [], index: -1 })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function search(text: string) {
  await act(async () => root.render(<MusicPanel />))
  const input = host.querySelector('input[type="search"]') as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

describe('reproductor musical', () => {
  it('un enlace suena directamente y respeta su segundo de inicio', async () => {
    await search('https://youtu.be/dQw4w9WgXcQ?t=1m30s')
    expect(fixture.options?.videoId).toBe('dQw4w9WgXcQ')
    expect(fixture.options?.start).toBe(90)
    await act(async () => fixture.options!.events.onReady!())
    expect(fixture.player!.playVideo).toHaveBeenCalledOnce()
  })

  it('si se cierra el panel mientras carga, no empieza a reproducir oculto', async () => {
    await search('dQw4w9WgXcQ')
    await act(async () => useMusic.setState({ open: false }))
    await act(async () => fixture.options!.events.onReady!())
    expect(fixture.player!.playVideo).not.toHaveBeenCalled()
    expect(fixture.player!.pauseVideo).toHaveBeenCalled()
  })

  it('al acabar una canción suena la siguiente de la cola', async () => {
    const queue = [
      { videoId: 'aaaaaaaaaaa', title: 'Uno', artist: 'A' },
      { videoId: 'bbbbbbbbbbb', title: 'Dos', artist: 'B' }
    ]
    await act(async () => root.render(<MusicPanel />))
    const { playFrom, onPlayerState } = await import('@/lib/music')
    await act(async () => playFrom(queue, 0))
    await act(async () => fixture.options!.events.onReady!())
    await act(async () => onPlayerState(YT_STATE.ENDED))
    expect(useMusic.getState().index).toBe(1)
    expect(fixture.player!.loadVideoById).toHaveBeenCalledWith('bbbbbbbbbbb', 0)
    // Los nombres de la búsqueda se guardan para buscar el BPM (no los del título del vídeo).
    expect(useMusic.getState().tracks.bbbbbbbbbbb).toMatchObject({ title: 'Dos', artist: 'B', edited: true })
  })

  it('minimizado se reduce a solo atrás / pausa / adelante sin perder el reproductor, y se recuerda', async () => {
    useMusic.setState({ mini: true, bar: false })
    await act(async () => root.render(<MusicPanel />))
    const { playFrom } = await import('@/lib/music')
    await act(async () => playFrom([{ videoId: 'aaaaaaaaaaa', title: 'Uno', artist: 'A' }], 0))
    const frame = host.querySelector('[class*="player"]')
    const click = (label: string) => act(async () => (host.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement).click())
    await click('Dejar solo los botones')
    expect(useMusic.getState()).toMatchObject({ open: true, mini: true, bar: true })
    expect(host.querySelector('input[type="range"]')).toBeNull()
    expect(host.querySelector('[aria-label="Abrir el reproductor"]')).toBeNull()
    for (const label of ['Anterior', 'Reproducir', 'Siguiente', 'Ampliar el reproductor']) expect(host.querySelector(`[aria-label="${label}"]`)).not.toBeNull()
    expect(host.querySelector('[class*="player"]')).toBe(frame)
    expect(JSON.parse(localStorage.getItem('aicowork.music.v1')!).bar).toBe(true)
    await click('Ampliar el reproductor')
    expect(useMusic.getState()).toMatchObject({ mini: true, bar: false })
    expect(host.querySelector('input[type="range"]')).not.toBeNull()
  })
})
