import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, ArrowRight, Globe, Hand, LogOut, RotateCw, ShieldCheck, Square, X } from 'lucide-react'
import { api, isWeb } from '@/lib/api'
import { useCowork } from '@/store/cowork'
import { t } from '@/lib/i18n'
import { isRemoteKey, type BrowserRect, type BrowserRemoteInput as RemoteInput } from '@shared/browser'
import { cx } from '../common/util'
import u from '../common/ui.module.css'
import s from './BrowserPane.module.css'
import { useExitGhost } from '../common/motion'

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
  // Al cerrarlo, su copia se va hacia la derecha. Al abrirse solo funde (CSS): el navegador de verdad se coloca encima
  // midiendo el panel y no debe moverse.
  useExitGhost(pane, { x: 40, scale: 0.97 })
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
          <RemoteView loading={!!state?.loading} />
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

type PageInfo = { width: number; height: number; cursor: string }
type Pressed = Array<'left' | 'right' | 'middle'>

/** Espera a reunir las direcciones de este dispositivo (Tailscale, red de casa) para mandarlas de una vez. */
function gathered(pc: RTCPeerConnection): Promise<void> {
  return new Promise((done) => {
    if (pc.iceGatheringState === 'complete') return done()
    const tm = setTimeout(done, 2500)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(tm)
        done()
      }
    })
  })
}

/**
 * Desde otro dispositivo (cliente de escritorio, navegador web): la pestaña del equipo de los agentes se ve en vídeo
 * en directo, como AnyDesk (WebRTC directo por Tailscale o la red de casa; ratón y teclado por su canal de datos).
 * Si el vídeo no conecta, se ve con imágenes que llegan en cuanto la página cambia. Se maneja como una web: mover el
 * ratón (los enlaces se iluminan y el puntero cambia), clic, doble clic, clic derecho, arrastrar, rueda y atajos.
 */
