import type { CSSProperties, ReactNode } from 'react'
import {
  CircleCheck,
  CircleX,
  Clock,
  File,
  FileCode,
  FileText,
  Globe,
  Image,
  LoaderCircle,
  type LucideIcon
} from 'lucide-react'
import type { ArtifactKind, TaskStatus } from '@shared/types'
import { cx, fileKind } from './util'
import u from './ui.module.css'
import s from './icons.module.css'
import { t } from '@/lib/i18n'

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: t('Pendiente'),
  blocked: t('Bloqueada'),
  running: t('En curso'),
  done: t('Completada'),
  failed: t('Con error'),
  cancelled: t('Cancelada')
}

/** Icono de estado de tarea con etiqueta accesible (no depende solo del color). */
export function TaskStatusIcon({ status, size = 15, className }: { status: TaskStatus; size?: number; className?: string }) {
  const label = TASK_STATUS_LABEL[status]
  let icon: ReactNode
  let tone: string
  switch (status) {
    case 'running':
      icon = <LoaderCircle size={size} aria-hidden="true" className={u.spin} />
      tone = s.running
      break
    case 'done':
      icon = <CircleCheck size={size} aria-hidden="true" />
      tone = s.done
      break
    case 'failed':
      icon = <CircleX size={size} aria-hidden="true" />
      tone = s.failed
      break
    case 'cancelled':
      icon = <CircleX size={size} aria-hidden="true" />
      tone = s.cancelled
      break
    case 'blocked':
      icon = <Clock size={size} aria-hidden="true" />
      tone = s.blocked
      break
    default:
      icon = <Clock size={size} aria-hidden="true" />
      tone = s.pending
  }
  return (
    <span className={cx(s.status, tone, className)} role="img" aria-label={label} title={label}>
      {icon}
    </span>
  )
}

export const ARTIFACT_KIND_LABEL: Record<ArtifactKind, string> = {
  html: t('Página web'),
  markdown: t('Documento'),
  code: t('Código'),
  image: t('Imagen'),
  text: t('Texto'),
  other: t('Archivo')
}

const KIND_ICON: Record<ArtifactKind, LucideIcon> = {
  html: Globe,
  markdown: FileText,
  code: FileCode,
  image: Image,
  text: FileText,
  other: File
}

const KIND_COLOR: Record<ArtifactKind, string> = {
  html: 'var(--cyan)',
  markdown: 'var(--c-gemini)',
  code: 'var(--c-qwen)',
  image: 'var(--live)',
  text: 'var(--text-2)',
  other: 'var(--text-3)'
}

/** Baldosa con el icono del tipo de resultado. */
export function KindTile({ kind, size = 36, className }: { kind: ArtifactKind; size?: number; className?: string }) {
  const Icon = KIND_ICON[kind] ?? File
  return (
    <span
      className={cx(s.tile, className)}
      style={{ '--k': KIND_COLOR[kind] ?? 'var(--text-3)', width: size, height: size } as CSSProperties}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.48)} />
    </span>
  )
}

/** Icono de archivo por tipo: PDF rojo, imagen verde, otros neutro. */
export function FileTypeIcon({ name, mime, size = 15 }: { name: string; mime?: string; size?: number }) {
  const k = fileKind(name, mime)
  if (k === 'pdf') return <FileText size={size} aria-hidden="true" className={s.pdf} />
  if (k === 'image') return <Image size={size} aria-hidden="true" className={s.image} />
  return <File size={size} aria-hidden="true" className={s.other} />
}
