import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ExternalLink, LoaderCircle, Music, Pause, Play, Search, SkipBack, SkipForward } from 'lucide-react'
import { SPOTIFAST_DOWNLOAD, SPOTIFAST_GUIDE, spotifyUriOf, type SpotifastAction, type SpotifastSearchKind, type SpotifastStatus } from '@shared/spotifast'
import { api, isWeb } from '@/lib/api'
import { togglePlay, useMusic } from '@/lib/music'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './MusicPanel.module.css'
import { t } from '@/lib/i18n'

const POLL_MS = 2000

const KIND_LABEL: Record<SpotifastSearchKind, string> = {
  track: t('Canción'),
  artist: t('Artista'),
  album: t('Álbum'),
  playlist: t('Lista')
}

/** «215000» ms → «3:35». */
function clock(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms < 0) return '0:00'
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Antes de poner algo en Spotifast se pausa lo que suene en kywai, para no oír dos cosas a la vez. */
function pauseKywai(): void {
  if (useMusic.getState().status === 'playing') togglePlay()
}

/**
 * Pestaña Spotifast de la música: maneja la app Spotifast (Spotify con Premium) instalada en el equipo donde corre
 * kywai. Buscar y poner, pegar un enlace de Spotify, atrás / pausa / adelante, posición y volumen. El sonido sale de
 * Spotifast, no de kywai.
 */
