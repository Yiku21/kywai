// El Instagram de kywai: publicar reels en SU PROPIA cuenta (una cuenta profesional, de empresa o de creador) con la
// API oficial de Instagram (Graph API). Nunca con la contraseña: con un token de acceso que el usuario saca de su app
// de Meta y pega en Ajustes. El token se guarda cifrado con el llavero del sistema (como las claves de los agentes).
// Con un token de Facebook (EAA…) el vídeo se sube desde el equipo con la subida reanudable de Meta
// (rupload.facebook.com). Con uno de Instagram (IG…) Meta no la admite: el vídeo se deja 1 hora en un alojamiento
// temporal (Litterbox, o tmpfiles.org si falla) y se le da ese enlace a Instagram.
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const GRAPH_VERSION = 'v21.0'
/** Lo más largo que admite Instagram en el texto de una publicación. */
export const CAPTION_MAX = 2200
/** Hashtags como mucho (Instagram no publica con más de 30). */
export const HASHTAGS_MAX = 30

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array | FormData; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>
let fetchImpl: Fetch | null = null
let sleepImpl: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))

export function __setInstagramFetchForTests(f: Fetch | null, sleep?: (ms: number) => Promise<void>): void {
  fetchImpl = f
  if (sleep) sleepImpl = sleep
}

const doFetch: Fetch = (url, init) => (fetchImpl ?? (globalThis.fetch as unknown as Fetch))(url, init)

/** Lo que se espera una respuesta normal de la Graph API antes de dar el paso por perdido. */
export const REQUEST_TIMEOUT_MS = 60_000

/** La señal del usuario (cancelar) junto con un tope de tiempo: así una petición que no contesta nunca no se queda colgada. */
function timed(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, t]) : t
}

/** Si la petición se cortó por el tope de tiempo (y no porque el usuario cancelase), un error que lo dice. */
function timeoutError(e: unknown, signal: AbortSignal | undefined, ms: number, step?: string): unknown {
  if (signal?.aborted) return e
  const name = (e as { name?: unknown } | null)?.name
  if (name === 'TimeoutError' || name === 'AbortError') return new Error(`Instagram no contestó en ${Math.round(ms / 1000)} s${step ? ` al ${step}` : ''}; prueba otra vez en un rato`)
  return e
}

/** Token de «Instagram con inicio de sesión de Instagram» (empieza por IG…) o de Facebook (EAA…, con una página). */
export function graphHost(token: string): string {
  return /^IG/.test(token.trim()) ? 'https://graph.instagram.com' : 'https://graph.facebook.com'
}

export interface InstagramAccount {
  userId: string
  username: string
}

/** El error de la Graph API (o de la subida a rupload) en una frase, con el paso en el que falló. Nunca lleva el token. */
export function graphError(status: number, body: string, step?: string): Error {
  const where = step ? ` al ${step}` : ''
  try {
    const j = JSON.parse(body) as {
      error?: { message?: string; code?: number; error_subcode?: number; error_user_title?: string; error_user_msg?: string; fbtrace_id?: string }
      debug_info?: { type?: string; message?: string; retriable?: boolean }
    }
    const e = j.error
    if (e) {
      const msg = [e.error_user_title, e.error_user_msg || e.message].filter(Boolean).join(': ')
      if (e.code === 190) return new Error(`Instagram no acepta el token (caducado o sin permiso)${where}: ${msg}`)
      const code = e.code ? ` [${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''}]` : ''
      const trace = e.fbtrace_id ? ` (fbtrace_id ${e.fbtrace_id})` : ''
      return new Error(`Instagram respondió con un error ${status}${where}: ${msg || 'sin detalles'}${code}${trace}`)
    }
    // La subida del vídeo (rupload.facebook.com) responde con «debug_info» en vez de «error».
    if (j.debug_info) {
      const d = j.debug_info
      return new Error(`Instagram respondió con un error ${status}${where}: ${d.message || 'sin detalles'}${d.type ? ` [${d.type}]` : ''}`)
    }
  } catch {
    /* no es JSON */
  }
  const snippet = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
  return new Error(`Instagram respondió con un error ${status}${where}${snippet ? `: ${snippet}` : ''}`)
}

