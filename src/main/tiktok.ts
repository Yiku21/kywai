// El TikTok de kywai: subir vídeos a SU PROPIA cuenta de TikTok con la API oficial (Content Posting API). Nunca con la
// contraseña: el usuario crea una app en developers.tiktok.com (Login Kit + Content Posting), pega su clave y su
// secreto, y autoriza la cuenta una vez (inicio de sesión de TikTok con PKCE). Dos modos:
//  - Borrador (scope video.upload): el vídeo llega a la bandeja de TikTok de la cuenta y se publica desde la app del
//    móvil. Sirve desde el primer día.
//  - Directo (scope video.publish): kywai lo publica. Hasta que TikTok aprueba la app (su «audit»), solo puede salir
//    privado («solo yo»).
// El vídeo se sube desde el equipo por trozos (FILE_UPLOAD): no hace falta una URL pública.
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const TIKTOK_API = 'https://open.tiktokapis.com/v2'
export const TIKTOK_AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/'
/** La dirección de vuelta que hay que registrar en la app de TikTok (Login Kit → Desktop). */
export const TIKTOK_REDIRECT = 'http://localhost:3455/tiktok/callback'
export const TIKTOK_SCOPES = ['user.info.basic', 'video.upload', 'video.publish']
/** Lo más largo que admite TikTok en el texto de una publicación directa. */
export const TIKTOK_CAPTION_MAX = 2200
/** El aviso que TikTok pide enseñar junto al botón de publicar. */
export const MUSIC_USAGE_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en'

const MB = 1024 * 1024
/** Trozo de subida: TikTok pide trozos de 5 a 64 MB (el último puede llegar a 128 MB); menos de 64 MB va entero. */
const CHUNK = 10 * MB

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>
let fetchImpl: Fetch | null = null
let sleepImpl: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))

export function __setTikTokFetchForTests(f: Fetch | null, sleep?: (ms: number) => Promise<void>): void {
  fetchImpl = f
  if (sleep) sleepImpl = sleep
}
const doFetch: Fetch = (url, init) => (fetchImpl ?? (globalThis.fetch as unknown as Fetch))(url, init)

// ---------- inicio de sesión (OAuth con PKCE) ----------

/** El código de comprobación (PKCE): TikTok, en escritorio, pide el desafío en hexadecimal (SHA-256). */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 64)
  return { verifier, challenge: createHash('sha256').update(verifier).digest('hex') }
}

export function authorizeUrl(clientKey: string, state: string, challenge: string): string {
  const u = new URL(TIKTOK_AUTHORIZE)
  u.searchParams.set('client_key', clientKey)
  u.searchParams.set('scope', TIKTOK_SCOPES.join(','))
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('redirect_uri', TIKTOK_REDIRECT)
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', challenge)
  u.searchParams.set('code_challenge_method', 'S256')
  return u.toString()
}

/** El código de la dirección a la que volvió el navegador (o el código suelto). Comprueba el «state». */
export function codeFromRedirect(pasted: string, state: string): string {
  const t = pasted.trim()
  if (!/[?&](code|error)=/.test(t)) {
    if (/^[\w.*!~-]{8,}$/.test(t)) return t
    throw new Error('Pega la dirección completa a la que te llevó TikTok (empieza por http://localhost:3455/…)')
  }
  const u = new URL(t.includes('://') ? t : `http://x/?${t.replace(/^.*\?/, '')}`)
  const err = u.searchParams.get('error')
  if (err) throw new Error(`TikTok no dio permiso: ${u.searchParams.get('error_description') || err}`)
  if (state && u.searchParams.get('state') !== state) throw new Error('Esa dirección es de otro inicio de sesión: vuelve a pulsar «Iniciar sesión en TikTok»')
  const code = u.searchParams.get('code')
  if (!code) throw new Error('La dirección no trae el código de TikTok')
  return code
}

export interface TikTokTokens {
  accessToken: string
  refreshToken: string
  openId: string
  scopes: string[]
  /** Cuándo caduca cada uno (ms). */
  accessExpires: number
  refreshExpires: number
}

