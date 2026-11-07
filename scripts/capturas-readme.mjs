// Rehace las capturas de los README en los cinco idiomas, con el modo demo en el navegador.
//
// Uso: en una terminal `npm run web`; en otra `node scripts/capturas-readme.mjs` (opcional: idiomas, p. ej. `en es`).
// Necesita Playwright con Chromium (`npx playwright install chromium` si no lo tienes) y Python con Pillow para
// convertir a JPG. Deja docs/img/<idioma>/escritorio.jpg, robots.jpg y tema-*.jpg.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const URL = process.env.AICOWORK_WEB ?? 'http://localhost:5199/'
const LANGS = process.argv.slice(2).length ? process.argv.slice(2) : ['en', 'es', 'pt', 'fr', 'zh']
// tema, nombre del archivo y ancho final (como las capturas de antes)
const SHOTS = [
  ['clasico', 'escritorio', 1600],
  ['orbita', 'tema-orbita', 1600],
  ['marfil', 'tema-marfil', 800],
  ['grafito', 'tema-grafito', 800],
  ['bosque', 'tema-bosque', 800],
  ['matrix', 'tema-matrix', 800],
  ['eva', 'tema-eva', 800],
  ['relicario', 'tema-relicario', 1000],
  ['telar', 'tema-telar', 1000],
  ['halloween', 'tema-halloween', 1000],
  ['navidad', 'tema-navidad', 1000]
]
// El espacio digital (para robots.jpg) dentro de la ventana de 1600 × 900
const SCENE = { x: 698, y: 126, width: 877, height: 748 }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
for (const lang of LANGS) {
  const dir = join('docs', 'img', lang)
  mkdirSync(dir, { recursive: true })
  for (const [theme, name, width] of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, locale: lang })
    const page = await ctx.newPage()
    await page.addInitScript(([l, t]) => {
      localStorage.setItem('aicowork.lang', l)
      localStorage.setItem('aicowork.theme', t)
    }, [lang, theme])
    await page.goto(URL)
    await page.waitForTimeout(18000) // que el guion de la demo llegue a mostrar el plan, tareas y bocadillos
    const png = join(dir, `${name}.png`)
    await page.screenshot({ path: png, timeout: 120000 })
    toJpg(png, join(dir, `${name}.jpg`), width)
    if (name === 'escritorio') {
      const r = join(dir, 'robots.png')
      await page.screenshot({ path: r, clip: SCENE, timeout: 120000 })
      toJpg(r, join(dir, 'robots.jpg'), SCENE.width)
    }
    await ctx.close()
    console.log(lang, name)
  }
}
await browser.close()

function toJpg(png, jpg, width) {
  const py = `from PIL import Image\nim = Image.open(${JSON.stringify(png)}).convert('RGB')\nh = round(im.height * ${width} / im.width)\nim.resize((${width}, h), Image.LANCZOS).save(${JSON.stringify(jpg)}, quality=85, optimize=True, progressive=True)`
  execFileSync('python3', ['-c', py])
  rmSync(png)
}
