// Ficha de cada agente para el coordinador: qué se le da mejor, qué evitar, sus modelos, cuánta cuota le queda
// y cómo le ha ido en AI Cowork (tareas, aciertos, tiempo y calidad). Así reparte con datos y no solo por el nombre.
import type { AgentConfig, Difficulty, QuotaInfo, UsageRun } from '@shared/types'
import { EFFORT_LABEL, effortFor, modelFacts } from '@shared/modelCatalog'
import { agentQuality, qualityLine, type AgentQuality } from '@shared/agentQuality'

export interface AgentHistory {
  tasks: number
  okPct: number
  medianMs: number
  /** Resultados que el usuario valoró con 👍 y con 👎 (si valoró alguno). */
  liked?: number
  disliked?: number
}

/** Cómo le ha ido a un agente (y a sus becarios) en las tareas de los últimos días. */
export function agentHistory(runs: UsageRun[], agentId: string, now = Date.now(), days = 30): AgentHistory | null {
  const from = now - days * 86_400_000
  const calls = runs
    .flatMap((r) => r.calls)
    .filter((c) => c.kind === 'task' && c.ts >= from && (c.agentId === agentId || c.agentId.startsWith(`${agentId}-becario`)))
  if (!calls.length) return null
  const d = calls.map((c) => c.durationMs).sort((a, b) => a - b)
  const mid = d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2
  const h: AgentHistory = { tasks: calls.length, okPct: Math.round((calls.filter((c) => c.ok).length / calls.length) * 100), medianMs: mid }
  // Una tarea con varios intentos se valora una vez (su mensaje): se cuenta por tarea, no por llamada.
  const rated = new Map<string, 'up' | 'down'>()
  for (const c of calls) if (c.rating && c.taskId) rated.set(c.taskId, c.rating)
  if (rated.size) {
    h.liked = [...rated.values()].filter((r) => r === 'up').length
    h.disliked = rated.size - h.liked
  }
  return h
}

/** Calidad de un agente en los últimos días (👍, verificación, correcciones, fallos), o null si no hizo tareas. */
export function agentQualityFor(runs: UsageRun[], agentId: string, now = Date.now(), days = 30): AgentQuality | null {
  return agentQuality(runs, now - days * 86_400_000).find((q) => q.agentId === agentId) ?? null
}

/** «81 % (ventana semanal)» o «12 % (…): queda poca…». */
export function quotaLine(q: QuotaInfo | undefined, warn: number): string {
  if (q?.unlimited) return 'sin límite (en tu equipo, gratis)'
  if (!q || q.remainingPct == null) return 'sin dato'
  const pct = Math.round(q.remainingPct)
  const base = `${pct} %${q.period ? ` (${q.period.toLowerCase()})` : ''}`
  return pct <= warn ? `${base}: queda poca, dale solo lo imprescindible` : base
}

/**
 * Qué modelo y esfuerzo usa en cada dificultad y cómo es cada modelo (velocidad, coste, para qué sirve), con los
 * datos del catálogo: así el coordinador sabe lo que cuesta marcar una tarea como difícil.
 */
export function modelLines(a: AgentConfig): string[] {
  const name = (model: string | undefined, label: string | undefined): string => modelFacts(model)?.label ?? label ?? model ?? 'el predeterminado'
  const eff = (d: Difficulty): string => {
    const e = effortFor(a.provider, d)
    return e ? ` con ${EFFORT_LABEL[e]}` : ''
  }
  const main = a.model ? name(a.model, a.modelLabel) : a.modelLabel || 'el predeterminado'
  if (!a.lightModel && !a.strongModel && !effortFor(a.provider, 'medium')) {
    const f = modelFacts(a.model)
    return [`  modelo: ${main}${f ? ` — ${f.speed}, coste ${f.cost}` : ''}`]
  }
  const tiers = [
    `fáciles → ${main}${eff('easy')}${a.lightModel ? ` (si es solo una respuesta de texto: ${name(a.lightModel, a.lightModelLabel)})` : ''}`,
    `normales → ${main}${eff('medium')}`,
    `difíciles → ${a.strongModel ? name(a.strongModel, a.strongModelLabel) : main}${eff('hard')}`
  ]
  const seen = new Set<string>()
  const facts: string[] = []
  for (const m of [a.lightModel, a.model, a.strongModel]) {
    const f = modelFacts(m)
    if (!f || seen.has(f.label)) continue
    seen.add(f.label)
    facts.push(`${f.label}: ${f.speed}, coste ${f.cost}${f.note ? ` (${f.note})` : ''}`)
  }
  return [`  modelos: ${tiers.join('; ')}`, ...(facts.length ? [`  cómo son: ${facts.join(' · ')}`] : [])]
}

const took = (ms: number): string => (ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`)

/** Líneas de la ficha de un agente para el prompt del coordinador. */
export function profileLines(
  a: AgentConfig,
  extra: {
    available: string
    quota?: QuotaInfo
    warn: number
    history?: AgentHistory | null
    /** Con QUALITY_MIN_TASKS tareas o más, una línea con su calidad (sustituye a las valoraciones del historial). */
    quality?: AgentQuality | null
    abilities: string[]
  }
): string[] {
  const out = [`- id: "${a.id}" · ${a.name} — ${a.role || 'sin rol'} · disponible: ${extra.available}`]
  if (a.strengths.length) out.push(`  se le da mejor: ${a.strengths.join('; ')}`)
  if (a.avoid?.length) out.push(`  evitar: ${a.avoid.join('; ')}`)
  out.push(...modelLines(a))
  out.push(`  cuota restante: ${quotaLine(extra.quota, extra.warn)}`)
  const h = extra.history
  const quality = qualityLine(extra.quality)
  if (h && h.tasks >= 3) {
    const rated = (h.liked ?? 0) + (h.disliked ?? 0)
    const liked = rated && !quality ? `; al usuario le sirvieron ${h.liked} de ${rated} que valoró${h.disliked ? ` (${h.disliked} no)` : ''}` : ''
    out.push(`  historial en AI Cowork (30 días): ${h.tasks} tareas, ${h.okPct} % bien, unos ${took(h.medianMs)} cada una${liked}`)
  }
  if (quality) out.push(`  ${quality}`)
  for (const ab of extra.abilities) out.push(`  ${ab}`)
  return out
}
