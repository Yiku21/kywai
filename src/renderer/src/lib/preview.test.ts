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

  it('abre las hojas de cálculo como tabla (y el CSV también como texto)', () => {
    expect(previewKind('ventas.xlsx')).toBe('sheet')
    expect(previewKind('antiguo.XLS')).toBe('sheet')
    expect(previewKind('libre.ods')).toBe('sheet')
    expect(previewKind('mac.numbers')).toBe('sheet')
    expect(previewKind('datos.csv')).toBe('table')
    expect(previewKind('datos.tsv')).toBe('table')
    expect(hasSourceView('table')).toBe(true)
    expect(isTextual('table')).toBe(true)
    expect(isTextual('sheet')).toBe(false)
  })

  it('abre las presentaciones de PowerPoint como diapositivas', () => {
    expect(previewKind('charla.pptx')).toBe('slides')
    expect(previewKind('pase.PPSX')).toBe('slides')
    expect(isTextual('slides')).toBe(false)
  })

  it('abre OpenDocument, RTF, ePub, Pages y Keynote con su visor', () => {
    expect(previewKind('carta.odt')).toBe('odf')
    expect(previewKind('charla.odp')).toBe('odf')
    expect(previewKind('viejo.rtf')).toBe('rtf')
    expect(previewKind('novela.epub')).toBe('epub')
    expect(previewKind('nota.pages')).toBe('iwork')
    expect(previewKind('charla.key')).toBe('iwork')
  })

  it('abre modelos 3D, zip, letras y cuadernos de Jupyter', () => {
    expect(previewKind('robot.glb')).toBe('model')
    expect(previewKind('pieza.STL')).toBe('model')
    expect(previewKind('fotos.zip')).toBe('archive')
    expect(previewKind('Inter.woff2')).toBe('font')
    expect(previewKind('analisis.ipynb')).toBe('notebook')
    expect(hasSourceView('notebook')).toBe(true)
    expect(previewKind('subtitulos.srt')).toBe('text')
    expect(previewKind('esquema.graphql')).toBe('code')
  })

  it('lo demás de oficina (.doc, .ppt, Visio…) va por LibreOffice', () => {
    expect(previewKind('viejo.doc')).toBe('office')
    expect(previewKind('charla.ppt')).toBe('office')
    expect(previewKind('plano.vsdx')).toBe('office')
    expect(previewKind('charla.pptm')).toBe('slides')
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
