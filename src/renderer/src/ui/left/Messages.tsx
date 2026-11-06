import { memo, useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CircleCheck,
  CircleX,
  FilePen,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  Gauge,
  Globe,
  ListChecks,
  LoaderCircle,
  PenLine,
  Play,
  Search,
  SquareTerminal,
  ThumbsDown,
  ThumbsUp,
  User,
  Wrench,
  X
} from 'lucide-react'
import { INTERRUPTED_ERROR } from '@shared/defaults'
import { commonFolder, folderName, folderSummary } from '@shared/deliverables'
import type { Artifact, Attachment, ChatMessage, MessageRating, PlanProposal, Task, TaskChangeSet, TaskWork, TraceEntry, TraceTool, UsageRun, WorkFile, WorkStep, WorkToolRef } from '@shared/types'
import { callTokens, compactTokens, deltaText, quotaDeltas, runDuration, shortDuration } from '@/lib/usageStats'
import { useCowork, useData } from '@/store/cowork'
import { revealKey, useRevealed } from '@/lib/reveal'
import { api, isWeb } from '@/lib/api'
import { fileSize, timeHM } from '@/lib/format'
import { projectFileUrl } from '@/lib/localRefs'
import { AgentAvatar, AgentPill } from '../common/AgentBits'
import { useAgentLookup } from '../common/agents'
import { useComposer } from './composerStore'
import { FileTypeIcon, KindTile, TaskStatusIcon } from '../common/icons'
import { MarkdownView } from '../common/MarkdownView'
import { agentVars, cx, errorText, isoTime, plural } from '../common/util'
import u from '../common/ui.module.css'
import { ESTIMATE_HINT, REAL_HINT, planProgress } from '@/lib/progress'
import { useNow } from '../common/hooks'
import s from './Messages.module.css'
import { t } from '@/lib/i18n'

export const MessageItem = memo(function MessageItem({ message }: { message: ChatMessage }) {
  switch (message.author.type) {
    case 'user':
      return <UserMessage m={message} />
    case 'agent':
      return <AgentMessage m={message} agentId={message.author.agentId} />
    default:
      return (
        <div className={s.system} role="note">
          <span>{message.text}</span>
        </div>
      )
  }
})

function Meta({ name, ts, onName, nameTitle }: { name: string; ts: number; onName?: () => void; nameTitle?: string }) {
  return (
    <div className={s.meta}>
      {onName ? (
        <button type="button" className={cx(s.name, s.nameBtn)} onClick={onName} title={nameTitle}>
          {name}
        </button>
      ) : (
        <span className={s.name}>{name}</span>
      )}
      <time className={s.time} dateTime={isoTime(ts)}>
        {timeHM(ts)}
      </time>
    </div>
  )
}

// ---------- Usuario ----------

/** Mensaje de una rutina: la petición y, aparte (plegado), los datos que trajo (webhook o archivos cambiados). */
function routineParts(text: string): { request: string; data: string | null } {
  const i = text.indexOf('\n---\n')
  return i < 0 ? { request: text, data: null } : { request: text.slice(0, i).trimEnd(), data: text.slice(i + 5).trim() }
}

