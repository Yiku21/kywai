import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, Globe, Hand, LogOut, RotateCw, ShieldCheck, Square, X } from 'lucide-react'
import { api, isWeb } from '@/lib/api'
import { useCowork } from '@/store/cowork'
import { t } from '@/lib/i18n'
import { isBrowserKey, type BrowserRect } from '@shared/browser'
import { cx } from '../common/util'
import u from '../common/ui.module.css'
import s from './BrowserPane.module.css'

/** Lo que tapa la pestaña si se pone encima (diálogos, menús, la vista previa…): mientras esté, se ve una captura. */
const OVERLAYS = '[role="dialog"], [role="alertdialog"], dialog[open], [role="menu"], [role="listbox"], [data-preview-panel]'

function overlapping(rect: DOMRect, root: HTMLElement): boolean {
  for (const el of document.querySelectorAll<HTMLElement>(OVERLAYS)) {
    if (root.contains(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    if (r.right > rect.left && r.left < rect.right && r.bottom > rect.top && r.top < rect.bottom) return true
  }
  return false
}

/**
 * Pestaña «Navegador»: una web de verdad dentro de kywai, con su propia sesión guardada. Entras aquí con tu cuenta
 * y los agentes leen y recorren esas páginas (para hacer clic o escribir te piden permiso). En el equipo de los
 * agentes es la propia página, colocada encima de este panel; desde otro dispositivo se ve con capturas y se maneja
 * con clics y teclas.
 */
export function BrowserPane() {
  const setBrowserOpen = useCowork((st) => st.setBrowserOpen)
  const state = useCowork((st) => st.browser)
  const previewOpen = useCowork((st) => st.preview != null)
  const [address, setAddress] = useState('')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [covered, setCovered] = useState(false)
  const area = useRef<HTMLDivElement>(null)
  const pane = useRef<HTMLElement>(null)
  const url = state?.url ?? ''
  const blank = !url
  const remote = isWeb

  // Estado al abrir (las páginas que cargue después llegan con el evento browser.state).
  useEffect(() => {
    if (!api) return
    void api.browserState().then((st) => useCowork.setState({ browser: st })).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!editing) setAddress(url)
  }, [url, editing])

  // ¿Algo de la interfaz se pone encima? (la página de verdad siempre queda por encima de todo lo demás).
  useEffect(() => {
    if (remote) return
    const check = (): void => {
      const el = area.current
      const root = pane.current
      if (!el || !root) return
      setCovered(previewOpen || overlapping(el.getBoundingClientRect(), root))
    }
    check()
    const mo = new MutationObserver(check)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'role', 'style', 'class'] })
    return () => mo.disconnect()
  }, [remote, previewOpen])

  // Con algo encima, una captura ocupa su sitio para que no se vea un hueco.
  useEffect(() => {
    if (remote || !covered || blank || !api) {
      if (!covered) setSnapshot(null)
      return
    }
    let alive = true
    void api.browserFrame().then((f) => alive && setSnapshot(f?.image ?? null)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [covered, blank, remote])

  // En el equipo de los agentes: coloca la página encima del panel y la sigue al cambiar de tamaño.
  const showNative = !remote && !blank && !covered
  useEffect(() => {
    if (remote || !api) return
    const el = area.current
    if (!el || !showNative) {
      void api.browserShow(null).catch(() => undefined)
      return
    }
    let frame = 0
    const send = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        const rect: BrowserRect = { x: r.left, y: r.top, width: r.width, height: r.height }
        void api!.browserShow(rect).catch(() => undefined)
      })
    }
    send()
    const ro = new ResizeObserver(send)
    ro.observe(el)
    window.addEventListener('resize', send)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('resize', send)
      void api!.browserShow(null).catch(() => undefined)
    }
  }, [showNative, remote])

  const run = useCallback(async (fn: () => Promise<unknown>): Promise<void> => {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const go = (): void => {
    const text = address.trim()
    if (!text || !api) return
    setEditing(false)
    void run(() => api!.browserNavigate(text))
  }

  const agent = state?.agent
  const close = t('Cerrar el navegador (vuelve el espacio 3D)')
  return (
    <section ref={pane} className={s.pane} aria-label={t('Navegador de kywai')}>
      <div className={s.bar}>
        <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} disabled={!state?.canGoBack} onClick={() => void run(() => api!.browserCommand('back'))} aria-label={t('Atrás')} title={t('Atrás')}>
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} disabled={!state?.canGoForward} onClick={() => void run(() => api!.browserCommand('forward'))} aria-label={t('Adelante')} title={t('Adelante')}>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cx(u.iconBtn, u.iconBtnSm)}
          disabled={blank}
          onClick={() => void run(() => api!.browserCommand(state?.loading ? 'stop' : 'reload'))}
          aria-label={state?.loading ? t('Parar la carga') : t('Recargar')}
          title={state?.loading ? t('Parar la carga') : t('Recargar')}
        >
          {state?.loading ? <Square size={14} aria-hidden="true" /> : <RotateCw size={15} aria-hidden="true" />}
        </button>
        <form
          className={s.address}
          onSubmit={(e) => {
            e.preventDefault()
            go()
          }}
        >
          <Globe size={14} aria-hidden="true" className={s.addressIcon} />
          <input
            className={s.addressInput}
            value={address}
            placeholder={t('Escribe una dirección o lo que quieras buscar')}
            aria-label={t('Dirección')}
            spellCheck={false}
            onFocus={(e) => {
              setEditing(true)
              e.currentTarget.select()
            }}
            onBlur={() => setEditing(false)}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setAddress(url)
                e.currentTarget.blur()
              }
            }}
          />
        </form>
        <button
          type="button"
          className={cx(u.iconBtn, u.iconBtnSm)}
          onClick={() => {
            if (window.confirm(t('¿Cerrar sesión en todas las webs del navegador de kywai? Se borran sus cookies y datos guardados.'))) void run(() => api!.browserClearSession())
          }}
          aria-label={t('Cerrar sesión en todo')}
          title={t('Cerrar sesión en todo')}
        >
          <LogOut size={15} aria-hidden="true" />
        </button>
        <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => setBrowserOpen(false)} aria-label={close} title={close}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {agent && (
        <div className={s.agent} role="status">
          <span className={s.agentDot} aria-hidden="true" />
          <span className={s.agentText}>{`${agent.name} ${t(agent.action)}`}</span>
          <span className={s.agentTask} title={agent.taskTitle}>
            {agent.taskTitle}
          </span>
          <button type="button" className={cx(u.btn, u.btnSm, s.agentStop)} onClick={() => void run(() => api!.browserStopAgent())}>
            <Hand size={13} aria-hidden="true" />
            {t('Parar')}
          </button>
        </div>
      )}
      {error && (
        <div className={s.error} role="alert">
          {error}
        </div>
      )}
      <div ref={area} className={s.area}>
        {blank ? (
          <BrowserIntro />
        ) : remote ? (
          <RemoteView />
        ) : (
          snapshot && <img className={s.snapshot} src={snapshot} alt="" aria-hidden="true" />
        )}
      </div>
    </section>
  )
}

