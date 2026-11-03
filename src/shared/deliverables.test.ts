import { describe, expect, it } from 'vitest'
import { commonFolder, folderName, folderSummary, kindsSummary } from './deliverables'

describe('entregables agrupados en una carpeta', () => {
  it('la carpeta común de los archivos (o ninguna)', () => {
    const shots = ['artifacts/mobile-app-concepts/01-bienvenida.png', 'artifacts/mobile-app-concepts/02-inicio.png', 'artifacts/mobile-app-concepts/web/index.html']
    expect(commonFolder(shots)).toBe('artifacts/mobile-app-concepts')
    expect(folderName(commonFolder(shots))).toBe('mobile-app-concepts')
    expect(commonFolder(['artifacts\\a.md', 'artifacts\\b.md'])).toBe('artifacts')
    expect(commonFolder(['README.md', 'src/app.ts'])).toBe('')
    expect(folderName('')).toBe('Entregables')
    expect(commonFolder([])).toBe('')
  })

  it('resume qué hay dentro', () => {
    expect(kindsSummary(['image', 'image', 'html', 'image'])).toBe('3 imágenes y 1 página')
    expect(kindsSummary(['markdown'])).toBe('1 documento')
    expect(kindsSummary(['code', 'code', 'text', 'image'])).toBe('2 archivos de código, 1 texto y 1 imagen')
    // Si no añade nada al número de archivos, nada.
    expect(kindsSummary(['image', 'html', 'code', 'markdown', 'other'])).toBe('')
    expect(kindsSummary(['other', 'other'])).toBe('')
    expect(folderSummary(['image', 'image', 'html'], ['Codex'])).toBe('3 archivos · 2 imágenes y 1 página · por Codex')
    expect(folderSummary(['image', 'html', 'code', 'markdown'], ['Codex', 'Claude'])).toBe('4 archivos · por Codex y Claude')
  })
})
