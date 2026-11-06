import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowDownToLine, ArrowUpRight, Brain, Check, Hourglass, Loader, Moon, PowerOff, Sparkles } from 'lucide-react'
import type { AgentConfig } from '@shared/types'
import { useCowork, useData } from '@/store/cowork'
import { useLabelOverrides } from './labelStore'
import { modelLabelFor } from '@/ui/common/agents'
import { useSceneHover } from './anchors'
import { hash01 } from './layout'
import { ESTIMATE_HINT, REAL_HINT, isSilent, progressText, taskProgress } from '@/lib/progress'
import s from './labels.module.css'
import { t } from '@/lib/i18n'

/** Mismo umbral que el cerebro de animación (26 s + desfase por agente). */
const restAfterMs = (id: string) => 26000 + hash01(id) * 10000

interface Props {
  agent: AgentConfig
}

/** Tarjeta flotante sobre cada robot: nombre, modelo, estado y progreso. */
export function RobotLabel({ agent }: Props) {
  const hovered = useSceneHover((st) => st.agentId === agent.id)
  const rt = useData((d) => d.runtimes[agent.id])
  const task = useData((d) => (rt?.taskId ? d.tasks[rt.taskId] : undefined))
  const allTasks = useData((d) => d.tasks)
  const waitingName = useData((d) => (rt?.waitingFor ? d.agents[rt.waitingFor]?.name : undefined))
  const override = useLabelOverrides((st) => st.map[agent.id])
  const selected = useCowork((st) => st.selection?.type === 'agent' && st.selection.id === agent.id)
  const reduced = useCowork((st) => st.reducedEffects)
  const select = useCowork((st) => st.select)

  // Reposo: se evalúa cada pocos segundos (no en cada fotograma).
  const [, tick] = useState(0)
  const [mountedAt] = useState(() => Date.now())
  useEffect(() => {
    // Más a menudo mientras trabaja (el progreso estimado avanza con el tiempo).
    const busyNow = rt?.activity === 'thinking' || rt?.activity === 'working'
    const id = window.setInterval(() => tick((n) => n + 1), busyNow ? 1500 : 4000)
    return () => window.clearInterval(id)
  }, [rt?.activity])

  const activity = rt?.activity ?? 'idle'
  const lastAt = rt?.lastActivityAt ?? 0
  const resting = activity === 'idle' && !override && Date.now() - Math.max(lastAt, mountedAt) > restAfterMs(agent.id)

  let icon = <Sparkles size={12} />
  let text = t('Disponible')
  switch (activity) {
    case 'thinking':
      icon = <Brain size={12} />
      text = rt?.lastActivity || t('Pensando')
      break
    case 'working':
      icon = <Loader size={12} />
      text = isSilent(rt) ? t('Razonando…') : rt?.lastActivity || t('Trabajando')
      break
    case 'waiting':
      icon = <Hourglass size={12} />
      text = waitingName ? t('Esperando a {waitingName}', { waitingName }) : t('En espera')
      break
    case 'error':
      icon = <AlertTriangle size={12} />
      text = t('Bloqueado')
      break
    case 'offline':
      icon = <PowerOff size={12} />
      text = t('No disponible')
      break
    default:
      if (resting) {
        icon = <Moon size={12} />
        text = t('En reposo')
      }
  }
  if (override) {
    text = override.text
    icon = override.tone === 'send' ? <ArrowUpRight size={12} /> : override.tone === 'receive' ? <ArrowDownToLine size={12} /> : <Check size={12} />
  }

  const busy = activity === 'thinking' || activity === 'working'
  // Modelo de la tarea en curso (fácil, normal o difícil); si no hay tarea, el habitual.
  const modelText = (busy && task?.model ? modelLabelFor(task.model, agent) : undefined) ?? agent.modelLabel
  const prog = busy && task ? taskProgress(task, Object.values(allTasks)) : null

  const cls = [
    s.robot,
    selected && s.selected,
    hovered && s.hovered,
    (activity === 'offline' || resting) && s.dim,
    activity === 'error' && s.error,
    reduced && s.static,
    override && s[`tone-${override.tone}`]
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={cls}
      style={{ ['--agent' as string]: agent.color }}
      role="button"
      tabIndex={0}
      aria-label={`${agent.name}, ${modelText}: ${text}`}
      onClick={(e) => {
        e.stopPropagation()
        select({ type: 'agent', id: agent.id })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') select({ type: 'agent', id: agent.id })
      }}
    >
      <div className={s.head}>
        <span className={s.dot} />
        <span className={s.name}>{agent.name}</span>
        <span className={s.model}>{modelText}</span>
      </div>
      <div className={s.status}>
        {icon}
        <span className={s.statusText}>{text}</span>
        {prog && (
          <span className={s.pct} title={prog.real ? REAL_HINT : ESTIMATE_HINT}>
            {progressText(prog)}
          </span>
        )}
      </div>
      {activity === 'error' && rt?.reason && <div className={s.reason}>{rt.reason}</div>}
      {activity === 'offline' && rt?.reason && <div className={s.reason} style={{ color: '#9aa8bf' }}>{rt.reason}</div>}
      {busy && (
        <div className={s.bar} aria-hidden="true">
          {prog ? (
            <div className={s.barFill} style={{ width: `${prog.pct}%`, opacity: prog.real ? 1 : 0.6 }} />
          ) : (
            <div className={s.barIndeterminate} />
          )}
        </div>
      )}
    </div>
  )
}
