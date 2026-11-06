// Idiomas de la interfaz. El texto en español del código es la clave: t('Ajustes') devuelve «Ajustes» en español y
// lo que diga el diccionario del idioma elegido (i18n/en.ts…) en los demás; si falta, se queda en español (la prueba
// i18n.test.ts avisa de cada texto sin traducir). Los huecos van entre llaves: t('Hace {n} min', { n: 5 }).
//
// El idioma se elige en ⋮ → Ajustes → Idioma y se recuerda en cada dispositivo (como el tema). Si nunca se ha elegido,
// se usa el del sistema (español si empieza por «es»; si no, inglés). Al cambiarlo, la ventana se recarga: así los
// textos calculados al cargar cada módulo (listas de temas, nombres de zonas…) salen ya en el idioma nuevo.
import { en } from './i18n/en'

export type Lang = 'es' | 'en'

export const LANGS: ReadonlyArray<{ id: Lang; name: string }> = [
  { id: 'es', name: 'Español' },
  { id: 'en', name: 'English' }
]

const KEY = 'aicowork.lang'
const DICTS: Record<Exclude<Lang, 'es'>, Record<string, string>> = { en }

function isLang(value: unknown): value is Lang {
  return LANGS.some((l) => l.id === value)
}

/** El idioma del sistema (o del navegador): español si empieza por «es»; si no, inglés. */
export function systemLang(): Lang {
  try {
    const list = navigator.languages?.length ? navigator.languages : [navigator.language]
    return list.some((l) => /^es\b/i.test(l ?? '')) ? 'es' : 'en'
  } catch {
    return 'es'
  }
}

/** El idioma guardado en este dispositivo, o el del sistema si nunca se eligió. En las pruebas, español. */
export function storedLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (isLang(saved)) return saved
  } catch {
    /* sin almacenamiento */
  }
  if (import.meta.env?.MODE === 'test') return 'es'
  return systemLang()
}

let current: Lang = storedLang()

export function lang(): Lang {
  return current
}

/** Código BCP 47 para fechas y números (toLocaleString, Intl…). */
export function locale(): string {
  return current === 'en' ? 'en-US' : 'es-ES'
}

/** Traduce un texto escrito en español. Los {huecos} se rellenan con vars. */
export function t(text: string, vars?: Record<string, string | number | null | undefined>): string {
  const dict = current === 'es' ? undefined : DICTS[current]
  const out = dict?.[text] ?? text
  if (!vars) return out
  return out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? '') : m))
}

/** Pone el atributo lang de la página (lectores de pantalla, corrector, guiones). */
export function applyLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current
}

/** Cambia el idioma de este dispositivo y recarga la ventana para que todo salga ya traducido. */
export function setLang(id: Lang): void {
  if (!isLang(id) || id === current) return
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* sin almacenamiento: dura hasta cerrar */
  }
  current = id
  applyLang()
  if (import.meta.env?.MODE !== 'test') window.location.reload()
}

/** Solo para pruebas: cambia el idioma sin guardar ni recargar. */
export function __setLangForTests(id: Lang): void {
  current = id
}

// Otra ventana (otra pestaña del navegador) cambió el idioma: recargar para seguirla.
if (typeof window !== 'undefined' && import.meta.env?.MODE !== 'test') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    if (storedLang() !== current) window.location.reload()
  })
}
