import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCowork } from '@/store/cowork'
import { useEscape } from '../common/hooks'
import { BottomBar } from './BottomBar'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  useCowork.getState().setSpaceExpanded(false)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useCowork.getState().setSpaceExpanded(false)
  vi.unstubAllGlobals()
})

function keydown(key: string): void {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

function Overlay({ close }: { close: () => void }) {
  useEscape(true, close)
  return <div role="dialog">Panel abierto</div>
}

describe('salida de la vista ampliada', () => {
  it('sale con Escape después de ampliar con el botón', () => {
    act(() => root.render(<BottomBar />))
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Pantalla completa"]')!.click())
    expect(useCowork.getState().spaceExpanded).toBe(true)
    keydown('Escape')
    expect(useCowork.getState().spaceExpanded).toBe(false)
    expect(container.querySelector('[aria-label="Pantalla completa"]')).not.toBeNull()
  })

  it('da prioridad a un panel que ya estaba abierto antes de ampliar', () => {
    const close = vi.fn()
    act(() => root.render(<><BottomBar /><Overlay close={close} /></>))
    act(() => useCowork.getState().setSpaceExpanded(true))
    keydown('Escape')
    expect(close).toHaveBeenCalledOnce()
    expect(useCowork.getState().spaceExpanded).toBe(true)
    act(() => root.render(<BottomBar />))
    keydown('Escape')
    expect(useCowork.getState().spaceExpanded).toBe(false)
  })

  it('ignora otras teclas y retira el atajo al desmontar la barra', () => {
    act(() => root.render(<BottomBar />))
    act(() => useCowork.getState().setSpaceExpanded(true))
    keydown('Enter')
    expect(useCowork.getState().spaceExpanded).toBe(true)
    act(() => root.render(null))
    keydown('Escape')
    expect(useCowork.getState().spaceExpanded).toBe(true)
  })
})
