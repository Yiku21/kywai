import { balancedObject } from './agents/codex'

/** First balanced {...} that parses as JSON and looks like a plan (fenced ```json blocks first). */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const sources: string[] = []
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = fence.exec(text))) sources.push(m[1])
  sources.push(text)
  for (const src of sources) {
    let idx = src.indexOf('{')
    let attempts = 0
    while (idx >= 0 && attempts++ < 200) {
      const candidate = balancedObject(src, idx)
      if (candidate) {
        try {
          const o = JSON.parse(candidate) as unknown
          if (o && typeof o === 'object' && !Array.isArray(o)) {
            const r = o as Record<string, unknown>
            if ('reply' in r || 'tasks' in r) return r
          }
        } catch {
          /* keep scanning */
        }
      }
      idx = src.indexOf('{', idx + 1)
    }
  }
  return null
}

/** Lo mínimo de una tarea planificada que necesita streamlinePlan. */
export interface PlanItem {
  key: string
  title: string
  description: string
  agentId: string
  difficulty: 'easy' | 'medium' | 'hard'
  dependsOn: string[]
}

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

/** El usuario pidió expresamente que otro agente revise el trabajo («con revisión», «segunda opinión»…). */
export function wantsReview(userText: string): boolean {
  return /\bcon revision\b|que otro( agente)? (lo |la |le )?revise|segunda opinion|hazle una revision|haz una revision|revisalo (despues|al final)|y (luego|despues) (revisa|audita)/.test(
    fold(userText)
  )
}

/** El usuario no quiere que nadie compruebe el resultado («sin revisión», «sin verificar»): se salta el verificador. */
export function wantsNoReview(userText: string): boolean {
  return /\bsin (revision|revisar|verificar|verificacion|comprobar|comprobacion)\b|no (lo|la) (revises|verifiques|compruebes)/.test(fold(userText))
}

/** Revisiones, auditorías, validaciones y correcciones de lo que hizo otra tarea del mismo plan. */
const REVIEW_TITLE = /^(revis|audit|valid|verific|comprob|probar\b|testear|qa\b|control de calidad|correg|corrig|arregl|cerrar|cierre|pulir|repas)/
/** Tareas de diseñar antes de construir. */
const DESIGN_TITLE = /^(disen|arquitect|planific|contrato|especific|definir (la |el |los )?(arquitectura|estructura|api|contrato|esquema))/

/**
 * Plan más rápido. Encadenar tareas hace esperar y cada agente vuelve a leerlo todo desde cero, así que:
 * 1. Sin revisiones, validaciones ni correcciones encadenadas que el usuario no pidió: quien hace el trabajo
 *    ya lo prueba.
 * 2. Un «diseño» del que solo depende una tarea se junta con esa tarea: diseñar aparte solo sirve si luego
 *    construyen varios agentes a la vez.
 * 3. Las revisiones que sí se piden usan el modelo normal, no el más potente.
 * Devuelve el plan y qué se cambió (para el registro).
 */
export function streamlinePlan<T extends PlanItem>(items: T[], userText: string): { tasks: T[]; changes: string[] } {
  const changes: string[] = []
  let tasks = items.map((t) => ({ ...t, dependsOn: [...t.dependsOn] }))
  const isReview = (t: T): boolean => t.dependsOn.length > 0 && REVIEW_TITLE.test(fold(t.title))

  if (!wantsReview(userText)) {
    const dropped = new Map<string, string[]>()
    for (const t of tasks) {
      if (!isReview(t)) continue
      dropped.set(t.key, t.dependsOn)
      changes.push(`sin «${t.title}» (revisión no pedida)`)
    }
    if (dropped.size) {
      // Quien dependía de una tarea quitada pasa a depender de lo que dependía esa.
      const expand = (keys: string[], seen = new Set<string>()): string[] =>
        keys.flatMap((k) => {
          if (seen.has(k)) return []
          seen.add(k)
          return dropped.has(k) ? expand(dropped.get(k)!, seen) : [k]
        })
      tasks = tasks.filter((t) => !dropped.has(t.key))
      for (const t of tasks) t.dependsOn = [...new Set(expand(t.dependsOn))]
    }
  }

  for (const d of [...tasks]) {
    if (!DESIGN_TITLE.test(fold(d.title))) continue
    const dependents = tasks.filter((t) => t.dependsOn.includes(d.key))
    if (dependents.length !== 1) continue
    const impl = dependents[0]
    impl.description = `Antes de construir, ${d.title.charAt(0).toLowerCase()}${d.title.slice(1)}:\n${d.description}\n\nDespués:\n${impl.description}`
    impl.dependsOn = [...new Set([...impl.dependsOn.filter((k) => k !== d.key), ...d.dependsOn])]
    if (d.difficulty === 'hard') impl.difficulty = 'hard'
    tasks = tasks.filter((t) => t.key !== d.key)
    changes.push(`«${d.title}» lo hace quien construye («${impl.title}»)`)
  }

  for (const t of tasks) {
    if (isReview(t) && t.difficulty === 'hard') {
      t.difficulty = 'medium'
      changes.push(`«${t.title}» con el modelo normal`)
    }
  }
  return { tasks, changes }
}

