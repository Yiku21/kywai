import type { AppConfig, AgentConfig, RobotAvatar, StationConfig } from './types'

/** Color de los sub-agentes ("becarios"). */
export const SUBAGENT_COLOR = '#ffc21a'

/** Motivo de las tareas que quedaron a medias al cerrar la app (se pueden reanudar). */
export const INTERRUPTED_ERROR = 'Interrumpida al cerrar la app'

export const DEFAULT_STATIONS: StationConfig[] = [
  { id: 'st-gemini', label: 'Análisis', position: [-6.2, -3.2] },
  { id: 'st-qwen', label: 'Organización', position: [-0.6, -5.4] },
  { id: 'st-claude', label: 'Diseño', position: [5.6, -3.6] },
  { id: 'st-codex', label: 'Código', position: [5.8, 3.4] },
  { id: 'st-sub-1', label: 'Apoyo', position: [-5.6, 3.6], forSubagents: true },
  { id: 'st-hermes', label: 'Coordinación', position: [0.2, 5.6] },
  // Al fondo, entre Organización y Diseño: libre de zonas y de los circuitos principales.
  { id: 'st-muse', label: 'Investigación', position: [3.2, -8] }
]

export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'hermes',
    name: 'Hermes',
    provider: 'hermes',
    model: '',
    modelLabel: 'Hermes Agent',
    color: '#ffe6ba',
    avatar: { body: 'dome', accessory: 'hair', eyes: 'round', logo: 'hermes', eyeColor: '#ffc65a', accentColor: '#141419', trimColor: '#d6a743' },
    stationId: 'st-hermes',
    role: 'Coordinador: planifica y reparte el trabajo (con memoria entre sesiones)',
    strengths: [],
    enabled: true,
    plannerOnly: true
  },
  {
    id: 'gemini',
    name: 'Gemini',
    provider: 'gemini',
    // Fijado (no «Auto»): con clave gratuita, Auto puede intentar Gemini Pro, que es solo de pago.
    model: 'gemini-3.8-flash',
    modelLabel: '3.8 Flash',
    lightModel: 'gemini-3.5-flash-lite',
    lightModelLabel: '3.5 Flash-Lite',
    color: '#2a7bff',
    avatar: { body: 'capsule', accessory: 'ears', eyes: 'round', logo: 'gemini', eyeColor: '#6ef3ff', accentColor: '#3ab8ff' },
    stationId: 'st-gemini',
    role: 'Leer mucho material, resumir y traducir',
    strengths: [
      'leer y resumir documentos o carpetas enormes (contexto de 1 millón de tokens)',
      'resúmenes, traducciones e informes rápidos',
      'extraer datos de PDFs y documentos'
    ],
    avoid: [
      'construir apps o programas: Claude y Codex son claramente mejores',
      'investigar en internet con clave gratuita: la búsqueda de Google solo funciona con clave de pago',
      'generar imágenes: puede, pero no alcanzan la calidad necesaria; las genera Codex'
    ],
    enabled: true,
    quotaGroupId: 'google'
  },
  {
    id: 'qwen',
    name: 'Qwen',
    provider: 'ollama',
    model: 'qwen3:14b',
    modelLabel: 'Local 14B',
    color: '#8a55ff',
    avatar: { body: 'egg', accessory: 'none', eyes: 'pill', logo: 'qwen', eyeColor: '#ecdcff' },
    stationId: 'st-qwen',
    role: 'Tareas cortas y sencillas (gratis, en tu equipo)',
    strengths: ['formatear, ordenar y clasificar texto', 'extraer datos de un texto a una lista o JSON', 'resúmenes cortos (textos de menos de unas 8.000 palabras)'],
    avoid: ['programar o tareas largas: en un Mac mini va a unos 12–34 tokens por segundo', 'tareas que necesiten la terminal'],
    enabled: true,
    quotaGroupId: 'local'
  },
  {
    id: 'claude',
    name: 'Claude',
    provider: 'claude',
    model: 'sonnet',
    modelLabel: 'Sonnet',
    lightModel: 'haiku',
    lightModelLabel: 'Haiku',
    strongModel: 'opus',
    strongModelLabel: 'Opus',
    color: '#ff7a1f',
    avatar: { body: 'blob', accessory: 'tuft', eyes: 'arc', logo: 'claude', eyeColor: '#fff0c8' },
    stationId: 'st-claude',
    role: 'Interfaces, textos en español y código complejo',
    strengths: [
      'interfaces y diseño visual (Opus 5.5: 1.º en WebDev Arena)',
      'textos y documentación en español (los mejores de la clasificación en español de LMArena)',
      'entender y cambiar código grande o desconocido',
      'backend y algoritmos difíciles (Opus 5.5: 1.º en Terminal-Bench 4.0)',
      'apps completas en las que importa mucho el diseño'
    ],
    avoid: [
      'tareas mecánicas o de mero volumen: gastan más cuota que Codex por el mismo resultado',
      'usar Opus si basta Sonnet: Opus tarda más y gasta varias veces más cuota'
    ],
    enabled: true,
    quotaGroupId: 'anthropic'
  },
  {
    id: 'codex',
    name: 'Codex',
    provider: 'codex',
    model: 'gpt-6.1-sol',
    modelLabel: 'GPT-6.1 Sol',
    lightModel: 'gpt-6-luna',
    lightModelLabel: 'GPT-6 Luna',
    // Lo difícil con GPT-6.1 Sol y esfuerzo muy alto: iguala a Astra con 1/5 de su gasto (medido).
    strongModel: 'gpt-6.1-sol',
    strongModelLabel: 'GPT-6.1 Sol',
    color: '#21c07c',
    avatar: { body: 'cube', accessory: 'vents', eyes: 'chevron', logo: 'openai', eyeColor: '#8cffd0' },
    stationId: 'st-codex',
    role: 'Programación rápida (apps, scripts, terminal) y el único que genera imágenes',
    strengths: [
      'apps y scripts completos de principio a fin (el mejor en calidad por minuto: ~11 min por tarea)',
      'encontrar y arreglar errores, hacer pasar las pruebas (≈73–75 % en DeepSWE)',
      'trabajo con la terminal: instalar, ejecutar, automatizar',
      'servidores, APIs y procesar datos',
      'generar imágenes (ilustraciones, iconos, fotos, conceptos visuales): es el único del equipo que las hace con calidad'
    ],
    avoid: [
      'textos largos en español: queda muy por debajo de Claude en la clasificación en español',
      'diseño de interfaces muy cuidado: Claude es mejor (las imágenes sí las genera Codex)'
    ],
    enabled: true,
    quotaGroupId: 'openai'
  },
  {
    id: 'muse',
    name: 'Muse',
    provider: 'muse',
    // Sin modelo fijo: el que tenga Muse Code configurado (así se respeta su modo Contributor, mucho más barato).
    model: '',
    modelLabel: 'Spark 1.3',
    // Nacarado con el azul de Meta en ojos, logo y aro (el azul intenso ya es de Gemini).
    color: '#d3dcf6',
    avatar: { body: 'bulb', accessory: 'halo', eyes: 'wave', logo: 'muse', eyeColor: '#3d9bff', accentColor: '#5fb3ff', trimColor: '#9fb3d6' },
    stationId: 'st-muse',
    // Su cuota es muy pequeña: solo lo que los demás no pueden hacer (vídeo) o cuando no tienen cuota.
    role: 'Vídeos y refuerzo cuando Claude o Codex no tienen cuota',
    strengths: ['entender vídeos: los ve directamente (Claude y Codex no pueden)'],
    avoid: [
      'imágenes, PDFs, capturas y búsquedas en internet: Claude y Codex lo hacen igual de bien, y la cuota de Muse es muy pequeña (10–50 encargos cada 5 horas)',
      'programar o trabajo largo mientras Claude o Codex estén disponibles y con cuota: guárdalo para cuando no lo estén',
      'es nuevo en el equipo (septiembre de 2026): para lo crítico, mejor Claude o Codex'
    ],
    enabled: true,
    quotaGroupId: 'meta'
  }
]

