// Une build/icon-*.png en build/icon.ico (formato ICO con imágenes PNG, válido desde Windows Vista).
// Uso: node scripts/empaquetar-icono.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const build = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
const sizes = [256, 64, 48, 32, 16]
const images = sizes.map((s) => ({ size: s, data: readFileSync(join(build, `icon-${s}.png`)) }))

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reservado
header.writeUInt16LE(1, 2) // tipo: icono
header.writeUInt16LE(images.length, 4)

let offset = 6 + 16 * images.length
const entries = images.map(({ size, data }) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(size >= 256 ? 0 : size, 0) // ancho (0 = 256)
  e.writeUInt8(size >= 256 ? 0 : size, 1) // alto
  e.writeUInt8(0, 2) // colores en paleta
  e.writeUInt8(0, 3) // reservado
  e.writeUInt16LE(1, 4) // planos
  e.writeUInt16LE(32, 6) // bits por píxel
  e.writeUInt32LE(data.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += data.length
  return e
})

writeFileSync(join(build, 'icon.ico'), Buffer.concat([header, ...entries, ...images.map((i) => i.data)]))
console.log(`icon.ico creado con ${images.length} tamaños`)
