// Noche del espacio 3D en todos los temas, por dispositivo (cada uno tiene su reloj):
// - «Auto»: el escenario se va oscureciendo con la hora del reloj (atardece de 17:00 a 20:30 y amanece de 6:00 a 8:00);
// - «Modo noche» a mano en los temas sin noche propia (la Oficina cambia de tema y el Refugio Kywai tiene la suya).
// (El nombre del archivo y de la clave de «Auto» vienen de cuando solo la Oficina lo tenía.)
import { useSyncExternalStore } from 'react'

const KEY = 'aicowork.oficina.auto'
const NIGHT_KEY = 'aicowork.space.night'
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Horas (en horas decimales) del atardecer y del amanecer. */
export const DUSK_START = 17, DUSK_END = 20.5, DAWN_START = 6, DAWN_END = 8

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }

/** Cuánto ha anochecido a esta hora: 0 de día, 1 de noche, y un paso suave en el atardecer y el amanecer. */
export function nightAt(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
  if (h >= DAWN_END && h <= DUSK_START) return 0
  if (h > DUSK_START && h < DUSK_END) return smooth((h - DUSK_START) / (DUSK_END - DUSK_START))
  if (h > DAWN_START && h < DAWN_END) return 1 - smooth((h - DAWN_START) / (DAWN_END - DAWN_START))
  return 1
}

function readAuto(): boolean {
  try { return localStorage.getItem(KEY) === 'true' } catch { return false }
}

let auto = readAuto()
let manualNight = (() => { try { return localStorage.getItem(NIGHT_KEY) === 'true' } catch { return false } })()
/** Para pruebas y capturas: una hora fija en vez del reloj (null = el reloj). */
let fixedNow: Date | null = null
let night = nightAt(new Date())

/** El valor que leen los materiales en cada fotograma (ventanas de la ciudad). */
export const officeClock = { night: 0 }

function tick() {
  const next = nightAt(fixedNow ?? new Date())
  if (Math.abs(next - night) < 0.002) return
  night = next
  emit()
}

if (typeof window !== 'undefined') {
  // Cada minuto basta: el atardecer dura tres horas y media.
  window.setInterval(tick, 60_000)
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== NIGHT_KEY && e.key !== null) return
    auto = readAuto()
    try { manualNight = localStorage.getItem(NIGHT_KEY) === 'true' } catch { /* igual */ }
    emit()
  })
  try {
    const at = new URLSearchParams(window.location.search).get('hora')
    if (at && /^\d{1,2}(:\d{2})?$/.test(at)) setOfficeClockTime(at)
  } catch { /* sin parámetros */ }
}

export function setOfficeAuto(value: boolean): void {
  auto = value
  try { localStorage.setItem(KEY, String(value)) } catch { /* sigue en memoria */ }
  tick()
  emit()
}

/** Fija la hora («19:30») para probar el atardecer sin esperar; null vuelve al reloj. */
export function setOfficeClockTime(hhmm: string | null): void {
  if (hhmm) {
    const [h, m = '0'] = hhmm.split(':')
    fixedNow = new Date()
    fixedNow.setHours(Number(h), Number(m), 0, 0)
  } else fixedNow = null
  night = nightAt(fixedNow ?? new Date())
  emit()
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export function useOfficeAuto(): boolean {
  return useSyncExternalStore(subscribe, () => auto, () => false)
}

/** Cuánto ha anochecido ahora (0–1), según el reloj. */
export function useOfficeNight(): number {
  return useSyncExternalStore(subscribe, () => night, () => 0)
}

/** Para quien no es un componente (los colores de la interfaz en lib/theme.ts). */
export function officeAuto(): boolean { return auto }
export function officeNight(): number { return night }
export function onOfficeClock(fn: () => void): () => void { return subscribe(fn) }

/** «Modo noche» a mano en los temas sin noche propia (la Ciudad, los mapas, los decorados, el Fondo marino). */
export function setSpaceNight(value: boolean): void {
  manualNight = value
  try { localStorage.setItem(NIGHT_KEY, String(value)) } catch { /* sigue en memoria */ }
  emit()
}
export function useSpaceNight(): boolean {
  return useSyncExternalStore(subscribe, () => manualNight, () => false)
}
