import { useCallback } from 'react'
import type { AgentActivity, AgentConfig, AgentId, ProviderKind } from '@shared/types'
import { SUBAGENT_COLOR } from '@shared/defaults'
import { useCowork, useData } from '@/store/cowork'

/** Datos mínimos que necesita <RobotAvatar>. */
export type RobotAgent = Pick<AgentConfig, 'avatar' | 'provider' | 'isSubagent' | 'color' | 'name'>

/** Cómo se presenta un agente (o un autor que ya no existe). */
export interface AgentLook {
  id: string
  name: string
  color: string
  initial: string
  /** Está en el slice visible (se puede seleccionar en el espacio). */
  present: boolean
  config?: AgentConfig
  /** Para <RobotAvatar agent={look.robot} />. */
  robot: RobotAgent
}

export const ACTIVITY_LABEL: Record<AgentActivity, string> = {
  idle: 'Disponible',
  thinking: 'Pensando',
  working: 'Trabajando',
  waiting: 'Esperando',
  error: 'Error',
  offline: 'No disponible'
}

export const PROVIDER_LABEL: Record<ProviderKind, string> = {
  claude: 'Anthropic · Claude Code',
  codex: 'OpenAI · Codex CLI',
  gemini: 'Google · Gemini CLI',
  qwen: 'Qwen Code',
  ollama: 'Ollama · local',
  lmstudio: 'LM Studio · local',
  hermes: 'Nous Research · Hermes Agent',
  muse: 'Meta · Muse Code',
  cli: 'Agente conectado · tu suscripción'
}

const FALLBACK_COLOR = '#38d6ff'

function initialOf(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase()
}

function becario(id: string, name: string): AgentLook {
  return {
    id,
    name,
    color: SUBAGENT_COLOR,
    initial: initialOf(name),
    present: false,
    robot: { name, color: SUBAGENT_COLOR, provider: 'claude', isSubagent: true }
  }
}

export function lookupAgent(
  id: string | null | undefined,
  slice: Record<AgentId, AgentConfig>,
  configAgents: AgentConfig[]
): AgentLook {
  if (!id) return becario('', 'Agente')
  const inSlice = slice[id]
  const cfg = inSlice ?? configAgents.find((a) => a.id === id)
  if (cfg) {
    const color = cfg.color || (cfg.isSubagent ? SUBAGENT_COLOR : FALLBACK_COLOR)
    const name = cfg.name || 'Agente'
    return {
      id,
      name,
      color,
      initial: initialOf(name),
      present: !!inSlice,
      config: cfg,
      robot: cfg.color && cfg.name ? cfg : { ...cfg, color, name }
    }
  }
  // Autor que ya no existe: los agentes configurados siempre están en config, así que es un
  // sub-agente ("becario") que ya se retiró.
  return becario(id, 'Becario')
}

/** Función estable de búsqueda de agentes sobre el slice visible + configuración. */
export function useAgentLookup(): (id: string | null | undefined) => AgentLook {
  const agents = useData((d) => d.agents)
  const configAgents = useCowork((s) => s.config.agents)
  return useCallback((id: string | null | undefined) => lookupAgent(id, agents, configAgents), [agents, configAgents])
}

/** Extremo de una transferencia: agente, núcleo del proyecto o el usuario. */
export function endpointLook(id: string, lookup: (id: string) => AgentLook): AgentLook | { id: string; name: string; color: string; special: 'core' | 'user' } {
  if (id === 'core') return { id, name: 'Proyecto', color: FALLBACK_COLOR, special: 'core' }
  if (id === 'user') return { id, name: 'Tú', color: '#a3b0c6', special: 'user' }
  return lookup(id)
}

/** Etiqueta del modelo usado en una tarea. */
export function modelLabelFor(model: string | undefined, cfg: AgentConfig | undefined): string | undefined {
  if (!cfg) return model || undefined
  if (!model) return cfg.modelLabel || undefined
  if (model === cfg.model) return cfg.modelLabel || model
  if (model === cfg.lightModel) return cfg.lightModelLabel || model
  if (model === cfg.strongModel) return cfg.strongModelLabel || model
  return model
}
