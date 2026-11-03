import { Howl, type HowlOptions } from 'howler'

/** Audio local sintetizado. No crea un AudioContext hasta recibir un gesto del usuario. */
export type SfxName = 'taskStart' | 'taskComplete' | 'error' | 'message' | 'transfer' | 'fileCreated' | 'projectCreated' | 'click'

const MUTE_KEY = 'aicowork.muted'
const VOLUME_KEY = 'aicowork.volume'
const LAST_VOLUME_KEY = 'aicowork.lastVolume'
const VOICE_VOLUME_KEY = 'aicowork.voiceVolume'
const VOICE_MUTE_KEY = 'aicowork.voiceMuted'
const DEFAULT_VOLUME = 0.8
const DEFAULT_VOICE_VOLUME = 0.7
// Las notas musicales tienen envolventes suaves; los avisos conservan prioridad en la mezcla.
const MUSIC_VOLUME = 2
const SFX_VOLUME = 1.5
const VOICE_BUS_VOLUME = 1.4
const listeners = new Set<() => void>()
const audioClips = new Set<Howl>()
let volume = readVolume(VOLUME_KEY, DEFAULT_VOLUME)
let lastVolume = volume > 0 ? volume : readVolume(LAST_VOLUME_KEY, DEFAULT_VOLUME) || DEFAULT_VOLUME
let muted = readMuted() || volume === 0
/** Voces de los agentes: su propio volumen y silencio, además del general. */
let voiceVolume = readVolume(VOICE_VOLUME_KEY, DEFAULT_VOICE_VOLUME)
let voiceMuted = readFlag(VOICE_MUTE_KEY)
let unlocked = false
let musicWanted = false
/** Mientras suena una canción de YouTube, la música ambiental sintetizada calla. */
let ambientSuppressed = false
let context: AudioContext | undefined
let master: GainNode | undefined
let musicBus: GainNode
let sfxBus: GainNode
let voiceBus: GainNode | undefined
let music: ReturnType<typeof createMusic> | undefined
let resumePending: Promise<void> | undefined

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === 'true' } catch { return false }
}

function readMuted(): boolean { return readFlag(MUTE_KEY) }

function readVolume(key: string, fallback: number): number {
  try {
    const stored = localStorage.getItem(key)
    if (stored === null || !stored.trim()) return fallback
    const value = Number(stored)
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback
  } catch { return fallback }
}

export function isMuted(): boolean { return muted }
export function getVolume(): number { return volume }
export function isVoiceMuted(): boolean { return voiceMuted || voiceVolume === 0 }
export function getVoiceVolume(): number { return voiceVolume }

/** Wrapper para archivos de audio; crear tras un gesto y llamar a play() para cargar/reproducir. */
export function createAudioClip(src: string | string[], options: Pick<HowlOptions, 'loop' | 'html5' | 'format'> = {}): Howl {
  const clip = new Howl({
    ...options,
    src: typeof src === 'string' ? [src] : src,
    preload: false,
    autoplay: false,
    volume,
    mute: muted
  })
  audioClips.add(clip)
  return clip
}

/** Libera los recursos del archivo y deja de sincronizar sus preferencias. */
export function releaseAudioClip(clip: Howl): void {
  audioClips.delete(clip)
  clip.unload()
}

