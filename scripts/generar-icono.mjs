// Genera build/icon-<tamaño>.png e icon.png (macOS/Linux) a partir de build/icono.svg, el logo de kywai.
// Después, empaquetar-icono.mjs los une en build/icon.ico (Windows).
// Uso: npm run icono
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const build = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
const svg = readFileSync(join(build, 'icono.svg'))

for (const size of [1024, 256, 64, 48, 32, 16]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(join(build, `icon-${size}.png`), png)
  if (size === 1024) writeFileSync(join(build, 'icon.png'), png)
}
console.log('Iconos PNG generados desde build/icono.svg')
