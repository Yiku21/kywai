import { describe, expect, it } from 'vitest'
import { freeImageSize, freeImageUrl, freeImagesOn, retryAfterSeconds, FREE_IMAGES_URL } from './freeImages'

describe('motor gratis de imágenes', () => {
  it('pide 9:16 o 16:9 con semilla estable y el texto en la ruta', () => {
    expect(freeImageSize(true)).toEqual({ width: 576, height: 1024 })
    expect(freeImageSize(false)).toEqual({ width: 1024, height: 576 })
    const a = freeImageUrl('a cute robot', true)
    expect(a.startsWith(`${FREE_IMAGES_URL}a%20cute%20robot?`)).toBe(true)
    expect(a).toContain('width=576')
    expect(a).toContain('height=1024')
    expect(a).toBe(freeImageUrl('a  cute robot ', true))
    expect(freeImageUrl('x'.repeat(5000), false).length).toBeLessThan(1200)
  })

  it('lee cuánto pide esperar el límite del plan gratis', () => {
    expect(retryAfterSeconds('{"message":"Free limit reached: 1 image every 45 seconds per IP. Retry after 36s, or get…"}')).toBe(36)
    expect(retryAfterSeconds('otro error')).toBeNull()
  })

  it('se apaga con KYWAI_NO_FREE_IMAGES=1', () => {
    expect(freeImagesOn({})).toBe(true)
    expect(freeImagesOn({ KYWAI_NO_FREE_IMAGES: '1' })).toBe(false)
  })
})
