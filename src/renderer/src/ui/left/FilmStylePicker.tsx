import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Clapperboard, Search, Smile, X } from 'lucide-react'
import { FILM_CATEGORIES, FILM_STYLES, filmStyle, type FilmStyle, type VideoStyleChoice } from '@shared/filmStyles'
import { cx } from '../common/util'
import { lang, t } from '@/lib/i18n'
import s from './FilmStylePicker.module.css'

// Una muestra de cada estilo (un fotograma de su película de ejemplo, 320×180). Las de la biblioteca Lemo-Opuscar son
// de sus películas demo (CC BY 4.0, lemomo-ai/lemo-opuscar); la de los robots, de la prueba de kywai.
const THUMBS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../../assets/estilos/*.webp', { eager: true, import: 'default' }) as Record<string, string>).map(([path, url]) => [
    path.replace(/^.*\/([^/]+)\.webp$/, '$1'),
    url
  ])
)

const norm = (x: string): string =>
  x
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

interface Props {
  value: VideoStyleChoice
  open: boolean
  onOpen: (open: boolean) => void
  onChoose: (choice: VideoStyleChoice) => void
}

// Los nombres y las líneas del catálogo van en español y en inglés (en otros idiomas, el inglés).
const es = (): boolean => lang() === 'es'
const fname = (f: FilmStyle): string => (es() ? f.name : f.en)
const fline = (f: FilmStyle): string => (es() ? f.line : f.lineEn)

/** Nombre del estilo elegido para la barra. */
function choiceName(v: VideoStyleChoice): string {
  if (v === 'dinamico') return t('Rápido: texto animado')
  if (v === 'cartoon') return t('Dibujos con presentador')
  const f = filmStyle(v)
  return f ? fname(f) : v
}

/**
 * «/video …»: una barra encima del cuadro con el estilo elegido y, al abrirla, todos los estilos con una muestra de
 * cada uno, por categorías y con buscador. Elegir uno pone «estilo:…» en el texto (así también vale escribiéndolo).
 */
export function FilmStylePicker({ value, open, onOpen, onChoose }: Props) {
  const [q, setQ] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    setQ('')
    searchRef.current?.focus()
    panelRef.current?.querySelector('[aria-checked="true"]')?.scrollIntoView?.({ block: 'nearest' })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpen])

  const groups = useMemo(() => {
    const nq = norm(q.trim())
    const hit = (f: (typeof FILM_STYLES)[number]): boolean =>
      !nq || [f.name, f.en, f.line, f.lineEn, f.slug].some((x) => norm(x).includes(nq))
    return FILM_CATEGORIES.map((c) => ({ ...c, styles: FILM_STYLES.filter((f) => f.category === c.id && hit(f)) })).filter((g) => g.styles.length)
  }, [q])
  const quickHit = (name: string): boolean => !q.trim() || norm(name).includes(norm(q.trim()))

  const choose = (v: VideoStyleChoice): void => {
    onChoose(v)
    onOpen(false)
  }
  const thumb = value !== 'dinamico' && value !== 'cartoon' ? THUMBS[value] : undefined

  return (
    <div className={s.wrap}>
      <button type="button" className={s.bar} onClick={() => onOpen(!open)} aria-expanded={open} aria-haspopup="dialog">
        {thumb ? <img src={thumb} alt="" className={s.barThumb} /> : <span className={s.barIcon}>{value === 'cartoon' ? <Smile size={14} /> : <Clapperboard size={14} />}</span>}
        <span className={s.barLabel}>{t('Estilo del vídeo')}</span>
        <span className={s.barName}>{choiceName(value)}</span>
        <ChevronDown size={14} className={cx(s.chev, open && s.chevOpen)} aria-hidden="true" />
      </button>
      {open && (
        <div ref={panelRef} className={s.panel} role="dialog" aria-label={t('Elige el estilo del vídeo')}>
          <div className={s.head}>
            <Search size={14} aria-hidden="true" className={s.searchIcon} />
            <input
              ref={searchRef}
              className={s.search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('Buscar estilo (acuarela, píxel, anime…)')}
              aria-label={t('Buscar estilo')}
            />
            <button type="button" className={s.close} onClick={() => onOpen(false)} aria-label={t('Cerrar')}>
              <X size={14} />
            </button>
          </div>
          <div className={s.body} role="radiogroup" aria-label={t('Estilos')}>
            {(quickHit(choiceName('dinamico')) || quickHit(choiceName('cartoon'))) && (
              <section>
                <h4 className={s.cat}>{t('Rápidos (en unos minutos)')}</h4>
                <div className={s.grid}>
                  {(['dinamico', 'cartoon'] as const)
                    .filter((v) => quickHit(choiceName(v)))
                    .map((v) => (
                      <button key={v} type="button" role="radio" aria-checked={value === v} className={cx(s.card, value === v && s.cardOn)} onClick={() => choose(v)}>
                        <span className={cx(s.thumb, s.quick)}>{v === 'cartoon' ? <Smile size={26} /> : <Clapperboard size={26} />}</span>
                        <span className={s.name}>{choiceName(v)}</span>
                        <span className={s.line}>
                          {v === 'cartoon' ? t('Un personaje dibujado lo explica, con humor.') : t('Texto grande con ritmo, como en TikTok.')}
                        </span>
                        {value === v && <Check size={14} className={s.check} aria-hidden="true" />}
                      </button>
                    ))}
                </div>
              </section>
            )}
            {groups.map((g) => (
              <section key={g.id}>
                <h4 className={s.cat}>{es() ? g.name : g.en}</h4>
                <div className={s.grid}>
                  {g.styles.map((f) => (
                    <button
                      key={f.slug}
                      type="button"
                      role="radio"
                      aria-checked={value === f.slug}
                      className={cx(s.card, value === f.slug && s.cardOn)}
                      onClick={() => choose(f.slug)}
                      title={`${fname(f)}${es() ? ` · ${f.en}` : ''}\n${fline(f)}`}
                    >
                      <span className={s.thumb}>{THUMBS[f.slug] && <img src={THUMBS[f.slug]} alt="" loading="lazy" />}</span>
                      <span className={s.name}>{fname(f)}</span>
                      <span className={s.line}>{fline(f)}</span>
                      {f.needs === 'material' && <span className={s.badge}>{t('Con material real')}</span>}
                      {f.base && <span className={s.badge}>{t('Estilo de kywai')}</span>}
                      {value === f.slug && <Check size={14} className={s.check} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {!groups.length && !quickHit(choiceName('dinamico')) && !quickHit(choiceName('cartoon')) && <p className={s.empty}>{t('Ningún estilo se llama así.')}</p>}
          </div>
          <p className={s.foot}>{t('Los estilos de película los dirige un agente con terminal y tardan más (de 20 minutos a una hora). Muestras: películas de ejemplo de Lemo-Opuscar (CC BY 4.0); en los estilos de kywai, fotogramas hechos por kywai.')}</p>
        </div>
      )}
    </div>
  )
}
