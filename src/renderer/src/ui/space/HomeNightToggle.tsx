import { Clock, Moon, Sun } from 'lucide-react'
import { isOffice, setTheme, useTheme } from '@/lib/theme'
import { setHomeNight, useHomeNight } from '@/lib/homeLighting'
import { setOfficeAuto, setSpaceNight, useOfficeAuto, useOfficeNight, useSpaceNight } from '@/lib/officeClock'
import { t } from '@/lib/i18n'
import { cx } from '../common/util'
import s from './HomeNightToggle.module.css'

/**
 * «Modo noche» y «Auto» en la cabecera del espacio, en todos los temas.
 * - Auto: el escenario anochece y amanece con la hora del reloj de este dispositivo.
 * - Modo noche a mano: en la Oficina pasa a su versión de noche ('sede', se sincroniza como un cambio de tema); en el
 *   Refugio Kywai, su propia noche; en los demás, el mismo escenario con la luz de noche (preferencia del dispositivo).
 * Tocar «Modo noche» con Auto encendido lo apaga y deja fijado lo contrario de lo que se ve.
 * Órbita no los tiene: la estación está en el espacio y allí no hay día ni noche.
 */
export function HomeNightToggle(){
  const theme=useTheme(),homeNight=useHomeNight(),auto=useOfficeAuto(),dusk=useOfficeNight(),spaceNight=useSpaceNight()
  const office=isOffice(theme),home=theme==='kywai'
  const night=auto&&!(office&&theme==='sede')?dusk>=.5:office?theme==='sede':home?homeNight:spaceNight
  const Icon=night?Moon:Sun
  const toggle=()=>{
    if(auto)setOfficeAuto(false)
    if(office)setTheme(night?'oficina':'sede')
    else if(home)setHomeNight(!night)
    else setSpaceNight(!night)
  }
  const toggleAuto=()=>{
    const next=!auto
    setOfficeAuto(next)
    if(next&&theme==='sede')setTheme('oficina')
  }
  if(theme==='mundo-orbita')return null
  return <span className={s.group}>
    <button type="button" role="switch" aria-checked={night} aria-label={t('Modo noche')} title={t('Modo noche')} className={s.toggle} onClick={toggle}>
      <Icon size={15} aria-hidden="true" /><span className={s.label}>{t('Modo noche')}</span>
      <span className={s.track} aria-hidden="true"><span className={s.thumb}/></span>
    </button>
    <button type="button" aria-pressed={auto} className={cx(s.toggle,s.auto,auto&&s.autoOn)} onClick={toggleAuto}
      title={t('Automático: el espacio anochece y amanece poco a poco con la hora de tu reloj')}>
      <Clock size={14} aria-hidden="true" /><span className={s.label}>{t('Auto')}</span>
    </button>
  </span>
}
