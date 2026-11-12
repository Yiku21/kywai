import { describe, expect, it } from 'vitest'
import { applyOrder, chatKey, dropPlace, placeKey, projectKey } from './dragOrder'

describe('orden de la barra lateral al arrastrar', () => {
  it('lo nuevo va arriba por fecha y lo ordenado después, como lo dejó el usuario', () => {
    const items = ['nuevo', 'b', 'a', 'c']
    expect(applyOrder(items, (x) => x, ['a', 'b', 'c'])).toEqual(['nuevo', 'a', 'b', 'c'])
    expect(applyOrder(items, (x) => x, [])).toEqual(items)
    expect(applyOrder(items, (x) => x, ['borrado', 'c'])).toEqual(['nuevo', 'b', 'a', 'c'])
  })

  it('coloca antes, después o al final', () => {
    expect(placeKey(['a', 'b', 'c'], 'c', 'a', false)).toEqual(['c', 'a', 'b'])
    expect(placeKey(['a', 'b', 'c'], 'a', 'c', true)).toEqual(['b', 'c', 'a'])
    expect(placeKey(['a', 'b'], 'x', 'a', true)).toEqual(['a', 'x', 'b'])
    expect(placeKey(['a', 'b'], 'x', null, false)).toEqual(['a', 'b', 'x'])
    expect(placeKey(['a', 'b'], 'a', 'a', true)).toEqual(['a', 'b'])
  })

  it('en un proyecto, el centro de la fila es «dentro»', () => {
    expect(dropPlace(2, 40, true)).toBe('before')
    expect(dropPlace(20, 40, true)).toBe('into')
    expect(dropPlace(38, 40, true)).toBe('after')
    expect(dropPlace(19, 40, false)).toBe('before')
    expect(dropPlace(21, 40, false)).toBe('after')
  })

  it('claves de favoritos', () => {
    expect(projectKey('videos')).toBe('p:videos')
    expect(chatKey('homelab', 'abc')).toBe('c:homelab:abc')
  })
})
