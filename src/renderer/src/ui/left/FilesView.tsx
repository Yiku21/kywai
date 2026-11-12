import { useId, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Folder, FolderOpen, Paperclip } from 'lucide-react'
import type { Artifact, Attachment } from '@shared/types'
import { groupByRequest, LOOSE_ATTACHMENTS, ONLY_ATTACHMENTS, OTHER_FILES, type RequestGroup } from '@shared/requestGroups'
import { useCowork, useData } from '@/store/cowork'
import { api } from '@/lib/api'
import { fileSize } from '@/lib/format'
import { fromAttachment, fromArtifact } from '@/lib/preview'
import { useAgentLookup } from '../common/agents'
import { FileTypeIcon, KindTile, artifactLabel } from '../common/icons'
import { countTypes, fileTypeOf } from '@shared/fileTypes'
import { effectiveChoice, TypeFilter, useTypeChoice } from './TypeFilter'
import { agentVars, cx, plural, shortTime } from '../common/util'
import u from '../common/ui.module.css'
import m from './Messages.module.css'
import s from './Views.module.css'
import { t } from '@/lib/i18n'
import { ArtifactDownloadButton } from './ArtifactDownloadButton'
import { useFileMenu } from './FileMenu'

/** Carpetas abiertas o cerradas (de este equipo). Sin anotar, solo está abierta la petición más reciente. */
const OPEN_KEY = 'kywai.archivos.carpetas'
/** Tipo de archivo elegido en el filtro (de este equipo). */
const TYPE_KEY = 'kywai.archivos.tipo'
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

function groupTitle(title: string): string {
  if (title === LOOSE_ATTACHMENTS) return t('Otros adjuntos')
  if (title === OTHER_FILES) return t('Otros archivos')
  if (title === ONLY_ATTACHMENTS) return t('Solo archivos adjuntos')
  return title
}

