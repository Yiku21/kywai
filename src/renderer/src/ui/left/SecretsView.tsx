import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff, KeyRound, LoaderCircle, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import type { ProjectSecretInfo, ProjectSecretInput } from '@shared/types'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import { shake } from '@/lib/shake'
import v from './Views.module.css'
import r from './RoutinesView.module.css'
import s from './SecretsView.module.css'
import { locale, t } from '@/lib/i18n'

/** El nombre tal como se guardará (mayúsculas, espacios y guiones a _), para enseñarlo mientras se escribe. */
export function secretNameOf(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_')
}

const NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/

function when(ts: number): string {
  return new Date(ts).toLocaleString(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Pestaña Secretos: claves de API, tokens y cuentas que los agentes del proyecto pueden usar pero no leer. El valor
 * se escribe aquí una vez y no vuelve a salir: la lista solo trae nombre y nota.
 */
export function SecretsView() {
  const project = useCowork((st) => st.live.project)
  const mode = useCowork((st) => st.mode)
  const pid = project?.id ?? ''
  const supported = !!api?.listSecrets
  const editable = supported && mode === 'live' && !!project
  const [secrets, setSecrets] = useState<ProjectSecretInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idL = useId()

  useEffect(() => {
    setSecrets([])
    setCreating(false)
    setError(null)
    if (!editable || !pid) return
    let alive = true
    setLoading(true)
    api!.listSecrets!(pid).then(
      (list) => alive && (setSecrets(list), setLoading(false)),
      (e) => alive && (setError(errorText(e)), setLoading(false))
    )
    return () => {
      alive = false
    }
  }, [editable, pid])

  async function save(input: ProjectSecretInput): Promise<boolean> {
    setError(null)
    try {
      setSecrets(await api!.setSecret!(pid, input))
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    }
  }

  async function remove(name: string): Promise<void> {
    setError(null)
    try {
      setSecrets(await api!.deleteSecret!(pid, name))
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <div className={v.scroll}>
      <p className={r.intro}>
        {t('Claves de API, tokens y cuentas que los agentes de este proyecto pueden')} <b>{t('usar pero no leer')}</b>
        {t('. Se guardan cifradas en el servidor, fuera de la carpeta del proyecto, y aquí nunca se vuelven a enseñar. Cada tarea las recibe como variables de entorno (por ejemplo')}{' '}
        <code className={s.code}>$GHL_PIT</code>
        {t(') y, si un agente llega a escribir el valor, en el chat, los pasos y la vista previa de archivos sale tapado.')}
      </p>

      <section className={v.section} aria-labelledby={idL}>
        <h3 className={u.sectionLabel} id={idL}>
          {t('Secretos')} <span className={u.count}>{secrets.length}</span>
        </h3>

        {error && (
          <p className={r.error} role="alert">
            {error}
          </p>
        )}

        {editable &&
          (creating ? (
            <SecretForm
              taken={secrets.map((x) => x.name)}
              onCancel={() => setCreating(false)}
              onSave={async (input) => {
                const ok = await save(input)
                if (ok) setCreating(false)
                return ok
              }}
            />
          ) : (
            <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary, r.newBtn)} onClick={() => setCreating(true)}>
              <Plus size={14} aria-hidden="true" />
              {t('Nuevo secreto')}
            </button>
          ))}

        {loading ? (
          <p className={r.muted}>
            <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> {t('Cargando…')}
          </p>
        ) : secrets.length === 0 && !creating ? (
          <div className={u.empty}>
            <span className={u.emptyIcon}>
              <KeyRound size={20} aria-hidden="true" />
            </span>
            <span className={u.emptyTitle}>{t('Sin secretos')}</span>
            <span className={u.emptyText}>
              {mode === 'demo'
                ? t('En la demo no hay secretos: aparecen con los agentes reales.')
                : !supported
                  ? t('El servidor todavía no tiene esta función: actualízalo para usarla.')
                  : t('Guarda aquí el token de GHL, una clave de API o la contraseña de una cuenta en vez de pegarlos en el chat.')}
            </span>
          </div>
        ) : (
          <ul className={r.list}>
            {secrets.map((x) => (
              <SecretCard key={x.name} secret={x} editable={editable} taken={secrets.map((y) => y.name)} onSave={save} onRemove={remove} />
            ))}
          </ul>
        )}
      </section>

      <section className={cx(v.section, s.limits)} aria-label={t('Cómo se protegen')}>
        <h3 className={u.sectionLabel}>
          <ShieldCheck size={13} aria-hidden="true" /> {t('Cómo se protegen y hasta dónde')}
        </h3>
        <ul className={s.limitList}>
          <li>{t('El valor no sale del servidor: ni a esta pantalla, ni a la web, ni al móvil, ni al encargo que lee el agente (solo ve el nombre).')}</li>
          <li>{t('El programa del agente lo recibe como variable de entorno, así que puede usarlo en órdenes y en código sin verlo.')}</li>
          <li>{t('En el navegador de kywai, el agente escribe {{secreto:NOMBRE}} y kywai pone el valor en el campo.')}</li>
          <li>
            {t('Límite sincero: un agente con terminal podría imprimirlo (echo $NOMBRE) o mandarlo a otra web. kywai se lo prohíbe en cada encargo y tapa el valor en todo lo que devuelve, pero si lo guarda en un archivo, el archivo sigue teniéndolo (solo la vista previa sale tapada). Da a cada agente claves de solo lectura o con los permisos justos cuando se pueda.')}
          </li>
        </ul>
      </section>
    </div>
  )
}

function SecretCard({
  secret,
  editable,
  taken,
  onSave,
  onRemove
}: {
  secret: ProjectSecretInfo
  editable: boolean
  taken: string[]
  onSave: (input: ProjectSecretInput) => Promise<boolean>
  onRemove: (name: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  if (editing)
    return (
      <li>
        <SecretForm
          initial={secret}
          taken={taken.filter((n) => n !== secret.name)}
          onCancel={() => setEditing(false)}
          onSave={async (input) => {
            const ok = await onSave(input)
            if (ok) setEditing(false)
            return ok
          }}
        />
      </li>
    )
  return (
    <li className={cx(r.card, s.card)}>
      <div className={r.head}>
        <span className={s.keyIcon} aria-hidden="true">
          <KeyRound size={15} />
        </span>
        <div className={r.headText}>
          <span className={cx(r.name, s.name)}>{secret.name}</span>
          {secret.note && <span className={s.note}>{secret.note}</span>}
          <span className={s.value} aria-label={t('Valor oculto')}>
            ••••••••••••
          </span>
          {secret.updatedAt > 0 && <span className={r.muted}>{t('Guardado el {when}', { when: when(secret.updatedAt) })}</span>}
        </div>
      </div>
      {editable && (
        <div className={r.actions}>
          <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setEditing(true)}>
            <Pencil size={13} aria-hidden="true" />
            {t('Cambiar')}
          </button>
          {confirming ? (
            <>
              <button type="button" className={cx(u.btn, u.btnSm, u.btnDanger)} onClick={() => void onRemove(secret.name)}>
                <Trash2 size={13} aria-hidden="true" />
                {t('Sí, quitarlo')}
              </button>
              <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => setConfirming(false)}>
                {t('Cancelar')}
              </button>
            </>
          ) : (
            <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => setConfirming(true)}>
              <Trash2 size={13} aria-hidden="true" />
              {t('Quitar')}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function SecretForm({
  initial,
  taken,
  onSave,
  onCancel
}: {
  initial?: ProjectSecretInfo
  taken: string[]
  onSave: (input: ProjectSecretInput) => Promise<boolean>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const clean = secretNameOf(name)
  const nameError = !clean ? t('Ponle un nombre, por ejemplo GHL_PIT.') : !NAME_RE.test(clean) ? t('Solo letras sin acentos, números y _, empezando por una letra.') : taken.includes(clean) ? t('Ya hay un secreto con ese nombre.') : null
  const valueError = !initial && !value.trim() ? t('Pega el valor (no se volverá a enseñar).') : null
  const badName = tried && !!nameError
  const badValue = tried && !!valueError

  function submit(e: FormEvent): void {
    e.preventDefault()
    if (nameError || valueError) {
      setTried(true)
      shake(nameError ? nameRef.current : valueRef.current)
      return
    }
    setBusy(true)
    void onSave({
      name: clean,
      note: note.trim(),
      ...(value.trim() ? { value } : {}),
      ...(initial && initial.name !== clean ? { previous: initial.name } : {})
    }).then((ok) => {
      setBusy(false)
      // El valor no se queda en la pantalla después de guardarlo.
      if (ok) setValue('')
    })
  }

  return (
    <form className={r.form} onSubmit={submit} autoComplete="off">
      <label className={r.field} htmlFor={`${id}-name`}>
        <span className={r.label}>{t('Nombre (así lo usa el agente)')}</span>
        <input
          id={`${id}-name`}
          ref={nameRef}
          className={cx(r.input, s.mono)}
          aria-invalid={badName || undefined}
          aria-describedby={badName ? `${id}-name-err` : undefined}
          value={name}
          maxLength={64}
          placeholder="GHL_PIT"
          autoFocus
          spellCheck={false}
          autoCapitalize="characters"
          onChange={(e) => setName(e.target.value)}
        />
        {clean && clean !== name && NAME_RE.test(clean) && <span className={r.muted}>{t('Se guardará como {name}', { name: clean })}</span>}
        {badName && (
          <p className={r.fieldError} role="alert" id={`${id}-name-err`}>
            {nameError}
          </p>
        )}
      </label>
      <label className={r.field} htmlFor={`${id}-value`}>
        <span className={r.label}>{initial ? t('Valor nuevo (vacío = se queda el que hay)') : t('Valor')}</span>
        <div className={s.valueRow}>
          <textarea
            id={`${id}-value`}
            ref={valueRef}
            className={cx(r.textarea, s.mono, s.secretInput, !show && s.hidden)}
            aria-invalid={badValue || undefined}
            aria-describedby={badValue ? `${id}-value-err` : undefined}
            value={value}
            rows={2}
            maxLength={8192}
            placeholder={initial ? '••••••••' : 'pit-xxxxxxxx-xxxx-…'}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            data-1p-ignore
            data-lpignore="true"
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            type="button"
            className={cx(u.iconBtn, u.iconBtnSm)}
            aria-pressed={show}
            aria-label={show ? t('Ocultar lo que escribes') : t('Ver lo que escribes')}
            title={show ? t('Ocultar lo que escribes') : t('Ver lo que escribes')}
            onClick={() => setShow((x) => !x)}
          >
            {show ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
          </button>
        </div>
        {badValue && (
          <p className={r.fieldError} role="alert" id={`${id}-value-err`}>
            {valueError}
          </p>
        )}
      </label>
      <label className={r.field} htmlFor={`${id}-note`}>
        <span className={r.label}>{t('Nota (opcional): para qué es')}</span>
        <input id={`${id}-note`} className={r.input} value={note} maxLength={200} placeholder={t('Token PIT de GHL, solo lectura')} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className={r.formRow}>
        <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={onCancel}>
          {t('Cancelar')}
        </button>
        <button type="submit" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={busy}>
          {busy && <LoaderCircle size={13} className={u.spin} aria-hidden="true" />}
          {t('Guardar')}
        </button>
      </div>
    </form>
  )
}
