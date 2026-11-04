// Calidad de cada agente a partir del registro de consumo (usage-runs.json): cuántas tareas hizo, cuántas le
// sirvieron al usuario (👍/👎), cuántas pasaron la verificación de otro agente a la primera, cuántas necesitaron
// corrección, cuántas fallaron o se pasaron a otro, y el tiempo y los tokens medianos. Por agente y por dificultad
// (AI Cowork no clasifica las tareas por tipo: la dificultad que pone el coordinador es lo que hay).
// Función pura: la usan el panel «Cómo rinde cada agente», la ficha que ve el coordinador y la API móvil.
import type { Difficulty, ProviderKind, UsageCall, UsageRun } from './types'

/** Dificultad de la tarea; «unknown» para registros anteriores a que se guardara. */
export type QualityGroup = Difficulty | 'unknown'

export interface QualityStats {
  /** Tareas en las que trabajó el agente (una tarea con varios intentos suyos cuenta una vez). */
  tasks: number
  /** Valoradas por el usuario y, de ellas, con 👍. */
  rated: number
  liked: number
  /**
   * Comprobadas por otro agente con un veredicto claro (CUMPLE o FALLOS); pasaron a la primera; necesitaron corrección
   * (el primer veredicto vio fallos) y, de esas, aprobadas tras corregir; y las que acabaron con fallos (requieren
   * intervención o se relevaron). Las «sin verificar» no cuentan en ninguna de estas: van aparte.
   */
  verified: number
  firstPass: number
  fixed: number
  passedAfterFix: number
  reviewFailed: number
  /** El verificador no dio un veredicto reconocible ni al pedírselo otra vez (no es aprobada ni suspendida). */
  unverified: number
  /** Fallaron con él (no pudo, o la terminó otro agente). */
  failed: number
  /** % de 👍 sobre las valoradas; % a la primera y % corregidas sobre las verificadas; % falladas sobre todas. null sin base. */
  likedPct: number | null
  firstPassPct: number | null
  fixedPct: number | null
  /** % sobre las verificadas. */
  passedAfterFixPct: number | null
  reviewFailedPct: number | null
  /** % sobre todas las tareas. */
  unverifiedPct: number | null
  failedPct: number | null
  /** Tiempo mediano de trabajo del agente en una tarea (incluida su corrección). */
  medianMs: number | null
  /** Tokens medianos (entrada + salida) por tarea; null si el agente no informa de sus tokens. */
  medianTokens: number | null
}

export interface AgentQuality extends QualityStats {
  agentId: string
  agentName: string
  provider: ProviderKind
  /** Lo mismo, por dificultad (fáciles, normales, difíciles y sin dato), solo las que tienen tareas. */
  byDifficulty: Array<QualityStats & { difficulty: QualityGroup }>
}

/** Mínimo de tareas para que el coordinador vea las cifras de calidad en la ficha (con menos, es ruido). */
export const QUALITY_MIN_TASKS = 5

export const DIFFICULTY_LABEL: Record<QualityGroup, string> = {
  easy: 'Fáciles',
  medium: 'Normales',
  hard: 'Difíciles',
  unknown: 'Sin dato'
}

const GROUP_ORDER: QualityGroup[] = ['hard', 'medium', 'easy', 'unknown']

/** Los becarios cuentan para su jefe («codex-becario-2» → «codex»). */
export const baseAgentId = (id: string): string => id.replace(/-becario-\d+$/, '')

/** Lo que hizo un agente en una tarea. */
interface Attempt {
  agentId: string
  ts: number
  difficulty: QualityGroup
  ok: boolean
  cancelled: boolean
  /** Veredictos del verificador sobre su trabajo, en orden (uno por revisión: la primera y las de cada corrección). */
  verdicts: Array<'pass' | 'fail' | 'unverified'>
  rating?: 'up' | 'down'
  durationMs: number
  tokens: number
  noTokens: boolean
}

