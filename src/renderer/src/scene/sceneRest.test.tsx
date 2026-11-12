// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@shared/defaults'
import { emptySlice, useCowork } from '@/store/cowork'
import { useMusic } from '@/lib/music'
import { REST_AFTER_MS } from './frameRate'
import { useSceneRest } from './sceneRest'

let previous: ReturnType<typeof useCowork.getState>
let root: Root
let host: HTMLDivElement
let target: HTMLDivElement
const seen: boolean[] = []

function Probe() {
  seen.push(useSceneRest(target, true))
  return null
}

const resting = () => seen[seen.length - 1]

describe('reposo del 3D', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    target = document.createElement('div')
    document.body.append(host, target)
    root = createRoot(host)
    previous = useCowork.getState()
    useCowork.setState({ mode: 'demo', config: DEFAULT_CONFIG, demo: emptySlice(DEFAULT_CONFIG) })
    useMusic.setState({ status: 'idle' })
    seen.length = 0
    act(() => root.render(<Probe />))
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    target.remove()
    useCowork.setState(previous)
    vi.useRealTimers()
  })

  it('pasa a reposo tras un minuto sin nada y se despierta al mover el ratón', () => {
    expect(resting()).toBe(false)
    act(() => vi.advanceTimersByTime(REST_AFTER_MS + 100))
    expect(resting()).toBe(true)
    act(() => target.dispatchEvent(new Event('pointermove')))
    expect(resting()).toBe(false)
  })

  it('no reposa mientras un agente trabaja', () => {
    const id = DEFAULT_CONFIG.agents[0].id
    act(() => {
      const d = useCowork.getState().demo
      useCowork.setState({ demo: { ...d, runtimes: { ...d.runtimes, [id]: { agentId: id, activity: 'working', location: 'station' } } } })
    })
    act(() => vi.advanceTimersByTime(REST_AFTER_MS * 3))
    expect(resting()).toBe(false)
  })

  it('se despierta cuando un agente empieza a trabajar', () => {
    act(() => vi.advanceTimersByTime(REST_AFTER_MS + 100))
    expect(resting()).toBe(true)
    const id = DEFAULT_CONFIG.agents[0].id
    act(() => {
      const d = useCowork.getState().demo
      useCowork.setState({ demo: { ...d, runtimes: { ...d.runtimes, [id]: { agentId: id, activity: 'thinking', location: 'station' } } } })
    })
    expect(resting()).toBe(false)
  })

  it('no reposa con música sonando', () => {
    act(() => useMusic.setState({ status: 'playing' }))
    act(() => vi.advanceTimersByTime(REST_AFTER_MS * 2))
    expect(resting()).toBe(false)
  })
})
