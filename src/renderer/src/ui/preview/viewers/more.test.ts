import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { listZip, readNotebook } from './more'

describe('zip y cuadernos en la vista previa', () => {
  it('lista un zip como árbol, con las carpetas primero y el tamaño sin comprimir', () => {
    const z = zipSync({ 'b.txt': strToU8('hola'), 'docs/a.md': strToU8('# a'), 'docs/img/x.png': new Uint8Array(10) })
    const r = listZip(z)
    expect(r.entries.map((e) => `${'  '.repeat(e.depth)}${e.name}${e.dir ? '/' : ''}`)).toEqual(['docs/', '  img/', '    x.png', '  a.md', 'b.txt'])
    expect(r).toMatchObject({ files: 3, total: 4 + 3 + 10, cut: false })
  })

  it('lee las celdas de un cuaderno de Jupyter con sus resultados', () => {
    const nb = JSON.stringify({
      cells: [
        { cell_type: 'markdown', source: ['# Hola'] },
        {
          cell_type: 'code',
          execution_count: 3,
          source: ['1+1'],
          outputs: [
            { output_type: 'execute_result', data: { 'text/plain': ['2'] } },
            { output_type: 'display_data', data: { 'image/png': 'iVBO\nRw==' } },
            { output_type: 'error', traceback: ['\u001b[31mError\u001b[0m: mal'] }
          ]
        }
      ]
    })
    const cells = readNotebook(nb)
    expect(cells[0]).toEqual({ kind: 'markdown', source: '# Hola' })
    expect(cells[1]).toEqual({
      kind: 'code',
      source: '1+1',
      count: 3,
      outputs: [{ text: '2' }, { image: 'data:image/png;base64,iVBORw==' }, { text: 'Error: mal', error: true }]
    })
    expect(() => readNotebook('{}')).toThrow()
  })
})
