import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXIT_MS, exitTarget, playExit } from './dialogMotion'

function modal(attrs = ''): HTMLElement {
  const wrap = document.createElement('div')
  wrap.innerHTML = `<div class="backdrop" style="position:fixed" ${attrs}><div role="dialog" aria-modal="true"><button>Cerrar</button></div></div>`
  return wrap.firstElementChild as HTMLElement
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('dialogMotion', () => {
  it('elige el fondo de la ventana que se ha quitado', () => {
    const backdrop = modal()
    expect(exitTarget(backdrop)).toBe(backdrop)
    const outer = document.createElement('section')
    outer.appendChild(backdrop)
    expect(exitTarget(outer)).toBe(backdrop)
  })

  it('no anima Buscar (data-instant), lo que no es una ventana ni sus propias copias', () => {
    expect(exitTarget(modal('data-instant'))).toBeNull()
    expect(exitTarget(document.createElement('div'))).toBeNull()
    expect(exitTarget(modal('data-ghost'))).toBeNull()
    expect(exitTarget(document.createTextNode('hola'))).toBeNull()
  })

  it('deja una copia inerte que desaparece sola', () => {
    vi.useFakeTimers()
    const ghost = playExit(modal())
    expect(ghost).not.toBeNull()
    expect(ghost!.getAttribute('aria-hidden')).toBe('true')
    expect(ghost!.hasAttribute('inert')).toBe(true)
    expect(document.body.contains(ghost)).toBe(true)
    vi.advanceTimersByTime(EXIT_MS + 50)
    expect(document.body.contains(ghost)).toBe(false)
  })
})
