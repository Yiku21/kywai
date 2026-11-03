import { describe, expect, it } from 'vitest'
import type { AgentConfig } from '@shared/types'
import { DEFAULT_AGENTS, upgradeAgentModels, upgradeAgentProfile } from '@shared/defaults'
import { effortFor, modelFacts, planEffortFor } from '@shared/modelCatalog'
import { claudeArgs } from './agents/claude'
import { codexArgs } from './agents/codex'

const agent = (id: string, patch: Partial<AgentConfig> = {}): AgentConfig => ({ ...structuredClone(DEFAULT_AGENTS.find((a) => a.id === id)!), ...patch })

describe('catálogo de modelos y esfuerzo', () => {
  it('esfuerzo por dificultad: bajo en lo fácil, alto/muy alto solo en lo difícil y nunca «max»', () => {
    // Calidad por defecto: lo normal con esfuerzo alto, lo fácil con medio; nunca «low» ni «max».
    expect(['easy', 'medium', 'hard'].map((d) => effortFor('claude', d as 'easy'))).toEqual(['medium', 'high', 'high'])
    expect(['easy', 'medium', 'hard'].map((d) => effortFor('codex', d as 'easy'))).toEqual(['medium', 'high', 'xhigh'])
    expect(planEffortFor('claude')).toBe('high')
    expect(planEffortFor('codex')).toBe('high')
    expect(planEffortFor('hermes')).toBeUndefined()
    expect(effortFor('gemini', 'hard')).toBeUndefined()
    expect(effortFor('lmstudio', 'easy')).toBeUndefined()
  })

  it('datos de cada modelo por su alias o nombre completo', () => {
    expect(modelFacts('sonnet')?.label).toBe('Sonnet 5.5')
    expect(modelFacts('gpt-6.1-sol')?.note).toMatch(/calidad por minuto/)
    expect(modelFacts('GPT-6-ASTRA')?.cost).toMatch(/5 veces/)
    expect(modelFacts('google/gemma-4-e4b')?.speed).toMatch(/34 t\/s/)
    expect(modelFacts('fable')?.cost).toMatch(/créditos/)
    expect(modelFacts('modelo-desconocido')).toBeUndefined()
    expect(modelFacts(undefined)).toBeUndefined()
  })

  it('cada CLI recibe su esfuerzo (Claude: --effort; Codex: model_reasoning_effort)', () => {
    expect(claudeArgs('opus', 'work', 'full', 'high')).toEqual(expect.arrayContaining(['--model', 'opus', '--effort', 'high']))
    expect(claudeArgs('sonnet', 'plan')).not.toContain('--effort')
    const codex = codexArgs('gpt-6.1-sol', 'work', [], 'full', 'xhigh')
    expect(codex.slice(-3)).toEqual(['-c', 'model_reasoning_effort=xhigh', '-'])
    expect(codexArgs('gpt-6.1-sol', 'work')).not.toContain('-c model_reasoning_effort=low')
  })

  it('retomar una sesión: Claude con --resume y Codex con exec resume; las de trabajo se guardan, las de planificar no', () => {
    const sid = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    const claude = claudeArgs('opus', 'work', 'project', 'high', sid)
    expect(claude.slice(0, 6)).toEqual(['-p', '--output-format', 'stream-json', '--verbose', '--resume', sid])
    expect(claude).not.toContain('--no-session-persistence')
    expect(claudeArgs('opus', 'work')).not.toContain('--no-session-persistence')
    expect(claudeArgs('opus', 'plan')).toContain('--no-session-persistence')
    // Un identificador raro no llega a la línea de comandos.
    expect(claudeArgs('opus', 'work', 'project', 'high', 'x; rm -rf /')).not.toContain('--resume')
    const codex = codexArgs('gpt-6.1-sol', 'work', ['attachments/a.png'], 'project', 'high', sid)
    expect(codex.slice(-5)).toEqual(['resume', sid, '-i', 'attachments/a.png', '-'])
    expect(codex.slice(0, 2)).toEqual(['exec', '--json'])
    expect(codexArgs('gpt-6.1-sol', 'work', [], 'project', 'high', 'no-es-un-uuid')).not.toContain('resume')
  })

  it('al actualizar: Codex deja Astra por GPT-6.1 Sol y Gemini fija 3.8 Flash, sin pisar lo elegido', () => {
    const codex = agent('codex', { strongModel: 'gpt-6-astra', strongModelLabel: 'GPT-6 Astra' })
    expect(upgradeAgentModels(codex)).toBe(true)
    expect(codex.strongModel).toBe('gpt-6.1-sol')
    const gemini = agent('gemini', { model: '', modelLabel: 'Auto', lightModel: 'gemini-3.1-flash-lite' })
    expect(upgradeAgentModels(gemini)).toBe(true)
    expect([gemini.model, gemini.lightModel]).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite'])
    // Lo que el usuario cambió se queda.
    const mine = agent('gemini', { model: 'gemini-3.1-pro-preview', lightModel: 'gemini-3.1-flash-lite' })
    upgradeAgentModels(mine)
    expect(mine.model).toBe('gemini-3.1-pro-preview')
    expect(upgradeAgentModels(agent('claude'))).toBe(false)
  })

  it('las fichas de la versión anterior (7) también pasan a las nuevas', () => {
    const v7 = agent('codex', {
      strengths: [
        'apps y scripts completos de principio a fin',
        'lógica, algoritmos, servidores y APIs',
        'encontrar y arreglar errores, hacer pasar las pruebas',
        'trabajo con la terminal: instalar, ejecutar, automatizar',
        'procesar datos y archivos'
      ]
    })
    expect(upgradeAgentProfile(v7)).toBe(true)
    expect(v7.strengths[0]).toMatch(/calidad por minuto/)
    expect(v7.avoid?.[0]).toMatch(/español/)
  })
})
