import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Clapperboard, ImagePlus, Layers, Plus, Search, Smile, Sparkles, Trash2, UserRound, X } from 'lucide-react'
import { FILM_CATEGORIES, FILM_STYLES, filmStyle, type FilmStyle } from '@shared/filmStyles'
import { ROBOTS_CHARACTER, type VideoChoice, type VideoKind } from '@shared/videoChoice'
import type { CoworkApi, VideoCharacterInfo } from '@shared/types'
import { cx } from '../common/util'
import { lang, t } from '@/lib/i18n'
import hermesPng from '@/assets/robots/hermes.png'
import claudePng from '@/assets/robots/claude.png'
import codexPng from '@/assets/robots/codex.png'
import s from './VideoPicker.module.css'

// Una muestra de cada estilo (un fotograma de su película de ejemplo, 320×180). Las de la biblioteca Lemo-Opuscar son
// de sus películas demo (CC BY 4.0, lemomo-ai/lemo-opuscar); las de los estilos de kywai, hechas por kywai.
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
  api: CoworkApi
  value: VideoChoice
  open: boolean
  onOpen: (open: boolean) => void
  onChoose: (choice: VideoChoice) => void
}

// Los nombres y las líneas del catálogo van en español y en inglés (en otros idiomas, el inglés).
const es = (): boolean => lang() === 'es'
const fname = (f: FilmStyle): string => (es() ? f.name : f.en)
const fline = (f: FilmStyle): string => (es() ? f.line : f.lineEn)

const KINDS: { id: VideoKind; icon: typeof Clapperboard; name: string; line: string }[] = [
  { id: 'rapido', icon: Clapperboard, name: 'Rápido: texto animado', line: 'Frases grandes con ritmo, al compás de la voz.' },
  { id: 'presentador', icon: Smile, name: 'Dibujos con presentador', line: 'Un personaje dibujado lo explica, con humor.' },
  { id: 'mixto', icon: Layers, name: 'Mixto', line: 'El presentador y golpes de texto grande, alternados.' }
]

const kindName = (k: VideoKind): string => t(KINDS.find((x) => x.id === k)!.name)
const charName = (c: VideoCharacterInfo): string => (c.builtin ? t('Robots de kywai') : c.name)

