import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { setHomeNight, useHomeNight } from '@/lib/homeLighting'
import { t } from '@/lib/i18n'
import s from './HomeNightToggle.module.css'

export function HomeNightToggle(){
  const theme=useTheme(),night=useHomeNight()
  if(theme!=='kywai')return null
  const Icon=night?Moon:Sun
  return <button type="button" role="switch" aria-checked={night} aria-label={t('Modo noche')} title={t('Modo noche')} className={s.toggle} onClick={()=>setHomeNight(!night)}>
    <Icon size={15} aria-hidden="true" /><span className={s.label}>{t('Modo noche')}</span>
    <span className={s.track} aria-hidden="true"><span className={s.thumb}/></span>
  </button>
}
