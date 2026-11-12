import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageCircleQuestion,
  ClipboardList,
  CircleCheck,
  CircleX,
  Clapperboard,
  FilePen,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  Gauge,
  Download,
  Globe,
  ListChecks,
  ExternalLink,
  Send,
  Sparkles,
  LoaderCircle,
  Mic,
  PenLine,
  Play,
  Search,
  SquareTerminal,
  ThumbsDown,
  ThumbsUp,
  Reply,
  User,
  Wrench,
  X
} from 'lucide-react'
import { INTERRUPTED_ERROR } from '@shared/defaults'
import { describeTrigger } from '@shared/routines'
import { replyExcerpt } from '@shared/replyTo'
import { answerLine, hideQuestionsBlock } from '@shared/agentQuestions'
import { commonFolder, folderName, folderSummary } from '@shared/deliverables'
import type { AgentQuestionAnswer, Artifact, Attachment, ChatMessage, ChatPermission, ChatQuestions, PermissionAnswer, MessageRating, PlanProposal, RoutineProposal, SkillProposal, InstagramPost, InstagramReplies, ScriptReview, TikTokPost, Task, TaskChangeSet, TaskWork, TraceEntry, TraceTool, UsageRun, WorkFile, WorkStep, WorkToolRef } from '@shared/types'
import { callTokens, compactTokens, deltaText, quotaDeltas, runDuration, shortDuration } from '@/lib/usageStats'
import { useCowork, useData } from '@/store/cowork'
import { revealKey, useRevealed } from '@/lib/reveal'
import { api, isWeb } from '@/lib/api'
import { ArtifactDownloadButton } from './ArtifactDownloadButton'
import { fileSize, timeHM } from '@/lib/format'
import { projectFileUrl } from '@/lib/localRefs'
import { fromArtifact, fromAttachment, fromWorkFile, isImageFile } from '@/lib/preview'
import { AgentAvatar, AgentPill } from '../common/AgentBits'
import { TaskSeq } from '../common/TaskSeq'
import { useAgentLookup } from '../common/agents'
import { useComposer } from './composerStore'
import { useMessageMenu } from './MessageMenu'
import { FileTypeIcon, KindTile, TaskStatusIcon } from '../common/icons'
import { MarkdownView } from '../common/MarkdownView'
import { agentVars, cx, errorText, formatDuration, isoTime, plural } from '../common/util'
import u from '../common/ui.module.css'
import { planProgress, progressHint, quietFor, quietText, shortClock } from '@/lib/progress'
import { useNow } from '../common/hooks'
import { TaskStages } from './TaskStages'
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

/** Quién lo envió: tú, una rutina, directo a un agente; y con qué plantilla, si fue con una. */
function userLabel(m: ChatMessage): string {
  const who = m.routine ? t('Rutina: {name}', { name: m.routine.name }) : m.direct ? t('Tú → {name} (directo, sin Hermes)', { name: m.direct.name }) : t('Tú')
  return m.template ? t('{who} · plantilla «{name}»', { who, name: m.template.name }) : who
}

function UserMessage({ m }: { m: ChatMessage }) {
  const parts = m.routine ? routineParts(m.text) : { request: m.text, data: null }
  const menu = useMessageMenu(m, { user: { text: parts.request } })
  const editing = useComposer((c) => c.editing === m.id)
  return (
    <article className={s.msg} onContextMenu={menu.onContextMenu}>
      <span className={cx(s.avatar, s.userAvatar)} aria-hidden="true">
        {m.routine ? <CalendarClock size={18} /> : <User size={18} />}
      </span>
      <div className={s.main}>
        <Meta name={userLabel(m)} ts={m.createdAt} />
        {m.replyTo && (
          <button
            type="button"
            className={s.replyQuote}
            title={t('Ir a la respuesta de {name}', { name: m.replyTo.name })}
            onClick={() => useCowork.setState({ focusMessage: { id: m.replyTo!.messageId, terms: [], nonce: Date.now() } })}
          >
            <Reply size={13} aria-hidden="true" />
            <span>{t('Sobre la respuesta de {name}: «{text}»', { name: m.replyTo.name, text: m.replyTo.excerpt })}</span>
          </button>
        )}
        {editing ? (
          <EditBox m={m} initial={parts.request} />
        ) : (
        <div className={cx(s.bubble, s.userBubble)}>
          {parts.request && <p className={s.userText}>{parts.request}</p>}
          {m.voiceNote && <VoiceNoteMark m={m} />}
          {parts.data && (
            <details className={s.routineData}>
              <summary>{t('Datos que trajo la rutina')}</summary>
              <pre>{parts.data}</pre>
            </details>
          )}
          {m.attachments && m.attachments.length > 0 && <Attachments list={m.attachments} projectId={m.projectId} />}
          <EditButton m={m} />
        </div>
        )}
        {m.versions && !editing && <VersionNav m={m} />}
        <MenuNote note={menu.note} />
      </div>
      {menu.menu}
    </article>
  )
}

/** El lápiz abajo a la derecha de tu mensaje: lo edita en su sitio, sin abrir el menú del clic derecho. */
function EditButton({ m }: { m: ChatMessage }) {
  const live = useCowork((st) => st.mode === 'live')
  if (!live || !api || m.routine || m.voiceNote === 'transcribing') return null
  return (
    <button
      type="button"
      className={s.editBtn}
      onClick={() => useComposer.getState().setEditing(m.id)}
      aria-label={t('Editar')}
      title={t('Lo cambias aquí mismo y se vuelve a enviar; lo de ahora queda guardado como otra versión (‹ ›)')}
    >
      <PenLine size={14} aria-hidden="true" />
    </button>
  )
}

/**
 * ‹ 2/3 › bajo un mensaje tuyo editado: cambia a otra versión de ese punto del chat (el mensaje y lo que vino
 * después). Mientras esa parte sigue trabajando, el motor no deja cambiar y lo dice.
 */
