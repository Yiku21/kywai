import type { Lang } from './i18n'
// Contrato compartido entre el motor de agentes (proceso main) y la interfaz (renderer).
// Todo lo que cruza IPC está definido aquí.

export type AgentId = string
export type ProviderKind = 'claude' | 'codex' | 'gemini' | 'qwen' | 'ollama' | 'lmstudio' | 'hermes' | 'muse' | 'cli'

/**
 * Cómo se lanza un agente «de catálogo» (cualquier programa de terminal que atienda un encargo y devuelva texto):
 * AI Cowork lo ejecuta en la carpeta del proyecto con la sesión que el usuario ya tiene iniciada en él.
 */
export interface CliAgentSpec {
  /** Id del catálogo del que viene (vacío: un agente a medida). */
  presetId?: string
  /** Programa (en el PATH). */
  command: string
  /** Argumentos para comprobar que está instalado y su versión. */
  versionArgs: string[]
  /**
   * stdin: el encargo entra por la entrada estándar. file: va en un archivo que se pasa con {promptFile}.
   * arg: el programa lo recibe como argumento; para no meter texto del usuario en la línea de órdenes se le pide
   * que lea el archivo del encargo ({prompt} es esa instrucción corta).
   */
  promptVia: 'stdin' | 'file' | 'arg'
  /** Argumentos de una consulta no interactiva ({prompt}, {promptFile} y {model} se sustituyen). */
  args: string[]
  /** Se añaden al trabajar (por ejemplo, para que pueda editar archivos; sin ellos algunos programas solo leen). */
  workArgs?: string[]
  /** Con «Acceso completo» al trabajar sustituyen a workArgs (aprobar todo sin preguntar). */
  fullAccessArgs?: string[]
  /** Se añaden al planificar (solo lectura). */
  planArgs?: string[]
  /** Se añaden si hay modelo elegido ({model}). */
  modelArgs?: string[]
  /** Variables de entorno extra. */
  env?: Record<string, string>
  /** Expresiones (texto de una RegExp, sin distinguir mayúsculas) de sus errores de sesión y de límite de uso. */
  authPattern?: string
  quotaPattern?: string
  /** Puede abrir las capturas adjuntas. */
  seesImages?: boolean
  /** Orden que abre su inicio de sesión (en una terminal). */
  login?: string
  /** Orden no interactiva que termina bien (código 0) si ya hay sesión iniciada. */
  authCheck?: string
  /**
   * Funciona con una clave de API: la variable de entorno donde la lee el programa y dónde se consigue. AI Cowork
   * guarda la clave en este equipo (cifrada) y se la pasa solo a este agente al lanzarlo.
   */
  apiKey?: { env: string; label: string; url: string }
  /** Cómo se instala en cada sistema, y qué hace falta antes. */
  install?: { windows?: string; mac?: string; linux?: string; needs?: 'node' | 'python' }
  /** Su página, para saber más o instalarlo a mano. */
  url?: string
}

/**
 * Permisos de los agentes al trabajar. 'full': ejecutan comandos, instalan dependencias y usan internet
 * sin pedir permiso. 'project': solo editan la carpeta del proyecto y se deniegan los comandos que pedirían aprobación.
 */
export type AgentAccess = 'full' | 'project'

/** Motores de ejecución local. */
export type LocalEngine = 'ollama' | 'lmstudio'

/** Apariencia del robot. Si falta, se elige según el proveedor (sub-agentes: "becario"). */
export interface RobotAvatar {
  body: 'capsule' | 'egg' | 'blob' | 'cube' | 'dome' | 'bulb'
  accessory: 'ears' | 'antenna' | 'tuft' | 'vents' | 'hair' | 'halo' | 'none'
  eyes: 'round' | 'pill' | 'arc' | 'chevron' | 'dots' | 'wave'
  logo: 'gemini' | 'qwen' | 'claude' | 'openai' | 'becario' | 'local' | 'hermes' | 'muse' | 'none'
  /** Color de ojos y logo. */
  eyeColor: string
  /** Color secundario (orejas, antena, pelo). */
  accentColor?: string
  /** Remates metálicos: marco del visor, aro de la base y botones. */
  trimColor?: string
}

/** Agente configurable: nombre, modelo, color y estación salen de la configuración. */
export interface AgentConfig {
  id: AgentId
  name: string
  provider: ProviderKind
  /** Modelo que se pasa al CLI ('' = el predeterminado del CLI). */
  model: string
  /** Texto corto que se muestra (p. ej. "Sonnet", "3.6 Flash"). */
  modelLabel: string
  /** Modelo ligero para sub-agentes ("becarios"). Sin él, el agente no crea sub-agentes. */
  lightModel?: string
  lightModelLabel?: string
  /** Modelo para tareas difíciles (si falta, se usa el habitual). */
  strongModel?: string
  strongModelLabel?: string
  /** Color de acento en hex (#rrggbb). */
  color: string
  avatar?: RobotAvatar
  /** Estación donde vive el robot. */
  stationId: string
  role: string
  /** Lo que se le da mejor (frases concretas: el coordinador las lee al repartir). */
  strengths: string[]
  /** Lo que conviene no darle (más lento, peor resultado o gasta una cuota que conviene guardar). */
  avoid?: string[]
  enabled: boolean
  /** Grupo de cuota (varios agentes pueden compartir una). */
  quotaGroupId?: string
  /** Solo coordina (planifica y reparte): nunca recibe tareas. */
  plannerOnly?: boolean
  /** Proveedor del modelo elegido con «/model» (solo Hermes: se le pasa con --provider). */
  modelProvider?: string
  /** Cómo se lanza (solo en los agentes de catálogo, con proveedor 'cli'). */
  cli?: CliAgentSpec
  /**
   * Solo el agente de LM Studio: razonamiento («think») del modelo. Sin indicar o false, apagado (responde antes);
   * se enciende desde su tarjeta para lo que necesite pensar más.
   */
  thinking?: boolean
  /** Solo en sub-agentes creados en tiempo de ejecución. */
  isSubagent?: boolean
  parentId?: AgentId
}

/** Estación en el espacio digital. Posición en el plano del suelo (x, z) en unidades de mundo. */
export interface StationConfig {
  id: string
  label: string
  position: [number, number]
  /** Estación reservada para sub-agentes. */
  forSubagents?: boolean
}

/** Estado real del agente según el motor. Los estados visuales transitorios (enviar, recibir,
 *  celebrar, desplazarse) los deriva la escena a partir de los eventos. */
export type AgentActivity = 'idle' | 'thinking' | 'working' | 'waiting' | 'error' | 'offline'

export interface AgentRuntime {
  agentId: AgentId
  activity: AgentActivity
  taskId?: string
  /** Agente al que espera (estado waiting). */
  waitingFor?: AgentId
  /** Última actividad legible ("Leyendo brief.pdf"). */
  lastActivity?: string
  lastActivityAt?: number
  /** Motivo breve de error u offline. */
  reason?: string
  /** Dónde está el robot: su estación o el núcleo compartido. */
  location: 'station' | 'core'
  /** Tokens de contexto usados en la tarea actual y capacidad, si el CLI lo informa. */
  context?: { used: number; capacity?: number }
}

