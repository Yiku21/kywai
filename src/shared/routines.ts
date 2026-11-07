// Rutinas: lo que no depende del motor (cálculo de la próxima ejecución, textos legibles y la orden «/rutina …»).
// Lo usan el motor (src/main/routines.ts) y la interfaz (pestaña Rutinas, cuadro de texto). Las horas son siempre
// las locales del equipo donde corre (el servidor): se construyen con new Date(año, mes, día, h, m).
import { lang, locale, tr } from './i18n'
import type { Routine, RoutineTrigger } from './types'

export const HOUR_MS = 3_600_000
/** Cada N horas: entre 1 hora y una semana. */
export const MIN_INTERVAL_HOURS = 1
export const MAX_INTERVAL_HOURS = 168
export const MAX_ROUTINE_NAME = 80
export const MAX_ROUTINE_REQUEST = 8000

/** Nombres de los días como Date.getDay(): 0 = domingo. */
export const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
export const DAY_SHORT = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'] as const
const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const DAY_SHORT_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const
/** Un día de la semana con Intl (el 7 de enero de 2024 fue domingo). */
const intlDay = (d: number, weekday: 'long' | 'short'): string =>
  new Intl.DateTimeFormat(locale(), { weekday }).format(new Date(2024, 0, 7 + d))
