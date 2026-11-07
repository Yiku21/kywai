// Catálogo de agentes que se pueden añadir a kywai y cómo se construye uno nuevo (aspecto, estación, ficha).
// kywai no es solo para los agentes de fábrica: es una plataforma donde conectas los que ya pagas.
import type { AddAgentInput, AgentConfig, CliAgentSpec, ProviderKind, RobotAvatar, StationConfig } from './types'
import { DEFAULT_AGENTS, DEFAULT_STATIONS } from './defaults'
import { GENERIC_CATALOG } from './agentCatalogData'

export interface CatalogEntry {
  id: string
  name: string
  /** Qué hace (una frase). */
  summary: string
  /** Con qué cuenta o suscripción funciona. */
  account: string
  /**
   * builtin: tiene adaptador propio (lee su salida estructurada, cuotas, herramientas…).
   * cli: cualquier programa de terminal que atiende un encargo y devuelve texto.
   */
  kind: 'builtin' | 'cli'
  /** Su forma de lanzarlo está comprobada con su documentación. Si no, se avisa de que puede necesitar ajustes. */
  verified: boolean
  /** Se puede añadir más de una vez (modelos locales). */
  repeatable?: boolean
  color: string
  role: string
  strengths: string[]
  avoid?: string[]
  /** builtin: el agente de fábrica que sirve de plantilla. */
  template?: string
  cli?: CliAgentSpec
  /** Una advertencia (por ejemplo, que solo funciona con clave de API). */
  note?: string
}

/** Los agentes con adaptador propio: salen de los de fábrica. */
const BUILTINS: CatalogEntry[] = [
  {
    id: 'hermes',
    name: 'Hermes',
    summary: 'Coordinador: planifica y reparte el trabajo entre los demás, con memoria entre sesiones.',
    account: 'Necesita un proveedor de modelos (OmniRoute, Nous Portal u otra cuenta).',
    kind: 'builtin',
    verified: true,
    template: 'hermes',
    color: '#ffe6ba',
    role: '',
    strengths: []
  },
  {
    id: 'claude',
    name: 'Claude',
    summary: 'Diseño, textos y código de calidad.',
    account: 'Con tu suscripción de Claude (Pro o Max).',
    kind: 'builtin',
    verified: true,
    template: 'claude',
    color: '#ff7a1f',
    role: '',
    strengths: []
  },
  {
    id: 'codex',
    name: 'Codex',
    summary: 'Programación y tareas técnicas; el único que genera imágenes.',
    account: 'Con tu cuenta de ChatGPT.',
    kind: 'builtin',
    verified: true,
    template: 'codex',
    color: '#21c07c',
    role: '',
    strengths: []
  },
  {
    id: 'gemini',
    name: 'Gemini',
    summary: 'Análisis, investigación y documentos largos.',
    account: 'Con tu cuenta de Google o una clave de API.',
    kind: 'builtin',
    verified: true,
    template: 'gemini',
    color: '#2a7bff',
    role: '',
    strengths: []
  },
  {
    id: 'muse',
    name: 'Muse',
    summary: 'Vídeos y refuerzo cuando los demás no tienen cuota.',
    account: 'Con tu suscripción de Muse Code (cuenta de Meta).',
    kind: 'builtin',
    verified: true,
    template: 'muse',
    color: '#8fb4ff',
    role: '',
    strengths: []
  }
]

export const AGENT_CATALOG: CatalogEntry[] = [...BUILTINS, ...GENERIC_CATALOG]

export function catalogEntry(id: string): CatalogEntry | undefined {
  return AGENT_CATALOG.find((e) => e.id === id)
}

// ---------- Aspecto de un agente nuevo ----------

const BODIES: RobotAvatar['body'][] = ['capsule', 'egg', 'blob', 'cube', 'dome', 'bulb']
const ACCESSORIES: RobotAvatar['accessory'][] = ['ears', 'antenna', 'tuft', 'vents', 'halo', 'none']
const EYES: RobotAvatar['eyes'][] = ['round', 'pill', 'arc', 'chevron', 'dots', 'wave']

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Un robot propio para cada agente nuevo, siempre el mismo para el mismo identificador. */
export function generatedAvatar(id: string, color: string): RobotAvatar {
  const h = hash(id)
  return {
    body: BODIES[h % BODIES.length],
    accessory: ACCESSORIES[(h >> 3) % ACCESSORIES.length],
    eyes: EYES[(h >> 6) % EYES.length],
    logo: 'none',
    eyeColor: color,
    accentColor: '#2b3550',
    trimColor: '#9fb2d4'
  }
}