async function graph<T>(token: string, method: 'GET' | 'POST', path: string, params: Record<string, string> = {}, signal?: AbortSignal, step?: string): Promise<T> {
  const url = new URL(`${graphHost(token)}/${GRAPH_VERSION}/${path}`)
  const headers: Record<string, string> = { Authorization: `Bearer ${token.trim()}` }
  let body: string | undefined
  if (method === 'GET') for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  else {
    body = new URLSearchParams(params).toString()
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }
  let res: Awaited<ReturnType<Fetch>>
  let text: string
  try {
    res = await doFetch(url.toString(), { method, headers, body, signal: timed(signal, REQUEST_TIMEOUT_MS) })
    text = await res.text()
  } catch (e) {
    throw timeoutError(e, signal, REQUEST_TIMEOUT_MS, step)
  }
  if (!res.ok) throw graphError(res.status, text, step)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Instagram respondió algo que no se entiende')
  }
}

/** Una lectura de la Graph API (perfil, publicaciones, comentarios, estadísticas). */
export function graphGet<T>(token: string, path: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  return graph<T>(token, 'GET', path, params, signal)
}

/** Un comentario de una publicación de la cuenta que aún no tiene respuesta de la cuenta. */
export interface IgComment {
  id: string
  text: string
  username: string
  timestamp?: string
  mediaId: string
  permalink?: string
  /** Principio del texto de la publicación, para saber de qué habla. */
  post: string
}

/**
 * Los comentarios sin responder de las últimas `posts` publicaciones (como mucho `max`): ni los de la propia cuenta ni
 * los que ya tienen una respuesta suya. Del más nuevo al más antiguo.
 */
export async function unansweredComments(token: string, userId: string, username: string, opts: { posts?: number; max?: number; signal?: AbortSignal } = {}): Promise<IgComment[]> {
  const own = username.toLowerCase()
  const media = await graphGet<{ data?: { id: string; caption?: string; permalink?: string; comments_count?: number }[] }>(
    token,
    `${userId}/media`,
    { fields: 'id,caption,permalink,comments_count', limit: String(opts.posts ?? 10) },
    opts.signal
  )
  const out: IgComment[] = []
  for (const m of media.data ?? []) {
    if (!m.comments_count) continue
    const c = await graphGet<{ data?: { id: string; text?: string; username?: string; timestamp?: string; replies?: { data?: { username?: string }[] } }[] }>(
      token,
      `${m.id}/comments`,
      { fields: 'id,text,username,timestamp,replies{username}', limit: '50' },
      opts.signal
    )
    for (const x of c.data ?? []) {
      const who = (x.username ?? '').toLowerCase()
      if (!x.text?.trim() || (own && who === own)) continue
      if (own && (x.replies?.data ?? []).some((r) => (r.username ?? '').toLowerCase() === own)) continue
      out.push({ id: x.id, text: x.text.trim().slice(0, 1000), username: x.username ?? '', ...(x.timestamp ? { timestamp: x.timestamp } : {}), mediaId: m.id, ...(m.permalink ? { permalink: m.permalink } : {}), post: (m.caption ?? '').replace(/\s+/g, ' ').slice(0, 140) })
    }
  }
  out.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
  return out.slice(0, opts.max ?? 40)
}

/** Responde a un comentario desde la cuenta. Devuelve el id de la respuesta. */
export async function replyToComment(token: string, commentId: string, message: string, signal?: AbortSignal): Promise<string> {
  const text = message.trim().slice(0, 2200)
  if (!text) throw new Error('La respuesta está vacía')
  const r = await graph<{ id?: string }>(token, 'POST', `${commentId}/replies`, { message: text }, signal)
  if (!r.id) throw new Error('Instagram no confirmó la respuesta')
  return r.id
}

/** Comprueba el token y dice de qué cuenta es. Con un token de Facebook, la cuenta de Instagram de su página. */
export async function instagramAccount(token: string, userId?: string, signal?: AbortSignal): Promise<InstagramAccount> {
  if (graphHost(token).includes('instagram')) {
    const me = await graph<{ user_id?: string | number; id?: string; username?: string }>(token, 'GET', 'me', { fields: 'user_id,username' }, signal)
    const id = String(userId || me.user_id || me.id || '')
    if (!id) throw new Error('Instagram no dijo de qué cuenta es el token')
    return { userId: id, username: me.username ?? '' }
  }
  if (userId) {
    const u = await graph<{ id?: string; username?: string }>(token, 'GET', userId, { fields: 'id,username' }, signal)
    return { userId: String(u.id ?? userId), username: u.username ?? '' }
  }
  const pages = await graph<{ data?: Array<{ instagram_business_account?: { id?: string; username?: string } }> }>(token, 'GET', 'me/accounts', { fields: 'instagram_business_account{id,username}' }, signal)
  const ig = (pages.data ?? []).map((p) => p.instagram_business_account).find((a) => a?.id)
  if (!ig?.id) throw new Error('Ese token no tiene ninguna cuenta de Instagram profesional unida a una página de Facebook')
  return { userId: ig.id, username: ig.username ?? '' }
}

