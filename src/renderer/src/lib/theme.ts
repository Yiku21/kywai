// Temas de kywai, en tres grupos:
// - los siete mapas, cada uno con su entorno, plataformas y núcleo (ids «mundo-…», en scene/worlds/);
// - la Ciudad digital, un mismo espacio con siete colores a elegir (Clásico, Frost Glass, Marfil, Grafito, Bosque,
//   Matrix y EVA-01; antes eran siete temas sueltos y sus ids siguen igual, así nadie pierde el que tenía);
// - cuatro con decoración propia (Relicario, Telar, Halloween y Navidad).
// Se aplican al momento con data-theme en <html> (las variables de tokens.css cambian; un mapa usa los colores de la
// interfaz del color con su nombre) y data-world (solo en los mapas), y con la paleta del espacio digital
// (scene/palette.ts). El tema lo guarda el servidor y lo siguen todos los dispositivos conectados a él (escritorio,
// clientes, navegador y Órbita), salvo los que marquen «Usar un tema propio en este dispositivo».
import { useSyncExternalStore } from 'react'
import { setScenePalette } from '@/scene/palette'
import type { WorldStyle } from '@/scene/worlds/models'
import { t } from '@/lib/i18n'

/**
 * Los colores de la Ciudad digital, con nombres propios para no repetir los de los mapas. Los ids son los de cuando
 * eran temas sueltos (así nadie pierde el suyo): clasico = Índigo, orbita = Frost Glass, marfil = Perla,
 * grafito = Ónix, bosque = Esmeralda, matrix = Neón, eva = Ultravioleta.
 */
export type CityColor = 'clasico' | 'orbita' | 'marfil' | 'grafito' | 'bosque' | 'matrix' | 'eva'
export type DecorTheme = 'relicario' | 'telar' | 'halloween' | 'navidad'
export type WorldTheme = `mundo-${WorldStyle}`
export type HomeTheme = 'kywai'
export type SeaTheme = 'submarino'
export type ThemeId = CityColor | DecorTheme | WorldTheme | HomeTheme | SeaTheme

export interface ThemeInfo<Id extends ThemeId = ThemeId> {
  id: Id
  name: string
  hint: string
}

/** Los siete mapas, en el orden de la galería. */
export const WORLDS: ReadonlyArray<ThemeInfo<WorldTheme>> = [
  { id: 'mundo-clasico', name: t('Clásico'), hint: t('Centro de operaciones del ciberespacio, con servidores y un núcleo holográfico') },
  { id: 'mundo-orbita', name: t('Órbita'), hint: t('Estación sobre la Tierra, con muelles flotantes y un planetario') },
  { id: 'mundo-marfil', name: t('Marfil'), hint: t('Jardín del Olimpo: piedra clara, arcos y canales de agua') },
  { id: 'mundo-grafito', name: t('Grafito'), hint: t('Fábrica térmica con engranajes, vapor y un reactor ámbar') },
  { id: 'mundo-bosque', name: t('Bosque'), hint: t('Claro élfico: árboles, plataformas de madera y luciérnagas') },
  { id: 'mundo-matrix', name: 'Matrix', hint: t('Ciudad entre código y niebla, con un núcleo de datos') },
  { id: 'mundo-eva', name: 'EVA-01', hint: t('Cámara de contención con compuertas y una cápsula de energía') }
]

/** Los colores de la Ciudad digital (el espacio de siempre). */
export const CITY_COLORS: ReadonlyArray<ThemeInfo<CityColor> & { swatch: [string, string] }> = [
  { id: 'clasico', name: t('Índigo'), hint: t('Paneles oscuros y sobrios, el de siempre'), swatch: ['#3f7bff', '#8b5cff'] },
  { id: 'orbita', name: 'Frost Glass', hint: t('Cristal azulado con brillos, como la app del móvil'), swatch: ['#9fd8ff', '#3f7bff'] },
  { id: 'marfil', name: t('Perla'), hint: t('Claro y cálido: marfil, verde y oro'), swatch: ['#ece7dc', '#2f8f68'] },
  { id: 'grafito', name: t('Ónix'), hint: t('Negro grafito con detalles dorados'), swatch: ['#1a1b1f', '#d4a24a'] },
  { id: 'bosque', name: t('Esmeralda'), hint: t('Verde bosque profundo con oro'), swatch: ['#0f2a1d', '#d4af5a'] },
  { id: 'matrix', name: t('Neón'), hint: t('Negro y verde neón'), swatch: ['#020a04', '#2bff6a'] },
  { id: 'eva', name: t('Ultravioleta'), hint: t('Morado y verde lima, como la Unidad 01'), swatch: ['#3b1d6e', '#a6ff3a'] }
]

/** Los temas con decoración propia en el espacio. */
export const DECORS: ReadonlyArray<ThemeInfo<DecorTheme>> = [
  { id: 'relicario', name: t('Relicario'), hint: t('Cristal y oro: un núcleo tallado y plataformas de vidrio') },
  { id: 'telar', name: t('Telar'), hint: t('Hilos de plata tejidos en el espacio, con destellos dorados') },
  { id: 'halloween', name: 'Halloween', hint: t('Calabazas, velas, luna y murciélagos en una noche morada') },
  { id: 'navidad', name: t('Navidad'), hint: t('Nieve, regalos, árboles con luces y una bola de nieve') }
]

export const HOME: ThemeInfo<HomeTheme> = { id: 'kywai', name: t('Refugio Kywai'), hint: t('Observatorio-invernadero frente al mar, con talleres y un árbol compartido') }

export const SEA: ThemeInfo<SeaTheme> = { id: 'submarino', name: t('Fondo marino'), hint: t('Un arrecife vivo con peces, medusas y una perla de luz') }

