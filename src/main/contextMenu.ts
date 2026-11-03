// Menú del clic derecho: Electron no trae ninguno. Se adapta a dónde se pulsa (texto seleccionado, un campo de
// texto, un enlace, una imagen, una palabra mal escrita).
import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'

/** Lo que el menú puede hacer fuera de los «roles» de Electron (copiar, pegar…). */
export interface ContextActions {
  replaceMisspelling(word: string): void
  addToDictionary(word: string): void
  openLink(url: string): void
  copyText(text: string): void
  copyImage(x: number, y: number): void
}

type Params = Pick<
  ContextMenuParams,
  'isEditable' | 'selectionText' | 'editFlags' | 'linkURL' | 'mediaType' | 'srcURL' | 'misspelledWord' | 'dictionarySuggestions' | 'x' | 'y'
>

const SEP: MenuItemConstructorOptions = { type: 'separator' }

/** Elementos del menú para ese punto (vacío: no se abre ningún menú). */
export function contextMenuItems(p: Params, act: ContextActions): MenuItemConstructorOptions[] {
  const groups: MenuItemConstructorOptions[][] = []

  // Corrector: sugerencias para la palabra subrayada.
  if (p.isEditable && p.misspelledWord) {
    const suggestions = p.dictionarySuggestions.slice(0, 5).map((s): MenuItemConstructorOptions => ({ label: s, click: () => act.replaceMisspelling(s) }))
    groups.push([
      ...(suggestions.length ? suggestions : [{ label: 'Sin sugerencias', enabled: false }]),
      { label: 'Añadir al diccionario', click: () => act.addToDictionary(p.misspelledWord) }
    ])
  }

  if (/^https?:\/\//i.test(p.linkURL)) {
    groups.push([
      { label: 'Abrir enlace en el navegador', click: () => act.openLink(p.linkURL) },
      { label: 'Copiar dirección del enlace', click: () => act.copyText(p.linkURL) }
    ])
  }

  if (p.mediaType === 'image' && p.srcURL) groups.push([{ label: 'Copiar imagen', click: () => act.copyImage(p.x, p.y) }])

  const f = p.editFlags
  if (p.isEditable) {
    groups.push(
      [
        { label: 'Deshacer', role: 'undo', enabled: f.canUndo },
        { label: 'Rehacer', role: 'redo', enabled: f.canRedo }
      ],
      [
        { label: 'Cortar', role: 'cut', enabled: f.canCut },
        { label: 'Copiar', role: 'copy', enabled: f.canCopy },
        { label: 'Pegar', role: 'paste', enabled: f.canPaste },
        { label: 'Pegar sin formato', role: 'pasteAndMatchStyle', enabled: f.canPaste },
        { label: 'Eliminar', role: 'delete', enabled: f.canDelete }
      ],
      [{ label: 'Seleccionar todo', role: 'selectAll', enabled: f.canSelectAll }]
    )
  } else if (p.selectionText.trim()) {
    groups.push([{ label: 'Copiar', role: 'copy', enabled: f.canCopy }])
  }

  return groups.flatMap((g, i) => (i ? [SEP, ...g] : g))
}
