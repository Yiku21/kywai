import { Check } from 'lucide-react'
import type { Task } from '@shared/types'
import { t } from '@/lib/i18n'
import { cx } from '../common/util'
import s from './TaskStages.module.css'

/**
 * Etapas reales de una tarea en marcha: Trabajando (o Corrigiendo) → Pruebas → Verificación → Lista. Vienen del
 * motor (Task.phase), no de un temporizador: cada una se enciende cuando la tarea entra de verdad en ella.
 */
export function TaskStages({ task, reduced }: { task: Task; reduced: boolean }) {
  if (task.status !== 'running' || !task.phase) return null
  const current = task.phase === 'verify' ? 2 : task.phase === 'tests' ? 1 : 0
  const steps = [task.phase === 'fix' ? t('Corrigiendo') : t('Trabajando'), t('Pruebas'), t('Verificación'), t('Lista')]
  return (
    <ol className={s.stages} aria-label={t('Etapas de la tarea')}>
      {steps.map((label, i) => (
        <li
          key={i}
          className={cx(s.stage, i < current && s.past, i === current && s.now, i === current && !reduced && s.anim)}
          aria-current={i === current ? 'step' : undefined}
        >
          <span className={s.dot} aria-hidden="true">
            {i < current && <Check size={9} strokeWidth={3} />}
          </span>
          {label}
        </li>
      ))}
    </ol>
  )
}
