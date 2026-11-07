import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Check, ChevronDown, FolderOpen, FolderPlus, LoaderCircle, Pencil, ShieldCheck, Trash2 } from 'lucide-react'
import type { ProjectSummary } from '@shared/types'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { playSfx } from '@/lib/audio'
import { relativeTime } from '@/lib/format'
import { Popover } from '../common/Popover'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './ProjectSelector.module.css'
import { t } from '@/lib/i18n'

/** Selector de proyecto (solo con motor de agentes y en modo real). */
export function ProjectSelector() {
  const mode = useCowork((st) => st.mode)
  const project = useCowork((st) => st.live.project)
  const projects = useCowork((st) => st.projects)
  const setProjects = useCowork((st) => st.setProjects)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Proyecto que se está renombrando y el nombre escrito. */
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  /** Proyecto pendiente de confirmar que se elimina. */
  const [deleting, setDeleting] = useState<string | null>(null)
  const editingRef = useRef<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popId = useId()

  // Refresca la lista al abrir.
  useEffect(() => {
    const a = api
    if (!open || !a) return
    let alive = true
    a.listProjects().then(
      (list) => {
        if (alive) setProjects(list)
      },
      () => {}
    )
    return () => {
      alive = false
    }
  }, [open, setProjects])

  useEffect(() => {
    if (!open) {
      setCreating(false)
      setName('')
      setError(null)
      editingRef.current = null
      setEditing(null)
      setDeleting(null)
    }
  }, [open])

  if (!api) return null
  const disabled = mode === 'demo'

  async function openProject(id: string): Promise<void> {
    const a = api
    if (!a || busy) return
    setBusy(id)
    setError(null)
    try {
      const state = await a.loadProject(id)
      useCowork.getState().loadProjectState(state)
      setOpen(false)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  async function create(e: FormEvent): Promise<void> {
    e.preventDefault()
    const a = api
    const n = name.trim()
    if (!a || !n || busy) return
    setBusy('new')
    setError(null)
    try {
      const p = await a.createProject(n)
      playSfx('projectCreated')
      const state = await a.loadProject(p.id)
      useCowork.getState().loadProjectState(state)
      setProjects(await a.listProjects())
      setOpen(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  function startRename(p: ProjectSummary): void {
    editingRef.current = p.id
    setEditing(p.id)
    setDraft(p.name)
    setError(null)
  }

  function stopRename(): void {
    editingRef.current = null
    setEditing(null)
  }

  /** Guarda el nombre nuevo (Intro o al salir del campo). Sin cambios, solo cierra la edición. */
  async function rename(p: ProjectSummary): Promise<void> {
    const a = api
    if (!a || editingRef.current !== p.id) return
    stopRename()
    const n = draft.replace(/\s+/g, ' ').trim()
    if (!n || n === p.name) return
    setBusy(p.id)
    try {
      const updated = await a.renameProject(p.id, n)
      setProjects(useCowork.getState().projects.map((x) => (x.id === updated.id ? updated : x)))
      if (useCowork.getState().live.project?.id === updated.id) {
        useCowork.setState((st) => ({ live: { ...st.live, project: updated } }))
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  /** Elimina el proyecto (todo lo suyo va a la Papelera). Si era el abierto, la app pasa a otro sola. */
  async function remove(p: ProjectSummary): Promise<void> {
    const a = api
    if (!a || busy) return
    setBusy(p.id)
    setError(null)
    try {
      setProjects(await a.deleteProject(p.id))
      setDeleting(null)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  /** Actualiza el proyecto abierto y la lista tras cambiar su carpeta de trabajo. */
  async function applyProject(p: ProjectSummary | null): Promise<void> {
    if (!p) return
    useCowork.setState((st) => ({ live: { ...st.live, project: p } }))
    const a = api
    if (a) setProjects(await a.listProjects())
  }

  async function pickFolder(): Promise<void> {
    const a = api
    if (!a || !project || busy) return
    setBusy('folder')
    setError(null)
    try {
      await applyProject(await a.pickProjectFolder(project.id))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  async function clearFolder(): Promise<void> {
    const a = api
    if (!a || !project || busy) return
    setBusy('folder')
    setError(null)
    try {
      await applyProject(await a.clearProjectFolder(project.id))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const label = project?.name ?? t('Sin proyecto')

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={s.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={t('Proyecto: {label}. Cambiar de proyecto', { label })}
        title={disabled ? t('Los proyectos están disponibles en modo real') : t('Proyecto: {label}', { label })}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {!disabled && project?.workDir && <FolderOpen size={14} aria-hidden="true" className={s.triggerIcon} />}
        <span className={s.triggerLabel}>{disabled ? t('Proyecto de demostración') : label}</span>
        <ChevronDown size={14} aria-hidden="true" className={s.chevron} />
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        align="start"
        role="dialog"
        ariaLabel={t('Proyectos')}
        id={popId}
        className={s.pop}
        initialFocus="first"
      >
        <div className={s.head}>{t('Proyectos')}</div>
        {projects.length === 0 ? (
          <p className={s.empty}>{t('Todavía no hay proyectos.')}</p>
        ) : (
          <ul className={s.list}>
            {projects.map((p) => {
              const current = p.id === project?.id
              if (deleting === p.id) {
                return (
                  <li key={p.id} className={s.confirmRow} role="alertdialog" aria-label={t('Eliminar «{name}»', { name: p.name })}>
                    <p className={s.confirmText}>
                      <b>{t('¿Eliminar «{name}»?', { name: p.name })}</b> {t('Se borra todo lo suyo: chat, tareas, adjuntos, resultados, historial y memoria (va a la Papelera de este equipo).')}
                      {p.workDir && (
                        <>
                          {' '}
                          {t('Tu carpeta')} <code>{p.workDir}</code> {t('no se toca: solo su subcarpeta')} <code>.ai-cowork</code>.
                        </>
                      )}
                    </p>
                    <div className={s.confirmActions}>
                      <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setDeleting(null)} disabled={busy === p.id} autoFocus>
                        {t('Cancelar')}
                      </button>
                      <button type="button" className={cx(u.btn, u.btnSm, u.btnDanger)} onClick={() => void remove(p)} disabled={!!busy}>
                        {busy === p.id ? <LoaderCircle size={13} className={u.spin} aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />}
                        {t('Eliminar')}
                      </button>
                    </div>
                  </li>
                )
              }
              if (editing === p.id) {
                return (
                  <li key={p.id} className={s.row}>
                    <form
                      className={s.renameForm}
                      onSubmit={(e) => {
                        e.preventDefault()
                        void rename(p)
                      }}
                    >
                      <input
                        className={s.input}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        onBlur={() => void rename(p)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            stopRename()
                          }
                        }}
                        aria-label={t('Nuevo nombre para {name}', { name: p.name })}
                        maxLength={80}
                        autoFocus
                      />
                    </form>
                  </li>
                )
              }
              return (
                <li key={p.id} className={s.row}>
                  <button
                    type="button"
                    className={cx(s.item, current && s.current)}
                    aria-current={current ? 'true' : undefined}
                    title={current ? t('Proyecto abierto') : t('Abrir «{name}»', { name: p.name })}
                    onClick={() => (current ? setOpen(false) : openProject(p.id))}
                    disabled={!!busy && busy !== p.id}
                  >
                    <span className={s.check} aria-hidden="true">
                      {busy === p.id ? (
                        <LoaderCircle size={14} className={u.spin} />
                      ) : current ? (
                        <Check size={14} />
                      ) : null}
                    </span>
                    <span className={s.itemName}>{p.name}</span>
                    <span className={s.itemMeta}>{relativeTime(p.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className={s.renameBtn}
                    aria-label={t('Renombrar «{name}»', { name: p.name })}
                    title={t('Renombrar')}
                    onClick={() => startRename(p)}
                    disabled={!!busy}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={cx(s.renameBtn, s.deleteBtn)}
                    aria-label={t('Eliminar «{name}»', { name: p.name })}
                    title={t('Eliminar el proyecto')}
                    onClick={() => {
                      setError(null)
                      setDeleting(p.id)
                    }}
                    disabled={!!busy}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {project && (
          <section className={s.folder} aria-label={t('Carpeta de trabajo del proyecto')}>
            <div className={s.folderHead}>
              <FolderOpen size={14} aria-hidden="true" />
              {t('Carpeta de trabajo')}
            </div>
            {project.workDir ? (
              <>
                <code className={s.folderPath} title={project.workDir}>
                  {project.workDir}
                </code>
                <p className={s.folderNote}>
                  <ShieldCheck size={13} aria-hidden="true" />
                  {t('Los agentes pueden leer y editar los archivos de esta carpeta.')}
                </p>
                <div className={s.folderActions}>
                  <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => void pickFolder()} disabled={!!busy}>
                    {busy === 'folder' ? <LoaderCircle size={13} className={u.spin} aria-hidden="true" /> : null}
                    {t('Cambiar carpeta')}
                  </button>
                  <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => void clearFolder()} disabled={!!busy}>
                    {t('Quitar acceso')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className={s.folderNote}>
                  {t('Ahora los agentes trabajan en una carpeta interna de kywai. Elige la carpeta de tu proyecto (el código de un juego, una web…) para que puedan leer y editar sus archivos.')}
                </p>
                <div className={s.folderActions}>
                  <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} onClick={() => void pickFolder()} disabled={!!busy}>
                    {busy === 'folder' ? <LoaderCircle size={13} className={u.spin} aria-hidden="true" /> : <FolderOpen size={13} aria-hidden="true" />}
                    {t('Elegir carpeta…')}
                  </button>
                </div>
              </>
            )}
          </section>
        )}
        <div className={s.footer}>
          {creating ? (
            <form className={s.createForm} onSubmit={create}>
              <input
                className={s.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('Nombre del proyecto')}
                aria-label={t('Nombre del nuevo proyecto')}
                maxLength={80}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setCreating(false)
                    setName('')
                  }
                }}
              />
              <button
                type="submit"
                className={cx(u.btn, u.btnSm, u.btnPrimary)}
                disabled={!name.trim() || busy === 'new'}
              >
                {busy === 'new' ? t('Creando…') : t('Crear')}
              </button>
            </form>
          ) : (
            <button type="button" className={s.newBtn} onClick={() => setCreating(true)}>
              <FolderPlus size={15} aria-hidden="true" />
              {t('Nuevo proyecto')}
            </button>
          )}
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
        </div>
      </Popover>
    </>
  )
}
