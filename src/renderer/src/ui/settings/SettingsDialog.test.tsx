import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { SettingsDialog, openSettings } from './SettingsDialog'

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => openSettings(null))
  await act(async () => root.unmount())
  host.remove()
})

// Si la ventana cambia el número de hooks al abrirse, React desmonta toda la app y se queda en blanco.
it('abre y cierra Ajustes sin romper la app', async () => {
  await act(async () => root.render(<SettingsDialog />))
  expect(host.querySelector('[role=dialog]')).toBeNull()
  await act(async () => openSettings('general'))
  expect(host.querySelector('[role=dialog]')).not.toBeNull()
  await act(async () => openSettings(null))
  expect(host.querySelector('[role=dialog]')).toBeNull()
  await act(async () => openSettings('about'))
  expect(host.querySelector('[role=dialog]')).not.toBeNull()
})
