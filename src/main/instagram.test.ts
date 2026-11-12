import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { __setInstagramFetchForTests, captionPrompt, cleanCaption, graphHost, instagramAccount, parseCaptionReply, parseInstagramRequest, publishReel, readInstagramSettings, writeInstagramSettings } from './instagram'

type Call = { url: string; method: string; headers: Record<string, string>; body?: string | Uint8Array | FormData }

function fakeGraph(routes: Array<[RegExp, (c: Call) => unknown]>): Call[] {
  const calls: Call[] = []
  __setInstagramFetchForTests(
    async (url, init) => {
      const c: Call = { url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body }
      calls.push(c)
      const r = routes.find(([re]) => re.test(`${c.method} ${url}`))
      const out = r ? r[1](c) : { error: { message: 'ruta no prevista' } }
      const ok = !(out && typeof out === 'object' && 'error' in out)
      return { ok, status: ok ? 200 : 400, text: async () => JSON.stringify(out) }
    },
    async () => undefined
  )
  return calls
}

afterEach(() => __setInstagramFetchForTests(null))

describe('el Instagram de kywai', () => {
  it('elige la API según el token', () => {
    expect(graphHost('IGQVJ123')).toBe('https://graph.instagram.com')
    expect(graphHost('EAAB123')).toBe('https://graph.facebook.com')
  })

  it('comprueba la cuenta sin poner el token en la dirección', async () => {
    const calls = fakeGraph([[/GET https:\/\/graph\.instagram\.com\/v21\.0\/me\?/, () => ({ user_id: '1784', username: 'kywai.app', id: '99' })]])
    expect(await instagramAccount('IGtoken123')).toEqual({ userId: '1784', username: 'kywai.app' })
    expect(calls[0].url).not.toContain('IGtoken123')
    expect(calls[0].headers.Authorization).toBe('Bearer IGtoken123')
  })

  it('con un token de Facebook busca la cuenta de Instagram de su página', async () => {
    fakeGraph([[/me\/accounts/, () => ({ data: [{}, { instagram_business_account: { id: '555', username: 'kywai' } }] })]])
    expect(await instagramAccount('EAAtoken')).toEqual({ userId: '555', username: 'kywai' })
    fakeGraph([[/me\/accounts/, () => ({ data: [] })]])
    await expect(instagramAccount('EAAtoken')).rejects.toThrow(/ninguna cuenta de Instagram profesional/)
  })

  it('publica un reel: contenedor reanudable, subida del archivo, espera y publicación', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-'))
    const file = join(dir, 'reel.mp4')
    writeFileSync(file, Buffer.alloc(2048, 1))
    let polls = 0
    const calls = fakeGraph([
      [/POST https:\/\/graph\.facebook\.com\/v21\.0\/1784\/media$/, () => ({ id: 'C1', uri: 'https://rupload.facebook.com/ig-api-upload/v21.0/C1' })],
      [/POST https:\/\/rupload\.facebook\.com/, () => ({ success: true })],
      [/GET .*\/C1\?/, () => (++polls < 2 ? { status_code: 'IN_PROGRESS' } : { status_code: 'FINISHED' })],
      [/POST .*\/1784\/media_publish$/, () => ({ id: 'M1' })],
      [/GET .*\/M1\?/, () => ({ permalink: 'https://www.instagram.com/reel/abc/' })]
    ])
    const steps: string[] = []
    const r = await publishReel({ token: 'EAAtok12345', userId: '1784', file, caption: 'Hola #a #b', onStep: (s) => steps.push(s) })
    expect(r).toEqual({ id: 'M1', permalink: 'https://www.instagram.com/reel/abc/' })
    const create = new URLSearchParams(calls[0].body as string)
    expect(Object.fromEntries(create)).toEqual({ media_type: 'REELS', upload_type: 'resumable', caption: 'Hola #a #b' })
    expect(calls[1].headers).toMatchObject({ Authorization: 'OAuth EAAtok12345', offset: '0', file_size: '2048' })
    expect((calls[1].body as Uint8Array).byteLength).toBe(2048)
    expect(new URLSearchParams(calls.find((c) => c.url.endsWith('media_publish'))!.body as string).get('creation_id')).toBe('C1')
    expect(steps).toContain('Subiendo el vídeo a Instagram')
    expect(calls.every((c) => !c.url.includes('EAAtok12345'))).toBe(true)
  })

  it('un reel de prueba lleva trial_params (primero solo para quien no sigue la cuenta)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-trial-'))
    const file = join(dir, 'v.mp4')
    writeFileSync(file, Buffer.alloc(64, 1))
    const calls = fakeGraph([
      [/POST .*\/media$/, () => ({ id: 'C9' })],
      [/rupload/, () => ({ success: true })],
      [/GET .*\/C9\?/, () => ({ status_code: 'FINISHED' })],
      [/media_publish/, () => ({ id: 'M9' })],
      [/GET .*\/M9\?/, () => ({ permalink: 'https://www.instagram.com/reel/t/' })]
    ])
    await publishReel({ token: 'EAAx', userId: '17', file, caption: 'hola', trial: true })
    const box = new URLSearchParams(String(calls[0].body))
    expect(JSON.parse(box.get('trial_params')!)).toEqual({ graduation_strategy: 'SS_PERFORMANCE' })
  })

  it('si Instagram no procesa el vídeo, lo dice', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-'))
    const file = join(dir, 'reel.mp4')
    writeFileSync(file, Buffer.alloc(10, 1))
    fakeGraph([
      [/\/media$/, () => ({ id: 'C2' })],
      [/rupload/, () => ({ success: true })],
      [/GET .*\/C2\?/, () => ({ status_code: 'ERROR', status: 'Error: formato no válido' })]
    ])
    await expect(publishReel({ token: 'EAAx123456', userId: '1', file, caption: 'x' })).rejects.toThrow(/no pudo procesar el vídeo: Error: formato no válido/)
    fakeGraph([[/\/media$/, () => ({ error: { code: 190, message: 'Session expired' } })]])
    await expect(publishReel({ token: 'EAAx123456', userId: '1', file, caption: 'x' })).rejects.toThrow(/no acepta el token.*Session expired/)
  })

  it('si falla la subida del vídeo, dice el paso y lo que contestó Meta', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-'))
    const file = join(dir, 'reel.mp4')
    writeFileSync(file, Buffer.alloc(10, 1))
    __setInstagramFetchForTests(
      async (url) =>
        url.includes('rupload')
          ? { ok: false, status: 400, text: async () => JSON.stringify({ debug_info: { retriable: false, type: 'ProcessingFailedError', message: 'Request processing failed' } }) }
          : { ok: true, status: 200, text: async () => JSON.stringify({ id: 'C3' }) },
      async () => undefined
    )
    await expect(publishReel({ token: 'EAAx123456', userId: '1', file, caption: 'x' })).rejects.toThrow(/^Instagram respondió con un error 400 al subir el vídeo: Request processing failed \[ProcessingFailedError\]\. Con un enlace temporal tampoco: /)
  })

  it('un 500 al subir se reintenta y un error de la API lleva su código y el paso', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-'))
    const file = join(dir, 'reel.mp4')
    writeFileSync(file, Buffer.alloc(10, 1))
    let uploads = 0
    __setInstagramFetchForTests(
      async (url) => {
        if (url.includes('rupload')) return ++uploads < 2 ? { ok: false, status: 503, text: async () => '<html>Service Unavailable</html>' } : { ok: true, status: 200, text: async () => '{"success":true}' }
        if (url.endsWith('/media')) return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'C4' }) }
        if (url.includes('/C4?')) return { ok: true, status: 200, text: async () => JSON.stringify({ status_code: 'FINISHED' }) }
        return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'Media ID is not available', code: 9007, error_subcode: 2207027, fbtrace_id: 'T1' } }) }
      },
      async () => undefined
    )
    await expect(publishReel({ token: 'EAAx123456', userId: '1', file, caption: 'x' })).rejects.toThrow('Instagram respondió con un error 400 al publicar el reel: Media ID is not available [9007/2207027] (fbtrace_id T1)')
    expect(uploads).toBe(2)
  })

  it('si Instagram no contesta, no se queda colgado: dice en qué paso', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-'))
    const file = join(dir, 'reel.mp4')
    writeFileSync(file, Buffer.alloc(10, 1))
    __setInstagramFetchForTests(
      async (_url, init) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal)
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      },
      async () => undefined
    )
    await expect(publishReel({ token: 'EAAx123456', userId: '1', file, caption: 'x' })).rejects.toThrow('Instagram no contestó en 60 s al preparar la publicación')
  })

  it('con un token de Instagram da un enlace temporal en vez de la subida directa (que Meta no admite)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-'))
    const file = join(dir, 'reel.mp4')
    writeFileSync(file, Buffer.alloc(64, 1))
    const calls = fakeGraph([
      [/POST https:\/\/litterbox\.catbox\.moe/, () => ({ error: 'caído' })],
      [/POST https:\/\/tmpfiles\.org\/api\/v1\/upload$/, () => ({ status: 'success', data: { url: 'http://tmpfiles.org/123/kywai.mp4' } })],
      [/POST https:\/\/graph\.instagram\.com\/v21\.0\/1784\/media$/, () => ({ id: 'C9' })],
      [/GET .*\/C9\?/, () => ({ status_code: 'FINISHED' })],
      [/POST .*\/media_publish$/, () => ({ id: 'M9' })],
      [/GET .*\/M9\?/, () => ({ permalink: 'https://www.instagram.com/reel/z/' })]
    ])
    const steps: string[] = []
    const r = await publishReel({ token: 'IGAAtok123', userId: '1784', file, caption: 'Hola', onStep: (s) => steps.push(s) })
    expect(r.id).toBe('M9')
    expect(calls.some((c) => c.url.includes('rupload'))).toBe(false)
    const form = calls[0].body as FormData
    expect(form.get('time')).toBe('1h')
    expect((form.get('fileToUpload') as Blob).size).toBe(64)
    const create = Object.fromEntries(new URLSearchParams(calls.find((c) => c.url.endsWith('/1784/media'))!.body as string))
    expect(create).toEqual({ media_type: 'REELS', video_url: 'https://tmpfiles.org/dl/123/kywai.mp4', caption: 'Hola' })
    expect(steps[0]).toBe('Subiendo el vídeo a un enlace temporal')
  })

  it('si Meta rechaza la subida directa con un token EAA, prueba con un enlace temporal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-'))
    const file = join(dir, 'reel.mp4')
    writeFileSync(file, Buffer.alloc(32, 1))
    let boxes = 0
    const calls: string[] = []
    __setInstagramFetchForTests(
      async (url, init) => {
        calls.push(`${init?.method} ${url}`)
        const ok = (b: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(b) })
        if (url.includes('rupload')) return { ok: false, status: 400, text: async () => JSON.stringify({ debug_info: { retriable: false, type: 'ProcessingFailedError', message: 'Request processing failed' } }) }
        if (url.includes('litterbox')) return { ok: true, status: 200, text: async () => 'https://litter.catbox.moe/abc.mp4' }
        if (url.endsWith('/1/media')) {
          boxes++
          const params = new URLSearchParams(init?.body as string)
          return ok(params.get('video_url') === 'https://litter.catbox.moe/abc.mp4' ? { id: 'C2' } : { id: 'C1', uri: 'https://rupload.facebook.com/ig-api-upload/v21.0/C1' })
        }
        if (url.includes('/C2?')) return ok({ status_code: 'FINISHED' })
        if (url.endsWith('media_publish')) return ok({ id: new URLSearchParams(init?.body as string).get('creation_id') === 'C2' ? 'M2' : 'MAL' })
        return ok({})
      },
      async () => undefined
    )
    const r = await publishReel({ token: 'EAAx123456', userId: '1', file, caption: 'x' })
    expect(r.id).toBe('M2')
    expect(boxes).toBe(2)
  })

  it('el texto cabe en Instagram y se limpia lo que añade el agente', () => {
    const tags = Array.from({ length: 35 }, (_, i) => `#t${i}`).join(' ')
    expect(cleanCaption(tags).match(/#/g)).toHaveLength(30)
    expect(cleanCaption('a'.repeat(3000))).toHaveLength(2200)
    expect(parseCaptionReply('Texto: «Mira esto\n\n#ia»')).toBe('Mira esto\n\n#ia')
    expect(parseCaptionReply('```\nGancho\n#a\n```')).toBe('Gancho\n#a')
    expect(parseCaptionReply('BLOQUEADA: es de otro')).toBeNull()
    expect(captionPrompt({ video: '/p/v.mp4', about: 'Un gato', lang: 'español', username: 'kywai', question: '¿A o B?' })).toMatch(/@kywai[\s\S]*¿A o B\?[\s\S]*A o B/)
  })

  it('«/instagram» y los ajustes', () => {
    expect(parseInstagramRequest('/instagram que suene divertido')).toEqual({ note: 'que suene divertido' })
    expect(parseInstagramRequest('/ig')).toEqual({ note: '' })
    expect(parseInstagramRequest('/instagram prueba que enganche')).toEqual({ note: 'que enganche', trial: true })
    expect(parseInstagramRequest('/instagram resultados')).toEqual({ note: '', results: true })
    expect(parseInstagramRequest('/instagram pruebas de concepto')).toEqual({ note: 'pruebas de concepto' })
    expect(parseInstagramRequest('sube esto a instagram')).toBeNull()
    const f = join(mkdtempSync(join(tmpdir(), 'ig-')), 'sub', 'instagram.json')
    expect(readInstagramSettings(f)).toEqual({})
    writeInstagramSettings(f, { userId: '1', username: 'k', autoPublish: true })
    expect(readInstagramSettings(f)).toEqual({ userId: '1', username: 'k', autoPublish: true })
  })
})
