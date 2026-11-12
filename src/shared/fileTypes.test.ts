import { describe, expect, it } from 'vitest'
import { countTypes, fileTypeOf } from './fileTypes'

describe('fileTypeOf', () => {
  it('reconoce el tipo por la extensión, sin importar mayúsculas ni carpetas', () => {
    expect(fileTypeOf('videos/where-your-ai-quota-lives.MP4')).toBe('video')
    expect(fileTypeOf('portada.png')).toBe('image')
    expect(fileTypeOf('voz/escena-1.mp3')).toBe('audio')
    expect(fileTypeOf('informe.pdf')).toBe('document')
    expect(fileTypeOf('index.html')).toBe('document')
    expect(fileTypeOf('guion.md')).toBe('document')
    expect(fileTypeOf('beats.json')).toBe('code')
    expect(fileTypeOf('app.tsx')).toBe('code')
    expect(fileTypeOf('paquete.zip')).toBe('other')
  })

  it('sin extensión conocida usa el MIME y luego la clase del artefacto', () => {
    expect(fileTypeOf('foto', 'image/jpeg')).toBe('image')
    expect(fileTypeOf('grabacion', 'audio/webm')).toBe('audio')
    expect(fileTypeOf('nota-de-voz.webm', 'audio/webm')).toBe('audio')
    expect(fileTypeOf('clip', 'video/quicktime')).toBe('video')
    expect(fileTypeOf('notas', undefined, 'markdown')).toBe('document')
    expect(fileTypeOf('script', undefined, 'code')).toBe('code')
    expect(fileTypeOf('raro.bin', 'application/octet-stream', 'other')).toBe('other')
  })

  it('cuenta solo los tipos que aparecen', () => {
    expect(countTypes(['video', 'video', 'image'])).toEqual({ video: 2, image: 1 })
  })
})
