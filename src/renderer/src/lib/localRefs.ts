// Los agentes escriben imágenes y enlaces con rutas del equipo donde trabajan (/Users/…/captura.png, C:\…, file://…, o
// relativas al proyecto). La app de escritorio del servidor las lee del disco; un cliente o un navegador no tienen
// ese disco, así que las pide al servidor por su API de archivos.

export type LocalRef = { kind: 'fs'; path: string } | { kind: 'project'; projectId: string; rel: string }

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:)?\/\/|^(?:https?|data|blob|mailto|tel):|^#/i

/** Qué archivo de qué equipo señala una referencia, o null si no es un archivo local (web, ancla, data:…). */
export function resolveLocalRef(ref: string, projectId?: string | null): LocalRef | null {
  const text = (ref ?? '').trim()
  if (!text || (EXTERNAL.test(text) && !/^(?:file|cowork):\/\//i.test(text))) return null

  const fileUrl = /^file:\/\/(?:localhost)?(\/.*)$/i.exec(text)
  if (fileUrl) {
    let path = fileUrl[1]
    try {
      path = decodeURIComponent(path)
    } catch {
      /* se deja como viene */
    }
    // file:///C:/Users/x → C:/Users/x
    return { kind: 'fs', path: /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path }
  }

  const project = /^cowork:\/\/file\/([a-z0-9][a-z0-9-]*)\/(.+)$/i.exec(text)
  if (project) {
    try {
      return { kind: 'project', projectId: project[1], rel: decodeURIComponent(project[2]) }
    } catch {
      return { kind: 'project', projectId: project[1], rel: project[2] }
    }
  }

  if (/^[A-Za-z]:[\\/]/.test(text) || (text.startsWith('/') && !text.startsWith('//'))) {
    let path = text
    try {
      path = decodeURIComponent(text)
    } catch {
      /* se deja como viene */
    }
    return { kind: 'fs', path }
  }

  // Relativa: es del proyecto abierto.
  if (projectId && !/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    let rel = text.replace(/^\.\//, '')
    try {
      rel = decodeURIComponent(rel)
    } catch {
      /* se deja como viene */
    }
    return rel && !rel.startsWith('..') ? { kind: 'project', projectId, rel: rel.replace(/\\/g, '/') } : null
  }
  return null
}

/** La dirección, en el servidor, de un archivo local (para <img> y enlaces desde la interfaz web). */
export function serverUrlFor(ref: LocalRef): string {
  if (ref.kind === 'fs') return `/api/fs/read?path=${encodeURIComponent(ref.path)}`
  const rel = ref.rel
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/')
  return `/api/file/${encodeURIComponent(ref.projectId)}/${rel}`
}

/**
 * La dirección de un archivo del proyecto para un <img>: en la app de escritorio del servidor, su protocolo
 * (cowork://file/…); en un cliente o un navegador, la API de archivos del servidor.
 */
export function projectFileUrl(projectId: string, rel: string, web: boolean): string {
  if (web) return serverUrlFor({ kind: 'project', projectId, rel })
  const path = rel
    .split('/')
    .filter(Boolean)
    .map((p) => encodeURIComponent(p))
    .join('/')
  return `cowork://file/${encodeURIComponent(projectId)}/${path}`
}
