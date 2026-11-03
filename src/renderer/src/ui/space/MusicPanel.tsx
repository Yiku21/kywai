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
import type { MusicResult } from '@shared/types'
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
import { createEmbedPlayer } from '@/lib/ytEmbed'
import { useCowork } from '@/store/cowork'
import { useEscape } from '../common/hooks'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './MusicPanel.module.css'

const ERRORS: Record<number, string> = {
  2: 'El enlace no es un vídeo válido de YouTube.',
  5: 'El reproductor de YouTube no pudo reproducir este vídeo.',
  100: 'El vídeo no existe o es privado.',
  101: 'El autor no permite reproducir este vídeo fuera de YouTube.',
  150: 'El autor no permite reproducir este vídeo fuera de YouTube.',
  152: 'YouTube no aceptó la identificación de AI Cowork (error 152). Actualiza la app de escritorio.',
  153: 'YouTube no aceptó la identificación de AI Cowork (error 153). Actualiza la app de escritorio.'
}

const CONFIDENCE_LABEL = { alta: 'Confianza alta', media: 'Confianza media', baja: 'Confianza baja', manual: 'Manual' } as const

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
  const host = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YtPlayer | null>(null)

  // Esc: con una canción se minimiza (sigue sonando); sin ella, se cierra.
  useEscape(open && !mini, () => (useMusic.getState().videoId ? setMusicMini(true) : setMusicOpen(false)))

  // El reproductor se crea la primera vez que hay una canción con el panel abierto y se conserva al cerrarlo (en pausa).
  useEffect(() => {
    if (!open || !videoId || playerRef.current || !host.current) return
    const first = videoId
    const wanted = takePending()
    const player = createEmbedPlayer(host.current, {
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
        onError: (code) => void recoverFromError(code, ERRORS[code] ?? `YouTube devolvió el error ${code}.`)
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
      aria-label={mini ? 'Reproductor de música (minimizado)' : 'Música y luces al ritmo'}
    >
      {bar ? null : mini ? (
        <MiniHead />
      ) : (
        <header className={s.head}>
          <Music size={17} aria-hidden="true" className={s.headIcon} />
          <h3 className={s.title}>Música</h3>
          <span className={s.headHint}>YouTube Music · luces al ritmo</span>
          {videoId && (
            <button
              type="button"
              className={cx(u.iconBtn, u.iconBtnSm)}
              onClick={() => setMusicMini(true)}
              aria-label="Minimizar (sigue sonando)"
              title="Minimizar (sigue sonando)"
            >
              <Minimize2 size={15} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={cx(u.iconBtn, u.iconBtnSm)}
            onClick={() => setMusicOpen(false)}
            aria-label="Cerrar la música (se pausa)"
            title="Cerrar (la música se pausa)"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
      )}

      {!mini && <SearchBox />}

      {isWeb && !mini && (
        <p className={s.note}>
          Desde el navegador, YouTube no deja reproducir muchas canciones de discográficas (error 150): se busca otra subida de
          la misma canción. En la app de escritorio del Mac sí suenan todas.
        </p>
      )}

      {videoId ? (
        <div className={s.playerBox} title={bar ? song : undefined}>
          <div ref={host} className={s.player} />
        </div>
      ) : mini ? null : (
        <p className={s.empty}>
          Busca una canción o un artista, o pega un enlace de YouTube. Suena en el reproductor oficial de YouTube y las luces del
          espacio siguen su ritmo, sin usar el micrófono.
        </p>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
          {videoId && (
            <>
              {' '}
              <a className={s.source} href={`https://music.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">
                Abrir en YouTube Music <ExternalLink size={11} aria-hidden="true" />
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
        {track?.title || 'Música'}
        {track?.artist && <span className={s.miniArtist}> · {track.artist}</span>}
      </span>
      <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => setMusicBar(true)} aria-label="Dejar solo los botones" title="Dejar solo los botones (atrás, pausa y adelante)">
        <Minimize2 size={14} aria-hidden="true" />
      </button>
      <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => setMusicMini(false)} aria-label="Abrir el reproductor" title="Abrir el reproductor">
        <Maximize2 size={14} aria-hidden="true" />
      </button>
      <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => setMusicOpen(false)} aria-label="Cerrar la música (se pausa)" title="Cerrar (la música se pausa)">
        <X size={15} aria-hidden="true" />
      </button>
    </header>
  )
}

/** Buscar canciones (YouTube Music) o pegar un enlace. */
function SearchBox() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MusicResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const current = useMusic((st) => st.videoId)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const text = query.trim()
    if (!text || busy) return
    setProblem(null)
    // Un enlace (o el id de un vídeo) suena directamente.
    const id = parseVideoId(text)
    if (id && (/^[A-Za-z0-9_-]{11}$/.test(text) || /youtu/i.test(text))) {
      ensureAudioSync()
      playFrom([{ videoId: id, title: '', artist: '' }], 0, parseStartSeconds(text))
      setQuery('')
      return
    }
    const a = api
    if (!a) {
      setProblem('Buscar canciones necesita la app de escritorio de AI Cowork.')
      return
    }
    setBusy(true)
    try {
      const found = await a.searchMusic(text)
      setResults(found)
      if (!found.length) setProblem('No he encontrado canciones con esa búsqueda.')
    } catch (err) {
      setProblem(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.search}>
      <form className={s.form} onSubmit={(e) => void submit(e)} role="search">
        <div className={s.searchField}>
          <Search size={15} aria-hidden="true" className={s.searchIcon} />
          <input
            className={cx(s.input, s.searchInput)}
            type="search"
            placeholder="Busca canciones o artistas, o pega un enlace"
            aria-label="Buscar canciones o pegar un enlace de YouTube"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value)
              setProblem(null)
            }}
          />
        </div>
        <button type="submit" className={cx(u.btn, u.btnPrimary, u.btnSm)} disabled={!query.trim() || busy}>
          {busy ? <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> : 'Buscar'}
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
              Resultados <span className={u.count}>{results.length}</span>
            </span>
            <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => setResults(null)} aria-label="Cerrar los resultados" title="Cerrar los resultados">
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
                  title={`Reproducir «${r.title}»`}
                >
                  {r.thumbnail ? <img className={s.thumb} src={r.thumbnail} alt="" loading="lazy" /> : <span className={s.thumb} />}
                  <span className={s.resultMain}>
                    <span className={s.resultTitle}>{r.title}</span>
                    <span className={s.resultSub}>{[r.artist, r.album].filter(Boolean).join(' · ')}</span>
                  </span>
                  {r.durationSec ? <span className={s.resultTime}>{clock(r.durationSec)}</span> : null}
                </button>
                <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => enqueue(r)} aria-label={`Añadir «${r.title}» a la cola`} title="Añadir a la cola">
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
            aria-label="Posición de la canción"
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
        <button type="button" className={cx(u.iconBtn, s.navBtn)} onClick={previous} aria-label="Anterior" title="Anterior (o al principio de la canción)">
          <SkipBack size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={s.playBtn}
          onClick={() => {
            ensureAudioSync()
            togglePlay()
          }} aria-label={playing ? 'Pausa' : 'Reproducir'} title={playing ? 'Pausa' : 'Reproducir'}>
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
          aria-label="Siguiente"
          title={index + 1 >= queueLength ? 'No hay más canciones en la cola' : 'Siguiente'}
        >
          <SkipForward size={18} aria-hidden="true" />
        </button>
        {bar ? (
          <button
            type="button"
            className={cx(u.iconBtn, u.iconBtnSm)}
            onClick={() => setMusicBar(false)}
            aria-label="Ampliar el reproductor"
            title="Ampliar (ver la canción y el vídeo)"
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

/** Volumen de AI Cowork (el mismo de la cabecera): música, efectos y este reproductor. */
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
        aria-label={muted ? 'Activar sonido' : 'Silenciar'}
        title={muted ? 'Activar sonido' : 'Silenciar'}
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
        aria-label="Volumen"
        aria-valuetext={`${pct} %${muted ? ', silenciado' : ''}`}
        title={`Volumen: ${pct} %`}
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
    <section className={s.queue} aria-label="Cola de reproducción">
      <div className={s.resultsHead}>
        <span>
          <ListMusic size={14} aria-hidden="true" /> Cola · {left === 1 ? 'queda 1' : `quedan ${left}`}
        </span>
        <button type="button" className={cx(u.btn, u.btnGhost, u.btnSm)} onClick={clearQueue} title="Quitar todas menos la que suena">
          Vaciar
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
              }} title={`Reproducir «${item.title || item.videoId}»`}>
              <span className={s.queueNum}>{i === index ? <Music size={12} aria-hidden="true" /> : i + 1}</span>
              <span className={s.resultMain}>
                <span className={s.resultTitle}>{item.title || 'Vídeo de YouTube'}</span>
                {(item.artist || item.via) && (
                  <span className={s.resultSub}>{[item.artist, item.via && `otra versión (${item.via})`].filter(Boolean).join(' · ')}</span>
                )}
              </span>
              {item.durationSec ? <span className={s.resultTime}>{clock(item.durationSec)}</span> : null}
            </button>
            {i !== index && (
              <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => removeFromQueue(i)} aria-label={`Quitar «${item.title}» de la cola`} title="Quitar de la cola">
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
function LightsSummary() {
  const track = useMusic((st) => (st.videoId ? st.tracks[st.videoId] : undefined))
  const lightsOn = useMusic((st) => st.lightsOn)
  const live = useAudioSync((st) => st.state === 'on')
  const tempo = tempoOf(track)
  return (
    <span className={s.lightsSummary}>
      Luces al ritmo · {!lightsOn ? 'apagadas' : live ? 'con el sonido real' : tempo.bpm ? `${tempo.bpm} BPM (estimado)` : 'sin BPM'}
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
        <input className={s.input} value={artist} onChange={(e) => setArtist(e.currentTarget.value)} placeholder="Artista" aria-label="Artista" />
        <input className={s.input} value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder="Canción" aria-label="Canción" required />
        <div className={s.row}>
          <button type="submit" className={cx(u.btn, u.btnPrimary, u.btnSm)}>
            <Search size={14} aria-hidden="true" />
            Buscar BPM
          </button>
          <button type="button" className={cx(u.btn, u.btnGhost, u.btnSm)} onClick={() => setEditing(false)}>
            Cancelar
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className={s.track}>
      <div className={s.trackNames}>
        <span className={s.trackTitle}>{track?.title || 'Leyendo el título del vídeo…'}</span>
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
        aria-label="Corregir artista y canción"
        title="Corregir artista y canción (para encontrar el BPM)"
      >
        <Pencil size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={cx(u.iconBtn, u.iconBtnSm)}
        onClick={() => void lookupTempo()}
        disabled={searching || !track?.title}
        aria-label="Buscar el BPM otra vez"
        title="Buscar el BPM otra vez"
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
  const live = useAudioSync((st) => st.state === 'on')

  return (
    <div className={s.sync}>
      <div className={s.syncHead}>
        <BeatDot active={playing && lightsOn && (live || tempo.bpm > 0)} />
        <span className={s.bpm}>{live ? 'Sonido real' : tempo.bpm ? `${tempo.bpm} BPM` : 'Sin BPM'}</span>
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
          title="Luces del espacio al ritmo de la música"
        >
          <span className={cx(u.switch, lightsOn && u.switchOn)} aria-hidden="true" />
          Luces
        </button>
      </div>

      <LiveSync />

      {!live && (
        <>
      {searching && <p className={s.note}>Buscando el BPM de la canción…</p>}
      {!searching && tempo.mode === 'none' && (
        <p className={s.note}>
          {track?.note ? `${track.note.replace(/\.$/, '')}.` : 'Aún no hay BPM.'} Marca el pulso a mano o escribe el BPM: las
          luces lo seguirán.
        </p>
      )}
      {!searching && tempo.confidence === 'baja' && (
        <p className={s.note}>La canción encontrada podría no ser esta: comprueba que las luces van a tempo o márcalo a mano.</p>
      )}

      <div className={s.controls}>
        <BpmField bpm={tempo.bpm} />
        <div className={s.group} role="group" aria-label="Doble o mitad del BPM">
          <button type="button" className={cx(u.btn, u.btnSm, s.small)} onClick={() => scaleBpm(0.5)} disabled={!tempo.bpm} title="Mitad del BPM">
            ÷2
          </button>
          <button type="button" className={cx(u.btn, u.btnSm, s.small)} onClick={() => scaleBpm(2)} disabled={!tempo.bpm} title="Doble del BPM">
            ×2
          </button>
        </div>
        {tempo.mode === 'manual' && tempo.match && (
          <button type="button" className={cx(u.btn, u.btnGhost, u.btnSm)} onClick={() => setManualBpm(null)} title={`Volver a ${tempo.match.bpm} BPM (Deezer)`}>
            Usar el encontrado
          </button>
        )}
      </div>

      <div className={s.controls}>
        <div className={s.group} role="group" aria-label="Desfase de las luces">
          <span className={s.label}>Desfase</span>
          <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => nudgeOffset(-0.02)} disabled={!tempo.bpm} aria-label="Adelantar las luces 20 ms" title="Adelantar 20 ms">
            <Minus size={14} aria-hidden="true" />
          </button>
          <span className={s.value} aria-live="polite">{offsetMs} ms</span>
          <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => nudgeOffset(0.02)} disabled={!tempo.bpm} aria-label="Retrasar las luces 20 ms" title="Retrasar 20 ms">
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
          title={playing ? 'Pulsa al ritmo de la canción (4 veces o más)' : 'Reproduce la canción para marcar el pulso'}
        >
          <Hand size={14} aria-hidden="true" />
          Marcar pulso{taps > 0 ? ` · ${taps}` : ''}
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
  const on = state === 'on'
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
          title="Las luces siguen cada golpe de lo que suena (sin micrófono)"
        >
          <span className={cx(u.switch, on && u.switchOn)} aria-hidden="true" />
          Seguir el sonido real
        </button>
        <p className={s.note}>
          {on
            ? 'Las luces caen en cada golpe de la canción: AI Cowork escucha lo que suena en su propia ventana, sin micrófono y sin grabar nada.'
            : state === 'starting'
              ? 'Preparando…'
              : 'Apagado: las luces van con el tempo estimado (BPM publicado y desfase).'}
        </p>
        {error && <p className={s.formError}>{error}</p>}
      </div>
    )
  }
  if (!canSyncWithAudio()) {
    return <p className={s.note}>En el móvil las luces van con el tempo estimado: el navegador no puede compartir el sonido.</p>
  }
  if (on) {
    return (
      <div className={s.live}>
        <p className={s.note}>Escuchando el sonido de esta pestaña: las luces caen en cada golpe.</p>
        <button type="button" className={cx(u.btn, u.btnGhost, u.btnSm)} onClick={() => stopAudioSync(true)}>
          Dejar de escuchar
        </button>
      </div>
    )
  }
  return (
    <div className={s.live}>
      <button type="button" className={cx(u.btn, u.btnPrimary, u.btnSm)} onClick={() => void startAudioSync()} disabled={state === 'starting'}>
        Sincronizar con el sonido de esta pestaña
      </button>
      <p className={s.note}>
        El navegador te pedirá compartir esta pestaña: elígela y deja marcado «Compartir también el audio». No se graba nada.
      </p>
      {error && <p className={s.formError}>{error}</p>}
    </div>
  )
}

function confidenceHelp(c: 'alta' | 'media' | 'baja' | 'manual'): string {
  if (c === 'manual') return 'BPM puesto a mano'
  return `Coincidencia ${c} entre el vídeo y la canción encontrada (artista, título y duración)`
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
        title="BPM a mano (40–250)"
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
        Cómo se sincronizan las luces
      </summary>
      <ul>
        <li>
          Es una estimación: no se escucha ni se analiza el audio (YouTube no lo permite y no se usa el micrófono). Se
          usa el BPM publicado de la canción (Deezer) y la posición del reproductor.
        </li>
        <li>
          Se ajusta solo al pausar, reanudar, saltar o cambiar la velocidad. El primer pulso no se conoce: si las luces
          van desplazadas, usa «Marcar pulso» o el desfase.
        </li>
        <li>Las canciones en directo, con tempo variable, remezclas o vídeos con introducción pueden desalinearse.</li>
        <li>
          YouTube exige que su reproductor esté a la vista: al cerrar este panel la música se pausa. Mientras suena,
          sustituye a la música ambiental de AI Cowork.
        </li>
      </ul>
    </details>
  )
}
