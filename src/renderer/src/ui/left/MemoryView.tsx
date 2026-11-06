import { useId, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Archive, Brain, Check, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import type { MemoryEntry, MemoryKind } from '@shared/types'
import { useCowork, useData } from '@/store/cowork'
import { api } from '@/lib/api'
import { MarkdownView } from '../common/MarkdownView'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import v from './Views.module.css'
import s from './MemoryView.module.css'
import { locale, t } from '@/lib/i18n'

export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  decision: t('Decisión'),
  fact: t('Hecho'),
  preference: t('Preferencia'),
  pending: t('Pendiente')
}

const KIND_TONE: Record<MemoryKind, string> = {
  decision: 'var(--cyan)',
  fact: '#8ea8ff',
  preference: 'var(--live)',
  pending: 'var(--warn)'
}

const KINDS: MemoryKind[] = ['decision', 'preference', 'fact', 'pending']

const day = (ts: number): string => new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })

function source(e: MemoryEntry): string {
  if (e.by === 'user') return e.via ? t('Tú (lo anotó {via})', { via: e.via }) : t('Tú')
  return e.taskTitle ? `${e.byName} · «${e.taskTitle}»` : e.byName
}

/** Pestaña Memoria: instrucciones del proyecto y decisiones, hechos, preferencias y pendientes con su procedencia. */
export function MemoryView() {
  const memory = useData((d) => d.memory)
  const instructions = useData((d) => d.instructions)
  const project = useCowork((st) => st.live.project)
  const mode = useCowork((st) => st.mode)
  const editable = !!api && mode === 'live' && !!project
  const [showOld, setShowOld] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idI = useId()
  const idM = useId()

  const active = useMemo(
    () =>
      memory
        .filter((e) => e.status !== 'superseded')
        .sort((a, b) => (a.status === b.status ? b.updatedAt - a.updatedAt : a.status === 'provisional' ? -1 : 1)),
    [memory]
  )
  const old = useMemo(() => memory.filter((e) => e.status === 'superseded').sort((a, b) => b.updatedAt - a.updatedAt), [memory])
  const toReview = active.filter((e) => e.status === 'provisional').length

  async function call(fn: () => Promise<unknown>): Promise<boolean> {
    setError(null)
    try {
      await fn()
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    }
  }

  const pid = project?.id ?? ''

  return (
    <div className={v.scroll}>
      <p className={s.intro}>
        {t('Lo que el equipo debe recordar en este proyecto. El coordinador y los agentes lo leen en cada encargo, también después de limpiar el chat o reiniciar. Lo que dices tú queda')} <b>{t('confirmado')}</b>{t('; lo que anotan los agentes,')} <b>{t('provisional')}</b> {t('hasta que lo confirmes.')}
      </p>

      <section className={v.section} aria-labelledby={idI}>
        <h3 className={u.sectionLabel} id={idI}>
          {t('Instrucciones para los agentes')}
        </h3>
        <Instructions text={instructions} editable={editable} onSave={(t) => call(() => api!.setInstructions(pid, t))} />
      </section>

      <section className={v.section} aria-labelledby={idM}>
        <h3 className={u.sectionLabel} id={idM}>
          {t('Memoria')} <span className={u.count}>{active.length}</span>
          {toReview > 0 && <span className={s.review}>{toReview} {t('por revisar')}</span>}
        </h3>

        {editable && <AddForm onAdd={(kind, text) => call(() => api!.addMemory(pid, { kind, text }))} />}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}

        {active.length === 0 ? (
          <div className={u.empty}>
            <span className={u.emptyIcon}>
              <Brain size={20} aria-hidden="true" />
            </span>
            <span className={u.emptyTitle}>{t('La memoria está vacía')}</span>
            <span className={u.emptyText}>
              {mode === 'demo'
                ? t('En la demo no hay memoria: aparece con los agentes reales.')
                : t('Se llena sola: el coordinador anota lo que decides o prefieres en tus mensajes y los agentes lo que descubren («Para la memoria»). También puedes añadirlo tú o escribir «/recuerda …» en el chat.')}
            </span>
          </div>
        ) : (
          <ul className={s.list}>
            {active.map((e) => (
              <Entry
                key={e.id}
                e={e}
                editable={editable}
                onUpdate={(patch) => call(() => api!.updateMemory(pid, e.id, patch))}
                onDelete={() => call(() => api!.deleteMemory(pid, e.id))}
              />
            ))}
          </ul>
        )}

        {old.length > 0 && (
          <button type="button" className={s.toggleOld} onClick={() => setShowOld((x) => !x)} aria-expanded={showOld}>
            {showOld ? t('Ocultar lo sustituido ({n})', { n: old.length }) : t('Ver lo sustituido ({n})', { n: old.length })}
          </button>
        )}
        {showOld && (
          <ul className={cx(s.list, s.oldList)}>
            {old.map((e) => (
              <Entry
                key={e.id}
                e={e}
                editable={editable}
                onUpdate={(patch) => call(() => api!.updateMemory(pid, e.id, patch))}
                onDelete={() => call(() => api!.deleteMemory(pid, e.id))}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Instructions({ text, editable, onSave }: { text: string; editable: boolean; onSave: (t: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (draft !== null) {
    return (
      <form
        className={s.instrForm}
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          void onSave(draft).then((ok) => {
            setBusy(false)
            if (ok) setDraft(null)
          })
        }}
      >
        <textarea
          className={s.textarea}
          value={draft}
          autoFocus
          rows={6}
          maxLength={8000}
          placeholder={t('Por ejemplo:\n- Todo en TypeScript.\n- Antes de terminar, ejecuta npm test.\n- No toques la carpeta legacy/.')}
          aria-label={t('Instrucciones para los agentes')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setDraft(null)
            }
          }}
        />
        <div className={s.formRow}>
          <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setDraft(null)}>
            {t('Cancelar')}
          </button>
          <button type="submit" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={busy}>
            {t('Guardar')}
          </button>
        </div>
      </form>
    )
  }
  return (
    <div className={s.instr}>
      {text.trim() ? (
        <MarkdownView text={text} className={s.instrText} />
      ) : (
        <p className={s.instrEmpty}>{t('Sin instrucciones. Añade normas que todos los agentes deban seguir siempre en este proyecto: cómo probar, estilo, qué no tocar…')}</p>
      )}
      {editable && (
        <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setDraft(text)}>
          <Pencil size={13} aria-hidden="true" />
          {text.trim() ? t('Editar') : t('Escribir instrucciones')}
        </button>
      )}
    </div>
  )
}

function KindSelect({ value, onChange, label }: { value: MemoryKind; onChange: (k: MemoryKind) => void; label: string }) {
  return (
    <select className={s.select} value={value} aria-label={label} onChange={(e) => onChange(e.target.value as MemoryKind)}>
      {KINDS.map((k) => (
        <option key={k} value={k}>
          {MEMORY_KIND_LABEL[k]}
        </option>
      ))}
    </select>
  )
}

function AddForm({ onAdd }: { onAdd: (kind: MemoryKind, text: string) => Promise<boolean> }) {
  const [kind, setKind] = useState<MemoryKind>('decision')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  function submit(e: FormEvent): void {
    e.preventDefault()
    if (text.trim().length < 3) return
    setBusy(true)
    void onAdd(kind, text.trim()).then((ok) => {
      setBusy(false)
      if (ok) setText('')
    })
  }
  return (
    <form className={s.add} onSubmit={submit}>
      <KindSelect value={kind} onChange={setKind} label={t('Tipo de la nueva entrada')} />
      <input
        className={s.input}
        value={text}
        maxLength={400}
        placeholder={t('Añadir a la memoria…')}
        aria-label={t('Texto de la nueva entrada')}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={busy || text.trim().length < 3}>
        {t('Añadir')}
      </button>
    </form>
  )
}

function Entry({
  e,
  editable,
  onUpdate,
  onDelete
}: {
  e: MemoryEntry
  editable: boolean
  onUpdate: (patch: { text?: string; kind?: MemoryKind; status?: MemoryEntry['status'] }) => Promise<boolean>
  onDelete: () => Promise<boolean>
}) {
  const [edit, setEdit] = useState<{ text: string; kind: MemoryKind } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const old = e.status === 'superseded'

  if (edit) {
    return (
      <li className={s.entry}>
        <form
          className={s.editForm}
          onSubmit={(ev) => {
            ev.preventDefault()
            void onUpdate({ text: edit.text, kind: edit.kind }).then((ok) => ok && setEdit(null))
          }}
        >
          <KindSelect value={edit.kind} onChange={(kind) => setEdit({ ...edit, kind })} label={t('Tipo')} />
          <input
            className={s.input}
            value={edit.text}
            autoFocus
            maxLength={400}
            aria-label={t('Texto de la entrada')}
            onChange={(ev) => setEdit({ ...edit, text: ev.target.value })}
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') {
                ev.preventDefault()
                setEdit(null)
              }
            }}
          />
          <button type="submit" className={cx(u.iconBtn, u.iconBtnSm)} aria-label={t('Guardar')} title={t('Guardar')}>
            <Check size={15} />
          </button>
          <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} aria-label={t('Cancelar')} title={t('Cancelar')} onClick={() => setEdit(null)}>
            <X size={15} />
          </button>
        </form>
      </li>
    )
  }

  return (
    <li className={cx(s.entry, old && s.entryOld)} style={{ '--tone': KIND_TONE[e.kind] } as CSSProperties}>
      <div className={s.entryMain}>
        <span className={s.kind}>{MEMORY_KIND_LABEL[e.kind]}</span>
        <span className={s.text}>{e.text}</span>
        <span className={s.meta}>
          <span className={cx(s.status, e.status === 'confirmed' && s.statusOk, e.status === 'provisional' && s.statusProv)}>
            {e.status === 'confirmed' ? t('Confirmado') : e.status === 'provisional' ? t('Provisional') : (e.supersededBy ? t('Sustituido por {id}', { id: e.supersededBy }) : t('Sustituido'))}
          </span>
          <span>{source(e)}</span>
          <span>{day(e.createdAt)}</span>
          <span className={s.id}>{e.id}</span>
        </span>
      </div>
      {editable && (
        <div className={s.actions}>
          {e.status === 'provisional' && (
            <button type="button" className={cx(s.act, s.actOk)} title={t('Confirmar (lo validas tú)')} aria-label={t('Confirmar')} onClick={() => void onUpdate({ status: 'confirmed' })}>
              <Check size={15} />
            </button>
          )}
          {!old && (
            <button type="button" className={s.act} title={t('Editar')} aria-label={t('Editar')} onClick={() => setEdit({ text: e.text, kind: e.kind })}>
              <Pencil size={14} />
            </button>
          )}
          {old ? (
            <button type="button" className={s.act} title={t('Volver a usarla')} aria-label={t('Volver a usarla')} onClick={() => void onUpdate({ status: 'provisional' })}>
              <RotateCcw size={14} />
            </button>
          ) : (
            <button
              type="button"
              className={s.act}
              title={t('Ya no vale (pasa a «sustituido»: los agentes dejan de verla)')}
              aria-label={t('Marcar como sustituida')}
              onClick={() => void onUpdate({ status: 'superseded' })}
            >
              <Archive size={14} />
            </button>
          )}
          <button
            type="button"
            className={cx(s.act, confirmDelete && s.actDanger)}
            title={confirmDelete ? t('Pulsa otra vez para borrarla') : t('Borrar')}
            aria-label={confirmDelete ? t('Confirmar borrado') : t('Borrar')}
            onBlur={() => setConfirmDelete(false)}
            onClick={() => {
              if (!confirmDelete) setConfirmDelete(true)
              else void onDelete()
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </li>
  )
}