/** Página en blanco: qué es y cómo se usa. */
function BrowserIntro() {
  return (
    <div className={s.intro}>
      <Globe size={34} aria-hidden="true" className={s.introIcon} />
      <h3 className={s.introTitle}>{t('Tu navegador, con tus cuentas')}</h3>
      <p className={s.introText}>{t('Escribe arriba una dirección y entra con tu cuenta (por ejemplo, GoHighLevel). La sesión se queda guardada en este navegador, aparte de kywai.')}</p>
      <ul className={s.introList}>
        <li>
          <ShieldCheck size={15} aria-hidden="true" />
          {t('Los agentes nunca ven tu contraseña: no pueden leer ni escribir contraseñas, códigos ni tarjetas.')}
        </li>
        <li>
          <ShieldCheck size={15} aria-hidden="true" />
          {t('Pueden leer las páginas, hacer capturas y moverse por ellas para documentar o revisar algo.')}
        </li>
        <li>
          <ShieldCheck size={15} aria-hidden="true" />
          {t('Para hacer clic, escribir o cambiar algo te piden permiso en el chat y en «Te necesita».')}
        </li>
      </ul>
      <p className={s.introHint}>{t('Luego pide en el chat, por ejemplo: «Documenta el workflow “Bienvenida” de GoHighLevel que tengo abierto en el navegador».')}</p>
    </div>
  )
}

