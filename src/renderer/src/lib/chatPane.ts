// Un chat fuera del principal: el de al lado (arrastrado a la derecha, en lugar del espacio 3D) y el de una ventana
// suelta (clic con la rueda). Los dos son la misma interfaz cargada con ?chatProject=…&chatConversation=…: solo el
// chat de esa conversación, que el motor deja ver y escribir sin abrirla (el principal sigue en la suya).

/** Tipo del arrastre de un chat de la barra lateral (lo pone cada fila de conversación al empezar a arrastrar). */
export const CHAT_DRAG_TYPE = 'application/x-kywai-chat'

export interface ChatRef {
  projectId: string
  conversationId: string
  title?: string
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_\-]{0,80}$/

function validRef(projectId: unknown, conversationId: unknown): projectId is string {
  return typeof projectId === 'string' && typeof conversationId === 'string' && ID_RE.test(projectId) && ID_RE.test(conversationId)
}

/** El chat que muestra esta página si es un chat suelto o el de al lado (null en la ventana principal). */
export function readBoundChat(search: string): (ChatRef & { embedded: boolean }) | null {
  const q = new URLSearchParams(search)
  const projectId = q.get('chatProject')
  const conversationId = q.get('chatConversation')
  if (!validRef(projectId, conversationId)) return null
  return { projectId, conversationId: conversationId!, embedded: q.get('embedded') === '1' }
}

export const boundChat = typeof location === 'undefined' ? null : readBoundChat(location.search)

/** Dirección de la interfaz con solo ese chat (en Electron, el index.html; por web, la raíz del servidor). */
export function chatPaneUrl(ref: ChatRef, embedded: boolean, base = location.href): string {
  const u = new URL(base)
  u.search = ''
  u.hash = ''
  u.searchParams.set('chatProject', ref.projectId)
  u.searchParams.set('chatConversation', ref.conversationId)
  if (embedded) u.searchParams.set('embedded', '1')
  return u.toString()
}

/**
 * Clic con la rueda en un chat: lo abre en una ventana aparte (en la app, una ventana de kywai que se puede llevar
 * a otro monitor; en el navegador, una ventana nueva). Si ese chat ya tenía ventana, la reutiliza.
 */
export function openChatWindow(ref: ChatRef): void {
  const w = window.open(chatPaneUrl(ref, false), `kywai-chat-${ref.conversationId}`, 'popup,width=760,height=900')
  w?.focus()
}

/** Lee el chat que viene en un arrastre (null si lo que se arrastra no es un chat de la barra). */
export function draggedChat(data: DataTransfer | null): ChatRef | null {
  if (!data || !Array.from(data.types).includes(CHAT_DRAG_TYPE)) return null
  try {
    const raw = JSON.parse(data.getData(CHAT_DRAG_TYPE)) as { projectId?: unknown; conversationId?: unknown; title?: unknown }
    if (!validRef(raw.projectId, raw.conversationId)) return null
    return { projectId: raw.projectId, conversationId: raw.conversationId as string, ...(typeof raw.title === 'string' ? { title: raw.title } : {}) }
  } catch {
    return null
  }
}

/** ¿Se está arrastrando un chat? (durante dragover el contenido no se puede leer, solo los tipos). */
export function isChatDrag(data: DataTransfer | null): boolean {
  return !!data && Array.from(data.types).includes(CHAT_DRAG_TYPE)
}

// ---------- Chat de al lado: cuál es (se recuerda en este equipo) ----------

const SPLIT_KEY = 'kywai.splitChat'

export function readSplitChat(): ChatRef | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SPLIT_KEY) ?? 'null') as ChatRef | null
    return raw && validRef(raw.projectId, raw.conversationId) ? raw : null
  } catch {
    return null
  }
}

export function saveSplitChat(ref: ChatRef | null): void {
  try {
    if (ref) localStorage.setItem(SPLIT_KEY, JSON.stringify(ref))
    else localStorage.removeItem(SPLIT_KEY)
  } catch {
    // Sin almacenamiento: no se recuerda al volver a abrir.
  }
}

// ---------- Mensajes entre el chat de al lado (marco) y la ventana principal ----------

export type PaneMessage =
  | { kywaiPane: 'close' }
  | { kywaiPane: 'popout'; ref: ChatRef }
  | { kywaiPane: 'switched'; ref: ChatRef }

/** Desde el chat de al lado: avisa a la ventana principal (cerrarlo, sacarlo a ventana, cambió de conversación). */
export function tellParent(msg: PaneMessage): void {
  if (window.parent === window) return
  try {
    window.parent.postMessage(msg, location.origin === 'null' || location.protocol === 'file:' ? '*' : location.origin)
  } catch {
    // Sin ventana principal: nada que avisar.
  }
}

export function isPaneMessage(data: unknown): data is PaneMessage {
  return !!data && typeof data === 'object' && typeof (data as { kywaiPane?: unknown }).kywaiPane === 'string'
}
