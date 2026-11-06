// Avisos de privacidad de macOS (TCC). Cuando un agente entra por primera vez en Documentos, Escritorio, Descargas…
// macOS enseña una ventana en la pantalla del Mac y el programa se queda parado hasta que alguien la conteste: nadie
// puede pulsar «Permitir» por programa (lo impide macOS). Este módulo hace dos cosas para que no se pierdan tareas:
//  - antes de lanzar un agente, prueba a abrir su carpeta con un límite corto y, si macOS la retiene, avisa al momento
//    y espera la respuesta en vez de dejar al agente colgado (waitForFolderAccess);
//  - lee en directo el registro de privacidad de macOS y avisa de cada ventana que AI Cowork tiene pendiente
//    (onMacPermissionPrompt), para mandarla al móvil.
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { sep } from 'node:path'
import { tr } from '@shared/i18n'

export const APP_BUNDLE_ID = 'com.aicowork.app'

/** Lo que tarda como mucho en abrirse una carpeta sin ventana de permisos; pasado esto, macOS está preguntando. */
export const PROBE_WAIT_MS = 4000

const LABELS: Record<string, string> = {
  kTCCServiceSystemPolicyDocumentsFolder: 'Documentos',
  kTCCServiceSystemPolicyDesktopFolder: 'Escritorio',
  kTCCServiceSystemPolicyDownloadsFolder: 'Descargas',
  kTCCServiceSystemPolicyRemovableVolumes: tr('discos externos'),
  kTCCServiceSystemPolicyNetworkVolumes: tr('discos de red'),
  kTCCServiceSystemPolicyAllFiles: tr('acceso total al disco'),
  kTCCServiceAppleEvents: tr('controlar otras apps'),
  kTCCServiceScreenCapture: tr('grabación de pantalla'),
  kTCCServiceMicrophone: 'micrófono',
  kTCCServiceCamera: 'cámara',
  kTCCServiceAccessibility: 'accesibilidad',
  kTCCServicePhotos: 'Fotos',
  kTCCServiceAddressBook: 'Contactos',
  kTCCServiceCalendar: 'Calendario',
  kTCCServiceReminders: 'Recordatorios'
}

export function serviceLabel(service: string): string {
  return LABELS[service] ?? service.replace(/^kTCCService(SystemPolicy)?/, '')
}

export interface MacPermissionPrompt {
  /** Identificador de TCC, p. ej. kTCCServiceSystemPolicyDocumentsFolder. */
  service: string
  /** En español: «Documentos». */
  serviceLabel: string
  detail?: string
}

/** Servicio de TCC que protege una carpeta (las que macOS pregunta una a una), o null si no pregunta por ella. */
export function folderService(dir: string, home = homedir()): string | null {
  const inside = (root: string): boolean => dir === root || dir.startsWith(root + sep)
  if (inside(`${home}${sep}Documents`)) return 'kTCCServiceSystemPolicyDocumentsFolder'
  if (inside(`${home}${sep}Desktop`)) return 'kTCCServiceSystemPolicyDesktopFolder'
  if (inside(`${home}${sep}Downloads`)) return 'kTCCServiceSystemPolicyDownloadsFolder'
  if (inside(`${sep}Volumes`)) return 'kTCCServiceSystemPolicyRemovableVolumes'
  return null
}

/**
 * Una línea de `log stream --style ndjson` de tccd. Devuelve el aviso si es una ventana que macOS enseña ahora mismo
 * por culpa de esta app (también cuando la pide uno de sus agentes: macOS se la atribuye a la app que los lanzó).
 */
export function parsePromptLine(line: string, bundleId = APP_BUNDLE_ID): MacPermissionPrompt | null {
  if (!line.includes('AUTHREQ_PROMPTING')) return null
  let msg = line
  try {
    const obj = JSON.parse(line) as { eventMessage?: unknown }
    if (typeof obj.eventMessage === 'string') msg = obj.eventMessage
  } catch {
    /* texto plano */
  }
  if (!msg.includes('AUTHREQ_PROMPTING') || !msg.includes(`identifier=${bundleId},`)) return null
  const service = /service=(kTCCService\w+)/.exec(msg)?.[1]
  if (!service) return null
  return { service, serviceLabel: serviceLabel(service), detail: tr('macOS pide permiso para {serviceLabel} en la pantalla del Mac', { serviceLabel: serviceLabel(service) }) }
}

