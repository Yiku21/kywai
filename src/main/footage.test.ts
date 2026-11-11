import { describe, expect, it, vi } from 'vitest'

vi.mock('./voice', () => ({ ensureUv: async () => undefined }))
import {
  buildAss,
  captionChunks,
  clipsPrompt,
  editPrompt,
  frameFilter,
  isFiller,
  keptSegments,
  MOTION_H,
  MOTION_W,
  numberedTranscript,
  parseClipsPlan,
  parseEditPlan,
  parseFootageRequest,
  parseWhisperWords,
  rangedTranscript,
  remapWords,
  segmentArgs,
  speakerTrack,
  totalSeconds,
  type Word
} from './footage'

/** Palabras seguidas de 0,3 s con 0,1 s entre ellas (y las pausas que se pidan antes de alguna). */
function words(text: string, pauses: Record<number, number> = {}): Word[] {
  let t = 0
  return text.split(' ').map((w, i) => {
    t += pauses[i] ?? 0
    const s = t
    t += 0.3
    const e = t
    t += 0.1
    return { i, s: Math.round(s * 1000) / 1000, e: Math.round(e * 1000) / 1000, w }
  })
}

describe('/editar y /recortes', () => {
  it('lee la orden y sus marcas', () => {
    expect(parseFootageRequest('/editar')).toEqual({ mode: 'editar', note: '', frame: 'original', look: 'natural', subtitles: true })
    expect(parseFootageRequest('/editar quita lo del café vertical color:cálido sin subtítulos')).toEqual({ mode: 'editar', note: 'quita lo del café', frame: 'vertical', look: 'calido', subtitles: false })
    expect(parseFootageRequest('/recortes')).toMatchObject({ mode: 'recortes', frame: 'vertical', count: 3 })
    expect(parseFootageRequest('/recortes 5 clips los momentos más graciosos cuadrado')).toMatchObject({ mode: 'recortes', note: 'los momentos más graciosos', frame: 'cuadrado', count: 5 })
    expect(parseFootageRequest('/clips 40')).toMatchObject({ count: 8 })
    expect(parseFootageRequest('/editarlo')).toBeNull()
    expect(parseFootageRequest('edita esto')).toBeNull()
  })

  it('reconoce las muletillas, no las palabras de verdad', () => {
    for (const w of ['eh,', 'Ehh', 'mmm…', 'Um.', 'uh', 'ehm', 'hmm']) expect(isFiller(w)).toBe(true)
    for (const w of ['este', 'pues', 'em-', 'me', 'he', 'a', 'huh?']) expect(isFiller(w)).toBe(w === 'em-')
  })

  it('lee las palabras de Whisper con su tiempo', () => {
    const json = JSON.stringify({ segments: [{ words: [{ start: 0, end: 0.3, word: ' Hola' }, { start: 0.3, end: 0.5, word: ' ' }] }, { words: [{ start: 1, end: 1.4, word: ' mundo.' }] }] })
    expect(parseWhisperWords(json)).toEqual([
      { i: 0, s: 0, e: 0.3, w: 'Hola' },
      { i: 1, s: 1, e: 1.4, w: 'mundo.' }
    ])
  })

  it('numera la transcripción para el agente', () => {
    const ws = words('Hola a todos. Hoy toca editar', { 3: 1 })
    expect(numberedTranscript(ws)).toBe('[00:00.0] {0}Hola {1}a {2}todos.\n[00:02.2] {3}Hoy {4}toca {5}editar')
    expect(rangedTranscript(ws)).toBe('#0-#2 [00:00.0] Hola a todos.\n#3-#5 [00:02.2] Hoy toca editar')
  })

  it('quita lo cortado, las muletillas y las pausas largas, sin pisar lo quitado', () => {
    // «Hola eh hoy os enseño perdón hoy os enseño a editar» con una pausa de 2 s antes de «a».
    const ws = words('Hola eh hoy os enseño perdón hoy os enseño a editar', { 9: 2 })
    const segs = keptSegments(ws, new Set([2, 3, 4, 5]))
    expect(segs.map((s) => s.words.map((w) => w.w).join(' '))).toEqual(['Hola', 'hoy os enseño', 'a editar'])
    // El margen no entra en la muletilla ni en lo cortado.
    expect(segs[0].b).toBeLessThanOrEqual(ws[1].s)
    expect(segs[1].a).toBeGreaterThanOrEqual(ws[5].e)
    // La pausa de 2 s se queda en un respiro corto.
    const out = remapWords(segs)
    expect(out.find((w) => w.w === 'a')!.s - out.find((w) => w.w === 'enseño')!.e).toBeLessThan(0.5)
    expect(totalSeconds(segs)).toBeLessThan(ws[ws.length - 1].e - 2)
  })

  it('un clip usa solo sus palabras', () => {
    const ws = words('uno dos tres cuatro cinco seis')
    const segs = keptSegments(ws.slice(2, 5), new Set(), ws)
    expect(segs).toHaveLength(1)
    expect(segs[0].words.map((w) => w.w)).toEqual(['tres', 'cuatro', 'cinco'])
    expect(segs[0].a).toBeGreaterThanOrEqual((ws[1].e + ws[2].s) / 2)
    expect(segs[0].b).toBeLessThanOrEqual((ws[4].e + ws[5].s) / 2)
  })

  it('lee la edición del agente y no deja quitarlo todo', () => {
    const plan = parseEditPlan('Aquí va:\n```json\n{"title": "Instalar kywai", "cut": [[2, 4], [9, 8], ["x", 1]], "x": 1.4}\n```', 20)
    expect(plan.title).toBe('Instalar kywai')
    expect([...plan.cut].sort((a, b) => a - b)).toEqual([2, 3, 4, 8, 9])
    expect(plan.x).toBe(1)
    expect(() => parseEditPlan('{"cut": [[0, 18]]}', 20)).toThrow(/casi todo/)
    expect(() => parseEditPlan('nada', 20)).toThrow()
  })

  it('lee los clips: dentro del vídeo, de 5 a 120 s y sin pisarse', () => {
    const ws = Array.from({ length: 400 }, (_, i) => ({ i, s: i * 0.5, e: i * 0.5 + 0.4, w: `p${i}` }))
    const clips = parseClipsPlan(
      JSON.stringify({ clips: [
        { title: 'El mejor', from: 10, to: 60, why: 'engancha' },
        { title: 'Pisa al primero', from: 50, to: 90 },
        { title: 'Muy corto', from: 100, to: 103 },
        { title: 'Al revés', from: 200, to: 150, x: 0.3 },
        { title: 'Sobra', from: 300, to: 340 }
      ] }),
      ws,
      2
    )
    expect(clips.map((c) => [c.title, c.from, c.to])).toEqual([['El mejor', 10, 60], ['Al revés', 150, 200]])
    expect(clips[1].x).toBe(0.3)
    expect(() => parseClipsPlan('{"clips": []}', ws, 3)).toThrow(/ningún clip/)
  })

  it('los encargos llevan la transcripción y piden solo el JSON', () => {
    const e = editPrompt({ note: 'quita lo del café', name: 'toma.mp4', seconds: 90, transcript: '{0}hola', frames: ['/f1.jpg'], reframe: true })
    expect(e).toContain('quita lo del café')
    expect(e).toContain('{0}hola')
    expect(e).toContain('"x": 0.5')
    expect(e).toContain('/f1.jpg')
    expect(editPrompt({ note: '', name: 'a', seconds: 1, transcript: 'x', frames: [], reframe: false })).not.toContain('"x"')
    const c = clipsPrompt({ note: '', name: 'charla.mp4', seconds: 3600, count: 4, transcript: '#0-#5 hola', frames: [], reframe: true })
    expect(c).toContain('los 4 mejores momentos')
    expect(c).toContain('(60 min)')
    expect(c).toContain('Responde SOLO con este JSON')
  })

  it('subtítulos: grupos cortos, la palabra que suena en amarillo y el título arriba', () => {
    const ws = words('hola a todos, hoy os enseño algo')
    expect(captionChunks(ws).map((c) => c.map((w) => w.w).join(' '))).toEqual(['hola a todos,', 'hoy os enseño', 'algo'])
    const ass = buildAss(ws, { w: 1080, h: 1920 }, 'Mi {clip}')
    expect(ass).toContain('PlayResY: 1920')
    expect(ass).toContain('Title,,0,0,0,,{\\fad(150,250)}MI CLIP')
    expect(ass).toContain('{\\c&H0000D7FF&}HOLA{\\c&H00FFFFFF&} A TODOS,')
    expect(ass.match(/^Dialogue: 0,/gm)).toHaveLength(7)
  })

  it('encuentra a quien habla por el movimiento y salta cuando habla el otro', () => {
    const fps = 4
    const secs = 12
    const frame = (k: number): Uint8Array => {
      const f = new Uint8Array(MOTION_W * MOTION_H).fill(60)
      // Hasta el segundo 6 se mueve la franja de la izquierda (columnas 10-20); después, la de la derecha (70-80).
      const [a, b] = k / fps < 6 ? [10, 20] : [70, 80]
      const v = k % 2 ? 200 : 60
      for (let r = 10; r < 40; r++) for (let c = a; c < b; c++) f[r * MOTION_W + c] = v
      return f
    }
    const raw = new Uint8Array(MOTION_W * MOTION_H * fps * secs)
    for (let k = 0; k < fps * secs; k++) raw.set(frame(k), k * MOTION_W * MOTION_H)
    const track = speakerTrack(raw, 0.32)
    expect(track[0].t).toBe(0)
    expect(track[0].x).toBeCloseTo(15 / MOTION_W, 1)
    expect(track).toHaveLength(2)
    expect(track[1].t).toBeGreaterThanOrEqual(5)
    expect(track[1].t).toBeLessThanOrEqual(6)
    expect(track[1].x).toBeCloseTo(75 / MOTION_W, 1)
    // Sin movimiento no hay nadie a quien seguir.
    expect(speakerTrack(new Uint8Array(MOTION_W * MOTION_H * 20).fill(80), 0.32)).toEqual([])
  })

  it('encuadra: recorte que sigue a quien habla, o encajado sobre la imagen desenfocada', () => {
    const wide = { w: 1920, h: 1080 }
    const f = frameFilter('vertical', wide, [{ t: 0, x: 0.25 }, { t: 7, x: 0.75 }])
    expect(f).toBe(`crop=w=606:h=1080:x='if(lt(t,7),177,1137)':y=0,scale=1080:1920,setsar=1`)
    expect(frameFilter('vertical', wide, [], 0)).toContain(`x='0'`)
    expect(frameFilter('horizontal', { w: 1080, h: 1920 }, [])).toContain('gblur')
    expect(frameFilter('original', { w: 3840, h: 2160 }, [])).toBe('scale=1920:1080')
    expect(frameFilter('vertical', { w: 1080, h: 1920 }, [])).toBe('scale=1080:1920,setsar=1')
  })

  it('cada tramo lleva su fundido de 30 ms', () => {
    const args = segmentArgs('/v.mp4', { a: 1.5, b: 3.5 }, 30, '/t.mkv')
    expect(args).toContain('afade=t=in:st=0:d=0.03,afade=t=out:st=1.970:d=0.03')
    expect(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 2)).toEqual(['-ss', '1.500'])
  })
})
