import { describe, expect, it } from 'vitest'
import { fixBullets } from './DocxView'

describe('visor de Word', () => {
  it('cambia las viñetas de Symbol y Wingdings por su símbolo en Unicode', () => {
    const css = 'p.docx-num-1-0:before {\n  content: "\uF0B7\\9";\n  counter-increment: docx-num-1-0;\n  font-family: Symbol;\n}'
    const out = fixBullets(css)
    expect(out).toContain('content: "•\\9"')
    expect(out).not.toContain('Symbol')
    expect(fixBullets('content: "\uF0A7"; font-family: Wingdings;')).toBe('content: "▪"; ')
  })

  it('deja como están los números y las viñetas normales', () => {
    const css = 'content: ""counter(docx-num-5-0, decimal)".\\9";\n  counter-increment: docx-num-5-0;\n}'
    expect(fixBullets(css)).toBe(css)
    expect(fixBullets('content: "o"; font-family: Symbol;')).toBe('content: "o"; font-family: Symbol;')
  })
})
