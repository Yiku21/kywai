import { describe, expect, it, vi } from 'vitest'
import { AUDIO_ERROR, createAudioPlayer } from './audioPlayer'
import { YT_STATE } from './youtube'

describe('reproductor de audio propio (Audius y radios)', () => {
  it('carga la dirección del audio y avisa de los estados como YouTube', () => {
    const onStateChange = vi.fn()
    const p = createAudioPlayer({ onStateChange })
    const play = vi.spyOn(p.element, 'play').mockResolvedValue(undefined)
    p.loadVideoById('audius:YmJWK')
    expect(p.element.src).toBe('https://api.audius.co/v1/tracks/YmJWK/stream?app_name=AICowork')
    expect(play).toHaveBeenCalledOnce()
    p.element.dispatchEvent(new Event('playing'))
    expect(p.getPlayerState()).toBe(YT_STATE.PLAYING)
    p.element.dispatchEvent(new Event('ended'))
    expect(onStateChange.mock.calls.map((c) => c[0])).toEqual([YT_STATE.PLAYING, YT_STATE.ENDED])
  })

  it('preparar sin sonar deja la canción lista y en pausa', () => {
    const onStateChange = vi.fn()
    const p = createAudioPlayer({ onStateChange })
    const play = vi.spyOn(p.element, 'play').mockResolvedValue(undefined)
    p.cueVideoById('radio:groovesalad')
    expect(p.element.src).toBe('https://ice2.somafm.com/groovesalad-128-mp3')
    expect(play).not.toHaveBeenCalled()
    expect(onStateChange).toHaveBeenLastCalledWith(YT_STATE.CUED)
  })

  it('un id que no es de estas fuentes da error sin cargar nada', () => {
    const onError = vi.fn()
    const p = createAudioPlayer({ onError })
    p.loadVideoById('dQw4w9WgXcQ')
    expect(onError).toHaveBeenCalledWith(AUDIO_ERROR.UNSUPPORTED)
    expect(p.element.getAttribute('src')).toBeNull()
  })

  it('una radio no tiene duración ni se puede saltar dentro', () => {
    const p = createAudioPlayer({})
    Object.defineProperty(p.element, 'duration', { value: Infinity })
    expect(p.getDuration()).toBe(0)
    p.seekTo(30, true)
    expect(p.getCurrentTime()).toBe(0)
  })

  it('el volumen va de 0 a 100, como en YouTube', () => {
    const p = createAudioPlayer({})
    p.setVolume(40)
    expect(p.element.volume).toBeCloseTo(0.4)
    p.mute()
    expect(p.element.muted).toBe(true)
    p.unMute()
    expect(p.element.muted).toBe(false)
  })
})
