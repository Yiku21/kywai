import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { __setUiCapturerForChecks, captureUi, pagesToShoot, touchesUi } from './uiShots'

const dirs: string[] = []
function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'uishots-'))
  dirs.push(dir)
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(join(dir, f, '..'), { recursive: true })
    writeFileSync(join(dir, f), body)
  }
  return dir
}

afterEach(() => {
  __setUiCapturerForChecks(null)
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('capturas de la interfaz para el verificador', () => {
  it('solo cuenta como interfaz lo que se ve: HTML, estilos, componentes y JS de carpetas de interfaz', () => {
    expect(touchesUi(['web/index.html'])).toBe(true)
    expect(touchesUi(['src/App.tsx'])).toBe(true)
    expect(touchesUi(['styles/main.scss'])).toBe(true)
    expect(touchesUi(['src/main.ts'])).toBe(true)
    expect(touchesUi(['scripts/build.ts', 'README.md', 'server/db.js'])).toBe(false)
  })

  it('abre las HTML que cambió (index primero) o, si no, la entrada ya compilada de la web', () => {
    const dir = project({ 'web/about.html': 'a', 'web/index.html': 'i', 'dist/index.html': 'd', 'index.html': 'r' })
    expect(pagesToShoot(dir, ['web/about.html', 'web/index.html', 'notas.md'])).toEqual(['web/index.html', 'web/about.html'])
    expect(pagesToShoot(dir, ['src/Boton.tsx'])).toEqual(['dist/index.html'])
    expect(pagesToShoot(dir, ['server/db.js'])).toEqual([])
    // Lo que no existe o es de kywai no se abre.
    expect(pagesToShoot(dir, ['borrada.html', '.ai-cowork/x.html'])).toEqual(['dist/index.html'])
    expect(pagesToShoot(project({}), ['src/App.css'])).toEqual([])
  })

  it('guarda en .ai-cowork/verificacion y no cuenta una captura vacía ni un fallo', async () => {
    const dir = project({ 'index.html': '<h1>Hola</h1>' })
    let out = ''
    __setUiCapturerForChecks(async (_d, pages, outDir, tag) => {
      out = outDir
      return { shots: [{ path: `.ai-cowork/verificacion/${tag}.png`, page: pages[0], view: 'escritorio' }], errors: [] }
    })
    expect(await captureUi(dir, ['index.html'], 'ab/c..d')).toEqual({ shots: [{ path: '.ai-cowork/verificacion/abcd.png', page: 'index.html', view: 'escritorio' }], errors: [] })
    expect(out).toBe(join(dir, '.ai-cowork', 'verificacion'))
    __setUiCapturerForChecks(async () => ({ shots: [], errors: ['x'] }))
    expect(await captureUi(dir, ['index.html'], 't')).toBeNull()
    __setUiCapturerForChecks(async () => {
      throw new Error('sin pantalla')
    })
    expect(await captureUi(dir, ['index.html'], 't')).toBeNull()
  })

  it('fuera de Electron no captura nada', async () => {
    const dir = project({ 'index.html': '<h1>Hola</h1>' })
    expect(await captureUi(dir, ['index.html'], 't')).toBeNull()
  })
})
