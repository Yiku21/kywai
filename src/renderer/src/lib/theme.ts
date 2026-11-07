// Temas de kywai: el clásico, Órbita (cristal azulado y brillos, como la app del móvil), cinco con sus colores
// y cuatro con decoración propia en el espacio (Relicario, Telar, Halloween y Navidad). Se aplican al momento con
// data-theme en <html> (las variables de tokens.css cambian, y los colores y la decoración del espacio digital, en
// scene/palette.ts) y se recuerdan en cada dispositivo.
import { useSyncExternalStore } from 'react'
import { setScenePalette } from '@/scene/palette'
import { t } from '@/lib/i18n'

export type ThemeId = 'clasico' | 'orbita' | 'marfil' | 'grafito' | 'bosque' | 'matrix' | 'eva' | 'relicario' | 'telar' | 'halloween' | 'navidad'

export const THEMES: ReadonlyArray<{ id: ThemeId; name: string; hint: string }> = [
  { id: 'clasico', name: t('Clásico'), hint: t('Paneles oscuros y sobrios, el de siempre') },
  { id: 'orbita', name: t('Órbita'), hint: t('Cristal azulado con brillos, como la app del móvil') },
  { id: 'marfil', name: t('Marfil'), hint: t('Claro y cálido: marfil, verde y oro') },
  { id: 'grafito', name: t('Grafito'), hint: t('Negro grafito con detalles dorados') },
  { id: 'bosque', name: t('Bosque'), hint: t('Verde bosque profundo con oro') },
  { id: 'matrix', name: 'Matrix', hint: t('Negro y verde neón') },
  { id: 'eva', name: 'EVA-01', hint: t('Morado y verde lima, como la Unidad 01') },
  { id: 'relicario', name: t('Relicario'), hint: t('Cristal y oro: un núcleo tallado y plataformas de vidrio') },
  { id: 'telar', name: t('Telar'), hint: t('Hilos de plata tejidos en el espacio, con destellos dorados') },
  { id: 'halloween', name: 'Halloween', hint: t('Calabazas, velas, luna y murciélagos en una noche morada') },
  { id: 'navidad', name: t('Navidad'), hint: t('Nieve, regalos, árboles con luces y una bola de nieve') }
]

const KEY = 'aicowork.theme'
const listeners = new Set<() => void>()

function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value)
}

/** El tema guardado en este dispositivo (el clásico si no hay ninguno). */
export function storedTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(KEY)
    return isTheme(saved) ? saved : 'clasico'
  } catch {
    return 'clasico'
  }
}

let current: ThemeId = 'clasico'

/** Lo pone en la página (al arrancar, antes de pintar nada, para que no parpadee). */
export function applyTheme(id: ThemeId): void {
  current = id
  document.documentElement.dataset.theme = id
  setScenePalette(id)
}

export function setTheme(id: ThemeId): void {
  if (!isTheme(id)) return
  applyTheme(id)
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* sin almacenamiento: dura hasta cerrar */
  }
  listeners.forEach((l) => l())
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}

// Otra ventana (otra pestaña del navegador) cambió el tema.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== null) return
    applyTheme(storedTheme())
    listeners.forEach((l) => l())
  })
}
