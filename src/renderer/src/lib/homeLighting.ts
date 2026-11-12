// Noche del Refugio Kywai. Con «Auto» encendido sigue el reloj (de noche desde que ha anochecido a medias); si no, la
// preferencia guardada en este dispositivo.
import { useSyncExternalStore } from 'react'
import { officeAuto, officeNight, onOfficeClock } from './officeClock'

const KEY='aicowork.kywai.night'
const listeners=new Set<()=>void>()
export function storedHomeNight():boolean {
  try{return localStorage.getItem(KEY)==='true'}catch{return false}
}
let stored=storedHomeNight()
let night=false
function refresh(){
  night=officeAuto()?officeNight()>=.5:stored
  if(typeof document!=='undefined')document.documentElement.dataset.kywaiNight=String(night)
}
refresh()
export function setHomeNight(value:boolean) {
  stored=value
  try{localStorage.setItem(KEY,String(value))}catch{/* The switch still works in memory. */}
  refresh();listeners.forEach(listener=>listener())
}
/** Si el Refugio está de noche ahora (con «Auto», según el reloj). */
export function useHomeNight(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>listeners.delete(listener)},()=>night,()=>false)}
onOfficeClock(()=>{refresh();listeners.forEach(listener=>listener())})
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
  if(event.key!==KEY&&event.key!==null)return
  stored=storedHomeNight();refresh();listeners.forEach(listener=>listener())
})
