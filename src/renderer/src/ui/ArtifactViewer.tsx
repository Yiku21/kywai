import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, FlaskConical, FolderOpen, LoaderCircle, RotateCcw, X } from 'lucide-react'
import type { Artifact } from '@shared/types'
import { useCowork, useData } from '@/store/cowork'
import { api } from '@/lib/api'
import { fileSize } from '@/lib/format'
import { useAgentLookup } from './common/agents'
import { useEscape } from './common/hooks'
import { ARTIFACT_KIND_LABEL, KindTile } from './common/icons'
import { MarkdownView } from './common/MarkdownView'
import { agentVars, cx, errorText, shortTime } from './common/util'
import u from './common/ui.module.css'
import s from './ArtifactViewer.module.css'
import { t } from '@/lib/i18n'

/** Visor modal de resultados. Se muestra cuando `viewerArtifactId` está definido. */
export function ArtifactViewer() {
  const id = useCowork((st) => st.viewerArtifactId)
  const artifact = useData((d) => (id ? d.artifacts[id] : undefined))
  if (!id || !artifact) return null
  return createPortal(<ViewerDialog key={artifact.id} artifact={artifact} />, document.body)
}

type Content =
  | { status: 'loading' }
  | { status: 'ready'; text?: string; url?: string }
  | { status: 'error'; message: string }

const FOCUSABLE = 'button:not([disabled]), [href], iframe, [tabindex]:not([tabindex="-1"])'

function ViewerDialog({ artifact }: { artifact: Artifact }) {
  const openViewer = useCowork((st) => st.openViewer)
  const mode = useCowork((st) => st.mode)
  const lookup = useAgentLookup()
  const look = lookup(artifact.agentId)
  const isDemo = artifact.relPath.startsWith('demo:')
  const [content, setContent] = useState<Content>(() =>
    isDemo ? { status: 'ready', text: demoMarkdown(artifact, look.name) } : { status: 'loading' }
  )
  const [reload, setReload] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = `viewer-title-${artifact.id}`

  const close = useCallback(() => openViewer(null), [openViewer])
  useEscape(true, close)

  // Foco: entra en el diálogo y vuelve a donde estaba al cerrar.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus({ preventScroll: true })
    return () => {
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    if (isDemo) return
    const a = api
    if (!a) {
      setContent({ status: 'error', message: t('Sin motor de agentes: no se puede leer el archivo.') })
      return
    }
    let alive = true
    setContent({ status: 'loading' })
    a.readArtifact(artifact.projectId, artifact.relPath).then(
      (r) => {
        if (alive) setContent({ status: 'ready', text: r.text, url: r.url })
      },
      (e) => {
        if (alive) setContent({ status: 'error', message: errorText(e) })
      }
    )
    return () => {
      alive = false
    }
  }, [artifact.projectId, artifact.relPath, isDemo, reload])

  const canOpenFolder = !isDemo && !!api && mode === 'live'

  function trapTab(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'Tab') return
    const root = dialogRef.current
    if (!root) return
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className={s.overlay}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        ref={dialogRef}
        className={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapTab}
      >
        <header className={s.head}>
          <KindTile kind={artifact.kind} size={40} />
          <div className={s.headInfo}>
            <h2 className={s.title} id={titleId} title={artifact.name}>
              {artifact.name}
            </h2>
            <p className={s.meta}>
              <span>{ARTIFACT_KIND_LABEL[artifact.kind]}</span>
              <span className={s.sep} aria-hidden="true">
                ·
              </span>
              <span className={s.agent}>
                <span className={s.agentDot} style={agentVars(look.color)} aria-hidden="true" />
                {t('Creado por')} {look.name}
              </span>
              {!isDemo && artifact.size > 0 && (
                <>
                  <span className={s.sep} aria-hidden="true">
                    ·
                  </span>
                  <span>{fileSize(artifact.size)}</span>
                </>
              )}
              <span className={s.sep} aria-hidden="true">
                ·
              </span>
              <span>{shortTime(artifact.createdAt)}</span>
            </p>
          </div>
          {isDemo && (
            <span className={s.demoBadge}>
              <FlaskConical size={13} aria-hidden="true" />
              {t('Contenido de demostración')}
            </span>
          )}
          <div className={s.headActions}>
            <button
              type="button"
              className={cx(u.btn, s.folderBtn)}
              disabled={!canOpenFolder}
              title={
                canOpenFolder
                  ? t('Mostrar el archivo en su carpeta')
                  : isDemo
                    ? t('Los archivos de demostración no existen en disco')
                    : t('Sin motor de agentes')
              }
              onClick={() => {
                if (api) api.openPath(artifact.projectId, artifact.relPath).catch(() => {})
              }}
            >
              <FolderOpen size={15} aria-hidden="true" />
              <span className={s.folderLabel}>{t('Abrir en carpeta')}</span>
            </button>
            <button
              ref={closeRef}
              type="button"
              className={u.iconBtn}
              onClick={close}
              aria-label={t('Cerrar visor')}
              title={t('Cerrar (Esc)')}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className={s.body}>
          {content.status === 'loading' ? (
            <div className={s.state} role="status">
              <LoaderCircle size={22} className={u.spin} aria-hidden="true" />
              <span>{t('Cargando contenido…')}</span>
            </div>
          ) : content.status === 'error' ? (
            <div className={cx(s.state, s.stateError)} role="alert">
              <AlertCircle size={22} aria-hidden="true" />
              <span className={s.stateTitle}>{t('No se pudo abrir el resultado')}</span>
              <span className={s.stateText}>{content.message}</span>
              {!!api && (
                <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setReload((n) => n + 1)}>
                  <RotateCcw size={13} aria-hidden="true" />
                  {t('Reintentar')}
                </button>
              )}
            </div>
          ) : (
            <ArtifactContent artifact={artifact} text={content.text} url={content.url} demo={isDemo} />
          )}
        </div>
      </div>
    </div>
  )
}