export type TaskStatus = 'pending' | 'blocked' | 'running' | 'done' | 'failed' | 'cancelled'
export type Difficulty = 'easy' | 'medium' | 'hard'
/** Esfuerzo de razonamiento que admiten Claude Code (--effort) y Codex (model_reasoning_effort). */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh'

export interface Task {
  id: string
  projectId: string
  runId: string
  title: string
  description: string
  agentId: AgentId
  /** Agente al que se asignó originalmente (si se reasignó o se delegó a un sub-agente). */
  assignedBy?: AgentId
  dependsOn: string[]
  status: TaskStatus
  difficulty: Difficulty
  model?: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
  /** 0..1 SOLO si existe una medida real. null/undefined = indicador de actividad. */
  progress?: number | null
  lastActivity?: string
  result?: string
  artifactIds: string[]
  error?: string
  usage?: TokenUsage
  /** Cuándo está hecha: algo que el agente comprueba antes de terminar («npm test pasa»…). */
  acceptance?: string
  /** Archivos o carpetas que esta tarea puede crear o modificar (vacío = sin límite declarado). */
  files?: string[]
  /** Archivos de otras tareas que modificó (se avisa en el chat). */
  outOfScope?: string[]
  /** Entrega un archivo o basta con la respuesta (para poder reanudarla). */
  deliverable?: 'file' | 'text'
  /** Comprobación del resultado por un agente de otra familia, con contexto fresco (ver verifyTask). */
  verification?: TaskVerification
  /** Continúa o corrige lo que ese mismo agente hizo en la petición anterior: retoma su sesión del CLI si puede. */
  continues?: boolean
  /** Lo que cambió en la carpeta del proyecto (instantáneas de antes y después): se puede ver y deshacer. */
  changes?: TaskChanges
  /**
   * Mensaje directo del usuario a este agente («@Qwen …»): recibe el texto tal cual, sin plan de Hermes, sin
   * verificador y sin relevo a otro agente si falla. Su respuesta sale en el chat sin retocar.
   */
  direct?: boolean
}

/** Cambios de una tarea en la carpeta del proyecto, guardados como dos instantáneas (ver checkpoints.ts). */
export interface TaskChanges {
  before: string
  after: string
  files: number
  add: number
  del: number
  /** Trabajó en una copia aparte (otra tarea usaba la carpeta) y sus cambios se integraron al terminar. */
  isolated?: boolean
  /** Archivos que chocaron con otra tarea al integrar. */
  conflicts?: string[]
  /** Se deshizo (cuándo). */
  undoneAt?: number
}

/** Detalle de los cambios de una tarea para verlos en el chat. */
export interface TaskChangeSet {
  files: { path: string; status: 'A' | 'M' | 'D'; add: number; del: number; binary?: boolean }[]
  patch: string
  truncated: boolean
  undoneAt?: number
}

/** Veredicto del verificador sobre una tarea que cambió archivos. */
export interface TaskVerification {
  /** Agente que verificó. */
  by: AgentId
  byName: string
  /** Cumple la petición y el criterio de aceptación. */
  ok: boolean
  /** Fallos concretos que vio (si no cumple), o su comentario. */
  notes?: string
  /** Veces que el autor corrigió a petición del verificador (0 o 1). */
  fixes: number
}

// ---------- Memoria del proyecto ----------

export type MemoryKind = 'decision' | 'fact' | 'preference' | 'pending'
/** confirmed: lo validó el usuario; provisional: lo aportó un agente; superseded: lo sustituyó otra entrada. */
export type MemoryStatus = 'confirmed' | 'provisional' | 'superseded'

/** Una decisión, hecho, preferencia o pendiente del proyecto, con su procedencia. */
export interface MemoryEntry {
  /** Corto y estable dentro del proyecto («m12»): los agentes lo citan para sustituir una entrada. */
  id: string
  kind: MemoryKind
  text: string
  status: MemoryStatus
  /** 'user' o el id del agente que lo aportó. */
  by: 'user' | AgentId
  /** Nombre legible del autor («Tú», «Codex»). */
  byName: string
  /** Agente que lo anotó por el usuario (el coordinador al leer la petición). */
  via?: string
  taskId?: string
  taskTitle?: string
  runId?: string
  createdAt: number
  updatedAt: number
  /** Entrada que la sustituye. */
  supersededBy?: string
}

export interface MemoryInput {
  kind: MemoryKind
  text: string
}

// ---------- Rutinas del proyecto ----------

/**
 * Qué lanza una rutina. Las horas son las del reloj del equipo servidor (zona horaria local).
 * - daily: cada día a una hora («09:00»).
 * - weekly: unos días de la semana a una hora (0 = domingo … 6 = sábado, como Date.getDay()).
 * - interval: cada N horas (contando desde la última vez).
 * - webhook: cuando llega una petición a su dirección propia en el acceso web (con su secreto).
 * - folder: cuando cambian archivos de una carpeta del proyecto (ruta relativa a su carpeta de trabajo; '' = toda).
 */
export type RoutineTrigger =
  | { type: 'daily'; time: string }
  | { type: 'weekly'; days: number[]; time: string }
  | { type: 'interval'; hours: number }
  | { type: 'webhook' }
  | { type: 'folder'; path: string }

export type RoutineTriggerType = RoutineTrigger['type']

/** running: en marcha · waiting: el plan espera tu visto bueno · skipped: la anterior seguía en marcha · interrupted: se cerró la app. */
export type RoutineRunStatus = 'running' | 'waiting' | 'ok' | 'failed' | 'skipped' | 'interrupted'

/** Por qué se lanzó: a su hora, por webhook, por cambios en la carpeta, a mano o para recuperar una hora perdida. */
export type RoutineRunReason = 'schedule' | 'catchup' | 'webhook' | 'folder' | 'manual'

/** Una ejecución de la rutina (se guardan las últimas). */
export interface RoutineRun {
  at: number
  status: RoutineRunStatus
  reason: RoutineRunReason
  /** Petición que lanzó (no hay si se saltó o falló al lanzarla). */
  runId?: string
  /** Detalle para el historial («Se perdieron 3 ejecuciones…», el error…). */
  note?: string
  finishedAt?: number
}

/** Una tarea que se repite: una petición al chat que se lanza sola (a una hora, por webhook o al cambiar archivos). */
export interface Routine {
  id: string
  name: string
  /** Texto que se envía al chat como si lo escribieras tú. */
  request: string
  enabled: boolean
  trigger: RoutineTrigger
  createdAt: number
  updatedAt: number
  /** Desde cuándo cuenta el horario (al crearla, cambiar el disparador o volver a activarla). */
  scheduleFrom: number
  /** Última hora programada ya atendida (lanzada o saltada): la siguiente se calcula desde aquí. */
  lastSlotAt?: number
  /** Últimas ejecuciones, la más reciente al final. */
  runs: RoutineRun[]
  /**
   * Secreto del webhook. Solo lo guarda el motor (project.json): a la interfaz llega sin él (hasSecret) y se pide
   * aparte con getRoutineWebhook. Nunca se escribe en documentos, registros ni mensajes.
   */
  webhookSecret?: string
  hasSecret?: boolean
  /** Próxima hora programada, calculada en el servidor (su zona horaria); null si no va por horario o está desactivada. */
  nextAt?: number | null
}

