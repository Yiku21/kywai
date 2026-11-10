// Personajes de los vídeos, para todos los proyectos: los robots de kywai (de fábrica) y los que crea el usuario desde
// el selector de «/video» con un nombre, una descripción, imágenes o ambas. Cada uno vive en
// <workspace>/personajes/<id>/ (personaje.json, sus imágenes y miniatura.jpg). La primera vez que sale en un vídeo, el
// guion escribe su aspecto en inglés y se guarda (aspecto.txt): desde entonces sale igual en todos los vídeos, en el
// estilo que se elija.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { CHARACTER_ID, ROBOTS_CHARACTER } from '../shared/videoChoice'
import type { VideoCharacterInfo, VideoCharacterInput } from '../shared/types'
import { tr } from '../shared/i18n'

let root = ''
let robotImages: string[] = []

/** Dónde se guardan y las imágenes de los robots (las pone index.ts: van empaquetadas con la app). */
export function initVideoCharacters(workspaceRoot: string, robots: string[] = []): void {
  root = join(workspaceRoot, 'personajes')
  robotImages = robots
}

export const MAX_CHARACTER_IMAGES = 6
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const MAX_THUMB_BYTES = 200 * 1024
const IMG = /\.(png|jpe?g|webp)$/i
const LOOK_FILE = 'aspecto.txt'

/** Cómo son los robots (en inglés, sin el estilo de dibujo): así salen reconocibles en cualquier estilo. */
export const ROBOTS_LOOK =
  'Hermes: the team leader, a small egg-shaped robot with a glossy cream-white body, a black bob-cut "hair" shell with two side buns and a thin gold headband, a dark visor with two glowing warm-yellow eyes, a small gold emblem on the chest. ' +
  'Claude: a small round robot with a glossy orange body and a flame-like orange tuft on top, a dark visor with two glowing eyes that smile as curved lines, a small cream star mark on the chest. ' +
  'Codex: a small cube-shaped robot with rounded corners and a glossy green body, a dark visor with two glowing mint-green chevron eyes, small vents on the sides. ' +
  'All three are cute, about knee-high, with no mouth (they emote with their eyes and bodies), and they float or hop.'

export interface CharacterForVideo {
  id: string
  name: string
  /** Lo que escribió el usuario (en su idioma). */
  about?: string
  /** Rutas absolutas de sus imágenes de referencia. */
  images: string[]
  /** Su aspecto en inglés, ya fijado (va en cada imagen). */
  look?: string
  builtin?: boolean
}

interface Saved {
  id: string
  name: string
  description: string
  createdAt: number
}

const dirOf = (id: string): string => join(root, id)

/**
 * Las imágenes de los robots, copiadas a la carpeta de personajes: dentro de la app empaquetada (app.asar) solo las
 * lee kywai, y el agente que dirige una película tiene que poder abrirlas.
 */
function robotFiles(): string[] {
  const out: string[] = []
  for (const f of robotImages) {
    const dest = join(dirOf(ROBOTS_CHARACTER), basename(f).replace(/-[\w]{6,}(?=\.\w+$)/, ''))
    try {
      if (!existsSync(dest)) {
        mkdirSync(dirOf(ROBOTS_CHARACTER), { recursive: true })
        copyFileSync(f, dest)
      }
      out.push(dest)
    } catch {
      if (existsSync(f)) out.push(f)
    }
  }
  return out
}

function readSaved(id: string): Saved | null {
  try {
    const raw = JSON.parse(readFileSync(join(dirOf(id), 'personaje.json'), 'utf8')) as Partial<Saved>
    if (typeof raw.name !== 'string') return null
    return { id, name: raw.name, description: typeof raw.description === 'string' ? raw.description : '', createdAt: Number(raw.createdAt) || 0 }
  } catch {
    return null
  }
}

function imagesOf(id: string): string[] {
  try {
    return readdirSync(dirOf(id))
      .filter((n) => IMG.test(n) && n.startsWith('imagen-'))
      .sort()
      .slice(0, MAX_CHARACTER_IMAGES)
      .map((n) => join(dirOf(id), n))
  } catch {
    return []
  }
}

function readLook(id: string): string | undefined {
  try {
    return readFileSync(join(dirOf(id), LOOK_FILE), 'utf8').replace(/\s+/g, ' ').trim().slice(0, 900) || undefined
  } catch {
    return undefined
  }
}

function thumbOf(id: string): string {
  try {
    const buf = readFileSync(join(dirOf(id), 'miniatura.jpg'))
    return buf.length <= MAX_THUMB_BYTES ? `data:image/jpeg;base64,${buf.toString('base64')}` : ''
  } catch {
    return ''
  }
}

function savedIds(): string[] {
  try {
    return readdirSync(root).filter((n) => CHARACTER_ID.test(n) && n !== ROBOTS_CHARACTER && existsSync(join(root, n, 'personaje.json')))
  } catch {
    return []
  }
}