/** Reduce una imagen a 1024 px como mucho (WebP, conserva la transparencia) y saca una miniatura JPEG de 256 px. */
async function shrink(file: File, max: number, type: 'image/webp' | 'image/jpeg', square = false): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => ko(new Error(t('«{name}» no es una imagen PNG, JPG o WebP', { name: file.name })))
      i.src = url
    })
    const w = img.naturalWidth
    const h = img.naturalHeight
    const c = document.createElement('canvas')
    if (square) {
      const side = Math.min(w, h)
      c.width = c.height = max
      const g = c.getContext('2d')!
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, max, max)
      g.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, max, max)
    } else {
      const k = Math.min(1, max / Math.max(w, h))
      c.width = Math.round(w * k)
      c.height = Math.round(h * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    }
    return c.toDataURL(type, 0.88).replace(/^data:[^,]+,/, '')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Crear un personaje: nombre, y descripción, imágenes o las dos cosas. Se guarda para todos los proyectos. */
function AddCharacter({ api, onDone, onCancel }: { api: CoworkApi; onDone: (id: string, list: VideoCharacterInfo[]) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [files, setFiles] = useState<{ file: File; url: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), [files])
  const add = (list: FileList | null): void => {
    const imgs = [...(list ?? [])].filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type))
    setFiles((cur) => [...cur, ...imgs.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 6))
  }
  const ready = !!name.trim() && (!!about.trim() || files.length > 0)
  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const images = await Promise.all(files.map(async (f, i) => ({ name: f.file.name || `imagen-${i + 1}.webp`, data: await shrink(f.file, 1024, 'image/webp') })))
      const thumb = files[0] ? await shrink(files[0].file, 256, 'image/jpeg', true) : undefined
      const r = await api.addVideoCharacter({ name: name.trim(), description: about.trim(), images, ...(thumb ? { thumb } : {}) })
      onDone(r.id, r.characters)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <div className={s.add}>
      <h4 className={s.addTitle}>{t('Nuevo personaje')}</h4>
      <p className={s.addHelp}>{t('Cuéntalo con palabras, con imágenes o con las dos cosas. Se guarda para usarlo en todos tus vídeos y se dibuja en el estilo que elijas.')}</p>
      <label className={s.field}>
        <span>{t('Nombre')}</span>
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('Por ejemplo: Doña Rosa')} autoFocus />
      </label>
      <label className={s.field}>
        <span>{t('Cómo es')}</span>
        <textarea
          value={about}
          maxLength={1500}
          rows={3}
          onChange={(e) => setAbout(e.target.value)}
          placeholder={t('Por ejemplo: una abuela panadera, bajita, con moño gris, gafas redondas y delantal azul; muy risueña.')}
        />
      </label>
      <div className={s.field}>
        <span>{t('Imágenes (hasta 6)')}</span>
        <div className={s.pics}>
          {files.map((f, i) => (
            <span key={f.url} className={s.pic}>
              <img src={f.url} alt="" />
              <button type="button" onClick={() => setFiles((cur) => cur.filter((_, k) => k !== i))} aria-label={t('Quitar')}>
                <X size={12} />
              </button>
            </span>
          ))}
          {files.length < 6 && (
            <button type="button" className={s.picAdd} onClick={() => fileRef.current?.click()}>
              <ImagePlus size={18} />
              <span>{t('Añadir')}</span>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
      </div>
      {error && <p className={s.error}>{error}</p>}
      <div className={s.addActions}>
        <button type="button" className={s.ghost} onClick={onCancel} disabled={busy}>
          {t('Cancelar')}
        </button>
        <button type="button" className={s.primary} onClick={() => void save()} disabled={!ready || busy}>
          {busy ? t('Guardando…') : t('Guardar personaje')}
        </button>
      </div>
    </div>
  )
}

/**
 * «/video …»: una barra encima del cuadro con lo elegido y, al abrirla, los tres pasos: el tipo de vídeo, el
 * personaje (ninguno, los robots de kywai, los creados por el usuario o uno nuevo) y el estilo de animación, con una
 * muestra de cada uno. Lo elegido se pone en el texto como marcas («tipo:…», «personaje:…», «estilo:…»).
 */
