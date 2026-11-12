// Habilidades compartidas: procedimientos que el equipo reutiliza («cómo publicamos una versión», «nuestro estilo de
// informes»…). Cada una es una carpeta con su SKILL.md (el mismo formato que las skills de Claude: un encabezado con
// name y description, y el procedimiento debajo) dentro de la carpeta «habilidades» de la carpeta de trabajo. Las ven
// todos los agentes, sea cual sea su CLI: el encargo de cada tarea lista su nombre y para qué sirven, y la leen con
// la herramienta «leer_habilidad» de kywai (o abriendo el archivo).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { VIDEO_SKILLS_FOLDER } from '@shared/videoExtensions'

export interface Skill {
  name: string
  description: string
  /** Ruta absoluta del SKILL.md (o del .md suelto). */
  file: string
  /** La escribió un agente al terminar una tarea y el usuario aún no la ha confirmado («estado: provisional»). */
  provisional?: boolean
  /** Proyecto donde nació («proyecto: <id>»): mientras es provisional solo la ven los agentes de ese proyecto. */
  projectId?: string
  /** Quién la escribió y en qué tarea («origen: …»), para la pestaña Memoria. */
  origin?: string
}

// Con plugins y catálogos se juntan muchas: se listan todas (hasta 150) con la descripción recortada.
const MAX_SKILLS = 150
const MAX_DESC_IN_PROMPT = 160
const MAX_SKILL_CHARS = 20_000
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,63}$/u
/** Habilidades completas pegadas en cada encargo: así todos los agentes reciben el mismo texto, lean o no archivos. */
const MAX_FULL_SKILLS = 3
const MAX_FULL_CHARS = 15_000
const MAX_FULL_ONE = 10_000

let root = ''

const README = `# Habilidades compartidas de kywai

Cada habilidad es una carpeta con un archivo SKILL.md (o un .md suelto en esta carpeta):

\`\`\`
---
name: publicar-version
description: Cómo publicamos una versión nueva (cuándo usarla, en una línea).
---

1. Pasos del procedimiento…
\`\`\`

Todos los agentes del equipo ven el nombre y la descripción de cada una en su encargo y la leen cuando la necesitan.
Puedes copiar aquí las skills que ya tengas de Claude (~/.claude/skills): usan el mismo formato.
`

export function initSkills(workspaceRoot: string): void {
  root = join(workspaceRoot, 'habilidades')
  try {
    mkdirSync(root, { recursive: true })
    const readme = join(root, 'LEEME.md')
    if (!existsSync(readme)) writeFileSync(readme, README, 'utf8')
  } catch {
    /* sin carpeta: no hay habilidades */
  }
}

export function skillsDir(): string {
  return root
}

/** Habilidades de vídeo (habilidades/video): solo las ve el agente que escribe el guion de un vídeo. */
export function videoSkillsDir(): string {
  return root ? join(root, VIDEO_SKILLS_FOLDER) : ''
}

/** Las habilidades de vídeo en el encargo del guion (con su ruta, para leerlas). */
export function videoSkillPromptLines(): string[] {
  const list = listSkills(videoSkillsDir())
  if (!list.length) return []
  return [
    '',
    '## Habilidades de vídeo instaladas',
    'Guías de vídeo que el usuario instaló. Si alguna encaja con este vídeo (estilo, ritmo, guion, tipo de vídeo), léela antes y aplica lo que sirva al guion:',
    ...list.map((s) => `- ${s.name}: ${(s.description || '(sin descripción)').slice(0, MAX_DESC_IN_PROMPT)} — ${s.file}`)
  ]
}

/** Encabezado «--- name / description ---» (y lo que añade kywai a las aprendidas: estado, proyecto, origen). */
function frontmatter(text: string): { name?: string; description?: string; estado?: string; proyecto?: string; origen?: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(name|description|estado|proyecto|origen)\s*:\s*(.*)$/.exec(line.trim())
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim()
  }
  return out
}

