import { describe, expect, it } from 'vitest'
import { inScope, normalizeScope, outsideScope } from './scope'

describe('archivos de cada tarea', () => {
  it('limpia la lista del plan', () => {
    expect(normalizeScope(['./artifacts/app/', 'artifacts\\api.js', '/README.md', '../fuera', 'C:/x', 7, 'artifacts/app/'])).toEqual([
      'artifacts/app/',
      'artifacts/api.js',
      'README.md'
    ])
    expect(normalizeScope('artifacts/')).toEqual([])
  })

  it('archivo exacto, carpeta (con o sin barra) y comodines', () => {
    const own = ['artifacts/app/motor/', 'artifacts/app/ui', 'artifacts/app/server.js', 'tests/**/*.test.js']
    expect(inScope('artifacts/app/motor/reglas.js', own)).toBe(true)
    expect(inScope('artifacts/app/ui/index.html', own)).toBe(true)
    expect(inScope('artifacts/app/ui', own)).toBe(true)
    expect(inScope('artifacts/app/uix/a.js', own)).toBe(false)
    expect(inScope('artifacts/app/server.js', own)).toBe(true)
    expect(inScope('tests/api/reservas.test.js', own)).toBe(true)
    expect(inScope('tests/reservas.test.js', own)).toBe(true)
    expect(inScope('tests/reservas.js', own)).toBe(false)
  })

  it('avisa de lo que se salió (sin declarar archivos, nada)', () => {
    const changed = ['artifacts/app/motor/a.js', 'artifacts/app/ui/b.js', 'package.json', '.ai-cowork/entregables/nota.md']
    expect(outsideScope(changed, ['artifacts/app/motor/'])).toEqual(['artifacts/app/ui/b.js', 'package.json'])
    expect(outsideScope(changed, [])).toEqual([])
  })
})
