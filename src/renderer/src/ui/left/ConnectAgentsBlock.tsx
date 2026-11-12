// Tarjeta «Conectar agentes» del chat: el coordinador la pone cuando le pides ayuda para conectar o iniciar sesión
// en tus agentes. Cada fila hace todo lo que kywai puede hacer por ti con un botón («Conectar»): instala el programa
// si falta (y Node.js o Python antes, si los necesita), abre la ventana guiada de inicio de sesión y comprueba sola,
// cada pocos segundos y al volver a la ventana, cuándo quedó conectado. Lo único que queda para la persona es entrar
// con su cuenta en el navegador y aceptar (o pegar la clave de Gemini o de un agente de catálogo aquí mismo).
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { CircleCheck, KeyRound, LoaderCircle, LogIn, PlugZap, RefreshCw } from 'lucide-react'
import type { ChatMessage, ConnectGuide, ConnectGuideItem, SetupAuth, SetupTool } from '@shared/types'
import { browserPlatform, loginSteps } from '@shared/loginGuide'
import { installOrder } from '@shared/setupTool'
import { api, isWeb } from '@/lib/api'
import { useCowork } from '@/store/cowork'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './ConnectAgentsBlock.module.css'
import { t } from '@/lib/i18n'

/** Cada cuánto se mira si ya quedó conectado mientras la ventana de inicio de sesión está abierta, y hasta cuándo. */
const POLL_MS = 5000
const POLL_FOR_MS = 15 * 60 * 1000

type Phase = 'idle' | 'installing' | 'waiting'

export function ConnectAgentsBlock({ guide }: { m: ChatMessage; guide: ConnectGuide }) {
  const live = useCowork((st) => st.mode === 'live')
  const total = guide.items.length
  const [done, setDone] = useState<Record<string, boolean>>({})
  const ready = Object.values(done).filter(Boolean).length
  return (
    <div className={s.card}>
      <div className={s.head}>
        <span className={s.icon} aria-hidden="true">
          {ready === total ? <CircleCheck size={18} /> : <PlugZap size={18} />}
        </span>
        <div className={s.headText}>
          <span className={s.title}>{ready === total ? t('Agentes conectados') : t('Conectar agentes')}</span>
          <span className={s.sub}>{t('{n} de {total} listos', { n: ready, total })}</span>
        </div>
      </div>
      {isWeb && <p className={s.note}>{t('Para conectarlos, abre este chat en el ordenador donde está kywai: la ventana de inicio de sesión se abre allí.')}</p>}
      <ul className={s.list}>
        {guide.items.map((it) => (
          <ConnectRow key={it.agentId} item={it} canAct={!!api && live && !isWeb} onReady={(ok) => setDone((prev) => (prev[it.agentId] === ok ? prev : { ...prev, [it.agentId]: ok }))} />
        ))}
      </ul>
    </div>
  )
}