export interface RoutineInput {
  name: string
  request: string
  trigger: RoutineTrigger
  enabled?: boolean
}

/** Direcciones del webhook de una rutina (con su secreto): solo se piden para enseñarlas o copiarlas. */
export interface RoutineWebhookInfo {
  /** El acceso web está encendido (si no, el webhook no recibe nada). */
  webAccess: boolean
  /** Direcciones completas, con el secreto en la ruta (http por Tailscale y, si está, https). */
  urls: string[]
  /** La misma dirección sin el secreto, para mandarlo en la cabecera X-Cowork-Secret o firmar como GitHub. */
  bareUrls: string[]
  secret: string
}

export interface TokenUsage {
  input: number
  output: number
  cached?: number
}

// ---------- Registro de lo que hace un agente en una tarea ----------

export type TraceKind = 'thinking' | 'text' | 'tool' | 'note' | 'error' | 'files'
export type TraceTool = 'command' | 'edit' | 'write' | 'read' | 'search' | 'web' | 'todo' | 'agent' | 'other'

/** Un paso del agente: lo que piensa, lo que escribe, cada herramienta que usa (con su resultado) y avisos. */
export interface TraceEntry {
  /** Único dentro de la tarea: un evento con el mismo id actualiza la entrada (resultado, texto que sigue llegando). */
  id: string
  ts: number
  kind: TraceKind
  tool?: TraceTool
  /** Línea corta («Ejecutando: npm test», «Editando app.js»). */
  title: string
  /** Detalle: el comando, los cambios, el razonamiento o el texto. */
  body?: string
  /** Lo que devolvió la herramienta (el final, si es largo). */
  output?: string
  /** Resultado de la herramienta; sin indicar = todavía sin resultado. */
  ok?: boolean
}

export interface Attachment {
  id: string
  name: string
  /** Ruta relativa dentro de la carpeta del proyecto. */
  relPath: string
  mime: string
  size: number
}

export type ArtifactKind = 'html' | 'markdown' | 'code' | 'image' | 'text' | 'other'

export interface Artifact {
  id: string
  projectId: string
  taskId?: string
  agentId?: AgentId
  name: string
  relPath: string
  kind: ArtifactKind
  size: number
  createdAt: number
}

export type MessageAuthor = { type: 'user' } | { type: 'agent'; agentId: AgentId } | { type: 'system' }

export interface ChatMessage {
  id: string
  projectId: string
  runId?: string
  /** Identificador del cliente móvil para reintentos sin duplicar mensajes o ejecuciones. */
  clientMessageId?: string
  author: MessageAuthor
  text: string
  createdAt: number
  attachments?: Attachment[]
  /** Tareas que este mensaje presenta (mensaje del planificador). */
  taskIds?: string[]
  artifactIds?: string[]
  /** El texto se está recibiendo en streaming. */
  streaming?: boolean
  tone?: 'normal' | 'error'
  /** Contrato común del plan (mensaje del planificador que reparte en paralelo). */
  contract?: string
  /** Plan que el coordinador propone y que espera tu visto bueno antes de empezar (al aprobarlo, taskIds). */
  proposal?: PlanProposal
  /** Mensaje de una tarea: lo que el agente va contando mientras la hace; al acabar, `text` es su resultado. */
  work?: TaskWork
  /** Tu valoración del resultado (👍/👎): va al registro de consumo y a la ficha del agente que lo hizo. */
  rating?: MessageRating
  /** Mensaje que lanzó una rutina (no lo escribiste tú en ese momento): el chat enseña «Rutina: <nombre>». */
  routine?: { id: string; name: string }
  /** Mensaje tuyo enviado directo a un agente («@Qwen …» o «/directo Qwen …»): no pasó por Hermes. */
  direct?: { agentId: AgentId; name: string }
}

/** Te sirvió (up) o no (down). */
export type MessageRating = 'up' | 'down'

/** Un paso de lo que cuenta un agente mientras trabaja. */
/** Un archivo nuevo que el agente ha creado o abierto mientras trabaja (una captura, un documento). */
export interface WorkFile {
  /** Ruta relativa al proyecto (su carpeta de trabajo o la interna). */
  relPath: string
  name: string
  image: boolean
  size: number
}

/** Una herramienta de un grupo: con su id se pide su detalle (comando, cambios, resultado) al registro de la tarea. */
export interface WorkToolRef {
  /** Id de su entrada en el registro de la tarea (GET /tasks/{taskId}/trace). */
  id: string
  tool: TraceTool
  /** Resultado; sin indicar = todavía sin resultado. */
  ok?: boolean
  /** Líneas que añade y quita, si cambia un archivo. */
  add?: number
  del?: number
}

/** Lo hecho en toda la tarea, para el resumen de una línea que se despliega. */
export interface WorkTotals {
  /** «Ejecutó 14 comandos, editó 3 archivos y creó 2 archivos». */
  summary: string
  failed?: number
  add?: number
  del?: number
}

export type WorkStep =
  /** Lo que dice que hace, qué problema encontró, cómo lo resuelve (una o dos frases). */
  | { kind: 'note'; text: string }
  /** Herramientas seguidas, en una línea («Ejecutó 3 comandos y editó 2 archivos»); `items`, cada una. */
  | {
      kind: 'tools'
      summary: string
      items: string[]
      more?: number
      failed?: number
      /** Una por cada item (mismo orden): su id para pedir el detalle, su resultado y sus líneas. */
      refs?: WorkToolRef[]
      /** Líneas que añade y quita el grupo entero. */
      add?: number
      del?: number
    }
  /** Archivos que acaba de crear o abrir (las imágenes se ven en el chat para saber por dónde va). */
  | { kind: 'files'; files: WorkFile[] }

export interface TaskWork {
  taskId: string
  title: string
  /** running mientras trabaja; stopped si se detuvo o se cerró la app antes de acabar. */
  status: 'running' | 'done' | 'failed' | 'stopped'
  steps: WorkStep[]
  /** Pasos del principio que ya no caben (están en el registro completo de la tarea). */
  hidden?: number
  /** Todo lo que hizo hasta ahora (también lo que ya no cabe en steps), en una línea. */
  totals?: WorkTotals
}

/** Una tarea del plan propuesto: todavía no existe; se crea al aprobar el plan. */
export interface ProposedTask {
  key: string
  title: string
  description: string
  agentId: AgentId
  difficulty: Difficulty
  /** keys de las tareas de este plan que tienen que terminar antes. */
  dependsOn: string[]
  deliverable: 'file' | 'text'
  acceptance?: string
  files?: string[]
  /** Continúa lo que ese mismo agente hizo en la petición anterior (retoma su sesión del CLI). */
  continues?: boolean
}

/** Un proveedor de modelos de Hermes y sus modelos (los que lista `hermes model`). */
export interface HermesProvider {
  /** Lo que se le pasa con --provider (un proveedor propio de Hermes o un nombre de `providers:` de su config). */
  id: string
  label: string
  models: string[]
}

