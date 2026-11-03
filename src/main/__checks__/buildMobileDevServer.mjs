// Empaqueta el servidor de pruebas del móvil con la cuota sustituida (ver mobileDevServer.ts).
import { build } from 'esbuild'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
await build({
  entryPoints: [resolve(here, 'mobileDevServer.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: process.argv[2],
  logLevel: 'warning',
  alias: { electron: resolve(here, 'electron-stub.ts'), '@shared': resolve(here, '../../shared') },
  plugins: [{
    name: 'quota-stub',
    setup(b) {
      b.onResolve({ filter: /^\.\/quota$/ }, (args) => args.importer.includes('__checks__') ? undefined : { path: resolve(here, 'quota-stub.ts') })
    },
  }],
})
