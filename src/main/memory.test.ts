import { describe, expect, it } from 'vitest'
import type { MemoryEntry } from '@shared/types'
import { memoryLines, parseMemoryNotes, planMemoryNotes, withEntry } from './memory'

const agent = { status: 'provisional' as const, by: 'codex', byName: 'Codex', taskTitle: 'API' }
const user = { status: 'confirmed' as const, by: 'user' as const, byName: 'Tú' }

describe('notas para la memoria al final de una respuesta', () => {
  it('lee decisiones, hechos y pendientes (también «sustituye mN») y solo de su sección', () => {
    const text = [
      'Hecho: creé api.js y store.js.',
      '- decisión: esto no es una nota (está fuera de la sección)',
      '',
      '## Para la memoria',
      '- decisión: Las reservas se guardan en SQLite (data/reservas.db).',
      '- **Hecho**: El puerto 3000 está ocupado en el Mac; se usa el 3100.',
      '- pendiente (sustituye m3): Falta validar el solape de reservas.',
      '- otra cosa: no vale',
      '',
      '## Resumen',
      '- decisión: tampoco cuenta'
    ].join('\n')
    expect(parseMemoryNotes(text)).toEqual([
      { kind: 'decision', text: 'Las reservas se guardan en SQLite (data/reservas.db).', replaces: undefined },
      { kind: 'fact', text: 'El puerto 3000 está ocupado en el Mac; se usa el 3100.', replaces: undefined },
      { kind: 'pending', text: 'Falta validar el solape de reservas.', replaces: 'm3' }
    ])
    expect(parseMemoryNotes('Sin sección de memoria.\n- decisión: nada')).toEqual([])
    expect(parseMemoryNotes('**Para la memoria**\n- hecho: Node 22 instalado')).toEqual([{ kind: 'fact', text: 'Node 22 instalado', replaces: undefined }])
  })

  it('lee las notas del plan del coordinador y descarta lo que no encaja', () => {
    expect(
      planMemoryNotes([
        { kind: 'preference', text: 'Siempre en TypeScript' },
        { kind: 'decisión', text: 'Usar Vite', replaces: 'M2' },
        { kind: 'rara', text: 'x' },
        'nada'
      ])
    ).toEqual([
      { kind: 'preference', text: 'Siempre en TypeScript', replaces: undefined },
      { kind: 'decision', text: 'Usar Vite', replaces: 'm2' }
    ])
  })
})

describe('añadir a la memoria', () => {
  it('numera, no repite y sustituye lo provisional', () => {
    let list: MemoryEntry[] = []
    const a = withEntry(list, { kind: 'decision', text: 'Guardar en JSON' }, agent, 1000)
    list = a.entries
    expect(a.entry?.id).toBe('m1')
    expect(withEntry(list, { kind: 'decision', text: 'guardar en  json.' }, agent).entry).toBeNull()
    const b = withEntry(list, { kind: 'decision', text: 'Guardar en SQLite' }, { ...agent, replaces: 'm1' }, 2000)
    list = b.entries
    expect(b.entry?.id).toBe('m2')
    expect(list.find((e) => e.id === 'm1')).toMatchObject({ status: 'superseded', supersededBy: 'm2' })
  })

  it('un agente no sustituye lo que confirmó el usuario: queda como propuesta', () => {
    let list = withEntry([], { kind: 'preference', text: 'La interfaz en inglés' }, user, 1000).entries
    const r = withEntry(list, { kind: 'decision', text: 'La interfaz en español' }, { ...agent, replaces: 'm1' }, 2000)
    list = r.entries
    expect(list.find((e) => e.id === 'm1')?.status).toBe('confirmed')
    expect(r.entry?.text).toBe('La interfaz en español (propone sustituir m1)')
    // El usuario sí puede.
    const u = withEntry(list, { kind: 'preference', text: 'La interfaz en español, ya' }, { ...user, replaces: 'm1' }, 3000)
    expect(u.entries.find((e) => e.id === 'm1')?.status).toBe('superseded')
  })

  it('en los encargos va lo confirmado primero y nada de lo sustituido', () => {
    let list: MemoryEntry[] = []
    list = withEntry(list, { kind: 'fact', text: 'Hecho viejo de un agente' }, agent, Date.UTC(2026, 9, 1)).entries
    list = withEntry(list, { kind: 'preference', text: 'Todo en TypeScript' }, user, Date.UTC(2026, 9, 2)).entries
    list = withEntry(list, { kind: 'fact', text: 'Hecho corregido' }, { ...agent, replaces: 'm1' }, Date.UTC(2026, 9, 3)).entries
    const lines = memoryLines(list)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^- m2 · preferencia · confirmado · el usuario, \d+ oct\.?: Todo en TypeScript$/)
    expect(lines[1]).toMatch(/^- m3 · hecho · provisional · Codex \(«API»\), \d+ oct\.?: Hecho corregido$/)
  })
})
