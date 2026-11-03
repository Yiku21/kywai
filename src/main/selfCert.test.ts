import { X509Certificate } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { get } from 'node:https'
import { createServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ensureWebCert, selfSignedCert } from './selfCert'

describe('certificado propio para el HTTPS del acceso web', () => {
  it('es un X.509 v3 autofirmado con las direcciones pedidas y para servidor', () => {
    const { cert } = selfSignedCert(['127.0.0.1', '100.64.0.1', 'localhost', 'mac-mini'])
    const x = new X509Certificate(cert)
    expect(x.verify(x.publicKey)).toBe(true)
    expect(x.subjectAltName).toBe('IP Address:127.0.0.1, IP Address:100.64.0.1, DNS:localhost, DNS:mac-mini')
    expect(x.checkIP('100.64.0.1')).toBe('100.64.0.1')
    expect(x.checkHost('mac-mini')).toBe('mac-mini')
    expect(x.ca).toBe(false)
    expect(x.keyUsage).toContain('1.3.6.1.5.5.7.3.1')
    const days = (Date.parse(x.validTo) - Date.parse(x.validFrom)) / 86_400_000
    expect(days).toBeLessThanOrEqual(825)
  })

  it('sirve para una conexión TLS real (el cliente que confía en él se conecta sin errores)', async () => {
    const pair = selfSignedCert(['127.0.0.1', 'localhost'])
    const srv = createServer(pair, (_req, res) => res.end('ok'))
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
    const port = (srv.address() as AddressInfo).port
    try {
      const body = await new Promise<string>((resolve, reject) => {
        get({ host: '127.0.0.1', port, path: '/', ca: pair.cert }, (res) => {
          let s = ''
          res.on('data', (c) => (s += c))
          res.on('end', () => resolve(s))
        }).on('error', reject)
      })
      expect(body).toBe('ok')
    } finally {
      srv.close()
    }
  })

  const dir = mkdtempSync(join(tmpdir(), 'aicw-cert-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('se reutiliza mientras cubra las direcciones; con una nueva se rehace con todas', () => {
    const a = ensureWebCert(dir, ['127.0.0.1'])
    expect(ensureWebCert(dir, ['127.0.0.1'])).toEqual(a)
    const b = ensureWebCert(dir, ['127.0.0.1', '100.64.0.7'])
    expect(b.cert).not.toBe(a.cert)
    expect(new X509Certificate(b.cert).subjectAltName).toBe('IP Address:127.0.0.1, IP Address:100.64.0.7')
    expect(ensureWebCert(dir, ['100.64.0.7'])).toEqual(b)
  })
})
