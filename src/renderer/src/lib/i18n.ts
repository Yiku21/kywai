// Idioma de la interfaz en este dispositivo. El motor de traducción (t, diccionarios) está en @shared/i18n; aquí se
// elige y se recuerda el idioma, como el tema.
//
// El idioma se elige en ⋮ → Ajustes → Idioma y se recuerda en cada dispositivo. Si nunca se ha elegido, se usa el del
// sistema (el primero de sus idiomas que tenga la app; si no, inglés). Al cambiarlo se avisa al motor (para los avisos y las
// respuestas de Hermes) y la ventana se recarga: así los textos calculados al cargar cada módulo (listas de temas,
// nombres de zonas…) salen ya en el idioma nuevo.
import { isLang, lang, langFromLocale, LANGS, locale, setCurrentLang, t, type Lang } from '@shared/i18n'

export { lang, LANGS, locale, t, type Lang }

const KEY = 'aicowork.lang'

/** El idioma del sistema (o del navegador): el primero de su lista que tenga la app; si ninguno, inglés. */
export function systemLang(): Lang {
  try {
    const list = navigator.languages?.length ? navigator.languages : [navigator.language]
    const known = list.map((l) => langFromLocale(l)).find((id, i) => id !== 'en' || /^en\b/i.test(list[i] ?? ''))
    return known ?? 'en'
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

setCurrentLang(storedLang())

/** Pone el atributo lang de la página (lectores de pantalla, corrector, guiones). */
export function applyLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang()
}

/**
 * Cambia el idioma de este dispositivo, se lo dice al motor (si lo hay) y recarga la ventana para que todo salga ya
 * traducido. `tellEngine` recibe el idioma nuevo (por ejemplo, api.setLanguage).
 */
export async function setLang(id: Lang, tellEngine?: (id: Lang) => Promise<unknown>): Promise<void> {
  if (!isLang(id) || id === lang()) return
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* sin almacenamiento: dura hasta cerrar */
  }
  setCurrentLang(id)
  applyLang()
  try {
    await tellEngine?.(id)
  } catch {
    /* motor antiguo o sin conexión: la interfaz cambia igual */
  }
  if (import.meta.env?.MODE !== 'test') window.location.reload()
}

/** Solo para pruebas: cambia el idioma sin guardar ni recargar. */
export function __setLangForTests(id: Lang): void {
  setCurrentLang(id)
}

// Otra ventana (otra pestaña del navegador) cambió el idioma: recargar para seguirla.
if (typeof window !== 'undefined' && import.meta.env?.MODE !== 'test') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    if (storedLang() !== lang()) window.location.reload()
  })
}
