import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentRuntime } from '@shared/types'
import { DEFAULT_AGENTS } from '@shared/defaults'

// Motor de escritorio simulado: registra los reinicios y responde que quedó disponible.
const fake = vi.hoisted(() => {
  const calls: string[] = []
  ;(window as unknown as { cowork: unknown }).cowork = new Proxy(
    {
      resetAgent: async (id: string): Promise<Partial<AgentRuntime>> => {
        calls.push(id)
        return { agentId: id, activity: 'idle' }
      }
    } as Record<string, unknown>,
    { get: (t, k: string) => t[k] ?? (async () => undefined) }
  )
  return { calls }
})

import { useCowork } from '@/store/cowork'
import { SelectionPanel } from './SelectionPanel'

let root: Root
let host: HTMLDivElement
const gemini = DEFAULT_AGENTS.find((a) => a.id === 'gemini')!

async function show(runtime: Partial<AgentRuntime>): Promise<void> {
  const s = useCowork.getState()
  useCowork.setState({
    mode: 'live',
    selection: { type: 'agent', id: 'gemini' },
    live: { ...s.live, agents: { gemini }, runtimes: { gemini: { agentId: 'gemini', ...runtime } as AgentRuntime } }
  })
  await act(async () => root.render(<SelectionPanel />))
}

const button = (text: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fake.calls.length = 0
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
})
