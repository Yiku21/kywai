import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Check, Cpu, Download, Loader2, Play, RefreshCw, X } from 'lucide-react'
import type { AgentConfig, LocalEngine, LocalEngineStatus, LocalModel } from '@shared/types'
import { api } from '@/lib/api'
import { fileSize } from '@/lib/format'
import { useCowork } from '@/store/cowork'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import q from './QuotaPopover.module.css'
import s from './LocalConfig.module.css'
import { t } from '@/lib/i18n'

const ENGINE_LABEL: Record<LocalEngine, string> = { lmstudio: 'LM Studio', ollama: 'Ollama' }

/** Sugerencias para descargar con Ollama (se puede escribir cualquier otro). */
const OLLAMA_SUGGESTIONS = ['qwen3:14b', 'qwen3:8b', 'qwen3:4b', 'gemma3:12b', 'llama3.1:8b']

function isLocal(a: AgentConfig): boolean {
  return a.provider === 'ollama' || a.provider === 'lmstudio'
}

/** Nombre sugerido para el agente según la familia del modelo. */
function suggestName(model: LocalModel): string | null {
  const t = `${model.id} ${model.label}`.toLowerCase()
  const families: [RegExp, string][] = [
    [/gemma/, 'Gemma'],
    [/qwen/, 'Qwen'],
    [/llama/, 'Llama'],
    [/deepseek/, 'DeepSeek'],
    [/mistral|magistral/, 'Mistral'],
    [/phi/, 'Phi'],
    [/granite/, 'Granite']
  ]
  return families.find(([re]) => re.test(t))?.[1] ?? null
}

/** Etiqueta corta del modelo para la tarjeta del robot. */
function shortLabel(engine: LocalEngine, model: LocalModel): string {
  if (engine === 'lmstudio') return model.label.slice(0, 24)
  const [name, tag] = model.id.split(':')
  const pretty = name.replace(/(^|[-_.])(\w)/g, (_, sep: string, c: string) => `${sep === '' ? '' : ' '}${c.toUpperCase()}`)
  return `${pretty}${tag && tag !== 'latest' ? ` ${tag.toUpperCase()}` : ''}`.slice(0, 24)
}

