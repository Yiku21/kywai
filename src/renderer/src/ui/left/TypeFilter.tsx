import { useState } from 'react'
import { Code2, File, FileText, Film, Image, Music, type LucideIcon } from 'lucide-react'
import { FILE_TYPES, type FileType } from '@shared/fileTypes'
import { cx } from '../common/util'
import s from './Views.module.css'
import { t } from '@/lib/i18n'

export type TypeChoice = FileType | 'all'

export const FILE_TYPE_LABEL: Record<FileType, string> = {
  image: t('Fotos'),
  video: t('Vídeos'),
  audio: t('Audio'),
  document: t('Documentos'),
  code: t('Código'),
  other: t('Otros')
}

const FILE_TYPE_ICON: Record<FileType, LucideIcon> = {
  image: Image,
  video: Film,
  audio: Music,
  document: FileText,
  code: Code2,
  other: File
}

/** Filtro elegido en esta pestaña, recordado en este equipo. */
export function useTypeChoice(storageKey: string): [TypeChoice, (c: TypeChoice) => void] {
  const [choice, setChoice] = useState<TypeChoice>(() => {
    try {
      const v = localStorage.getItem(storageKey)
      return v && (v === 'all' || (FILE_TYPES as string[]).includes(v)) ? (v as TypeChoice) : 'all'
    } catch {
      return 'all'
    }
  })
  const update = (c: TypeChoice): void => {
    try {
      localStorage.setItem(storageKey, c)
    } catch {
      /* sin almacenamiento: se olvida al cerrar */
    }
    setChoice(c)
  }
  return [choice, update]
}

/**
 * Botones «Todo · Fotos · Vídeos · …» con su número. Solo salen los tipos que hay; con uno solo no hace falta filtrar
 * y no se enseña nada.
 */
export function TypeFilter({
  counts,
  total,
  value,
  onChange
}: {
  counts: Partial<Record<FileType, number>>
  total: number
  value: TypeChoice
  onChange: (c: TypeChoice) => void
}) {
  const present = FILE_TYPES.filter((type) => (counts[type] ?? 0) > 0)
  if (present.length < 2) return null
  const chip = (c: TypeChoice, label: string, n: number, Icon?: LucideIcon) => (
    <button key={c} type="button" className={cx(s.typeChip, value === c && s.typeChipOn)} aria-pressed={value === c} onClick={() => onChange(c)}>
      {Icon && <Icon size={13} aria-hidden="true" />}
      {label}
      <span className={s.typeChipCount}>{n}</span>
    </button>
  )
  return (
    <div className={s.typeFilter} role="group" aria-label={t('Filtrar por tipo de archivo')}>
      {chip('all', t('Todo'), total)}
      {present.map((type) => chip(type, FILE_TYPE_LABEL[type], counts[type] ?? 0, FILE_TYPE_ICON[type]))}
    </div>
  )
}

/** El filtro guardado puede apuntar a un tipo que ya no hay: entonces se ve todo. */
export function effectiveChoice(choice: TypeChoice, counts: Partial<Record<FileType, number>>): TypeChoice {
  return choice !== 'all' && !(counts[choice] ?? 0) ? 'all' : choice
}
