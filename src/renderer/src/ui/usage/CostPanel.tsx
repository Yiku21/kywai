import { useMemo, useState } from 'react'
import type { BillingMode, CostCurrency, CostSettings, ModelPrice, UsageRun } from '@shared/types'
import {
  billingPlans,
  costSummary,
  dayStart,
  DEFAULT_PRICES,
  DEFAULT_USD_TO_EUR,
  formatMoney,
  PRICES_CHECKED,
  subscriptionVerdict,
  usdTo,
  type CallCost,
  type CostSummary
} from '@shared/costs'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { locale, t } from '@/lib/i18n'
import { cx } from '../common/util'
import u from '../common/ui.module.css'
import s from './UsageDialog.module.css'
import c from './CostPanel.module.css'

const DAY = 24 * 3600_000

const FIELD_LABEL = { input: t('Entrada'), cached: t('De caché'), output: t('Salida') }

export const MODE_LABEL: Record<BillingMode, string> = {
  subscription: t('Suscripción'),
  api: t('Pago por uso (API)'),
  free: t('Gratis'),
  local: t('En tu equipo')
}

/** Cómo se enseña el dinero con los ajustes del usuario (en su moneda). */
export function useMoney(): (usd: number) => string {
  const costs = useCowork((st) => st.config.costs)
  return (usd: number) => formatMoney(usdTo(usd, costs), costs?.currency ?? 'USD', locale())
}

/** «0,12 $», «≈0,01 $» si sale de tokens estimados, «gratis» o «—» si no hay precio. */
export function costText(cost: CallCost, money: (usd: number) => string): string {
  if (cost.source === 'free') return t('gratis')
  if (cost.usd == null) return '—'
  return cost.source === 'estimated' ? `≈${money(cost.usd)}` : money(cost.usd)
}

export function useCostSummary(runs: UsageRun[], allRuns: UsageRun[], now: number): CostSummary {
  const config = useCowork((st) => st.config)
  return useMemo(() => costSummary(runs, config, allRuns, now), [runs, allRuns, config, now])
}

