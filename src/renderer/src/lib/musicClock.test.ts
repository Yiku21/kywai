import { describe, expect, it } from 'vitest'
import {
  addTap,
  beatAtMedia,
  bpmFromTaps,
  MusicClock,
  offsetFromTaps,
  pulseEnvelope,
  SNAP_THRESHOLD_S,
  tempoFromTaps,
  wrapOffset
} from './musicClock'

const play = (mediaTime: number, rate = 1) => ({ mediaTime, playing: true, rate })
const pause = (mediaTime: number) => ({ mediaTime, playing: false, rate: 1 })

describe('MusicClock', () => {
  it('cuenta pulsos a partir del BPM y el desfase', () => {
    const clock = new MusicClock()
    clock.setTempo(120, 0.5)
    clock.sync(play(0.5), 1000)
    expect(clock.beatAt(1000)).toMatchObject({ index: 0, inBar: 0 })
    expect(clock.beatAt(1000)!.phase).toBeCloseTo(0)
    // 120 BPM: un pulso cada 0,5 s.
    const b = clock.beatAt(1000 + 1250)!
    expect(b.index).toBe(2)
    expect(b.phase).toBeCloseTo(0.5)
    expect(clock.beatAt(1000 + 2000)!.inBar).toBe(0)
  })

  it('sin tempo no hay pulso', () => {
    const clock = new MusicClock()
    clock.sync(play(10), 0)
    expect(clock.beatAt(500)).toBeNull()
  })

  it('mantiene un pulso estable entre lecturas (extrapola con el reloj del equipo)', () => {
    const clock = new MusicClock()
    clock.setTempo(100, 0)
    clock.sync(play(30), 0)
    const period = 0.6
    for (let i = 1; i <= 50; i++) {
      const at = i * period * 1000
      // Lecturas exactas: nunca se corrige y cada pulso cae en fase 0.
      expect(clock.correct(play(30 + i * period), at)).toBe('none')
      const phase = clock.beatAt(at)!.phase
      expect(Math.min(phase, 1 - phase)).toBeLessThan(1e-6)
    }
  })

  it('se congela en pausa y retoma desde la posición del reproductor al reanudar', () => {
    const clock = new MusicClock()
    clock.setTempo(120, 0)
    clock.sync(play(10), 0)
    expect(clock.correct(pause(11.1), 1100)).toBe('snap')
    const frozen = clock.beatAt(1100)!
    expect(clock.beatAt(9000)).toEqual(frozen)
    expect(clock.mediaTimeAt(9000)).toBeCloseTo(11.1)
    expect(clock.correct(play(11.1), 20_000)).toBe('snap')
    expect(clock.mediaTimeAt(20_500)).toBeCloseTo(11.6)
    expect(clock.beatAt(20_500)!.index).toBe(23)
  })

  it('resincroniza de golpe al saltar dentro de la pista', () => {
    const clock = new MusicClock()
    clock.setTempo(120, 0)
    clock.sync(play(5), 0)
    // El usuario salta al segundo 60.
    expect(clock.correct(play(60), 1000)).toBe('snap')
    expect(clock.mediaTimeAt(1000)).toBeCloseTo(60)
    // Y hacia atrás.
    expect(clock.correct(play(3), 2000)).toBe('snap')
    expect(clock.mediaTimeAt(2250)).toBeCloseTo(3.25)
  })

  it('un salto en pausa también se aplica', () => {
    const clock = new MusicClock()
    clock.setTempo(90, 0)
    clock.sync(pause(20), 0)
    expect(clock.correct(pause(45.2), 500)).toBe('snap')
    expect(clock.mediaTimeAt(9999)).toBeCloseTo(45.2)
    expect(clock.correct(pause(45.2), 900)).toBe('none')
  })

  it('aplica el cambio de velocidad al momento', () => {
    const clock = new MusicClock()
    clock.setTempo(120, 0)
    clock.sync(play(0), 0)
    expect(clock.correct(play(2, 1.5), 2000)).toBe('snap')
    expect(clock.playbackRate).toBe(1.5)
    // A 1,5x, un segundo real son 1,5 s de pista = 3 pulsos a 120 BPM.
    expect(clock.mediaTimeAt(3000)).toBeCloseTo(3.5)
    expect(clock.beatAt(3000)!.index).toBe(7)
  })

  it('corrige la deriva pequeña poco a poco, sin saltos', () => {
    const clock = new MusicClock()
    clock.setTempo(120, 0)
    clock.sync(play(0), 0)
    // El reproductor va 0,1 s por delante del reloj del equipo.
    let at = 0
    let lastError = 0.1
    for (let i = 1; i <= 12; i++) {
      at += 250
      const actual = at / 1000 + 0.1
      const before = clock.mediaTimeAt(at)
      const kind = clock.correct(play(actual), at)
      const jump = Math.abs(clock.mediaTimeAt(at) - before)
      expect(jump).toBeLessThan(0.1 * 0.3)
      const error = Math.abs(actual - clock.mediaTimeAt(at))
      expect(error).toBeLessThanOrEqual(lastError + 1e-9)
      lastError = error
      if (kind === 'none') break
    }
    expect(lastError).toBeLessThan(0.02)
  })

  it('distingue deriva de salto por el umbral', () => {
    const clock = new MusicClock()
    clock.setTempo(120, 0)
    clock.sync(play(10), 0)
    expect(clock.correct(play(10 + SNAP_THRESHOLD_S * 0.8), 0)).toBe('slew')
    clock.sync(play(10), 0)
    expect(clock.correct(play(10 + SNAP_THRESHOLD_S * 1.5), 0)).toBe('snap')
  })

  it('ignora lecturas repetidas del reproductor mientras suena', () => {
    const clock = new MusicClock()
    clock.setTempo(120, 0)
    clock.sync(play(10), 0)
    // YouTube devuelve la misma posición durante un rato: el reloj sigue avanzando por su cuenta.
    expect(clock.correct(play(10), 200)).toBe('none')
    expect(clock.mediaTimeAt(200)).toBeCloseTo(10.2)
  })

  it('cambiar el BPM o el desfase no pierde la posición', () => {
    const clock = new MusicClock()
    clock.setTempo(120, 0)
    clock.sync(play(10), 0)
    clock.setTempo(60, 0.25)
    expect(clock.mediaTimeAt(1000)).toBeCloseTo(11)
    expect(clock.beatAt(1000)!.phase).toBeCloseTo(0.75)
  })
})

