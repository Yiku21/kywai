import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalEngineStatus } from '@shared/types'

const fixture = vi.hoisted(() => ({ url: '', engines: [] as LocalEngineStatus[], saved: [] as string[] }))
vi.mock('@/lib/api', () => ({
  isWeb: false,
  api: {
    listLocalEngines: async () => fixture.engines,
    setColibriUrl: async (url: string) => {
      fixture.saved.push(url)
      fixture.url = url
    }
  }
}))

import { useCowork } from '@/store/cowork'
import { LocalConfig } from './LocalConfig'

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.saved = []
  fixture.engines = [
    { engine: 'lmstudio', installed: false, running: false, models: [], canStart: false, canPull: false },
    { engine: 'ollama', installed: false, running: false, models: [], canStart: false, canPull: false },
    {
      engine: 'colibri',
      installed: false,
      running: false,
      models: [],
      canStart: false,
      canPull: false,
      found: [
        { name: 'llama.cpp', url: 'http://127.0.0.1:8080', models: ['gemma-3-12b'] },
        { name: 'Jan', url: 'http://127.0.0.1:1337', models: ['jan-nano', 'qwen3-4b'] }
      ]
    }
  ]
  const st = useCowork.getState()
  useCowork.setState({
    config: { ...st.config, colibriUrl: '', agents: [{ ...(st.config.agents[0] ?? {}), id: 'local', name: 'Local', provider: 'colibri', model: '', enabled: true, quotaGroupId: 'g' } as never] }
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('agente local: otros servidores', () => {
  it('enseña los servidores encontrados en este equipo y «Usar» guarda su dirección', async () => {
    await act(async () => root.render(<LocalConfig groupId="g" unlimited={false} />))
    await act(async () => undefined)
    const tab = [...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('Colibri'))!
    expect(tab.textContent).toContain('2 encontrado(s)')
    const group = host.querySelector('[aria-label="Servidores encontrados en este equipo"]')!
    expect(group.textContent).toContain('llama.cpp')
    expect(group.textContent).toContain('127.0.0.1:8080 · gemma-3-12b')
    expect(group.textContent).toContain('Jan')
    expect(group.textContent).toContain('2 modelos')
    const use = [...group.querySelectorAll('button')]
    expect(use).toHaveLength(2)
    await act(async () => use[1].click())
    expect(fixture.saved).toEqual(['http://127.0.0.1:1337'])
    expect(host.textContent).toContain('Listo: el agente local puede usar Jan. Elige el modelo abajo.')
  })
})
