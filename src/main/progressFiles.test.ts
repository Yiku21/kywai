import { describe, expect, it } from 'vitest'
import { findNewFiles, imagePathFromTrace, PROGRESS_LIMITS } from './progressFiles'

const T0 = 1_700_000_000_000
const stamp = (mtime: number, size = 50_000): { mtime: number; size: number } => ({ mtime, size })
const run = (
  now: Record<string, { mtime: number; size: number }>,
  baseline: Record<string, { mtime: number; size: number }> = {},
  reported = new Set<string>(),
  counts = { images: 0, docs: 0 },
  at = T0 + 60_000
) => ({ files: findNewFiles(new Map(Object.entries(now)), new Map(Object.entries(baseline)), T0, at, reported, counts), reported, counts })

describe('archivos nuevos mientras una tarea trabaja', () => {
  it('enseña las imágenes y documentos creados desde que empezó y no lo que ya estaba', () => {
    const { files } = run(
      { 'artifacts/capturas/a.png': stamp(T0 + 5_000), 'artifacts/informe.md': stamp(T0 + 8_000, 4_000), 'src/viejo.png': stamp(T0 - 50_000), 'src/main.gd': stamp(T0 + 3_000) },
      { 'src/viejo.png': stamp(T0 - 50_000) }
    )
    expect(files.map((f) => `${f.image ? 'img' : 'doc'}:${f.relPath}`)).toEqual(['img:artifacts/capturas/a.png', 'doc:artifacts/informe.md'])
  })

  it('una imagen que ya estaba y se vuelve a guardar cuenta como nueva', () => {
    const { files } = run({ 'a.png': stamp(T0 + 20_000) }, { 'a.png': stamp(T0 - 1_000) })
    expect(files.map((f) => f.relPath)).toEqual(['a.png'])
  })

  it('espera a que acabe de escribirse y no repite lo ya contado', () => {
    const reported = new Set<string>()
    const counts = { images: 0, docs: 0 }
    // Escrita hace 1 s: todavía puede estar a medias.
    expect(run({ 'a.png': stamp(T0 + 59_000) }, {}, reported, counts).files).toEqual([])
    // Ya terminada: sale una vez.
    expect(run({ 'a.png': stamp(T0 + 59_000) }, {}, reported, counts, T0 + 70_000).files).toHaveLength(1)
    expect(run({ 'a.png': stamp(T0 + 59_000) }, {}, reported, counts, T0 + 90_000).files).toEqual([])
  })

  it('descarta iconos diminutos, datos de la app y lo que no es imagen ni documento', () => {
    const { files } = run({
      'icono.png': stamp(T0 + 5_000, 800),
      'attachments/adjunto.png': stamp(T0 + 5_000),
      '.ai-cowork/encargos/x.md': stamp(T0 + 5_000, 9_000),
      'avances/ab12/01-copia.png': stamp(T0 + 5_000),
      'datos.bin': stamp(T0 + 5_000),
      'bien.jpg': stamp(T0 + 5_000)
    })
    expect(files.map((f) => f.relPath)).toEqual(['bien.jpg'])
  })

  it('no llena el chat de golpe ni pasa del límite de la tarea', () => {
    const many: Record<string, { mtime: number; size: number }> = {}
    for (let i = 0; i < 20; i++) many[`c/${String(i).padStart(2, '0')}.png`] = stamp(T0 + 5_000 + i)
    const counts = { images: 0, docs: 0 }
    const first = run(many, {}, new Set(), counts)
    expect(first.files).toHaveLength(PROGRESS_LIMITS.imagesPerTick)
    // Las que quedaron salen en las vueltas siguientes, hasta el tope por tarea.
    let total = first.files.length
    for (let i = 0; i < 10; i++) total += run(many, {}, first.reported, counts).files.length
    expect(total).toBe(20)
    const capped = { images: PROGRESS_LIMITS.imagesPerTask, docs: 0 }
    expect(run({ 'nueva.png': stamp(T0 + 5_000) }, {}, new Set(), capped).files).toEqual([])
  })
})

describe('imágenes que el agente abre', () => {
  it('la ruta absoluta de una imagen leída o creada, con o sin rango de líneas', () => {
    expect(imagePathFromTrace({ type: 'tool', tool: 'read', title: 'Leyendo hoja.png', body: '/tmp/.tmp/proyecto/capturas/hoja.png' })).toBe('/tmp/.tmp/proyecto/capturas/hoja.png')
    expect(imagePathFromTrace({ type: 'tool', tool: 'write', title: 'Creando a.png', body: 'C:\\Users\\usuario\\a.png\n\n(binario)' })).toBe('C:\\Users\\usuario\\a.png')
    expect(imagePathFromTrace({ type: 'tool', tool: 'read', title: 'Leyendo', body: '/x/y/z.PNG (líneas 1–20)' })).toBe('/x/y/z.PNG')
  })

  it('lo que no es una imagen absoluta de lectura o escritura no cuenta', () => {
    expect(imagePathFromTrace({ type: 'tool', tool: 'read', title: 'x', body: 'artifacts/hoja.png' })).toBeNull()
    expect(imagePathFromTrace({ type: 'tool', tool: 'read', title: 'x', body: '/src/main.gd' })).toBeNull()
    expect(imagePathFromTrace({ type: 'tool', tool: 'command', title: 'x', body: '/tmp/a.png' })).toBeNull()
    expect(imagePathFromTrace({ type: 'text', text: '/tmp/a.png' })).toBeNull()
  })
})
