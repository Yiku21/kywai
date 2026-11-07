import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HermesModelsInfo } from '@shared/types'

const fake = vi.hoisted(() => {
  const state = {
    info: {
      installed: true,
      current: { provider: 'omnirouter', model: 'auto/smart', fromApp: false },
      hermesDefault: { provider: 'omnirouter', model: 'auto/smart' },
      providers: [
        { id: 'omnirouter', label: 'omnirouter', models: ['auto/smart', 'auto/best-coding', 'claude/claude-opus-5'] },
        { id: 'anthropic', label: 'Anthropic', models: ['claude-opus-5-5', 'claude-sonnet-5-5'] }
      ],
      updatedAt: 1791686531740
    } as HermesModelsInfo,
    calls: [] as unknown[]
  }
  ;(window as unknown as { cowork: unknown }).cowork = new Proxy(
    {
      getHermesModels: async () => state.info,
      setHermesModel: async (choice: { provider: string; model: string } | null) => {
        state.calls.push(choice)
        state.info = {
          ...state.info,
          current: choice ? { ...choice, fromApp: true } : { ...state.info.hermesDefault!, fromApp: false }
        }
        return state.info
      }
    } as Record<string, unknown>,
    { get: (t, k: string) => t[k] ?? (async () => undefined) }
  )
  return state
})

import { HermesModelDialog } from './HermesModelDialog'

let root: Root
let host: HTMLDivElement
const button = (text: string): HTMLButtonElement =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root.render(<HermesModelDialog onClose={() => undefined} />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('«/model»: el modelo de Hermes', () => {
  it('muestra el actual, los proveedores con su número de modelos y los modelos del actual', () => {
    expect(host.textContent).toContain('auto/smart')
    expect(host.textContent).toContain('el de la configuración de Hermes')
    expect(button('Anthropic').textContent).toContain('2')
    expect(button('omnirouter').textContent).toContain('3 · actual')
    expect(host.textContent).toContain('claude/claude-opus-5')
  })

  it('busca, elige otro proveedor y modelo, y lo usa', async () => {
    await act(async () => button('Anthropic').click())
    expect(host.textContent).toContain('claude-sonnet-5-5')
    const input = host.querySelector('input[type="search"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'opus')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.textContent).not.toContain('claude-sonnet-5-5')
    await act(async () => button('claude-opus-5-5').click())
    await act(async () => button('Usar claude-opus-5-5').click())
    expect(fake.calls).toEqual([{ provider: 'anthropic', model: 'claude-opus-5-5' }])
    expect(host.textContent).toContain('Hermes usará claude-opus-5-5 (anthropic) desde el próximo encargo.')
    expect(host.textContent).toContain('elegido en kywai')
    // Y se puede volver al de su configuración.
    await act(async () => button('Volver al de Hermes').click())
    expect(fake.calls.at(-1)).toBeNull()
  })
})
