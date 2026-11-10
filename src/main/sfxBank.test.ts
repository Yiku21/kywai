import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { EARSHOT_SOUNDS, ensureSfxBank, loadSfxBank, readWav16, sfxBankSummary, type SfxBankDeps } from './sfxBank'
import { mixSfx, synthSfx } from './videoScript'

/** Un WAV mono de 16 bits con un tono corto (lo que deja ffmpeg en el banco). */
function wav(samples: number[], rate = 44100): Buffer {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((v, i) => data.writeInt16LE(Math.round(v * 32767), i * 2))
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}
const tone = wav(Array.from({ length: 400 }, (_, i) => 0.5 * Math.sin(i / 3)))

/** earshot y ffmpeg de mentira: «render» y la conversión dejan un WAV en la ruta de salida. */
function fakeDeps(over: Partial<SfxBankDeps> = {}): SfxBankDeps & { calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    earshot: '/x/earshot',
    run: async (cmd, args) => {
      calls.push([cmd, ...args])
      const out = cmd === 'ffmpeg' ? args[args.length - 1] : args[args.indexOf('-o') + 1]
      writeFileSync(out, tone)
      return { code: 0, out: '' }
    },
    fetch: (async () => {
      throw new Error('sin red')
    }) as unknown as typeof fetch,
    ...over
  }
}

describe('banco de efectos de sonido', () => {
  it('con earshot hace todos sus sonidos y deja el boing para Openverse o el sintetizado', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sfx-'))
    const deps = fakeDeps()
    const sounds = await ensureSfxBank(dir, deps)
    const expected = Object.values(EARSHOT_SOUNDS).flat().length
    expect(sounds.filter((s) => s.source === 'earshot')).toHaveLength(expected)
    expect(sounds.some((s) => s.kind === 'boing')).toBe(false)
    const renders = deps.calls.filter((c) => c[0] === '/x/earshot')
    expect(renders.find((c) => c.includes('whoosh_fast/crisp'))).toEqual(expect.arrayContaining(['--dur', '0.6', '--apex', '0.22']))
    expect(sfxBankSummary(dir)).toEqual({ earshot: expected, openverse: 0 })
    const bank = loadSfxBank(dir)
    expect(bank.whoosh).toHaveLength(EARSHOT_SOUNDS.whoosh.length)
    expect(bank.boing).toBeUndefined()
  })

  it('la segunda vez no rehace nada, y lo que falló no se repite hasta el día siguiente', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sfx-'))
    await ensureSfxBank(dir, fakeDeps({ now: 1000 }))
    const again = fakeDeps({ now: 2000 })
    await ensureSfxBank(dir, again)
    expect(again.calls).toHaveLength(0)
    const tried = JSON.parse(readFileSync(join(dir, 'fuentes.json'), 'utf8')).tried
    expect(tried.boing).toBe(1000)
    let asked = 0
    const nextDay = fakeDeps({
      now: 1000 + 25 * 3600_000,
      fetch: (async () => {
        asked++
        return new Response(JSON.stringify({ results: [] }))
      }) as unknown as typeof fetch
    })
    await ensureSfxBank(dir, nextDay)
    expect(asked).toBe(1)
  })

  it('sin earshot usa Openverse, solo CC0 y cortos, y earshot los sustituye cuando llega', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sfx-'))
    const urls: string[] = []
    const fetchFake = (async (url: string) => {
      urls.push(url)
      if (url.startsWith('https://api.openverse.org')) {
        return new Response(
          JSON.stringify({
            results: [
              { id: 'a', url: 'https://cdn.example/a.mp3', license: 'cc0', duration: 500, title: 'A', creator: 'x', foreign_landing_url: 'https://f/a' },
              { id: 'b', url: 'https://cdn.example/b.mp3', license: 'by', duration: 500 },
              { id: 'c', url: 'https://cdn.example/c.mp3', license: 'cc0', duration: 60_000 }
            ]
          })
        )
      }
      return new Response(new Uint8Array([1, 2, 3]))
    }) as unknown as typeof fetch
    const sounds = await ensureSfxBank(dir, fakeDeps({ earshot: null, fetch: fetchFake }))
    expect(urls.some((u) => u.includes('license=cc0'))).toBe(true)
    expect(urls).not.toContain('https://cdn.example/b.mp3')
    expect(urls).not.toContain('https://cdn.example/c.mp3')
    expect(sounds.every((s) => s.source === 'openverse' && s.license === 'CC0')).toBe(true)
    expect(new Set(sounds.map((s) => s.kind))).toEqual(new Set(['boing', 'whoosh', 'pop', 'impact']))
    const later = await ensureSfxBank(dir, fakeDeps({ fetch: fetchFake }))
    expect(later.filter((s) => s.kind === 'whoosh').every((s) => s.source === 'earshot')).toBe(true)
    expect(later.find((s) => s.kind === 'boing')?.source).toBe('openverse')
  })

  it('lee WAV de 16 bits normalizados a pico 1', () => {
    const w = readWav16(wav([0, 0.25, -0.5]))
    expect(w?.sampleRate).toBe(44100)
    expect(Array.from(w?.samples ?? []).map((v) => Math.round(v * 100) / 100)).toEqual([0, 0.5, -1])
    expect(readWav16(Buffer.from('no es un wav'))).toBeNull()
  })

  it('la mezcla usa el banco y sintetiza lo que no está; sin banco es igual que antes', () => {
    const ev = [
      { at: 0.1, kind: 'whoosh' as const },
      { at: 0.5, kind: 'boing' as const }
    ]
    const take = new Float32Array(100).fill(1)
    const withBank = mixSfx(ev, 1, { whoosh: [take] }, 8000)
    expect(withBank.length).toBe(44 + 8000 * 2)
    expect(withBank.equals(synthSfx(ev, 1, 8000))).toBe(false)
    expect(mixSfx(ev, 1, {}, 8000).equals(synthSfx(ev, 1, 8000))).toBe(true)
  })
})
