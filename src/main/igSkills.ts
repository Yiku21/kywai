// «/ig-plan», «/ig-viral», «/ig-reel»…: las habilidades de Instagram Agent Skill (postzen-dev/instagram-agent-skill,
// MIT) para llevar la cuenta de Instagram de kywai. Se descargan una vez, en una versión fija, y un agente sigue la
// habilidad con los datos reales de la cuenta (perfil, últimas publicaciones y sus números) que kywai saca con la
// API oficial. Sin PostZen: kywai publica con «/instagram» y responde a los comentarios con tu visto bueno.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { downloadFolder } from './plugins'
import { graphGet } from './instagram'

export const IG_SKILLS_REPO = 'postzen-dev/instagram-agent-skill'
export const IG_SKILLS_COMMIT = '7d3dd6e0183127e266e7c81f4d4044fa4fa9d368'

/** Las órdenes que hay y lo que hace cada una (ig-publish no: publicar es «/instagram»). */
export const IG_SKILLS: { name: string; line: string }[] = [
  { name: 'ig-plan', line: 'plan de la semana: qué publicar, en qué formato, cuándo y con qué cuentas interactuar' },
  { name: 'ig-viral', line: 'los reels que funcionan en tu nicho, por qué funcionan y un archivo de ideas para copiar la fórmula' },
  { name: 'ig-reel', line: 'una idea convertida en reel: tres ganchos puntuados, guion, texto en pantalla y tiempos' },
  { name: 'ig-profile', line: 'nota del perfil sobre 100 y cómo reescribirlo, por orden de prioridad' },
  { name: 'ig-audit', line: 'repaso de lo publicado: qué funcionó de verdad (envíos y guardados por alcance)' },
  { name: 'ig-caption', line: 'el texto de una publicación, con lo que se ve antes de «… más»' },
  { name: 'ig-carousel', line: 'un carrusel: portada y textos de cada diapositiva' },
  { name: 'ig-story', line: 'las historias del día y para qué sirve cada una' },
  { name: 'ig-comment', line: 'dos comentarios buenos para un post de otra cuenta (lo pegas tú: la API no deja comentar ahí)' },
  { name: 'ig-reply', line: 'respuestas a los comentarios de tus publicaciones, ordenadas por importancia' },
  { name: 'ig-dm', line: 'mensajes privados: entregas por palabra clave, primeros mensajes y propuestas de colaboración' },
  { name: 'ig-repurpose', line: 'un vídeo, podcast o texto convertido en una semana de reels y carruseles' },
  { name: 'ig-human', line: 'limpia un texto para que no suene a IA' }
]

export interface IgSkillRequest {
  skill: string
  note: string
}

/** «/ig-plan …», «/ig-viral …». null si no es una de estas órdenes. */
export function parseIgSkillRequest(text: string): IgSkillRequest | null {
  const m = /^\/(ig-[a-z]+)(?:\s+([\s\S]*))?$/i.exec(text.trim())
  if (!m) return null
  const skill = m[1].toLowerCase()
  if (!IG_SKILLS.some((s) => s.name === skill)) return null
  return { skill, note: (m[2] ?? '').trim().slice(0, 6000) }
}

/** Carpeta del paquete descargado y archivo de la voz de la cuenta. */
export function igPaths(workspaceRoot: string): { pack: string; voice: string } {
  const base = join(workspaceRoot, 'instagram')
  return { pack: join(base, 'instagram-agent-skill'), voice: join(base, 'voice.md') }
}

/** El SKILL.md de una habilidad (después de `ensureIgSkills`). */
export function igSkillFile(pack: string, skill: string): string {
  return join(pack, 'skills', skill, 'SKILL.md')
}

/** Descarga el paquete la primera vez (o si cambia la versión). Devuelve la carpeta. */
export async function ensureIgSkills(pack: string): Promise<string> {
  const stamp = join(pack, '.version')
  if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === IG_SKILLS_COMMIT) return pack
  const files = await downloadFolder({ repo: IG_SKILLS_REPO, ref: IG_SKILLS_COMMIT, path: '' })
  for (const [rel, data] of files) {
    if (rel.startsWith('.')) continue
    const p = join(pack, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, data)
  }
  writeFileSync(stamp, IG_SKILLS_COMMIT)
  return pack
}

interface IgMedia {
  id: string
  caption?: string
  media_type?: string
  media_product_type?: string
  timestamp?: string
  like_count?: number
  comments_count?: number
  permalink?: string
}

/**
 * Lo que la habilidad necesita saber de la cuenta, en Markdown: el perfil y las últimas publicaciones con sus números
 * (vistas, alcance, guardados y envíos de las 12 más recientes, si la API los da). Nunca lleva el token.
 */
