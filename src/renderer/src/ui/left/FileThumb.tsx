import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Play } from 'lucide-react'
import { isWeb } from '@/lib/api'
import { projectFileUrl } from '@/lib/localRefs'
import { previewKind } from '@/lib/preview'
import { cx } from '../common/util'
import s from './Views.module.css'

/** Se le puede sacar miniatura: fotos (también SVG) y vídeos. */
export function thumbKind(name: string, mime?: string): 'image' | 'video' | null {
  const k = previewKind(name, mime)
  if (k === 'image' || k === 'svg') return 'image'
  if (k === 'video') return 'video'
  return null
}

/**
 * La miniatura real de una foto o un vídeo del proyecto (el vídeo, con su primer fotograma y un ▶ encima; al pasar el
 * ratón se reproduce sin sonido). No carga nada hasta que se ve en pantalla. Si no es foto ni vídeo, si no se puede abrir
 * aquí (demo, sin motor) o si falla al cargar, enseña `fallback` (el icono de siempre).
 */
export function FileThumb({
  projectId,
  relPath,
  name,
  mime,
  enabled,
  fallback,
  className
}: {
  projectId: string
  relPath: string
  name: string
  mime?: string
  enabled: boolean
  fallback: ReactNode
  className?: string
}) {
  const kind = enabled && projectId ? thumbKind(name, mime) : null
  const ref = useRef<HTMLSpanElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [seen, setSeen] = useState(false)
  const [broken, setBroken] = useState(false)

  // Carga perezosa: con 40 vídeos en la lista, solo se piden los que están a la vista.
  useEffect(() => {
    if (!kind || seen) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [kind, seen])

  if (!kind || broken) return <>{fallback}</>
  const url = projectFileUrl(projectId, relPath, isWeb)

  const play = (): void => {
    const v = video.current
    if (!v) return
    v.play().catch(() => undefined)
  }
  // El fotograma de la miniatura: al 20 % (máx. 4 s). Al principio muchos vídeos aún están en negro o fundiendo.
  const cover = (): void => {
    const v = video.current
    if (!v || !Number.isFinite(v.duration)) return
    try {
      v.currentTime = Math.min(v.duration * 0.2, 4)
    } catch {
      /* aún sin cargar */
    }
  }
  const stop = (): void => {
    video.current?.pause()
    cover()
  }

  return (
    <span
      ref={ref}
      className={cx(s.thumbBox, className)}
      aria-hidden="true"
      onPointerEnter={kind === 'video' ? play : undefined}
      onPointerLeave={kind === 'video' ? stop : undefined}
    >
      {seen &&
        (kind === 'image' ? (
          <img src={url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />
        ) : (
          <video ref={video} src={url} muted playsInline loop preload="metadata" onLoadedMetadata={cover} onError={() => setBroken(true)} />
        ))}
      {kind === 'video' && (
        <span className={s.thumbPlay}>
          <Play size={12} fill="currentColor" />
        </span>
      )}
    </span>
  )
}