/** Configuración del agente local: motor, modelo, nombre, descarga y límite de uso. */
export function LocalConfig({ groupId, unlimited }: { groupId: string; unlimited: boolean }) {
  const configAgents = useCowork((st) => st.config.agents)
  const pull = useCowork((st) => st.localPull)
  const agent = useMemo(() => configAgents.find((a) => a.enabled && isLocal(a) && a.quotaGroupId === groupId), [configAgents, groupId])

  const [engines, setEngines] = useState<LocalEngineStatus[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [engine, setEngine] = useState<LocalEngine>((agent?.provider as LocalEngine) ?? 'lmstudio')
  const [choice, setChoice] = useState<string>(agent?.model ?? '')
  const [name, setName] = useState(agent?.name ?? '')
  const [download, setDownload] = useState('')
  const [busy, setBusy] = useState<null | 'save' | 'start' | 'unlimited' | 'pull'>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    if (!api) return
    setLoading(true)
    try {
      setEngines(await api.listLocalEngines())
    } catch (e) {
      setMsg({ tone: 'error', text: errorText(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Al terminar una descarga se recarga la lista de modelos.
  useEffect(() => {
    if (pull?.status === 'done') void refresh()
  }, [pull?.status, refresh])

  if (!api || !agent) return null

  const status = engines?.find((e) => e.engine === engine)
  const models = status?.models ?? []
  const current = agent.provider === engine ? agent.model : ''
  const selected = models.find((m) => m.id === choice)
  const dirty = !!selected && (selected.id !== agent.model || engine !== agent.provider || (name.trim() && name.trim() !== agent.name))
  const pulling = pull && (pull.status === 'starting' || pull.status === 'downloading' || pull.status === 'verifying')
  const pct = pull?.total ? Math.min(100, ((pull.completed ?? 0) / pull.total) * 100) : null

  function pick(m: LocalModel): void {
    setChoice(m.id)
    const suggested = suggestName(m)
    if (suggested) setName(suggested)
    setMsg(null)
  }

  async function save(): Promise<void> {
    if (!api || !selected || busy) return
    setBusy('save')
    setMsg(null)
    try {
      await api.setLocalAgent({ agentId: agent!.id, engine, model: selected.id, modelLabel: shortLabel(engine, selected), name: name.trim() || undefined })
      setMsg({ tone: 'ok', text: t('Listo: {agent} usará {label} con {engine}.', { agent: name.trim() || agent!.name, label: selected.label, engine: ENGINE_LABEL[engine] }) })
    } catch (e) {
      setMsg({ tone: 'error', text: errorText(e) })
    } finally {
      setBusy(null)
    }
  }

  async function startServer(): Promise<void> {
    if (!api || busy) return
    setBusy('start')
    setMsg(null)
    try {
      await api.startLocalServer(engine)
      await refresh()
      setMsg({ tone: 'ok', text: t('Servidor de {engine} encendido.', { engine: ENGINE_LABEL[engine] }) })
    } catch (e) {
      setMsg({ tone: 'error', text: errorText(e) })
    } finally {
      setBusy(null)
    }
  }

  async function startPull(): Promise<void> {
    const model = download.trim()
    if (!api || !model || busy || pulling) return
    setBusy('pull')
    setMsg(null)
    try {
      await api.pullLocalModel(model, agent!.id)
      setChoice(model)
    } catch (e) {
      setMsg({ tone: 'error', text: errorText(e) })
    } finally {
      setBusy(null)
    }
  }

  async function toggleUnlimited(): Promise<void> {
    if (!api || busy) return
    setBusy('unlimited')
    try {
      await api.setQuotaUnlimited(groupId, !unlimited)
    } catch (e) {
      setMsg({ tone: 'error', text: errorText(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={q.budget} aria-label={t('Configuración del agente local')}>
      <div className={q.budgetHead}>
        <h4 className={q.sectionTitle}>
          <Cpu size={13} aria-hidden="true" /> {t('Agente local')}
        </h4>
        <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => void refresh()} disabled={loading} title={t('Volver a comprobar')}>
          <RefreshCw size={13} aria-hidden="true" className={loading ? s.spin : undefined} />
          <span className="sr-only">{t('Volver a comprobar')}</span>
        </button>
      </div>

      <div className={s.engines} role="tablist" aria-label={t('Motor local')}>
        {(['lmstudio', 'ollama'] as LocalEngine[]).map((en) => {
          const st = engines?.find((e) => e.engine === en)
          const state = !st ? 'unknown' : !st.installed ? 'missing' : st.running ? 'on' : 'off'
          return (
            <button
              key={en}
              type="button"
              role="tab"
              aria-selected={engine === en}
              className={cx(s.engine, engine === en && s.engineOn)}
              onClick={() => {
                setEngine(en)
                setChoice(agent.provider === en ? agent.model : '')
                setMsg(null)
              }}
            >
              <span className={cx(s.dot, s[`dot_${state}`])} aria-hidden="true" />
              {ENGINE_LABEL[en]}
              <span className={s.engineState}>
                {state === 'on' ? t('activo') : state === 'off' ? t('apagado') : state === 'missing' ? t('no instalado') : '…'}
              </span>
            </button>
          )
        })}
      </div>

      {status && !status.installed && (
        <p className={q.muted}>{ENGINE_LABEL[engine]} {t('no está instalado en este equipo.')}</p>
      )}
      {status?.installed && !status.running && (
        <div className={s.notice}>
          <span>
            {engine === 'lmstudio'
              ? t('El servidor local de LM Studio está apagado: el agente no puede trabajar hasta encenderlo.')
              : t('Ollama no está en ejecución: abre la aplicación de Ollama.')}
          </span>
          {status.canStart && (
            <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => void startServer()} disabled={!!busy}>
              {busy === 'start' ? <Loader2 size={13} className={s.spin} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
              {t('Encender')}
            </button>
          )}
        </div>
      )}

      {status?.installed && (
        <div className={s.models} role="radiogroup" aria-label={t('Modelos de {engine}', { engine: ENGINE_LABEL[engine] })}>
          {models.length === 0 ? (
            <p className={q.muted}>
              {engine === 'lmstudio'
                ? t('No hay modelos descargados. Descárgalos desde la aplicación de LM Studio y pulsa ⟳.')
                : t('No hay modelos descargados. Escribe uno abajo para descargarlo.')}
            </p>
          ) : (
            models.map((m) => {
              const isChoice = choice === m.id
              const isCurrent = current === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={isChoice}
                  className={cx(s.model, isChoice && s.modelOn)}
                  onClick={() => pick(m)}
                >
                  <span className={s.radio} aria-hidden="true">
                    {isChoice && <Check size={11} />}
                  </span>
                  <span className={s.modelText}>
                    <span className={s.modelName}>{m.label}</span>
                    <span className={s.modelMeta}>
                      {[m.params, m.quantization, m.sizeBytes ? fileSize(m.sizeBytes) : null].filter(Boolean).join(' · ') || m.id}
                    </span>
                  </span>
                  {isCurrent && <span className={s.badge}>{t('En uso')}</span>}
                </button>
              )
            })
          )}
        </div>
      )}

      {engine === 'ollama' && status?.canPull && (
        <div className={s.pull}>
          <label className={q.field}>
            <span>{t('Descargar modelo')}</span>
            <div className={s.pullRow}>
              <input
                className={q.input}
                list="ollama-suggestions"
                value={download}
                onChange={(e) => setDownload(e.target.value)}
                placeholder="qwen3:14b"
                disabled={!!pulling}
              />
              <datalist id="ollama-suggestions">
                {OLLAMA_SUGGESTIONS.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
              {pulling ? (
                <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => void api!.cancelLocalPull()}>
                  <X size={13} aria-hidden="true" /> {t('Cancelar')}
                </button>
              ) : (
                <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => void startPull()} disabled={!download.trim() || !!busy}>
                  <Download size={13} aria-hidden="true" /> {t('Descargar')}
                </button>
              )}
            </div>
          </label>
          <p className={q.muted}>{t('Los modelos grandes razonan mejor pero necesitan más memoria de vídeo.')}</p>
        </div>
      )}

      {pull && pull.status !== 'done' && (
        <div className={s.progress} role="status" aria-live="polite">
          <div className={s.progressHead}>
            <span>
              {pull.status === 'error'
                ? t('No se pudo descargar {model}', { model: pull.model })
                : pull.status === 'cancelled'
                  ? t('Descarga de {model} cancelada', { model: pull.model })
                  : pull.status === 'verifying'
                    ? t('Verificando {model}…', { model: pull.model })
                    : t('Descargando {model}…', { model: pull.model })}
            </span>
            {pct != null && pulling && <span className={s.pct}>{Math.round(pct)}%</span>}
          </div>
          {pulling && (
            <div className={cx(u.track, u.trackThin)}>
              <span className={u.fill} style={{ '--pct': `${pct ?? 3}%`, '--bar': 'var(--c-qwen)' } as CSSProperties} />
            </div>
          )}
          {pull.total && pulling ? (
            <span className={q.muted}>
              {fileSize(pull.completed ?? 0)} {t('de')} {fileSize(pull.total)}
            </span>
          ) : null}
          {pull.status === 'error' && pull.message && <span className={cx(q.formMsg, q.formError)}>{pull.message}</span>}
        </div>
      )}

      {status?.installed && models.length > 0 && (
        <>
          <label className={q.field}>
            <span>{t('Nombre del agente')}</span>
            <input className={q.input} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder={agent.name} />
          </label>
          <div className={q.budgetActions}>
            <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} onClick={() => void save()} disabled={!dirty || !!busy}>
              {busy === 'save' ? t('Guardando…') : t('Usar este modelo')}
            </button>
          </div>
        </>
      )}

      <div className={s.limit}>
        <div>
          <span className={s.limitTitle}>{t('Sin límite de uso')}</span>
          <span className={q.muted}>{unlimited ? t('Corre en tu PC: no gasta cuota.') : t('Puedes fijar un presupuesto abajo.')}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={unlimited}
          aria-label={t('Sin límite de uso')}
          className={s.switchBtn}
          onClick={() => void toggleUnlimited()}
          disabled={!!busy}
        >
          <span className={cx(u.switch, unlimited && u.switchOn)} style={{ ['--sw' as string]: 'var(--c-qwen)' }} />
        </button>
      </div>

      {msg && (
        <p className={cx(q.formMsg, msg.tone === 'error' && q.formError)} role="status">
          {msg.text}
        </p>
      )}
    </section>
  )
}
