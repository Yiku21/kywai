import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpotifastAction, SpotifastStatus } from '@shared/spotifast'

const fixture = vi.hoisted(() => ({
  status: { installed: true, running: true, state: 'stopped' } as SpotifastStatus,
  calls: [] as SpotifastAction[]
}))
vi.mock('@/lib/api', () => ({
  isWeb: false,
  api: {
    spotifast: async (action: SpotifastAction) => {
      fixture.calls.push(action)
      return fixture.status
    }
  }
}))

import { SpotifastBox } from './SpotifastBox'

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.calls = []
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function show(status: SpotifastStatus): Promise<void> {
  fixture.status = status
  await act(async () => root.render(<SpotifastBox />))
  await act(async () => undefined)
}

describe('pestaña Spotifast', () => {
  it('sin instalar ofrece instalarla', async () => {
    await show({ installed: false, running: false, state: 'stopped' })
    const link = [...host.querySelectorAll('a')].find((a) => a.textContent?.includes('Instalar Spotifast'))
    expect(link?.getAttribute('href')).toBe('https://spotifast.rocks/download/')
  })

  it('cerrada ofrece abrirla', async () => {
    await show({ installed: true, running: false, state: 'stopped' })
    const open = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Abrir Spotifast')
    expect(open).toBeTruthy()
    await act(async () => open!.click())
    expect(fixture.calls).toContainEqual({ kind: 'open' })
  })

  it('abierta enseña la canción y manda los botones', async () => {
    await show({ installed: true, running: true, state: 'playing', title: 'Go', artists: 'The Band', positionMs: 1000, durationMs: 200000, volume: 40 })
    expect(host.textContent).toContain('Go')
    expect(host.textContent).toContain('The Band')
    const next = host.querySelector('button[aria-label="Siguiente"]') as HTMLButtonElement
    await act(async () => next.click())
    expect(fixture.calls).toContainEqual({ kind: 'next' })
  })

  it('un enlace de Spotify pegado suena tal cual', async () => {
    await show({ installed: true, running: true, state: 'stopped' })
    const input = host.querySelector('input[type="search"]') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setValue.call(input, 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => (host.querySelector('form') as HTMLFormElement).requestSubmit())
    expect(fixture.calls).toContainEqual({ kind: 'link', link: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' })
  })
})
