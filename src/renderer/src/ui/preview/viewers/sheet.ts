// Hojas de cálculo para el panel de vista previa: un libro de Excel, OpenDocument, Numbers o un CSV se convierte en
// tablas sencillas (texto de cada celda ya formateado, celdas combinadas y anchos de columna). Lo lee SheetJS.
import type { CellObject, WorkBook, WorkSheet } from 'xlsx'

/** Más filas o columnas no se pintan (la tabla se haría lentísima); se avisa de cuántas hay. */
export const MAX_ROWS = 2000
export const MAX_COLS = 120

export interface SheetCell {
  text: string
  /** Número (o fecha): va alineado a la derecha, como en Excel. */
  num?: boolean
  rowSpan?: number
  colSpan?: number
}

export interface SheetTable {
  name: string
  /** null: la tapa una celda combinada de arriba o de la izquierda (no se pinta). */
  rows: (SheetCell | null)[][]
  /** Ancho de cada columna en píxeles (o 0 si el archivo no lo dice). */
  widths: number[]
  totalRows: number
  totalCols: number
}

/** Letra de la columna: 0 → A, 25 → Z, 26 → AA. */
export function columnName(i: number): string {
  let n = i + 1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

type Xlsx = typeof import('xlsx')

/** Lee un libro desde sus bytes (xlsx, xls, ods, numbers…) o desde texto (CSV, TSV). */
export function readBook(X: Xlsx, data: ArrayBuffer | string): WorkBook {
  if (typeof data === 'string') {
    // Un CSV se lee tal cual: «007» o «1/2» no se convierten en número ni en fecha.
    return X.read(data, { type: 'string', raw: true, dense: true, sheetRows: MAX_ROWS })
  }
  // cellStyles: para los anchos de columna. cellFormula: para enseñar la fórmula si el archivo no guardó su resultado.
  return X.read(new Uint8Array(data), { type: 'array', dense: true, cellDates: true, cellStyles: true, cellFormula: true, sheetRows: MAX_ROWS })
}

/** Las hojas visibles del libro, listas para pintar. */
export function bookTables(X: Xlsx, wb: WorkBook): SheetTable[] {
  const hidden = new Set((wb.Workbook?.Sheets ?? []).filter((s) => s.Hidden).map((s) => s.name))
  const names = wb.SheetNames.filter((n) => !hidden.has(n))
  return (names.length ? names : wb.SheetNames).map((name) => sheetTable(X, name, wb.Sheets[name]))
}

function cellText(X: Xlsx, c: CellObject | undefined): SheetCell {
  // Una fórmula sin resultado guardado (archivo hecho por un programa que no calcula): se enseña la fórmula.
  if (c?.f && (c.t === 'z' || c.v == null || c.v === '')) return { text: `=${c.f}` }
  if (!c || c.t === 'z' || c.v == null) return { text: '' }
  if (c.t === 'e') return { text: c.w ?? '#ERROR' }
  let text = c.w
  if (text == null) {
    if (c.t === 'd' && c.v instanceof Date) text = c.v.toLocaleDateString()
    else {
      try {
        text = X.utils.format_cell(c)
      } catch {
        text = String(c.v)
      }
    }
  }
  return { text, num: c.t === 'n' || c.t === 'd' }
}

export function sheetTable(X: Xlsx, name: string, ws: WorkSheet | undefined): SheetTable {
  const ref = ws?.['!fullref'] ?? ws?.['!ref']
  if (!ws || !ref) return { name, rows: [], widths: [], totalRows: 0, totalCols: 0 }
  const full = X.utils.decode_range(ref)
  const used = X.utils.decode_range(ws['!ref'] ?? ref)
  // Desde A1, como en Excel (si la primera celda con algo es C4, las filas 1-3 y columnas A-B salen vacías).
  const totalRows = full.e.r + 1
  const totalCols = full.e.c + 1
  const nRows = Math.min(used.e.r + 1, MAX_ROWS)
  const nCols = Math.min(used.e.c + 1, MAX_COLS)
  const dense = (ws as { '!data'?: CellObject[][] })['!data']
  const at = (r: number, c: number): CellObject | undefined => (dense ? dense[r]?.[c] : (ws[X.utils.encode_cell({ r, c })] as CellObject | undefined))

  const rows: (SheetCell | null)[][] = []
  for (let r = 0; r < nRows; r++) {
    const row: (SheetCell | null)[] = []
    for (let c = 0; c < nCols; c++) row.push(cellText(X, at(r, c)))
    rows.push(row)
  }
  for (const m of ws['!merges'] ?? []) {
    if (m.s.r >= nRows || m.s.c >= nCols) continue
    const er = Math.min(m.e.r, nRows - 1)
    const ec = Math.min(m.e.c, nCols - 1)
    for (let r = m.s.r; r <= er; r++) for (let c = m.s.c; c <= ec; c++) rows[r][c] = null
    rows[m.s.r][m.s.c] = { ...cellText(X, at(m.s.r, m.s.c)), rowSpan: er - m.s.r + 1, colSpan: ec - m.s.c + 1 }
  }
  const cols = ws['!cols'] ?? []
  const widths = Array.from({ length: nCols }, (_, c) => {
    const col = cols[c]
    if (!col) return 0
    if (col.hidden) return 0
    if (col.wpx) return Math.round(col.wpx)
    if (col.wch) return Math.round(col.wch * 7 + 10)
    if (col.width) return Math.round(col.width * 7 + 5)
    return 0
  })
  return { name, rows, widths, totalRows, totalCols }
}
