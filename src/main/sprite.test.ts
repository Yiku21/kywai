import { describe, expect, it } from 'vitest'
import { parseSpriteRequest, spritePrompt, spriteSlug } from './sprite'

describe('/sprite', () => {
  it('solo reconoce la orden', () => {
    expect(parseSpriteRequest('haz un sprite de un caballero')).toBeNull()
    expect(parseSpriteRequest('/spritesheet algo')).toBeNull()
    expect(parseSpriteRequest('/sprite')).toMatchObject({ what: '', size: 64, directions: 4, animations: ['idle', 'walk'] })
  })

  it('saca el tamaño, las direcciones y las animaciones', () => {
    const r = parseSpriteRequest('/sprite 32px 8 direcciones caballero con capa roja que camina y ataca con espada')!
    expect(r.size).toBe(32)
    expect(r.directions).toBe(8)
    expect(r.animations).toEqual(['walk', 'attack'])
    expect(r.what).toContain('caballero con capa roja')
    expect(parseSpriteRequest('/pixelart 128 ocho direcciones maga, hechizo y correr')).toMatchObject({ size: 128, directions: 8, animations: ['run', 'spellcast'] })
  })

  it('arma el encargo con la carpeta, los adjuntos y los caminos', () => {
    const r = parseSpriteRequest('/sprite caballero con capa')!
    const p = spritePrompt(r, { attachments: ['adjuntos/caballero.glb'], lang: 'español', stamp: 'abc' })
    expect(p).toContain('sprites/caballero-con-capa-abc/')
    expect(p).toContain('adjuntos/caballero.glb')
    expect(p).toContain('PixelLab')
    expect(p).toContain('Blender')
    expect(p).toContain('Image.NEAREST')
    expect(p).toContain('en español')
    expect(spriteSlug('Mago  ÉPICO!!')).toBe('mago-epico')
    expect(spriteSlug('')).toBe('personaje')
  })
})