/** «/model»: con qué modelo coordina Hermes y cuáles puede usar. */
export interface HermesModelsInfo {
  /** Hermes Agent está instalado (tiene su config.yaml). */
  installed: boolean
  /** fromApp: elegido con «/model» en AI Cowork; si no, el de la configuración de Hermes. */
  current: { provider: string; model: string; fromApp: boolean }
  /** El de su configuración (lo que eliges con `hermes model` en la terminal). */
  hermesDefault: { provider: string; model: string } | null
  providers: HermesProvider[]
  /** Cuándo actualizó Hermes estas listas por última vez (ms). */
  updatedAt: number | null
}

/**
 * Plan del coordinador a la espera de tu visto bueno. pending: espera tu respuesta; approved: aprobado (ya en
 * marcha); revised: le pediste cambios y propuso otro; rejected: lo descartaste.
 */
export interface PlanProposal {
  status: 'pending' | 'approved' | 'revised' | 'rejected'
  tasks: ProposedTask[]
  /** Petición completa (con los cambios pedidos al revisarlo): es la que reciben los agentes al aprobarlo. */
  request: string
  /** Adjuntos de la petición (van con las tareas al aprobarlo). */
  attachmentIds?: string[]
  contract?: string
  /** Lo que se anota en la memoria del proyecto al aprobarlo (son tus palabras). */
  memory?: Array<{ kind: MemoryKind; text: string; replaces?: string }>
  decidedAt?: number
}

export interface Transfer {
  id: string
  fromId: AgentId | 'core' | 'user'
  toId: AgentId | 'core'
  label: string
  taskId?: string
  payload: { title: string; summary?: string; files?: string[] }
  createdAt: number
}

// ---------- Cuotas ----------

/** Qué representa el indicador. */
export type QuotaKind =
  | 'usage' // cuota de uso de una suscripción (ventana de horas / semana)
  | 'tokens' // presupuesto de tokens configurado por ti
  | 'requests' // presupuesto de solicitudes configurado por ti
  | 'local' // ejecución local

export type QuotaSource = 'real' | 'estimate' | 'config' | 'demo' | 'none'

export interface QuotaInfo {
  id: string
  label: string
  kind: QuotaKind
  agentIds: AgentId[]
  /** 0..100 restante. null = No disponible. */
  remainingPct: number | null
  remaining?: number | null
  limit?: number | null
  unit?: string
  /** Descripción del periodo ("Ventana semanal", "Diario"). */
  period?: string
  resetsAt?: number | null
  updatedAt?: number | null
  source: QuotaSource
  /** Ejecución local configurada como ilimitada. Única situación en la que se muestra ∞. */
  unlimited?: boolean
  note?: string
  /** Consumo registrado por la app en el periodo actual. */
  usedTokens?: number
  usedRequests?: number
  /** Arreglo que la app puede hacer sola: 'claude-direct' = Claude Code pasa por otro servidor (p. ej. OmniRoute). */
  fix?: 'claude-direct'
}

/** Presupuesto configurable para grupos sin datos reales. */
export interface QuotaBudget {
  limit: number
  unit: 'tokens' | 'solicitudes'
  period: 'diario' | '5h' | 'semanal'
}

export interface QuotaGroupConfig {
  id: string
  label: string
  provider: ProviderKind | 'local'
  budget?: QuotaBudget
  unlimited?: boolean
}

export interface QuotaThresholds {
  /** Por debajo o igual: advertencia. */
  warn: number
  /** Por debajo: alerta roja. */
  alert: number
}

// ---------- Modelos locales ----------

export interface LocalModel {
  /** Identificador que se usa para ejecutarlo (p. ej. "qwen3:14b" o "google/gemma-4-12b-qat"). */
  id: string
  /** Nombre legible. */
  label: string
  sizeBytes?: number
  params?: string
  quantization?: string
}

export interface LocalEngineStatus {
  engine: LocalEngine
  /** El programa está instalado en este equipo. */
  installed: boolean
  /** Su servidor local responde. */
  running: boolean
  models: LocalModel[]
  /** Se puede encender el servidor desde la app. */
  canStart: boolean
  /** Se pueden descargar modelos desde la app. */
  canPull: boolean
}

export type LocalPullStatus = 'starting' | 'downloading' | 'verifying' | 'done' | 'error' | 'cancelled'

export interface LocalPullState {
  model: string
  status: LocalPullStatus
  completed?: number
  total?: number
  message?: string
}

export interface SetLocalAgentInput {
  agentId: AgentId
  engine: LocalEngine
  model: string
  modelLabel: string
  name?: string
}

// ---------- Modelos por dificultad ----------

export interface ModelOption {
  id: string
  label: string
  note?: string
}

export interface ModelChoice {
  model: string
  label: string
}

export interface SetAgentModelsInput {
  agentId: AgentId
  /** Tareas fáciles (becarios). null = sin modelo ligero. */
  light: ModelChoice | null
  /** Tareas normales. */
  standard: ModelChoice
  /** Tareas difíciles. null = usar el habitual. */
  strong: ModelChoice | null
}

// ---------- Proyecto ----------

export interface ProjectSummary {
  id: string
  name: string
  /** Carpeta interna del proyecto (chat, adjuntos, resultados). */
  dir: string
  /** Carpeta del usuario donde los agentes pueden leer y editar (acceso concedido explícitamente). */
  workDir?: string
  createdAt: number
  updatedAt: number
  /** Fijado en la barra lateral (arriba del todo, en «Fijados»). */
  pinned?: boolean
  /** El equipo está trabajando en él ahora (solo en la lista de proyectos; no se guarda). */
  busy?: boolean
}

/** Una conversación de un proyecto. La abierta vive en el proyecto; las demás, guardadas en conversaciones/. */
export interface ConversationSummary {
  id: string
  projectId: string
  /** Sale del primer mensaje del usuario; se puede renombrar. */
  title: string
  createdAt: number
  updatedAt: number
  /** Mensajes que tiene (para no listar conversaciones vacías como si tuvieran algo). */
  messageCount: number
  /** Es la abierta ahora en el proyecto. */
  current?: boolean
  /** Fijada arriba en la barra lateral. */
  pinned?: boolean
}

/** Un resultado del buscador (Ctrl+K): conversaciones, tareas, resultados y memoria de todos los proyectos. */
export interface SearchHit {
  kind: 'conversation' | 'task' | 'artifact' | 'memory' | 'project'
  projectId: string
  projectName: string
  /** Conversación donde está (las tareas y los mensajes); vacío si es la abierta o no aplica. */
  conversationId?: string
  title: string
  /** Trozo del texto alrededor de lo encontrado. */
  snippet: string
  at: number
  /** Id de la tarea o del resultado, para abrirlo. */
  ref?: string
}

