// Secretos de cada proyecto (pestaña «Secretos»): claves de API, tokens y contraseñas que los agentes pueden USAR
// pero no LEER. Se guardan cifrados en la carpeta de datos de este equipo (nunca en la carpeta del proyecto, ni en
// config.json, ni en git). A la interfaz solo llegan el nombre y la nota, nunca el valor: ni por IPC, ni por el
// acceso web, ni por la API móvil. A las tareas les llegan como variables de entorno del programa del agente, y todo
// lo que el agente devuelve (respuesta, pasos, errores) pasa por redactSecrets(), que tapa cualquier valor guardado.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ProjectSecretInfo, ProjectSecretInput } from '@shared/types'
import { tr } from '@shared/i18n'
import type { KeyCipher } from './secrets'

export const MAX_SECRETS = 50
export const MAX_SECRET_VALUE = 8 * 1024
export const MAX_SECRET_NOTE = 200
/** Valores más cortos que esto no se tapan en el texto (taparían palabras normales), así que no se admiten. */
export const MIN_SECRET_VALUE = 4

/** Nombre de variable de entorno: mayúsculas, números y _, empezando por letra. */
export const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/

/**
 * Variables que no se pueden pisar: las del sistema y las que kywai usa para lanzar a los agentes (cuenta, cuota,
 * configuración). Un secreto con ese nombre cambiaría cómo arranca el programa, no solo lo que lee.
 */
const RESERVED = new Set([
  'PATH', 'HOME', 'USER', 'USERNAME', 'SHELL', 'PWD', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'TERM', 'NODE_OPTIONS',
  'NODE_PATH', 'NO_COLOR', 'FORCE_COLOR', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'SYSTEMROOT', 'COMSPEC',
  'PATHEXT', 'DYLD_INSERT_LIBRARIES', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'PYTHONPATH', 'PYTHONHOME',
  'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'GEMINI_CLI_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'ELECTRON_RUN_AS_NODE'
])
const RESERVED_PREFIX = /^(?:KYWAI_|COWORK_|AICOWORK_|ELECTRON_|NPM_CONFIG_)/

