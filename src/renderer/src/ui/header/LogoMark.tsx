import s from './LogoMark.module.css'

/** Marca de AI Cowork: tres nodos conectados (azul, verde, naranja). */
export function LogoMark({ size = 38 }: { size?: number }) {
  const inner = Math.round(size * 0.74)
  return (
    <span className={s.logo} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32" width={inner} height={inner}>
        <g stroke="rgba(233, 238, 248, 0.7)" strokeWidth="2.2" strokeLinecap="round">
          <line x1="16" y1="9" x2="8.5" y2="22.5" />
          <line x1="16" y1="9" x2="23.5" y2="22.5" />
          <line x1="9" y1="23" x2="23" y2="23" />
        </g>
        <circle cx="16" cy="8.5" r="5.6" style={{ fill: 'var(--c-gemini)' }} />
        <circle cx="8.3" cy="23.2" r="5" style={{ fill: 'var(--c-codex)' }} />
        <circle cx="23.7" cy="23.2" r="5" style={{ fill: 'var(--c-claude)' }} />
        <circle cx="14.4" cy="6.9" r="1.6" fill="#fff" opacity="0.45" />
        <circle cx="7" cy="21.8" r="1.3" fill="#fff" opacity="0.35" />
        <circle cx="22.4" cy="21.8" r="1.3" fill="#fff" opacity="0.35" />
      </svg>
    </span>
  )
}