export const CONFIG_VERSION = 10

/** Fichas de versiones anteriores (6, 7 y 8), para saber si el usuario no las cambió. */
const LEGACY_STRENGTHS: Record<string, string[][]> = {
  gemini: [
    ['contexto largo', 'investigación', 'resúmenes', 'leer documentos'],
    [
      'leer y resumir documentos o carpetas muy grandes (contexto muy largo)',
      'investigar en internet y comparar opciones',
      'informes, resúmenes y traducciones',
      'extraer datos de PDFs y documentos'
    ],
    // Versión 8 (sin «no generar imágenes»).
    ['leer y resumir documentos o carpetas enormes (contexto de 1 millón de tokens)', 'resúmenes, traducciones e informes rápidos', 'extraer datos de PDFs y documentos']
  ],
  qwen: [
    ['tareas simples', 'extraer datos', 'formatear', 'listas'],
    ['formatear, ordenar y clasificar texto', 'extraer datos concretos de un texto', 'resúmenes cortos', 'listas y borradores rápidos']
  ],
  claude: [
    ['diseño', 'interfaces', 'redacción', 'revisión', 'código'],
    [
      'apps y webs completas de principio a fin',
      'interfaces (HTML, CSS, React), diseño visual y accesibilidad',
      'cambios grandes en código existente (ampliar, reorganizar)',
      'textos y documentación cuidados en español',
      'análisis y razonamiento complejo'
    ]
  ],
  // Primera ficha de Muse (11-10-2026): lo daba por bueno en imágenes, PDFs, búsquedas y código.
  muse: [
    [
      'buscar en internet (su suscripción incluye búsqueda web)',
      'entender imágenes, PDFs y vídeos: los lee directamente',
      'leer mucho de golpe: contexto de 1 millón de tokens',
      'programar con la terminal: edita archivos y ejecuta comandos, como Codex'
    ]
  ],
  codex: [
    ['programar', 'scripts', 'pruebas', 'optimizar'],
    [
      'apps y scripts completos de principio a fin',
      'lógica, algoritmos, servidores y APIs',
      'encontrar y arreglar errores, hacer pasar las pruebas',
      'trabajo con la terminal: instalar, ejecutar, automatizar',
      'procesar datos y archivos'
    ],
    // Versión 8 (antes de que fuera el que genera las imágenes).
    [
      'apps y scripts completos de principio a fin (el mejor en calidad por minuto: ~11 min por tarea)',
      'encontrar y arreglar errores, hacer pasar las pruebas (≈73–75 % en DeepSWE)',
      'trabajo con la terminal: instalar, ejecutar, automatizar',
      'servidores, APIs y procesar datos'
    ]
  ]
}

