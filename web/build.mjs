// Genera la web estática de kywai.app en web/dist/ a partir de plantilla.html y textos.mjs.
//   node web/build.mjs            → web/dist (la que se publica)
//   node web/build.mjs --preview  → web/preview (enlaces con index.html, para verla sin servidor)
// No necesita dependencias: solo Node 18+.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IDIOMAS, TEXTOS } from './textos.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PREVIEW = process.argv.includes('--preview')
const SALIDA = join(AQUI, PREVIEW ? 'preview' : 'dist')
const SITIO = 'https://kywai.app/'
const RELEASES = 'https://github.com/Yiku21/ai-cowork/releases/latest'

const plantilla = readFileSync(join(AQUI, 'plantilla.html'), 'utf8')
// El logo (símbolo + «kywai») va dentro de la página una sola vez como <symbol>, para que el texto
// tome el color del tema (currentColor) en la cabecera y en el pie.
const logo = readFileSync(join(AQUI, 'assets', 'kywai-logo.svg'), 'utf8')
const logoViewBox = logo.match(/viewBox="([^"]+)"/)[1]
const [, , logoW, logoH] = logoViewBox.split(' ').map(Number)
const logoDefs = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="kywai-logo" viewBox="${logoViewBox}">${logo.replace(/^<svg[^>]*>/, '').replace(/<title>.*?<\/title>/, '').replace(/<\/svg>\s*$/, '')}</symbol></svg>`
const claves = Object.keys(TEXTOS.en)

const huellas = {}
const huella = (ruta) => (huellas[ruta] ??= createHash('sha1').update(readFileSync(join(AQUI, ruta))).digest('hex').slice(0, 8))

const escapar = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

rmSync(SALIDA, { recursive: true, force: true })
mkdirSync(SALIDA, { recursive: true })
cpSync(join(AQUI, 'assets'), join(SALIDA, 'assets'), { recursive: true })

const ruta = (desde, hacia) => {
  // Enlace relativo de la página de «desde» a la de «hacia».
  const base = desde.dir ? '../' : ''
  const destino = base + hacia.dir
  if (PREVIEW) return destino + 'index.html'
  return destino === '' ? './' : destino
}

for (const idioma of IDIOMAS) {
  const t = TEXTOS[idioma.code]
  const faltan = claves.filter((k) => !(k in t))
  if (faltan.length) throw new Error(`Faltan textos en ${idioma.code}: ${faltan.join(', ')}`)

  const base = idioma.dir ? '../' : ''
  const langLinks = IDIOMAS.map((o) =>
    `<li><a href="${ruta(idioma, o)}" hreflang="${o.hreflang}" lang="${o.hreflang}" data-lang="${o.code}"${o.code === idioma.code ? ' aria-current="page"' : ''}>${o.label}</a></li>`
  ).join('')
  const hreflangs = [
    ...IDIOMAS.map((o) => `<link rel="alternate" hreflang="${o.hreflang}" href="${SITIO}${o.dir}">`),
    `<link rel="alternate" hreflang="x-default" href="${SITIO}">`,
  ].join('\n')
  const langsJson = JSON.stringify(Object.fromEntries(IDIOMAS.filter((o) => o.code !== 'en').map((o) => [o.code, ruta(idioma, o)])))

  const valores = {
    ...Object.fromEntries(claves.map((k) => [k, escapar(t[k])])),
    lang: idioma.hreflang,
    langLabel: idioma.label,
    ogLocale: idioma.og,
    base,
    home: ruta(idioma, idioma),
    img: idioma.code,
    site: SITIO,
    canonical: SITIO + idioma.dir,
    releases: RELEASES,
    hreflangs,
    langLinks,
    langsJson,
    logoDefs,
    logoViewBox,
    logoRatio: `${logoW} / ${logoH}`,
  }
  // El script de la portada compara con el código corto del idioma.
  let html = plantilla.replace("var here = '{{lang}}'", `var here = '${idioma.code}'`)
  html = html.replace(/\{\{([\w.]+)\}\}/g, (m, k) => {
    if (!(k in valores)) throw new Error(`Hueco sin valor en la plantilla: ${m}`)
    return valores[k]
  })
  // Cada archivo de assets/ lleva ?v=<huella de su contenido>: al cambiar una imagen, el navegador
  // pide la nueva al momento en vez de enseñar la guardada (GitHub Pages deja cachear 10 min).
  html = html.replace(/((?:\.\.\/)?assets\/[\w/.-]+\.(?:jpg|png|svg|mp4|woff2))(?=["')])/g, (m, ruta) => ruta + '?v=' + huella(ruta.replace(/^(\.\.\/)+/, '')))
  const destino = join(SALIDA, idioma.dir, 'index.html')
  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, html)
}

if (!PREVIEW) {
  writeFileSync(join(SALIDA, 'CNAME'), 'kywai.app\n')
  writeFileSync(join(SALIDA, '.nojekyll'), '')
  writeFileSync(join(SALIDA, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITIO}sitemap.xml\n`)
  const urls = IDIOMAS.map((o) => `  <url><loc>${SITIO}${o.dir}</loc></url>`).join('\n')
  writeFileSync(join(SALIDA, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
  writeFileSync(join(SALIDA, '404.html'), `<!doctype html><meta charset="utf-8"><title>Kywai</title><meta http-equiv="refresh" content="0; url=/"><a href="/">kywai.app</a>`)
}

console.log(`Web generada en ${SALIDA} (${IDIOMAS.length} idiomas)`)
