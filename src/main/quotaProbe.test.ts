import { describe, expect, it } from 'vitest'
import { claudeOverrides, parseClaudeUsage, parseCodexAppRateLimits, parseResetTime, withoutClaudeOverrides } from './quotaProbe'

// 2026-10-11 05:00 UTC (00:00 en Etc/GMT+5, que es UTC-5).
const NOW = Date.UTC(2026, 9, 11, 5, 0)

describe('consulta de cuotas', () => {
  it('lee las horas de renovación de «/usage» en su zona horaria', () => {
    expect(parseResetTime('Oct 11, 5:19am (Etc/GMT+5)', NOW)).toBe(Date.UTC(2026, 9, 11, 10, 19))
    expect(parseResetTime('Oct 12, 2am (Etc/GMT+5)', NOW)).toBe(Date.UTC(2026, 9, 12, 7, 0))
    expect(parseResetTime('Oct 12, 1:59pm (Etc/GMT+5)', NOW)).toBe(Date.UTC(2026, 9, 12, 18, 59))
    // Solo la hora: hoy, o mañana si ya pasó.
    expect(parseResetTime('3am (Etc/GMT+5)', NOW)).toBe(Date.UTC(2026, 9, 11, 8, 0))
    // Enero visto en octubre: el año que viene.
    expect(parseResetTime('Jan 2, 9am (Etc/GMT+5)', NOW)).toBe(Date.UTC(2027, 0, 2, 14, 0))
    expect(parseResetTime('pronto', NOW)).toBeNull()
  })

  it('convierte el texto de «/usage» de Claude Code en ventanas de uso', () => {
    const text = [
      'You are currently using your subscription to power your Claude Code usage',
      '',
      'Current session: 2% used · resets Oct 11, 5:19am (Etc/GMT+5)',
      'Current week (all models): 19% used · resets Oct 12, 1:59am (Etc/GMT+5)',
      'Current week (Fable): 0% used · resets Oct 12, 1:59am (Etc/GMT+5)',
      '',
      "What's contributing to your limits usage?",
      'Last 24h · 1919 requests · 3 sessions'
    ].join('\n')
    const info = parseClaudeUsage(text, NOW)!
    expect(info.provider).toBe('claude')
    expect(info.windows).toEqual([
      { name: 'five_hour', usedPct: 2, resetsAt: Date.UTC(2026, 9, 11, 10, 19) },
      { name: 'seven_day', usedPct: 19, resetsAt: Date.UTC(2026, 9, 12, 6, 59) },
      { name: 'seven_day_fable', usedPct: 0, resetsAt: Date.UTC(2026, 9, 12, 6, 59) }
    ])
    // Con clave de API (sin suscripción) no hay ventanas.
    expect(parseClaudeUsage('You are currently using the API. Total cost: $0.00', NOW)).toBeNull()
  })

  it('detecta si Claude Code pasa por otro servidor (sin enseñar claves)', () => {
    const omni = JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'http://localhost:20128/v1', ANTHROPIC_AUTH_TOKEN: 'sk-secreto' } })
    const r = claudeOverrides(omni, {})
    expect(r.server).toBe('http://localhost:20128')
    expect(r.names).toEqual(['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN'])
    expect(JSON.stringify(r)).not.toContain('sk-secreto')
    // Desde el entorno, y apiKeyHelper en los ajustes.
    expect(claudeOverrides(JSON.stringify({ apiKeyHelper: '~/bin/clave.sh' }), { ANTHROPIC_API_KEY: 'x' }).names).toEqual(['ANTHROPIC_API_KEY', 'apiKeyHelper'])
    // El servidor oficial de Anthropic no cuenta como desvío.
    expect(claudeOverrides(null, { ANTHROPIC_BASE_URL: 'https://api.anthropic.com' })).toEqual({ server: null, names: [] })
    // Cuenta normal de claude.ai: nada.
    expect(claudeOverrides(JSON.stringify({ model: 'sonnet', env: { DISABLE_TELEMETRY: '1' } }), {})).toEqual({ server: null, names: [] })
    expect(claudeOverrides(null, {})).toEqual({ server: null, names: [] })
    expect(claudeOverrides('no es json', {})).toEqual({ server: null, names: [] })
  })

  it('quita el desvío a OmniRoute de los ajustes de Claude Code y deja lo demás', () => {
    // Lo que tenía el Mac (valores inventados).
    const omni = {
      model: 'sonnet',
      permissions: { allow: ['Bash(npm test)'] },
      env: {
        ANTHROPIC_BASE_URL: 'http://localhost:20128',
        ANTHROPIC_MODEL: 'omni/claude',
        ANTHROPIC_DEFAULT_FABLE_MODEL: 'omni/fable',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'omni/opus',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'omni/sonnet',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'omni/haiku',
        ANTHROPIC_AUTH_TOKEN: 'sk-omni',
        DISABLE_TELEMETRY: '1'
      }
    }
    const r = withoutClaudeOverrides(omni)
    expect(r.removed).toEqual([
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_FABLE_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      'ANTHROPIC_AUTH_TOKEN'
    ])
    expect(r.settings).toEqual({ model: 'sonnet', permissions: { allow: ['Bash(npm test)'] }, env: { DISABLE_TELEMETRY: '1' } })
    // Sin nada más en «env», se quita el bloque; apiKeyHelper también se quita.
    expect(withoutClaudeOverrides({ env: { ANTHROPIC_API_KEY: 'x' }, apiKeyHelper: 'a.sh' })).toEqual({ settings: {}, removed: ['ANTHROPIC_API_KEY', 'apiKeyHelper'] })
    expect(withoutClaudeOverrides({ model: 'opus' })).toEqual({ settings: { model: 'opus' }, removed: [] })
  })

  it('convierte la respuesta del app-server de Codex', () => {
    const rl = parseCodexAppRateLimits(
      {
        rateLimits: {
          limitId: 'codex',
          primary: { usedPercent: 2, windowDurationMins: 10080, resetsAt: 1792295869 },
          secondary: null,
          planType: 'prolite',
          rateLimitReachedType: null
        }
      },
      NOW
    )!
    expect(rl.windows.primary).toEqual({ usedPercent: 2, windowMinutes: 10080, resetsAt: 1792295869000 })
    expect(rl.windows.secondary).toBeUndefined()
    expect(rl.planType).toBe('prolite')
    expect(rl.reachedType).toBeNull()
    expect(rl.updatedAt).toBe(NOW)
    expect(parseCodexAppRateLimits({ rateLimits: { primary: null, secondary: null } }, NOW)).toBeNull()
    expect(parseCodexAppRateLimits(null, NOW)).toBeNull()
  })
})
