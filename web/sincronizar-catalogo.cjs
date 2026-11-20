// Actualiza textos e identificadores desde los módulos reales de la aplicación.
// Primero: npm run web. Requiere Playwright y su Chromium instalado.
const { chromium } = require('playwright')
const { writeFileSync, copyFileSync, mkdirSync } = require('node:fs')
const { join, sep } = require('node:path')
// La URL del módulo compartido se resuelve a partir de la raíz de este checkout.
const repo = join(__dirname, '..').split(sep).join('/')
async function synchronize() {
  const browser = await chromium.launch({ executablePath: process.env.KYWAI_CHROMIUM || undefined, headless: true })
  try {
    const page = await browser.newPage()
    const origin = process.env.AICOWORK_WEB || 'http://127.0.0.1:5199/'
    await page.route(origin, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Catálogo kywai</title>' }))
    await page.goto(origin)
    const data = await page.evaluate(async root => {
      localStorage.setItem('aicowork.lang', 'es')
      const theme = await import('/src/lib/theme.ts')
      const { AGENT_CATALOG } = await import('/@fs/' + root + '/src/shared/agentCatalog.ts')
      const { setCurrentLang, t } = await import('/@fs/' + root + '/src/shared/i18n.ts')
      const result = {
        themes: theme.THEMES.map(x => ({ id: x.id, group: theme.CITY_COLORS.some(y => y.id === x.id) ? 'city' : theme.DECORS.some(y => y.id === x.id) ? 'decor' : theme.CORPORATE.some(y => y.id === x.id) ? 'office' : 'world', text: {} })),
        agents: AGENT_CATALOG.map(x => ({ id: x.id, name: x.name, kind: x.kind, verified: x.verified, free: !!x.free, docs: x.cli?.url || '', text: {} }))
      }
      for (const lang of ['es', 'en', 'pt', 'fr', 'zh']) {
        setCurrentLang(lang)
        theme.THEMES.forEach((x, i) => { result.themes[i].text[lang] = { name: t(x.name), hint: t(x.hint) } })
        AGENT_CATALOG.forEach((x, i) => { result.agents[i].text[lang] = { summary: t(x.summary), account: t(x.account) } })
      }
      return result
    }, repo)
    const gallery = join(__dirname, 'assets/galeria')
    mkdirSync(gallery, { recursive: true })
    for (const theme of data.themes) copyFileSync(join(repo, 'src/renderer/src/assets/temas', theme.id + '.webp'), join(gallery, theme.id + '.webp'))
    writeFileSync(join(__dirname, 'catalogo-visual.json'), JSON.stringify(data, null, 2) + '\n')
    console.log(`Catálogo sincronizado: ${data.themes.length} temas y ${data.agents.length} agentes.`)
  } finally { await browser.close() }
}
synchronize().catch(error => { console.error(error); process.exitCode = 1 })
