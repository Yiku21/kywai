import { useSyncExternalStore } from 'react'

const KEY='aicowork.kywai.night'
const listeners=new Set<()=>void>()
export function storedHomeNight():boolean {
  try{return localStorage.getItem(KEY)==='true'}catch{return false}
}
let night=storedHomeNight()
function apply(value:boolean){night=value;if(typeof document!=='undefined')document.documentElement.dataset.kywaiNight=String(value)}
apply(night)
export function setHomeNight(value:boolean) {
  apply(value)
  try{localStorage.setItem(KEY,String(value))}catch{/* The switch still works in memory. */}
  listeners.forEach(listener=>listener())
}
export function useHomeNight(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>listeners.delete(listener)},()=>night,()=>false)}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
  if(event.key!==KEY&&event.key!==null)return
  apply(storedHomeNight());listeners.forEach(listener=>listener())
})
