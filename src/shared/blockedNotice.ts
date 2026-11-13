/**
 * Lo que se le enseña al usuario cuando un agente se bloquea («BLOQUEADA: …»): solo lo que tiene que hacer.
 * Las secciones que el agente deja para el equipo («Para la memoria», «Habilidad nueva») no son para él.
 */

/** Empieza una sección para el equipo: «## Para la memoria», «**Para la memoria**», «### Habilidad nueva»… */
const TEAM_SECTION = /^\s{0,3}(?:#{1,6}\s*|\*\*)\s*(?:para la memoria|habilidad nueva)\b/im

/** El texto sin las secciones para el equipo (van al final de la respuesta: se corta desde la primera). */
export function withoutTeamNotes(text: string): string {
  const s = text ?? ''
  const m = TEAM_SECTION.exec(s)
  return (m ? s.slice(0, m.index) : s).trim()
}

/**
 * El texto en una línea y sin marcas de formato, para un aviso que no las pinta: fuera negritas, cursivas con
 * asteriscos, comillas de código, almohadillas de título, citas y viñetas. «GHL_SESSION» se queda como está.
 */
export function plainNotice(text: string): string {
  return (text ?? '')
    .replace(/```[^\n]*\n?/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|[\s(«"])\*(\S[^*\n]*?\S|\S)\*(?=[\s).,;:!?»"]|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** La misma sección, en un aviso viejo que ya se guardó en una sola línea («… continuar. ## Para la memoria - hecho: …»). */
const TEAM_SECTION_INLINE = /\s(?:#{1,6}\s*|\*\*)\s*(?:para la memoria|habilidad nueva)\b[\s\S]*$/i

/** Un aviso «Bloqueada: …» ya guardado, limpio (para las tareas que se bloquearon antes de este arreglo). */
export function cleanBlockedError(error: string): string {
  return plainNotice(withoutTeamNotes((error ?? '').replace(TEAM_SECTION_INLINE, '')))
}
