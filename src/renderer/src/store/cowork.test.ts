import { afterEach, expect, it } from 'vitest'
import { useCowork } from './cowork'

const initialState = useCowork.getState()
afterEach(() => useCowork.setState(initialState, true))

it.each([false, true])('los registros de configuración no reemplazan los datos del proyecto (demo=%s)', (demo) => {
  const before = useCowork.getState()
  before.applyEvent({
    id: `setup-log-${demo}`,
    ts: Date.now(),
    demo,
    kind: 'setup.log',
    toolId: 'node',
    line: 'Comprobando Node.js'
  })
  expect(useCowork.getState().live).toBe(before.live)
  expect(useCowork.getState().demo).toBe(before.demo)
})
