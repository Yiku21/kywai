import type { ChatMessage } from './types'

/**
 * ¿Este cambio reabre el bloque de una tarea? Pasa cuando el mismo agente vuelve a ella (a corregir lo que vio el
 * verificador, a resolver un choque al integrar…): el bloque estaba cerrado y vuelve a trabajar. Entonces baja al
 * final del chat, para que no se quede arriba entre los mensajes de otras tareas. Las demás actualizaciones se quedan
 * en su sitio.
 */
export function reopensWork(before: ChatMessage, after: ChatMessage): boolean {
  return !!before.work && before.work.status !== 'running' && after.work?.status === 'running' && after.createdAt > before.createdAt
}

/** Aplica un mensaje nuevo o cambiado a la lista del chat (mismo criterio en el servidor, el escritorio y la web). */
export function upsertChatMessage(list: ChatMessage[], m: ChatMessage): ChatMessage[] {
  const i = list.findIndex((x) => x.id === m.id)
  if (i === -1) return [...list, m]
  if (reopensWork(list[i], m)) return [...list.slice(0, i), ...list.slice(i + 1), m]
  return list.map((x, j) => (j === i ? m : x))
}