export function subscribeAudio(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const subscribeMuted = subscribeAudio

function voiceGain(): number { return isVoiceMuted() ? 0 : VOICE_BUS_VOLUME * voiceVolume }

function applyMasterVolume(): void {
  audioClips.forEach((clip) => {
    clip.volume(volume)
    clip.mute(muted)
  })
  if (!master || !context || context.state === 'closed') return
  const now = context.currentTime
  master.gain.cancelAndHoldAtTime(now)
  master.gain.linearRampToValueAtTime(muted ? 0 : volume, now + 0.04)
  if (voiceBus) {
    voiceBus.gain.cancelAndHoldAtTime(now)
    voiceBus.gain.linearRampToValueAtTime(voiceGain(), now + 0.04)
  }
}

/** También tolera un dispositivo de audio ausente o un resume rechazado por Chromium. */
function ready(): Promise<void> {
  if (!unlocked || muted) return Promise.resolve()
  try {
    if (!context || context.state === 'closed') {
      context = new AudioContext()
      musicBus = context.createGain()
      musicBus.gain.value = MUSIC_VOLUME
      sfxBus = context.createGain()
      sfxBus.gain.value = SFX_VOLUME
      voiceBus = context.createGain()
      voiceBus.gain.value = voiceGain()
      master = context.createGain()
      master.gain.value = 0
      const limiter = context.createDynamicsCompressor()
      limiter.threshold.value = -6
      limiter.knee.value = 6
      limiter.ratio.value = 12
      limiter.attack.value = 0.003
      limiter.release.value = 0.12
      musicBus.connect(master)
      sfxBus.connect(master)
      voiceBus.connect(master)
      master.connect(limiter)
      limiter.connect(context.destination)
      applyMasterVolume()
    }
    if (context.state === 'running') return Promise.resolve()
    if (!resumePending) {
      resumePending = context.resume().catch(() => {}).finally(() => { resumePending = undefined })
    }
    return resumePending
  } catch {
    return Promise.resolve()
  }
}

type Sound = ReturnType<typeof group>

/** Cada grupo posee sus nodos: al silenciar se cancelan incluso las notas futuras. */
function group(ctx: AudioContext, destination: AudioNode) {
  const output = ctx.createGain()
  output.connect(destination)
  const sources = new Set<AudioScheduledSourceNode>()
  const nodes = new Set<AudioNode>([output])
  function track<T extends AudioScheduledSourceNode>(source: T, ownNodes: AudioNode[] = []): T {
    sources.add(source)
    source.onended = () => {
      source.disconnect()
      ownNodes.forEach((node) => node.disconnect())
      sources.delete(source)
      if (sources.size === 0) nodes.forEach((node) => node.disconnect())
    }
    return source
  }
  return {
    output, nodes, track,
    stop() {
      const now = ctx.currentTime
      output.gain.cancelAndHoldAtTime(now)
      output.gain.linearRampToValueAtTime(0, now + 0.02)
      sources.forEach((source) => { source.stop(now + 0.025) })
    }
  }
}

function note(ctx: AudioContext, sound: Sound, frequency: number, when: number, duration: number,
  volume = 0.15, type: OscillatorType = 'sine', endFrequency = frequency): void {
  const envelope = ctx.createGain()
  const osc = sound.track(ctx.createOscillator(), [envelope])
  osc.type = type
  osc.frequency.setValueAtTime(frequency, when)
  osc.frequency.exponentialRampToValueAtTime(endFrequency, when + duration)
  envelope.gain.setValueAtTime(0, when)
  envelope.gain.linearRampToValueAtTime(volume, when + Math.min(0.018, duration / 4))
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration)
  envelope.gain.linearRampToValueAtTime(0, when + duration + 0.01)
  osc.connect(envelope).connect(sound.output)
  osc.start(when)
  osc.stop(when + duration + 0.02)
}

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)
const CHORDS = [
  { root: 45, notes: [57, 60, 64, 67] }, // Am7
  { root: 41, notes: [53, 57, 60, 64] }, // Fmaj7
  { root: 36, notes: [55, 59, 60, 64] }, // Cmaj7
  { root: 43, notes: [55, 59, 62, 64] }  // G6
]
const MUSIC_PENTATONIC = [57, 60, 62, 64, 67]
const MUSIC_PATTERNS = [[0, 2, 1, 3, 2, 1, 3, 2], [0, 1, 3, 2, 1, 3, 2, 1], [2, 0, 1, 2, 3, 1, 2, 0]]

