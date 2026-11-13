import { describe, expect, it } from 'vitest'
import { cleanBlockedError, plainNotice, withoutTeamNotes } from './blockedNotice'

const REPLY = `GHL rechazó la sesión con un error 401. Guardé la copia anterior, pero no actualicé los datos ni regeneré el PDF.

Guarda un token nuevo en Secretos con \`/secreto GHL_SESSION\`, sin «Bearer», y escribe **«listo»**. Entonces podré continuar.

## Para la memoria
- hecho: En «Reporte GHL nuevo con el workflow actualizado» guardé la copia del PDF y los datos anteriores en \`artifacts/reporte-ghl/\`.

## Habilidad nueva
---
name: reporte-ghl
---`

describe('aviso de tarea bloqueada', () => {
  it('quita las secciones para el equipo', () => {
    const out = withoutTeamNotes(REPLY)
    expect(out).not.toMatch(/memoria|Habilidad|hecho:/i)
    expect(out).toMatch(/Entonces podré continuar\.$/)
  })

  it('reconoce la sección también en negrita', () => {
    expect(withoutTeamNotes('Falta la clave.\n\n**Para la memoria**\n- hecho: x')).toBe('Falta la clave.')
  })

  it('deja el texto llano y en una línea', () => {
    expect(plainNotice(withoutTeamNotes(REPLY))).toBe(
      'GHL rechazó la sesión con un error 401. Guardé la copia anterior, pero no actualicé los datos ni regeneré el PDF. Guarda un token nuevo en Secretos con /secreto GHL_SESSION, sin «Bearer», y escribe «listo». Entonces podré continuar.'
    )
  })

  it('quita viñetas, títulos y cursivas sin tocar los guiones bajos de los nombres', () => {
    expect(plainNotice('# Falta\n- instala *ffmpeg*\n- define MY_KEY')).toBe('Falta instala ffmpeg define MY_KEY')
  })

  it('limpia un aviso viejo ya guardado en una línea', () => {
    const old = 'Bloqueada: GHL rechazó la sesión. Guarda un token con `/secreto GHL_SESSION` y escribe **«listo»**. Entonces podré continuar. ## Para la memoria - hecho: En «Reporte» guardé la copia en `artifacts/reporte-g…'
    expect(cleanBlockedError(old)).toBe('Bloqueada: GHL rechazó la sesión. Guarda un token con /secreto GHL_SESSION y escribe «listo». Entonces podré continuar.')
  })

  it('no cambia un aviso que ya está limpio', () => {
    expect(cleanBlockedError('Bloqueada: falta la clave de la API.')).toBe('Bloqueada: falta la clave de la API.')
  })
})
