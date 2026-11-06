import { useId } from 'react'
import type { AgentConfig } from '@shared/types'
import { avatarFor } from '@shared/defaults'
import { LOGOS } from './logos'
import geminiPng from '@/assets/robots/gemini.png'
import qwenPng from '@/assets/robots/qwen.png'
import claudePng from '@/assets/robots/claude.png'
import codexPng from '@/assets/robots/codex.png'
import becarioPng from '@/assets/robots/becario.png'
import hermesPng from '@/assets/robots/hermes.png'
import musePng from '@/assets/robots/muse.png'
import { t } from '@/lib/i18n'

/** Ilustraciones de los robots (según el logo de su avatar). */
const ROBOT_IMAGES: Record<string, string> = {
  gemini: geminiPng,
  qwen: qwenPng,
  claude: claudePng,
  openai: codexPng,
  becario: becarioPng,
  hermes: hermesPng,
  muse: musePng
}

interface Props {
  agent: Pick<AgentConfig, 'avatar' | 'provider' | 'isSubagent' | 'color' | 'name'>
  size?: number
  /** Atenúa el avatar (agente no disponible). */
  dim?: boolean
  className?: string
}

const BODY: Record<string, string> = {
  capsule: 'M32 9 C45 9 50 19 50 33 C50 49 44 57 32 57 C20 57 14 49 14 33 C14 19 19 9 32 9 Z',
  egg: 'M32 9 C43 9 52 24 52 37 C52 50 44 57 32 57 C20 57 12 50 12 37 C12 24 21 9 32 9 Z',
  blob: 'M32 13 C46 13 55 22 55 35 C55 49 45 57 32 57 C19 57 9 49 9 35 C9 22 18 13 32 13 Z',
  cube: 'M18 13 L46 13 C51 13 54 16 54 21 L53 48 C53 54 49 57 44 57 L20 57 C15 57 11 54 11 48 L10 21 C10 16 13 13 18 13 Z',
  bulb: 'M32 9 C47 9 55 18 55 31 C55 42 48 49 44 54 C42 57 38 58 32 58 C26 58 22 57 20 54 C16 49 9 42 9 31 C9 18 17 9 32 9 Z'
}

const VISOR_Y: Record<string, number> = { capsule: 22, egg: 24, blob: 24, cube: 23, dome: 23, bulb: 21 }

