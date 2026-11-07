import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConfig } from '@shared/types'

// Motor de escritorio simulado: registra los mensajes enviados.
const fake = vi.hoisted(() => {
  const sent: unknown[] = []
  const methods: Record<string, (...args: unknown[]) => Promise<unknown>> = {
    sendMessage: async (input) => {
      sent.push(input)
      return { runId: 'r1' }
    }
  }
  ;(window as unknown as { cowork: unknown }).cowork = new Proxy(methods, {
    get: (t, k: string) => t[k] ?? (async () => undefined)
  })
  return { sent }
})

import { useCowork } from '@/store/cowork'
import { Composer } from './Composer'
import { useComposer } from './composerStore'

let root: Root
let host: HTMLDivElement

const agent = (id: string, name: string, extra: Partial<AgentConfig> = {}): AgentConfig =>
  ({ id, name, provider: 'claude', model: '', modelLabel: `${name} modelo`, color: '#123456', stationId: 's', role: '', strengths: [], enabled: true, ...extra }) as AgentConfig

const textarea = (): HTMLTextAreaElement => host.querySelector('textarea')!
const options = (): string[] => [...host.querySelectorAll('[role="option"]')].map((o) => o.querySelector('span:nth-child(2)')?.textContent ?? '')

async function type(text: string): Promise<void> {
  await act(async () => useComposer.getState().setText(text))
}

async function key(k: string): Promise<void> {
  await act(async () => {
    textarea().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  })
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fake.sent.length = 0
  const agents = [agent('qwen', 'Qwen', { provider: 'lmstudio' }), agent('lmstudio', 'LM Studio'), agent('claude', 'Claude'), agent('claude-becario-1', 'Becario', { isSubagent: true })]
  const s = useCowork.getState()
  useCowork.setState({
    mode: 'live',
    live: {
      ...s.live,
      agents: Object.fromEntries(agents.map((a) => [a.id, a])),
      agentOrder: agents.map((a) => a.id),
      messages: [],
      project: { id: 'p1', name: 'P' } as never
    }
  })
  useComposer.getState().clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root.render(<Composer />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('«@» en el cuadro del chat', () => {
  it('al escribir @ salen los agentes (sin becarios) y se filtran', async () => {
    await type('@')
    expect(options()).toEqual(['Qwen', 'LM Studio', 'Claude'])
    expect(host.textContent).toContain('sin pasar por Hermes')
    await type('@stu')
    expect(options()).toEqual(['LM Studio'])
    await type('@LMStudio hola')
    expect(options()).toEqual([])
  })

  it('con las flechas e Intro se elige uno y queda «@Nombre »; Escape cierra la lista', async () => {
    await type('@')
    await key('ArrowDown')
    await key('Enter')
    expect(useComposer.getState().text).toBe('@LMStudio ')
    expect(fake.sent).toEqual([])
    await type('@q')
    await key('Escape')
    expect(options()).toEqual([])
  })

  it('el mensaje se envía tal cual al motor (él decide que es directo)', async () => {
    await type('@Qwen hola')
    await key('Enter')
    expect(fake.sent).toEqual([{ projectId: 'p1', text: '@Qwen hola', filePaths: [] }])
  })
})
