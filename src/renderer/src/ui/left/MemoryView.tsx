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

export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  decision: 'Decisión',
  fact: 'Hecho',
  preference: 'Preferencia',
  pending: 'Pendiente'
}

const KIND_TONE: Record<MemoryKind, string> = {
  decision: 'var(--cyan)',
  fact: '#8ea8ff',
  preference: 'var(--live)',
  pending: 'var(--warn)'
}

const KINDS: MemoryKind[] = ['decision', 'preference', 'fact', 'pending']

const day = (ts: number): string => new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

function source(e: MemoryEntry): string {
  if (e.by === 'user') return e.via ? `Tú (lo anotó ${e.via})` : 'Tú'
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
        Lo que el equipo debe recordar en este proyecto. El coordinador y los agentes lo leen en cada encargo, también después de limpiar el
        chat o reiniciar. Lo que dices tú queda <b>confirmado</b>; lo que anotan los agentes, <b>provisional</b> hasta que lo confirmes.
      </p>

      <section className={v.section} aria-labelledby={idI}>
        <h3 className={u.sectionLabel} id={idI}>
          Instrucciones para los agentes
        </h3>
        <Instructions text={instructions} editable={editable} onSave={(t) => call(() => api!.setInstructions(pid, t))} />
      </section>

      <section className={v.section} aria-labelledby={idM}>
        <h3 className={u.sectionLabel} id={idM}>
          Memoria <span className={u.count}>{active.length}</span>
          {toReview > 0 && <span className={s.review}>{toReview} por revisar</span>}
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
            <span className={u.emptyTitle}>La memoria está vacía</span>
            <span className={u.emptyText}>
              {mode === 'demo'
                ? 'En la demo no hay memoria: aparece con los agentes reales.'
                : 'Se llena sola: el coordinador anota lo que decides o prefieres en tus mensajes y los agentes lo que descubren («Para la memoria»). También puedes añadirlo tú o escribir «/recuerda …» en el chat.'}
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
            {showOld ? 'Ocultar' : 'Ver'} lo sustituido ({old.length})
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
          placeholder={'Por ejemplo:\n- Todo en TypeScript.\n- Antes de terminar, ejecuta npm test.\n- No toques la carpeta legacy/.'}
          aria-label="Instrucciones para los agentes"
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
            Cancelar
          </button>
          <button type="submit" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={busy}>
            Guardar
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
        <p className={s.instrEmpty}>Sin instrucciones. Añade normas que todos los agentes deban seguir siempre en este proyecto: cómo probar, estilo, qué no tocar…</p>
      )}
      {editable && (
        <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setDraft(text)}>
          <Pencil size={13} aria-hidden="true" />
          {text.trim() ? 'Editar' : 'Escribir instrucciones'}
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
      <KindSelect value={kind} onChange={setKind} label="Tipo de la nueva entrada" />
      <input
        className={s.input}
        value={text}
        maxLength={400}
        placeholder="Añadir a la memoria…"
        aria-label="Texto de la nueva entrada"
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={busy || text.trim().length < 3}>
        Añadir
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
          <KindSelect value={edit.kind} onChange={(kind) => setEdit({ ...edit, kind })} label="Tipo" />
          <input
            className={s.input}
            value={edit.text}
            autoFocus
            maxLength={400}
            aria-label="Texto de la entrada"
            onChange={(ev) => setEdit({ ...edit, text: ev.target.value })}
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') {
                ev.preventDefault()
                setEdit(null)
              }
            }}
          />
          <button type="submit" className={cx(u.iconBtn, u.iconBtnSm)} aria-label="Guardar" title="Guardar">
            <Check size={15} />
          </button>
          <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} aria-label="Cancelar" title="Cancelar" onClick={() => setEdit(null)}>
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
            {e.status === 'confirmed' ? 'Confirmado' : e.status === 'provisional' ? 'Provisional' : `Sustituido${e.supersededBy ? ` por ${e.supersededBy}` : ''}`}
          </span>
          <span>{source(e)}</span>
          <span>{day(e.createdAt)}</span>
          <span className={s.id}>{e.id}</span>
        </span>
      </div>
      {editable && (
        <div className={s.actions}>
          {e.status === 'provisional' && (
            <button type="button" className={cx(s.act, s.actOk)} title="Confirmar (lo validas tú)" aria-label="Confirmar" onClick={() => void onUpdate({ status: 'confirmed' })}>
              <Check size={15} />
            </button>
          )}
          {!old && (
            <button type="button" className={s.act} title="Editar" aria-label="Editar" onClick={() => setEdit({ text: e.text, kind: e.kind })}>
              <Pencil size={14} />
            </button>
          )}
          {old ? (
            <button type="button" className={s.act} title="Volver a usarla" aria-label="Volver a usarla" onClick={() => void onUpdate({ status: 'provisional' })}>
              <RotateCcw size={14} />
            </button>
          ) : (
            <button
              type="button"
              className={s.act}
              title="Ya no vale (pasa a «sustituido»: los agentes dejan de verla)"
              aria-label="Marcar como sustituida"
              onClick={() => void onUpdate({ status: 'superseded' })}
            >
              <Archive size={14} />
            </button>
          )}
          <button
            type="button"
            className={cx(s.act, confirmDelete && s.actDanger)}
            title={confirmDelete ? 'Pulsa otra vez para borrarla' : 'Borrar'}
            aria-label={confirmDelete ? 'Confirmar borrado' : 'Borrar'}
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
