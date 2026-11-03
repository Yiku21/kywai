// La parte del servidor para la sincronización: habla con su API de archivos (/api/fs/*) con la llave de este
// dispositivo. Los archivos viajan en streaming (nunca enteros en memoria) y se escriben a un temporal antes de
// ponerse en su sitio.
import { createReadStream, createWriteStream, promises as fsp } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { RemoteConflict, type RemoteIO, type TreeSnapshot } from './syncEngine'

export interface ServerAccess {
  origin: string
  token: string
}

const TRANSFER_TIMEOUT_MS = 60 * 60_000

async function errorOf(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  return data.error || `El servidor respondió ${res.status}`
}

/** Conecta con el servidor: pregunta cómo separa las rutas (\ en Windows, / en el resto) y devuelve el acceso. */
export async function connectRemote(server: ServerAccess): Promise<RemoteIO> {
  const auth = { Authorization: `Bearer ${server.token}` }
  const rootsRes = await fetch(`${server.origin}/api/fs/roots`, { headers: auth, signal: AbortSignal.timeout(15_000) })
  if (!rootsRes.ok) throw new Error(await errorOf(rootsRes))
  const sep = ((await rootsRes.json()) as { sep?: string }).sep === '\\' ? '\\' : '/'
  const url = (op: string, params: Record<string, string>): string => `${server.origin}/api/fs/${op}?${new URLSearchParams(params).toString()}`

  return {
    abs: (base, rel) => `${base}${base.endsWith(sep) ? '' : sep}${rel.split('/').join(sep)}`,

    async tree(dir, exclude): Promise<TreeSnapshot> {
      const res = await fetch(url('tree', { path: dir, exclude: exclude.join(',') }), { headers: auth, signal: AbortSignal.timeout(5 * 60_000) })
      if (!res.ok) throw new Error(await errorOf(res))
      const t = (await res.json()) as { files: { p: string; s: number; m: number }[]; dirs: string[]; truncated: boolean }
      return { files: new Map(t.files.map((f) => [f.p, { size: f.s, mtime: f.m }])), dirs: new Set(t.dirs), truncated: t.truncated }
    },

    async download(remoteAbs, localAbs, mtime): Promise<void> {
      const res = await fetch(url('read', { path: remoteAbs, download: '1' }), { headers: auth, signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS) })
      if (!res.ok || !res.body) throw new Error(await errorOf(res))
      await fsp.mkdir(dirname(localAbs), { recursive: true })
      const tmp = `${localAbs}.cowork-${randomBytes(5).toString('hex')}.part`
      try {
        await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp))
        await fsp.utimes(tmp, mtime / 1000, mtime / 1000)
        await fsp.rename(tmp, localAbs)
      } catch (e) {
        await fsp.rm(tmp, { force: true }).catch(() => {})
        throw e
      }
    },

    async upload(localAbs, remoteAbs, mtime, expect): Promise<void> {
      const res = await fetch(url('file', { path: remoteAbs, mtime: String(mtime), expect: String(expect) }), {
        method: 'PUT',
        headers: auth,
        body: Readable.toWeb(createReadStream(localAbs)) as never,
        // undici necesita `duplex` para enviar un stream
        duplex: 'half',
        signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS)
      })
      if (res.status === 409) throw new RemoteConflict(await errorOf(res))
      if (!res.ok) throw new Error(await errorOf(res))
    },

    async mkdir(remoteAbs): Promise<void> {
      const res = await fetch(url('mkdir', { path: remoteAbs }), { method: 'POST', headers: auth, signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(await errorOf(res))
    },

    async trash(remoteAbs): Promise<void> {
      const res = await fetch(url('trash', { path: remoteAbs }), { method: 'POST', headers: auth, signal: AbortSignal.timeout(60_000) })
      // Si ya no está, ya está hecho.
      if (res.status === 404) return
      if (!res.ok) throw new Error(await errorOf(res))
    },

    async hash(remoteAbs): Promise<string> {
      const res = await fetch(url('hash', { path: remoteAbs }), { headers: auth, signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS) })
      if (!res.ok) throw new Error(await errorOf(res))
      return ((await res.json()) as { sha256: string }).sha256
    }
  }
}
