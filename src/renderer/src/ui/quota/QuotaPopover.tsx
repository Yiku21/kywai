import { useEffect, useId, useMemo, useState, type CSSProperties, type FormEvent, type RefObject } from 'react'
import { AlertTriangle, Ban, Cpu, HelpCircle, Info, Settings2 } from 'lucide-react'
import type { AgentId, QuotaBudget, QuotaInfo } from '@shared/types'
import { useCowork, useData } from '@/store/cowork'
import { api } from '@/lib/api'
import { relativeTime, untilTime } from '@/lib/format'
import { Popover } from '../common/Popover'
import { AgentAvatar } from '../common/AgentBits'
import { useAgentLookup } from '../common/agents'
import { useNow } from '../common/hooks'
import { amount, cx, errorText, kTokens } from '../common/util'
import { describeQuota, KIND_LABEL, SOURCE_LABEL } from './quotaView'
import { LocalConfig } from './LocalConfig'
import { ClaudeDirectFix } from './ClaudeDirectFix'
import u from '../common/ui.module.css'
import s from './QuotaPopover.module.css'

const NA = 'No disponible'

interface Props {
  quota: QuotaInfo
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  id?: string
}

/** Detalle de una cuota anclado bajo su chip. */
export function QuotaPopover({ quota, anchorRef, open, onClose, id }: Props) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      align="end"
      role="dialog"
      ariaLabel={`Detalle de cuota: ${quota.label}`}
      id={id}
      className={s.pop}
    >
      <QuotaDetails quota={quota} />
    </Popover>
  )
}

const PERIOD_LABEL: Record<QuotaBudget['period'], string> = {
  diario: 'Diario',
  '5h': 'Ventana de 5 h',
  semanal: 'Semanal'
}

