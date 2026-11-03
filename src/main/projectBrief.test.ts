import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { forgetBrief, projectBrief, testCommand } from './projectBrief'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aicw-brief-'))
  forgetBrief()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const write = (rel: string, text: string): void => {
  mkdirSync(join(root, rel, '..'), { recursive: true })
  writeFileSync(join(root, rel), text, 'utf8')
}

describe('ficha automática del proyecto', () => {
  it('cuenta de qué va, cómo se prueba, qué se tocó hace poco y qué hay, sin dependencias ni compilados', () => {
    write('README.md', '# Recetas\n\nWeb de recetas con buscador.\n')
    write('package.json', JSON.stringify({ scripts: { test: 'vitest run', dev: 'vite' }, dependencies: { react: '1' }, devDependencies: { vitest: '2' } }))
    write('src/app.ts', 'export {}')
    write('src/ui/index.html', '<html>')
    write('node_modules/react/index.js', 'x')
    write('dist/bundle.js', 'x')
    write('.ai-cowork/entregables/nota.md', 'x')
    const old = new Date(Date.now() - 40 * 86_400_000)
    utimesSync(join(root, 'src', 'ui', 'index.html'), old, old)
    const text = projectBrief(root).join('\n')
    expect(text).toContain('## El proyecto (ficha automática')
    expect(text).toContain('Web de recetas con buscador.')
    expect(text).toContain('scripts npm «test», «dev»')
    expect(text).toContain('dependencias: react, vitest')
    expect(text).toContain('pruebas: «npm test»')
    expect(text).toMatch(/Archivos cambiados en los últimos días[\s\S]*- src\/app\.ts/)
    expect(text).not.toMatch(/Archivos cambiados en los últimos días[\s\S]*- src\/ui\/index\.html[\s\S]*### Carpetas/)
    expect(text).toContain('- src/ui/index.html')
    expect(text).not.toContain('node_modules')
    expect(text).not.toContain('dist/')
    expect(text).not.toContain('.ai-cowork')
  })

  it('sin comando de pruebas lo dice, y detecta pytest, cargo y go', () => {
    write('README.md', 'hola')
    expect(projectBrief(root).join('\n')).toContain('no se ha detectado ningún comando de pruebas')
    expect(testCommand(root)).toBeNull()
    write('Cargo.toml', '[package]')
    expect(testCommand(root)).toBe('cargo test')
  })

  it('una carpeta vacía o inexistente no añade nada, y el árbol se corta en 150 entradas', () => {
    expect(projectBrief(join(root, 'no-existe'))).toEqual([])
    expect(projectBrief(root)).toEqual([])
    for (let i = 0; i < 200; i++) write(`datos/f${String(i).padStart(3, '0')}.txt`, 'x')
    forgetBrief()
    const text = projectBrief(root).join('\n')
    expect(text).toContain('(las 150 primeras entradas)')
    expect(text.split('### Carpetas')[1].split('\n').filter((l) => l.startsWith('- datos/')).length).toBeLessThanOrEqual(150)
  })

  it('se cachea un minuto por carpeta', () => {
    write('a.txt', 'x')
    const first = projectBrief(root)
    write('b.txt', 'x')
    expect(projectBrief(root)).toBe(first)
    forgetBrief(root)
    expect(projectBrief(root).join('\n')).toContain('- b.txt')
  })
})