export async function igAccountSnapshot(token: string, userId: string, signal?: AbortSignal): Promise<string> {
  const me = await graphGet<{ username?: string; name?: string; biography?: string; website?: string; followers_count?: number; follows_count?: number; media_count?: number }>(
    token,
    userId,
    { fields: 'username,name,biography,website,followers_count,follows_count,media_count' },
    signal
  )
  const media = await graphGet<{ data?: IgMedia[] }>(
    token,
    `${userId}/media`,
    { fields: 'id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink', limit: '25' },
    signal
  ).catch(() => ({ data: [] as IgMedia[] }))
  const rows: string[] = []
  for (const [i, m] of (media.data ?? []).entries()) {
    let stats = ''
    if (i < 12) {
      const ins = await graphGet<{ data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
        token,
        `${m.id}/insights`,
        { metric: 'views,reach,saved,shares' },
        signal
      ).catch(() => null)
      const v = (n: string): string => {
        const x = ins?.data?.find((d) => d.name === n)
        const val = x?.total_value?.value ?? x?.values?.[0]?.value
        return val == null ? '' : String(val)
      }
      if (ins) stats = ` | vistas ${v('views') || '?'} | alcance ${v('reach') || '?'} | guardados ${v('saved') || '?'} | envíos ${v('shares') || '?'}`
    }
    const kind = m.media_product_type === 'REELS' ? 'reel' : (m.media_type ?? '').toLowerCase()
    const cap = (m.caption ?? '').replace(/\s+/g, ' ').slice(0, 160)
    rows.push(`- ${m.timestamp?.slice(0, 10) ?? '?'} · ${kind} · me gusta ${m.like_count ?? '?'} · comentarios ${m.comments_count ?? '?'}${stats} · ${m.permalink ?? ''}\n  «${cap}»`)
  }
  return [
    `# Cuenta de Instagram @${me.username ?? '?'}`,
    '',
    `- Nombre: ${me.name ?? ''}`,
    `- Biografía: ${(me.biography ?? '').replace(/\n/g, ' / ')}`,
    `- Web: ${me.website ?? ''}`,
    `- Seguidores: ${me.followers_count ?? '?'} · siguiendo: ${me.follows_count ?? '?'} · publicaciones: ${me.media_count ?? '?'}`,
    '',
    '## Últimas publicaciones (de la más nueva a la más antigua)',
    rows.length ? rows.join('\n') : '(ninguna todavía)'
  ].join('\n')
}

/** El encargo: seguir la habilidad con los datos de la cuenta, sin publicar nada. */
export function igSkillPrompt(input: { skill: string; skillFile: string; pack: string; note: string; voiceFile: string; hasVoice: boolean; accountFile?: string; accountError?: string; lang: string }): string {
  const s = IG_SKILLS.find((x) => x.name === input.skill)
  return [
    `Sigue la habilidad «${input.skill}» (${s?.line ?? ''}) para la cuenta de Instagram de kywai. Léela entera antes de empezar: ${input.skillFile}. Las demás habilidades del paquete están en ${join(input.pack, 'skills')} y puedes usarlas si esta lo pide (por ejemplo ig-human para limpiar el texto); sus scripts de Python se ejecutan con python3.`,
    '',
    input.note ? `Lo que pide el usuario: ${input.note}` : 'El usuario no ha añadido nada más: haz lo que la habilidad hace por defecto.',
    '',
    input.accountFile
      ? `Datos reales de la cuenta (perfil y últimas publicaciones con sus números, sacados ahora con la API oficial): ${input.accountFile}. Úsalos en lugar de pedírselos al usuario.`
      : input.accountError
        ? `No se pudieron leer los datos de la cuenta (${input.accountError}). Trabaja con lo que haya y di en una línea qué datos faltan.`
        : 'La cuenta de Instagram de kywai aún no está conectada (Ajustes → Extensiones → Estudio de vídeo): trabaja sin sus números y dilo en una línea.',
    input.hasVoice
      ? `La voz de la cuenta (cómo habla, a quién, qué evita) está en ${input.voiceFile}: síguela.`
      : `Aún no hay archivo de voz de la cuenta. Si la habilidad lo necesita, crea ${input.voiceFile} con la plantilla ${join(input.pack, 'templates', 'voice.md')}, rellenado con lo que sepas de kywai (la app de agentes de IA que trabajan en equipo) y de sus publicaciones, y dilo.`,
    '',
    'Reglas de kywai (mandan sobre la habilidad):',
    '- No publiques, no comentes, no respondas ni mandes mensajes en Instagram: no hay PostZen. Lo que la habilidad diga de PostZen, sáltalo. kywai publica con «/instagram» (con el visto bueno del usuario) y los comentarios de otras cuentas los pega el usuario a mano: la API no deja comentar ahí.',
    '- No navegues por Instagram ni lo raspes, no pidas contraseñas ni sesiones. Para investigar, YouTube Shorts (yt-dlp) y la web sirven; o pide al usuario que pegue lo que vio.',
    '- Si de esto sale un reel para hacer, termina con la orden exacta para que kywai lo haga, en una línea aparte: «/video vertical <tema y guion breve>».',
    `- Responde en ${input.lang}, con el resultado listo para usar (sin contar el proceso). Si guardas archivos (plan, swipe file), di dónde.`
  ].join('\n')
}
