import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent } from 'react'
import { AlertCircle, ArrowRight, Brain, CalendarClock, Gauge, ImagePlus, Info, LoaderCircle, Mic, Paperclip, Square, X } from 'lucide-react'
import type { CoworkApi, HttpsLink, MemoryInput, MemoryKind } from '@shared/types'
import { useCowork } from '@/store/cowork'
import { describeQuota } from '../quota/quotaView'
import { menuKeyNav, Popover } from '../common/Popover'
import { ClaudeDirectFix } from '../quota/ClaudeDirectFix'
import { api, isWeb } from '@/lib/api'
import { canRecord, startRecording, type Recording } from '@/lib/recorder'
import { demoEngine } from '@/demo/engine'
import { FileTypeIcon } from '../common/icons'
import { basename, cx, errorText } from '../common/util'
import { useComposer } from './composerStore'
import { describeTrigger, describeWhen, parseRoutineCommand } from '@shared/routines'
import u from '../common/ui.module.css'
import s from './Composer.module.css'

const LINE = 20
const PAD_Y = 20
const MAX_HEIGHT = LINE * 6 + PAD_Y
/** Las notas de voz se cortan solas a los 5 minutos. */
const MAX_RECORDING_MS = 5 * 60_000
/** Órdenes para empezar una conversación nueva en el proyecto. */
const CLEAR_COMMAND = /^\/(new|nuevo|clear|limpiar)(\s+(chat|conversaci[oó]n))?$/i
/** Órdenes para ver las cuotas (como «/usage» de Claude Code): se consultan aquí, no van a los agentes. */
const QUOTA_COMMAND = /^\/(usage|uso|cuotas?|quotas?|limits?)$/i
/** «/model»: ver y cambiar el modelo de Hermes (el coordinador), como `hermes model` en la terminal. */
const MODEL_COMMAND = /^\/(model|models|modelo|modelos)$/i
/** «/recuerda texto»: va a la memoria del proyecto (confirmado), no a los agentes. Admite «decisión: …», «pendiente: …»… */
const REMEMBER_COMMAND = /^\/(recuerda|recordar|memoria|remember)\s+([\s\S]+)$/i
/** «/rutina cada día a las 9:00: …»: crea una rutina del proyecto (no va a los agentes). Sola, abre la pestaña Rutinas. */
const ROUTINE_COMMAND = /^\/(rutina|rutinas|routine)\b/i

function memoryInput(raw: string): MemoryInput {
  const m = /^(decisi[oó]n|hecho|dato|preferencia|pendiente)\s*:\s*([\s\S]+)$/i.exec(raw.trim())
  if (!m) return { kind: 'fact', text: raw.trim() }
  const w = m[1].toLowerCase()
  const kind: MemoryKind = w.startsWith('decisi') ? 'decision' : w.startsWith('pref') ? 'preference' : w === 'pendiente' ? 'pending' : 'fact'
  return { kind, text: m[2].trim() }
}

function micError(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Sin permiso para el micrófono (actívalo en los ajustes de privacidad del sistema)'
  if (name === 'NotFoundError') return 'No se encontró ningún micrófono'
  return errorText(e)
}

/** Vuelve a consultar las cuotas y las resume, una línea por cuota («Claude: 81% de cuota restante…»). */
async function quotaSummary(a: CoworkApi): Promise<{ lines: string[]; fix: boolean }> {
  await a.refreshQuotas()
  // El dato nuevo llega como evento; desde el navegador puede tardar un instante más que la respuesta.
  await new Promise((r) => setTimeout(r, 400))
  const st = useCowork.getState()
  const lines = st.live.quotas
    .filter((q) => !q.unlimited)
    .map((q) => {
      const v = describeQuota(q, st.config.thresholds, undefined)
      if (v.pct != null) return q.period ? `${v.sentence} (${q.period.toLowerCase()})` : v.sentence
      // Sin dato: se explica por qué (p. ej. qué le pasa a Claude Code en este equipo).
      return q.note ? `${v.sentence}. ${q.note}` : v.sentence
    })
  return {
    lines: lines.length ? [...lines, 'Arriba, en «Cuota restante», se actualizan solas.'] : ['No hay cuotas que mostrar.'],
    fix: st.live.quotas.some((q) => q.fix === 'claude-direct')
  }
}

const clock = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

