import { useId, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Folder, FolderOpen, Package } from 'lucide-react'
import type { Artifact, InboxItem } from '@shared/types'
import { groupResults, type ResultGroup } from '@shared/resultGroups'
import { fromArtifact } from '@/lib/preview'
import m from './Messages.module.css'
import { needsYou } from '@shared/inbox'
import { api } from '@/lib/api'
import { ago } from '../header/InboxButton'
import b from '../header/InboxButton.module.css'
import { cx } from '../common/util'
import { useCowork, useData } from '@/store/cowork'
import { useAgentLookup } from '../common/agents'
import { artifactLabel, KindTile } from '../common/icons'
import { countTypes, fileTypeOf } from '@shared/fileTypes'
import { effectiveChoice, TypeFilter, useTypeChoice } from './TypeFilter'
import { agentVars, plural, shortTime } from '../common/util'
import u from '../common/ui.module.css'
import s from './Views.module.css'
import { t } from '@/lib/i18n'
import { useFileMenu } from './FileMenu'
import { ArtifactDownloadButton } from './ArtifactDownloadButton'

/** Los avisos de «Terminado» que aún no has visto (de cualquier proyecto): no esperan nada de ti. */
export function useFinished(): InboxItem[] {
  const inbox = useCowork((st) => st.inbox)
  return useMemo(() => inbox.filter((i) => !needsYou(i)), [inbox])
}

/**
 * «Recién terminado»: lo que el equipo acabó y aún no has visto, encima de los resultados. Antes salía en
 * «Te necesita», pero no espera nada de ti; el móvil sigue avisando al terminar.
 */
