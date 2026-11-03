import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentConfig, CliAgentSpec } from '@shared/types'
import { expandArgs, genericArgs, runGeneric, setAgentKeyResolver } from './generic'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cowork-generic-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function agent(spec: Partial<CliAgentSpec>): AgentConfig {
  return {
    id: 'falso',
    name: 'Falso',
    provider: 'cli',
    model: '',
    modelLabel: 'Auto',
    color: '#fff',
    stationId: 'st-falso',
    role: '',
    strengths: [],
    enabled: true,
    cli: { command: 'node', versionArgs: ['--version'], promptVia: 'stdin', args: ['agente.cjs'], ...spec }
  }
}

function run(
  spec: Partial<CliAgentSpec>,
  script: string,
  over: { prompt?: string; mode?: 'plan' | 'work'; access?: 'full' | 'project'; model?: string; signal?: AbortSignal } = {}
): ReturnType<typeof runGeneric> {
  writeFileSync(join(dir, 'agente.cjs'), script)
  return runGeneric({
    agent: agent(spec),
    model: over.model ?? '',
    prompt: over.prompt ?? 'Haz algo',
    cwd: dir,
    mode: over.mode ?? 'work',
    access: over.access ?? 'project',
    signal: over.signal ?? new AbortController().signal
  })
}

describe('argumentos', () => {
  it('sustituye {prompt}, {promptFile} y {model}', () => {
    expect(expandArgs(['-m', '{model}', '--file', '{promptFile}', '{prompt}'], { model: 'gpt', promptFile: 'a.md', prompt: 'lee' })).toEqual([
      '-m',
      'gpt',
      '--file',
      'a.md',
      'lee'
    ])
  })

  it('al planificar añade solo lectura; con acceso completo, aprobar todo; el modelo solo si lo hay y es seguro', () => {
    const spec = agent({ args: ['run'], planArgs: ['--read-only'], fullAccessArgs: ['--yes'], modelArgs: ['--model', '{model}'] }).cli!
    const vars = { prompt: '', promptFile: '' }
    expect(genericArgs(spec, { mode: 'plan', access: 'full', model: 'o4' }, vars)).toEqual(['run', '--read-only', '--model', 'o4'])
    expect(genericArgs(spec, { mode: 'work', access: 'full', model: '' }, vars)).toEqual(['run', '--yes'])
    expect(genericArgs(spec, { mode: 'work', access: 'project', model: 'a b;c' }, vars)).toEqual(['run'])
  })
})

describe('ejecución', () => {
  it('stdin: el encargo entra por la entrada estándar y la salida es el resultado, con sus saltos de línea', async () => {
    const script = "let t='';process.stdin.on('data',c=>t+=c).on('end',()=>{console.log('ECO: '+t);console.log('');console.log('  sangrado')})"
    const r = await run({}, script, { prompt: 'Hola; & mundo | "x"' })
    expect(r.ok).toBe(true)
    expect(r.text).toBe('ECO: Hola; & mundo | "x"\n\n  sangrado')
  })

  it('file: el encargo va en un archivo dentro de la carpeta de trabajo y se borra al terminar', async () => {
    const r = await run(
      { promptVia: 'file', args: ['agente.cjs', '{promptFile}'] },
      "console.log(require('fs').readFileSync(process.argv[2],'utf8')); console.log(process.argv[2])",
      { prompt: 'Encargo en archivo' }
    )
    expect(r.ok).toBe(true)
    expect(r.text).toContain('Encargo en archivo')
    expect(r.text).toMatch(/\.ai-cowork\/encargos\/[0-9a-f-]+\.md/)
    expect(readdirSync(join(dir, '.ai-cowork', 'encargos'))).toEqual([])
  })

  it('arg: recibe una instrucción corta que apunta al archivo, nunca el texto del usuario', async () => {
    const r = await run({ promptVia: 'arg', args: ['agente.cjs', '{prompt}'] }, 'console.log(process.argv[2])', { prompt: 'TEXTO SECRETO DEL USUARIO' })
    expect(r.ok).toBe(true)
    expect(r.text).toMatch(/^Read the file .*\.ai-cowork\/encargos\/.*\.md and carry out/)
    expect(r.text).not.toContain('SECRETO')
  })

  it('clasifica los fallos: sesión, límite de uso, programa que no existe y error', async () => {
    const auth = await run({}, "console.error('Error: please log in first'); process.exit(1)")
    expect(auth).toMatchObject({ ok: false, errorKind: 'auth' })
    const quota = await run({}, "console.error('429 Too Many Requests: rate limit'); process.exit(1)")
    expect(quota).toMatchObject({ ok: false, errorKind: 'quota' })
    const custom = await run({ authPattern: 'sin permiso', quotaPattern: 'no queda saldo' }, "console.error('sin permiso'); process.exit(2)")
    expect(custom.errorKind).toBe('auth')
    const missing = await runGeneric({
      agent: agent({ command: 'programa-que-no-existe-xyz' }),
      model: '',
      prompt: 'x',
      cwd: dir,
      mode: 'work',
      signal: new AbortController().signal
    })
    expect(missing).toMatchObject({ ok: false, errorKind: 'missing' })
    const failed = await run({}, "console.error('algo raro pasó'); process.exit(3)")
    expect(failed).toMatchObject({ ok: false, errorKind: 'failed' })
    expect(failed.errorMessage).toContain('algo raro')
  })

  it('la clave de API guardada del agente entra en su entorno y en el de nadie más', async () => {
    const script = 'console.log(String(process.env.MI_CLAVE) + "|" + String(process.env.OTRA))'
    setAgentKeyResolver((id) => (id === 'falso' ? 'sk-secreta-123456' : null))
    try {
      const withKey = await run({ apiKey: { env: 'MI_CLAVE', label: 'la clave', url: 'https://x.test' } }, script)
      expect(withKey.text).toBe('sk-secreta-123456|undefined')
      // Sin ficha de clave, o sin clave guardada, no se inventa nada.
      expect((await run({}, script)).text).toBe('undefined|undefined')
      setAgentKeyResolver(() => null)
      expect((await run({ apiKey: { env: 'MI_CLAVE', label: 'la clave', url: 'https://x.test' } }, script)).text).toBe('undefined|undefined')
    } finally {
      setAgentKeyResolver(() => null)
    }
  })

  it('se puede cancelar', async () => {
    const ctrl = new AbortController()
    const p = run({}, 'setInterval(()=>{},1000)', { signal: ctrl.signal })
    setTimeout(() => ctrl.abort(), 600)
    expect(await p).toMatchObject({ ok: false, errorKind: 'cancelled' })
  })
})