export interface ProjectState {
  project: ProjectSummary
  /** Conversación abierta: su id, título y cuándo empezó (los proyectos antiguos no lo tienen hasta el primer cambio). */
  conversation?: { id: string; title: string; createdAt: number; pinned?: boolean }
  /** Conversaciones guardadas (no la abierta), de la más reciente a la más antigua. */
  conversations?: ConversationSummary[]
  /** Ya se pasaron a conversaciones las copias antiguas de historial/ (las de «Limpiar el chat»). */
  historyImported?: boolean
  messages: ChatMessage[]
  tasks: Task[]
  artifacts: Artifact[]
  attachments: Attachment[]
  /** Memoria del proyecto: decisiones, hechos, preferencias y pendientes con su procedencia. */
  memory?: MemoryEntry[]
  /** Instrucciones del usuario para todos los agentes de este proyecto (cómo probar, estilo, qué no tocar…). */
  instructions?: string
  /** Rutinas: peticiones que se lanzan solas (a una hora, por webhook o al cambiar archivos). */
  routines?: Routine[]
  /** Ejecución en curso al abrir el proyecto (la más reciente; no se guarda). */
  activeRunId?: string
  /** Todas las peticiones en marcha del proyecto, de la más antigua a la más reciente (no se guarda). */
  activeRunIds?: string[]
}

export interface AppConfig {
  /** Versión del formato (para migrar configuraciones antiguas). */
  configVersion?: number
  workspaceRoot: string
  agents: AgentConfig[]
  stations: StationConfig[]
  quotaGroups: QuotaGroupConfig[]
  thresholds: QuotaThresholds
  /** Agente que planifica y reparte. Si no está disponible se usa el siguiente de la lista. */
  plannerOrder: AgentId[]
  maxParallel: number
  agentAccess: AgentAccess
  /** Agentes de fábrica que el usuario quitó (para que no vuelvan a aparecer al actualizar). */
  removedAgents?: AgentId[]
  /** El coordinador te enseña el plan (qué hará cada agente) y espera tu visto bueno antes de empezar. */
  planApproval: boolean
  /** El asistente de configuración ya se completó (o se omitió) en este equipo. */
  setupDone: boolean
  /** Idioma de los avisos del motor y de las respuestas de los agentes (el último elegido en Ajustes; si no, español). */
  language?: Lang
  /** Acceso desde otros dispositivos de Tailscale (navegador del móvil o del portátil). */
  webAccess: WebAccessConfig
}

export interface WebAccessConfig {
  enabled: boolean
  port: number
  /** Los clientes de escritorio solo ven las carpetas de los proyectos (por defecto, todo el disco del servidor). */
  restrictClients?: boolean
  /** Código de acceso (va en el enlace; cambiarlo invalida los enlaces anteriores). */
  token: string
}

/** Un móvil o cliente de escritorio emparejado con este AI Cowork. */
export interface PairedDevice {
  id: string
  name: string
  kind: 'mobile' | 'client'
  platform?: string
  createdAt: number
  lastSeenAt: number
  lastIp?: string
  /** Revocado: ya no puede entrar; sigue en la lista hasta que se quite. */
  revokedAt?: number
}

/** Resultado de buscar una versión nueva del propio cliente de escritorio (la app instalada, no el servidor). */
export interface ClientUpdateState {
  /** current: al día · available: hay una versión nueva · unsupported: este equipo no se actualiza así · error. */
  state: 'current' | 'available' | 'unsupported' | 'error'
  /** Versión instalada. */
  current: string
  /** Versión publicada en el servidor, si hay una nueva. */
  latest?: string
  message?: string
}

/** El equipo donde corre el motor: para distinguir el servidor de un cliente o un navegador. */
export interface HostInfo {
  /** Nombre del equipo (sin «.local»). */
  name: string
  platform: string
}

export interface WebAccessInfo {
  /** Los clientes solo ven las carpetas de los proyectos. */
  restrictClients?: boolean
  enabled: boolean
  running: boolean
  port: number
  token: string
  tailscaleIp: string | null
  /** Direcciones para abrir AI Cowork (sin el código). */
  urls: string[]
  listeningOnTailscale: boolean
  /** La app se abre sola al iniciar sesión en el equipo. */
  openAtLogin?: boolean
  /** HTTPS con Tailscale Serve (necesario para el micrófono en el navegador del móvil). */
  https?: WebHttpsInfo
  /**
   * Versión HTTPS con el certificado propio de AI Cowork (https://<ip>:<puerto+1>, sin el código). Funciona sin
   * Tailscale Serve y deja usar el micrófono, pero el navegador avisa la primera vez.
   */
  secureUrl?: string | null
}

/** Enlace a la versión HTTPS (con el código): la de Tailscale Serve o, si no está, la del certificado propio. */
export interface HttpsLink {
  url: string
  /** Certificado propio de AI Cowork: el navegador avisa la primera vez y hay que aceptarlo. */
  selfSigned: boolean
}

export interface WebHttpsInfo {
  /** Se encontró el programa de Tailscale en este equipo (hace falta para activar HTTPS). */
  available: boolean
  /** Tailscale Serve ya publica AI Cowork por HTTPS. */
  active: boolean
  /** https://<equipo>.<red>.ts.net (sin el código), si está activo. */
  url: string | null
  /** Enlace de Tailscale para permitir HTTPS en tu red, si todavía no lo permite. */
  enableUrl?: string
  /** Por qué no se puede activar ahora mismo. */
  problem?: string
}

// ---------- Consumo (para ver si compensa) ----------

/** Una llamada a un agente dentro de una petición (planificar o hacer una tarea). */
export interface UsageCall {
  ts: number
  /** plan: planificar; task: hacer la tarea; verify: comprobar el resultado (otra familia, solo lectura). */
  kind: 'plan' | 'task' | 'verify'
  taskId?: string
  agentId: AgentId
  agentName: string
  provider: ProviderKind
  model?: string
  /** Esfuerzo de razonamiento con el que se lanzó (Claude Code y Codex). */
  effort?: Effort
  /** Tokens de entrada (incluye los leídos de caché). */
  input: number
  output: number
  /** Parte de la entrada leída de caché (mucho más barata). */
  cached: number
  durationMs: number
  ok: boolean
  /** El CLI no informa tokens (Hermes): la llamada cuenta, los tokens no. */
  noTokens?: boolean
  /** Valoración del usuario del resultado de esta tarea (👍/👎 en el chat). */
  rating?: MessageRating
  /** Llamadas de tarea: dificultad que le puso el coordinador (para la calidad por agente; falta en registros antiguos). */
  difficulty?: Difficulty
  /** Llamadas de verificar: veredicto del verificador (pass: cumple; fail: vio fallos). Falta si no pudo verificar. */
  verdict?: 'pass' | 'fail'
  /** La detuvo el usuario (no cuenta como fallo del agente). Falta en registros antiguos. */
  cancelled?: boolean
}

export interface QuotaWindowSnapshot {
  name: string
  label: string
  usedPct: number
  resetsAt: number | null
}

/** Uso de cada suscripción con dato real en un momento: grupo de cuota → ventanas. */
export type QuotaSnapshot = Record<string, { label: string; at: number; windows: QuotaWindowSnapshot[] }>

/** Una petición del usuario: lo que costó (tokens, tiempo, cuota) y cómo acabó. */
/** Una canción encontrada para el reproductor de música (YouTube Music o YouTube). */
export interface MusicResult {
  videoId: string
  title: string
  artist: string
  album?: string
  durationSec?: number
  thumbnail?: string
  /** Suena otra subida de la misma canción (la original no se puede oír fuera de YouTube): su canal. */
  via?: string
}

