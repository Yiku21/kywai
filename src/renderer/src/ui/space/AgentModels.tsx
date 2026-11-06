import { useEffect, useState } from 'react'
import type { AgentConfig, HermesModelsInfo, ModelChoice, ModelOption } from '@shared/types'
import { api } from '@/lib/api'
import { useCowork } from '@/store/cowork'
import { errorText } from '../common/util'
import s from './AgentModels.module.css'
import { t } from '@/lib/i18n'

const NONE = '__none__'

/** Modelos del agente para tareas fáciles, normales y difíciles (los asigna el planificador). */
export function AgentModels({ agent }: { agent: AgentConfig }) {
  const mode = useCowork((st) => st.mode)
  const [options, setOptions] = useState<ModelOption[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    api?.listModelOptions(agent.id).then(
      (o) => alive && setOptions(o),
      () => alive && setOptions([])
    )
    return () => {
      alive = false
    }
  }, [agent.id])

  if (!api || mode !== 'live' || agent.isSubagent || agent.provider === 'ollama' || agent.provider === 'lmstudio' || agent.provider === 'cli') return null

  // Asegura que los modelos actuales aparezcan aunque no estén en la lista.
  const list: ModelOption[] = [...(options ?? [])]
  const ensure = (id: string | undefined, label: string | undefined): void => {
    if (id !== undefined && !list.some((o) => o.id === id)) list.push({ id, label: label || id || t('Auto') })
  }
  ensure(agent.model, agent.modelLabel)
  ensure(agent.lightModel, agent.lightModelLabel)
  ensure(agent.strongModel, agent.strongModelLabel)
  const choice = (id: string): ModelChoice => ({ model: id, label: list.find((o) => o.id === id)?.label ?? id })

  async function save(tier: 'light' | 'standard' | 'strong', value: string): Promise<void> {
    const a = api
    if (!a || busy) return
    const light = tier === 'light' ? (value === NONE ? null : choice(value)) : agent.lightModel ? choice(agent.lightModel) : null
    const standard = tier === 'standard' ? choice(value) : choice(agent.model)
    const strong = tier === 'strong' ? (value === NONE ? null : choice(value)) : agent.strongModel ? choice(agent.strongModel) : null
    setBusy(true)
    setMsg(null)
    try {
      await a.setAgentModels({ agentId: agent.id, light, standard, strong })
      setMsg({ tone: 'ok', text: t('Guardado. Se aplica a las próximas tareas.') })
    } catch (e) {
      setMsg({ tone: 'error', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const row = (tier: 'light' | 'standard' | 'strong', title: string, hint: string, value: string, noneLabel?: string) => (
    <label className={s.row}>
      <span className={s.rowText}>
        <span className={s.title}>{title}</span>
        <span className={s.hint}>{hint}</span>
      </span>
      <select className={s.select} value={value} disabled={busy || !options} onChange={(e) => void save(tier, e.target.value)}>
        {noneLabel && <option value={NONE}>{noneLabel}</option>}
        {list.map((o) => (
          <option key={o.id || 'auto'} value={o.id} title={o.note ? t(o.note) : undefined}>
            {o.label}
            {o.note ? ` · ${t(o.note)}` : ''}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className={s.root}>
      {row('light', t('Fácil'), t('Becarios y tareas sencillas'), agent.lightModel ?? NONE, t('Sin becario (usa el habitual)'))}
      {row('standard', 'Normal', t('El modelo de cada día'), agent.model)}
      {row('strong', t('Difícil'), t('Problemas complejos'), agent.strongModel ?? NONE, t('Igual que el habitual'))}
      <p className={s.note}>
        {t('El planificador marca la dificultad de cada tarea. Si tu cuenta rechaza un modelo, la tarea pasa sola al siguiente nivel.')}
      </p>
      {msg && <p className={msg.tone === 'error' ? s.error : s.ok}>{msg.text}</p>}
    </div>
  )
}

/** Hermes: el modelo con el que coordina; al pulsarlo se abre la lista de sus proveedores (como «/model»). */
export function HermesModelRow({ agent }: { agent: AgentConfig }) {
  const [info, setInfo] = useState<HermesModelsInfo | null>(null)
  useEffect(() => {
    let alive = true
    api?.getHermesModels().then(
      (i) => alive && setInfo(i),
      () => alive && setInfo(null)
    )
    return () => {
      alive = false
    }
  }, [agent.model, agent.modelProvider])
  const current = info?.current ?? { model: agent.model, provider: agent.modelProvider ?? '', fromApp: !!agent.model }
  return (
    <button
      type="button"
      className={s.hermes}
      title={t('Ver los modelos disponibles y cambiarlo (también con /model en el chat)')}
      onClick={() => useCowork.setState({ hermesModelOpen: true })}
    >
      <span className={s.rowText}>
        <span className={s.hermesModel}>{current.model || t('El de su configuración')}</span>
        <span className={s.hint}>
          {current.provider || t('su proveedor')} · {current.fromApp ? t('elegido en AI Cowork') : t('el de la configuración de Hermes')}
        </span>
      </span>
      <span className={s.hermesChange}>{t('Cambiar')}</span>
    </button>
  )
}
