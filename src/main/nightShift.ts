// «/turno-noche [nicho]»: la cadena entera del Instagram de kywai en una sola orden (o en una rutina de madrugada).
// Un agente busca los reels del nicho que han superado de largo lo normal de su cuenta, desmonta el mejor (gancho,
// estructura, planos), escribe un guion NUEVO para la cuenta de kywai con su método y termina con la orden «/video …».
// kywai hace el vídeo con esa orden y, al acabar, lo prepara como reel de prueba («/instagram prueba»), que se publica
// con tu visto bueno (o solo, si activaste «Publicar sin preguntar»). Se copia la forma, nunca el texto ni el vídeo.
import { join } from 'node:path'

export interface NightShiftRequest {
  /** Nicho, cuentas o enlaces que el usuario quiere que mire. */
  note: string
  /** «sin publicar»: se queda en el vídeo (no prepara el reel de prueba). */
  noPost: boolean
}

/** «/turno-noche …», «/turno …», «/noche …» o «/maquina …». null si no es esa orden. */
export function parseNightShiftRequest(text: string): NightShiftRequest | null {
  const m = /^\/(?:turno-noche|turno|noche|m[aá]quina)(?=\s|$)([\s\S]*)$/i.exec(text.trim())
  if (!m) return null
  let note = m[1].trim()
  const noPost = /(^|\s)sin\s+(?:publicar|instagram|reel de prueba)(?=\s|$|[.,;])/i.test(note)
  if (noPost) note = note.replace(/(^|\s)sin\s+(?:publicar|instagram|reel de prueba)(?=\s|$|[.,;])/i, ' ').replace(/\s{2,}/g, ' ').trim()
  return { note: note.slice(0, 4000), noPost }
}

/** Carpeta de una noche (relativa a la carpeta de trabajo) y el método viral de la cuenta (lo puedes editar tú). */
export function nightShiftPaths(workspaceRoot: string, date: string): { dir: string; method: string } {
  return { dir: join(workspaceRoot, 'instagram', 'turno-noche', date), method: join(workspaceRoot, 'instagram', 'metodo-viral.md') }
}

/** Estilos que mejor funcionan en un reel vertical (el agente elige uno o ninguno). */
export const NIGHT_SHIFT_STYLES = [
  'kywai-machine-room',
  'kywai-countdown-list',
  'kywai-voxel-bots',
  'kywai-checklist',
  'kywai-app-promo',
  'kywai-ink-doodle'
]

export interface NightShiftPromptInput {
  note: string
  /** Carpeta de esta noche (absoluta). */
  dir: string
  /** Paquete de habilidades de Instagram (igSkills.ts) y sus dos habilidades que se usan. */
  pack: string
  viralSkill: string
  reelSkill: string
  method: string
  hasMethod: boolean
  voiceFile: string
  hasVoice: boolean
  accountFile?: string
  accountError?: string
  /** instagram/resultados.md, si tiene reels suficientes para aprender de ellos. */
  resultsFile?: string
  /** El último «/radar» del proyecto (temas que suben ahora), si hay. */
  radarFile?: string
  styles: { slug: string; name: string; line: string }[]
  lang: string
}