/** Roles de versiones anteriores que el usuario no cambió (versión 10: el de Codex dice que genera las imágenes). */
const LEGACY_ROLES: Record<string, string[]> = {
  codex: ['Programación rápida: apps, scripts y terminal']
}

/** Pone el rol actual si seguía uno anterior sin cambiar. Devuelve true si lo actualizó. */
export function upgradeAgentRole(a: AgentConfig): boolean {
  const def = DEFAULT_AGENTS.find((d) => d.id === a.id)
  if (!def || !LEGACY_ROLES[a.id]?.includes(a.role)) return false
  a.role = def.role
  return true
}

/**
 * Fichas de agente con datos verificados (qué se le da mejor y qué evitar). Se ponen solo si el usuario no
 * cambió las anteriores. Devuelve true si la actualizó.
 */
export function upgradeAgentProfile(a: AgentConfig): boolean {
  const legacy = LEGACY_STRENGTHS[a.id]
  const def = DEFAULT_AGENTS.find((d) => d.id === a.id)
  if (!legacy || !def) return false
  const same = legacy.some((l) => a.strengths.length === l.length && a.strengths.every((s, i) => s === l[i]))
  if (!same) return false
  a.role = def.role
  a.strengths = [...def.strengths]
  a.avoid = def.avoid ? [...def.avoid] : undefined
  return true
}

/**
 * Versión 8: modelos según lo medido, solo si seguían los de antes. Codex: lo difícil con GPT-6.1 Sol (y
 * esfuerzo muy alto) en vez de GPT-6 Astra, que gasta 5 veces más sin hacerlo mejor. Gemini: 3.8 Flash fijo en
 * vez de «Auto» (que con clave gratuita puede intentar Pro, de pago) y 3.5 Flash-Lite como ligero.
 */
