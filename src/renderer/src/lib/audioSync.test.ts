import { describe, expect, it } from 'vitest'
import { BeatDetector, estimatePeriod } from './audioSync'

/** Graves sintéticos a 60 medidas por segundo: un bombo cada `beatMs` (subida brusca que se apaga) y algo de ruido. */
function kicks(beatMs: number, seconds: number, seed = 1): { t: number; e: number }[] {
  let r = seed
  const noise = (): number => {
    r = (r * 9301 + 49297) % 233280
    return r / 233280
  }
  const out: { t: number; e: number }[] = []
  for (let t = 0; t < seconds * 1000; t += 1000 / 60) {
    const since = t % beatMs
    const kick = Math.exp(-since / 60)
    out.push({ t, e: 0.05 + 0.6 * kick + 0.03 * noise() })
  }
  return out
}

describe('detector de golpes', () => {
  it('encuentra cada bombo de una canción a 120 BPM (uno cada 500 ms) y nada más', () => {
    const d = new BeatDetector()
    const beats = kicks(500, 10)
      .filter(({ t, e }) => d.push(e, t))
      .map(({ t }) => t)
    const after = beats.filter((t) => t > 1000) // el primer segundo aprende el nivel
    expect(after.length).toBeGreaterThanOrEqual(17)
    expect(after.length).toBeLessThanOrEqual(18)
    for (const t of after) expect(t % 500).toBeLessThan(40) // cae en el golpe
  })

  it('también a 174 BPM (drum and bass) sin perder golpes', () => {
    const d = new BeatDetector()
    const period = 60_000 / 174
    const beats = kicks(period, 10).filter(({ t, e }) => d.push(e, t) && t > 1000)
    expect(beats.length).toBeGreaterThanOrEqual(Math.floor((9000 / period) * 0.9))
  })

  it('con bajo entre bombos (como Around the World) saca el pulso de 120 y solo el bombo enciende la luz entera', () => {
    const d = new BeatDetector()
    let r = 7
    const noise = (): number => ((r = (r * 9301 + 49297) % 233280), r / 233280)
    const strong: number[] = []
    const weak: number[] = []
    for (let t = 0; t < 12_000; t += 1000 / 60) {
      const kick = Math.exp(-(t % 500) / 60)
      const bass = Math.exp(-((t + 250) % 500) / 60) * 0.45
      if (d.push(0.05 + 0.6 * kick + bass + 0.03 * noise(), t) && t > 6000) {
        ;(d.level(t + 1, false) > 0.6 ? strong : weak).push(t)
      }
    }
    expect(Math.round(60_000 / d.period)).toBeGreaterThanOrEqual(115)
    expect(Math.round(60_000 / d.period)).toBeLessThanOrEqual(125)
    expect(strong.length).toBeGreaterThanOrEqual(10)
    for (const t of strong) expect(Math.min(t % 500, 500 - (t % 500))).toBeLessThan(60) // en el bombo
    for (const t of weak) expect(Math.abs((t % 500) - 250)).toBeLessThan(60) // las notas de en medio
  })

  it('el pulso: la separación que más se repite, con preferencia por los tempos habituales', () => {
    const grid = (period: number, n: number, from = 0): number[] => Array.from({ length: n }, (_, i) => from + i * period)
    expect(Math.round(estimatePeriod(grid(500, 16)))).toBe(500)
    // 174 BPM: vale el pulso o la mitad (87, «half-time», como se baila el drum and bass); las dos caen en el golpe.
    const dnb = estimatePeriod(grid(345, 20))
    expect(Math.min(Math.abs(dnb - 345), Math.abs(dnb - 690))).toBeLessThan(15)
    // Corcheas (cada 250 ms): el pulso es la negra, 500 ms.
    expect(Math.round(estimatePeriod(grid(250, 30)))).toBe(500)
    expect(estimatePeriod([0, 100])).toBe(0)
  })

  it('la luz salta en el golpe y se apaga en unas décimas; en silencio se queda a oscuras', () => {
    const d = new BeatDetector()
    let last = 0
    for (const { t, e } of kicks(500, 3)) {
      if (d.push(e, t)) last = t
    }
    expect(d.level(last + 10, false)).toBeGreaterThan(0.6)
    expect(d.level(last + 400, false)).toBeLessThan(0.3)
    expect(d.level(last + 10, true)).toBeLessThan(d.level(last + 10, false))
    const quiet = new BeatDetector()
    for (let t = 0; t < 3000; t += 16) quiet.push(0, t)
    expect(quiet.level(3000, false)).toBe(0)
  })
})
