import { describe, expect, it } from 'vitest'
import { addressToUrl, browserFrameArg, browserInputArg, cssCursor, browserRectArg, captureRelPath, needsKywaiBrowser, safeUrl, siteOf } from './browser'

describe('navegador de kywai', () => {
  it('la barra de direcciones abre webs y busca lo demás, nunca otros esquemas', () => {
    expect(addressToUrl('gohighlevel.com')).toBe('https://gohighlevel.com/')
    expect(addressToUrl('app.gohighlevel.com/v2/location/abc/automation')).toBe('https://app.gohighlevel.com/v2/location/abc/automation')
    expect(addressToUrl('http://localhost:5173/x')).toBe('http://localhost:5173/x')
    expect(addressToUrl('localhost:3000')).toBe('http://localhost:3000/')
    expect(addressToUrl('workflow de bienvenida')).toBe('https://duckduckgo.com/?q=workflow%20de%20bienvenida')
    expect(addressToUrl('javascript:alert(1)')).toBeNull()
    expect(addressToUrl('file:///etc/passwd')).toBeNull()
    expect(addressToUrl('   ')).toBeNull()
    expect(safeUrl('chrome://settings')).toBeNull()
    expect(safeUrl('https://x.com/a')).toBe('https://x.com/a')
  })

  it('el sitio que recuerda «Permitir siempre en esta sesión»', () => {
    expect(siteOf('https://www.gohighlevel.com/x')).toBe('gohighlevel.com')
    expect(siteOf('https://app.gohighlevel.com/x')).toBe('app.gohighlevel.com')
  })

  it('las capturas solo se guardan dentro de la carpeta de la tarea', () => {
    expect(captureRelPath('capturas/paso-1.png')).toBe('capturas/paso-1.png')
    expect(captureRelPath('capturas\\paso 2')).toBe('capturas/paso 2.png')
    expect(captureRelPath('../fuera.png')).toBeNull()
    expect(captureRelPath('C:/Windows/x.png')).toBeNull()
    expect(captureRelPath('')).toBeNull()
    expect(captureRelPath(5)).toBeNull()
  })

  it('lo que llega de la interfaz se comprueba', () => {
    expect(browserRectArg({ x: 10, y: 20, width: 300, height: 200 })).toEqual({ x: 10, y: 20, width: 300, height: 200 })
    expect(browserRectArg({ x: 10, y: 20, width: 0, height: 200 })).toBeNull()
    expect(browserRectArg(null)).toBeNull()
    expect(browserInputArg({ type: 'click', x: 5, y: 6 })).toEqual({ type: 'click', x: 5, y: 6, button: 'left', clickCount: 1 })
    expect(browserInputArg({ type: 'key', key: 'Enter' })).toEqual({ type: 'key', key: 'Enter', modifiers: [] })
    expect(browserInputArg({ type: 'key', key: 'F12' })).toEqual({ type: 'key', key: 'F12', modifiers: [] })
    expect(browserInputArg({ type: 'key', key: 'F13' })).toBeNull()
    expect(browserInputArg({ type: 'text', text: '' })).toBeNull()
    expect(browserInputArg({ type: 'scroll', x: 1, y: 1, dy: 120 })).toEqual({ type: 'scroll', x: 1, y: 1, dy: 120, dx: 0 })
    expect(browserInputArg({ type: 'scroll', x: 1, y: 1, dy: 0, dx: -40 })).toEqual({ type: 'scroll', x: 1, y: 1, dy: 0, dx: -40 })
  })

  it('ratón y atajos desde otro dispositivo: clic derecho, doble clic, arrastrar y Ctrl+letra', () => {
    expect(browserInputArg({ type: 'mouse', action: 'down', x: 4, y: 5, button: 'right' })).toEqual({ type: 'mouse', action: 'down', x: 4, y: 5, button: 'right', clickCount: 1, buttons: [] })
    expect(browserInputArg({ type: 'mouse', action: 'up', x: 4, y: 5, clickCount: 2 })).toMatchObject({ button: 'left', clickCount: 2 })
    expect(browserInputArg({ type: 'mouse', action: 'move', x: 4, y: 5, buttons: ['left', 'left', 'otro'] })).toMatchObject({ buttons: ['left'] })
    expect(browserInputArg({ type: 'mouse', action: 'pellizco', x: 4, y: 5 })).toBeNull()
    expect(browserInputArg({ type: 'key', key: 'a', modifiers: ['control', 'hack'] })).toEqual({ type: 'key', key: 'a', modifiers: ['control'] })
    // Una letra sin Ctrl/Alt/Cmd es texto, no una tecla.
    expect(browserInputArg({ type: 'key', key: 'a' })).toBeNull()
    expect(browserInputArg({ type: 'key', key: 'a', modifiers: ['shift'] })).toBeNull()
    expect(browserInputArg({ type: 'key', key: 'Tab', modifiers: ['shift'] })).toEqual({ type: 'key', key: 'Tab', modifiers: ['shift'] })
  })

  it('la vista remota pide su tamaño y la imagen siguiente; el puntero de la página pasa a CSS', () => {
    expect(browserFrameArg({ after: 7, maxWidth: 1800, viewport: { width: 900.4, height: 600 } })).toEqual({ after: 7, maxWidth: 1800, viewport: { width: 900, height: 600 } })
    expect(browserFrameArg({ after: -3, maxWidth: 10, viewport: { width: 'x' } })).toEqual({})
    expect(browserFrameArg(null)).toEqual({})
    expect(cssCursor('hand')).toBe('pointer')
    expect(cssCursor('pointer')).toBe('pointer')
    expect(cssCursor('text')).toBe('text')
    expect(cssCursor('ns-resize')).toBe('ns-resize')
    expect(cssCursor('custom')).toBe('default')
    expect(cssCursor('url(x)')).toBe('default')
  })

  it('reconoce las tareas que necesitan el navegador de kywai', () => {
    expect(needsKywaiBrowser('Documentar el workflow de GHL en un PDF técnico')).toBe(true)
    expect(needsKywaiBrowser('Abre GoHighLevel con el navegador de kywai y captura el flujo')).toBe(true)
    expect(needsKywaiBrowser('Usa navegador_leer en la pestaña «Navegador»')).toBe(true)
    expect(needsKywaiBrowser('Revisar el panel con la pestaña Navegador')).toBe(true)
    expect(needsKywaiBrowser('Arreglar el CSS del navegador web en Safari')).toBe(false)
    expect(needsKywaiBrowser('Escribir un README para el proyecto')).toBe(false)
  })
})
