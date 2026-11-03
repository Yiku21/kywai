import type { ClientUpdateState, CoworkApi, CoworkEvent, ProjectSummary } from '@shared/types'
import type { SyncPairStatus } from '@shared/sync'
import { requestServerFolder } from './serverFiles'

const w = window as unknown as {
  cowork?: CoworkApi
  __COWORK_WEB__?: boolean
  __COWORK_BOOT__?: string
  /** Puente del cliente de escritorio de AI Cowork (la interfaz del servidor dentro de la app instalada). */
  coworkClient?: {
    openFile?: (projectId: string, relPath: string) => Promise<void>
    info?: () => Promise<{ client: true; server: string; device: string; version: string } | null>
    syncList?: () => Promise<SyncPairStatus[]>
    syncAdd?: (remoteDir: string) => Promise<SyncPairStatus | null>
    syncRemove?: (id: string) => Promise<void>
    syncToggle?: (id: string, enabled: boolean) => Promise<void>
    syncNow?: (id: string) => Promise<void>
    syncConfirm?: (id: string) => Promise<void>
    /** Abre con la aplicación de este equipo un archivo cualquiera del servidor (lo descarga antes). */
    openRemotePath?: (path: string) => Promise<void>
    /** Baja una carpeta del servidor como zip, donde se elija en este equipo. */
    saveRemoteFolder?: (path: string) => Promise<string | null>
    update?: () => Promise<ClientUpdateState | null>
    installUpdate?: () => Promise<void>
    reload?: () => Promise<void>
    switchServer?: () => Promise<void>
    forget?: () => Promise<void>
  }
}

/** La interfaz se abrió desde otro dispositivo (navegador) a través del acceso web del Mac. */
export const isWeb = !w.cowork && w.__COWORK_WEB__ === true

/** La interfaz está dentro del cliente de escritorio de AI Cowork (la app instalada que se conecta con un servidor). */
export const isClient = isWeb && !!w.coworkClient

/** El puente del cliente de escritorio (null en el navegador y en la app del servidor). */
export function clientBridge(): NonNullable<(typeof w)['coworkClient']> | null {
  return isClient ? (w.coworkClient ?? null) : null
}

/** Acciones del cliente de escritorio (recargar, cambiar de servidor, olvidar este dispositivo); null fuera del cliente. */
export interface ClientActions {
  reload: () => Promise<void>
  switchServer: () => Promise<void>
  forget: () => Promise<void>
  /** Busca una versión nueva del cliente en el servidor (null si esta app no lo sabe: es una versión anterior). */
  checkUpdate: (() => Promise<ClientUpdateState | null>) | null
  installUpdate: (() => Promise<void>) | null
}

export function clientActions(): ClientActions | null {
  const c = w.coworkClient
  if (!isClient || !c?.reload || !c.switchServer || !c.forget) return null
  return { reload: c.reload, switchServer: c.switchServer, forget: c.forget, checkUpdate: c.update ?? null, installUpdate: c.installUpdate ?? null }
}

/** Datos del cliente de escritorio: nombre del servidor y de este equipo (null fuera del cliente). */
export function clientInfo(): Promise<{ server: string; device: string; version?: string } | null> {
  return (
    w.coworkClient?.info?.().then((i) => (i ? { server: i.server, device: i.device, ...(i.version ? { version: i.version } : {}) } : null), () => null) ??
    Promise.resolve(null)
  )
}

/** Arranque de la app que sirvió esta página (acceso web). Si cambia, la app se reinició. */
const pageBoot = w.__COWORK_BOOT__ ?? ''

/** La app que responde ahora es otro arranque distinto del de esta página: hay que recargarla. */
export function isNewBoot(boot: string | null | undefined): boolean {
  return !!boot && !!pageBoot && boot !== pageBoot
}

