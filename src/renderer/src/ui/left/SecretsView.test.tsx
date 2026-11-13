import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSecretInfo, ProjectSecretInput } from '@shared/types'

const fake = vi.hoisted(() => {
  const state = { calls: [] as Array<[string, ...unknown[]]>, list: [] as ProjectSecretInfo[] }
  ;(window as unknown as { cowork: unknown }).cowork = new Proxy(
    {
      listSecrets: async (pid: string) => {
        state.calls.push(['listSecrets', pid])
        return state.list
      },
      setSecret: async (pid: string, input: ProjectSecretInput) => {
        state.calls.push(['setSecret', pid, input])
        state.list = [...state.list.filter((x) => x.name !== (input.previous ?? input.name)), { name: input.name, ...(input.note ? { note: input.note } : {}), updatedAt: 2 }]
        return state.list
      },
      deleteSecret: async (pid: string, name: string) => {
        state.calls.push(['deleteSecret', pid, name])
        state.list = state.list.filter((x) => x.name !== name)
        return state.list
      }
    } as Record<string, unknown>,
    { get: (t, k: string) => t[k] ?? (async () => undefined) }
  )
  return state
})

import { useCowork } from '@/store/cowork'
import { SecretsView } from './SecretsView'

let root: Root
let host: HTMLDivElement
const button = (text: string): HTMLButtonElement =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text) || b.getAttribute('aria-label') === text) as HTMLButtonElement
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> => {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fake.calls.length = 0
  fake.list = [{ name: 'GHL_PIT', note: 'Token PIT de GHL', updatedAt: 1 }]
  useCowork.setState((s) => ({ mode: 'live', live: { ...s.live, project: { id: 'proyecto-1', name: 'P', dir: '/x', createdAt: 1, updatedAt: 1 } } }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root.render(<SecretsView />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('pestaña Secretos', () => {
  it('enseña nombre y nota, nunca un valor', () => {
    expect(fake.calls[0]).toEqual(['listSecrets', 'proyecto-1'])
    expect(host.textContent).toContain('GHL_PIT')
    expect(host.textContent).toContain('Token PIT de GHL')
    expect(host.textContent).toContain('••••')
    expect(host.textContent).toContain('Límite sincero')
  })

  it('guarda uno nuevo con el nombre en mayúsculas y borra el valor de la pantalla', async () => {
    await act(async () => button('Nuevo secreto').click())
    const inputs = host.querySelectorAll('form input')
    await type(inputs[0] as HTMLInputElement, 'ghl location id')
    await type(host.querySelector('form textarea') as HTMLTextAreaElement, 'loc-123456')
    expect(host.textContent).toContain('Se guardará como GHL_LOCATION_ID')
    await act(async () => (host.querySelector('form') as HTMLFormElement).requestSubmit())
    expect(fake.calls).toContainEqual(['setSecret', 'proyecto-1', { name: 'GHL_LOCATION_ID', note: '', value: 'loc-123456' }])
    expect(host.querySelector('form')).toBeNull()
    expect(host.innerHTML).not.toContain('loc-123456')
  })

  it('cambiar sin pegar valor lo conserva; quitar pide confirmación', async () => {
    await act(async () => button('Cambiar').click())
    await type(host.querySelector('form input') as HTMLInputElement, 'GHL_TOKEN')
    await act(async () => (host.querySelector('form') as HTMLFormElement).requestSubmit())
    expect(fake.calls).toContainEqual(['setSecret', 'proyecto-1', { name: 'GHL_TOKEN', note: 'Token PIT de GHL', previous: 'GHL_PIT' }])
    await act(async () => button('Quitar').click())
    expect(fake.calls.some((c) => c[0] === 'deleteSecret')).toBe(false)
    await act(async () => button('Sí, quitarlo').click())
    expect(fake.calls).toContainEqual(['deleteSecret', 'proyecto-1', 'GHL_TOKEN'])
    expect(host.textContent).toContain('Sin secretos')
  })
})
