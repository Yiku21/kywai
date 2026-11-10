import { describe, expect, it } from 'vitest'
import { CHAT_CLOSE, CHAT_MIN, clampChatWidth, dragOutcome, SPACE_CLOSE, SPACE_MIN } from './chatWidth'

describe('clampChatWidth', () => {
  it('respeta el ancho pedido si cabe', () => {
    expect(clampChatWidth(520, 1200)).toBe(520)
  })
  it('nunca baja del mínimo del chat', () => {
    expect(clampChatWidth(120, 1200)).toBe(CHAT_MIN)
  })
  it('deja siempre sitio al espacio 3D', () => {
    expect(clampChatWidth(1100, 1200)).toBe(1200 - SPACE_MIN)
  })
  it('en una ventana mínima gana el chat', () => {
    expect(clampChatWidth(500, 500)).toBe(CHAT_MIN)
  })
})

describe('dragOutcome', () => {
  it('un arrastre normal solo cambia el ancho', () => {
    expect(dragOutcome(600, 1200)).toBeNull()
  })
  it('llevar el borde casi hasta la derecha oculta el espacio 3D', () => {
    expect(dragOutcome(1200 - SPACE_CLOSE + 1, 1200)).toBe('hide-space')
  })
  it('llevar el borde casi hasta la izquierda deja solo el 3D', () => {
    expect(dragOutcome(CHAT_CLOSE - 1, 1200)).toBe('hide-chat')
  })
})
