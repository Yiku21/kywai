import { memo, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Check, Copy, Play } from 'lucide-react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCowork, useData } from '@/store/cowork'
import { clientBridge, isWeb } from '@/lib/api'
import { projectFileUrl, resolveLocalRef, serverUrlFor, type LocalRef } from '@/lib/localRefs'
import { fromArtifact, fromAttachment, nameOf, type PreviewItem } from '@/lib/preview'
import { t } from '@/lib/i18n'
import { copyText } from '@/lib/clipboard'
import { cx } from './util'
import { isKywaiCommand } from '@shared/chatCommands'
import { useComposer } from '../left/composerStore'
import s from './MarkdownView.module.css'

const plugins = [remarkGfm]

const table: Components['table'] = ({ node: _node, ...props }) => (
  <div className={s.tableWrap}>
    <table {...props} />
  </div>
)

/**
 * Bloque de código o de comandos con un botón de copiar en la esquina (como en Claude y ChatGPT): un clic copia el
 * texto tal cual, sin el formato. El botón queda fijo aunque el bloque se desplace de lado.
 */
function CodeBlock({ children }: { children?: ReactNode }) {
  const pre = useRef<HTMLPreElement>(null)
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const id = window.setTimeout(() => setState('idle'), 1600)
    return () => window.clearTimeout(id)
  }, [state])
  const label = state === 'copied' ? t('Copiado') : state === 'error' ? t('No se pudo copiar') : t('Copiar el código')
  return (
    <div className={s.codeBlock}>
      <pre ref={pre}>{children}</pre>
      <button
        type="button"
        className={cx(s.copyCode, state === 'copied' && s.copyCodeDone)}
        title={label}
        aria-label={label}
        onClick={() => {
          const text = (pre.current?.textContent ?? '').replace(/\n$/, '')
          copyText(text).then(
            () => setState('copied'),
            () => setState('error')
          )
        }}
      >
        {state === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {state !== 'idle' && <span>{label}</span>}
      </button>
    </div>
  )
}

const pre: Components['pre'] = ({ children }) => <CodeBlock>{children}</CodeBlock>

