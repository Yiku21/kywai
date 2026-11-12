import { Clock, Moon, Sun } from 'lucide-react'
import { isOffice, setTheme, useTheme } from '@/lib/theme'
import { setHomeNight, useHomeNight } from '@/lib/homeLighting'
import { setOfficeAuto, useOfficeAuto, useOfficeNight } from '@/lib/officeClock'
import { t } from '@/lib/i18n'
import { cx } from '../common/util'
import s from './HomeNightToggle.module.css'

/**
 * «Modo noche» en la cabecera del espacio: en el Refugio Kywai cambia su luz (preferencia del dispositivo); en la Oficina
 * pasa de la planta de día ('oficina') a la de noche ('sede') y al revés, como un cambio de tema normal (se sincroniza).
 * En la Oficina hay además «Auto»: el escenario de día se oscurece poco a poco con el reloj de este dispositivo.
 */
export function HomeNightToggle(){
  const theme=useTheme(),homeNight=useHomeNight(),auto=useOfficeAuto(),dusk=useOfficeNight()
  const office=isOffice(theme)
  if(theme!=='kywai'&&!office)return null
  const automatic=office&&auto
  const night=automatic?dusk>=.5:office?theme==='sede':homeNight
  const Icon=night?Moon:Sun
  // Tocar el interruptor deja el modo automático y fija día o noche a mano.
  const toggle=()=>{
    if(!office)return setHomeNight(!night)
    if(automatic)setOfficeAuto(false)
    setTheme(night?'oficina':'sede')
  }
  const toggleAuto=()=>{
    const next=!automatic
    setOfficeAuto(next)
    if(next&&theme!=='oficina')setTheme('oficina')
  }
  return <span className={s.group}>
    <button type="button" role="switch" aria-checked={night} aria-label={t('Modo noche')} title={t('Modo noche')} className={s.toggle} onClick={toggle}>
      <Icon size={15} aria-hidden="true" /><span className={s.label}>{t('Modo noche')}</span>
      <span className={s.track} aria-hidden="true"><span className={s.thumb}/></span>
    </button>
    {office&&<button type="button" aria-pressed={automatic} className={cx(s.toggle,s.auto,automatic&&s.autoOn)} onClick={toggleAuto}
      title={t('Automático: la oficina se oscurece poco a poco con la hora de tu reloj')}>
      <Clock size={14} aria-hidden="true" /><span className={s.label}>{t('Auto')}</span>
    </button>}
  </span>
}
