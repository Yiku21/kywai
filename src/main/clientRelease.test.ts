import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { releaseMessage, verifyRelease } from './clientRelease'

const pair = generateKeyPairSync('ed25519')
const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const sha = 'aGFzaC1kZWwtaW5zdGFsYWRvcg=='
const signed = (version: string, path: string, sha512: string, key = pair.privateKey): string =>
  sign(null, Buffer.from(releaseMessage(version, path, sha512)), key).toString('base64')
const release = { version: '0.1.200', path: 'AI-Cowork-Setup-0.1.200.exe', sha512: sha, firma: signed('0.1.200', 'AI-Cowork-Setup-0.1.200.exe', sha) }

describe('firma de las actualizaciones del cliente', () => {
  it('acepta el instalador firmado con la clave del dueño', () => {
    expect(verifyRelease(release, sha, publicPem)).toBeNull()
  })

  it('rechaza lo que no firmó el dueño, aunque lo suba alguien con el código del servidor', () => {
    const other = generateKeyPairSync('ed25519').privateKey
    expect(verifyRelease({ ...release, firma: signed('0.1.200', release.path, sha, other) }, sha, publicPem)).toMatch(/no es la tuya/)
    expect(verifyRelease({ ...release, firma: undefined }, sha, publicPem)).toMatch(/no está firmada/)
    expect(verifyRelease({ ...release, firma: 'no-es-base64!' }, sha, publicPem)).not.toBeNull()
  })

  it('rechaza cambiar la versión, el archivo o el instalador de una versión firmada', () => {
    expect(verifyRelease({ ...release, version: '0.1.201' }, sha, publicPem)).toMatch(/no es la tuya/)
    expect(verifyRelease({ ...release, path: 'AI-Cowork-Setup-0.1.201.exe' }, sha, publicPem)).toMatch(/no es la tuya/)
    const otherSha = 'b3RybyBpbnN0YWxhZG9y'
    expect(verifyRelease({ ...release, sha512: otherSha }, otherSha, publicPem)).toMatch(/no es la tuya/)
    expect(verifyRelease(release, otherSha, publicPem)).toMatch(/no es el publicado/)
  })

  it('un cliente sin clave pública no instala nada', () => {
    expect(verifyRelease(release, sha, '')).toMatch(/no trae la clave/)
  })
})
