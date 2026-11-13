// Hojas de cálculo en el panel de vista previa (Excel, OpenDocument, Numbers, CSV): una tabla con las letras de las
// columnas y los números de fila, y abajo una pestaña por hoja, como en Excel. Sin nube: lo lee SheetJS en el equipo.
import { useEffect, useMemo, useState } from 'react'
import { t } from '@/lib/i18n'
import { cx, errorText } from '../../common/util'
import { bookTables, columnName, MAX_COLS, MAX_ROWS, readBook, type SheetTable } from './sheet'
import { useBytes, ViewerBusy, ViewerFail } from './shared'
import s from './viewers.module.css'

type Parsed = { status: 'loading' } | { status: 'ready'; tables: SheetTable[] } | { status: 'error'; message: string }

/** Con `text` (un CSV ya leído) no se vuelve a pedir el archivo; si no, se leen sus bytes desde `url`. */
export default function SheetView({ url, text }: { url?: string; text?: string }) {
  const bytes = useBytes(text == null && url ? url : '')
  const [parsed, setParsed] = useState<Parsed>({ status: 'loading' })
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const data = text ?? (bytes.status === 'ready' ? bytes.data : null)
    if (data == null) {
      if (bytes.status === 'error' && text == null) setParsed({ status: 'error', message: bytes.message })
      return
    }
    let alive = true
    import('xlsx')
      .then((X) => bookTables(X, readBook(X, data)))
      .then(
        (tables) => alive && setParsed({ status: 'ready', tables }),
        (e) => alive && setParsed({ status: 'error', message: t('No parece una hoja de cálculo válida: {error}', { error: errorText(e) }) })
      )
    return () => {
      alive = false
    }
  }, [text, bytes])

  if (parsed.status === 'loading') return <ViewerBusy label={t('Abriendo la hoja de cálculo…')} />
  if (parsed.status === 'error') return <ViewerFail message={parsed.message} />
  const tables = parsed.tables
  const table = tables[Math.min(current, tables.length - 1)]
  return (
    <div className={s.sheet}>
      {table ? <Grid key={table.name} table={table} /> : <div className={s.state}>{t('El libro no tiene hojas.')}</div>}
      {tables.length > 1 && (
        <div className={s.sheetTabs} role="tablist" aria-label={t('Hojas del libro')}>
          {tables.map((tb, i) => (
            <button
              key={tb.name + i}
              type="button"
              role="tab"
              aria-selected={tb === table}
              className={cx(s.sheetTab, tb === table && s.sheetTabOn)}
              onClick={() => setCurrent(i)}
            >
              {tb.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Grid({ table }: { table: SheetTable }) {
  const cols = table.rows[0]?.length ?? 0
  const cut = table.totalRows > MAX_ROWS || table.totalCols > MAX_COLS
  const colgroup = useMemo(
    () => (
      <colgroup>
        <col className={s.rowHeadCol} />
        {Array.from({ length: cols }, (_, c) => (
          <col key={c} style={table.widths[c] ? { width: Math.max(28, Math.min(table.widths[c], 480)) } : undefined} />
        ))}
      </colgroup>
    ),
    [table, cols]
  )
  if (!table.rows.length) return <div className={s.state}>{t('Esta hoja está vacía.')}</div>
  return (
    <div className={s.gridScroll}>
      <table className={s.grid}>
        {colgroup}
        <thead>
          <tr>
            <th className={s.corner} aria-hidden="true" />
            {Array.from({ length: cols }, (_, c) => (
              <th key={c} scope="col">
                {columnName(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              <th scope="row">{r + 1}</th>
              {row.map((cell, c) =>
                cell === null ? null : (
                  <td key={c} className={cell.num ? s.num : undefined} rowSpan={cell.rowSpan} colSpan={cell.colSpan} title={cell.text.length > 40 ? cell.text : undefined}>
                    {cell.text}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {cut && (
        <p className={s.sheetNote}>
          {t('Se ven las primeras {rows} filas y {cols} columnas. Para verla entera, ábrela con la aplicación del equipo.', {
            rows: Math.min(table.totalRows, MAX_ROWS).toLocaleString(),
            cols: Math.min(table.totalCols, MAX_COLS)
          })}
        </p>
      )}
    </div>
  )
}
