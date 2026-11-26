// Secciones «Por qué kywai» (9 ventajas y 3 comparaciones) y «Pídelo como quieras» (8 atajos a Funciones) de la portada aprobada.
// Los datos están en porque-extra.json, en los 6 idiomas. Las ventajas y las comparaciones son las de la ayuda de la propia app.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const D = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'porque-extra.json'), 'utf8'))
const cab = (id, h, esc) => `<div class="fx-head" id="${id}"><p class="eyebrow">${esc(h[0])}</p><h2>${esc(h[1])}</h2>${h[2] ? `<p class="lede">${esc(h[2])}</p>` : ''}</div>`
export function renderPorque({ lang, esc, funcionesUrl }) {
  const i = Math.max(0, D.L.indexOf(lang)), H = k => Array.isArray(D.heads[k][0]) ? D.heads[k].map(x => x[i]) : D.heads[k][i]
  const ventajas = D.ventajas.map(v => `<article class="fx-card"><span class="fx-ico">${v.svg}</span><h3>${esc(v.t[i])}</h3><p>${esc(v.p[i])}</p></article>`).join('')
  const frente = D.frente.map(v => `<article class="fx-card"><h3>${esc(v.t[i])}</h3><p>${esc(v.p[i])}</p></article>`).join('')
  const formas = D.cards.map(c => `<article class="fx-card"><span class="fx-ico">${c.svg}</span><h3>${esc(c.t[i])}</h3><p>${esc(c.p[i])}</p><a class="text-link" href="${funcionesUrl}#fx-${c.j}">${esc(c.l[i])} <span aria-hidden="true">→</span></a></article>`).join('')
  return `<section class="section pq-section" id="porque"><div class="wrap">${cab('porque-cab', H('porque'), esc)}<div class="fx-grid pq-grid">${ventajas}</div>`
    + `<div class="pq-frente"><p class="eyebrow">${esc(D.heads.frente[i])}</p><div class="fx-grid pq-grid">${frente}</div></div>`
    + `<p class="pq-ver"><a class="text-link" href="${funcionesUrl}#fx-cat">${esc(D.heads.ver[i])} <span aria-hidden="true">→</span></a></p></div></section>`
    + `<section class="section pq-section" id="formas"><div class="wrap">${cab('formas-cab', H('formas'), esc)}<div class="fx-grid pq-grid pq-formas">${formas}</div></div></section>`
}
