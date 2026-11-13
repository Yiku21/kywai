import { useEffect, useState } from 'react'
import { AudioLines, Check, Loader2, Play, Square } from 'lucide-react'
import type { VideoVoiceInfo } from '@shared/types'
import { defaultVoiceFor } from '@shared/videoChoice'
import { api } from '@/lib/api'
import { lang, t } from '@/lib/i18n'
import { readText, SAMPLE, stopReading, useReadAloud } from '@/lib/readAloud'
import { ENGINES, MISSING, langName, voiceLine, voiceName } from '../left/VideoPicker'
import { cx } from '../common/util'
import s from '../left/VideoPicker.module.css'

type Voices = { voices: VideoVoiceInfo[]; missing: VideoVoiceInfo['engine'][] }

/** El nombre de la voz con la que se leen las respuestas (para el botón que despliega la lista). */
export function useReadVoiceName(): string {
  const voice = useReadAloud((r) => r.voice)
  const [name, setName] = useState('')
  useEffect(() => {
    let alive = true
    const id = voice ?? defaultVoiceFor(lang())
    if (!id) return setName('')
    void api?.listVideoVoices?.().then(
      (v) => alive && setName(((x) => (x ? voiceName(x) : ''))(v.voices.find((x) => x.id === id))),
      () => undefined
    )
    return () => {
      alive = false
    }
  }, [voice])
  return name || (voice ? t('Voz elegida') : t('Automática'))
}

/**
 * Las voces para leer las respuestas del chat (las mismas de los vídeos), cada una con ▶ para oír cómo suena con una
 * frase de muestra. La elegida se recuerda en este dispositivo.
 */
export function ReadVoiceGrid() {
  const voice = useReadAloud((r) => r.voice)
  const speaking = useReadAloud((r) => r.speaking)
  const loading = useReadAloud((r) => r.loading)
  const error = useReadAloud((r) => r.error)
  const [voices, setVoices] = useState<Voices | null>(null)
  const [tried, setTried] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void (api?.listVideoVoices?.() ?? Promise.resolve({ voices: [], missing: [] } as Voices)).then(
      (v) => alive && setVoices(v),
      () => alive && setVoices({ voices: [], missing: [] })
    )
    return () => {
      alive = false
      // Al plegar la lista, la muestra que sonaba calla (una respuesta que se esté leyendo, no).
      if (useReadAloud.getState().speaking?.startsWith(SAMPLE)) stopReading()
    }
  }, [])

  // En español y en inglés la primera voz del idioma va por defecto (sin elegir); en los demás hay «Automática».
  const defaultVoice = defaultVoiceFor(lang())
  const isOn = (id: string): boolean => (voice ?? defaultVoice) === id
  const pick = (id: string | null): void => useReadAloud.getState().setVoice(id === defaultVoice ? null : id)
  const preview = (v: VideoVoiceInfo): void => {
    const key = `${SAMPLE}${v.id}`
    if (speaking === key) return stopReading()
    setTried(v.id)
    void readText(key, t('Hola, así te leeré las respuestas del chat. ¿Te gusta cómo suena?'), v.id, { sample: true })
  }
  const langs = [...new Set((voices?.voices ?? []).map((v) => v.lang ?? ''))].filter(Boolean)

  return (
    <div role="radiogroup" aria-label={t('Voz para leer las respuestas')}>
      {!defaultVoice && (
        <div className={s.voiceGrid}>
          <button type="button" role="radio" aria-checked={!voice} className={cx(s.card, s.voiceCard, !voice && s.cardOn)} onClick={() => pick(null)}>
            <span className={cx(s.play, s.playAuto)} aria-hidden="true">
              <AudioLines size={14} />
            </span>
            <span className={s.name}>{t('Automática')}</span>
            <span className={s.line}>{t('La mejor que haya: tu voz de Voicebox, Gemini o Kokoro.')}</span>
            {!voice && <Check size={14} className={s.check} aria-hidden="true" />}
          </button>
        </div>
      )}
      {!voices && <p className={s.empty}>{t('Buscando las voces de tu equipo…')}</p>}
      {[...(defaultVoice ? langs : []), ...ENGINES].map((e) => {
        const list = voices?.voices.filter((v) => (typeof e === 'string' ? v.lang === e : v.engine === e.id && (!defaultVoice || !v.lang))) ?? []
        if (!list.length) return null
        return (
          <div key={typeof e === 'string' ? e : e.id}>
            {typeof e === 'string' ? (
              <h5 className={s.cat}>{langName(e)}</h5>
            ) : (
              <h5 className={s.cat}>
                {t(e.name)} <span className={s.catLine}>{t(e.line)}</span>
              </h5>
            )}
            <div className={s.voiceGrid}>
              {list.map((v) => {
                const on = isOn(v.id)
                const playing = speaking === `${SAMPLE}${v.id}`
                const failed = !playing && tried === v.id && error
                return (
                  <div key={v.id} className={s.cardWrap}>
                    <button type="button" role="radio" aria-checked={on} className={cx(s.card, s.voiceCard, on && s.cardOn)} onClick={() => pick(v.id)}>
                      <span className={s.name}>{voiceName(v)}</span>
                      <span className={s.line}>{failed ? <span className={s.voiceErr}>{failed}</span> : voiceLine(v)}</span>
                      {on && <Check size={14} className={s.check} aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      className={cx(s.play, playing && s.playOn)}
                      onClick={() => preview(v)}
                      aria-label={playing ? t('Parar') : t('Escuchar la voz «{name}»', { name: voiceName(v) })}
                      title={playing ? t('Parar') : t('Escuchar')}
                    >
                      {playing && loading ? <Loader2 size={13} className={s.spin} /> : playing ? <Square size={11} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {!!voices?.missing.length && (
        <p className={s.voiceNote}>
          {voices.missing
            .map((m) => MISSING[m])
            .filter(Boolean)
            .map((m) => t(m))
            .join(' ')}
        </p>
      )}
    </div>
  )
}
