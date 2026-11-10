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

  it('también sale al escribir @ en medio o al final del mensaje', async () => {
    await type('Revisa el archivo y dime qué ves @cl')
    expect(options()).toEqual(['Claude'])
    await key('Enter')
    expect(useComposer.getState().text).toBe('Revisa el archivo y dime qué ves @Claude ')
    await type('Escribe a yo@cor')
    expect(options()).toEqual([])
  })

  it('el mensaje se envía tal cual al motor (él decide que es directo)', async () => {
    await type('@Qwen hola')
    await key('Enter')
    expect(fake.sent).toEqual([{ projectId: 'p1', text: '@Qwen hola', filePaths: [] }])
  })
})

describe('plantillas de tareas encima del cuadro', () => {
  const tpl = (id: string, name: string, prompt: string, extra: Record<string, unknown> = {}) => ({ id, name, command: name.toLowerCase().replace(/\s+/g, '-'), prompt, createdAt: 1, updatedAt: 1, ...extra })

  beforeEach(async () => {
    // El popover para rellenar los huecos se recoloca con ResizeObserver (jsdom no lo trae).
    globalThis.ResizeObserver ??= class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver
    await act(async () =>
      useCowork.setState({
        templates: [
          tpl('t1', 'Actualizar', 'Actualiza las dependencias.', { icon: '📦' }),
          tpl('t2', 'Revisar PR', 'Revisa el PR {pr} del repo {repo}'),
          tpl('t3', 'De otro', 'x', { projectId: 'p2' })
        ]
      })
    )
  })

  const chips = (): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')]

  it('salen las del proyecto y las generales, y un toque envía la que no tiene huecos', async () => {
    expect(chips().map((b) => b.textContent)).toEqual(['📦Actualizar', 'Revisar PR', ''])
    await act(async () => chips()[0].click())
    expect(fake.sent).toEqual([{ projectId: 'p1', text: 'Actualiza las dependencias.', filePaths: [], templateId: 't1' }])
  })

  it('con huecos, antes pide rellenarlos y envía el texto relleno', async () => {
    await act(async () => chips()[1].click())
    const inputs = [...document.body.querySelectorAll<HTMLInputElement>('form input')]
    expect(inputs).toHaveLength(2)
    const send = [...document.body.querySelectorAll<HTMLButtonElement>('form button[type="submit"]')][0]
    expect(send.disabled).toBe(true)
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      for (const [i, v] of ['42', 'kywai'].entries()) {
        setValue.call(inputs[i], v)
        inputs[i].dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
    await act(async () => send.click())
    expect(fake.sent).toEqual([{ projectId: 'p1', text: 'Revisa el PR 42 del repo kywai', filePaths: [], templateId: 't2' }])
  })

  it('al escribir «/» salen sus órdenes y se elige una', async () => {
    await type('/rev')
    expect([...host.querySelectorAll('#composer-commands [role="option"]')].map((o) => o.textContent)).toEqual(['/revisar-prRevisar PR'])
    await key('Enter')
    expect(useComposer.getState().text).toBe('/revisar-pr ')
    expect(fake.sent).toEqual([])
  })

  it('con «/» sola salen todas las órdenes, cada una con lo que hace', async () => {
    await type('/')
    const rows = [...host.querySelectorAll('#composer-commands [role="option"]')]
    const names = rows.map((o) => o.querySelector('span:nth-child(2)')?.textContent ?? '')
    expect(names.slice(0, 11)).toEqual(['/video tema', '/serie idea [en 5 episodios]', '/aprende enlace o vídeo', '/instagram qué quieres en el texto', '/tiktok qué quieres en el texto', '/rutina cuándo: qué', '/directo Agente mensaje', '/recuerda texto', '/model', '/uso', '/nuevo'])
    expect(names).toContain('/revisar-pr')
    expect(rows.every((o) => (o.querySelector('span:nth-child(3)')?.textContent ?? '').length > 0)).toBe(true)
    expect(rows[0].textContent).toContain('MP4')
  })

  it('una orden sin nada detrás se hace al elegirla, sin ir a los agentes', async () => {
    await type('/mod')
    await key('Enter')
    expect(useCowork.getState().hermesModelOpen).toBe(true)
    expect(useComposer.getState().text).toBe('')
    expect(fake.sent).toEqual([])
  })
})
