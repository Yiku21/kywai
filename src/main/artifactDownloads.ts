// Descargas de entregables: solo los archivos registrados en la conversación, nunca toda la carpeta del proyecto.
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Writable } from 'node:stream'
import { commonFolder, folderName } from '@shared/deliverables'
import { tr } from '@shared/i18n'
import * as store from './projects'
import { withinAny, writeZip } from './serverFiles'

export interface ArtifactDownload {
  name: string
  files: { path: string; name: string }[]
}

/** Valida la selección y las rutas antes de abrir el diálogo o empezar a enviar bytes. */
export function prepareArtifactDownload(projectId: unknown, ids: unknown): ArtifactDownload {
  if (!store.isValidProjectId(projectId) || !Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id))) {
    throw new Error(tr('Archivo no válido'))
  }
  const state = store.snapshotProject(projectId)
  const artifacts = state.artifacts
  const roots = [state.project.dir, state.project.workDir].filter((p): p is string => !!p && existsSync(p)).map((p) => realpathSync(p))
  const selected = [...new Set(ids as string[])].map((id) => {
    const artifact = artifacts.find((a) => a.id === id)
    if (!artifact) throw new Error(tr('No se encontró el archivo en el proyecto'))
    return artifact
  })
  const folder = commonFolder(selected.map((a) => a.relPath))
  const files = selected.map((artifact) => {
    const resolved = store.resolveProjectFile(projectId, artifact.relPath)
    if (!resolved) throw new Error(tr('No se encontró el archivo en el proyecto'))
    const path = realpathSync(resolved)
    if (!withinAny(path, roots) || !statSync(path).isFile()) throw new Error(tr('Archivo no válido'))
    const relative = artifact.relPath.replace(/\\/g, '/')
    const name = folder ? relative.slice(folder.length + 1) : relative
    if (!name || name.startsWith('/') || name.includes(':') || name.includes('\0') || name.split('/').some((p) => !p || p === '..' || p === '.')) throw new Error(tr('Archivo no válido'))
    return { path, name }
  })
  if (new Set(files.map((f) => f.name)).size !== files.length) throw new Error(tr('Archivo no válido'))
  if (new Set(files.map((f) => f.path)).size !== files.length) throw new Error(tr('Archivo no válido'))
  return { name: files.length === 1 ? basename(files[0].name) : `${folderName(folder)}.zip`, files }
}

/** Transmite el archivo original o un zip con la selección, sin cargar todos los archivos en memoria. */
export async function writeArtifactDownload(download: ArtifactDownload, out: Writable): Promise<void> {
  if (download.files.length === 1) await pipeline(createReadStream(download.files[0].path), out)
  else {
    const result = await writeZip('', out, { entries: download.files })
    if (result.files !== download.files.length) throw new Error(tr('No se encontró el archivo en el proyecto'))
  }
}