function ArtifactContent({ artifact, text, url, demo }: { artifact: Artifact; text?: string; url?: string; demo: boolean }) {
  const title = t('Vista previa de {name}', { name: artifact.name })
  if (demo && text != null) {
    return (
      <div className={s.doc}>
        <MarkdownView text={text} className={s.docInner} />
      </div>
    )
  }
  switch (artifact.kind) {
    case 'html':
      if (url) return <iframe className={s.frame} sandbox="allow-scripts" src={url} title={title} />
      if (text != null) return <iframe className={s.frame} sandbox="allow-scripts" srcDoc={text} title={title} />
      break
    case 'image': {
      const src = url ?? (text?.startsWith('data:') ? text : undefined)
      if (src) {
        return (
          <div className={s.imageWrap}>
            <img src={src} alt={artifact.name} className={s.image} />
          </div>
        )
      }
      break
    }
    case 'markdown':
      if (text != null) {
        return (
          <div className={s.doc}>
            <MarkdownView text={text} className={s.docInner} />
          </div>
        )
      }
      break
    default:
      if (text != null) {
        return (
          <pre className={s.pre}>
            <code>{text}</code>
          </pre>
        )
      }
  }
  if (url) return <iframe className={cx(s.frame, s.frameText)} sandbox="" src={url} title={title} />
  return (
    <div className={s.state}>
      <AlertCircle size={22} aria-hidden="true" />
      <span className={s.stateTitle}>{t('Vista previa no disponible')}</span>
      <span className={s.stateText}>{t('Usa «Abrir en carpeta» para verlo con otra aplicación.')}</span>
    </div>
  )
}

/** Documento de ejemplo para resultados de la demo (no existen en disco). */
function demoMarkdown(a: Artifact, agentName: string): string {
  const base = a.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || t('Resultado')
  const title = base.charAt(0).toUpperCase() + base.slice(1)
  const kind = ARTIFACT_KIND_LABEL[a.kind].toLowerCase()
  const code =
    a.kind === 'code'
      ? `\n## ${t('Fragmento')}\n\n\`\`\`ts\n// ${a.name}\nexport function ordenarPorFecha(fotos: Foto[]): Foto[] {\n  return [...fotos].sort((x, y) => x.fecha - y.fecha)\n}\n\`\`\`\n`
      : ''
  return t('# {title}\n\n> Contenido de demostración: este {kind} lo ha "creado" **{agentName}** en una simulación. Ningún agente real ha generado este archivo.\n\n## Resumen\n\nEl equipo dividió el encargo en tareas, cada agente trabajó en su especialidad y los resultados se reunieron en el núcleo del proyecto.\n\n## Qué incluye\n\n- Estructura propuesta y decisiones principales\n- Notas de revisión entre agentes\n- Próximos pasos sugeridos\n{code}\n## Estado\n\n| Parte | Responsable | Estado |\n| --- | --- | --- |\n| Análisis | Gemini | Completado |\n| Organización | Qwen | Completado |\n| Diseño | Claude | Completado |\n| Implementación | Codex | Completado |\n\n## Próximos pasos\n\n- [x] Revisar el borrador\n- [ ] Ajustar textos y colores\n- [ ] Publicar la primera versión\n', { title, kind, agentName, code })
}
