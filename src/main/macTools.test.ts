import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { macFfmpegInstall, macLmStudioInstall, macNodeBin, macNodeInstall, macOllamaInstall, macPythonInstall } from './macTools'

const all = { macNodeInstall, macPythonInstall, macOllamaInstall, macLmStudioInstall, macFfmpegInstall }

describe('programas del Mac sin Homebrew', () => {
  it.each(Object.entries(all))('%s es una orden de shell válida', (_name, fn) => {
    expect(() => execFileSync('bash', ['-n', '-c', fn()])).not.toThrow()
    expect(fn()).not.toMatch(/\bbrew\b|sudo/)
  })

  it('baja Node.js de nodejs.org para el procesador del Mac y comprueba su SHA-256', () => {
    const cmd = macNodeInstall()
    expect(cmd).toContain('https://nodejs.org/dist/latest-v$L.x')
    expect(cmd).toContain('-darwin-$A.tar.gz')
    expect(cmd).toContain('shasum -a 256')
    expect(macNodeBin('/Users/x')).toBe('/Users/x/.local/share/kywai/node/bin')
  })

  it('LM Studio no se instala en un Mac Intel', () => {
    expect(macLmStudioInstall()).toMatch(/\[ "\$A" = arm64 \] \|\| \{ echo "LM Studio solo funciona/)
  })

  it('ffmpeg y ffprobe, con la compilación de su procesador', () => {
    expect(macFfmpegInstall()).toContain('https://ffmpeg.martin-riedl.de/redirect/latest/macos/$R/release/$p.zip')
  })
})
