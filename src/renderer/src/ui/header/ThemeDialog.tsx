import { Check, Palette, X } from 'lucide-react'
import { THEMES, setTheme, useTheme, type ThemeId } from '@/lib/theme'
import { useEscape } from '../common/hooks'
import { cx } from '../common/util'
import u from '../common/ui.module.css'
import r from './RemoteAccess.module.css'
import s from './ThemeDialog.module.css'

/** ⋮ → «Temas…»: el aspecto de AI Cowork en este dispositivo. Se aplica al momento. */
export function ThemeDialog({ onClose }: { onClose: () => void }) {
  const theme = useTheme()
  useEscape(true, onClose)
  return (
    <div className={r.backdrop} role="dialog" aria-modal="true" aria-labelledby="theme-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx(r.dialog, s.dialog)}>
        <header className={r.head}>
          <Palette size={20} aria-hidden="true" className={r.headIcon} />
          <div>
            <h2 id="theme-title" className={r.title}>
              Temas
            </h2>
            <p className={r.subtitle}>El aspecto de AI Cowork en este dispositivo. Se aplica al momento y se recuerda.</p>
          </div>
          <button type="button" className={cx(u.iconBtn, r.close)} aria-label="Cerrar" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className={s.grid} role="radiogroup" aria-label="Tema">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              className={cx(s.card, theme === t.id && s.cardOn)}
              onClick={() => setTheme(t.id)}
            >
              <Preview id={t.id} />
              <span className={s.cardText}>
                <span className={s.cardName}>
                  {t.name}
                  {t.id === 'clasico' && <span className={s.default}>predeterminado</span>}
                </span>
                <span className={s.cardHint}>{t.hint}</span>
              </span>
              {theme === t.id && (
                <span className={s.check} aria-hidden="true">
                  <Check size={14} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Miniatura de la app con cada tema (sus colores propios, sea cual sea el actual). */
function Preview({ id }: { id: ThemeId }) {
  return (
    <span className={s.preview} data-preview={id} aria-hidden="true">
      <span className={s.pvHeader}>
        <span className={s.pvLogo} />
        <span className={s.pvChips}>
          <span />
          <span />
          <span />
        </span>
      </span>
      <span className={s.pvBody}>
        <span className={s.pvLeft}>
          <span className={s.pvLine} />
          <span className={cx(s.pvLine, s.pvShort)} />
          <span className={s.pvBubble} />
          <span className={s.pvLine} />
          <span className={cx(s.pvBubble, s.pvBubbleSmall)} />
        </span>
        <span className={s.pvSpace}>
          <span className={s.pvStage}>
            <span className={s.pvCore} />
          </span>
        </span>
      </span>
    </span>
  )
}
