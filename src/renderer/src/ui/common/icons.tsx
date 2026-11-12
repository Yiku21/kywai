import type { CSSProperties, ReactNode } from 'react'
import {
  CircleCheck,
  CircleX,
  Clock,
  File,
  FileCode,
  FileText,
  Film,
  Globe,
  Image,
  LoaderCircle,
  Music,
  TriangleAlert,
  type LucideIcon
} from 'lucide-react'
import type { Artifact, ArtifactKind, TaskStatus } from '@shared/types'
import { fileTypeOf } from '@shared/fileTypes'
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
export function TaskStatusIcon({ status, size = 15, className, needsYou }: { status: TaskStatus; size?: number; className?: string; needsYou?: boolean }) {
  // Bloqueada esperando tu decisión: no es un error (ámbar, no rojo).
  if (status === 'failed' && needsYou) {
    const label = t('Bloqueada: te necesita')
    return (
      <span className={cx(s.status, s.needsYou, className)} role="img" aria-label={label} title={label}>
        <TriangleAlert size={size} aria-hidden="true" />
      </span>
    )
  }
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

/**
 * Vídeo, audio y PDF llegan como «other» (el motor no tiene clase para ellos): por el nombre les damos su etiqueta,
 * icono y color en vez de «Archivo» genérico.
 */
const OTHER_BY_NAME = {
  video: { label: t('Vídeo'), icon: Film, color: 'var(--warn)' },
  audio: { label: t('Audio'), icon: Music, color: 'var(--c-gemini)' },
  pdf: { label: t('PDF'), icon: FileText, color: 'var(--alert)' }
} as const

function otherByName(kind: ArtifactKind, name?: string): (typeof OTHER_BY_NAME)[keyof typeof OTHER_BY_NAME] | undefined {
  if (kind !== 'other' || !name) return undefined
  if (/\.pdf$/i.test(name)) return OTHER_BY_NAME.pdf
  const type = fileTypeOf(name)
  return type === 'video' || type === 'audio' ? OTHER_BY_NAME[type] : undefined
}

/** Etiqueta del tipo de un resultado («Vídeo», «Página web», «Código»…). */
export function artifactLabel(a: Pick<Artifact, 'kind' | 'name' | 'relPath'>): string {
  return otherByName(a.kind, a.name || a.relPath)?.label ?? ARTIFACT_KIND_LABEL[a.kind]
}

/** Baldosa con el icono del tipo de resultado (con `name`, los vídeos, audios y PDF llevan su propio icono). */
export function KindTile({ kind, name, size = 36, className }: { kind: ArtifactKind; name?: string; size?: number; className?: string }) {
  const byName = otherByName(kind, name)
  const Icon = byName?.icon ?? KIND_ICON[kind] ?? File
  return (
    <span
      className={cx(s.tile, className)}
      style={{ '--k': byName?.color ?? KIND_COLOR[kind] ?? 'var(--text-3)', width: size, height: size } as CSSProperties}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.48)} />
    </span>
  )
}

/** Icono de archivo por tipo: PDF rojo, imagen verde, vídeo y audio con el suyo, otros neutro. */
export function FileTypeIcon({ name, mime, size = 15 }: { name: string; mime?: string; size?: number }) {
  const k = fileKind(name, mime)
  if (k === 'pdf') return <FileText size={size} aria-hidden="true" className={s.pdf} />
  if (k === 'image') return <Image size={size} aria-hidden="true" className={s.image} />
  const type = fileTypeOf(name, mime)
  if (type === 'video') return <Film size={size} aria-hidden="true" className={s.video} />
  if (type === 'audio') return <Music size={size} aria-hidden="true" className={s.audio} />
  return <File size={size} aria-hidden="true" className={s.other} />
}
