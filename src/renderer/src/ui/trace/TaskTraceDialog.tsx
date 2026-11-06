import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  Bot,
  CircleAlert,
  CircleCheck,
  CircleX,
  FilePen,
  FilePlus,
  FileText,
  Globe,
  ListTodo,
  LoaderCircle,
  Search,
  Sparkles,
  SquareTerminal,
  Wrench,
  X
} from 'lucide-react'
import type { TraceEntry, TraceTool } from '@shared/types'
import { useCowork, useData, type TraceView } from '@/store/cowork'
import { AgentAvatar } from '../common/AgentBits'
import { modelLabelFor, useAgentLookup } from '../common/agents'
import { useEscape, useNow } from '../common/hooks'
import { TaskStatusIcon, TASK_STATUS_LABEL } from '../common/icons'
import { MarkdownView } from '../common/MarkdownView'
import { agentVars, cx, formatDuration } from '../common/util'
import u from '../common/ui.module.css'
import r from '../header/RemoteAccess.module.css'
import s from './TaskTraceDialog.module.css'
import { locale, t } from '@/lib/i18n'

const TOOL_ICON: Record<TraceTool, typeof Wrench> = {
  command: SquareTerminal,
  edit: FilePen,
  write: FilePlus,
  read: FileText,
  search: Search,
  web: Globe,
  todo: ListTodo,
  agent: Bot,
  other: Wrench
}