function Finished() {
  const items = useFinished()
  const project = useCowork((st) => st.live.project)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  if (!api || !items.length) return null

  async function seen(list: InboxItem[]): Promise<void> {
    if (!api || busy) return
    setBusy(true)
    setNote(null)
    try {
      for (const i of list) await api.actInbox(i.id, i.actions.find((a) => a.id === 'dismiss')?.id ?? i.actions[0]?.id ?? 'dismiss')
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function goTo(item: InboxItem): Promise<void> {
    if (!api || !item.projectId || item.projectId === project?.id) return
    try {
      useCowork.getState().loadProjectState(await api.loadProject(item.projectId))
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className={s.section} aria-label={t('Recién terminado')}>
      <h3 className={u.sectionLabel}>
        {t('Recién terminado')} · {items.length}
      </h3>
      {items.length > 1 && (
        <div>
          <button type="button" className={cx(u.btn, u.btnSm)} disabled={busy} onClick={() => void seen(items)}>
            {t('Marcar todo como visto')}
          </button>
        </div>
      )}
      {note && (
        <div className={b.note} role="status">
          {note}
        </div>
      )}
      <ul className={b.list}>
        {items.map((item) => (
          <li key={item.id} className={cx(b.item, b.k_done)}>
            <div className={b.meta}>
              <span className={b.kind}>
                <CheckCircle2 size={11} aria-hidden="true" /> {t('Nuevo')}
              </span>
              <span>{ago(item.createdAt)}</span>
            </div>
            <button type="button" className={b.title} onClick={() => void goTo(item)} title={item.projectId && item.projectId !== project?.id ? t('Ir al proyecto') : undefined}>
              {item.title}
            </button>
            {item.detail && <p className={b.detail}>{item.detail}</p>}
            <div className={b.actions}>
              <button type="button" className={cx(u.btn, u.btnSm)} disabled={busy} onClick={() => void seen([item])}>
                {t('Visto')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Carpetas abiertas o cerradas (de este equipo). Sin anotar, solo está abierta la más reciente. */
const OPEN_KEY = 'kywai.resultados.carpetas'
/** Tipo de archivo elegido en el filtro (de este equipo). */
const TYPE_KEY = 'kywai.resultados.tipo'
const typeOf = (a: Artifact) => fileTypeOf(a.name || a.relPath, undefined, a.kind)
function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}
function saveOpen(map: Record<string, boolean>): void {
  try {
    // Solo las últimas 200, para que no crezca sin fin.
    localStorage.setItem(OPEN_KEY, JSON.stringify(Object.fromEntries(Object.entries(map).slice(-200))))
  } catch {
    /* sin almacenamiento: se olvida al cerrar */
  }
}

/** Pestaña Resultados: lo recién terminado y, debajo, una carpeta por tarea con el resultado principal delante. */
export function ResultsView() {
  const artifactsMap = useData((d) => d.artifacts)
  const tasks = useData((d) => d.tasks)
  const groups = useMemo(
    () => groupResults(Object.values(artifactsMap), (id) => tasks[id]?.title),
    [artifactsMap, tasks]
  )
  const [stored, setChoice] = useTypeChoice(TYPE_KEY)
  const all = useMemo(() => groups.flatMap((g) => [...g.main, ...g.work]), [groups])
  const counts = useMemo(() => countTypes(all.map(typeOf)), [all])
  const choice = effectiveChoice(stored, counts)
  // Con un tipo elegido, cada carpeta enseña solo esos archivos (todos delante) y las que no tienen ninguno se ocultan.
  const shown = useMemo((): (ResultGroup & { of?: number })[] => {
    if (choice === 'all') return groups
    return groups
      .map((g) => {
        const main = g.main.filter((a) => typeOf(a) === choice)
        const work = g.work.filter((a) => typeOf(a) === choice)
        return { ...g, main: main.length ? main : work, work: main.length ? work : [], of: g.main.length + g.work.length }
      })
      .filter((g) => g.main.length > 0)
  }, [groups, choice])
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen)
  const isOpen = (key: string, i: number): boolean => open[key] ?? i === 0
  const toggle = (key: string, i: number): void => {
    setOpen((prev) => {
      const next = { ...prev, [key]: !(prev[key] ?? i === 0) }
      saveOpen(next)
      return next
    })
  }

  if (groups.length === 0) {
    return (
      <div className={s.scroll}>
        <Finished />
        <div className={u.empty}>
          <span className={u.emptyIcon}>
            <Package size={20} aria-hidden="true" />
          </span>
          <span className={u.emptyTitle}>{t('Sin resultados por ahora')}</span>
          <span className={u.emptyText}>
            {t('Páginas, documentos, código e imágenes que creen los agentes aparecerán aquí para abrirlos al momento.')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={s.scroll}>
      <Finished />
      <TypeFilter counts={counts} total={all.length} value={choice} onChange={setChoice} />
      <ul className={s.resultFolders} aria-label={t('Resultados')}>
        {shown.map((g, i) => (
          <li key={g.key}>
            <ResultFolder group={g} of={g.of} open={isOpen(g.key, i)} onToggle={() => toggle(g.key, i)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Una carpeta de Resultados: cabecera plegable, el resultado principal y los archivos de trabajo aparte. */
function ResultFolder({ group, of, open, onToggle }: { group: ResultGroup; of?: number; open: boolean; onToggle: () => void }) {
  const lookup = useAgentLookup()
  const [showWork, setShowWork] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listId = useId()
  const all = [...group.main, ...group.work]
  const title = group.title === 'Otros archivos' ? t('Otros archivos') : group.title
  const authors = [...new Set(all.map((a) => lookup(a.agentId).name))]
  return (
    <section className={cx(m.folder, open && m.folderOpen)} style={agentVars(lookup(all[0].agentId).color)} aria-label={title}>
      <div className={m.folderHead}>
        <button type="button" className={m.folderToggle} aria-expanded={open} aria-controls={listId} onClick={onToggle}>
          <span className={m.folderIcon} aria-hidden="true">
            {open ? <FolderOpen size={20} /> : <Folder size={20} />}
          </span>
          <span className={s.folderInfo}>
            <span className={s.folderTitle} title={title}>
              {title}
            </span>
            <span className={s.folderMeta}>
              {[
                of !== undefined && of !== all.length
                  ? t('{n} de {total} archivos', { n: all.length, total: of })
                  : plural(all.length, t('archivo'), t('archivos')),
                authors.join(', '), shortTime(group.newest)].filter(Boolean).join(' · ')}
            </span>
          </span>
          <ChevronDown size={16} aria-hidden="true" className={m.folderChevron} />
        </button>
        <ArtifactDownloadButton projectId={all[0].projectId} ids={all.map((a) => a.id)} name={title} onError={setError} />
      </div>
      {error && (
        <p className={m.resumeError} role="alert">
          {error}
        </p>
      )}
      {open && (
        <div id={listId} className={s.folderBody}>
          <ResultCards list={group.main} folder={all} />
          {group.work.length > 0 && (
            <>
              <button type="button" className={s.workToggle} aria-expanded={showWork} onClick={() => setShowWork((v) => !v)}>
                <ChevronDown size={14} aria-hidden="true" className={cx(s.workChevron, showWork && s.workChevronOpen)} />
                {t('Archivos de trabajo')} · {group.work.length}
              </button>
              {showWork && <ResultCards list={group.work} folder={all} small />}
            </>
          )}
        </div>
      )}
    </section>
  )
}

/** Tarjetas de archivos; al abrir una, el visor deja pasar con ‹ › por toda la carpeta. */
function ResultCards({ list, folder, small }: { list: Artifact[]; folder: Artifact[]; small?: boolean }) {
  return (
    <ul className={cx(s.grid, small && s.gridSmall)}>
      {list.map((a) => (
        <ResultCard key={a.id} a={a} folder={folder} small={small} />
      ))}
    </ul>
  )
}

/** Una tarjeta: clic para verla, clic derecho para adjuntarla al mensaje, descargarla o eliminarla. */
function ResultCard({ a, folder, small }: { a: Artifact; folder: Artifact[]; small?: boolean }) {
  const openPreview = useCowork((st) => st.openPreview)
  const lookup = useAgentLookup()
  const look = lookup(a.agentId)
  const view = (): void => openPreview(folder.map(fromArtifact), folder.indexOf(a))
  const menu = useFileMenu({ artifact: a }, view)
  return (
    <li onContextMenu={menu.onContextMenu}>
      <button
        type="button"
        className={s.card}
        onClick={view}
        aria-label={t('Abrir {name}, {kind} creado por {agent}', { name: a.name, kind: artifactLabel(a), agent: look.name })}
      >
        <span className={s.cardTop}>
          <KindTile kind={a.kind} name={a.name || a.relPath} size={small ? 30 : 40} />
          <span className={s.cardKind}>{artifactLabel(a)}</span>
        </span>
        <span className={s.cardName} title={a.name}>
          {a.name}
        </span>
        {!small && (
          <span className={s.cardMeta}>
            <span className={s.agentDot} style={agentVars(look.color)} aria-hidden="true" />
            <span className={s.cardAgent}>{look.name}</span>
            <span className={s.cardTime}>{shortTime(a.createdAt)}</span>
          </span>
        )}
      </button>
      {!small && <ArtifactDownloadButton projectId={a.projectId} ids={[a.id]} name={a.name} />}
      {menu.error && (
        <p className={m.resumeError} role="alert">
          {menu.error}
        </p>
      )}
      {menu.menu}
    </li>
  )
}
