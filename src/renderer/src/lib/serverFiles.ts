// Explorador de los archivos del servidor (cliente de escritorio o navegador). Quien lo pide (el menú ⚙, o elegir la
// carpeta de trabajo de un proyecto) no pinta nada: deja una petición aquí y el panel que está montado en la app la
// atiende. Así la API de la interfaz, que no es de React, también puede pedir una carpeta y esperar la respuesta.

export type FilesRequest = { mode: 'browse' } | { mode: 'pick'; resolve: (dir: string | null) => void }

let request: FilesRequest | null = null
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

export function subscribeFilesRequest(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function currentFilesRequest(): FilesRequest | null {
  return request
}

/** Abre el explorador para mirar y bajar archivos del servidor. */
export function openServerFiles(): void {
  request = { mode: 'browse' }
  emit()
}

/** Abre el explorador para elegir una carpeta del servidor; devuelve su ruta o null si se cierra sin elegir. */
export function requestServerFolder(): Promise<string | null> {
  return new Promise((resolve) => {
    // Una petición anterior que siga abierta se da por cancelada.
    if (request?.mode === 'pick') request.resolve(null)
    request = { mode: 'pick', resolve }
    emit()
  })
}

export function closeFilesRequest(picked?: string | null): void {
  const r = request
  request = null
  if (r?.mode === 'pick') r.resolve(picked ?? null)
  emit()
}

/** Las migas de pan de una ruta (con el separador del servidor, que puede ser distinto del de este equipo). */
export function crumbs(path: string, sep: string): { name: string; path: string }[] {
  const parts = path.split(sep).filter(Boolean)
  const out: { name: string; path: string }[] = []
  if (sep === '/') out.push({ name: '/', path: '/' })
  let acc = ''
  parts.forEach((p, i) => {
    acc = i === 0 ? (sep === '/' ? `/${p}` : `${p}${sep}`) : `${acc}${acc.endsWith(sep) ? '' : sep}${p}`
    out.push({ name: p, path: acc })
  })
  return out
}

export function childPath(dir: string, name: string, sep: string): string {
  return `${dir}${dir.endsWith(sep) ? '' : sep}${name}`
}
