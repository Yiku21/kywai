import { useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './Messages.module.css'

/** Guarda en el dispositivo actual; los grupos se descargan como zip con solo sus entregables. */
export function ArtifactDownloadButton({ projectId, ids, name, onError }: { projectId: string; ids: string[]; name: string; onError?: (error: string | null) => void }) {
  const live = useCowork((st) => st.mode === 'live')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const backend = api
  if (!backend || !live) return null
  const report = onError ?? setError
  const label = ids.length > 1 ? t('Descargar {name} como zip', { name }) : t('Descargar {name}', { name })
  return <>
    <button type="button" className={cx(u.btn, u.btnSm)} disabled={busy} title={label} aria-label={label} onClick={async () => {
      setBusy(true)
      report(null)
      try { await backend.downloadArtifacts(projectId, ids) }
      catch (e) { report(errorText(e)) }
      finally { setBusy(false) }
    }}>
      {busy ? <LoaderCircle size={15} className={u.spin} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
      <span className={s.downloadLabel}>{ids.length > 1 ? t('Descargar como zip') : t('Descargar')}</span>
    </button>
    {error && <p className={s.resumeError} role="alert">{error}</p>}
  </>
}