/**
 * Desde otro dispositivo (cliente de escritorio, navegador web): la pestaña del equipo de los agentes se ve con
 * capturas seguidas y se maneja con clics, la rueda y el teclado.
 */
function RemoteView() {
  const [frame, setFrame] = useState<{ image: string; width: number; height: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const img = useRef<HTMLImageElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const fast = useRef(0)
  const pendingText = useRef('')
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async (): Promise<void> => {
      if (!alive || !api) return
      if (document.visibilityState === 'visible') {
        try {
          const f = await api.browserFrame()
          if (!alive) return
          setFrame(f)
          setFailed(!f)
        } catch {
          if (alive) setFailed(true)
        }
      }
      if (alive) timer = setTimeout(() => void tick(), Date.now() < fast.current ? 350 : 1200)
    }
    void tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [])

  const toPage = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = img.current
    if (!el || !frame) return null
    // La imagen se encaja sin deformarse (arriba y centrada): solo cuenta la parte donde está dibujada.
    const r = el.getBoundingClientRect()
    const nw = el.naturalWidth || frame.width
    const nh = el.naturalHeight || frame.height
    const scale = Math.min(r.width / nw, r.height / nh)
    const w = nw * scale
    const h = nh * scale
    const left = r.left + (r.width - w) / 2
    const x = (clientX - left) / w
    const y = (clientY - r.top) / h
    if (!(w > 1 && h > 1) || x < 0 || x > 1 || y < 0 || y > 1) return null
    return { x: x * frame.width, y: y * frame.height }
  }
  const send = (input: Parameters<NonNullable<typeof api>['browserInput']>[0]): void => {
    fast.current = Date.now() + 3000
    void api?.browserInput(input).catch(() => undefined)
  }
  const flushText = (): void => {
    if (textTimer.current) clearTimeout(textTimer.current)
    textTimer.current = null
    const text = pendingText.current
    pendingText.current = ''
    if (text) send({ type: 'text', text })
  }
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key.length === 1) {
      e.preventDefault()
      pendingText.current += e.key
      if (textTimer.current) clearTimeout(textTimer.current)
      textTimer.current = setTimeout(flushText, 150)
      return
    }
    const key = e.key === ' ' ? 'Space' : e.key
    if (!isBrowserKey(key)) return
    e.preventDefault()
    flushText()
    send({ type: 'key', key })
  }

  if (!frame) {
    return <div className={s.remoteWait}>{failed ? t('No llega la imagen del navegador: la ventana de kywai debe estar abierta en el equipo servidor.') : t('Cargando el navegador del equipo servidor…')}</div>
  }
  return (
    <div
      ref={box}
      className={s.remote}
      tabIndex={0}
      aria-label={t('Navegador del equipo servidor: haz clic y escribe como en una web')}
      onKeyDown={onKey}
      onPaste={(e) => {
        const text = e.clipboardData.getData('text')
        if (text) {
          e.preventDefault()
          flushText()
          send({ type: 'text', text: text.slice(0, 2000) })
        }
      }}
      onWheel={(e) => {
        const p = toPage(e.clientX, e.clientY)
        if (p) send({ type: 'scroll', x: p.x, y: p.y, dy: e.deltaY })
      }}
    >
      <img
        ref={img}
        className={s.remoteImg}
        src={frame.image}
        alt={t('Lo que se ve en el navegador del equipo servidor')}
        draggable={false}
        onClick={(e) => {
          box.current?.focus()
          const p = toPage(e.clientX, e.clientY)
          if (p) send({ type: 'click', x: p.x, y: p.y })
        }}
      />
      <p className={s.remoteNote}>{t('Lo ves desde otro dispositivo: el navegador está en el equipo servidor. Haz clic en la imagen y escribe como en una web.')}</p>
    </div>
  )
}
