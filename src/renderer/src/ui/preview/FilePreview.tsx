import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  CodeXml,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FlaskConical,
  LoaderCircle,
  Maximize2,
  Minimize2,
  RotateCcw,
  X
} from 'lucide-react'
import { useCowork, useData } from '@/store/cowork'
import { api, isWeb } from '@/lib/api'
import { fileSize } from '@/lib/format'
import { projectFileUrl } from '@/lib/localRefs'
import { hasSourceView, isTextual, previewKind, typeLabel, type PreviewItem, type PreviewKind } from '@/lib/preview'
import { useAgentLookup } from '../common/agents'
import { useEscape } from '../common/hooks'
import { ARTIFACT_KIND_LABEL, FileTypeIcon } from '../common/icons'
import { MarkdownView } from '../common/MarkdownView'
import { agentVars, cx, errorText, shortTime } from '../common/util'
import u from '../common/ui.module.css'
import s from './FilePreview.module.css'
import { t } from '@/lib/i18n'
import { useExitGhost } from '../common/motion'
import { ViewerBusy } from './viewers/shared'

// Los visores de documentos pesan (docx-preview, SheetJS…): se cargan la primera vez que hacen falta.
const DocxView = lazy(() => import('./viewers/DocxView'))
const SheetView = lazy(() => import('./viewers/SheetView'))
const SlidesView = lazy(() => import('./viewers/SlidesView'))
const RichDocView = lazy(() => import('./viewers/RichDocView'))
const ModelView = lazy(() => import('./viewers/ModelView'))
const OfficePdfView = lazy(() => import('./viewers/OfficePdfView'))
const ArchiveView = lazy(() => import('./viewers/MoreViews').then((m) => ({ default: m.ArchiveView })))
const FontView = lazy(() => import('./viewers/MoreViews').then((m) => ({ default: m.FontView })))
const NotebookView = lazy(() => import('./viewers/MoreViews').then((m) => ({ default: m.NotebookView })))

/**
 * Panel de vista previa de archivos, como el de Claude: se abre a la derecha del chat (en el sitio del espacio 3D) al
 * pulsar un archivo del chat, un adjunto o un entregable. «Ampliar» lo pone a toda la ventana; en ventanas estrechas
 * ocupa toda la zona del chat.
 */
export function FilePreview() {
  const preview = useCowork((st) => st.preview)
  const maximized = useCowork((st) => st.previewMaximized)
  const item = preview?.items[preview.index]
  if (!preview || !item) return null
  const panel = <PreviewPanel key={`${item.projectId}/${item.relPath}`} item={item} index={preview.index} count={preview.items.length} maximized={maximized} />
  return maximized ? createPortal(<div className={s.maxBackdrop}>{panel}</div>, document.body) : panel
}

/** Para notar que solo se cambia de archivo (el panel se vuelve a montar con otro): cuándo se fue el anterior y su
    posición en la lista. */
const lastPanel = { goneAt: 0, index: 0 }

type Loaded =
  | { status: 'loading' }
  | { status: 'ready'; text?: string; url?: string }
  | { status: 'error'; message: string }

