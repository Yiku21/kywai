import { Fragment, useEffect, useMemo, useState } from 'react'
import { Award, X } from 'lucide-react'
import { agentQuality, DIFFICULTY_LABEL, QUALITY_MIN_TASKS, type QualityStats } from '@shared/agentQuality'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { compactTokens, shortDuration } from '@/lib/usageStats'
import { useNow } from '../common/hooks'
import { cx } from '../common/util'
import u from '../common/ui.module.css'
import r from '../header/RemoteAccess.module.css'
import s from './UsageDialog.module.css'
import q from './QualityDialog.module.css'
import { t } from '@/lib/i18n'

type Period = '7d' | '30d' | 'all'

const PERIODS: { id: Period; label: string }[] = [
  { id: '7d', label: t('7 días') },
  { id: '30d', label: t('30 días') },
  { id: 'all', label: t('Todo') }
]

const DAY = 24 * 3600_000

/** «78 %» con «7 de 9» debajo, o «—» sin base. */
function Pct({ value, part, total, bad }: { value: number | null; part: number; total: number; bad?: boolean }) {
  if (value == null) return <span className={q.none}>—</span>
  return (
    <>
      <span className={cx(q.pct, bad && s.bad)}>{value} %</span>
      <span className={q.of}>
        {part} {t('de')} {total}
      </span>
    </>
  )
}

/** Celdas de una fila (agente o dificultad). En el móvil cada celda lleva su nombre delante (data-label). */
function Cells({ st }: { st: QualityStats }) {
  return (
    <>
      <td data-label={t('Tareas')}>{st.tasks}</td>
      <td data-label={t('Le sirvió')}>
        <Pct value={st.likedPct} part={st.liked} total={st.rated} bad={st.likedPct != null && st.likedPct < 60} />
      </td>
      <td data-label={t('Verificada a la primera')}>
        <Pct value={st.firstPassPct} part={st.firstPass} total={st.verified} />
      </td>
      <td data-label={t('Necesitó corrección')}>
        <Pct value={st.fixedPct} part={st.fixed} total={st.verified} bad={st.fixedPct != null && st.fixedPct >= 40} />
      </td>
      <td data-label={t('Falló o pasó a otro')}>
        <Pct value={st.failedPct} part={st.failed} total={st.tasks} bad={st.failedPct != null && st.failedPct >= 20} />
      </td>
      <td data-label={t('Tiempo (mediana)')}>{st.medianMs == null ? '—' : shortDuration(st.medianMs)}</td>
      <td data-label={t('Tokens (mediana)')}>{st.medianTokens == null ? '—' : compactTokens(st.medianTokens)}</td>
    </>
  )
}

/** ⋮ → Cómo rinde cada agente: calidad de cada uno (👍, verificación, correcciones, fallos) por dificultad. */
export function QualityDialog({ onClose }: { onClose: () => void }) {
  const all = useCowork((st) => st.usageRuns)
  const project = useCowork((st) => st.live.project)
  const [period, setPeriod] = useState<Period>('30d')
  const [onlyProject, setOnlyProject] = useState(false)
  const now = useNow(30_000)

  // Al abrir, se pide el registro completo (por si se abrió desde otro dispositivo).
  useEffect(() => {
    api?.getUsageRuns().then(
      (list) =>
        useCowork.setState((st) => {
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

  const from = period === 'all' ? 0 : now - (period === '7d' ? 7 : 30) * DAY
  const agents = useMemo(
    () => agentQuality(Object.values(all).filter((run) => !onlyProject || run.projectId === project?.id), from),
    [all, from, onlyProject, project?.id]
  )

  return (
    <div className={r.backdrop} role="dialog" aria-modal="true" aria-labelledby="quality-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx(r.dialog, s.dialog)}>
        <header className={r.head}>
          <Award size={20} aria-hidden="true" className={r.headIcon} />
          <div>
            <h2 id="quality-title" className={r.title}>
              {t('Cómo rinde cada agente')}
            </h2>
            <p className={r.subtitle}>
              {t('Lo que te sirvió, lo que pasó la verificación de otro agente a la primera, lo que hubo que corregir y lo que falló. Por agente y por dificultad.')}
            </p>
          </div>
          <button type="button" className={cx(u.iconBtn, r.close)} aria-label={t('Cerrar')} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className={s.body}>
          <div className={s.controls}>
            <div className={s.seg} role="group" aria-label={t('Periodo')}>
              {PERIODS.map((p) => (
                <button key={p.id} type="button" className={cx(s.segBtn, period === p.id && s.segOn)} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            {project && (
              <label className={s.check}>
                <input type="checkbox" checked={onlyProject} onChange={(e) => setOnlyProject(e.target.checked)} />
                {t('Solo «{name}»', { name: project.name })}
              </label>
            )}
          </div>

          {!agents.length ? (
            <p className={s.empty}>{t('Todavía no hay tareas en este periodo. Cada tarea que haga un agente cuenta aquí en cuanto termine.')}</p>
          ) : (
            <>
              <div className={cx(s.tableWrap, q.wrap)}>
                <table className={cx(s.table, q.table)}>
                  <thead>
                    <tr>
                      <th scope="col">{t('Agente')}</th>
                      <th scope="col">{t('Tareas')}</th>
                      <th scope="col" title={t('De las que valoraste con 👍/👎, las que te sirvieron')}>
                        {t('Le sirvió 👍')}
                      </th>
                      <th scope="col" title={t('De las que comprobó otro agente, las que cumplían a la primera')}>
                        {t('Verificada a la primera')}
                      </th>
                      <th scope="col" title={t('De las que comprobó otro agente, las que tuvo que corregir')}>
                        {t('Necesitó corrección')}
                      </th>
                      <th scope="col" title={t('No pudo hacerla, o la terminó otro agente')}>
                        {t('Falló o pasó a otro')}
                      </th>
                      <th scope="col">{t('Tiempo (mediana)')}</th>
                      <th scope="col">{t('Tokens (mediana)')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a) => (
                      <Fragment key={a.agentId}>
                        <tr className={q.agentRow}>
                          <th scope="row">
                            {a.agentName}
                            {a.tasks < QUALITY_MIN_TASKS && <span className={q.few}>{t('pocos datos')}</span>}
                          </th>
                          <Cells st={a} />
                        </tr>
                        {a.byDifficulty.length > 1 &&
                          a.byDifficulty.map((g) => (
                            <tr key={g.difficulty} className={q.subRow}>
                              <th scope="row">
                                <span className={q.subName}>{a.agentName} · </span>
                                {DIFFICULTY_LABEL[g.difficulty]}
                              </th>
                              <Cells st={g} />
                            </tr>
                          ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={s.note}>
                {t('Cada tarea cuenta una vez por agente, aunque tuviera varios intentos o una corrección (su tiempo y sus tokens se suman). «Le sirvió» sale de tus 👍/👎 en el chat; «verificada» y «corrección», de la comprobación por otro agente (solo las tareas que cambian archivos). Las tareas que detuviste no cuentan. «Sin dato»: tareas anteriores a que se guardara la dificultad.')}
              </p>
              <p className={s.note}>
                {t('El coordinador ve estas cifras en la ficha de cada agente cuando tiene')} {QUALITY_MIN_TASKS} {t('tareas o más en 30 días, y las usa al repartir: la calidad pesa más que la velocidad y el coste.')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
