// Documentos que kywai no pinta por sí mismo (.doc, .ppt, Publisher, Visio, WordPerfect, .emf…): el servidor los
// convierte a PDF con LibreOffice, si está instalado (officePreview.ts), y aquí se enseña ese PDF.
import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { PreviewItem } from '@/lib/preview'
import { cx, errorText } from '../../common/util'
import u from '../../common/ui.module.css'
import { ViewerBusy, ViewerFail } from './shared'
import s from './viewers.module.css'

const LIBREOFFICE_URL = 'https://www.libreoffice.org/download/download-libreoffice/'

type State = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'missing' } | { status: 'error'; message: string }

export default function OfficePdfView({ item }: { item: PreviewItem }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    const a = api
    if (!a) return setState({ status: 'error', message: t('Sin motor de agentes: no se puede leer el archivo.') })
    setState({ status: 'loading' })
    a.readArtifact(item.projectId, item.relPath, { pdf: true }).then(
      (r) => alive && setState(r.url ? { status: 'ready', url: r.url } : { status: 'error', message: '' }),
      (e) => {
        if (!alive) return
        const message = errorText(e)
        setState(message.includes('NO_LIBREOFFICE') ? { status: 'missing' } : { status: 'error', message })
      }
    )
    return () => {
      alive = false
    }
  }, [item.projectId, item.relPath])

  if (state.status === 'loading') return <ViewerBusy label={t('Convirtiendo con LibreOffice… (la primera vez tarda unos segundos)')} />
  if (state.status === 'ready') return <iframe className={s.pdfFrame} src={state.url} title={t('Vista previa de {name}', { name: item.name })} />
  if (state.status === 'missing') {
    return (
      <div className={s.state}>
        <span className={s.stateTitle}>{t('Para ver este archivo aquí hace falta LibreOffice')}</span>
        <span className={s.stateText}>
          {t('Es gratis. Con él instalado en el equipo donde corre kywai, los .doc, .ppt y parecidos se ven aquí dentro, sin subir nada a internet. Mientras, puedes abrirlo con la aplicación del equipo.')}
        </span>
        <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => window.open(LIBREOFFICE_URL, '_blank', 'noopener,noreferrer')}>
          <Download size={13} aria-hidden="true" />
          {t('Descargar LibreOffice')}
        </button>
      </div>
    )
  }
  return <ViewerFail message={t('LibreOffice no pudo convertirlo: {error}', { error: state.message })} />
}
