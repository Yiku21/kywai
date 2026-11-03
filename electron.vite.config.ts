import { execSync } from 'child_process'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

/** Commit con el que se compila: «Buscar actualizaciones» lo compara con el código descargado. */
function gitHead(): string {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    define: { __BUILD_COMMIT__: JSON.stringify(gitHead()) }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    // index: la app con su motor; client: el modo cliente (páginas propias e interfaz del servidor).
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts'), client: resolve('src/preload/client.ts') } } }
  },
  renderer: {
    resolve: { alias: { ...shared, '@': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
