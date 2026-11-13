import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cachedPdf, findSoffice, NoLibreOfficeError, officeToPdf, previewKey, sofficeCandidates } from './officePreview'

const dir = mkdtempSync(join(tmpdir(), 'vista-previa-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('vista previa con LibreOffice', () => {
  it('busca LibreOffice donde se instala en cada sistema', () => {
    expect(sofficeCandidates('darwin')[0]).toBe('/Applications/LibreOffice.app/Contents/MacOS/soffice')
    expect(sofficeCandidates('win32', { ProgramFiles: 'C:\\Program Files' })[0]).toMatch(/LibreOffice[\\/]program[\\/]soffice\.exe$/)
    expect(sofficeCandidates('linux')).toContain('/usr/bin/soffice')
  })

  it('el nombre en caché cambia si cambia el archivo, y solo se sirven nombres seguros', () => {
    const a = previewKey('/x/a.doc', 10, 1000)
    expect(a).toMatch(/^[0-9a-f]{40}$/)
    expect(previewKey('/x/a.doc', 11, 1000)).not.toBe(a)
    expect(previewKey('/x/a.doc', 10, 2000)).not.toBe(a)
    writeFileSync(join(dir, `${a}.pdf`), '%PDF')
    expect(cachedPdf(dir, `${a}.pdf`)).toBe(join(dir, `${a}.pdf`))
    expect(cachedPdf(dir, '../secreto.pdf')).toBeNull()
    expect(cachedPdf(dir, `${a}.pdf/../../x`)).toBeNull()
  })

  it('sin LibreOffice avisa con un error propio', async () => {
    const file = join(dir, 'a.doc')
    writeFileSync(file, 'hola')
    await expect(officeToPdf(file, dir, null)).rejects.toBeInstanceOf(NoLibreOfficeError)
  })

  it.skipIf(!findSoffice())('convierte un documento a PDF y la segunda vez lo saca de la caché', async () => {
    const file = join(dir, 'carta con espacios.rtf')
    writeFileSync(file, '{\\rtf1\\ansi Hola desde kywai\\par}')
    const name = await officeToPdf(file, dir)
    expect(name).toMatch(/^[0-9a-f]{40}\.pdf$/)
    expect(readFileSync(join(dir, name)).subarray(0, 4).toString()).toBe('%PDF')
    expect(await officeToPdf(file, dir)).toBe(name)
    expect(existsSync(join(dir, `tmp-${name.slice(0, 12)}`))).toBe(false)
  }, 150_000)
})
