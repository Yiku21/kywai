import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowRight,
  Brain,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Folder,
  Hourglass,
  LoaderCircle,
  Power,
  RotateCcw,
  Sparkles,
  SquareTerminal,
  User,
  X
} from 'lucide-react'
import type { AgentActivity, Artifact, Task } from '@shared/types'
import { useCowork, useData } from '@/store/cowork'
import { api } from '@/lib/api'
import { relativeTime, timeHM } from '@/lib/format'
import { AgentAvatar, AgentPill } from '../common/AgentBits'
import { ACTIVITY_LABEL, endpointLook, modelLabelFor, PROVIDER_LABEL, useAgentLookup, type AgentLook } from '../common/agents'
import { useEscape, useNow } from '../common/hooks'
import { ESTIMATE_HINT, REAL_HINT, isSilent, progressText, taskProgress } from '@/lib/progress'
import { FileTypeIcon, KindTile, TaskStatusIcon, TASK_STATUS_LABEL } from '../common/icons'
import { agentVars, basename, cx, errorText, kTokens } from '../common/util'
import u from '../common/ui.module.css'
import s from './SelectionPanel.module.css'
import { AgentModels, HermesModelRow } from './AgentModels'
import { t } from '@/lib/i18n'

/** Panel flotante con el detalle del agente o la transferencia seleccionados en el espacio. */
export function SelectionPanel() {
  const selection = useCowork((st) => st.selection)
  const select = useCowork((st) => st.select)
  const active = selection?.type === 'agent' || selection?.type === 'transfer'
  useEscape(active, () => select(null))
  if (!selection || !active) return null

  const close = (): void => select(null)
  return (
    <aside
      key={`${selection.type}:${selection.id}`}
      className={s.panel}
      aria-label={selection.type === 'agent' ? t('Detalle del agente') : t('Detalle de la transferencia')}
    >
      {selection.type === 'agent' ? (
        <AgentDetails id={selection.id} onClose={close} />
      ) : (
        <TransferDetails id={selection.id} onClose={close} />
      )}
    </aside>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className={cx(u.iconBtn, u.iconBtnSm, s.close)} onClick={onClose} aria-label={t('Cerrar panel')} title={t('Cerrar (Esc)')}>
      <X size={16} aria-hidden="true" />
    </button>
  )
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className={s.section}>
      <h3 className={s.sectionTitle}>
        <span>{title}</span>
        {aside}
      </h3>
      {children}
    </section>
  )
}

// ---------- Agente ----------

const ACTIVITY_TONE: Record<AgentActivity, string> = {
  idle: 'var(--live)',
  thinking: 'var(--cyan)',
  working: 'var(--agent)',
  waiting: 'var(--warn)',
  error: 'var(--alert)',
  offline: 'var(--text-3)'
}

function ActivityIcon({ activity }: { activity: AgentActivity }) {
  switch (activity) {
    case 'idle':
      return <CircleCheck size={16} aria-hidden="true" />
    case 'thinking':
      return <Sparkles size={16} aria-hidden="true" />
    case 'working':
      return <LoaderCircle size={16} aria-hidden="true" className={u.spin} />
    case 'waiting':
      return <Hourglass size={16} aria-hidden="true" />
    case 'error':
      return <CircleAlert size={16} aria-hidden="true" />
    default:
      return <CircleSlash size={16} aria-hidden="true" />
  }
}

function AgentDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const agent = useData((d) => d.agents[id])
  const runtime = useData((d) => d.runtimes[id])
  const tasks = useData((d) => d.tasks)
  const artifacts = useData((d) => d.artifacts)
  const reduced = useCowork((st) => st.reducedEffects)
  const openViewer = useCowork((st) => st.openViewer)
  const openTrace = useCowork((st) => st.openTrace)
  const select = useCowork((st) => st.select)
  const mode = useCowork((st) => st.mode)
  const lookup = useAgentLookup()
  const now = useNow(2000)
  const look = lookup(id)

  const agentTasks = useMemo(() => Object.values(tasks).filter((task) => task.agentId === id), [tasks, id])

  const current: Task | undefined = useMemo(() => {
    if (runtime?.taskId && tasks[runtime.taskId]) return tasks[runtime.taskId]
    return agentTasks
      .filter((task) => task.status === 'running')
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0]
  }, [runtime?.taskId, tasks, agentTasks])

  const results = useMemo(() => {
    const ids = new Set(agentTasks.map((task) => task.id))
    return Object.values(artifacts)
      .filter((a) => a.agentId === id || (!!a.taskId && ids.has(a.taskId)))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [artifacts, agentTasks, id])

  const recent = useMemo(
    () =>
      agentTasks
        .filter((task) => (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') && task.id !== current?.id)
        .sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt))
        .slice(0, 5),
    [agentTasks, current?.id]
  )

  if (!agent) {
    return (
      <>
        <div className={s.head}>
          <AgentAvatar look={look} size={44} dim />
          <div className={s.headInfo}>
            <h2 className={s.name}>{look.name}</h2>
            <p className={s.sub}>{t('Este agente ya no está en el espacio.')}</p>
          </div>
          <CloseButton onClose={onClose} />
        </div>
      </>
    )
  }

  const activity: AgentActivity = runtime?.activity ?? 'offline'
  const parent = agent.isSubagent && agent.parentId ? lookup(agent.parentId) : null
  let statusText: string = ACTIVITY_LABEL[activity]
  if (activity === 'waiting') statusText = runtime?.waitingFor ? t('Esperando a {name}', { name: lookup(runtime.waitingFor).name }) : t('Esperando')
  const reason = (activity === 'error' || activity === 'offline') && runtime?.reason ? runtime.reason : null
  const deps = current ? current.dependsOn.map((d) => tasks[d]).filter((task): task is Task => !!task) : []
  const prog = current ? taskProgress(current, Object.values(tasks), now) : null
  const silent = isSilent(runtime, now)
  const ctx = runtime?.context

  return (
    <div style={agentVars(look.color)}>
      <div className={s.head}>
        <AgentAvatar look={look} size={48} dim={activity === 'offline'} />
        <div className={s.headInfo}>
          <h2 className={s.name}>{agent.name}</h2>
          <p className={s.sub}>
            <span className={s.model}>{agent.modelLabel || t('Modelo predeterminado')}</span>
            <span className={s.dotSep} aria-hidden="true">
              ·
            </span>
            <span>{PROVIDER_LABEL[agent.provider] ?? agent.provider}</span>
          </p>
          {parent && (
            <p className={s.parent}>
              {t('Sub-agente de')} <AgentPill look={parent} size="sm" />
            </p>
          )}
        </div>
        <CloseButton onClose={onClose} />
      </div>

      <div className={s.statusRow} style={{ '--tone': ACTIVITY_TONE[activity] } as CSSProperties}>
        <span className={s.statusIcon}>
          <ActivityIcon activity={activity} />
        </span>
        <div className={s.statusInfo}>
          <span className={s.statusText}>{statusText}</span>
          {reason && <span className={s.reason}>{reason}</span>}
        </div>
        <span className={s.location}>{runtime?.location === 'core' ? t('En el núcleo') : t('En su estación')}</span>
      </div>

      {!!api && mode === 'live' && (activity === 'error' || activity === 'offline') && (
        <ResetAgent agentId={agent.id} startsLmStudio={agent.provider === 'lmstudio' && activity === 'offline'} />
      )}

      {agent.role && <p className={s.role}>{t(agent.role)}</p>}

      {!!api && mode === 'live' && agent.provider === 'lmstudio' && <ThinkingToggle agentId={agent.id} on={agent.thinking === true} />}

      {!!api && mode === 'live' && !agent.isSubagent && !agent.plannerOnly && agent.provider !== 'ollama' && agent.provider !== 'lmstudio' && (
        <Section title={t('Modelos según la dificultad')}>
          <AgentModels agent={agent} />
        </Section>
      )}

      {!!api && mode === 'live' && agent.provider === 'hermes' && (
        <Section title={t('Modelo')}>
          <HermesModelRow agent={agent} />
        </Section>
      )}

      <Section title={t('Tarea actual')}>
        {current ? (
          // Toda la tarjeta abre la ventana con lo que hace (el botón de abajo es el acceso por teclado).
          <div
            className={cx(s.task, s.taskLink)}
            title={t('Ver qué está haciendo, paso a paso')}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('button')) openTrace(current.id)
            }}
          >
            <div className={s.taskHead}>
              <TaskStatusIcon status={current.status} size={15} />
              <span className={s.taskTitle}>{current.title}</span>
            </div>
            {current.description && <p className={s.taskDesc}>{current.description}</p>}
            {prog && current.status === 'running' ? (
              <div className={s.progressRow} title={prog.real ? REAL_HINT : ESTIMATE_HINT}>
                <div
                  className={u.track}
                  role="progressbar"
                  aria-label={prog.real ? t('Progreso de la tarea') : t('Progreso estimado de la tarea')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={prog.pct}
                >
                  <span
                    className={u.fill}
                    style={{ '--pct': `${prog.pct}%`, '--bar': look.color, opacity: prog.real ? 1 : 0.6 } as CSSProperties}
                  />
                </div>
                <span className={prog.real ? s.pct : s.pctMuted}>{progressText(prog)}</span>
              </div>
            ) : current.status === 'running' ? (
              <div className={s.progressRow}>
                <div className={u.track} role="progressbar" aria-label={t('Tarea en curso')} aria-valuetext={t('En curso, sin medida de progreso')}>
                  <span className={reduced ? u.shimmerStatic : u.shimmer} style={{ '--bar': look.color } as CSSProperties} />
                </div>
                <span className={s.pctMuted}>{t('En curso')}</span>
              </div>
            ) : null}
            {current.status === 'running' && prog && (
              <span className={s.taskModel}>
                {prog.real ? t('Progreso real (lista de pasos del agente)') : t('Progreso estimado: el agente no informa sus pasos')}
                {silent ? t(' · razonando, sin novedades por ahora') : ''}
              </span>
            )}
            {current.model && (
              <span className={s.taskModel}>{t('Modelo:')} {modelLabelFor(current.model, agent)}</span>
            )}
            <button type="button" className={s.traceBtn} onClick={() => openTrace(current.id)}>
              <SquareTerminal size={14} aria-hidden="true" />
              {current.status === 'running' ? t('Ver qué está haciendo') : t('Ver lo que hizo')}
              <ArrowRight size={14} aria-hidden="true" className={s.resultGo} />
            </button>
          </div>
        ) : (
          <p className={s.muted}>{t('Sin tarea asignada ahora mismo.')}</p>
        )}
      </Section>

      {deps.length > 0 && (
        <Section title={t('Depende de')}>
          <ul className={s.list}>
            {deps.map((d) => (
              <li key={d.id} className={s.depRow}>
                <TaskStatusIcon status={d.status} size={14} />
                <span className={s.depTitle} title={d.title}>
                  {d.title}
                </span>
                <AgentPill look={lookup(d.agentId)} size="sm" />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t('Última actividad')}>
        {runtime?.lastActivity ? (
          <p className={s.activity}>
            <span>{t(runtime.lastActivity)}</span>
            {runtime.lastActivityAt ? <span className={s.when}>{relativeTime(runtime.lastActivityAt, now)}</span> : null}
          </p>
        ) : (
          <p className={s.muted}>{t('Sin actividad registrada.')}</p>
        )}
      </Section>

      {ctx && (
        <Section title={t('Contexto')}>
          <p className={s.activity}>
            <span>
              {t('{kTokens} tokens usados{v2}', { kTokens: kTokens(ctx.used), v2: ctx.capacity ? t(' de {capacity}', { capacity: kTokens(ctx.capacity) }) : '' })}
            </span>
          </p>
          {ctx.capacity ? (
            <div className={cx(u.track, u.trackThin)} aria-hidden="true">
              <span
                className={u.fill}
                style={{ '--pct': `${Math.min(100, (ctx.used / ctx.capacity) * 100)}%`, '--bar': look.color } as CSSProperties}
              />
            </div>
          ) : null}
        </Section>
      )}

      {results.length > 0 && (
        <Section title={t('Resultados disponibles')} aside={<span className={u.count}>{results.length}</span>}>
          <ul className={s.list}>
            {results.slice(0, 6).map((a) => (
              <li key={a.id}>
                <ResultRow artifact={a} onOpen={() => openViewer(a.id)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recent.length > 0 && (
        <Section title={t('Tareas recientes')}>
          <ul className={s.list}>
            {recent.map((task) => (
              <li key={task.id}>
                <button type="button" className={cx(s.depRow, s.recentRow)} title={t('Ver lo que hizo en «{title}»', { title: task.title })} onClick={() => openTrace(task.id)}>
                  <TaskStatusIcon status={task.status} size={14} />
                  <span className={s.depTitle}>{task.title}</span>
                  <span className={s.when}>{task.finishedAt ? relativeTime(task.finishedAt, now) : TASK_STATUS_LABEL[task.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {agent.isSubagent && parent?.present && (
        <div className={s.footer}>
          <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => select({ type: 'agent', id: parent.id })}>
            {t('Ver a')} {parent.name}
          </button>
        </div>
      )}
    </div>
  )
}

function ResultRow({ artifact, onOpen }: { artifact: Artifact; onOpen: () => void }) {
  return (
    <button type="button" className={s.resultRow} onClick={onOpen} title={t('Abrir {name}', { name: artifact.name })}>
      <KindTile kind={artifact.kind} size={30} />
      <span className={s.resultName}>{artifact.name}</span>
      <ArrowRight size={14} aria-hidden="true" className={s.resultGo} />
    </button>
  )
}

// ---------- Transferencia ----------

function Endpoint({ id, lookup }: { id: string; lookup: (id: string) => AgentLook }) {
  const e = endpointLook(id, lookup)
  if ('special' in e) {
    return (
      <span className={s.endpoint} style={agentVars(e.color)}>
        <span className={s.endpointIcon} aria-hidden="true">
          {e.special === 'user' ? <User size={14} /> : <Folder size={14} />}
        </span>
        {e.name}
      </span>
    )
  }
  return (
    <span className={s.endpoint} style={agentVars(e.color)}>
      <AgentAvatar look={e} size={22} />
      {e.name}
    </span>
  )
}

function TransferDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const transfer = useData((d) => d.transfers.find((task) => task.id === id))
  const tasks = useData((d) => d.tasks)
  const mode = useCowork((st) => st.mode)
  const project = useCowork((st) => st.live.project)
  const lookup = useAgentLookup()
  const now = useNow(5000)

  if (!transfer) {
    return (
      <div className={s.head}>
        <div className={s.headInfo}>
          <h2 className={s.name}>{t('Transferencia')}</h2>
          <p className={s.sub}>{t('Esta transferencia ya no está disponible.')}</p>
        </div>
        <CloseButton onClose={onClose} />
      </div>
    )
  }

  const task = transfer.taskId ? tasks[transfer.taskId] : undefined
  const canOpen = !!api && mode === 'live' && !!project
  const files = transfer.payload.files ?? []

  return (
    <div>
      <div className={s.head}>
        <div className={s.headInfo}>
          <span className={s.kicker}>{t('Transferencia')}</span>
          <h2 className={s.name}>{transfer.payload.title || transfer.label}</h2>
          <p className={s.sub}>
            <time dateTime={new Date(transfer.createdAt).toISOString()}>{timeHM(transfer.createdAt)}</time>
            <span className={s.dotSep} aria-hidden="true">
              ·
            </span>
            {relativeTime(transfer.createdAt, now)}
          </p>
        </div>
        <CloseButton onClose={onClose} />
      </div>

      <div className={s.route} aria-label={t('Origen y destino')}>
        <Endpoint id={transfer.fromId} lookup={lookup} />
        <ArrowRight size={16} aria-label="hacia" className={s.routeArrow} />
        <Endpoint id={transfer.toId} lookup={lookup} />
      </div>

      {transfer.label && transfer.label !== transfer.payload.title && <p className={s.role}>{transfer.label}</p>}

      {transfer.payload.summary && (
        <Section title={t('Resumen')}>
          <p className={s.summary}>{transfer.payload.summary}</p>
        </Section>
      )}

      {files.length > 0 && (
        <Section title={t('Archivos')} aside={<span className={u.count}>{files.length}</span>}>
          <ul className={s.list}>
            {files.map((f) => {
              const name = basename(f)
              return (
                <li key={f}>
                  <button
                    type="button"
                    className={s.resultRow}
                    disabled={!canOpen}
                    title={canOpen ? t('Abrir {name}', { name }) : f}
                    onClick={() => {
                      if (api && project) api.openPath(project.id, f).catch(() => {})
                    }}
                  >
                    <span className={s.fileIcon}>
                      <FileTypeIcon name={name} size={15} />
                    </span>
                    <span className={s.resultName}>{name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {task && (
        <Section title={t('Tarea relacionada')}>
          <div className={s.task}>
            <div className={s.taskHead}>
              <TaskStatusIcon status={task.status} size={15} />
              <span className={s.taskTitle}>{task.title}</span>
            </div>
            <div className={s.taskFoot}>
              <AgentPill look={lookup(task.agentId)} size="sm" />
              <span className={s.when}>{TASK_STATUS_LABEL[task.status]}</span>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}

/**
 * Razonamiento («think») del modelo de LM Studio: apagado responde antes; se enciende para lo que necesite pensar
 * más. Se guarda en la configuración y vale para las tareas y los mensajes directos.
 */
function ThinkingToggle({ agentId, on }: { agentId: string; on: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toggle = async (): Promise<void> => {
    if (!api || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.setAgentThinking(agentId, !on)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={s.thinking}>
      <div className={s.thinkingText}>
        <span className={s.thinkingTitle}>
          <Brain size={14} aria-hidden="true" />
          {t('Razonamiento (think)')}
        </span>
        <span className={cx(s.resetNote, error && s.resetBad)} role="status">
          {error ?? (on ? t('Encendido: piensa antes de responder (más lento, para lo que necesita mucha información).') : t('Apagado: responde directamente, más rápido.'))}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t('Razonamiento (think)')}
        className={s.thinkingSwitch}
        onClick={() => void toggle()}
        disabled={busy}
      >
        <span className={cx(u.switch, on && u.switchOn)} />
      </button>
    </div>
  )
}

/**
 * «Reiniciar agente» cuando falla: olvida el error, comprueba que responde y lo deja disponible. Con el agente local
 * de LM Studio apagado es «Encender LM Studio»: la comprobación enciende su servidor y carga el modelo.
 */
function ResetAgent({ agentId, startsLmStudio }: { agentId: string; startsLmStudio?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null)
  const reset = async (): Promise<void> => {
    if (!api) return
    setBusy(true)
    setNote(null)
    try {
      const rt = await api.resetAgent(agentId)
      setNote(
        rt.activity === 'offline'
          ? { text: t('Sigue sin responder{reason}. Revisa su instalación o su sesión.', { reason: rt.reason ? `: ${rt.reason}` : '' }), ok: false }
          : startsLmStudio
            ? { text: t('LM Studio encendido: el modelo se está cargando y lo pendiente puede empezar.'), ok: true }
            : { text: t('Reiniciado: vuelve a estar disponible y lo pendiente puede empezar.'), ok: true }
      )
    } catch (e) {
      setNote({ text: errorText(e), ok: false })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={s.reset}>
      <button type="button" className={cx(u.btn, u.btnSm, s.resetBtn)} disabled={busy} onClick={() => void reset()}>
        {busy ? (
          <LoaderCircle size={14} className={u.spin} aria-hidden="true" />
        ) : startsLmStudio ? (
          <Power size={14} aria-hidden="true" />
        ) : (
          <RotateCcw size={14} aria-hidden="true" />
        )}
        {startsLmStudio ? t('Encender LM Studio') : t('Reiniciar agente')}
      </button>
      <span className={cx(s.resetNote, note && !note.ok && s.resetBad)} role="status">
        {note?.text ??
          (startsLmStudio
            ? t('Enciende el servidor de LM Studio, carga el modelo y deja el agente disponible.')
            : t('Olvida el error, comprueba que responde y lo deja disponible.'))}
      </span>
    </div>
  )
}
