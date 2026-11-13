import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@shared/defaults'
import { emptySlice, useCowork } from '@/store/cowork'
import { RobotLabel } from './RobotLabel'
import { RobotBrain } from './robotBrain'
import { registry } from './registry'
import { useInboxAlert } from '@/lib/inboxAlert'

const agent = DEFAULT_CONFIG.agents[0]
let previous: ReturnType<typeof useCowork.getState>
let root: Root
let host: HTMLDivElement

describe('etiqueta del baile musical', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
    previous = useCowork.getState()
    useCowork.setState({ mode: 'demo', config: DEFAULT_CONFIG, demo: emptySlice(DEFAULT_CONFIG), reducedEffects: false })
    const brain = new RobotBrain(agent.id)
    brain.social = { position: brain.home.clone(), lookAt: brain.home.clone(), awake: true, happy: 1, surprise: 0, bounce: 0, tilt: 0, music: true }
    registry.brains.set(agent.id, brain)
  })
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); registry.brains.delete(agent.id); useCowork.setState(previous) })

  it('muestra Bailando para el libre que está bailando, sin indicador de trabajo', async () => {
    await act(async () => root.render(<RobotLabel agent={agent} />))
    expect(host.textContent).toContain('Bailando')
    expect(host.textContent).not.toContain('En reposo')
    expect(host.textContent).not.toContain('Trabajando')
  })

  it('el estado real de trabajo tiene prioridad sobre una pose anterior', async () => {
    const demo = useCowork.getState().demo
    useCowork.setState({ demo: { ...demo, runtimes: { ...demo.runtimes, [agent.id]: { ...demo.runtimes[agent.id], activity: 'working' } } } })
    await act(async () => root.render(<RobotLabel agent={agent} />))
    expect(host.textContent).toContain('Trabajando')
    expect(host.textContent).not.toContain('Bailando')
  })

  it('reducir efectos no anuncia un baile detenido', async () => {
    useCowork.setState({ reducedEffects: true })
    await act(async () => root.render(<RobotLabel agent={agent} />))
    expect(host.textContent).not.toContain('Bailando')
  })
})

describe('etiqueta con la campanita de «Te necesita»', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
    previous = useCowork.getState()
    useCowork.setState({ mode: 'demo', config: { ...DEFAULT_CONFIG, plannerOrder: [agent.id] }, demo: emptySlice(DEFAULT_CONFIG), selection: null })
  })
  afterEach(async () => {
    await act(async () => root.unmount()); host.remove(); useCowork.setState(previous)
    useInboxAlert.setState({ ringing: false })
  })

  it('tocar la etiqueta mientras llama abre «Te necesita» y no la ficha', async () => {
    useInboxAlert.setState({ ringing: true, callIn3d: true })
    const seq = useInboxAlert.getState().openSeq
    await act(async () => root.render(<RobotLabel agent={agent} />))
    const label = host.querySelector('[role="button"]') as HTMLElement
    await act(async () => label.click())
    expect(useInboxAlert.getState().openSeq).toBe(seq + 1)
    expect(useCowork.getState().selection).toBeNull()
  })

  it('sin campanita, tocar la etiqueta abre la ficha del agente', async () => {
    useInboxAlert.setState({ ringing: false, callIn3d: true })
    const seq = useInboxAlert.getState().openSeq
    await act(async () => root.render(<RobotLabel agent={agent} />))
    const label = host.querySelector('[role="button"]') as HTMLElement
    await act(async () => label.click())
    expect(useInboxAlert.getState().openSeq).toBe(seq)
    expect(useCowork.getState().selection).toEqual({ type: 'agent', id: agent.id })
  })
})