/** Los códigos de error de TikTok que tienen explicación clara, dicha en palabras de la persona. */
const KNOWN_ERRORS: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts:
    'mientras no apruebe la app, TikTok solo deja publicar directo si la cuenta de TikTok es privada (en la app: Ajustes y privacidad → Privacidad → Cuenta privada). Envíalo como borrador o pon la cuenta en privado mientras tanto',
  privacy_level_option_mismatch: 'esa opción de «Quién puede verlo» no está disponible para la cuenta ahora mismo',
  spam_risk_too_many_posts: 'la cuenta ya ha publicado mucho hoy y TikTok frena las publicaciones; prueba más tarde',
  spam_risk_too_many_pending_share: 'hay demasiados borradores esperando en la bandeja de TikTok; publica o borra alguno desde la app',
  spam_risk_user_banned_from_posting: 'TikTok no deja publicar a esta cuenta ahora mismo',
  access_token_invalid: 'el acceso a TikTok ya no vale; vuelve a iniciar sesión en Ajustes',
  scope_not_authorized: 'la cuenta no dio permiso para esto; vuelve a iniciar sesión en TikTok y acepta todos los permisos',
  rate_limit_exceeded: 'demasiadas peticiones seguidas; espera un minuto y reinténtalo'
}

/**
 * El error de TikTok en palabras: su mensaje si lo trae y, si no, el código HTTP, en qué paso fue (`step`) y el
 * principio de lo que contestó (con su log_id, que es lo que pide el soporte de TikTok).
 */
function apiError(body: string, status: number, step?: string): Error {
  const where = step ? ` al ${step}` : ''
  let logId = ''
  try {
    const o = JSON.parse(body) as { error?: { code?: string; message?: string; log_id?: string } | string; error_description?: string; message?: string }
    const e = typeof o.error === 'object' ? o.error : undefined
    logId = e?.log_id ? ` (log_id ${e.log_id})` : ''
    if (e && e.code && KNOWN_ERRORS[e.code]) return new Error(`TikTok no lo aceptó${where}: ${KNOWN_ERRORS[e.code]}`)
    if (e && e.code && e.code !== 'ok') return new Error(`TikTok respondió${where}: ${e.message || e.code} [${e.code}]${logId}`)
    if (typeof o.error === 'string') return new Error(`TikTok respondió${where}: ${o.error_description || o.error}`)
  } catch {
    /* no es JSON */
  }
  const said = logId ? '' : body.replace(/\s+/g, ' ').trim().slice(0, 160)
  return new Error(`TikTok respondió con un error ${status}${where}${logId}${said ? `: ${said}` : ''}`)
}

/** Los fallos 5xx de TikTok suelen ser pasajeros: se reintenta un par de veces antes de rendirse. */
const RETRIES = 2
const isTransient = (status: number): boolean => status >= 500 && status < 600

async function tokenCall(params: Record<string, string>, now: number): Promise<TikTokTokens> {
  const res = await doFetch(`${TIKTOK_API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  })
  const text = await res.text()
  let o: Record<string, unknown> = {}
  try {
    o = JSON.parse(text) as Record<string, unknown>
  } catch {
    /* abajo */
  }
  if (!res.ok || typeof o.access_token !== 'string') throw apiError(text, res.status)
  return {
    accessToken: o.access_token,
    refreshToken: String(o.refresh_token ?? ''),
    openId: String(o.open_id ?? ''),
    scopes: String(o.scope ?? '').split(/[,\s]+/).filter(Boolean),
    accessExpires: now + (Number(o.expires_in) || 86_400) * 1000,
    refreshExpires: now + (Number(o.refresh_expires_in) || 31_536_000) * 1000
  }
}

export function exchangeCode(clientKey: string, clientSecret: string, code: string, verifier: string, now = Date.now()): Promise<TikTokTokens> {
  return tokenCall({ client_key: clientKey, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: TIKTOK_REDIRECT, code_verifier: verifier }, now)
}

export function refreshTokens(clientKey: string, clientSecret: string, refreshToken: string, now = Date.now()): Promise<TikTokTokens> {
  return tokenCall({ client_key: clientKey, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }, now)
}

// ---------- API de publicación ----------

async function api<T>(token: string, path: string, body?: unknown, method: 'GET' | 'POST' = 'POST', signal?: AbortSignal, step?: string, retries = 0): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await doFetch(`${TIKTOK_API}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal
    })
    const text = await res.text()
    if (isTransient(res.status) && attempt < retries && !signal?.aborted) {
      await sleepImpl(2000 * (attempt + 1))
      continue
    }
    let o: { data?: T; error?: { code?: string } } = {}
    try {
      o = JSON.parse(text) as typeof o
    } catch {
      if (!res.ok) throw apiError(text, res.status, step)
      throw new Error(`TikTok respondió algo que no se entiende${step ? ` al ${step}` : ''}`)
    }
    if (!res.ok || (o.error?.code && o.error.code !== 'ok')) throw apiError(text, res.status, step)
    return (o.data ?? {}) as T
  }
}