/** Nombre del día en el idioma de la app (0 = domingo). */
export const dayName = (d: number): string => (lang() === 'es' ? DAY_NAMES[d] : lang() === 'en' ? DAY_NAMES_EN[d] : intlDay(d, 'long'))
/** Abreviatura del día en el idioma de la app. */
export const dayShort = (d: number): string => (lang() === 'es' ? DAY_SHORT[d] : lang() === 'en' ? DAY_SHORT_EN[d] : intlDay(d, 'short'))
/** «a, b y c» en el idioma de la app. */
const AND: Record<string, string> = { es: ' y ', en: ' and ', pt: ' e ', fr: ' et ', zh: '和' }
function joinAnd(names: string[]): string {
  if (names.length < 2) return names.join('')
  const sep = lang() === 'zh' ? '、' : ', '
  return `${names.slice(0, -1).join(sep)}${AND[lang()] ?? ' y '}${names[names.length - 1]}`
}
/** Orden en que se enseñan (la semana empieza el lunes). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

/** «9:5», «09:05», «9.30», «9h», «21» → «HH:MM»; null si no es una hora válida. */
export function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = /^\s*(\d{1,2})(?:\s*[:.h]\s*(\d{1,2}))?\s*h?\s*$/i.exec(raw)
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] === undefined ? 0 : Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** «2026-11-08» (o «2026-11-8») → «2026-11-08»; null si no es una fecha real. */
export function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(raw)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const at = new Date(y, mo - 1, d)
  if (at.getFullYear() !== y || at.getMonth() !== mo - 1 || at.getDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** La fecha local de `ts` como «2026-11-08». */
export function dateOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Cuándo toca una rutina de una sola vez (hora local del equipo donde corre). */
export function onceAt(t: { date: string; time: string }): number {
  const [y, mo, d] = t.date.split('-').map(Number)
  const [h, m] = hm(t.time)
  return new Date(y, mo - 1, d, h, m, 0, 0).getTime()
}

function hm(time: string): [number, number] {
  const [h, m] = time.split(':').map(Number)
  return [h, m]
}

/** El disparador, limpio y validado; lanza un error legible si algo no vale. */
export function cleanTrigger(raw: unknown): RoutineTrigger {
  const t = (raw ?? {}) as Record<string, unknown>
  switch (t.type) {
    case 'daily': {
      const time = normalizeTime(t.time)
      if (!time) throw new Error(tr('Escribe la hora como 09:00'))
      return { type: 'daily', time }
    }
    case 'weekly': {
      const time = normalizeTime(t.time)
      if (!time) throw new Error(tr('Escribe la hora como 09:00'))
      const days = Array.isArray(t.days) ? [...new Set(t.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : []
      if (!days.length) throw new Error(tr('Elige al menos un día de la semana'))
      return { type: 'weekly', days, time }
    }
    case 'interval': {
      const hours = Number(t.hours)
      if (!Number.isInteger(hours) || hours < MIN_INTERVAL_HOURS || hours > MAX_INTERVAL_HOURS) {
        throw new Error(tr('Cada cuántas horas: un número entero entre {MIN_INTERVAL_HOURS} y {MAX_INTERVAL_HOURS}', { MIN_INTERVAL_HOURS, MAX_INTERVAL_HOURS }))
      }
      return { type: 'interval', hours }
    }
    case 'once': {
      const date = normalizeDate(t.date)
      if (!date) throw new Error(tr('Elige el día (como 2026-11-08)'))
      const time = normalizeTime(t.time)
      if (!time) throw new Error(tr('Escribe la hora como 09:00'))
      return { type: 'once', date, time }
    }
    case 'webhook':
      return { type: 'webhook' }
    case 'folder': {
      const path = typeof t.path === 'string' ? t.path.trim().replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '') : ''
      if (path.length > 300 || path.includes('\0') || path.split('/').some((s) => s === '..') || /^[a-z]:/i.test(path)) {
        throw new Error(tr('La carpeta tiene que estar dentro de la del proyecto (ruta relativa, sin «..»)'))
      }
      return { type: 'folder', path }
    }
    default:
      throw new Error(tr('Disparador no válido'))
  }
}

/** Se lanza sola por horario (no por webhook ni por cambios en una carpeta). */
export function isScheduled(t: RoutineTrigger): t is Extract<RoutineTrigger, { type: 'daily' | 'weekly' | 'interval' | 'once' }> {
  return t.type === 'daily' || t.type === 'weekly' || t.type === 'interval' || t.type === 'once'
}

/** Ese día (el de `ts`, más `addDays`) a la hora indicada, en la hora local. */
function atDay(ts: number, addDays: number, time: string): number {
  const d = new Date(ts)
  const [h, m] = hm(time)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + addDays, h, m, 0, 0).getTime()
}

/** Próxima ejecución programada estrictamente después de `after` (null si no va por horario). */
export function nextRunAt(t: RoutineTrigger, after: number): number | null {
  switch (t.type) {
    case 'daily': {
      const today = atDay(after, 0, t.time)
      return today > after ? today : atDay(after, 1, t.time)
    }
    case 'weekly': {
      for (let i = 0; i <= 7; i++) {
        const at = atDay(after, i, t.time)
        if (at > after && t.days.includes(new Date(at).getDay())) return at
      }
      return null
    }
    case 'interval':
      return after + t.hours * HOUR_MS
    case 'once': {
      const at = onceAt(t)
      return at > after ? at : null
    }
    default:
      return null
  }
}

/**
 * Horas programadas en (from, to]: cuántas hay y la última. Sirve para saber si toca lanzarla (count ≥ 1) y si se
 * perdió alguna (count > 1, o la última quedó muy atrás porque la app estaba cerrada o el equipo dormía).
 */
export function slotsBetween(t: RoutineTrigger, from: number, to: number, cap = 10_000): { count: number; last: number | null } {
  let count = 0
  let last: number | null = null
  let at = nextRunAt(t, from)
  while (at !== null && at <= to && count < cap) {
    count++
    last = at
    at = nextRunAt(t, at)
  }
  return { count, last }
}

/** Próxima hora programada de una rutina (null si va por webhook, por carpeta o está desactivada). */
export function nextRoutineRun(r: Pick<Routine, 'enabled' | 'trigger' | 'lastSlotAt' | 'scheduleFrom' | 'createdAt'>): number | null {
  if (!r.enabled || !isScheduled(r.trigger)) return null
  return nextRunAt(r.trigger, Math.max(r.lastSlotAt ?? 0, r.scheduleFrom ?? r.createdAt))
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/** «lunes, miércoles y viernes», «de lunes a viernes», «los fines de semana». */
export function describeDays(days: number[]): string {
  const set = new Set(days)
  if (set.size === 7) return tr('todos los días')
  const workdays = [1, 2, 3, 4, 5]
  if (set.size === 5 && workdays.every((d) => set.has(d))) return tr('de lunes a viernes')
  if (set.size === 2 && set.has(0) && set.has(6)) return tr('los fines de semana')
  const names = WEEK_ORDER.filter((d) => set.has(d)).map(dayName)
  if (lang() === 'en') return names.length === 1 ? `on ${names[0]}s` : joinAnd(names)
  if (lang() !== 'es') return joinAnd(names)
  if (names.length === 1) return `los ${names[0]}${names[0].endsWith('s') ? '' : 's'}`
  return joinAnd(names)
}

/** Frase corta del disparador para la interfaz y los mensajes: «Cada día a las 09:00». */
export function describeTrigger(t: RoutineTrigger): string {
  switch (t.type) {
    case 'daily':
      return tr('Cada día a las {time}', { time: t.time })
    case 'weekly': {
      const days = describeDays(t.days)
      return tr('{days} a las {time}', { days: `${days.charAt(0).toUpperCase()}${days.slice(1)}`, time: t.time })
    }
    case 'interval':
      return t.hours === 1 ? tr('Cada hora') : tr('Cada {hours} {plural}', { hours: t.hours, plural: plural(t.hours, tr('hora'), tr('horas')) })
    case 'once':
      return tr('Una vez: {when}', { when: describeWhen(onceAt(t)) })
    case 'webhook':
      return tr('Al llegar un webhook')
    case 'folder':
      return t.path ? tr('Al cambiar archivos de {path}', { path: t.path }) : tr('Al cambiar archivos del proyecto')
  }
}

/** «hoy a las 09:00», «mañana a las 09:00», «el lunes 20 a las 09:00». */
export function describeWhen(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const day = (x: number): number => new Date(new Date(x).getFullYear(), new Date(x).getMonth(), new Date(x).getDate()).getTime()
  const diff = Math.round((day(ts) - day(now)) / 86_400_000)
  if (diff === 0) return tr('hoy a las {time}', { time })
  if (diff === 1) return tr('mañana a las {time}', { time })
  if (diff === -1) return tr('ayer a las {time}', { time })
  return tr('el {day} {date} a las {time}', { day: dayName(d.getDay()), date: lang() === 'en' || lang() === 'zh' ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getDate()}/${d.getMonth() + 1}`, time })
}

// ---------- «/rutina …» en el chat ----------

const DAY_WORDS: Array<[RegExp, number]> = [
  [/^lunes$/, 1],
  [/^martes$/, 2],
  [/^miercoles$/, 3],
  [/^jueves$/, 4],
  [/^viernes$/, 5],
  [/^sabados?$/, 6],
  [/^domingos?$/, 0]
]

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** «lunes, miércoles y viernes», «de lunes a viernes», «laborables», «fines de semana» → días (null si no lo son). */
export function parseDays(raw: string): number[] | null {
  const t = fold(raw).replace(/^(los|cada|todos los)\s+/, '').trim()
  if (/^(dias )?(laborables|entre semana)$/.test(t)) return [1, 2, 3, 4, 5]
  if (/^(los )?(fines?|finde)s?( de semana)?$/.test(t)) return [0, 6]
  if (/^(dias|todos los dias)$/.test(t)) return [0, 1, 2, 3, 4, 5, 6]
  const range = /^(?:de\s+)?(\w+)\s+a\s+(\w+)$/.exec(t)
  const dayOf = (w: string): number | null => DAY_WORDS.find(([re]) => re.test(w))?.[1] ?? null
  if (range) {
    const a = dayOf(range[1])
    const b = dayOf(range[2])
    if (a === null || b === null) return null
    const order = [...WEEK_ORDER] as number[]
    const i = order.indexOf(a)
    const j = order.indexOf(b)
    if (i > j) return null
    return order.slice(i, j + 1).sort()
  }
  const words = t.split(/\s*(?:,|\by\b|\be\b)\s*/).filter(Boolean)
  if (!words.length) return null
  const out: number[] = []
  for (const w of words) {
    const d = dayOf(w.replace(/^(los|el)\s+/, ''))
    if (d === null) return null
    if (!out.includes(d)) out.push(d)
  }
  return out.sort()
}

export interface RoutineCommand {
  name: string
  request: string
  trigger: RoutineTrigger
}

/** Ayuda de «/rutina» (función: el texto sigue el idioma de la app). */
export const routineCommandHelp = (): string =>
  tr('Escribe, por ejemplo: «/rutina cada día a las 9:00: revisa las dependencias», «/rutina de lunes a viernes a las 8:30: …», «/rutina cada 6 horas: …», «/rutina mañana a las 7:00: …» (una sola vez) o «/rutina webhook: revisa el PR que llega». También puedes crearla en la pestaña Rutinas.')

/** Nombre corto a partir de la petición (la primera frase, sin pasar de 48 caracteres). */
export function routineNameFrom(request: string): string {
  const first = request.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? ''
  const clean = first.replace(/[.!?:;,]+$/, '')
  const name = clean.length > 48 ? `${clean.slice(0, 47).replace(/\s+\S*$/, '')}…` : clean
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Rutina'
}

const TIME = String.raw`(?:(?:a\s+las?|at)\s+)?(\d{1,2}(?:[:.h]\d{2})?)\s*(?:h(?:oras)?\b)?`
const SEP = String.raw`\s*(?:[:,—–-]\s*|\s)`

/**
 * «/rutina …» → la rutina que hay que crear, o un mensaje de ayuda si no se entiende. El texto después del horario
 * es la petición (lo que se enviará al chat). Acepta: «cada día / todos los días / a diario a las 9:00»,
 * «<días> a las 8:30» (lunes y jueves, de lunes a viernes, laborables, fines de semana), «cada N horas», «cada hora»,
 * «webhook» y «al cambiar archivos [de carpeta]». También en inglés: «every day at 9:00», «every 6 hours», «on webhook»,
 * «when files change [in carpeta]».
 */
export function parseRoutineCommand(input: string, now = Date.now()): RoutineCommand | { error: string } {
  const text = input.replace(/^\s*\/(rutina|rutinas|routine)\b/i, '').trim()
  if (!text) return { error: routineCommandHelp() }
  const f = fold(text)
  const finish = (trigger: RoutineTrigger, consumed: number): RoutineCommand | { error: string } => {
    // fold() no cambia la longitud del texto salvo por las tildes descompuestas: se recorta por palabras en el original.
    const request = cutPrefix(text, consumed).replace(/^[\s:,—–-]+/, '').trim()
    if (request.length < 3) return { error: tr('Falta lo que tiene que hacer la rutina. {ROUTINE_COMMAND_HELP}', { ROUTINE_COMMAND_HELP: routineCommandHelp() }) }
    return { name: routineNameFrom(request), request: request.slice(0, MAX_ROUTINE_REQUEST), trigger }
  }
  let m = new RegExp(String.raw`^(?:cada\s+dia|todos\s+los\s+dias|a\s+diario|diariamente|cada\s+manana|todas\s+las\s+mananas|every\s+day|everyday|daily|every\s+morning)\s+${TIME}${SEP}`).exec(f)
  if (m) {
    const time = normalizeTime(m[1])
    return time ? finish({ type: 'daily', time }, m[0].length) : { error: tr('Hora no válida. {ROUTINE_COMMAND_HELP}', { ROUTINE_COMMAND_HELP: routineCommandHelp() }) }
  }
  m = /^(?:cada|every)\s+(?:(\d{1,3})\s+)?(?:horas?|hours?)\b\s*(?:[:,—–-]\s*)?/.exec(f)
  if (m) {
    const hours = m[1] ? Number(m[1]) : 1
    if (hours < MIN_INTERVAL_HOURS || hours > MAX_INTERVAL_HOURS) return { error: tr('Cada cuántas horas: entre {MIN_INTERVAL_HOURS} y {MAX_INTERVAL_HOURS}.', { MIN_INTERVAL_HOURS, MAX_INTERVAL_HOURS }) }
    return finish({ type: 'interval', hours }, m[0].length)
  }
  m = /^(?:(?:con|por|al\s+(?:llegar|recibir)(?:\s+un)?|on|via|by|when\s+a)\s+)?(?:a\s+)?webhook\b\s*(?:[:,—–-]\s*)?/.exec(f)
  if (m) return finish({ type: 'webhook' }, m[0].length)
  // Sobre el original (esas palabras no llevan tildes): la carpeta conserva mayúsculas y tildes.
  const folder = /^(?:(?:al|cuando)\s+cambi(?:ar|en)\s+(?:los\s+)?archivos|when\s+files\s+change)(?:\s+(?:de|en|in)\s+([^\s:,]+))?\s*(?:[:,—–-]\s*)?/i.exec(text)
  if (folder) {
    try {
      const request = text.slice(folder[0].length).trim()
      if (request.length < 3) return { error: tr('Falta lo que tiene que hacer la rutina. {ROUTINE_COMMAND_HELP}', { ROUTINE_COMMAND_HELP: routineCommandHelp() }) }
      return { name: routineNameFrom(request), request: request.slice(0, MAX_ROUTINE_REQUEST), trigger: cleanTrigger({ type: 'folder', path: folder[1] ?? '' }) }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }
  const once = parseOnce(f, now)
  if (once) {
    if ('error' in once) return once
    return finish(once.trigger, once.consumed)
  }
  m = new RegExp(String.raw`^(.+?)\s+${TIME}${SEP}`).exec(f)
  if (m) {
    const days = parseDays(m[1])
    const time = normalizeTime(m[2])
    if (days && time) return finish(days.length === 7 ? { type: 'daily', time } : { type: 'weekly', days, time }, m[0].length)
  }
  return { error: tr('No entendí cuándo debe lanzarse. {ROUTINE_COMMAND_HELP}', { ROUTINE_COMMAND_HELP: routineCommandHelp() }) }
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DAY_WORDS_EN: Array<[RegExp, number]> = [
  [/^sunday$/, 0],
  [/^monday$/, 1],
  [/^tuesday$/, 2],
  [/^wednesday$/, 3],
  [/^thursday$/, 4],
  [/^friday$/, 5],
  [/^saturday$/, 6]
]

/**
 * Las formas de «una sola vez» (sobre el texto sin tildes): «hoy / mañana / pasado mañana a las 7», «el viernes a las
 * 18:00», «el 15/11 a las 9», «el 15 de noviembre a las 9», «el 2026-11-15 a las 9», «una vez a las 9» (hoy, o mañana
 * si ya pasó), «dentro de 2 horas», «en 30 minutos». En inglés: «today / tomorrow at 7», «on friday at 18:00»,
 * «in 2 hours». Devuelve null si no es ninguna (para seguir con las demás), o un error si la hora ya pasó.
 */
function parseOnce(f: string, now: number): { trigger: RoutineTrigger; consumed: number } | { error: string } | null {
  const at = (day: number, time: string | null, consumed: number): { trigger: RoutineTrigger; consumed: number } | { error: string } => {
    if (!time) return { error: tr('Hora no válida. {ROUTINE_COMMAND_HELP}', { ROUTINE_COMMAND_HELP: routineCommandHelp() }) }
    const trigger: RoutineTrigger = { type: 'once', date: dateOf(day), time }
    if (onceAt(trigger) <= now) return { error: tr('Esa hora ya ha pasado: elige una que esté por llegar.') }
    return { trigger, consumed }
  }
  const dayFrom = (add: number): number => {
    const d = new Date(now)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + add, 12).getTime()
  }
  // Dentro de N minutos u horas.
  let m = /^(?:dentro\s+de|en|in)\s+(\d{1,4}|una?|media)\s+(minutos?|mins?|horas?|hours?|minutes?|h)\b(?:\s+y\s+media)?\s*(?:[:,—–-]\s*)?/.exec(f)
  if (m) {
    const n = m[1] === 'media' ? 0.5 : /^una?$/.test(m[1]) ? 1 : Number(m[1])
    const half = /\by\s+media\b/.test(m[0]) ? 0.5 : 0
    const minutes = /^(?:minutos?|mins?|minutes?)$/.test(m[2]) ? n : (n + half) * 60
    if (!minutes || minutes > 60 * 24 * 365) return { error: tr('No entendí cuándo debe lanzarse. {ROUTINE_COMMAND_HELP}', { ROUTINE_COMMAND_HELP: routineCommandHelp() }) }
    const when = new Date(now + minutes * 60_000)
    const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`
    return { trigger: { type: 'once', date: dateOf(when.getTime()), time }, consumed: m[0].length }
  }
  // Hoy, mañana, pasado mañana.
  m = new RegExp(String.raw`^(hoy|esta\s+(?:manana|tarde|noche)|pasado\s+manana|manana|today|tonight|tomorrow)\s+${TIME}${SEP}`).exec(f)
  if (m) {
    const add = /^pasado/.test(m[1]) ? 2 : /^(manana|tomorrow)$/.test(m[1]) ? 1 : 0
    let time = normalizeTime(m[2])
    // «esta tarde a las 5», «esta noche a las 9», «tonight at 9»: por la tarde.
    if (time && /tarde|noche|tonight/.test(m[1]) && Number(time.slice(0, 2)) < 12) time = `${String(Number(time.slice(0, 2)) + 12).padStart(2, '0')}${time.slice(2)}`
    return at(dayFrom(add), time, m[0].length)
  }
  // Una vez a las 9 (hoy, o mañana si ya pasó).
  m = new RegExp(String.raw`^(?:una\s+vez|once)\s+${TIME}${SEP}`).exec(f)
  if (m) {
    const time = normalizeTime(m[1])
    if (!time) return at(dayFrom(0), null, 0)
    const today = { type: 'once' as const, date: dateOf(dayFrom(0)), time }
    return at(dayFrom(onceAt(today) > now ? 0 : 1), time, m[0].length)
  }
  // El viernes a las 18:00 (el próximo; hoy si es ese día y la hora aún no ha pasado).
  m = new RegExp(String.raw`^(?:el\s+(?:proximo\s+)?|(?:next\s+|on\s+(?:next\s+)?))(\w+)\s+${TIME}${SEP}`).exec(f)
  if (m) {
    const day = DAY_WORDS.find(([re]) => re.test(m![1]))?.[1] ?? DAY_WORDS_EN.find(([re]) => re.test(m![1]))?.[1]
    if (day !== undefined) {
      const time = normalizeTime(m[2])
      if (!time) return at(dayFrom(0), null, 0)
      for (let i = 0; i <= 7; i++) {
        const d = dayFrom(i)
        if (new Date(d).getDay() === day && onceAt({ date: dateOf(d), time }) > now) return at(d, time, m[0].length)
      }
    }
  }
  // El 15/11 [/2026], el 2026-11-15, el 15 de noviembre [de 2026], a las 9.
  m = new RegExp(String.raw`^(?:el\s+|on\s+)?(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?|(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?)\s+${TIME}${SEP}`).exec(f)
  if (m) {
    const month = m[2] ? Number(m[2]) : m[5] ? Number(m[5]) : MONTHS.indexOf(m[8] ?? '') + 1
    const dayN = Number(m[3] ?? m[4] ?? m[7])
    const yearRaw = m[1] ?? m[6] ?? m[9]
    if (month >= 1) {
      const time = normalizeTime(m[10])
      let year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : new Date(now).getFullYear()
      let date = normalizeDate(`${year}-${month}-${dayN}`)
      if (!date) return { error: tr('Esa fecha no existe. {ROUTINE_COMMAND_HELP}', { ROUTINE_COMMAND_HELP: routineCommandHelp() }) }
      // Sin año y ya pasada este año: el que viene.
      if (!yearRaw && time && onceAt({ date, time }) <= now) {
        year++
        date = normalizeDate(`${year}-${month}-${dayN}`) ?? date
      }
      const [y, mo, d] = date.split('-').map(Number)
      return at(new Date(y, mo - 1, d, 12).getTime(), time, m[0].length)
    }
  }
  return null
}

/** Quita del original los primeros `n` caracteres de su versión sin tildes (cuentan igual letra a letra). */
function cutPrefix(original: string, n: number): string {
  let folded = 0
  let i = 0
  while (i < original.length && folded < n) {
    folded += fold(original[i]).length
    i++
  }
  return original.slice(i)
}
