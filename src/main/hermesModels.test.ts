import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { hermesArgs } from './agents/hermes'
import { hermesModelLabel, hermesModelsInfo, parseHermesConfig } from './hermesModels'

// Como el config.yaml y la caché reales de Hermes (sin claves).
const CONFIG = `model:
  base_url: http://localhost:20128/v1
  default: auto/smart
  provider: omnirouter
  key_env: OMNIROUTER_KEY
providers:
  ollama-launch:
    api: http://127.0.0.1:11434/v1
    default_model: gemma4:26b
  omnirouter:
    name: omnirouter
    base_url: http://localhost:20128/v1
    discover_models: true
agent:
  max_turns: 500
`
const CACHE = {
  copilot: { fp: 'x', at: 1791686531.74, models: ['gpt-5.4', 'gpt-5.4-mini'], fallback: true },
  anthropic: { fp: 'y', at: 1791686531.19, models: ['claude-opus-5-5', 'claude-opus-5'] },
  'custom:http://localhost:20128/v1': { fp: 'z', at: 1789684067.41, models: ['auto/best-coding', 'claude/claude-opus-5', 'auto/smart'] },
  'custom:http://desconocido:9/v1': { models: ['x'] },
  vacio: { models: [] }
}

const home = mkdtempSync(join(tmpdir(), 'aicw-hermes-'))
writeFileSync(join(home, 'config.yaml'), CONFIG)
writeFileSync(join(home, 'provider_models_cache.json'), JSON.stringify(CACHE))
afterAll(() => rmSync(home, { recursive: true, force: true }))

describe('modelos de Hermes («/model»)', () => {
  it('lee su modelo y sus proveedores propios de config.yaml, sin claves', () => {
    const cfg = parseHermesConfig(CONFIG)
    expect(cfg.model).toEqual({ provider: 'omnirouter', model: 'auto/smart', baseUrl: 'http://localhost:20128/v1' })
    expect([...cfg.named]).toEqual([
      ['ollama-launch', 'http://127.0.0.1:11434/v1'],
      ['omnirouter', 'http://localhost:20128/v1']
    ])
    expect(JSON.stringify(cfg)).not.toContain('OMNIROUTER_KEY')
  })

  it('lista los proveedores con sus modelos (el actual primero) y lo que usa ahora', () => {
    const info = hermesModelsInfo({ provider: 'hermes', model: '' } as never, home)
    expect(info.installed).toBe(true)
    expect(info.current).toEqual({ provider: 'omnirouter', model: 'auto/smart', fromApp: false })
    expect(info.providers.map((p) => [p.id, p.label, p.models.length])).toEqual([
      ['omnirouter', 'omnirouter', 3],
      ['copilot', 'GitHub Copilot', 2],
      ['anthropic', 'Anthropic', 2]
    ])
    expect(info.updatedAt).toBe(1791686531740)
  })

  it('lo elegido en AI Cowork manda y se le pasa a Hermes con -m y --provider', () => {
    const info = hermesModelsInfo({ provider: 'hermes', model: 'claude-opus-5', modelProvider: 'anthropic' } as never, home)
    expect(info.current).toEqual({ provider: 'anthropic', model: 'claude-opus-5', fromApp: true })
    expect(info.hermesDefault).toEqual({ provider: 'omnirouter', model: 'auto/smart' })
    expect(info.providers[0].id).toBe('anthropic')
    const args = hermesArgs('/tmp/q.txt', 'claude/claude-opus-5', 'plan', 'omnirouter')
    expect(args.slice(-4)).toEqual(['-m', 'claude/claude-opus-5', '--provider', 'omnirouter'])
    // Sin modelo propio, Hermes usa el de su configuración: ni -m ni --provider.
    expect(hermesArgs('/tmp/q.txt', '', 'plan', 'omnirouter')).not.toContain('--provider')
    expect(hermesArgs('/tmp/q.txt', 'x', 'plan', 'mal proveedor; rm')).not.toContain('--provider')
    expect(hermesModelLabel('claude/claude-opus-5')).toBe('claude-opus-5')
  })

  it('sin Hermes instalado: nada que listar', () => {
    const empty = mkdtempSync(join(tmpdir(), 'aicw-nohermes-'))
    try {
      expect(hermesModelsInfo(undefined, empty)).toEqual({
        installed: false,
        current: { provider: '', model: '', fromApp: false },
        hermesDefault: null,
        providers: [],
        updatedAt: null
      })
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})