/** Nombre que enseña la cuenta (lo pide TikTok en la pantalla de publicar). */
export async function tiktokUser(token: string): Promise<{ openId: string; name: string }> {
  const d = await api<{ user?: { open_id?: string; display_name?: string } }>(token, 'user/info/?fields=open_id,display_name', undefined, 'GET')
  return { openId: d.user?.open_id ?? '', name: d.user?.display_name ?? '' }
}

export interface CreatorInfo {
  nickname: string
  privacyOptions: string[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxSeconds: number
}

/** Lo que permite la cuenta ahora (TikTok pide consultarlo antes de cada publicación directa). */
export async function creatorInfo(token: string, signal?: AbortSignal): Promise<CreatorInfo> {
  const d = await api<{ creator_nickname?: string; privacy_level_options?: string[]; comment_disabled?: boolean; duet_disabled?: boolean; stitch_disabled?: boolean; max_video_post_duration_sec?: number }>(
    token,
    'post/publish/creator_info/query/',
    {},
    'POST',
    signal,
    'consultar la cuenta',
    RETRIES
  )
  return {
    nickname: d.creator_nickname ?? '',
    privacyOptions: d.privacy_level_options ?? ['SELF_ONLY'],
    commentDisabled: !!d.comment_disabled,
    duetDisabled: !!d.duet_disabled,
    stitchDisabled: !!d.stitch_disabled,
    maxSeconds: d.max_video_post_duration_sec ?? 600
  }
}

/** Cómo se trocea un vídeo para subirlo (las reglas de TikTok). */
export function chunkPlan(size: number): { chunkSize: number; count: number } {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 }
  return { chunkSize: CHUNK, count: Math.floor(size / CHUNK) }
}

export interface DirectOptions {
  caption: string
  privacy: string
  allowComments: boolean
  allowDuet: boolean
  allowStitch: boolean
  /** «Contenido promocional» de la propia marca (brand_organic_toggle). */
  promotional?: boolean
}

export interface TikTokUploadInput {
  token: string
  file: string
  /** Sin esto, va como borrador a la bandeja de la cuenta. */
  direct?: DirectOptions
  signal?: AbortSignal
  onStep?: (text: string) => void
  timeoutMs?: number
}

/**
 * Sube el vídeo: como borrador (llega a la bandeja de TikTok) o publicado directo. Espera a que TikTok lo procese y
 * devuelve el id de la publicación y en qué quedó.
 */
