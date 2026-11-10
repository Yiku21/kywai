// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scriptFileOf, scriptSource } from './videoScriptFile'

describe('guion desde un archivo del proyecto', () => {
  const root = mkdtempSync(join(tmpdir(), 'aicw-guion-'))
  mkdirSync(join(root, 'artifacts', 'guiones', 'redes'), { recursive: true })
  writeFileSync(join(root, 'artifacts', 'guiones', 'redes', '01-stop-picking-one-ai.md'), '# Stop picking one AI\nHook: you pay for three.')
  mkdirSync(join(root, '.ai-cowork', 'entregables', 'guiones'), { recursive: true })
  writeFileSync(join(root, '.ai-cowork', 'entregables', 'guiones', '02-team.md'), 'Team script')
  const outside = mkdtempSync(join(tmpdir(), 'aicw-fuera-'))
  writeFileSync(join(outside, 'secreto.md'), 'no')

  it('lee el guion que nombra la idea', () => {
    const f = scriptFileOf('usa el guion de artifacts/guiones/redes/01-stop-picking-one-ai.md (léelo entero)', [root])
    expect(f).toEqual({ path: 'artifacts/guiones/redes/01-stop-picking-one-ai.md', text: '# Stop picking one AI\nHook: you pay for three.' })
    expect(scriptSource(f!)).toContain('GUION DEL USUARIO')
  })

  it('los entregables también en .ai-cowork/entregables', () => {
    expect(scriptFileOf('artifacts/guiones/02-team.md', [root])?.text).toBe('Team script')
  })

  it('nada fuera del proyecto ni archivos que no existen', () => {
    expect(scriptFileOf(join(outside, 'secreto.md'), [root])).toBeNull()
    expect(scriptFileOf('../' + join('..', outside, 'secreto.md'), [root])).toBeNull()
    expect(scriptFileOf('artifacts/guiones/no-existe.md', [root])).toBeNull()
    expect(scriptFileOf('un vídeo sobre el café', [root])).toBeNull()
  })
})
