import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, setTheme, storedTheme } from '@/lib/theme'
import { PALETTES, palette, tone } from '@/scene/palette'
import { ThemeDialog } from './ThemeDialog'

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.removeItem('aicowork.theme')
  applyTheme(storedTheme())
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  setTheme('clasico')
})

describe('temas', () => {
  it('el clásico es el predeterminado; Órbita se aplica al momento y se recuerda', async () => {
    expect(storedTheme()).toBe('clasico')
    expect(document.documentElement.dataset.theme).toBe('clasico')
    await act(async () => root.render(<ThemeDialog onClose={() => undefined} />))
    const radios = [...host.querySelectorAll('[role="radio"]')] as HTMLButtonElement[]
    const names = ['Clásico', 'Órbita', 'Marfil', 'Grafito', 'Bosque', 'Matrix', 'EVA-01', 'Relicario', 'Telar', 'Halloween', 'Navidad']
    expect(radios.map((r) => [names.find((n) => r.textContent?.startsWith(n)), r.getAttribute('aria-checked')])).toEqual(
      names.map((n, i) => [n, i === 0 ? 'true' : 'false'])
    )
    await act(async () => radios[1].click())
    expect(document.documentElement.dataset.theme).toBe('orbita')
    expect(localStorage.getItem('aicowork.theme')).toBe('orbita')
    expect(radios[1].getAttribute('aria-checked')).toBe('true')
    // Un valor raro guardado no rompe nada: vuelve al clásico.
    localStorage.setItem('aicowork.theme', 'rosa')
    expect(storedTheme()).toBe('clasico')
  })

  it('los temas nuevos cambian también los colores del espacio; el clásico los deja como estaban', async () => {
    await act(async () => root.render(<ThemeDialog onClose={() => undefined} />))
    expect(palette).toBe(PALETTES.clasico)
    expect(tone('#7fb0ff')).toBe('#7fb0ff')
    const radios = [...host.querySelectorAll('[role="radio"]')] as HTMLButtonElement[]
    await act(async () => radios.find((r) => r.textContent?.startsWith('Matrix'))!.click())
    expect(document.documentElement.dataset.theme).toBe('matrix')
    expect(palette).toBe(PALETTES.matrix)
    // Los azules del clásico pasan al verde de Matrix; los colores de otros tonos (el verde de una herramienta) se quedan.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(tone('#3f7bff').slice(i, i + 2), 16))
    expect(g).toBeGreaterThan(Math.max(r, b) + 100)
    expect(tone('#5ff0a6')).toBe('#5ff0a6')
    await act(async () => radios.find((r) => r.textContent?.startsWith('Marfil'))!.click())
    expect(palette.light).toBe(true)
    expect(palette.decor).toBeUndefined()
    // Los de fiesta llevan su decoración y su núcleo.
    await act(async () => radios.find((r) => r.textContent?.startsWith('Halloween'))!.click())
    expect([palette.decor, palette.core]).toEqual(['halloween', 'pumpkin'])
    await act(async () => radios.find((r) => r.textContent?.startsWith('Navidad'))!.click())
    expect([palette.decor, palette.core]).toEqual(['navidad', 'globe'])
    // Órbita usa los colores del clásico en el espacio.
    await act(async () => radios.find((r) => r.textContent?.startsWith('Órbita'))!.click())
    expect(palette).toBe(PALETTES.clasico)
  })
})
