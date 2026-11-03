// Certificado propio para la versión HTTPS del acceso web (sin depender de que Tailscale Serve esté activado).
// No lo firma ninguna autoridad, así que el navegador avisa la primera vez; al aceptarlo, la página es segura y
// deja usar el micrófono. Se genera aquí mismo (DER a mano con node:crypto, ECDSA P-256) y se guarda en disco
// para que el navegador no vuelva a avisar mientras sirva para las mismas direcciones.
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isIPv4 } from 'node:net'
import { join } from 'node:path'

export interface TlsPair {
  key: string
  cert: string
}

// ---------- DER mínimo ----------

function derLength(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n])
  const bytes: number[] = []
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff)
  return Buffer.from([0x80 | bytes.length, ...bytes])
}
const tlv = (tag: number, body: Buffer): Buffer => Buffer.concat([Buffer.from([tag]), derLength(body.length), body])
const seq = (...items: Buffer[]): Buffer => tlv(0x30, Buffer.concat(items))
const set = (...items: Buffer[]): Buffer => tlv(0x31, Buffer.concat(items))
const explicit = (n: number, body: Buffer): Buffer => tlv(0xa0 + n, body)
const octets = (b: Buffer): Buffer => tlv(0x04, b)
const bits = (b: Buffer): Buffer => tlv(0x03, Buffer.concat([Buffer.from([0]), b]))
const utf8 = (s: string): Buffer => tlv(0x0c, Buffer.from(s, 'utf8'))
const TRUE = Buffer.from([0x01, 0x01, 0xff])

function integer(b: Buffer): Buffer {
  let i = 0
  while (i < b.length - 1 && b[i] === 0 && !(b[i + 1] & 0x80)) i++
  const v = b.subarray(i)
  return tlv(0x02, v[0] & 0x80 ? Buffer.concat([Buffer.from([0]), v]) : v)
}

function oid(dotted: string): Buffer {
  const [a, b, ...rest] = dotted.split('.').map(Number)
  const out = [40 * a + b]
  for (const p of rest) {
    const chunk = [p & 0x7f]
    for (let v = Math.floor(p / 128); v > 0; v = Math.floor(v / 128)) chunk.unshift((v & 0x7f) | 0x80)
    out.push(...chunk)
  }
  return tlv(0x06, Buffer.from(out))
}

/** UTCTime (válido hasta 2049). */
function utcTime(d: Date): Buffer {
  const p = (n: number): string => String(n).padStart(2, '0')
  const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  return tlv(0x17, Buffer.from(s, 'ascii'))
}

const pem = (label: string, der: Buffer): string =>
  `-----BEGIN ${label}-----\n${der.toString('base64').replace(/.{1,64}/g, '$&\n')}-----END ${label}-----\n`

/** Días de validez: Apple no acepta certificados de servidor de más de 825 días. */
const VALID_DAYS = 800

/** Certificado autofirmado para estas direcciones (IPs y nombres), válido para un servidor HTTPS. */
export function selfSignedCert(hosts: string[], now = new Date()): TlsPair {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const ecdsaSha256 = seq(oid('1.2.840.10045.4.3.2'))
  const name = seq(set(seq(oid('2.5.4.3'), utf8('AI Cowork'))), set(seq(oid('2.5.4.10'), utf8('AI Cowork (certificado propio)'))))
  const serial = randomBytes(16)
  serial[0] = (serial[0] & 0x7f) | 0x01
  const notBefore = new Date(now.getTime() - 24 * 3600_000)
  const notAfter = new Date(now.getTime() + VALID_DAYS * 24 * 3600_000)
  const altNames = [...new Set(hosts.filter(Boolean))].map((h) =>
    isIPv4(h) ? tlv(0x87, Buffer.from(h.split('.').map(Number))) : tlv(0x82, Buffer.from(h, 'ascii'))
  )
  const extensions = seq(
    seq(oid('2.5.29.19'), TRUE, octets(seq())), // basicConstraints: no es una autoridad
    seq(oid('2.5.29.15'), TRUE, octets(tlv(0x03, Buffer.from([0x07, 0x80])))), // keyUsage: digitalSignature
    seq(oid('2.5.29.37'), octets(seq(oid('1.3.6.1.5.5.7.3.1')))), // extKeyUsage: serverAuth
    seq(oid('2.5.29.17'), octets(seq(...altNames))) // subjectAltName
  )
  const tbs = seq(
    explicit(0, integer(Buffer.from([2]))), // v3
    integer(serial),
    ecdsaSha256,
    name,
    seq(utcTime(notBefore), utcTime(notAfter)),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
    explicit(3, extensions)
  )
  const signature = sign('sha256', tbs, privateKey)
  const cert = seq(tbs, ecdsaSha256, bits(signature))
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), cert: pem('CERTIFICATE', cert) }
}

interface Meta {
  hosts: string[]
  notAfter: number
}

/**
 * Certificado guardado en `dir`, válido para todas estas direcciones. Si falta alguna o caduca pronto se hace
 * uno nuevo con las de antes y las nuevas (así el navegador vuelve a avisar lo menos posible).
 */
export function ensureWebCert(dir: string, hosts: string[]): TlsPair {
  const keyFile = join(dir, 'key.pem')
  const certFile = join(dir, 'cert.pem')
  const metaFile = join(dir, 'meta.json')
  const wanted = [...new Set(hosts.filter(Boolean).map((h) => h.toLowerCase()))]
  let meta: Meta | null = null
  try {
    if (existsSync(keyFile) && existsSync(certFile) && existsSync(metaFile)) meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Meta
  } catch {
    meta = null
  }
  const covered = !!meta && Array.isArray(meta.hosts) && wanted.every((h) => meta!.hosts.includes(h))
  if (meta && covered && meta.notAfter - Date.now() > 30 * 24 * 3600_000) {
    try {
      const pair = { key: readFileSync(keyFile, 'utf8'), cert: readFileSync(certFile, 'utf8') }
      // Que la clave sea legible y corresponda a un certificado (si no, se rehace).
      createPublicKey(createPrivateKey(pair.key))
      return pair
    } catch {
      /* se rehace abajo */
    }
  }
  const all = [...new Set([...(meta?.hosts ?? []), ...wanted])]
  const pair = selfSignedCert(all)
  mkdirSync(dir, { recursive: true })
  writeFileSync(keyFile, pair.key, { encoding: 'utf8', mode: 0o600 })
  writeFileSync(certFile, pair.cert, 'utf8')
  writeFileSync(metaFile, JSON.stringify({ hosts: all, notAfter: Date.now() + VALID_DAYS * 24 * 3600_000 } satisfies Meta), 'utf8')
  return pair
}