function VersionNav({ m }: { m: ChatMessage }) {
  const v = m.versions!
  const live = useCowork((st) => st.mode === 'live')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = v.others.length + 1
  const go = (to: number): void => {
    const a = api
    if (!a?.switchMessageVersion || busy || to < 0 || to >= total) return
    setBusy(true)
    setError(null)
    a.switchMessageVersion(m.projectId, m.id, to).then(
      () => setBusy(false),
      (e) => {
        setBusy(false)
        setError(errorText(e))
      }
    )
  }
  const off = !live || busy
  return (
    <div className={s.versions}>
      <button type="button" className={s.versionBtn} onClick={() => go(v.current - 1)} disabled={off || v.current === 0} aria-label={t('Versión anterior')} title={t('Versión anterior')}>
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
      <span className={s.versionCount} aria-label={t('Versión {n} de {total}', { n: String(v.current + 1), total: String(total) })}>
        {v.current + 1}/{total}
      </span>
      <button type="button" className={s.versionBtn} onClick={() => go(v.current + 1)} disabled={off || v.current === total - 1} aria-label={t('Versión siguiente')} title={t('Versión siguiente')}>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      {error && (
        <span className={s.ratingNote} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

/**
 * Tu mensaje en edición, en su sitio y en el mismo chat (como en Claude): Enviar lo manda otra vez con el texto
 * nuevo (y sus adjuntos); el mensaje de antes y lo que vino después quedan guardados como otra versión (‹ ›).
 * Cancelar (o Escape) lo deja como estaba. Enter envía y Mayús+Enter salta de línea.
 */
function EditBox({ m, initial }: { m: ChatMessage; initial: string }) {
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 360)}px`
  }, [text])
  const cancel = (): void => useComposer.getState().setEditing(null)
  const send = (): void => {
    const a = api
    if (!a || busy || (!text.trim() && !m.attachments?.length)) return
    setBusy(true)
    setError(null)
    a.sendMessage({
      projectId: m.projectId,
      text: text.trim(),
      filePaths: [],
      editOf: m.id,
      ...(m.attachments?.length ? { attachmentIds: m.attachments.map((x) => x.id) } : {}),
      ...(m.replyTo ? { replyTo: m.replyTo.messageId } : {})
    }).then(
      () => useComposer.getState().setEditing(null),
      (e) => {
        setBusy(false)
        setError(errorText(e))
      }
    )
  }
  return (
    <div className={cx(s.bubble, s.userBubble, s.editBox)}>
      <textarea
        ref={ref}
        className={s.editInput}
        value={text}
        rows={1}
        aria-label={t('Editar')}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            send()
          }
        }}
      />
      {m.attachments && m.attachments.length > 0 && <Attachments list={m.attachments} projectId={m.projectId} />}
      <div className={s.editBar}>
        <span className={s.editHint}>
          {t('La versión {n} se guarda (‹ ›)', { n: String((m.versions?.current ?? 0) + 1) })}
        </span>
        <button type="button" className={s.changesBtn} onClick={cancel} disabled={busy}>
          {t('Cancelar')}
        </button>
        <button type="button" className={cx(s.changesBtn, s.editSend)} onClick={send} disabled={busy || (!text.trim() && !m.attachments?.length)}>
          {busy ? t('Enviando…') : t('Enviar')}
        </button>
      </div>
      {error && (
        <p className={s.ratingNote} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Si kywai se cerró mientras transcribía, esa nota ya no llegará: pasado este rato se da por perdida. */
const VOICE_LOST_MS = 30 * 60_000

/** La marca de una nota de voz: se está pasando a texto, ya se envió dicha, o no se pudo. */
function VoiceNoteMark({ m }: { m: ChatMessage }) {
  const lost = m.voiceNote === 'transcribing' && Date.now() - m.createdAt > VOICE_LOST_MS
  if (m.voiceNote === 'transcribing' && !lost)
    return (
      <span className={s.voiceNote} role="status">
        <LoaderCircle size={13} aria-hidden="true" className={u.spin} />
        {t('Nota de voz · pasándola a texto…')}
      </span>
    )
  if (m.voiceNote === 'failed' || lost)
    return (
      <span className={cx(s.voiceNote, s.voiceNoteFailed)}>
        <Mic size={13} aria-hidden="true" />
        {t('Nota de voz · no se pudo pasar a texto')}
      </span>
    )
  return (
    <span className={s.voiceNote}>
      <Mic size={13} aria-hidden="true" />
      {t('Nota de voz')}
    </span>
  )
}

/** Los adjuntos de un mensaje: las imágenes en miniatura y el resto como fichas; al pulsarlos se abren en el panel de vista previa. */
function Attachments({ list, projectId }: { list: Attachment[]; projectId: string }) {
  const mode = useCowork((st) => st.mode)
  const openPreview = useCowork((st) => st.openPreview)
  const canOpen = !!api && mode === 'live'
  // Si una miniatura no carga (archivo borrado, demo…), ese adjunto vuelve a ser una ficha con su nombre.
  const [broken, setBroken] = useState<Set<string>>(() => new Set())
  const isThumb = (a: Attachment): boolean => canOpen && isImageFile(a.name, a.mime) && !broken.has(a.id)
  const images = list.filter(isThumb)
  const others = list.filter((a) => !isThumb(a))
  // Se recorren con ‹ › en el mismo orden en que se ven: primero las imágenes.
  const ordered = [...images, ...others]
  const open = (a: Attachment): void => openPreview(ordered.map((x) => fromAttachment(x, projectId)), ordered.indexOf(a))
  return (
    <>
      {images.length > 0 && (
        <ul className={cx(s.attThumbs, images.length === 1 && s.attThumbsOne)} aria-label={t('Imágenes adjuntas')}>
          {images.map((a) => (
            <li key={a.id}>
              <button type="button" className={s.attThumb} title={t('Ver {name} ({size})', { name: a.name, size: fileSize(a.size) })} aria-label={t('Ver {name}', { name: a.name })} onClick={() => open(a)}>
                <img
                  src={projectFileUrl(projectId, a.relPath, isWeb)}
                  alt={a.name}
                  loading="lazy"
                  onError={() => setBroken((b) => new Set(b).add(a.id))}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul className={s.attachments} aria-label={t('Adjuntos')}>
          {others.map((a) => (
            <li key={a.id}>
              <AttachmentChip a={a} canOpen={canOpen} onOpen={() => open(a)} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function AttachmentChip({ a, canOpen, onOpen }: { a: Attachment; canOpen: boolean; onOpen: () => void }) {
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
      title={t('Ver {name} ({size})', { name: a.name, size: fileSize(a.size) })}
      aria-label={t('Ver {name}', { name: a.name })}
      onClick={onOpen}
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
  const known = lookup(agentId)
  // Respuesta traída de otra app sin agente de kywai que la represente: se ve con el nombre de esa app.
  const look = m.importedFrom ? { ...known, name: m.importedFrom, initial: m.importedFrom.charAt(0).toUpperCase(), present: false } : known
  const isError = m.tone === 'error'
  const hasTasks = !!m.taskIds && m.taskIds.length > 0
  const hasArtifacts = !!m.artifactIds && m.artifactIds.length > 0
  const showText = !!m.text || !!m.streaming
  const questions = m.questions && !m.streaming ? m.questions : undefined
  // Aprobado, el plan se sigue con el bloque de tareas de siempre.
  const proposal = m.proposal && m.proposal.status !== 'approved' ? m.proposal : undefined
  // Un resultado se puede valorar: el de una tarea terminada o la respuesta final de un plan.
  const ratable = !m.streaming && !isError && (m.work?.status === 'done' || (hasTasks && !proposal && !!m.text))
  // «Crear vídeo de esto»: en cualquier respuesta con algo que contar (en vivo, no en el modo demo).
  const live = useCowork((st) => st.mode === 'live')
  const videoable = live && !m.streaming && !isError && !proposal && (m.text?.trim().length ?? 0) >= 40
  // «Responder»: lo siguiente que escribas va a este mismo agente sobre esta respuesta (para que la revise o siga).
  const replyable = live && !m.streaming && !isError && !proposal && !m.importedFrom && !!m.text?.trim()
  const menu = useMessageMenu(m, { agent: { agentId, name: look.name, replyable, videoable, ratable } })

  return (
    <article className={s.msg} style={agentVars(look.color)} onContextMenu={menu.onContextMenu}>
      <AgentAvatar look={look} size={40} className={s.robot} />
      <div className={s.main}>
        <Meta
          name={m.work?.by ? `${look.name} · ${m.work.by}` : look.name}
          ts={m.createdAt}
          onName={look.present ? () => select({ type: 'agent', id: agentId }) : undefined}
          nameTitle={t('Ver a {name} en el espacio', { name: look.name })}
        />
        {(showText || hasTasks || proposal || m.work || m.routineProposal || questions) && (
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
            {m.routineProposal && <RoutineProposalBlock m={m} proposal={m.routineProposal} />}
            {m.skillProposal && <SkillProposalBlock m={m} proposal={m.skillProposal} />}
            {m.instagramPost && <InstagramPostBlock m={m} post={m.instagramPost} />}
            {m.scriptReview && <ScriptReviewBlock m={m} review={m.scriptReview} />}
            {m.instagramReplies && <InstagramRepliesBlock m={m} replies={m.instagramReplies} />}
            {m.tiktokPost && <TikTokPostBlock m={m} post={m.tiktokPost} />}
            {m.permission && <PermissionBlock permission={m.permission} />}
            {questions && <QuestionsBlock m={m} questions={questions} name={look.name} />}
            {hasTasks && <PlanBlock taskIds={m.taskIds!} runId={m.runId} contract={m.contract} />}
          </div>
        )}
        {hasArtifacts && <ArtifactCards ids={m.artifactIds!} projectId={m.projectId} />}
        {m.work && m.work.status !== 'running' && <ChangesRow projectId={m.projectId} taskId={m.work.taskId} />}
        {ratable ? (
          <RatingRow m={m} video={videoable} reply={replyable ? { agentId, name: look.name } : undefined} />
        ) : (
          (videoable || replyable) && (
            <div className={s.rating}>
              {replyable && <ReplyButton m={m} agentId={agentId} name={look.name} />}
              {videoable && <VideoFromButton m={m} />}
            </div>
          )
        )}
        <MenuNote note={menu.note} />
      </div>
      {menu.menu}
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

/** Lo que dice la última acción del menú de clic derecho del mensaje («Copiado», o el error). */
function MenuNote({ note }: { note: { text: string; error: boolean } | null }) {
  if (!note) return null
  return (
    <p className={s.ratingNote} role={note.error ? 'alert' : 'status'}>
      {note.text}
    </p>
  )
}

/** «Responder»: prepara el cuadro de texto para contestar a esta respuesta; lo que envíes va a este mismo agente. */
function ReplyButton({ m, agentId, name }: { m: ChatMessage; agentId: string; name: string }) {
  const current = useComposer((c) => c.replyTo?.messageId === m.id)
  const go = (): void => {
    const c = useComposer.getState()
    c.setReplyTo(current ? null : { messageId: m.id, agentId, name, excerpt: replyExcerpt(m.text) })
  }
  return (
    <button
      type="button"
      className={cx(s.ratingBtn, s.videoBtn, current && s.ratingOn)}
      title={t('Responder a {name}: lo que escribas le llega a él para que revise o continúe esta respuesta', { name })}
      aria-pressed={current}
      onClick={go}
    >
      <Reply size={14} aria-hidden="true" />
      <span>{t('Responder')}</span>
    </button>
  )
}

/** «Crear vídeo de esto»: el equipo hace un vídeo que cuenta este mensaje y solo entrega el MP4. */
function VideoFromButton({ m }: { m: ChatMessage }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const go = (): void => {
    const a = api
    if (!a || state !== 'idle') return
    setState('sending')
    setError(null)
    a.sendMessage({ projectId: m.projectId, text: '', filePaths: [], videoFrom: m.id }).then(
      () => setState('sent'),
      (e) => {
        setState('idle')
        setError(errorText(e))
      }
    )
  }
  const label = state === 'sent' ? t('Vídeo pedido') : t('Crear vídeo de esto')
  return (
    <>
      <button type="button" className={cx(s.ratingBtn, s.videoBtn)} title={t('Crear un vídeo que cuente este mensaje')} disabled={state !== 'idle'} onClick={go}>
        <Clapperboard size={14} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {error && <span className={s.ratingNote} role="alert">{error}</span>}
    </>
  )
}

/** 👍/👎 bajo un resultado: lo que mide si el trabajo te sirvió (va al registro de consumo y a la ficha del agente). */
function RatingRow({ m, video = false, reply }: { m: ChatMessage; video?: boolean; reply?: { agentId: string; name: string } }) {
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
      {reply && <ReplyButton m={m} agentId={reply.agentId} name={reply.name} />}
      {video && <VideoFromButton m={m} />}
      {m.rating && <span className={s.ratingNote}>{m.rating === 'up' ? t('Te sirvió: lo tendrá en cuenta el coordinador.') : t('No te sirvió: lo tendrá en cuenta el coordinador.')}</span>}
    </div>
  )
}

// ---------- Lo que cuenta un agente mientras trabaja ----------

const WORK_STATE: Record<TaskWork['status'], string> = { running: t('Trabajando'), done: t('Hecha'), failed: t('No pudo hacerla'), stopped: t('Detenida'), blocked: t('Bloqueada: te necesita') }

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
  // Ya entregó y otro agente lo revisa: no está «trabajando» (su robot queda libre en el 3D).
  // Cerrado pero la tarea vuelve a la cola (a corregir lo que vio el verificador): no está detenida, espera.
  const queued = work.status === 'stopped' && (task?.status === 'pending' || task?.status === 'blocked')
  const state = work.status === 'running' && !live ? t('Detenida') : live && task?.phase === 'verify' ? t('En revisión') : queued ? t('En cola') : WORK_STATE[work.status]
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
  const liveLine = live ? <LiveLine task={task!} reduced={reduced} /> : null
  // Al terminar bien mientras la mirabas: un destello verde una vez (no al abrir un chat ya terminado).
  const wasLive = useRef(live)
  const [celebrate, setCelebrate] = useState(false)
  useEffect(() => {
    if (wasLive.current && !live && work.status === 'done' && !reduced) {
      setCelebrate(true)
      const id = window.setTimeout(() => setCelebrate(false), 1800)
      wasLive.current = live
      return () => window.clearTimeout(id)
    }
    wasLive.current = live
  }, [live, work.status, reduced])
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
    <div className={cx(s.work, celebrate && s.workCelebrate)}>
      <button
        type="button"
        className={s.workHead}
        onClick={() => (count > 0 ? setOpen((o) => !o) : openTrace(work.taskId))}
        title={count > 0 ? (open ? t('Ocultar lo que hizo') : t('Ver lo que hizo')) : t('Ver todo lo que hizo, paso a paso')}
      >
        {live ? <LoaderCircle size={14} className={cx(s.workSpin, !reduced && u.spin)} aria-hidden="true" /> : <ListChecks size={14} aria-hidden="true" />}
        <span className={s.workTitle}>
          <TaskSeq seq={work.seq} />
          {work.title}
        </span>
        <span className={cx(s.workState, work.status === 'failed' && s.workFailed, work.status === 'blocked' && s.workBlocked)}>{state}</span>
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
  // Mientras llega, el bloque de preguntas no se ve (al terminar sale como tarjeta).
  const text = m.streaming && m.text.includes('```') ? hideQuestionsBlock(m.text) : m.text
  const { shown, revealing } = useRevealed(revealKey(m.id), text)
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
  const openPreview = useCowork((st) => st.openPreview)
  // Se abren en el panel de vista previa y se recorren con ‹ › en el orden en que se ven.
  const ordered = [...images, ...docs]
  const open = (f: WorkFile): void => openPreview(ordered.map((x) => fromWorkFile(x, projectId)), ordered.indexOf(f))
  return (
    <li className={s.filesStep}>
      {images.length > 0 && (
        <div className={s.thumbs}>
          {images.map((f) => (
            <button key={f.relPath} type="button" className={s.thumb} title={t('Ver {name}', { name: f.name })} onClick={() => open(f)}>
              <img src={projectFileUrl(projectId, f.relPath, isWeb)} alt={f.name} loading="lazy" />
              <span>{f.name}</span>
            </button>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div className={s.docChips}>
          {docs.map((f) => (
            <button key={f.relPath} type="button" className={s.docChip} title={t('Ver {name} ({size})', { name: f.name, size: fileSize(f.size) })} onClick={() => open(f)}>
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

/**
 * Lo que hace ahora una tarea en marcha, con su reloj corriendo. Si el agente lleva un rato callado (pensando o
 * escribiendo un archivo largo de una vez), lo dice con el tiempo: así se ve que sigue vivo y no parece atascado.
 */
function LiveLine({ task, reduced }: { task: Task; reduced: boolean }) {
  const runtime = useData((d) => d.runtimes[task.agentId])
  const now = useNow(1000)
  const quiet = quietText(quietFor(runtime, now))
  // Las últimas acciones reales del agente: la nueva entra deslizándose y empuja a las anteriores, que se apagan.
  const [feed, setFeed] = useState<{ text: string; at: number }[]>([])
  useEffect(() => {
    const text = task.lastActivity
    if (!text) return
    setFeed((f) => (f[0]?.text === text ? f : [{ text, at: Date.now() }, ...f].slice(0, 3)))
  }, [task.lastActivity])
  return (
    <>
      {task.phase && (
        <li className={s.liveStages}>
          <TaskStages task={task} reduced={reduced} />
        </li>
      )}
      <li className={s.liveLine}>
        <TypingDots reduced={reduced} />
        {task.startedAt && <span className={s.liveClock}>{formatDuration(now - task.startedAt)}</span>}
        {quiet && <span>{quiet}</span>}
      </li>
      {feed.map((f, i) => (
        <li key={`${f.at}-${f.text}`} className={cx(s.feedItem, i === 0 && !reduced && s.feedNew)} style={{ opacity: 1 - i * 0.3 }}>
          {t(f.text)}
        </li>
      ))}
    </>
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

/** Rutina que propone Hermes: se crea con un toque, se cambia en el cuadro de texto («/rutina …») o se descarta. */
const PERMISSION_DONE: Record<PermissionAnswer, string> = {
  deny: t('Denegado'),
  once: t('Permitido una vez'),
  session: t('Permitido en esta sesión')
}

/**
 * Un agente pide permiso (modo «Preguntarme antes») y espera: Denegar, Permitir una vez o Permitir siempre en esta
 * sesión. Son los mismos botones que el aviso de «Te necesita» (contestar en un sitio cierra el otro).
 */
function PermissionBlock({ permission }: { permission: ChatPermission }) {
  const live = useCowork((st) => st.mode === 'live')
  const [busy, setBusy] = useState<PermissionAnswer | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (permission.state !== 'pending') {
    return (
      <p className={cx(s.permissionDone, permission.state === 'deny' && s.permissionDenied)}>
        {permission.state === 'deny' ? <X size={14} aria-hidden="true" /> : <CircleCheck size={14} aria-hidden="true" />}
        {PERMISSION_DONE[permission.state]}
      </p>
    )
  }
  const canAct = !!api && live && !busy
  function act(answer: PermissionAnswer): void {
    const a = api
    if (!a || busy) return
    setBusy(answer)
    setError(null)
    a.actInbox(permission.inboxId, `perm-${answer}`).then(
      () => setBusy(null),
      (e) => {
        setBusy(null)
        setError(errorText(e))
      }
    )
  }
  const spin = (a: PermissionAnswer) => busy === a && <LoaderCircle size={14} aria-hidden="true" className={u.spin} />
  return (
    <div className={s.proposalActions} role="group" aria-label={t('Permiso')}>
      <button type="button" className={u.btn} disabled={!canAct} onClick={() => act('deny')}>
        {spin('deny')}
        {t('Denegar')}
      </button>
      <button type="button" className={cx(u.btn, u.btnPrimary)} disabled={!canAct} onClick={() => act('once')}>
        {spin('once')}
        {t('Permitir una vez')}
      </button>
      <button type="button" className={u.btn} disabled={!canAct} onClick={() => act('session')}>
        {spin('session')}
        {t('Permitir siempre en esta sesión')}
      </button>
      {error && <span className={s.permissionError}>{error}</span>}
    </div>
  )
}

/**
 * Preguntas del agente con opciones, como la tarjeta de preguntas de Claude: una cada vez («1 de 3», con ‹ ›), las
 * opciones numeradas con su explicación, la que el agente cree mejor marcada «Recomendada» y, siempre al final, un
 * campo para escribir tu propia respuesta u «Omitir». Al contestar la última, todo vuelve al agente que preguntó (o al
 * coordinador). Con la ✕ se pliega sin contestar; contestadas, queda el resumen.
 */
function QuestionsBlock({ m, questions, name }: { m: ChatMessage; questions: ChatQuestions; name: string }) {
  const live = useCowork((st) => st.mode === 'live')
  const items = questions.items
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<(AgentQuestionAnswer | undefined)[]>(() => items.map(() => undefined))
  const [draft, setDraft] = useState('')
  const [closed, setClosed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  // Pregunta de varias: las marcadas de la pregunta abierta (se guardan al pasar con «Siguiente»).
  const [picked, setPicked] = useState<number[]>([])
  const done = questions.answered

  if (done) {
    return (
      <div className={s.questionsDone} role="group" aria-label={t('Tus respuestas')}>
        <p className={s.permissionDone}>
          <CircleCheck size={14} aria-hidden="true" />
          {t('Contestado')}
        </p>
        <ol className={s.questionsSummary}>
          {items.map((q, i) => (
            <li key={i}>
              <span className={s.questionsSummaryQ}>{q.question}</span>
              <span className={s.questionsSummaryA}>{answerLine(q, done.answers[i]) || t('Omitida')}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  if (closed) {
    return (
      <div className={s.proposalActions}>
        <button type="button" className={u.btn} onClick={() => setClosed(false)}>
          <MessageCircleQuestion size={14} aria-hidden="true" />
          {items.length === 1 ? t('Contestar la pregunta') : t('Contestar las {n} preguntas', { n: items.length })}
        </button>
      </div>
    )
  }

  const q = items[Math.min(index, items.length - 1)]
  const current = answers[index]
  const canAct = !!api && live && !busy
  const isLast = answers.every((x, i) => i === index || !!x)

  function submit(all: (AgentQuestionAnswer | undefined)[]): void {
    const a = api
    if (!a) return
    setBusy(true)
    setError(null)
    a.sendMessage({ projectId: m.projectId, text: '', filePaths: [], answers: { messageId: m.id, answers: all.map((x) => x ?? { skipped: true }) } }).then(
      () => setBusy(false),
      (e) => {
        setBusy(false)
        setError(errorText(e))
      }
    )
  }

  function answer(value: AgentQuestionAnswer): void {
    if (!canAct) return
    const next = answers.slice()
    next[index] = value
    setAnswers(next)
    // La siguiente sin contestar; si no queda ninguna, se envía todo.
    const after = next.findIndex((x, i) => i > index && !x)
    const before = next.findIndex((x) => !x)
    const go = after >= 0 ? after : before
    if (go >= 0) {
      setIndex(go)
      setDraft(next[go]?.text ?? '')
      setPicked(next[go]?.choices ?? [])
      cardRef.current?.focus()
    } else submit(next)
  }

  function typed(): void {
    const text = draft.trim()
    if (q.multiple) {
      if (picked.length || text) answer({ ...(picked.length ? { choices: [...picked].sort((a, b) => a - b) } : {}), ...(text ? { text } : {}) })
    } else if (text) answer({ text })
  }

  function choose(i: number): void {
    if (!q.multiple) return answer({ choice: i })
    if (canAct) setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))
  }

  function move(to: number): void {
    const i = Math.max(0, Math.min(items.length - 1, to))
    setIndex(i)
    setDraft(answers[i]?.text ?? '')
    setPicked(answers[i]?.choices ?? [])
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.target instanceof HTMLInputElement) return
    const n = Number(e.key)
    if (Number.isInteger(n) && n >= 1 && n <= q.options.length) {
      e.preventDefault()
      choose(n - 1)
    } else if (e.key === 'ArrowLeft' && index > 0) move(index - 1)
    else if (e.key === 'ArrowRight' && index < items.length - 1) move(index + 1)
  }

  return (
    <div ref={cardRef} className={s.questions} role="group" aria-label={t('{name} te pregunta', { name })} tabIndex={-1} onKeyDown={onKey}>
      <div className={s.questionsHead}>
        <div className={s.questionsTitleBox}>
          <p className={s.questionsTitle}>{q.question}</p>
          {q.multiple && <p className={s.questionsHint}>{t('Puedes elegir varias')}</p>}
        </div>
        {items.length > 1 && (
          <div className={s.questionsPager}>
            <button type="button" className={s.questionsNav} disabled={index === 0} onClick={() => move(index - 1)} aria-label={t('Pregunta anterior')}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span>{t('{i} de {n}', { i: index + 1, n: items.length })}</span>
            <button type="button" className={s.questionsNav} disabled={index === items.length - 1} onClick={() => move(index + 1)} aria-label={t('Pregunta siguiente')}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}
        <button type="button" className={s.questionsNav} onClick={() => setClosed(true)} aria-label={t('Cerrar sin contestar')} title={t('Cerrar sin contestar')}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <ol className={s.questionsList}>
        {q.options.map((op, i) => (
          <li key={i}>
            <button
              type="button"
              className={cx(s.questionsOption, (q.multiple ? picked.includes(i) : current?.choice === i) && s.questionsChosen)}
              disabled={!canAct}
              onClick={() => choose(i)}
              {...(q.multiple ? { role: 'checkbox', 'aria-checked': picked.includes(i) } : {})}
            >
              <span className={cx(s.questionsNum, q.multiple && picked.includes(i) && s.questionsNumOn)}>
                {q.multiple && picked.includes(i) ? <CircleCheck size={15} aria-hidden="true" /> : i + 1}
              </span>
              <span className={s.questionsText}>
                <span className={s.questionsLabel}>
                  {op.label}
                  {op.recommended && <span className={s.questionsRec}>{t('Recomendada')}</span>}
                </span>
                {op.detail && <span className={s.questionsDetail}>{op.detail}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className={s.questionsOther}>
        <span className={s.questionsNum} aria-hidden="true">
          <PenLine size={14} />
        </span>
        <input
          ref={inputRef}
          className={s.questionsInput}
          value={draft}
          placeholder={q.multiple ? t('Algo más: escríbelo aquí') : t('Otra cosa: escribe tu respuesta')}
          aria-label={t('Tu propia respuesta')}
          maxLength={2000}
          disabled={!canAct}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              typed()
            }
          }}
        />
        {draft.trim() || (q.multiple && picked.length) ? (
          <button type="button" className={cx(u.btn, u.btnPrimary)} disabled={!canAct} onClick={typed}>
            {busy ? <LoaderCircle size={14} aria-hidden="true" className={u.spin} /> : isLast ? <Send size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            {isLast ? t('Enviar') : t('Siguiente')}
          </button>
        ) : (
          <button type="button" className={u.btn} disabled={!canAct} onClick={() => answer({ skipped: true })}>
            {busy && <LoaderCircle size={14} aria-hidden="true" className={u.spin} />}
            {t('Omitir')}
          </button>
        )}
      </div>
      {error && <p className={s.permissionError}>{error}</p>}
    </div>
  )
}

const TIKTOK_PRIVACY: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Todo el mundo',
  MUTUAL_FOLLOW_FRIENDS: 'Amigos (os seguís)',
  FOLLOWER_OF_CREATOR: 'Seguidores',
  SELF_ONLY: 'Solo yo (privado)'
}

/**
 * Vídeo listo para el TikTok de kywai: «Enviar como borrador» lo deja en la bandeja de la app; con permiso para
 * publicar directo, se elige a quién se enseña (sin nada marcado, como pide TikTok), comentarios, dúos y stitch, y
 * se acepta su declaración de uso de música al pulsar «Publicar».
 */
function TikTokPostBlock({ m, post }: { m: ChatMessage; post: TikTokPost }) {
  const live = useCowork((st) => st.mode === 'live')
  const [caption, setCaption] = useState(post.caption)
  const [privacy, setPrivacy] = useState('')
  const [comments, setComments] = useState(false)
  const [duet, setDuet] = useState(false)
  const [stitch, setStitch] = useState(false)
  const [promo, setPromo] = useState(false)
  const [busy, setBusy] = useState<'draft' | 'publish' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setCaption(post.caption), [post.caption])
  const open = post.status === 'pending' || post.status === 'failed'
  const canAct = !!api && live && open

  function act(kind: 'draft' | 'publish' | 'dismiss'): void {
    const a = api
    if (!a || busy) return
    setBusy(kind)
    setError(null)
    const choice = kind === 'publish' ? { caption, privacy, allowComments: comments, allowDuet: duet, allowStitch: stitch, promotional: promo } : kind === 'draft' ? { caption } : undefined
    a.decideTikTokPost(m.projectId, m.id, kind, choice).then(
      () => setBusy(null),
      (e) => {
        setBusy(null)
        setError(errorText(e))
      }
    )
  }

  const who = post.name || t('la cuenta de kywai')
  const title =
    post.status === 'published'
      ? t('Publicado en TikTok ({who})', { who })
      : post.status === 'drafted'
        ? t('En la bandeja de TikTok ({who})', { who })
        : post.status === 'sending'
          ? t('Subiendo a TikTok ({who})…', { who })
          : post.status === 'dismissed'
            ? t('Vídeo descartado')
            : post.status === 'failed'
              ? t('No se pudo subir a TikTok')
              : t('Vídeo para TikTok ({who})', { who })
  const toggle = (label: string, on: boolean, set: (v: boolean) => void, disabled?: boolean) => (
    <label className={s.ttToggle}>
      <input type="checkbox" checked={on && !disabled} disabled={!canAct || !!busy || disabled} onChange={(e) => set(e.currentTarget.checked)} />
      {label}
      {disabled && <span className={s.ttOff}>{t('(la cuenta lo tiene desactivado)')}</span>}
    </label>
  )
  return (
    <div className={cx(s.proposal, s.instagramPost, post.status === 'dismissed' && s.proposalClosed)}>
      <div className={s.planHead}>
        <span className={s.planIcon} aria-hidden="true">
          {post.status === 'published' || post.status === 'drafted' ? <CircleCheck size={18} /> : post.status === 'dismissed' ? <X size={18} /> : post.status === 'failed' ? <AlertCircle size={18} /> : post.status === 'sending' ? <LoaderCircle size={18} className={u.spin} /> : <Send size={18} />}
        </span>
        <div className={s.planInfo}>
          <span className={s.planTitle}>{title}</span>
          <span className={s.planSub}>{post.video}</span>
        </div>
      </div>
      {open || post.status === 'drafted' ? (
        <textarea className={s.igCaption} value={caption} maxLength={2200} rows={5} aria-label={t('Texto de la publicación')} readOnly={!open} disabled={open && (!canAct || !!busy)} onChange={(e) => setCaption(e.currentTarget.value)} />
      ) : (
        post.status !== 'dismissed' && <p className={s.routineRequest}>{post.caption}</p>
      )}
      {post.status === 'drafted' && <p className={s.planSub}>{t('Un borrador de TikTok no lleva texto: cópialo de aquí al publicarlo desde la app.')}</p>}
      {open && post.direct && (
        <div className={s.ttDirect}>
          <label className={s.ttRow}>
            {t('Quién puede verlo')}
            <select value={privacy} disabled={!canAct || !!busy} onChange={(e) => setPrivacy(e.currentTarget.value)} aria-label={t('Quién puede verlo')}>
              <option value="">{t('Elige…')}</option>
              {(post.privacyOptions ?? []).map((p) => (
                <option key={p} value={p}>
                  {t(TIKTOK_PRIVACY[p] ?? p)}
                </option>
              ))}
            </select>
          </label>
          {toggle(t('Permitir comentarios'), comments, setComments, post.commentDisabled)}
          {toggle(t('Permitir dúos'), duet, setDuet, post.duetDisabled)}
          {toggle(t('Permitir stitch'), stitch, setStitch, post.stitchDisabled)}
          {toggle(t('Es contenido promocional de kywai'), promo, setPromo)}
          <p className={s.planSub}>
            {t('Al publicar, aceptas la')}{' '}
            <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">
              {t('Declaración de uso de música de TikTok')}
            </a>
            {'. '}
            {t('Se marca como contenido hecho con IA.')}
          </p>
        </div>
      )}
      {post.error && (
        <p className={s.resumeError} role="alert">
          {post.error}
        </p>
      )}
      {open && (
        <div className={s.proposalActions}>
          {post.direct && (
            <button type="button" className={cx(u.btn, u.btnPrimary)} disabled={!canAct || !!busy || !caption.trim() || !privacy} onClick={() => act('publish')}>
              {busy === 'publish' ? <LoaderCircle size={14} aria-hidden="true" className={u.spin} /> : <Send size={14} aria-hidden="true" />}
              {t('Publicar')}
            </button>
          )}
          <button type="button" className={cx(u.btn, !post.direct && u.btnPrimary)} disabled={!canAct || !!busy} onClick={() => act('draft')}>
            {busy === 'draft' && <LoaderCircle size={14} aria-hidden="true" className={u.spin} />}
            {post.status === 'failed' ? t('Reintentar como borrador') : t('Enviar como borrador')}
          </button>
          <button type="button" className={u.btn} disabled={!canAct || !!busy} onClick={() => act('dismiss')}>
            {busy === 'dismiss' && <LoaderCircle size={14} aria-hidden="true" className={u.spin} />}
            {t('Descartar')}
          </button>
        </div>
      )}
      {error && (
        <p className={s.resumeError} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Reel listo para el Instagram de kywai: el texto se puede cambiar antes de «Publicar»; nada sale sin pulsarlo. */
function InstagramPostBlock({ m, post }: { m: ChatMessage; post: InstagramPost }) {
  const live = useCowork((st) => st.mode === 'live')
  const [caption, setCaption] = useState(post.caption)
  const [busy, setBusy] = useState<'publish' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setCaption(post.caption), [post.caption])
  const open = post.status === 'pending' || post.status === 'failed'
  const canAct = !!api && live && open

  function act(kind: 'publish' | 'dismiss'): void {
    const a = api
    if (!a || busy) return
    setBusy(kind)
    setError(null)
    a.decideInstagramPost(m.projectId, m.id, kind, kind === 'publish' ? caption : undefined).then(
      () => setBusy(null),
      (e) => {
        setBusy(null)
        setError(errorText(e))
      }
    )
  }

  const who = post.username ? `@${post.username}` : t('la cuenta de kywai')
  const title =
    post.status === 'published'
      ? post.trial
        ? t('Publicado como reel de prueba ({who})', { who })
        : t('Publicado en Instagram ({who})', { who })
      : post.status === 'publishing'
        ? t('Publicando en Instagram ({who})…', { who })
        : post.status === 'dismissed'
          ? t('Reel descartado')
          : post.status === 'failed'
            ? t('No se pudo publicar en Instagram')
            : post.trial
              ? t('Reel de prueba para Instagram ({who})', { who })
              : t('Reel para Instagram ({who})', { who })
  return (
    <div className={cx(s.proposal, s.instagramPost, post.status === 'dismissed' && s.proposalClosed)}>
      <div className={s.planHead}>
        <span className={s.planIcon} aria-hidden="true">
          {post.status === 'published' ? <CircleCheck size={18} /> : post.status === 'dismissed' ? <X size={18} /> : post.status === 'failed' ? <AlertCircle size={18} /> : post.status === 'publishing' ? <LoaderCircle size={18} className={u.spin} /> : <Send size={18} />}
        </span>
        <div className={s.planInfo}>
          <span className={s.planTitle}>{title}</span>
          <span className={s.planSub}>{post.video}</span>
        </div>
      </div>
      {open ? (
        <textarea className={s.igCaption} value={caption} maxLength={2200} rows={6} aria-label={t('Texto de la publicación')} disabled={!canAct || !!busy} onChange={(e) => setCaption(e.currentTarget.value)} />
      ) : (
        post.status !== 'dismissed' && <p className={s.routineRequest}>{post.caption}</p>
      )}
      {post.status === 'failed' && post.error && (
        <p className={s.resumeError} role="alert">
          {post.error}
        </p>
      )}
      {open && (
        <div className={s.proposalActions}>
          <button type="button" className={cx(u.btn, u.btnPrimary)} disabled={!canAct || !!busy || !caption.trim()} onClick={() => act('publish')}>
            {busy === 'publish' ? <LoaderCircle size={14} aria-hidden="true" className={u.spin} /> : <Send size={14} aria-hidden="true" />}
            {post.status === 'failed' ? t('Reintentar') : t('Publicar')}
          </button>
          <button type="button" className={u.btn} disabled={!canAct || !!busy} onClick={() => act('dismiss')}>
            {busy === 'dismiss' && <LoaderCircle size={14} aria-hidden="true" className={u.spin} />}
            {t('Descartar')}
          </button>
        </div>
      )}
      {post.status === 'published' && post.permalink && (
        <div className={s.proposalActions}>
          <a className={cx(u.btn, u.btnSm)} href={post.permalink} target="_blank" rel="noreferrer">
            <ExternalLink size={14} aria-hidden="true" />
            {t('Ver en Instagram')}
          </a>
        </div>
      )}
      {error && (
        <p className={s.resumeError} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** «Repasar el guion antes de grabar»: cada escena editable; el vídeo se graba con «Grabar» (con tus cambios). */
function ScriptReviewBlock({ m, review }: { m: ChatMessage; review: ScriptReview }) {
  const live = useCowork((st) => st.mode === 'live')
  const [scenes, setScenes] = useState(review.scenes)
  const [busy, setBusy] = useState<'record' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setScenes(review.scenes), [review.scenes])
  const open = review.status === 'pending'
  const canAct = !!api && live && open

  function act(kind: 'record' | 'dismiss'): void {
    const a = api
    if (!a || busy) return
    setBusy(kind)
    setError(null)
    a.decideScriptReview(m.projectId, m.id, kind, kind === 'record' ? scenes : undefined).then(
      () => setBusy(null),
      (e) => {
        setBusy(null)
        setError(errorText(e))
      }
    )
  }

  const edit = (i: number, patch: Partial<ScriptReview['scenes'][number]>): void => setScenes((list) => list.map((sc, j) => (j === i ? { ...sc, ...patch } : sc)))
  const title =
    review.status === 'recorded'
      ? t('Guion grabado: {title}', { title: review.title })
      : review.status === 'recording'
        ? t('Grabando «{title}»…', { title: review.title })
        : review.status === 'dismissed'
          ? t('Guion descartado')
          : review.status === 'expired'
            ? t('El guion ya no espera respuesta')
            : t('Guion para repasar: {title}', { title: review.title })
  return (
    <div className={cx(s.proposal, s.instagramPost, (review.status === 'dismissed' || review.status === 'expired') && s.proposalClosed)}>
      <div className={s.planHead}>
        <span className={s.planIcon} aria-hidden="true">
          {review.status === 'recorded' ? <CircleCheck size={18} /> : review.status === 'dismissed' || review.status === 'expired' ? <X size={18} /> : review.status === 'recording' ? <LoaderCircle size={18} className={u.spin} /> : <Send size={18} />}
        </span>
        <div className={s.planInfo}>
          <span className={s.planTitle}>{title}</span>
          <span className={s.planSub}>{t('{n} escenas', { n: review.scenes.length })}</span>
        </div>
      </div>
      {review.status !== 'dismissed' && (
        <ol className={s.scriptScenes}>
          {scenes.map((sc, i) => (
            <li key={i}>
              {open ? (
                <>
                  <input className={s.igCaption} value={sc.heading} maxLength={60} aria-label={t('Rótulo de la escena {n}', { n: i + 1 })} disabled={!canAct || !!busy} onChange={(e) => edit(i, { heading: e.currentTarget.value })} />
                  <textarea className={s.igCaption} value={sc.narration} maxLength={600} rows={3} aria-label={t('Lo que se dice en la escena {n}', { n: i + 1 })} disabled={!canAct || !!busy} onChange={(e) => edit(i, { narration: e.currentTarget.value })} />
                </>
              ) : (
                <p className={s.routineRequest}>
                  <b>{sc.heading}</b> {sc.narration}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {open && (
        <div className={s.proposalActions}>
          <button type="button" className={cx(u.btn, u.btnPrimary)} disabled={!canAct || !!busy || scenes.some((sc) => !sc.narration.trim())} onClick={() => act('record')}>
            {busy === 'record' ? <LoaderCircle size={14} aria-hidden="true" className={u.spin} /> : <Send size={14} aria-hidden="true" />}
            {t('Grabar')}
          </button>
          <button type="button" className={u.btn} disabled={!canAct || !!busy} onClick={() => act('dismiss')}>
            {busy === 'dismiss' && <LoaderCircle size={14} aria-hidden="true" className={u.spin} />}
            {t('Descartar')}
          </button>
        </div>
      )}
      {error && (
        <p className={s.resumeError} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** «/ig-reply»: cada comentario con su respuesta editable; nada se envía sin «Responder» (o «Responder todas»). */
function InstagramRepliesBlock({ m, replies }: { m: ChatMessage; replies: InstagramReplies }) {
  const live = useCowork((st) => st.mode === 'live')
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = replies.status === 'pending'
  const canAct = !!api && live && open
  const pending = replies.items.filter((i) => i.status === 'pending' || i.status === 'failed')

  function act(kind: 'send' | 'skip' | 'dismiss', commentId?: string): void {
    const a = api
    if (!a || busy) return
    setBusy(`${kind}:${commentId ?? 'all'}`)
    setError(null)
    a.decideInstagramReply(m.projectId, m.id, kind, commentId, commentId ? texts[commentId] : undefined).then(
      () => setBusy(null),
      (e) => {
        setBusy(null)
        setError(errorText(e))
      }
    )
  }

  const who = replies.username ? `@${replies.username}` : t('la cuenta de kywai')
  const sent = replies.items.filter((i) => i.status === 'sent').length
  const title =
    replies.status === 'dismissed'
      ? t('Respuestas descartadas')
      : replies.status === 'done'
        ? t('Respuestas a comentarios ({who}): {n} enviadas', { who, n: sent })
        : t('Respuestas a comentarios de Instagram ({who})', { who })
  return (
    <div className={cx(s.proposal, s.instagramPost, replies.status === 'dismissed' && s.proposalClosed)}>
      <div className={s.planHead}>
        <span className={s.planIcon} aria-hidden="true">
          {replies.status === 'done' ? <CircleCheck size={18} /> : replies.status === 'dismissed' ? <X size={18} /> : <Send size={18} />}
        </span>
        <div className={s.planInfo}>
          <span className={s.planTitle}>{title}</span>
          <span className={s.planSub}>{t('Nada se envía sin tu «Responder».')}</span>
        </div>
      </div>
      {replies.status !== 'dismissed' && (
        <ul className={s.igReplies}>
          {replies.items.map((i) => {
            const editable = canAct && (i.status === 'pending' || i.status === 'failed')
            const key = (k: string): string => `${k}:${i.commentId}`
            return (
              <li key={i.commentId} className={cx(s.igReply, i.status === 'skipped' && s.proposalClosed)}>
                <p className={s.igReplyComment}>
                  <strong>@{i.author}</strong> {i.comment}
                  {i.kind && <span className={s.igReplyKind}>{i.kind}</span>}
                </p>
                {editable ? (
                  <textarea
                    className={s.igCaption}
                    rows={2}
                    maxLength={2200}
                    aria-label={t('Respuesta a @{who}', { who: i.author })}
                    value={texts[i.commentId] ?? i.reply}
                    disabled={!!busy}
                    onChange={(e) => {
                      const v = e.currentTarget.value
                      setTexts((x) => ({ ...x, [i.commentId]: v }))
                    }}
                  />
                ) : (
                  i.reply && <p className={s.routineRequest}>{i.reply}</p>
                )}
                {i.status === 'failed' && i.error && (
                  <p className={s.resumeError} role="alert">
                    {i.error}
                  </p>
                )}
                <div className={s.proposalActions}>
                  {editable ? (
                    <>
                      <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={!!busy || !(texts[i.commentId] ?? i.reply).trim()} onClick={() => act('send', i.commentId)}>
                        {busy === key('send') ? <LoaderCircle size={14} aria-hidden="true" className={u.spin} /> : <Send size={14} aria-hidden="true" />}
                        {i.status === 'failed' ? t('Reintentar') : t('Responder')}
                      </button>
                      <button type="button" className={cx(u.btn, u.btnSm)} disabled={!!busy} onClick={() => act('skip', i.commentId)}>
                        {t('Saltar')}
                      </button>
                    </>
                  ) : (
                    <span className={s.planSub}>
                      {i.status === 'sent' ? t('Enviada') : i.status === 'sending' ? t('Enviando…') : i.status === 'skipped' ? t('Sin responder') : ''}
                    </span>
                  )}
                  {i.permalink && (
                    <a className={cx(u.btn, u.btnSm)} href={i.permalink} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} aria-hidden="true" />
                      {t('Ver en Instagram')}
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {open && pending.length > 1 && (
        <div className={s.proposalActions}>
          <button type="button" className={cx(u.btn, u.btnPrimary)} disabled={!canAct || !!busy} onClick={() => act('send')}>
            {busy === 'send:all' ? <LoaderCircle size={14} aria-hidden="true" className={u.spin} /> : <Send size={14} aria-hidden="true" />}
            {t('Responder todas ({n})', { n: pending.length })}
          </button>
          <button type="button" className={u.btn} disabled={!canAct || !!busy} onClick={() => act('dismiss')}>
            {t('Descartar')}
          </button>
        </div>
      )}
      {error && (
        <p className={s.resumeError} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Habilidades de skills.sh que sugiere Hermes: cada una con «Instalar»; nada se instala sin pulsarlo. */
function SkillProposalBlock({ m, proposal }: { m: ChatMessage; proposal: SkillProposal }) {
  const live = useCowork((st) => st.mode === 'live')
  const [busy, setBusy] = useState<number | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = proposal.status !== 'dismissed'
  const canAct = !!api && live && open

  function act(kind: 'install' | 'dismiss', index?: number): void {
    const a = api
    if (!a || busy !== null) return
    setBusy(kind === 'dismiss' ? 'dismiss' : (index ?? 0))
    setError(null)
    a.decideSkillProposal(m.projectId, m.id, kind, index).then(
      () => setBusy(null),
      (e) => {
        setBusy(null)
        setError(errorText(e))
      }
    )
  }

  const title =
    proposal.status === 'dismissed' ? t('Habilidades descartadas') : proposal.status === 'done' ? t('Habilidades instaladas') : t('Habilidades que pueden ayudar')
  return (
    <div className={cx(s.proposal, s.skillProposal, proposal.status === 'dismissed' && s.proposalClosed)}>
      <div className={s.planHead}>
        <span className={s.planIcon} aria-hidden="true">
          {proposal.status === 'dismissed' ? <X size={18} /> : proposal.status === 'done' ? <CircleCheck size={18} /> : <Sparkles size={18} />}
        </span>
        <div className={s.planInfo}>
          <span className={s.planTitle}>{title}</span>
          <span className={s.planSub}>{t('Buscado en skills.sh: «{q}»', { q: proposal.query })}</span>
        </div>
      </div>
      {open && (
        <ul className={s.skillList}>
          {proposal.items.map((it, i) => (
            <li key={`${it.source}/${it.skillId}`} className={s.skillItem}>
              <div className={s.skillInfo}>
                <span className={s.skillName}>
                  {it.name}
                  {it.verified && <span className={s.skillBadge}>{t('de confianza')}</span>}
                </span>
                <span className={s.skillMeta}>
                  {it.source} · {t('{n} instalaciones', { n: it.installs.toLocaleString() })}
                </span>
              </div>
              {it.installed ? (
                <span className={s.skillDone}>
                  <CircleCheck size={14} aria-hidden="true" />
                  {t('Instalada')}
                </span>
              ) : (
                <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={!canAct || busy !== null} onClick={() => act('install', i)}>
                  {busy === i ? <LoaderCircle size={14} aria-hidden="true" className={u.spin} /> : <Download size={14} aria-hidden="true" />}
                  {t('Instalar')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {proposal.status === 'pending' && (
        <div className={s.proposalActions}>
          <button type="button" className={u.btn} disabled={!canAct || busy !== null} onClick={() => act('dismiss')}>
            {busy === 'dismiss' && <LoaderCircle size={14} aria-hidden="true" className={u.spin} />}
            {t('Descartar')}
          </button>
        </div>
      )}
      {error && (
        <p className={s.resumeError} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function RoutineProposalBlock({ m, proposal }: { m: ChatMessage; proposal: RoutineProposal }) {
  const live = useCowork((st) => st.mode === 'live')
  const setLeftTab = useCowork((st) => st.setLeftTab)
  const [busy, setBusy] = useState<'create' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = proposal.status === 'pending'
  const canAct = !!api && live && pending

  function act(kind: 'create' | 'dismiss'): void {
    const a = api
    if (!a || busy) return
    setBusy(kind)
    setError(null)
    a.decideRoutineProposal(m.projectId, m.id, kind).then(
      () => setBusy(null),
      (e) => {
        setBusy(null)
        setError(errorText(e))
      }
    )
  }

  function edit(): void {
    const c = useComposer.getState()
    c.setText(proposal.command)
    c.requestFocus()
  }

  return (
    <div className={cx(s.proposal, s.routineProposal, !pending && s.proposalClosed)}>
      <div className={s.planHead}>
        <span className={s.planIcon} aria-hidden="true">
          {proposal.status === 'dismissed' ? <X size={18} /> : proposal.status === 'created' ? <CircleCheck size={18} /> : <CalendarClock size={18} />}
        </span>
        <div className={s.planInfo}>
          <span className={s.planTitle}>
            {pending ? t('Rutina propuesta: {name}', { name: proposal.name }) : proposal.status === 'created' ? t('Rutina creada: {name}', { name: proposal.name }) : t('Rutina descartada: {name}', { name: proposal.name })}
          </span>
          <span className={s.planSub}>{describeTrigger(proposal.trigger)}</span>
        </div>
      </div>
      {pending && <p className={s.routineRequest}>{proposal.request}</p>}
      {pending ? (
        <div className={s.proposalActions}>
          <button type="button" className={cx(u.btn, u.btnPrimary)} disabled={!canAct || !!busy} onClick={() => act('create')}>
            {busy === 'create' ? <LoaderCircle size={14} aria-hidden="true" className={u.spin} /> : <CalendarClock size={14} aria-hidden="true" />}
            {t('Crear rutina')}
          </button>
          <button type="button" className={u.btn} disabled={!canAct || !!busy} onClick={edit}>
            <PenLine size={14} aria-hidden="true" />
            {t('Cambiar')}
          </button>
          <button type="button" className={u.btn} disabled={!canAct || !!busy} onClick={() => act('dismiss')}>
            {busy === 'dismiss' && <LoaderCircle size={14} aria-hidden="true" className={u.spin} />}
            {t('Descartar')}
          </button>
        </div>
      ) : (
        proposal.status === 'created' && (
          <div className={s.proposalActions}>
            <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setLeftTab('routines')}>
              {t('Ver en Rutinas')}
            </button>
          </div>
        )
      )}
      {error && (
        <p className={s.resumeError} role="alert">
          {error}
        </p>
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
              <TaskSeq seq={task.seq} />
              {task.title}
            </span>
            <TaskStatusIcon status={task.status} needsYou={task.needsYou} size={15} />
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
          className={cx(u.track, measurable && running > 0 && !reduced && u.trackLive)}
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
            <span className={s.planPct} title={progressHint(plan)}>
              {plan.real || finished ? `${pct}%` : shortClock(plan.elapsedMs)}
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

/** «12 min · 184 k tokens · Claude +2 %»: lo que costó esta petición (abre ⚙ → Consumo). */
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
      <>
        {VIDEO_EXT.test(list[0].relPath) && <InlineVideo a={list[0]} />}
        <ul className={s.artifacts} aria-label={t('Resultados')}>
          <ArtifactRow a={list[0]} list={list} />
        </ul>
      </>
    )
  }
  return <DeliverablesFolder list={list} projectId={projectId} />
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i

/** Un vídeo entregado se ve en el propio chat (con sus controles), encima de su fila de Abrir/Descargar. */
function InlineVideo({ a }: { a: Artifact }) {
  const live = useCowork((st) => st.mode === 'live')
  if (!live) return null
  return (
    <div className={s.inlineVideo}>
      <video src={projectFileUrl(a.projectId, a.relPath, isWeb)} controls preload="metadata" playsInline aria-label={t('Vídeo {name}', { name: a.name })} />
    </div>
  )
}

/** Un entregable: al pulsarlo se abre en el panel de vista previa (con ‹ › para pasar a los demás del mensaje). */
function ArtifactRow({ a, list }: { a: Artifact; list: Artifact[] }) {
  const openPreview = useCowork((st) => st.openPreview)
  const open = (): void => openPreview(list.map(fromArtifact), Math.max(0, list.indexOf(a)))
  const [error, setError] = useState<string | null>(null)
  const lookup = useAgentLookup()
  const look = lookup(a.agentId)
  return (
    <li className={s.artifact}>
      <button type="button" className={s.artifactOpen} onClick={open} title={t('Ver {name}', { name: a.name })} tabIndex={-1} aria-hidden="true">
        <KindTile kind={a.kind} size={38} />
      </button>
      <button type="button" className={cx(s.artifactInfo, s.artifactOpen)} onClick={open} tabIndex={-1} aria-hidden="true">
        <span className={s.artifactName} title={a.relPath}>
          {a.name}
        </span>
        <span className={s.artifactBy}>
          <span className={s.byDot} style={agentVars(look.color)} aria-hidden="true" />
          {t('Creado por')} {look.name}
        </span>
      </button>
      <ArtifactDownloadButton projectId={a.projectId} ids={[a.id]} name={a.name} onError={setError} />
      <button type="button" className={cx(u.btn, u.btnSm)} onClick={open} aria-label={t('Abrir {name}', { name: a.name })}>
        {t('Abrir')}
      </button>
      {error && <p className={cx(s.resumeError, s.artifactError)} role="alert">{error}</p>}
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
        <ArtifactDownloadButton projectId={projectId} ids={list.map((a) => a.id)} name={name} onError={setError} />
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
            <ArtifactRow key={a.id} a={a} list={list} />
          ))}
        </ul>
      )}
    </div>
  )
}
