// Idiomas de kywai, común a la interfaz y al motor. El texto en español del código es la clave: t('Ajustes')
// devuelve «Ajustes» en español y lo que diga el diccionario del idioma (i18n-en.ts, i18n-pt.ts…) en los demás; si
// falta, el inglés y, si tampoco está, el español (src/renderer/src/lib/i18n.test.ts avisa de cada texto sin traducir). Los huecos van entre llaves:
// t('Hace {n} min', { n: 5 }).
//
// Cada proceso fija su idioma: la interfaz, el de su dispositivo (lib/i18n.ts); el motor, el de config.json
// («language»), que la interfaz cambia al elegir idioma en Ajustes. En el motor, donde «t» suele ser una tarea, se
// importa como «tr».
import { en } from './i18n-en'
import { fr } from './i18n-fr'
import { pt } from './i18n-pt'
import { zh } from './i18n-zh'

export type Lang = 'es' | 'en' | 'pt' | 'fr' | 'zh'

/** Los idiomas de la app, cada uno con su nombre en su propio idioma. */
export const LANGS: ReadonlyArray<{ id: Lang; name: string }> = [
  { id: 'es', name: 'Español' },
  { id: 'en', name: 'English' },
  { id: 'pt', name: 'Português' },
  { id: 'fr', name: 'Français' },
  { id: 'zh', name: '中文' }
]

const DICTS: Record<Exclude<Lang, 'es'>, Record<string, string>> = { en, pt, fr, zh }

const LOCALES: Record<Lang, string> = { es: 'es-ES', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR', zh: 'zh-CN' }

/** Cómo se llama cada idioma dentro de una frase en español. */
const NAMES_ES: Record<Lang, string> = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés', zh: 'chino (simplificado)' }

/** El idioma de la app para un código del sistema («pt-BR», «fr», «zh-Hans-CN»…); inglés si no es ninguno. */
export function langFromLocale(code: string | null | undefined): Lang {
  const base = (code ?? '').toLowerCase().split(/[-_]/)[0]
  return isLang(base) ? base : 'en'
}

let current: Lang = 'es'

export function isLang(value: unknown): value is Lang {
  return LANGS.some((l) => l.id === value)
}

export function lang(): Lang {
  return current
}

export function setCurrentLang(id: Lang): void {
  if (isLang(id)) current = id
}

/** Código BCP 47 para fechas y números (toLocaleString, Intl…). */
export function locale(): string {
  return LOCALES[current]
}

/** Traduce un texto escrito en español. Los {huecos} se rellenan con vars. */
export function t(text: string, vars?: Record<string, string | number | null | undefined>): string {
  const dict = current === 'es' ? undefined : DICTS[current]
  const out = dict?.[text] ?? (current === 'es' ? undefined : en[text]) ?? text
  if (!vars) return out
  return out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? '') : m))
}

/** Lo mismo que t(), para el motor (allí «t» suele ser una tarea). */
export const tr = t

/** Para las instrucciones a los agentes: en qué idioma deben escribir lo que verá el usuario. */
export function replyLanguage(): string {
  if (current === 'es') return 'Responde en español.'
  const name = NAMES_ES[current]
  return `Responde en ${name}: el usuario usa kywai en ${name}. Todo lo que vaya a ver (respuestas, títulos, resúmenes, avisos) va en ${name}, aunque estas instrucciones estén en español.`
}

/** Nombre del idioma del usuario, dentro de una frase en español («mensaje breve en inglés…»). */
export function userLanguageName(): string {
  return NAMES_ES[current]
}
