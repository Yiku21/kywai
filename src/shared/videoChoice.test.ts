import { describe, expect, it } from 'vitest'
import { defaultVoiceFor, videoLang, LANG_VOICES, parseVoiceId, ROBOTS_CHARACTER, speakerVoices, stripVideoTags, videoChoiceOf, withVideoChoice } from './videoChoice'

describe('lo elegido al escribir /video', () => {
  it('lee el tipo, el personaje y el estilo marcados', () => {
    expect(videoChoiceOf('/video la luna')).toEqual({ kind: 'rapido', character: null, style: null, voice: null })
    expect(videoChoiceOf('/video tipo:mixto personaje:robots-kywai estilo:watercolor la luna')).toEqual({ kind: 'mixto', character: ROBOTS_CHARACTER, style: 'watercolor', voice: null })
    expect(videoChoiceOf('/video tipo:nada estilo:nada la luna')).toEqual({ kind: 'rapido', character: null, style: null, voice: null })
  })

  it('entiende las marcas de antes', () => {
    expect(videoChoiceOf('/video estilo:cartoon la luna').kind).toBe('presentador')
    expect(videoChoiceOf('/video estilo:dinamico la luna').kind).toBe('rapido')
  })

  it('el estilo pintado a mano lleva los robots salvo que se diga otro personaje', () => {
    expect(videoChoiceOf('/video estilo:kywai-pintado la luna').character).toBe(ROBOTS_CHARACTER)
    expect(videoChoiceOf('/video personaje:ninguno estilo:kywai-pintado la luna').character).toBeNull()
    expect(videoChoiceOf('/video personaje:dona-rosa-3f9a estilo:kywai-pintado la luna').character).toBe('dona-rosa-3f9a')
  })

  it('pone y cambia las marcas detrás de /video sin tocar el tema', () => {
    expect(withVideoChoice('/video ', { kind: 'mixto', character: ROBOTS_CHARACTER, style: 'pixel-rpg' })).toBe('/video tipo:mixto personaje:robots-kywai estilo:pixel-rpg ')
    expect(withVideoChoice('/video tipo:mixto la luna', { kind: 'rapido', character: null, style: null })).toBe('/video la luna')
    expect(withVideoChoice('/video la luna estilo:watercolor', { kind: 'presentador', character: null, style: 'watercolor' })).toBe('/video tipo:presentador estilo:watercolor la luna')
    expect(withVideoChoice('/video la luna', { kind: 'rapido', character: null, style: 'kywai-pintado' })).toBe('/video personaje:ninguno estilo:kywai-pintado la luna')
    expect(withVideoChoice('hola', { kind: 'mixto', character: null, style: null })).toBe('hola')
  })

  it('quita las marcas', () => {
    expect(stripVideoTags('/video tipo:mixto personaje:x estilo:watercolor la luna')).toBe('/video la luna')
  })

  it('lee, pone y quita la voz', () => {
    expect(videoChoiceOf('/video voz:kokoro-ef_dora la luna').voice).toBe('kokoro-ef_dora')
    expect(videoChoiceOf('/video voz:gemini-puck la luna').voice).toBe('gemini-puck')
    expect(videoChoiceOf('/video voz:inventada la luna').voice).toBeNull()
    expect(withVideoChoice('/video la luna', { kind: 'mixto', character: null, style: null, voice: 'kokoro-em_alex' })).toBe('/video tipo:mixto voz:kokoro-em_alex la luna')
    expect(withVideoChoice('/video voz:gemini-kore la luna', { kind: 'rapido', character: null, style: null, voice: null })).toBe('/video la luna')
    expect(stripVideoTags('/video voz:kokoro-ef_dora la luna')).toBe('/video la luna')
  })

  it('entiende los ids de voz', () => {
    expect(parseVoiceId('gemini-puck')).toEqual({ engine: 'gemini', id: 'Puck' })
    expect(parseVoiceId('kokoro-af_heart')).toEqual({ engine: 'kokoro', id: 'af_heart' })
    expect(parseVoiceId('kokoro-zz_nadie')).toBeNull()
    expect(parseVoiceId('voicebox-mi-voz-1')).toEqual({ engine: 'voicebox', id: 'mi-voz-1' })
    expect(parseVoiceId('sistema')).toEqual({ engine: 'sistema', id: '' })
    expect(parseVoiceId('gemini-nadie')).toBeNull()
    expect(parseVoiceId(null)).toBeNull()
    expect(parseVoiceId('edge-es-es-alvaroneural')).toEqual({ engine: 'edge', id: 'es-ES-AlvaroNeural' })
    expect(parseVoiceId('edge-es-MX-JorgeNeural')).toEqual({ engine: 'edge', id: 'es-MX-JorgeNeural' })
    expect(parseVoiceId('edge-en-US-Nadie')).toBeNull()
    expect(parseVoiceId('mac-carmen')).toEqual({ engine: 'mac', id: 'carmen' })
    expect(parseVoiceId('edge-en-GB-RyanNeural')).toEqual({ engine: 'edge', id: 'en-GB-RyanNeural' })
    // Todas las voces elegidas por idioma se entienden, y la primera va por defecto.
    for (const ids of Object.values(LANG_VOICES)) for (const id of ids) expect(parseVoiceId(id)).not.toBeNull()
    expect(defaultVoiceFor('es')).toBe('edge-es-ES-AlvaroNeural')
    expect(defaultVoiceFor('en')).toBe('kokoro-af_bella')
    expect(defaultVoiceFor('fr')).toBeNull()
    expect(videoChoiceOf('/video voz:edge-es-MX-JorgeNeural la luna').voice).toBe('edge-es-MX-JorgeNeural')
  })

  it('el idioma del vídeo sale de la voz elegida, o del texto, o de la app', () => {
    expect(videoLang('kokoro-am_adam', 'crea 3 vídeos para promocionar kywai', 'es')).toBe('en')
    expect(videoLang('edge-en-GB-RyanNeural', 'lo que sea', 'es')).toBe('en')
    expect(videoLang('edge-es-MX-JorgeNeural', 'make a video', 'en')).toBe('es')
    expect(videoLang('mac-carmen', 'x', 'en')).toBe('es')
    // La voz manda sobre lo que diga el texto.
    expect(videoLang('kokoro-am_adam', 'hazlo en español', 'es')).toBe('en')
    expect(videoLang(null, 'tres vídeos para tiktok, en ingles y perfectos', 'es')).toBe('en')
    expect(videoLang(null, 'a video in Spanish about bread', 'en')).toBe('es')
    expect(videoLang(null, 'el ciclo del agua', 'es')).toBe('es')
    expect(videoLang('gemini-puck', 'el ciclo del agua', 'fr')).toBe('fr')
  })
})