function PreviewPanel({ item, index, count, maximized }: { item: PreviewItem; index: number; count: number; maximized: boolean }) {
  const close = useCowork((st) => st.closePreview)
  const mode = useCowork((st) => st.mode)
  const artifact = useData((d) => (item.artifactId ? d.artifacts[item.artifactId] : undefined))
  const lookup = useAgentLookup()
  const look = item.agentId ? lookup(item.agentId) : null
  const demo = item.relPath.startsWith('demo:')
  // Los resultados de la demo no existen en disco: se enseña un documento de ejemplo.
  const kind: PreviewKind = demo ? 'markdown' : previewKind(item.name, item.mime)
  const live = !!api && mode === 'live' && !demo
  const [source, setSource] = useState(false)
  const [reload, setReload] = useState(0)
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const [copied, setCopied] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const rootRef = useRef<HTMLElement>(null)
  const titleId = `preview-title-${index}`

  useEscape(true, close)

  // Al cerrarse se va hacia la derecha mientras funde; si solo se cambia de archivo (o se amplía), no.
  useExitGhost(rootRef, { x: 32, scale: 0.98, skip: () => useCowork.getState().preview != null })
  // Cambiar de archivo con ‹ › no vuelve a hacer entrar el panel entero: solo el contenido, desde el lado al que vas.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (el && performance.now() - lastPanel.goneAt < 120) {
      el.dataset.switched = ''
      el.style.setProperty('--switch-dir', String(Math.sign(index - lastPanel.index) || 1))
    }
    return () => {
      lastPanel.goneAt = performance.now()
      lastPanel.index = index
    }
  }, [index])

  // Al abrir, el foco va al panel (sin mover el chat); al cerrarlo vuelve a donde estaba.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    rootRef.current?.focus({ preventScroll: true })
    return () => {
      if (prev && document.contains(prev) && !rootRef.current?.contains(prev)) prev.focus({ preventScroll: true })
    }
  }, [])

  // Lo que hace falta leer: el texto si se muestra como texto (o su código), la dirección para lo demás.
  // Un CSV se lee como texto también para la tabla (así pasa por el tapado de secretos).
  const wantsText = isTextual(kind) && (source || !hasSourceView(kind)) || kind === 'markdown' || kind === 'table' || kind === 'notebook' || kind === 'other'
  useEffect(() => {
    if (demo) {
      const kindLabel = artifact ? ARTIFACT_KIND_LABEL[artifact.kind].toLowerCase() : typeLabel(item.name).toLowerCase()
      setLoaded({ status: 'ready', text: demoMarkdown(item, look?.name ?? 'kywai', kindLabel, artifact?.kind === 'code') })
      return
    }
    if (!wantsText) {
      setLoaded({ status: 'ready', url: projectFileUrl(item.projectId, item.relPath, isWeb) })
      return
    }
    const a = api
    if (!a) {
      setLoaded({ status: 'error', message: t('Sin motor de agentes: no se puede leer el archivo.') })
      return
    }
    let alive = true
    setLoaded({ status: 'loading' })
    a.readArtifact(item.projectId, item.relPath, hasSourceView(kind) ? { text: true } : undefined).then(
      (r) => {
        if (alive) setLoaded({ status: 'ready', text: r.text, url: r.text == null ? r.url : undefined })
      },
      (e) => {
        if (alive) setLoaded({ status: 'error', message: errorText(e) })
      }
    )
    return () => {
      alive = false
    }
  }, [item.projectId, item.relPath, wantsText, demo, reload])

  const go = useCallback(
    (delta: number) => {
      const st = useCowork.getState()
      const p = st.preview
      if (!p || p.items.length < 2) return
      st.openPreview(p.items, (p.index + delta + p.items.length) % p.items.length)
    },
    []
  )

  function onKeyDown(e: KeyboardEvent<HTMLElement>): void {
    if (count < 2 || e.altKey || e.ctrlKey || e.metaKey) return
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'VIDEO' || tag === 'AUDIO') return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(1)
    }
  }

  const canCopy = isTextual(kind) || kind === 'image' || (kind === 'other' && loaded.status === 'ready' && loaded.text != null)
  async function copy(): Promise<void> {
    setActionError(null)
    try {
      if (kind === 'image') await copyImage(projectFileUrl(item.projectId, item.relPath, isWeb))
      else {
        const text = loaded.status === 'ready' && loaded.text != null ? loaded.text : (await api!.readArtifact(item.projectId, item.relPath, { text: true })).text ?? ''
        await navigator.clipboard.writeText(text)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch (e) {
      setActionError(t('No se pudo copiar: {error}', { error: errorText(e) }))
    }
  }

  async function download(): Promise<void> {
    setActionError(null)
    try {
      if (api?.downloadFile) await api.downloadFile(item.projectId, item.relPath)
      else if (item.artifactId && api) await api.downloadArtifacts(item.projectId, [item.artifactId])
    } catch (e) {
      setActionError(errorText(e))
    }
  }

  function openOutside(): void {
    setActionError(null)
    api?.openPath(item.projectId, item.relPath).catch((e) => setActionError(errorText(e)))
  }

  const label = typeLabel(item.name)
  const size = item.size ?? artifact?.size
  const showToggle = hasSourceView(kind) && !demo

  return (
    <aside
      ref={rootRef}
      className={cx(s.panel, maximized && s.maximized)}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <header className={s.head}>
        {showToggle ? (
          <div className={s.toggle} role="group" aria-label={t('Cómo verlo')}>
            <button type="button" className={cx(s.toggleBtn, !source && s.toggleOn)} aria-pressed={!source} title={t('Vista previa')} aria-label={t('Vista previa')} onClick={() => setSource(false)}>
              <Eye size={16} aria-hidden="true" />
            </button>
            <button type="button" className={cx(s.toggleBtn, source && s.toggleOn)} aria-pressed={source} title={t('Código')} aria-label={t('Código')} onClick={() => setSource(true)}>
              <CodeXml size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <span className={s.fileIcon} aria-hidden="true">
            <FileTypeIcon name={item.name} mime={item.mime} size={16} />
          </span>
        )}
        <h2 className={s.title} id={titleId} title={item.relPath}>
          <span className={s.titleName}>{item.name}</span>
          {label && <span className={s.titleType}> · {label}</span>}
        </h2>
        <div className={s.actions}>
          {canCopy && (live || demo) && (
            <button type="button" className={cx(u.btn, u.btnSm, s.copyBtn)} onClick={() => void copy()} title={kind === 'image' ? t('Copiar la imagen') : t('Copiar el contenido')}>
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              <span>{copied ? t('Copiado') : t('Copiar')}</span>
            </button>
          )}
          {live && (
            <button type="button" className={u.iconBtn} onClick={() => void download()} title={t('Descargar')} aria-label={t('Descargar {name}', { name: item.name })}>
              <Download size={16} aria-hidden="true" />
            </button>
          )}
          {live && (
            <button type="button" className={u.iconBtn} onClick={openOutside} title={t('Abrir con la aplicación del equipo')} aria-label={t('Abrir {name} con otra aplicación', { name: item.name })}>
              <ExternalLink size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={u.iconBtn}
            onClick={() => useCowork.setState({ previewMaximized: !maximized })}
            title={maximized ? t('Reducir') : t('Ampliar')}
            aria-label={maximized ? t('Reducir') : t('Ampliar')}
          >
            {maximized ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          </button>
          <button type="button" className={u.iconBtn} onClick={close} title={t('Cerrar (Esc)')} aria-label={t('Cerrar la vista previa')}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {(count > 1 || look || size || demo) && (
        <div className={s.sub}>
          {count > 1 && (
            <span className={s.pager}>
              <button type="button" className={s.pageBtn} onClick={() => go(-1)} aria-label={t('Archivo anterior')} title={t('Archivo anterior (←)')}>
                <ChevronLeft size={15} aria-hidden="true" />
              </button>
              <span>{t('{n} de {total}', { n: index + 1, total: count })}</span>
              <button type="button" className={s.pageBtn} onClick={() => go(1)} aria-label={t('Archivo siguiente')} title={t('Archivo siguiente (→)')}>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </span>
          )}
          {look && (
            <span className={s.agent}>
              <span className={s.agentDot} style={agentVars(look.color)} aria-hidden="true" />
              {t('Creado por')} {look.name}
            </span>
          )}
          {artifact && <span>{ARTIFACT_KIND_LABEL[artifact.kind]}</span>}
          {!!size && !demo && <span>{fileSize(size)}</span>}
          {item.createdAt && <span>{shortTime(item.createdAt)}</span>}
          {demo && (
            <span className={s.demoBadge}>
              <FlaskConical size={12} aria-hidden="true" />
              {t('Contenido de demostración')}
            </span>
          )}
        </div>
      )}
      {actionError && (
        <p className={s.actionError} role="alert">
          {actionError}
        </p>
      )}

      <div className={s.body}>
        {loaded.status === 'loading' ? (
          <div className={s.state} role="status">
            <LoaderCircle size={22} className={u.spin} aria-hidden="true" />
            <span>{t('Cargando contenido…')}</span>
          </div>
        ) : loaded.status === 'error' ? (
          <div className={cx(s.state, s.stateError)} role="alert">
            <AlertCircle size={22} aria-hidden="true" />
            <span className={s.stateTitle}>{t('No se pudo abrir el archivo')}</span>
            <span className={s.stateText}>{loaded.message}</span>
            {!!api && (
              <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setReload((n) => n + 1)}>
                <RotateCcw size={13} aria-hidden="true" />
                {t('Reintentar')}
              </button>
            )}
          </div>
        ) : (
          <PreviewContent item={item} kind={kind} source={source} text={loaded.text} url={loaded.url} onOpenOutside={live ? openOutside : undefined} />
        )}
      </div>
    </aside>
  )
}

function PreviewContent({
  item,
  kind,
  source,
  text,
  url,
  onOpenOutside
}: {
  item: PreviewItem
  kind: PreviewKind
  source: boolean
  text?: string
  url?: string
  onOpenOutside?: () => void
}) {
  const title = t('Vista previa de {name}', { name: item.name })
  if (text != null && (source || kind === 'code' || kind === 'text' || kind === 'other')) return <CodeView text={text} />
  switch (kind) {
    case 'markdown':
      if (text != null) {
        return (
          <div className={s.doc}>
            <MarkdownView text={text} className={s.docInner} />
          </div>
        )
      }
      break
    case 'html':
      if (url) return <iframe className={s.frame} sandbox="allow-scripts" src={url} title={title} />
      break
    case 'image':
    case 'svg':
      if (url) return <ZoomableImage src={url} alt={item.name} />
      break
    case 'pdf':
      if (url) return <iframe className={s.frame} src={url} title={title} />
      break
    case 'video':
      if (url) {
        return (
          <div className={s.media}>
            <video className={s.video} src={url} controls preload="metadata" aria-label={title} />
          </div>
        )
      }
      break
    case 'word':
      if (url) return <Viewer><DocxView url={url} /></Viewer>
      break
    case 'sheet':
      if (url) return <Viewer><SheetView url={url} /></Viewer>
      break
    case 'slides':
      if (url) return <Viewer><SlidesView url={url} /></Viewer>
      break
    case 'odf':
    case 'rtf':
    case 'epub':
    case 'iwork':
      if (url) return <Viewer><RichDocView url={url} format={kind} /></Viewer>
      break
    case 'office':
      return <Viewer><OfficePdfView item={item} /></Viewer>
    case 'model':
      if (url) return <Viewer><ModelView url={url} name={item.name} /></Viewer>
      break
    case 'archive':
      if (url) return <Viewer><ArchiveView url={url} /></Viewer>
      break
    case 'font':
      if (url) return <Viewer><FontView url={url} name={item.name} /></Viewer>
      break
    case 'notebook':
      if (text != null) return <Viewer><NotebookView text={text} /></Viewer>
      break
    case 'table':
      if (text != null) return <Viewer><SheetView text={text} /></Viewer>
      break
    case 'audio':
      if (url) {
        return (
          <div className={s.media}>
            <FileTypeIcon name={item.name} size={40} />
            <audio className={s.audio} src={url} controls preload="metadata" aria-label={title} />
          </div>
        )
      }
      break
  }
  return (
    <div className={s.state}>
      <FileTypeIcon name={item.name} mime={item.mime} size={34} />
      <span className={s.stateTitle}>{t('Vista previa no disponible')}</span>
      <span className={s.stateText}>{t('Este tipo de archivo no se puede mostrar aquí. Ábrelo con la aplicación del equipo o descárgalo.')}</span>
      {onOpenOutside && (
        <button type="button" className={cx(u.btn, u.btnSm)} onClick={onOpenOutside}>
          <ExternalLink size={13} aria-hidden="true" />
          {t('Abrir con…')}
        </button>
      )}
    </div>
  )
}

/** Un visor que se carga aparte: mientras llega, el mismo «Preparando…» que mientras lee el archivo. */
function Viewer({ children }: { children: ReactNode }) {
  return <Suspense fallback={<ViewerBusy />}>{children}</Suspense>
}

/** Código o texto con números de línea. */
function CodeView({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return (
    <div className={s.code}>
      <pre className={s.pre} style={{ ['--gutter' as string]: `${String(lines.length).length + 1}ch` }}>
        <code>
          {lines.map((line, i) => (
            <span key={i} className={s.line}>
              {line || ' '}
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

/** Imagen ajustada al panel; al pulsarla se ve a tamaño real (y se recorre con el ratón). */
function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(false)
  return (
    <div className={cx(s.imageWrap, zoom && s.imageZoomed)}>
      <img
        src={src}
        alt={alt}
        className={s.image}
        onClick={() => setZoom((z) => !z)}
        title={zoom ? t('Ajustar al panel') : t('Ver a tamaño real')}
      />
    </div>
  )
}

/** Copia una imagen al portapapeles (como PNG, el único formato que aceptan todos los navegadores). */
async function copyImage(url: string): Promise<void> {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  let blob = await res.blob()
  if (blob.type !== 'image/png') {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
    blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('PNG'))), 'image/png'))
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

/** Documento de ejemplo para resultados de la demo (no existen en disco). */
function demoMarkdown(a: PreviewItem, agentName: string, kind: string, isCode: boolean): string {
  const base = a.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || t('Resultado')
  const title = base.charAt(0).toUpperCase() + base.slice(1)
  const code = isCode
    ? `\n## ${t('Fragmento')}\n\n\`\`\`ts\n// ${a.name}\nexport function ordenarPorFecha(fotos: Foto[]): Foto[] {\n  return [...fotos].sort((x, y) => x.fecha - y.fecha)\n}\n\`\`\`\n`
    : ''
  return t('# {title}\n\n> Contenido de demostración: este {kind} lo ha "creado" **{agentName}** en una simulación. Ningún agente real ha generado este archivo.\n\n## Resumen\n\nEl equipo dividió el encargo en tareas, cada agente trabajó en su especialidad y los resultados se reunieron en el núcleo del proyecto.\n\n## Qué incluye\n\n- Estructura propuesta y decisiones principales\n- Notas de revisión entre agentes\n- Próximos pasos sugeridos\n{code}\n## Estado\n\n| Parte | Responsable | Estado |\n| --- | --- | --- |\n| Análisis | Gemini | Completado |\n| Organización | Qwen | Completado |\n| Diseño | Claude | Completado |\n| Implementación | Codex | Completado |\n\n## Próximos pasos\n\n- [x] Revisar el borrador\n- [ ] Ajustar textos y colores\n- [ ] Publicar la primera versión\n', { title, kind, agentName, code })
}
