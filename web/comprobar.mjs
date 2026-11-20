// Prueba rutas publicadas y de vista previa; requiere las dependencias de desarrollo.
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { JSDOM } from 'jsdom'
import { PAGINAS } from './secciones.mjs'
import { IDIOMAS } from './textos.mjs'
import { CONEXIONES } from './escaparate.mjs'
import { CONFIG_GUIAS } from './guias.mjs'
const root = dirname(fileURLToPath(import.meta.url))
// El código de la app vive en un repositorio privado: para las comprobaciones que lo comparan con la web, pon su carpeta en KYWAI_CODIGO.
const CODIGO = process.env.KYWAI_CODIGO || join(root, '..')
const script = readFileSync(join(root, 'assets/site.js'), 'utf8')
const release = JSON.parse(readFileSync(join(root, 'descargas.json'), 'utf8'))
const visual = JSON.parse(readFileSync(join(root, 'catalogo-visual.json'), 'utf8'))
const origin = 'https://kywai.app'
let checked = 0
for (const preview of [false, true]) {
  execFileSync(process.execPath, [join(root, 'build.mjs'), ...(preview ? ['--preview'] : [])])
  const output = join(root, preview ? 'preview' : 'dist')
  for (const [index, language] of IDIOMAS.entries()) {
    for (const page of PAGINAS) {
      const route = language.dir + page.paths[index]
      const html = readFileSync(join(output, route, 'index.html'), 'utf8')
      const document = new JSDOM(html).window.document
      assert.equal(document.querySelectorAll('h1').length, 1, route + ': un título principal')
      assert(!html.includes('{{') && !html.includes('undefined'), route + ': textos completos')
      assert.equal(document.querySelector('link[rel=canonical]').href, origin + '/' + route)
      assert.equal(document.querySelectorAll('link[rel=alternate]').length, IDIOMAS.length + 1)
      const legal = [...document.querySelectorAll('.footer-legal a')]
      assert.equal(legal.length, 2, route + ': documentos legales visibles en el pie')
      assert(legal.some(a => a.getAttribute('href').includes('privacidad/')))
      assert(legal.some(a => a.getAttribute('href').includes('terminos/')))
      const ids = [...document.querySelectorAll('[id]')].map(n => n.id)
      assert.equal(new Set(ids).size, ids.length, route + ': identificadores únicos')
      for (const element of document.querySelectorAll('[href], [src], [poster]')) {
        const attr = element.getAttribute('href') || element.getAttribute('src') || element.getAttribute('poster')
        if (!attr || /^(?:https?:|mailto:|data:)/.test(attr)) continue
        const target = new URL(attr, origin + '/' + route + (preview ? 'index.html' : ''))
        let path = join(output, decodeURIComponent(target.pathname))
        if (target.pathname.endsWith('/')) path = join(path, 'index.html')
        assert(existsSync(path), route + ' → ' + attr)
        if (target.hash && path.endsWith('.html')) {
          const targetDocument = new JSDOM(readFileSync(path, 'utf8')).window.document
          assert(targetDocument.getElementById(target.hash.slice(1)), route + ': destino ' + attr)
        }
      }
      for (const [i, link] of [...document.querySelectorAll('.lang a')].entries()) {
        const expected = IDIOMAS[i].dir + page.paths[i]
        assert.equal(new URL(link.getAttribute('href'), origin + '/' + route).pathname, '/' + expected + (preview ? 'index.html' : ''))
      }
      if (page.id === 'agentes') {
        assert.equal(document.querySelectorAll('[data-agent-category]').length, visual.agents.length + 2)
        assert.equal(document.querySelectorAll('.agent-portrait img.agent-official-logo').length, visual.agents.length + 2)
        assert(!/Hermes, (the coordinator|el coordinador)/.test(document.body.textContent))
      }
      if (page.id === 'temas') assert.equal(document.querySelectorAll('[data-theme-preview]').length, visual.themes.length)
      if (page.id === 'dispositivos') assert.equal(document.querySelectorAll('.device-options>article').length, 4)
      if (page.id === 'como') assert.equal(document.querySelectorAll('.walkthrough-tabs [role=tab]').length, 5)
      if (page.id === 'funciones') {
        assert.equal(document.querySelectorAll('.feature-tile').length, 6)
        assert(document.querySelector('.feature-full-details:not([open])'))
      }
      if (page.id === 'conectores') {
        assert.equal(document.querySelectorAll('[data-connect-category]').length, CONEXIONES.length)
        assert.equal(document.querySelectorAll('.connector-action[href]').length, CONEXIONES.length)
        assert(document.querySelector('.guide-entry a[href]'))
        assert(document.querySelector('.composio-heading .status-label'))
        assert.equal(JSON.parse(document.querySelector('#composio-data').textContent).items.length, 1743)
        assert.equal(document.querySelectorAll('.composio-card').length, 36)
      }
      if (page.id === 'descargas') {
        assert.equal(document.querySelectorAll('[data-artifact]').length, 6)
        for (const link of document.querySelectorAll('[data-artifact]')) assert(release.assets.some(a => a.browser_download_url === link.href))
        assert.equal(document.querySelectorAll('.platform-card').length, 4)
      } else assert.equal(document.querySelectorAll('[data-artifact]').length, 0)
      if (page.id === 'guias') {
        assert.equal(document.querySelectorAll('[data-service-guide]').length, CONEXIONES.length)
        assert.equal(document.querySelectorAll('.connection-steps > li').length, CONEXIONES.length * 6)
        for (const [id] of CONFIG_GUIAS) assert(document.getElementById(id))
        assert(document.querySelector('.guide-before'))
      }
      if (page.id === 'precios') {
        assert.equal(document.querySelectorAll('[data-plan]').length, 2)
        assert.equal(document.querySelector('[data-plan=free] .plan-price strong').textContent, '$0')
        assert.equal(document.querySelector('[data-plan=cloud] .plan-price strong').textContent, '$10')
      }
      checked++
    }
  }
}
async function client(route, { platform = 'MacIntel', ua = 'Macintosh', touch = 0, response, reject = false } = {}) {
  const dom = new JSDOM(readFileSync(join(root, 'dist', route, 'index.html'), 'utf8'), { url: origin + '/' + route, runScripts: 'outside-only', pretendToBeVisual: true })
  const w = dom.window
  Object.defineProperty(w.navigator, 'platform', { value: platform })
  Object.defineProperty(w.navigator, 'userAgent', { value: ua })
  Object.defineProperty(w.navigator, 'maxTouchPoints', { value: touch })
  w.HTMLElement.prototype.scrollIntoView = function () {}
  let fetches = 0
  w.fetch = async () => { fetches++; if (reject) throw Error('offline'); return { ok: true, json: async () => response || release } }
  w.eval(script)
  await new Promise(resolve => setTimeout(resolve, 0))
  return { dom, w, document: w.document, fetches }
}
for (const offline of [false, true]) {
  const c = await client('es/descargas/', { reject: offline })
  assert.equal(c.fetches, 1)
  assert.equal(c.document.querySelector('.recommended').id, 'mac')
  assert.equal(c.document.querySelectorAll('#mac [data-artifact]').length, 2, 'Mac conserva ambas arquitecturas')
  c.document.querySelector('.theme-toggle').click()
  assert.equal(c.w.localStorage.getItem('kywai-theme'), 'light')
  const tabs = c.document.querySelectorAll('.os-tabs button')
  tabs[0].dispatchEvent(new c.w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true')
  for (const a of c.document.querySelectorAll('[data-artifact]')) assert(release.assets.some(r => r.browser_download_url === a.href))
  c.dom.window.close()
}
const ipad = await client('es/descargas/', { platform: 'MacIntel', touch: 5, ua: 'iPad' })
assert.equal(ipad.document.querySelectorAll('.recommended').length, 0, 'iPad no recomienda instaladores de Mac')
ipad.w.close()
const poisoned = await client('es/descargas/', { response: { tag_name: 'v999', assets: release.assets.map(a => ({ ...a, browser_download_url: 'https://example.com/' + a.name })) } })
assert.equal(poisoned.document.querySelector('#dl-version').textContent, release.tag_name.slice(1))
assert([...poisoned.document.querySelectorAll('[data-artifact]')].every(a => a.href.startsWith('https://github.com/Yiku21/kywai/')))
poisoned.w.close()
const home = await client('es/')
assert.equal(home.fetches, 0, 'las páginas de contenido no consultan las releases')
assert.equal(new URL(home.document.querySelector('#hero-dl').href).pathname, '/es/descargas/')
const orbitButtons = home.document.querySelectorAll('.orbit-trigger')
assert.equal(orbitButtons.length, 4)
orbitButtons[0].focus()
assert.equal(home.document.querySelector('#orbit-tip-plan').hidden, false)
assert(home.document.querySelector('.orbit-system').hasAttribute('data-orbit-paused'))
home.document.dispatchEvent(new home.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
assert.equal(home.document.querySelector('#orbit-tip-plan').hidden, true)
assert(!home.document.querySelector('.orbit-system').hasAttribute('data-orbit-paused'))
const storyTabs = home.document.querySelectorAll('.story-tabs [role=tab]')
assert.equal(storyTabs.length, 3)
storyTabs[1].click()
assert.equal(home.document.querySelector('#story-two').hidden, false)
assert.equal(home.document.querySelector('#story-one').hidden, true)
storyTabs[1].dispatchEvent(new home.w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
assert.equal(home.document.querySelector('#story-three').hidden, false)
assert.equal(storyTabs[2].getAttribute('aria-selected'), 'true')
assert.equal(storyTabs[2].tabIndex, 0)
assert.equal(storyTabs[0].tabIndex, -1)
home.w.close()
const connectors = await client('es/conectores/')
connectors.document.querySelector('[data-connect-filter=creative]').click()
assert.equal(connectors.document.querySelectorAll('[data-connect-category]:not([hidden])').length, 1)
assert(connectors.document.querySelector('[data-connect-category=creative]').textContent.includes('PixelLab'))
connectors.document.querySelector('[data-connect-filter=all]').click()
assert.equal(connectors.document.querySelectorAll('[data-connect-category]:not([hidden])').length, CONEXIONES.length)
assert.equal(connectors.fetches, 0)
connectors.document.querySelector('[data-composio-search]').value = 'zendesk'
connectors.document.querySelector('[data-composio-search]').dispatchEvent(new connectors.w.Event('input'))
assert(connectors.document.querySelector('[data-composio-grid]').textContent.toLowerCase().includes('zendesk'))
assert.equal(connectors.fetches, 0)
connectors.w.close()
const guides = await client('es/guias/')
assert.equal(guides.document.querySelectorAll('[data-service-guide]:not([hidden])').length, 1)
assert.equal(guides.document.querySelector('[data-service-guide]:not([hidden])').id, 'deepwiki')
const select = guides.document.querySelector('[data-guide-service]')
for (const [id] of CONFIG_GUIAS) {
  select.value = id
  select.dispatchEvent(new guides.w.Event('change'))
  assert.equal(guides.document.querySelectorAll('[data-service-guide]:not([hidden])').length, 1)
  assert.equal(guides.document.querySelector('[data-service-guide]:not([hidden])').id, id)
  assert.equal(guides.w.location.hash, '#' + id)
  assert([...guides.document.querySelectorAll('.lang a')].every(a => a.hash === '#' + id))
}
assert.equal(guides.fetches, 0)
guides.w.close()
const agents = await client('es/agentes/')
agents.document.querySelector('[data-agent-filter=local]').click()
assert.equal(agents.document.querySelectorAll('[data-agent-category]:not([hidden])').length, 2)
agents.document.querySelector('[data-agent-filter=all]').click()
const search = agents.document.querySelector('[data-agent-search]')
search.value = 'codex'; search.dispatchEvent(new agents.w.Event('input'))
assert.equal(agents.document.querySelectorAll('[data-agent-category]:not([hidden])').length, 1)
agents.w.close()
const themes = await client('es/temas/')
themes.document.querySelector('[data-theme-filter=city]').click()
assert.equal(themes.document.querySelectorAll('[data-theme-category]:not([hidden])').length, 7)
themes.document.querySelector('[data-theme-filter=office]').click()
assert.equal(themes.document.querySelectorAll('[data-theme-category]:not([hidden])').length, 2)
themes.w.close()
const walk = await client('es/como-funciona/')
assert.equal(walk.document.querySelectorAll('.walkthrough-panels article:not([hidden])').length, 1)
walk.document.querySelector('[data-walk-next]').click()
assert.equal(walk.document.querySelector('#walk-panel-1').hidden, false)
walk.document.querySelector('#walk-tab-1').dispatchEvent(new walk.w.KeyboardEvent('keydown', { key: 'End', bubbles: true }))
assert.equal(walk.document.querySelector('#walk-panel-4').hidden, false)
assert.equal(walk.document.querySelector('[data-walk-next]').disabled, true)
walk.w.close()
const themeSource = readFileSync(join(CODIGO, 'src/renderer/src/lib/theme.ts'), 'utf8')
const sourceThemeIds = [...themeSource.matchAll(/\bid: '([^']+)'/g)].map(m => m[1])
assert.deepEqual(visual.themes.map(t => t.id).sort(), sourceThemeIds.sort(), 'galería completa respecto al selector real')
for (const theme of visual.themes) {
  assert(readFileSync(join(root, 'assets/galeria', theme.id + '.webp')).equals(readFileSync(join(CODIGO, 'src/renderer/src/assets/temas', theme.id + '.webp'))), 'miniatura original: ' + theme.id)
  for (const lang of IDIOMAS) assert(theme.text[lang.code].name && theme.text[lang.code].hint)
}
const catalogSource = readFileSync(join(CODIGO, 'src/main/catalog.ts'), 'utf8')
for (const [name] of CONEXIONES) assert(catalogSource.includes("title: '" + name + "'"), 'servicio real en el catálogo: ' + name)
for (const output of ['dist', 'preview']) {
  for (const name of ['privacidad', 'terminos']) {
    const html = readFileSync(join(root, output, name, 'index.html'), 'utf8')
    const legal = new JSDOM(html).window.document
    assert(!html.includes('{{'), 'marca legal renderizada')
    assert(legal.querySelector('.legal-top .brand'))
    assert(legal.querySelector('#en[lang=en]'))
    assert.equal(legal.querySelector('link[rel=canonical]').href, origin + '/' + name + '/')
    assert.equal(legal.querySelectorAll('.legal-footer a').length, 3)
  }
}
assert(!readFileSync(join(root, 'assets/site.css'), 'utf8').includes('{{'))
console.log(`Comprobadas ${checked} páginas: rutas, idiomas, anclas, descargas sin red, recomendación de sistema y navegación por teclado.`)
