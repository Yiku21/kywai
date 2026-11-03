// Habilidades compartidas: procedimientos que el equipo reutiliza («cómo publicamos una versión», «nuestro estilo de
// informes»…). Cada una es una carpeta con su SKILL.md (el mismo formato que las skills de Claude: un encabezado con
// name y description, y el procedimiento debajo) dentro de la carpeta «habilidades» de la carpeta de trabajo. Las ven
// todos los agentes, sea cual sea su CLI: el encargo de cada tarea lista su nombre y para qué sirven, y la leen con
// la herramienta «leer_habilidad» de AI Cowork (o abriendo el archivo).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Skill {
  name: string
  description: string
  /** Ruta absoluta del SKILL.md (o del .md suelto). */
  file: string
}

const MAX_SKILLS = 40
const MAX_SKILL_CHARS = 20_000
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,63}$/u

let root = ''

const README = `# Habilidades compartidas de AI Cowork

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

/** Encabezado «--- name / description ---» (lo demás se ignora). */
function frontmatter(text: string): { name?: string; description?: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(name|description)\s*:\s*(.*)$/.exec(line.trim())
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
    out.push({ name, description, file })
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

/** Sección del encargo con las habilidades disponibles (vacía si no hay ninguna). */
export function skillPromptLines(withTool: boolean, dir = root): string[] {
  const list = listSkills(dir)
  if (!list.length) return []
  return [
    '',
    '## Habilidades del equipo',
    `Procedimientos que el equipo ya tiene escritos. Si uno encaja con tu tarea, léelo antes de empezar y síguelo${withTool ? ' (herramienta «leer_habilidad» de ai-cowork, con su nombre)' : ''}:`,
    ...list.map((s) => `- ${s.name}: ${s.description || '(sin descripción)'}${withTool ? '' : ` — ${s.file}`}`)
  ]
}