/** Abre un archivo del proyecto en el panel de vista previa (como en Claude), en vez de fuera de la app. */
function previewRef(ref: LocalRef | null, e: MouseEvent): boolean {
  if (!ref || ref.kind !== 'project' || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return false
  e.preventDefault()
  useCowork.getState().openPreview([{ projectId: ref.projectId, relPath: ref.rel, name: nameOf(ref.rel) }])
  return true
}

/** Un nombre de archivo escrito entre `comillas` («00_LEEME.md»): si es de este proyecto, se puede abrir pulsándolo. */
const FILE_NAME = /^[^\s`<>|"*?]{1,180}\.[a-z0-9]{1,8}$/i

function FileCode({ text, children }: { text: string; children: ReactNode }) {
  // Se eligen objetos del almacén tal cual (estables entre renders); la ficha del panel se arma después.
  const clean = text.replace(/\\/g, '/').replace(/^\.\//, '')
  const artifact = useData((d) => Object.values(d.artifacts).find((x) => x.relPath === clean || x.name === clean || x.relPath.endsWith(`/${clean}`)))
  const projectId = useData((d) => d.project?.id ?? null)
  const attachment = useData((d) => (artifact ? undefined : d.attachments.find((x) => x.name === clean || x.relPath === clean)))
  const match: PreviewItem | null = artifact ? fromArtifact(artifact) : attachment && projectId ? fromAttachment(attachment, projectId) : null
  if (!match) return <code>{children}</code>
  return (
    <code
      className={s.fileCode}
      role="link"
      tabIndex={0}
      title={t('Ver {name}', { name: match.name })}
      onClick={() => useCowork.getState().openPreview([match])}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          useCowork.getState().openPreview([match])
        }
      }}
    >
      {children}
    </code>
  )
}

/**
 * Una orden de kywai escrita entre `comillas` por un agente («`/video …`», como las que deja «/radar»): al pulsarla queda
 * escrita en el cuadro del chat, lista para enviar (o cambiarla antes). No se envía sola.
 */
function CommandCode({ text, children }: { text: string; children: ReactNode }) {
  const use = (): void => {
    const c = useComposer.getState()
    c.setText(text)
    c.requestFocus()
    useCowork.getState().setLeftTab('chat')
  }
  return (
    <code
      className={s.commandCode}
      role="button"
      tabIndex={0}
      title={t('Pulsa para dejarla en el cuadro del chat')}
      onClick={use}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          use()
        }
      }}
    >
      <Play size={11} aria-hidden="true" className={s.commandIcon} />
      {children}
    </code>
  )
}

const code: Components['code'] = ({ node: _node, children, className, ...props }) => {
  const text = typeof children === 'string' ? children : Array.isArray(children) && children.every((c) => typeof c === 'string') ? children.join('') : null
  if (!className && text && !text.includes('\n') && isKywaiCommand(text.trim())) return <CommandCode text={text.trim()}>{children}</CommandCode>
  if (!className && text && !text.includes('\n') && FILE_NAME.test(text.trim())) return <FileCode text={text.trim()}>{children}</FileCode>
  return (
    <code className={className} {...props}>
      {children}
    </code>
  )
}

/**
 * En la app de escritorio del servidor: las imágenes y enlaces con rutas del proyecto se leen de su carpeta; al
 * pulsarlos se abren en el panel de vista previa. Las direcciones web se abren en el navegador.
 */
function desktopComponents(projectId: string | null): Components {
  return {
    table,
    code,
    pre,
    img: ({ node: _node, src, alt, ...props }) => {
      const ref = typeof src === 'string' ? resolveLocalRef(src, projectId) : null
      if (ref?.kind !== 'project') return <img {...props} alt={alt ?? ''} src={src} loading="lazy" />
      return <img {...props} alt={alt ?? ''} src={projectFileUrl(ref.projectId, ref.rel, false)} loading="lazy" className={s.previewable} onClick={(e) => previewRef(ref, e)} />
    },
    a: ({ node: _node, href, onClick, ...props }) => {
      const ref = typeof href === 'string' ? resolveLocalRef(href, projectId) : null
      return (
        <a
          {...props}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => {
            onClick?.(e)
            previewRef(ref, e)
          }}
        />
      )
    }
  }
}

/**
 * En la interfaz web (cliente de escritorio o navegador) las rutas de archivos que escriben los agentes son del
 * servidor: las imágenes se piden a su API y los enlaces se abren desde allí (en el cliente, con tu aplicación).
 */
function webComponents(projectId: string | null): Components {
  return {
    table,
    code,
    pre,
    img: ({ node: _node, src, alt, ...props }) => {
      const ref = typeof src === 'string' ? resolveLocalRef(src, projectId) : null
      return (
        <img
          {...props}
          alt={alt ?? ''}
          src={ref ? serverUrlFor(ref) : src}
          loading="lazy"
          className={ref?.kind === 'project' ? s.previewable : undefined}
          onClick={(e) => previewRef(ref, e)}
        />
      )
    },
    a: ({ node: _node, href, onClick, ...props }) => {
      const ref = typeof href === 'string' ? resolveLocalRef(href, projectId) : null
      if (!ref) return <a {...props} href={href} target="_blank" rel="noreferrer noopener" />
      const url = serverUrlFor(ref)
      const bridge = clientBridge()
      return (
        <a
          {...props}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => {
            onClick?.(e)
            if (previewRef(ref, e)) return
            // El navegador externo del cliente no tiene la llave del servidor: el archivo se abre desde la propia app.
            if (bridge?.openRemotePath && ref.kind === 'fs') {
              e.preventDefault()
              void bridge.openRemotePath(ref.path).catch(() => {})
            } else if (bridge?.openFile && ref.kind === 'project') {
              e.preventDefault()
              void bridge.openFile(ref.projectId, ref.rel).catch(() => {})
            }
          }}
        />
      )
    }
  }
}

/** Markdown con estilo de la app (GFM: tablas, listas de tareas, tachado…). */
export const MarkdownView = memo(function MarkdownView({ text, className }: { text: string; className?: string }) {
  const projectId = useCowork((st) => st.live.project?.id ?? null)
  const components = useMemo(() => (isWeb ? webComponents(projectId) : desktopComponents(projectId)), [projectId])
  return (
    <div className={cx(s.md, className)}>
      <Markdown remarkPlugins={plugins} components={components}>
        {text}
      </Markdown>
    </div>
  )
})
