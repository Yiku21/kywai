// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { IG_SKILLS, igAccountSnapshot, igPaths, igReplyPrompt, igSkillFile, igSkillPrompt, parseIgReplies, parseIgSkillRequest } from './igSkills'
import { __setInstagramFetchForTests, replyToComment, unansweredComments } from './instagram'

afterEach(() => __setInstagramFetchForTests(null))

describe('habilidades de Instagram', () => {
  it('entiende las órdenes /ig-…', () => {
    expect(parseIgSkillRequest('/ig-plan semana de lanzamiento')).toEqual({ skill: 'ig-plan', note: 'semana de lanzamiento' })
    expect(parseIgSkillRequest('/IG-VIRAL')).toEqual({ skill: 'ig-viral', note: '' })
    expect(parseIgSkillRequest('/ig-publish ya')).toBeNull()
    expect(parseIgSkillRequest('/ig hola')).toBeNull()
    expect(parseIgSkillRequest('haz el /ig-plan')).toBeNull()
    expect(IG_SKILLS.map((s) => s.name)).not.toContain('ig-publish')
  })

  it('el encargo lleva la habilidad, los datos de la cuenta y las reglas de kywai', () => {
    const { pack, voice } = igPaths('/w')
    const p = igSkillPrompt({ skill: 'ig-plan', skillFile: igSkillFile(pack, 'ig-plan'), pack, note: 'lanzamos el modo diálogo', voiceFile: voice, hasVoice: false, accountFile: '/w/cuenta.md', lang: 'español' })
    expect(p).toContain(join('/w', 'instagram', 'instagram-agent-skill', 'skills', 'ig-plan', 'SKILL.md'))
    expect(p).toContain('/w/cuenta.md')
    expect(p).toContain('lanzamos el modo diálogo')
    expect(p).toContain('No publiques')
    expect(p).toContain('templates')
  })

  it('saca el perfil y las publicaciones con sus números, sin el token', async () => {
    const calls: string[] = []
    __setInstagramFetchForTests(async (url) => {
      const u = new URL(String(url))
      calls.push(u.pathname)
      const body = u.pathname.endsWith('/insights')
        ? { data: [{ name: 'views', total_value: { value: 900 } }, { name: 'shares', values: [{ value: 12 }] }] }
        : u.pathname.endsWith('/media')
          ? { data: [{ id: 'm1', caption: 'Hola equipo', media_product_type: 'REELS', timestamp: '2026-11-09T10:00:00+0000', like_count: 40, comments_count: 3, permalink: 'https://instagram.com/p/x' }] }
          : { username: 'kywai.app', followers_count: 120, media_count: 1, biography: 'Agentes de IA' }
      return new Response(JSON.stringify(body), { status: 200 })
    })
    const md = await igAccountSnapshot('IGsecreto', '1789')
    expect(md).toContain('@kywai.app')
    expect(md).toContain('Seguidores: 120')
    expect(md).toContain('reel · me gusta 40 · comentarios 3 | vistas 900')
    expect(md).toContain('envíos 12')
    expect(md).not.toContain('IGsecreto')
    expect(calls).toContain('/v21.0/m1/insights')
  })

  it('la versión del paquete está fija', () => {
    const src = readFileSync(join(__dirname, 'igSkills.ts'), 'utf8')
    expect(src).toMatch(/IG_SKILLS_COMMIT = '[0-9a-f]{40}'/)
    expect(mkdtempSync(join(tmpdir(), 'x'))).toBeTruthy()
  })

  it('trae solo los comentarios sin responder, sin los de la cuenta', async () => {
    __setInstagramFetchForTests(async (url) => {
      const u = new URL(String(url))
      const body = u.pathname.endsWith('/media')
        ? { data: [{ id: 'm1', caption: 'Reel del modo diálogo', permalink: 'https://instagram.com/p/x', comments_count: 3 }, { id: 'm2', comments_count: 0 }] }
        : {
            data: [
              { id: 'c1', text: '¿Dónde se descarga?', username: 'ana', timestamp: '2026-11-10T10:00:00+0000' },
              { id: 'c2', text: 'Gracias', username: 'luis', timestamp: '2026-11-10T11:00:00+0000', replies: { data: [{ username: 'kywai.app' }] } },
              { id: 'c3', text: 'Nuestro reel', username: 'kywai.app' }
            ]
          }
      return new Response(JSON.stringify(body), { status: 200 })
    })
    const c = await unansweredComments('IGx', '1789', 'kywai.app')
    expect(c.map((x) => x.id)).toEqual(['c1'])
    expect(c[0]).toMatchObject({ username: 'ana', mediaId: 'm1', post: 'Reel del modo diálogo' })
  })

  it('responde a un comentario con un POST a sus respuestas', async () => {
    let seen = ''
    __setInstagramFetchForTests(async (url, init) => {
      seen = `${init?.method} ${new URL(String(url)).pathname} ${String(init?.body)}`
      return new Response(JSON.stringify({ id: 'r9' }), { status: 200 })
    })
    expect(await replyToComment('IGx', 'c1', ' En kywai.app ')).toBe('r9')
    expect(seen).toBe('POST /v21.0/c1/replies message=En+kywai.app')
    await expect(replyToComment('IGx', 'c1', '  ')).rejects.toThrow('vacía')
  })

  it('lee las respuestas del agente y descarta ids inventados', () => {
    expect(igReplyPrompt('BASE', '/w/c.json', 2)).toContain('"replies"')
    const r = parseIgReplies('Aquí van: {"replies": [{"id": "c1", "kind": "question", "reply": "En kywai.app"}, {"id": "zz", "reply": "x"}, {"id": "c2", "kind": "noise", "reply": ""}]}', new Set(['c1', 'c2']))
    expect(r).toEqual([
      { id: 'c1', kind: 'question', reply: 'En kywai.app' },
      { id: 'c2', kind: 'noise', reply: '' }
    ])
    expect(() => parseIgReplies('sin json', new Set())).toThrow()
  })
})
