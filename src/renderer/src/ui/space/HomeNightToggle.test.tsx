import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, setTheme, storedTheme } from '@/lib/theme'
import { PALETTES, palette } from '@/scene/palette'
import { setOfficeAuto, setOfficeClockTime, setSpaceNight } from '@/lib/officeClock'
import { setHomeNight, storedHomeNight } from '@/lib/homeLighting'
import { HomeNightToggle } from './HomeNightToggle'

let root:Root,host:HTMLDivElement
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  setHomeNight(false);localStorage.removeItem('aicowork.kywai.night');applyTheme('kywai')
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host)
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();setHomeNight(false);setOfficeAuto(false);setOfficeClockTime(null);setTheme('clasico')})

describe('Kywai night switch',()=>{
  it('Órbita (en el espacio) no tiene Modo noche ni Auto',async()=>{
    await act(async()=>setTheme('mundo-orbita'))
    await act(async()=>root.render(<HomeNightToggle/>))
    expect(host.querySelector('[role="switch"]')).toBeNull()
  })
  it('Marfil de noche marca data-space-night para pasar la interfaz a colores oscuros',async()=>{
    await act(async()=>setTheme('mundo-marfil'))
    await act(async()=>root.render(<HomeNightToggle/>))
    await act(async()=>host.querySelector<HTMLButtonElement>('[role="switch"]')!.click())
    expect(document.documentElement.dataset.spaceNight).toBe('true')
    await act(async()=>host.querySelector<HTMLButtonElement>('[role="switch"]')!.click())
    expect(document.documentElement.dataset.spaceNight).toBe('false')
    setSpaceNight(false)
  })
  it('applies and remembers night mode without changing the selected theme',async()=>{
    await act(async()=>root.render(<HomeNightToggle/>))
    const toggle=host.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await act(async()=>toggle.click())
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(document.documentElement.dataset.kywaiNight).toBe('true')
    expect(document.documentElement.dataset.theme).toBe('kywai')
    expect(storedHomeNight()).toBe(true)
    await act(async()=>toggle.click())
    expect(storedHomeNight()).toBe(false)
  })
  it('keeps the Kywai preference while visiting other worlds, where the switch is their own night',async()=>{
    await act(async()=>root.render(<HomeNightToggle/>))
    await act(async()=>host.querySelector<HTMLButtonElement>('[role="switch"]')!.click())
    await act(async()=>setTheme('matrix'))
    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false')
    expect(storedHomeNight()).toBe(true)
    await act(async()=>setTheme('kywai'))
    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
  })
  it('follows a preference change from another window',async()=>{
    await act(async()=>root.render(<HomeNightToggle/>))
    await act(async()=>{
      localStorage.setItem('aicowork.kywai.night','true')
      window.dispatchEvent(new StorageEvent('storage',{key:'aicowork.kywai.night',newValue:'true'}))
    })
    expect(host.querySelector('button')?.getAttribute('aria-checked')).toBe('true')
    expect(document.documentElement.dataset.kywaiNight).toBe('true')
  })
  it('in the Office switches between the day and night versions of the same theme',async()=>{
    await act(async()=>setTheme('oficina'))
    await act(async()=>root.render(<HomeNightToggle/>))
    const toggle=host.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await act(async()=>toggle.click())
    expect(storedTheme()).toBe('sede')
    expect(palette).toBe(PALETTES.sede)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(storedHomeNight()).toBe(false)
    await act(async()=>toggle.click())
    expect(storedTheme()).toBe('oficina')
  })
  it('in the Office, Auto follows the clock and the interface turns dark at night',async()=>{
    await act(async()=>setTheme('sede'))
    await act(async()=>root.render(<HomeNightToggle/>))
    const auto=host.querySelector<HTMLButtonElement>('[aria-pressed]')!
    await act(async()=>setOfficeClockTime('12:00'))
    await act(async()=>auto.click())
    expect(auto.getAttribute('aria-pressed')).toBe('true')
    expect(storedTheme()).toBe('oficina')
    const toggle=host.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(document.documentElement.dataset.theme).toBe('oficina')
    await act(async()=>setOfficeClockTime('22:00'))
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(document.documentElement.dataset.theme).toBe('sede')
    expect(storedTheme()).toBe('oficina')
    // Tocar el interruptor deja el automático y fija la hora a mano.
    await act(async()=>toggle.click())
    expect(auto.getAttribute('aria-pressed')).toBe('false')
    expect(storedTheme()).toBe('oficina')
    expect(document.documentElement.dataset.theme).toBe('oficina')
  })
  it('gives every theme its own night and Auto, remembered on this device',async()=>{
    await act(async()=>setTheme('mundo-grafito'))
    await act(async()=>root.render(<HomeNightToggle/>))
    const toggle=host.querySelector<HTMLButtonElement>('[role="switch"]')!
    await act(async()=>toggle.click())
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(localStorage.getItem('aicowork.space.night')).toBe('true')
    expect(storedTheme()).toBe('mundo-grafito')
    await act(async()=>setOfficeClockTime('12:00'))
    const auto=host.querySelector<HTMLButtonElement>('[aria-pressed]')!
    await act(async()=>auto.click())
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await act(async()=>setOfficeClockTime('23:00'))
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    // En el Refugio Kywai, Auto también manda sobre su noche.
    await act(async()=>setTheme('kywai'))
    expect(document.documentElement.dataset.kywaiNight).toBe('true')
    await act(async()=>setOfficeClockTime('10:00'))
    expect(document.documentElement.dataset.kywaiNight).toBe('false')
    await act(async()=>setSpaceNight(false))
  })
})
