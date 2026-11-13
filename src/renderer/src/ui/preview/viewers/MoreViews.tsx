// Otros visores pequeños del panel de vista previa: lo que hay dentro de un .zip, una letra (.ttf, .otf, .woff) con
// texto de muestra y un cuaderno de Jupyter (.ipynb) con sus celdas y resultados.
import { useEffect, useMemo, useState } from 'react'
import { Folder, FileIcon } from 'lucide-react'
import { fileSize } from '@/lib/format'
import { t } from '@/lib/i18n'
import { MarkdownView } from '../../common/MarkdownView'
import { errorText } from '../../common/util'
import { useBytes, ViewerBusy, ViewerFail } from './shared'
import { listZip, readNotebook, type NotebookCell } from './more'
import s from './viewers.module.css'

// ---------------------------------------------------------------- Zip

export function ArchiveView({ url }: { url: string }) {
  const bytes = useBytes(url)
  const list = useMemo(() => {
    if (bytes.status !== 'ready') return null
    try {
      return listZip(bytes.data)
    } catch (e) {
      return { error: errorText(e) }
    }
  }, [bytes])
  if (bytes.status === 'error') return <ViewerFail message={bytes.message} />
  if (!list) return <ViewerBusy label={t('Leyendo el archivo comprimido…')} />
  if ('error' in list) return <ViewerFail message={t('No parece un .zip válido: {error}', { error: list.error })} />
  return (
    <div className={s.listScroll}>
      <p className={s.listSummary}>
        {t('{files} archivos · {size} sin comprimir', { files: list.files.toLocaleString(), size: fileSize(list.total) })}
      </p>
      <ul className={s.zipList}>
        {list.entries.map((e) => (
          <li key={e.path} style={{ paddingLeft: 12 + e.depth * 16 }}>
            {e.dir ? <Folder size={14} aria-hidden="true" /> : <FileIcon size={14} aria-hidden="true" />}
            <span className={s.zipName}>{e.name}</span>
            {!e.dir && <span className={s.zipSize}>{fileSize(e.size)}</span>}
          </li>
        ))}
      </ul>
      {list.cut && <p className={s.sheetNote}>{t('Se ven los primeros {n} elementos.', { n: list.entries.length.toLocaleString() })}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- Letras

const PANGRAM = 'El veloz murciélago hindú comía feliz cardillo y kiwi.'

export function FontView({ url, name }: { url: string; name: string }) {
  const bytes = useBytes(url)
  const [family, setFamily] = useState<string | { error: string } | null>(null)
  useEffect(() => {
    if (bytes.status !== 'ready') return
    const fam = `kywai-preview-${Math.random().toString(36).slice(2)}`
    const face = new FontFace(fam, bytes.data)
    let alive = true
    face.load().then(
      () => {
        if (!alive) return
        document.fonts.add(face)
        setFamily(fam)
      },
      (e) => alive && setFamily({ error: errorText(e) })
    )
    return () => {
      alive = false
      document.fonts.delete(face)
    }
  }, [bytes])
  if (bytes.status === 'error') return <ViewerFail message={bytes.message} />
  if (family && typeof family === 'object') return <ViewerFail message={t('No se pudo cargar la letra: {error}', { error: family.error })} />
  if (!family) return <ViewerBusy />
  const font = { fontFamily: `"${family}"` }
  return (
    <div className={s.fontScroll}>
      <p className={s.fontName} style={font}>
        {name.replace(/\.[^.]+$/, '')}
      </p>
      <p className={s.fontSample} style={{ ...font, fontSize: 15 }}>
        ABCDEFGHIJKLMNÑOPQRSTUVWXYZ
        <br />
        abcdefghijklmnñopqrstuvwxyz
        <br />
        0123456789 ¿?¡!&@€$%()[]
      </p>
      {[14, 18, 24, 32, 48, 64].map((size) => (
        <p key={size} className={s.fontSample} style={{ ...font, fontSize: size }}>
          <span className={s.fontSize}>{size}</span>
          {PANGRAM}
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Jupyter

export function NotebookView({ text }: { text: string }) {
  const cells = useMemo(() => {
    try {
      return readNotebook(text)
    } catch (e) {
      return { error: errorText(e) }
    }
  }, [text])
  if ('error' in cells) return <ViewerFail message={t('No parece un cuaderno de Jupyter válido: {error}', { error: cells.error })} />
  return (
    <div className={s.notebook}>
      {cells.map((c, i) => (
        <Cell key={i} cell={c} />
      ))}
    </div>
  )
}

function Cell({ cell }: { cell: NotebookCell }) {
  if (cell.kind === 'markdown') return <MarkdownView text={cell.source} className={s.nbMarkdown} />
  return (
    <div className={s.nbCode}>
      <div className={s.nbIn}>
        <span className={s.nbCount}>[{cell.count ?? ' '}]</span>
        <pre>{cell.source}</pre>
      </div>
      {cell.outputs.map((o, i) =>
        o.image ? (
          <img key={i} className={s.nbImage} src={o.image} alt="" />
        ) : (
          <pre key={i} className={o.error ? s.nbError : s.nbOut}>
            {o.text}
          </pre>
        )
      )}
    </div>
  )
}
