// @vitest-environment node
// El gateway de Hermes valida las herramientas con su propia configuración: si rechaza un servidor de Extensiones
// («unknown or invalid toolset name»), kywai repite el encargo sin ellos en vez de dar la tarea por fallida.
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { runHermes } from './agents/hermes'

const bin = mkdtempSync(join(tmpdir(), 'aicw-hermes-bin-'))
const oldPath = process.env.PATH
writeFileSync(
  join(bin, 'hermes'),
  `#!/bin/sh
case "$*" in
  *github*) echo "Hermes couldn't start the model connection: invalid_params (toolsets: unknown or invalid toolset name: 'github'). Your message was not sent."; exit 1 ;;
  *) echo "OK" ;;
esac
`
)
chmodSync(join(bin, 'hermes'), 0o755)
process.env.PATH = `${bin}:${oldPath}`
afterAll(() => {
  process.env.PATH = oldPath
})

describe.skipIf(process.platform === 'win32')('Hermes y su gateway', () => {
  it('si el gateway no conoce un servidor de Extensiones, repite sin ellos', async () => {
    const res = await runHermes({
      agent: { id: 'hermes', provider: 'hermes' } as never,
      model: '',
      prompt: 'hola',
      cwd: bin,
      mode: 'work',
      extraMcp: { names: ['github'], args: [], env: {} },
      signal: new AbortController().signal
    } as never)
    expect(res.ok).toBe(true)
    expect(res.text).toBe('OK')
  })
})
