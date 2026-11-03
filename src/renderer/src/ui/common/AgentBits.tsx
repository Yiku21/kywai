import type { CSSProperties } from 'react'
import { RobotAvatar } from '@/lib/RobotAvatar'
import type { AgentLook } from './agents'
import { agentVars, cx } from './util'
import s from './AgentBits.module.css'

/** Robot del agente (decorativo: el nombre siempre aparece al lado). */
export function AgentAvatar({ look, size = 32, dim, className }: { look: AgentLook; size?: number; dim?: boolean; className?: string }) {
  return (
    <span className={cx(s.avatar, className)} aria-hidden="true" style={{ width: size, height: size }}>
      <RobotAvatar agent={look.robot} size={size} dim={dim} />
    </span>
  )
}

/** Píldora tintada con el robot (o un punto) y el nombre del agente. */
export function AgentPill({
  look,
  size = 'md',
  robot = true,
  className
}: {
  look: AgentLook
  size?: 'sm' | 'md'
  robot?: boolean
  className?: string
}) {
  return (
    <span className={cx(s.pill, size === 'sm' && s.sm, className)} style={agentVars(look.color)}>
      {robot ? (
        <span className={s.pillRobot} aria-hidden="true">
          <RobotAvatar agent={look.robot} size={size === 'sm' ? 16 : 18} />
        </span>
      ) : (
        <span className={s.dot} aria-hidden="true" />
      )}
      <span className={s.pillName}>{look.name}</span>
    </span>
  )
}

/** Punto de color de un agente. */
export function AgentDot({ color, size = 8, className, style }: { color: string; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cx(s.dotStandalone, className)}
      aria-hidden="true"
      style={{ ...agentVars(color), width: size, height: size, ...style }}
    />
  )
}
