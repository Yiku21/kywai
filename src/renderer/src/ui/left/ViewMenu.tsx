import { useRef, useState } from 'react'
import { ChevronDown, Grid2x2, Grid3x3, LayoutGrid, List, Square, type LucideIcon } from 'lucide-react'
import { t } from '@/lib/i18n'
import { ContextMenu, type MenuAt } from '../sidebar/ContextMenu'
import s from './Views.module.css'

/** Cómo se ven los archivos, como «Vista» en el Explorador de Windows: iconos de varios tamaños o detalles. */
export type FileView = 'xl' | 'lg' | 'md' | 'sm' | 'details'

export const FILE_VIEWS: FileView[] = ['xl', 'lg', 'md', 'sm', 'details']

const LABEL: Record<FileView, string> = {
  xl: t('Iconos muy grandes'),
  lg: t('Iconos grandes'),
  md: t('Iconos medianos'),
  sm: t('Iconos pequeños'),
  details: t('Detalles')
}

const ICON: Record<FileView, LucideIcon> = {
  xl: Square,
  lg: Grid2x2,
  md: LayoutGrid,
  sm: Grid3x3,
  details: List
}

/** La vista elegida en esta pestaña, recordada en este equipo. Por defecto, «Detalles» (la lista de siempre). */
export function useFileView(storageKey: string): [FileView, (v: FileView) => void] {
  const [view, setView] = useState<FileView>(() => {
    try {
      const v = localStorage.getItem(storageKey)
      return v && (FILE_VIEWS as string[]).includes(v) ? (v as FileView) : 'details'
    } catch {
      return 'details'
    }
  })
  const update = (v: FileView): void => {
    try {
      localStorage.setItem(storageKey, v)
    } catch {
      /* sin almacenamiento: se olvida al cerrar */
    }
    setView(v)
  }
  return [view, update]
}

/** Botón «Vista ▾» con el menú de tamaños. */
export function ViewMenu({ value, onChange }: { value: FileView; onChange: (v: FileView) => void }) {
  const [at, setAt] = useState<MenuAt | null>(null)
  // El clic fuera cierra el menú antes del clic del botón: sin esto, pulsar «Vista» con el menú abierto lo reabriría.
  const closedAt = useRef(0)
  const Icon = ICON[value]
  return (
    <>
      <button
        type="button"
        className={s.workToggle}
        aria-haspopup="menu"
        aria-expanded={!!at}
        title={t('Cambiar el tamaño en que se ven los archivos')}
        onClick={(e) => {
          if (Date.now() - closedAt.current < 300) return
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: r.left, y: r.bottom + 4 })
        }}
      >
        <Icon size={14} aria-hidden="true" />
        {t('Vista')}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {at && (
        <ContextMenu
          at={at}
          label={t('Vista')}
          onClose={() => {
            closedAt.current = Date.now()
            setAt(null)
          }}
          items={FILE_VIEWS.flatMap((v) => {
            const I = ICON[v]
            const item = { id: v, label: LABEL[v], icon: <I size={15} />, checked: v === value, onSelect: () => onChange(v) }
            return v === 'details' ? (['sep', item] as const) : [item]
          })}
        />
      )}
    </>
  )
}
