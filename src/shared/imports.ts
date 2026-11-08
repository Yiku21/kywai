// Importar conversaciones de otras apps (⚙ → «Importar de otras apps…»): las sesiones que ya hay en este equipo de
// Claude Code y Codex, y las exportaciones de ChatGPT y Claude.ai. Lo hace el motor (src/main/importChats.ts); estos
// son los tipos que comparten el motor y la interfaz.

/** De dónde viene lo importado. */
export type ImportKind = 'claude-code' | 'codex' | 'chatgpt' | 'claude-ai'

/** Nombre que se enseña de cada origen (es una marca: no se traduce). */
export const IMPORT_LABEL: Record<ImportKind, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  chatgpt: 'ChatGPT',
  'claude-ai': 'Claude.ai'
}

/** Una sesión encontrada en este equipo. */
export interface ImportSession {
  /** Id para importarla («claude-code:<sessionId>» o «codex:<threadId>»). */
  id: string
  title: string
  /** Última actividad. */
  updatedAt: number
  /** Ya se importó antes (volver a importarla no la duplica). */
  imported: boolean
}

/** Una carpeta en la que se trabajó con esa app: pasa a ser un proyecto de kywai con esa carpeta. */
export interface ImportFolder {
  cwd: string
  /** Nombre de la carpeta (el del proyecto). */
  name: string
  /** La carpeta sigue existiendo: si no, las conversaciones se importan solo para leerlas. */
  exists: boolean
  /** Proyecto de kywai que ya trabaja en esa carpeta (las conversaciones irán a él). */
  projectId?: string
  projectName?: string
  sessions: ImportSession[]
}

export interface ImportSource {
  kind: ImportKind
  label: string
  /** Dónde se buscó (para decirlo si no hay nada). */
  where: string
  folders: ImportFolder[]
}

export interface ImportScan {
  sources: ImportSource[]
}

export interface ImportResult {
  /** De dónde venía (en un archivo, lo que se detectó). */
  kind: ImportKind
  conversations: number
  /** Ya estaban importadas y no se duplicaron. */
  skipped: number
  /** Proyectos de kywai creados. */
  projectsCreated: number
  /** Proyectos (nuevos o que ya había) donde quedaron. */
  projectIds: string[]
  /** Documentos de proyectos de Claude.ai guardados. */
  documents: number
  /** Conversaciones que se pueden seguir con la sesión real del programa (Claude Code, Codex). */
  resumable: number
}
