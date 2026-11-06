import { useEffect, useId, useState, type FormEvent } from 'react'
import { CalendarClock, Check, ChevronDown, Copy, KeyRound, LoaderCircle, Pencil, Play, Plus, Trash2, Webhook } from 'lucide-react'
import type { Routine, RoutineInput, RoutineRun, RoutineTrigger, RoutineTriggerType, RoutineWebhookInfo } from '@shared/types'
import { dayName, dayShort, describeTrigger, describeWhen, MAX_INTERVAL_HOURS, MAX_ROUTINE_NAME, MAX_ROUTINE_REQUEST, WEEK_ORDER } from '@shared/routines'
import { useCowork, useData } from '@/store/cowork'
import { api } from '@/lib/api'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import v from './Views.module.css'
import s from './RoutinesView.module.css'
import { locale, t } from '@/lib/i18n'

const TYPE_LABEL: Record<RoutineTriggerType, string> = {
  daily: t('Cada día a una hora'),
  weekly: t('Unos días de la semana'),
  interval: t('Cada N horas'),
  webhook: t('Al llegar un webhook'),
  folder: t('Al cambiar archivos de una carpeta')
}
const TYPES: RoutineTriggerType[] = ['daily', 'weekly', 'interval', 'webhook', 'folder']

const STATUS_LABEL: Record<RoutineRun['status'], string> = {
  running: t('En marcha'),
  waiting: t('Esperando tu visto bueno'),
  ok: t('Hecha'),
  failed: t('Falló'),
  skipped: t('Saltada'),
  interrupted: t('Interrumpida')
}

const REASON_LABEL: Record<RoutineRun['reason'], string> = {
  schedule: t('a su hora'),
  catchup: t('hora perdida'),
  webhook: 'webhook',
  folder: t('cambios en la carpeta'),
  manual: t('a mano')
}

function when(ts: number): string {
  return new Date(ts).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Copia al portapapeles; en http (sin contexto seguro, como el navegador del móvil por Tailscale) con execCommand. */
async function copyText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  ta.setSelectionRange(0, text.length)
  const ok = document.execCommand('copy')
  ta.remove()
  if (!ok) throw new Error(t('No se pudo copiar: mantén pulsada la dirección y cópiala a mano'))
}

