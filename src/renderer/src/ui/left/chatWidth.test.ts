import { describe, expect, it } from 'vitest'
import { CHAT_MIN, clampChatWidth, SPACE_MIN } from './chatWidth'

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