export interface UsageRun {
  runId: string
  projectId: string
  projectName: string
  /** Primeras palabras de la petición. */
  request: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'ok' | 'failed' | 'cancelled'
  tasks: number
  tasksDone: number
  calls: UsageCall[]
  /** Tiempo que estuvo parada (la app cerrada) antes de reanudarla: no cuenta como duración. */
  pausedMs?: number
  quotaBefore?: QuotaSnapshot
  quotaAfter?: QuotaSnapshot
  /** Valoración del usuario del resultado de la petición entera (👍/👎 en la respuesta final o el plan). */
  rating?: MessageRating
}

// ---------- Actualizaciones desde GitHub ----------

export interface UpdateCommit {
  hash: string
  date: string
  subject: string
}

export interface UpdateStatus {
  /** Se puede actualizar desde aquí (hay un clon de git del código). */
  canUpdate: boolean
  /** Por qué no se puede (sin código, sin conexión con GitHub, cambios locales…). */
  reason?: string
  current?: UpdateCommit
  branch?: string
  /** Cambios nuevos en GitHub, del más reciente al más antiguo. */
  commits: UpdateCommit[]
  /** Archivos del código cambiados en este equipo (p. ej. por los agentes) que no están en GitHub. */
  localChanges?: string[]
  /** Commits hechos en este equipo que no están en GitHub (se apartan en una rama para poder actualizar). */
  localCommits?: UpdateCommit[]
  /** El código ya descargado es más nuevo que la app instalada: «commits» es lo que falta por instalar. */
  pendingInstall?: boolean
}

/** Un acceso de un cliente o navegador a los archivos de este servidor. */
export interface AccessLogEntry {
  t: number
  device: string
  deviceId?: string
  ip?: string
  action: 'list' | 'read' | 'zip' | 'folder' | 'write' | 'mkdir' | 'trash' | 'denied'
  path: string
  bytes?: number
  note?: string
}

/** Un agente que el usuario añade: uno del catálogo (presetId) o uno a medida (custom). */
export interface AddAgentInput {
  presetId?: string
  /** Nombre que se le da (por defecto, el del catálogo). */
  name?: string
  /** Agente a medida: cualquier programa de terminal. */
  custom?: Pick<CliAgentSpec, 'command' | 'promptVia' | 'args'> & Partial<CliAgentSpec>
}

export interface SetWebAccessInput {
  /** Restringe (o no) los archivos que ven los clientes a las carpetas de los proyectos. */
  restrictClients?: boolean
  enabled?: boolean
  regenerateToken?: boolean
  openAtLogin?: boolean
  /** Activa o quita el HTTPS de Tailscale Serve. */
  https?: boolean
}

// ---------- Asistente de configuración ----------

/** Programas que el asistente comprueba e instala. */
export type SetupToolId = 'node' | 'brew' | 'python' | 'claude' | 'codex' | 'gemini' | 'hermes' | 'muse' | 'lmstudio' | 'ollama' | `cli:${string}`

export interface SetupTool {
  id: SetupToolId
  label: string
  installed: boolean
  version?: string
  /** Se puede instalar desde la app (si no, se abre su página de descarga). */
  canInstall: boolean
  /** Otro programa que hay que instalar antes (p. ej. Node.js para npm). */
  needs?: SetupToolId
  url: string
}

export interface SetupAuth {
  id: SetupToolId
  ok: boolean
  /** Cuenta, proveedor o motivo, en una línea. */
  detail: string
  /** Tiene un inicio de sesión que se abre en una terminal. */
  canLogin: boolean
}

export interface SetupInstallResult {
  ok: boolean
  message: string
}

// ---------- Eventos del motor ----------

interface EventBase {
  /** Único: la interfaz descarta duplicados por id. */
  id: string
  ts: number
  /** Eventos generados por el modo Demo. */
  demo?: boolean
}

export type CoworkEvent = EventBase &
  (
    | { kind: 'agent.runtime'; runtime: AgentRuntime }
    | { kind: 'agent.spawned'; agent: AgentConfig }
    | { kind: 'agent.removed'; agentId: AgentId }
    | { kind: 'agent.moved'; agentId: AgentId; to: 'station' | 'core'; reason?: string }
    | { kind: 'task.upsert'; task: Task }
    | { kind: 'task.completed'; taskId: string; agentId: AgentId }
    | { kind: 'transfer.started'; transfer: Transfer }
    | { kind: 'message.upsert'; message: ChatMessage }
    | { kind: 'message.delta'; messageId: string; text: string }
    | { kind: 'artifact.created'; artifact: Artifact }
    | { kind: 'quota.update'; quotas: QuotaInfo[] }
    | { kind: 'run.started'; runId: string; projectId: string }
    | { kind: 'run.finished'; runId: string; projectId: string; ok: boolean }
    | { kind: 'chat.cleared'; projectId: string; conversationId?: string }
    | { kind: 'conversations.updated'; projectId: string }
    | { kind: 'usage.run'; run: UsageRun }
    | { kind: 'task.trace'; taskId: string; projectId: string; entry: TraceEntry }
    | { kind: 'memory.updated'; projectId: string; memory: MemoryEntry[]; instructions: string }
    | { kind: 'routines.updated'; projectId: string; routines: Routine[] }
    | { kind: 'project.deleted'; projectId: string }
    | { kind: 'local.pull'; pull: LocalPullState }
    | { kind: 'setup.log'; toolId: SetupToolId; line: string }
    | { kind: 'update.log'; line: string }
    | { kind: 'config.updated'; config: AppConfig }
    | { kind: 'inbox.updated'; items: InboxItem[] }
  )

export type CoworkEventKind = CoworkEvent['kind']

// ---------- Bandeja «Te necesita» ----------

/**
 * plan: un plan espera tu visto bueno · stalled: un agente lleva rato callado (suele ser un aviso de permisos en la
 * pantalla del servidor) · mac-permission: macOS pide un permiso de Privacidad · question: el equipo te pregunta algo ·
 * verify-failed: el verificador sigue viendo fallos · conflict: choques al integrar · failed: una tarea no se pudo
 * hacer · done: terminó una petición.
 */
export type InboxKind = 'plan' | 'stalled' | 'mac-permission' | 'question' | 'verify-failed' | 'conflict' | 'failed' | 'done'

export interface InboxAction {
  /** approve, reject, undo, open, dismiss… */
  id: string
  label: string
  /** Enlace que abre el botón (Compartir pantalla): no cierra el aviso. */
  url?: string
}

export interface InboxItem {
  id: string
  kind: InboxKind
  title: string
  detail?: string
  projectId?: string
  runId?: string
  taskId?: string
  messageId?: string
  agentId?: AgentId
  /** Para no repetir el mismo aviso mientras siga abierto. */
  key?: string
  actions: InboxAction[]
  createdAt: number
  resolvedAt?: number
  /** Cómo se cerró («Aprobar», «La tarea terminó»…). */
  resolution?: string
}

