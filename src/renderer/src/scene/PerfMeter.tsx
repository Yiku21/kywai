import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { locale, t } from '@/lib/i18n'
import { useQuality } from './quality'
import { FrameWindow, useMeter } from './perfStats'
import s from './PerfMeter.module.css'

/**
 * Dentro del lienzo: mide cada fotograma (del primer useFrame al final del dibujo) y publica una vez por segundo.
 * El final se toma en una microtarea: se ejecuta justo al acabar el fotograma de react-three-fiber, dibujo incluido,
 * sin añadir un useFrame de prioridad alta (eso apagaría el dibujo automático cuando no hay efectos).
 */
export function PerfProbe() {
  const gl = useThree((st) => st.gl)
  const win = useRef(new FrameWindow())
  useEffect(() => {
    const info = gl.info
    info.autoReset = false
    // Tarjeta gráfica, si el navegador lo dice.
    try {
      const ctx = gl.getContext()
      const ext = ctx.getExtension('WEBGL_debug_renderer_info')
      const name = ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null
      useMeter.setState({ gpu: name })
    } catch {
      /* sin nombre */
    }
    // Tareas largas de toda la app (React, red, música…), no solo del 3D.
    let blocked = 0
    let observer: PerformanceObserver | null = null
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) blocked += e.duration
      })
      observer.observe({ type: 'longtask', buffered: false })
    } catch {
      observer = null
    }
    let since = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const elapsed = now - since
      since = now
      const canvas = gl.domElement
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      useMeter.setState({
        stats: {
          ...win.current.take(elapsed),
          width: canvas.width,
          height: canvas.height,
          dpr: gl.getPixelRatio(),
          busyPct: observer ? Math.min(100, Math.round((blocked / elapsed) * 100)) : 0,
          heapMb: mem ? Math.round(mem.usedJSHeapSize / 1e6) : null
        }
      })
      blocked = 0
    }, 1000)
    return () => {
      window.clearInterval(id)
      observer?.disconnect()
      info.autoReset = true
    }
  }, [gl])
  useFrame(() => {
    const start = performance.now()
    gl.info.reset()
    queueMicrotask(() => {
      win.current.add(performance.now() - start, gl.info.render.calls, gl.info.render.triangles)
    })
  }, -1000)
  return null
}

const QUALITY_NAMES = { low: 'Ahorro', medium: 'Normal', high: 'Máxima' } as const

function num(n: number, digits = 0): string {
  return n.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

/** Fuera del lienzo: el recuadro con las cifras, arriba a la derecha. No recibe clics. */
export function PerfOverlay() {
  const on = useMeter((m) => m.on)
  const st = useMeter((m) => m.stats)
  const target = useMeter((m) => m.target)
  const resting = useMeter((m) => m.resting)
  const paused = useMeter((m) => m.paused)
  const gpu = useMeter((m) => m.gpu)
  const level = useQuality((q) => q.level)
  const choice = useQuality((q) => q.choice)
  if (!on) return null
  const tris = st ? (st.triangles >= 1e6 ? `${num(st.triangles / 1e6, 1)} M` : `${num(st.triangles / 1e3)} k`) : '–'
  return (
    <div className={s.meter} role="status" aria-label={t('Medidor de rendimiento')}>
      <div className={s.title}>{t('Rendimiento')}</div>
      {paused ? (
        <div>{t('3D en pausa: no gasta nada')}</div>
      ) : (
        <>
          <div>
            <b>{st ? st.fps : '–'} fps</b> · {t('tope {n}', { n: target })}
            {resting ? ` · ${t('en reposo')}` : ''}
          </div>
          <div>{t('Fotograma: {ms} ms (máx {max})', { ms: st ? num(st.frameMs, 1) : '–', max: st ? num(st.frameMaxMs, 1) : '–' })}</div>
          <div>{t('Dibujos: {calls} · triángulos: {tris}', { calls: st ? num(st.calls) : '–', tris })}</div>
          <div>
            {t('Calidad: {name}', { name: t(QUALITY_NAMES[level]) })}
            {choice === 'auto' ? ` (${t('Automática')})` : ''}
          </div>
          {st && <div>{t('Resolución: {w}×{h} (×{dpr})', { w: st.width, h: st.height, dpr: num(st.dpr, 2) })}</div>}
        </>
      )}
      {st && <div>{t('Hilo principal bloqueado: {pct} %', { pct: st.busyPct })}</div>}
      {st?.heapMb != null && <div>{t('Memoria JS: {mb} MB', { mb: st.heapMb })}</div>}
      {gpu && <div className={s.gpu}>{gpu}</div>}
    </div>
  )
}
