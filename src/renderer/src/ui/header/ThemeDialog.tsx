import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import {
  CITY_COLORS,
  DECORS,
  DEFAULT_THEME,
  WORLDS,
  isCityColor,
  lastCityColor,
  setCityColor,
  setTheme,
  uiThemeOf,
  useTheme,
  worldOf,
  type ThemeId,
  type ThemeInfo
} from '@/lib/theme'
import { cx } from '../common/util'
import s from './ThemeDialog.module.css'
import { t } from '@/lib/i18n'
import { WorldPreview } from './WorldPreview'

/**
 * Los temas (Ajustes → General), en tres grupos: los mapas, la Ciudad digital con su fila de colores debajo y los
 * decorados. Cada tarjeta es un botón de opción; los colores de la ciudad, otro grupo de opciones dentro de su tarjeta.
 */
export function ThemeGrid() {
  const theme = useTheme()
  const inCity = isCityColor(theme)
  const cityPreview = inCity ? theme : lastCityColor()
  return (
    <div className={s.groups}>
      <Group title={t('Mapas')} hint={t('Cada uno con su entorno, sus plataformas y su núcleo')}>
        {WORLDS.map((th) => (
          <Card key={th.id} info={th} on={theme === th.id} onPick={() => setTheme(th.id)} />
        ))}
      </Group>
      <Group title={t('Ciudad digital')} hint={t('El espacio de siempre: elige la ciudad y luego su color')}>
        <div className={cx(s.card, s.cityCard, inCity && s.cardOn)}>
          <button
            type="button"
            role="radio"
            aria-checked={inCity}
            className={s.cardMain}
            onClick={() => setCityColor(cityPreview)}
          >
            <Preview id={cityPreview} />
            <span className={s.cardText}>
              <span className={s.cardName}>
                {t('Ciudad digital')}
                {DEFAULT_THEME === cityPreview && <span className={s.default}>{t('predeterminado')}</span>}
              </span>
              <span className={s.cardHint}>{CITY_COLORS.find((c) => c.id === cityPreview)?.hint}</span>
            </span>
            {inCity && (
              <span className={s.check} aria-hidden="true">
                <Check size={14} />
              </span>
            )}
          </button>
          <div className={s.colors} role="radiogroup" aria-label={t('Color de la ciudad')}>
            {CITY_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={theme === c.id}
                className={cx(s.color, theme === c.id && s.colorOn)}
                onClick={() => setCityColor(c.id)}
                title={c.hint}
              >
                <span className={s.swatch} style={{ background: `linear-gradient(135deg, ${c.swatch[0]} 50%, ${c.swatch[1]} 50%)` }} aria-hidden="true" />
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </Group>
      <Group title={t('Decorados')} hint={t('La ciudad con decoración de temporada o de fantasía')}>
        {DECORS.map((th) => (
          <Card key={th.id} info={th} on={theme === th.id} onPick={() => setTheme(th.id)} />
        ))}
      </Group>
      <p className={s.credits}>
        {t('Texturas de Órbita')}:{' '}
        <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">
          Solar System Scope
        </a>{' '}
        (
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
        ) ·{' '}
        <a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noreferrer">
          NASA SVS
        </a>
      </p>
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className={s.group}>
      <h3 className={s.groupTitle}>
        {title} <span className={s.groupHint}>{hint}</span>
      </h3>
      <div className={s.grid} role="radiogroup" aria-label={title}>
        {children}
      </div>
    </section>
  )
}

function Card({ info, on, onPick }: { info: ThemeInfo; on: boolean; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={cx(s.card, on && s.cardOn)} onClick={onPick}>
      <Preview id={info.id} />
      <span className={s.cardText}>
        <span className={s.cardName}>{info.name}</span>
        <span className={s.cardHint}>{info.hint}</span>
      </span>
      {on && (
        <span className={s.check} aria-hidden="true">
          <Check size={14} />
        </span>
      )}
    </button>
  )
}

/** Miniatura de la app con cada tema (sus colores propios, sea cual sea el actual). */
function Preview({ id }: { id: ThemeId }) {
  return (
    <span className={s.preview} data-preview={uiThemeOf(id)} aria-hidden="true">
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
            {worldOf(id) ? <WorldPreview id={worldOf(id)!} /> : <span className={s.pvCore} />}
          </span>
        </span>
      </span>
    </span>
  )
}