function createMusic(ctx: AudioContext) {
  const sound = group(ctx, musicBus)
  const beat = 60 / 74
  const stepDuration = beat / 2
  const lookahead = 0.3
  const warm = ctx.createBiquadFilter()
  warm.type = 'lowpass'
  warm.frequency.value = 1800
  warm.Q.value = 0.3
  warm.connect(sound.output)

  // Eco de corchea con puntillo, oscuro y de pocas repeticiones.
  const delay = ctx.createDelay(2)
  delay.delayTime.value = beat * 0.75
  const echoFilter = ctx.createBiquadFilter()
  echoFilter.type = 'lowpass'
  echoFilter.frequency.value = 1300
  echoFilter.Q.value = 0.3
  const feedback = ctx.createGain()
  feedback.gain.value = 0.18
  const wet = ctx.createGain()
  wet.gain.value = 0.22
  delay.connect(echoFilter)
  echoFilter.connect(feedback).connect(delay)
  echoFilter.connect(wet).connect(sound.output)

  const hatFilter = ctx.createBiquadFilter()
  hatFilter.type = 'highpass'
  hatFilter.frequency.value = 4500
  hatFilter.Q.value = 0.3
  hatFilter.connect(sound.output)
  const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.06), ctx.sampleRate)
  const samples = noise.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
  ;[warm, delay, echoFilter, feedback, wet, hatFilter].forEach((node) => sound.nodes.add(node))

  // group() desconecta el grafo cuando termina su última fuente. Esta fuente de
  // valor cero conserva el eco entre notas y se cancela con todas ellas al parar.
  const keepAlive = sound.track(ctx.createConstantSource())
  keepAlive.offset.value = 0
  keepAlive.connect(sound.output)
  keepAlive.start()

  function tone(midi: number, when: number, duration: number, volume: number,
    type: OscillatorType = 'sine', attack = 0.012, echo = false): void {
    const envelope = ctx.createGain()
    const osc = sound.track(ctx.createOscillator(), [envelope])
    osc.type = type
    osc.frequency.setValueAtTime(hz(midi), when)
    envelope.gain.setValueAtTime(0, when)
    envelope.gain.linearRampToValueAtTime(volume, when + attack)
    envelope.gain.exponentialRampToValueAtTime(0.00001, when + duration)
    envelope.gain.linearRampToValueAtTime(0, when + duration + 0.02)
    osc.connect(envelope).connect(warm)
    if (echo) envelope.connect(delay)
    osc.start(when)
    osc.stop(when + duration + 0.025)
  }

  function hat(when: number): void {
    const envelope = ctx.createGain()
    const source = sound.track(ctx.createBufferSource(), [envelope])
    source.buffer = noise
    envelope.gain.setValueAtTime(0, when)
    envelope.gain.linearRampToValueAtTime(0.005, when + 0.003)
    envelope.gain.exponentialRampToValueAtTime(0.00001, when + 0.045)
    envelope.gain.linearRampToValueAtTime(0, when + 0.055)
    source.connect(envelope).connect(hatFilter)
    source.start(when)
    source.stop(when + 0.06)
  }

  let step = 0
  let nextTime = ctx.currentTime + 0.05
  let preparedBar = -1
  let voicing = CHORDS[0].notes.slice()
  let pattern = MUSIC_PATTERNS[0]
  let phraseShift = 0
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function scheduleStep(when: number): void {
    const bar = Math.floor(step / 8)
    const position = step % 8
    const section = Math.floor(bar / 4) % 3
    const chord = CHORDS[bar % CHORDS.length]
    if (bar !== preparedBar) {
      preparedBar = bar
      voicing = chord.notes.slice()
      const inversion = Math.floor(Math.random() * 3)
      for (let i = 0; i < inversion; i++) voicing[i] += 12
      voicing.sort((a, b) => a - b)
      pattern = MUSIC_PATTERNS[Math.floor(Math.random() * MUSIC_PATTERNS.length)]
      phraseShift = Math.floor(Math.random() * MUSIC_PENTATONIC.length)
    }

    // Doce compases: base, melodía, textura; un acorde nuevo cada compás.
    if (position === 0) {
      voicing.forEach((pitch, i) => tone(pitch, when + i * 0.012,
        beat * 2.6, 0.008 + Math.random() * 0.002, 'triangle', 0.12))
    }
    if (section === 0 && position === 0) {
      tone(chord.root, when, beat * 3.7, 0.038, 'sine', 0.04)
    } else if (section > 0 && position % 2 === 0 && (position === 0 || Math.random() > 0.15)) {
      const octave = position === 4 && Math.random() < 0.25 ? 12 : 0
      tone(chord.root + octave, when, beat * 0.8, 0.03, 'sine', 0.025)
    }

    // Arpegio espaciado: cambia de dibujo, registro y silencios sin mover el pulso.
    if ((position % 2 === 0 || section === 2) && Math.random() > (section === 2 ? 0.35 : 0.18)) {
      const index = Math.random() < 0.2 ? Math.floor(Math.random() * 4) : pattern[position]
      const pitch = voicing[index] + (Math.random() < 0.12 ? 12 : 0)
      tone(pitch, when, beat * 0.65, 0.018 + Math.random() * 0.006, 'triangle', 0.008, true)
    }
    if (section > 0 && (position === 3 || position === 7) && Math.random() > 0.3) {
      const degree = (phraseShift + pattern[position]) % MUSIC_PENTATONIC.length
      const pitch = MUSIC_PENTATONIC[degree] + (Math.random() < 0.7 ? 12 : 0)
      tone(pitch, when, beat * 0.9, 0.016, 'sine', 0.012, true)
      if (section === 2) tone(pitch + 12, when, beat * 0.35, 0.0025, 'sine', 0.006, true)
    }
    if (section === 2 && (position === 3 || position === 7) && Math.random() > 0.45) hat(when)
  }

  function schedule(): void {
    if (stopped) return
    if (ctx.state === 'closed') { stop(); return }
    if (ctx.state === 'running') {
      const now = ctx.currentTime
      // Un renderer retrasado salta pasos vencidos, nunca los reproduce en ráfaga.
      if (nextTime < now) {
        const skipped = Math.ceil((now - nextTime) / stepDuration)
        step += skipped
        nextTime += skipped * stepDuration
      }
      while (nextTime < now + lookahead) {
        scheduleStep(nextTime)
        step++
        nextTime += stepDuration
      }
    }
    timer = setTimeout(schedule, 50)
  }

  function stop(): void {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    sound.stop()
    // Conserva el grafo durante el fundido; limpia también el eco si el contexto está suspendido.
    setTimeout(() => sound.nodes.forEach((node) => node.disconnect()), 35)
  }
  schedule()
  return { stop }
}

