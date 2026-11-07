import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { MessageSquare, Volume2, VolumeX } from 'lucide-react'
import { getVoiceVolume, getVolume, isMuted, isVoiceMuted, setMuted, setVoiceMuted, setVoiceVolume, setVolume, subscribeAudio } from '@/lib/audio'
import { useEscape } from '../common/hooks'
import { cx } from '../common/util'
import u from '../common/ui.module.css'
import s from '../Header.module.css'
import a from './AudioToggle.module.css'
import { t } from '@/lib/i18n'

/** Margen para pasar del botón al volumen sin que se cierre. */
const LEAVE_MS = 250

/**
 * Sonido: el botón silencia o activa. El volumen sale debajo al pasar el ratón por encima o al pulsar el botón (en el
 * móvil, el primer toque lo muestra y el segundo silencia); se cierra al salir, con Esc o pulsando fuera.
 */
export function AudioToggle() {
  const muted = useSyncExternalStore(subscribeAudio, isMuted, isMuted)
  const volume = useSyncExternalStore(subscribeAudio, getVolume, getVolume)
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const leaveTimer = useRef<number | undefined>(undefined)
  // Ratón encima ya (aunque React no haya vuelto a pintar): así un clic con ratón siempre silencia.
  const hovering = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  const open = hover || pinned
  const percentage = Math.round(volume * 100)
  const label = muted ? t('Activar sonido') : t('Silenciar sonido')
  const Icon = muted ? VolumeX : Volume2

  useEscape(pinned, () => setPinned(false))
  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])
  // Pulsar fuera lo cierra.
  useEffect(() => {
    if (!pinned) return
    const onDown = (e: globalThis.PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [pinned])

  function enter(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(leaveTimer.current)
    hovering.current = true
    setHover(true)
  }

  function leave(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(leaveTimer.current)
    hovering.current = false
    leaveTimer.current = window.setTimeout(() => {
      setHover(false)
      setPinned(false)
    }, LEAVE_MS)
  }

  function onButton(): void {
    // Sin ratón encima (móvil), el primer toque solo enseña el volumen.
    if (!hovering.current && !pinned) {
      setPinned(true)
      return
    }
    setMuted(!isMuted())
    setPinned(true)
  }

  return (
    <div
      ref={root}
      className={cx(a.control, open && a.open)}
      role="group"
      aria-label={t('Sonido: música, efectos y voces')}
      onPointerEnter={enter}
      onPointerLeave={leave}
    >
      <button
        type="button"
        className={cx(u.iconBtn, s.headerBtn)}
        data-audio-toggle
        aria-label={label}
        aria-pressed={muted}
        aria-expanded={open}
        title={t('{label} (música y efectos) · volumen {percentage} %', { label, percentage })}
        onClick={onButton}
      >
        <Icon size={18} aria-hidden="true" />
      </button>
      <div className={a.volume}>
        <SoundRows />
      </div>
    </div>
  )
}

/** Volumen de música y efectos y de las voces de los agentes (bajo el botón de sonido o en el menú de Ajustes). */
export function SoundRows() {
  const muted = useSyncExternalStore(subscribeAudio, isMuted, isMuted)
  const volume = useSyncExternalStore(subscribeAudio, getVolume, getVolume)
  const voiceMuted = useSyncExternalStore(subscribeAudio, isVoiceMuted, isVoiceMuted)
  const voiceVolume = useSyncExternalStore(subscribeAudio, getVoiceVolume, getVoiceVolume)
  const percentage = Math.round(volume * 100)
  const voicePercentage = voiceMuted ? 0 : Math.round(voiceVolume * 100)
  const Icon = muted ? VolumeX : Volume2
  return (
    <>
    <div className={cx(a.row, muted && a.muted)}>
      <span className={a.rowIcon} aria-hidden="true">
        <Icon size={15} />
      </span>
      <input
        className={a.slider}
        type="range"
        min={0}
        max={100}
        step={1}
        value={percentage}
        aria-label={t('Volumen de música y efectos')}
        aria-valuetext={`${percentage} %${muted ? t(', silenciado') : ''}`}
        title={t('Volumen: {percentage} %{muted}', { percentage, muted: muted ? t(' (silenciado)') : '' })}
        onChange={(event) => setVolume(Number(event.currentTarget.value) / 100)}
      />
      <span className={a.value} aria-hidden="true">
        {percentage}%
      </span>
    </div>
    <div className={cx(a.row, (muted || voiceMuted) && a.muted)}>
      <button
        type="button"
        className={a.rowBtn}
        data-audio-toggle
        aria-pressed={voiceMuted}
        aria-label={voiceMuted ? t('Activar las voces de los agentes') : t('Silenciar las voces de los agentes')}
        title={voiceMuted ? t('Activar las voces de los agentes') : t('Silenciar las voces de los agentes (la música y los efectos siguen)')}
        onClick={() => setVoiceMuted(!isVoiceMuted())}
      >
        <MessageSquare size={15} aria-hidden="true" />
      </button>
      <input
        className={a.slider}
        type="range"
        min={0}
        max={100}
        step={1}
        value={voicePercentage}
        aria-label={t('Volumen de las voces de los agentes')}
        aria-valuetext={`${voicePercentage} %${voiceMuted ? t(', silenciadas') : ''}`}
        title={t('Voces de los agentes: {voicePercentage} %{v2}', { voicePercentage, v2: voiceMuted ? t(' (silenciadas)') : '' })}
        onChange={(event) => setVoiceVolume(Number(event.currentTarget.value) / 100)}
      />
      <span className={a.value} aria-hidden="true">
        {voicePercentage}%
      </span>
    </div>
    </>
  )
}
