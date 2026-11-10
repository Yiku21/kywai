import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  __setTikTokFetchForTests,
  authorizeUrl,
  chunkPlan,
  cleanTikTokCaption,
  codeFromRedirect,
  creatorInfo,
  exchangeCode,
  parseTikTokRequest,
  pkcePair,
  readTikTokSettings,
  refreshTokens,
  TIKTOK_CAPTION_MAX,
  TIKTOK_REDIRECT,
  uploadTikTok,
  writeTikTokSettings
} from './tiktok'

const MB = 1024 * 1024

interface Call {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string | Uint8Array
}

function fake(responder: (c: Call) => unknown): Call[] {
  const calls: Call[] = []
  __setTikTokFetchForTests(
    async (url, init) => {
      const c = { url, method: init?.method, headers: init?.headers, body: init?.body }
      calls.push(c)
      const r = responder(c) as { status?: number; json?: unknown } | undefined
      const status = r?.status ?? 200
      return { ok: status < 400, status, text: async () => JSON.stringify(r?.json ?? {}) }
    },
    async () => {}
  )
  return calls
}

afterEach(() => __setTikTokFetchForTests(null))

function video(bytes: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'tt-'))
  const f = join(dir, 'v.mp4')
  writeFileSync(f, Buffer.alloc(bytes, 7))
  return f
}

