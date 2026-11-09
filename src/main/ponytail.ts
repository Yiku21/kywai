// «Código escueto (Ponytail)»: un interruptor por proyecto (pestaña Memoria) que pasa a los agentes las reglas de
// Ponytail (https://github.com/DietrichGebert/ponytail, licencia MIT): el código mínimo que resuelve la tarea entera,
// reutilizando lo que ya hay antes de escribir nada nuevo. Viene apagado: la calidad va primero y estas reglas solo
// recortan lo que sobra, nunca la verificación, las pruebas ni la seguridad.
// Las reglas no van en el código de kywai: al encenderlo se descarga su SKILL.md de GitHub a «extensiones/ponytail»
// (fuera de «habilidades», para que no la vean los proyectos que no lo tienen encendido).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tr } from '@shared/i18n'
import { installSkill } from './catalog'

export const PONYTAIL_REPO = 'DietrichGebert/ponytail'
const MAX_RULES = 8000

let dir = ''

export function initPonytail(workspaceRoot: string): void {
  dir = join(workspaceRoot, 'extensiones')
}

function skillFile(base = dir): string {
  return base ? join(base, 'ponytail', 'SKILL.md') : ''
}

/** Descarga las reglas si aún no están (lanza un error legible si no se puede). */
export async function ensurePonytail(base = dir): Promise<void> {
  if (!base) throw new Error(tr('Sin carpeta de trabajo'))
  if (existsSync(skillFile(base))) return
  await installSkill(base, PONYTAIL_REPO, 'ponytail')
}

/** El texto de las reglas sin su encabezado «--- … ---», o '' si no están descargadas. */
export function ponytailRules(base = dir): string {
  const file = skillFile(base)
  if (!file) return ''
  try {
    const text = readFileSync(file, 'utf8').replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
    return text.length > MAX_RULES ? `${text.slice(0, MAX_RULES)}\n…(recortada)` : text
  } catch {
    return ''
  }
}

/** Sección del encargo de una tarea con archivos (vacía si está apagado o no hay reglas). */
export function ponytailPromptLines(on: boolean, base = dir): string[] {
  if (!on) return []
  const rules = ponytailRules(base)
  if (!rules) return []
  return [
    '',
    '## Código escueto (Ponytail)',
    'El usuario ha encendido «Código escueto» en este proyecto: sigue estas reglas en todo el código que escribas (son de Ponytail, en inglés). No recortes nunca la tarea en sí, las pruebas que pide, la validación de datos de fuera, el manejo de errores ni la seguridad. Las órdenes «/ponytail …» que menciona no existen aquí: usa siempre el nivel «full».',
    rules
  ]
}

/** Lo que el verificador añade, como nota que no cambia el veredicto, cuando el proyecto lo tiene encendido. */
export function ponytailReviewLines(on: boolean): string[] {
  if (!on) return []
  return [
    '## Código de más (el proyecto tiene encendido «Código escueto»)',
    'Después de tu veredicto, si lo ves, añade una sección «Código de más:» con como mucho 3 casos concretos (archivo y qué quitar): código muerto u opciones que nadie usa, algo que ya existe en el proyecto o en la librería estándar, una dependencia nueva para pocas líneas, o una abstracción con una sola implementación. Es solo una nota para el usuario: no cambia el veredicto ni cuenta como fallo. Si no hay nada, no la pongas.',
    ''
  ]
}