/**
 * Eventos que de momento solo reenvía la API móvil. La interfaz (escritorio y web) aún no los trata y su reductor
 * se quedaría sin estado con un tipo desconocido, así que no van por emit(): cuando los trate, pasan a CoworkEvent.
 */
export type MobileOnlyEvent = EventBase & { kind: 'attachments.updated'; projectId: string; attachments: Attachment[] }

// ---------- API expuesta por el preload (window.cowork) ----------

export interface SendMessageInput {
  projectId: string
  text: string
  clientMessageId?: string
  /** Rutas absolutas de archivos elegidos/arrastrados por el usuario. */
  filePaths: string[]
  /** Adjuntos que ya están en el proyecto (subidos antes desde el móvil): van con el mensaje sin copiarlos otra vez. */
  attachmentIds?: string[]
}

export interface CoworkApi {
  getConfig(): Promise<AppConfig>
  listProjects(): Promise<ProjectSummary[]>
  createProject(name: string): Promise<ProjectSummary>
  renameProject(projectId: string, name: string): Promise<ProjectSummary>
  /**
   * Elimina el proyecto: su chat, tareas, adjuntos, resultados, historial y memoria van a la Papelera de este equipo
   * (si trabajaba en una carpeta tuya, solo su subcarpeta .ai-cowork). Devuelve la lista de proyectos que queda.
   */
  deleteProject(projectId: string): Promise<ProjectSummary[]>
  /**
   * Empieza una conversación nueva en el proyecto: vacía el chat y las tareas terminadas (los archivos y
   * resultados se quedan). Guarda antes una copia en historial/ dentro del proyecto y devuelve su ruta.
   */
  clearChat(projectId: string): Promise<string>
  /** Conversaciones de un proyecto (la abierta y las guardadas), de la más reciente a la más antigua. */
  listConversations(projectId: string): Promise<ConversationSummary[]>
  /** Las conversaciones más recientes de todos los proyectos (para «Recientes» en la barra lateral). */
  recentConversations(limit?: number): Promise<ConversationSummary[]>
  /** Conversación nueva: guarda la abierta (si tiene algo) y deja el chat vacío. Devuelve el estado del proyecto. */
  newConversation(projectId: string): Promise<ProjectState>
  /** Vuelve a una conversación guardada para seguir en ella (guarda antes la abierta). Devuelve el estado del proyecto. */
  openConversation(projectId: string, conversationId: string): Promise<ProjectState>
  renameConversation(projectId: string, conversationId: string, title: string): Promise<ConversationSummary[]>
  /** Borra una conversación guardada (va a conversaciones/borradas/ dentro del proyecto). */
  deleteConversation(projectId: string, conversationId: string): Promise<ConversationSummary[]>
  /** Fija o suelta una conversación en la barra lateral. */
  setConversationPinned(projectId: string, conversationId: string, pinned: boolean): Promise<ConversationSummary[]>
  /** Las conversaciones fijadas de todos los proyectos. */
  pinnedConversations(): Promise<ConversationSummary[]>
  /** Bifurca: copia aparte de la conversación (mensajes y tareas, sin las sesiones de los agentes). Devuelve el id de la copia. */
  forkConversation(projectId: string, conversationId: string): Promise<string>
  /** Pasa la conversación a otro proyecto (los agentes empiezan sesión nueva allí). Devuelve el id que tiene en el destino. */
  moveConversation(projectId: string, conversationId: string, toProjectId: string): Promise<string>
  /** Fija o suelta un proyecto en la barra lateral. */
  setProjectPinned(projectId: string, pinned: boolean): Promise<ProjectSummary>
  /** Busca en conversaciones, tareas, resultados y memoria (de un proyecto o de todos). */
  search(query: string, projectId?: string): Promise<SearchHit[]>
  loadProject(projectId: string): Promise<ProjectState>
  /** Estado actual de agentes y cuotas (para pintar al arrancar). */
  getRuntime(): Promise<{ runtimes: AgentRuntime[]; quotas: QuotaInfo[] }>
  sendMessage(input: SendMessageInput): Promise<{ runId: string }>
  cancelRun(runId: string): Promise<void>
  pickFiles(kind: 'any' | 'image'): Promise<string[]>
  /** Ruta absoluta de un archivo soltado en la ventana. */
  pathForFile(file: File): string
  readArtifact(projectId: string, relPath: string): Promise<{ text?: string; url?: string }>
  openPath(projectId: string, relPath?: string): Promise<void>
  setQuotaBudget(groupId: string, budget: QuotaBudget | null): Promise<void>
  refreshQuotas(): Promise<void>
  /** Registro de consumo de las peticiones (últimos meses), de la más antigua a la más reciente. */
  getUsageRuns(): Promise<UsageRun[]>
  /** Memoria del proyecto (los cambios llegan por eventos memory.updated). */
  addMemory(projectId: string, input: MemoryInput): Promise<MemoryEntry | null>
  /** Cambia el texto o el tipo, o la confirma / la marca como sustituida (status). */
  updateMemory(projectId: string, id: string, patch: Partial<MemoryInput> & { status?: MemoryStatus }): Promise<void>
  deleteMemory(projectId: string, id: string): Promise<void>
  setInstructions(projectId: string, text: string): Promise<void>
  /** Rutinas del proyecto (los cambios llegan por eventos routines.updated, sin el secreto del webhook). */
  createRoutine(projectId: string, input: RoutineInput): Promise<Routine>
  /** Cambia nombre, petición, disparador o la activa/desactiva. */
  updateRoutine(projectId: string, id: string, patch: Partial<RoutineInput>): Promise<Routine>
  deleteRoutine(projectId: string, id: string): Promise<void>
  /** «Ejecutar ahora»: la lanza ya (si la anterior sigue en marcha, se apunta como saltada). */
  runRoutineNow(projectId: string, id: string): Promise<RoutineRun>
  /** Dirección del webhook con su secreto (regenerate: secreto nuevo; la dirección anterior deja de valer). */
  getRoutineWebhook(projectId: string, id: string, regenerate?: boolean): Promise<RoutineWebhookInfo>
  /** Retoma una petición interrumpida al cerrar la app: vuelve a lanzar sus tareas sin terminar. */
  resumeRun(projectId: string, runId: string): Promise<void>
  /** Da el visto bueno al plan que propone el coordinador (mensaje con proposal): sus tareas empiezan. */
  /** 👍/👎 en un resultado del chat (null lo quita): queda en el mensaje, en el registro de consumo y en la ficha del agente. */
  rateMessage(projectId: string, messageId: string, rating: MessageRating | null): Promise<void>
  approvePlan(projectId: string, messageId: string): Promise<void>
  /** Descarta el plan propuesto sin hacer nada. */
  rejectPlan(projectId: string, messageId: string): Promise<void>
  /** Pedir (o no) tu visto bueno antes de ejecutar cada plan. */
  setPlanApproval(on: boolean): Promise<void>
  /** Idioma de los avisos del motor y de las respuestas de Hermes y los agentes (lo cambia el selector de Ajustes). */
  setLanguage(lang: Lang): Promise<void>
  /** «/model»: modelo con el que coordina Hermes y los que puede usar (según sus proveedores con sesión). */
  getHermesModels(): Promise<HermesModelsInfo>
  /** Cambia el modelo de Hermes en AI Cowork (null: volver al de su configuración). */
  setHermesModel(choice: { provider: string; model: string } | null): Promise<HermesModelsInfo>
  /** Busca canciones para el reproductor de música (YouTube Music y, si no, YouTube). */
  searchMusic(query: string, kind?: 'songs' | 'videos'): Promise<MusicResult[]>
  /** Lo que ha hecho el agente en una tarea, paso a paso (lo nuevo llega por eventos task.trace). */
  getTaskTrace(taskId: string): Promise<TraceEntry[]>
  /** Qué cambió una tarea en la carpeta del proyecto (archivos con +/− y el parche). */
  getTaskChanges(projectId: string, taskId: string): Promise<TaskChangeSet>
  /**
   * Deshace lo que hizo una tarea aunque después se cambiaran otros archivos (fusión a tres bandas). Si alguna línea
   * que tocó la cambió después otra cosa, no deshace nada y lo explica. Devuelve el texto para el usuario.
   */
  undoTask(projectId: string, taskId: string): Promise<string>
  /** Bandeja «Te necesita»: avisos abiertos y los últimos cerrados, del más reciente al más antiguo. */
  listInbox(): Promise<InboxItem[]>
  /** Pulsa un botón de un aviso (aprobar, deshacer, entendido…). Devuelve el texto para el usuario, si lo hay. */
  actInbox(id: string, actionId: string): Promise<{ item: InboxItem; message?: string }>
  /** «Reiniciar agente» tras un fallo: olvida su bloqueo, comprueba que responde y lo deja disponible. */
  resetAgent(agentId: string): Promise<AgentRuntime>
  /** Enciende o apaga el razonamiento («think») del modelo local de LM Studio. */
  setAgentThinking(agentId: AgentId, enabled: boolean): Promise<void>
  /**
   * Quita de ~/.claude/settings.json lo que desvía Claude Code a otro servidor (con copia antes), para que use
   * directamente tu cuenta de Claude y pueda dar la cuota. Devuelve un mensaje con lo hecho y lo que falta.
   */
  fixClaudeDirect(): Promise<string>
  /** Estado de Ollama y LM Studio con sus modelos instalados. */
  listLocalEngines(): Promise<LocalEngineStatus[]>
  startLocalServer(engine: LocalEngine): Promise<void>
  /** Descarga un modelo de Ollama (progreso por eventos local.pull). Si se indica agentId, al terminar se le asigna. */
  pullLocalModel(model: string, agentId?: AgentId): Promise<void>
  cancelLocalPull(): Promise<void>
  /** Cambia motor, modelo y nombre de un agente local. */
  setLocalAgent(input: SetLocalAgentInput): Promise<void>
  setQuotaUnlimited(groupId: string, unlimited: boolean): Promise<void>
  setAgentAccess(access: AgentAccess): Promise<void>
  setupDetect(): Promise<SetupTool[]>
  setupInstall(id: SetupToolId): Promise<SetupInstallResult>
  setupLogin(id: SetupToolId): Promise<void>
  setupAuth(id: SetupToolId): Promise<SetupAuth>
  setupGeminiKey(key: string): Promise<SetupAuth>
  /** Guarda la clave de API de un agente de catálogo (solo en el equipo servidor; nunca viaja por el acceso web). */
  setAgentKey(agentId: AgentId, key: string): Promise<SetupAuth>
  setAgentsEnabled(agentIds: AgentId[]): Promise<void>
  /** Añade un agente del catálogo (o uno a medida) y le asigna estación y aspecto. */
  addAgent(input: AddAgentInput): Promise<AppConfig>
  /** Quita un agente (el de fábrica no vuelve a aparecer hasta que se añada otra vez). */
  removeAgent(agentId: AgentId): Promise<AppConfig>
  /** Elige qué agente coordina: planifica y reparte; si no está disponible, planifica el siguiente. */
  setCoordinator(agentId: AgentId): Promise<AppConfig>
  setupFinish(): Promise<void>
  openExternal(url: string): Promise<void>
  getWebAccess(): Promise<WebAccessInfo>
  /** Nombre y sistema del equipo donde corre el motor (también por web: es el del servidor). */
  getHostInfo(): Promise<HostInfo>
  /** Código de 6 cifras para emparejar la app del móvil (10 minutos, un solo uso; null si el acceso está apagado). */
  mobilePairingPin(): Promise<{ pin: string; expiresAt: number } | null>
  /** Qué hicieron los clientes con los archivos de este servidor (solo en el equipo servidor), lo más reciente primero. */
  getAccessLog(limit?: number): Promise<AccessLogEntry[]>
  /** Móviles y clientes emparejados (solo en el equipo servidor). */
  listDevices(): Promise<PairedDevice[]>
  /** Revoca un dispositivo: corta sus conexiones y deja de aceptar su token. */
  revokeDevice(id: string): Promise<void>
  /** Quita un dispositivo de la lista (si no estaba revocado, lo revoca antes). */
  forgetDevice(id: string): Promise<void>
  /** Enlace de acceso por HTTPS (con el código), si está activo: desde el navegador, para pasar a la versión con micrófono. */
  getHttpsLink(host?: string): Promise<HttpsLink | null>
  checkForUpdates(): Promise<UpdateStatus>
  /** Cierra y vuelve a abrir AI Cowork (también desde el navegador del móvil). */
  restartApp(): Promise<void>
  /** Nota de voz (guardada con savePastedFile) → texto, con Whisper en el propio equipo. */
  transcribeAudio(path: string, language?: string): Promise<string>
  /** Pide permiso para el micrófono (macOS); true si se puede grabar. */
  requestMicrophone(): Promise<boolean>
  /**
   * Descarga, compila y reinicia. Devuelve un mensaje solo si falla (si va bien, la app se reinicia).
   * Con setAside, los cambios locales del código se apartan antes (git stash: se guardan, no se borran).
   */
  applyUpdate(setAside?: boolean): Promise<string>
  setWebAccess(input: SetWebAccessInput): Promise<WebAccessInfo>
  /** Modelos disponibles para un agente (según su CLI y tu cuenta). */
  listModelOptions(agentId: AgentId): Promise<ModelOption[]>
  /** Modelos de un agente para tareas fáciles, normales y difíciles. */
  setAgentModels(input: SetAgentModelsInput): Promise<void>
  /** Elige (con un diálogo) la carpeta en la que los agentes trabajarán para este proyecto. */
  pickProjectFolder(projectId: string): Promise<ProjectSummary | null>
  /** Pone la carpeta de trabajo del proyecto en una ruta de este servidor (para clientes y navegadores). */
  setProjectFolder(projectId: string, dir: string): Promise<ProjectSummary>
  /** Retira el acceso a la carpeta de trabajo. */
  clearProjectFolder(projectId: string): Promise<ProjectSummary>
  /** Guarda un archivo pegado (Ctrl+V) y devuelve su ruta para adjuntarlo. */
  savePastedFile(name: string, data: Uint8Array): Promise<string>
  onEvent(cb: (e: CoworkEvent) => void): () => void
}
