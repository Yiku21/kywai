import { describe, expect, it } from 'vitest'
import { CHAT_DRAG_TYPE, chatPaneUrl, draggedChat, isChatDrag, isPaneMessage, readBoundChat } from './chatPane'

function transfer(data: Record<string, string>): DataTransfer {
  return { types: Object.keys(data), getData: (k: string) => data[k] ?? '' } as unknown as DataTransfer
}

describe('chat de al lado y ventana suelta', () => {
  it('la dirección lleva el proyecto y la conversación, y se lee igual', () => {
    const url = chatPaneUrl({ projectId: 'videos-ab12', conversationId: 'c-1-x' }, true, 'file:///app/out/renderer/index.html?viejo=1#algo')
    expect(url).toBe('file:///app/out/renderer/index.html?chatProject=videos-ab12&chatConversation=c-1-x&embedded=1')
    expect(readBoundChat(new URL(url).search)).toEqual({ projectId: 'videos-ab12', conversationId: 'c-1-x', embedded: true })
    const web = chatPaneUrl({ projectId: 'p', conversationId: 'c' }, false, 'http://100.1.2.3:8787/')
    expect(web).toBe('http://100.1.2.3:8787/?chatProject=p&chatConversation=c')
    expect(readBoundChat(new URL(web).search)?.embedded).toBe(false)
  })

  it('sin los dos datos (o con caracteres raros) es la ventana principal', () => {
    expect(readBoundChat('')).toBeNull()
    expect(readBoundChat('?chatProject=p')).toBeNull()
    expect(readBoundChat('?chatProject=../x&chatConversation=c')).toBeNull()
  })

  it('lee el chat arrastrado desde la barra lateral y nada más', () => {
    const ok = transfer({ [CHAT_DRAG_TYPE]: JSON.stringify({ projectId: 'p1', conversationId: 'c-2', title: 'Vídeo' }) })
    expect(isChatDrag(ok)).toBe(true)
    expect(draggedChat(ok)).toEqual({ projectId: 'p1', conversationId: 'c-2', title: 'Vídeo' })
    expect(isChatDrag(transfer({ Files: '' }))).toBe(false)
    expect(draggedChat(transfer({ [CHAT_DRAG_TYPE]: '{roto' }))).toBeNull()
    expect(draggedChat(transfer({ [CHAT_DRAG_TYPE]: JSON.stringify({ projectId: 'p1' }) }))).toBeNull()
    expect(draggedChat(null)).toBeNull()
  })

  it('reconoce los avisos del chat de al lado', () => {
    expect(isPaneMessage({ kywaiPane: 'close' })).toBe(true)
    expect(isPaneMessage({ otra: 'cosa' })).toBe(false)
    expect(isPaneMessage('close')).toBe(false)
  })
})
