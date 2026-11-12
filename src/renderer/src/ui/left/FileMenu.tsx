import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Download, Eye, Paperclip, Trash2 } from 'lucide-react'
import type { Artifact, Attachment } from '@shared/types'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { ContextMenu, menuPoint, type MenuAt, type MenuEntry } from '../sidebar/ContextMenu'
import { errorText } from '../common/util'
import { useComposer } from './composerStore'

/** Un archivo de Archivos o Resultados: un entregable del equipo o un adjunto tuyo. */
export type MenuFile = { artifact: Artifact } | { attachment: Attachment; projectId: string }

/**
 * Clic derecho en un archivo de Archivos o Resultados: Ver, Adjuntar al mensaje (va como adjunto en lo próximo que
 * escribas, para que Hermes sepa de qué archivo hablas), Descargar y Eliminar (pide pulsarlo otra vez).
 * Devuelve el manejador del clic derecho, el menú (o null) y el error de la última acción.
 */
export function useFileMenu(file: MenuFile, onView: () => void): {
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void
  menu: ReactNode
  error: string | null
} {
  const [at, setAt] = useState<MenuAt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const live = useCowork((st) => st.mode === 'live')
  const backend = api
  const artifact = 'artifact' in file ? file.artifact : null
  const attachment = 'attachment' in file ? file.attachment : null
  const projectId = 'artifact' in file ? file.artifact.projectId : file.projectId
  const name = artifact ? artifact.name || artifact.relPath : attachment!.name
  const ready = !!backend && live
  const notReady = ready ? undefined : t('Disponible en modo real')

  const run = (fn: () => Promise<void> | void): void => {
    setError(null)
    Promise.resolve()
      .then(fn)
      .catch((e) => setError(errorText(e)))
  }

  const items: MenuEntry[] = [
    { id: 'ver', label: t('Ver'), icon: <Eye size={15} />, shortcut: 'v', onSelect: onView },
    {
      id: 'adjuntar',
      label: t('Adjuntar al mensaje'),
      icon: <Paperclip size={15} />,
      shortcut: 'a',
      disabled: !ready,
      title: notReady ?? t('Va como adjunto en tu próximo mensaje, para que el equipo sepa de qué archivo hablas'),
      onSelect: () => {
        useComposer.getState().addDeliverable({ kind: artifact ? 'artifact' : 'attachment', id: artifact ? artifact.id : attachment!.id, name, projectId })
        useCowork.getState().setLeftTab('chat')
      }
    },
    {
      id: 'descargar',
      label: t('Descargar'),
      icon: <Download size={15} />,
      shortcut: 'd',
      disabled: !ready || (!artifact && !backend?.downloadFile),
      title: notReady,
      onSelect: () =>
        run(() => (artifact ? backend!.downloadArtifacts(projectId, [artifact.id]) : backend!.downloadFile!(projectId, attachment!.relPath)))
    },
    'sep',
    {
      id: 'eliminar',
      label: t('Eliminar…'),
      icon: <Trash2 size={15} />,
      shortcut: 'e',
      danger: true,
      disabled: !ready || !backend?.deleteProjectFile,
      title: notReady ?? t('Lo borra del disco del proyecto'),
      confirm: t('Pulsa otra vez para borrarlo del todo'),
      onSelect: () =>
        run(async () => {
          await backend!.deleteProjectFile!(projectId, artifact ? { artifactId: artifact.id } : { attachmentId: attachment!.id })
          // Si estaba puesto para el próximo mensaje, ya no puede ir.
          useComposer.getState().removeDeliverable(artifact ? artifact.id : attachment!.id)
        })
    }
  ]

  return {
    onContextMenu: (e) => {
      e.preventDefault()
      setAt(menuPoint(e))
    },
    menu: at ? <ContextMenu at={at} items={items} label={name} onClose={() => setAt(null)} /> : null,
    error
  }
}