export interface PublishInput {
  token: string
  userId: string
  file: string
  caption: string
  signal?: AbortSignal
  onStep?: (text: string) => void
  /** Cuánto esperar a que Instagram procese el vídeo (por defecto 10 minutos). */
  timeoutMs?: number
  /**
   * Reel de prueba: Instagram lo enseña primero solo a quien no sigue la cuenta y, si funciona bien, lo pasa solo a
   * los seguidores (graduation_strategy SS_PERFORMANCE).
   */
  trial?: boolean
}

/** Tope de una subida: 2 minutos más 1 por cada 5 MB (una conexión muy lenta sigue subiendo; una colgada, no). */
function uploadTimeout(size: number): number {
  return 120_000 + Math.ceil(size / (5 * 1024 * 1024)) * 60_000
}

/** Subida reanudable de Meta (solo con tokens de Facebook Login): el MP4 va directo desde el equipo. */
async function resumableUpload(uploadUrl: string, token: string, file: string, size: number, signal?: AbortSignal): Promise<void> {
  const bytes = new Uint8Array(readFileSync(file))
  const upMs = uploadTimeout(size)
  for (let attempt = 0; ; attempt++) {
    let up: Awaited<ReturnType<Fetch>>
    let upText: string
    try {
      up = await doFetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `OAuth ${token.trim()}`, offset: '0', file_size: String(size), 'Content-Type': 'application/octet-stream' },
        body: bytes,
        signal: timed(signal, upMs)
      })
      upText = await up.text()
    } catch (e) {
      throw timeoutError(e, signal, upMs, 'subir el vídeo')
    }
    if (up.ok) return
    // Un fallo pasajero de Meta (5xx) se reintenta un par de veces antes de rendirse.
    if (up.status >= 500 && attempt < 2 && !signal?.aborted) {
      await sleepImpl(3000 * (attempt + 1))
      continue
    }
    throw graphError(up.status, upText, 'subir el vídeo')
  }
}