const PALETTE = ['#e0526b', '#d99a2b', '#6cc24a', '#3fb8c9', '#7a6ff0', '#c86bd6', '#e8743b', '#4fa3e0', '#9bbf3b', '#d8567e']

export function generatedColor(id: string): string {
  return PALETTE[hash(id) % PALETTE.length]
}

// ---------- Estaciones ----------

/** Lugares libres del espacio digital para las estaciones nuevas (entre las de fábrica y las zonas). */
const FREE_SPOTS: [number, number][] = [
  [-3.6, -8.2],
  [-9.4, -5.6],
  [9.6, -5.4],
  [9.8, 2.2],
  [-3.4, 8.2],
  [4.6, 8.4],
  [-9.6, 1.9],
  [0, -10.6],
  [-11.6, -2.4],
  [11.8, -1.8]
]

/** Una estación en un sitio libre (sin pisar a las que ya hay). */
export function allocateStation(existing: StationConfig[], id: string, label: string): StationConfig {
  const free = (p: [number, number]): boolean => existing.every((s) => Math.hypot(s.position[0] - p[0], s.position[1] - p[1]) > 3.4)
  let position = FREE_SPOTS.find(free)
  if (!position) {
    // Más agentes que huecos preparados: en un anillo más grande, dando vueltas hasta encontrar sitio.
    for (let r = 13; !position && r < 30; r += 3.2) {
      for (let a = 0; a < 360 && !position; a += 24) {
        const p: [number, number] = [Math.round(r * Math.cos((a * Math.PI) / 180) * 10) / 10, Math.round(r * Math.sin((a * Math.PI) / 180) * 10) / 10]
        if (free(p)) position = p
      }
    }
  }
  return { id, label, position: position ?? [0, -12] }
}

// ---------- Construir un agente ----------

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export interface BuiltAgent {
  agent: AgentConfig
  /** Estación que hay que crear (si el agente de fábrica ya tiene la suya, no hace falta). */
  station?: StationConfig
}

/**
 * Construye el agente que se pide (del catálogo o a medida), con identificador libre, aspecto y estación.
 * `existingAgents` y `existingStations` son los que ya hay en la configuración.
 */
export function buildAgent(input: AddAgentInput, existingAgents: AgentConfig[], existingStations: StationConfig[]): BuiltAgent {
  const taken = new Set(existingAgents.map((a) => a.id))
  const entry = input.presetId ? catalogEntry(input.presetId) : undefined
  if (input.presetId && !entry) throw new Error('Ese agente no está en el catálogo')

  // Agente con adaptador propio: se recupera el de fábrica tal cual (con su estación y su aspecto).
  if (entry?.kind === 'builtin' && entry.template) {
    const def = DEFAULT_AGENTS.find((a) => a.id === entry.template)
    if (!def) throw new Error('Plantilla no encontrada')
    if (taken.has(def.id)) throw new Error(`${def.name} ya está en tu equipo`)
    // Su estación de fábrica, si se quitó junto con él.
    const factory = existingStations.some((s) => s.id === def.stationId) ? undefined : DEFAULT_STATIONS.find((s) => s.id === def.stationId)
    return { agent: { ...clone(def), name: input.name?.trim() || def.name, enabled: true }, ...(factory ? { station: clone(factory) } : {}) }
  }

  const spec: CliAgentSpec | undefined = entry?.cli ? clone(entry.cli) : input.custom ? ({ versionArgs: ['--version'], ...clone(input.custom) } as CliAgentSpec) : undefined
  if (!spec) throw new Error('Falta indicar qué agente añadir')
  if (!/^[\w.-]+$/.test(spec.command)) throw new Error('El nombre del programa solo puede llevar letras, números, punto, guion y guion bajo')
  if (!['stdin', 'file', 'arg'].includes(spec.promptVia)) throw new Error('promptVia no válido')

  const name = (input.name?.trim() || entry?.name || spec.command).slice(0, 40)
  const slug = (entry?.id ?? spec.command).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agente'
  const id = uniqueId(slug, taken)
  const color = entry?.color ?? generatedColor(id)
  const stationId = `st-${id}`
  const station = allocateStation(existingStations, stationId, name.length > 14 ? 'Agente' : name)
  const provider: ProviderKind = 'cli'
  const agent: AgentConfig = {
    id,
    name,
    provider,
    model: '',
    modelLabel: 'Auto',
    color,
    avatar: generatedAvatar(id, color),
    stationId,
    role: entry?.role ?? 'Agente conectado: trabaja con tu propia suscripción',
    strengths: entry ? [...entry.strengths] : [],
    ...(entry?.avoid ? { avoid: [...entry.avoid] } : {}),
    enabled: true,
    cli: { ...spec, ...(entry ? { presetId: entry.id } : {}) }
  }
  return { agent, station }
}
