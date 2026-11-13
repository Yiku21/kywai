import { describe, expect, it } from 'vitest'
import { hasSourceView, isImageFile, isTextual, previewKind, typeLabel } from './preview'

describe('panel de vista previa', () => {
  it('elige cómo mostrar cada archivo por su extensión', () => {
    expect(previewKind('00_LEEME.md')).toBe('markdown')
    expect(previewKind('web/index.HTML')).toBe('html')
    expect(previewKind('logo.svg')).toBe('svg')
    expect(previewKind('foto.JPG')).toBe('image')
    expect(previewKind('informe.pdf')).toBe('pdf')
    expect(previewKind('demo.mp4')).toBe('video')
    expect(previewKind('voz.m4a')).toBe('audio')
    expect(previewKind('src/app.tsx')).toBe('code')
    expect(previewKind('Dockerfile')).toBe('code')
    expect(previewKind('registro.log')).toBe('text')
    expect(previewKind('datos.bin')).toBe('other')
  })

  it('abre los documentos de Word con su visor', () => {
    expect(previewKind('Informe final.DOCX')).toBe('word')
    expect(previewKind('plantilla.dotx')).toBe('word')
    expect(previewKind('sin-extension', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('word')
    expect(isTextual('word')).toBe(false)
  })

  it('sin extensión conocida, se fía del tipo MIME', () => {
    expect(previewKind('pegado', 'image/png')).toBe('image')
    expect(previewKind('archivo.raro', 'application/pdf')).toBe('pdf')
  })

  it('sabe qué tiene vista de código, qué es texto y qué va en miniatura', () => {
    expect(hasSourceView('markdown')).toBe(true)
    expect(hasSourceView('image')).toBe(false)
    expect(isTextual('code')).toBe(true)
    expect(isTextual('pdf')).toBe(false)
    expect(isImageFile('a.webp')).toBe(true)
    expect(isImageFile('a.svg')).toBe(true)
    expect(isImageFile('a.md')).toBe(false)
    expect(typeLabel('notas.md')).toBe('MD')
  })
})
