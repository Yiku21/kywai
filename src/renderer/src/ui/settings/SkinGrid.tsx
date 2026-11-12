import { Check } from 'lucide-react'
import { t } from '@/lib/i18n'
import { SKINS, useAgentSkin, type AgentSkin } from '../../scene/characters'
import s from '../header/ThemeDialog.module.css'

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')

/** Fotos de cada skin (`assets/skins/<id>.webp`, 360×225): Gemini, Hermes y Claude con ese aspecto. */
const SHOTS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../../assets/skins/*.webp', { eager: true, import: 'default' }) as Record<string, string>).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.webp'.length),
    url
  ])
)

/** Nombre y explicación de cada aspecto de los agentes (skins). */
export function skinText(id: AgentSkin): { label: string; hint: string } {
  switch (id) {
    case 'clasico':
      return { label: t('Clásico'), hint: t('Los robots de siempre, que gastan menos') }
    case 'refugio':
      return { label: t('Refugio Kywai'), hint: t('Robots de cerámica con ropa de tela, como en el tema Refugio Kywai') }
    default:
      return { label: t('Personajes'), hint: t('Personajes 3D animados; los agentes sin personaje se ven como robots clásicos') }
  }
}

/** Tarjetas con foto para elegir la skin de los agentes (como las de los temas). */
export function SkinGrid() {
  const skin = useAgentSkin((st) => st.skin)
  return (
    <div className={s.grid} role="radiogroup" aria-label={t('Aspecto de los agentes')}>
      {SKINS.map((id) => {
        const on = skin === id
        const info = skinText(id)
        return (
          <button key={id} type="button" role="radio" aria-checked={on} className={cx(s.card, on && s.cardOn)} onClick={() => useAgentSkin.getState().setSkin(id)}>
            <span className={s.preview} aria-hidden="true">
              {SHOTS[id] && <img className={s.pvShot} src={SHOTS[id]} alt="" loading="lazy" draggable={false} />}
            </span>
            <span className={s.cardText}>
              <span className={s.cardName}>
                {info.label}
                {id === 'personajes' && <span className={s.default}>{t('predeterminado')}</span>}
              </span>
              <span className={s.cardHint} title={info.hint}>
                {info.hint}
              </span>
            </span>
            {on && (
              <span className={s.check} aria-hidden="true">
                <Check size={14} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
