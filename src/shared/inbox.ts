// Lo común de los avisos de la bandeja para el motor y la interfaz: cuáles esperan algo de ti y cómo se leen en el
// idioma de cada app.
import type { InboxItem, InboxKind } from './types'

/**
 * La X de un aviso (POST /inbox/{id}/hide en la API móvil, actInbox(id, 'hide') en las apps): lo descarta para siempre
 * sin tocar la tarea. No es un botón del aviso: vale para todos.
 */
export const INBOX_HIDE = 'hide'

/** Los avisos que no esperan nada de ti: van a Resultados (como «nuevo») y no cuentan en «Te necesita». */
export const INBOX_INFO_KINDS: readonly InboxKind[] = ['done']

/** ¿Este aviso espera algo de ti (sale en «Te necesita»)? */
export function needsYou(item: { kind: InboxKind }): boolean {
  return !INBOX_INFO_KINDS.includes(item.kind)
}

/** El aviso en el idioma de quien lo lee (si el motor lo dejó escrito en ese idioma; si no, como venga). */
export function localizeInbox(item: InboxItem, lang: string): InboxItem {
  const tx = item.texts?.[lang]
  if (!tx) return item
  return {
    ...item,
    title: tx.title || item.title,
    ...(tx.detail != null ? { detail: tx.detail } : {}),
    actions: item.actions.map((a) => (tx.actions?.[a.id] ? { ...a, label: tx.actions[a.id] } : a))
  }
}
