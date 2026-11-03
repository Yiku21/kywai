import { describe, expect, it, vi } from 'vitest'
import { contextMenuItems, type ContextActions } from './contextMenu'

const flags = { canUndo: false, canRedo: false, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true, canEditRichly: false }
const base = { isEditable: false, selectionText: '', editFlags: flags, linkURL: '', mediaType: 'none' as const, srcURL: '', misspelledWord: '', dictionarySuggestions: [] as string[], x: 10, y: 20 }
const actions = (): ContextActions => ({ replaceMisspelling: vi.fn(), addToDictionary: vi.fn(), openLink: vi.fn(), copyText: vi.fn(), copyImage: vi.fn() })
const labels = (items: ReturnType<typeof contextMenuItems>): string[] => items.map((i) => (i.type === 'separator' ? '—' : String(i.label)))

describe('menú del clic derecho', () => {
  it('en el chat, con texto seleccionado: copiar; sin nada, no hay menú', () => {
    expect(labels(contextMenuItems({ ...base, selectionText: 'hola equipo' }, actions()))).toEqual(['Copiar'])
    expect(contextMenuItems(base, actions())).toEqual([])
  })

  it('en el cuadro de texto: deshacer, cortar, copiar, pegar y seleccionar todo, según se pueda', () => {
    const items = contextMenuItems({ ...base, isEditable: true }, actions())
    expect(labels(items)).toEqual(['Deshacer', 'Rehacer', '—', 'Cortar', 'Copiar', 'Pegar', 'Pegar sin formato', 'Eliminar', '—', 'Seleccionar todo'])
    expect(items.find((i) => i.label === 'Pegar')).toMatchObject({ role: 'paste', enabled: true })
    expect(items.find((i) => i.label === 'Deshacer')).toMatchObject({ role: 'undo', enabled: false })
  })

  it('palabra mal escrita: sugerencias y añadir al diccionario, antes de editar', () => {
    const act = actions()
    const items = contextMenuItems({ ...base, isEditable: true, misspelledWord: 'hloa', dictionarySuggestions: ['hola', 'hoja'] }, act)
    expect(labels(items).slice(0, 4)).toEqual(['hola', 'hoja', 'Añadir al diccionario', '—'])
    items[0].click?.({} as never, undefined, {} as never)
    expect(act.replaceMisspelling).toHaveBeenCalledWith('hola')
  })

  it('enlaces e imágenes', () => {
    const act = actions()
    const link = contextMenuItems({ ...base, linkURL: 'https://dev.meta.ai/docs' }, act)
    expect(labels(link)).toEqual(['Abrir enlace en el navegador', 'Copiar dirección del enlace'])
    link[1].click?.({} as never, undefined, {} as never)
    expect(act.copyText).toHaveBeenCalledWith('https://dev.meta.ai/docs')
    // Los enlaces internos (file:, javascript:) no se ofrecen.
    expect(contextMenuItems({ ...base, linkURL: 'javascript:alert(1)' }, act)).toEqual([])
    const img = contextMenuItems({ ...base, mediaType: 'image', srcURL: 'cowork://file/a.png' }, act)
    img[0].click?.({} as never, undefined, {} as never)
    expect(act.copyImage).toHaveBeenCalledWith(10, 20)
  })
})