export function SpotifastBox() {
  const [status, setStatus] = useState<SpotifastStatus | null>(null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<SpotifastSearchKind>('track')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [volume, setVolume] = useState<number | null>(null)
  const alive = useRef(true)
  const call = api?.spotifast

  async function send(action: SpotifastAction): Promise<void> {
    if (!call) return
    if (action.kind !== 'status') setBusy(true)
    try {
      const next = await call(action)
      if (alive.current) setStatus(next)
    } catch (err) {
      if (alive.current) setProblem(errorText(err))
    } finally {
      if (alive.current && action.kind !== 'status') setBusy(false)
    }
  }

  // Qué suena, cada 2 s mientras la pestaña está a la vista.
  useEffect(() => {
    alive.current = true
    void send({ kind: 'status' })
    const timer = window.setInterval(() => {
      if (!document.hidden) void send({ kind: 'status' })
    }, POLL_MS)
    return () => {
      alive.current = false
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!call) {
    return <p className={s.note}>{t('Este servidor de kywai todavía no sabe manejar Spotifast: actualízalo.')}</p>
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const text = query.trim()
    if (!text || busy) return
    setProblem(null)
    pauseKywai()
    if (spotifyUriOf(text)) await send({ kind: 'link', link: text })
    else if (/spotify/i.test(text) && /^\S+$/.test(text)) {
      setProblem(t('Ese enlace no es de una canción, álbum, artista o lista de Spotify.'))
      return
    } else await send({ kind: 'search', query: text, type: kind })
    setQuery('')
  }

  const where = isWeb ? t('en el ordenador donde corre kywai') : t('en este ordenador')

  if (!status) {
    return (
      <p className={s.note}>
        <LoaderCircle size={13} className={u.spin} aria-hidden="true" /> {t('Buscando Spotifast…')}
      </p>
    )
  }

  if (!status.installed) {
    return (
      <div className={s.search}>
        <p className={s.empty}>
          {t('Spotifast es una app gratis y de código abierto para escuchar Spotify con Premium. No está instalada {where}.', { where })}
        </p>
        <div className={s.form}>
          <a className={cx(u.btn, u.btnPrimary, u.btnSm, s.linkBtn)} href={SPOTIFAST_DOWNLOAD} target="_blank" rel="noreferrer">
            {t('Instalar Spotifast')} <ExternalLink size={12} aria-hidden="true" />
          </a>
          <a className={cx(u.btn, u.btnSm, s.linkBtn)} href={SPOTIFAST_GUIDE} target="_blank" rel="noreferrer">
            {t('Cómo se configura')} <ExternalLink size={12} aria-hidden="true" />
          </a>
          <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => void send({ kind: 'status' })}>
            {t('Ya la he instalado')}
          </button>
        </div>
        <p className={s.note}>{t('Al abrirla la primera vez pide crear tu propia app gratis de Spotify y una cuenta Premium. Luego vuelve aquí.')}</p>
      </div>
    )
  }

  const playing = status.state === 'playing'
  const hasTrack = status.running && status.state !== 'stopped'
  const duration = status.durationMs ?? 0
  const position = drag ?? status.positionMs ?? 0

  const commitSeek = (): void => {
    if (drag === null) return
    void send({ kind: 'seekTo', seconds: Math.floor(drag / 1000) })
    setDrag(null)
  }
  const commitVolume = (): void => {
    if (volume === null) return
    void send({ kind: 'volume', percent: volume })
    setVolume(null)
  }

  return (
    <div className={s.search}>
      <form className={s.form} onSubmit={(e) => void submit(e)} role="search">
        <div className={s.searchField}>
          <Search size={15} aria-hidden="true" className={s.searchIcon} />
          <input
            className={cx(s.input, s.searchInput)}
            type="search"
            placeholder={t('Busca en Spotify o pega un enlace de Spotify')}
            aria-label={t('Buscar en Spotify o pegar un enlace de Spotify')}
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value)
              setProblem(null)
            }}
          />
        </div>
        <select
          className={cx(s.input, s.spotifastKind)}
          value={kind}
          onChange={(e) => setKind(e.currentTarget.value as SpotifastSearchKind)}
          aria-label={t('Qué buscar')}
          title={t('Qué buscar: suena lo que mejor encaje')}
        >
          {(Object.keys(KIND_LABEL) as SpotifastSearchKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <button type="submit" className={cx(u.btn, u.btnPrimary, u.btnSm)} disabled={!query.trim() || busy}>
          {busy ? <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> : t('Poner')}
        </button>
      </form>
      {problem && (
        <p className={s.formError} role="alert">
          {problem}
        </p>
      )}

      {!status.running ? (
        <div className={s.form}>
          <p className={s.empty}>{t('Spotifast está instalada pero cerrada.')}</p>
          <button type="button" className={cx(u.btn, u.btnPrimary, u.btnSm)} disabled={busy} onClick={() => void send({ kind: 'open' })}>
            {busy ? <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> : t('Abrir Spotifast')}
          </button>
        </div>
      ) : (
        <>
          <div className={s.playerBox}>
            <div className={s.artwork}>
              {status.art ? <img className={s.artworkImg} src={status.art} alt="" /> : <Music size={40} aria-hidden="true" />}
              <div className={s.artworkText}>
                <span className={s.artworkTitle}>{hasTrack ? status.title || t('Sin título') : t('Nada sonando en Spotifast')}</span>
                <span className={s.artworkSub}>
                  {hasTrack ? [status.artists, status.album].filter(Boolean).join(' · ') : t('Busca algo arriba o pega un enlace de Spotify.')}
                </span>
                {status.device && <span className={s.artworkSub}>{t('Suena en {device}', { device: status.device })}</span>}
                <button type="button" className={s.source} onClick={() => void send({ kind: 'open' })}>
                  {t('Ver Spotifast')} <ExternalLink size={11} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
          <div className={s.transport}>
            <div className={s.progress}>
              <span className={s.time}>{clock(position)}</span>
              <input
                className={s.seek}
                type="range"
                min={0}
                max={Math.max(1, duration)}
                step={1000}
                value={Math.min(position, duration || 1)}
                disabled={!hasTrack || !duration}
                aria-label={t('Posición de la canción')}
                aria-valuetext={`${clock(position)} de ${clock(duration)}`}
                onChange={(e) => setDrag(Number(e.currentTarget.value))}
                onPointerUp={commitSeek}
                onKeyUp={commitSeek}
                onBlur={commitSeek}
              />
              <span className={s.time}>{clock(duration)}</span>
            </div>
            <div className={s.buttons}>
              <button type="button" className={cx(u.iconBtn, s.navBtn)} onClick={() => void send({ kind: 'previous' })} disabled={!hasTrack} aria-label={t('Anterior')} title={t('Anterior')}>
                <SkipBack size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={s.playBtn}
                disabled={!hasTrack}
                onClick={() => {
                  if (!playing) pauseKywai()
                  void send({ kind: 'playpause' })
                }}
                aria-label={playing ? t('Pausa') : t('Reproducir')}
                title={playing ? t('Pausa') : t('Reproducir')}
              >
                {playing ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
              </button>
              <button type="button" className={cx(u.iconBtn, s.navBtn)} onClick={() => void send({ kind: 'next' })} disabled={!hasTrack} aria-label={t('Siguiente')} title={t('Siguiente')}>
                <SkipForward size={18} aria-hidden="true" />
              </button>
              <input
                className={cx(s.seek, s.spotifastVolume)}
                type="range"
                min={0}
                max={100}
                step={1}
                value={volume ?? status.volume ?? 0}
                aria-label={t('Volumen de Spotifast')}
                title={t('Volumen de Spotifast: {percent} %', { percent: volume ?? status.volume ?? 0 })}
                onChange={(e) => setVolume(Number(e.currentTarget.value))}
                onPointerUp={commitVolume}
                onKeyUp={commitVolume}
                onBlur={commitVolume}
              />
            </div>
          </div>
        </>
      )}
      <p className={s.note}>
        {t('Suena en la app Spotifast {where}, con tu cuenta de Spotify Premium; kywai solo la maneja. Las luces del espacio no oyen este sonido.', { where })}
      </p>
    </div>
  )
}