function RemoteView({ loading }: { loading: boolean }) {
  const canVideo = typeof RTCPeerConnection !== 'undefined' && !!api
  const [rtc, setRtc] = useState<'connecting' | 'live' | 'off'>(canVideo ? 'connecting' : 'off')
  const [videoReady, setVideoReady] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [info, setInfo] = useState<PageInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; right: boolean }>>([])
  const img = useRef<HTMLImageElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const infoRef = useRef(info)
  infoRef.current = info
  const live = rtc === 'live' && videoReady
  const liveRef = useRef(live)
  liveRef.current = live
  const channel = useRef<RTCDataChannel | null>(null)
  const pendingText = useRef('')
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queue = useRef<RemoteInput[]>([])
  const sending = useRef(false)
  const wheel = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null)
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rippleId = useRef(0)
  // Doble y triple clic: los eventos de puntero no traen la cuenta (detail es 0), así que se lleva aquí.
  const lastDown = useRef({ at: 0, x: 0, y: 0, button: -1, count: 0 })

  /** El hueco donde se ve la página (sin la nota de abajo), en píxeles CSS. */
  const viewport = (): { width: number; height: number } | undefined => {
    const el = (liveRef.current ? video.current : img.current) ?? box.current
    return el && el.clientWidth > 0 && el.clientHeight > 0 ? { width: Math.round(el.clientWidth), height: Math.round(el.clientHeight) } : undefined
  }
  const sendViewport = (): void => {
    const ch = channel.current
    const vp = viewport()
    if (ch?.readyState === 'open' && vp) ch.send(JSON.stringify({ type: 'viewport', ...vp }))
  }

  // Vídeo en directo: oferta WebRTC → respuesta del servidor. Si en unos segundos no conecta, imágenes.
  useEffect(() => {
    if (!canVideo || !api) return
    let closed = false
    const pc = new RTCPeerConnection({ iceServers: [] })
    const off = (): void => {
      if (closed) return
      channel.current = null
      setRtc('off')
    }
    pc.addTransceiver('video', { direction: 'recvonly' })
    const ch = pc.createDataChannel('input', { ordered: true })
    ch.onopen = () => {
      channel.current = ch
      sendViewport()
    }
    ch.onclose = off
    ch.onmessage = (m) => {
      try {
        const d = JSON.parse(String(m.data)) as { type?: string; width?: number; height?: number; cursor?: string }
        if (d.type === 'meta' && typeof d.width === 'number' && typeof d.height === 'number') setInfo({ width: d.width, height: d.height, cursor: d.cursor || 'default' })
      } catch {
        /* nada */
      }
    }
    pc.ontrack = (e) => {
      const v = video.current
      if (v) v.srcObject = e.streams[0] ?? new MediaStream([e.track])
    }
    let dropTimer: ReturnType<typeof setTimeout> | null = null
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState
      if (st === 'connected') {
        if (dropTimer) clearTimeout(dropTimer)
        dropTimer = null
        setRtc('live')
      } else if (st === 'failed' || st === 'closed') off()
      else if (st === 'disconnected') dropTimer ??= setTimeout(off, 4000)
    }
    const giveUp = setTimeout(() => {
      if (pc.connectionState !== 'connected') off()
    }, 9000)
    void (async () => {
      await pc.setLocalDescription(await pc.createOffer())
      await gathered(pc)
      const answer = await api!.browserRtc(pc.localDescription?.sdp ?? '')
      if (!answer) return off()
      if (!closed) await pc.setRemoteDescription({ type: 'answer', sdp: answer })
    })().catch(off)
    // El hueco cada pocos segundos (también dice al servidor que sigues mirando) y al cambiar de tamaño.
    const beat = setInterval(sendViewport, 3000)
    const ro = new ResizeObserver(() => sendViewport())
    if (box.current) ro.observe(box.current)
    return () => {
      closed = true
      clearTimeout(giveUp)
      if (dropTimer) clearTimeout(dropTimer)
      clearInterval(beat)
      ro.disconnect()
      channel.current = null
      pc.close()
    }
  }, [])

  // Imágenes mientras el vídeo conecta o si no hay vídeo: cada petición vuelve cuando la página cambió.
  useEffect(() => {
    if (live) return
    let alive = true
    let version = -1
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async (): Promise<void> => {
      if (!alive || !api) return
      const started = Date.now()
      if (document.visibilityState === 'visible') {
        try {
          const vp = viewport()
          const dpr = window.devicePixelRatio || 1
          const f = await api.browserFrame({ after: version, ...(vp ? { maxWidth: Math.round(vp.width * dpr), viewport: vp } : {}) })
          if (!alive) return
          if (f) {
            version = f.version
            setInfo({ width: f.width, height: f.height, cursor: f.cursor })
            if (f.image) {
              setImage(f.image)
              setWaiting(false)
            }
          }
          setFailed(!f)
        } catch {
          if (alive) setFailed(true)
        }
      }
      const gap = document.visibilityState !== 'visible' ? 1000 : Math.max(0, 66 - (Date.now() - started))
      if (alive) timer = setTimeout(() => void tick(), gap)
    }
    void tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [live])

  // Si la respuesta tarda, se nota (una raya que avanza arriba): sabes que el clic llegó y está en camino.
  useEffect(() => {
    if (!waiting) return
    const tm = setTimeout(() => setWaiting(false), live ? 250 : 4000)
    return () => clearTimeout(tm)
  }, [waiting, live])

  const toPage = (clientX: number, clientY: number, clamp = false): { x: number; y: number } | null => {
    const v = liveRef.current ? video.current : null
    const el = v ?? img.current
    const page = infoRef.current
    if (!el || !page) return null
    // La imagen se encaja sin deformarse (arriba y centrada): solo cuenta la parte donde está dibujada.
    const r = el.getBoundingClientRect()
    const nw = (v ? v.videoWidth : img.current?.naturalWidth) || page.width
    const nh = (v ? v.videoHeight : img.current?.naturalHeight) || page.height
    const scale = Math.min(r.width / nw, r.height / nh)
    const w = nw * scale
    const h = nh * scale
    const left = r.left + (r.width - w) / 2
    let x = (clientX - left) / w
    let y = (clientY - r.top) / h
    if (!(w > 1 && h > 1)) return null
    // Al arrastrar o soltar fuera de la imagen, cuenta el borde (si no, el botón se quedaría pulsado en la página).
    if (clamp) {
      x = Math.min(1, Math.max(0, x))
      y = Math.min(1, Math.max(0, y))
    } else if (x < 0 || x > 1 || y < 0 || y > 1) return null
    return { x: x * page.width, y: y * page.height }
  }
  // Con vídeo, todo va al momento por su canal (en orden). Sin él, una sola cola: lo que se junta mientras llega la
  // respuesta anterior sale en un solo envío, y de los movimientos seguidos solo cuenta el último.
  const send = (input: RemoteInput, feedback = true): void => {
    if (feedback) setWaiting(true)
    const ch = channel.current
    if (ch?.readyState === 'open' && !queue.current.length) {
      ch.send(JSON.stringify(input))
      return
    }
    const q = queue.current
    const last = q[q.length - 1]
    if (input.type === 'mouse' && input.action === 'move' && last?.type === 'mouse' && last.action === 'move') q[q.length - 1] = input
    else q.push(input)
    void pump()
  }
  const pump = async (): Promise<void> => {
    if (sending.current || !api) return
    sending.current = true
    try {
      while (queue.current.length) {
        const batch = queue.current.splice(0, 60)
        await api.browserInput(batch).catch(() => undefined)
      }
    } finally {
      sending.current = false
    }
  }
  const ripple = (clientX: number, clientY: number, right: boolean): void => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    const id = ++rippleId.current
    setRipples((list) => [...list.slice(-4), { id, x: clientX - r.left, y: clientY - r.top, right }])
    setTimeout(() => setRipples((list) => list.filter((p) => p.id !== id)), 650)
  }
  const flushText = (): void => {
    if (textTimer.current) clearTimeout(textTimer.current)
    textTimer.current = null
    const text = pendingText.current
    pendingText.current = ''
    if (text) send({ type: 'text', text })
  }
  const flushWheel = (): void => {
    wheelTimer.current = null
    const w = wheel.current
    wheel.current = null
    if (w && (w.dx || w.dy)) send({ type: 'scroll', x: w.x, y: w.y, dx: w.dx, dy: w.dy }, false)
  }

  // La rueda con un oyente no pasivo: así la página de kywai no se desplaza a la vez.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      const p = toPage(e.clientX, e.clientY)
      if (!p) return
      e.preventDefault()
      // Líneas o páginas (algunos ratones en Windows/Firefox) a píxeles.
      const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1
      const w = wheel.current ?? { x: p.x, y: p.y, dx: 0, dy: 0 }
      w.x = p.x
      w.y = p.y
      w.dx += (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k
      w.dy += (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k
      wheel.current = w
      wheelTimer.current ??= setTimeout(flushWheel, liveRef.current ? 16 : 40)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const buttonOf = (b: number): 'left' | 'right' | 'middle' => (b === 2 ? 'right' : b === 1 ? 'middle' : 'left')
  const pressedOf = (bits: number): Pressed => [...(bits & 1 ? (['left'] as const) : []), ...(bits & 2 ? (['right'] as const) : []), ...(bits & 4 ? (['middle'] as const) : [])]
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const mods = [...(e.ctrlKey ? (['control'] as const) : []), ...(e.metaKey ? (['meta'] as const) : []), ...(e.altKey ? (['alt'] as const) : []), ...(e.shiftKey ? (['shift'] as const) : [])]
    const combo = e.ctrlKey || e.metaKey || e.altKey
    // Pegar va por el evento «paste» (con tu portapapeles); copiar y cortar se quedan en el equipo servidor.
    if (combo && (e.key === 'v' || e.key === 'V')) return
    if (!combo && e.key.length === 1) {
      e.preventDefault()
      pendingText.current += e.key
      if (textTimer.current) clearTimeout(textTimer.current)
      textTimer.current = setTimeout(flushText, liveRef.current ? 30 : 120)
      return
    }
    const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (!isRemoteKey(key)) return
    if (key.length === 1 && !combo) return
    e.preventDefault()
    flushText()
    send({ type: 'key', key, modifiers: mods })
  }
  const pointer = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      box.current?.focus({ preventScroll: true })
      const p = toPage(e.clientX, e.clientY)
      if (!p) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      flushText()
      ripple(e.clientX, e.clientY, e.button === 2)
      const last = lastDown.current
      const again = e.button === last.button && Date.now() - last.at < 500 && Math.abs(e.clientX - last.x) < 6 && Math.abs(e.clientY - last.y) < 6
      lastDown.current = { at: Date.now(), x: e.clientX, y: e.clientY, button: e.button, count: again ? Math.min(3, last.count + 1) : 1 }
      send({ type: 'mouse', action: 'down', x: p.x, y: p.y, button: buttonOf(e.button), clickCount: lastDown.current.count })
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const p = toPage(e.clientX, e.clientY, true)
      if (!p) return
      send({ type: 'mouse', action: 'up', x: p.x, y: p.y, button: buttonOf(e.button), clickCount: lastDown.current.count || 1 })
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const p = toPage(e.clientX, e.clientY, e.buttons !== 0)
      if (!p) return
      send({ type: 'mouse', action: 'move', x: p.x, y: p.y, buttons: pressedOf(e.buttons) }, false)
    }
  }

  const cursor = info?.cursor || 'default'
  const nothing = !live && !image
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
      onContextMenu={(e) => e.preventDefault()}
    >
      {(loading || waiting) && <span className={s.remoteBusy} aria-hidden="true" />}
      <video
        ref={video}
        className={cx(s.remoteImg, !live && s.remoteHidden)}
        style={{ cursor }}
        autoPlay
        muted
        playsInline
        disablePictureInPicture
        onLoadedData={() => setVideoReady(true)}
        aria-label={t('Lo que se ve en el navegador del equipo servidor')}
        {...(live ? pointer : {})}
      />
      {!live && image && (
        <img ref={img} className={s.remoteImg} style={{ cursor }} src={image} alt={t('Lo que se ve en el navegador del equipo servidor')} draggable={false} {...pointer} />
      )}
      {nothing && (
        <div className={s.remoteWait}>{failed ? t('No llega la imagen del navegador: la ventana de kywai debe estar abierta en el equipo servidor.') : t('Cargando el navegador del equipo servidor…')}</div>
      )}
      {ripples.map((r) => (
        <span key={r.id} className={cx(s.ripple, r.right && s.rippleRight)} style={{ left: r.x, top: r.y }} aria-hidden="true" />
      ))}
      <p className={s.remoteNote}>
        {live ? t('En directo desde el equipo servidor: úsalo como una web normal.') : t('Lo ves desde otro dispositivo: el navegador está en el equipo servidor. Haz clic en la imagen y escribe como en una web.')}
      </p>
    </div>
  )
}