/** Pestaña Archivos: una carpeta plegable por petición, con lo que adjuntaste y lo que generó el equipo para ella. */
export function FilesView() {
  const attachments = useData((d) => d.attachments)
  const artifactsMap = useData((d) => d.artifacts)
  const messages = useData((d) => d.messages)
  const tasks = useData((d) => d.tasks)
  const groups = useMemo(
    () => groupByRequest({ messages, tasks, artifacts: Object.values(artifactsMap), attachments }),
    [messages, tasks, artifactsMap, attachments]
  )
  const [stored, setChoice] = useTypeChoice(TYPE_KEY)
  const counts = useMemo(
    () =>
      countTypes(
        groups.flatMap((g) => [
          ...g.attachments.map((a) => fileTypeOf(a.name, a.mime)),
          ...g.generated.map((a) => fileTypeOf(a.name || a.relPath, undefined, a.kind))
        ])
      ),
    [groups]
  )
  const choice = effectiveChoice(stored, counts)
  const total = groups.reduce((n, g) => n + g.attachments.length + g.generated.length, 0)
  // Con un tipo elegido, cada carpeta enseña solo esos archivos y las que no tienen ninguno se ocultan.
  const shown = useMemo(() => {
    if (choice === 'all') return groups
    return groups
      .map((g) => ({
        ...g,
        attachments: g.attachments.filter((a) => fileTypeOf(a.name, a.mime) === choice),
        generated: g.generated.filter((a) => fileTypeOf(a.name || a.relPath, undefined, a.kind) === choice)
      }))
      .filter((g) => g.attachments.length + g.generated.length > 0)
  }, [groups, choice])
  const fullCount = useMemo(() => new Map(groups.map((g) => [g.key, g.attachments.length + g.generated.length])), [groups])

  const [open, setOpen] = useState<Record<string, boolean>>(readOpen)
  const isOpen = (key: string, i: number): boolean => open[key] ?? i === 0
  const update = (next: Record<string, boolean>): void => {
    saveOpen(next)
    setOpen(next)
  }
  const anyOpen = shown.some((g, i) => isOpen(g.key, i))

  if (groups.length === 0) {
    return (
      <div className={s.scroll}>
        <div className={u.empty}>
          <span className={u.emptyIcon}>
            <Paperclip size={20} aria-hidden="true" />
          </span>
          <span className={u.emptyTitle}>{t('Aún no hay archivos')}</span>
          <span className={u.emptyText}>
            {t('Adjunta documentos o imágenes desde el chat (o arrástralos aquí). Lo que generen los agentes también aparecerá en esta pestaña.')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={s.scroll}>
      <div className={s.filesBar}>
        <h3 className={u.sectionLabel}>
          {t('Por petición')} <span className={u.count}>{shown.length}</span>
        </h3>
        {shown.length > 1 && (
          <button
            type="button"
            className={s.workToggle}
            onClick={() => update({ ...open, ...Object.fromEntries(shown.map((g) => [g.key, !anyOpen])) })}
          >
            {anyOpen ? <ChevronsDownUp size={14} aria-hidden="true" /> : <ChevronsUpDown size={14} aria-hidden="true" />}
            {anyOpen ? t('Plegar todas') : t('Desplegar todas')}
          </button>
        )}
      </div>
      <TypeFilter counts={counts} total={total} value={choice} onChange={setChoice} />
      <ul className={s.resultFolders} aria-label={t('Archivos por petición')}>
        {shown.map((g, i) => (
          <li key={g.key}>
            <RequestFolder
              group={g}
              of={choice === 'all' ? undefined : fullCount.get(g.key)}
              open={isOpen(g.key, i)}
              onToggle={() => update({ ...open, [g.key]: !isOpen(g.key, i) })}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Una petición: cabecera plegable con tu mensaje y, dentro, tus adjuntos y lo que generó el equipo. */
function RequestFolder({ group, of, open, onToggle }: { group: RequestGroup; of?: number; open: boolean; onToggle: () => void }) {
  const lookup = useAgentLookup()
  const mode = useCowork((st) => st.mode)
  const project = useCowork((st) => st.live.project)
  const openPreview = useCowork((st) => st.openPreview)
  const [error, setError] = useState<string | null>(null)
  const listId = useId()
  const title = groupTitle(group.title)
  const total = group.attachments.length + group.generated.length
  const authors = [...new Set(group.generated.map((a) => lookup(a.agentId).name))]
  const color = group.generated[0] ? lookup(group.generated[0].agentId).color : undefined

  const canOpen = !!api && mode === 'live' && !!project
  const openTitle = canOpen
    ? undefined
    : mode === 'demo'
      ? t('Abrir archivos está disponible en modo real')
      : t('Sin motor de agentes: abre la app de escritorio')
  // El visor deja pasar con ‹ › por toda la petición (los adjuntos solo si se pueden abrir aquí).
  const shownAtts = canOpen ? group.attachments : []
  const items = () => [...(project ? shownAtts.map((a) => fromAttachment(a, project.id)) : []), ...group.generated.map(fromArtifact)]
  const openAttachment = (a: Attachment): void => openPreview(items(), shownAtts.indexOf(a))
  const openArtifact = (a: Artifact): void => openPreview(items(), shownAtts.length + group.generated.indexOf(a))

  return (
    <section className={cx(m.folder, open && m.folderOpen)} style={color ? agentVars(color) : undefined} aria-label={title}>
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
                of !== undefined && of !== total
                  ? t('{n} de {total} archivos', { n: total, total: of })
                  : plural(total, t('archivo'), t('archivos')),
                group.attachments.length ? plural(group.attachments.length, t('adjunto'), t('adjuntos')) : '',
                authors.join(', '),
                group.newest ? shortTime(group.newest) : ''
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <ChevronDown size={16} aria-hidden="true" className={m.folderChevron} />
        </button>
        {group.generated.length > 0 && (
          <ArtifactDownloadButton projectId={group.generated[0].projectId} ids={group.generated.map((a) => a.id)} name={title} onError={setError} />
        )}
      </div>
      {error && (
        <p className={m.resumeError} role="alert">
          {error}
        </p>
      )}
      {open && (
        <ul id={listId} className={cx(s.rows, s.folderBody)}>
          {group.attachments.map((a) => (
            <AttachmentRow key={`att-${a.id}`} a={a} projectId={project?.id ?? ''} canOpen={canOpen} openTitle={openTitle} onOpen={() => openAttachment(a)} />
          ))}
          {group.generated.map((a) => (
            <ArtifactRow key={a.id} a={a} onOpen={() => openArtifact(a)} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** Un adjunto tuyo: clic para verlo, clic derecho para adjuntarlo otra vez, descargarlo o eliminarlo. */
function AttachmentRow({ a, projectId, canOpen, openTitle, onOpen }: { a: Attachment; projectId: string; canOpen: boolean; openTitle?: string; onOpen: () => void }) {
  const menu = useFileMenu({ attachment: a, projectId }, onOpen)
  return (
    <li onContextMenu={canOpen ? menu.onContextMenu : undefined}>
      <button
        type="button"
        className={cx(s.fileRow, !canOpen && s.rowStatic)}
        disabled={!canOpen}
        title={openTitle ?? t('Ver {name}', { name: a.name })}
        onClick={onOpen}
      >
        <span className={s.fileIcon}>
          <FileTypeIcon name={a.name} mime={a.mime} size={17} />
        </span>
        <span className={s.fileMain}>
          <span className={s.fileName}>{a.name}</span>
          <span className={s.fileMeta}>
            <Paperclip size={11} aria-hidden="true" />
            {t('Tu adjunto')} · {fileSize(a.size)}
          </span>
        </span>
        {canOpen && <ChevronRight size={15} aria-hidden="true" className={s.rowAction} />}
      </button>
      {menu.error && (
        <p className={m.resumeError} role="alert">
          {menu.error}
        </p>
      )}
      {menu.menu}
    </li>
  )
}

/** Lo que generó el equipo: clic para verlo, clic derecho para adjuntarlo al mensaje, descargarlo o eliminarlo. */
function ArtifactRow({ a, onOpen }: { a: Artifact; onOpen: () => void }) {
  const lookup = useAgentLookup()
  const look = lookup(a.agentId)
  const menu = useFileMenu({ artifact: a }, onOpen)
  return (
    <li onContextMenu={menu.onContextMenu}>
      <button type="button" className={s.fileRow} onClick={onOpen} title={t('Ver {name}', { name: a.name })}>
        <KindTile kind={a.kind} name={a.name || a.relPath} size={34} />
        <span className={s.fileMain}>
          <span className={s.fileName}>{a.name}</span>
          <span className={s.fileMeta}>
            <span className={s.agentDot} style={agentVars(look.color)} aria-hidden="true" />
            {look.name} · {artifactLabel(a)} · {fileSize(a.size)} · {shortTime(a.createdAt)}
          </span>
        </span>
        <ChevronRight size={15} aria-hidden="true" className={s.rowAction} />
      </button>
      {menu.error && (
        <p className={m.resumeError} role="alert">
          {menu.error}
        </p>
      )}
      {menu.menu}
    </li>
  )
}