export async function uploadTikTok(input: TikTokUploadInput): Promise<{ publishId: string; status: 'drafted' | 'published'; postId?: string }> {
  const { token, file, direct, signal } = input
  if (!existsSync(file)) throw new Error('No encuentro el vídeo para subirlo')
  const size = statSync(file).size
  if (!size) throw new Error('El vídeo está vacío')
  const { chunkSize, count } = chunkPlan(size)
  input.onStep?.(direct ? 'Preparando la publicación en TikTok' : 'Preparando el borrador en TikTok')
  const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: count }
  const init = direct
    ? await api<{ publish_id?: string; upload_url?: string }>(
        token,
        'post/publish/video/init/',
        {
          post_info: {
            title: cleanTikTokCaption(direct.caption),
            privacy_level: direct.privacy,
            disable_comment: !direct.allowComments,
            disable_duet: !direct.allowDuet,
            disable_stitch: !direct.allowStitch,
            brand_content_toggle: false,
            brand_organic_toggle: !!direct.promotional,
            // Los vídeos de kywai están hechos con IA: se marcan así, como piden las normas de TikTok.
            is_aigc: true
          },
          source_info
        },
        'POST',
        signal,
        'preparar la publicación',
        RETRIES
      )
    : await api<{ publish_id?: string; upload_url?: string }>(token, 'post/publish/inbox/video/init/', { source_info }, 'POST', signal, 'preparar el borrador', RETRIES)
  if (!init.publish_id || !init.upload_url) throw new Error('TikTok no preparó la subida')
  input.onStep?.('Subiendo el vídeo a TikTok')
  const fd = openSync(file, 'r')
  try {
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) throw new Error('Cancelado')
      const start = i * chunkSize
      const end = i === count - 1 ? size : start + chunkSize
      const buf = Buffer.alloc(end - start)
      readSync(fd, buf, 0, buf.length, start)
      const step = count > 1 ? `enviar el vídeo (trozo ${i + 1} de ${count})` : 'enviar el vídeo'
      // La longitud la pone fetch con el cuerpo; ponerla a mano puede duplicar la cabecera.
      for (let attempt = 0; ; attempt++) {
        const res = await doFetch(init.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${end - 1}/${size}` },
          body: new Uint8Array(buf),
          signal
        })
        if (res.ok) break
        const text = await res.text()
        if (isTransient(res.status) && attempt < RETRIES && !signal?.aborted) {
          await sleepImpl(2000 * (attempt + 1))
          continue
        }
        throw apiError(text, res.status, step)
      }
    }
  } finally {
    closeSync(fd)
  }
  input.onStep?.('TikTok está procesando el vídeo')
  const deadline = Date.now() + (input.timeoutMs ?? 10 * 60_000)
  for (;;) {
    const st = await api<{ status?: string; fail_reason?: string; publicaly_available_post_id?: Array<string | number> }>(token, 'post/publish/status/fetch/', { publish_id: init.publish_id }, 'POST', signal, 'comprobar el vídeo', RETRIES)
    if (st.status === 'SEND_TO_USER_INBOX') return { publishId: init.publish_id, status: 'drafted' }
    if (st.status === 'PUBLISH_COMPLETE') {
      const id = st.publicaly_available_post_id?.[0]
      return { publishId: init.publish_id, status: direct ? 'published' : 'drafted', ...(id ? { postId: String(id) } : {}) }
    }
    if (st.status === 'FAILED') throw new Error(`TikTok no pudo procesar el vídeo: ${st.fail_reason || 'sin motivo'}`)
    if (Date.now() > deadline) throw new Error('TikTok tarda demasiado en procesar el vídeo; mira la bandeja de la app más tarde')
    await sleepImpl(5000)
  }
}

export function cleanTikTokCaption(text: string): string {
  const t = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return t.length > TIKTOK_CAPTION_MAX ? t.slice(0, TIKTOK_CAPTION_MAX).trim() : t
}

/** «/tiktok [lo que quieres en el texto]». */
export function parseTikTokRequest(text: string): { note: string } | null {
  const m = /^\/(?:tiktok|tt)(?:\s+([\s\S]*))?$/i.exec(text.trim())
  return m ? { note: (m[1] ?? '').trim().slice(0, 1000) } : null
}

// ---------- ajustes ----------

export interface TikTokSettings {
  clientKey?: string
  openId?: string
  name?: string
  scopes?: string[]
  accessExpires?: number
  refreshExpires?: number
  /** La app ya pasó la revisión de TikTok: se puede publicar directo (público). */
  approved?: boolean
  /** Lo que prepara «/tiktok» (también desde una rutina) va solo a la bandeja como borrador. */
  autoDraft?: boolean
  /** El inicio de sesión a medias (PKCE): se borra al terminarlo. */
  pending?: { state: string; verifier: string; at: number }
}

export function readTikTokSettings(file: string): TikTokSettings {
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as TikTokSettings
    return s && typeof s === 'object' ? s : {}
  } catch {
    return {}
  }
}

export function writeTikTokSettings(file: string, s: TikTokSettings): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(s, null, 2), { encoding: 'utf8', mode: 0o600 })
}
