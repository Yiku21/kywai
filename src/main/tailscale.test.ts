import { describe, expect, it } from 'vitest'
import { enableLink, isOurTarget, parseStatus, rootTarget } from './tailscale'

describe('tailscale (HTTPS con Serve)', () => {
  it('lee el nombre del equipo y si la red permite HTTPS', () => {
    const st = parseStatus(JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'mac-mini.tail1234.ts.net.' }, CertDomains: ['mac-mini.tail1234.ts.net'] }))
    expect(st).toEqual({ running: true, dnsName: 'mac-mini.tail1234.ts.net', certs: true })
    expect(parseStatus(JSON.stringify({ BackendState: 'Stopped', Self: { DNSName: '' }, CertDomains: null }))).toEqual({ running: false, dnsName: null, certs: false })
    expect(parseStatus('no es json').running).toBe(false)
  })

  it('reconoce la publicación de kywai y la de otras cosas', () => {
    const ours = JSON.stringify({
      TCP: { '443': { HTTPS: true } },
      Web: { 'mac-mini.tail1234.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:8787' } } } }
    })
    expect(rootTarget(ours)).toBe('http://127.0.0.1:8787')
    expect(isOurTarget(rootTarget(ours), 8787)).toBe(true)
    expect(isOurTarget(rootTarget(ours), 9000)).toBe(false)
    const other = JSON.stringify({ Web: { 'mac-mini.tail1234.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } } } } })
    expect(isOurTarget(rootTarget(other), 8787)).toBe(false)
    expect(rootTarget('{}')).toBeNull()
    expect(rootTarget('')).toBeNull()
  })

  it('encuentra el enlace para permitir HTTPS en la red', () => {
    const out = 'Serve is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/serve?node=nAbC123\n\nWaiting...'
    expect(enableLink(out)).toBe('https://login.tailscale.com/f/serve?node=nAbC123')
    expect(enableLink('todo bien')).toBeNull()
  })
})