describe('pulso y luces', () => {
  it('el destello acentúa el primer tiempo y se apaga antes del siguiente pulso', () => {
    const down = pulseEnvelope(beatAtMedia(0.04, 120, 0)!)
    const second = pulseEnvelope(beatAtMedia(0.54, 120, 0)!)
    const late = pulseEnvelope(beatAtMedia(0.45, 120, 0)!)
    expect(down).toBeGreaterThan(second)
    expect(late).toBeLessThan(0.05)
    expect(pulseEnvelope(beatAtMedia(0.45, 120, 0)!, true)).toBeGreaterThan(late)
  })

  it('normaliza el desfase dentro de un periodo', () => {
    expect(wrapOffset(1.3, 120)).toBeCloseTo(0.3)
    expect(wrapOffset(-0.1, 120)).toBeCloseTo(0.4)
  })
})

describe('marcar el pulso a mano', () => {
  it('calcula BPM y desfase con toques imprecisos', () => {
    const period = 60 / 128
    const jitter = [0.01, -0.012, 0.008, -0.005, 0.011, -0.009, 0.004, 0]
    let taps: number[] = []
    jitter.forEach((j, i) => { taps = addTap(taps, 12.1 + i * period + j) })
    expect(bpmFromTaps(taps)).toBeGreaterThan(125)
    expect(bpmFromTaps(taps)).toBeLessThan(131)
    const offset = offsetFromTaps(taps, 128)!
    expect(offset).toBeCloseTo(wrapOffset(12.1, 128), 1)
  })

  it('pide al menos cuatro toques y empieza de nuevo tras una espera o un salto atrás', () => {
    expect(bpmFromTaps([1, 1.5, 2])).toBeNull()
    expect(addTap([1, 1.5], 9)).toEqual([9])
    expect(addTap([10, 10.5], 4)).toEqual([4])
    expect(addTap([1], 1.5)).toEqual([1, 1.5])
  })

  it('el desfase con toques es robusto alrededor del cambio de periodo', () => {
    // Toques justo antes y justo después del pulso: la media circular queda en el pulso, no a mitad.
    const offset = offsetFromTaps([0.49, 1.01, 1.49, 2.01], 120)!
    expect(Math.min(offset, 0.5 - offset)).toBeLessThan(0.02)
  })
})

describe('tempoFromTaps', () => {
  it('con un BPM fiable, los toques solo ajustan el desfase', () => {
    expect(tempoFromTaps([10.1, 10.6], 120)).toMatchObject({ bpm: 120, bpmChanged: false })
    expect(tempoFromTaps([10.1, 10.6], 120)!.offset).toBeCloseTo(0.1)
    // Marcar a la mitad de velocidad tampoco cambia el BPM.
    expect(tempoFromTaps([10.1, 11.1, 12.1, 13.1], 120)).toMatchObject({ bpm: 120, bpmChanged: false })
  })

  it('si los toques no cuadran con el BPM, lo sustituyen', () => {
    const taps = [0, 0.6, 1.2, 1.8, 2.4]
    expect(tempoFromTaps(taps, 120)).toMatchObject({ bpm: 100, bpmChanged: true })
    expect(tempoFromTaps(taps, 0)).toMatchObject({ bpm: 100, bpmChanged: true })
    expect(tempoFromTaps([0, 0.6], 0)).toBeNull()
  })
})