export function startMusic(): void {
  musicWanted = true
  void ready().then(() => {
    if (!muted && musicWanted && !ambientSuppressed && context?.state === 'running' && !music) music = createMusic(context)
  })
}

/** La música de YouTube sustituye a la ambiental mientras suena; al pararla vuelve la ambiental. */
export function setAmbientMusicSuppressed(value: boolean): void {
  if (ambientSuppressed === value) return
  ambientSuppressed = value
  if (value) {
    music?.stop()
    music = undefined
  } else if (musicWanted && !muted) startMusic()
}

export function stopMusic(): void {
  musicWanted = false
  music?.stop()
  music = undefined
}

const PRIORITY: Record<SfxName, number> = { error: 5, taskComplete: 4, projectCreated: 3, taskStart: 3, transfer: 2, fileCreated: 2, message: 1, click: 0 }
const queue: { name: SfxName; at: number }[] = []
const lastPlayed = new Map<SfxName, number>()
let effectTimer: ReturnType<typeof setTimeout> | undefined
let effect: Sound | undefined

function synthesize(ctx: AudioContext, name: SfxName): number {
  const sound = group(ctx, sfxBus)
  effect = sound
  const now = ctx.currentTime + 0.005
  const tone = (frequency: number, delay: number, length: number, volume = 0.15, type: OscillatorType = 'sine', end = frequency): void =>
    note(ctx, sound, frequency, now + delay, length, volume, type, end)
  switch (name) {
    case 'taskStart':
      tone(220, 0, 0.16, 0.13, 'triangle', 330)
      tone(440, 0.12, 0.2)
      return 0.36
    case 'taskComplete':
      ;[523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.12, 0.36))
      return 0.65
    case 'error':
      tone(196, 0, 0.48, 0.19, 'sine', 110)
      tone(146.83, 0.14, 0.36, 0.08, 'triangle', 98)
      return 0.55
    case 'message':
      tone(659.25, 0, 0.17, 0.12)
      tone(523.25, 0.13, 0.25, 0.12)
      return 0.42
    case 'transfer':
      tone(293.66, 0, 0.24, 0.13, 'sine', 587.33)
      tone(587.33, 0.23, 0.25, 0.12, 'sine', 392)
      return 0.52
    case 'fileCreated':
      tone(783.99, 0, 0.09, 0.1, 'triangle')
      tone(1046.5, 0.11, 0.2, 0.09)
      return 0.35
    case 'projectCreated':
      ;[261.63, 329.63, 392, 523.25].forEach((f, i) => tone(f, i * 0.055, 0.58, 0.09))
      return 0.8
    case 'click':
      tone(440, 0, 0.035, 0.07, 'sine', 320)
      return 0.08
  }
}

