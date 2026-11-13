import { Plus } from 'lucide-react'
import { t } from '@/lib/i18n'
import u from './ui.module.css'

/**
 * Ejemplos que se pulsan en una pantalla vacía (ley de Fitts y de Hick): en vez de leer «por ejemplo…» y copiarlo a
 * mano, un toque lo deja escrito donde toca. Pocos (3) y concretos.
 */
export function ExampleChips({ examples, onPick, label = t('Prueba con uno:') }: { examples: { text: string; label?: string }[]; onPick: (text: string) => void; label?: string }) {
  if (examples.length === 0) return null
  return (
    <div className={u.examples} role="group" aria-label={label}>
      <span className={u.examplesLabel}>{label}</span>
      {examples.map((ex) => (
        <button key={ex.text} type="button" className={u.example} onClick={() => onPick(ex.text)}>
          <Plus size={14} aria-hidden="true" className={u.exampleIcon} />
          <span>{ex.label ?? ex.text}</span>
        </button>
      ))}
    </div>
  )
}