function ConnectRow({ item, canAct, onReady }: { item: ConnectGuideItem; canAct: boolean; onReady: (ok: boolean) => void }) {
  const agent = useCowork((st) => st.config.agents.find((a) => a.id === item.agentId))
  const log = useCowork((st) => st.setupLog)
  const [auth, setAuth] = useState<SetupAuth | 'checking' | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const until = useRef(0)
  const ok = !!auth && auth !== 'checking' && auth.ok
  const apiKey = agent?.cli?.apiKey
  const hasLogin = item.tool !== `cli:${item.agentId}` || !!agent?.cli?.login

  const check = useCallback(async (quiet = false): Promise<boolean> => {
    const a = api
    if (!a) return false
    if (!quiet) setAuth('checking')
    try {
      const r = await a.setupAuth(item.tool)
      setAuth(r)
      return r.ok
    } catch (e) {
      if (!quiet) setAuth({ id: item.tool, ok: false, detail: errorText(e), canLogin: hasLogin })
      return false
    }
  }, [item.tool, hasLogin])

  useEffect(() => {
    void check()
  }, [check])

  useEffect(() => onReady(ok), [ok]) // eslint-disable-line react-hooks/exhaustive-deps

  // Con la ventana de inicio de sesión abierta: se mira cada pocos segundos y al volver a kywai.
  useEffect(() => {
    if (phase !== 'waiting' || ok) return
    const tick = () => {
      if (Date.now() > until.current) {
        setPhase('idle')
        return
      }
      void check(true)
    }
    const id = window.setInterval(tick, POLL_MS)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', tick)
    }
  }, [phase, ok, check])

  useEffect(() => {
    if (ok && phase !== 'idle') setPhase('idle')
  }, [ok, phase])

  async function installIfMissing(): Promise<boolean> {
    const a = api!
    const tools: SetupTool[] = await a.setupDetect()
    const me = tools.find((x) => x.id === item.tool)
    if (!me || me.installed) return true
    if (!me.canInstall) throw new Error(t('{name} se instala desde su web: {url}', { name: item.name, url: me.url }))
    // Primero lo que necesita (Node.js o Python), luego el propio programa.
    const need = me.needs ? tools.find((x) => x.id === me.needs && !x.installed) : undefined
    for (const tool of installOrder([...(need ? [need] : []), me])) {
      const r = await a.setupInstall(tool.id)
      if (!r.ok) throw new Error(r.message)
    }
    return true
  }

  async function connect(): Promise<void> {
    const a = api
    if (!a || phase !== 'idle') return
    setError(null)
    try {
      setPhase('installing')
      await installIfMissing()
      if (await check(true)) return setPhase('idle')
      if (!hasLogin) return setPhase('idle')
      await a.setupLogin(item.tool)
      until.current = Date.now() + POLL_FOR_MS
      setPhase('waiting')
    } catch (e) {
      setError(errorText(e))
      setPhase('idle')
    }
  }

  async function saveKey(e: FormEvent): Promise<void> {
    e.preventDefault()
    const a = api
    const k = key.trim()
    if (!a || !k) return
    setError(null)
    setAuth('checking')
    try {
      const r = item.tool === 'gemini' ? await a.setupGeminiKey(k) : await a.setAgentKey(item.agentId, k)
      setAuth(r)
      setKey('')
    } catch (err) {
      setError(errorText(err))
      void check()
    }
  }

  const lastLine = phase === 'installing' ? [...log].reverse().find((l) => l.toolId === item.tool || l.toolId === 'node' || l.toolId === 'python')?.line : undefined
  const showKey = !ok && (item.tool === 'gemini' || !!apiKey)

  return (
    <li className={cx(s.row, ok && s.rowOk)}>
      <div className={s.rowHead}>
        <div className={s.rowText}>
          <span className={s.name}>{item.name}</span>
          <span className={cx(s.detail, ok && s.okText)}>
            {auth === 'checking' || auth === null
              ? t('Comprobando…')
              : phase === 'installing'
                ? lastLine ?? t('Instalando…')
                : phase === 'waiting' && !ok
                  ? t('Esperando a que inicies sesión en la ventana que se abrió…')
                  : auth.detail}
          </span>
        </div>
        {ok ? (
          <CircleCheck size={18} className={s.okIcon} aria-label={t('Listo')} />
        ) : (
          <span className={s.actions}>
            {hasLogin || !apiKey ? (
              <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={!canAct || phase !== 'idle'} onClick={() => void connect()}>
                {phase === 'idle' ? <LogIn size={13} aria-hidden="true" /> : <LoaderCircle size={13} aria-hidden="true" className={u.spin} />}
                {phase === 'waiting' ? t('Esperando…') : phase === 'installing' ? t('Instalando…') : t('Conectar')}
              </button>
            ) : null}
            <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} disabled={!api || auth === 'checking'} onClick={() => void check()} title={t('Comprobar')} aria-label={t('Comprobar')}>
              <RefreshCw size={13} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
      {showKey && (
        <form className={s.keyForm} onSubmit={(e) => void saveKey(e)}>
          <KeyRound size={13} aria-hidden="true" className={s.keyIcon} />
          <input
            className={s.input}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={item.tool === 'gemini' ? t('…o pega aquí una clave de API de Google AI Studio') : t('Pega aquí {label}', { label: apiKey!.label })}
            aria-label={item.tool === 'gemini' ? t('Clave de API de Gemini') : apiKey!.label}
            autoComplete="off"
            disabled={!canAct}
          />
          <button type="submit" className={cx(u.btn, u.btnSm)} disabled={!canAct || !key.trim()}>
            {t('Guardar')}
          </button>
          <button
            type="button"
            className={cx(u.btn, u.btnSm, u.btnGhost)}
            onClick={() => void api?.openExternal(item.tool === 'gemini' ? 'https://aistudio.google.com/apikey' : apiKey!.url)}
          >
            {t('Conseguir una')}
          </button>
        </form>
      )}
      {phase === 'waiting' && !ok && hasLogin && (
        <div className={s.steps}>
          <p className={s.stepsLead}>{t('Se ha abierto una ventana aparte. Sigue allí estos pasos:')}</p>
          <ol>
            {loginSteps(item.tool, item.name, browserPlatform()).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p className={s.stepsNote}>{t('¿No ves la ventana? Búscala en la barra de tareas o en el Dock. Al volver aquí se comprueba solo.')}</p>
        </div>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </li>
  )
}