function drainEffects(): void {
  effectTimer = undefined
  effect = undefined
  if (muted || context?.state !== 'running') { queue.length = 0; return }
  const now = performance.now()
  const next = queue.shift()
  if (!next) return
  if (now - next.at > 2500) { drainEffects(); return }
  lastPlayed.set(next.name, now)
  const duration = synthesize(context, next.name)
  effectTimer = setTimeout(drainEffects, duration * 1000 + 70)
}

/** Una voz de efecto a la vez, ráfagas agrupadas y cola corta con prioridad a fallos/finales. */
export function playSfx(name: SfxName): void {
  if (muted || context?.state !== 'running') return
  const now = performance.now()
  const cooldown = name === 'click' ? 120 : name === 'error' ? 1400 : 650
  if (now - (lastPlayed.get(name) ?? -Infinity) < cooldown || queue.some((item) => item.name === name)) return
  if (name === 'click' && (effectTimer !== undefined || queue.length)) return
  queue.push({ name, at: now })
  queue.sort((a, b) => PRIORITY[b.name] - PRIORITY[a.name] || a.at - b.at)
  queue.splice(4)
  if (effectTimer === undefined) effectTimer = setTimeout(drainEffects, 35)
}

function stopEffects(): void {
  clearTimeout(effectTimer)
  effectTimer = undefined
  queue.length = 0
  lastPlayed.clear()
  effect?.stop()
  effect = undefined
}

// ---------- Voces de los agentes ----------
// Cada agente «habla» con un balbuceo corto (una sílaba por letra, como los aldeanos de Animal Crossing) con su
// propio timbre y tono, por un canal aparte: se silencia o se baja sin tocar la música ni los efectos.

export interface VoiceProfile {
  /** Tono base en Hz. */
  base: number
  wave: OscillatorType
  /** Sílabas por segundo. */
  rate: number
  /** Volumen de cada sílaba (el cuadrado y el diente de sierra son más estridentes). */
  level: number
  /** Cuánto sube o baja la sílaba dentro de su duración (razón de frecuencia). */
  glide: number
}

/** Un tono por proveedor: cada uno se reconoce sin mirar el chat. */
const VOICES: Record<string, VoiceProfile> = {
  hermes: { base: 392, wave: 'triangle', rate: 17, level: 0.1, glide: 1.06 }, // mensajero: claro y ligero
  claude: { base: 311, wave: 'sine', rate: 13, level: 0.13, glide: 1.03 }, // cálido y pausado
  codex: { base: 196, wave: 'square', rate: 19, level: 0.04, glide: 1 }, // robótico y rápido
  gemini: { base: 494, wave: 'sine', rate: 15, level: 0.12, glide: 1.12 }, // brillante, sube al final
  muse: { base: 659, wave: 'triangle', rate: 16, level: 0.09, glide: 1.18 }, // burbujeante y agudo
  qwen: { base: 247, wave: 'sawtooth', rate: 11, level: 0.035, glide: 0.95 }, // grave y lento
  ollama: { base: 233, wave: 'sawtooth', rate: 11, level: 0.035, glide: 0.95 },
  lmstudio: { base: 262, wave: 'sawtooth', rate: 11, level: 0.035, glide: 0.95 }
}

