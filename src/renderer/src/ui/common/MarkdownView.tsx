import { memo, useMemo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCowork } from '@/store/cowork'
import { clientBridge, isWeb } from '@/lib/api'
import { resolveLocalRef, serverUrlFor } from '@/lib/localRefs'
import { cx } from './util'
import s from './MarkdownView.module.css'

const plugins = [remarkGfm]

const base: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
  table: ({ node: _node, ...props }) => (
    <div className={s.tableWrap}>
      <table {...props} />
    </div>
  )
}

/**
 * En la interfaz web (cliente de escritorio o navegador) las rutas de archivos que escriben los agentes son del
 * servidor: las imágenes se piden a su API y los enlaces se abren desde allí (en el cliente, con tu aplicación).
 */
function webComponents(projectId: string | null): Components {
  return {
    ...base,
    img: ({ node: _node, src, alt, ...props }) => {
      const ref = typeof src === 'string' ? resolveLocalRef(src, projectId) : null
      return <img {...props} alt={alt ?? ''} src={ref ? serverUrlFor(ref) : src} loading="lazy" />
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
  const components = useMemo(() => (isWeb ? webComponents(projectId) : base), [projectId])
  return (
    <div className={cx(s.md, className)}>
      <Markdown remarkPlugins={plugins} components={components}>
        {text}
      </Markdown>
    </div>
  )
})
