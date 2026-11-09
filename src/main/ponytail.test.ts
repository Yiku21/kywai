import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensurePonytail, ponytailPromptLines, ponytailReviewLines, ponytailRules } from './ponytail'

const dirs: string[] = []
function withRules(text: string): string {
  const base = mkdtempSync(join(tmpdir(), 'ponytail-'))
  dirs.push(base)
  mkdirSync(join(base, 'ponytail'), { recursive: true })
  writeFileSync(join(base, 'ponytail', 'SKILL.md'), text, 'utf8')
  return base
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('Código escueto (Ponytail)', () => {
  it('apagado no añade nada al encargo ni al verificador', () => {
    const base = withRules('---\nname: ponytail\n---\n\n# Ponytail\nRegla.')
    expect(ponytailPromptLines(false, base)).toEqual([])
    expect(ponytailReviewLines(false)).toEqual([])
  })

  it('encendido pasa las reglas sin su encabezado', () => {
    const base = withRules('---\nname: ponytail\ndescription: >\n  algo\n---\n\n# Ponytail\nThe best code is the code never written.')
    expect(ponytailRules(base)).toBe('# Ponytail\nThe best code is the code never written.')
    const lines = ponytailPromptLines(true, base).join('\n')
    expect(lines).toContain('## Código escueto (Ponytail)')
    expect(lines).toContain('never written')
    expect(lines).not.toContain('description:')
  })

  it('sin las reglas descargadas no inventa nada', () => {
    const base = mkdtempSync(join(tmpdir(), 'ponytail-'))
    dirs.push(base)
    expect(ponytailPromptLines(true, base)).toEqual([])
  })

  it('la nota del verificador no usa la línea del veredicto', () => {
    const text = ponytailReviewLines(true).join('\n')
    expect(text).toContain('Código de más:')
    expect(text).not.toMatch(/VEREDICTO|VERDICT/)
  })

  it('si ya están descargadas no vuelve a GitHub', async () => {
    const base = withRules('---\nname: ponytail\n---\nx')
    await expect(ensurePonytail(base)).resolves.toBeUndefined()
  })
})