export function listSkills(dir = root): Skill[] {
  if (!dir) return []
  let names: string[]
  try {
    names = readdirSync(dir).sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
  const out: Skill[] = []
  for (const n of names) {
    if (out.length >= MAX_SKILLS) break
    if (n.startsWith('.') || /^l[eé]eme\.md$/i.test(n) || /^readme\.md$/i.test(n)) continue
    const abs = join(dir, n)
    let file = ''
    try {
      if (statSync(abs).isDirectory()) file = existsSync(join(abs, 'SKILL.md')) ? join(abs, 'SKILL.md') : ''
      else if (/\.md$/i.test(n)) file = abs
    } catch {
      continue
    }
    if (!file) continue
    let text = ''
    try {
      text = readFileSync(file, 'utf8').slice(0, 4000)
    } catch {
      continue
    }
    const fm = frontmatter(text)
    const name = (fm.name || n.replace(/\.md$/i, '')).slice(0, 64)
    if (!NAME_RE.test(name)) continue
    const description = (fm.description || text.replace(/^---[\s\S]*?---/, '').trim().split(/\r?\n/).find((l) => l.trim()) || '').replace(/^#+\s*/, '').slice(0, 300)
    const provisional = /^provisional$/i.test(fm.estado ?? '')
    out.push({
      name,
      description,
      file,
      ...(provisional ? { provisional: true } : {}),
      ...(fm.proyecto ? { projectId: fm.proyecto } : {}),
      ...(fm.origen ? { origin: fm.origen.slice(0, 200) } : {})
    })
  }
  return out
}

/** El texto de una habilidad por su nombre (sin distinguir mayúsculas), o null. */
export function readSkill(name: string, dir = root): { skill: Skill; text: string } | null {
  const key = name.trim().toLowerCase()
  const skill = listSkills(dir).find((s) => s.name.toLowerCase() === key)
  if (!skill) return null
  try {
    const text = readFileSync(skill.file, 'utf8')
    return { skill, text: text.length > MAX_SKILL_CHARS ? `${text.slice(0, MAX_SKILL_CHARS)}\n…(recortada)` : text }
  } catch {
    return null
  }
}

/** Una provisional solo la ven los agentes del proyecto donde nació; confirmada, todos. Sin proyecto, todas. */
export function visibleIn(s: Skill, projectId?: string): boolean {
  return !s.provisional || !projectId || !s.projectId || s.projectId === projectId
}

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Palabras que no dicen de qué va una habilidad. */
const STOP = new Set(
  'para como cuando donde esta este estos estas esto todo toda todos todas cualquier sobre desde hasta entre tarea tareas usar usa usalo usarla habilidad hacer hace with when that this from into your what usar cada otra otro otros otras sus con los las del una uno unos unas que por mas pero sin tambien'.split(' ')
)

/** Palabras con significado, por su raíz de 6 letras: «publica», «publicar» y «publicamos» cuentan igual. */
function words(text: string): Set<string> {
  return new Set(
    fold(text)
      .split(' ')
      .filter((w) => w.length >= 4 && !STOP.has(w))
      .map((w) => w.slice(0, 6))
  )
}

/**
 * Las habilidades que encajan con una tarea (como mucho 3, de más a menos). Gana la que se nombra tal cual
 * («membresia-metabolica» o «membresía metabólica»); si no, la que comparte palabras de su nombre y de su
 * descripción con el texto de la tarea.
 */
export function relevantSkills(text: string, projectId?: string, dir = root): Skill[] {
  const folded = ` ${fold(text)} `
  const have = words(text)
  const scored: { s: Skill; score: number }[] = []
  for (const s of listSkills(dir)) {
    if (!visibleIn(s, projectId)) continue
    const name = fold(s.name)
    let score = name.length >= 4 && folded.includes(` ${name} `) ? 100 : 0
    if (!score) {
      const nameWords = [...words(s.name)]
      const nameHits = nameWords.filter((w) => have.has(w)).length
      const descHits = [...words(s.description)].filter((w) => have.has(w) && !nameWords.includes(w)).length
      // Toda la palabra del nombre (si es una) o la mitad (si son varias), más algo de la descripción; o mucha descripción.
      const nameOk = nameWords.length > 0 && nameHits >= Math.max(1, Math.ceil(nameWords.length / 2))
      if ((nameOk && nameHits + descHits >= 2) || descHits >= 4) score = nameHits * 3 + descHits
    }
    if (score) scored.push({ s, score })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
    .slice(0, MAX_FULL_SKILLS)
    .map((x) => x.s)
}

/**
 * Las habilidades que encajan con la tarea, enteras, para pegarlas en el encargo. Así las reciben igual Claude,
 * Codex, Gemini, Copilot, Qwen o Aider, trabajen en la carpeta o en una copia aparte (la carpeta «habilidades»
 * queda fuera de la del proyecto y no todos los CLI pueden o quieren abrirla). `names` dice cuáles recibió.
 */
export function fullSkillSections(text: string, projectId?: string, dir = root): { lines: string[]; names: string[] } {
  const lines: string[] = []
  const names: string[] = []
  let budget = MAX_FULL_CHARS
  for (const s of relevantSkills(text, projectId, dir)) {
    if (budget < 1500) break
    let body = ''
    try {
      body = readFileSync(s.file, 'utf8').replace(/^﻿/, '').trim()
    } catch {
      continue
    }
    const cap = Math.min(MAX_FULL_ONE, budget)
    if (body.length > cap) body = `${body.slice(0, cap)}\n…(recortada: la habilidad completa está en ${s.file})`
    budget -= body.length
    names.push(s.name)
    lines.push('', `### Habilidad «${s.name}»${s.provisional ? ' (provisional: la escribió un agente y el usuario aún no la ha revisado; compruébala antes de fiarte de ella)' : ''}`, body)
  }
  if (!names.length) return { lines: [], names: [] }
  return {
    lines: ['', '## Habilidades del equipo para esta tarea (completas)', 'Estas habilidades encajan con tu tarea. Léelas y síguelas: son lo que el equipo ya sabe hacer y no debes contradecirlo sin motivo.', ...lines],
    names
  }
}

/** Sección del encargo con las habilidades disponibles (vacía si no hay ninguna). Sin las que ya van completas. */
export function skillPromptLines(withTool: boolean, dir = root, projectId?: string, skip: string[] = []): string[] {
  const list = listSkills(dir).filter((s) => visibleIn(s, projectId) && !skip.includes(s.name))
  if (!list.length) return []
  return [
    '',
    skip.length ? '## Otras habilidades del equipo' : '## Habilidades del equipo',
    `Procedimientos que el equipo ya tiene escritos. Si uno encaja con tu tarea, léelo antes de empezar y síguelo${withTool ? ' (herramienta «leer_habilidad» de ai-cowork, con su nombre)' : ' (abre su archivo)'}:`,
    ...list.map((s) => {
      const d = s.description.length > MAX_DESC_IN_PROMPT ? `${s.description.slice(0, MAX_DESC_IN_PROMPT - 1)}…` : s.description
      return `- ${s.name}${s.provisional ? ' (provisional)' : ''}: ${d || '(sin descripción)'}${withTool ? '' : ` — ${s.file}`}`
    })
  ]
}
