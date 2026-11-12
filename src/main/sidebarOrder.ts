import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SidebarOrder } from '@shared/types'

/**
 * Orden que el usuario deja al arrastrar en la barra lateral: proyectos, Favoritos (proyectos y chats mezclados) y
 * los chats de cada proyecto. Vive en el servidor (orden-barra.json en la carpeta de trabajo) para verse igual en el
 * escritorio, la web y el cliente. Lo que no está en la lista (proyectos o chats nuevos) sale arriba, por fecha.
 */

const MAX_IDS = 500
const ID_RE = /^[A-Za-z0-9:_-]{1,200}$/

let file = ''
let cached: SidebarOrder | null = null

export function initSidebarOrder(workspaceRoot: string): void {
  file = join(workspaceRoot, 'orden-barra.json')
  cached = null
}

function ids(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) if (typeof x === 'string' && ID_RE.test(x) && !out.includes(x)) out.push(x)
  return out.slice(0, MAX_IDS)
}

/** Limpia lo que llega (del archivo o de la interfaz): solo listas de ids válidos y sin repetir. */
export function cleanOrder(raw: unknown): SidebarOrder {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const chats: Record<string, string[]> = {}
  if (r.chats && typeof r.chats === 'object') {
    for (const [k, v] of Object.entries(r.chats as Record<string, unknown>)) {
      if (ID_RE.test(k)) {
        const list = ids(v)
        if (list.length) chats[k] = list
      }
    }
  }
  return { projects: ids(r.projects), favorites: ids(r.favorites), chats }
}

export function getSidebarOrder(): SidebarOrder {
  if (cached) return cached
  try {
    cached = cleanOrder(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    cached = { projects: [], favorites: [], chats: {} }
  }
  return cached
}

/** Cambia solo lo que llega: `projects`, `favorites` o los chats de los proyectos que vengan en `chats`. */
export function setSidebarOrder(patch: unknown): SidebarOrder {
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>
  const clean = cleanOrder(p)
  const cur = getSidebarOrder()
  const next: SidebarOrder = {
    projects: 'projects' in p ? clean.projects : cur.projects,
    favorites: 'favorites' in p ? clean.favorites : cur.favorites,
    chats: { ...cur.chats }
  }
  if (p.chats && typeof p.chats === 'object') {
    for (const k of Object.keys(p.chats as object)) {
      if (!ID_RE.test(k)) continue
      if (clean.chats[k]) next.chats[k] = clean.chats[k]
      else delete next.chats[k]
    }
  }
  cached = next
  if (file) {
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
    renameSync(tmp, file)
  }
  return next
}
