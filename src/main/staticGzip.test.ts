import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { acceptsGzip, gzipStatic } from './staticGzip'

describe('acceptsGzip', () => {
  it('reconoce gzip y el comodín', () => {
    expect(acceptsGzip('gzip, deflate, br')).toBe(true)
    expect(acceptsGzip('br;q=1.0, gzip;q=0.8')).toBe(true)
    expect(acceptsGzip('*')).toBe(true)
  })
  it('respeta q=0 y la ausencia de cabecera', () => {
    expect(acceptsGzip('gzip;q=0')).toBe(false)
    expect(acceptsGzip('br')).toBe(false)
    expect(acceptsGzip(undefined)).toBe(false)
  })
})

describe('gzipStatic', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gz-'))

  it('comprime el JavaScript y se rehace si el archivo cambia', () => {
    const f = join(dir, 'app.js')
    writeFileSync(f, 'const x = 1;\n'.repeat(500))
    const st = { mtimeMs: 1000, size: 13 * 500 }
    utimesSync(f, 1, 1)
    const gz = gzipStatic(f, st)!
    expect(gz.length).toBeLessThan(st.size / 5)
    expect(gunzipSync(gz).toString()).toBe('const x = 1;\n'.repeat(500))
    expect(gzipStatic(f, st)).toBe(gz)
    writeFileSync(f, 'let y = 2;\n'.repeat(500))
    const gz2 = gzipStatic(f, { mtimeMs: 2000, size: 11 * 500 })!
    expect(gunzipSync(gz2).toString()).toBe('let y = 2;\n'.repeat(500))
  })

  it('no toca imágenes ni archivos pequeños', () => {
    const png = join(dir, 'a.png')
    writeFileSync(png, Buffer.alloc(5000))
    expect(gzipStatic(png, { mtimeMs: 1, size: 5000 })).toBeNull()
    const small = join(dir, 'b.css')
    writeFileSync(small, 'a{}')
    expect(gzipStatic(small, { mtimeMs: 1, size: 3 })).toBeNull()
  })
})
