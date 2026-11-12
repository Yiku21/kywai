import { mkdtempSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { __setTailscaleForTests, openFunnelLink, serveOneFile, usedServePorts } from './tailscale'

function get(port: number, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path, headers }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }))
    })
      .on('error', reject)
      .end()
  })
}

function video(): string {
  const dir = mkdtempSync(join(tmpdir(), 'funnel-'))
  const file = join(dir, 'reel.mp4')
  writeFileSync(file, '0123456789')
  return file
}

afterEach(() => __setTailscaleForTests(null))

describe('enlace público de un solo vídeo con Tailscale Funnel', () => {
  it('el servidor solo entrega ese archivo, en su dirección, y admite Range', async () => {
    const server = await serveOneFile(video(), '/kywai/abc.mp4')
    const port = (server.address() as { port: number }).port
    try {
      expect(await get(port, '/kywai/abc.mp4')).toMatchObject({ status: 200, body: '0123456789' })
      expect(await get(port, '/kywai/abc.mp4', { Range: 'bytes=2-4' })).toMatchObject({ status: 206, body: '234' })
      expect((await get(port, '/kywai/otro.mp4')).status).toBe(404)
      expect((await get(port, '/')).status).toBe(404)
      expect((await get(port, '/kywai/abc.mp4/../../etc/passwd')).status).toBe(404)
    } finally {
      server.close()
    }
  })

  it('nunca usa el 443 (el acceso privado a kywai) y si 8443 está ocupado usa 10000', () => {
    expect([...usedServePorts(JSON.stringify({ TCP: { '443': {} }, Web: { 'mac.ts.net:443': {} } }))]).toEqual([443])
    expect(usedServePorts('nada').size).toBe(0)
  })

  it('abre Funnel en un puerto libre, da la dirección pública y lo cierra todo', async () => {
    const calls: string[][] = []
    let funnelOn = false
    __setTailscaleForTests(
      async (_cli, args) => {
        calls.push(args)
        if (args[0] === 'status') return { ok: true, stdout: JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'mac.tail1.ts.net.' } }), out: '' }
        if (args[0] === 'serve') return { ok: true, stdout: JSON.stringify({ TCP: { '443': {}, ...(funnelOn ? { '10000': {} } : {}) }, Web: { 'mac.tail1.ts.net:8443': {} } }), out: '' }
        if (args[0] === 'funnel') funnelOn = !args.includes('off')
        return { ok: true, stdout: '', out: '' }
      },
      async () => 'tailscale'
    )
    const link = await openFunnelLink(video())
    expect(link.url).toMatch(/^https:\/\/mac\.tail1\.ts\.net:10000\/kywai\/[0-9a-f]{48}\.mp4$/)
    expect(calls.find((c) => c[0] === 'funnel')).toEqual(expect.arrayContaining(['--bg', '--https=10000']))
    expect(calls.flat()).not.toContain('--https=443')
    await link.close()
    expect(calls.at(-1)).toEqual(['funnel', '--yes', '--https=10000', 'off'])
  })

  it('si la red no permite Funnel, lo dice con el enlace para activarlo y no deja nada abierto', async () => {
    const calls: string[][] = []
    __setTailscaleForTests(
      async (_cli, args) => {
        calls.push(args)
        if (args[0] === 'status') return { ok: true, stdout: JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'mac.tail1.ts.net.' } }), out: '' }
        if (args[0] === 'serve') return { ok: true, stdout: '{}', out: '' }
        if (args.includes('off')) return { ok: true, stdout: '', out: '' }
        return { ok: false, stdout: '', out: 'Funnel is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/funnel?node=abc' }
      },
      async () => 'tailscale'
    )
    await expect(openFunnelLink(video())).rejects.toThrow('Funnel no está permitido en tu red de Tailscale; actívalo una vez aquí: https://login.tailscale.com/f/funnel?node=abc')
    expect(calls.at(-1)).toEqual(['funnel', '--yes', '--https=8443', 'off'])
  })
})
