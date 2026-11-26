// Secciones largas de la página Funciones (las de la muestra aprobada): varias cosas a la vez, voz, mensajería, tu ordenador,
// amigos, archivos, las órdenes «/» y el catálogo de funciones con buscador. Los datos están en funciones-extra.json
// (las funciones y las órdenes salen de la ayuda de la propia app, en los 6 idiomas).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const D = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'funciones-extra.json'), 'utf8'))
export const SALTOS = ['par', 'voz', 'msg', 'ctl', 'amg', 'arc', 'cmd', 'cat']
export function etiquetaSalto(id, lang) { return D.ui.jump[id][Math.max(0, D.L.indexOf(lang))] }
const cabecera = (id, i, esc, n) => { const h = (D.heads[id][D.L[i]] || D.heads[id].en).map(x => x.replace('{n}', n)); return `<div class="fx-head" id="fx-${id}"><p class="eyebrow">${esc(h[0])}</p><h2>${esc(h[1])}</h2><p class="lede">${esc(h[2])}</p></div>` }
export function renderFuncionesExtra({ lang, esc }) {
  const i = Math.max(0, D.L.indexOf(lang)), ui = k => esc(D.ui[k][i])
  const nCmd = D.ordenes.length, nFun = D.funciones.length
  const secciones = D.sections.map(sec => {
    const lista = sec.cards[lang] || sec.cards.en
    return cabecera(sec.id, i, esc, nCmd) + `<div class="fx-grid">${lista.map((c, k) => `<article class="fx-card"><span class="fx-ico">${sec.svgs[k] || sec.svg}</span><h3>${esc(c.t)}</h3><p>${esc(c.p)}</p>${c.g && c.g.length ? `<ul class="fx-tags">${c.g.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}</article>`).join('')}</div>`
  }).join('')
  const cuenta = (lista, campo, id) => lista.filter(x => x[campo] === id).length
  const ordenes = cabecera('cmd', i, esc, nCmd)
    + `<div class="fx-toolbar"><div class="fx-seg" role="group" aria-label="${ui('cmdType')}" data-fx-seg="cm"><button type="button" data-f="all" aria-pressed="true">${ui('all')}<em>${nCmd}</em></button>${D.ordenGrupos.map(g => `<button type="button" data-f="${g.id}" aria-pressed="false">${esc(g.t[i])}<em>${cuenta(D.ordenes, 'g', g.id)}</em></button>`).join('')}</div><input class="fx-search" type="search" placeholder="${ui('searchCmd')}" aria-label="${ui('searchCmd')}" data-fx-search="cm"></div>`
    + `<div class="fx-cmgrid">${D.ordenes.map(o => `<article class="fx-cm" data-cat="${o.g}"><code>/${esc(o.n)} <i>${esc(o.args)}</i></code><p>${esc(o[lang] || o.en)}</p></article>`).join('')}</div><p class="fx-empty" hidden>${ui('noCmd')}</p>`
  const catalogo = cabecera('cat', i, esc, nFun)
    + `<div class="fx-toolbar"><div class="fx-seg" role="group" aria-label="${ui('topic')}" data-fx-seg="cf"><button type="button" data-f="all" aria-pressed="true">${ui('allf')}<em>${nFun}</em></button>${D.grupos.map(g => `<button type="button" data-f="${g.id}" aria-pressed="false">${esc(g.t[i])}<em>${cuenta(D.funciones, 'g', g.id)}</em></button>`).join('')}</div><input class="fx-search" type="search" placeholder="${ui('searchFeat')}" aria-label="${ui('searchFeatAria')}" data-fx-search="cf"></div>`
    + `<div class="fx-cfgrid">${D.funciones.map(f => `<article class="fx-cf" data-cat="${f.g}" data-q="${esc((f.t.join(' ') + ' ' + f.b).toLowerCase())}"><h3>${esc(f.t[i])}</h3><p>${esc(f.q[i])}</p><details><summary>${ui('howTo')}</summary><ol>${f.p.map(p => `<li>${esc(p[i] || p[1])}</li>`).join('')}</ol></details></article>`).join('')}</div><p class="fx-empty" hidden>${ui('noFeat')}</p>`
  const js = `<script>(function(){var D=document,S={};function filt(c){var st=S[c]||(S[c]={f:'all',q:''}),els=[].slice.call(D.querySelectorAll('.fx-'+c)),n=0;els.forEach(function(e){var t=(e.getAttribute('data-q')||e.textContent).toLowerCase(),ok=(st.f==='all'||e.getAttribute('data-cat')===st.f)&&(!st.q||t.indexOf(st.q)>-1);e.hidden=!ok;if(ok)n++});var g=els[0]&&els[0].parentNode,em=g&&g.nextElementSibling;if(em&&em.classList.contains('fx-empty'))em.hidden=n>0}D.querySelectorAll('[data-fx-seg]').forEach(function(sg){var c=sg.getAttribute('data-fx-seg');sg.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;[].forEach.call(sg.children,function(x){x.setAttribute('aria-pressed',x===b)});(S[c]||(S[c]={f:'all',q:''})).f=b.getAttribute('data-f');filt(c)})});D.querySelectorAll('[data-fx-search]').forEach(function(inp){var c=inp.getAttribute('data-fx-search');inp.addEventListener('input',function(){(S[c]||(S[c]={f:'all',q:''})).q=inp.value.trim().toLowerCase();filt(c)})});D.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-j]');if(a){var t=D.getElementById(a.getAttribute('data-j'));if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth',block:'start'})}}})})()</script>`
  return secciones + ordenes + catalogo + js
}