export function VideoPicker({ api, value, open, onOpen, onChoose }: Props) {
  const [q, setQ] = useState('')
  const [chars, setChars] = useState<VideoCharacterInfo[]>([])
  const [adding, setAdding] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const charRef = useRef<HTMLElement>(null)
  const styleRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    setQ('')
    setAdding(false)
    void api.listVideoCharacters?.().then(setChars, () => undefined)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpen, api])

  const groups = useMemo(() => {
    const nq = norm(q.trim())
    const hit = (f: FilmStyle): boolean => !nq || [f.name, f.en, f.line, f.lineEn, f.slug].some((x) => norm(x).includes(nq))
    return FILM_CATEGORIES.map((c) => ({ ...c, styles: FILM_STYLES.filter((f) => f.category === c.id && hit(f)) })).filter((g) => g.styles.length)
  }, [q])
  const quickHit = !q.trim() || norm(t('El de kywai (rápido)')).includes(norm(q.trim()))

  const set = (patch: Partial<VideoChoice>, next?: React.RefObject<HTMLElement | null>): void => {
    onChoose({ ...value, ...patch })
    next?.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }
  const remove = async (c: VideoCharacterInfo): Promise<void> => {
    if (!window.confirm(t('¿Borrar el personaje «{name}»? Sus imágenes también se borran.', { name: c.name }))) return
    try {
      setChars(await api.removeVideoCharacter(c.id))
      if (value.character === c.id) set({ character: null })
    } catch {
      /* se queda como estaba */
    }
  }

  const style = value.style ? filmStyle(value.style) : undefined
  const chosenChar = value.character ? chars.find((c) => c.id === value.character) : undefined
  const summary = [
    kindName(value.kind),
    value.character ? (chosenChar ? charName(chosenChar) : value.character === ROBOTS_CHARACTER ? t('Robots de kywai') : t('Personaje')) : '',
    style ? fname(style) : t('Estilo de kywai')
  ].filter(Boolean)
  const thumb = value.style ? THUMBS[value.style] : undefined
  const KindIcon = KINDS.find((k) => k.id === value.kind)!.icon

  return (
    <div className={s.wrap}>
      <button type="button" className={s.bar} onClick={() => onOpen(!open)} aria-expanded={open} aria-haspopup="dialog">
        {thumb ? <img src={thumb} alt="" className={s.barThumb} /> : <span className={s.barIcon}><KindIcon size={14} /></span>}
        <span className={s.barLabel}>{t('Vídeo')}</span>
        <span className={s.barName}>{summary.join(' · ')}</span>
        <ChevronDown size={14} className={cx(s.chev, open && s.chevOpen)} aria-hidden="true" />
      </button>
      {open && (
        <div ref={panelRef} className={s.panel} role="dialog" aria-label={t('Elige cómo será el vídeo')}>
          <div className={s.head}>
            <span className={s.headTitle}>{adding ? t('Agregar personaje') : t('¿Cómo quieres el vídeo?')}</span>
            <button type="button" className={s.close} onClick={() => onOpen(false)} aria-label={t('Cerrar')}>
              <X size={14} />
            </button>
          </div>
          {adding ? (
            <div className={s.body}>
              <AddCharacter
                api={api}
                onCancel={() => setAdding(false)}
                onDone={(id, list) => {
                  setChars(list)
                  setAdding(false)
                  set({ character: id })
                }}
              />
            </div>
          ) : (
            <div className={s.body}>
              <section>
                <h4 className={s.step}>
                  <b>1</b> {t('Tipo de vídeo')}
                </h4>
                <div className={s.grid} role="radiogroup" aria-label={t('Tipo de vídeo')}>
                  {KINDS.map((k) => (
                    <button key={k.id} type="button" role="radio" aria-checked={value.kind === k.id} className={cx(s.card, value.kind === k.id && s.cardOn)} onClick={() => set({ kind: k.id }, charRef)}>
                      <span className={cx(s.thumb, s.quick, s.kindThumb)}>
                        <k.icon size={24} />
                      </span>
                      <span className={s.name}>{t(k.name)}</span>
                      <span className={s.line}>{t(k.line)}</span>
                      {value.kind === k.id && <Check size={14} className={s.check} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </section>

              <section ref={charRef}>
                <h4 className={s.step}>
                  <b>2</b> {t('Personaje')}
                </h4>
                <div className={s.grid} role="radiogroup" aria-label={t('Personaje')}>
                  <button type="button" role="radio" aria-checked={!value.character} className={cx(s.card, !value.character && s.cardOn)} onClick={() => set({ character: null }, styleRef)}>
                    <span className={cx(s.thumb, s.quick, s.none)}>
                      <UserRound size={26} />
                    </span>
                    <span className={s.name}>{t('Ninguno (genérico)')}</span>
                    <span className={s.line}>{t('Sin personaje fijo: kywai pone el que pida el tema.')}</span>
                    {!value.character && <Check size={14} className={s.check} aria-hidden="true" />}
                  </button>
                  {chars.map((c) => {
                    const on = value.character === c.id
                    return (
                      <div key={c.id} className={s.cardWrap}>
                        <button type="button" role="radio" aria-checked={on} className={cx(s.card, on && s.cardOn)} onClick={() => set({ character: c.id }, styleRef)}>
                          <span className={cx(s.thumb, s.charThumb)}>
                            {c.builtin ? (
                              <span className={s.robots}>
                                <img src={hermesPng} alt="" />
                                <img src={claudePng} alt="" />
                                <img src={codexPng} alt="" />
                              </span>
                            ) : c.thumb ? (
                              <img src={c.thumb} alt="" />
                            ) : (
                              <span className={s.initial}>{c.name.slice(0, 1).toUpperCase()}</span>
                            )}
                          </span>
                          <span className={s.name}>{charName(c)}</span>
                          <span className={s.line}>{c.builtin ? t('Hermes, Claude y Codex, en el estilo que elijas.') : c.description || (c.images === 1 ? t('1 imagen') : t('{n} imágenes', { n: c.images }))}</span>
                          {on && <Check size={14} className={s.check} aria-hidden="true" />}
                        </button>
                        {!c.builtin && (
                          <button type="button" className={s.del} onClick={() => void remove(c)} aria-label={t('Borrar el personaje «{name}»', { name: c.name })} title={t('Borrar')}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  <button type="button" className={cx(s.card, s.addCard)} onClick={() => setAdding(true)}>
                    <span className={cx(s.thumb, s.quick, s.none)}>
                      <Plus size={26} />
                    </span>
                    <span className={s.name}>{t('Agregar personaje')}</span>
                    <span className={s.line}>{t('Con una descripción, imágenes o ambas; queda guardado.')}</span>
                  </button>
                </div>
              </section>

              <section ref={styleRef}>
                <h4 className={s.step}>
                  <b>3</b> {t('Estilo de animación')}
                </h4>
                <div className={s.searchRow}>
                  <Search size={14} aria-hidden="true" className={s.searchIcon} />
                  <input className={s.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar estilo (acuarela, píxel, anime…)')} aria-label={t('Buscar estilo')} />
                </div>
                <div role="radiogroup" aria-label={t('Estilos')}>
                  {quickHit && (
                    <div className={s.grid}>
                      <button type="button" role="radio" aria-checked={!value.style} className={cx(s.card, !value.style && s.cardOn)} onClick={() => set({ style: null })}>
                        <span className={cx(s.thumb, s.quick)}>
                          <Sparkles size={26} />
                        </span>
                        <span className={s.name}>{t('El de kywai (rápido)')}</span>
                        <span className={s.line}>{t('Listo en unos minutos, con las imágenes y la voz de kywai.')}</span>
                        {!value.style && <Check size={14} className={s.check} aria-hidden="true" />}
                      </button>
                    </div>
                  )}
                  {groups.map((g) => (
                    <div key={g.id}>
                      <h5 className={s.cat}>{es() ? g.name : g.en}</h5>
                      <div className={s.grid}>
                        {g.styles.map((f) => (
                          <button
                            key={f.slug}
                            type="button"
                            role="radio"
                            aria-checked={value.style === f.slug}
                            className={cx(s.card, value.style === f.slug && s.cardOn)}
                            onClick={() => set({ style: f.slug })}
                            title={`${fname(f)}${es() ? ` · ${f.en}` : ''}\n${fline(f)}`}
                          >
                            <span className={s.thumb}>{THUMBS[f.slug] && <img src={THUMBS[f.slug]} alt="" loading="lazy" />}</span>
                            <span className={s.name}>{fname(f)}</span>
                            <span className={s.line}>{fline(f)}</span>
                            {f.needs === 'material' && <span className={s.badge}>{t('Con material real')}</span>}
                            {f.base && <span className={s.badge}>{t('Estilo de kywai')}</span>}
                            {value.style === f.slug && <Check size={14} className={s.check} aria-hidden="true" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!groups.length && !quickHit && <p className={s.empty}>{t('Ningún estilo se llama así.')}</p>}
                </div>
              </section>
            </div>
          )}
          {!adding && (
            <div className={s.foot}>
              <p>{t('Los estilos de película los dirige un agente con terminal y tardan más (de 20 minutos a una hora). Muestras: películas de ejemplo de Lemo-Opuscar (CC BY 4.0); en los estilos de kywai, fotogramas hechos por kywai.')}</p>
              <button type="button" className={s.primary} onClick={() => onOpen(false)}>
                {t('Listo: escribe de qué va')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
