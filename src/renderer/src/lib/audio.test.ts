import { describe, expect, it } from 'vitest'
import * as audio from './audio'

describe('audio', () => {
  it('se importa y expone la API de audio y el wrapper de Howler', () => {
    expect(audio).toBeDefined()
    expect(audio.initAudio).toBeTypeOf('function')
    expect(audio.playSfx).toBeTypeOf('function')
    expect(audio.createAudioClip).toBeTypeOf('function')
    expect(audio.releaseAudioClip).toBeTypeOf('function')
    expect(audio.getVolume()).toBeGreaterThanOrEqual(0)
    expect(audio.getVolume()).toBeLessThanOrEqual(1)
  })
})

describe('voces de los agentes', () => {
  it('cada proveedor tiene su voz y un desconocido recibe siempre la misma', () => {
    const claude = audio.voiceProfile('claude')
    const codex = audio.voiceProfile('codex')
    expect(claude.base).not.toBe(codex.base)
    expect(audio.voiceProfile('agente-raro')).toEqual(audio.voiceProfile('agente-raro'))
  })

  it('el becario suena más agudo que su jefe', () => {
    expect(audio.voiceProfile('claude', true).base).toBeGreaterThan(audio.voiceProfile('claude').base)
  })

  it('el volumen de las voces es independiente del general', () => {
    const general = audio.getVolume()
    audio.setVoiceVolume(0.3)
    expect(audio.getVoiceVolume()).toBe(0.3)
    expect(audio.getVolume()).toBe(general)
    audio.setVoiceMuted(true)
    expect(audio.isVoiceMuted()).toBe(true)
    expect(audio.isMuted()).toBe(false)
    audio.setVoiceMuted(false)
    expect(audio.isVoiceMuted()).toBe(false)
  })
})
