import { useId, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { CalendarClock, LoaderCircle, Pencil, Pin, PinOff, Plus, Send, Trash2 } from 'lucide-react'
import type { TaskTemplate } from '@shared/types'
import { fillTemplate, slotLabel, templateSlots, templatesFor } from '@shared/templates'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { menuKeyNav, Popover } from '../common/Popover'
import { cx, errorText } from '../common/util'
import { useComposer } from './composerStore'
import { TemplateEditor } from './TemplateEditor'
import u from '../common/ui.module.css'
import s from './TemplateBar.module.css'
import { t } from '@/lib/i18n'

/** Mantener pulsado (pantallas táctiles sin clic derecho) abre el menú de la plantilla. */
const LONG_PRESS_MS = 500

/**
 * Fila de plantillas de tareas encima del cuadro del chat: un toque la envía (si tiene huecos, antes se rellenan); con
 * clic derecho o manteniéndola pulsada, editarla, fijarla, convertirla en rutina o borrarla. «+» crea una nueva.
 */
export function TemplateBar({ disabled, onLaunch }: { disabled: boolean; onLaunch: (tpl: TaskTemplate, text: string) => Promise<boolean> }) {
  const all = useCowork((st) => st.templates)
  const project = useCowork((st) => st.live.project)
  const list = templatesFor(all, project?.id)
  const [fill, setFill] = useState<{ tpl: TaskTemplate; anchor: HTMLElement } | null>(null)
  const [menu, setMenu] = useState<{ tpl: TaskTemplate; anchor: HTMLElement } | null>(null)
  const [editing, setEditing] = useState<TaskTemplate | 'new' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const press = useRef<{ timer: number; fired: boolean } | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)

  if (!api) return null

  async function launch(tpl: TaskTemplate, text: string): Promise<void> {
    setBusyId(tpl.id)
    setError(null)
    try {
      if (await onLaunch(tpl, text)) setFill(null)
    } finally {
      setBusyId(null)
    }
  }

  function onChip(tpl: TaskTemplate, el: HTMLElement): void {
    if (press.current?.fired) return
    if (disabled || busyId) return
    if (templateSlots(tpl.prompt).length) {
      anchorRef.current = el
      setFill({ tpl, anchor: el })
    } else void launch(tpl, fillTemplate(tpl.prompt, {}))
  }

  function openMenu(tpl: TaskTemplate, el: HTMLElement): void {
    anchorRef.current = el
    setConfirmDelete(false)
    setMenu({ tpl, anchor: el })
  }

  function pressStart(e: ReactPointerEvent<HTMLButtonElement>, tpl: TaskTemplate): void {
    if (e.pointerType === 'mouse') return
    const el = e.currentTarget
    const p = { timer: 0, fired: false }
    p.timer = window.setTimeout(() => {
      p.fired = true
      openMenu(tpl, el)
    }, LONG_PRESS_MS)
    press.current = p
  }

  function pressEnd(): void {
    const p = press.current
    if (!p) return
    window.clearTimeout(p.timer)
    // El clic que sigue a una pulsación larga no lanza la plantilla.
    if (p.fired) window.setTimeout(() => (press.current = null), 50)
    else press.current = null
  }

  async function act(fn: () => Promise<unknown>): Promise<void> {
    setMenu(null)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
    }
  }

  /** Deja en el cuadro «/rutina cada día a las 9:00: …» para elegir cuándo y enviarlo. */
  function toRoutine(tpl: TaskTemplate): void {
    setMenu(null)
    useComposer.getState().setText(t('/rutina cada día a las 9:00: {text}', { text: fillTemplate(tpl.prompt, {}) }))
    useComposer.getState().requestFocus()
  }

  return (
    <>
      <div className={s.bar} role="toolbar" aria-label={t('Plantillas de tareas')}>
        {list.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className={cx(s.chip, tpl.pinned && s.pinned)}
            disabled={disabled || (!!busyId && busyId !== tpl.id)}
            title={t('{prompt}\n\nClic: enviar · Clic derecho o mantener pulsado: más opciones · También: /{command}', { prompt: tpl.prompt, command: tpl.command })}
            aria-haspopup={templateSlots(tpl.prompt).length ? 'dialog' : undefined}
            onClick={(e) => onChip(tpl, e.currentTarget)}
            onContextMenu={(e) => {
              e.preventDefault()
              openMenu(tpl, e.currentTarget)
            }}
            onPointerDown={(e) => pressStart(e, tpl)}
            onPointerUp={pressEnd}
            onPointerLeave={pressEnd}
            onPointerCancel={pressEnd}
          >
            {busyId === tpl.id ? <LoaderCircle size={13} aria-hidden="true" className={u.spin} /> : tpl.icon ? <span aria-hidden="true">{tpl.icon}</span> : null}
            <span className={s.chipName}>{tpl.name}</span>
          </button>
        ))}
        <button type="button" className={s.add} onClick={() => setEditing('new')} aria-label={t('Nueva plantilla')} title={t('Nueva plantilla de tarea')}>
          <Plus size={14} aria-hidden="true" />
          {list.length === 0 && <span>{t('Plantilla')}</span>}
        </button>
      </div>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}

      {fill && (
        <FillPopover
          tpl={fill.tpl}
          anchorRef={anchorRef}
          busy={busyId === fill.tpl.id}
          onClose={() => setFill(null)}
          onSend={(text) => void launch(fill.tpl, text)}
        />
      )}

      <Popover
        open={!!menu}
        onClose={() => setMenu(null)}
        anchorRef={anchorRef}
        role="menu"
        ariaLabel={menu ? t('Opciones de «{name}»', { name: menu.tpl.name }) : undefined}
        className={s.menu}
        initialFocus="first"
        onKeyDown={menuKeyNav}
      >
        {menu && (
          <>
            <button type="button" role="menuitem" className={s.menuItem} onClick={() => (setMenu(null), setEditing(menu.tpl))}>
              <Pencil size={14} aria-hidden="true" />
              <span>{t('Editar…')}</span>
            </button>
            <button type="button" role="menuitem" className={s.menuItem} onClick={() => void act(() => api!.updateTemplate(menu.tpl.id, { pinned: !menu.tpl.pinned }))}>
              {menu.tpl.pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
              <span>{menu.tpl.pinned ? t('Quitar de fijadas') : t('Fijar al principio')}</span>
            </button>
            {templateSlots(menu.tpl.prompt).length === 0 && !menu.tpl.agentId && (
              <button type="button" role="menuitem" className={s.menuItem} onClick={() => toRoutine(menu.tpl)}>
                <CalendarClock size={14} aria-hidden="true" />
                <span>{t('Convertir en rutina…')}</span>
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className={cx(s.menuItem, s.menuDanger)}
              onClick={() => (confirmDelete ? void act(() => api!.deleteTemplate(menu.tpl.id)) : setConfirmDelete(true))}
            >
              <Trash2 size={14} aria-hidden="true" />
              <span>{confirmDelete ? t('Pulsa otra vez para borrarla') : t('Borrar')}</span>
            </button>
          </>
        )}
      </Popover>

      {editing && <TemplateEditor template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** Campos para rellenar los huecos de una plantilla antes de enviarla. */
function FillPopover({
  tpl,
  anchorRef,
  busy,
  onClose,
  onSend
}: {
  tpl: TaskTemplate
  anchorRef: RefObject<HTMLElement | null>
  busy: boolean
  onClose: () => void
  onSend: (text: string) => void
}) {
  const id = useId()
  const slots = templateSlots(tpl.prompt)
  const [values, setValues] = useState<Record<string, string>>({})
  const ready = slots.every((k) => (values[k] ?? '').trim())

  function submit(e: FormEvent): void {
    e.preventDefault()
    if (ready && !busy) onSend(fillTemplate(tpl.prompt, values))
  }

  return (
    <Popover open onClose={onClose} anchorRef={anchorRef} ariaLabel={tpl.name} className={s.fill} initialFocus="first">
      <form className={s.fillForm} onSubmit={submit}>
        <p className={s.fillTitle}>
          {tpl.icon && <span aria-hidden="true">{tpl.icon} </span>}
          {tpl.name}
        </p>
        {slots.map((k, i) => (
          <label key={k} className={s.field} htmlFor={`${id}-${i}`}>
            <span className={s.label}>{slotLabel(k)}</span>
            <input
              id={`${id}-${i}`}
              className={s.input}
              value={values[k] ?? ''}
              autoFocus={i === 0}
              onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
            />
          </label>
        ))}
        <p className={s.preview}>{fillTemplate(tpl.prompt, Object.fromEntries(slots.map((k) => [k, values[k]?.trim() || `{${k}}`])))}</p>
        <div className={s.fillRow}>
          <button type="button" className={cx(u.btn, u.btnSm)} onClick={onClose}>
            {t('Cancelar')}
          </button>
          <button type="submit" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={!ready || busy}>
            {busy ? <LoaderCircle size={13} aria-hidden="true" className={u.spin} /> : <Send size={13} aria-hidden="true" />}
            <span>{t('Enviar')}</span>
          </button>
        </div>
      </form>
    </Popover>
  )
}
