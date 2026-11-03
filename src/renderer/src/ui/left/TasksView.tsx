import { useMemo, type CSSProperties } from 'react'
import { ClipboardList, Link2, Timer } from 'lucide-react'
import type { AgentRuntime, Task } from '@shared/types'
import { ESTIMATE_HINT, REAL_HINT, isSilent, progressText, taskProgress } from '@/lib/progress'
import { useCowork, useData } from '@/store/cowork'
import { AgentPill } from '../common/AgentBits'
import { modelLabelFor, useAgentLookup, type AgentLook } from '../common/agents'
import { useNow } from '../common/hooks'
import { TaskStatusIcon } from '../common/icons'
import { cx, formatDuration } from '../common/util'
import u from '../common/ui.module.css'
import s from './Views.module.css'

type GroupId = 'running' | 'waiting' | 'done' | 'error'

const GROUPS: Array<{ id: GroupId; label: string }> = [
  { id: 'running', label: 'En curso' },
  { id: 'waiting', label: 'En espera' },
  { id: 'done', label: 'Completadas' },
  { id: 'error', label: 'Con error' }
]

function groupOf(t: Task): GroupId {
  switch (t.status) {
    case 'running':
      return 'running'
    case 'pending':
    case 'blocked':
      return 'waiting'
    case 'done':
      return 'done'
    default:
      return 'error'
  }
}

/** Pestaña Tareas: agrupadas por estado. */
export function TasksView() {
  const tasks = useData((d) => d.tasks)
  const runtimes = useData((d) => d.runtimes)
  const selection = useCowork((st) => st.selection)
  const select = useCowork((st) => st.select)
  const openTrace = useCowork((st) => st.openTrace)
  const lookup = useAgentLookup()

  const groups = useMemo(() => {
    const g: Record<GroupId, Task[]> = { running: [], waiting: [], done: [], error: [] }
    for (const t of Object.values(tasks)) g[groupOf(t)].push(t)
    g.running.sort((a, b) => (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt))
    g.waiting.sort((a, b) => a.createdAt - b.createdAt)
    g.done.sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt))
    g.error.sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt))
    return g
  }, [tasks])

  // Un único intervalo para las duraciones en curso.
  const now = useNow(1000, groups.running.length > 0)
  const selectedAgent = selection?.type === 'agent' ? selection.id : null
  const total = groups.running.length + groups.waiting.length + groups.done.length + groups.error.length

  if (total === 0) {
    return (
      <div className={s.scroll}>
        <div className={u.empty}>
          <span className={u.emptyIcon}>
            <ClipboardList size={20} aria-hidden="true" />
          </span>
          <span className={u.emptyTitle}>Sin tareas todavía</span>
          <span className={u.emptyText}>
            Cuando pidas algo, el planificador lo dividirá en tareas y aquí verás quién hace qué.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={s.scroll}>
      {GROUPS.map(({ id, label }) => {
        const list = groups[id]
        if (list.length === 0) return null
        return (
          <section key={id} className={s.section} aria-label={`${label}: ${list.length}`}>
            <h3 className={cx(u.sectionLabel, id === 'error' && s.labelError)}>
              {label} <span className={u.count}>{list.length}</span>
            </h3>
            <ul className={s.rows}>
              {list.map((t) => (
                <li key={t.id}>
                  <TaskRow
                    task={t}
                    look={lookup(t.agentId)}
                    tasks={tasks}
                    runtime={runtimes[t.agentId]}
                    now={t.status === 'running' ? now : 0}
                    selected={selectedAgent === t.agentId}
                    onSelect={() => {
                      select({ type: 'agent', id: t.agentId })
                      // Si ya empezó, se abre lo que está haciendo (o lo que hizo), paso a paso.
                      if (t.startedAt) openTrace(t.id)
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function TaskRow({
  task: t,
  look,
  tasks,
  runtime,
  now,
  selected,
  onSelect
}: {
  task: Task
  look: AgentLook
  tasks: Record<string, Task>
  runtime: AgentRuntime | undefined
  now: number
  selected: boolean
  onSelect: () => void
}) {
  const waitingFor =
    t.status === 'pending' || t.status === 'blocked'
      ? t.dependsOn.map((id) => tasks[id]).filter((d): d is Task => !!d && d.status !== 'done')
      : []
  const model = modelLabelFor(t.model, look.config)
  let duration: string | null = null
  if (t.status === 'running' && t.startedAt) duration = formatDuration(Math.max(0, (now || Date.now()) - t.startedAt))
  else if (t.startedAt && t.finishedAt) duration = formatDuration(t.finishedAt - t.startedAt)
  const prog = t.status === 'running' ? taskProgress(t, Object.values(tasks), now || Date.now()) : null
  const silent = t.status === 'running' && isSilent(runtime, now || Date.now())

  return (
    <button
      type="button"
      className={cx(s.taskRow, selected && s.taskSelected)}
      onClick={onSelect}
      title={t.startedAt ? `Ver lo que ${t.status === 'running' ? 'está haciendo' : 'hizo'} ${look.name}, paso a paso` : `Ver a ${look.name} en el espacio`}
    >
      <TaskStatusIcon status={t.status} size={16} className={s.taskStatus} />
      <span className={s.taskMain}>
        <span className={s.taskTitle}>{t.title}</span>
        <span className={s.taskMeta}>
          <AgentPill look={look} size="sm" />
          {model && <span className={s.model}>{model}</span>}
          {duration && (
            <span className={s.duration}>
              <Timer size={12} aria-hidden="true" />
              {duration}
            </span>
          )}
        </span>
        {waitingFor.length > 0 && (
          <span className={s.deps}>
            <Link2 size={12} aria-hidden="true" />
            Espera a: {waitingFor.map((d) => d.title).join(', ')}
          </span>
        )}
        {t.status === 'failed' && t.error ? (
          <span className={s.taskError}>{t.error}</span>
        ) : silent ? (
          <span className={s.activity}>Razonando… (sin novedades por ahora)</span>
        ) : t.lastActivity && t.status !== 'done' ? (
          <span className={s.activity}>{t.lastActivity}</span>
        ) : null}
        {prog && (
          <span className={cx(s.progressRow, !prog.real && s.progressEstimate)} title={prog.real ? REAL_HINT : ESTIMATE_HINT}>
            <span
              className={cx(u.track, u.trackThin, s.progress)}
              role="progressbar"
              aria-label={`Progreso de ${t.title}${prog.real ? '' : ' (estimado)'}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={prog.pct}
            >
              <span className={u.fill} style={{ '--pct': `${prog.pct}%`, '--bar': look.color } as CSSProperties} />
            </span>
            <span className={s.progressPct}>{progressText(prog)}</span>
          </span>
        )}
      </span>
    </button>
  )
}
