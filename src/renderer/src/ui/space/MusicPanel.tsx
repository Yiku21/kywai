import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import {
  ExternalLink,
  Hand,
  Info,
  ListMusic,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Minus,
  Music,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import { musicSourceOf, webPageOf, type MusicSource } from '@shared/musicSources'
import type { MusicResult, MusicSearchKind } from '@shared/types'
import { api, isWeb } from '@/lib/api'
import { getVolume, isMuted, setMuted, setVolume, subscribeAudio } from '@/lib/audio'
import {
  bindPlayer,
  clearQueue,
  enqueue,
  getPlayer,
  lookupTempo,
  musicLightLevel,
  next,
  nudgeOffset,
  onPlayerState,
  playFrom,
  playIndex,
  previous,
  recoverFromError,
  removeFromQueue,
  resyncNow,
  scaleBpm,
  seek,
  setLightsOn,
  setManualBpm,
  setMusicBar,
  setMusicMini,
  setMusicOpen,
  setTrackNames,
  takePending,
  tapBeat,
  tempoOf,
  togglePlay,
  unbindPlayer,
  useMusic
} from '@/lib/music'
import { canSyncWithAudio, ensureAudioSync, startAudioSync, stopAudioSync, useAudioSync } from '@/lib/audioSync'
import { parseStartSeconds, parseVideoId, type YtPlayer } from '@/lib/youtube'
import { createMusicPlayer } from '@/lib/musicPlayer'
import { useCowork } from '@/store/cowork'
import { useEscape } from '../common/hooks'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './MusicPanel.module.css'
import { t } from '@/lib/i18n'

const ERRORS: Record<number, string> = {
  2: t('El enlace no es un vídeo válido de YouTube.'),
  5: t('El reproductor de YouTube no pudo reproducir este vídeo.'),
  100: t('El vídeo no existe o es privado.'),
  101: t('El autor no permite reproducir este vídeo fuera de YouTube.'),
  150: t('El autor no permite reproducir este vídeo fuera de YouTube.'),
  152: t('YouTube no aceptó la identificación de kywai (error 152). Actualiza la app de escritorio.'),
  153: t('YouTube no aceptó la identificación de kywai (error 153). Actualiza la app de escritorio.'),
  1001: t('Se interrumpió la carga del audio.'),
  1002: t('No llega el audio: sin conexión o el servidor no responde.'),
  1003: t('El audio llegó dañado y no se puede reproducir.'),
  1004: t('Esta canción o radio no está disponible ahora.')
}

const SOURCE_LABEL: Record<MusicSource, string> = { youtube: 'YouTube', audius: 'Audius', radio: 'SomaFM' }
const OPEN_LABEL: Record<MusicSource, string> = {
  youtube: t('Abrir en YouTube Music'),
  audius: t('Abrir en Audius'),
  radio: t('Abrir en SomaFM')
}

const CONFIDENCE_LABEL = { alta: t('Confianza alta'), media: t('Confianza media'), baja: t('Confianza baja'), manual: t('Manual') } as const

/** «215» → «3:35». */
function clock(sec: number | undefined): string {
  if (!sec || !Number.isFinite(sec) || sec < 0) return '0:00'
  const t = Math.floor(sec)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const ss = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/**
 * Música en el espacio digital, como YouTube Music: buscar canciones, cola, atrás / pausa / adelante, posición y
 * volumen. Suena en el reproductor oficial de YouTube (aislado y siempre a la vista, como exige YouTube) y las
 * luces del espacio siguen su ritmo, sin micrófono.
 */
export function MusicPanel() {
  const open = useMusic((st) => st.open)
  const mini = useMusic((st) => st.mini)
  const bar = useMusic((st) => st.mini && st.bar)
  const videoId = useMusic((st) => st.videoId)
  const song = useMusic((st) => {
    const track = st.videoId ? st.tracks[st.videoId] : undefined
    return track?.title ? `${track.title}${track.artist ? ` · ${track.artist}` : ''}` : undefined
  })
  const error = useMusic((st) => st.error)
  const notice = useMusic((st) => st.notice)
  const status = useMusic((st) => st.status)
  const queueLength = useMusic((st) => st.queue.length)
  const permalink = useMusic((st) => st.queue[st.index]?.permalink)
  const source = musicSourceOf(videoId)
  const host = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YtPlayer | null>(null)

  // Esc: con una canción se minimiza (sigue sonando); sin ella, se cierra.
  useEscape(open && !mini, () => (useMusic.getState().videoId ? setMusicMini(true) : setMusicOpen(false)))

  // El reproductor se crea la primera vez que hay una canción con el panel abierto y se conserva al cerrarlo (en pausa).
  useEffect(() => {
    if (!open || !videoId || playerRef.current || !host.current) return
    const first = videoId
    const wanted = takePending()
    const player = createMusicPlayer(host.current, {
      videoId: first,
      start: wanted.start,
      events: {
        onReady: () => {
          bindPlayer(player)
          const st = useMusic.getState()
          const later = takePending()
          const autoplay = wanted.autoplay || later.autoplay
          // Si mientras cargaba se eligió otra canción, se pasa a esa.
          if (st.videoId && st.videoId !== first) {
            if (autoplay && st.open) player.loadVideoById(st.videoId, later.start)
            else player.cueVideoById(st.videoId, later.start)
          } else if (st.open && autoplay) player.playVideo()
          if (!st.open) player.pauseVideo()
          onPlayerState(player.getPlayerState())
        },
        onStateChange: (state) => onPlayerState(state),
        onPlaybackRateChange: () => resyncNow(),
        // Si su discográfica no la deja oír fuera de YouTube, se prueba otra subida; si no, la siguiente.
        onError: (code) => void recoverFromError(code, ERRORS[code] ?? t('YouTube devolvió el error {code}.', { code }))
      }
    })
    playerRef.current = player
  }, [open, videoId])

  useEffect(
    () => () => {
      unbindPlayer()
      try {
        playerRef.current?.destroy()
      } catch {
        /* ya destruido */
      }
      playerRef.current = null
    },
    []
  )

  return (
    <section
      className={cx(s.panel, mini && s.mini, bar && s.bar)}
      hidden={!open}
      aria-label={mini ? t('Reproductor de música (minimizado)') : t('Música y luces al ritmo')}
    >
      {bar ? null : mini ? (
        <MiniHead />
      ) : (
        <header className={s.head}>
          <Music size={17} aria-hidden="true" className={s.headIcon} />
          <h3 className={s.title}>{t('Música')}</h3>
          <span className={s.headHint}>{t('YouTube, Audius y radios · luces al ritmo')}</span>
          {videoId && (
            <button
              type="button"
              className={cx(u.iconBtn, u.iconBtnSm)}
              onClick={() => setMusicMini(true)}
              aria-label={t('Minimizar (sigue sonando)')}
              title={t('Minimizar (sigue sonando)')}
            >
              <Minimize2 size={15} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={cx(u.iconBtn, u.iconBtnSm)}
            onClick={() => setMusicOpen(false)}
            aria-label={t('Cerrar la música (se pausa)')}
            title={t('Cerrar (la música se pausa)')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
      )}

      {!mini && <SearchBox />}

      {isWeb && !mini && source === 'youtube' && (
        <p className={s.note}>
          {t('Desde el navegador, YouTube no deja reproducir muchas canciones de discográficas (error 150): se busca otra subida de la misma canción. En la app de escritorio del Mac sí suenan todas.')}
        </p>
      )}

      {videoId ? (
        <div className={s.playerBox} title={bar ? song : undefined}>
          <div ref={host} className={s.player} />
          {source !== 'youtube' && <Artwork />}
        </div>
      ) : mini ? null : (
        <p className={s.empty}>
          {t('Busca una canción o un artista, o pega un enlace de YouTube. Sin anuncios: Audius (música que suben los propios artistas) y las radios de SomaFM. Las luces del espacio siguen su ritmo, sin usar el micrófono.')}
        </p>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
          {videoId && (
            <>
              {' '}
              <a className={s.source} href={webPageOf(videoId, permalink)} target="_blank" rel="noreferrer">
                {OPEN_LABEL[source]} <ExternalLink size={11} aria-hidden="true" />
              </a>
            </>
          )}
        </p>
      )}
      {notice && !error && (
        <p className={s.note} role="status">
          {notice}
        </p>
      )}

      {videoId && !mini && <TrackInfo />}
      {videoId && <Transport bar={bar} />}
      {queueLength > 1 && !mini && <Queue />}
      {videoId && !mini && (
        <details className={s.lights}>
          <summary>
            <LightsSummary />
          </summary>
          <SyncControls playing={status === 'playing'} />
        </details>
      )}
      {!mini && <Limits />}
    </section>
  )
}

/** Cabecera del reproductor minimizado: la canción, dejar solo los botones, abrir entero y cerrar. */
function MiniHead() {
  const track = useMusic((st) => (st.videoId ? st.tracks[st.videoId] : undefined))
  const label = track ? `${track.title}${track.artist ? ` · ${track.artist}` : ''}` : undefined
  return (
    <header className={s.miniHead}>
      <Music size={14} aria-hidden="true" className={s.headIcon} />
      <span className={s.miniTitle} title={label}>
        {track?.title || t('Música')}
        {track?.artist && <span className={s.miniArtist}> · {track.artist}</span>}
      </span>
      <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => setMusicBar(true)} aria-label={t('Dejar solo los botones')} title={t('Dejar solo los botones (atrás, pausa y adelante)')}>
        <Minimize2 size={14} aria-hidden="true" />
      </button>
      <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => setMusicMini(false)} aria-label={t('Abrir el reproductor')} title={t('Abrir el reproductor')}>
        <Maximize2 size={14} aria-hidden="true" />
      </button>
      <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => setMusicOpen(false)} aria-label={t('Cerrar la música (se pausa)')} title={t('Cerrar (la música se pausa)')}>
        <X size={15} aria-hidden="true" />
      </button>
    </header>
  )
}

/** Sin vídeo (Audius y radios): la carátula de la canción o el logo de la radio, con su autoría. */
function Artwork() {
  const item = useMusic((st) => st.queue[st.index])
  const videoId = useMusic((st) => st.videoId)
  if (!item || item.videoId !== videoId) return <div className={s.artwork} />
  const radio = musicSourceOf(item.videoId) === 'radio'
  return (
    <div className={s.artwork}>
      {item.thumbnail ? <img className={s.artworkImg} src={item.thumbnail} alt="" /> : <Music size={40} aria-hidden="true" />}
      <div className={s.artworkText}>
        <span className={s.artworkTitle}>{item.title}</span>
        <span className={s.artworkSub}>
          {radio ? t('Radio de SomaFM, sin anuncios: la mantienen sus oyentes.') : t('En Audius, de {artist}', { artist: item.artist || 'Audius' })}
        </span>
        {radio && (
          <a className={s.source} href="https://somafm.com/support/" target="_blank" rel="noreferrer">
            {t('Apoyar a SomaFM')} <ExternalLink size={11} aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  )
}

const SOURCE_KEY = 'aicowork.music.source.v1'
const SEARCH_SOURCES: MusicSource[] = ['youtube', 'audius', 'radio']
const KIND: Record<MusicSource, MusicSearchKind> = { youtube: 'songs', audius: 'audius', radio: 'radio' }
const PLACEHOLDER: Record<MusicSource, string> = {
  youtube: t('Busca canciones o artistas, o pega un enlace'),
  audius: t('Busca en Audius, sin anuncios'),
  radio: t('Filtra las radios (lofi, jazz, ambient…)')
}
const SOURCE_HELP: Record<MusicSource, string> = {
  youtube: t('YouTube Music en su reproductor oficial (con sus anuncios)'),
  audius: t('Música que suben los propios artistas para escucharla gratis, sin anuncios'),
  radio: t('Radios de SomaFM sin anuncios, que mantienen sus oyentes')
}

function readSource(): MusicSource {
  try {
    const v = localStorage.getItem(SOURCE_KEY)
    return v === 'audius' || v === 'radio' ? v : 'youtube'
  } catch {
    return 'youtube'
  }
}

/** Buscar canciones (YouTube Music o Audius), elegir una radio o pegar un enlace de YouTube. */
function SearchBox() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MusicResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [source, setSource] = useState<MusicSource>(readSource)
  const current = useMusic((st) => st.videoId)

  async function search(text: string, from: MusicSource): Promise<void> {
    const a = api
    if (!a) {
      setProblem(t('Buscar canciones necesita la app de escritorio de kywai.'))
      return
    }
    setBusy(true)
    try {
      const found = await a.searchMusic(text, KIND[from])
      setResults(found)
      if (!found.length) setProblem(from === 'radio' ? t('No hay radios con ese nombre.') : t('No he encontrado canciones con esa búsqueda.'))
    } catch (err) {
      setProblem(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function pick(next: MusicSource): void {
    setSource(next)
    setResults(null)
    setProblem(null)
    try {
      localStorage.setItem(SOURCE_KEY, next)
    } catch {
      /* almacenamiento no disponible */
    }
    // Las radios son pocas: se enseñan todas al elegirlas.
    if (next === 'radio') void search(query.trim(), 'radio')
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const text = query.trim()
    if ((!text && source !== 'radio') || busy) return
    setProblem(null)
    // Un enlace (o el id de un vídeo) suena directamente.
    const id = parseVideoId(text)
    if (id && (/^[A-Za-z0-9_-]{11}$/.test(text) || /youtu/i.test(text))) {
      ensureAudioSync()
      playFrom([{ videoId: id, title: '', artist: '' }], 0, parseStartSeconds(text))
      setQuery('')
      return
    }
    await search(text, source)
  }

  return (
    <div className={s.search}>
      <div className={s.sources} role="tablist" aria-label={t('Fuente de la música')}>
        {SEARCH_SOURCES.map((src) => (
          <button
            key={src}
            type="button"
            role="tab"
            aria-selected={source === src}
            className={cx(s.sourceTab, source === src && s.sourceTabOn)}
            onClick={() => pick(src)}
            title={SOURCE_HELP[src]}
          >
            {src === 'radio' ? t('Radios') : SOURCE_LABEL[src]}
          </button>
        ))}
      </div>
      <form className={s.form} onSubmit={(e) => void submit(e)} role="search">
        <div className={s.searchField}>
          <Search size={15} aria-hidden="true" className={s.searchIcon} />
          <input
            className={cx(s.input, s.searchInput)}
            type="search"
            placeholder={PLACEHOLDER[source]}
            aria-label={t('Buscar canciones o pegar un enlace de YouTube')}
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value)
              setProblem(null)
            }}
          />
        </div>
        <button type="submit" className={cx(u.btn, u.btnPrimary, u.btnSm)} disabled={(!query.trim() && source !== 'radio') || busy}>
          {busy ? <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> : t('Buscar')}
        </button>
      </form>
      {problem && (
        <p className={s.formError} role="alert">
          {problem}
        </p>
      )}
      {results && results.length > 0 && (
        <div className={s.results}>
          <div className={s.resultsHead}>
            <span>
              {t('Resultados')} <span className={u.count}>{results.length}</span>
            </span>
            <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => setResults(null)} aria-label={t('Cerrar los resultados')} title={t('Cerrar los resultados')}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <ul className={s.resultList}>
            {results.map((r, i) => (
              <li key={`${r.videoId}-${i}`} className={cx(s.resultRow, r.videoId === current && s.resultCurrent)}>
                <button
                  type="button"
                  className={s.result}
                  onClick={() => {
                    // El resto de resultados pasa a la cola: se cierra la lista para ver el reproductor y sus botones.
                    ensureAudioSync()
                    playFrom(results, i)
                    setResults(null)
                  }}
                  title={t('Reproducir «{title}»', { title: r.title })}
                >
                  {r.thumbnail ? <img className={s.thumb} src={r.thumbnail} alt="" loading="lazy" /> : <span className={s.thumb} />}
                  <span className={s.resultMain}>
                    <span className={s.resultTitle}>{r.title}</span>
                    <span className={s.resultSub}>{[r.artist, r.album].filter(Boolean).join(' · ')}</span>
                  </span>
                  {r.durationSec ? <span className={s.resultTime}>{clock(r.durationSec)}</span> : null}
                </button>
                <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => enqueue(r)} aria-label={t('Añadir «{title}» a la cola', { title: r.title })} title={t('Añadir a la cola')}>
                  <Plus size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Posición de la canción, atrás / pausa / adelante y volumen. En la barra, solo los tres botones (y ampliar). */
function Transport({ bar = false }: { bar?: boolean }) {
  const status = useMusic((st) => st.status)
  const index = useMusic((st) => st.index)
  const queueLength = useMusic((st) => st.queue.length)
  const [pos, setPos] = useState({ time: 0, duration: 0 })
  const [drag, setDrag] = useState<number | null>(null)
  const playing = status === 'playing' || status === 'buffering'

  useEffect(() => {
    const read = (): void => {
      const p = getPlayer()
      if (!p) return
      try {
        setPos({ time: p.getCurrentTime(), duration: p.getDuration() })
      } catch {
        /* reproductor destruido */
      }
    }
    read()
    const t = window.setInterval(read, 500)
    return () => window.clearInterval(t)
  }, [])

  const commit = (): void => {
    if (drag === null) return
    seek(drag)
    setPos((p) => ({ ...p, time: drag }))
    setDrag(null)
  }

  return (
    <div className={s.transport}>
      {!bar && (
        <div className={s.progress}>
          <span className={s.time}>{clock(drag ?? pos.time)}</span>
          <input
            className={s.seek}
            type="range"
            min={0}
            max={Math.max(1, Math.floor(pos.duration))}
            step={1}
            value={Math.min(drag ?? pos.time, pos.duration || 1)}
            disabled={!pos.duration}
            aria-label={t('Posición de la canción')}
            aria-valuetext={`${clock(drag ?? pos.time)} de ${clock(pos.duration)}`}
            onChange={(e) => setDrag(Number(e.currentTarget.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
          />
          <span className={s.time}>{clock(pos.duration)}</span>
        </div>
      )}
      <div className={s.buttons}>
        <button type="button" className={cx(u.iconBtn, s.navBtn)} onClick={previous} aria-label={t('Anterior')} title={t('Anterior (o al principio de la canción)')}>
          <SkipBack size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={s.playBtn}
          onClick={() => {
            ensureAudioSync()
            togglePlay()
          }} aria-label={playing ? t('Pausa') : t('Reproducir')} title={playing ? t('Pausa') : t('Reproducir')}>
          {status === 'buffering' || status === 'loading' ? (
            <LoaderCircle size={20} className={u.spin} aria-hidden="true" />
          ) : playing ? (
            <Pause size={20} aria-hidden="true" />
          ) : (
            <Play size={20} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className={cx(u.iconBtn, s.navBtn)}
          onClick={next}
          disabled={index + 1 >= queueLength}
          aria-label={t('Siguiente')}
          title={index + 1 >= queueLength ? t('No hay más canciones en la cola') : t('Siguiente')}
        >
          <SkipForward size={18} aria-hidden="true" />
        </button>
        {bar ? (
          <button
            type="button"
            className={cx(u.iconBtn, u.iconBtnSm)}
            onClick={() => setMusicBar(false)}
            aria-label={t('Ampliar el reproductor')}
            title={t('Ampliar (ver la canción y el vídeo)')}
          >
            <Maximize2 size={14} aria-hidden="true" />
          </button>
        ) : (
          <VolumeControl />
        )}
      </div>
    </div>
  )
}

/** Volumen de kywai (el mismo de la cabecera): música, efectos y este reproductor. */
function VolumeControl() {
  const volume = useSyncExternalStore(subscribeAudio, getVolume, getVolume)
  const muted = useSyncExternalStore(subscribeAudio, isMuted, isMuted)
  const pct = Math.round(volume * 100)
  return (
    <div className={s.volume}>
      <button
        type="button"
        className={cx(u.iconBtn, u.iconBtnSm)}
        onClick={() => setMuted(!muted)}
        aria-label={muted ? t('Activar sonido') : t('Silenciar')}
        title={muted ? t('Activar sonido') : t('Silenciar')}
      >
        {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
      </button>
      <input
        className={s.volumeSlider}
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        aria-label={t('Volumen')}
        aria-valuetext={`${pct} %${muted ? t(', silenciado') : ''}`}
        title={t('Volumen: {percentage} %{muted}', { percentage: pct, muted: '' })}
        onChange={(e) => setVolume(Number(e.currentTarget.value) / 100)}
      />
    </div>
  )
}

/** La cola: lo que ha sonado, lo que suena y lo que viene. */
function Queue() {
  const queue = useMusic((st) => st.queue)
  const index = useMusic((st) => st.index)
  const ref = useRef<HTMLOListElement>(null)
  // La que suena, a la vista dentro de la lista (sin mover el resto del panel).
  useEffect(() => {
    const list = ref.current
    const item = list?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!list || !item) return
    const top = item.offsetTop
    if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = Math.max(0, top - 4)
  }, [index])
  const left = Math.max(0, queue.length - index - 1)
  return (
    <section className={s.queue} aria-label={t('Cola de reproducción')}>
      <div className={s.resultsHead}>
        <span>
          <ListMusic size={14} aria-hidden="true" /> {t('Cola ·')} {left === 1 ? t('queda 1') : t('quedan {n}', { n: left })}
        </span>
        <button type="button" className={cx(u.btn, u.btnGhost, u.btnSm)} onClick={clearQueue} title={t('Quitar todas menos la que suena')}>
          {t('Vaciar')}
        </button>
      </div>
      <ol ref={ref} className={s.queueList}>
        {queue.map((item, i) => (
          <li key={`${item.videoId}-${i}`} className={cx(s.queueRow, i === index && s.queueCurrent, i < index && s.queuePast)} aria-current={i === index ? 'true' : undefined}>
            <button
              type="button"
              className={s.queueItem}
              onClick={() => {
                ensureAudioSync()
                playIndex(i)
              }} title={t('Reproducir «{title}»', { title: item.title || item.videoId })}>
              <span className={s.queueNum}>{i === index ? <Music size={12} aria-hidden="true" /> : i + 1}</span>
              <span className={s.resultMain}>
                <span className={s.resultTitle}>{item.title || t('Vídeo de YouTube')}</span>
                {(item.artist || item.via) && (
                  <span className={s.resultSub}>{[item.artist, item.via && t('otra versión ({via})', { via: item.via })].filter(Boolean).join(' · ')}</span>
                )}
              </span>
              {item.durationSec ? <span className={s.resultTime}>{clock(item.durationSec)}</span> : null}
            </button>
            {i !== index && (
              <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => removeFromQueue(i)} aria-label={t('Quitar «{title}» de la cola', { title: item.title })} title={t('Quitar de la cola')}>
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Resumen plegado de las luces: BPM y si están activas. */
/** Las luces siguen el sonido real: compartiendo la ventana o pestaña, o porque suena el audio propio (Audius, radios). */
function useHearsRealSound(): boolean {
  const shared = useAudioSync((st) => st.state === 'on')
  const own = useMusic((st) => musicSourceOf(st.videoId) !== 'youtube')
  return shared || own
}

function LightsSummary() {
  const track = useMusic((st) => (st.videoId ? st.tracks[st.videoId] : undefined))
  const lightsOn = useMusic((st) => st.lightsOn)
  const live = useHearsRealSound()
  const tempo = tempoOf(track)
  return (
    <span className={s.lightsSummary}>
      {t('Luces al ritmo ·')} {!lightsOn ? t('apagadas') : live ? t('con el sonido real') : tempo.bpm ? t('{bpm} BPM (estimado)', { bpm: tempo.bpm }) : t('sin BPM')}
    </span>
  )
}

function TrackInfo() {
  const track = useMusic((st) => (st.videoId ? st.tracks[st.videoId] : undefined))
  const searching = useMusic((st) => st.lookup === 'searching')
  const [editing, setEditing] = useState(false)
  const [artist, setArtist] = useState('')
  const [title, setTitle] = useState('')

  if (editing) {
    return (
      <form
        className={s.edit}
        onSubmit={(e) => {
          e.preventDefault()
          setTrackNames(artist, title)
          setEditing(false)
          void lookupTempo()
        }}
      >
        <input className={s.input} value={artist} onChange={(e) => setArtist(e.currentTarget.value)} placeholder={t('Artista')} aria-label={t('Artista')} />
        <input className={s.input} value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder={t('Canción')} aria-label={t('Canción')} required />
        <div className={s.row}>
          <button type="submit" className={cx(u.btn, u.btnPrimary, u.btnSm)}>
            <Search size={14} aria-hidden="true" />
            {t('Buscar BPM')}
          </button>
          <button type="button" className={cx(u.btn, u.btnGhost, u.btnSm)} onClick={() => setEditing(false)}>
            {t('Cancelar')}
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className={s.track}>
      <div className={s.trackNames}>
        <span className={s.trackTitle}>{track?.title || t('Leyendo el título del vídeo…')}</span>
        {track?.artist && <span className={s.trackArtist}>{track.artist}</span>}
      </div>
      <button
        type="button"
        className={cx(u.iconBtn, u.iconBtnSm)}
        onClick={() => {
          setArtist(track?.artist ?? '')
          setTitle(track?.title ?? '')
          setEditing(true)
        }}
        aria-label={t('Corregir artista y canción')}
        title={t('Corregir artista y canción (para encontrar el BPM)')}
      >
        <Pencil size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={cx(u.iconBtn, u.iconBtnSm)}
        onClick={() => void lookupTempo()}
        disabled={searching || !track?.title}
        aria-label={t('Buscar el BPM otra vez')}
        title={t('Buscar el BPM otra vez')}
      >
        <Search size={14} aria-hidden="true" className={cx(searching && u.spin)} />
      </button>
    </div>
  )
}

function SyncControls({ playing }: { playing: boolean }) {
  const track = useMusic((st) => (st.videoId ? st.tracks[st.videoId] : undefined))
  const lightsOn = useMusic((st) => st.lightsOn)
  const searching = useMusic((st) => st.lookup === 'searching')
  const taps = useMusic((st) => st.taps.length)
  const tempo = tempoOf(track)
  const offsetMs = Math.round(tempo.offset * 1000)
  const live = useHearsRealSound()

  return (
    <div className={s.sync}>
      <div className={s.syncHead}>
        <BeatDot active={playing && lightsOn && (live || tempo.bpm > 0)} />
        <span className={s.bpm}>{live ? t('Sonido real') : tempo.bpm ? `${tempo.bpm} BPM` : t('Sin BPM')}</span>
        {!live && tempo.confidence && (
          <span className={cx(s.badge, s[`badge_${tempo.confidence}`])} title={confidenceHelp(tempo.confidence)}>
            {CONFIDENCE_LABEL[tempo.confidence]}
          </span>
        )}
        {!live && tempo.mode === 'auto' && tempo.match?.url && (
          <a className={s.source} href={tempo.match.url} target="_blank" rel="noreferrer" title={`${tempo.match.artist} — ${tempo.match.title}`}>
            Deezer <ExternalLink size={11} aria-hidden="true" />
          </a>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={lightsOn}
          className={s.lightsSwitch}
          onClick={() => setLightsOn(!lightsOn)}
          title={t('Luces del espacio al ritmo de la música')}
        >
          <span className={cx(u.switch, lightsOn && u.switchOn)} aria-hidden="true" />
          {t('Luces')}
        </button>
      </div>

      <LiveSync />

      {!live && (
        <>
      {searching && <p className={s.note}>{t('Buscando el BPM de la canción…')}</p>}
      {!searching && tempo.mode === 'none' && (
        <p className={s.note}>
          {track?.note ? `${track.note.replace(/\.$/, '')}.` : t('Aún no hay BPM.')} {t('Marca el pulso a mano o escribe el BPM: las luces lo seguirán.')}
        </p>
      )}
      {!searching && tempo.confidence === 'baja' && (
        <p className={s.note}>{t('La canción encontrada podría no ser esta: comprueba que las luces van a tempo o márcalo a mano.')}</p>
      )}

      <div className={s.controls}>
        <BpmField bpm={tempo.bpm} />
        <div className={s.group} role="group" aria-label={t('Doble o mitad del BPM')}>
          <button type="button" className={cx(u.btn, u.btnSm, s.small)} onClick={() => scaleBpm(0.5)} disabled={!tempo.bpm} title={t('Mitad del BPM')}>
            ÷2
          </button>
          <button type="button" className={cx(u.btn, u.btnSm, s.small)} onClick={() => scaleBpm(2)} disabled={!tempo.bpm} title={t('Doble del BPM')}>
            ×2
          </button>
        </div>
        {tempo.mode === 'manual' && tempo.match && (
          <button type="button" className={cx(u.btn, u.btnGhost, u.btnSm)} onClick={() => setManualBpm(null)} title={t('Volver a {bpm} BPM (Deezer)', { bpm: tempo.match.bpm })}>
            {t('Usar el encontrado')}
          </button>
        )}
      </div>

      <div className={s.controls}>
        <div className={s.group} role="group" aria-label={t('Desfase de las luces')}>
          <span className={s.label}>{t('Desfase')}</span>
          <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => nudgeOffset(-0.02)} disabled={!tempo.bpm} aria-label={t('Adelantar las luces 20 ms')} title={t('Adelantar 20 ms')}>
            <Minus size={14} aria-hidden="true" />
          </button>
          <span className={s.value} aria-live="polite">{offsetMs} ms</span>
          <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => nudgeOffset(0.02)} disabled={!tempo.bpm} aria-label={t('Retrasar las luces 20 ms')} title={t('Retrasar 20 ms')}>
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          data-no-click-sound
          className={cx(u.btn, u.btnSm, s.tap)}
          onPointerDown={(e) => {
            // Al pulsar (no al soltar): el toque cae en el pulso que se oye.
            if (e.button === 0) tapBeat(performance.now())
          }}
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault()
              tapBeat(performance.now())
            }
          }}
          disabled={!playing}
          title={playing ? t('Pulsa al ritmo de la canción (4 veces o más)') : t('Reproduce la canción para marcar el pulso')}
        >
          <Hand size={14} aria-hidden="true" />
          {t('Marcar pulso')}{taps > 0 ? ` · ${taps}` : ''}
        </button>
      </div>
        </>
      )}
    </div>
  )
}

/** Luces con el sonido real, sin micrófono: en la app, solas; desde el navegador del PC, compartiendo la pestaña. */
function LiveSync() {
  const state = useAudioSync((st) => st.state)
  const error = useAudioSync((st) => st.error)
  const own = useMusic((st) => musicSourceOf(st.videoId) !== 'youtube')
  const on = state === 'on'
  if (own) {
    return (
      <div className={s.live}>
        <p className={s.note}>{t('Con Audius y las radios, las luces escuchan el sonido directamente: no hace falta compartir nada.')}</p>
      </div>
    )
  }
  if (!isWeb) {
    return (
      <div className={s.live}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          className={s.lightsSwitch}
          onClick={() => (on ? stopAudioSync(true) : void startAudioSync())}
          disabled={state === 'starting'}
          title={t('Las luces siguen cada golpe de lo que suena (sin micrófono)')}
        >
          <span className={cx(u.switch, on && u.switchOn)} aria-hidden="true" />
          {t('Seguir el sonido real')}
        </button>
        <p className={s.note}>
          {on
            ? t('Las luces caen en cada golpe de la canción: kywai escucha lo que suena en su propia ventana, sin micrófono y sin grabar nada.')
            : state === 'starting'
              ? t('Preparando…')
              : t('Apagado: las luces van con el tempo estimado (BPM publicado y desfase).')}
        </p>
        {error && <p className={s.formError}>{error}</p>}
      </div>
    )
  }
  if (!canSyncWithAudio()) {
    return <p className={s.note}>{t('En el móvil las luces van con el tempo estimado: el navegador no puede compartir el sonido.')}</p>
  }
  if (on) {
    return (
      <div className={s.live}>
        <p className={s.note}>{t('Escuchando el sonido de esta pestaña: las luces caen en cada golpe.')}</p>
        <button type="button" className={cx(u.btn, u.btnGhost, u.btnSm)} onClick={() => stopAudioSync(true)}>
          {t('Dejar de escuchar')}
        </button>
      </div>
    )
  }
  return (
    <div className={s.live}>
      <button type="button" className={cx(u.btn, u.btnPrimary, u.btnSm)} onClick={() => void startAudioSync()} disabled={state === 'starting'}>
        {t('Sincronizar con el sonido de esta pestaña')}
      </button>
      <p className={s.note}>
        {t('El navegador te pedirá compartir esta pestaña: elígela y deja marcado «Compartir también el audio». No se graba nada.')}
      </p>
      {error && <p className={s.formError}>{error}</p>}
    </div>
  )
}

function confidenceHelp(c: 'alta' | 'media' | 'baja' | 'manual'): string {
  if (c === 'manual') return t('BPM puesto a mano')
  return t('Coincidencia {c} entre el vídeo y la canción encontrada (artista, título y duración)', { c })
}

function BpmField({ bpm }: { bpm: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (): void => {
    if (draft === null) return
    const value = Number(draft.replace(',', '.'))
    if (draft.trim() && Number.isFinite(value)) setManualBpm(value)
    setDraft(null)
  }
  return (
    <label className={s.group}>
      <span className={s.label}>BPM</span>
      <input
        className={cx(s.input, s.bpmInput)}
        type="number"
        min={40}
        max={250}
        step={0.1}
        inputMode="decimal"
        value={draft ?? (bpm ? String(bpm) : '')}
        placeholder="—"
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
        title={t('BPM a mano (40–250)')}
      />
    </label>
  )
}

/** Punto que late con el reloj musical (el mismo que mueve las luces). */
function BeatDot({ active }: { active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = useCowork((st) => st.reducedEffects)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!active) {
      el.style.opacity = '0.35'
      el.style.transform = 'scale(1)'
      return
    }
    let frame = 0
    const tick = (): void => {
      const level = musicLightLevel(performance.now(), reduced)
      el.style.opacity = String(0.35 + level * 0.65)
      el.style.transform = `scale(${1 + level * 0.45})`
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, reduced])
  return <span ref={ref} className={s.beatDot} aria-hidden="true" />
}

function Limits() {
  return (
    <details className={s.limits}>
      <summary>
        <Info size={13} aria-hidden="true" />
        {t('Cómo se sincronizan las luces')}
      </summary>
      <ul>
        <li>
          {t('Es una estimación: no se escucha ni se analiza el audio (YouTube no lo permite y no se usa el micrófono). Se usa el BPM publicado de la canción (Deezer) y la posición del reproductor.')}
        </li>
        <li>{t('Con Audius y las radios, las luces escuchan el sonido de verdad: llega directamente a kywai, sin micrófono y sin compartir nada.')}</li>
        <li>
          {t('Se ajusta solo al pausar, reanudar, saltar o cambiar la velocidad. El primer pulso no se conoce: si las luces van desplazadas, usa «Marcar pulso» o el desfase.')}
        </li>
        <li>{t('Las canciones en directo, con tempo variable, remezclas o vídeos con introducción pueden desalinearse.')}</li>
        <li>
          {t('YouTube exige que su reproductor esté a la vista: al cerrar este panel la música se pausa. Mientras suena cualquier fuente, sustituye a la música ambiental de kywai.')}
        </li>
      </ul>
    </details>
  )
}