/** Compositor del chat: adjuntos, texto autoajustable y envío. */
export function Composer() {
  const text = useComposer((c) => c.text)
  const files = useComposer((c) => c.files)
  const focusNonce = useComposer((c) => c.focusNonce)
  const setText = useComposer((c) => c.setText)
  const addFiles = useComposer((c) => c.addFiles)
  const removeFile = useComposer((c) => c.removeFile)
  const mode = useCowork((st) => st.mode)
  const project = useCowork((st) => st.live.project)
  const activeRunIds = useCowork((st) => st.live.activeRunIds)
  // Con un plan esperando tu visto bueno, lo que escribas son cambios a ese plan (o «sí» para aprobarlo).
  const planPending = useCowork((st) => st.mode === 'live' && st.live.messages.some((m) => m.proposal?.status === 'pending'))
  const [sending, setSending] = useState(false)
  const [stopping, setStopping] = useState(false)
  // Varias peticiones en marcha: menú para elegir cuál detener.
  const [stopOpen, setStopOpen] = useState(false)
  const stopRef = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  // Dictado: grabación en curso y transcripción.
  const [rec, setRec] = useState<{ r: Recording; started: number } | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const micRef = useRef<HTMLButtonElement>(null)
  // Desde el móvil por http:// el navegador no deja grabar: se ofrece el enlace a la versión HTTPS.
  const [httpsLink, setHttpsLink] = useState<HttpsLink | null>(null)
  /** Resultado de «/usage»: las cuotas, en una línea bajo el cuadro. */
  const [quotaNotice, setQuotaNotice] = useState<{ lines: string[]; fix: boolean; memory?: boolean; routine?: boolean } | null>(null)

  const isDemo = mode === 'demo'
  // Solo sin motor (vista en navegador) el envío reproduce la demo. Con motor, un mensaje
  // siempre va al equipo real: se sale de la demo y se envía.
  const simulate = isDemo && !api
  const blockedReason = simulate
    ? null
    : !api
      ? 'Sin motor de agentes: abre la app de escritorio'
      : !project
        ? 'Abre o crea un proyecto en la cabecera para enviar tareas'
        : null
  const canAttach = !!api
  const attachTitle = simulate
    ? 'Adjuntar archivos está disponible en modo real'
    : !api
      ? 'Sin motor de agentes: abre la app de escritorio'
      : undefined
  const canSend = text.trim().length > 0 && !sending && !blockedReason && !rec && !transcribing
  const needsHttps = isWeb && !canRecord && !window.isSecureContext
  const canDictate = !!api && !simulate && (canRecord || needsHttps)
  const micTitle =
    !api || simulate
      ? 'El dictado está disponible en modo real'
      : needsHttps
        ? 'El micrófono necesita la versión HTTPS de AI Cowork'
        : !canRecord
          ? 'Este navegador no permite grabar audio'
          : rec
          ? 'Terminar la nota de voz'
          : 'Dictar una nota de voz'
  const showStop = !isDemo && !!api && activeRunIds.length > 0

  // Altura automática (máx. ~6 líneas).
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const h = Math.min(ta.scrollHeight, MAX_HEIGHT)
    ta.style.height = `${h}px`
    ta.style.overflowY = ta.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [text])

  useEffect(() => {
    if (focusNonce === 0) return
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    const end = ta.value.length
    ta.setSelectionRange(end, end)
  }, [focusNonce])

  // Al terminar (o detenerse) alguna petición, el botón vuelve a estar disponible para las demás.
  useEffect(() => {
    setStopping(false)
    if (activeRunIds.length < 2) setStopOpen(false)
  }, [activeRunIds.length])

  async function send(): Promise<void> {
    const t = text.trim()
    if (!t || sending || blockedReason) return
    setError(null)
    if (simulate) {
      try {
        demoEngine.start({ prompt: t })
        useComposer.getState().clear()
      } catch (e) {
        setError(errorText(e))
      }
      return
    }
    const a = api
    if (!a || !project) return
    if (isDemo) useCowork.getState().setMode('live')
    setSending(true)
    setQuotaNotice(null)
    try {
      // «/new», «/limpiar»…: conversación nueva (lo mismo que ⋮ → Limpiar el chat), no un mensaje para los agentes.
      const remember = REMEMBER_COMMAND.exec(t)
      if (CLEAR_COMMAND.test(t)) await a.clearChat(project.id)
      else if (MODEL_COMMAND.test(t)) useCowork.setState({ hermesModelOpen: true })
      else if (QUOTA_COMMAND.test(t)) setQuotaNotice(await quotaSummary(a))
      else if (ROUTINE_COMMAND.test(t)) {
        // Sin nada más: se abre la pestaña. Con horario y petición: se crea la rutina (activa).
        if (/^\/\w+\s*$/.test(t)) useCowork.getState().setLeftTab('routines')
        else {
          const cmd = parseRoutineCommand(t)
          if ('error' in cmd) {
            setQuotaNotice({ lines: [cmd.error], fix: false, routine: true })
            return
          }
          const r = await a.createRoutine(project.id, { ...cmd, enabled: true })
          const next = r.nextAt ?? null
          setQuotaNotice({
            lines: [`Rutina creada: «${r.name}» · ${describeTrigger(r.trigger)}${next ? ` (la próxima, ${describeWhen(next)})` : ''}. Está en la pestaña Rutinas.`],
            fix: false,
            routine: true
          })
        }
      }
      else if (remember) {
        const entry = await a.addMemory(project.id, memoryInput(remember[2]))
        setQuotaNotice({
          lines: [entry ? `Anotado en la memoria del proyecto (${entry.id}, confirmado): ${entry.text}` : 'Eso ya estaba en la memoria.'],
          fix: false,
          memory: true
        })
      }
      else await a.sendMessage({ projectId: project.id, text: t, filePaths: files })
      useComposer.getState().clear()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSending(false)
    }
  }

  /** Ctrl+V con imágenes o archivos: se guardan y se adjuntan. El texto se pega como siempre. */
  async function onPaste(e: ClipboardEvent<HTMLTextAreaElement>): Promise<void> {
    const a = api
    if (!a) return
    const pasted = Array.from(e.clipboardData.files)
    if (pasted.length === 0) return
    e.preventDefault()
    setError(null)
    const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '')
    for (const [i, f] of pasted.entries()) {
      try {
        const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^\w]/g, '') || 'png'
        const generic = !f.name || /^image\.\w+$/i.test(f.name)
        const name = generic ? `captura-${stamp}${pasted.length > 1 ? `-${i + 1}` : ''}.${ext}` : f.name
        const path = await a.savePastedFile(name, new Uint8Array(await f.arrayBuffer()))
        addFiles([path])
      } catch (err) {
        setError(errorText(err))
      }
    }
  }

  async function pick(kind: 'any' | 'image'): Promise<void> {
    const a = api
    if (!a || !canAttach) return
    try {
      const paths = await a.pickFiles(kind)
      if (paths.length) addFiles(paths)
      taRef.current?.focus()
    } catch (e) {
      setError(errorText(e))
    }
  }

  // Mientras se graba: contador, nivel de la voz en el botón y corte a los 5 minutos.
  useEffect(() => {
    if (!rec) return
    let raf = 0
    const loop = () => {
      micRef.current?.style.setProperty('--level', rec.r.level().toFixed(2))
      const ms = Date.now() - rec.started
      setElapsed(ms)
      if (ms >= MAX_RECORDING_MS) void finishRecording()
      else raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [rec]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleMic(): Promise<void> {
    if (rec) return finishRecording()
    const a = api
    if (!a || !canDictate || transcribing) return
    setError(null)
    if (needsHttps) {
      try {
        const link = await a.getHttpsLink(location.hostname)
        if (link) setHttpsLink(link)
        else setError('El navegador solo deja usar el micrófono con HTTPS y no se pudo preparar la versión segura. Revisa en el Mac: ⋮ → Acceso desde otros dispositivos')
      } catch (e) {
        setError(errorText(e))
      }
      return
    }
    try {
      if (!(await a.requestMicrophone())) throw new Error('Sin permiso para el micrófono (actívalo en los ajustes de privacidad del sistema)')
      setRec({ r: await startRecording(), started: Date.now() })
    } catch (e) {
      setError(micError(e))
    }
  }

  function cancelRecording(): void {
    rec?.r.cancel()
    setRec(null)
  }

  /** Termina la grabación, la convierte en texto en el equipo y la añade al cuadro para revisarla. */
  async function finishRecording(): Promise<void> {
    const a = api
    const cur = rec
    if (!a || !cur) return
    setRec(null)
    setTranscribing(true)
    try {
      const wav = await cur.r.stop()
      const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '')
      const path = await a.savePastedFile(`nota-de-voz-${stamp}.wav`, wav)
      const said = await a.transcribeAudio(path, 'es')
      if (said) {
        const prev = useComposer.getState().text.trimEnd()
        setText(prev ? `${prev} ${said}` : said)
      } else setError('No se entendió nada en la nota de voz')
      taRef.current?.focus()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setTranscribing(false)
    }
  }

  /** Detiene esas peticiones (todas si no se indica). */
  async function stopRuns(ids: string[]): Promise<void> {
    const a = api
    setStopOpen(false)
    if (!a || !ids.length || stopping) return
    setStopping(true)
    try {
      for (const id of ids) await a.cancelRun(id)
    } catch (e) {
      setError(errorText(e))
      setStopping(false)
    }
  }

  /** Con una petición en marcha se detiene directamente; con varias, se elige cuál (o todas). */
  function onStop(): void {
    if (activeRunIds.length > 1) setStopOpen((o) => !o)
    else void stopRuns(activeRunIds)
  }

  /** Texto corto de cada petición en marcha (su mensaje) para el menú de «Detener». */
  function runLabel(runId: string): string {
    const m = useCowork.getState().live.messages.find((x) => x.runId === runId && x.author.type === 'user')
    const text = (m?.text || 'Petición').replace(/\s+/g, ' ').trim()
    const ago = m ? Math.max(0, Math.round((Date.now() - m.createdAt) / 60_000)) : null
    return `${text.length > 48 ? `${text.slice(0, 47)}…` : text}${ago != null ? ` · hace ${ago} min` : ''}`
  }

  return (
    <div className={s.composer}>
      {files.length > 0 && (
        <ul className={s.pending} aria-label="Archivos para adjuntar">
          {files.map((p) => {
            const name = basename(p)
            return (
              <li key={p} className={s.chip} title={p}>
                <FileTypeIcon name={name} size={14} />
                <span className={s.chipName}>{name}</span>
                <button
                  type="button"
                  className={s.chipRemove}
                  onClick={() => removeFile(p)}
                  aria-label={`Quitar ${name}`}
                  title="Quitar"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className={s.row}>
        <div className={s.tools}>
          <button
            type="button"
            className={cx(u.iconBtn, s.tool)}
            onClick={() => pick('any')}
            disabled={!canAttach}
            aria-label="Adjuntar archivos"
            title={attachTitle ?? 'Adjuntar archivos'}
          >
            <Paperclip size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cx(u.iconBtn, s.tool, s.toolImage)}
            onClick={() => pick('image')}
            disabled={!canAttach}
            aria-label="Adjuntar imágenes"
            title={attachTitle ?? 'Adjuntar imágenes'}
          >
            <ImagePlus size={18} aria-hidden="true" />
          </button>
          <button
            ref={micRef}
            type="button"
            className={cx(u.iconBtn, s.tool, rec && s.micOn)}
            onClick={() => void toggleMic()}
            disabled={!canDictate || transcribing}
            aria-label={rec ? 'Terminar la nota de voz' : 'Dictar una nota de voz'}
            aria-pressed={!!rec}
            title={micTitle}
          >
            {transcribing ? (
              <LoaderCircle size={18} aria-hidden="true" className={u.spin} />
            ) : rec ? (
              <Square size={14} aria-hidden="true" fill="currentColor" />
            ) : (
              <Mic size={18} aria-hidden="true" />
            )}
          </button>
        </div>

        <div className={cx(s.inputWrap, !!blockedReason && s.inputBlocked)}>
          {rec && (
            <div className={s.recBar} role="status">
              <span className={s.recDot} aria-hidden="true" />
              <span className={s.recTime}>{clock(elapsed)}</span>
              <span className={s.recText}>Grabando… pulsa ■ para terminar</span>
              <button type="button" className={s.recCancel} onClick={cancelRecording} aria-label="Descartar la nota de voz" title="Descartar">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}
          <textarea
            ref={taRef}
            className={s.input}
            rows={1}
            value={text}
            placeholder={planPending ? 'Escribe qué cambiar del plan, o «sí» para aprobarlo…' : 'Escribe una tarea…'}
            aria-label="Escribe una tarea para el equipo"
            title={blockedReason ?? 'Intro para enviar · Mayús+Intro para nueva línea'}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => void onPaste(e)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void send()
              }
            }}
          />
          {showStop && (
            <button
              ref={stopRef}
              type="button"
              className={s.stop}
              onClick={onStop}
              disabled={stopping}
              aria-label={activeRunIds.length > 1 ? `Detener: ${activeRunIds.length} peticiones en marcha` : 'Detener el trabajo en curso'}
              title={activeRunIds.length > 1 ? 'Elegir qué petición detener' : 'Detener el trabajo en curso'}
              aria-haspopup={activeRunIds.length > 1 ? 'menu' : undefined}
              aria-expanded={activeRunIds.length > 1 ? stopOpen : undefined}
            >
              {stopping ? (
                <LoaderCircle size={13} aria-hidden="true" className={u.spin} />
              ) : (
                <Square size={11} aria-hidden="true" fill="currentColor" />
              )}
              <span>{stopping ? 'Deteniendo' : activeRunIds.length > 1 ? `Detener (${activeRunIds.length})` : 'Detener'}</span>
            </button>
          )}
          <Popover
            open={stopOpen && activeRunIds.length > 1}
            onClose={() => setStopOpen(false)}
            anchorRef={stopRef}
            align="end"
            role="menu"
            ariaLabel="Qué petición detener"
            className={s.stopMenu}
            initialFocus="first"
            onKeyDown={menuKeyNav}
          >
            <button type="button" role="menuitem" className={s.stopItem} onClick={() => void stopRuns(activeRunIds)}>
              <Square size={11} aria-hidden="true" fill="currentColor" />
              <span>Detener todo ({activeRunIds.length} peticiones)</span>
            </button>
            {[...activeRunIds].reverse().map((id) => (
              <button key={id} type="button" role="menuitem" className={s.stopItem} onClick={() => void stopRuns([id])}>
                <span className={s.stopDot} aria-hidden="true" />
                <span>Solo «{runLabel(id)}»</span>
              </button>
            ))}
          </Popover>
          <button
            type="button"
            className={s.send}
            onClick={() => void send()}
            disabled={!canSend}
            aria-label={simulate ? 'Enviar (simulación)' : isDemo ? 'Enviar al equipo real' : 'Enviar'}
            title={blockedReason ?? (simulate ? 'Enviar (simulación)' : isDemo ? 'Enviar al equipo real' : 'Enviar')}
          >
            {sending ? (
              <LoaderCircle size={17} aria-hidden="true" className={u.spin} />
            ) : (
              <ArrowRight size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {transcribing && !error && (
        <p className={s.hint} role="status">
          <LoaderCircle size={13} aria-hidden="true" className={u.spin} />
          <span>Transcribiendo la nota de voz en este equipo… (la primera vez prepara el dictado y tarda unos minutos)</span>
        </p>
      )}

      {quotaNotice && !error && (
        <div className={cx(s.hint, s.hintLines)} role="status">
          {quotaNotice.routine ? (
            <CalendarClock size={13} aria-hidden="true" />
          ) : quotaNotice.memory ? (
            <Brain size={13} aria-hidden="true" />
          ) : (
            <Gauge size={13} aria-hidden="true" />
          )}
          <div>
            {quotaNotice.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
            {quotaNotice.fix && <ClaudeDirectFix />}
          </div>
        </div>
      )}

      {httpsLink && !error && (
        <p className={s.hint} role="status">
          <Info size={13} aria-hidden="true" />
          <span>
            El navegador solo deja usar el micrófono en la versión segura (HTTPS).{' '}
            <a className={s.hintLink} href={httpsLink.url}>
              Abrir la versión segura
            </a>
            {httpsLink.selfSigned && (
              <>
                {' '}
                La primera vez avisará de que la conexión no es privada: es el certificado propio de AI Cowork en tu equipo. Pulsa
                «Configuración avanzada» → «Continuar» (en iPhone: «Mostrar detalles» → «visitar este sitio web»).
              </>
            )}
          </span>
        </p>
      )}

      {(error || isDemo || blockedReason) && (
        <p className={cx(s.hint, error ? s.hintError : isDemo ? s.hintDemo : undefined)} role={error ? 'alert' : undefined}>
          {error ? <AlertCircle size={13} aria-hidden="true" /> : <Info size={13} aria-hidden="true" />}
          <span>{error ?? (simulate ? 'Modo demo: las respuestas son simuladas' : isDemo ? 'Estás viendo la demo: al enviar volverás a los datos reales' : blockedReason)}</span>
        </p>
      )}
    </div>
  )
}
