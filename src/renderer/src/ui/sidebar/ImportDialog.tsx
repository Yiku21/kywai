import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileArchive, FolderGit2, HardDrive, Import, Server, X } from 'lucide-react'
import type { ArchivePreview, ImportFolder, ImportResult, ImportScan } from '@shared/imports'
import { useCowork } from '@/store/cowork'
import { api, clientBridge } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEscape } from '../common/hooks'
import { cx, errorText } from '../common/util'
import { shortDate } from './sidebarState'
import s from './SearchDialog.module.css'
import h from './HistoryDialog.module.css'
import m from './ImportDialog.module.css'

type Tab = 'local' | 'server' | 'file'

/**
 * Importar de otras apps: las sesiones de Claude Code y Codex que ya hay en el servidor (por carpeta) y las
 * exportaciones de ChatGPT y Claude.ai. Cada sesión pasa a ser una conversación de la barra lateral; las de Claude
 * Code y Codex se siguen con la sesión real del programa. El motor está en src/main/importChats.ts.
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  // En un PC cliente, «En este equipo» es ese PC (lo lee la app de aquí y lo sube) y lo del servidor va aparte.
  const bridge = clientBridge()
  const onClient = !!bridge?.importScan && !!bridge.importSend
  const [tab, setTab] = useState<Tab>('local')
  const [scan, setScan] = useState<ImportScan | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  /** Exportación de Claude.ai leída y a la espera de revisar a qué proyecto va cada conversación. */
  const [review, setReview] = useState<{ paths: string[]; preview: ArchivePreview } | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>({})

  useEscape(!busy, onClose)

  async function rescan(which: Tab = tab): Promise<void> {
    if (!api) return
    setError(null)
    try {
      let r: ImportScan
      if (which === 'local' && onClient) {
        r = await bridge!.importScan!()
        // Lo ya importado lo sabe el servidor.
        const done = new Set(await api.importedIds(r.sources.flatMap((x) => x.folders.flatMap((f) => f.sessions.map((c) => c.id)))))
        r = { sources: r.sources.map((x) => ({ ...x, folders: x.folders.map((f) => ({ ...f, sessions: f.sessions.map((c) => ({ ...c, imported: c.imported || done.has(c.id) })) })) })) }
      } else {
        r = await api.scanImports()
      }
      setScan(r)
      // De entrada, todo lo que aún no se importó.
      setPicked(new Set(r.sources.flatMap((x) => x.folders.flatMap((f) => f.sessions.filter((c) => !c.imported).map((c) => c.id)))))
    } catch (e) {
      setError(errorText(e))
    }
  }

  useEffect(() => {
    if (tab === 'file') return
    setScan(null)
    void rescan(tab)
  }, [tab])

  async function finished(r: ImportResult): Promise<void> {
    setResult(r)
    if (!api) return
    try {
      useCowork.setState({ projects: await api.listProjects() })
    } catch {
      /* la lista se refresca sola al siguiente cambio */
    }
    useCowork.setState((st) => ({ conversationsTick: st.conversationsTick + 1 }))
  }

  async function importPicked(): Promise<void> {
    if (!api || !picked.size) return
    setBusy(true)
    setError(null)
    try {
      if (tab === 'local' && onClient) {
        // Se sube lo elegido de este equipo y el servidor lo importa como una exportación.
        const path = await bridge!.importSend!([...picked])
        await finished(await api.importArchive([path]))
      } else {
        await finished(await api.importLocal([...picked]))
      }
      await rescan()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function importFile(): Promise<void> {
    if (!api) return
    setError(null)
    setResult(null)
    try {
      const paths = await api.pickImportFile()
      if (!paths?.length) return
      setBusy(true)
      const preview = await api.previewArchive(paths)
      // Claude.ai no dice en qué proyecto estaba cada conversación: se enseña lo deducido para revisarlo antes.
      if (preview.kind === 'claude-ai' && preview.conversations.length) {
        setReview({ paths, preview })
        setChoices(Object.fromEntries(preview.conversations.map((c) => [c.id, c.project])))
      } else {
        await finished(await api.importArchive(paths))
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function importReviewed(): Promise<void> {
    if (!api || !review) return
    setBusy(true)
    setError(null)
    try {
      await finished(await api.importArchive(review.paths, choices))
      setReview(null)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (ids: string[], on: boolean): void =>
    setPicked((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const total = useMemo(() => scan?.sources.reduce((n, x) => n + x.folders.reduce((k, f) => k + f.sessions.length, 0), 0) ?? 0, [scan])

  return (
    <div className={s.backdrop} onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className={cx(s.box, h.box, m.box)} role="dialog" aria-modal="true" aria-label={t('Importar de otras apps')}>
        <div className={h.head}>
          <Import size={18} aria-hidden="true" className={s.inputIcon} />
          <h2 className={h.title}>{t('Importar de otras apps')}</h2>
          <button type="button" className={h.close} onClick={onClose} disabled={busy} aria-label={t('Cerrar')}>
            <X size={16} />
          </button>
        </div>
        <p className={m.lead}>
          {onClient
            ? t('Trae tus conversaciones y proyectos para seguirlos aquí. Los originales no se tocan; lo de este equipo se copia a tu servidor.')
            : t('Trae tus conversaciones y proyectos para seguirlos aquí. Los originales no se tocan y nada sale de tu servidor.')}
        </p>
        <div className={m.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'local'} className={cx(m.tab, tab === 'local' && m.tabOn)} onClick={() => setTab('local')}>
            <HardDrive size={14} aria-hidden="true" />
            {t('En este equipo')}
          </button>
          {onClient && (
            <button type="button" role="tab" aria-selected={tab === 'server'} className={cx(m.tab, tab === 'server' && m.tabOn)} onClick={() => setTab('server')}>
              <Server size={14} aria-hidden="true" />
              {t('En el servidor')}
            </button>
          )}
          <button type="button" role="tab" aria-selected={tab === 'file'} className={cx(m.tab, tab === 'file' && m.tabOn)} onClick={() => setTab('file')}>
            <FileArchive size={14} aria-hidden="true" />
            {t('Desde un archivo')}
          </button>
        </div>

        {result && (
          <div className={m.done} role="status">
            <p>
              {result.conversations === 0 && result.reordered
                ? t('Listo: {n} conversaciones ordenadas en su proyecto, sin duplicar.', { n: result.reordered })
                : result.conversations === 0
                ? t('No había nada nuevo que importar.')
                : t('Listo: {n} conversaciones en {p} proyectos.', { n: result.conversations, p: result.projectIds.length })}
              {result.projectsCreated > 0 && ` ${t('{n} proyectos nuevos.', { n: result.projectsCreated })}`}
              {result.documents > 0 && ` ${t('{n} documentos.', { n: result.documents })}`}
              {result.resumable > 0 && ` ${t('{n} se pueden seguir con la sesión real del programa.', { n: result.resumable })}`}
              {result.conversations > 0 && !!result.reordered && ` ${t('{n} ya importadas se ordenaron sin duplicar.', { n: result.reordered })}`}
              {!!result.emptyProjectIds?.length && ` ${t('{n} proyectos vacíos quitados.', { n: result.emptyProjectIds.length })}`}
              {result.skipped > 0 && ` ${t('{n} ya estaban importadas.', { n: result.skipped })}`}
            </p>
            {(result.conversations > 0 || !!result.reordered) && (
              <button type="button" className={m.link} onClick={() => (onClose(), useCowork.setState({ historyOpen: true }))}>
                {t('Verlas en el Historial')}
              </button>
            )}
          </div>
        )}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}

        {tab !== 'file' ? (
          <div className={cx(s.results, m.body)}>
            {!scan ? (
              <p className={s.empty}>{tab === 'server' ? t('Buscando en el servidor…') : t('Buscando en este equipo…')}</p>
            ) : (
              scan.sources.map((src) => {
                const ids = src.folders.flatMap((f) => f.sessions.filter((c) => !c.imported).map((c) => c.id))
                const all = ids.length > 0 && ids.every((id) => picked.has(id))
                const count = src.folders.reduce((k, f) => k + f.sessions.length, 0)
                return (
                  <section key={src.kind} className={m.source}>
                    <label className={m.sourceHead}>
                      <input type="checkbox" checked={all} disabled={!ids.length || busy} onChange={(e) => toggle(ids, e.target.checked)} />
                      <strong>{src.label}</strong>
                      <span className={m.dim}>
                        {count
                          ? t('{n} conversaciones en {f} carpetas', { n: count, f: src.folders.length })
                          : tab === 'server' ? t('No hay nada en el servidor') : t('No hay nada en este equipo')}
                      </span>
                    </label>
                    {!count && <p className={m.where}>{t('Se buscó en {dir}', { dir: src.where })}</p>}
                    {src.folders.map((f) => (
                      <FolderRow
                        key={f.cwd}
                        f={f}
                        picked={picked}
                        busy={busy}
                        open={!!open[`${src.kind}:${f.cwd}`]}
                        onOpen={() => setOpen((o) => ({ ...o, [`${src.kind}:${f.cwd}`]: !o[`${src.kind}:${f.cwd}`] }))}
                        onToggle={toggle}
                      />
                    ))}
                  </section>
                )
              })
            )}
            {scan && (
              <p className={m.hint}>
                {t('¿Buscas tus chats de la app Claude o de Claude.ai? No se guardan en el ordenador, sino en tu cuenta:')}{' '}
                <button type="button" className={m.link} onClick={() => setTab('file')}>
                  {t('tráelos con su exportación')}
                </button>
              </p>
            )}
          </div>
        ) : review ? (
          <ReviewList review={review.preview} choices={choices} busy={busy} onChoose={(id, uuid) => setChoices((c) => ({ ...c, [id]: uuid }))} />
        ) : (
          <div className={cx(s.results, m.body)}>
            <div className={m.howto}>
              <strong>ChatGPT</strong>
              <span>{t('Ajustes → Controles de datos → Exportar datos. Te llega un correo con un zip: elígelo tal cual.')}</span>
            </div>
            <div className={m.howto}>
              <strong>Claude.ai</strong>
              <span>{t('Ajustes → Privacidad → Exportar datos. Te llega un correo con varios zips: elígelos todos a la vez (o al menos conversations-000.zip y projects-000.zip). Sus proyectos se traen con sus instrucciones y documentos.')}</span>
            </div>
            <p className={m.hint}>{t('¿Ya la importaste y quedó desordenada? Elige otra vez los mismos zips: cada conversación se pone en su proyecto, sin duplicar.')}</p>
            <button type="button" className={m.primary} disabled={busy} onClick={() => void importFile()}>
              <FileArchive size={15} aria-hidden="true" />
              {busy ? t('Leyendo…') : t('Elegir los archivos…')}
            </button>
          </div>
        )}

        {tab === 'file' && review && (
          <div className={m.foot}>
            <button type="button" className={m.link} disabled={busy} onClick={() => setReview(null)}>
              {t('Cancelar')}
            </button>
            <button type="button" className={m.primary} disabled={busy} onClick={() => void importReviewed()}>
              {busy ? t('Importando…') : t('Importar {n}', { n: review.preview.conversations.length })}
            </button>
          </div>
        )}

        {tab !== 'file' && (
          <div className={m.foot}>
            <span className={m.dim}>{scan ? t('{n} de {total} elegidas', { n: picked.size, total }) : ''}</span>
            <button type="button" className={m.primary} disabled={busy || !picked.size} onClick={() => void importPicked()}>
              {busy ? t('Importando…') : t('Importar {n}', { n: picked.size })}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function FolderRow({
  f,
  picked,
  busy,
  open,
  onOpen,
  onToggle
}: {
  f: ImportFolder
  picked: Set<string>
  busy: boolean
  open: boolean
  onOpen: () => void
  onToggle: (ids: string[], on: boolean) => void
}) {
  const ids = f.sessions.filter((c) => !c.imported).map((c) => c.id)
  const all = ids.length > 0 && ids.every((id) => picked.has(id))
  const some = ids.some((id) => picked.has(id))
  return (
    <div className={m.folder}>
      <div className={m.folderHead}>
        <input
          type="checkbox"
          checked={all}
          ref={(el) => {
            if (el) el.indeterminate = some && !all
          }}
          disabled={!ids.length || busy}
          onChange={(e) => onToggle(ids, e.target.checked)}
          aria-label={f.name}
        />
        <button type="button" className={m.folderName} onClick={onOpen} aria-expanded={open}>
          {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          <FolderGit2 size={14} aria-hidden="true" />
          <span className={m.name}>{f.name}</span>
          <span className={m.dim}>{f.sessions.length === 1 ? t('1 conversación') : t('{n} conversaciones', { n: f.sessions.length })}</span>
        </button>
        <span className={cx(m.tag, !f.exists && m.tagWarn)} title={f.cwd}>
          {!f.exists ? t('la carpeta ya no existe: solo lectura') : f.projectName ? t('→ {name}', { name: f.projectName }) : t('proyecto nuevo')}
        </span>
      </div>
      {open && (
        <ul className={m.sessions}>
          {f.sessions.map((c) => (
            <li key={c.id}>
              <label className={cx(m.session, c.imported && m.sessionDone)}>
                <input type="checkbox" checked={c.imported || picked.has(c.id)} disabled={c.imported || busy} onChange={(e) => onToggle([c.id], e.target.checked)} />
                <span className={m.name}>{c.title}</span>
                <span className={m.dim}>{c.imported ? t('ya importada') : shortDate(c.updatedAt)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Revisar a qué proyecto va cada conversación de Claude.ai antes de importarla. La exportación no lo dice: kywai lo
 * deduce (nombre del proyecto en el título o el resumen, o que cite sus documentos) y aquí se puede cambiar.
 */
function ReviewList({
  review,
  choices,
  busy,
  onChoose
}: {
  review: ArchivePreview
  choices: Record<string, string>
  busy: boolean
  onChoose: (id: string, uuid: string) => void
}) {
  // Agrupadas por lo deducido al leer (no se recolocan al cambiar una, para no perderla de vista).
  const groups = useMemo(() => {
    const order = [...review.projects.map((p) => p.uuid), '']
    return order
      .map((uuid) => ({ uuid, name: review.projects.find((p) => p.uuid === uuid)?.name ?? '', items: review.conversations.filter((c) => c.project === uuid) }))
      .filter((g) => g.items.length)
  }, [review])
  const guessed = review.conversations.filter((c) => c.project).length
  const again = review.conversations.filter((c) => c.imported).length
  return (
    <div className={cx(s.results, m.body)}>
      <p className={m.lead}>
        {t('La exportación de Claude.ai no dice en qué proyecto estaba cada conversación. kywai lo ha deducido en {k} de {n}; las demás van a «Claude.ai». Cámbialo donde no acierte.', {
          k: guessed,
          n: review.conversations.length
        })}
        {again > 0 && ` ${t('{n} ya estaban importadas: se vuelven a escribir limpias en su proyecto, sin duplicar.', { n: again })}`}
      </p>
      {groups.map((g) => (
        <section key={g.uuid || 'suelta'} className={m.source}>
          <div className={m.sourceHead}>
            <strong>{g.uuid ? g.name : t('Sin proyecto (van a «Claude.ai»)')}</strong>
            <span className={m.dim}>{g.items.length === 1 ? t('1 conversación') : t('{n} conversaciones', { n: g.items.length })}</span>
          </div>
          <ul className={m.reviewList}>
            {g.items.map((c) => (
              <li key={c.id} className={m.session}>
                <span className={m.name} title={c.title}>
                  {c.title}
                </span>
                {c.reason && c.reason !== 'export' && (
                  <span className={m.dim}>{c.reason === 'name' ? t('por el nombre') : t('por sus documentos')}</span>
                )}
                {c.imported && <span className={m.tag}>{t('ya importada')}</span>}
                <select
                  className={m.pick}
                  value={choices[c.id] ?? ''}
                  disabled={busy}
                  onChange={(e) => onChoose(c.id, e.target.value)}
                  aria-label={t('Proyecto de «{title}»', { title: c.title })}
                >
                  {review.projects.map((p) => (
                    <option key={p.uuid} value={p.uuid}>
                      {p.name}
                    </option>
                  ))}
                  <option value="">{t('Sin proyecto')}</option>
                </select>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
