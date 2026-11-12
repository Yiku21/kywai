// «/consejo [N] pregunta»: la misma pregunta a varios agentes a la vez, cada uno por su cuenta, y luego uno junta lo
// mejor en una sola respuesta (coincidencias, desacuerdos y la respuesta final). Es la idea de «Mixture of Agents» de
// un reel: varios modelos responden en paralelo y uno hace de presidente.
//
// En kywai no hace falta un motor aparte: el texto se convierte en un encargo para Hermes (el plan normal, con su
// visto bueno, sus agentes y sus dependencias) que le pide una tarea por consejero con la misma pregunta y una última
// que depende de todas para sintetizar. En el chat se ve lo que escribiste. Lo usa sendNow en orchestrator.ts.
import type { AgentConfig, ProviderKind } from '@shared/types'

export interface CouncilRequest {
  question: string
  /** Cuántos consejeros (2–5; por defecto 3). */
  size: number
}

const SIZE_RE = /^(\d)\s*(?:agentes|consejeros|agents|modelos|models)?(?=\s|$)/i

/** «/consejo [3 agentes] pregunta» (también «/panel», «/mezcla» y «/mixture»). null si no es la orden. */
export function parseCouncilRequest(text: string): CouncilRequest | null {
  const m = /^\/(?:consejo|panel|mezcla|mixture)(?=\s|$)([\s\S]*)$/i.exec(text.trim())
  if (!m) return null
  let rest = m[1].trim()
  let size = 3
  const s = SIZE_RE.exec(rest)
  if (s) {
    size = Math.min(5, Math.max(2, Number(s[1])))
    rest = rest.slice(s[0].length).trim()
  }
  return { question: rest.slice(0, 20_000), size }
}

/**
 * Los consejeros: de familias de modelos distintas primero (otra familia ve otras cosas), y luego el resto, en el
 * orden en que llegan (los que se pasen ya vienen filtrados por disponibles).
 */
export function pickCouncil(agents: Pick<AgentConfig, 'id' | 'name' | 'provider'>[], size: number): Pick<AgentConfig, 'id' | 'name' | 'provider'>[] {
  const seen = new Set<ProviderKind>()
  const first: typeof agents = []
  const rest: typeof agents = []
  for (const a of agents) {
    if (!seen.has(a.provider)) {
      seen.add(a.provider)
      first.push(a)
    } else rest.push(a)
  }
  return [...first, ...rest].slice(0, size)
}

/** El encargo para Hermes. `members`: los nombres de los consejeros elegidos. */
export function councilPlannerText(req: CouncilRequest, members: string[]): string {
  const n = members.length
  return [
    `Consejo de agentes («/consejo»). Pregunta del usuario: «${req.question}»`,
    '',
    `Monta este plan, sin preguntar: ${n} tareas EN PARALELO, una para cada consejero (${members.join(', ')}), con la MISMA pregunta tal cual, y una última tarea que dependa de todas ellas.`,
    '- Cada consejero responde por su cuenta, sin ver a los demás, en su propio archivo consejo/<su-nombre>.md: su respuesta, cómo llegó a ella y lo que no sabe seguro. Que no copie de internet sin decirlo y que dé fuentes si las usa.',
    `- La última (para el agente más fuerte que tengas, aunque sea uno de los consejeros) lee los ${n} archivos y escribe consejo/sintesis.md: en qué coinciden, en qué discrepan y quién tiene razón en cada desacuerdo (y por qué), lo que solo vio uno y vale la pena, y la respuesta final, la mejor posible, juntando lo mejor de cada uno.`,
    '- En tu respuesta final al usuario, la respuesta final de la síntesis y, en una línea, dónde coincidieron y dónde no.',
    n < 2 ? '- Solo hay un agente disponible: díselo al usuario en "reply" y que responda él solo.' : ''
  ]
    .filter(Boolean)
    .join('\n')
}