/** Notas (en semitonos sobre el tono base) que recorren las letras: pentatónica, nunca suena desafinado. */
const VOICE_SCALE = [0, 2, 4, 7, 9, 12]
const VOICE_MAX_SYLLABLES = 28
const VOICE_MAX_BACKLOG = 0.9
const voiceBusyUntil = new Map<string, number>()
const activeVoices = new Set<Sound>()

function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Perfil de voz de un agente: el de su proveedor; uno desconocido recibe una propia, siempre la misma. */
export function voiceProfile(provider: string, becario = false): VoiceProfile {
  const waves: OscillatorType[] = ['sine', 'triangle', 'triangle']
  const h = hashString(provider)
  const profile: VoiceProfile = VOICES[provider] ??
    { base: 262 + (h % 300), wave: waves[h % 3], rate: 12 + (h % 6), level: 0.1, glide: 1 + ((h >> 4) % 10) / 100 }
  // El becario habla como su jefe, una quinta más agudo y más deprisa.
  return becario ? { ...profile, base: profile.base * 1.5, rate: profile.rate * 1.2 } : profile
}

/** El texto que suena: sin bloques de código, enlaces ni direcciones. */
function spokenText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
}

/**
 * Balbucea `text` con la voz del agente: una sílaba por letra o cifra (las vocales duran algo más), un hueco
 * corto en cada espacio y uno largo en cada signo de puntuación. Las ráfagas del mismo agente se encadenan.
 * Devuelve cuándo empieza a hablar (ms) y a qué ritmo, para escribir el texto a la vez; null si no suena.
 */
export function playVoice(voiceId: string, profile: VoiceProfile, text: string, options: { error?: boolean; max?: number } = {}): { delayMs: number; rate: number } | null {
  if (muted || isVoiceMuted() || context?.state !== 'running' || !voiceBus) return null
  const letters = spokenText(text).slice(0, 600)
  const max = Math.max(1, Math.min(options.max ?? VOICE_MAX_SYLLABLES, VOICE_MAX_SYLLABLES))
  const ctx = context
  const now = ctx.currentTime
  const busy = voiceBusyUntil.get(voiceId) ?? 0
  if (busy - now > VOICE_MAX_BACKLOG) return null
  let when = Math.max(now + 0.01, busy)
  const startsAt = when
  const step = 1 / profile.rate
  const sound = group(ctx, voiceBus)
  const tone = options.error ? 0.8 : 1
  let syllables = 0
  for (const ch of letters) {
    if (syllables >= max) break
    if (/\s/.test(ch)) { when += step * 0.5; continue }
    if (/[.,;:!?…]/.test(ch)) { when += step * (ch === ',' ? 1 : 1.8); continue }
    if (!/[\p{L}\p{N}]/u.test(ch)) continue
    const lower = ch.toLowerCase()
    const code = lower.codePointAt(0)!
    const vowel = 'aeiouáéíóúü'.includes(lower)
    const semitone = VOICE_SCALE[code % VOICE_SCALE.length]
    const jitter = 1 + (((code * 7919 + syllables * 104729) % 100) - 50) / 3000
    const frequency = profile.base * 2 ** (semitone / 12) * jitter * tone
    const length = (vowel ? 0.9 : 0.6) * step
    note(ctx, sound, frequency, when, length, profile.level * (vowel ? 1 : 0.8), profile.wave, frequency * profile.glide)
    when += step
    syllables++
  }
  if (!syllables) { sound.stop(); return null }
  voiceBusyUntil.set(voiceId, when)
  activeVoices.add(sound)
  setTimeout(() => activeVoices.delete(sound), Math.max(0, (when - now) * 1000) + 200)
  return { delayMs: (startsAt - now) * 1000, rate: profile.rate }
}

function stopVoices(): void {
  activeVoices.forEach((sound) => sound.stop())
  activeVoices.clear()
  voiceBusyUntil.clear()
}

