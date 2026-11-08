import { afterEach, describe, expect, it, vi } from 'vitest'
import { noteServerTime, serverNow, serverOffset } from './serverClock'

describe('hora del servidor', () => {
  afterEach(() => {
    noteServerTime(0, 0, 0)
    vi.useRealTimers()
  })

  it('con este equipo una hora por detrás, el tiempo de una tarea se cuenta con la hora del servidor', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    // El servidor respondió con su hora 1 h por delante, a mitad de un viaje de 200 ms.
    noteServerTime(1_000_100 + 3_600_000, 1_000_000, 1_000_200)
    expect(serverOffset()).toBe(3_600_000)
    const startedAt = 1_000_000 + 3_600_000 - 90_000 // empezó hace 90 s según el servidor
    expect(serverNow() - startedAt).toBe(90_000)
  })

  it('las diferencias de menos de 1 s son ruido de la red y no cuentan', () => {
    noteServerTime(5_400, 5_000, 5_000)
    expect(serverOffset()).toBe(0)
    noteServerTime(Number.NaN, 0, 10)
    expect(serverOffset()).toBe(0)
  })
})
