// Documentos de Word (.docx, .docm, .dotx) en el panel de vista previa, sin salir de kywai y sin internet: los pinta
// docx-preview (Apache-2.0) con sus páginas, estilos, tablas, imágenes, encabezados y notas al pie.
import { useEffect, useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import { errorText } from '../../common/util'
import { useBytes, useShadowBox, useWidth, ViewerBusy, ViewerFail } from './shared'
import s from './viewers.module.css'

/** Estilos de dentro de la caja: el fondo y el hueco entre páginas, y que la página se encoja si el panel es estrecho. */
const BOX_CSS = `
:host { display: block; }
.docx-wrapper { background: transparent !important; padding: 18px 12px 32px !important; }
.docx-wrapper > section.docx { box-shadow: 0 1px 3px rgba(0,0,0,.18), 0 6px 22px rgba(0,0,0,.10) !important; margin-bottom: 18px !important; }
.docx-wrapper > section.docx:last-child { margin-bottom: 0 !important; }
`

/**
 * Las viñetas de Word van en la letra Symbol o Wingdings con un carácter privado (\uF0B7…), que fuera de Windows sale
 * en blanco: se cambian por el mismo símbolo en Unicode.
 */
const BULLETS: Record<string, string> = { '\uF0B7': '•', '\uF0A7': '▪', '\uF06E': '■', '\uF0D8': '➢', '\uF0FC': '✓', '\uF076': '❖', '\uF0A8': '□' }

export function fixBullets(css: string): string {
  return css.replace(/content: "([^"]*)"([^}]*?)font-family: (?:Symbol|Wingdings);/g, (all, text: string, mid: string) => {
    const fixed = text.replace(/[\uF000-\uF0FF]/g, (c) => BULLETS[c] ?? '•')
    return fixed === text ? all : `content: "${fixed}"${mid}`
  })
}

export default function DocxView({ url }: { url: string }) {
  const bytes = useBytes(url)
  const [boxRef, shadow] = useShadowBox()
  const scrollRef = useRef<HTMLDivElement>(null)
  const width = useWidth(scrollRef)
  const [state, setState] = useState<'idle' | 'busy' | 'done' | { error: string }>('idle')
  const [pageWidth, setPageWidth] = useState(0)

  useEffect(() => {
    if (bytes.status !== 'ready') return
    const root = shadow()
    if (!root) return
    let alive = true
    setState('busy')
    const base = document.createElement('style')
    base.textContent = BOX_CSS
    const styles = document.createElement('div')
    const body = document.createElement('div')
    root.replaceChildren(base, styles, body)
    import('docx-preview')
      .then(({ renderAsync }) =>
        renderAsync(bytes.data, body, styles, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderComments: false,
          // Un trozo de HTML incrustado en el documento iría en un iframe: no se pinta.
          renderAltChunks: false,
          // Imágenes y letras incrustadas como data: (sin direcciones blob: que haya que liberar).
          useBase64URL: true,
          experimental: true
        })
      )
      .then(
        () => {
          if (!alive) return
          for (const st of styles.querySelectorAll('style')) st.textContent = fixBullets(st.textContent ?? '')
          const page = body.querySelector<HTMLElement>('section.docx')
          setPageWidth(page ? page.offsetWidth : 0)
          setState('done')
        },
        (e) => alive && setState({ error: errorText(e) })
      )
    return () => {
      alive = false
    }
  }, [bytes])

  // Página más ancha que el panel: se encoge para que quepa (sin barra de desplazamiento lateral).
  useEffect(() => {
    const wrapper = shadow()?.querySelector<HTMLElement>('.docx-wrapper')
    if (!wrapper || !pageWidth || !width) return
    const zoom = Math.min(1, (width - 24) / pageWidth)
    wrapper.style.setProperty('zoom', zoom < 0.999 ? String(zoom) : '')
  }, [width, pageWidth, state])

  if (bytes.status === 'error') return <ViewerFail message={bytes.message} />
  if (typeof state === 'object') return <ViewerFail message={t('El documento parece dañado o no es un Word moderno (.docx): {error}', { error: state.error })} />
  return (
    <div className={s.paper} ref={scrollRef}>
      {state !== 'done' && <ViewerBusy label={t('Abriendo el documento…')} />}
      <div ref={boxRef} className={s.paperHost} />
    </div>
  )
}
