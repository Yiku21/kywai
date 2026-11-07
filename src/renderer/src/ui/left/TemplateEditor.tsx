import { useId, useState, type FormEvent } from 'react'
import { LayoutTemplate, LoaderCircle, RotateCcw, X } from 'lucide-react'
import type { TaskTemplate, TaskTemplateInput } from '@shared/types'
import { commandFromName, MAX_TEMPLATE_NAME, MAX_TEMPLATE_PROMPT, slotLabel, templateSlots } from '@shared/templates'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { useEscape } from '../common/hooks'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import r from '../header/RemoteAccess.module.css'
import s from './TemplateBar.module.css'
import { t } from '@/lib/i18n'

/** Crear o editar una plantilla de tarea: nombre, emoji, texto con huecos, orden «/…», dónde sale y quién la hace. */
export function TemplateEditor({ template, onClose }: { template: TaskTemplate | null; onClose: () => void }) {
  const id = useId()
  const project = useCowork((st) => st.live.project)
  const agents = useCowork((st) => st.live.agentOrder.map((a) => st.live.agents[a]).filter((a) => !!a && !a.isSubagent))
  const [name, setName] = useState(template?.name ?? '')
  const [icon, setIcon] = useState(template?.icon ?? '')
  const [prompt, setPrompt] = useState(template?.prompt ?? '')
  const [command, setCommand] = useState(template && template.command !== commandFromName(template.name) ? template.command : '')
  const [scope, setScope] = useState<'all' | 'project'>(template ? (template.projectId ? 'project' : 'all') : 'all')
  const [agentId, setAgentId] = useState(template?.agentId ?? '')
  const [askPlan, setAskPlan] = useState(!!template?.askPlan)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEscape(true, onClose)

  const slots = templateSlots(prompt)
  const auto = commandFromName(name)
  // Una plantilla de otro proyecto se queda en el suyo; si no, «este proyecto» es el abierto.
  const projectId = template?.projectId ?? project?.id
  const ready = !!name.trim() && !!prompt.trim() && !busy

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const a = api
    if (!a || !ready) return
    setBusy(true)
    setError(null)
    const input: TaskTemplateInput = {
      name: name.trim(),
      prompt: prompt.trim(),
      icon: icon.trim(),
      command: command.trim().replace(/^\//, ''),
      projectId: scope === 'project' && projectId ? projectId : null,
      agentId: agentId || null,
      askPlan: !agentId && askPlan
    }
    try {
      if (template) await a.updateTemplate(template.id, input)
      else await a.createTemplate(input)
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  async function restore(): Promise<void> {
    const a = api
    if (!a) return
    setError(null)
    try {
      await a.restoreTemplates()
      onClose()
    } catch (err) {
      setError(errorText(err))
    }
  }

  const projectName = template?.projectId && template.projectId !== project?.id ? t('su proyecto') : project?.name

  return (
    <div className={r.backdrop} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx(r.dialog, s.editor)}>
        <header className={r.head}>
          <LayoutTemplate size={20} aria-hidden="true" className={r.headIcon} />
          <div>
            <h2 id={`${id}-title`} className={r.title}>
              {template ? t('Editar plantilla') : t('Nueva plantilla de tarea')}
            </h2>
            <p className={r.subtitle}>{t('Una petición que repites a menudo, para lanzarla con un toque desde encima del chat.')}</p>
          </div>
          <button type="button" className={cx(u.iconBtn, r.close)} aria-label={t('Cerrar')} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <form className={s.editorForm} onSubmit={(e) => void submit(e)}>
          <div className={s.nameRow}>
            <label className={cx(s.field, s.iconField)} htmlFor={`${id}-icon`}>
              <span className={s.label}>{t('Emoji')}</span>
              <input id={`${id}-icon`} className={cx(s.input, s.iconInput)} value={icon} maxLength={8} placeholder="✨" onChange={(e) => setIcon(e.target.value)} />
            </label>
            <label className={cx(s.field, s.grow)} htmlFor={`${id}-name`}>
              <span className={s.label}>{t('Nombre del botón')}</span>
              <input
                id={`${id}-name`}
                className={s.input}
                value={name}
                maxLength={MAX_TEMPLATE_NAME}
                placeholder={t('Revisar PR')}
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>

          <label className={s.field} htmlFor={`${id}-prompt`}>
            <span className={s.label}>{t('Lo que se envía')}</span>
            <textarea
              id={`${id}-prompt`}
              className={s.textarea}
              value={prompt}
              rows={5}
              maxLength={MAX_TEMPLATE_PROMPT}
              placeholder={t('Revisa el pull request {pr} y dime qué cambiarías.')}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <span className={s.hint}>
              {slots.length
                ? t('Al lanzarla te pedirá: {slots}.', { slots: slots.map(slotLabel).join(', ') })
                : t('Pon entre llaves lo que cambia cada vez, como {pr} o {carpeta}: al lanzarla te lo pedirá.', { pr: '{pr}', carpeta: `{${t('carpeta')}}` })}
            </span>
          </label>

          <label className={s.field} htmlFor={`${id}-cmd`}>
            <span className={s.label}>{t('Orden para escribirla en el chat')}</span>
            <div className={s.cmdWrap}>
              <span className={s.cmdSlash} aria-hidden="true">
                /
              </span>
              <input
                id={`${id}-cmd`}
                className={cx(s.input, s.cmdInput)}
                value={command}
                maxLength={30}
                placeholder={auto || 'plantilla'}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => setCommand(e.target.value.toLowerCase())}
              />
            </div>
            <span className={s.hint}>
              {slots.length > 1
                ? t('Escribe /{command} y los huecos separados por «|».', { command: command || auto || 'plantilla' })
                : slots.length === 1
                  ? t('Escribe /{command} y detrás lo del hueco.', { command: command || auto || 'plantilla' })
                  : t('Escribe /{command} (lo que pongas detrás se añade al final).', { command: command || auto || 'plantilla' })}
            </span>
          </label>

          <div className={s.twoCols}>
            <label className={s.field} htmlFor={`${id}-scope`}>
              <span className={s.label}>{t('Dónde sale')}</span>
              <select id={`${id}-scope`} className={s.input} value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'project')}>
                <option value="all">{t('En todos los proyectos')}</option>
                {projectId && <option value="project">{t('Solo en «{name}»', { name: projectName ?? '' })}</option>}
              </select>
            </label>
            <label className={s.field} htmlFor={`${id}-agent`}>
              <span className={s.label}>{t('Quién la hace')}</span>
              <select id={`${id}-agent`} className={s.input} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">{t('Hermes reparte el trabajo')}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {t('Directo a {name}, sin Hermes', { name: a.name })}
                  </option>
                ))}
                {agentId && !agents.some((a) => a.id === agentId) && <option value={agentId}>{t('{name} (ya no está en el equipo)', { name: agentId })}</option>}
              </select>
            </label>
          </div>

          <label className={cx(s.check, !!agentId && s.checkOff)}>
            <input type="checkbox" checked={!agentId && askPlan} disabled={!!agentId} onChange={(e) => setAskPlan(e.target.checked)} />
            <span>{agentId ? t('Pedir mi visto bueno al plan (no hay plan: va directa al agente)') : t('Pedir mi visto bueno al plan antes de empezar (aunque en Ajustes esté apagado)')}</span>
          </label>

          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}

          <div className={s.editorRow}>
            <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost, s.restore)} onClick={() => void restore()} title={t('Vuelve a poner las de serie que hayas borrado')}>
              <RotateCcw size={13} aria-hidden="true" />
              <span>{t('Volver a poner las de serie')}</span>
            </button>
            <button type="button" className={cx(u.btn, u.btnSm)} onClick={onClose}>
              {t('Cancelar')}
            </button>
            <button type="submit" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={!ready}>
              {busy && <LoaderCircle size={13} aria-hidden="true" className={u.spin} />}
              <span>{template ? t('Guardar') : t('Crear plantilla')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
