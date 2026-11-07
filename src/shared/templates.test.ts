import { describe, expect, it } from 'vitest'
import { commandFromName, commandQuery, fillFromArgs, fillTemplate, matchTemplateCommand, slotLabel, templateSlots, templatesFor } from './templates'

const tpl = (over: Partial<{ id: string; command: string; projectId: string; pinned: boolean; createdAt: number }>) => ({
  id: 'x',
  command: 'x',
  createdAt: 1,
  ...over
})

describe('plantillas de tareas', () => {
  it('encuentra los huecos en orden, sin repetir y en cualquier idioma', () => {
    expect(templateSlots('Revisa el PR {pr} y luego {pr} otra vez en {carpeta-origen}')).toEqual(['pr', 'carpeta-origen'])
    expect(templateSlots('Lee {文件夹} y {número}')).toEqual(['文件夹', 'número'])
    // Llaves que no son huecos (JSON, código) no cuentan.
    expect(templateSlots('Devuelve {"a": 1} o { b } o {1x}')).toEqual([])
    expect(templateSlots('{a}{b}{c}{d}{e}{f}{g}')).toHaveLength(6)
    expect(slotLabel('nombre-del_archivo')).toBe('Nombre del archivo')
  })

  it('rellena los huecos y deja vacíos los que no tienen valor', () => {
    expect(fillTemplate('Revisa {pr} en {repo}', { pr: ' 42 ', repo: 'kywai' })).toBe('Revisa 42 en kywai')
    expect(fillTemplate('Revisa {pr} en {repo}', { pr: '42' })).toBe('Revisa 42 en')
    expect(fillTemplate('Sin huecos', {})).toBe('Sin huecos')
  })

  it('lo de detrás de «/orden» rellena el hueco (con varios, separados por «|»); sin huecos va al final', () => {
    expect(fillFromArgs('Revisa el PR {pr}', '42')).toBe('Revisa el PR 42')
    expect(fillFromArgs('De {a} a {b}', 'Madrid | Lisboa | Oporto')).toBe('De Madrid a Lisboa | Oporto')
    expect(fillFromArgs('Actualiza las dependencias.', 'solo las de desarrollo')).toBe('Actualiza las dependencias.\n\nsolo las de desarrollo')
    expect(fillFromArgs('Actualiza las dependencias.', '')).toBe('Actualiza las dependencias.')
  })

  it('saca la orden del nombre', () => {
    expect(commandFromName('Revisar PR')).toBe('revisar-pr')
    expect(commandFromName('  Explicar código  ')).toBe('explicar-codigo')
    expect(commandFromName('2 resúmenes')).toBe('p-2-resumenes')
    expect(commandFromName('总结')).toBe('')
    expect(commandFromName('a'.repeat(50))).toHaveLength(30)
  })

  it('las de un proyecto y las generales; las fijadas primero', () => {
    const list = [tpl({ id: 'a', createdAt: 1 }), tpl({ id: 'b', projectId: 'p1', createdAt: 2 }), tpl({ id: 'c', projectId: 'p2', createdAt: 3 }), tpl({ id: 'd', pinned: true, createdAt: 4 })]
    expect(templatesFor(list, 'p1').map((x) => x.id)).toEqual(['d', 'a', 'b'])
    expect(templatesFor(list, null).map((x) => x.id)).toEqual(['d', 'a'])
  })

  it('reconoce «/orden …» y prefiere la del proyecto', () => {
    const list = [tpl({ id: 'g', command: 'revisar' }), tpl({ id: 'p', command: 'revisar', projectId: 'p1' })]
    expect(matchTemplateCommand('/revisar el 42', list, 'p1')).toEqual({ template: list[1], args: 'el 42' })
    expect(matchTemplateCommand('/Revisar', list, 'p2')).toEqual({ template: list[0], args: '' })
    expect(matchTemplateCommand('/otra cosa', list, 'p1')).toBeNull()
    expect(matchTemplateCommand('revisar', list, 'p1')).toBeNull()
    expect(commandQuery('/rev')).toBe('rev')
    expect(commandQuery('/rev algo')).toBeNull()
  })
})
