// Vista previa del renderer en un navegador normal (sin Electron).
// Sin backend: la app arranca en modo Demo.
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = __dirname

export default defineConfig({
  root: resolve(here, 'src/renderer'),
  resolve: {
    alias: { '@shared': resolve(here, 'src/shared'), '@': resolve(here, 'src/renderer/src') }
  },
  plugins: [react()],
  server: { port: 5199, strictPort: true }
})