describe('diálogo', () => {
  it('«dialogo:si» se lee, se quita del texto y se vuelve a poner', () => {
    expect(videoChoiceOf('/video dialogo:si cómo hacer pan').dialogue).toBe(true)
    expect(videoChoiceOf('/video cómo hacer pan').dialogue).toBeUndefined()
    expect(stripVideoTags('/video diálogo:sí cómo hacer pan')).toBe('/video cómo hacer pan')
    expect(withVideoChoice('/video pan', { kind: 'rapido', character: null, style: null, dialogue: true })).toBe('/video dialogo:si pan')
  })

  it('«guion:repasar» se lee, se quita del texto y se vuelve a poner', () => {
    expect(videoChoiceOf('/video guion:repasar cómo hacer pan').review).toBe(true)
    expect(videoChoiceOf('/video cómo hacer pan').review).toBeUndefined()
    expect(stripVideoTags('/video guión:revisar cómo hacer pan')).toBe('/video cómo hacer pan')
    expect(withVideoChoice('/video pan', { kind: 'rapido', character: null, style: null, review: true })).toContain('guion:repasar')
  })

  it('cada personaje con una voz de su género; la elegida, para el primero que le pega', () => {
    const sp = [{ name: 'Hermes', gender: 'f' as const }, { name: 'Claude', gender: 'm' as const }]
    expect(speakerVoices('es', null, sp, { mac: true })).toEqual({ Claude: 'edge-es-ES-AlvaroNeural', Hermes: 'mac-carmen' })
    // Sin Mac no hay Carmen: el otro, otra voz del idioma.
    expect(speakerVoices('es', null, sp, { mac: false })).toEqual({ Claude: 'edge-es-ES-AlvaroNeural', Hermes: 'edge-es-MX-JorgeNeural' })
    expect(speakerVoices('en', 'kokoro-am_adam', sp, { mac: false })).toEqual({ Claude: 'kokoro-am_adam', Hermes: 'kokoro-af_bella' })
    expect(speakerVoices('fr', null, [{ name: 'A' }, { name: 'B' }], { mac: false })).toEqual({ A: null, B: 'kokoro-ff_siwis' })
  })

  it('la marca de estructura', () => {
    expect(videoChoiceOf('/video estructura:pasos la luna').structure).toBe('pasos')
    expect(videoChoiceOf('/video estructura:otra la luna').structure).toBeUndefined()
    expect(stripVideoTags('/video estructura:pasos la luna')).toBe('/video la luna')
    expect(withVideoChoice('/video la luna', { kind: 'rapido', character: null, style: null, structure: 'pasos' })).toBe('/video estructura:pasos la luna')
  })
})
