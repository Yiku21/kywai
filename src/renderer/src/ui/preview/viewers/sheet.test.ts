import { describe, expect, it } from 'vitest'
import * as X from 'xlsx'
import { bookTables, columnName, readBook, sheetTable } from './sheet'

function book(): ArrayBuffer {
  const ws = X.utils.aoa_to_sheet([
    ['Mes', 'Ingresos', 'Combinada', ''],
    ['Enero', 1000.5, 'x', 'y']
  ])
  ws['!merges'] = [{ s: { r: 0, c: 2 }, e: { r: 0, c: 3 } }]
  ws['!cols'] = [{ wch: 20 }]
  ws.B2.z = '0.00'
  const wb = X.utils.book_new()
  X.utils.book_append_sheet(wb, ws, 'Ventas')
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['oculta']]), 'Secreta')
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['dos']]), 'Notas')
  wb.Workbook = { Sheets: [{ name: 'Ventas' }, { name: 'Secreta', Hidden: 1 }, { name: 'Notas' }] }
  const out = X.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return out
}

describe('hojas de cálculo en la vista previa', () => {
  it('nombra las columnas como Excel', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA'])
  })

  it('lee un libro: hojas visibles, texto formateado, números a la derecha, combinadas y anchos', () => {
    const tables = bookTables(X, readBook(X, book()))
    expect(tables.map((tb) => tb.name)).toEqual(['Ventas', 'Notas'])
    const [ventas] = tables
    expect(ventas.rows[1][1]).toEqual({ text: '1000.50', num: true })
    expect(ventas.rows[0][2]).toMatchObject({ text: 'Combinada', rowSpan: 1, colSpan: 2 })
    expect(ventas.rows[0][3]).toBeNull()
    expect(ventas.widths[0]).toBeGreaterThan(100)
  })

  it('un CSV se lee tal cual (los ceros a la izquierda no se pierden)', () => {
    const [tb] = bookTables(X, readBook(X, 'nombre,código\nAna,007\n'))
    expect(tb.rows[1].map((c) => c?.text)).toEqual(['Ana', '007'])
  })

  it('una fórmula sin resultado guardado se enseña como fórmula', () => {
    const ws: X.WorkSheet = { '!ref': 'A1:A1', A1: { t: 'z', f: 'B2-C2' } as X.CellObject }
    expect(sheetTable(X, 'h', ws).rows[0][0]).toEqual({ text: '=B2-C2' })
  })
})