function QuotaDetails({ quota }: { quota: QuotaInfo }) {
  const thresholds = useCowork((st) => st.config.thresholds)
  const quotaGroups = useCowork((st) => st.config.quotaGroups)
  const mode = useCowork((st) => st.mode)
  const agents = useData((d) => d.agents)
  const runtimes = useData((d) => d.runtimes)
  const lookup = useAgentLookup()
  const now = useNow(15_000)
  const ctxId = useId()
  // El arreglo de Claude sigue a la vista después de usarlo, para ver su resultado aunque la cuota ya no lo pida.
  const [showFix, setShowFix] = useState(false)
  useEffect(() => {
    if (quota.fix === 'claude-direct') setShowFix(true)
  }, [quota.fix])

  // Agentes del grupo: los que indica la cuota + los visibles que comparten grupo (p. ej. becarios).
  const groupAgentIds = useMemo(() => {
    const ids: AgentId[] = [...quota.agentIds]
    for (const a of Object.values(agents)) if (a.quotaGroupId === quota.id && !ids.includes(a.id)) ids.push(a.id)
    return ids
  }, [quota.agentIds, quota.id, agents])

  const firstColor = groupAgentIds.map((id) => agents[id]?.color).find(Boolean)
  const view = describeQuota(quota, thresholds, firstColor)
  const est = view.estimate ? '≈ ' : ''
  const unit = quota.unit ? ` ${quota.unit}` : ''

  const remainingText = quota.unlimited
    ? 'Sin límite (∞)'
    : view.pct != null
      ? `${est}${Math.round(view.pct)}%`
      : NA
  const balance = quota.remaining != null ? `${est}${amount(quota.remaining)}${unit}` : NA
  const limit = quota.limit != null ? `${amount(quota.limit)}${unit}` : quota.unlimited ? 'Sin límite' : NA
  const used: string[] = []
  if (quota.usedTokens != null) used.push(`${kTokens(quota.usedTokens)} tokens`)
  if (quota.usedRequests != null) used.push(`${amount(quota.usedRequests)} ${quota.usedRequests === 1 ? 'solicitud' : 'solicitudes'}`)

  const StatusIcon =
    view.variant === 'warn' || view.variant === 'alert'
      ? AlertTriangle
      : view.variant === 'empty'
        ? Ban
        : view.variant === 'unknown'
          ? HelpCircle
          : view.variant === 'local' || view.variant === 'unlimited'
            ? Cpu
            : null

  const group = quotaGroups.find((g) => g.id === quota.id)
  const isLocalGroup = group?.provider === 'local'
  const canBudget =
    !!api &&
    mode === 'live' &&
    !quota.unlimited &&
    !(isLocalGroup && group?.unlimited) &&
    (quota.source === 'none' || quota.source === 'estimate' || !!group?.budget)

  return (
    <div className={s.root} style={{ '--q': view.color } as CSSProperties}>
      <header className={s.head}>
        <div className={s.titleRow}>
          <h3 className={s.title}>{quota.label}</h3>
          <span className={cx(s.source, s[`src_${quota.source}`])} title="Origen del dato">
            {SOURCE_LABEL[quota.source] ?? NA}
          </span>
        </div>
        <p className={s.kind}>{KIND_LABEL[quota.kind] ?? 'Cuota'}</p>
      </header>

      <div className={s.hero}>
        <div className={s.heroValue}>
          {StatusIcon && <StatusIcon size={16} aria-hidden="true" className={s.heroIcon} />}
          <span className={s.heroNumber}>{view.fixedValue ?? `${est}${Math.round(view.pct ?? 0)}%`}</span>
          <span className={s.heroCaption}>
            {view.variant === 'unlimited'
              ? 'sin límite'
              : view.variant === 'local'
                ? 'sin presupuesto'
                : view.variant === 'unknown'
                  ? 'sin datos de cuota'
                  : view.variant === 'empty'
                    ? 'cuota agotada'
                    : 'restante'}
          </span>
        </div>
        <div className={cx(u.track, s.heroTrack, view.estimate && s.striped, view.variant === 'unknown' && s.dashed)}>
          <span className={u.fill} style={{ '--pct': `${view.barPct}%`, '--bar': 'var(--q)' } as CSSProperties} />
        </div>
      </div>

      <dl className={s.rows}>
        <Row label="Restante" value={remainingText} />
        <Row label="Saldo" value={balance} />
        <Row label="Límite" value={limit} />
        <Row label="Periodo" value={quota.period || NA} />
        <Row label="Renovación" value={quota.resetsAt ? untilTime(quota.resetsAt, now) : NA} />
        <Row label="Última actualización" value={quota.updatedAt ? relativeTime(quota.updatedAt, now) : NA} />
        <Row label="Usado por la app" value={used.length ? used.join(' · ') : NA} />
        <div className={s.row}>
          <dt>Agentes que la comparten</dt>
          <dd>
            {groupAgentIds.length === 0 ? (
              <span className={s.na}>{NA}</span>
            ) : (
              <span className={s.agentChips}>
                {groupAgentIds.map((aid) => {
                  const look = lookup(aid)
                  return (
                    <span key={aid} className={s.agentChip} style={{ '--agent': look.color } as CSSProperties}>
                      <AgentAvatar look={look} size={16} />
                      {look.name}
                    </span>
                  )
                })}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {quota.note && (
        <p className={s.note}>
          <Info size={13} aria-hidden="true" />
          <span>{quota.note}</span>
        </p>
      )}
      {(quota.fix === 'claude-direct' || showFix) && !!api && mode === 'live' && <ClaudeDirectFix />}

      <section className={s.context} aria-labelledby={ctxId}>
        <h4 className={s.sectionTitle} id={ctxId}>
          Capacidad de contexto
        </h4>
        <p className={s.muted}>
          Es por tarea: indica cuánto cabe en la conversación actual de cada agente. No es lo mismo que la cuota.
        </p>
        {groupAgentIds.length === 0 ? (
          <p className={s.na}>{NA}</p>
        ) : (
          <ul className={s.ctxList}>
            {groupAgentIds.map((aid) => {
              const look = lookup(aid)
              const ctx = runtimes[aid]?.context
              const pct = ctx?.capacity ? Math.min(100, (ctx.used / ctx.capacity) * 100) : null
              return (
                <li key={aid} className={s.ctxItem}>
                  <span className={s.ctxName}>
                    <AgentAvatar look={look} size={18} />
                    {look.name}
                  </span>
                  <span className={s.ctxValue}>
                    {ctx
                      ? `${kTokens(ctx.used)} tokens usados${ctx.capacity ? ` de ${kTokens(ctx.capacity)}` : ''}`
                      : NA}
                  </span>
                  {pct != null && (
                    <span className={cx(u.track, u.trackThin, s.ctxTrack)} aria-hidden="true">
                      <span
                        className={u.fill}
                        style={{ '--pct': `${pct}%`, '--bar': pct > 85 ? 'var(--warn)' : look.color } as CSSProperties}
                      />
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {isLocalGroup && !!api && mode === 'live' && <LocalConfig groupId={quota.id} unlimited={!!group?.unlimited} />}
      {canBudget && <BudgetForm groupId={quota.id} existing={group?.budget ?? null} />}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.row}>
      <dt>{label}</dt>
      <dd className={value === NA ? s.na : undefined}>{value}</dd>
    </div>
  )
}

function BudgetForm({ groupId, existing }: { groupId: string; existing: QuotaBudget | null }) {
  // undefined = usar el de la configuración; null = quitado en esta sesión.
  const [saved, setSaved] = useState<QuotaBudget | null | undefined>(undefined)
  const current = saved === undefined ? existing : saved
  const [editing, setEditing] = useState(false)
  const [limit, setLimit] = useState(current ? String(current.limit) : '')
  const [unit, setUnit] = useState<QuotaBudget['unit']>(current?.unit ?? 'tokens')
  const [period, setPeriod] = useState<QuotaBudget['period']>(current?.period ?? 'diario')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const n = Number(limit.replace(/\s/g, '').replace(',', '.'))
  const valid = Number.isFinite(n) && n > 0

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const a = api
    if (!a || !valid || busy) return
    const budget: QuotaBudget = { limit: Math.round(n), unit, period }
    setBusy(true)
    setMsg(null)
    try {
      await a.setQuotaBudget(groupId, budget)
      setSaved(budget)
      setEditing(false)
      setMsg({ tone: 'ok', text: 'Presupuesto guardado' })
    } catch (err) {
      setMsg({ tone: 'error', text: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(): Promise<void> {
    const a = api
    if (!a || busy) return
    setBusy(true)
    setMsg(null)
    try {
      await a.setQuotaBudget(groupId, null)
      setSaved(null)
      setEditing(false)
      setLimit('')
      setMsg({ tone: 'ok', text: 'Presupuesto quitado' })
    } catch (err) {
      setMsg({ tone: 'error', text: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={s.budget}>
      <div className={s.budgetHead}>
        <h4 className={s.sectionTitle}>
          <Settings2 size={13} aria-hidden="true" /> Presupuesto
        </h4>
        {current && !editing && (
          <span className={s.budgetSummary}>
            {amount(current.limit)} {current.unit} · {PERIOD_LABEL[current.period]}
          </span>
        )}
      </div>

      {!editing ? (
        <div className={s.budgetActions}>
          <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setEditing(true)} disabled={busy}>
            {current ? 'Editar presupuesto' : 'Configurar presupuesto'}
          </button>
          {current && (
            <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={remove} disabled={busy}>
              Quitar presupuesto
            </button>
          )}
        </div>
      ) : (
        <form className={s.form} onSubmit={submit}>
          <p className={s.muted}>
            Sin datos reales de este proveedor: define un límite y la app estimará el saldo con el consumo registrado.
          </p>
          <label className={s.field}>
            <span>Límite</span>
            <input
              className={s.input}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="500000"
              autoFocus
              required
            />
          </label>
          <div className={s.fieldRow}>
            <label className={s.field}>
              <span>Unidad</span>
              <select className={s.input} value={unit} onChange={(e) => setUnit(e.target.value as QuotaBudget['unit'])}>
                <option value="tokens">tokens</option>
                <option value="solicitudes">solicitudes</option>
              </select>
            </label>
            <label className={s.field}>
              <span>Periodo</span>
              <select className={s.input} value={period} onChange={(e) => setPeriod(e.target.value as QuotaBudget['period'])}>
                <option value="diario">Diario</option>
                <option value="5h">Ventana de 5 h</option>
                <option value="semanal">Semanal</option>
              </select>
            </label>
          </div>
          <div className={s.budgetActions}>
            <button type="submit" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={!valid || busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => setEditing(false)} disabled={busy}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {msg && (
        <p className={cx(s.formMsg, msg.tone === 'error' && s.formError)} role="status">
          {msg.text}
        </p>
      )}
    </section>
  )
}
