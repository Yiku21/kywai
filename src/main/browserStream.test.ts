import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, BrowserWindow: class {}, ipcMain: { on: vi.fn() }, session: { fromPartition: vi.fn() } }))
const calls: unknown[] = []
vi.mock('./browser', () => ({
  browserMeta: () => ({ cursor: 'default', width: 800, height: 600 }),
  browserRemoteInput: (i: unknown) => calls.push(['input', i]),
  browserRemoteViewport: (v: unknown) => calls.push(['viewport', v]),
  browserWebContents: () => ({ id: 1 }),
  onBrowserMeta: () => () => undefined
}))

import { STREAMER_HTML, handleStreamInput, rtcOfferArg } from './browserStream'

describe('navegador en vídeo (estilo AnyDesk)', () => {
  it('solo acepta ofertas WebRTC de verdad', () => {
    expect(rtcOfferArg('v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n')).toMatch(/^v=0/)
    expect(rtcOfferArg('hola')).toBeNull()
    expect(rtcOfferArg(42)).toBeNull()
    expect(rtcOfferArg(`v=0${'x'.repeat(70000)}`)).toBeNull()
  })

  it('el canal de datos pasa ratón y teclado comprobados, y el hueco de la vista', () => {
    calls.length = 0
    handleStreamInput(JSON.stringify({ type: 'viewport', width: 900.4, height: 600 }))
    handleStreamInput(JSON.stringify({ type: 'mouse', action: 'down', x: 10, y: 20, button: 'right' }))
    handleStreamInput(JSON.stringify([{ type: 'scroll', x: 1, y: 2, dy: 100 }, { type: 'nada' }, { type: 'key', key: 'a', modifiers: ['control'] }]))
    handleStreamInput('no es json')
    expect(calls).toEqual([
      ['viewport', { width: 900, height: 600 }],
      ['input', { type: 'mouse', action: 'down', x: 10, y: 20, button: 'right', clickCount: 1, buttons: [] }],
      ['input', { type: 'scroll', x: 1, y: 2, dy: 100, dx: 0 }],
      ['input', { type: 'key', key: 'a', modifiers: ['control'] }]
    ])
  })

  it('la ventana oculta no carga nada de fuera', () => {
    expect(STREAMER_HTML).not.toMatch(/<script[^>]+src=|https?:\/\//)
    expect(STREAMER_HTML).toContain("iceServers: []")
  })
})
