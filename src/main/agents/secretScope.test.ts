import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentConfig } from '@shared/types'
import { runAgent } from './index'
import { setSecretRedactor } from './secretScope'
import type { TraceUpdate } from './types'

const PIT = 'pit-1a2b3c4d-5e6f-7a8b-9c0d-112233445566'
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cowork-secreto-'))
  setSecretRedactor((text) => text.split(PIT).join('[secreto GHL_PIT]'))
})
afterEach(() => {
  setSecretRedactor((text) => text)
  rmSync(dir, { recursive: true, force: true })
})

const agent: AgentConfig = {
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
  cli: { command: 'node', versionArgs: ['--version'], promptVia: 'stdin', args: ['agente.cjs'] }
}

describe('secretos en una tarea', () => {
  it('el programa recibe la variable y lo que imprime sale tapado', async () => {
    // Un agente «descuidado»: usa la variable y además la imprime.
    writeFileSync(join(dir, 'agente.cjs'), `process.stdin.resume();process.stdin.on('end',()=>{console.log('Usé el token ' + process.env.GHL_PIT + ' y funcionó')});`)
    const traces: TraceUpdate[] = []
    const res = await runAgent({
      agent,
      model: '',
      prompt: 'Haz algo',
      cwd: dir,
      mode: 'work',
      access: 'project',
      secrets: { GHL_PIT: PIT },
      signal: new AbortController().signal,
      onTrace: (u) => traces.push(u)
    })
    expect(res.ok).toBe(true)
    expect(res.text).toContain('Usé el token [secreto GHL_PIT] y funcionó')
    expect(res.text).not.toContain(PIT)
    expect(JSON.stringify(traces)).not.toContain(PIT)
  })

  it('sin secretos, el programa no ve ninguna variable de otro encargo', async () => {
    writeFileSync(join(dir, 'agente.cjs'), `process.stdin.resume();process.stdin.on('end',()=>{console.log('valor:' + (process.env.GHL_PIT ?? 'ninguno'))});`)
    const res = await runAgent({ agent, model: '', prompt: 'Haz algo', cwd: dir, mode: 'work', access: 'project', signal: new AbortController().signal })
    expect(res.text).toContain('valor:ninguno')
  })
})
