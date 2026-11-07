import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CITY_COLORS, DECORS, WORLDS, applyTheme, setTheme, storedTheme, themeLabel } from '@/lib/theme'
import { PALETTES, WORLD_PALETTES, palette, tone } from '@/scene/palette'
import { ThemeGrid } from './ThemeDialog'

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.removeItem('aicowork.theme')
  localStorage.removeItem('aicowork.cityColor')
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

const radios = (): HTMLButtonElement[] => [...host.querySelectorAll('[role="radio"]')] as HTMLButtonElement[]
const group = (label: string): HTMLButtonElement[] =>
  [...host.querySelectorAll(`[role="radiogroup"][aria-label="${label}"] > [role="radio"]`)] as HTMLButtonElement[]
const colorButton = (name: string): HTMLButtonElement => group('Color de la ciudad').find((b) => b.textContent === name)!

describe('temas', () => {
  it('tres grupos: siete mapas, la Ciudad digital con siete colores y cuatro decorados', async () => {
    await act(async () => root.render(<ThemeGrid />))
    expect(group('Mapas').map((b) => WORLDS.find((w) => b.textContent?.startsWith(w.name))?.id)).toEqual(WORLDS.map((w) => w.id))
    expect(group('Color de la ciudad').map((b) => b.textContent)).toEqual(['Clásico', 'Frost Glass', 'Marfil', 'Grafito', 'Bosque', 'Matrix', 'EVA-01'])
    expect(group('Decorados')).toHaveLength(4)
    expect(WORLDS.length + CITY_COLORS.length + DECORS.length).toBe(18)
    // Los mapas llevan su silueta en la miniatura.
    for (const b of group('Mapas')) expect(b.querySelector('svg[viewBox="0 0 120 84"]')).not.toBeNull()
  })

  it('la Ciudad en Clásico es la predeterminada; Frost Glass (el Órbita de antes) se aplica al momento y se recuerda', async () => {
    expect(storedTheme()).toBe('clasico')
    expect(document.documentElement.dataset.theme).toBe('clasico')
    expect(document.documentElement.dataset.world).toBeUndefined()
    await act(async () => root.render(<ThemeGrid />))
    expect(colorButton('Clásico').getAttribute('aria-checked')).toBe('true')
    await act(async () => colorButton('Frost Glass').click())
    expect(document.documentElement.dataset.theme).toBe('orbita')
    expect(localStorage.getItem('aicowork.theme')).toBe('orbita')
    expect(palette).toBe(PALETTES.orbita)
    expect(palette.world).toBeUndefined()
    expect(themeLabel('orbita')).toBe('Ciudad digital · Frost Glass')
    // Un valor raro guardado no rompe nada: vuelve al clásico.
    localStorage.setItem('aicowork.theme', 'rosa')
    expect(storedTheme()).toBe('clasico')
  })

  it('quien tenía un tema de color lo sigue viendo igual: la Ciudad digital con ese color', () => {
    for (const id of ['clasico', 'orbita', 'marfil', 'grafito', 'bosque', 'matrix', 'eva'] as const) {
      localStorage.setItem('aicowork.theme', id)
      applyTheme(storedTheme())
      expect(palette).toBe(PALETTES[id])
      expect(palette.world).toBeUndefined()
      expect(document.documentElement.dataset.theme).toBe(id)
    }
  })

  it('los colores cambian también el espacio; el clásico lo deja como estaba', async () => {
    await act(async () => root.render(<ThemeGrid />))
    expect(palette).toBe(PALETTES.clasico)
    expect(tone('#7fb0ff')).toBe('#7fb0ff')
    await act(async () => colorButton('Matrix').click())
    expect(document.documentElement.dataset.theme).toBe('matrix')
    expect(palette).toBe(PALETTES.matrix)
    // Los azules del clásico pasan al verde de Matrix; los colores de otros tonos (el verde de una herramienta) se quedan.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(tone('#3f7bff').slice(i, i + 2), 16))
    expect(g).toBeGreaterThan(Math.max(r, b) + 100)
    expect(tone('#5ff0a6')).toBe('#5ff0a6')
    await act(async () => colorButton('Marfil').click())
    expect(palette.light).toBe(true)
    expect(palette.decor).toBeUndefined()
  })

  it('la tarjeta de la Ciudad vuelve al último color elegido', async () => {
    await act(async () => root.render(<ThemeGrid />))
    await act(async () => colorButton('Grafito').click())
    await act(async () => group('Mapas')[1].click())
    expect(storedTheme()).toBe('mundo-orbita')
    const city = radios().find((b) => b.textContent?.startsWith('Ciudad digital'))!
    expect(city.getAttribute('aria-checked')).toBe('false')
    await act(async () => city.click())
    expect(storedTheme()).toBe('grafito')
    expect(city.getAttribute('aria-checked')).toBe('true')
  })

  it('cada mapa monta su mundo con los colores de la interfaz de su nombre; los decorados siguen igual', async () => {
    await act(async () => root.render(<ThemeGrid />))
    for (const [i, w] of WORLDS.entries()) {
      await act(async () => group('Mapas')[i].click())
      const style = w.id.slice(6) as keyof typeof WORLD_PALETTES
      expect(palette).toBe(WORLD_PALETTES[style])
      expect(palette.world).toBe(style)
      expect(document.documentElement.dataset.theme).toBe(style)
      expect(document.documentElement.dataset.world).toBe(style)
      expect(storedTheme()).toBe(w.id)
      expect(group('Mapas')[i].getAttribute('aria-checked')).toBe('true')
    }
    expect(WORLD_PALETTES.orbita.core).toBe('planetarium')
    for (const [i, d] of DECORS.entries()) {
      await act(async () => group('Decorados')[i].click())
      expect(palette).toBe(PALETTES[d.id])
      expect(palette.world).toBeUndefined()
      expect(palette.decor).toBe(d.id)
      expect(document.documentElement.dataset.world).toBeUndefined()
    }
  })
})