/** El nombre limpio (en mayúsculas, espacios y guiones a _) o un error en español. */
export function cleanSecretName(raw: unknown): string {
  const name = (typeof raw === 'string' ? raw : '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
  if (!SECRET_NAME_RE.test(name)) throw new Error(tr('El nombre solo puede llevar letras sin acentos, números y _, y empezar por una letra (por ejemplo GHL_PIT)'))
  if (RESERVED.has(name) || RESERVED_PREFIX.test(name)) throw new Error(tr('{name} es un nombre reservado: elige otro', { name }))
  return name
}

interface Stored {
  value: string
  encrypted: boolean
  note?: string
  updatedAt: number
}

type Data = Record<string, Record<string, Stored>>

/** Lo que se tapa: cada valor y sus formas escapadas (JSON y URL), de más largo a más corto. */
interface Mask {
  needle: string
  name: string
}

export class ProjectSecrets {
  private masks: Mask[] = []
  private loaded = false

  constructor(
    private readonly file: string,
    private readonly cipher: KeyCipher
  ) {}

  private read(): Data {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as Data
      return data && typeof data === 'object' ? data : {}
    } catch {
      return {}
    }
  }

  private write(data: Data): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, this.file)
    this.refresh(data)
  }

  private open(s: Stored): string | null {
    if (!s || typeof s.value !== 'string') return null
    return s.encrypted ? this.cipher.decrypt(s.value) : s.value
  }

  /** Vuelve a montar la lista de lo que se tapa (todos los proyectos: un valor no se enseña en ningún sitio). */
  private refresh(data = this.read()): void {
    const masks: Mask[] = []
    for (const project of Object.values(data)) {
      for (const [name, s] of Object.entries(project ?? {})) {
        const value = this.open(s)
        if (!value || value.length < MIN_SECRET_VALUE) continue
        const forms = new Set([value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value)])
        for (const needle of forms) if (needle.length >= MIN_SECRET_VALUE) masks.push({ needle, name })
      }
    }
    masks.sort((a, b) => b.needle.length - a.needle.length)
    this.masks = masks
    this.loaded = true
  }

  /** Nombre, nota y fecha de los secretos de un proyecto. Nunca el valor. */
  list(projectId: string): ProjectSecretInfo[] {
    const project = this.read()[projectId] ?? {}
    return Object.entries(project)
      .map(([name, s]) => ({ name, ...(s.note ? { note: s.note } : {}), updatedAt: s.updatedAt ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Crea o cambia un secreto. Sin `value` (o vacío) al cambiar uno que ya existe, solo se cambia la nota o el nombre
   * (`previous`): así se puede renombrar sin volver a pegar la clave.
   */
  set(projectId: string, input: ProjectSecretInput): ProjectSecretInfo[] {
    const name = cleanSecretName(input.name)
    const previous = input.previous ? cleanSecretName(input.previous) : name
    const note = typeof input.note === 'string' ? input.note.replace(/\s+/g, ' ').trim().slice(0, MAX_SECRET_NOTE) : ''
    const raw = typeof input.value === 'string' ? input.value.replace(/\r\n/g, '\n') : ''
    // Lo pegado suele traer un salto de línea o espacios de más al final; dentro se respeta (un JSON de credenciales).
    const value = raw.includes('\n') && raw.trim().includes('\n') ? raw.replace(/^\s+|\s+$/g, '') : raw.trim()
    if (value.includes('\0')) throw new Error(tr('El valor no puede llevar caracteres nulos'))
    if (value.length > MAX_SECRET_VALUE) throw new Error(tr('El valor es demasiado largo (máximo 8 KB)'))
    if (value && value.length < MIN_SECRET_VALUE) throw new Error(tr('El valor es demasiado corto (mínimo {n} caracteres)', { n: MIN_SECRET_VALUE }))
    const data = this.read()
    const project = (data[projectId] ??= {})
    const old = project[previous]
    if (!value && !old) throw new Error(tr('Pega el valor del secreto'))
    if (name !== previous && project[name]) throw new Error(tr('Ya hay un secreto llamado {name}', { name }))
    if (!old && Object.keys(project).length >= MAX_SECRETS) throw new Error(tr('Máximo {n} secretos por proyecto', { n: MAX_SECRETS }))
    let stored: Stored
    if (value) {
      const encrypted = this.cipher.available()
      stored = { value: encrypted ? this.cipher.encrypt(value) : value, encrypted, updatedAt: Date.now() }
    } else {
      stored = { value: old!.value, encrypted: old!.encrypted, updatedAt: old!.updatedAt }
    }
    if (note) stored.note = note
    if (name !== previous) delete project[previous]
    project[name] = stored
    this.write(data)
    return this.list(projectId)
  }

  remove(projectId: string, rawName: unknown): ProjectSecretInfo[] {
    const name = cleanSecretName(rawName)
    const data = this.read()
    if (data[projectId]) {
      delete data[projectId][name]
      if (!Object.keys(data[projectId]).length) delete data[projectId]
      this.write(data)
    }
    return this.list(projectId)
  }

  /** Al eliminar un proyecto, sus secretos se van con él. */
  forgetProject(projectId: string): void {
    const data = this.read()
    if (!data[projectId]) return
    delete data[projectId]
    this.write(data)
  }

  /** Las variables de entorno que recibe una tarea del proyecto (solo las que se pueden descifrar). */
  env(projectId: string): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [name, s] of Object.entries(this.read()[projectId] ?? {})) {
      const value = this.open(s)
      if (value) out[name] = value
    }
    // Lo cifrado con un sistema anterior (el llavero del Mac) se vuelve a cifrar con el actual.
    this.reseal()
    return out
  }

  private reseal(): void {
    if (!this.cipher.outdated || !this.cipher.available()) return
    const data = this.read()
    let changed = false
    for (const project of Object.values(data)) {
      for (const s of Object.values(project)) {
        if (!s.encrypted || !this.cipher.outdated(s.value)) continue
        const plain = this.cipher.decrypt(s.value)
        if (plain === null) continue
        s.value = this.cipher.encrypt(plain)
        changed = true
      }
    }
    if (changed) {
      try {
        this.write(data)
      } catch {
        /* se reintenta la próxima vez */
      }
    }
  }

  /** Tapa en un texto cualquier valor guardado (de cualquier proyecto) con «[secreto NOMBRE]». */
  redact(text: string): string {
    if (!this.loaded) this.refresh()
    if (!text || !this.masks.length) return text
    let out = text
    for (const m of this.masks) if (out.includes(m.needle)) out = out.split(m.needle).join(`[secreto ${m.name}]`)
    return out
  }
}

/** Lo que se le dice al agente en cada encargo: qué variables tiene y cómo tratarlas. */
export function secretsPromptNote(names: string[]): string {
  if (!names.length) return ''
  return [
    '',
    '## Secretos del proyecto',
    `Tienes estas variables de entorno con claves y tokens que el usuario guardó en la pestaña «Secretos»: ${names.map((n) => `$${n}`).join(', ')}.`,
    'Úsalas por su nombre en las órdenes y en el código (por ejemplo `curl -H "Authorization: Bearer $NOMBRE"`, `process.env.NOMBRE`, `os.environ["NOMBRE"]`).',
    'Nunca escribas su valor: ni en la respuesta, ni en archivos del proyecto, ni en registros, ni con echo/print/env para comprobarlas. Si un archivo necesita la clave, que la lea del entorno al ejecutarse.',
    'Para escribir uno en un campo del navegador de kywai, pon {{secreto:NOMBRE}} en el texto de navegador_escribir: se cambia por el valor al escribir.',
    'Si te falta una clave, pide al usuario que la añada en la pestaña «Secretos» del proyecto; nunca que te la pegue en el chat.'
  ].join('\n')
}
