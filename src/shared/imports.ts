// Importar conversaciones de otras apps (⚙ → «Importar de otras apps…»): las sesiones que ya hay en este equipo de
// Claude Code y Codex, y las exportaciones de ChatGPT y Claude.ai. Lo hace el motor (src/main/importChats.ts); estos
// son los tipos que comparten el motor y la interfaz.

/** De dónde viene lo importado. */
export type ImportKind = 'claude-code' | 'codex' | 'hermes' | 'chatgpt' | 'claude-ai'

/** Nombre que se enseña de cada origen (es una marca: no se traduce). */
export const IMPORT_LABEL: Record<ImportKind, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
  chatgpt: 'ChatGPT',
  'claude-ai': 'Claude.ai'
}

/** Una sesión encontrada en este equipo. */
export interface ImportSession {
  /** Id para importarla («claude-code:<sessionId>», «codex:<threadId>» o «hermes:<sesión>»). */
  id: string
  title: string
  /** Última actividad. */
  updatedAt: number
  /** Ya se importó antes (volver a importarla no la duplica). */
  imported: boolean
}

/** Una carpeta en la que se trabajó con esa app: pasa a ser un proyecto de kywai con esa carpeta. */
export interface ImportFolder {
  /** Carpeta de trabajo ('' = sin carpeta: conversaciones de Hermes por Telegram, Discord…, van a un proyecto «Hermes»). */
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
  /** Ya importadas antes que se volvieron a escribir limpias y se pusieron en su proyecto (reimportar). */
  reordered?: number
  /** Proyectos que la importación había creado y se quedaron vacíos: el motor los quita después. */
  emptyProjectIds?: string[]
  /** Proyectos cuyo chat abierto era una conversación reimportada: la ventana tiene que recargarlo. */
  clearedProjectIds?: string[]
}

/** Por qué una conversación de Claude.ai va a ese proyecto (la exportación no lo dice: se deduce). */
export type ProjectReason = 'export' | 'name' | 'docs'

/** Una conversación de la exportación, antes de importarla, con el proyecto donde irá. */
export interface ArchiveConversation {
  /** Id en la app de origen. */
  id: string
  title: string
  updatedAt: number
  /** Proyecto de la exportación (uuid) o '' = suelta (va al proyecto «Claude.ai»). */
  project: string
  reason?: ProjectReason
  /** Ya se importó antes: al importar se vuelve a escribir limpia y se pone en su proyecto, sin duplicarla. */
  imported: boolean
}

/** Lo que trae una exportación, para revisarlo antes de importar. */
export interface ArchivePreview {
  kind: ImportKind
  /** Proyectos de la exportación (Claude.ai), sin el de ejemplo. */
  projects: { uuid: string; name: string }[]
  conversations: ArchiveConversation[]
}

/** La configuración de Hermes / Hermes Desktop que se puede traer a kywai (ver src/main/hermesSetup.ts). */
export interface HermesSetupScan {
  /** Hay instalación de Hermes en ese equipo. */
  found: boolean
  where: string
  /** Sus skills; `own` = no venían con Hermes (las que hizo o instaló el usuario). */
  skills: { name: string; description: string; own: boolean; imported: boolean }[]
  /** Lo que Hermes sabe del usuario: memories/MEMORY.md, USER.md y SOUL.md (solo los que tienen algo). */
  memory: { name: string; chars: number }[]
  /** Ya se trajo su memoria (está la habilidad «lo-que-sabe-hermes»). */
  memoryImported: boolean
  /** Sus servidores MCP (los apagados en Hermes no salen). `secrets` = variables y cabeceras que llevan. */
  mcp: { id: string; transport: 'stdio' | 'http'; summary: string; secrets: number; imported: boolean }[]
}

export interface HermesSetupChoice {
  skills: string[]
  memory: boolean
  mcp: string[]
}

export interface HermesSetupResult {
  skills: string[]
  memory: boolean
  mcp: string[]
  /** Lo que no se trajo y por qué. */
  skipped: string[]
}
