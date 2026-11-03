// Lo que un agente va contando en el chat mientras hace una tarea (escritorio, web y app del móvil): sus frases
// cortas y, entre ellas, las herramientas que usó resumidas en una línea, como hace Claude en su app.
import type { TraceEntry, TraceTool, WorkFile, WorkStep, WorkToolRef, WorkTotals } from './types'

/** Pasos que se ven en el chat; los anteriores quedan en el registro completo de la tarea. */
export const MAX_WORK_STEPS = 40
/** Herramientas que se listan al desplegar una línea. */
const MAX_ITEMS = 12
/** Una nota más larga se corta (en un final de frase, si lo hay). */
const MAX_NOTE = 400

const VERBS: Array<[TraceTool, string, string]> = [
  ['command', 'ejecutó un comando', 'ejecutó # comandos'],
  ['edit', 'editó un archivo', 'editó # archivos'],
  ['write', 'creó un archivo', 'creó # archivos'],
  ['read', 'leyó un archivo', 'leyó # archivos'],
  ['search', 'hizo una búsqueda', 'hizo # búsquedas'],
  ['web', 'consultó internet', 'consultó internet # veces'],
  ['agent', 'lanzó un subagente', 'lanzó # subagentes'],
  ['other', 'usó una herramienta', 'usó # herramientas']
]

/** «Ejecutó 3 comandos, editó 2 archivos y leyó un archivo». */
export function toolsSummary(counts: Partial<Record<TraceTool, number>>): string {
  const parts = VERBS.filter(([tool]) => (counts[tool] ?? 0) > 0).map(([tool, one, many]) =>
    counts[tool] === 1 ? one : many.replace('#', String(counts[tool]))
  )
  if (!parts.length) return ''
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
  return text[0].toUpperCase() + text.slice(1)
}

/** La nota en corto: sin espacios de más y, si es larga, hasta el último final de frase que quepa. */
export function shortNote(text: string): string {
  const t = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (t.length <= MAX_NOTE) return t
  const head = t.slice(0, MAX_NOTE)
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'), head.lastIndexOf(': '))
  return (end > MAX_NOTE / 2 ? head.slice(0, end + 1) : head.trimEnd()) + '…'
}

/** Líneas que añade y quita una herramienta que cambia un archivo (diff de «- » y «+ », o el contenido que crea). */
export function changedLines(e: Pick<TraceEntry, 'tool' | 'body'>): { add: number; del: number } | null {
  if (e.tool !== 'edit' && e.tool !== 'write') return null
  const body = e.body ?? ''
  // La primera línea es la ruta del archivo y la segunda, vacía.
  const lines = body.split('\n').slice(2).filter((l) => l !== '… (recortado)')
  if (e.tool === 'write') {
    const add = lines.length && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length
    return add > 0 ? { add, del: 0 } : null
  }
  let add = 0
  let del = 0
  for (const l of lines) {
    if (l.startsWith('+ ')) add++
    else if (l.startsWith('- ')) del++
  }
  return add || del ? { add, del } : null
}

/**
 * El registro de una tarea en pasos para el chat: cada texto del agente es una nota y las herramientas seguidas se
 * juntan en una línea. Lo que piensa, la lista de pasos y los avisos internos no se cuentan aquí.
 */
export function workSteps(entries: TraceEntry[]): { steps: WorkStep[]; hidden: number; totals?: WorkTotals } {
  const steps: WorkStep[] = []
  const all: Partial<Record<TraceTool, number>> = {}
  const sum = { failed: 0, add: 0, del: 0 }
  let counts: Partial<Record<TraceTool, number>> = {}
  let group: Extract<WorkStep, { kind: 'tools' }> | null = null
  for (const e of entries) {
    if (e.kind === 'text') {
      const text = shortNote(e.body ?? '')
      if (!text) continue
      group = null
      steps.push({ kind: 'note', text })
    } else if (e.kind === 'files') {
      // Archivos nuevos que fue creando (capturas, documentos): se enseñan donde pasaron.
      let files: WorkFile[] = []
      try {
        const parsed = JSON.parse(e.body ?? '[]') as unknown
        if (Array.isArray(parsed)) {
          files = parsed.filter((f): f is WorkFile => !!f && typeof (f as WorkFile).relPath === 'string' && typeof (f as WorkFile).name === 'string')
        }
      } catch {
        /* registro estropeado: se ignora */
      }
      if (!files.length) continue
      group = null
      steps.push({ kind: 'files', files })
    } else if (e.kind === 'tool' && e.tool !== 'todo') {
      const tool = e.tool ?? 'other'
      if (!group) {
        counts = {}
        group = { kind: 'tools', summary: '', items: [] }
        steps.push(group)
      }
      counts[tool] = (counts[tool] ?? 0) + 1
      all[tool] = (all[tool] ?? 0) + 1
      group.summary = toolsSummary(counts)
      const lines = changedLines(e)
      if (lines) {
        group.add = (group.add ?? 0) + lines.add
        group.del = (group.del ?? 0) + lines.del
        sum.add += lines.add
        sum.del += lines.del
      }
      if (group.items.length < MAX_ITEMS) {
        group.items.push(e.title.slice(0, 160))
        const ref: WorkToolRef = { id: e.id, tool }
        if (e.ok !== undefined) ref.ok = e.ok
        if (lines) {
          ref.add = lines.add
          ref.del = lines.del
        }
        ;(group.refs ??= []).push(ref)
      } else group.more = (group.more ?? 0) + 1
      if (e.ok === false) {
        group.failed = (group.failed ?? 0) + 1
        sum.failed++
      }
    }
  }
  const hidden = Math.max(0, steps.length - MAX_WORK_STEPS)
  const summary = toolsSummary(all)
  const totals: WorkTotals | undefined = summary
    ? { summary, ...(sum.failed ? { failed: sum.failed } : {}), ...(sum.add ? { add: sum.add } : {}), ...(sum.del ? { del: sum.del } : {}) }
    : undefined
  return { steps: hidden ? steps.slice(hidden) : steps, hidden, ...(totals ? { totals } : {}) }
}

/** Al acabar, el texto final ya es el resultado del mensaje: las notas que van tras la última herramienta sobran. */
export function withoutClosingNotes(steps: WorkStep[]): WorkStep[] {
  let end = steps.length
  while (end > 0 && steps[end - 1].kind === 'note') end--
  return steps.slice(0, end)
}