/** Arranque actual de la app (acceso web), o null si no responde. */
export async function serverBoot(timeoutMs = 4000): Promise<string | null> {
  try {
    // Con límite: una conexión con la app que se está cerrando puede quedarse colgada.
    const res = await fetch('/api/ping', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    if (res.status === 401) {
      location.reload()
      return null
    }
    if (!res.ok) return null
    return ((await res.json()) as { boot?: string }).boot ?? null
  } catch {
    return null
  }
}

/** Dirección de un archivo del proyecto servido por el acceso web. */
function webFileUrl(projectId: string, relPath: string): string {
  const rel = relPath
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/')
  return `/api/file/${encodeURIComponent(projectId)}/${rel}`
}

async function call(method: string, args: unknown[]): Promise<unknown> {
  const res = await fetch(`/api/call/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ args })
  })
  if (res.status === 401) {
    // El código de acceso cambió o caducó la cookie: vuelve a la pantalla de acceso.
    location.reload()
    throw new Error('Sin acceso')
  }
  const data = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string }
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
  return data.result
}

/** Sube un archivo al Mac y devuelve su ruta allí (para adjuntarlo como si se hubiera elegido en el Mac). */
async function upload(name: string, body: Blob): Promise<string> {
  const res = await fetch(`/api/upload?name=${encodeURIComponent(name)}`, { method: 'POST', credentials: 'same-origin', body })
  const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string }
  if (!res.ok || !data.path) throw new Error(data.error ?? 'No se pudo subir el archivo')
  return data.path
}

function pickLocalFiles(kind: 'any' | 'image'): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    if (kind === 'image') input.accept = 'image/*'
    input.onchange = () => resolve([...(input.files ?? [])])
    input.oncancel = () => resolve([])
    input.click()
  })
}

/** Misma API que la app de escritorio, por HTTP: llamadas con fetch y eventos con EventSource. */
function createWebApi(): CoworkApi {
  const special: Partial<Record<keyof CoworkApi, unknown>> = {
    onEvent: (cb: (e: CoworkEvent) => void) => {
      const es = new EventSource('/api/events')
      // Al reconectar después de un reinicio de la app (desde aquí, desde el Mac o por una actualización),
      // la página se recarga para no seguir con datos de la sesión anterior.
      es.addEventListener('hello', (m) => {
        try {
          if (isNewBoot((JSON.parse((m as MessageEvent).data as string) as { boot?: string }).boot)) location.reload()
        } catch {
          // Mensaje no válido: se ignora.
        }
      })
      es.onmessage = (m) => {
        try {
          cb(JSON.parse(m.data as string) as CoworkEvent)
        } catch {
          // Mensaje no válido: se ignora.
        }
      }
      return () => es.close()
    },
    pickFiles: async (kind: 'any' | 'image') => {
      const files = await pickLocalFiles(kind)
      return Promise.all(files.map((f) => upload(f.name, f)))
    },
    savePastedFile: (name: string, data: Uint8Array) => upload(name, new Blob([data as BlobPart])),
    readArtifact: async (projectId: string, relPath: string) => {
      const r = (await call('readArtifact', [projectId, relPath])) as { text?: string; url?: string }
      return r.url ? { ...r, url: webFileUrl(projectId, relPath) } : r
    },
    openPath: async (projectId: string, relPath?: string) => {
      if (!relPath) throw new Error('La carpeta del proyecto se abre desde el Mac')
      // En el cliente de escritorio se abre con la aplicación de este equipo; en el navegador, en otra pestaña.
      if (w.coworkClient?.openFile) return w.coworkClient.openFile(projectId, relPath)
      window.open(webFileUrl(projectId, relPath), '_blank', 'noopener')
    },
    openExternal: async (url: string) => {
      window.open(url, '_blank', 'noopener')
    },
    // En el navegador el permiso lo pide el propio navegador al grabar.
    requestMicrophone: async () => true,
    // La carpeta se elige en el explorador de los archivos del servidor (no hay un diálogo del sistema que sirva).
    pickProjectFolder: async (projectId: string) => {
      const dir = await requestServerFolder()
      return dir ? ((await call('setProjectFolder', [projectId, dir])) as ProjectSummary) : null
    }
  }
  return new Proxy({} as CoworkApi, {
    get: (_t, key: string) => special[key as keyof CoworkApi] ?? ((...args: unknown[]) => call(key, args))
  })
}

/** API del motor: la de Electron, la del acceso web o null (navegador sin motor: solo demo). */
export const api: CoworkApi | null = w.cowork ?? (isWeb ? createWebApi() : null)