/** Todos los temas que se pueden elegir. */
export const THEMES: ReadonlyArray<ThemeInfo> = [HOME, SEA, ...WORLDS, ...CITY_COLORS, ...DECORS]

export const DEFAULT_THEME: ThemeId = 'clasico'

export function isCityColor(id: ThemeId): id is CityColor {
  return CITY_COLORS.some((c) => c.id === id)
}

/** El mapa de un tema (undefined en la Ciudad digital y en los decorados). */
export function worldOf(id: ThemeId): WorldStyle | undefined {
  return id.startsWith('mundo-') ? (id.slice(6) as WorldStyle) : undefined
}

/** Los colores de la interfaz (data-theme): un mapa usa los del color con su nombre; el resto, los suyos. */
export function uiThemeOf(id: ThemeId): CityColor | DecorTheme | HomeTheme | SeaTheme {
  return worldOf(id) ?? (id as CityColor | DecorTheme | HomeTheme | SeaTheme)
}

/** El nombre para mostrar: «Ciudad digital · Grafito» en la ciudad, el nombre a secas en los demás. */
export function themeLabel(id: ThemeId): string {
  const info = THEMES.find((x) => x.id === id)
  if (!info) return ''
  return isCityColor(id) ? `${t('Ciudad digital')} · ${info.name}` : info.name
}

const KEY = 'aicowork.theme'
const listeners = new Set<() => void>()

function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value)
}

/** El tema guardado en este dispositivo (la Ciudad digital en Clásico si no hay ninguno). */
export function storedTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(KEY)
    return isTheme(saved) ? saved : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

let current: ThemeId = DEFAULT_THEME

/** Lo pone en la página (al arrancar, antes de pintar nada, para que no parpadee). */
export function applyTheme(id: ThemeId): void {
  current = id
  const root = document.documentElement
  root.dataset.theme = uiThemeOf(id)
  const world = worldOf(id)
  if (world) root.dataset.world = world
  else delete root.dataset.world
  setScenePalette(id)
}

/** Quien guarda el tema en el servidor (para que los demás dispositivos y Órbita se vean igual). */
let tellEngine: ((id: ThemeId) => void) | null = null

/** Al elegir un tema, se le dice también al motor (App lo conecta con api.setUiTheme). */
export function onThemeChosen(fn: ((id: ThemeId) => void) | null): void {
  tellEngine = fn
}

/** «Usar un tema propio en este dispositivo»: si está marcado, este dispositivo ni sigue ni cambia el del servidor. */
const OWN_KEY = 'aicowork.themeOwn'

export function ownTheme(): boolean {
  try {
    return localStorage.getItem(OWN_KEY) === '1'
  } catch {
    return false
  }
}

/** El último tema que se sabe que tiene el servidor (para volver a él al desmarcar el tema propio). */
let serverTheme: ThemeId | null = null

/** Lo pone y lo recuerda en este dispositivo, sin decírselo al servidor. */
function keep(id: ThemeId): void {
  applyTheme(id)
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* sin almacenamiento: dura hasta cerrar */
  }
  listeners.forEach((l) => l())
}

export function setTheme(id: ThemeId): void {
  if (!isTheme(id)) return
  if (!ownTheme()) {
    serverTheme = id
    tellEngine?.(id)
  }
  keep(id)
}

/**
 * El tema que tiene el servidor (al conectar y cada vez que alguien lo cambia en otro dispositivo): se aplica al
 * momento, salvo que este dispositivo use un tema propio. Un id que esta versión no conoce se ignora.
 */
export function followServerTheme(id: unknown): void {
  if (!isTheme(id)) return
  serverTheme = id
  if (ownTheme() || id === current) return
  if (isCityColor(id)) rememberCity(id)
  keep(id)
}

/** Marca o desmarca el tema propio. Al desmarcarlo, vuelve al del servidor (o le pasa el suyo si aún no tiene). */
export function setOwnTheme(on: boolean): void {
  try {
    if (on) localStorage.setItem(OWN_KEY, '1')
    else localStorage.removeItem(OWN_KEY)
  } catch {
    /* sin almacenamiento */
  }
  if (!on) {
    if (serverTheme && serverTheme !== current) followServerTheme(serverTheme)
    else if (!serverTheme) setTheme(current)
  }
  listeners.forEach((l) => l())
}

export function useOwnTheme(): boolean {
  return useSyncExternalStore(subscribe, ownTheme)
}

/** El color de la Ciudad digital que se eligió la última vez (para volver a él al pulsar la tarjeta). */
const CITY_KEY = 'aicowork.cityColor'

export function lastCityColor(): CityColor {
  try {
    const saved = localStorage.getItem(CITY_KEY) as ThemeId | null
    if (saved && isCityColor(saved)) return saved
  } catch {
    /* sin almacenamiento */
  }
  return isCityColor(current) ? current : 'clasico'
}

/** Elige un color de la Ciudad digital (y lo recuerda para la próxima vez que se pulse la tarjeta). */
function rememberCity(id: CityColor): void {
  try {
    localStorage.setItem(CITY_KEY, id)
  } catch {
    /* sin almacenamiento */
  }
}

export function setCityColor(id: CityColor): void {
  rememberCity(id)
  setTheme(id)
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, () => current)
}

/** Los colores de la interfaz del tema actual (lo que hay en data-theme). */
export function useUiTheme(): CityColor | DecorTheme | HomeTheme | SeaTheme {
  return uiThemeOf(useTheme())
}

// Otra ventana (otra pestaña del navegador) cambió el tema.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== OWN_KEY && e.key !== null) return
    applyTheme(storedTheme())
    listeners.forEach((l) => l())
  })
}
