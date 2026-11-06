// Rutinas: lo que no depende del motor (cálculo de la próxima ejecución, textos legibles y la orden «/rutina …»).
// Lo usan el motor (src/main/routines.ts) y la interfaz (pestaña Rutinas, cuadro de texto). Las horas son siempre
// las locales del equipo donde corre (el servidor): se construyen con new Date(año, mes, día, h, m).
import { lang, tr } from './i18n'
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
/** Nombre del día en el idioma de la app (0 = domingo). */
export const dayName = (d: number): string => (lang() === 'en' ? DAY_NAMES_EN : DAY_NAMES)[d]
/** Abreviatura del día en el idioma de la app. */
export const dayShort = (d: number): string => (lang() === 'en' ? DAY_SHORT_EN : DAY_SHORT)[d]
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
export function isScheduled(t: RoutineTrigger): t is Extract<RoutineTrigger, { type: 'daily' | 'weekly' | 'interval' }> {
  return t.type === 'daily' || t.type === 'weekly' || t.type === 'interval'
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
  if (lang() === 'en') return names.length === 1 ? `on ${names[0]}s` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  if (names.length === 1) return `los ${names[0]}${names[0].endsWith('s') ? '' : 's'}`
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
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
  return tr('el {day} {date} a las {time}', { day: dayName(d.getDay()), date: lang() === 'en' ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getDate()}/${d.getMonth() + 1}`, time })
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
  tr('Escribe, por ejemplo: «/rutina cada día a las 9:00: revisa las dependencias», «/rutina de lunes a viernes a las 8:30: …», «/rutina cada 6 horas: …» o «/rutina webhook: revisa el PR que llega». También puedes crearla en la pestaña Rutinas.')

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
export function parseRoutineCommand(input: string): RoutineCommand | { error: string } {
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
  m = new RegExp(String.raw`^(.+?)\s+${TIME}${SEP}`).exec(f)
  if (m) {
    const days = parseDays(m[1])
    const time = normalizeTime(m[2])
    if (days && time) return finish(days.length === 7 ? { type: 'daily', time } : { type: 'weekly', days, time }, m[0].length)
  }
  return { error: tr('No entendí cuándo debe lanzarse. {ROUTINE_COMMAND_HELP}', { ROUTINE_COMMAND_HELP: routineCommandHelp() }) }
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
