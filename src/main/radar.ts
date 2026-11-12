// «/radar [nicho]»: qué temas están subiendo ahora mismo en YouTube (y en la web) para tu nicho, puntuados, con una
// ficha de cada uno (por qué sube, 5 títulos y 3 ángulos) y la orden «/video …» lista para lanzarla con un toque.
//
// Sale de un reel en el que un agente vigila YouTube cada 4 horas y pinta cada tema como una estrella con su nota y su
// «dossier». En kywai lo hace un agente con terminal: busca con yt-dlp (sin claves ni cuentas) y en la web, compara con
// los radares anteriores del proyecto (carpeta radar/) para marcar lo nuevo y lo que sigue subiendo, y no inventa
// cifras. Para que vigile solo, una rutina: «/rutina cada 4 horas: /radar …».
// La orden va directa a un agente (sendDirect en orchestrator.ts) con el encargo que arma radarPrompt.

export interface RadarRequest {
  /** El nicho, las palabras clave o los canales a vigilar (vacío: los de las instrucciones del proyecto o IA en general). */
  niche: string
  /** Cuántos días hacia atrás cuentan como «ahora» (por defecto 7). */
  days: number
  /** Cuántos temas en el ranking (por defecto 8). */
  count: number
}

const DAYS_RE = /(?:^|\s)(?:(?:últim[oa]s?|ultim[oa]s?|last)\s+)?(\d{1,2})\s*(?:d[ií]as?|days?|d)(?=\s|$|[,.;])/i
const COUNT_RE = /(?:^|\s)(?:top\s*)?(\d{1,2})\s*(?:temas?|topics?)(?=\s|$|[,.;])/i

/** «/radar [7 días] [10 temas] [nicho]». null si no es la orden. */
export function parseRadarRequest(text: string): RadarRequest | null {
  const m = /^\/(?:radar|tendencias|trends)(?=\s|$)([\s\S]*)$/i.exec(text.trim())
  if (!m) return null
  let rest = ` ${m[1].trim()} `
  let days = 7
  const d = DAYS_RE.exec(rest)
  if (d) {
    days = Math.min(30, Math.max(1, Number(d[1])))
    rest = rest.replace(d[0], ' ')
  }
  let count = 8
  const c = COUNT_RE.exec(rest)
  if (c) {
    count = Math.min(15, Math.max(3, Number(c[1])))
    rest = rest.replace(c[0], ' ')
  }
  return { niche: rest.replace(/\s{2,}/g, ' ').trim().slice(0, 600), days, count }
}

/** Carpeta del proyecto donde se guardan los radares (uno por pasada). */
export const RADAR_DIR = 'radar'

/** «2026-11-12-2105»: nombre del archivo de esta pasada (hora local del servidor). */
export function radarStamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** El encargo para el agente. `lang`: el idioma en que contesta al usuario. */
export function radarPrompt(req: RadarRequest, input: { lang: string; stamp: string; previous: string[] }): string {
  const file = `${RADAR_DIR}/${input.stamp}.md`
  const niche = req.niche || 'el tema de este proyecto (míralo en sus instrucciones y archivos; si no hay pistas, herramientas y agentes de IA)'
  return [
    `Haz un radar de tendencias: qué temas están subiendo AHORA (últimos ${req.days} días) para este nicho, para decidir de qué hacer vídeos.`,
    `Nicho: ${niche}`,
    '',
    'Cómo buscar (datos reales, nada inventado):',
    `1. YouTube con yt-dlp (sin claves ni cuentas). Varias búsquedas con palabras distintas del nicho, recientes primero, por ejemplo: yt-dlp "ytsearchdate40:<palabras>" --flat-playlist --print "%(title)s\\t%(view_count)s\\t%(upload_date)s\\t%(channel)s\\t%(channel_follower_count)s\\t%(url)s" (si --flat-playlist no trae las vistas o la fecha, pide los 10–15 vídeos más prometedores uno a uno con --skip-download --print). Prueba también "ytsearch40:" (relevancia) para ver qué domina. Si yt-dlp no está, instálalo con «uv tool install yt-dlp» o «pipx install yt-dlp»; si no se puede, dilo.`,
    '2. Contrasta en la web lo que puedas (GitHub trending, Hacker News, Reddit, blogs y noticias del nicho): un tema que sale en varias fuentes independientes pesa más.',
    `3. Mira los radares anteriores de este proyecto${input.previous.length ? ` (${input.previous.join(', ')})` : ` (carpeta ${RADAR_DIR}/, si existe)`}: marca cada tema como «nuevo», «sigue subiendo» o «se enfría», y no repitas como nuevo lo que ya salió.`,
    '',
    'Cómo puntuar cada tema de 0 a 100 (agrupa los vídeos por TEMA, no por vídeo):',
    '- Impulso (hasta 50): vídeos recientes que rinden por encima de lo normal de su canal (vistas por día frente a sus suscriptores; un canal pequeño con muchas vistas es la mejor señal).',
    '- Amplitud (hasta 30): cuántos canales y fuentes distintas hablan de él a la vez.',
    '- Hueco (hasta 20): si aún hay pocos vídeos buenos en el idioma del usuario, o un ángulo que nadie ha tocado.',
    'No inventes cifras: copia las que te den las herramientas; si un dato falta, pon «sin dato».',
    '',
    `Escribe ${file} con:`,
    `- Arriba: fecha y hora, el nicho y las búsquedas que hiciste.`,
    `- El ranking de los ${req.count} mejores temas (de más a menos puntos). De cada uno: nombre corto del tema, puntuación, estado (nuevo / sigue subiendo / se enfría), la señal más fuerte (título del vídeo, canal, vistas, hace cuánto y enlace), una línea de por qué sube, 5 títulos para un vídeo propio (en el idioma del usuario, que enganchen sin mentir), 3 ángulos distintos (para quién y qué se lleva) y la orden lista para pegar, escrita entre comillas invertidas: \`/video <el mejor título> — <el ángulo elegido en una frase>\`.`,
    '- Al final, 3 temas que se enfrían o están saturados (para no perder el tiempo).',
    '',
    `Al terminar, contesta al usuario en ${input.lang}, corto: el top 5 en una línea cada uno (puntuación, tema y por qué sube) y, debajo de cada uno, su orden \`/video …\` entre comillas invertidas (en el chat se pulsa y queda lista para enviar). Después, dónde está la ficha completa (${file}) y una línea final: para que vigile solo, «/rutina cada 4 horas: /radar ${req.niche || '<nicho>'}».`,
    'Reglas: solo mirar, nada de subir, comentar, dar «me gusta» ni iniciar sesión en ningún sitio; no descargues vídeos enteros.'
  ].join('\n')
}
