// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILTIN_SKILLS, seedBuiltinSkills } from './builtinSkills'
import { initSkills, listSkills } from './skills'

describe('habilidades de serie', () => {
  it('se copian una vez y, si las borras, no vuelven', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aicw-hab-'))
    expect(seedBuiltinSkills(dir)).toEqual(['principios-ux-animacion'])
    const file = join(dir, 'principios-ux-animacion', 'SKILL.md')
    expect(readFileSync(file, 'utf8')).toContain('44×44 px')
    writeFileSync(file, 'cambiada por el usuario')
    expect(seedBuiltinSkills(dir)).toEqual([])
    expect(readFileSync(file, 'utf8')).toBe('cambiada por el usuario')
    rmSync(join(dir, 'principios-ux-animacion'), { recursive: true })
    expect(seedBuiltinSkills(dir)).toEqual([])
    expect(existsSync(file)).toBe(false)
  })

  it('las ve todo el equipo, con su nombre y para qué sirve', () => {
    const ws = mkdtempSync(join(tmpdir(), 'aicw-ws-'))
    initSkills(ws)
    const ux = listSkills().find((s) => s.name === 'principios-ux-animacion')
    expect(ux?.description).toContain('interfaz')
    for (const text of Object.values(BUILTIN_SKILLS)) expect(text.startsWith('---\nname: ')).toBe(true)
  })
})