/** Agrupa las llamadas de cada tarea y las reparte por agente. */
function attempts(runs: UsageRun[], from: number): Attempt[] {
  const out: Attempt[] = []
  for (const run of runs) {
    const byTask = new Map<string, UsageCall[]>()
    for (const c of run.calls) {
      if (!c.taskId || (c.kind !== 'task' && c.kind !== 'verify')) continue
      const list = byTask.get(c.taskId) ?? []
      list.push(c)
      byTask.set(c.taskId, list)
    }
    for (const calls of byTask.values()) {
      calls.sort((a, b) => a.ts - b.ts)
      const mine = new Map<string, Attempt>()
      let last: Attempt | undefined
      let rating: 'up' | 'down' | undefined
      for (const c of calls) {
        if (c.kind === 'verify') {
          // El veredicto es sobre el trabajo de quien acaba de hacer la tarea (el relevo tiene los suyos).
          if (last && c.verdict) last.verdicts.push(c.verdict)
          continue
        }
        rating ??= c.rating
        const id = baseAgentId(c.agentId)
        const a = mine.get(id) ?? {
          agentId: id,
          ts: c.ts,
          difficulty: c.difficulty ?? 'unknown',
          ok: false,
          cancelled: false,
          verdicts: [],
          durationMs: 0,
          tokens: 0,
          noTokens: false
        }
        a.ok = c.ok
        // Registros antiguos sin «cancelled»: una llamada que no salió bien en una petición cancelada se canceló.
        a.cancelled = !c.ok && (!!c.cancelled || (c.cancelled === undefined && run.status === 'cancelled'))
        if (c.difficulty) a.difficulty = c.difficulty
        a.durationMs += c.durationMs
        a.tokens += c.input + c.output
        a.noTokens ||= !!c.noTokens
        mine.set(id, a)
        last = a
      }
      for (const a of mine.values()) {
        if (a.cancelled || a.ts < from) continue
        // La valoración es del resultado que llegó al usuario: de quien la terminó, no de quien falló antes.
        if (a.ok) a.rating = rating
        out.push(a)
      }
    }
  }
  return out
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const v = [...values].sort((a, b) => a - b)
  const m = v.length >> 1
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2)
}

const pct = (part: number, total: number): number | null => (total > 0 ? Math.round((part / total) * 100) : null)

function stats(list: Attempt[]): QualityStats {
  const rated = list.filter((a) => a.rating)
  // Primer veredicto claro (el «sin verificar» de un intento no cuenta como aprobado ni como suspenso) y el último.
  const first = (a: Attempt) => a.verdicts.find((v) => v !== 'unverified')
  const final = (a: Attempt) => a.verdicts[a.verdicts.length - 1]
  const verified = list.filter((a) => first(a))
  const liked = rated.filter((a) => a.rating === 'up').length
  const firstPass = verified.filter((a) => first(a) === 'pass').length
  const fixed = verified.length - firstPass
  const passedAfterFix = verified.filter((a) => first(a) === 'fail' && final(a) === 'pass').length
  const reviewFailed = verified.filter((a) => final(a) === 'fail').length
  const unverified = list.filter((a) => a.verdicts.length && final(a) === 'unverified').length
  const failed = list.filter((a) => !a.ok).length
  return {
    tasks: list.length,
    rated: rated.length,
    liked,
    verified: verified.length,
    firstPass,
    fixed,
    passedAfterFix,
    reviewFailed,
    unverified,
    failed,
    likedPct: pct(liked, rated.length),
    firstPassPct: pct(firstPass, verified.length),
    fixedPct: pct(fixed, verified.length),
    passedAfterFixPct: pct(passedAfterFix, verified.length),
    reviewFailedPct: pct(reviewFailed, verified.length),
    unverifiedPct: pct(unverified, list.length),
    failedPct: pct(failed, list.length),
    medianMs: median(list.map((a) => a.durationMs)),
    medianTokens: median(list.filter((a) => !a.noTokens).map((a) => a.tokens))
  }
}

