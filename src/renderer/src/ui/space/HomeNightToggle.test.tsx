import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, setTheme } from '@/lib/theme'
import { setHomeNight, storedHomeNight } from '@/lib/homeLighting'
import { HomeNightToggle } from './HomeNightToggle'

let root:Root,host:HTMLDivElement
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  setHomeNight(false);localStorage.removeItem('aicowork.kywai.night');applyTheme('kywai')
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host)
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();setHomeNight(false);setTheme('clasico')})

describe('Kywai night switch',()=>{
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
  it('only appears in Kywai and preserves its preference while visiting other worlds',async()=>{
    await act(async()=>root.render(<HomeNightToggle/>))
    await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click())
    await act(async()=>setTheme('matrix'))
    expect(host.querySelector('button')).toBeNull()
    expect(storedHomeNight()).toBe(true)
    await act(async()=>setTheme('kywai'))
    expect(host.querySelector('button')?.getAttribute('aria-checked')).toBe('true')
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
})