function UserMessage({ m }: { m: ChatMessage }) {
  const parts = m.routine ? routineParts(m.text) : { request: m.text, data: null }
  return (
    <article className={s.msg}>
      <span className={cx(s.avatar, s.userAvatar)} aria-hidden="true">
        {m.routine ? <CalendarClock size={18} /> : <User size={18} />}
      </span>
      <div className={s.main}>
        <Meta name={m.routine ? t('Rutina: {name}', { name: m.routine.name }) : t('Tú')} ts={m.createdAt} />
        <div className={cx(s.bubble, s.userBubble)}>
          {parts.request && <p className={s.userText}>{parts.request}</p>}
          {parts.data && (
            <details className={s.routineData}>
              <summary>{t('Datos que trajo la rutina')}</summary>
              <pre>{parts.data}</pre>
            </details>
          )}
          {m.attachments && m.attachments.length > 0 && (
            <ul className={s.attachments} aria-label={t('Adjuntos')}>
              {m.attachments.map((a) => (
                <li key={a.id}>
                  <AttachmentChip a={a} projectId={m.projectId} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  )
}

function AttachmentChip({ a, projectId }: { a: Attachment; projectId: string }) {
  const mode = useCowork((st) => st.mode)
  const canOpen = !!api && mode === 'live'
  const content = (
    <>
      <span className={s.attIcon}>
        <FileTypeIcon name={a.name} mime={a.mime} size={15} />
      </span>
      <span className={s.attName}>{a.name}</span>
    </>
  )
  if (!canOpen) {
    return (
      <span className={s.att} title={`${a.name} · ${fileSize(a.size)}`}>
        {content}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={cx(s.att, s.attBtn)}
      title={t('Abrir {name} ({size})', { name: a.name, size: fileSize(a.size) })}
      aria-label={t('Abrir {name}', { name: a.name })}
      onClick={() => {
        api?.openPath(projectId, a.relPath).catch(() => {})
      }}
    >
      {content}
    </button>
  )
}

// ---------- Agente ----------

function AgentMessage({ m, agentId }: { m: ChatMessage; agentId: string }) {
  const lookup = useAgentLookup()
  const reduced = useCowork((st) => st.reducedEffects)
  const select = useCowork((st) => st.select)
  const look = lookup(agentId)
  const isError = m.tone === 'error'
  const hasTasks = !!m.taskIds && m.taskIds.length > 0
  const hasArtifacts = !!m.artifactIds && m.artifactIds.length > 0
  const showText = !!m.text || !!m.streaming
  // Aprobado, el plan se sigue con el bloque de tareas de siempre.
  const proposal = m.proposal && m.proposal.status !== 'approved' ? m.proposal : undefined
  // Un resultado se puede valorar: el de una tarea terminada o la respuesta final de un plan.
  const ratable = !m.streaming && !isError && (m.work?.status === 'done' || (hasTasks && !proposal && !!m.text))

  return (
    <article className={s.msg} style={agentVars(look.color)}>
      <AgentAvatar look={look} size={40} className={s.robot} />
      <div className={s.main}>
        <Meta
          name={look.name}
          ts={m.createdAt}
          onName={look.present ? () => select({ type: 'agent', id: agentId }) : undefined}
          nameTitle={t('Ver a {name} en el espacio', { name: look.name })}
        />
        {(showText || hasTasks || proposal || m.work) && (
          <div className={cx(s.bubble, s.agentBubble, isError && s.errorBubble)}>
            {m.work && <WorkBlock messageId={m.id} projectId={m.projectId} work={m.work} reduced={reduced} />}
            {showText && (
              <div className={s.textRow}>
                {isError && <AlertCircle size={16} className={s.errorIcon} aria-label="Error" />}
                {m.text ? (
                  <RevealedText m={m} reduced={reduced} />
                ) : (
                  <TypingDots reduced={reduced} />
                )}
              </div>
            )}
            {proposal && <ProposalBlock m={m} proposal={proposal} />}
            {hasTasks && <PlanBlock taskIds={m.taskIds!} runId={m.runId} contract={m.contract} />}
          </div>
        )}
        {hasArtifacts && <ArtifactCards ids={m.artifactIds!} projectId={m.projectId} />}
        {m.work && m.work.status !== 'running' && <ChangesRow projectId={m.projectId} taskId={m.work.taskId} />}
        {ratable && <RatingRow m={m} />}
      </div>
    </article>
  )
}

/**
 * Lo que la tarea cambió en la carpeta del proyecto (instantáneas de antes y después): ver el diff de cada archivo,
 * pedir cambios al mismo agente o deshacerla aunque después se cambiaran otras cosas.
 */
function ChangesRow({ projectId, taskId }: { projectId: string; taskId: string }) {
  const task = useData((d) => d.tasks[taskId])
  const setText = useComposer((c) => c.setText)
  const focus = useComposer((c) => c.requestFocus)
  const [open, setOpen] = useState(false)
  const [set, setSet] = useState<TaskChangeSet | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const listId = useId()
  const ch = task?.changes
  if (!ch) return null
  const undone = !!ch.undoneAt
  const toggle = (): void => {
    const next = !open
    setOpen(next)
    if (next && !set && api) api.getTaskChanges(projectId, taskId).then(setSet, (e: Error) => setNote(e.message))
  }
  const undo = (): void => {
    if (!api || busy) return
    if (!window.confirm(t('¿Deshacer «{title}»? Sus {files} archivo{s} vuelven a como estaban antes; lo que se cambió después en otros archivos se queda.', { title: task.title, files: ch.files, s: ch.files === 1 ? '' : 's' }))) return
    setBusy(true)
    api
      .undoTask(projectId, taskId)
      .then(setNote, (e: Error) => setNote(e.message))
      .finally(() => setBusy(false))
  }
  const ask = (): void => {
    setText(t('Sobre «{title}»: ', { title: task.title }))
    focus()
  }
  return (
    <div className={s.changes}>
      <div className={s.changesHead}>
        <button type="button" className={s.moreHead} aria-expanded={open} aria-controls={listId} onClick={toggle} title={t('Ver qué cambió en cada archivo')}>
          <FilePen size={13} aria-hidden="true" />
          <span>
            {undone ? t('Deshecha: ') : ''}
            {plural(ch.files, t('archivo cambiado'), t('archivos cambiados'))}
            {ch.isolated ? t(' (en una copia aparte, ya integrada)') : ''}
          </span>
          <DiffStat add={ch.add} del={ch.del} />
          <ChevronRight size={14} className={cx(s.toolsChev, open && s.toolsChevOpen)} aria-hidden="true" />
        </button>
        {!undone && (
          <>
            <button type="button" className={s.changesBtn} onClick={ask} title={t('Escribir al equipo qué cambiar de esta tarea')}>
              {t('Pedir cambios')}
            </button>
            <button type="button" className={s.changesBtn} onClick={undo} disabled={busy || task.status === 'running'} title={t('Volver a dejar sus archivos como estaban antes')}>
              {busy ? t('Deshaciendo…') : t('Deshacer')}
            </button>
          </>
        )}
      </div>
      {!!ch.conflicts?.length && <p className={s.changesNote}>{t('Al integrar chocó con otra tarea en')} {ch.conflicts.join(', ')}.</p>}
      {note && <p className={s.changesNote}>{note}</p>}
      {open && (
        <div id={listId} className={s.changesBody}>
          {!set ? (
            <p className={s.changesNote}>{t('Cargando…')}</p>
          ) : (
            <>
              <ul className={s.changesFiles}>
                {set.files.map((f) => (
                  <li key={f.path}>
                    <span className={s.changesStatus}>{f.status === 'A' ? t('nuevo') : f.status === 'D' ? t('borrado') : t('cambiado')}</span>
                    <code>{f.path}</code>
                    {f.binary ? <span className={s.changesStatus}>{t('binario')}</span> : <DiffStat add={f.add} del={f.del} />}
                  </li>
                ))}
              </ul>
              {set.patch && <CodeBlock text={set.patch} diff />}
              {set.truncated && <p className={s.changesNote}>{t('El parche es muy largo: se muestra solo el principio.')}</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** 👍/👎 bajo un resultado: lo que mide si el trabajo te sirvió (va al registro de consumo y a la ficha del agente). */
function RatingRow({ m }: { m: ChatMessage }) {
  const [pending, setPending] = useState<MessageRating | null>(null)
  const rate = (r: MessageRating): void => {
    const a = api
    if (!a) return
    const next = m.rating === r ? null : r
    setPending(r)
    a.rateMessage(m.projectId, m.id, next).catch(() => {}).finally(() => setPending(null))
  }
  const btn = (r: MessageRating, Icon: typeof ThumbsUp, label: string) => (
    <button
      type="button"
      className={cx(s.ratingBtn, m.rating === r && s.ratingOn)}
      aria-label={label}
      aria-pressed={m.rating === r}
      title={label}
      disabled={pending != null}
      onClick={() => rate(r)}
    >
      <Icon size={14} />
    </button>
  )
  return (
    <div className={s.rating} aria-label={t('¿Te sirvió este resultado?')}>
      {btn('up', ThumbsUp, t('Me sirvió'))}
      {btn('down', ThumbsDown, t('No me sirvió'))}
      {m.rating && <span className={s.ratingNote}>{m.rating === 'up' ? t('Te sirvió: lo tendrá en cuenta el coordinador.') : t('No te sirvió: lo tendrá en cuenta el coordinador.')}</span>}
    </div>
  )
}

// ---------- Lo que cuenta un agente mientras trabaja ----------

const WORK_STATE: Record<TaskWork['status'], string> = { running: t('Trabajando'), done: t('Hecha'), failed: t('No pudo hacerla'), stopped: t('Detenida') }

const TOOL_ICON: Record<TraceTool, typeof Wrench> = {
  command: SquareTerminal,
  edit: FilePen,
  write: FilePlus,
  read: FileText,
  search: Search,
  web: Globe,
  todo: Wrench,
  agent: Bot,
  other: Wrench
}

// El registro completo de la tarea se pide una sola vez aunque se desplieguen varias herramientas a la vez.
const traceCache = new Map<string, { at: number; list: Promise<TraceEntry[]> }>()
function loadTrace(taskId: string): Promise<TraceEntry[]> {
  const hit = traceCache.get(taskId)
  if (hit && Date.now() - hit.at < 1500) return hit.list
  const list = api ? api.getTaskTrace(taskId) : Promise.resolve([] as TraceEntry[])
  traceCache.set(taskId, { at: Date.now(), list })
  list.catch(() => traceCache.delete(taskId))
  return list
}

/**
 * Su tarea en tres niveles, como en la app de Claude: arriba, en corto, qué está haciendo; al desplegar la flecha,
 * todo lo que cuenta y cada grupo de herramientas en una línea; y al desplegar una herramienta, su detalle.
 */
function WorkBlock({ messageId, projectId, work, reduced }: { messageId: string; projectId: string; work: TaskWork; reduced: boolean }) {
  const task = useData((d) => d.tasks[work.taskId])
  const openTrace = useCowork((st) => st.openTrace)
  const [open, setOpen] = useState(false)
  const listId = useId()
  // Solo sigue «trabajando» si la tarea sigue en marcha (tras reiniciar la app, ya no).
  const live = work.status === 'running' && task?.status === 'running'
  const state = work.status === 'running' && !live ? t('Detenida') : WORK_STATE[work.status]
  const count = work.steps.length + (work.hidden ?? 0)
  const totals = work.totals

  // Lo que hace ahora: su última frase y lo último que enseñó (capturas, documentos).
  let note: Extract<WorkStep, { kind: 'note' }> | undefined
  let files: Extract<WorkStep, { kind: 'files' }> | undefined
  if (live) {
    for (let i = work.steps.length - 1; i >= 0 && !(note && files); i--) {
      const st = work.steps[i]
      if (st.kind === 'note' && !note) note = st
      else if (st.kind === 'files' && !files) files = st
    }
  }
  const liveLine = live ? (
    <li className={s.liveLine}>
      <TypingDots reduced={reduced} />
      {task?.lastActivity && <span>{task.lastActivity}</span>}
    </li>
  ) : null
  const toggle =
    count > 0 ? (
      <button type="button" className={s.moreHead} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
        <span>{totals?.summary ?? plural(count, t('paso'), t('pasos'))}</span>
        {!!totals?.failed && <span className={s.toolsFailed}>· {totals.failed} {t('con error')}</span>}
        <DiffStat add={totals?.add} del={totals?.del} />
        <ChevronRight size={14} className={cx(s.toolsChev, open && s.toolsChevOpen)} aria-hidden="true" />
      </button>
    ) : null

  return (
    <div className={s.work}>
      <button
        type="button"
        className={s.workHead}
        onClick={() => (count > 0 ? setOpen((o) => !o) : openTrace(work.taskId))}
        title={count > 0 ? (open ? t('Ocultar lo que hizo') : t('Ver lo que hizo')) : t('Ver todo lo que hizo, paso a paso')}
      >
        {live ? <LoaderCircle size={14} className={cx(s.workSpin, !reduced && u.spin)} aria-hidden="true" /> : <ListChecks size={14} aria-hidden="true" />}
        <span className={s.workTitle}>{work.title}</span>
        <span className={cx(s.workState, work.status === 'failed' && s.workFailed)}>{state}</span>
      </button>
      {!open && (!!note || !!files || live) && (
        <ul className={s.steps}>
          {note && <Note messageId={messageId} text={note.text} reduced={reduced} />}
          {files && <FilesStep projectId={projectId} files={files.files} />}
          {liveLine}
        </ul>
      )}
      {toggle}
      {open && (
        <ol id={listId} className={s.steps}>
          {!!work.hidden && (
            <li>
              <button type="button" className={s.stepsHidden} onClick={() => openTrace(work.taskId)}>
                {plural(work.hidden, t('paso anterior'), t('pasos anteriores'))}{t(': ver todo')}
              </button>
            </li>
          )}
          {work.steps.map((step, i) =>
            step.kind === 'note' ? (
              <Note key={i} messageId={messageId} text={step.text} reduced={reduced} />
            ) : step.kind === 'files' ? (
              <FilesStep key={i} projectId={projectId} files={step.files} />
            ) : (
              <ToolsStep key={i} taskId={work.taskId} step={step} />
            )
          )}
          {liveLine}
          <li>
            <button type="button" className={s.stepsHidden} onClick={() => openTrace(work.taskId)}>
              {t('Abrir el registro completo')}
            </button>
          </li>
        </ol>
      )}
    </div>
  )
}

/** «+393 −7»: las líneas que añade y quita. */
function DiffStat({ add, del }: { add?: number; del?: number }) {
  if (!add && !del) return null
  return (
    <span className={s.diffStat} aria-label={t('{add} líneas añadidas y {del} quitadas', { add: add ?? 0, del: del ?? 0 })}>
      <span className={s.statAdd}>+{add ?? 0}</span>
      <span className={s.statDel}>−{del ?? 0}</span>
    </span>
  )
}

/** El texto de un agente: si acaba de llegar y suena su voz, se escribe letra a letra a su ritmo. */
function RevealedText({ m, reduced }: { m: ChatMessage; reduced: boolean }) {
  const { shown, revealing } = useRevealed(revealKey(m.id), m.text)
  const typing = !!m.streaming || revealing
  return <MarkdownView text={shown} className={cx(typing && s.streaming, typing && !reduced && s.caretBlink)} />
}

/** Una frase de lo que cuenta mientras trabaja, escrita al ritmo de su voz. */
function Note({ messageId, text, reduced }: { messageId: string; text: string; reduced: boolean }) {
  const { shown, revealing } = useRevealed(revealKey(messageId, text.trim()), text)
  return (
    <li className={s.note}>
      <MarkdownView text={shown} className={cx(revealing && s.streaming, revealing && !reduced && s.caretBlink)} />
    </li>
  )
}

/** Lo que el agente acaba de crear o abrir mientras trabaja: las imágenes, para ver por dónde va; y los documentos. */
function FilesStep({ projectId, files }: { projectId: string; files: WorkFile[] }) {
  const images = files.filter((f) => f.image)
  const docs = files.filter((f) => !f.image)
  const open = (f: WorkFile): void => {
    api?.openPath(projectId, f.relPath).catch(() => {})
  }
  return (
    <li className={s.filesStep}>
      {images.length > 0 && (
        <div className={s.thumbs}>
          {images.map((f) => (
            <button key={f.relPath} type="button" className={s.thumb} title={t('Abrir {name}', { name: f.name })} onClick={() => open(f)}>
              <img src={projectFileUrl(projectId, f.relPath, isWeb)} alt={f.name} loading="lazy" />
              <span>{f.name}</span>
            </button>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div className={s.docChips}>
          {docs.map((f) => (
            <button key={f.relPath} type="button" className={s.docChip} title={t('Abrir {name} ({size})', { name: f.name, size: fileSize(f.size) })} onClick={() => open(f)}>
              <FileTypeIcon name={f.name} size={13} />
              <span>{f.name}</span>
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

/** Un grupo de herramientas en una línea; al desplegarlo, cada una, y cada una se despliega para ver su detalle. */
function ToolsStep({ taskId, step }: { taskId: string; step: Extract<WorkStep, { kind: 'tools' }> }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className={s.tools}>
      <button type="button" className={s.toolsHead} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Wrench size={13} aria-hidden="true" />
        <span>{step.summary}</span>
        {!!step.failed && <span className={s.toolsFailed}>· {plural(step.failed, t('con error'), t('con error'))}</span>}
        <DiffStat add={step.add} del={step.del} />
        <ChevronRight size={14} className={cx(s.toolsChev, open && s.toolsChevOpen)} aria-hidden="true" />
      </button>
      {open && (
        <ul id={id} className={s.toolItems}>
          {step.items.map((item, i) => (
            <ToolRow key={i} taskId={taskId} title={item} info={step.refs?.[i]} />
          ))}
          {!!step.more && <li className={s.itemMore}>{t('y {n} más (en el registro completo)', { n: step.more })}</li>}
        </ul>
      )}
    </li>
  )
}

/** Una herramienta: su línea y, al pulsarla, el comando, los cambios o el resultado. */
function ToolRow({ taskId, title, info }: { taskId: string; title: string; info?: WorkToolRef }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const Icon = TOOL_ICON[info?.tool ?? 'other']
  const head = (
    <>
      <Icon size={13} aria-hidden="true" className={s.itemIcon} />
      <span className={cx(s.itemTitle, info?.tool === 'command' && s.itemMono)}>{title}</span>
      {info?.ok === true && <CircleCheck size={13} aria-label={t('Bien')} className={s.itemOk} />}
      {info?.ok === false && <CircleX size={13} aria-label={t('Con error')} className={s.itemBad} />}
      <DiffStat add={info?.add} del={info?.del} />
    </>
  )
  // Sin su id (mensajes de antes de esta versión) no hay detalle que pedir.
  if (!info) {
    return (
      <li className={s.toolItem}>
        <div className={s.itemHead}>{head}</div>
      </li>
    )
  }
  return (
    <li className={s.toolItem}>
      <button type="button" className={s.itemHead} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {head}
        <ChevronRight size={13} className={cx(s.toolsChev, open && s.toolsChevOpen)} aria-hidden="true" />
      </button>
      {open && <ToolDetail id={id} taskId={taskId} info={info} />}
    </li>
  )
}

/** El detalle de una herramienta: se pide al registro de la tarea al desplegarla (y otra vez cuando llega su resultado). */
function ToolDetail({ id, taskId, info }: { id: string; taskId: string; info: WorkToolRef }) {
  const [entry, setEntry] = useState<TraceEntry | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    loadTrace(taskId).then(
      (list) => alive && setEntry(list.find((e) => e.id === info.id) ?? null),
      () => alive && setEntry(null)
    )
    return () => {
      alive = false
    }
  }, [taskId, info.id, info.ok])
  return (
    <div id={id} className={s.itemBody}>
      {entry === undefined ? (
        <p className={s.itemNote}>{t('Cargando…')}</p>
      ) : !entry || (!entry.body && !entry.output) ? (
        <p className={s.itemNote}>{info.ok === undefined ? t('En marcha…') : t('Este paso no tiene más detalle.')}</p>
      ) : (
        <>
          {entry.body && <CodeBlock text={info.tool === 'command' ? `$ ${entry.body}` : entry.body} diff={info.tool === 'edit'} />}
          {entry.output && (
            <>
              <span className={s.outLabel}>{t('Resultado')}</span>
              <pre className={cx(s.code, entry.ok === false && s.codeBad)}>{entry.output}</pre>
            </>
          )}
        </>
      )}
    </div>
  )
}

/** Código o texto tal cual; en las ediciones, las líneas añadidas y quitadas con color. */
function CodeBlock({ text, diff }: { text: string; diff?: boolean }) {
  if (!diff) return <pre className={s.code}>{text}</pre>
  return (
    <pre className={s.code}>
      {text.split('\n').map((line, i) => (
        <span key={i} className={line.startsWith('+ ') ? s.codeAdd : line.startsWith('- ') ? s.codeDel : undefined}>
          {line}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}

function TypingDots({ reduced }: { reduced: boolean }) {
  return (
    <span className={cx(s.typing, !reduced && s.typingAnim)} role="status">
      <span />
      <span />
      <span />
      <span className="sr-only">{t('Escribiendo…')}</span>
    </span>
  )
}

// ---------- Plan propuesto (espera tu visto bueno) ----------

const DIFFICULTY_LABEL: Record<string, string> = { easy: t('fácil'), medium: 'normal', hard: t('difícil') }

/** El plan que propone el coordinador: qué hará cada agente. Nada empieza hasta que lo apruebes. */
function ProposalBlock({ m, proposal }: { m: ChatMessage; proposal: PlanProposal }) {
  const lookup = useAgentLookup()
  const live = useCowork((st) => st.mode === 'live')
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = proposal.status === 'pending'
  const canAct = !!api && live && pending
  const agents = new Set(proposal.tasks.map((task) => task.agentId)).size
  const index = new Map(proposal.tasks.map((task, i) => [task.key, i + 1]))

  function act(kind: 'approve' | 'reject'): void {
    const a = api
    if (!a || busy) return
    setBusy(kind)
    setError(null)
    const call = kind === 'approve' ? a.approvePlan(m.projectId, m.id) : a.rejectPlan(m.projectId, m.id)
    call.then(
      () => setBusy(null),
      (e) => {
        setBusy(null)
        setError(errorText(e))
      }
    )
  }

  const tasks = (
    <ol className={s.proposalTasks} aria-label={t('Tareas propuestas')}>
      {proposal.tasks.map((task, i) => {
        const after = task.dependsOn.map((k) => index.get(k)).filter((x): x is number => !!x)
        return (
          <li key={task.key}>
            <details className={s.proposalTask}>
              <summary>
                <span className={s.proposalNum}>{i + 1}</span>
                <AgentPill look={lookup(task.agentId)} size="sm" />
                <span className={s.proposalTitle}>{task.title}</span>
                {after.length > 0 && <span className={s.proposalAfter}>{t('tras')} {after.join(', ')}</span>}
              </summary>
              <div className={s.proposalDetail}>
                <MarkdownView text={task.description} />
                <p className={s.proposalMeta}>
                  {t('Dificultad')} {DIFFICULTY_LABEL[task.difficulty] ?? task.difficulty}
                  {task.acceptance && <> {t('· Hecha cuando:')} {task.acceptance}</>}
                </p>
              </div>
            </details>
          </li>
        )
      })}
    </ol>
  )

  return (
    <div className={cx(s.proposal, !pending && s.proposalClosed)}>
      <div className={s.planHead}>
        <span className={s.planIcon} aria-hidden="true">
          {pending ? <ListChecks size={18} /> : proposal.status === 'revised' ? <PenLine size={18} /> : <X size={18} />}
        </span>
        <div className={s.planInfo}>
          <span className={s.planTitle}>
            {pending ? t('Plan propuesto: espera tu visto bueno') : proposal.status === 'revised' ? t('Plan cambiado por tu respuesta') : t('Plan descartado')}
          </span>
          <span className={s.planSub}>
            {plural(agents, t('agente'), t('agentes'))} · {plural(proposal.tasks.length, t('tarea'), t('tareas'))}
          </span>
        </div>
      </div>
      {pending ? (
        <>
          {tasks}
          {proposal.contract && (
            <details className={s.contract}>
              <summary>{t('Contrato común del equipo')}</summary>
              <MarkdownView text={proposal.contract} />
            </details>
          )}
          <div className={s.proposalActions}>
            <button type="button" className={cx(u.btn, u.btnPrimary)} disabled={!canAct || !!busy} onClick={() => act('approve')}>
              {busy === 'approve' ? <LoaderCircle size={14} aria-hidden="true" className={u.spin} /> : <Play size={14} aria-hidden="true" />}
              {t('Aprobar y empezar')}
            </button>
            <button type="button" className={u.btn} disabled={!canAct || !!busy} onClick={() => act('reject')}>
              {busy === 'reject' && <LoaderCircle size={14} aria-hidden="true" className={u.spin} />}
              {t('Descartar')}
            </button>
            <span className={s.proposalHint}>{t('¿Algo no encaja? Escríbele en el chat qué cambiar.')}</span>
          </div>
          {error && (
            <p className={s.resumeError} role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <details className={s.contract}>
          <summary>{t('Ver el plan')}</summary>
          {tasks}
        </details>
      )}
    </div>
  )
}

// ---------- Plan (tareas + progreso) ----------

function PlanBlock({ taskIds, runId, contract }: { taskIds: string[]; runId?: string; contract?: string }) {
  const tasks = useData((d) => d.tasks)
  const usage = useCowork((st) => (runId && st.mode === 'live' ? st.usageRuns[runId] : undefined))
  const lookup = useAgentLookup()
  const reduced = useCowork((st) => st.reducedEffects)
  const setLeftTab = useCowork((st) => st.setLeftTab)

  const list = useMemo(() => taskIds.map((id) => tasks[id]).filter((task): task is Task => !!task), [taskIds, tasks])
  const anyRunning = list.some((task) => task.status === 'running')
  const now = useNow(2000, anyRunning)
  if (list.length === 0) return null

  const total = list.length
  let done = 0
  let failed = 0
  let running = 0
  for (const task of list) {
    if (task.status === 'done') done++
    else if (task.status === 'failed' || task.status === 'cancelled') failed++
    else if (task.status === 'running') running++
  }
  const active = total - done - failed
  const agentCount = new Set(list.map((task) => task.agentId)).size
  const plan = planProgress(list, Object.values(tasks), now)
  const pct = plan.pct
  const allDone = done === total
  const finished = active === 0

  const title = allDone ? t('Plan completado') : finished ? t('Plan finalizado con errores') : t('Plan en marcha')
  let caption: string
  if (done > 0) caption = t('{done}/{total} tareas completadas', { done, total })
  else if (active > 0) caption = t('{plural} en marcha', { plural: plural(total, t('tarea'), t('tareas')) })
  else caption = t('{plural} con error', { plural: plural(failed, t('tarea'), t('tareas')) })
  const measurable = done > 0 || finished || running > 0

  return (
    <div className={s.plan}>
      <ul className={s.taskList} aria-label={t('Tareas del plan')}>
        {list.map((task) => (
          <li key={task.id} className={s.taskRow}>
            <AgentPill look={lookup(task.agentId)} size="sm" />
            <span className={s.taskTitle} title={task.title}>
              {task.title}
            </span>
            <TaskStatusIcon status={task.status} size={15} />
          </li>
        ))}
      </ul>

      <div className={cx(s.planCard, allDone && s.planDone, finished && !allDone && s.planFailed)}>
        <div className={s.planHead}>
          <span className={s.planIcon} aria-hidden="true">
            {allDone ? <CircleCheck size={18} /> : <ClipboardList size={18} />}
          </span>
          <div className={s.planInfo}>
            <span className={s.planTitle}>{title}</span>
            <span className={s.planSub}>
              {plural(agentCount, t('agente'), t('agentes'))} · {plural(total, t('tarea'), t('tareas'))}
              {running > 0 && t(' · {running} en curso', { running })}
            </span>
          </div>
          <button
            type="button"
            className={cx(u.btn, u.btnSm, s.planBtn)}
            onClick={() => setLeftTab('tasks')}
            aria-label={t('Ver tareas')}
            title={t('Ver tareas')}
          >
            <span className={s.planBtnLabel}>{t('Ver tareas')}</span>
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
        <div
          className={u.track}
          role="progressbar"
          aria-label={t('Progreso del plan')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={measurable ? pct : undefined}
          aria-valuetext={measurable ? `${pct}% · ${caption}` : caption}
          style={{ '--bar': finished && !allDone ? 'var(--alert)' : 'var(--live)' } as CSSProperties}
        >
          {measurable ? (
            <span className={u.fill} style={{ '--pct': `${pct}%` } as CSSProperties} />
          ) : (
            <span className={reduced ? u.shimmerStatic : u.shimmer} style={{ '--bar': 'var(--cyan)' } as CSSProperties} />
          )}
        </div>
        <div className={s.planFoot}>
          <span>
            {caption}
            {failed > 0 && done > 0 && <span className={s.planFail}> · {failed} {t('con error')}</span>}
          </span>
          {measurable ? (
            <span className={s.planPct} title={plan.real ? REAL_HINT : ESTIMATE_HINT}>
              {plan.real ? `${pct}%` : `≈ ${pct}%`}
            </span>
          ) : (
            <span className={s.planActivity}>{t('En curso')}</span>
          )}
        </div>
      </div>
      {runId && <ResumeRow runId={runId} list={list} />}
      {contract && (
        <details className={s.contract}>
          <summary>{t('Contrato común del equipo')}</summary>
          <MarkdownView text={contract} />
        </details>
      )}
      {usage && usage.calls.length > 0 && <RunUsageLine run={usage} now={now} />}
    </div>
  )
}

/** Tareas que se quedaron a medias al cerrar la app (por ejemplo al actualizar): se pueden reanudar. */
function ResumeRow({ runId, list }: { runId: string; list: Task[] }) {
  const active = useData((d) => d.activeRunIds.includes(runId))
  const project = useCowork((st) => st.live.project)
  const live = useCowork((st) => st.mode === 'live')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const halfDone = list.filter((task) => task.status === 'cancelled' && task.error === INTERRUPTED_ERROR)
  if (!halfDone.length || active || !api || !live || !project) return null
  const a = api
  return (
    <div className={s.resume} role="status">
      <span>
        {halfDone.length === 1 ? t('Una tarea se quedó a medias al cerrar la app.') : t('{n} tareas se quedaron a medias al cerrar la app.', { n: halfDone.length })}
        {error && <span className={s.resumeError}> {error}</span>}
      </span>
      <button
        type="button"
        className={cx(u.btn, u.btnSm, u.btnPrimary)}
        disabled={busy}
        title={t('Vuelve a lanzar lo que quedó a medias, con el mismo agente: sigue desde los archivos que ya hay')}
        onClick={() => {
          setBusy(true)
          setError(null)
          a.resumeRun(project.id, runId).then(
            () => setBusy(false),
            (e) => {
              setBusy(false)
              setError(errorText(e))
            }
          )
        }}
      >
        {busy ? <LoaderCircle size={13} aria-hidden="true" className={u.spin} /> : <Play size={13} aria-hidden="true" />}
        {t('Reanudar')}
      </button>
    </div>
  )
}

/** «12 min · 184 k tokens · Claude +2 %»: lo que costó esta petición (abre ⋮ → Consumo). */
function RunUsageLine({ run, now }: { run: UsageRun; now: number }) {
  const tokens = run.calls.reduce((n, c) => n + callTokens(c), 0)
  const deltas = quotaDeltas(run.quotaBefore, run.quotaAfter).filter((d) => d.delta > 0)
  const parts = [
    shortDuration(runDuration(run, now)),
    // Los tokens de cada tarea se suman cuando termina (y Hermes no informa de los suyos).
    run.status === 'running' && tokens === 0 ? t('tokens al terminar cada tarea') : t('{n} tokens', { n: compactTokens(tokens) }) + (run.status === 'running' ? t(' hasta ahora') : ''),
    ...deltas.map(deltaText)
  ]
  return (
    <button
      type="button"
      className={s.planUsage}
      onClick={() => useCowork.setState({ usageOpen: true })}
      title={t('Ver el consumo (tokens, tiempo y cuota) de cada petición')}
    >
      <Gauge size={13} aria-hidden="true" />
      {parts.join(' · ')}
    </button>
  )
}

// ---------- Resultados ----------

/** Lo que entrega una tarea: un archivo se enseña tal cual; varios, juntos en una carpeta que se despliega. */
function ArtifactCards({ ids, projectId }: { ids: string[]; projectId: string }) {
  const artifacts = useData((d) => d.artifacts)
  const list = ids.map((id) => artifacts[id]).filter((a) => !!a)
  if (list.length === 0) return null
  if (list.length === 1) {
    return (
      <ul className={s.artifacts} aria-label={t('Resultados')}>
        <ArtifactRow a={list[0]} />
      </ul>
    )
  }
  return <DeliverablesFolder list={list} projectId={projectId} />
}

function ArtifactRow({ a }: { a: Artifact }) {
  const openViewer = useCowork((st) => st.openViewer)
  const lookup = useAgentLookup()
  const look = lookup(a.agentId)
  return (
    <li className={s.artifact}>
      <KindTile kind={a.kind} size={38} />
      <div className={s.artifactInfo}>
        <span className={s.artifactName} title={a.relPath}>
          {a.name}
        </span>
        <span className={s.artifactBy}>
          <span className={s.byDot} style={agentVars(look.color)} aria-hidden="true" />
          {t('Creado por')} {look.name}
        </span>
      </div>
      <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => openViewer(a.id)} aria-label={t('Abrir {name}', { name: a.name })}>
        {t('Abrir')}
      </button>
    </li>
  )
}

/** Varios entregables en una sola carpeta (plegada): al pulsarla se despliegan para abrir cada uno. */
function DeliverablesFolder({ list, projectId }: { list: Artifact[]; projectId: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lookup = useAgentLookup()
  const live = useCowork((st) => st.mode === 'live')
  const listId = useId()
  const folder = commonFolder(list.map((a) => a.relPath))
  const name = folderName(folder)
  const authors = [...new Set(list.map((a) => lookup(a.agentId).name))]
  // Desde el navegador no se puede abrir una carpeta del Mac.
  const canOpenFolder = !!api && live && !isWeb && !!folder
  return (
    <div className={cx(s.folder, open && s.folderOpen)} style={agentVars(lookup(list[0].agentId).color)}>
      <div className={s.folderHead}>
        <button
          type="button"
          className={s.folderToggle}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          title={folder || undefined}
        >
          <span className={s.folderIcon} aria-hidden="true">
            {open ? <FolderOpen size={20} /> : <Folder size={20} />}
          </span>
          <span className={s.artifactInfo}>
            <span className={s.artifactName}>{name}</span>
            <span className={s.artifactBy}>{folderSummary(list.map((a) => a.kind), authors)}</span>
          </span>
          <ChevronDown size={16} aria-hidden="true" className={s.folderChevron} />
        </button>
        {canOpenFolder && (
          <button
            type="button"
            className={cx(u.btn, u.btnSm)}
            title={t('Abrir {folder} en el Finder', { folder })}
            onClick={() => {
              setError(null)
              api?.openPath(projectId, folder).catch((e) => setError(errorText(e)))
            }}
          >
            {t('Abrir carpeta')}
          </button>
        )}
      </div>
      {error && (
        <p className={s.resumeError} role="alert">
          {error}
        </p>
      )}
      {open && (
        <ul id={listId} className={s.folderList} aria-label={t('Archivos de {name}', { name })}>
          {list.map((a) => (
            <ArtifactRow key={a.id} a={a} />
          ))}
        </ul>
      )}
    </div>
  )
}