describe('inicio de sesión', () => {
  it('el desafío PKCE es el SHA-256 en hexadecimal del verificador', () => {
    const { verifier, challenge } = pkcePair()
    expect(verifier).toMatch(/^[A-Za-z0-9]{43,64}$/)
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('hex'))
  })

  it('la dirección de autorización lleva clave, permisos, vuelta y desafío', () => {
    const u = new URL(authorizeUrl('abc123', 'st4te', 'ch'))
    expect(u.searchParams.get('client_key')).toBe('abc123')
    expect(u.searchParams.get('scope')).toBe('user.info.basic,video.upload,video.publish')
    expect(u.searchParams.get('redirect_uri')).toBe(TIKTOK_REDIRECT)
    expect(u.searchParams.get('state')).toBe('st4te')
    expect(u.searchParams.get('code_challenge')).toBe('ch')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('saca el código de la dirección pegada y comprueba el state', () => {
    expect(codeFromRedirect(`${TIKTOK_REDIRECT}?code=XyZ*1!2&scopes=a&state=s1`, 's1')).toBe('XyZ*1!2')
    expect(() => codeFromRedirect(`${TIKTOK_REDIRECT}?code=a&state=otro`, 's1')).toThrow(/otro inicio/)
    expect(() => codeFromRedirect(`${TIKTOK_REDIRECT}?error=access_denied&error_description=no`, 's1')).toThrow(/no dio permiso/)
    expect(() => codeFromRedirect('hola', 's1')).toThrow(/dirección completa/)
  })

  it('cambia el código por tokens y los renueva', async () => {
    const calls = fake(() => ({ json: { access_token: 'act.1', refresh_token: 'rft.1', open_id: 'o1', scope: 'user.info.basic,video.upload', expires_in: 86400, refresh_expires_in: 100 } }))
    const t = await exchangeCode('ck', 'sec', 'code1', 'ver1', 1000)
    expect(t).toMatchObject({ accessToken: 'act.1', refreshToken: 'rft.1', openId: 'o1', scopes: ['user.info.basic', 'video.upload'], accessExpires: 1000 + 86_400_000, refreshExpires: 1000 + 100_000 })
    const body = new URLSearchParams(String(calls[0].body))
    expect(calls[0].url).toBe('https://open.tiktokapis.com/v2/oauth/token/')
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code_verifier')).toBe('ver1')
    expect(body.get('redirect_uri')).toBe(TIKTOK_REDIRECT)
    await refreshTokens('ck', 'sec', 'rft.1')
    const b2 = new URLSearchParams(String(calls[1].body))
    expect(b2.get('grant_type')).toBe('refresh_token')
    expect(b2.get('refresh_token')).toBe('rft.1')
    // Los secretos nunca van en la dirección.
    expect(calls.every((c) => !c.url.includes('sec') && !c.url.includes('rft'))).toBe(true)
  })

  it('explica el error de TikTok', async () => {
    fake(() => ({ status: 400, json: { error: 'invalid_grant', error_description: 'Authorization code is expired.' } }))
    await expect(exchangeCode('ck', 'sec', 'c', 'v')).rejects.toThrow(/Authorization code is expired/)
  })
})

describe('subida', () => {
  it('trocea según las reglas de TikTok', () => {
    expect(chunkPlan(5 * MB)).toEqual({ chunkSize: 5 * MB, count: 1 })
    expect(chunkPlan(64 * MB)).toEqual({ chunkSize: 64 * MB, count: 1 })
    expect(chunkPlan(105 * MB)).toEqual({ chunkSize: 10 * MB, count: 10 })
  })

  it('borrador: init de la bandeja, PUT y espera a SEND_TO_USER_INBOX', async () => {
    let polls = 0
    const calls = fake((c) => {
      if (c.url.endsWith('inbox/video/init/')) return { json: { data: { publish_id: 'p1', upload_url: 'https://up.tiktok/x' }, error: { code: 'ok' } } }
      if (c.url === 'https://up.tiktok/x') return { status: 201 }
      if (c.url.endsWith('status/fetch/')) return { json: { data: { status: ++polls < 2 ? 'PROCESSING_UPLOAD' : 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } } }
      return { status: 404 }
    })
    const steps: string[] = []
    const r = await uploadTikTok({ token: 'act.T', file: video(1000), onStep: (s) => steps.push(s) })
    expect(r).toEqual({ publishId: 'p1', status: 'drafted' })
    const init = JSON.parse(String(calls[0].body))
    expect(init).toEqual({ source_info: { source: 'FILE_UPLOAD', video_size: 1000, chunk_size: 1000, total_chunk_count: 1 } })
    expect(calls[0].headers?.Authorization).toBe('Bearer act.T')
    const put = calls[1]
    expect(put.method).toBe('PUT')
    expect(put.headers?.['Content-Range']).toBe('bytes 0-999/1000')
    expect(steps).toEqual(['Preparando el borrador en TikTok', 'Subiendo el vídeo a TikTok', 'TikTok está procesando el vídeo'])
    expect(calls.every((c) => !c.url.includes('act.T'))).toBe(true)
  })

  it('directo: post_info con privacidad, interruptores y marca de IA', async () => {
    const calls = fake((c) => {
      if (c.url.endsWith('publish/video/init/')) return { json: { data: { publish_id: 'p2', upload_url: 'https://up.tiktok/y' }, error: { code: 'ok' } } }
      if (c.url.startsWith('https://up.tiktok/')) return { status: 201 }
      if (c.url.endsWith('status/fetch/')) return { json: { data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7123] }, error: { code: 'ok' } } }
      return { status: 404 }
    })
    const r = await uploadTikTok({ token: 't', file: video(10), direct: { caption: '  Hola #ia  ', privacy: 'SELF_ONLY', allowComments: true, allowDuet: false, allowStitch: false } })
    expect(r).toEqual({ publishId: 'p2', status: 'published', postId: '7123' })
    const init = JSON.parse(String(calls[0].body))
    expect(init.post_info).toEqual({ title: 'Hola #ia', privacy_level: 'SELF_ONLY', disable_comment: false, disable_duet: true, disable_stitch: true, brand_content_toggle: false, brand_organic_toggle: false, is_aigc: true })
  })

  it('si TikTok falla al procesar, dice por qué', async () => {
    fake((c) => {
      if (c.url.endsWith('init/')) return { json: { data: { publish_id: 'p3', upload_url: 'https://up.tiktok/z' }, error: { code: 'ok' } } }
      if (c.url.startsWith('https://up.tiktok/')) return { status: 201 }
      return { json: { data: { status: 'FAILED', fail_reason: 'duration_check' }, error: { code: 'ok' } } }
    })
    await expect(uploadTikTok({ token: 't', file: video(10) })).rejects.toThrow(/duration_check/)
  })

  it('explica en palabras el error de app sin aprobar y dice en qué paso fue', async () => {
    fake(() => ({ status: 403, json: { error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'Please review our integration guidelines', log_id: 'L1' } } }))
    await expect(uploadTikTok({ token: 't', file: video(10), direct: { caption: 'x', privacy: 'SELF_ONLY', allowComments: true, allowDuet: false, allowStitch: false } })).rejects.toThrow(
      /al preparar la publicación: .*cuenta de TikTok es privada/
    )
  })

  it('un error desconocido lleva su código y su log_id', async () => {
    fake(() => ({ status: 400, json: { error: { code: 'invalid_params', message: 'Bad title', log_id: 'L2' } } }))
    await expect(uploadTikTok({ token: 't', file: video(10) })).rejects.toThrow('TikTok respondió al preparar el borrador: Bad title [invalid_params] (log_id L2)')
  })

  it('reintenta los 500 pasajeros y dice en qué paso falló si siguen', async () => {
    let puts = 0
    const calls = fake((c) => {
      if (c.url.endsWith('init/')) return { json: { data: { publish_id: 'p4', upload_url: 'https://up.tiktok/w' }, error: { code: 'ok' } } }
      if (c.url.startsWith('https://up.tiktok/')) return ++puts < 2 ? { status: 500 } : { status: 201 }
      return { json: { data: { status: 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } } }
    })
    expect(await uploadTikTok({ token: 't', file: video(10) })).toEqual({ publishId: 'p4', status: 'drafted' })
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2)
    expect(calls[1].headers?.['Content-Length']).toBeUndefined()

    fake((c) => (c.url.endsWith('init/') ? { json: { data: { publish_id: 'p5', upload_url: 'https://up.tiktok/v' }, error: { code: 'ok' } } } : { status: 500 }))
    await expect(uploadTikTok({ token: 't', file: video(10) })).rejects.toThrow(/error 500 al enviar el vídeo/)
  })

  it('consulta lo que permite la cuenta', async () => {
    fake(() => ({ json: { data: { creator_nickname: 'kywai', privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'], duet_disabled: true, max_video_post_duration_sec: 300 }, error: { code: 'ok' } } }))
    expect(await creatorInfo('t')).toEqual({ nickname: 'kywai', privacyOptions: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'], commentDisabled: false, duetDisabled: true, stitchDisabled: false, maxSeconds: 300 })
  })
})

describe('texto, orden y ajustes', () => {
  it('limpia y recorta el texto', () => {
    expect(cleanTikTokCaption('a\r\n\n\n\nb ')).toBe('a\n\nb')
    expect(cleanTikTokCaption('x'.repeat(3000)).length).toBe(TIKTOK_CAPTION_MAX)
  })

  it('reconoce «/tiktok» y «/tt»', () => {
    expect(parseTikTokRequest('/tiktok')).toEqual({ note: '' })
    expect(parseTikTokRequest('/tt  habla de la serie ')).toEqual({ note: 'habla de la serie' })
    expect(parseTikTokRequest('/tiktoker')).toBeNull()
    expect(parseTikTokRequest('sube a tiktok')).toBeNull()
  })

  it('guarda y lee los ajustes', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'tts-')), 'sub', 'tiktok.json')
    expect(readTikTokSettings(f)).toEqual({})
    writeTikTokSettings(f, { clientKey: 'ck', autoDraft: true })
    expect(readTikTokSettings(f)).toEqual({ clientKey: 'ck', autoDraft: true })
  })
})