/** El usuario pide expresamente que trabajen varios agentes a la vez («en equipo», «en paralelo»…). */
export function wantsTeam(userText: string): boolean {
  return /\ben equipo\b|\ben paralelo\b|varios agentes|todo el equipo|repart(e|id|anlo|elo)( el trabajo)? entre/.test(fold(userText))
}

/** El usuario pide que lo haga un solo agente. */
export function wantsSolo(userText: string): boolean {
  return /\bun solo agente\b|\bsin repartir\b|no (lo )?repartas|\b(hazlo|que lo haga) solo (codex|claude|gemini)\b/.test(fold(userText))
}

/** El usuario quiere dos versiones del mismo trabajo para elegir («a dos manos», «dos opciones», «dos propuestas»…). */
export function wantsTwoHands(userText: string): boolean {
  return /\ba dos manos\b|\b(dos|varias|2) (opciones|versiones|propuestas|alternativas)\b|\bbest[- ]of\b/.test(fold(userText))
}

/** El usuario quiere una sola versión («a una mano», «una sola versión»). */
export function wantsOneHand(userText: string): boolean {
  return /\ba una mano\b|\b(una sola|solo una) (opcion|version|propuesta)\b|\bsin (opciones|alternativas)\b/.test(fold(userText))
}

/** Lo que hace falta saber de un agente para repartir «a dos manos». */
export interface HandAgent {
  id: string
  name: string
  /** Familia (claude, codex, gemini…): las dos manos y el juez son de familias distintas. */
  provider: string
  /** No puede leer ni crear archivos: no sirve de mano ni de juez. */
  textOnly?: boolean
  /** Modelo local: demasiado lento para esto. */
  local?: boolean
}

/** Una tarea planificada con lo que necesita twoHandsPlan. */
export interface HandTask extends PlanItem {
  deliverable: 'file' | 'text'
  acceptance: string
  files: string[]
  continues: boolean
}

export const WINNER_RE = /\bGANA:\s*([AB])\b/i

/**
 * «A dos manos»: el usuario lo pidió y el plan es una sola tarea con archivos → otro agente de otra familia hace la
 * misma tarea por su cuenta en su carpeta (opcion-a/ y opcion-b/ bajo baseDir) y un tercero de otra familia abre
 * las dos, las compara contra la petición y dice cuál gana. Es el único método que sube el techo de calidad de forma
 * consistente en lo que depende del gusto. Si no aplica (no se pidió, continuación, solo texto, no hay otro agente),
 * devuelve el plan tal cual. Los agentes llegan en orden de preferencia.
 */
export function twoHandsPlan<T extends HandTask>(tasks: T[], userText: string, agents: HandAgent[], baseDir: string): { tasks: T[]; change?: string } {
  if (!wantsTwoHands(userText) || wantsOneHand(userText) || tasks.length !== 1) return { tasks }
  const a = tasks[0]
  if (a.deliverable !== 'file' || a.continues) return { tasks }
  const author = agents.find((x) => x.id === a.agentId)
  if (!author) return { tasks }
  const fits = (x: HandAgent): boolean => !x.textOnly && !x.local
  const b = agents.find((x) => x.id !== author.id && x.provider !== author.provider && fits(x))
  if (!b) return { tasks, change: `«${a.title}» no puede ir a dos manos: hace falta otro agente de otra familia disponible` }
  const judge = agents.find((x) => x.provider !== author.provider && x.provider !== b.provider && fits(x)) ?? author
  const dirA = `${baseDir}opcion-a/`
  const dirB = `${baseDir}opcion-b/`
  const note = (dir: string, other: string): string =>
    `\n\nEsta tarea va «a dos manos»: ${other} hace la misma tarea por su cuenta y después un tercer agente compara las dos contra la petición. Crea TODO dentro de ${dir} (nada fuera de esa carpeta) y no mires ni toques la carpeta de la otra opción. Hazla lo mejor que sepas: es tu versión completa, no un borrador.`
  const handA: T = { ...a, title: `${a.title} (opción A)`, description: `${a.description}${note(dirA, b.name)}`, files: [dirA] }
  const handB: T = { ...a, key: `${a.key}-b`, agentId: b.id, title: `${a.title} (opción B)`, description: `${a.description}${note(dirB, author.name)}`, files: [dirB] }
  const judgeTask: T = {
    ...a,
    key: `${a.key}-juez`,
    title: `Elegir la mejor opción de «${a.title}»`,
    agentId: judge.id,
    difficulty: 'medium',
    dependsOn: [handA.key, handB.key],
    deliverable: 'text',
    files: [],
    continues: false,
    acceptance: 'El veredicto empieza con «GANA: A» o «GANA: B» y se apoya en lo visto en las dos carpetas',
    description: [
      `Dos agentes han hecho por separado la tarea «${a.title}» para esta petición del usuario: la opción A en ${dirA} (de ${author.name}) y la opción B en ${dirB} (de ${b.name}). Tú eliges cuál es mejor.`,
      `Abre las dos carpetas y pruébalas de verdad (si es una web o una app, ábrela o ejecútala; si no puedes, lee el código con cuidado). Valora en este orden: 1) fidelidad a lo que pidió el usuario (nada que falte ni que sobre), 2) que funcione sin errores, 3) calidad visual y de uso, 4) limpieza y claridad del código. Para no favorecer a la que miras primero, compáralas en los dos órdenes (A frente a B y B frente a A) y quédate con el veredicto que se mantenga.`,
      `Responde empezando con «GANA: A» o «GANA: B» y, debajo, en 5 a 10 líneas: por qué gana, qué tiene mejor la otra y qué cambiarías de la ganadora. No cambies ningún archivo.`,
      judge.id === author.id ? 'Tú hiciste la opción A: sé especialmente exigente con ella.' : ''
    ]
      .filter(Boolean)
      .join('\n\n')
  }
  return { tasks: [handA, handB, judgeTask], change: `«${a.title}» a dos manos: ${author.name} (A) y ${b.name} (B); ${judge.name} elige` }
}

