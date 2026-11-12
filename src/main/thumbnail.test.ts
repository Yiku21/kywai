import { describe, expect, it } from 'vitest'
import { coverHtml, fitFont, parseThumbnailPlan, parseThumbnailRequest, thumbnailPrompt } from './thumbnail'

describe('/miniatura', () => {
  it('lee el formato y lo que se pide', () => {
    expect(parseThumbnailRequest('/miniatura')).toEqual({ note: '' })
    expect(parseThumbnailRequest('/portadas youtube que salga la cara')).toEqual({ note: 'que salga la cara', format: 'horizontal' })
    expect(parseThumbnailRequest('/miniatura vertical')).toEqual({ note: '', format: 'vertical' })
    expect(parseThumbnailRequest('/miniaturista')).toBeNull()
  })

  it('las portadas: fotograma que existe, diseño conocido, color válido y como mucho 3', () => {
    const c = parseThumbnailPlan(
      '{"covers": [{"frame": 12, "layout": "grande", "text": "  Lo  hice en 1 día ", "accent": "#FFD400"}, {"frame": 1, "layout": "rara", "text": "Nadie lo sabe", "accent": "rojo"}, {"frame": 2, "text": ""}, {"text": "Tres"}, {"text": "Cuatro"}]}',
      8
    )
    expect(c).toHaveLength(3)
    expect(c[0]).toMatchObject({ frame: 7, layout: 'grande', text: 'Lo hice en 1 día', accent: '#ffd400', x: 0.5 })
    expect(c[1].layout).toBe('lateral')
    expect(c[1].accent).toMatch(/^#[0-9a-f]{6}$/)
    expect(c[2].text).toBe('Tres')
    expect(() => parseThumbnailPlan('{"covers": []}', 8)).toThrow(/ninguna portada/)
  })

  it('el agente ve los fotogramas numerados y dónde va', () => {
    const p = thumbnailPrompt({ about: 'Cómo edito', note: 'que se vea mi cara', format: 'vertical', frames: ['/a/0.jpg', '/a/1.jpg'], lang: 'español' })
    expect(p).toContain('1: /a/1.jpg')
    expect(p).toContain('Reels y TikTok')
    expect(p).toContain('que se vea mi cara')
  })

  it('cada diseño es una página del tamaño justo con el fotograma y el texto escapado', () => {
    for (const layout of ['grande', 'lateral', 'caja'] as const) {
      const html = coverHtml({ frame: 0, text: 'Esto <no> falla', layout, accent: '#ffd400', x: 0.3, y: 0.2 }, '/tmp/f.jpg', { w: 1080, h: 1920 })
      expect(html).toContain('width:1080px;height:1920px')
      expect(html).toContain("url('file:///tmp/f.jpg')")
      expect(html).toContain('&lt;no&gt;')
      expect(html).not.toContain('<no>')
    }
    expect(fitFont('Una frase bastante larga para la portada', 900, 3, 170)).toBeLessThan(170)
  })
})
