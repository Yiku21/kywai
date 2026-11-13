// OpenDocument (.odt, .odp), RTF, ePub, Pages y Keynote en el panel de vista previa: richdoc.ts los convierte en
// HTML seguro y aquí se pinta como una hoja de papel, dentro de una caja aislada (Shadow DOM).
import { useEffect, useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import { errorText } from '../../common/util'
import { readEpub, readIwork, readOdf, readRtf, type RichDoc } from './richdoc'
import { useBytes, useShadowBox, ViewerBusy, ViewerFail } from './shared'
import s from './viewers.module.css'

export type RichFormat = 'odf' | 'rtf' | 'epub' | 'iwork'

const BOX_CSS = `
:host { display: block; color: #1d2330; }
.doc { box-sizing: border-box; max-width: 820px; margin: 18px auto 32px; padding: 56px 64px; background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,.18), 0 6px 22px rgba(0,0,0,.10);
  font: 15px/1.6 Georgia, 'Liberation Serif', 'Times New Roman', serif; overflow-wrap: break-word; }
@media (max-width: 640px) { .doc { padding: 28px 22px; margin: 10px 8px 20px; } }
.doc p { margin: 0 0 .55em; white-space: pre-wrap; }
.doc h1, .doc h2, .doc h3, .doc h4, .doc h5, .doc h6 { font-family: system-ui, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.25; margin: 1.1em 0 .45em; }
.doc h1 { font-size: 1.9em; } .doc h2 { font-size: 1.5em; } .doc h3 { font-size: 1.25em; }
.doc img { max-width: 100%; height: auto; }
.doc table { border-collapse: collapse; margin: .6em 0 1em; max-width: 100%; }
.doc td, .doc th { border: 1px solid #c8ccd4; padding: 4px 8px; vertical-align: top; }
.doc td p, .doc th p { margin: 0; }
.doc ul { padding-left: 1.4em; margin: .2em 0 .6em; }
.doc a { color: #1a5fd0; }
.doc blockquote { margin: .6em 0; padding-left: 1em; border-left: 3px solid #d0d4dc; color: #4a5160; }
.doc pre { white-space: pre-wrap; font-size: .9em; background: #f4f5f7; padding: 8px 10px; border-radius: 6px; }
.odf-box { margin: .4em 0; }
.book .chapter + .chapter { margin-top: 2.2em; padding-top: 1.6em; border-top: 1px solid #e3e5ea; }
.book-title { text-align: center; margin-top: 0; }
.deck { background: transparent; box-shadow: none; padding: 0; max-width: 880px; font-family: system-ui, 'Segoe UI', Helvetica, Arial, sans-serif; }
.page { position: relative; background: #fff; margin: 0 12px 16px; padding: 28px 36px 24px; border-radius: 6px; min-height: 120px;
  box-shadow: 0 1px 3px rgba(0,0,0,.18), 0 6px 22px rgba(0,0,0,.10); }
.page h2 { margin-top: 0; }
.deck p, .deck span, .deck li { font-size: inherit !important; }
.page { font-size: 17px; }
.page-num { position: absolute; top: 8px; right: 12px; font-size: 12px; color: #8a909c; }
.only { display: block; max-width: calc(100% - 24px); margin: 18px auto; box-shadow: 0 1px 3px rgba(0,0,0,.18), 0 6px 22px rgba(0,0,0,.10); }
`

function build(format: RichFormat, data: ArrayBuffer): RichDoc {
  switch (format) {
    case 'odf':
      return readOdf(data)
    case 'epub':
      return readEpub(data)
    case 'iwork':
      return readIwork(data)
    case 'rtf': {
      // RTF es texto de 7 bits: lo de fuera de ASCII va escapado (\'e9, \u233).
      return readRtf(new TextDecoder('latin1').decode(data))
    }
  }
}

function blobUrl(path: string, data: Uint8Array): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const type = ext === 'pdf' ? 'application/pdf' : ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
  return URL.createObjectURL(new Blob([data as BlobPart], { type }))
}

export default function RichDocView({ url, format }: { url: string; format: RichFormat }) {
  const bytes = useBytes(url)
  const [boxRef, shadow] = useShadowBox()
  const [state, setState] = useState<'busy' | 'done' | { error: string } | { pdf: string }>('busy')
  const urlsRef = useRef<string[]>([])

  useEffect(() => {
    if (bytes.status !== 'ready') return
    const root = shadow()
    if (!root) return
    let doc: RichDoc
    try {
      doc = build(format, bytes.data)
    } catch (e) {
      setState({ error: errorText(e) })
      return
    }
    const urls = new Map<string, string>()
    for (const [path, data] of doc.media) urls.set(path, blobUrl(path, data))
    urlsRef.current = [...urls.values()]
    const style = document.createElement('style')
    style.textContent = BOX_CSS
    if (doc.pdf) {
      root.replaceChildren()
      setState({ pdf: urls.get(doc.pdf)! })
    } else if (doc.preview) {
      const img = document.createElement('img')
      img.className = 'only'
      img.alt = ''
      img.src = urls.get(doc.preview)!
      root.replaceChildren(style, img)
      setState('done')
    } else {
      for (const img of Array.from(doc.body.querySelectorAll<HTMLImageElement>('img[data-media]'))) {
        const u = urls.get(img.dataset.media ?? '')
        if (u) img.src = u
        else img.remove()
      }
      root.replaceChildren(style, doc.body)
      setState('done')
    }
    return () => {
      for (const u of urlsRef.current) URL.revokeObjectURL(u)
      urlsRef.current = []
    }
  }, [bytes, format])

  if (bytes.status === 'error') return <ViewerFail message={bytes.message} />
  if (typeof state === 'object' && 'error' in state) return <ViewerFail message={t('No se pudo leer el documento: {error}', { error: state.error })} />
  if (typeof state === 'object' && 'pdf' in state) return <iframe className={s.pdfFrame} src={state.pdf} title={t('Vista previa')} />
  return (
    <div className={s.paper}>
      {state === 'busy' && <ViewerBusy label={t('Abriendo el documento…')} />}
      <div ref={boxRef} className={s.paperHost} />
    </div>
  )
}
