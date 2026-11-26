// Genera web/assets/hero-gpu.js (el fondo con vgpu) a partir de hero.wgsl y hero.js.
// Uso (desde cualquier carpeta de trabajo con internet): node web/gpu/construir.mjs
// Instala vgpu, @vgpu/wgsl y esbuild en una carpeta temporal; no hace falta ningún package.json en el repo.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const AQUI = dirname(fileURLToPath(import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'kywai-gpu-'))
const npm = (...a) => execFileSync('npm', a, { cwd: tmp, stdio: 'inherit' })
writeFileSync(join(tmp, 'package.json'), '{"name":"kywai-gpu","private":true,"type":"module"}')
npm('install', '--no-audit', '--no-fund', 'vgpu@0.6', 'esbuild')
const { prepareShader } = await import(join(tmp, 'node_modules/@vgpu/wgsl/dist/prepare.js'))
copyFileSync(join(AQUI, 'hero.js'), join(tmp, 'hero.js'))
writeFileSync(join(tmp, 'hero-shader.json'), JSON.stringify(prepareShader(readFileSync(join(AQUI, 'hero.wgsl'), 'utf8'))))
execFileSync(join(tmp, 'node_modules/.bin/esbuild'), ['hero.js', '--bundle', '--minify', '--format=esm', '--target=es2022', '--legal-comments=none', '--outfile=' + join(AQUI, '../assets/hero-gpu.js')], { cwd: tmp, stdio: 'inherit' })
copyFileSync(join(tmp, 'node_modules/vgpu/LICENSE'), join(AQUI, '../assets/LICENSE-vgpu.txt'))
console.log('Listo: web/assets/hero-gpu.js')
