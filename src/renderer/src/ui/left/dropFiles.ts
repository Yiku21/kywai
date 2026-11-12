import type { CoworkApi } from '@shared/types'
import { errorText } from '../common/util'

/**
 * Rutas para adjuntar los archivos soltados en el chat.
 * En el escritorio cada archivo ya tiene su ruta en este equipo. En el navegador, en el cliente
 * de escritorio (que abre la interfaz del servidor) o con algo arrastrado desde otra app sin ruta,
 * el archivo se sube y se adjunta su copia, igual que al pegarlo con Ctrl+V.
 */
export async function droppedPaths(
  a: Pick<CoworkApi, 'pathForFile' | 'savePastedFile'>,
  files: File[]
): Promise<{ paths: string[]; error: string | null }> {
  const paths: string[] = []
  let error: string | null = null
  for (const f of files) {
    let p = ''
    try {
      // Solo vale un texto: por la red, esta llamada devolvía una promesa y dejaba la ventana en negro.
      const r: unknown = a.pathForFile(f)
      if (typeof r === 'string') p = r
    } catch {
      /* sin ruta en este equipo: se sube */
    }
    if (!p) {
      try {
        p = await a.savePastedFile(f.name || 'archivo', new Uint8Array(await f.arrayBuffer()))
      } catch (e) {
        error = errorText(e)
        continue
      }
    }
    if (p) paths.push(p)
  }
  return { paths, error }
}
