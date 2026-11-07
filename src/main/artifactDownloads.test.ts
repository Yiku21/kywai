import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync, createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { unzipSync } from 'fflate'
import * as store from './projects'
import { prepareArtifactDownload, writeArtifactDownload } from './artifactDownloads'

const root = mkdtempSync(join(tmpdir(), 'kywai-download-'))
store.initProjects(root)
const project = store.createProject('Descargas')
const folder = join(project.dir, 'artifacts', 'tema')
mkdirSync(folder, { recursive: true })
const files = [
  { id: 'doc', name: 'concepto ñ.md', bytes: Buffer.from('# Diseño\n') },
  { id: 'img', name: 'imagen.png', bytes: Buffer.from([0, 1, 255, 9, 0, 128]) }
]
for (const f of files) {
  writeFileSync(join(folder, f.name), f.bytes)
  store.upsertArtifact({ id: f.id, projectId: project.id, name: f.name, relPath: `artifacts/tema/${f.name}`, kind: 'other', size: f.bytes.length, createdAt: 1 })
}
writeFileSync(join(folder, 'no-entregado.txt'), 'No debe incluirse')
afterAll(() => { store.flushAll(); rmSync(root, { recursive: true, force: true }) })

describe('descargar entregables', () => {
  it('conserva el nombre y todos los bytes de un archivo individual', async () => {
    const buffers: Buffer[] = []
    const output = new Writable({ write(chunk, _encoding, done) { buffers.push(Buffer.from(chunk)); done() } })
    const download = prepareArtifactDownload(project.id, ['img'])
    expect(download.name).toBe('imagen.png')
    await writeArtifactDownload(download, output)
    expect(Buffer.concat(buffers)).toEqual(files[1].bytes)
  })

  it('el zip contiene solo los entregables seleccionados y se extrae con sus bytes originales', async () => {
    const download = prepareArtifactDownload(project.id, ['doc', 'img'])
    expect(download.name).toBe('tema.zip')
    expect(download.files.map((f) => f.name)).toEqual(['concepto ñ.md', 'imagen.png'])
    const zip = join(root, 'seleccion.zip')
    await writeArtifactDownload(download, createWriteStream(zip))
    const unpacked = unzipSync(readFileSync(zip))
    expect(Object.keys(unpacked).sort()).toEqual(files.map((f) => f.name).sort())
    for (const f of files) expect(Buffer.from(unpacked[f.name])).toEqual(f.bytes)
    expect(prepareArtifactDownload(project.id, ['img', 'img']).files).toHaveLength(1)
  })

  it('rechaza archivos ajenos, selecciones vacías y recorridos de ruta', () => {
    expect(() => prepareArtifactDownload(project.id, [])).toThrow()
    expect(() => prepareArtifactDownload(project.id, ['no-existe'])).toThrow()
    expect(() => prepareArtifactDownload('../fuera', ['doc'])).toThrow()
    expect(() => prepareArtifactDownload(project.id, ['../doc'])).toThrow()
    store.upsertArtifact({ id: 'malo', projectId: project.id, name: 'fuera', relPath: '../fuera.txt', kind: 'text', size: 1, createdAt: 1 })
    expect(() => prepareArtifactDownload(project.id, ['malo'])).toThrow()
  })

  it('devuelve un error de escritura del zip sin colgarse ni emitir una excepción sin atender', async () => {
    const output = new Writable({ write(_chunk, _encoding, done) { done(new Error('Disco lleno')) } })
    await expect(writeArtifactDownload(prepareArtifactDownload(project.id, ['doc', 'img']), output)).rejects.toThrow('Disco lleno')
  })

  it('no permite descargar un enlace que sale de la carpeta del proyecto', () => {
    const external = join(root, 'externo')
    mkdirSync(external)
    writeFileSync(join(external, 'privado.txt'), 'privado')
    symlinkSync(external, join(folder, 'enlace'), process.platform === 'win32' ? 'junction' : 'dir')
    store.upsertArtifact({ id: 'enlace', projectId: project.id, name: 'privado.txt', relPath: 'artifacts/tema/enlace/privado.txt', kind: 'text', size: 7, createdAt: 1 })
    expect(() => prepareArtifactDownload(project.id, ['enlace'])).toThrow()
  })
})
