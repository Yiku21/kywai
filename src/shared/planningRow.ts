import type { AgentId, ChatMessage, Task } from './types'

/**
 * A quién nombra la fila de espera del chat justo después de enviar. Si la petición ya tiene una tarea (un «/video …»
 * o un «@Agente …» no pasan por un plan) o es un mensaje directo, es ese agente quien empieza; si no, quien planifica.
 * Así el chat dice lo mismo que el espacio 3D.
 */
export function planningRowAgent(
  last: Pick<ChatMessage, 'runId' | 'direct'>,
  tasks: Pick<Task, 'runId' | 'agentId' | 'status' | 'createdAt'>[],
  planner: AgentId
): { agentId: AgentId; planning: boolean } {
  const mine = tasks
    .filter((t) => t.runId === last.runId && t.status !== 'done' && t.status !== 'failed' && t.status !== 'cancelled')
    .sort((a, b) => a.createdAt - b.createdAt)
  if (mine.length) return { agentId: mine[0].agentId, planning: false }
  if (last.direct) return { agentId: last.direct.agentId, planning: false }
  return { agentId: planner, planning: true }
}