/** La lista para el selector: primero los robots, después los creados (el más nuevo primero). */
export function listVideoCharacters(): VideoCharacterInfo[] {
  const own = savedIds()
    .map((id) => readSaved(id))
    .filter((c): c is Saved => !!c)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((c) => ({ id: c.id, name: c.name, description: c.description, thumb: thumbOf(c.id), images: imagesOf(c.id).length }))
  return [{ id: ROBOTS_CHARACTER, name: 'Robots de kywai', description: 'Hermes, Claude y Codex', thumb: '', images: robotImages.length, builtin: true }, ...own]
}

/** El id de un personaje nuevo, sacado de su nombre («Doña Rosa» → «dona-rosa-3f9a»). */
export function characterId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${slug || 'personaje'}-${randomBytes(2).toString('hex')}`
}

/** La extensión según el contenido (no según el nombre): solo PNG, JPG y WebP. */
const extOf = (buf: Buffer): string => {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg'
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp'
  return ''
}

/** Crea un personaje. Hace falta el nombre y, además, una descripción, imágenes o ambas. */
export function addVideoCharacter(input: unknown): { id: string; characters: VideoCharacterInfo[] } {
  if (!root) throw new Error(tr('Los personajes aún no están listos'))
  const o = (input ?? {}) as Partial<VideoCharacterInput>
  const name = typeof o.name === 'string' ? o.name.replace(/\s+/g, ' ').trim().slice(0, 60) : ''
  if (!name) throw new Error(tr('Ponle un nombre al personaje'))
  const description = typeof o.description === 'string' ? o.description.trim().slice(0, 1500) : ''
  const images: Buffer[] = []
  for (const img of Array.isArray(o.images) ? o.images.slice(0, MAX_CHARACTER_IMAGES) : []) {
    if (!img || typeof img.data !== 'string') continue
    const buf = Buffer.from(img.data, 'base64')
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) throw new Error(tr('La imagen «{name}» es demasiado grande', { name: String(img.name ?? '').slice(0, 60) }))
    if (!extOf(buf)) throw new Error(tr('«{name}» no es una imagen PNG, JPG o WebP', { name: String(img.name ?? '').slice(0, 60) }))
    images.push(buf)
  }
  if (!description && !images.length) throw new Error(tr('Describe al personaje, añade imágenes o las dos cosas'))
  const id = characterId(name)
  const dir = dirOf(id)
  mkdirSync(dir, { recursive: true })
  images.forEach((buf, i) => writeFileSync(join(dir, `imagen-${i + 1}.${extOf(buf)}`), buf))
  if (typeof o.thumb === 'string' && o.thumb) {
    const t = Buffer.from(o.thumb, 'base64')
    if (t.length && t.length <= MAX_THUMB_BYTES && t[0] === 0xff && t[1] === 0xd8) writeFileSync(join(dir, 'miniatura.jpg'), t)
  }
  const saved: Saved = { id, name, description, createdAt: Date.now() }
  writeFileSync(join(dir, 'personaje.json'), JSON.stringify(saved, null, 2))
  return { id, characters: listVideoCharacters() }
}

export function removeVideoCharacter(id: unknown): VideoCharacterInfo[] {
  if (typeof id !== 'string' || !CHARACTER_ID.test(id) || id === ROBOTS_CHARACTER) throw new Error(tr('Ese personaje no se puede borrar'))
  if (root && existsSync(join(dirOf(id), 'personaje.json'))) rmSync(dirOf(id), { recursive: true, force: true })
  return listVideoCharacters()
}

/** Lo que necesita un vídeo de un personaje (null si no existe). */
export function videoCharacter(id: string | undefined | null): CharacterForVideo | null {
  if (!id) return null
  if (id === ROBOTS_CHARACTER)
    return { id, name: 'Hermes, Claude y Codex (los robots de kywai)', images: root ? robotFiles() : [], look: ROBOTS_LOOK, builtin: true }
  if (!root || !CHARACTER_ID.test(id)) return null
  const saved = readSaved(id)
  if (!saved) return null
  const look = readLook(id)
  return { id, name: saved.name, ...(saved.description ? { about: saved.description } : {}), images: imagesOf(id), ...(look ? { look } : {}) }
}

/** Guarda el aspecto que escribió el guion la primera vez (luego manda el guardado). Devuelve si lo guardó. */
export function saveCharacterLook(id: string, look: string): boolean {
  if (!root || id === ROBOTS_CHARACTER || !CHARACTER_ID.test(id) || !readSaved(id)) return false
  const file = join(dirOf(id), LOOK_FILE)
  const text = look.replace(/\s+/g, ' ').trim()
  if (!text || existsSync(file)) return false
  writeFileSync(file, `${text}\n`)
  return true
}