/**
 * 'valid': la respuesta traía el objeto JSON pedido (si no, es texto libre del planificador).
 * 'contract': acuerdo común para las tareas que se hacen a la vez (archivos de cada una, funciones, rutas…).
 * 'memory': lo que el usuario decidió o pidió en este mensaje y hay que recordar (sin validar: ver memory.ts).
 */
export function parsePlan(text: string): { reply: string; tasks: unknown[]; valid: boolean; contract: string; memory: unknown[] } {
  const o = extractJsonObject(text)
  if (!o) return { reply: text.trim(), tasks: [], valid: false, contract: '', memory: [] }
  const c = o.contract
  const contract = typeof c === 'string' ? c.trim() : c && typeof c === 'object' ? JSON.stringify(c, null, 2) : ''
  return {
    reply: typeof o.reply === 'string' ? o.reply : '',
    tasks: Array.isArray(o.tasks) ? o.tasks : [],
    valid: true,
    contract: contract.slice(0, 12_000),
    memory: Array.isArray(o.memory) ? o.memory : []
  }
}

// Palabras de una respuesta que solo da el visto bueno al plan («sí, adelante», «ok, dale», «perfecto, empieza»).
const APPROVE_CORE = new Set([
  'si', 'ok', 'okay', 'okey', 'vale', 'dale', 'adelante', 'aprobado', 'apruebo', 'apruebalo', 'perfecto', 'procede',
  'hazlo', 'venga', 'correcto', 'bien', 'acuerdo', 'genial', 'claro', 'listo', 'excelente', 'empieza', 'empezad',
  'comienza', 'arranca', 'sigue', 'continua', 'go', 'yes', 'ejecuta', 'ejecutalo', 'manos',
  // En inglés (la interfaz puede estar en inglés): «yes, go ahead», «looks good», «sure, start».
  'yep', 'yeah', 'sure', 'approve', 'approved', 'proceed', 'start', 'perfect', 'great', 'good', 'fine', 'lgtm', 'alright'
])
const APPROVE_FILLER = new Set([
  'y', 'pues', 'entonces', 'por', 'favor', 'gracias', 'todo', 'ya', 'lo', 'el', 'plan', 'asi', 'eso', 'me', 'parece',
  'esta', 'de', 'puedes', 'podeis', 'empezar', 'a', 'la', 'obra', 'con', 'muy', 'super', 'tal', 'cual', 'como', 'dices',
  'it', 'ahead', 'please', 'thanks', 'thank', 'you', 'the', 'that', 'this', 'looks', 'sounds', 'do', 'let', 'lets', 's',
  'all', 'right', 'with', 'on', 'very'
])

/**
 * La respuesta del usuario a un plan propuesto es solo un «sí» (sin cambios ni preguntas): se aprueba sin
 * volver a planificar. Cualquier otra cosa («sí, pero…», «no», «cambia…») se toma como cambios al plan.
 */
export function isPlanApproval(text: string): boolean {
  const words = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length || words.length > 8) return false
  return words.every((w) => APPROVE_CORE.has(w) || APPROVE_FILLER.has(w)) && words.some((w) => APPROVE_CORE.has(w))
}
