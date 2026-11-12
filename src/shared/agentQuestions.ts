// Preguntas de un agente (o del coordinador) con opciones, como la tarjeta de preguntas de Claude: una pregunta cada
// vez, opciones numeradas con su explicación, la que el agente cree mejor marcada como «Recomendada» y, siempre al
// final, un campo para escribir tu propia respuesta (u «Omitir»). El agente las escribe al final de su respuesta en un
// bloque ```preguntas con JSON; el motor lo quita del texto y lo guarda en el mensaje (ChatMessage.questions). Lo que
// contestas vuelve al mismo agente (o al coordinador) como un mensaje con cada pregunta y su respuesta.
import type { AgentQuestion, AgentQuestionAnswer, AgentQuestionOption } from './types'

export const MAX_QUESTIONS = 8
export const MAX_OPTIONS = 6
const QUESTION_MAX = 300
const LABEL_MAX = 120
const DETAIL_MAX = 300
export const ANSWER_TEXT_MAX = 2000

/** Lo que se pide a cada agente para que sus dudas salgan como tarjeta (se añade a sus reglas). */
export const QUESTIONS_RULE =
  '- Si te quedan dudas que solo el usuario puede decidir, NO las escribas como lista en el texto («Dudas abiertas»…): ponlas al final de tu respuesta en un bloque ```preguntas con JSON, así:\n' +
  '```preguntas\n[{"pregunta": "¿…?", "opciones": [{"titulo": "…", "detalle": "en una frase, qué pasa si la elige", "recomendada": true}, {"titulo": "…", "detalle": "…"}]}]\n```\n' +
  '  De 1 a 6 preguntas, cada una con 2 a 4 opciones cortas y exactamente una "recomendada": la que tú elegirías. kywai las enseña como una tarjeta para elegir con un toque (con un campo para que escriba otra respuesta, así que no añadas «Otra»); lo que conteste te llega después. En el texto basta una frase («Te dejo N preguntas para decidir…»). Si no hay dudas, no pongas el bloque.'

/** Lo mismo para el coordinador, que contesta en JSON: sus preguntas van en el campo "questions". */
export const PLAN_QUESTIONS_FIELD = '"questions": [{"question": "¿…?", "options": [{"label": "…", "detail": "…", "recommended": true}]}]'

const BLOCK = /```[ \t]*(?:preguntas|questions)[ \t]*\r?\n([\s\S]*?)```[ \t]*/i
/** Un bloque que aún se está escribiendo (streaming): desde su apertura hasta el final del texto. */
const OPEN_BLOCK = /```[ \t]*(?:preguntas|questions)[ \t]*(?:\r?\n[\s\S]*)?$/i

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined) return o[k]
  return undefined
}

function truthy(v: unknown): boolean {
  return v === true || (typeof v === 'string' && /^(true|si|sí|yes|1)$/i.test(v.trim()))
}

/** Normaliza las preguntas (en español o en inglés, como las escriba el modelo). Las que no se entienden se quitan. */
export function normalizeQuestions(raw: unknown): AgentQuestion[] {
  let list: unknown = raw
  if (list && typeof list === 'object' && !Array.isArray(list)) list = pick(list as Record<string, unknown>, ['preguntas', 'questions', 'items'])
  if (!Array.isArray(list)) return []
  const out: AgentQuestion[] = []
  for (const q of list) {
    if (!q || typeof q !== 'object') continue
    const o = q as Record<string, unknown>
    const question = str(pick(o, ['pregunta', 'question', 'q', 'texto', 'text']), QUESTION_MAX)
    const rawOpts = pick(o, ['opciones', 'options', 'choices'])
    if (question.length < 3 || !Array.isArray(rawOpts)) continue
    const options: AgentQuestionOption[] = []
    let rec = false
    for (const op of rawOpts) {
      const p = typeof op === 'string' ? { titulo: op } : op && typeof op === 'object' ? (op as Record<string, unknown>) : null
      if (!p) continue
      const label = str(pick(p, ['titulo', 'título', 'label', 'title', 'opcion', 'option', 'nombre']), LABEL_MAX)
      if (!label) continue
      const detail = str(pick(p, ['detalle', 'detail', 'description', 'descripcion', 'descripción', 'explicacion']), DETAIL_MAX)
      const recommended = !rec && truthy(pick(p, ['recomendada', 'recomendado', 'recommended']))
      if (recommended) rec = true
      options.push({ label, ...(detail ? { detail } : {}), ...(recommended ? { recommended: true } : {}) })
      if (options.length >= MAX_OPTIONS) break
    }
    if (options.length < 2) continue
    out.push({ question, options })
    if (out.length >= MAX_QUESTIONS) break
  }
  return out
}

/**
 * Saca el bloque ```preguntas del final de una respuesta. Devuelve el texto sin él y las preguntas; si no hay bloque o
 * no se entiende, null (el texto se queda como está para no perder nada).
 */
export function extractQuestions(text: string): { text: string; questions: AgentQuestion[] } | null {
  const m = BLOCK.exec(text ?? '')
  if (!m) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(m[1].trim())
  } catch {
    return null
  }
  const questions = normalizeQuestions(parsed)
  if (!questions.length) return null
  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\n{3,}/g, '\n\n').trim()
  return { text: rest, questions }
}

/** Mientras se recibe la respuesta, el bloque (aún sin cerrar o ya cerrado) no se enseña: luego sale la tarjeta. */
export function hideQuestionsBlock(text: string): string {
  return text.replace(BLOCK, '').replace(OPEN_BLOCK, '').trimEnd()
}

/** La respuesta a una pregunta en una línea («Personal», «Escrita: …» o sin respuesta). */
export function answerLine(q: AgentQuestion, a: AgentQuestionAnswer | undefined): string {
  const typed = a?.text?.trim()
  if (typed) return typed
  const op = typeof a?.choice === 'number' ? q.options[a.choice] : undefined
  if (op) return op.detail ? `${op.label} (${op.detail})` : op.label
  return ''
}

/** Lo que se envía al agente (y se ve en el chat como tu mensaje): cada pregunta con lo que contestaste. */
export function formatAnswers(questions: AgentQuestion[], answers: AgentQuestionAnswer[], skippedText: string, header: string): string {
  const lines = questions.map((q, i) => {
    const a = answerLine(q, answers[i])
    return `${i + 1}. ${q.question}\n   → ${a || skippedText}`
  })
  return [header, '', ...lines].join('\n')
}

/** Comprueba lo que llega de la interfaz o del móvil: una respuesta por pregunta (elegida, escrita u omitida). */
export function cleanAnswers(questions: AgentQuestion[], raw: unknown): AgentQuestionAnswer[] {
  const list = Array.isArray(raw) ? raw : []
  return questions.map((q, i) => {
    const a = list[i] && typeof list[i] === 'object' ? (list[i] as Record<string, unknown>) : {}
    const text = typeof a.text === 'string' ? a.text.trim().slice(0, ANSWER_TEXT_MAX) : ''
    if (text) return { text }
    const c = typeof a.choice === 'number' && Number.isInteger(a.choice) && a.choice >= 0 && a.choice < q.options.length ? a.choice : undefined
    return c === undefined ? { skipped: true } : { choice: c }
  })
}