/** El encargo del agente: buscar, desmontar, escribir y acabar con la orden del vídeo. */
export function nightShiftPrompt(i: NightShiftPromptInput): string {
  return [
    'Turno de noche del Instagram de kywai: deja listo el reel de mañana. Trabaja solo, sin preguntar (el usuario puede estar durmiendo), y guarda todo en ' + i.dir + '.',
    '',
    i.note ? `Nicho, cuentas o enlaces que pide el usuario: ${i.note}` : `El usuario no ha dicho el nicho: sácalo de la voz de la cuenta${i.accountFile ? ' y de sus publicaciones' : ''} (por defecto: agentes de IA, productividad y herramientas para crear con IA).`,
    '',
    '1. BUSCAR. Sigue la habilidad ig-viral (' + i.viralSkill + ') para encontrar los vídeos cortos del nicho que han superado de largo lo normal de su creador: compara las vistas de cada uno con la mediana de los últimos 10–20 de esa misma cuenta y quédate con los de 3× o más. Fuentes: YouTube Shorts y TikTok públicos (con «uvx yt-dlp --flat-playlist --dump-json <canal>» lees vistas y fechas sin bajar nada) y la web; de Instagram solo los enlaces que haya puesto el usuario. Nunca inicies sesión ni pidas contraseñas. Guarda la tabla en elegidos.md (creador, enlace, vistas, su normal, cuántas veces su normal, de qué va).',
    i.resultsFile
      ? `   Mira también lo tuyo: ${i.resultsFile} tiene los números reales de los reels de kywai. Si uno superó el doble de la mediana de la cuenta, el reel de esta noche va del MISMO tema con un gancho distinto (así se aprovecha lo que ya revienta) y dilo.`
      : '   (Aún no hay números de los reels de kywai: cuando los haya, «/instagram resultados» los guarda y el turno aprende de ellos.)',
    i.radarFile ? `   El último radar de temas del proyecto está en ${i.radarFile}: sus temas que suben son buenos candidatos; empieza buscando por ellos.` : '',
    '2. DESMONTAR. Del mejor (el que más supera su normal y encaje con la cuenta): bájalo a ' + join(i.dir, 'fuente') + ' con «uvx yt-dlp -o <archivo> -- <enlace>», transcríbelo con «uvx --from whisper-ctranslate2 whisper-ctranslate2 <archivo> --model small --output_format srt --compute_type int8 --device cpu --output_dir <carpeta>» y saca un fotograma cada 2 s con ffmpeg para ver los planos. Si no se deja bajar, trabaja con lo que se ve en su página y dilo. Escribe desmontaje.md: el gancho literal y su tipo, la estructura con sus tiempos (gancho, contexto, pasos, prueba, llamada a la acción), cada cuánto cambia el plano, qué texto sale en pantalla, cómo son los subtítulos y por qué crees que funcionó.',
    '3. ESCRIBIR. Un reel NUEVO para la cuenta de kywai sobre un tema suyo, con la ESTRUCTURA y la FÓRMULA del gancho del desmontado, nunca su texto, sus frases, su marca, sus imágenes ni su voz. Sigue la habilidad ig-reel (' + i.reelSkill + '): tres ganchos puntuados y el mejor, guion por tramos con el texto en pantalla, 25–45 s.',
    i.hasMethod
      ? `   El método viral de la cuenta está en ${i.method}: síguelo regla por regla (sobre todo las del gancho). Si esta noche aprendiste algo nuevo del desmontado, añádelo al final como regla con la fecha.`
      : `   Aún no hay método viral de la cuenta: crea ${i.method} con las reglas del gancho y de la estructura que salen de ig-reel y de este desmontado (cortas, numeradas, comprobables) y síguelo. Cada noche se le añaden las que se aprendan.`,
    i.hasVoice ? `   La voz de la cuenta (cómo habla, a quién, qué evita) está en ${i.voiceFile}: síguela.` : `   Si no existe ${i.voiceFile}, créalo con la plantilla ${join(i.pack, 'templates', 'voice.md')} (kywai es la app de agentes de IA que trabajan en equipo).`,
    '   Guarda el guion en guion.md.',
    i.accountFile ? `   Datos reales de la cuenta (perfil y últimas publicaciones con sus números): ${i.accountFile}.` : i.accountError ? `   No se pudieron leer los datos de la cuenta (${i.accountError}).` : '',
    '4. ORDEN DEL VÍDEO. kywai hace el vídeo con su voz (la clonada del usuario si la hay), subtítulos palabra a palabra, música y efectos. Elige el estilo que mejor cuente este guion, o ninguno (vídeo rápido con texto animado):',
    ...i.styles.map((s) => `   - estilo:${s.slug} — ${s.name}: ${s.line}`),
    '',
    'Reglas: no publiques, no comentes, no mandes mensajes ni sigas a nadie (kywai lo prepara luego como reel de prueba con el visto bueno del usuario). No copies texto ni imágenes de nadie. Si algo falla, sigue con lo que tengas y dilo.',
    '',
    `Responde en ${i.lang}, corto: de qué reel saliste (enlace, cuántas veces su normal y por qué funcionó, en dos líneas), el gancho elegido y su nota, y la ruta de guion.md. La ÚLTIMA línea, sola y exacta, es la orden para kywai:`,
    '/video vertical estilo:<uno de la lista, o quítalo> <el guion breve: gancho literal y luego cada tramo en una frase>'
  ]
    .filter((l) => l !== '')
    .join('\n')
}

/** La orden «/video …» de la respuesta (la última que haya), siempre en vertical. null si no puso ninguna. */
export function parseNightShiftOrder(text: string): string | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim().replace(/^[`>*\-\s]+|[`*]+$/g, '').trim())
    .filter((l) => /^\/v[ií]deo\s+\S/i.test(l))
  const order = lines.pop()
  if (!order) return null
  const body = order.replace(/^\/v[ií]deo\s+/i, '')
  if (body.replace(/(^|\s)(?:vertical|horizontal|estilo:[a-z0-9-]+)(?=\s|$)/gi, ' ').trim().length < 12) return null
  const vertical = /(^|\s)vertical(?=\s|$)/i.test(body) ? body : `vertical ${body.replace(/(^|\s)horizontal(?=\s|$)/i, ' ').trim()}`
  return `/video ${vertical}`.slice(0, 6000)
}

/** Lo que se enseña en el chat: la respuesta sin la orden (la orden la lanza kywai). */
export function nightShiftSummary(text: string): string {
  return text
    .split('\n')
    .filter((l) => !/^[`>*\-\s]*\/v[ií]deo\s+/i.test(l.trim()))
    .join('\n')
    .trim()
}