/** Alojamientos temporales para darle a Instagram un enlace público al vídeo (en orden; si uno falla, el siguiente). */
const TEMP_HOSTS: Array<{ name: string; upload: (form: FormData) => FormData; url: string; parse: (text: string) => string | null }> = [
  {
    name: 'Litterbox',
    url: 'https://litterbox.catbox.moe/resources/internals/api.php',
    upload: (f) => (f.set('reqtype', 'fileupload'), f.set('time', '1h'), f),
    parse: (t) => (/^https:\/\/\S+\.mp4$/i.test(t.trim()) ? t.trim() : null)
  },
  {
    name: 'tmpfiles.org',
    url: 'https://tmpfiles.org/api/v1/upload',
    upload: (f) => f,
    parse: (t) => {
      try {
        const u = (JSON.parse(t) as { data?: { url?: string } }).data?.url
        // La dirección que devuelve es una página; la descarga directa lleva «/dl/».
        return u ? u.replace(/^https?:\/\/tmpfiles\.org\//, 'https://tmpfiles.org/dl/') : null
      } catch {
        return null
      }
    }
  }
]

/** Sube el vídeo a un alojamiento temporal (caduca solo) y devuelve su enlace público de descarga. */
export async function temporaryLink(file: string, size: number, signal?: AbortSignal): Promise<string> {
  const bytes = readFileSync(file)
  const name = `kywai-${Date.now().toString(36)}.mp4`
  const ms = uploadTimeout(size)
  const fails: string[] = []
  for (const host of TEMP_HOSTS) {
    if (signal?.aborted) throw new Error('Cancelado')
    const form = new FormData()
    host.upload(form)
    form.set(host.name === 'Litterbox' ? 'fileToUpload' : 'file', new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }), name)
    try {
      const res = await doFetch(host.url, { method: 'POST', body: form, signal: timed(signal, ms) })
      const text = await res.text()
      const url = res.ok ? host.parse(text) : null
      if (url) return url
      fails.push(`${host.name}: error ${res.status}`)
    } catch (e) {
      if (signal?.aborted) throw e
      fails.push(`${host.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  throw new Error(`No se pudo dejar el vídeo en un enlace temporal para Instagram (${fails.join('; ')})`)
}

/**
 * Publica un reel: crea el contenedor y le da el vídeo (con un token de Facebook, subida reanudable desde el equipo; con
 * uno de Instagram, un enlace temporal), espera a que Instagram lo procese y lo publica. Devuelve el id y el enlace de la publicación.
 */
export async function publishReel(input: PublishInput): Promise<{ id: string; permalink?: string }> {
  const { token, userId, file, signal } = input
  if (!existsSync(file)) throw new Error('No encuentro el vídeo para publicarlo')
  const size = statSync(file).size
  if (!size) throw new Error('El vídeo está vacío')
  const caption = cleanCaption(input.caption)
  const extra: Record<string, string> = input.trial ? { trial_params: JSON.stringify({ graduation_strategy: 'SS_PERFORMANCE' }) } : {}
  let box: { id?: string; uri?: string }
  if (graphHost(token).includes('instagram')) {
    // Con un token de «Instagram Login» Meta no admite la subida directa (rupload responde ProcessingFailedError):
    // solo acepta un enlace público al vídeo, que descarga él. kywai lo deja en un alojamiento temporal (1 hora).
    input.onStep?.('Subiendo el vídeo a un enlace temporal')
    const videoUrl = await temporaryLink(file, size, signal)
    input.onStep?.('Preparando la publicación en Instagram')
    box = await graph<{ id?: string }>(token, 'POST', `${userId}/media`, { media_type: 'REELS', video_url: videoUrl, caption, ...extra }, signal, 'preparar la publicación')
    if (!box.id) throw new Error('Instagram no creó la publicación')
  } else {
    input.onStep?.('Preparando la publicación en Instagram')
    box = await graph<{ id?: string; uri?: string }>(token, 'POST', `${userId}/media`, { media_type: 'REELS', upload_type: 'resumable', caption, ...extra }, signal, 'preparar la publicación')
    if (!box.id) throw new Error('Instagram no creó la publicación')
    input.onStep?.('Subiendo el vídeo a Instagram')
    await resumableUpload(box.uri || `https://rupload.facebook.com/ig-api-upload/${GRAPH_VERSION}/${box.id}`, token, file, size, signal)
  }
  const boxId = box.id
  input.onStep?.('Instagram está procesando el vídeo')
  const deadline = Date.now() + (input.timeoutMs ?? 10 * 60_000)
  for (;;) {
    if (signal?.aborted) throw new Error('Cancelado')
    const st = await graph<{ status_code?: string; status?: string }>(token, 'GET', boxId, { fields: 'status_code,status' }, signal, 'comprobar el vídeo')
    if (st.status_code === 'FINISHED') break
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error(`Instagram no pudo procesar el vídeo: ${st.status || st.status_code}`)
    if (Date.now() > deadline) throw new Error('Instagram tarda demasiado en procesar el vídeo; prueba otra vez más tarde')
    await sleepImpl(5000)
  }
  input.onStep?.('Publicando en Instagram')
  const pub = await graph<{ id?: string }>(token, 'POST', `${userId}/media_publish`, { creation_id: boxId }, signal, 'publicar el reel')
  if (!pub.id) throw new Error('Instagram no confirmó la publicación')
  let permalink: string | undefined
  try {
    permalink = (await graph<{ permalink?: string }>(token, 'GET', pub.id, { fields: 'permalink' }, signal)).permalink
  } catch {
    /* publicado igual: el enlace es opcional */
  }
  return { id: pub.id, ...(permalink ? { permalink } : {}) }
}

/** El texto tal y como lo admite Instagram: sin pasar de 2.200 caracteres ni de 30 hashtags. */
export function cleanCaption(text: string): string {
  let seen = 0
  const out = text
    .replace(/\r\n?/g, '\n')
    .replace(/#[\p{L}\p{N}_]+/gu, (tag) => (++seen > HASHTAGS_MAX ? '' : tag))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return out.length > CAPTION_MAX ? out.slice(0, CAPTION_MAX).trim() : out
}

/**
 * El texto que escribió el agente: sin comillas ni encabezados («Texto:», «Caption:») ni bloques de código. Si empieza
 * con «BLOQUEADA:», no hay texto.
 */
export function parseCaptionReply(text: string): string | null {
  let t = text.trim()
  if (/^BLOQUEADA\s*:/i.test(t)) return null
  const fence = /```(?:\w+)?\s*([\s\S]*?)```/.exec(t)
  if (fence) t = fence[1].trim()
  t = t.replace(/^(?:texto|caption|descripci[oó]n|pie)\s*:\s*/i, '').replace(/^[«"“]([\s\S]*)[»"”]$/, '$1').trim()
  return t ? cleanCaption(t) : null
}

/** Encargo para el agente que escribe el texto de la publicación. */
export function captionPrompt(input: { video: string; about: string; note?: string; username?: string; question?: string; lang: string; platform?: 'tiktok' }): string {
  const net = input.platform === 'tiktok' ? 'TikTok' : 'Instagram'
  return [
    `Escribe el texto (caption) para publicar este ${input.platform === 'tiktok' ? 'vídeo' : 'reel'} en la cuenta de ${net}${input.username ? ` ${input.platform === 'tiktok' ? '' : '@'}${input.username}` : ''}. Es la cuenta propia del proyecto: la publicación sale a su nombre.`,
    '',
    `El vídeo: ${input.video} (puedes mirarlo si te ayuda).`,
    `De qué va: ${input.about}`,
    ...(input.question ? [`Es un episodio de una serie y acaba con esta pregunta para votar en los comentarios: «${input.question}»`] : []),
    ...(input.note ? [`Lo que pide el usuario para este texto: ${input.note}`] : []),
    '',
    'Reglas:',
    `- En ${input.lang}. La primera línea es el gancho (lo que se ve antes de «más»): corta, concreta y que dé ganas de verlo; nada de «¡Hola!» ni de «En este vídeo…».`,
    '- Después, de 1 a 3 frases cortas con lo que aporta el vídeo, y una llamada a la acción sencilla (comentar, guardar o seguir la cuenta).',
    input.question ? '- Repite la pregunta de la serie para que voten en los comentarios (A o B).' : '',
    '- Al final, de 3 a 6 hashtags concretos del tema (nada de #fyp, #viral ni listas de 30).',
    '- Como mucho 1 o 2 emojis, solo si encajan. Nada inventado: ni cifras ni promesas que el vídeo no cumpla. Nada de nombres de terceros ni de menciones a otras cuentas.',
    '- No crees ni cambies archivos y no publiques nada: kywai lo publica después, con el visto bueno del usuario.',
    '- Responde SOLO con el texto, listo para pegar. Si el vídeo no se puede publicar tal cual (contenido de terceros, algo engañoso), responde «BLOQUEADA:» y el motivo.'
  ]
    .filter(Boolean)
    .join('\n')
}

// ---------- ajustes (cuenta conectada y «publicar sin preguntar») ----------

export interface InstagramSettings {
  userId?: string
  username?: string
  /** Publicar sin pedir el visto bueno (las publicaciones de «/instagram» y de las rutinas salen solas). */
  autoPublish?: boolean
}

export function readInstagramSettings(file: string): InstagramSettings {
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as InstagramSettings
    return s && typeof s === 'object' ? s : {}
  } catch {
    return {}
  }
}

export function writeInstagramSettings(file: string, s: InstagramSettings): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(s, null, 2), { encoding: 'utf8', mode: 0o600 })
}

/** «/instagram [lo que quieres en el texto]»: prepara el último vídeo del chat (o el adjunto) para publicarlo. */
/**
 * «/instagram [qué quieres en el texto]», «/instagram prueba [qué quieres]» (reel de prueba: Instagram lo enseña
 * primero solo a quien no te sigue) o «/instagram resultados» (los números de los últimos reels).
 */
export function parseInstagramRequest(text: string): { note: string; trial?: true; results?: true } | null {
  const m = /^\/(?:instagram|insta|ig)(?:\s+([\s\S]*))?$/i.exec(text.trim())
  if (!m) return null
  const rest = (m[1] ?? '').trim()
  if (/^(resultados|results|estad[ií]sticas|stats|n[uú]meros)$/i.test(rest)) return { note: '', results: true }
  const trial = /^(prueba|trial|de prueba)(?=\s|$)\s*/i.exec(rest)
  if (trial) return { note: rest.slice(trial[0].length).slice(0, 1000), trial: true }
  return { note: rest.slice(0, 1000) }
}
