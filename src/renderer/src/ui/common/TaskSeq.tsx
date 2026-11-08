import u from './ui.module.css'

/** «#7» delante del título de una tarea (nada si es de antes de numerarlas). */
export function TaskSeq({ seq }: { seq?: number }) {
  return seq ? <span className={u.taskSeq}>#{seq}</span> : null
}