/** Pestaña Rutinas: peticiones que se lanzan solas (a una hora, por webhook o al cambiar archivos) y su historial. */
export function RoutinesView() {
  const routines = useData((d) => d.routines)
  const project = useCowork((st) => st.live.project)
  const mode = useCowork((st) => st.mode)
  const editable = !!api && mode === 'live' && !!project
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idL = useId()
  const pid = project?.id ?? ''

  async function call<T>(fn: () => Promise<T>): Promise<T | null> {
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(errorText(e))
      return null
    }
  }

  return (
    <div className={v.scroll}>
      <p className={s.intro}>
        {t('Peticiones que se envían solas al chat de este proyecto, como si las escribieras tú: pasan por el plan, los agentes y la verificación. Se lanzan a una hora, al llegar un webhook o al cambiar archivos, mientras AI Cowork esté abierto en el servidor. Nunca hay dos a la vez de la misma rutina. También puedes escribir')} <b>{t('/rutina cada día a las 9:00: …')}</b> {t('en el chat.')}
      </p>

      <section className={v.section} aria-labelledby={idL}>
        <h3 className={u.sectionLabel} id={idL}>
          {t('Rutinas')} <span className={u.count}>{routines.length}</span>
        </h3>

        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}

        {editable &&
          (creating ? (
            <RoutineForm
              onCancel={() => setCreating(false)}
              onSave={async (input) => {
                const ok = await call(() => api!.createRoutine(pid, input))
                if (ok) setCreating(false)
                return !!ok
              }}
            />
          ) : (
            <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary, s.newBtn)} onClick={() => setCreating(true)}>
              <Plus size={14} aria-hidden="true" />
              {t('Nueva rutina')}
            </button>
          ))}

        {routines.length === 0 && !creating ? (
          <div className={u.empty}>
            <span className={u.emptyIcon}>
              <CalendarClock size={20} aria-hidden="true" />
            </span>
            <span className={u.emptyTitle}>{t('Sin rutinas')}</span>
            <span className={u.emptyText}>
              {mode === 'demo'
                ? t('En la demo no hay rutinas: aparecen con los agentes reales.')
                : t('Por ejemplo: cada mañana a las 8:30, «revisa las dependencias y avísame de las que tengan fallos de seguridad»; o, al llegar un PR de GitHub, «revísalo».')}
            </span>
          </div>
        ) : (
          <ul className={s.list}>
            {routines.map((r) => (
              <RoutineCard key={r.id} r={r} projectId={pid} editable={editable} call={call} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

type Call = <T>(fn: () => Promise<T>) => Promise<T | null>

function RoutineCard({ r, projectId, editable, call }: { r: Routine; projectId: string; editable: boolean; call: Call }) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showHook, setShowHook] = useState(false)
  const [running, setRunning] = useState(false)
  const [ran, setRan] = useState<string | null>(null)
  // La calcula el servidor (con su reloj y su zona horaria).
  const next = r.nextAt ?? null
  const last = r.runs[r.runs.length - 1]

  if (editing) {
    return (
      <li className={s.card}>
        <RoutineForm
          initial={r}
          onCancel={() => setEditing(false)}
          onSave={async (input) => {
            const ok = await call(() => api!.updateRoutine(projectId, r.id, input))
            if (ok) setEditing(false)
            return !!ok
          }}
        />
      </li>
    )
  }

  return (
    <li className={cx(s.card, !r.enabled && s.cardOff)}>
      <div className={s.head}>
        <div className={s.headText}>
          <span className={s.name}>{r.name}</span>
          <span className={s.trigger}>
            {describeTrigger(r.trigger)}
            {r.enabled ? (next ? t(' · próxima {when}', { when: describeWhen(next) }) : '') : t(' · desactivada')}
          </span>
        </div>
        {editable && (
          <button
            type="button"
            role="switch"
            aria-checked={r.enabled}
            aria-label={r.enabled ? t('Desactivar la rutina') : t('Activar la rutina')}
            title={r.enabled ? t('Activa: pulsa para desactivarla') : t('Desactivada: pulsa para activarla')}
            className={s.switchBtn}
            onClick={() => void call(() => api!.updateRoutine(projectId, r.id, { enabled: !r.enabled }))}
          >
            <span className={cx(u.switch, r.enabled && u.switchOn)} aria-hidden="true" />
          </button>
        )}
      </div>

      <p className={s.request}>{r.request}</p>

      {last && (
        <p className={s.lastRun}>
          {t('Última:')} <StatusPill status={last.status} /> {when(last.at)} · {REASON_LABEL[last.reason]}
        </p>
      )}

      {editable && (
        <div className={s.actions}>
          <button
            type="button"
            className={cx(u.btn, u.btnSm)}
            disabled={running}
            onClick={() => {
              setRunning(true)
              setRan(null)
              void call(() => api!.runRoutineNow(projectId, r.id)).then((run) => {
                setRunning(false)
                if (run) setRan(run.status === 'skipped' ? t('Saltada: la anterior sigue en marcha') : run.status === 'failed' ? (run.note ?? t('No se pudo lanzar')) : t('Lanzada: mírala en el chat'))
              })
            }}
          >
            {running ? <LoaderCircle size={13} className={u.spin} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
            {t('Ejecutar ahora')}
          </button>
          <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setEditing(true)}>
            <Pencil size={13} aria-hidden="true" />
            {t('Editar')}
          </button>
          {r.trigger.type === 'webhook' && (
            <button type="button" className={cx(u.btn, u.btnSm)} aria-expanded={showHook} onClick={() => setShowHook((x) => !x)}>
              <Webhook size={13} aria-hidden="true" />
              Webhook
            </button>
          )}
          <button
            type="button"
            className={cx(u.btn, u.btnSm, confirmDelete && u.btnDanger)}
            onBlur={() => setConfirmDelete(false)}
            onClick={() => {
              if (!confirmDelete) setConfirmDelete(true)
              else void call(() => api!.deleteRoutine(projectId, r.id))
            }}
          >
            <Trash2 size={13} aria-hidden="true" />
            {confirmDelete ? t('Pulsa otra vez para borrarla') : t('Borrar')}
          </button>
        </div>
      )}
      {ran && (
        <p className={s.ran} role="status">
          {ran}
        </p>
      )}

      {showHook && editable && <WebhookBox projectId={projectId} routineId={r.id} call={call} />}

      {r.runs.length > 0 && (
        <>
          <button type="button" className={s.historyToggle} aria-expanded={showHistory} onClick={() => setShowHistory((x) => !x)}>
            <ChevronDown size={14} className={cx(s.chev, showHistory && s.chevOpen)} aria-hidden="true" />
            {t('Historial ({n})', { n: r.runs.length })}
          </button>
          {showHistory && (
            <ol className={s.history}>
              {[...r.runs].reverse().map((run, i) => (
                <li key={`${run.at}-${i}`} className={s.historyItem}>
                  <span className={s.historyHead}>
                    <StatusPill status={run.status} />
                    <span>{when(run.at)}</span>
                    <span className={s.muted}>{REASON_LABEL[run.reason]}</span>
                  </span>
                  {run.note && <span className={s.note}>{run.note}</span>}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </li>
  )
}

function StatusPill({ status }: { status: RoutineRun['status'] }) {
  return <span className={cx(s.pill, s[`pill_${status}`])}>{STATUS_LABEL[status]}</span>
}

function WebhookBox({ projectId, routineId, call }: { projectId: string; routineId: string; call: Call }) {
  const [info, setInfo] = useState<RoutineWebhookInfo | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  // La dirección (con el secreto) se pide solo al abrir este recuadro: no viaja con el proyecto.
  useEffect(() => {
    let alive = true
    void call(() => api!.getRoutineWebhook(projectId, routineId)).then((x) => alive && x && setInfo(x))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, routineId])

  async function copy(text: string): Promise<void> {
    setCopyError(null)
    try {
      await copyText(text)
      setCopied(text)
      window.setTimeout(() => setCopied(null), 1600)
    } catch (e) {
      setCopyError(errorText(e))
    }
  }

  if (!info) {
    return (
      <div className={s.hook}>
        <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> {t('Cargando…')}
      </div>
    )
  }
  return (
    <div className={s.hook}>
      {!info.webAccess ? (
        <p className={s.warn}>
          {t('El acceso web está apagado: actívalo en ⋮ → «Acceso desde otros dispositivos…» para que este webhook reciba avisos.')}
        </p>
      ) : (
        <>
          <p className={s.hint}>
            {t('Envía un')} <b>POST</b> {t('a esta dirección (lleva el secreto: no la compartas). El cuerpo (por ejemplo, el evento de un PR de GitHub) se añade a la petición como datos externos, recortado. Solo llega desde tu red de Tailscale.')}
          </p>
          {info.urls.map((url) => (
            <div key={url} className={s.urlRow}>
              <input className={s.url} value={url} readOnly aria-label={t('Dirección del webhook')} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} aria-label={t('Copiar la dirección')} title={t('Copiar')} onClick={() => void copy(url)}>
                {copied === url ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          ))}
          <p className={s.hint}>
            {t('Para GitHub: usa la dirección sin el secreto (')}{info.bareUrls[0] ?? '…'}{t('), tipo de contenido')} <b>application/json</b> {t('y el secreto en «Secret» (se comprueba la firma). Otros servicios pueden mandarlo en la cabecera')} <b>X-Cowork-Secret</b>.
          </p>
          <div className={s.urlRow}>
            <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => void copy(info.bareUrls[0] ?? '')} disabled={!info.bareUrls[0]}>
              {copied === info.bareUrls[0] ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              {t('Copiar sin secreto')}
            </button>
            <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => void copy(info.secret)}>
              {copied === info.secret ? <Check size={13} aria-hidden="true" /> : <KeyRound size={13} aria-hidden="true" />}
              {t('Copiar el secreto')}
            </button>
          </div>
        </>
      )}
      {copyError && (
        <p className={s.error} role="alert">
          {copyError}
        </p>
      )}
      <button
        type="button"
        className={cx(u.btn, u.btnSm, confirmNew && u.btnDanger, s.newSecret)}
        onBlur={() => setConfirmNew(false)}
        onClick={() => {
          if (!confirmNew) {
            setConfirmNew(true)
            return
          }
          setConfirmNew(false)
          void call(() => api!.getRoutineWebhook(projectId, routineId, true)).then((x) => x && setInfo(x))
        }}
      >
        <KeyRound size={13} aria-hidden="true" />
        {confirmNew ? t('Pulsa otra vez: la dirección anterior dejará de valer') : t('Cambiar el secreto')}
      </button>
    </div>
  )
}

function defaultTrigger(type: RoutineTriggerType, prev?: RoutineTrigger): RoutineTrigger {
  const time = prev && 'time' in prev ? prev.time : '09:00'
  switch (type) {
    case 'daily':
      return { type, time }
    case 'weekly':
      return { type, time, days: prev?.type === 'weekly' ? prev.days : [1, 2, 3, 4, 5] }
    case 'interval':
      return { type, hours: prev?.type === 'interval' ? prev.hours : 6 }
    case 'webhook':
      return { type }
    case 'folder':
      return { type, path: prev?.type === 'folder' ? prev.path : '' }
  }
}

function RoutineForm({ initial, onSave, onCancel }: { initial?: Routine; onSave: (input: RoutineInput) => Promise<boolean>; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [request, setRequest] = useState(initial?.request ?? '')
  const [trigger, setTrigger] = useState<RoutineTrigger>(initial?.trigger ?? { type: 'daily', time: '09:00' })
  const [busy, setBusy] = useState(false)
  const id = useId()

  function submit(e: FormEvent): void {
    e.preventDefault()
    if (!name.trim() || request.trim().length < 3) return
    setBusy(true)
    void onSave({ name: name.trim(), request: request.trim(), trigger, ...(initial ? {} : { enabled: true }) }).then(() => setBusy(false))
  }

  return (
    <form className={s.form} onSubmit={submit}>
      <label className={s.field} htmlFor={`${id}-name`}>
        <span className={s.label}>{t('Nombre')}</span>
        <input
          id={`${id}-name`}
          className={s.input}
          value={name}
          maxLength={MAX_ROUTINE_NAME}
          placeholder={t('Revisión de dependencias')}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className={s.field} htmlFor={`${id}-req`}>
        <span className={s.label}>{t('Petición (lo que se enviará al chat)')}</span>
        <textarea
          id={`${id}-req`}
          className={s.textarea}
          value={request}
          rows={4}
          maxLength={MAX_ROUTINE_REQUEST}
          placeholder={t('Revisa las dependencias del proyecto y dime cuáles tienen fallos de seguridad o versiones nuevas importantes.')}
          onChange={(e) => setRequest(e.target.value)}
        />
      </label>
      <label className={s.field} htmlFor={`${id}-type`}>
        <span className={s.label}>{t('Cuándo se lanza')}</span>
        <select id={`${id}-type`} className={s.input} value={trigger.type} onChange={(e) => setTrigger(defaultTrigger(e.target.value as RoutineTriggerType, trigger))}>
          {TYPES.map((trigger) => (
            <option key={trigger} value={trigger}>
              {TYPE_LABEL[trigger]}
            </option>
          ))}
        </select>
      </label>

      {trigger.type === 'weekly' && (
        <div className={s.field} role="group" aria-label={t('Días de la semana')}>
          <span className={s.label}>{t('Días')}</span>
          <div className={s.days}>
            {WEEK_ORDER.map((d) => {
              const on = trigger.days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  className={cx(s.day, on && s.dayOn)}
                  aria-pressed={on}
                  aria-label={dayName(d)}
                  title={dayName(d)}
                  onClick={() => setTrigger({ ...trigger, days: on ? trigger.days.filter((x) => x !== d) : [...trigger.days, d].sort() })}
                >
                  {dayShort(d)}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {(trigger.type === 'daily' || trigger.type === 'weekly') && (
        <label className={s.field} htmlFor={`${id}-time`}>
          <span className={s.label}>{t('Hora (la del servidor)')}</span>
          <input id={`${id}-time`} type="time" className={cx(s.input, s.short)} value={trigger.time} required onChange={(e) => setTrigger({ ...trigger, time: e.target.value })} />
        </label>
      )}
      {trigger.type === 'interval' && (
        <label className={s.field} htmlFor={`${id}-hours`}>
          <span className={s.label}>{t('Cada cuántas horas')}</span>
          <input
            id={`${id}-hours`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_INTERVAL_HOURS}
            className={cx(s.input, s.short)}
            value={trigger.hours}
            onChange={(e) => setTrigger({ ...trigger, hours: Math.round(Number(e.target.value)) || 1 })}
          />
        </label>
      )}
      {trigger.type === 'webhook' && (
        <p className={s.hint}>{t('Al guardarla tendrá su propia dirección con un secreto (botón «Webhook»). El cuerpo que llegue se añade a la petición como datos.')}</p>
      )}
      {trigger.type === 'folder' && (
        <label className={s.field} htmlFor={`${id}-folder`}>
          <span className={s.label}>{t('Carpeta (dentro de la del proyecto; vacío = toda)')}</span>
          <input
            id={`${id}-folder`}
            className={s.input}
            value={trigger.path}
            placeholder="entrada/"
            onChange={(e) => setTrigger({ ...trigger, path: e.target.value })}
          />
          <span className={s.hint}>{t('Se lanza cuando cambian archivos y llevan un minuto quietos (no mientras el equipo trabaja en el proyecto); como mucho una vez cada 5 minutos.')}</span>
        </label>
      )}
      <p className={s.hint}>{describeTriggerSafe(trigger)}</p>
      <div className={s.formRow}>
        <button type="button" className={cx(u.btn, u.btnSm)} onClick={onCancel}>
          {t('Cancelar')}
        </button>
        <button type="submit" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={busy || !name.trim() || request.trim().length < 3}>
          {initial ? t('Guardar') : t('Crear rutina')}
        </button>
      </div>
    </form>
  )
}

function describeTriggerSafe(trigger: RoutineTrigger): string {
  if (trigger.type === 'weekly' && !trigger.days.length) return t('Elige al menos un día.')
  return `${describeTrigger(trigger)}.`
}