/**
 * Calidad de cada agente en las tareas desde `from` (ms; 0 = todo el registro), de más a menos tareas.
 * Solo cuenta tareas (no planificar ni verificar); lo cancelado no cuenta.
 */
export function agentQuality(runs: UsageRun[], from = 0): AgentQuality[] {
  const list = attempts(runs, from)
  // Nombre y programa: de las llamadas del propio agente (las de sus becarios dicen «Becario»).
  const info = new Map<string, { name: string; provider: ProviderKind }>()
  for (const run of runs) {
    for (const c of run.calls) {
      const id = baseAgentId(c.agentId)
      if (c.agentId === id || !info.has(id)) info.set(id, { name: c.agentId === id ? c.agentName : id, provider: c.provider })
    }
  }
  const byAgent = new Map<string, Attempt[]>()
  for (const a of list) byAgent.set(a.agentId, [...(byAgent.get(a.agentId) ?? []), a])
  return [...byAgent.entries()]
    .map(([agentId, mine]) => ({
      agentId,
      agentName: info.get(agentId)?.name ?? agentId,
      provider: info.get(agentId)?.provider ?? 'cli',
      ...stats(mine),
      byDifficulty: GROUP_ORDER.map((difficulty) => ({ difficulty, list: mine.filter((a) => a.difficulty === difficulty) }))
        .filter((g) => g.list.length)
        .map((g) => ({ difficulty: g.difficulty, ...stats(g.list) }))
    }))
    .sort((a, b) => b.tasks - a.tasks || a.agentName.localeCompare(b.agentName))
}

const took = (ms: number): string => (ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`)
const kTokens = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)} k` : String(n))

/** «le sirvieron 7 de 9 valoradas; verificación: 6 de 8 a la primera, 2 con corrección; 1 falló o pasó a otro». */
function statsPhrase(q: QualityStats): string {
  const parts: string[] = []
  if (q.rated) parts.push(`le sirvieron al usuario ${q.liked} de ${q.rated} valoradas`)
  if (q.verified)
    parts.push(
      `verificación: ${q.firstPass} de ${q.verified} a la primera${q.fixed ? `, ${q.fixed} ${q.fixed === 1 ? 'necesitó' : 'necesitaron'} corrección${q.passedAfterFix ? ` (${q.passedAfterFix} aprobada${q.passedAfterFix === 1 ? '' : 's'} después)` : ''}` : ''}${q.reviewFailed ? `, ${q.reviewFailed} sin superar la revisión` : ''}`
    )
  if (q.unverified) parts.push(`${q.unverified} sin verificar`)
  parts.push(q.failed ? `${q.failed} ${q.failed === 1 ? 'falló o pasó' : 'fallaron o pasaron'} a otro (${q.failedPct} %)` : 'ninguna falló')
  return parts.join('; ')
}

/**
 * Línea corta para la ficha del coordinador, o null si el agente tiene menos de QUALITY_MIN_TASKS tareas.
 * Por dificultad solo las que tienen al menos 3 tareas y se distinguen del total (fallos, correcciones o 👎).
 */
export function qualityLine(q: AgentQuality | null | undefined, days = 30): string | null {
  if (!q || q.tasks < QUALITY_MIN_TASKS) return null
  const cost = [q.medianMs != null && `unos ${took(q.medianMs)}`, q.medianTokens != null && `${kTokens(q.medianTokens)} tokens`].filter(Boolean).join(' y ')
  const groups = q.byDifficulty
    .filter((g) => g.difficulty !== 'unknown' && g.tasks >= 3 && (g.failed || g.fixed || g.unverified || g.rated > g.liked))
    .map((g) => `${DIFFICULTY_LABEL[g.difficulty].toLowerCase()} ${g.tasks}: ${statsPhrase(g)}`)
  return `calidad (${days} días, ${q.tasks} tareas): ${statsPhrase(q)}${cost ? `; mediana ${cost} por tarea` : ''}${groups.length ? ` · por dificultad → ${groups.join(' · ')}` : ''}`
}