/** Avatar vectorial del robot de cada agente (chat, paneles, leyendas). */
export function RobotAvatar({ agent, size = 32, dim, className }: Props) {
  const av = avatarFor(agent)
  const id = useId().replace(/:/g, '')
  const img = ROBOT_IMAGES[av.logo]
  if (img) {
    return (
      <img
        className={className}
        src={img}
        width={size}
        height={size}
        alt={t('Robot {name}', { name: agent.name })}
        draggable={false}
        style={{ objectFit: 'contain', flex: 'none', opacity: dim ? 0.45 : 1, filter: dim ? 'grayscale(0.7)' : undefined }}
      />
    )
  }
  const vy = VISOR_Y[av.body] ?? 23
  const eye = av.eyeColor
  const showLogo = size >= 40 && av.logo !== 'none'
  const logo = av.logo !== 'none' ? LOGOS[av.logo] : null

  const eyes = (() => {
    const l = 25
    const r = 39
    const cy = vy + 7
    switch (av.eyes) {
      case 'pill':
        return (
          <>
            <rect x={l - 4.5} y={cy - 2} width={9} height={4} rx={2} fill={eye} />
            <rect x={r - 4.5} y={cy - 2} width={9} height={4} rx={2} fill={eye} />
          </>
        )
      case 'arc':
        return (
          <>
            <path d={`M${l - 4} ${cy + 1.5} Q${l} ${cy - 4} ${l + 4} ${cy + 1.5}`} stroke={eye} strokeWidth={2.4} fill="none" strokeLinecap="round" />
            <path d={`M${r - 4} ${cy + 1.5} Q${r} ${cy - 4} ${r + 4} ${cy + 1.5}`} stroke={eye} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          </>
        )
      case 'chevron':
        return (
          <>
            <path d={`M${l - 2.5} ${cy - 3.5} L${l + 2} ${cy} L${l - 2.5} ${cy + 3.5}`} stroke={eye} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d={`M${r + 2.5} ${cy - 3.5} L${r - 2} ${cy} L${r + 2.5} ${cy + 3.5}`} stroke={eye} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )
      case 'wave':
        return (
          <>
            <path d={`M${l - 4.5} ${cy} q2.25 -3.6 4.5 0 t4.5 0`} stroke={eye} strokeWidth={2.4} fill="none" strokeLinecap="round" />
            <path d={`M${r - 4.5} ${cy} q2.25 3.6 4.5 0 t4.5 0`} stroke={eye} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          </>
        )
      case 'dots':
        return (
          <>
            <circle cx={l} cy={cy} r={3.6} fill={eye} />
            <circle cx={r} cy={cy} r={3} fill={eye} />
          </>
        )
      default:
        return (
          <>
            <ellipse cx={l} cy={cy} rx={3.2} ry={3.6} fill={eye} />
            <ellipse cx={r} cy={cy} rx={3.2} ry={3.6} fill={eye} />
          </>
        )
    }
  })()

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={t('Robot {name}', { name: agent.name })}
      style={{ opacity: dim ? 0.45 : 1, flex: 'none' }}
    >
      <defs>
        <radialGradient id={`g${id}`} cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </radialGradient>
      </defs>
      {av.accessory === 'ears' && (
        <>
          <rect x={21} y={4} width={8} height={12} rx={4} fill={av.accentColor ?? agent.color} />
          <rect x={35} y={4} width={8} height={12} rx={4} fill={av.accentColor ?? agent.color} />
        </>
      )}
      {av.accessory === 'antenna' && (
        <>
          <rect x={30.6} y={4} width={2.8} height={8} fill={agent.color} />
          <circle cx={32} cy={5} r={3.6} fill={av.accentColor ?? '#fff3c0'} />
        </>
      )}
      {av.accessory === 'halo' && <ellipse cx={32} cy={5} rx={11} ry={3} fill="none" stroke={av.accentColor ?? eye} strokeWidth={2.2} />}
      {av.accessory === 'tuft' && <path d="M28 15 C30 6 38 3 46 5 C42 6 40 9 40 15 Z" fill={agent.color} />}
      <path d={BODY[av.body] ?? BODY.capsule} fill={agent.color} />
      <path d={BODY[av.body] ?? BODY.capsule} fill={`url(#g${id})`} />
      {av.accessory === 'hair' && (
        <path d={`M7 ${vy + 18} C5 16 17 6 32 6 C47 6 59 16 57 ${vy + 18} C53 ${vy + 14} 51 ${vy + 8} 50 ${vy - 1} L14 ${vy - 1} C13 ${vy + 8} 11 ${vy + 14} 7 ${vy + 18} Z`} fill={av.accentColor ?? '#141419'} />
      )}
      {av.accessory === 'vents' && (
        <g stroke="rgba(0,0,0,0.35)" strokeWidth={1.4} strokeLinecap="round">
          <path d="M12 40 L15 39.5 M12 43.5 L15 43" />
          <path d="M52 40 L49 39.5 M52 43.5 L49 43" />
        </g>
      )}
      <rect x={15} y={vy} width={34} height={15} rx={6.5} fill="#07080d" />
      <rect x={17} y={vy + 1.5} width={12} height={2} rx={1} fill="#ffffff" opacity={0.18} />
      {eyes}
      {showLogo && logo && (
        <g transform="translate(26 42) scale(0.12)" fill={eye} stroke={eye} strokeLinecap="round" strokeLinejoin="round">
          {logo.fill?.map((d, i) => <path key={`f${i}`} d={d} stroke="none" />)}
          {logo.stroke?.map((d, i) => <path key={`s${i}`} d={d} fill="none" strokeWidth={logo.width ?? 6} />)}
          {logo.dots?.map(([x, y, r], i) => <circle key={`d${i}`} cx={x} cy={y} r={r} stroke="none" />)}
        </g>
      )}
    </svg>
  )
}