const clock = (ts: number): string => new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Cuerpo de una herramienta: diff con colores en las ediciones, texto tal cual en lo demás. */
function Code({ text, diff }: { text: string; diff?: boolean }) {
  if (!diff) return <pre className={s.code}>{text}</pre>
  return (
    <pre className={s.code}>
      {text.split('\n').map((line, i) => (
        <span key={i} className={line.startsWith('+ ') ? s.add : line.startsWith('- ') ? s.del : undefined}>
          {line}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}

function ToolItem({ e, live }: { e: TraceEntry; live: boolean }) {
  const Icon = TOOL_ICON[e.tool ?? 'other']
  const status =
    e.ok === true ? (
      <CircleCheck size={14} aria-label={t('Bien')} className={s.ok} />
    ) : e.ok === false ? (
      <CircleX size={14} aria-label={t('Con error')} className={s.bad} />
    ) : live && e.tool !== 'todo' ? (
      <LoaderCircle size={14} aria-label={t('En curso')} className={cx(u.spin, s.pending)} />
    ) : null
  const head = (
    <>
      <Icon size={15} aria-hidden="true" className={s.toolIcon} />
      <span className={cx(s.toolTitle, e.tool === 'command' && s.mono)}>{e.title}</span>
      {status}
    </>
  )
  if (!e.body && !e.output) {
    return (
      <div className={s.tool} title={clock(e.ts)}>
        <div className={s.toolHead}>{head}</div>
      </div>
    )
  }
  return (
    <details className={s.tool} open={e.tool === 'todo' || undefined}>
      <summary className={s.toolHead} title={clock(e.ts)}>
        {head}
      </summary>
      <div className={s.toolBody}>
        {e.body && <Code text={e.tool === 'command' ? `$ ${e.body}` : e.body} diff={e.tool === 'edit'} />}
        {e.output && (
          <>
            <span className={s.outLabel}>{t('Resultado')}</span>
            <pre className={cx(s.code, e.ok === false && s.codeBad)}>{e.output}</pre>
          </>
        )}
      </div>
    </details>
  )
}

function Item({ e, live }: { e: TraceEntry; live: boolean }) {
  switch (e.kind) {
    case 'thinking': {
      const body = e.body ?? ''
      const preview = body.replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim()
      return (
        <details className={s.thinking}>
          <summary title={clock(e.ts)}>
            <Sparkles size={14} aria-hidden="true" />
            <span className={s.thinkLabel}>{t('Razonando')}</span>
            <span className={s.thinkPreview}>{preview}</span>
          </summary>
          <MarkdownView text={body} className={s.thinkBody} />
        </details>
      )
    }
    case 'text':
      return (
        <div className={s.text} title={clock(e.ts)}>
          <MarkdownView text={e.body ?? ''} />
        </div>
      )
    case 'tool':
      return <ToolItem e={e} live={live} />
    case 'error':
      return (
        <p className={cx(s.note, s.noteError)} title={clock(e.ts)}>
          <CircleAlert size={13} aria-hidden="true" />
          {e.title}
        </p>
      )
    default:
      return (
        <p className={s.note} title={clock(e.ts)}>
          {e.title}
        </p>
      )
  }
}

/** Lo que hace el agente en una tarea, paso a paso y en directo (como en las apps de Claude Code y Codex). */
export function TaskTraceDialog() {
  const trace = useCowork((st) => st.trace)
  // Una ventana nueva por tarea: vuelve a empezar pegada al final.
  return trace ? <TraceWindow key={trace.taskId} trace={trace} /> : null
}

function TraceWindow({ trace }: { trace: TraceView }) {
  const openTrace = useCowork((st) => st.openTrace)
  const mode = useCowork((st) => st.mode)
  const task = useData((d) => d.tasks[trace.taskId])
  const runtime = useData((d) => (task ? d.runtimes[task.agentId] : undefined))
  const lookup = useAgentLookup()
  const running = task?.status === 'running'
  const now = useNow(1000, running)
  const feed = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const close = (): void => openTrace(null)
  useEscape(true, close)

  const entries = trace.entries
  // Pegado al final mientras no subas a leer algo anterior.
  useLayoutEffect(() => {
    const el = feed.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [entries, trace.loading])

  const look = lookup(task?.agentId ?? '')
  const model = task ? modelLabelFor(task.model, look.config) : null
  let duration: string | null = null
  if (task?.startedAt) duration = formatDuration(Math.max(0, (task.finishedAt ?? now) - task.startedAt))
  // El último paso de herramienta sin resultado es el que está en marcha.
  const lastTool = [...entries].reverse().find((e) => e.kind === 'tool')

  function onScroll(): void {
    const el = feed.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    stick.current = bottom
    if (bottom !== atBottom) setAtBottom(bottom)
  }

  function toBottom(): void {
    const el = feed.current
    if (!el) return
    stick.current = true
    setAtBottom(true)
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  let empty: ReactNode = null
  if (!entries.length) {
    if (trace.loading) empty = <p className={s.empty}>{t('Cargando…')}</p>
    else if (mode !== 'live') empty = <p className={s.empty}>{t('En la demo no hay registro de pasos: aparece con los agentes reales.')}</p>
    else if (running) empty = <p className={s.empty}>{t('Esperando el primer paso del agente…')}</p>
    else if (task?.status === 'pending' || task?.status === 'blocked') empty = <p className={s.empty}>{t('La tarea aún no ha empezado.')}</p>
    else empty = <p className={s.empty}>{t('No hay registro de esta tarea (las tareas hechas antes de esta versión no lo guardaban).')}</p>
  }

  return (
    <div className={cx(r.backdrop, s.backdrop)} role="dialog" aria-modal="true" aria-labelledby="trace-title" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={cx(r.dialog, s.dialog)} style={agentVars(look.color)}>
        <header className={s.head}>
          <AgentAvatar look={look} size={38} />
          <div className={s.headInfo}>
            <h2 id="trace-title" className={s.title}>
              {task?.title ?? t('Tarea')}
            </h2>
            <p className={s.sub}>
              <span className={s.agentName}>{look.name}</span>
              {model && <span>{model}</span>}
              {task && (
                <span className={s.status}>
                  <TaskStatusIcon status={task.status} size={13} />
                  {TASK_STATUS_LABEL[task.status]}
                </span>
              )}
              {duration && <span>{duration}</span>}
            </p>
          </div>
          <button type="button" className={cx(u.iconBtn, s.close)} aria-label={t('Cerrar')} title={t('Cerrar (Esc)')} onClick={close}>
            <X size={18} />
          </button>
        </header>

        <div ref={feed} className={s.feed} onScroll={onScroll} aria-live="polite" aria-busy={running}>
          {task?.description && (
            <details className={s.brief}>
              <summary>{task.acceptance ? t('Encargo y criterio de aceptación') : t('Encargo')}</summary>
              <MarkdownView text={task.description} />
              {task.acceptance && (
                <p className={s.briefLine}>
                  <b>{t('Hecha cuando:')}</b> {task.acceptance}
                </p>
              )}
              {!!task.files?.length && (
                <p className={s.briefLine}>
                  <b>{t('Sus archivos:')}</b> {task.files.join(', ')}
                </p>
              )}
            </details>
          )}
          {empty}
          {entries.map((e) => (
            <Item key={e.id} e={e} live={running && e === lastTool && e.ok === undefined} />
          ))}
          {running && (
            <p className={s.live}>
              <LoaderCircle size={14} aria-hidden="true" className={u.spin} />
              {task?.lastActivity ?? runtime?.lastActivity ?? t('Trabajando')}…
            </p>
          )}
        </div>

        {!atBottom && (
          <button type="button" className={s.jump} onClick={toBottom}>
            <ArrowDown size={14} aria-hidden="true" />
            {t('Ir a lo último')}
          </button>
        )}
      </div>
    </div>
  )
}
