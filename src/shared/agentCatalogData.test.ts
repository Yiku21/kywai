import { describe, expect, it } from 'vitest'
import { AGENT_CATALOG, catalogEntry } from './agentCatalog'
import { DEFAULT_AGENTS } from './defaults'

/** Lo único que puede ir como argumento de un programa (la línea de órdenes nunca lleva texto del usuario). */
const SAFE_ARG = /^[\p{L}\p{N}_.:\-/=,@ ]*$/u

describe('catálogo de agentes', () => {
  it('los identificadores son únicos', () => {
    const ids = AGENT_CATALOG.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('los de fábrica apuntan a un agente que existe', () => {
    for (const e of AGENT_CATALOG.filter((x) => x.kind === 'builtin')) {
      expect(DEFAULT_AGENTS.some((a) => a.id === e.template), e.id).toBe(true)
    }
  })

  it('cada agente de terminal dice cómo se lanza, con argumentos que una consola no puede interpretar', () => {
    for (const e of AGENT_CATALOG.filter((x) => x.kind === 'cli')) {
      const spec = e.cli!
      expect(spec, e.id).toBeTruthy()
      expect(spec.command, e.id).toMatch(/^[\w.-]+$/)
      expect(['stdin', 'file', 'arg'], e.id).toContain(spec.promptVia)
      const all = [...spec.args, ...(spec.workArgs ?? []), ...(spec.fullAccessArgs ?? []), ...(spec.planArgs ?? []), ...(spec.modelArgs ?? []), ...spec.versionArgs]
      for (const a of all) {
        const expanded = a.replace(/\{(prompt|promptFile|model)\}/g, 'x')
        expect(expanded, `${e.id}: ${a}`).toMatch(SAFE_ARG)
        // Los únicos marcadores que se entienden.
        expect(a.replace(/\{(prompt|promptFile|model)\}/g, ''), `${e.id}: ${a}`).not.toMatch(/[{}]/)
      }
      // El marcador del encargo tiene que corresponder a cómo lo recibe.
      if (spec.promptVia === 'arg') expect(spec.args.some((a) => a.includes('{prompt}')), `${e.id} necesita {prompt}`).toBe(true)
      if (spec.promptVia === 'file') expect(all.some((a) => a.includes('{promptFile}')), `${e.id} necesita {promptFile}`).toBe(true)
      if (spec.promptVia === 'stdin') expect(all.some((a) => a.includes('{prompt}') || a.includes('{promptFile}')), `${e.id} no usa marcadores con stdin`).toBe(false)
      // Se puede instalar en algún sistema o se explica dónde.
      expect(spec.install || spec.url, e.id).toBeTruthy()
      // Sus expresiones de error son válidas.
      for (const p of [spec.authPattern, spec.quotaPattern]) if (p) expect(() => new RegExp(p, 'i'), `${e.id}: ${p}`).not.toThrow()
      // Y la ficha dice qué se le da bien.
      expect(e.strengths.length, e.id).toBeGreaterThan(0)
      expect(e.summary, e.id).toBeTruthy()
      expect(e.account, e.id).toBeTruthy()
    }
  })

  it('están los agentes de terminal con suscripción añadidos en octubre de 2026, y Qwen Code (no solo el Qwen local)', () => {
    for (const id of ['antigravity', 'rovodev', 'minimax', 'qoder', 'qwen-code', 'kiro']) expect(catalogEntry(id)?.kind, id).toBe('cli')
    expect(catalogEntry('qwen-code')!.cli!.command).toBe('qwen')
    // Qoder se lanza por su binario de la CLI: «qoder» puede abrir el editor.
    expect(catalogEntry('qoder')!.cli!.command).toBe('qodercli')
  })

  it('cada uno se lanza como dice su documentación, sin el texto del encargo en la línea de órdenes', () => {
    const vars = { prompt: 'Read the file /p/x.md and carry out exactly the instructions in it.', promptFile: '/p/x.md' }
    const args = (id: string, mode: 'plan' | 'work', access: 'full' | 'project' = 'project'): string[] => {
      const spec = catalogEntry(id)!.cli!
      const t = [...spec.args, ...(mode === 'plan' ? (spec.planArgs ?? []) : access === 'full' && spec.fullAccessArgs ? spec.fullAccessArgs : (spec.workArgs ?? []))]
      return t.map((a) => a.replace('{prompt}', vars.prompt).replace('{promptFile}', vars.promptFile))
    }
    expect(args('antigravity', 'work', 'full')).toEqual(['-p', vars.prompt, '--dangerously-skip-permissions'])
    expect(args('rovodev', 'work', 'full')).toEqual(['rovodev', 'run', vars.prompt, '--yolo'])
    expect(args('minimax', 'work', 'full')).toEqual(['exec', '--input', '-', '--permission', 'full'])
    expect(args('qoder', 'plan')).toEqual(['-p', '--permission-mode', 'plan'])
    expect(args('qoder', 'work')).toEqual(['-p', '--permission-mode', 'accept_edits'])
    expect(args('qwen-code', 'plan')).toEqual(['-p', 'Follow the instructions above.', '--approval-mode', 'plan'])
    expect(args('qwen-code', 'work', 'full')).toEqual(['-p', 'Follow the instructions above.', '--approval-mode', 'yolo'])
    expect(args('kiro', 'work')).toEqual(['chat', '--no-interactive', vars.prompt, '--trust-tools=read,grep,write'])
    expect(args('kiro', 'work', 'full')).toEqual(['chat', '--no-interactive', vars.prompt, '--trust-all-tools'])
    // Los que leen el encargo por stdin no llevan nada del usuario en sus argumentos.
    for (const id of ['minimax', 'qoder', 'qwen-code']) expect(catalogEntry(id)!.cli!.promptVia, id).toBe('stdin')
  })

  it('Kiro vale con la sesión de kiro-cli login o con su clave', () => {
    const spec = catalogEntry('kiro')!.cli!
    expect(spec.login).toBe('kiro-cli login')
    expect(spec.authCheck).toBeTruthy()
    expect(spec.apiKey?.env).toBe('KIRO_API_KEY')
  })
})
