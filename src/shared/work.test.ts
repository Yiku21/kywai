import { describe, expect, it } from 'vitest'
import type { TraceEntry } from './types'
import { changedLines, MAX_WORK_STEPS, shortNote, toolsSummary, withoutClosingNotes, workSteps } from './work'

let seq = 0
const text = (body: string): TraceEntry => ({ id: `1-${++seq}`, ts: seq, kind: 'text', title: 'Respuesta', body })
const tool = (t: TraceEntry['tool'], title: string, ok?: boolean, body?: string): TraceEntry => ({ id: `1-${++seq}`, ts: seq, kind: 'tool', tool: t, title, ok, body })

describe('lo que cuenta un agente en el chat mientras trabaja', () => {
  it('sus frases son notas y las herramientas seguidas se juntan en una línea', () => {
    const { steps, hidden } = workSteps([
      { id: '1-0', ts: 0, kind: 'note', title: 'Claude empieza con Sonnet' },
      text('Reviso cómo está montado el formulario.'),
      tool('read', 'Leyendo src/form.tsx'),
      tool('search', 'Buscando «validate»'),
      tool('read', 'Leyendo src/api.ts'),
      { id: '1-x', ts: 9, kind: 'thinking', title: 'Razonando', body: 'mmm' },
      text('El botón no valida el correo: añado la comprobación.'),
      tool('edit', 'Editando src/form.tsx'),
      tool('todo', 'Lista de tareas'),
      tool('command', 'Ejecutando: npm test', false),
      tool('command', 'Ejecutando: npm test', true),
      text('Listo: ya valida el correo y pasan las pruebas.')
    ])
    expect(hidden).toBe(0)
    expect(steps).toMatchObject([
      { kind: 'note', text: 'Reviso cómo está montado el formulario.' },
      {
        kind: 'tools',
        summary: 'Leyó 2 archivos y hizo una búsqueda',
        items: ['Leyendo src/form.tsx', 'Buscando «validate»', 'Leyendo src/api.ts'],
        refs: [{ tool: 'read' }, { tool: 'search' }, { tool: 'read' }]
      },
      { kind: 'note', text: 'El botón no valida el correo: añado la comprobación.' },
      {
        kind: 'tools',
        summary: 'Ejecutó 2 comandos y editó un archivo',
        items: ['Editando src/form.tsx', 'Ejecutando: npm test', 'Ejecutando: npm test'],
        failed: 1,
        refs: [{ tool: 'edit' }, { tool: 'command', ok: false }, { tool: 'command', ok: true }]
      },
      { kind: 'note', text: 'Listo: ya valida el correo y pasan las pruebas.' }
    ])
    // Al acabar, la última nota es el resultado del mensaje: no se repite.
    expect(withoutClosingNotes(steps).map((s) => s.kind)).toEqual(['note', 'tools', 'note', 'tools'])
  })

  it('resume en una frase lo que usó', () => {
    expect(toolsSummary({ command: 1 })).toBe('Ejecutó un comando')
    expect(toolsSummary({ write: 3, web: 2, other: 1 })).toBe('Creó 3 archivos, consultó internet 2 veces y usó una herramienta')
    expect(toolsSummary({})).toBe('')
  })

  it('las notas largas se cortan en un final de frase y las listas largas se recortan', () => {
    const long = 'Primero miro el código. '.repeat(30)
    const note = shortNote(long)
    expect(note.length).toBeLessThanOrEqual(401)
    expect(note.endsWith('código.…')).toBe(true)
    const many = Array.from({ length: 15 }, (_, i) => tool('command', `Ejecutando: paso ${i}`))
    const [group] = workSteps(many).steps as Array<Extract<ReturnType<typeof workSteps>['steps'][number], { kind: 'tools' }>>
    expect([group.items.length, group.more, group.summary]).toEqual([12, 3, 'Ejecutó 15 comandos'])
  })

  it('los archivos que va creando salen como un paso, entre sus frases', () => {
    const files = [
      { relPath: 'avances/ab12/01-hoja.png', name: 'hoja.png', image: true, size: 90_000 },
      { relPath: 'artifacts/notas.md', name: 'notas.md', image: false, size: 1_200 }
    ]
    const { steps } = workSteps([
      text('Genero las capturas.'),
      tool('command', 'Ejecutando: godot --capturar'),
      { id: '1-f', ts: 50, kind: 'files', title: 'Archivos nuevos', body: JSON.stringify(files) },
      text('Las miro para comprobar la composición.'),
      // Un registro estropeado o vacío no rompe nada.
      { id: '1-g', ts: 60, kind: 'files', title: 'Archivos nuevos', body: '{no es json' },
      { id: '1-h', ts: 61, kind: 'files', title: 'Archivos nuevos', body: '[]' }
    ])
    expect(steps).toMatchObject([
      { kind: 'note', text: 'Genero las capturas.' },
      { kind: 'tools', summary: 'Ejecutó un comando', items: ['Ejecutando: godot --capturar'] },
      { kind: 'files', files },
      { kind: 'note', text: 'Las miro para comprobar la composición.' }
    ])
  })

  it('si cuenta mucho, se ven los últimos pasos y cuántos quedan fuera', () => {
    const entries = Array.from({ length: MAX_WORK_STEPS + 5 }, (_, i) => [text(`Paso ${i}`), tool('read', `Leyendo ${i}`)]).flat()
    const { steps, hidden } = workSteps(entries)
    expect(steps).toHaveLength(MAX_WORK_STEPS)
    expect(hidden).toBe((MAX_WORK_STEPS + 5) * 2 - MAX_WORK_STEPS)
    expect(steps.at(-1)).toMatchObject({ kind: 'tools', items: [`Leyendo ${MAX_WORK_STEPS + 4}`] })
  })

  it('cada herramienta lleva su id para pedir el detalle, y el grupo y la tarea, lo que cambiaron', () => {
    const diff = ['src/form.tsx', '', '- const ok = false', '+ const ok = valid(email)', '+ if (!ok) return', '  return ok'].join('\n')
    const created = ['src/valid.ts', '', 'export const valid = () => true', 'export const x = 1', ''].join('\n')
    const edit = tool('edit', 'Editando form.tsx', true, diff)
    const write = tool('write', 'Creando valid.ts', true, created)
    const { steps, totals } = workSteps([text('Cambio la validación.'), edit, write, tool('command', 'Ejecutando: npm test', false), text('Ahora pruebo.'), tool('read', 'Leyendo a.ts')])
    expect(steps[1]).toMatchObject({
      kind: 'tools',
      add: 4,
      del: 1,
      refs: [
        { id: edit.id, tool: 'edit', ok: true, add: 2, del: 1 },
        { id: write.id, tool: 'write', ok: true, add: 2, del: 0 },
        { tool: 'command', ok: false }
      ]
    })
    // El resumen de toda la tarea suma los grupos (aunque algunos ya no quepan en los pasos).
    expect(totals).toEqual({ summary: 'Ejecutó un comando, editó un archivo, creó un archivo y leyó un archivo', failed: 1, add: 4, del: 1 })
    expect(workSteps([text('Solo hablo.')]).totals).toBeUndefined()
  })

  it('cuenta las líneas que cambia una edición o un archivo nuevo', () => {
    expect(changedLines({ tool: 'edit', body: 'a.ts\n\n- uno\n- dos\n+ tres\n  igual' })).toEqual({ add: 1, del: 2 })
    expect(changedLines({ tool: 'write', body: 'a.ts\n\nlínea 1\nlínea 2\nlínea 3\n… (recortado)' })).toEqual({ add: 3, del: 0 })
    expect(changedLines({ tool: 'read', body: 'a.ts' })).toBeNull()
    expect(changedLines({ tool: 'edit', body: undefined })).toBeNull()
  })
})
