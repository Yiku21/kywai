// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setCurrentLang as __setLangForTests } from '@shared/i18n'

const emitted = vi.hoisted(() => [] as unknown[])
vi.mock('./events', () => ({ emit: (e: unknown) => emitted.push(e) }))

import { createTemplate, deleteTemplate, forgetProjectTemplates, getTemplate, initTemplates, listTemplates, resolveTemplate, restoreBuiltinTemplates, updateTemplate } from './templates'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aicw-tpl-'))
  emitted.length = 0
  initTemplates(dir, { isProject: (id) => id === 'p1' || id === 'p2' })
})

afterEach(() => {
  __setLangForTests('es')
  rmSync(dir, { recursive: true, force: true })
})

describe('plantillas de tareas (motor)', () => {
  it('la primera vez vienen las de serie, que siguen el idioma mientras no se cambien', () => {
    const list = listTemplates()
    expect(list.map((x) => x.builtin)).toEqual(['review-pr', 'summarize-folder', 'find-bugs', 'write-tests', 'update-deps', 'explain-code'])
    expect(list[0]).toEqual(expect.objectContaining({ name: 'Revisar PR', command: 'revisar-pr', icon: '🔍' }))
    expect(list[1].prompt).toContain('{carpeta}')
    // En el archivo no va su texto.
    expect(readFileSync(join(dir, 'templates.json'), 'utf8')).not.toContain('Revisa el pull request')
    __setLangForTests('en')
    expect(listTemplates()[0]).toEqual(expect.objectContaining({ name: 'Review PR', command: 'review-pr' }))
    expect(listTemplates()[1].prompt).toContain('{folder}')
  })

  it('si las borras todas no vuelven solas; «Restaurar» las pone otra vez', () => {
    for (const t of listTemplates()) deleteTemplate(t.id)
    initTemplates(dir)
    expect(listTemplates()).toEqual([])
    expect(restoreBuiltinTemplates()).toHaveLength(6)
    expect(restoreBuiltinTemplates()).toHaveLength(6)
  })

  it('un archivo roto no se pisa', () => {
    writeFileSync(join(dir, 'templates.json'), '{roto')
    initTemplates(dir)
    expect(listTemplates()).toEqual([])
    expect(readFileSync(join(dir, 'templates.json'), 'utf8')).toBe('{roto')
  })

  it('crea, comprueba y cambia; avisa con templates.updated', () => {
    const t = createTemplate({ name: '  Informe semanal ', prompt: 'Resume la semana de {equipo}', projectId: 'p1', askPlan: true })
    expect(t).toEqual(expect.objectContaining({ name: 'Informe semanal', command: 'informe-semanal', projectId: 'p1', askPlan: true }))
    expect(emitted.at(-1)).toEqual({ kind: 'templates.updated', templates: listTemplates() })
    expect(() => createTemplate({ name: 'X', prompt: 'y', command: 'rutina' })).toThrow(/ya es una orden de kywai/)
    expect(() => createTemplate({ name: 'Informe semanal', prompt: 'y', projectId: 'p1' })).toThrow(/Ya hay una plantilla/)
    // En otro ámbito sí se puede repetir la orden.
    expect(createTemplate({ name: 'Informe semanal', prompt: 'y' }).command).toBe('informe-semanal')
    expect(() => createTemplate({ name: '', prompt: 'y' })).toThrow(/Falta el nombre/)
    expect(() => createTemplate({ name: 'X', prompt: 'y', projectId: 'otro' })).toThrow(/Proyecto no válido/)
    expect(() => createTemplate({ name: 'X', prompt: 'y', command: 'Con espacios' })).toThrow(/La orden/)
    expect(() => createTemplate({ name: 'X', prompt: 'y', icon: 'demasiado largo' })).toThrow(/emoji/)
    // Al cambiar el nombre, la orden lo sigue si salía de él.
    expect(updateTemplate(t.id, { name: 'Informe del mes' }).command).toBe('informe-del-mes')
    expect(updateTemplate(t.id, { command: 'mes' }).command).toBe('mes')
    expect(updateTemplate(t.id, { name: 'Otro nombre' }).command).toBe('mes')
    const general = updateTemplate(t.id, { projectId: null, askPlan: false, pinned: true })
    expect(general.projectId).toBeUndefined()
    expect(general.askPlan).toBeUndefined()
    expect(general.pinned).toBe(true)
    expect(() => updateTemplate('no', { name: 'x' })).toThrow(/ya no existe/)
  })

  it('al cambiar una de serie solo se guarda lo cambiado', () => {
    const b = listTemplates()[0]
    updateTemplate(b.id, { pinned: true, name: b.name })
    __setLangForTests('en')
    expect(getTemplate(b.id)).toEqual(expect.objectContaining({ name: 'Review PR', pinned: true }))
    updateTemplate(b.id, { name: 'My review' })
    __setLangForTests('es')
    expect(getTemplate(b.id)!.name).toBe('My review')
    expect(getTemplate(b.id)!.prompt).toContain('Revisa el pull request')
  })

  it('al eliminar un proyecto se van sus plantillas', () => {
    createTemplate({ name: 'Solo p2', prompt: 'x', projectId: 'p2' })
    forgetProjectTemplates('p2')
    expect(listTemplates().some((x) => x.projectId === 'p2')).toBe(false)
  })

  it('resuelve la plantilla de un mensaje: por id (texto ya relleno) o por «/orden …»', () => {
    const t = createTemplate({ name: 'Traducir', prompt: 'Traduce {texto} al inglés', projectId: 'p1' })
    expect(resolveTemplate('/traducir hola mundo', 'p1')).toEqual({ template: t, text: 'Traduce hola mundo al inglés' })
    expect(resolveTemplate('/traducir hola', 'p2')).toBeNull()
    expect(resolveTemplate('/revisar-pr 42', 'p2')!.text).toContain('pull request 42')
    expect(resolveTemplate('Traduce algo', 'p1', t.id)).toEqual({ template: t, text: 'Traduce algo' })
    expect(() => resolveTemplate('x', 'p2', t.id)).toThrow(/ya no existe/)
    expect(resolveTemplate('hola', 'p1')).toBeNull()
  })
})
