import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConfig, AgentRuntime } from '@shared/types'
import { DEFAULT_AGENTS } from '@shared/defaults'

// Motor de escritorio simulado: registra los reinicios y responde que quedó disponible.
const fake = vi.hoisted(() => {
  const calls: string[] = []
  const thinking: Array<[string, boolean]> = []
  ;(window as unknown as { cowork: unknown }).cowork = new Proxy(
    {
      setAgentThinking: async (id: string, on: boolean): Promise<void> => {
        thinking.push([id, on])
      },
      resetAgent: async (id: string): Promise<Partial<AgentRuntime>> => {
        calls.push(id)
        return { agentId: id, activity: 'idle' }
      }
    } as Record<string, unknown>,
    { get: (t, k: string) => t[k] ?? (async () => undefined) }
  )
  return { calls, thinking }
})

import { useCowork } from '@/store/cowork'
import { SelectionPanel } from './SelectionPanel'

let root: Root
let host: HTMLDivElement
const gemini = DEFAULT_AGENTS.find((a) => a.id === 'gemini')!

async function show(runtime: Partial<AgentRuntime>, agent: AgentConfig = gemini): Promise<void> {
  const s = useCowork.getState()
  useCowork.setState({
    mode: 'live',
    selection: { type: 'agent', id: agent.id },
    live: { ...s.live, agents: { [agent.id]: agent }, runtimes: { [agent.id]: { agentId: agent.id, ...runtime } as AgentRuntime } }
  })
  await act(async () => root.render(<SelectionPanel />))
}

const button = (text: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fake.calls.length = 0
  fake.thinking.length = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('panel del agente', () => {
  it('un agente con error se reinicia desde su panel; uno que funciona no lo necesita', async () => {
    await show({ activity: 'error', reason: '[API Error: An unknown error occurred.]' })
    expect(host.textContent).toContain('An unknown error occurred')
    await act(async () => button('Reiniciar agente')!.click())
    expect(fake.calls).toEqual(['gemini'])
    expect(host.textContent).toContain('Reiniciado: vuelve a estar disponible')

    await show({ activity: 'idle' })
    expect(button('Reiniciar agente')).toBeUndefined()
  })

  it('el agente local tiene el interruptor de razonamiento, apagado por defecto; los demás no', async () => {
    const local: AgentConfig = { ...gemini, id: 'lmstudio', name: 'Qwen', provider: 'lmstudio' }
    await show({ activity: 'idle' }, local)
    const sw = host.querySelector<HTMLButtonElement>('button[role="switch"]')!
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(host.textContent).toContain('Apagado: responde directamente')
    await act(async () => sw.click())
    expect(fake.thinking).toEqual([['lmstudio', true]])

    await show({ activity: 'idle' }, { ...local, thinking: true })
    expect(host.querySelector('button[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
    expect(host.textContent).toContain('Encendido: piensa antes de responder')

    await show({ activity: 'idle' })
    expect(host.querySelector('button[role="switch"]')).toBeNull()
  })
})