/** Dinero del periodo: lo que pagaste por uso, lo que valió todo a precios de API, el presupuesto y si compensan tus suscripciones. */
export function CostPanel({ sum, from, now, showDays }: { sum: CostSummary; from: number; now: number; showDays: boolean }) {
  const money = useMoney()
  const [editing, setEditing] = useState(false)
  const subs = sum.byPlan.filter((p) => p.mode === 'subscription')
  const budget = sum.budget

  return (
    <section className={s.section} aria-labelledby="usage-cost">
      <h3 id="usage-cost" className={s.h3}>
        {t('Coste')}
      </h3>
      <div className={s.cards}>
        <div className={s.card}>
          <span className={s.cardLabel}>{t('Pagado por uso')}</span>
          <span className={s.cardBig}>{money(sum.paidUsd)}</span>
          <span className={s.cardSub}>{t('agentes que van por API, en este periodo')}</span>
        </div>
        <div className={s.card}>
          <span className={s.cardLabel}>{t('A precios de API')}</span>
          <span className={s.cardBig}>{money(sum.apiUsd)}</span>
          <span className={s.cardSub}>
            {[
              t('lo que valdría todo lo usado'),
              sum.estimatedUsd > 0 && t('≈{money} estimado', { money: money(sum.estimatedUsd) }),
              sum.unpricedCalls > 0 && t('{n} llamadas sin precio', { n: sum.unpricedCalls })
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        {budget && (
          <div className={s.card}>
            <span className={s.cardLabel}>{t('Presupuesto del mes')}</span>
            <span className={cx(s.cardBig, budget.pct >= 100 ? c.over : budget.pct >= 80 ? c.near : undefined)}>{budget.pct} %</span>
            <span className={cx(u.track, c.track)}>
              <span className={cx(u.fill, c.fill, budget.pct >= 100 ? c.fillOver : budget.pct >= 80 ? c.fillNear : undefined)} style={{ width: `${Math.min(100, budget.pct)}%` }} />
            </span>
            <span className={s.cardSub}>{t('{spent} de {limit} por API', { spent: money(budget.spentUsd), limit: money(budget.limitUsd) })}</span>
          </div>
        )}
      </div>

      {showDays && <DayChart sum={sum} from={from} now={now} money={money} />}

      {subs.length > 0 && (
        <div className={c.subs}>
          <h4 className={c.h4}>{t('¿Te compensan tus suscripciones?')}</h4>
          <ul className={c.subList}>
            {subs.map((p) => {
              const verdict = subscriptionVerdict(p)
              return (
                <li key={p.key}>
                  <strong>{p.label}</strong>
                  {p.monthlyUsd == null ? (
                    <span className={s.muted}>{t('Pon cuánto pagas al mes para compararlo.')}</span>
                  ) : (
                    <>
                      <span className={verdict === 'worth' ? c.good : c.bad}>
                        {verdict === 'worth' ? t('Compensa') : t('Por API te saldría más barato')}
                      </span>
                      <span className={s.muted}>
                        {t('Pagas {monthly} al mes; lo que usaste en 30 días habría costado {api} por API', { monthly: money(p.monthlyUsd), api: money(p.api30Usd) })}
                        {p.runs30 > 0 && t(' · {cost} por petición ({n} peticiones)', { cost: money(p.monthlyUsd / p.runs30), n: p.runs30 })}
                        {p.unpriced > 0 && t(' · {n} llamadas sin precio', { n: p.unpriced })}
                      </span>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          <p className={s.note}>
            {t('Solo cuenta lo que hiciste desde kywai: si usas la misma cuenta en otros sitios, la suscripción te rinde más de lo que sale aquí.')}
          </p>
        </div>
      )}

      {sum.unknownModeCalls > 0 && !editing && (
        <p className={s.note}>
          {t('Hay agentes sin indicar cómo los pagas: cuentan a precios de API, pero no como pagado.')}{' '}
          <button type="button" className={s.link} onClick={() => setEditing(true)}>
            {t('Indicarlo')}
          </button>
        </p>
      )}

      <details className={c.settings} open={editing} onToggle={(e) => setEditing((e.target as HTMLDetailsElement).open)}>
        <summary className={c.settingsSummary}>{t('Cómo pagas cada agente, precios y presupuesto')}</summary>
        {editing && <CostSettingsForm onSaved={() => setEditing(false)} />}
      </details>
    </section>
  )
}

function DayChart({ sum, from, now, money }: { sum: CostSummary; from: number; now: number; money: (usd: number) => string }) {
  // Los días del periodo (como mucho 30): los que no tuvieron uso salen vacíos.
  const last = dayStart(now)
  const first = Math.max(dayStart(from || sum.byDay[0]?.day || now), last - 29 * DAY)
  const days: { day: number; api: number; paid: number }[] = []
  for (let d = first; d <= last; d = dayStart(d + DAY + 3600_000)) {
    const found = sum.byDay.find((x) => x.day === d)
    days.push({ day: d, api: found?.apiUsd ?? 0, paid: found?.paidUsd ?? 0 })
  }
  const max = Math.max(...days.map((d) => d.api), 0)
  if (days.length < 2 || max <= 0) return null
  const label = (d: number): string => new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
  return (
    <figure className={c.chart} aria-label={t('Coste por día')}>
      <div className={c.bars}>
        {days.map((d) => (
          <div
            key={d.day}
            className={c.barCol}
            title={`${label(d.day)}: ${money(d.api)} ${t('a precios de API')}${d.paid > 0 ? ` · ${money(d.paid)} ${t('pagado por uso')}` : ''}`}
          >
            <span className={c.bar} style={{ height: `${(d.api / max) * 100}%` }}>
              {d.paid > 0 && <span className={c.barPaid} style={{ height: `${Math.min(100, (d.paid / d.api) * 100)}%` }} />}
            </span>
          </div>
        ))}
      </div>
      <figcaption className={c.chartFoot}>
        <span>{label(days[0].day)}</span>
        <span className={c.legend}>
          <i className={c.dotApi} /> {t('a precios de API')} <i className={c.dotPaid} /> {t('pagado por uso')}
        </span>
        <span>{label(days[days.length - 1].day)}</span>
      </figcaption>
    </figure>
  )
}

const num = (v: string): number | undefined => {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function CostSettingsForm({ onSaved }: { onSaved: () => void }) {
  const config = useCowork((st) => st.config)
  const plans = useMemo(() => billingPlans(config), [config])
  const [draft, setDraft] = useState<CostSettings>(() => ({
    currency: config.costs?.currency ?? (config.language === 'en' || config.language === 'zh' ? 'USD' : 'EUR'),
    usdToEur: config.costs?.usdToEur ?? DEFAULT_USD_TO_EUR,
    plans: { ...(config.costs?.plans ?? {}) },
    prices: { ...(config.costs?.prices ?? {}) },
    ...(config.costs?.monthlyBudget ? { monthlyBudget: config.costs.monthlyBudget, budgetCurrency: config.costs.budgetCurrency } : {})
  }))
  const [newModel, setNewModel] = useState({ key: '', input: '', cached: '', output: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const symbol = (cur: CostCurrency): string => (cur === 'EUR' ? '€' : '$')

  const setPlan = (key: string, patch: { mode?: BillingMode | ''; monthly?: number | undefined }): void =>
    setDraft((d) => {
      const plans = { ...d.plans }
      const cur = plans[key]
      const mode = patch.mode === '' ? undefined : (patch.mode ?? cur?.mode)
      if (!mode) delete plans[key]
      else {
        const monthly = 'monthly' in patch ? patch.monthly : cur?.monthly
        plans[key] = mode === 'subscription' && monthly != null ? { mode, monthly, currency: d.currency } : { mode }
      }
      return { ...d, plans }
    })

  const setPrice = (key: string, field: keyof ModelPrice, value: string, base: ModelPrice): void =>
    setDraft((d) => {
      const prices = { ...(d.prices ?? {}) }
      const cur: ModelPrice = { ...(prices[key] ?? base) }
      const n = num(value)
      if (field === 'cached') {
        if (n == null) delete cur.cached
        else cur.cached = n
      } else if (n != null) cur[field] = n
      prices[key] = cur
      return { ...d, prices }
    })

  const resetPrice = (key: string): void =>
    setDraft((d) => {
      const prices = { ...(d.prices ?? {}) }
      delete prices[key]
      return { ...d, prices }
    })

  const addModel = (): void => {
    const key = newModel.key.trim().toLowerCase()
    const input = num(newModel.input)
    const output = num(newModel.output)
    if (!key || input == null || output == null) return
    const cached = num(newModel.cached)
    setDraft((d) => ({ ...d, prices: { ...(d.prices ?? {}), [key]: cached == null ? { input, output } : { input, output, cached } } }))
    setNewModel({ key: '', input: '', cached: '', output: '' })
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      // Las suscripciones van en la moneda elegida.
      const plansOut = Object.fromEntries(Object.entries(draft.plans).map(([k, p]) => [k, p.mode === 'subscription' ? { ...p, currency: draft.currency } : p]))
      await api!.setCostSettings({ ...draft, plans: plansOut, ...(draft.monthlyBudget ? { budgetCurrency: draft.currency } : {}) })
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const customKeys = Object.keys(draft.prices ?? {}).filter((k) => !DEFAULT_PRICES.some((e) => e.id === k))

  return (
    <div className={c.form}>
      <div className={c.row}>
        <label className={c.field}>
          {t('Moneda')}
          <select value={draft.currency} onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value as CostCurrency }))}>
            <option value="EUR">{t('Euros (€)')}</option>
            <option value="USD">{t('Dólares ($)')}</option>
          </select>
        </label>
        {draft.currency === 'EUR' && (
          <label className={c.field}>
            {t('1 $ son')}
            <input className={c.num} type="number" min={0} step={0.01} value={draft.usdToEur} onChange={(e) => setDraft((d) => ({ ...d, usdToEur: num(e.target.value) ?? d.usdToEur }))} />
            €
          </label>
        )}
        <label className={c.field}>
          {t('Presupuesto al mes por API')}
          <input
            className={c.num}
            type="number"
            min={0}
            step={1}
            placeholder={t('sin límite')}
            value={draft.monthlyBudget ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, monthlyBudget: num(e.target.value) || undefined }))}
          />
          {symbol(draft.currency)}
        </label>
      </div>

      <h4 className={c.h4}>{t('Cómo pagas')}</h4>
      <ul className={c.planList}>
        {plans.map((p) => {
          const plan = draft.plans[p.key]
          const mode = plan?.mode ?? ''
          return (
            <li key={p.key}>
              <span className={c.planName}>{p.label}</span>
              <select value={mode} onChange={(e) => setPlan(p.key, { mode: e.target.value as BillingMode | '' })} aria-label={t('Cómo pagas {name}', { name: p.label })}>
                <option value="">{p.defaultMode ? t('{mode} (por defecto)', { mode: MODE_LABEL[p.defaultMode] }) : t('Sin indicar')}</option>
                {(Object.keys(MODE_LABEL) as BillingMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </select>
              {mode === 'subscription' && (
                <label className={c.field}>
                  <input
                    className={c.num}
                    type="number"
                    min={0}
                    step={1}
                    placeholder="20"
                    value={plan?.monthly ?? ''}
                    onChange={(e) => setPlan(p.key, { monthly: num(e.target.value) })}
                    aria-label={t('Precio al mes de {name}', { name: p.label })}
                  />
                  {t('{symbol} al mes', { symbol: symbol(draft.currency) })}
                </label>
              )}
            </li>
          )
        })}
      </ul>

      <h4 className={c.h4}>{t('Precios por millón de tokens (en dólares)')}</h4>
      <p className={s.note}>{t('Precios oficiales comprobados el {date}. Cambia los que no cuadren con lo que pagas.', { date: new Date(PRICES_CHECKED).toLocaleDateString(locale()) })}</p>
      <div className={s.tableWrap}>
        <table className={cx(s.table, c.priceTable)}>
          <thead>
            <tr>
              <th scope="col">{t('Modelo')}</th>
              <th scope="col">{t('Entrada')}</th>
              <th scope="col">{t('De caché')}</th>
              <th scope="col">{t('Salida')}</th>
              <th scope="col" aria-label={t('Acciones')} />
            </tr>
          </thead>
          <tbody>
            {DEFAULT_PRICES.map((e) => {
              const own = draft.prices?.[e.id]
              const p = own ?? e.price
              return (
                <tr key={e.id} className={own ? c.changed : undefined}>
                  <th scope="row">
                    {e.label}
                    {e.note && <span className={c.priceNote}>· {t(e.note)}</span>}
                  </th>
                  {(['input', 'cached', 'output'] as const).map((f) => (
                    <td key={f}>
                      <input className={c.num} type="number" min={0} step={0.01} value={p[f] ?? ''} onChange={(ev) => setPrice(e.id, f, ev.target.value, e.price)} aria-label={`${e.label} · ${FIELD_LABEL[f]}`} />
                    </td>
                  ))}
                  <td>
                    {own && (
                      <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => resetPrice(e.id)}>
                        {t('Original')}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {customKeys.map((k) => {
              const p = draft.prices![k]
              return (
                <tr key={k} className={c.changed}>
                  <th scope="row">{k}</th>
                  {(['input', 'cached', 'output'] as const).map((f) => (
                    <td key={f}>
                      <input className={c.num} type="number" min={0} step={0.01} value={p[f] ?? ''} onChange={(ev) => setPrice(k, f, ev.target.value, p)} aria-label={`${k} · ${FIELD_LABEL[f]}`} />
                    </td>
                  ))}
                  <td>
                    <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => resetPrice(k)}>
                      {t('Quitar')}
                    </button>
                  </td>
                </tr>
              )
            })}
            <tr>
              <th scope="row">
                <input
                  className={c.text}
                  placeholder={t('otro modelo (p. ej. deepseek)')}
                  value={newModel.key}
                  onChange={(e) => setNewModel((m) => ({ ...m, key: e.target.value }))}
                  aria-label={t('Nombre del modelo')}
                />
              </th>
              {(['input', 'cached', 'output'] as const).map((f) => (
                <td key={f}>
                  <input className={c.num} type="number" min={0} step={0.01} value={newModel[f]} onChange={(e) => setNewModel((m) => ({ ...m, [f]: e.target.value }))} aria-label={`${t('Otro modelo')} · ${FIELD_LABEL[f]}`} />
                </td>
              ))}
              <td>
                <button type="button" className={cx(u.btn, u.btnSm)} onClick={addModel} disabled={!newModel.key.trim() || num(newModel.input) == null || num(newModel.output) == null}>
                  {t('Añadir')}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={s.note}>{t('Lo local y los modelos «gratis» (los que acaban en :free o /free) no cuestan nada. Claude Code dice él mismo lo que costó cada tarea y se usa ese dato.')}</p>

      <div className={c.actions}>
        {error && <span className={s.bad}>{error}</span>}
        <button type="button" className={cx(u.btn, u.btnPrimary)} onClick={() => void save()} disabled={busy}>
          {t('Guardar')}
        </button>
      </div>
    </div>
  )
}
