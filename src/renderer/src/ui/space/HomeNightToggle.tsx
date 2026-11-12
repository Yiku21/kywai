import { Moon, Sun } from 'lucide-react'
import { isOffice, setTheme, useTheme } from '@/lib/theme'
import { setHomeNight, useHomeNight } from '@/lib/homeLighting'
import { t } from '@/lib/i18n'
import s from './HomeNightToggle.module.css'

/**
 * «Modo noche» en la cabecera del espacio: en el Refugio Kywai cambia su luz (preferencia del dispositivo); en la Oficina
 * pasa de la planta de día ('oficina') a la de noche ('sede') y al revés, como un cambio de tema normal (se sincroniza).
 */
export function HomeNightToggle(){
  const theme=useTheme(),homeNight=useHomeNight()
  const office=isOffice(theme)
  if(theme!=='kywai'&&!office)return null
  const night=office?theme==='sede':homeNight
  const Icon=night?Moon:Sun
  const toggle=()=>office?setTheme(night?'oficina':'sede'):setHomeNight(!night)
  return <button type="button" role="switch" aria-checked={night} aria-label={t('Modo noche')} title={t('Modo noche')} className={s.toggle} onClick={toggle}>
    <Icon size={15} aria-hidden="true" /><span className={s.label}>{t('Modo noche')}</span>
    <span className={s.track} aria-hidden="true"><span className={s.thumb}/></span>
  </button>
}
