import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, X } from 'lucide-react'
import type { UsageCall, UsageRun } from '@shared/types'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import {
  callTokens,
  compactTokens,
  deltaText,
  quotaDeltas,
  runDuration,
  shortDuration,
  statusLabel,
  summarize,
  usageCsv
} from '@/lib/usageStats'
import { useNow } from '../common/hooks'
import { cx } from '../common/util'
import u from '../common/ui.module.css'
import r from '../header/RemoteAccess.module.css'
import s from './UsageDialog.module.css'

type Period = 'today' | '7d' | '30d' | 'all'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: 'all', label: 'Todo' }
]

const DAY = 24 * 3600_000

function periodStart(p: Period, now: number): number {
  if (p === 'all') return 0
  if (p === 'today') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  return now - (p === '7d' ? 7 : 30) * DAY
}

const when = (ts: number): string =>
  new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Minuto en que empezó una llamada, contado desde la petición («5,9»): los huecos entre pasos son esperas. */
const startMinute = (run: UsageRun, c: UsageCall): string =>
  (Math.max(0, c.ts - c.durationMs - run.startedAt) / 60_000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const pct = (part: number, total: number): string => (total > 0 ? `${Math.round((part / total) * 100)} %` : '—')

/** ⋮ → Consumo: lo que gasta cada petición (tokens, tiempo y cuota de tus suscripciones), para ver si compensa. */
export function UsageDialog({ onClose }: { onClose: () => void }) {
  const all = useCowork((st) => st.usageRuns)
  const project = useCowork((st) => st.live.project)
  const [period, setPeriod] = useState<Period>('7d')
  const [onlyProject, setOnlyProject] = useState(false)
  const now = useNow(5000)

  // Al abrir, se pide el registro completo (por si se abrió desde otro dispositivo).
  useEffect(() => {
    api?.getUsageRuns().then(
      (list) =>
        useCowork.setState((st) => {
          // Lo que ya llegó por eventos es igual o más reciente.
          const usageRuns = { ...st.usageRuns }
          for (const run of list) usageRuns[run.runId] ??= run
          return { usageRuns }
        }),
      () => undefined
    )
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const from = periodStart(period, now)
  const runs = useMemo(
    () =>
      Object.values(all)
        .filter((run) => run.startedAt >= from && (!onlyProject || run.projectId === project?.id))
        .sort((a, b) => b.startedAt - a.startedAt),
    [all, from, onlyProject, project?.id]
  )
  const t = useMemo(() => summarize(runs, now), [runs, now])

  function exportCsv(): void {
    const csv = usageCsv([...runs].reverse())
    // Con BOM para que Excel lea bien los acentos.
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `consumo-ai-cowork-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const parallel = t.wallMs > 0 ? t.agentMs / t.wallMs : 0
  const counts = [
    t.ok && `${t.ok} bien`,
    t.failed && `${t.failed} con errores`,
    t.cancelled && `${t.cancelled} ${t.cancelled === 1 ? 'cancelada' : 'canceladas'}`,
    t.running && `${t.running} en marcha`
  ].filter(Boolean)

  return (
    <div className={r.backdrop} role="dialog" aria-modal="true" aria-labelledby="usage-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx(r.dialog, s.dialog)}>
        <header className={r.head}>
          <BarChart3 size={20} aria-hidden="true" className={r.headIcon} />
          <div>
            <h2 id="usage-title" className={r.title}>
              Consumo
            </h2>
            <p className={r.subtitle}>Lo que gasta cada petición: tokens, tiempo y cuota de tus suscripciones. Para ver si compensa.</p>
          </div>
          <button type="button" className={cx(u.iconBtn, r.close)} aria-label="Cerrar" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className={s.body}>
          <div className={s.controls}>
            <div className={s.seg} role="group" aria-label="Periodo">
              {PERIODS.map((p) => (
                <button key={p.id} type="button" className={cx(s.segBtn, period === p.id && s.segOn)} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            {project && (
              <label className={s.check}>
                <input type="checkbox" checked={onlyProject} onChange={(e) => setOnlyProject(e.target.checked)} />
                Solo «{project.name}»
              </label>
            )}
            <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost, s.export)} onClick={exportCsv} disabled={!runs.length}>
              <Download size={13} aria-hidden="true" />
              Exportar CSV
            </button>
          </div>

          {!runs.length ? (
            <p className={s.empty}>
              Todavía no hay peticiones en este periodo. Desde ahora, cada petición queda registrada con sus tokens, su tiempo y la cuota que gastó.
            </p>
          ) : (
            <>
              <div className={s.cards}>
                <Card label="Peticiones" big={String(t.runs)} sub={counts.join(' · ')} />
                <Card
                  label="Tiempo"
                  big={shortDuration(t.wallMs)}
                  sub={`${shortDuration(t.agentMs)} de trabajo de agentes${parallel >= 1.15 ? ` (×${parallel.toLocaleString('es-ES', { maximumFractionDigits: 1 })} en paralelo)` : ''}`}
                />
                <Card label="Tokens" big={compactTokens(t.tokens)} sub={`${compactTokens(t.freshTokens)} sin contar caché`} />
                <Card label="Coordinar" big={pct(t.planTokens, t.tokens)} sub={`de los tokens en planificar · ${pct(t.wastedTokens, t.tokens)} en intentos fallidos`} />
              </div>

              <section className={s.section} aria-labelledby="usage-quota">
                <h3 id="usage-quota" className={s.h3}>
                  Cuota de tus suscripciones gastada
                </h3>
                {t.quota.length ? (
                  <ul className={s.quotaList}>
                    {t.quota.map((q) => (
                      <li key={q.key}>
                        <strong>
                          {q.group} · {q.label}
                        </strong>
                        <span className={s.quotaDelta}>+{q.delta.toLocaleString('es-ES')} %</span>
                        <span className={s.muted}>
                          en {q.runs} {q.runs === 1 ? 'petición medida' : 'peticiones medidas'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={s.muted}>Aún no hay medidas: se toma la cuota de Claude y GPT antes y después de cada petición.</p>
                )}
                <p className={s.note}>
                  Se mide antes y después de cada petición, así que incluye cualquier otro uso de la misma cuenta en ese rato (por ejemplo, Claude
                  Code en otro equipo). Una petición corta puede no llegar a mover el porcentaje.
                </p>
              </section>

              <section className={s.section} aria-labelledby="usage-agents">
                <h3 id="usage-agents" className={s.h3}>
                  Por agente
                </h3>
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th scope="col">Agente</th>
                        <th scope="col">Llamadas</th>
                        <th scope="col">Entrada</th>
                        <th scope="col">Salida</th>
                        <th scope="col">De caché</th>
                        <th scope="col">Tiempo</th>
                        <th scope="col">Fallos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.byAgent.map((a) => (
                        <tr key={a.key}>
                          <th scope="row">{a.name}</th>
                          <td>{a.calls}</td>
                          <td>{a.noTokens ? '—' : compactTokens(a.input)}</td>
                          <td>{a.noTokens ? '—' : compactTokens(a.output)}</td>
                          <td>{a.noTokens ? '—' : compactTokens(a.cached)}</td>
                          <td>{shortDuration(a.durationMs)}</td>
                          <td className={a.failed ? s.bad : undefined}>{a.failed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={s.note}>
                  ¿Y la calidad?{' '}
                  <button type="button" className={s.link} onClick={() => useCowork.setState({ usageOpen: false, qualityOpen: true })}>
                    Cómo rinde cada agente
                  </button>
                  : lo que te sirvió, lo que pasó la verificación a la primera y lo que falló.
                </p>
                {t.noTokenCalls > 0 && (
                  <p className={s.note}>Hermes no informa sus tokens (pasa por OmniRoute): sus llamadas cuentan, pero sus tokens no.</p>
                )}
              </section>

              <section className={s.section} aria-labelledby="usage-runs">
                <h3 id="usage-runs" className={s.h3}>
                  Peticiones
                </h3>
                <ul className={s.runs}>
                  {runs.slice(0, 150).map((run) => (
                    <RunItem key={run.runId} run={run} now={now} />
                  ))}
                </ul>
                <p className={s.note}>
                  Para comparar con un solo agente (por ejemplo, Codex aparte), haz la misma petición allí y compárala con su fila: tiempo, tokens
                  (en Codex, «/status») y cuota gastada.
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Card({ label, big, sub }: { label: string; big: string; sub: string }) {
  return (
    <div className={s.card}>
      <span className={s.cardLabel}>{label}</span>
      <span className={s.cardBig}>{big}</span>
      <span className={s.cardSub}>{sub}</span>
    </div>
  )
}

function RunItem({ run, now }: { run: UsageRun; now: number }) {
  const tokens = run.calls.reduce((n, c) => n + callTokens(c), 0)
  const deltas = quotaDeltas(run.quotaBefore, run.quotaAfter).filter((d) => d.delta > 0)
  return (
    <li>
      <details className={s.run}>
        <summary className={s.runSummary}>
          <span className={s.runWhen}>{when(run.startedAt)}</span>
          <span className={s.runText} title={run.request}>
            {run.request || '(sin texto)'}
          </span>
          <span className={cx(s.status, s[`st_${run.status}`])}>{statusLabel(run.status)}</span>
          <span className={s.runNums}>
            {shortDuration(runDuration(run, now))} · {compactTokens(tokens)} tokens
            {deltas.map((d) => ` · ${deltaText(d)}`).join('')}
          </span>
        </summary>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Paso</th>
                <th scope="col">Agente</th>
                <th scope="col">Modelo</th>
                <th scope="col">Entrada</th>
                <th scope="col">Salida</th>
                <th scope="col">De caché</th>
                <th scope="col" title="Minuto en que empezó, contado desde la petición: los huecos son esperas">
                  Empieza
                </th>
                <th scope="col">Tiempo</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {run.calls.map((c, i) => (
                <tr key={i}>
                  <td>{c.kind === 'plan' ? 'Planificar' : c.kind === 'verify' ? 'Verificar' : 'Tarea'}</td>
                  <th scope="row">{c.agentName}</th>
                  <td>{c.model ?? '—'}</td>
                  <td>{c.noTokens ? '—' : compactTokens(c.input)}</td>
                  <td>{c.noTokens ? '—' : compactTokens(c.output)}</td>
                  <td>{c.noTokens ? '—' : compactTokens(c.cached)}</td>
                  <td>min {startMinute(run, c)}</td>
                  <td>{shortDuration(c.durationMs)}</td>
                  <td className={c.ok ? undefined : s.bad}>{c.ok ? 'Bien' : 'Falló'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={s.runFoot}>
          {run.projectName} · {run.tasksDone}/{run.tasks} tareas completadas
          {run.status !== 'running' && !run.quotaAfter && ' · cuota final sin medir'}
        </p>
      </details>
    </li>
  )
}
