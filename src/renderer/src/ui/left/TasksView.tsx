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
import { t } from '@/lib/i18n'

type GroupId = 'running' | 'waiting' | 'done' | 'error'

const GROUPS: Array<{ id: GroupId; label: string }> = [
  { id: 'running', label: t('En curso') },
  { id: 'waiting', label: t('En espera') },
  { id: 'done', label: t('Completadas') },
  { id: 'error', label: t('Con error') }
]

function groupOf(task: Task): GroupId {
  switch (task.status) {
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
    for (const task of Object.values(tasks)) g[groupOf(task)].push(task)
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
          <span className={u.emptyTitle}>{t('Sin tareas todavía')}</span>
          <span className={u.emptyText}>
            {t('Cuando pidas algo, el planificador lo dividirá en tareas y aquí verás quién hace qué.')}
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
              {list.map((task) => (
                <li key={task.id}>
                  <TaskRow
                    task={task}
                    look={lookup(task.agentId)}
                    tasks={tasks}
                    runtime={runtimes[task.agentId]}
                    now={task.status === 'running' ? now : 0}
                    selected={selectedAgent === task.agentId}
                    onSelect={() => {
                      select({ type: 'agent', id: task.agentId })
                      // Si ya empezó, se abre lo que está haciendo (o lo que hizo), paso a paso.
                      if (task.startedAt) openTrace(task.id)
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
  task: task,
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
    task.status === 'pending' || task.status === 'blocked'
      ? task.dependsOn.map((id) => tasks[id]).filter((d): d is Task => !!d && d.status !== 'done')
      : []
  const model = modelLabelFor(task.model, look.config)
  let duration: string | null = null
  if (task.status === 'running' && task.startedAt) duration = formatDuration(Math.max(0, (now || Date.now()) - task.startedAt))
  else if (task.startedAt && task.finishedAt) duration = formatDuration(task.finishedAt - task.startedAt)
  const prog = task.status === 'running' ? taskProgress(task, Object.values(tasks), now || Date.now()) : null
  const silent = task.status === 'running' && isSilent(runtime, now || Date.now())

  return (
    <button
      type="button"
      className={cx(s.taskRow, selected && s.taskSelected)}
      onClick={onSelect}
      title={task.startedAt ? (task.status === 'running' ? t('Ver lo que está haciendo {name}, paso a paso', { name: look.name }) : t('Ver lo que hizo {name}, paso a paso', { name: look.name })) : t('Ver a {name} en el espacio', { name: look.name })}
    >
      <TaskStatusIcon status={task.status} size={16} className={s.taskStatus} />
      <span className={s.taskMain}>
        <span className={s.taskTitle}>{task.title}</span>
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
            {t('Espera a:')} {waitingFor.map((d) => d.title).join(', ')}
          </span>
        )}
        {task.status === 'failed' && task.error ? (
          <span className={s.taskError}>{task.error}</span>
        ) : silent ? (
          <span className={s.activity}>{t('Razonando… (sin novedades por ahora)')}</span>
        ) : task.lastActivity && task.status !== 'done' ? (
          <span className={s.activity}>{t(task.lastActivity)}</span>
        ) : null}
        {prog && (
          <span className={cx(s.progressRow, !prog.real && s.progressEstimate)} title={prog.real ? REAL_HINT : ESTIMATE_HINT}>
            <span
              className={cx(u.track, u.trackThin, s.progress)}
              role="progressbar"
              aria-label={t('Progreso de {title}{v2}', { title: task.title, v2: prog.real ? '' : t(' (estimado)') })}
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