export function upgradeAgentModels(a: AgentConfig): boolean {
  const def = DEFAULT_AGENTS.find((d) => d.id === a.id)
  if (!def) return false
  let changed = false
  if (a.provider === 'codex' && a.strongModel === 'gpt-6-astra') {
    a.strongModel = def.strongModel
    a.strongModelLabel = def.strongModelLabel
    changed = true
  }
  if (a.provider === 'gemini') {
    if (!a.model) {
      a.model = def.model
      a.modelLabel = def.modelLabel
      changed = true
    }
    if (a.lightModel === 'gemini-3.1-flash-lite') {
      a.lightModel = def.lightModel
      a.lightModelLabel = def.lightModelLabel
      changed = true
    }
  }
  return changed
}

export const DEFAULT_CONFIG: AppConfig = {
  configVersion: CONFIG_VERSION,
  workspaceRoot: '',
  agents: DEFAULT_AGENTS,
  stations: DEFAULT_STATIONS,
  quotaGroups: [
    { id: 'anthropic', label: 'Claude', provider: 'claude' },
    { id: 'openai', label: 'GPT', provider: 'codex' },
    { id: 'google', label: 'Gemini', provider: 'gemini' },
    // Plan «Uso diario» de Muse Code: entre 10 y 50 encargos cada 5 horas (Muse no informa de lo que queda).
    { id: 'meta', label: 'Muse', provider: 'muse', budget: { limit: 20, unit: 'solicitudes', period: '5h' } },
    { id: 'local', label: 'Local', provider: 'local', unlimited: true }
  ],
  thresholds: { warn: 20, alert: 10 },
  plannerOrder: ['hermes', 'claude', 'gemini', 'codex'],
  maxParallel: 3,
  agentAccess: 'full',
  planApproval: true,
  setupDone: false,
  webAccess: { enabled: false, port: 8787, token: '' }
}

export type QuotaLevel = 'normal' | 'warn' | 'alert' | 'empty' | 'unknown' | 'unlimited'

export function quotaLevel(
  pct: number | null | undefined,
  t: { warn: number; alert: number },
  unlimited?: boolean
): QuotaLevel {
  if (unlimited) return 'unlimited'
  if (pct == null || Number.isNaN(pct)) return 'unknown'
  if (pct <= 0) return 'empty'
  if (pct < t.alert) return 'alert'
  if (pct <= t.warn) return 'warn'
  return 'normal'
}

export const SUBAGENT_AVATAR: RobotAvatar = {
  body: 'capsule',
  accessory: 'antenna',
  eyes: 'dots',
  logo: 'becario',
  eyeColor: '#fff4b0',
  accentColor: '#fff3c0'
}

const PROVIDER_AVATAR: Record<string, RobotAvatar> = {
  gemini: { body: 'capsule', accessory: 'ears', eyes: 'round', logo: 'gemini', eyeColor: '#6ef3ff', accentColor: '#3ab8ff' },
  ollama: { body: 'egg', accessory: 'none', eyes: 'pill', logo: 'qwen', eyeColor: '#ecdcff' },
  qwen: { body: 'egg', accessory: 'none', eyes: 'pill', logo: 'qwen', eyeColor: '#ecdcff' },
  lmstudio: { body: 'egg', accessory: 'none', eyes: 'pill', logo: 'local', eyeColor: '#ecdcff' },
  hermes: { body: 'dome', accessory: 'hair', eyes: 'round', logo: 'hermes', eyeColor: '#ffc65a', accentColor: '#141419', trimColor: '#d6a743' },
  claude: { body: 'blob', accessory: 'tuft', eyes: 'arc', logo: 'claude', eyeColor: '#fff0c8' },
  codex: { body: 'cube', accessory: 'vents', eyes: 'chevron', logo: 'openai', eyeColor: '#8cffd0' },
  muse: { body: 'bulb', accessory: 'halo', eyes: 'wave', logo: 'muse', eyeColor: '#3d9bff', accentColor: '#5fb3ff', trimColor: '#9fb3d6' }
}

/** Apariencia efectiva de un agente. */
export function avatarFor(agent: Pick<AgentConfig, 'avatar' | 'provider' | 'isSubagent'>): RobotAvatar {
  if (agent.avatar) return agent.avatar
  if (agent.isSubagent) return SUBAGENT_AVATAR
  return PROVIDER_AVATAR[agent.provider] ?? SUBAGENT_AVATAR
}

/** Logo del robot local según la familia del modelo. */
export function localLogoFor(model: string): RobotAvatar['logo'] {
  return /qwen/i.test(model) ? 'qwen' : 'local'
}