// ---------- avisos en directo ----------

type Listener = (p: MacPermissionPrompt) => void
const listeners = new Set<Listener>()

/** Cada ventana de permisos que AI Cowork (o uno de sus agentes) tiene pendiente en la pantalla del Mac. */
export function onMacPermissionPrompt(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function emitPrompt(p: MacPermissionPrompt): void {
  for (const cb of listeners) {
    try {
      cb(p)
    } catch (e) {
      console.error('[cowork] aviso de permisos', e)
    }
  }
}

let watcher: ReturnType<typeof spawn> | null = null
let stopped = false

/** Empieza a leer el registro de privacidad de macOS (solo en Mac). Se rearranca solo si `log` se cierra. */
export function startMacPermissionWatch(): void {
  if (process.platform !== 'darwin' || watcher) return
  stopped = false
  const child = spawn(
    '/usr/bin/log',
    ['stream', '--style', 'ndjson', '--predicate', 'subsystem == "com.apple.TCC" AND eventMessage BEGINSWITH "AUTHREQ_PROMPTING"'],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )
  watcher = child
  let buf = ''
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    buf += chunk
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const p = parsePromptLine(buf.slice(0, nl))
      buf = buf.slice(nl + 1)
      if (p) {
        console.warn(`[cowork] macOS pide permiso: ${p.service}`)
        emitPrompt(p)
      }
    }
    if (buf.length > 64 * 1024) buf = ''
  })
  const restart = (): void => {
    if (watcher !== child) return
    watcher = null
    if (!stopped) setTimeout(startMacPermissionWatch, 30_000).unref()
  }
  child.on('error', restart)
  child.on('close', restart)
}

export function stopMacPermissionWatch(): void {
  stopped = true
  const w = watcher
  watcher = null
  w?.kill()
}

// ---------- comprobar la carpeta antes de lanzar un agente ----------

export interface FolderAccessHooks {
  signal: AbortSignal
  /** Se llama una vez si macOS está preguntando (el texto va a la tarea). */
  onWaiting?: (text: string) => void
}

/**
 * Abre la carpeta desde un proceso hijo (macOS la atribuye a la app, igual que a los agentes). Si tarda más de
 * PROBE_WAIT_MS es que hay una ventana de permisos en pantalla: se avisa y se espera a que la contesten, sin límite
 * (se puede detener la tarea). Devuelve un mensaje si macOS la deniega o se cancela; null si se puede trabajar.
 * Fuera de macOS no hace nada.
 */
export function waitForFolderAccess(dir: string, hooks: FolderAccessHooks, waitMs = PROBE_WAIT_MS): Promise<string | null> {
  if (process.platform !== 'darwin' || hooks.signal.aborted) return Promise.resolve(null)
  return new Promise((resolve) => {
    let stderr = ''
    let done = false
    const child = spawn('/bin/ls', ['-1', dir], { stdio: ['ignore', 'ignore', 'pipe'] })
    const label = serviceLabel(folderService(dir) ?? 'kTCCServiceSystemPolicyAllFiles')
    const timer = setTimeout(() => {
      const service = folderService(dir) ?? 'kTCCServiceSystemPolicyAllFiles'
      hooks.onWaiting?.(tr('Esperando a que aceptes en la pantalla del Mac el permiso de macOS para {label}', { label }))
      emitPrompt({ service, serviceLabel: serviceLabel(service), detail: tr('Un agente espera para entrar en {dir}', { dir }) })
    }, waitMs)
    const end = (msg: string | null): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      hooks.signal.removeEventListener('abort', onAbort)
      resolve(msg)
    }
    const onAbort = (): void => {
      child.kill('SIGKILL')
      end('Cancelada')
    }
    hooks.signal.addEventListener('abort', onAbort, { once: true })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (c: string) => {
      stderr = (stderr + c).slice(-1000)
    })
    child.on('error', () => end(null))
    child.on('close', (code) => {
      // Una carpeta que no existe no es cosa de permisos: lo dirá el propio agente.
      if (code !== 0 && /not permitted/i.test(stderr)) {
        end(
          tr('macOS no deja a AI Cowork entrar en {label}: actívalo en Ajustes del Sistema → Privacidad y seguridad → Acceso total al disco → AI Cowork', { label })
        )
      } else end(null)
    })
  })
}