function persistVoice(): void {
  try {
    localStorage.setItem(VOICE_VOLUME_KEY, String(voiceVolume))
    localStorage.setItem(VOICE_MUTE_KEY, String(voiceMuted))
  } catch { /* almacenamiento no disponible */ }
}

function applyVoicePreferences(nextVolume: number, nextMuted: boolean): void {
  voiceVolume = nextVolume
  voiceMuted = nextMuted
  applyMasterVolume()
  if (isVoiceMuted()) stopVoices()
  listeners.forEach((listener) => listener())
}

/** Volumen de las voces de los agentes (0 las silencia). No cambia el de la música y los efectos. */
export function setVoiceVolume(value: number): void {
  if (!Number.isFinite(value)) return
  const next = Math.min(1, Math.max(0, value))
  applyVoicePreferences(next, next === 0 ? voiceMuted : false)
  persistVoice()
}

/** Activa o silencia solo las voces de los agentes. */
export function setVoiceMuted(value: boolean): void {
  applyVoicePreferences(!value && voiceVolume === 0 ? DEFAULT_VOICE_VOLUME : voiceVolume, value)
  persistVoice()
}

function applyPreferences(nextVolume: number, nextMuted: boolean, previousVolume = lastVolume): void {
  volume = nextVolume
  lastVolume = volume > 0 ? volume : previousVolume
  muted = nextMuted || volume === 0
  applyMasterVolume()
  if (muted) {
    stopMusic()
    stopEffects()
    stopVoices()
  } else startMusic()
  listeners.forEach((listener) => listener())
}

function persistPreferences(): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume))
    localStorage.setItem(LAST_VOLUME_KEY, String(lastVolume))
    localStorage.setItem(MUTE_KEY, String(muted))
  } catch { /* almacenamiento no disponible */ }
}

/** El slider reactiva el audio al subir de cero; cero cancela también los avisos pendientes. */
export function setVolume(value: number): void {
  if (!Number.isFinite(value)) return
  applyPreferences(Math.min(1, Math.max(0, value)), false)
  persistPreferences()
}

export function setMuted(value: boolean): void {
  applyPreferences(!value && volume === 0 ? lastVolume : volume, value)
  persistPreferences()
}

/** Montar una vez en App; el cleanup funciona también con StrictMode y HMR. */
export function initAudio(): () => void {
  const gesture = (event: Event): void => {
    if (!event.isTrusted || (event instanceof KeyboardEvent && event.repeat)) return
    unlocked = true
    if (musicWanted && !muted) startMusic()
  }
  const click = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target.closest('button, a[href], [role="button"]') : null
    if (event.isTrusted && target && !target.matches(':disabled, [aria-disabled="true"], [data-audio-toggle], [data-no-click-sound]')) playSfx('click')
  }
  const storage = (event: StorageEvent): void => {
    if (event.key === MUTE_KEY || event.key === VOLUME_KEY || event.key === LAST_VOLUME_KEY || event.key === null) {
      applyPreferences(readVolume(VOLUME_KEY, DEFAULT_VOLUME), readMuted(),
        readVolume(LAST_VOLUME_KEY, DEFAULT_VOLUME) || DEFAULT_VOLUME)
    }
    if (event.key === VOICE_VOLUME_KEY || event.key === VOICE_MUTE_KEY || event.key === null) {
      applyVoicePreferences(readVolume(VOICE_VOLUME_KEY, DEFAULT_VOICE_VOLUME), readFlag(VOICE_MUTE_KEY))
    }
  }
  document.addEventListener('pointerdown', gesture, true)
  document.addEventListener('click', gesture, true)
  document.addEventListener('keydown', gesture, true)
  document.addEventListener('click', click)
  window.addEventListener('storage', storage)
  startMusic()
  return () => {
    document.removeEventListener('pointerdown', gesture, true)
    document.removeEventListener('click', gesture, true)
    document.removeEventListener('keydown', gesture, true)
    document.removeEventListener('click', click)
    window.removeEventListener('storage', storage)
    stopMusic()
    stopEffects()
    stopVoices()
    audioClips.forEach(releaseAudioClip)
  }
}
