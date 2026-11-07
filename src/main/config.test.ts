import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_AGENTS } from '@shared/defaults'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '', getPath: () => '' } }))
const { mergeConfig } = await import('./config')

const museDefault = DEFAULT_AGENTS.find((a) => a.id === 'muse')!
const firstMuse = {
  ...museDefault,
  role: 'Investigar y entender imágenes, PDFs y vídeo; también programa con la terminal',
  strengths: [
    'buscar en internet (su suscripción incluye búsqueda web)',
    'entender imágenes, PDFs y vídeos: los lee directamente',
    'leer mucho de golpe: contexto de 1 millón de tokens',
    'programar con la terminal: edita archivos y ejecuta comandos, como Codex'
  ]
}

describe('configuración guardada', () => {
  it('Muse con su primera ficha pasa a vídeo y refuerzo (su cuota es muy pequeña)', () => {
    const cfg = mergeConfig({ configVersion: 8, agents: [firstMuse] }, '/tmp/aicw')
    const muse = cfg.agents.find((a) => a.id === 'muse')!
    expect(muse.role).toBe('Vídeos y refuerzo cuando Claude o Codex no tienen cuota')
    expect(muse.strengths).toEqual(['entender vídeos: los ve directamente (Claude y Codex no pueden)'])
    expect(muse.avoid?.[0]).toMatch(/^imágenes, PDFs, capturas y búsquedas en internet: Claude y Codex/)
    expect(cfg.configVersion).toBe(10)
  })

  it('Codex pasa a ser el que genera imágenes y Gemini sabe que las suyas no alcanzan la calidad', () => {
    const v8 = (id: string, strengths: string[]) => ({ ...DEFAULT_AGENTS.find((a) => a.id === id)!, strengths, avoid: [] })
    const cfg = mergeConfig(
      {
        configVersion: 8,
        agents: [
          v8('codex', ['apps y scripts completos de principio a fin (el mejor en calidad por minuto: ~11 min por tarea)', 'encontrar y arreglar errores, hacer pasar las pruebas (≈73–75 % en DeepSWE)', 'trabajo con la terminal: instalar, ejecutar, automatizar', 'servidores, APIs y procesar datos']),
          v8('gemini', ['leer y resumir documentos o carpetas enormes (contexto de 1 millón de tokens)', 'resúmenes, traducciones e informes rápidos', 'extraer datos de PDFs y documentos'])
        ]
      },
      '/tmp/aicw'
    )
    expect(cfg.agents.find((a) => a.id === 'codex')!.strengths.at(-1)).toMatch(/^generar imágenes .*el único del equipo/)
    expect(cfg.agents.find((a) => a.id === 'gemini')!.avoid).toContain('generar imágenes: puede, pero no alcanzan la calidad necesaria; las genera Codex')
  })

  it('el rol de Codex (el que se ve en su panel) dice que genera las imágenes; uno cambiado se respeta', () => {
    const codex = DEFAULT_AGENTS.find((a) => a.id === 'codex')!
    const old = { ...codex, role: 'Programación rápida: apps, scripts y terminal' }
    expect(mergeConfig({ configVersion: 9, agents: [old] }, '/tmp/aicw').agents.find((a) => a.id === 'codex')!.role).toBe(
      'Programación rápida (apps, scripts, terminal) y el único que genera imágenes'
    )
    const mine = { ...codex, role: 'Mi programador' }
    expect(mergeConfig({ configVersion: 9, agents: [mine] }, '/tmp/aicw').agents.find((a) => a.id === 'codex')!.role).toBe('Mi programador')
  })

  it('si el usuario cambió la ficha de Muse, se respeta', () => {
    const mine = { ...firstMuse, strengths: ['lo que yo diga'] }
    const muse = mergeConfig({ configVersion: 8, agents: [mine] }, '/tmp/aicw').agents.find((a) => a.id === 'muse')!
    expect(muse.strengths).toEqual(['lo que yo diga'])
  })

  it('un equipo sin Muse lo recibe ya con la ficha nueva', () => {
    const muse = mergeConfig({ configVersion: 8, agents: [] }, '/tmp/aicw').agents.find((a) => a.id === 'muse')!
    expect(muse.strengths).toEqual(museDefault.strengths)
    expect(muse.quotaGroupId).toBe('meta')
  })
})

describe('razonamiento del modelo local', () => {
  it('se guarda solo en el agente de LM Studio y solo si está encendido', () => {
    const qwen = DEFAULT_AGENTS.find((a) => a.id === 'qwen')!
    const cfg = mergeConfig(
      { agents: [{ ...qwen, provider: 'lmstudio', thinking: true }, { ...DEFAULT_AGENTS.find((a) => a.id === 'claude')!, thinking: true }] },
      '/tmp/aicw'
    )
    expect(cfg.agents.find((a) => a.id === 'qwen')?.thinking).toBe(true)
    expect(cfg.agents.find((a) => a.id === 'claude')?.thinking).toBeUndefined()
    expect(mergeConfig({ agents: [{ ...qwen, provider: 'lmstudio', thinking: 'sí' }] }, '/tmp/aicw').agents.find((a) => a.id === 'qwen')?.thinking).toBeUndefined()
  })
})
